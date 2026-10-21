// Courses kept on the HyzerLab server: the open course saves itself there (editors and owners),
// the File menu lists the courses shared with you, and a save made over someone else's newer one
// is stopped and asked about.
import { create } from "zustand";
import { generateId } from "../constants";
import { createEmptyCourse, normalizeCourse } from "../lib/course";
import { courseStats, courseTotals, playsOf } from "../lib/holeStats";
import { safeDoc } from "../lib/safeDoc";
import type { PlanMeta } from "../lib/storage";
import { getDoc, useCourse, useEditor } from "../state/course";
import { isEmpty, show } from "../state/files";
import { toast } from "../state/toast";
import type { CourseDoc } from "../types";
import { api, ApiFail, useAuth } from "./api";

export type Role = "owner" | "editor" | "viewer";
export interface Summary { par: number; length: number; units: "ft" | "m"; canvas: { width: number; height: number }; lines: [number, number][][] }
export type ServerPlan = PlanMeta & { role: Role; updatedBy: string | null; owner: string | null; members: number; summary: Partial<Summary> };

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

export const useServerCourse = create<{ id: string | null; version: number; role: Role | null; status: Status; conflict: string }>(() => ({
  id: null, version: 0, role: null, status: "saved", conflict: ""
}));
const state = () => useServerCourse.getState();
const set = (s: Partial<ReturnType<typeof state>>) => useServerCourse.setState(s);

// The document as opened (no need to save it back), and the photo the server has
let opened: CourseDoc | null = null;
let sentBackground: string | null = null;
let saving: Promise<void> | null = null;
let again = false;
let timer = 0;

const lastKey = () => `hyzerlab:last:${useAuth.getState().session?.user?.id ?? ""}`;
const remember = (id: string | null) => { try { if (id) localStorage.setItem(lastKey(), id); else localStorage.removeItem(lastKey()); } catch { /* private window */ } };

const canSave = () => state().role !== "viewer" && state().status !== "conflict";

async function save() {
  const doc = getDoc();
  if (doc === opened || !canSave()) return;
  if (!state().id && isEmpty(doc)) return;
  set({ status: "saving" });
  try {
    const body = { ...doc, background: null };
    const summary = summaryOf(doc);
    if (!state().id) {
      const r = await api<{ id: string; version: number; role: Role }>("POST", "courses", { doc: body, summary });
      set({ id: r.id, version: r.version, role: r.role });
      sentBackground = null;
      remember(r.id);
    } else {
      const r = await api<{ version: number }>("PUT", `courses/${state().id}`, { doc: body, version: state().version, summary });
      set({ version: r.version });
    }
    if (doc.background !== sentBackground) {
      await api("PUT", `courses/${state().id}/background`, { data: doc.background });
      sentBackground = doc.background;
    }
    set({ status: getDoc() === doc ? "saved" : "unsaved" });
  } catch (e) {
    if (e instanceof ApiFail && e.status === 409) set({ status: "conflict", conflict: e.message });
    else { set({ status: "error" }); console.warn("Save failed", e); }
  }
}

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

/** Opens a course from the server. */
export async function openServerCourse(id: string, quiet = false) {
  if (state().id && state().id !== id) await saveNow();
  try {
    const c = await api<{ id: string; version: number; role: Role; doc: CourseDoc; hasBackground: boolean }>("GET", `courses/${id}`);
    const background = c.hasBackground ? (await api<{ data: string | null }>("GET", `courses/${id}/background`)).data : null;
    const doc = normalizeCourse(safeDoc({ ...c.doc, background }));
    set({ id, version: c.version, role: c.role, status: "saved", conflict: "" });
    sentBackground = doc.background;
    opened = doc;
    useCourse.setState({ readOnly: c.role === "viewer" });
    show(doc);
    remember(id);
    return true;
  } catch (e) {
    if (!quiet) toast(e instanceof Error ? e.message : "That course couldn't be opened.", "error");
    return false;
  }
}

/** A course not on the server yet: saved there (yours) once something is on it. */
export async function startUnsaved(doc: CourseDoc) {
  if (state().id) await saveNow();
  set({ id: null, version: 0, role: "owner", status: "saved", conflict: "" });
  sentBackground = null;
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

/** After a conflict: their version, or yours saved over it. */
export async function reloadTheirs() {
  const id = state().id;
  set({ status: "saved", conflict: "" });
  if (id) await openServerCourse(id);
}
export async function keepMine() {
  const id = state().id;
  if (!id) return;
  const c = await api<{ version: number }>("GET", `courses/${id}`);
  set({ version: c.version, status: "unsaved", conflict: "" });
  opened = null;
  await saveNow();
}
