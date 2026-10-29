// Courses on the server, and sharing them. Everyone sees only the courses they're a member of:
// viewers look, editors change, owners also share and delete. Someone else's course answers
// "not found", the same as one that doesn't exist.
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import type { RouteCtx } from "../app.js";
import { ApiError, audit, need, parse } from "../http.js";
import { snapshot } from "../history.js";
import { change } from "../live.js";
import { stillSignedIn } from "../sessions.js";

export type Role = "owner" | "editor" | "viewer";
/** How often the owner's own changes go in the history, at most. */
const AUTOSAVE_EVERY = 10 * 60_000;
const RANK: Record<Role, number> = { viewer: 1, editor: 2, owner: 3 };

/** A course document: what the server needs of it; the rest is kept as sent. */
export const courseDoc = z.looseObject({
  name: z.string().max(200),
  holes: z.array(z.unknown()).max(500),
  items: z.array(z.unknown()).max(50_000)
});
// (the aerial photo: an image as a data URL, nothing else)
export const IMAGE = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/;
export const BIG = { bodyLimit: 64 << 20 };
/** The course list's summary of a course (from the app): small, numbers and short text only. */
export const summary = z.object({
  par: z.number().int().min(0).max(10_000),
  length: z.number().min(0).max(10_000_000),
  units: z.enum(["ft", "m"]),
  canvas: z.object({ width: z.number().positive().max(1e7), height: z.number().positive().max(1e7) }),
  lines: z.array(z.array(z.tuple([z.number(), z.number()])).max(64)).max(200)
}).optional();

export type Id = { Params: { id: string } };
/** What a viewer may see (see public.ts: the same parts as a link). */
const viewerPerms = z.record(z.string().max(20), z.boolean());
export const ids = z.object({ id: z.uuid("Not found") });

/** Your role on the course, at least `min`: else not found (or not allowed, for a member). */
export const roleOn = (sql: RouteCtx["sql"]) => async (req: FastifyRequest, courseId: string, min: Role) => {
  const a = need(req);
  const [m] = await sql`select role from course_members where course_id = ${courseId} and user_id = ${a.user.id}`;
  if (!m) throw new ApiError(404, "Not found");
  if (RANK[m.role as Role] < RANK[min]) throw new ApiError(403, min === "owner" ? "Only an owner can do that" : "View only");
  return { a, role: m.role as Role };
};
// (what's stored: the document without its photo, which is kept apart)
export const stored = (doc: z.infer<typeof courseDoc>) => ({ ...doc, background: null });

/** One open tab's own name for itself (its live connection and the changes it sends). */
const client = z.string().regex(/^[A-Za-z0-9_-]{8,64}$/, "Not found");

export async function courseRoutes(app: FastifyInstance, { sql, live }: RouteCtx) {
  const role = roleOn(sql);

  app.get("/api/courses", async req => {
    const a = need(req);
    const rows = await sql`
      select c.id, c.name, c.park, c.holes, c.version, c.updated_at, c.summary, m.role, u.display_name as updated_by,
        (select o.display_name from course_members om join users o on o.id = om.user_id
          where om.course_id = c.id and om.role = 'owner' order by om.added_at limit 1) as owner,
        (select count(*)::int from course_members x where x.course_id = c.id) as members,
        (select t.updated_at from course_thumbnails t where t.course_id = c.id) as thumb_at
      from course_members m join courses c on c.id = m.course_id left join users u on u.id = c.updated_by
      where m.user_id = ${a.user.id} order by c.updated_at desc`;
    return rows.map(r => ({
      id: r.id, name: r.name, park: r.park, holes: r.holes, version: r.version, updatedAt: r.updated_at, role: r.role, updatedBy: r.updated_by,
      owner: r.owner, members: r.members, summary: r.summary, thumbAt: r.thumb_at ? r.thumb_at.getTime() : null
    }));
  });

  app.post("/api/courses", BIG, async req => {
    const a = need(req);
    const { doc, summary: sum } = parse(z.object({ doc: courseDoc, summary }), req.body);
    const course = await sql.begin(async tx => {
      const [c] = await tx`
        insert into courses (name, holes, doc, summary, created_by, updated_by)
        values (${doc.name}, ${doc.holes.length}, ${tx.json(stored(doc) as never)}, ${tx.json((sum ?? {}) as never)}, ${a.user.id}, ${a.user.id}) returning id, version`;
      await tx`insert into course_members (course_id, user_id, role, live) values (${c.id}, ${a.user.id}, 'owner', true)`;
      await snapshot(tx, c.id, "created", "", a.user.id);
      return c;
    });
    await audit(sql, req, "course.created", { course: course.id, name: doc.name });
    return { id: course.id, version: course.version, role: "owner" };
  });

  app.get<Id>("/api/courses/:id", async req => {
    const { id } = parse(ids, req.params);
    const { a, role: r } = await role(req, id, "viewer");
    const [m] = await sql`select perms from course_members where course_id = ${id} and user_id = ${a.user.id}`;
    // (open live: what it has is written first, and its own copy given, the newest)
    await live.settle(id);
    const [c] = await sql`
      select c.doc, c.version, c.park,
        exists (select 1 from course_backgrounds b where b.course_id = c.id) as has_background,
        exists (select 1 from course_thumbnails t where t.course_id = c.id) as has_thumbnail
      from courses c where c.id = ${id}`;
    const now = live.current(id);
    return { id, version: now?.version ?? c.version, seq: now?.seq ?? 0, role: r, park: c.park, perms: r === "viewer" ? m.perms : null, doc: now?.doc ?? c.doc, hasBackground: c.has_background, hasThumbnail: c.has_thumbnail };
  });

  // The whole course saved (an app opened before live editing, or another course's ground shared
  // into it)
  app.put<Id>("/api/courses/:id", BIG, async req => {
    const { id } = parse(ids, req.params);
    const { a } = await role(req, id, "editor");
    const b = parse(z.object({ doc: courseDoc, version: z.number().int(), summary }), req.body);
    // (the whole course, from an app opened before live editing: what the room has goes in
    // first, so a save over it is stopped and asked about, as any other is)
    await live.settle(id);
    const [done] = await sql`
      update courses set doc = ${sql.json(stored(b.doc) as never)}, summary = ${sql.json((b.summary ?? {}) as never)}, name = ${b.doc.name}, holes = ${b.doc.holes.length},
        version = version + 1, updated_by = ${a.user.id}, updated_at = now()
      where id = ${id} and version = ${b.version} returning version`;
    if (!done) {
      const [c] = await sql`select c.version, u.display_name from courses c left join users u on u.id = c.updated_by where c.id = ${id}`;
      throw new ApiError(409, `${c.display_name ?? "Someone"} saved this course since you opened it`, { version: c.version });
    }
    // (kept in the history every ten minutes or so, and when someone else's change came between)
    const [last] = await sql`select created_at, by_user from course_versions where course_id = ${id} order by id desc limit 1`;
    if (!last || last.by_user !== a.user.id || Date.now() - last.created_at.getTime() > AUTOSAVE_EVERY) await snapshot(sql, id, "autosave", "", a.user.id);
    await live.changed(id);
    return { version: done.version };
  });

  // --- Live: everyone with the course open gets each change as it's made (see live.ts)
  app.get<Id & { Querystring: { client?: string } }>("/api/courses/:id/live", async (req, reply) => {
    const { id } = parse(ids, req.params);
    const { a } = await role(req, id, "viewer");
    // (only the app itself, never another site's page using your sign-in)
    const site = req.headers["sec-fetch-site"];
    if (site && site !== "same-origin") throw new ApiError(403, "Refused");
    const c = parse(client, req.query.client);
    const sessionId = a.sessionId, userId = a.user.id;
    const allowed = async () => (await stillSignedIn(sql, sessionId)) && (await sql`select 1 from course_members where course_id = ${id} and user_id = ${userId}`).length > 0;
    await live.join(id, { client: c, userId, name: a.user.displayName, allowed }, reply);
  });

  // (each change small and many while dragging: their own, higher limit)
  const often = (max: number) => ({ ...BIG, config: { rateLimit: { max, timeWindow: "1 minute" } } });
  app.post<Id>("/api/courses/:id/live/changes", often(1200), async req => {
    const { id } = parse(ids, req.params);
    const { a } = await role(req, id, "editor");
    const b = parse(z.object({ client, batch: z.number().int().min(0), changes: z.array(change).min(1).max(60_000), summary }), req.body);
    let seq: number | null;
    try {
      seq = await live.change(id, b.client, a.user.id, b.batch, b.changes, b.summary);
    } catch {
      throw new ApiError(400, "Too much on the course");
    }
    // (not in the room: the app opens its connection again, and sends its changes then)
    if (seq === null) throw new ApiError(409, "Not connected", { rejoin: true });
    return { seq };
  });

  app.post<Id>("/api/courses/:id/live/here", { config: { rateLimit: { max: 1500, timeWindow: "1 minute" } } }, async req => {
    const { id } = parse(ids, req.params);
    const { a } = await role(req, id, "viewer");
    const n = z.number().finite().min(-1e7).max(1e7);
    const b = parse(z.object({ client, at: z.object({ x: n.nullable().optional(), y: n.nullable().optional(), picked: z.string().max(100).nullable().optional(), view: z.enum(["2d", "3d", "map"]).optional() }).nullable() }), req.body);
    if (!live.here(id, b.client, a.user.id, b.at)) throw new ApiError(409, "Not connected", { rejoin: true });
    return { ok: true };
  });

  app.delete<Id>("/api/courses/:id", async req => {
    const { id } = parse(ids, req.params);
    await role(req, id, "owner");
    const [c] = await sql`delete from courses where id = ${id} returning name`;
    live.closeRoom(id);
    await audit(sql, req, "course.deleted", { course: id, name: c.name });
    return { ok: true };
  });

  app.post<Id>("/api/courses/:id/park", async req => {
    const { id } = parse(ids, req.params);
    await role(req, id, "owner");
    const b = parse(z.object({ park: z.string().trim().max(100) }), req.body);
    await sql`update courses set park = ${b.park} where id = ${id}`;
    return { ok: true };
  });

  // --- The aerial photo
  app.get<Id>("/api/courses/:id/background", async req => {
    const { id } = parse(ids, req.params);
    await role(req, id, "viewer");
    const [b] = await sql`select data from course_backgrounds where course_id = ${id}`;
    return { data: b?.data ?? null };
  });

  app.put<Id>("/api/courses/:id/background", BIG, async req => {
    const { id } = parse(ids, req.params);
    await role(req, id, "editor");
    const { data } = parse(z.object({ data: z.string().max(60 << 20).regex(IMAGE, "Not an image").nullable() }), req.body);
    if (data === null) await sql`delete from course_backgrounds where course_id = ${id}`;
    else await sql`insert into course_backgrounds (course_id, data) values (${id}, ${data}) on conflict (course_id) do update set data = excluded.data, updated_at = now()`;
    live.photo(id);
    return { ok: true };
  });

  // Other courses on the same ground (a park with several courses): those you're on whose site
  // overlaps this one's, with their holes' lines to draw on this one's map
  app.get<Id>("/api/courses/:id/nearby", async req => {
    const { id } = parse(ids, req.params);
    const { a } = await role(req, id, "viewer");
    type B = { north: number; south: number; west: number; east: number };
    const [me] = await sql`select doc->'site'->'bounds' as b, park from courses where id = ${id}`;
    const mine = me?.b as B | null;
    if (!mine) return [];
    const rows = await sql`
      select c.id, c.name, c.park, c.summary, c.doc->'site'->'bounds' as b, m.role
      from course_members m join courses c on c.id = m.course_id where m.user_id = ${a.user.id} and c.id <> ${id}`;
    const meets = (x: B) => x.west < mine.east && x.east > mine.west && x.south < mine.north && x.north > mine.south;
    // (in the same park, or on the same ground)
    const samePark = (p: string) => !!me.park && p.toLowerCase() === String(me.park).toLowerCase();
    return rows.filter(r => r.b && (samePark(r.park) || meets(r.b as B)) && r.summary?.lines?.length).map(r => ({
      id: r.id, name: r.name, park: r.park, samePark: samePark(r.park), role: r.role, bounds: r.b, canvas: r.summary.canvas, lines: r.summary.lines
    }));
  });

  // --- The list's picture of the course (its printed map, small)
  app.get<Id>("/api/courses/:id/thumbnail", async (req, reply) => {
    const { id } = parse(ids, req.params);
    await role(req, id, "viewer");
    const [t] = await sql`select data from course_thumbnails where course_id = ${id}`;
    const m = t && /^data:(image\/(?:png|jpeg|webp));base64,(.*)$/.exec(t.data);
    if (!m) throw new ApiError(404, "Not found");
    // (the list asks with ?v=<when it changed>: the same address is always the same picture)
    return reply.header("cache-control", "private, max-age=31536000, immutable").type(m[1]).send(Buffer.from(m[2], "base64"));
  });

  app.put<Id>("/api/courses/:id/thumbnail", { bodyLimit: 4 << 20 }, async req => {
    const { id } = parse(ids, req.params);
    await role(req, id, "editor");
    const { data } = parse(z.object({ data: z.string().max(3 << 20).regex(IMAGE, "Not an image") }), req.body);
    await sql`insert into course_thumbnails (course_id, data) values (${id}, ${data}) on conflict (course_id) do update set data = excluded.data, updated_at = now()`;
    return { ok: true };
  });

  // --- Sharing
  app.get<Id>("/api/courses/:id/members", async req => {
    const { id } = parse(ids, req.params);
    await role(req, id, "viewer");
    const rows = await sql`
      select u.id, u.username, u.display_name, m.role, m.perms from course_members m join users u on u.id = m.user_id
      where m.course_id = ${id} order by case m.role when 'owner' then 0 when 'editor' then 1 else 2 end, lower(u.username)`;
    return rows.map(r => ({ userId: r.id, username: r.username, displayName: r.display_name, role: r.role, perms: r.perms }));
  });

  /** Would the course still have an owner without this person as one? */
  const ownersBesides = async (courseId: string, userId: string) => {
    const [{ n }] = await sql`select count(*)::int as n from course_members where course_id = ${courseId} and role = 'owner' and user_id <> ${userId}`;
    return n;
  };

  app.post<Id>("/api/courses/:id/members", async req => {
    const { id } = parse(ids, req.params);
    await role(req, id, "owner");
    // (what a viewer may see: null, everything but downloads)
    const b = parse(z.object({ username: z.string().trim().max(64), role: z.enum(["owner", "editor", "viewer"]), perms: viewerPerms.nullable().optional() }), req.body);
    const [u] = await sql`select id, username from users where lower(username) = lower(${b.username}) and not disabled`;
    if (!u) throw new ApiError(404, "No one by that username");
    if (b.role !== "owner" && !(await ownersBesides(id, u.id))) throw new ApiError(400, "A course needs an owner");
    await sql`insert into course_members (course_id, user_id, role, perms) values (${id}, ${u.id}, ${b.role}, ${b.perms ? sql.json(b.perms as never) : null})
      on conflict (course_id, user_id) do update set role = excluded.role, perms = case when ${b.perms === undefined} then course_members.perms else excluded.perms end`;
    // (a viewer now, or an editor whose changes now need the owner's OK: no more live changes)
    if (b.role === "viewer") live.stopEditing(id, u.id, false);
    await audit(sql, req, "course.shared", { course: id, username: u.username, role: b.role });
    return { ok: true };
  });

  app.delete<{ Params: { id: string; userId: string } }>("/api/courses/:id/members/:userId", async req => {
    const { id, userId } = parse(z.object({ id: z.uuid("Not found"), userId: z.uuid("Not found") }), req.params);
    const a = need(req);
    // (owners take anyone off; anyone can leave)
    if (userId !== a.user.id) await role(req, id, "owner");
    else await role(req, id, "viewer");
    if (!(await ownersBesides(id, userId))) {
      const [m] = await sql`select role from course_members where course_id = ${id} and user_id = ${userId}`;
      if (m?.role === "owner") throw new ApiError(400, "A course needs an owner");
    }
    const gone = await sql`delete from course_members where course_id = ${id} and user_id = ${userId} returning user_id`;
    if (!gone.length) throw new ApiError(404, "Not found");
    live.stopEditing(id, userId, true);
    await audit(sql, req, "course.unshared", { course: id, user: userId });
    return { ok: true };
  });

  // Who a course can be shared with
  app.get("/api/people", async req => {
    need(req);
    const rows = await sql`select username, display_name from users where not disabled order by lower(username)`;
    return rows.map(r => ({ username: r.username, displayName: r.display_name }));
  });
}
