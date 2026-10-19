// Keeping courses: the autosave, the library of earlier courses, course files, and opening a
// shared link (the photo and elevation are downloaded again for its site).
import { generateId } from "../constants";
import { createEmptyCourse, normalizeCourse } from "../lib/course";
import { importSite } from "../lib/importSite";
import { courseInHash, decodeCourse } from "../lib/share";
import { AUTOSAVE_KEY, idbGet, idbSet, listPlans, loadPlan, removePlan, storePlan, type PlanMeta } from "../lib/storage";
import type { CourseDoc } from "../types";
import { getDoc, useCourse, useEditor } from "./course";
import { toast } from "./toast";

export const isEmpty = (doc: CourseDoc) => !doc.holes.length && !doc.items.length && !doc.background;

const metaOf = (doc: CourseDoc): PlanMeta => ({ id: doc.id ?? generateId(), name: doc.name || "Untitled course", updatedAt: Date.now(), holes: doc.holes.length });

/** Puts the open course in the library (unless it is empty or only being looked at). */
export const archiveCurrent = async () => {
  const doc = getDoc();
  if (isEmpty(doc) || useEditor.getState().viewOnly) return null;
  const meta = metaOf(doc);
  await storePlan(meta, { ...doc, id: meta.id });
  return meta;
};

const show = (doc: CourseDoc, opts: { viewOnly?: boolean } = {}) => {
  // View-only first: the autosave must never see a shared course as yours
  useEditor.getState().set({ selectedId: null, activeHoleId: null, tool: "select", teeView: null, flyover: false, viewOnly: !!opts.viewOnly, step: doc.holes.length ? "holes" : "site" });
  useCourse.getState().load(doc);
};

export const newCourse = async () => {
  const before = getDoc();
  const meta = await archiveCurrent();
  show(createEmptyCourse());
  if (meta) {
    toast(`Started a new course. "${meta.name}" is under Open → Recent courses.`, "success", false, {
      label: "Undo",
      run: () => { void removePlan(meta.id); show(before); }
    });
  }
};

export const openRecent = async (id: string) => {
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

export const recentCourses = () => listPlans();
export const deleteRecent = async (id: string) => {
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
    await archiveCurrent();
    show(normalizeCourse({ ...raw, id: generateId() }));
    toast(`Opened "${raw.name ?? file.name}".`, "success");
  } catch {
    toast("That file isn't a course file (.dgcourse.json).", "error");
  }
};

// --- Autosave ---

let saveTimer = 0;
export const startAutosave = () =>
  useCourse.subscribe((state, prev) => {
    if (state.doc === prev.doc || useEditor.getState().viewOnly) return;
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      if (useEditor.getState().viewOnly) return;
      const doc = getDoc();
      void idbSet(AUTOSAVE_KEY, doc.id ? doc : { ...doc, id: generateId() }).catch(err => console.warn("Autosave failed", err));
    }, 600);
  });

export const restoreAutosave = async () => {
  try {
    const data = await idbGet(AUTOSAVE_KEY);
    if (data && Array.isArray(data.holes)) {
      show(normalizeCourse(data));
      return true;
    }
  } catch (err) {
    console.warn("Couldn't read the autosave", err);
  }
  return false;
};

// --- Shared links ---

/** Opens the course in this page's link, if there is one. */
export const openSharedLink = async (hash = location.hash) => {
  const packed = courseInHash(hash);
  if (!packed) return false;
  try {
    const doc = await decodeCourse(packed);
    show({ ...doc, id: generateId() }, { viewOnly: true });
    useEditor.getState().set({ step: "review" });
    void refetchSite();
    return true;
  } catch (err) {
    toast(err instanceof Error ? err.message : "That link couldn't be opened.", "error");
    return false;
  }
};

/** A shared course arrives without its photo and elevation: download them for its site. */
export const refetchSite = async () => {
  const doc = getDoc();
  const loc = doc.site.location;
  if (!loc || !doc.site.bounds) return;
  try {
    const site = await importSite(
      { center: loc, widthFt: doc.canvas.width, heightFt: doc.canvas.height },
      { imagery: doc.site.imagerySource?.startsWith("OpenStreetMap") ? "streets" : "satellite", trees: false, osm: false, onStatus: () => {} }
    );
    // Only if the same course is still open
    if (getDoc().id !== doc.id) return;
    useCourse.setState(s => ({ doc: { ...s.doc, background: site.background, terrainHeights: site.terrainHeights, gridSize: site.gridSize } }));
  } catch (err) {
    console.warn("Couldn't download the shared course's map", err);
    toast("The map photo and elevation couldn't be downloaded; the course is shown on plain ground.", "info");
  }
};

/** Keeps a shared course as your own: it becomes the open course, autosaved and editable. */
export const makeCopy = async () => {
  const shared = getDoc();
  useEditor.getState().set({ viewOnly: false });
  history.replaceState(null, "", location.pathname + location.search);
  // Your own course from before goes to the library
  const own = await idbGet(AUTOSAVE_KEY).catch(() => null);
  if (own && Array.isArray(own.holes) && (own.holes.length || own.items?.length)) {
    const meta: PlanMeta = { id: own.id ?? generateId(), name: own.name || "Untitled course", updatedAt: Date.now(), holes: own.holes.length };
    await storePlan(meta, { ...own, id: meta.id });
  }
  const copy = { ...shared, id: generateId(), name: shared.name.endsWith("(copy)") ? shared.name : `${shared.name} (copy)` };
  useCourse.getState().load(copy);
  await idbSet(AUTOSAVE_KEY, copy);
  useEditor.getState().set({ step: "holes" });
  toast("This copy is yours to edit. Your earlier course is under Open → Recent courses.", "success");
};
