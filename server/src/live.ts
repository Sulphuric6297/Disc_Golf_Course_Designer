// Editing a course together, live. Everyone with a course open is in its room: each change is
// sent as the one thing it changed (a tree, a hole, the map's style), put into the room's copy of
// the course, and sent on to everyone in the room, in the order the server took them. The room
// writes the course to the database a moment after the changes stop (at most every few seconds
// while they don't), then says so: until then the app keeps its own changes, and sends them again
// if the server went away. Saves of the whole course (an app opened before live editing, a
// publish, a restore) still go straight in: the room writes first, and reads the course again
// after, telling everyone to.
import type { FastifyReply } from "fastify";
import { z } from "zod";
import type { Sql } from "./db.js";
import { snapshot } from "./history.js";

/** The parts of a course matched one by one, by their id. */
export const LISTS = ["holes", "items", "layouts"] as const;
type List = (typeof LISTS)[number];
type Entity = { id: string } & Record<string, unknown>;
type Doc = Record<string, unknown> & { name?: string; holes?: Entity[]; items?: Entity[]; layouts?: Entity[] };

const id = z.string().min(1).max(100);
const entity = z.looseObject({ id });
/** One change: a part put in (new or changed), taken out, the order of a list, or one of the
 * course's other parts set (its style, its name, the ground…). The photo goes its own way. */
export const change = z.discriminatedUnion("op", [
  z.object({ op: z.literal("put"), list: z.enum(LISTS), value: entity }),
  z.object({ op: z.literal("del"), list: z.enum(LISTS), id }),
  z.object({ op: z.literal("order"), list: z.enum(LISTS), ids: z.array(id).max(50_000) }),
  // (a part taken out comes as null, or with no value at all: JSON drops an undefined one)
  z.object({ op: z.literal("set"), key: z.string().min(1).max(60).refine(k => !(LISTS as readonly string[]).includes(k) && k !== "background" && k !== "id", "Not a part that's set"), value: z.unknown().optional() })
]);
export type Change = z.infer<typeof change>;
/** Most of each list a course can have (the same as a whole save). */
const MOST: Record<List, number> = { holes: 500, items: 50_000, layouts: 500 };

/** The changes put into a course (in place). Throws when the course would have more than it may. */
export function applyChanges(doc: Doc, changes: Change[]) {
  for (const c of changes) {
    if (c.op === "set") {
      if (c.value === undefined || c.value === null) delete doc[c.key];
      else doc[c.key] = c.value;
      continue;
    }
    const list = (doc[c.list] ?? []) as Entity[];
    if (c.op === "put") {
      const i = list.findIndex(e => e.id === c.value.id);
      if (i >= 0) list[i] = c.value as Entity;
      else {
        if (list.length >= MOST[c.list]) throw new Error("Too many");
        list.push(c.value as Entity);
      }
    } else if (c.op === "del") {
      const i = list.findIndex(e => e.id === c.id);
      if (i >= 0) list.splice(i, 1);
    } else {
      // (in the order given; any it doesn't name stay, after them)
      const at = new Map(c.ids.map((x, i) => [x, i]));
      list.sort((a, b) => (at.get(a.id) ?? Infinity) - (at.get(b.id) ?? Infinity));
    }
    doc[c.list] = list;
  }
}

/** Someone with the course open: their connection, and what they may do in it. */
interface Member {
  client: string;
  userId: string;
  name: string;
  reply: FastifyReply;
  /** Still signed in and on the course (asked now and then: let go when not). */
  allowed: () => Promise<boolean>;
  /** Where they last said they're pointing, and what they've picked (for anyone who comes in). */
  at?: unknown;
}
interface Room {
  id: string;
  doc: Doc;
  /** The course's version in the database (each write makes the next). */
  version: number;
  /** Changes taken so far, one number each (the order everyone gets them in). */
  seq: number;
  /** The last change written to the database. */
  savedSeq: number;
  summary: unknown;
  /** Who changed it last (the database's "updated by"). */
  by: string | null;
  members: Map<string, Member>;
  timer: NodeJS.Timeout | null;
  /** Since when changes have waited to be written (written by then at the latest). */
  waiting: number;
  writing: Promise<void>;
}

/** A write at most this long after a change, and this soon after the changes stop. */
const WRITE_WITHIN = 4000;
const WRITE_AFTER = 800;
/** How often the history keeps the course while it's edited (as a whole save does). */
const HISTORY_EVERY = 10 * 60_000;
/** A note down an open connection now and then, so nothing between closes it for being quiet. */
const KEEP_ALIVE = 25_000;

export type Live = ReturnType<typeof liveRooms>;

export function liveRooms(sql: Sql) {
  const rooms = new Map<string, Room>();
  const opening = new Map<string, Promise<Room>>();

  const send = (m: Member, event: string, data: unknown) => {
    try { m.reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); } catch { /* gone: its close tidies up */ }
  };
  const everyone = (room: Room, event: string, data: unknown, except?: string) => {
    for (const m of room.members.values()) if (m.client !== except) send(m, event, data);
  };
  /** Who's in (each person once, however many tabs). */
  const people = (room: Room) => {
    const seen = new Map<string, { userId: string; name: string; clients: string[] }>();
    for (const m of room.members.values()) {
      const p = seen.get(m.userId) ?? { userId: m.userId, name: m.name, clients: [] };
      p.clients.push(m.client);
      seen.set(m.userId, p);
    }
    return [...seen.values()];
  };

  const load = async (courseId: string): Promise<Room> => {
    const [c] = await sql`select doc, version, summary, updated_by from courses where id = ${courseId}`;
    if (!c) throw new Error("No such course");
    return { id: courseId, doc: c.doc, version: c.version, seq: 0, savedSeq: 0, summary: c.summary, by: c.updated_by, members: new Map(), timer: null, waiting: 0, writing: Promise.resolve() };
  };
  const room = async (courseId: string) => {
    const r = rooms.get(courseId);
    if (r) return r;
    let p = opening.get(courseId);
    if (!p) {
      p = load(courseId).then(r2 => { rooms.set(courseId, r2); return r2; }).finally(() => opening.delete(courseId));
      opening.set(courseId, p);
    }
    return p;
  };

  /** The room's course into the database (if it changed), then everyone told it's saved. */
  const write = (r: Room): Promise<void> => {
    if (r.timer) { clearTimeout(r.timer); r.timer = null; }
    r.writing = r.writing.then(async () => {
      if (r.savedSeq === r.seq) return;
      const seq = r.seq;
      const doc = { ...r.doc, background: null };
      const [done] = await sql`
        update courses set doc = ${sql.json(doc as never)}, summary = ${sql.json((r.summary ?? {}) as never)}, name = ${String(doc.name ?? "")}, holes = ${(doc.holes ?? []).length},
          version = version + 1, updated_by = ${r.by}, updated_at = now()
        where id = ${r.id} and version = ${r.version} returning version`;
      if (!done) {
        // (changed some other way meanwhile: everyone reads it again, and sends their own changes on top)
        await reread(r);
        return;
      }
      r.version = done.version;
      r.savedSeq = seq;
      r.waiting = 0;
      const [last] = await sql`select created_at, by_user from course_versions where course_id = ${r.id} order by id desc limit 1`;
      if (!last || last.by_user !== r.by || Date.now() - last.created_at.getTime() > HISTORY_EVERY) await snapshot(sql, r.id, "autosave", "", r.by);
      everyone(r, "saved", { seq, version: r.version });
    }).catch(e => { console.error("Live course not written", r.id, e); });
    return r.writing;
  };
  const writeSoon = (r: Room) => {
    if (!r.waiting) r.waiting = Date.now();
    if (r.timer) clearTimeout(r.timer);
    const wait = Math.max(0, Math.min(WRITE_AFTER, r.waiting + WRITE_WITHIN - Date.now()));
    r.timer = setTimeout(() => void write(r), wait);
  };
  /** The course read from the database again (it was changed there): everyone reads it too. */
  const reread = async (r: Room) => {
    const fresh = await load(r.id);
    r.doc = fresh.doc;
    r.version = fresh.version;
    r.summary = fresh.summary;
    r.seq++;
    r.savedSeq = r.seq;
    r.waiting = 0;
    everyone(r, "reload", { seq: r.seq, version: r.version });
  };

  return {
    /** Someone opens the course's live connection (already allowed to see it). */
    async join(courseId: string, member: Omit<Member, "reply">, reply: FastifyReply) {
      const r = await room(courseId);
      const raw = reply.raw;
      reply.hijack();
      raw.writeHead(200, { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-store", "x-accel-buffering": "no", connection: "keep-alive" });
      // (the same tab again: its old connection goes)
      const old = r.members.get(member.client);
      if (old) { try { old.reply.raw.end(); } catch { /* gone */ } }
      const m: Member = { ...member, reply };
      r.members.set(member.client, m);
      send(m, "hello", { seq: r.seq, savedSeq: r.savedSeq, version: r.version, people: people(r) });
      everyone(r, "people", { people: people(r) }, member.client);
      // (where the others are pointing, and what they've picked, as they last said)
      for (const o of r.members.values()) if (o !== m && o.at) send(m, "here", { client: o.client, userId: o.userId, name: o.name, at: o.at });
      // (and whether they may still see it: signed out, disabled or taken off the course, let go)
      const alive = setInterval(() => {
        void m.allowed().then(ok => {
          if (!ok) { try { raw.end(); } catch { /* gone */ } return; }
          try { raw.write(": still here\n\n"); } catch { /* gone */ }
        }, () => {});
      }, KEEP_ALIVE);
      raw.on("close", () => {
        clearInterval(alive);
        if (r.members.get(member.client) !== m) return;
        r.members.delete(member.client);
        everyone(r, "people", { people: people(r) });
        // (the last one out: written, and the room closed)
        if (!r.members.size) void write(r).then(() => { if (!r.members.size && rooms.get(courseId) === r) rooms.delete(courseId); });
      });
    },

    /** Changes from someone in the room (allowed to change it): taken, and sent on to everyone. */
    async change(courseId: string, client: string, userId: string, batch: number, changes: Change[], summary: unknown) {
      const r = rooms.get(courseId);
      const m = r?.members.get(client);
      if (!r || !m || m.userId !== userId) return null;
      // (checked on a copy first: a change that doesn't fit leaves the course as it was)
      const next = { ...r.doc, holes: [...(r.doc.holes ?? [])], items: [...(r.doc.items ?? [])], layouts: [...(r.doc.layouts ?? [])] };
      applyChanges(next, changes);
      r.doc = next;
      if (summary !== undefined) r.summary = summary;
      r.by = userId;
      r.seq++;
      everyone(r, "changes", { seq: r.seq, client, batch, userId, changes });
      writeSoon(r);
      return r.seq;
    },

    /** Where someone is pointing, and what they've picked (sent to the others only). */
    here(courseId: string, client: string, userId: string, at: unknown) {
      const r = rooms.get(courseId);
      const m = r?.members.get(client);
      if (!r || !m || m.userId !== userId) return false;
      m.at = at ?? undefined;
      everyone(r, "here", { client, userId, name: m.name, at }, client);
      return true;
    },

    /** The course as the room has it (newer than the database for a moment after a change). */
    current(courseId: string) {
      const r = rooms.get(courseId);
      return r ? { doc: r.doc, version: r.version, seq: r.seq } : null;
    },

    /** Before the course is saved some other way: the room's changes written first. */
    async settle(courseId: string) {
      const r = rooms.get(courseId);
      if (r) await write(r);
    },
    /** After it was: the room reads it again, and so does everyone in it. */
    async changed(courseId: string) {
      const r = rooms.get(courseId);
      if (r) await (r.writing = r.writing.then(() => reread(r)).catch(e => { console.error("Live course not read", courseId, e); }));
    },
    /** Its comments changed: everyone reads them again. */
    comments(courseId: string) {
      const r = rooms.get(courseId);
      if (r) everyone(r, "comments", {});
    },
    /** Its photo changed: everyone fetches it again. */
    photo(courseId: string, except?: string) {
      const r = rooms.get(courseId);
      if (r) everyone(r, "photo", {}, except);
    },
    /** Someone may no longer change it (made a viewer: told, and it opens again view only; or
     * taken off it: let go). */
    stopEditing(courseId: string, userId: string, gone: boolean) {
      const r = rooms.get(courseId);
      if (!r) return;
      for (const m of r.members.values()) {
        if (m.userId !== userId) continue;
        if (gone) { try { m.reply.raw.end(); } catch { /* gone */ } }
        else send(m, "role", {});
      }
    },
    /** The course was deleted: everyone in it let go. */
    closeRoom(courseId: string) {
      const r = rooms.get(courseId);
      if (!r) return;
      if (r.timer) clearTimeout(r.timer);
      rooms.delete(courseId);
      for (const m of r.members.values()) { try { m.reply.raw.end(); } catch { /* gone */ } }
    },
    /** The server stopping: every room's changes written first, and every connection ended. */
    async closeAll() {
      await Promise.all([...rooms.values()].map(r => write(r)));
      for (const r of rooms.values()) for (const m of r.members.values()) { try { m.reply.raw.end(); } catch { /* gone */ } }
      rooms.clear();
    }
  };
}
