// Courses kept on the HyzerLab server: the open course saves itself there (editors and owners),
// the File menu lists the courses shared with you, and a save made over someone else's newer one
// is stopped and asked about.
import { create } from "zustand";
import { createEmptyCourse, normalizeCourse } from "../lib/course";
import { safeDoc } from "../lib/safeDoc";
import type { PlanMeta } from "../lib/storage";
import { getDoc, useCourse } from "../state/course";
import { isEmpty, show } from "../state/files";
import { toast } from "../state/toast";
import type { CourseDoc } from "../types";
import { api, ApiFail, useAuth } from "./api";

export type Role = "owner" | "editor" | "viewer";
export type ServerPlan = PlanMeta & { role: Role; updatedBy: string | null };

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
    if (!state().id) {
      const r = await api<{ id: string; version: number; role: Role }>("POST", "courses", { doc: body });
      set({ id: r.id, version: r.version, role: r.role });
      sentBackground = null;
      remember(r.id);
    } else {
      const r = await api<{ version: number }>("PUT", `courses/${state().id}`, { doc: body, version: state().version });
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

export const startServerAutosave = () =>
  useCourse.subscribe((s, prev) => {
    if (s.doc === prev.doc || s.doc === opened || !canSave()) return;
    if (state().status === "saved") set({ status: "unsaved" });
    window.clearTimeout(timer);
    timer = window.setTimeout(() => void saveNow(), 1500);
  });

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
  show(doc);
  remember(null);
}

export const newServerCourse = () => startUnsaved(createEmptyCourse());

export async function restoreServer() {
  let last: string | null = null;
  try { last = localStorage.getItem(lastKey()); } catch { /* private window */ }
  if (last && (await openServerCourse(last, true))) return true;
  await newServerCourse();
  return false;
}

export const listServerCourses = async (): Promise<ServerPlan[]> =>
  (await api<{ id: string; name: string; holes: number; updatedAt: string; role: Role; updatedBy: string | null }[]>("GET", "courses"))
    .map(c => ({ id: c.id, name: c.name, holes: c.holes, updatedAt: new Date(c.updatedAt).getTime(), role: c.role, updatedBy: c.updatedBy }));

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
