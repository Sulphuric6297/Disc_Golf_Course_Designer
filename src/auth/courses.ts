// Courses kept on the HyzerLab server. Owners' changes save straight into the course (one made
// over a newer save is stopped and asked about); editors' changes save into a draft of their own,
// which Publish merges into the course (or, when the owner asks for it, sends for the owner's
// OK). Earlier versions and sent drafts can be looked at (view only) before restoring or
// accepting them. The File menu and the home page list the courses shared with you.
import { create } from "zustand";
import { generateId } from "../constants";
import { createEmptyCourse, normalizeCourse } from "../lib/course";
import { courseStats, courseTotals, playsOf } from "../lib/holeStats";
import { canopyFor } from "../lib/forest";
import { paintedForPrint, renderPoster } from "../lib/mapSvg";
import { canvasBlob, svgToCanvas } from "../lib/raster";
import { mergeCourse } from "../lib/merge";
import { reliefOf } from "../components/useRelief";
import { safeDoc } from "../lib/safeDoc";
import type { PlanMeta } from "../lib/storage";
import { getDoc, useCourse, useEditor } from "../state/course";
import { isEmpty, show } from "../state/files";
import { toast } from "../state/toast";
import type { CourseDoc } from "../types";
import { api, ApiFail, useAuth } from "./api";

export type Role = "owner" | "editor" | "viewer";
export interface Summary { par: number; length: number; units: "ft" | "m"; canvas: { width: number; height: number }; lines: [number, number][][] }
export type ServerPlan = PlanMeta & {
  role: Role; updatedBy: string | null; owner: string | null; members: number; summary: Partial<Summary>; thumbAt: number | null;
  hasDraft: boolean; toReview: number;
};

/** What the course list shows of a course: totals, and each hole's throw line for a small map. */
const summaryOf = (doc: CourseDoc): Summary => {
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
  /** Editors work in a draft; it exists once they've changed something. */
  draft: boolean;
  /** The owner's switch: editors' drafts wait for the owner's OK. */
  approval: boolean;
  preview: Preview | null;
  /** Drafts waiting for the owner's OK (for the owner). */
  pending: number;
}>(() => ({ id: null, version: 0, role: null, status: "saved", conflict: "", draft: false, approval: false, preview: null, pending: 0 }));
const state = () => useServerCourse.getState();
const set = (s: Partial<ReturnType<typeof state>>) => useServerCourse.setState(s);

// The document as opened (no need to save it back), and the photo the server has
let opened: CourseDoc | null = null;
let sentBackground: string | null = null;
// An editor's draft: what it started from (to merge with what changed meanwhile), and the
// course's own photo then (a draft's photo goes with it only if it's a new one)
let base: { doc: CourseDoc; version: number; photo: string | null } | null = null;
let saving: Promise<void> | null = null;
let again = false;
let timer = 0;

const lastKey = () => `hyzerlab:last:${useAuth.getState().session?.user?.id ?? ""}`;
const remember = (id: string | null) => { try { if (id) localStorage.setItem(lastKey(), id); else localStorage.removeItem(lastKey()); } catch { /* private window */ } };

const editing = () => state().role === "owner" || state().role === "editor";
const canSave = () => editing() && state().status !== "conflict" && !state().preview;
const inDraft = () => state().role === "editor";
const noPhoto = (doc: CourseDoc) => ({ ...doc, background: null });
/** A document from the server in the app's own form (filled in, cleaned): what it's compared in. */
const usable = (doc: CourseDoc) => normalizeCourse(safeDoc({ ...doc, background: null }));

async function save() {
  const doc = getDoc();
  if (doc === opened || !canSave()) return;
  if (!state().id && isEmpty(doc)) return;
  set({ status: "saving" });
  try {
    const summary = summaryOf(doc);
    const id = state().id;
    if (!id) {
      const r = await api<{ id: string; version: number; role: Role }>("POST", "courses", { doc: noPhoto(doc), summary });
      set({ id: r.id, version: r.version, role: r.role });
      sentBackground = null;
      remember(r.id);
    } else if (inDraft()) {
      await api("PUT", `courses/${id}/draft`, { doc: noPhoto(doc), summary, base: state().draft ? undefined : { doc: noPhoto(base!.doc), version: base!.version } });
      set({ draft: true });
    } else {
      const r = await api<{ version: number }>("PUT", `courses/${id}`, { doc: noPhoto(doc), version: state().version, summary });
      set({ version: r.version });
    }
    if (doc.background !== sentBackground && doc.background) {
      await api("PUT", inDraft() ? `courses/${state().id}/draft/photo` : `courses/${state().id}/background`, { data: doc.background });
      sentBackground = doc.background;
    }
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
    const art = { ...reliefOf(doc), canopy: await canopyFor(doc) };
    const p = await paintedForPrint(page => (72 * THUMB_PX) / page.width, () => renderPoster(doc, art));
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

/** Saves now (waiting for one already going). */
export async function saveNow() {
  window.clearTimeout(timer);
  if (saving) { again = true; await saving; }
  saving = save().finally(() => { saving = null; });
  await saving;
  if (again) { again = false; await saveNow(); }
}

export const startServerAutosave = () => {
  const stopSaving = useCourse.subscribe((s, prev) => {
    if (s.doc === prev.doc || s.doc === opened || !canSave()) return;
    if (state().status === "saved") set({ status: "unsaved" });
    window.clearTimeout(timer);
    timer = window.setTimeout(() => void saveNow(), 1500);
  });
  // View only: always the Select tool on the holes (look and pick, nothing to draw or place)
  const keepSelect = useEditor.subscribe(e => {
    if (useCourse.getState().readOnly && (e.tool !== "select" || e.step !== "holes")) e.set({ tool: "select", step: "holes" });
  });
  return () => { stopSaving(); keepSelect(); };
};

type CourseRead = { id: string; version: number; role: Role; approval: boolean; doc: CourseDoc; hasBackground: boolean; hasThumbnail: boolean };
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

/** Opens a course from the server: an editor's own draft of it, if they have one. */
export async function openServerCourse(id: string, quiet = false) {
  if (state().id && state().id !== id) await saveNow();
  try {
    const c = await readCourse(id);
    const photo = await readPhoto(id, c.hasBackground);
    let doc = c.doc, shown = photo, draft = false;
    base = null;
    if (c.role === "editor") {
      const { draft: d } = await api<{ draft: { doc: CourseDoc; baseDoc: CourseDoc; baseVersion: number; hasPhoto: boolean } | null }>("GET", `courses/${id}/draft`);
      if (d) {
        doc = d.doc;
        draft = true;
        base = { doc: usable(d.baseDoc), version: d.baseVersion, photo };
        if (d.hasPhoto) shown = (await api<{ data: string | null }>("GET", `courses/${id}/draft/photo`)).data;
      } else base = { doc: usable(c.doc), version: c.version, photo };
    }
    set({ id, version: c.version, role: c.role, approval: c.approval, status: "saved", conflict: "", draft, preview: null, pending: 0 });
    thumbFor = null;
    thumbAt = 0;
    sentBackground = shown;
    display(doc, shown, c.role === "viewer");
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

const reopen = () => { const id = state().id; return id ? openServerCourse(id) : Promise.resolve(false); };

/** A course not on the server yet: saved there (yours) once something is on it. */
export async function startUnsaved(doc: CourseDoc) {
  if (state().id) await saveNow();
  set({ id: null, version: 0, role: "owner", status: "saved", conflict: "", draft: false, approval: false, preview: null, pending: 0 });
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
  let last: string | null = null;
  try { last = localStorage.getItem(lastKey()); } catch { /* private window */ }
  if (last && (await openServerCourse(last, true))) return true;
  await newServerCourse();
  return false;
}

export const listServerCourses = async (): Promise<ServerPlan[]> =>
  (await api<(Omit<ServerPlan, "updatedAt"> & { updatedAt: string })[]>("GET", "courses")).map(c => ({ ...c, updatedAt: new Date(c.updatedAt).getTime() }));

/** Deletes a course you own; takes one shared with you off your list. */
export async function removeServerCourse(id: string) {
  const list = await listServerCourses();
  const c = list.find(x => x.id === id);
  if (!c) return;
  const owner = c.role === "owner";
  if (!confirm(owner ? `Delete "${c.name}" for everyone?` : `Take "${c.name}" off your list?`)) return;
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

/** What the draft started from (for what it changes), or none. */
export const draftBase = () => base?.doc ?? null;

/** The draft merged with the course as it is now (the parts both changed: the draft's). */
const merged = async (id: string, draft: CourseDoc, from: CourseDoc) => {
  const c = await readCourse(id);
  const m = mergeCourse(usable(from) as never, usable(c.doc) as never, usable(draft) as never);
  return { ...m, version: c.version };
};

const said = (clashes: string[]) => (clashes.length ? ` Yours replaced changes made meanwhile to ${clashes.slice(0, 3).join(", ")}${clashes.length > 3 ? "…" : ""}.` : "");

/** Publishes the draft (or, when the owner wants to OK it, sends it). */
export async function publishDraft(note: string) {
  const id = state().id;
  if (!id || !base) return;
  await saveNow();
  if (state().approval) {
    await api("POST", `courses/${id}/submissions`, { note });
    await reopen();
    toast("Sent to the owner.", "success");
    return;
  }
  const draft = getDoc();
  // (a new photo in the draft goes with it)
  const photo = draft.background !== base.photo ? draft.background : undefined;
  for (let tries = 0; ; tries++) {
    const m = await merged(id, draft, base.doc);
    try {
      await api("POST", `courses/${id}/publish`, { doc: m.doc, version: m.version, summary: summaryOf(m.doc), photo, note });
      await reopen();
      void makeThumbnail(normalizeCourse({ ...m.doc, background: photo === undefined ? base?.photo ?? null : photo }));
      toast(`Published.${said(m.clashes)}`, "success");
      return;
    } catch (e) {
      // (the course changed while merging: once more)
      if (!(e instanceof ApiFail && e.status === 409) || tries >= 2) throw e;
    }
  }
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

export interface VersionRow { id: number; version: number; kind: "created" | "autosave" | "publish" | "restore"; note: string; at: string; by: string | null; approvedBy: string | null }
export interface SubmissionRow { id: string; note: string; createdAt: string; by: string | null; byId: string | null }

export const listVersions = () => api<VersionRow[]>("GET", `courses/${state().id}/versions`);
export const listSubmissions = () => api<SubmissionRow[]>("GET", `courses/${state().id}/submissions`);

/** Shows an earlier version, view only, until Back or Restore. */
export async function previewVersion(v: VersionRow, label: string) {
  await saveNow();
  const r = await api<{ doc: CourseDoc; photo: string | null }>("GET", `courses/${state().id}/versions/${v.id}`);
  set({ preview: { kind: "version", id: v.id, label } });
  display(r.doc, r.photo, true);
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
  set({ preview: { kind: "submission", id: s.id, label } });
  display(r.doc, r.photo ?? (await readPhoto(state().id!, c.hasBackground)), true);
}

export async function acceptSubmission(sid: string) {
  const id = state().id;
  if (!id) return;
  const s = await api<{ doc: CourseDoc; baseDoc: CourseDoc; photo: string | null; note: string }>("GET", `courses/${id}/submissions/${sid}`);
  for (let tries = 0; ; tries++) {
    const m = await merged(id, s.doc, s.baseDoc);
    try {
      await api("POST", `courses/${id}/submissions/${sid}/accept`, { doc: m.doc, version: m.version, summary: summaryOf(m.doc), photo: s.photo ?? undefined, note: s.note });
      set({ preview: null });
      await reopen();
      thumbFor = null;
      void makeThumbnail();
      toast(`Accepted.${said(m.clashes)}`, "success");
      return;
    } catch (e) {
      if (!(e instanceof ApiFail && e.status === 409) || tries >= 2) throw e;
    }
  }
}

/** The owner declines a sent draft; whoever sent it takes it back. */
export async function declineSubmission(sid: string) {
  await api("POST", `courses/${state().id}/submissions/${sid}/decline`);
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
