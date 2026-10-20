// The open course (the saved document) with undo and redo, and the editor's own state.
import { create } from "zustand";
import type { CourseDoc, CourseItem, Hole, TeeLevel, ToolMode, AreaKind, LineKind, AmenityKind, TreeKind, PinPosition, DrawShape, StructureKind } from "../types";
import { createEmptyCourse } from "../lib/course";

const HISTORY = 120;

type CourseStore = {
  doc: CourseDoc;
  past: CourseDoc[];
  future: CourseDoc[];
  /** The document before the gesture now under way (dragging), for its single undo step. */
  gestureStart: CourseDoc | null;
  /** Changes the document. With history (the default) it is one undo step. */
  change: (fn: (doc: CourseDoc) => Partial<CourseDoc>, history?: boolean) => void;
  /** Ends a gesture of live changes as one undo step. */
  commit: () => void;
  undo: () => void;
  redo: () => void;
  /** Replaces the document (open, new, shared link): no undo back into the old one. */
  load: (doc: CourseDoc) => void;
};

export const useCourse = create<CourseStore>()((set, get) => ({
  doc: createEmptyCourse(),
  past: [],
  future: [],
  gestureStart: null,
  change: (fn, history = true) => {
    const { doc, past, gestureStart } = get();
    const next = { ...doc, ...fn(doc) };
    if (history) set({ doc: next, past: [...past.slice(-HISTORY + 1), gestureStart ?? doc], future: [], gestureStart: null });
    else set({ doc: next, gestureStart: gestureStart ?? doc });
  },
  commit: () => {
    const { gestureStart, past, doc } = get();
    if (!gestureStart) return;
    if (gestureStart === doc) { set({ gestureStart: null }); return; }
    set({ past: [...past.slice(-HISTORY + 1), gestureStart], future: [], gestureStart: null });
  },
  undo: () => {
    const { past, future, doc, gestureStart } = get();
    const base = gestureStart ?? doc;
    if (!past.length) return;
    set({ doc: past[past.length - 1], past: past.slice(0, -1), future: [base, ...future], gestureStart: null });
  },
  redo: () => {
    const { past, future, doc } = get();
    if (!future.length) return;
    set({ doc: future[0], future: future.slice(1), past: [...past, doc], gestureStart: null });
  },
  load: doc => set({ doc, past: [], future: [], gestureStart: null })
}));

export const getDoc = () => useCourse.getState().doc;
export const changeDoc = (fn: (doc: CourseDoc) => Partial<CourseDoc>, history = true) => useCourse.getState().change(fn, history);

// --- Item and hole edits (each one undo step unless `history` is false) ---

export const updateItem = (id: string, patch: Partial<CourseItem>, history = true) =>
  changeDoc(d => ({ items: d.items.map(i => (i.id === id ? ({ ...i, ...patch } as CourseItem) : i)) }), history);

export const addItems = (items: CourseItem[]) => changeDoc(d => ({ items: [...d.items, ...items] }));

export const updateHole = (id: string, patch: Partial<Hole>, history = true) =>
  changeDoc(d => ({ holes: d.holes.map(h => (h.id === id ? { ...h, ...patch } : h)) }), history);

/** Removes items; removing a hole's last tee or basket keeps the hole (it shows as unfinished). */
export const removeItems = (ids: string[]) => {
  const set = new Set(ids);
  changeDoc(d => ({ items: d.items.filter(i => !set.has(i.id) || i.locked) }));
};

/** Removes a hole with its tees and baskets; mandos and drop zones on it stay, unlinked. */
export const removeHole = (holeId: string) =>
  changeDoc(d => ({
    holes: d.holes.filter(h => h.id !== holeId),
    items: d.items
      .filter(i => !((i.type === "tee" || i.type === "basket") && i.holeId === holeId))
      .map(i => ("holeId" in i && i.holeId === holeId ? ({ ...i, holeId: undefined } as CourseItem) : i))
  }));

export const moveHole = (holeId: string, to: number) =>
  changeDoc(d => {
    const holes = [...d.holes];
    const from = holes.findIndex(h => h.id === holeId);
    if (from < 0) return {};
    const [h] = holes.splice(from, 1);
    holes.splice(Math.max(0, Math.min(holes.length, to)), 0, h);
    return { holes };
  });

// --- Editor state (not saved with the course) ---

export type Step = "site" | "holes" | "features" | "review" | "design" | "export";

type EditorStore = {
  step: Step;
  tool: ToolMode;
  selectedId: string | null;
  /** The hole being worked on (its parts get handles; new tees, baskets and mandos join it). */
  activeHoleId: string | null;
  view: "2d" | "3d";
  /** Options for the tools. */
  teeLevel: TeeLevel;
  pin: PinPosition;
  areaKind: AreaKind;
  lineKind: LineKind;
  /** What the Build tool draws: a bridge, boardwalk, stairs, wall, building, shelter or deck. */
  structureKind: StructureKind;
  /** How areas and lines are drawn (points, rectangle, circle, freehand). */
  drawShape: DrawShape;
  /** The mando tool places one post, or a gate of two (pass between them). */
  mandoKind: "single" | "gate";
  amenityKind: AmenityKind;
  treeKind: TreeKind;
  /** Looking from a tee down its hole (the hole's id), or flying over it. */
  teeView: string | null;
  flyover: boolean;
  /** Opened from a share link: look, don't touch (until "Make a copy"). */
  viewOnly: boolean;
  /** Points placed so far while drawing (for the hint). */
  drawPoints: number;
  /** The share dialog is open. */
  shareOpen: boolean;
  /** Map display: the satellite photo, contour lines, hill shading, ground texture up close. */
  photo: boolean;
  contours: boolean;
  shading: boolean;
  groundDetail: boolean;
  /** 3D grass blades: automatic (off without a graphics card), off, or low to high detail. */
  grass: "auto" | 0 | 1 | 2 | 3;
  /** Grass sways in the wind (from a tee and in flyovers). */
  wind: boolean;
  set: (patch: Partial<Omit<EditorStore, "set">>) => void;
};

const DISPLAY_KEY = "dg.display";
const DISPLAY = ["photo", "contours", "shading", "groundDetail", "grass", "wind"] as const;
const savedDisplay = (): Partial<Pick<EditorStore, (typeof DISPLAY)[number]>> => {
  try {
    return JSON.parse(localStorage.getItem(DISPLAY_KEY) ?? "{}");
  } catch {
    return {};
  }
};

export const useEditor = create<EditorStore>()(set => ({
  step: "site",
  tool: "select",
  selectedId: null,
  activeHoleId: null,
  view: "2d",
  teeLevel: "blue",
  pin: "A",
  areaKind: "ob",
  lineKind: "ob",
  structureKind: "bridge",
  drawShape: "points",
  mandoKind: "single",
  amenityKind: "bench",
  treeKind: "deciduous",
  teeView: null,
  flyover: false,
  viewOnly: false,
  drawPoints: 0,
  shareOpen: false,
  photo: true,
  contours: true,
  shading: true,
  groundDetail: true,
  grass: "auto",
  wind: true,
  ...(typeof localStorage !== "undefined" ? savedDisplay() : {}),
  set: patch => {
    set(patch);
    if (DISPLAY.some(k => k in patch)) {
      const s = useEditor.getState();
      try { localStorage.setItem(DISPLAY_KEY, JSON.stringify(Object.fromEntries(DISPLAY.map(k => [k, s[k]])))); } catch { /* private mode */ }
    }
  }
}));

export const editor = () => useEditor.getState();

// Read access for the automated tests and debugging in the browser console.
if (typeof window !== "undefined") {
  (window as any).__dgCourse = () => useCourse.getState().doc;
  (window as any).__dgEditor = () => useEditor.getState();
  (window as any).__dgHistory = () => ({ past: useCourse.getState().past.length, future: useCourse.getState().future.length });
}
