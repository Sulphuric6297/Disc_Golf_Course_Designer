// The printouts laid out by hand, all edited one way: the course map, the tee signs, the hole
// pages and the scorecard. Each is a "target" here, with the same actions for what's picked on
// its page (its look's own pieces, and the text, pictures, QR codes and sponsors added to it):
// what it is and how it's styled, move, size, restyle, hide, delete, duplicate, reset. The
// editor (MapDesigner), its toolbar and its panel only talk to these.
import { generateId } from "../constants";
import { holeLabel } from "../lib/course";
import { holePageOf } from "../lib/holePage";
import { sizedPlace } from "../lib/pieces";
import { signOf } from "../lib/teeSign";
import { changeDoc, getDoc, useEditor } from "../state/course";
import type { CourseDoc, PiecePlace, PrintExtra, SignPart } from "../types";
import { duplicateDesignSel, elementOf, elementLabel, isShown, moveDesignEl, patchImage, patchLabel, patchPage, patchText, removeDesignSel, setShown, sizeDesignEl } from "./PageEditor";

export type TargetKey = "map" | "sign" | "page" | "card";
type Box = { x: number; y: number; w: number; h: number };

/** Which printout the Design step shows. */
export const targetKey = (): TargetKey => {
  const t = useEditor.getState().designTab;
  return t === "sign" ? "sign" : t === "page" ? "page" : t === "scorecard" ? "card" : "map";
};

/** What's picked, as the toolbar shows it: what it is, and which of its settings it has (each
 * unset where it has none). */
export type Picked = {
  label: string;
  kind: "piece" | "text" | "image" | "qr" | "sponsor" | "label";
  /** Its size: times its own, or (`pt`) the letters' size. */
  scale?: number;
  pt?: number;
  font?: string;
  color?: string;
  fill?: string;
  bold?: boolean;
  align?: "start" | "middle" | "end";
  text?: string;
  url?: string;
  opacity?: number;
  /** It can have a font, lettering color, panel color (each settable even when unset). */
  has: { font: boolean; color: boolean; fill: boolean; bold: boolean; align: boolean; text: boolean; url: boolean; opacity: boolean; size: boolean };
  /** Delete takes it away (what was added) rather than hiding it. */
  removable: boolean;
  duplicable: boolean;
  /** It's been moved, sized or restyled (Reset puts it back). */
  changed: boolean;
};
export type Layer = { id: string; label: string; shown: boolean; changed: boolean; added: boolean };
export type Patch = Partial<Pick<Picked, "font" | "color" | "fill" | "bold" | "align" | "text" | "url" | "opacity">>;

const r4 = (v: number) => Math.round(v * 10000) / 10000;
const none = { font: false, color: false, fill: false, bold: false, align: false, text: false, url: false, opacity: false, size: true };

// ---------------------------------------------------------------- the hole shown, and "this hole only"

/** The hole whose sign or page the Design step shows. */
export const shownHole = (doc: CourseDoc) => {
  const { designHole, activeHoleId } = useEditor.getState();
  return [designHole, activeHoleId].find(id => id && doc.holes.some(h => h.id === id)) ?? doc.holes[0]?.id ?? null;
};
const thisHoleOnly = () => useEditor.getState().signScope === "hole";

// ---------------------------------------------------------------- the pieces of each look

/** Every piece a sign, page or scorecard can have, by name (in the order Layers lists them). */
export const PIECES: { id: string; label: string; part?: SignPart }[] = [
  { id: "band", label: "Header band" }, { id: "card", label: "Card" },
  { id: "courseName", label: "Course name", part: "courseName" }, { id: "rule", label: "Line under the name" },
  { id: "number", label: "Hole number", part: "number" }, { id: "numberTag", label: "Hole number tag", part: "number" },
  { id: "holeTitle", label: "Hole title" }, { id: "par", label: "Par", part: "par" }, { id: "length", label: "Length" },
  { id: "holeName", label: "Hole name" }, { id: "facts", label: "Elevation and plays like" },
  { id: "lengths", label: "Lengths (each tee)", part: "lengths" }, { id: "elevation", label: "Elevation", part: "elevation" },
  { id: "elevationStrip", label: "Elevation strip", part: "elevation" }, { id: "notes", label: "Hole notes", part: "notes" },
  { id: "spot", label: "Under the notes" }, { id: "map", label: "Hole picture" }, { id: "north", label: "North arrow", part: "north" },
  { id: "scale", label: "Scale bar", part: "scale" }, { id: "nextTee", label: "Way to the next tee", part: "nextTee" },
  { id: "footRule", label: "Line over the notes" }, { id: "footer", label: "Footer panel" }, { id: "legend", label: "Legend", part: "legend" },
  { id: "holeOf", label: "Hole N of M", part: "holeOf" }, { id: "designer", label: "Designer", part: "designer" },
  { id: "logo", label: "Logo or name" }, { id: "fields", label: "Date, par and course lines" }, { id: "location", label: "Where the course is" },
  { id: "table", label: "Score table" }, { id: "cutLine", label: "Cut line" }
];
const byId = new Map(PIECES.map(p => [p.id, p]));
const LOOK_PIECES: Record<string, string[]> = {
  "classic-wide": ["map", "band", "courseName", "number", "par", "lengths", "elevation", "notes", "spot", "holeOf", "designer", "north", "nextTee", "elevationStrip"],
  "classic-tall": ["band", "number", "courseName", "par", "holeName", "lengths", "map", "north", "scale", "nextTee", "elevation", "notes", "legend", "holeOf"],
  trailhead: ["map", "north", "scale", "nextTee", "number", "courseName", "lengths", "spot", "elevation", "notes", "holeOf", "designer"],
  fieldguide: ["courseName", "rule", "numberTag", "number", "par", "map", "north", "scale", "lengths", "spot", "elevation", "footRule", "notes", "nextTee"],
  openview: ["map", "courseName", "north", "card", "number", "par", "holeName", "lengths", "nextTee"],
  page: ["map", "band", "number", "courseName", "holeTitle", "holeName", "par", "length", "lengths", "facts", "north", "scale", "nextTee", "footer", "elevation", "notes", "legend", "holeOf"],
  card: ["logo", "fields", "location", "table", "cutLine"]
};
const lookPieces = (doc: CourseDoc, t: TargetKey) => {
  if (t === "page" || t === "card") return LOOK_PIECES[t];
  const look = doc.style.sign?.look ?? "classic", size = doc.style.signSize ?? "18x12";
  return LOOK_PIECES[look !== "classic" && size !== "letter" && size !== "a4" ? look : size === "18x12" ? "classic-wide" : "classic-tall"];
};

/** A piece's place on the shown hole's sign or page, or the scorecard. */
const placeOf = (doc: CourseDoc, t: TargetKey, id: string): PiecePlace | undefined => {
  if (t === "card") return doc.style.scorecard?.layout?.[id];
  const h = shownHole(doc);
  if (!h) return (t === "page" ? doc.style.holePage : doc.style.sign)?.layout?.[id];
  return t === "page" ? holePageOf(doc, h).place(id) : signOf(doc, h).place(id);
};
/** A piece's place changed (null: back to where its look puts it); every hole, or the shown one. */
const setPlace = (t: TargetKey, id: string, patch: Partial<PiecePlace> | null, history = true) => {
  const doc = getDoc(), h = shownHole(doc);
  const next = (lay: Record<string, PiecePlace> | undefined, now: PiecePlace | undefined) => {
    const all = { ...lay };
    if (patch === null) delete all[id];
    else all[id] = Object.fromEntries(Object.entries({ ...now, ...patch }).filter(([, v]) => v !== undefined)) as PiecePlace;
    return Object.keys(all).length ? all : undefined;
  };
  if (t === "card") return changeDoc(d => ({ style: { ...d.style, scorecard: { ...d.style.scorecard, layout: next(d.style.scorecard?.layout, d.style.scorecard?.layout?.[id]) } } }), history);
  const key = t === "page" ? "page" : "sign";
  if (thisHoleOnly() && h) {
    return changeDoc(d => ({ holes: d.holes.map(x => (x.id === h ? { ...x, [key]: { ...x[key], layout: next(x[key]?.layout, placeOf(d, t, id)) } } : x)) }), history);
  }
  const sk = t === "page" ? "holePage" : "sign";
  changeDoc(d => ({ style: { ...d.style, [sk]: { ...d.style[sk], layout: next(d.style[sk]?.layout, d.style[sk]?.layout?.[id]) } } }), history);
};
const pieceShown = (doc: CourseDoc, t: TargetKey, id: string) => {
  const h = shownHole(doc), part = t === "sign" ? byId.get(id)?.part : undefined;
  if (part && h && !signOf(doc, h).show(part)) return false;
  return !placeOf(doc, t, id)?.hidden;
};
const setPieceShown = (t: TargetKey, id: string, v: boolean) => {
  // (a hole page's and the scorecard's pieces through their place alone)
  if (t !== "sign") return setPlace(t, id, { hidden: v ? (t === "page" ? false : undefined) : true });
  const part = byId.get(id)?.part, doc = getDoc(), h = shownHole(doc);
  if (part && (!v || (h && !signOf(doc, h).show(part)))) {
    if (thisHoleOnly() && h) changeDoc(d => ({ holes: d.holes.map(x => (x.id === h ? { ...x, sign: { ...x.sign, show: { ...x.sign?.show, [part]: v } } } : x)) }));
    else changeDoc(d => ({ style: { ...d.style, sign: { ...d.style.sign, show: { ...d.style.sign?.show, [part]: v } } } }));
    if (v && placeOf(getDoc(), t, id)?.hidden) setPlace(t, id, { hidden: undefined });
    return;
  }
  setPlace(t, id, { hidden: v ? undefined : true });
};
const placeChanged = (p?: PiecePlace) => !!p && Object.entries(p).some(([k, v]) => k !== "hidden" && v !== undefined);

// ---------------------------------------------------------------- what's added to each printout

/** The text, pictures, QR codes and sponsors added to a printout. */
export const extrasOf = (doc: CourseDoc, t: TargetKey = targetKey()): PrintExtra[] =>
  (t === "map" ? doc.style.mapExtras : t === "card" ? doc.style.scorecard?.extras : t === "page" ? doc.style.holePage?.extras : doc.style.sign?.extras) ?? [];
const setExtras = (t: TargetKey, f: (xs: PrintExtra[]) => PrintExtra[], history = true) =>
  changeDoc(d => {
    const s = d.style;
    if (t === "map") return { style: { ...s, mapExtras: f(s.mapExtras ?? []) } };
    if (t === "card") return { style: { ...s, scorecard: { ...s.scorecard, extras: f(s.scorecard?.extras ?? []) } } };
    if (t === "page") return { style: { ...s, holePage: { ...s.holePage, extras: f(s.holePage?.extras ?? []) } } };
    return { style: { ...s, sign: { ...s.sign, extras: f(s.sign?.extras ?? []) } } };
  }, history);
const extraOf = (doc: CourseDoc, t: TargetKey, id: string) => (id.startsWith("x:") ? extrasOf(doc, t).find(x => x.id === id.slice(2)) : undefined);
export const patchExtra = (t: TargetKey, id: string, patch: Partial<PrintExtra>, history = true) => setExtras(t, xs => xs.map(x => (x.id === id ? { ...x, ...patch } : x)), history);
const EXTRA_LABEL: Record<PrintExtra["kind"], string> = { text: "Text", image: "Picture", sponsors: "Sponsors", sponsor: "Sponsor", qr: "QR code" };
const extraLabel = (doc: CourseDoc, e: PrintExtra) =>
  e.kind === "text" ? (e.text ?? "").split("\n")[0].slice(0, 28) || "Text" : e.kind === "sponsor" ? doc.style.sponsors?.find(s => s.id === e.sponsorId)?.name ?? "Sponsor" : EXTRA_LABEL[e.kind];

/** Something added near the middle of the page (each a step down and right of the one before, so
 * none lands on another), and picked. */
export const addExtra = (e: Omit<PrintExtra, "id" | "x" | "y" | "w"> & Partial<PrintExtra>, t: TargetKey = targetKey()) => {
  const id = generateId();
  setExtras(t, xs => { const k = xs.length % 6; return [...xs, { x: 0.3 + k * 0.05, y: 0.3 + k * 0.08, w: 0.24, ...e, id }]; });
  useEditor.getState().set({ designSel: `x:${id}` });
};

// ---------------------------------------------------------------- the actions

const textual = (e: PrintExtra) => e.kind === "text" || e.kind === "qr" || e.kind === "sponsor" || e.kind === "sponsors";

/** What's picked on printout `t`, for the toolbar (null: nothing there). */
export const pickedOf = (doc: CourseDoc, t: TargetKey, id: string): Picked | null => {
  const ex = extraOf(doc, t, id);
  if (ex) {
    return {
      label: extraLabel(doc, ex), kind: ex.kind === "sponsors" ? "sponsor" : ex.kind, pt: textual(ex) ? ex.size ?? (ex.kind === "qr" ? 12 : 24) : undefined,
      font: ex.font, color: ex.color, bold: ex.bold, align: ex.align, text: ex.text, url: ex.url, opacity: ex.opacity,
      has: { font: textual(ex), color: textual(ex), fill: false, bold: ex.kind === "text", align: ex.kind === "text", text: ex.kind === "text" || ex.kind === "qr", url: ex.kind === "qr", opacity: ex.kind === "image", size: true },
      removable: true, duplicable: true, changed: false
    };
  }
  if (t === "map") {
    const e = elementOf(doc, id);
    if (!e) return null;
    if (e.kind === "label") return { label: elementLabel(doc, id), kind: "label", has: { ...none, size: false }, removable: false, duplicable: false, changed: !!doc.style.labelAt?.[e.id] };
    if (e.kind === "text") {
      const x = e.text;
      return { label: elementLabel(doc, id), kind: "text", pt: x.size, font: x.font, color: x.color, fill: x.bg, bold: x.bold, align: x.align, text: x.text, has: { ...none, font: true, color: true, fill: true, bold: true, align: true, text: true }, removable: true, duplicable: true, changed: false };
    }
    if (e.kind === "image") return { label: "Picture", kind: "image", opacity: e.image.opacity, has: { ...none, opacity: true }, removable: true, duplicable: true, changed: false };
    const o = doc.style.page?.[e.id] ?? {}, s = doc.style;
    const panel = e.id === "holes" || e.id === "legend";
    // (its words: the title and its subtitle, a line each; the footer note; a panel's heading)
    const words = e.id === "title" ? [s.title || doc.name, s.subtitle].filter(Boolean).join("\n") : e.id === "credit" ? s.footer : e.id === "legend" ? o.heading ?? "Legend" : e.id === "holes" ? o.heading ?? "" : undefined;
    return {
      label: e.label, kind: "piece", scale: o.scale ?? 1, color: o.ink, fill: o.bg, text: words,
      has: { ...none, color: e.id === "title" || panel || e.id === "credit", fill: panel || e.id === "title", text: words !== undefined },
      removable: false, duplicable: false, changed: o.x !== undefined || o.y !== undefined || o.scale !== undefined || !!o.ink || !!o.bg
    };
  }
  if (!byId.has(id)) return null;
  const p = placeOf(doc, t, id);
  return { label: byId.get(id)!.label, kind: "piece", scale: p?.scale ?? 1, font: p?.font, color: p?.color, fill: p?.fill, has: { ...none, font: true, color: true, fill: true }, removable: false, duplicable: false, changed: placeChanged(p) };
};

/** A picked thing's settings changed. */
export const patchPicked = (t: TargetKey, id: string, p: Patch, history = true) => {
  const doc = getDoc(), ex = extraOf(doc, t, id);
  if (ex) return patchExtra(t, ex.id, p, history);
  if (t === "map") {
    const e = elementOf(doc, id);
    if (e?.kind === "text") return patchText(e.text.id, { ...(p.font !== undefined || "font" in p ? { font: p.font } : {}), ...(p.color ? { color: p.color } : {}), ...("fill" in p ? { bg: p.fill, bgOpacity: p.fill ? e.text.bgOpacity ?? 0.85 : undefined } : {}), ...("bold" in p ? { bold: p.bold || undefined } : {}), ...("align" in p ? { align: p.align === "start" ? undefined : p.align } : {}), ...(p.text !== undefined ? { text: p.text } : {}) }, history);
    if (e?.kind === "image") return patchImage(e.image.id, { opacity: p.opacity }, history);
    if (e?.kind === "built" && p.text !== undefined) {
      const v = p.text;
      if (e.id === "title") { const [first, ...rest] = v.split("\n"); return changeDoc(d => ({ style: { ...d.style, title: first.trim() === d.name ? "" : first.trim(), subtitle: rest.join(" ").trim() } }), history); }
      if (e.id === "credit") return changeDoc(d => ({ style: { ...d.style, footer: v.trim() } }), history);
      return patchPage(e.id, { heading: v.trim() || undefined }, history);
    }
    if (e?.kind === "built") return patchPage(e.id, { ...("color" in p ? { ink: p.color } : {}), ...("fill" in p ? { bg: p.fill } : {}) }, history);
    return;
  }
  setPlace(t, id, { ...("font" in p ? { font: p.font } : {}), ...("color" in p ? { color: p.color } : {}), ...("fill" in p ? { fill: p.fill } : {}) }, history);
};

/** A picked thing's own switches (the toolbar's ⋯): the hole guide's columns. */
export const moreOf = (doc: CourseDoc, t: TargetKey, id: string): { label: string; on: boolean; set: (v: boolean) => void }[] => {
  if (t !== "map" || id !== "holes") return [];
  const cols = doc.style.page?.holes?.columns ?? ["par", "lengths"];
  return ([["names", "Hole names"], ["par", "Par"], ["lengths", "Lengths"], ["elevation", "Elevation"]] as const).map(([c, label]) => ({
    label, on: cols.includes(c), set: (v: boolean) => patchPage("holes", { columns: v ? [...cols, c] : cols.filter(x => x !== c) })
  }));
};

/** Moved by (dx, dy) page units; `box`: where it was, the page `W` × `H`. */
export const movePicked = (t: TargetKey, id: string, dx: number, dy: number, box: Box, W: number, H: number) => {
  const doc = getDoc(), ex = extraOf(doc, t, id);
  if (ex) return patchExtra(t, ex.id, { x: r4(ex.x + dx / W), y: r4(ex.y + dy / H) });
  if (t === "map") return moveDesignEl(id, { x: box.x / W, y: box.y / H }, dx / W, dy / H);
  const p = placeOf(doc, t, id);
  setPlace(t, id, { dx: r4((p?.dx ?? 0) + dx / W), dy: r4((p?.dy ?? 0) + dy / H) });
};

/** Sized `f` times about the page point `a` (which stays put); `box`: where it was. */
export const sizePicked = (t: TargetKey, id: string, f: number, a: { x: number; y: number }, box: Box, W: number, H: number) => {
  const doc = getDoc(), ex = extraOf(doc, t, id);
  const to = { x: a.x + (box.x - a.x) * f, y: a.y + (box.y - a.y) * f };
  if (ex) {
    // (its own corner keeps its place in the drawn box, which grows from `to`)
    const ox = ex.x * W - box.x, oy = ex.y * H - box.y;
    const size = textual(ex) ? Math.round(Math.max(4, Math.min(400, (ex.size ?? 24) * f)) * 10) / 10 : ex.size;
    return patchExtra(t, ex.id, { x: r4((to.x + ox * f) / W), y: r4((to.y + oy * f) / H), w: r4(Math.max(0.01, Math.min(2, ex.w * f))), size });
  }
  if (t === "map") return sizeDesignEl(id, f, { x: to.x / W, y: to.y / H });
  setPlace(t, id, sizedPlace(placeOf(doc, t, id), f, a, W, H));
};

/** Hidden (the look's own pieces; Layers brings them back) or taken away (what was added). */
export const removePicked = (t: TargetKey, id: string) => {
  const doc = getDoc(), ex = extraOf(doc, t, id);
  if (ex) setExtras(t, xs => xs.filter(x => x.id !== ex.id));
  else if (t === "map") { removeDesignSel(); return; }
  else setPieceShown(t, id, false);
  useEditor.getState().set({ designSel: null });
};

export const duplicatePicked = (t: TargetKey, id: string) => {
  const doc = getDoc(), ex = extraOf(doc, t, id);
  if (ex) {
    const nid = generateId();
    setExtras(t, xs => [...xs, { ...ex, id: nid, x: ex.x + 0.02, y: ex.y + 0.02 }]);
    useEditor.getState().set({ designSel: `x:${nid}` });
  } else if (t === "map") duplicateDesignSel();
};

/** Back where (and as) its look has it. */
export const resetPicked = (t: TargetKey, id: string) => {
  if (t === "map") {
    const e = elementOf(getDoc(), id);
    if (e?.kind === "label") return patchLabel(e.id, null);
    if (e?.kind === "built") return changeDoc(d => ({ style: { ...d.style, page: { ...d.style.page, [e.id]: { ...d.style.page?.[e.id], x: undefined, y: undefined, scale: undefined, ink: undefined, bg: undefined, bgOpacity: undefined } }, ...(e.id === "legend" || e.id === "holes" ? { legendAt: undefined } : {}) } }));
    return;
  }
  const keep = placeOf(getDoc(), t, id)?.hidden;
  setPlace(t, id, keep === undefined ? null : { dx: undefined, dy: undefined, scale: undefined, font: undefined, color: undefined, fill: undefined });
};

/** Everything on a printout's page, for Layers (the look's own first, then what was added). */
export const layersOf = (doc: CourseDoc, t: TargetKey): Layer[] => {
  const added = extrasOf(doc, t).map(e => ({ id: `x:${e.id}`, label: extraLabel(doc, e), shown: !e.hidden, changed: false, added: true }));
  if (t === "map") {
    const s = doc.style;
    const ids = ["title", "holes", "legend", "north", "scale", "credit", ...(s.texts ?? []).map(x => `text:${x.id}`), ...(s.images ?? []).map(x => `image:${x.id}`)];
    return [...ids.map(id => ({ id, label: elementLabel(doc, id), shown: isShown(doc, id), changed: !!pickedOf(doc, t, id)?.changed, added: id.includes(":") })), ...added];
  }
  return [...lookPieces(doc, t).map(id => ({ id, label: byId.get(id)!.label, shown: pieceShown(doc, t, id), changed: placeChanged(placeOf(doc, t, id)), added: false })), ...added];
};

/** A layer's eye: shown or hidden. */
export const setLayerShown = (t: TargetKey, id: string, v: boolean) => {
  const ex = extraOf(getDoc(), t, id);
  if (ex) return patchExtra(t, ex.id, { hidden: v ? undefined : true });
  if (t === "map") return setShown(id, v);
  setPieceShown(t, id, v);
};

/** The hole shown has changes of its own (over every hole's). */
export const holeHasOwn = (doc: CourseDoc, t: TargetKey) => {
  const h = doc.holes.find(x => x.id === shownHole(doc));
  if (!h) return false;
  return t === "sign" ? !!(h.sign?.layout || h.sign?.show) : t === "page" ? !!h.page?.layout : false;
};
export const resetHoleOwn = (t: TargetKey) => {
  const h = shownHole(getDoc());
  if (!h) return;
  changeDoc(d => ({ holes: d.holes.map(x => (x.id === h ? (t === "sign" ? { ...x, sign: x.sign ? { ...x.sign, layout: undefined, show: undefined } : undefined } : { ...x, page: undefined }) : x)) }));
};
export const holeName = (doc: CourseDoc) => { const h = shownHole(doc); return h ? holeLabel(doc, h) : ""; };
