// Courses kept on the HyzerLab server. Changes save into a draft of your own, which Publish
// merges into the course (editors: or sends for the owner's OK, when the owner asks for it);
// owners and editors can instead "Publish as I go", changing the course itself live, with everyone
// else who has it open (live.ts; editors only while the owner doesn't want to OK changes first).
// When both a draft and the course changed the same part, you
// pick which to keep. Earlier versions and sent drafts can be looked at (view only) before restoring or
// accepting them. The File menu and the home page list the courses shared with you.
import { create } from "zustand";
import { generateId } from "../constants";
import { createEmptyCourse, normalizeCourse } from "../lib/course";
import { courseStats, courseTotals, playsOf } from "../lib/holeStats";
import { changesBetween, describeChanges, holesChanged, keepCourseHoles, keepTheirs, mergeCourse, type Merged } from "../lib/merge";
import { safeDoc } from "../lib/safeDoc";
import type { PlanMeta } from "../lib/storage";
import { getDoc, useCourse, useEditor } from "../state/course";
import { isEmpty, show } from "../state/files";
import { toast } from "../state/toast";
import type { CourseDoc } from "../types";
import { api, ApiFail, useAuth } from "./api";
import type { Perms } from "./perms";
import { liveRetry, liveSaveNow, livePending, liveWritten, startLive, stopLive } from "./live";

export type Role = "owner" | "editor" | "viewer";
export interface Summary { par: number; length: number; units: "ft" | "m"; canvas: { width: number; height: number }; lines: [number, number][][] }
export type ServerPlan = PlanMeta & {
  role: Role; updatedBy: string | null; owner: string | null; members: number; summary: Partial<Summary>; thumbAt: number | null;
  hasDraft: boolean; toReview: number; park: string;
};

/** What the course list shows of a course: totals, and each hole's throw line for a small map. */
export const summaryOf = (doc: CourseDoc): Summary => {
  const stats = courseStats(doc);
  const t = courseTotals(doc, stats);
  // (long lines thinned to 64 points: plenty for a picture)
  const thin = (l: { x: number; y: number }[]) => l.filter((_, i) => l.length <= 64 || i % Math.ceil(l.length / 63) === 0 || i === l.length - 1).slice(0, 64);
  return {
    par: t.par, length: Math.round(t.length), units: doc.units, canvas: doc.canvas,
    lines: stats.filter(s => s.complete).slice(0, 200).map(s => thin(s.line).map(p => [Math.round(p.x), Math.round(p.y)] as [number, number]))
  };
};
export const holesOf = (doc: CourseDoc) => doc.holes.reduce((n, h) => n + playsOf(doc, h.id), 0);

type Status = "saved" | "saving" | "unsaved" | "conflict" | "error";
/** Looking at an earlier version, or a draft sent for the owner's OK (view only). */
export type Preview = { kind: "version"; id: number; label: string } | { kind: "submission"; id: string; label: string };

export const useServerCourse = create<{
  id: string | null; version: number; role: Role | null; status: Status; conflict: string;
  /** Working in a draft (editors always; owners unless publishing as they go); it exists once
   * something was changed. */
  draft: boolean;
  /** Changing the course itself, live ("Publish as I go": owners, and editors unless the owner
   * OKs changes first). */
  live: boolean;
  /** When the draft was last saved by hand (Save draft). */
  savedAt?: number;
  /** The course moved on since the draft started (Update draft brings its changes in). */
  behind: boolean;
  /** The owner's switch: editors' drafts wait for the owner's OK. */
  approval: boolean;
  preview: Preview | null;
  /** Drafts waiting for the owner's OK (for the owner). */
  pending: number;
  /** What a viewer may see (null: the default). */
  perms: Perms | null;
  /** The park it's in (its owner names it; "" none). */
  park: string;
}>(() => ({ id: null, version: 0, role: null, status: "saved", conflict: "", draft: false, live: true, behind: false, approval: false, preview: null, pending: 0, perms: null, park: "" }));
const state = () => useServerCourse.getState();
const set = (s: Partial<ReturnType<typeof state>>) => useServerCourse.setState(s);

// The document as opened (no need to save it back), and the photo the server has
let opened: CourseDoc | null = null;
let sentBackground: string | null = null;
// An editor's draft: what it started from (to merge with what changed meanwhile), and the
// course's own photo then (a draft's photo goes with it only if it's a new one)
let base: { doc: CourseDoc; version: number; photo: string | null } | null = null;
/** The saves, one after another: never two at once (two sent together carry the same version, and
 * the server turns the second away as a clash, which stops saving). */
let saves: Promise<void> = Promise.resolve();
let timer = 0;

const lastKey = () => `hyzerlab:last:${useAuth.getState().session?.user?.id ?? ""}`;
const remember = (id: string | null) => { try { if (id) localStorage.setItem(lastKey(), id); else localStorage.removeItem(lastKey()); } catch { /* private window */ } };

const editing = () => state().role === "owner" || state().role === "editor";
const canSave = () => editing() && state().status !== "conflict" && !state().preview;
export const inDraft = () => editing() && !state().live;
/** Changing the course itself as it's open, with everyone else in it (a course on the server). */
const editsLive = () => !!state().id && editing() && !inDraft();
const noPhoto = (doc: CourseDoc) => ({ ...doc, background: null });
/** A document from the server in the app's own form (filled in, cleaned): what it's compared in
 * (made once for each document). */
const usableOf = new WeakMap<CourseDoc, CourseDoc>();
const usable = (doc: CourseDoc) => {
  let u = usableOf.get(doc);
  if (!u) usableOf.set(doc, (u = normalizeCourse(safeDoc({ ...doc, background: null }))));
  return u;
};

/** The course as last saved (a save queued behind it, nothing changed since, sends nothing). */
let lastSaved: CourseDoc | null = null;

async function save() {
  const doc = getDoc();
  if (doc === opened || doc === lastSaved || !canSave()) return;
  if (!state().id && isEmpty(doc)) return;
  set({ status: "saving" });
  try {
    const summary = summaryOf(doc);
    const id = state().id;
    if (editsLive()) {
      // (live: the changes are on their way already; the photo goes on its own)
      liveRetry();
      await liveSaveNow();
      if (doc.background !== sentBackground && doc.background) {
        await api("PUT", `courses/${id}/background`, { data: doc.background });
        sentBackground = doc.background;
      }
      lastSaved = doc;
      set({ status: liveWritten() ? "saved" : "saving" });
      return;
    }
    if (!id) {
      const r = await api<{ id: string; version: number; role: Role }>("POST", "courses", { doc: noPhoto(doc), summary });
      set({ id: r.id, version: r.version, role: r.role });
      sentBackground = null;
      remember(r.id);
      // (live from now on, from what was sent: anything changed meanwhile goes as a change)
      opened = doc;
      if (editsLive()) startLive(r.id, doc, 0, liveHooks);
    } else if (inDraft()) {
      const r = await api<{ version: number }>("PUT", `courses/${id}/draft`, { doc: noPhoto(doc), summary, base: state().draft ? undefined : { doc: noPhoto(base!.doc), version: base!.version } });
      set({ draft: true, behind: r.version > base!.version });
    } else {
      const r = await api<{ version: number }>("PUT", `courses/${id}`, { doc: noPhoto(doc), version: state().version, summary });
      set({ version: r.version });
    }
    if (doc.background !== sentBackground && doc.background) {
      await api("PUT", inDraft() ? `courses/${state().id}/draft/photo` : `courses/${state().id}/background`, { data: doc.background });
      sentBackground = doc.background;
    }
    lastSaved = doc;
    // (live now: saved once the live connection has it all)
    if (editsLive()) { set({ status: liveWritten() ? "saved" : "saving" }); return; }
    set({ status: getDoc() === doc ? "saved" : "unsaved" });
    if (!inDraft()) thumbnailSoon();
  } catch (e) {
    if (e instanceof ApiFail && e.status === 409) set({ status: "conflict", conflict: e.message });
    else { set({ status: "error" }); console.warn("Save failed", e); }
  }
}

// --- The course list's picture: the printed map, small, made after a save (at most every two
// minutes while changing it, and when going back to the list)

const THUMB_PX = 640;
const THUMB_EVERY = 2 * 60_000;
let thumbFor: CourseDoc | null = null;
let thumbAt = 0;
let thumbing: Promise<void> | null = null;

async function makeThumbnail(doc = getDoc()) {
  const id = state().id;
  // (the course's own picture: never of a draft or of something looked back at)
  if (!id || doc === thumbFor || !editing() || state().preview || (inDraft() && doc === getDoc() && state().draft) || !doc.holes.length) return;
  thumbFor = doc;
  thumbAt = Date.now();
  try {
    // (the painter loaded only when a picture is made: the course list doesn't wait for it)
    const [{ canopyFor }, { paintedForPrint, renderPoster }, { canvasBlob, svgToCanvas }, { reliefOf }] = await Promise.all([import("../lib/forest"), import("../lib/mapSvg"), import("../lib/raster"), import("../components/useRelief")]);
    const art = { ...reliefOf(doc), canopy: await canopyFor(doc) };
    // (painted in the map's spare moments, while the course is being worked on)
    const { spareMoment } = await import("../state/pace");
    const p = await paintedForPrint(page => (72 * THUMB_PX) / page.width, () => renderPoster(doc, art), () => spareMoment());
    const canvas = await svgToCanvas(p.svg, p.width, p.height, (72 * THUMB_PX) / p.width);
    const blob = await canvasBlob(canvas, "image/webp", 0.8);
    const data = await new Promise<string>((ok, bad) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = bad; r.readAsDataURL(blob); });
    if (state().id === id) await api("PUT", `courses/${id}/thumbnail`, { data });
  } catch (e) {
    console.warn("Couldn't make the course's picture", e);
  }
}

/** The picture now (on the way back to the list), or soon after a save. */
export const thumbnailNow = () => (thumbing ??= makeThumbnail().finally(() => { thumbing = null; }));
const thumbnailSoon = () => {
  if (Date.now() - thumbAt < THUMB_EVERY || thumbing) return;
  const idle = (window as { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => void }).requestIdleCallback;
  (idle ? (f: () => void) => idle(f, { timeout: 10_000 }) : (f: () => void) => setTimeout(f, 3000))(() => void thumbnailNow());
};

/** Your draft saved by hand, named: saved now, then kept in the history to come back to. */
export async function saveDraftAs(note: string) {
  const id = state().id;
  if (!id || !inDraft()) return;
  await saveNow();
  await api("POST", `courses/${id}/draft/save`, { note: note.trim() });
  set({ savedAt: Date.now() });
}

/** Saves now (waiting for one already going). */
export async function saveNow() {
  window.clearTimeout(timer);
  const run = saves.then(() => save());
  saves = run.catch(() => {});
  await run;
}

// (the tab closed or reloaded after a save failed: the browser asks first, the changes not on
// the server; a save only waiting its moment goes on its own)
if (typeof window !== "undefined") window.addEventListener("beforeunload", e => {
  if (state().status === "error" || livePending()) { e.preventDefault(); e.returnValue = ""; }
});

export const startServerAutosave = () => {
  const stopSaving = useCourse.subscribe((s, prev) => {
    if (s.doc === prev.doc || s.doc === opened || !canSave()) return;
    // (live: sent as they're made; a new photo goes on its own)
    if (editsLive()) {
      if (s.doc.background !== sentBackground && s.doc.background && s.doc.background !== prev.doc.background) { window.clearTimeout(timer); timer = window.setTimeout(() => void saveNow(), 1500); }
      return;
    }
    if (state().status === "saved") set({ status: "unsaved" });
    window.clearTimeout(timer);
    timer = window.setTimeout(() => void saveNow(), 1500);
  });
  // View only: always the Select tool on the holes (look and pick, nothing to draw or place), and
  // only the views the viewer may see
  const keepSelect = useEditor.subscribe(e => {
    if (!useCourse.getState().readOnly) return;
    if (e.tool !== "select" || e.step !== "design") e.set({ tool: "select", step: "design" });
    const may = (k: keyof Perms) => state().role !== "viewer" || ((state().perms ?? {})[k] ?? k !== "downloads");
    if (e.view === "3d" && !may("view3d")) e.set({ view: "2d" });
    else if (e.view === "2d" && !may("map") && may("view3d")) e.set({ view: "3d" });
    if (e.teeView && !may("view3d") && !may("flyovers")) e.set({ teeView: null });
    if (e.flyover && !may("flyovers")) e.set({ flyover: false });
  });
  return () => { stopSaving(); keepSelect(); };
};

type CourseRead = { id: string; version: number; seq?: number; role: Role; approval: boolean; live: boolean; park: string; perms: Perms | null; doc: CourseDoc; hasBackground: boolean; hasThumbnail: boolean };
const readCourse = (id: string) => api<CourseRead>("GET", `courses/${id}`);
const readPhoto = async (id: string, has: boolean) => (has ? (await api<{ data: string | null }>("GET", `courses/${id}/background`)).data : null);

/** Shows a document from the server (cleaned first), view only or not. */
const display = (raw: CourseDoc, background: string | null, readOnly: boolean) => {
  const doc = normalizeCourse(safeDoc({ ...raw, background }));
  opened = doc;
  useCourse.setState({ readOnly });
  show(doc);
  return doc;
};

/** Opens a course from the server: an editor's own draft of it, if they have one. True when it's
 * shown, false when it couldn't be opened, null when something opened since took its place. */
export async function openServerCourse(id: string, quiet = false): Promise<boolean | null> {
  // (only the last one asked for is shown: the course opened at start and one clicked on the
  // home page can be on their way at once, and a preview opened meanwhile stays)
  const mine = ++opening;
  if (state().id && state().id !== id) await saveNow();
  try {
    const c = await readCourse(id);
    const photo = await readPhoto(id, c.hasBackground);
    let doc = c.doc, shown = photo, draft = false, from: typeof base = null;
    if (c.role !== "viewer" && !c.live) {
      const { draft: d } = await api<{ draft: { doc: CourseDoc; baseDoc: CourseDoc; baseVersion: number; hasPhoto: boolean } | null }>("GET", `courses/${id}/draft`);
      if (d) {
        doc = d.doc;
        draft = true;
        from = { doc: usable(d.baseDoc), version: d.baseVersion, photo };
        if (d.hasPhoto) shown = (await api<{ data: string | null }>("GET", `courses/${id}/draft/photo`)).data;
      } else from = { doc: usable(c.doc), version: c.version, photo };
    }
    if (mine !== opening) return null;
    base = from;
    set({ id, version: c.version, role: c.role, approval: c.approval, live: c.live, perms: c.perms, park: c.park ?? "", behind: !!base && c.version > base.version, status: "saved", conflict: "", draft, preview: null, pending: 0 });
    thumbFor = null;
    thumbAt = 0;
    sentBackground = shown;
    stopLive();
    const shownDoc = display(doc, shown, c.role === "viewer");
    if (c.role === "viewer" || editsLive()) startLive(id, shownDoc, c.seq ?? 0, liveHooks);
    remember(id);
    if (c.role === "owner") void api<unknown[]>("GET", `courses/${id}/submissions`).then(l => { if (state().id === id) set({ pending: l.length }); }, () => {});
    // (a course from before the list had pictures: one now)
    if (!c.hasThumbnail && c.role === "owner") thumbnailSoon();
    return true;
  } catch (e) {
    if (!quiet) toast(e instanceof Error ? e.message : "That course couldn't be opened.", "error");
    return false;
  }
}

const reopen = () => { const id = state().id; return id ? openServerCourse(id) : Promise.resolve(false as const); };
/** Courses asked to open, counted (a newer ask, or a preview, makes an older one's answer stale). */
let opening = 0;

/** What the live connection asks of the course here. */
const liveHooks = {
  read: async () => {
    const c = await readCourse(state().id!);
    set({ version: c.version });
    return { doc: normalizeCourse(safeDoc({ ...c.doc, background: getDoc().background })), seq: c.seq ?? 0 };
  },
  summary: (doc: CourseDoc) => summaryOf(doc),
  canSend: () => editsLive() && !state().preview && !useCourse.getState().readOnly,
  status: (s: "saved" | "saving" | "error") => set({ status: s }),
  written: () => thumbnailSoon(),
  toDraft: (server: CourseDoc, mine: CourseDoc) => {
    // (the owner wants to OK changes first: ours, from here on, in a draft of our own)
    base = { doc: server, version: state().version, photo: sentBackground };
    set({ live: false, draft: false, status: "unsaved" });
    opened = server;
    toast("The owner now OKs changes before they go in. Yours are in a draft: Send puts them in front of the owner.", "info");
    if (mine !== server) void saveNow();
  },
  photo: async () => {
    const id = state().id;
    if (!id) return;
    const data = await readPhoto(id, true).catch(() => null);
    if (state().id !== id) return;
    sentBackground = data;
    useCourse.setState(s => ({ doc: { ...s.doc, background: data } }));
  }
};

/** A course not on the server yet: saved there (yours) once something is on it. */
export async function startUnsaved(doc: CourseDoc) {
  if (state().id) await saveNow();
  opening++;
  stopLive();
  set({ id: null, version: 0, role: "owner", status: "saved", conflict: "", draft: false, live: true, behind: false, approval: false, preview: null, pending: 0, perms: null, park: "" });
  sentBackground = null;
  base = null;
  opened = null;
  useCourse.setState({ readOnly: false });
  show(doc);
  remember(null);
}

export const newServerCourse = () => startUnsaved(createEmptyCourse());

/** A copy of the open course, yours to change (the one shared with you stays as it is). */
export async function copyCourse() {
  const doc = getDoc();
  await startUnsaved({ ...doc, id: generateId(), seed: doc.seed ?? doc.id, name: `${doc.name || "Untitled course"} (copy)` });
  await saveNow();
  if (state().id) toast("Copied. This copy is yours.", "success");
}

export async function restoreServer() {
  // (something was opened already, a course picked on the home page: that stays)
  if (opening) return true;
  let last: string | null = null;
  try { last = localStorage.getItem(lastKey()); } catch { /* private window */ }
  // (opened, or something opened since in its place: nothing more to do)
  if (last && (await openServerCourse(last, true)) !== false) return true;
  await newServerCourse();
  return false;
}

export const listServerCourses = async (): Promise<ServerPlan[]> =>
  (await api<(Omit<ServerPlan, "updatedAt"> & { updatedAt: string })[]>("GET", "courses")).map(c => ({ ...c, updatedAt: new Date(c.updatedAt).getTime() }));

/** What's asked before a course goes: deleted for everyone (yours), or off your list (shared). */
export const removeQuestion = (c: Pick<ServerPlan, "name" | "role">) => (c.role === "owner" ? `Delete "${c.name}" for everyone?` : `Take "${c.name}" off your list?`);

/** Deletes a course you own; takes one shared with you off your list. `asked`: the Courses page
 * has asked already, in its own dialog. */
export async function removeServerCourse(id: string, known?: ServerPlan, asked = false) {
  // (the list's own entry when there is one: asked at once, not after fetching the list again)
  const c = known ?? (await listServerCourses()).find(x => x.id === id);
  if (!c) return;
  const owner = c.role === "owner";
  if (!asked && !confirm(removeQuestion(c))) return;
  if (owner) await api("DELETE", `courses/${id}`);
  else await api("DELETE", `courses/${id}/members/${useAuth.getState().session!.user!.id}`);
  if (state().id === id) await newServerCourse();
  toast(owner ? `Deleted "${c.name}".` : `Took "${c.name}" off your list.`, "info");
}

/** After the owner's save was stopped: theirs, or this one saved over it. */
export async function reloadTheirs() {
  set({ status: "saved", conflict: "" });
  await reopen();
}
export async function keepMine() {
  const id = state().id;
  if (!id) return;
  const c = await readCourse(id);
  set({ version: c.version, status: "unsaved", conflict: "" });
  opened = null;
  await saveNow();
}

// --- Publishing a draft


/** A draft merged with the course as it is now, and the version merged with. */
export type Merge = Merged & { version: number };
const mergeWith = async (id: string, draft: CourseDoc, from: CourseDoc): Promise<Merge> => {
  const c = await readCourse(id);
  return { ...mergeCourse(usable(from) as never, usable(c.doc) as never, usable(draft) as never), version: c.version };
};

/** The draft merged with the course as it is now: what Publish would put in (its clashes to pick). */
export async function prepareMerge() {
  const id = state().id;
  if (!id || !base) return null;
  await saveNow();
  return mergeWith(id, getDoc(), base.doc);
}

// (what the draft changes, worked out once for each change: the top bar asks often)
let changesFor: { doc: CourseDoc; base: CourseDoc; count: number; text: string } | null = null;
const changes = () => {
  const doc = getDoc();
  if (!base) return { count: 0, text: "" };
  if (changesFor?.doc !== doc || changesFor.base !== base.doc) {
    const c = changesBetween(base.doc as never, doc as never);
    const n = (x: { added: number; removed: number; changed: number }) => x.added + x.removed + x.changed;
    changesFor = { doc, base: base.doc, count: n(c.holes) + n(c.items) + c.other.length, text: describeChanges(base.doc, doc) };
  }
  return changesFor;
};
/** How many things the draft changes (holes, features, and settings). */
export const draftChangeCount = () => changes().count;
/** What the draft changes ("Holes: 1 added"): the version's name when none is given. */
export const draftChanges = () => changes().text;

/** The holes the draft changes (for the dots in the hole list), or none. */
export const draftHoles = (doc: CourseDoc) => (base && inDraft() ? holesChanged(base.doc as never, doc as never) : new Set<string>());

/** Publishes the draft as merged (the clashes picked keep the course's); the owner's OK first,
 * for an editor when the owner wants it. */
export async function publishDraft(note: string, m: Merge | null, picked = new Set<number>()) {
  const id = state().id;
  if (!id || !base) return;
  await saveNow();
  const name = note.trim() || draftChanges();
  if (state().approval && state().role !== "owner") {
    await api("POST", `courses/${id}/submissions`, { note: name });
    await reopen();
    toast("Sent to the owner.", "success");
    return;
  }
  const draft = getDoc();
  // (a new photo in the draft goes with it)
  const photo = draft.background !== base.photo ? draft.background : undefined;
  let merge = m ?? (await mergeWith(id, draft, base.doc));
  for (let tries = 0; ; tries++) {
    const doc = keepTheirs(merge, picked);
    try {
      await api("POST", `courses/${id}/publish`, { doc, version: merge.version, summary: summaryOf(doc), photo, note: name });
      await reopen();
      void makeThumbnail(normalizeCourse({ ...doc, background: photo === undefined ? base?.photo ?? null : photo }));
      toast("Published.", "success");
      return;
    } catch (e) {
      // (the course changed again meanwhile: merged once more, the same picks where they still apply)
      if (!(e instanceof ApiFail && e.status === 409) || tries >= 2) throw e;
      const again = await mergeWith(id, draft, base.doc);
      picked = new Set([...picked].map(i => merge.clashes[i]).map(c => again.clashes.findIndex(x => x.list === c.list && x.id === c.id)).filter(i => i >= 0));
      merge = again;
    }
  }
}

/** Brings the course's changes since the draft started into the draft (the clashes picked keep
 * the course's); the draft then starts from the course as it is now. */
export async function updateDraft(m: Merge, picked = new Set<number>()) {
  const id = state().id;
  if (!id || !base) return;
  const c = await readCourse(id);
  const doc = normalizeCourse(safeDoc({ ...keepTheirs(m, picked), background: getDoc().background }));
  base = { doc: usable(c.doc), version: c.version, photo: await readPhoto(id, c.hasBackground) };
  await api("PUT", `courses/${id}/draft`, { doc: noPhoto(doc), summary: summaryOf(doc), base: { doc: noPhoto(base.doc), version: base.version } });
  set({ draft: true, behind: false, version: c.version });
  opened = doc;
  useCourse.setState({ readOnly: false });
  show(doc);
  toast("Your draft has the course's latest changes.", "success");
}

/** Straight into the course as you go (live, with everyone else in it), or in a draft. */
export async function setLive(on: boolean) {
  const id = state().id;
  if (!id) { set({ live: on }); return; }
  await saveNow();
  await api("POST", `courses/${id}/live`, { live: on });
  await reopen();
}

/** Drops the draft: the course as it is now again. */
export async function discardDraft() {
  const id = state().id;
  if (!id) return;
  window.clearTimeout(timer);
  await api("DELETE", `courses/${id}/draft`);
  await reopen();
}

// --- Looking back: earlier versions, drafts sent for the owner's OK

export interface VersionRow { id: number; version: number; kind: "created" | "autosave" | "publish" | "restore" | "draft"; note: string; at: string; by: string | null; approvedBy: string | null }

/** What changed between an earlier version and the course as it is now (or your draft). */
export async function compareWithNow(vid: number) {
  const r = await api<{ doc: CourseDoc }>("GET", `courses/${state().id}/versions/${vid}`);
  return describeChanges(usable(r.doc), usable(getDoc()));
}
export interface SubmissionRow { id: string; note: string; createdAt: string; by: string | null; byId: string | null }

export const listVersions = () => api<VersionRow[]>("GET", `courses/${state().id}/versions`);
export const listSubmissions = () => api<SubmissionRow[]>("GET", `courses/${state().id}/submissions`);

/** Shows an earlier version, view only, until Back or Restore. */
export async function previewVersion(v: VersionRow, label: string) {
  await saveNow();
  const r = await api<{ doc: CourseDoc; photo: string | null }>("GET", `courses/${state().id}/versions/${v.id}`);
  opening++;
  stopLive();
  set({ preview: { kind: "version", id: v.id, label } });
  display(r.doc, r.photo, true);
}

/** An earlier version (or a checkpoint of your draft) into your draft, to publish. */
export async function versionToDraft(vid: number) {
  const id = state().id;
  if (!id) return;
  await saveNow();
  await api("POST", `courses/${id}/versions/${vid}/to-draft`);
  // (publishing as they go: into a draft now)
  if (state().live) await api("POST", `courses/${id}/live`, { live: false });
  await reopen();
  toast("It's in your draft now: Publish puts it in the course.", "success");
}

export async function restoreVersion(vid: number) {
  const id = state().id;
  if (!id) return;
  await saveNow();
  const r = await api<{ version: number }>("POST", `courses/${id}/versions/${vid}/restore`);
  await reopen();
  thumbFor = null;
  void makeThumbnail();
  toast(`Restored. It's version ${r.version} now.`, "success");
}

/** Shows a sent draft, view only, until Back, Accept or Decline. */
export async function previewSubmission(s: SubmissionRow, label: string) {
  await saveNow();
  const r = await api<{ doc: CourseDoc; photo: string | null }>("GET", `courses/${state().id}/submissions/${s.id}`);
  const c = await readCourse(state().id!);
  opening++;
  stopLive();
  set({ preview: { kind: "submission", id: s.id, label } });
  display(r.doc, r.photo ?? (await readPhoto(state().id!, c.hasBackground)), true);
}

/** The holes a sent draft changes, with their names (for leaving some out when accepting). */
export async function submissionHoles(sid: string) {
  const s = await api<{ doc: CourseDoc; baseDoc: CourseDoc }>("GET", `courses/${state().id}/submissions/${sid}`);
  const doc = usable(s.doc);
  return [...holesChanged(usable(s.baseDoc) as never, doc as never)].map(h => ({ id: h, label: doc.holes.find(x => x.id === h)?.name || `Hole ${doc.holes.findIndex(x => x.id === h) + 1}` }));
}

export async function acceptSubmission(sid: string, leaveOut = new Set<string>()) {
  const id = state().id;
  if (!id) return;
  const s = await api<{ doc: CourseDoc; baseDoc: CourseDoc; photo: string | null; note: string }>("GET", `courses/${id}/submissions/${sid}`);
  for (let tries = 0; ; tries++) {
    const m = await mergeWith(id, s.doc, s.baseDoc);
    // (holes left out: as they are in the course)
    const doc = keepCourseHoles(m.doc, usable((await readCourse(id)).doc), leaveOut);
    try {
      await api("POST", `courses/${id}/submissions/${sid}/accept`, { doc, version: m.version, summary: summaryOf(doc), photo: s.photo ?? undefined, note: s.note });
      set({ preview: null });
      await reopen();
      thumbFor = null;
      void makeThumbnail();
      toast(m.clashes.length ? `Accepted. Theirs replaced changes made meanwhile to ${m.clashes.slice(0, 3).map(c => c.label).join(", ")}${m.clashes.length > 3 ? "…" : ""}.` : "Accepted.", "success");
      return;
    } catch (e) {
      if (!(e instanceof ApiFail && e.status === 409) || tries >= 2) throw e;
    }
  }
}

/** The owner declines a sent draft; whoever sent it takes it back. */
export async function declineSubmission(sid: string, note = "") {
  await api("POST", `courses/${state().id}/submissions/${sid}/decline`, { note });
  set({ preview: null });
  await reopen();
}

/** Back from looking at an earlier version or a sent draft. */
export const endPreview = async () => { set({ preview: null }); await reopen(); };

export async function setApproval(on: boolean) {
  const was = state().approval;
  set({ approval: on });
  try { await api("POST", `courses/${state().id}/settings`, { approval: on }); } catch (e) { set({ approval: was }); throw e; }
}

// (for the real-course checks, tests/real: a course started, opened and saved as a person would)
if (typeof window !== "undefined") (window as unknown as { __dgServer: unknown }).__dgServer = { start: startUnsaved, open: openServerCourse, saveNow, setLive, state };
