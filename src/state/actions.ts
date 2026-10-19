// What the tools and menus do to the course.
import { PIN_POSITIONS, TEE_ORDER, generateId } from "../constants";
import {
  createAmenity, createArea, createBasket, createDropZone, createLabel, createLine, createMando, createTee, createTree,
  holeBaskets, holeTees, itemHoleId, newHole, teeFor
} from "../lib/course";
import { centroid, nearestOnSegment } from "../lib/geom";
import { holeStats } from "../lib/holeStats";
import type { CourseItem, Hole, P, TeeLevel, ToolMode } from "../types";
import { changeDoc, editor, getDoc, removeHole, removeItems, useEditor } from "./course";
import { toast } from "./toast";

/** Selects an item or a hole; selecting a hole's part makes that hole the one being worked on. */
export const select = (id: string | null) => {
  const doc = getDoc();
  const hole = doc.holes.find(h => h.id === id);
  const item = doc.items.find(i => i.id === id);
  const holeId = hole?.id ?? itemHoleId(item);
  useEditor.getState().set({ selectedId: id, ...(holeId ? { activeHoleId: holeId } : {}) });
};

/** The hole the new tee, basket or mando goes with: the one being worked on. */
const workingHole = (): Hole | null => {
  const doc = getDoc();
  const id = editor().activeHoleId;
  return doc.holes.find(h => h.id === id) ?? null;
};

/** The direction of a hole's line near a point (degrees), for mandos placed on it. */
const lineAngleNear = (hole: Hole, p: P) => {
  const s = holeStats(getDoc(), hole);
  let best = { d: Infinity, angle: 0 };
  for (let i = 1; i < s.line.length; i++) {
    const n = nearestOnSegment(p, s.line[i - 1], s.line[i]);
    if (n.distance < best.d) best = { d: n.distance, angle: (Math.atan2(s.line[i].y - s.line[i - 1].y, s.line[i].x - s.line[i - 1].x) * 180) / Math.PI };
  }
  return best.angle;
};

/** A new hole from its tee and basket spots (added after the hole being worked on, or at the end). */
export const addHole = (tee: P, basket: P, level: TeeLevel = editor().teeLevel) => {
  const hole = newHole();
  const t = createTee(hole.id, tee, level);
  const b = createBasket(hole.id, basket, "A");
  changeDoc(d => {
    const at = d.holes.findIndex(h => h.id === editor().activeHoleId);
    const holes = [...d.holes];
    holes.splice(at >= 0 && at < holes.length - 1 ? at + 1 : holes.length, 0, hole);
    return { holes, items: [...d.items, t, b] };
  });
  useEditor.getState().set({ selectedId: hole.id, activeHoleId: hole.id });
  return hole;
};

/** A click with a placing tool. */
export const placeAt = (mode: ToolMode, p: P) => {
  const ed = editor();
  const hole = workingHole();
  let item: CourseItem | null = null;
  if (mode === "add-tee") {
    if (!hole) {
      toast("Pick a hole first (or use the Hole tool to make one), then add another tee to it.", "info");
      return;
    }
    const taken = new Set(holeTees(getDoc(), hole.id).map(t => t.level));
    const level = taken.has(ed.teeLevel) ? TEE_ORDER.find(l => !taken.has(l)) ?? ed.teeLevel : ed.teeLevel;
    item = createTee(hole.id, p, level);
  } else if (mode === "add-basket") {
    if (!hole) {
      toast("Pick a hole first (or use the Hole tool to make one), then add another pin position to it.", "info");
      return;
    }
    const taken = new Set(holeBaskets(getDoc(), hole.id).map(b => b.position));
    const position = PIN_POSITIONS.find(x => !taken.has(x));
    if (!position) {
      toast("This hole already has pins A to D.", "info");
      return;
    }
    item = createBasket(hole.id, p, position);
  } else if (mode === "add-mando") item = createMando(p, hole?.id, hole ? lineAngleNear(hole, p) : 0);
  else if (mode === "add-dropzone") item = createDropZone(p, hole?.id);
  else if (mode === "add-tree") {
    const kind = ed.treeKind;
    item = createTree(p, kind === "conifer" ? { treeType: kind, radius: 10, height: 50, color: "#2f5d34" } : kind === "bush" ? { treeType: kind, radius: 5, height: 6 } : { treeType: kind });
  } else if (mode === "add-amenity") item = createAmenity(p, ed.amenityKind);
  else if (mode === "add-label") item = createLabel(p, "Label");
  if (!item) return;
  changeDoc(d => ({ items: [...d.items, item!] }));
  // Trees and benches go down one after another; the rest are picked to edit
  if (mode !== "add-tree") select(item.id);
};

/** An area or line drawn with the drawing tools. */
export const addDrawn = (kind: "area" | "line", points: P[]) => {
  const ed = editor();
  const item = kind === "area" ? createArea(ed.areaKind, points) : createLine(ed.lineKind, points);
  changeDoc(d => ({ items: [...d.items, item] }));
  select(item.id);
};

export const deleteSelection = () => {
  const { selectedId } = editor();
  if (!selectedId) return;
  const doc = getDoc();
  const hole = doc.holes.find(h => h.id === selectedId);
  if (hole) {
    const n = doc.holes.indexOf(hole) + 1;
    removeHole(hole.id);
    toast(`Deleted hole ${n}.`, "info", true);
  } else {
    const item = doc.items.find(i => i.id === selectedId);
    if (!item) return;
    if (item.locked) {
      toast("It's locked. Unlock it first.", "info");
      return;
    }
    removeItems([selectedId]);
    toast("Deleted.", "info", true);
  }
  useEditor.getState().set({ selectedId: null });
};

/** A copy of the selection, a little to the side (a hole copies with its tees and baskets). */
export const duplicateSelection = () => {
  const { selectedId } = editor();
  const doc = getDoc();
  const off = 30;
  const hole = doc.holes.find(h => h.id === selectedId);
  if (hole) {
    const copy: Hole = { ...hole, id: `hole-${generateId()}`, doglegs: hole.doglegs.map(p => ({ x: p.x + off, y: p.y + off })) };
    const parts = doc.items.filter(i => (i.type === "tee" || i.type === "basket") && i.holeId === hole.id).map(i => ({ ...i, id: generateId(), holeId: copy.id, x: i.x + off, y: i.y + off }) as CourseItem);
    changeDoc(d => {
      const holes = [...d.holes];
      holes.splice(d.holes.indexOf(hole) + 1, 0, copy);
      return { holes, items: [...d.items, ...parts] };
    });
    select(copy.id);
    return;
  }
  const item = doc.items.find(i => i.id === selectedId);
  if (!item) return;
  const copy = { ...item, id: generateId(), x: item.x + off, y: item.y + off, locked: false } as CourseItem;
  if (copy.type === "area" || copy.type === "line") copy.points = copy.points.map(p => ({ x: p.x + off, y: p.y + off }));
  if (copy.type === "tee" || copy.type === "basket") {
    // Another tee or pin for the same hole (a free color or letter)
    if (copy.type === "tee") {
      const taken = new Set(holeTees(doc, copy.holeId).map(t => t.level));
      copy.level = TEE_ORDER.find(l => !taken.has(l)) ?? copy.level;
    } else {
      const taken = new Set(holeBaskets(doc, copy.holeId).map(b => b.position));
      const free = PIN_POSITIONS.find(x => !taken.has(x));
      if (!free) return;
      copy.position = free;
    }
  }
  changeDoc(d => ({ items: [...d.items, copy] }));
  select(copy.id);
};

/** Arrow keys: move the selection by `step` feet. */
export const nudgeSelection = (dx: number, dy: number) => {
  const { selectedId } = editor();
  const doc = getDoc();
  const item = doc.items.find(i => i.id === selectedId);
  if (!item || item.locked) return;
  const patch: Partial<CourseItem> = { x: item.x + dx, y: item.y + dy };
  if (item.type === "area" || item.type === "line") (patch as { points: P[] }).points = item.points.map(p => ({ x: p.x + dx, y: p.y + dy }));
  changeDoc(d => ({ items: d.items.map(i => (i.id === item.id ? ({ ...i, ...patch } as CourseItem) : i)) }));
};

/** Swaps a hole's tee to another color (or another tee to its place). */
export const setTeeLevel = (teeId: string, level: TeeLevel) => {
  const doc = getDoc();
  const tee = doc.items.find(i => i.id === teeId);
  if (!tee || tee.type !== "tee") return;
  const other = holeTees(doc, tee.holeId).find(t => t.level === level && t.id !== teeId);
  changeDoc(d => ({ items: d.items.map(i => (i.id === teeId ? { ...i, level } as CourseItem : other && i.id === other.id ? { ...i, level: tee.level } as CourseItem : i)) }));
};

/** The tee a hole is played from in the current layout. */
export const layoutTee = (holeId: string) => {
  const doc = getDoc();
  const layout = doc.layouts.find(l => l.id === doc.activeLayout);
  return teeFor(doc, holeId, layout?.tee);
};

/** Recomputes an area's middle after its points changed (kept in step for labels and picking). */
export const withCentroid = <T extends { points: P[] }>(item: T): T & P => ({ ...item, ...centroid(item.points) });

// For the automated tests and screenshots: build a course quickly without clicking every spot.
if (typeof window !== "undefined") (window as any).__dgActions = { addHole, addDrawn, placeAt, select };
