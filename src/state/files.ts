// Keeping courses: the autosave, the library of earlier courses, and course files. On a
// HyzerLab server (SERVER) the courses are kept there instead (src/auth/courses.ts).
import { generateId } from "../constants";
import { SERVER } from "../auth/api";
import { SITE_TOKEN } from "../auth/PublicSite";
import { listServerCourses, newServerCourse, openServerCourse, removeServerCourse, restoreServer, startServerAutosave, startUnsaved, type Summary } from "../auth/courses";
import { createEmptyCourse, normalizeCourse } from "../lib/course";
import { courseStats, courseTotals } from "../lib/holeStats";
import { EXAMPLE_ID, fetchExample, startsBlank } from "../lib/example";
import { AUTOSAVE_KEY, idbGet, idbSet, listPlans, loadPlan, removePlan, storePlan, type PlanMeta } from "../lib/storage";
import type { CourseDoc } from "../types";
import { getDoc, useCourse, useEditor } from "./course";
import { toast } from "./toast";

export const isEmpty = (doc: CourseDoc) => !doc.holes.length && !doc.items.length && !doc.background;

/** A course kept here, as Courses lists it: with its totals and each hole's throw line, for its
 * card (kept before these, a course has just its name and holes until it's opened again), and its
 * photo, small, with the plan's size (the lines drawn over it in place). */
export type KeptMeta = PlanMeta & { summary?: Partial<Summary>; thumb?: string; canvas?: { width: number; height: number } };

/** A course's photo, small, for its card (none without a photo, or when it can't be drawn). */
export const cardThumb = async (doc: CourseDoc): Promise<string | undefined> => {
  if (!doc.background) return undefined;
  try {
    const img = new Image();
    img.src = doc.background;
    await img.decode();
    const k = Math.min(1, 360 / Math.max(img.width, img.height));
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(img.width * k));
    c.height = Math.max(1, Math.round(img.height * k));
    const ctx = c.getContext("2d");
    if (!ctx) return undefined;
    ctx.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.72);
  } catch {
    return undefined;
  }
};

/** What a course's card shows of it: its par and length, and its holes' lines for a small map. */
export const summaryOf = (doc: CourseDoc): Partial<Summary> => {
  const stats = courseStats(doc);
  const t = courseTotals(doc, stats);
  // (long lines thinned to 64 points: plenty for a picture)
  const thin = (l: { x: number; y: number }[]) => l.filter((_, i) => l.length <= 64 || i % Math.ceil(l.length / 63) === 0 || i === l.length - 1).slice(0, 64);
  return { par: t.par, length: Math.round(t.length), units: doc.units, lines: stats.filter(s => s.complete).slice(0, 200).map(s => thin(s.line).map(p => [Math.round(p.x), Math.round(p.y)] as [number, number])) };
};

const metaOf = (doc: CourseDoc): KeptMeta => ({ id: doc.id ?? generateId(), name: doc.name || "Untitled course", updatedAt: Date.now(), holes: doc.holes.length, summary: summaryOf(doc) });

// (whether the example kept here has been changed since it was fresh: its card says "your copy"
// and offers to start it over only then)
const EXAMPLE_CHANGED_KEY = "hyzerlab-example-changed";
export const exampleChanged = () => {
  try { return localStorage.getItem(EXAMPLE_CHANGED_KEY) === "1"; } catch { return false; }
};
const markExample = (changed: boolean) => {
  try { if (changed) localStorage.setItem(EXAMPLE_CHANGED_KEY, "1"); else localStorage.removeItem(EXAMPLE_CHANGED_KEY); } catch { /* (private window: kept for now only) */ }
};

/** Puts the open course in the library (unless it is empty). */
export const archiveCurrent = async () => {
  const doc = getDoc();
  if (isEmpty(doc)) return null;
  // (the example's card has a picture of its own)
  const thumb = doc.id === EXAMPLE_ID ? undefined : await cardThumb(doc);
  const meta: KeptMeta = { ...metaOf(doc), ...(thumb ? { thumb, canvas: { ...doc.canvas } } : {}) };
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
  markExample(false);
};
/** The example as it first was, in place of the copy kept here (Undo puts the copy back). */
export const restartExample = async () => {
  const doc = await fetchExample();
  const open = getDoc().id === EXAMPLE_ID;
  const kept = open ? getDoc() : ((await loadPlan(EXAMPLE_ID)) as CourseDoc | undefined);
  const was = exampleChanged();
  if (!open) {
    await removePlan(EXAMPLE_ID);
    await archiveCurrent();
  }
  show(doc);
  markExample(false);
  const undo = kept && {
    label: "Undo",
    run: () => {
      const back = normalizeCourse({ ...kept, id: EXAMPLE_ID });
      // (still open: back in its place; something else opened since: back in the library)
      if (getDoc().id === EXAMPLE_ID) show(back);
      else void storePlan(metaOf(back), back);
      markExample(was);
    }
  };
  toast("The example is back as it was.", "success", false, undo || undefined, 10000);
};

export const recentCourses = (): Promise<PlanMeta[]> => (SERVER ? listServerCourses() : listPlans());
/** Takes a course out of the library; `onUndo` once Undo has put it back (a list to refresh). */
export const deleteRecent = async (id: string, onUndo?: () => void) => {
  if (SERVER) return removeServerCourse(id);
  const data = await loadPlan(id);
  const list = await listPlans();
  const meta = list.find(p => p.id === id);
  await removePlan(id);
  if (data && meta) toast(`Deleted "${meta.name}".`, "info", false, { label: "Undo", run: () => void storePlan(meta, data).then(onUndo) });
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

/** Opens a course file; false when it isn't one (said in a toast). */
export const openCourseFile = async (file: File): Promise<boolean> => {
  try {
    const raw = JSON.parse(await file.text());
    if (!raw || !Array.isArray(raw.holes)) throw new Error("not a course");
    if (SERVER) await startUnsaved(renamed(normalizeCourse(raw)));
    else {
      await archiveCurrent();
      show(renamed(normalizeCourse(raw)));
    }
    toast(`Opened "${raw.name ?? file.name}".`, "success");
    return true;
  } catch {
    toast("That file isn't a course file (.dgcourse.json).", "error");
    return false;
  }
};

// --- Autosave ---

let saveTimer = 0;
const saveLocal = () => {
  saveTimer = 0;
  const doc = getDoc();
  void idbSet(AUTOSAVE_KEY, doc.id ? doc : { ...doc, id: generateId() }).catch(err => console.warn("Autosave failed", err));
};
export const startAutosave = () => {
  if (SERVER) return startServerAutosave();
  // (a change still waiting to be kept when the page is closed or reloaded: kept now, not lost)
  const now = () => { if (saveTimer) { window.clearTimeout(saveTimer); saveLocal(); } };
  window.addEventListener("pagehide", now);
  window.addEventListener("beforeunload", now);
  const stop = useCourse.subscribe((state, prev) => {
    // (a change to the example, as an undo step: it's someone's own copy now)
    if (state.past !== prev.past && state.past.length && state.doc.id === EXAMPLE_ID && prev.doc.id === EXAMPLE_ID) markExample(true);
    if (state.doc === prev.doc) return;
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(saveLocal, 600);
  });
  return () => { stop(); window.removeEventListener("pagehide", now); window.removeEventListener("beforeunload", now); };
};

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
      markExample(false);
      return true;
    } catch (err) {
      console.warn("Couldn't load the example course", err);
    }
  }
  return false;
};
