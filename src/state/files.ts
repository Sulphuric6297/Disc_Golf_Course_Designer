// Keeping courses: the autosave, the library of earlier courses, and course files. On a
// HyzerLab server (SERVER) the courses are kept there instead (src/auth/courses.ts).
import { generateId } from "../constants";
import { SERVER } from "../auth/api";
import { SITE_TOKEN } from "../auth/PublicSite";
import { listServerCourses, newServerCourse, openServerCourse, removeServerCourse, restoreServer, startServerAutosave, startUnsaved } from "../auth/courses";
import { createEmptyCourse, normalizeCourse } from "../lib/course";
import { EXAMPLE_ID, fetchExample, startsBlank } from "../lib/example";
import { AUTOSAVE_KEY, idbGet, idbSet, listPlans, loadPlan, removePlan, storePlan, type PlanMeta } from "../lib/storage";
import type { CourseDoc } from "../types";
import { getDoc, useCourse, useEditor } from "./course";
import { toast } from "./toast";

export const isEmpty = (doc: CourseDoc) => !doc.holes.length && !doc.items.length && !doc.background;

const metaOf = (doc: CourseDoc): PlanMeta => ({ id: doc.id ?? generateId(), name: doc.name || "Untitled course", updatedAt: Date.now(), holes: doc.holes.length });

/** Puts the open course in the library (unless it is empty). */
export const archiveCurrent = async () => {
  const doc = getDoc();
  if (isEmpty(doc)) return null;
  const meta = metaOf(doc);
  await storePlan(meta, { ...doc, id: meta.id });
  return meta;
};

/** The course under a new id, looking the same. */
const renamed = (doc: CourseDoc): CourseDoc => ({ ...doc, seed: doc.seed ?? doc.id, id: generateId() });

export const show = (doc: CourseDoc) => {
  useEditor.getState().set({ selectedId: null, activeHoleId: null, tool: "select", teeView: null, flyover: false, step: doc.holes.length ? "design" : "site" });
  useCourse.getState().load(doc);
};

export const newCourse = async () => {
  if (SERVER) return newServerCourse();
  const before = getDoc();
  const meta = await archiveCurrent();
  show(createEmptyCourse());
  if (meta) {
    toast("Started a new course.", "success", false, {
      label: "Undo",
      run: () => { void removePlan(meta.id); show(before); }
    });
  }
};

export const openRecent = async (id: string) => {
  if (SERVER) { await openServerCourse(id); return; }
  const data = await loadPlan(id);
  if (!data) {
    toast("That course couldn't be found.", "error");
    return;
  }
  const current = getDoc();
  if (current.id !== id) await archiveCurrent();
  await removePlan(id);
  show(normalizeCourse({ ...data, id }));
};

/** The example course: the copy kept in this browser if there is one (changes and all), or a
 * fresh one. */
export const openExample = async () => {
  if (getDoc().id === EXAMPLE_ID) return;
  if ((await listPlans()).some(p => p.id === EXAMPLE_ID)) return openRecent(EXAMPLE_ID);
  const doc = await fetchExample();
  await archiveCurrent();
  show(doc);
};
/** The example as it first was, in place of the copy kept here. */
export const restartExample = async () => {
  const doc = await fetchExample();
  if (getDoc().id !== EXAMPLE_ID) {
    await removePlan(EXAMPLE_ID);
    await archiveCurrent();
  }
  show(doc);
  toast("The example is back as it was.", "success");
};

export const recentCourses = (): Promise<PlanMeta[]> => (SERVER ? listServerCourses() : listPlans());
export const deleteRecent = async (id: string) => {
  if (SERVER) return removeServerCourse(id);
  const data = await loadPlan(id);
  const list = await listPlans();
  const meta = list.find(p => p.id === id);
  await removePlan(id);
  if (data && meta) toast(`Deleted "${meta.name}".`, "info", false, { label: "Undo", run: () => void storePlan(meta, data) });
};

const slug = (name: string) => (name || "course").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "course";

export const download = (blob: Blob, name: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
};

export const fileName = (doc: CourseDoc, suffix: string) => `${slug(doc.name)}${suffix}`;

/** The whole course (photo and terrain included) as a file. */
export const saveCourseFile = () => {
  const doc = getDoc();
  download(new Blob([JSON.stringify(doc)], { type: "application/json" }), fileName(doc, ".dgcourse.json"));
};

export const openCourseFile = async (file: File) => {
  try {
    const raw = JSON.parse(await file.text());
    if (!raw || !Array.isArray(raw.holes)) throw new Error("not a course");
    if (SERVER) await startUnsaved(renamed(normalizeCourse(raw)));
    else {
      await archiveCurrent();
      show(renamed(normalizeCourse(raw)));
    }
    toast(`Opened "${raw.name ?? file.name}".`, "success");
  } catch {
    toast("That file isn't a course file (.dgcourse.json).", "error");
  }
};

// --- Autosave ---

let saveTimer = 0;
export const startAutosave = () =>
  SERVER ? startServerAutosave() : useCourse.subscribe((state, prev) => {
    if (state.doc === prev.doc) return;
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      const doc = getDoc();
      void idbSet(AUTOSAVE_KEY, doc.id ? doc : { ...doc, id: generateId() }).catch(err => console.warn("Autosave failed", err));
    }, 600);
  });

export const restoreAutosave = async () => {
  // (a public course page: the course it shows is open already)
  if (SERVER && SITE_TOKEN) return true;
  if (SERVER) return restoreServer();
  try {
    const data = await idbGet(AUTOSAVE_KEY);
    if (data && Array.isArray(data.holes)) {
      show(normalizeCourse(data));
      return true;
    }
  } catch (err) {
    console.warn("Couldn't read the autosave", err);
  }
  // (nothing here yet: a new visitor to the demo gets the example course to look round)
  if (!SERVER && !startsBlank()) {
    try {
      show(await fetchExample());
      return true;
    } catch (err) {
      console.warn("Couldn't load the example course", err);
    }
  }
  return false;
};
