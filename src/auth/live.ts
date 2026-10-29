// Editing a course together, live: owners and editors change the course, and everyone with it
// open (viewers too, watching) gets each change as it's made. Each change goes
// to the server as the parts it changed (a tree, a hole, the map's style), and comes back to
// everyone in the order the server took them. When two people change the same part at once, the
// later one stays. Someone else's change to a part you've just changed waits behind yours (the
// server takes yours after it). Undo takes back only your own changes: what others changed since
// stays. If the connection drops, or the server restarts, the course is read again and what you
// changed since it was last written goes on top of it.
import { create } from "zustand";
import type { CourseDoc } from "../types";
import { getDoc, setCatchUp, useCourse } from "../state/course";
import { applyChanges, changesBetween, theirsInto, type Change } from "../lib/liveChanges";
import { api, ApiFail } from "./api";

export interface Person { userId: string; name: string; clients: string[] }
/** Where someone is pointing on the map (plan feet; none: off the map), what they've picked, and
 * how they're looking (the map from above, in 3D, or on the Map step). */
export interface Here { x?: number | null; y?: number | null; picked?: string | null; view?: "2d" | "3d" | "map"; /** Dragging what they picked. */ drag?: boolean }
/** Someone's pointer: as they last said, when, and when it last moved. */
export interface Pointer { userId: string; name: string; at: Here | null; when: number; movedAt: number }

export const useLive = create<{ on: boolean; connected: boolean; people: Person[]; pointers: Record<string, Pointer> }>(() => ({ on: false, connected: false, people: [], pointers: {} }));

/** This tab's own name (its connection, and the changes it sends). */
export const CLIENT = Array.from(crypto.getRandomValues(new Uint8Array(12)), b => "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"[b & 63]).join("");

export interface LiveHooks {
  /** The course from the server, as the app shows it (filled in, cleaned), with its photo kept. */
  read: () => Promise<{ doc: CourseDoc; seq: number }>;
  /** The course list's summary of a course (sent now and then with the changes). */
  summary: (doc: CourseDoc) => unknown;
  /** Whether this tab sends its changes (not view only, not looking back at a version). */
  canSend: () => boolean;
  status: (s: "saved" | "saving" | "error") => void;
  /** The course's version in the database now (each write makes the next). */
  version: (v: number) => void;
  /** Everything written (the course list's picture can be made). */
  written: () => void;
  /** You may only look at it now (made a viewer): it opens again, view only. */
  role: () => void;
  /** Someone changed the photo. */
  photo: () => void;
}

let course: string | null = null;
let hooks: LiveHooks | null = null;
let source: EventSource | null = null;
let stopWatching: (() => void) | null = null;
/** The last change taken (they come numbered, in order). */
let seq = 0;
/** The course as the server has it (through `seq`); with this tab's changes on their way on top
 * (`sent`); and as last written to the database (`saved`). */
let server: CourseDoc | null = null;
let sent: CourseDoc | null = null;
let saved: CourseDoc | null = null;
/** The server's course at each of the last few changes (what `saved` becomes when it's written). */
let recent: { seq: number; doc: CourseDoc }[] = [];
/** This tab's changes sent and not back yet, by their number. */
const flying = new Map<number, Change[]>();
let batch = 0;
/** The last of this tab's changes taken, the last change written, and the last of ours said to
 * be written (the course list's picture is made after our own changes, not others'). */
let mine = 0, savedSeq = 0, toldMine = 0;
let sending = false, needsRead = false;
let timer = 0, retry = 0, retryTimer = 0, offlineSince = 0;
let summaryAt = 0;
// Others' changes in order, for bringing undo's documents up to date (each document marked with
// how far along it was)
let logPos = 0;
const log: { pos: number; changes: Change[] }[] = [];
const posOf = new WeakMap<CourseDoc, number>();
const LOG_KEPT = 3000;

const at = (s: number, doc: CourseDoc) => { recent.push({ seq: s, doc }); if (recent.length > 40) recent = recent.slice(-20); };

/** Opens the course's live connection (`doc`: as shown, `startSeq`: where the server was). */
export function startLive(id: string, doc: CourseDoc, startSeq: number, h: LiveHooks) {
  stopLive();
  course = id;
  hooks = h;
  server = sent = saved = doc;
  seq = savedSeq = startSeq;
  mine = toldMine = 0;
  recent = [{ seq, doc }];
  posOf.set(doc, logPos);
  setCatchUp(catchUp);
  stopWatching = useCourse.subscribe((s, prev) => {
    if (s.doc === prev.doc) return;
    if (!posOf.has(s.doc)) posOf.set(s.doc, logPos);
    if (s.doc !== sent && hooks?.canSend()) { hooks.status("saving"); sendSoon(); }
  });
  useLive.setState({ on: true, connected: false, people: [], pointers: {} });
  connect();
}

/** Closes it (another course, looking back at a version, signed out). */
export function stopLive() {
  source?.close();
  source = null;
  window.clearTimeout(timer);
  window.clearTimeout(retryTimer);
  timer = retryTimer = 0;
  stopWatching?.();
  stopWatching = null;
  setCatchUp(d => d);
  course = null;
  hooks = null;
  flying.clear();
  sending = needsRead = false;
  retry = offlineSince = 0;
  useLive.setState({ on: false, connected: false, people: [], pointers: {} });
}

/** Changes not on the server yet (the tab asks before it's closed). */
export const livePending = () => !!course && (sending || flying.size > 0 || (getDoc() !== sent && !!hooks?.canSend()));

/** Everything here is on the server and written to the database. */
export const liveWritten = () => !livePending() && savedSeq >= mine;

/** Sends what's waiting now, and waits (a few seconds at most) for the server to take it all:
 * before switching courses or modes, or leaving for the course list. */
export async function liveSaveNow() {
  window.clearTimeout(timer);
  timer = 0;
  const id = course;
  for (let i = 0; i < 100 && course === id && livePending(); i++) {
    if (!sending && useLive.getState().connected && getDoc() !== sent) await flush();
    else await new Promise(ok => setTimeout(ok, 100));
  }
}

function connect() {
  if (!course) return;
  const id = course;
  const es = new EventSource(`./api/courses/${id}/live?client=${CLIENT}`);
  source = es;
  const on = <T>(name: string, f: (data: T) => void) => es.addEventListener(name, e => { if (source === es) f(JSON.parse((e as MessageEvent).data)); });
  on<{ seq: number; people: Person[] }>("hello", d => {
    retry = 0;
    offlineSince = 0;
    useLive.setState({ connected: true, people: d.people });
    // (changes missed while it was away, or a server started again: read it again)
    if (d.seq !== seq || needsRead) void reread();
    else if (getDoc() !== sent) sendSoon();
  });
  on<{ seq: number; client: string; batch: number; changes: Change[] }>("changes", taken);
  on<{ seq: number; version: number }>("saved", d => {
    saved = recent.find(r => r.seq === d.seq)?.doc ?? (d.seq === seq ? server : saved);
    savedSeq = d.seq;
    hooks?.version(d.version);
    settle();
  });
  on("reload", () => void reread());
  on<{ people: Person[] }>("people", d => {
    const here = new Set(d.people.flatMap(p => p.clients));
    const pointers = Object.fromEntries(Object.entries(useLive.getState().pointers).filter(([c]) => here.has(c)));
    useLive.setState({ people: d.people, pointers });
  });
  on<{ client: string; userId: string; name: string; at: Here | null }>("here", d => {
    useLive.setState(s => {
      const was = s.pointers[d.client], now = Date.now();
      const moved = !was || was.at?.x !== d.at?.x || was.at?.y !== d.at?.y;
      return { pointers: { ...s.pointers, [d.client]: { userId: d.userId, name: d.name, at: d.at, when: now, movedAt: moved ? now : was.movedAt } } };
    });
  });
  on("photo", () => hooks?.photo());
  on("role", () => viewOnly());
  es.onerror = () => {
    if (source !== es) return;
    es.close();
    source = null;
    useLive.setState({ connected: false });
    away();
  };
}

/** The connection dropped: tried again, sooner then later. Changes waiting are said not to be
 * saved after a while. */
function away() {
  if (!course) return;
  if (!offlineSince) offlineSince = Date.now();
  if (Date.now() - offlineSince > 10_000 && livePending()) hooks?.status("error");
  window.clearTimeout(retryTimer);
  retryTimer = window.setTimeout(() => { retryTimer = 0; if (course && !source) connect(); }, [1000, 2000, 4000, 8000, 15000][Math.min(retry++, 4)]);
}

/** Tries again now (the "Not saved · try again" link). */
export function liveRetry() {
  if (!course) return;
  retry = 0;
  if (!source) { window.clearTimeout(retryTimer); connect(); } else sendSoon();
}

/** A change the server took: ours back, or someone else's put in (ours not sent yet kept). */
function taken(d: { seq: number; client: string; batch: number; changes: Change[] }) {
  if (!server || !sent) return;
  if (d.seq !== seq + 1) { void reread(); return; }
  seq = d.seq;
  if (d.client === CLIENT) {
    // (our own: the parts as we have them, the same objects)
    const ours = flying.get(d.batch) ?? d.changes;
    flying.delete(d.batch);
    server = applyChanges(server, ours);
    mine = d.seq;
  } else {
    const before = server;
    server = applyChanges(server, d.changes);
    sent = theirsInto(sent, before, d.changes);
    const doc = getDoc();
    const next = theirsInto(doc, before, d.changes);
    log.push({ pos: ++logPos, changes: d.changes });
    if (log.length > LOG_KEPT) log.splice(0, log.length - LOG_KEPT);
    if (next !== doc) {
      posOf.set(next, logPos);
      useCourse.setState({ doc: next });
    }
  }
  at(seq, server);
  settle();
}

/** Saved once everything of ours is back and written. */
function settle() {
  if (!hooks || sending || flying.size || getDoc() !== sent) return;
  const written = savedSeq >= mine;
  hooks.status(written ? "saved" : "saving");
  if (written && mine > toldMine) { toldMine = mine; hooks.written(); }
}

function sendSoon() {
  if (timer || sending) return;
  // (a drag sends about ten times a second)
  timer = window.setTimeout(() => { timer = 0; void flush(); }, 90);
}

async function flush() {
  if (!course || !hooks || !sent || sending || !hooks.canSend()) return;
  if (!source || !useLive.getState().connected) return; // (sent when it's back)
  const doc = getDoc();
  const changes = changesBetween(sent, doc);
  if (!changes.length) { settle(); return; }
  const id = course, b = ++batch;
  flying.set(b, changes);
  sent = doc;
  sending = true;
  const summary = Date.now() - summaryAt > 10_000 ? hooks.summary(doc) : undefined;
  if (summary !== undefined) summaryAt = Date.now();
  try {
    await api("POST", `courses/${id}/live/changes`, { client: CLIENT, batch: b, changes, summary });
  } catch (e) {
    if (course !== id) return;
    // (made a viewer meanwhile: it opens again, view only)
    if (e instanceof ApiFail && e.status === 403) { sending = false; viewOnly(); return; }
    // (not taken, or not known: read again once it's back, and sent on top)
    flying.delete(b);
    needsRead = true;
    if (e instanceof ApiFail && e.status === 400) { hooks.status("error"); console.warn("Live change refused", e.message); }
    source?.close();
    source = null;
    useLive.setState({ connected: false });
    away();
  } finally {
    if (course === id) {
      sending = false;
      if (getDoc() !== sent) sendSoon();
      else settle();
    }
  }
}

let reading: Promise<void> | null = null;
/** The course read from the server again; what changed here since it was last written goes on top
 * (and on top of each document undo would go back to). */
function reread() {
  return (reading ??= (async () => {
    const id = course, h = hooks;
    if (!id || !h || !saved) return;
    try {
      const fresh = await h.read();
      if (course !== id) return;
      const since = (d: CourseDoc) => { const r = applyChanges(fresh.doc, changesBetween(saved!, d)); posOf.set(r, logPos); return r; };
      const { doc, past, future } = useCourse.getState();
      const next = since(doc);
      server = sent = saved = fresh.doc;
      seq = savedSeq = fresh.seq;
      mine = toldMine = 0;
      recent = [{ seq, doc: fresh.doc }];
      flying.clear();
      needsRead = false;
      log.length = 0;
      useCourse.setState({ doc: next, past: past.map(since), future: future.map(since), gestureStart: null });
      if (getDoc() !== sent) sendSoon();
      else settle();
    } catch {
      needsRead = true;
      away();
    }
  })().finally(() => { reading = null; }));
}

/** A document from undo's history with others' changes since put in (only your own are undone). */
function catchUp(d: CourseDoc) {
  const from = posOf.get(d);
  if (from === undefined || from >= logPos) return d;
  const changes = log.filter(e => e.pos > from).flatMap(e => e.changes);
  const r = applyChanges(d, changes);
  posOf.set(r, logPos);
  return r;
}

/** You may only look at the course now: it opens again, view only. */
function viewOnly() {
  const h = hooks;
  stopLive();
  h?.role();
}

// --- Where you are on the map, for the others (a few times a second at most)
let hereTimer = 0, hereNext: Here | null | undefined, hereAt = 0;
export function sendHere(at: Here | null) {
  if (!course || !useLive.getState().connected) return;
  hereNext = at;
  if (hereTimer) return;
  const go = () => {
    hereTimer = 0;
    const id = course;
    if (!id || hereNext === undefined) return;
    const a = hereNext;
    hereNext = undefined;
    hereAt = Date.now();
    void api("POST", `courses/${id}/live/here`, { client: CLIENT, at: a }).catch(() => {});
  };
  hereTimer = window.setTimeout(go, Math.max(0, 150 - (Date.now() - hereAt)));
}

// (for tests: what the live connection has)
if (typeof window !== "undefined") (window as unknown as { __dgLive: unknown }).__dgLive = { state: () => ({ course, seq, connected: useLive.getState().connected, flying: flying.size, pending: livePending(), people: useLive.getState().people.length }) };
