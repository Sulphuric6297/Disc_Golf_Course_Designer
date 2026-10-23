// Tee signs laid out by hand, like Canva: every piece of a sign (the hole's picture, its number,
// par, lengths, notes...) picked on the page or in Layers, dragged, sized from its corners,
// recolored, set in another font or hidden. For every hole at once, or for one hole on its own
// (the Tee signs panel's "All holes / Hole N"); one undo step each.
import { Eye, EyeOff, RotateCcw } from "lucide-react";
import { signOf } from "../lib/teeSign";
import { sizedPlace } from "../lib/pieces";
import { changeDoc, getDoc, useCourse, useEditor } from "../state/course";
import type { CourseDoc, PiecePlace, SignPart } from "../types";
import { ColorInput, Field, Slider } from "./ui";

/** Every piece a sign can have, by name (in the order Layers lists them). */
export const SIGN_PIECES: { id: string; label: string; part?: SignPart }[] = [
  { id: "band", label: "Header band" },
  { id: "card", label: "Card" },
  { id: "courseName", label: "Course name", part: "courseName" },
  { id: "rule", label: "Line under the name" },
  { id: "number", label: "Hole number", part: "number" },
  { id: "numberTag", label: "Hole number tag", part: "number" },
  { id: "par", label: "Par", part: "par" },
  { id: "holeName", label: "Hole name" },
  { id: "lengths", label: "Lengths (each tee)", part: "lengths" },
  { id: "elevation", label: "Elevation", part: "elevation" },
  { id: "elevationStrip", label: "Elevation strip", part: "elevation" },
  { id: "notes", label: "Hole notes", part: "notes" },
  { id: "spot", label: "Under the notes" },
  { id: "map", label: "Hole picture" },
  { id: "north", label: "North arrow", part: "north" },
  { id: "scale", label: "Scale bar", part: "scale" },
  { id: "nextTee", label: "Way to the next tee", part: "nextTee" },
  { id: "footRule", label: "Line over the notes" },
  { id: "legend", label: "Legend", part: "legend" },
  { id: "holeOf", label: "Hole N of M", part: "holeOf" },
  { id: "designer", label: "Designer", part: "designer" }
];
const byId = new Map(SIGN_PIECES.map(p => [p.id, p]));
export const pieceLabel = (id: string) => byId.get(id)?.label ?? "Piece";

/** The pieces each look lays out (wide and tall signs alike, unless said). */
const LOOK_PIECES: Record<string, string[]> = {
  "classic-wide": ["map", "band", "courseName", "number", "par", "lengths", "elevation", "notes", "spot", "holeOf", "designer", "north", "nextTee", "elevationStrip"],
  "classic-tall": ["band", "number", "courseName", "par", "holeName", "lengths", "map", "north", "scale", "nextTee", "elevation", "notes", "legend", "holeOf"],
  trailhead: ["map", "north", "scale", "nextTee", "number", "courseName", "lengths", "spot", "elevation", "notes", "holeOf", "designer"],
  fieldguide: ["courseName", "rule", "numberTag", "number", "par", "map", "north", "scale", "lengths", "spot", "elevation", "footRule", "notes", "nextTee"],
  openview: ["map", "courseName", "north", "card", "number", "par", "holeName", "lengths", "nextTee"]
};
export const piecesFor = (doc: CourseDoc) => {
  const look = doc.style.sign?.look ?? "classic", size = doc.style.signSize ?? "18x12";
  const key = look !== "classic" && size !== "letter" && size !== "a4" ? look : size === "18x12" ? "classic-wide" : "classic-tall";
  const ids = new Set(LOOK_PIECES[key] ?? LOOK_PIECES["classic-wide"]);
  return SIGN_PIECES.filter(p => ids.has(p.id));
};

/** The hole whose sign the Design step shows. */
const signHole = (doc: CourseDoc) => {
  const { designHole, activeHoleId } = useEditor.getState();
  return [designHole, activeHoleId].find(id => id && doc.holes.some(h => h.id === id)) ?? doc.holes[0]?.id ?? null;
};
const forHole = () => useEditor.getState().signScope === "hole";

/** A piece's place on the shown hole's sign. */
export const placeNow = (doc: CourseDoc, id: string) => {
  const h = signHole(doc);
  return h ? signOf(doc, h).place(id) : doc.style.sign?.layout?.[id];
};

/** A piece's place changed (null: back to where its look puts it), for every hole or the shown one. */
export const setPlace = (id: string, patch: Partial<PiecePlace> | null, history = true) => {
  const doc = getDoc(), h = signHole(doc);
  const clean = (lay: Record<string, PiecePlace> | undefined, now: PiecePlace | undefined) => {
    const all = { ...lay };
    if (patch === null) delete all[id];
    else all[id] = Object.fromEntries(Object.entries({ ...now, ...patch }).filter(([, v]) => v !== undefined)) as PiecePlace;
    return Object.keys(all).length ? all : undefined;
  };
  if (forHole() && h) {
    changeDoc(d => ({ holes: d.holes.map(x => (x.id === h ? { ...x, sign: { ...x.sign, layout: clean(x.sign?.layout, signOf(d, h).place(id)) } } : x)) }), history);
  } else {
    changeDoc(d => ({ style: { ...d.style, sign: { ...d.style.sign, layout: clean(d.style.sign?.layout, d.style.sign?.layout?.[id]) } } }), history);
  }
};

/** A piece moved by shares of the page. */
export const movePiece = (id: string, dx: number, dy: number) => {
  const p = placeNow(getDoc(), id);
  const r = (v: number) => Math.round(v * 10000) / 10000;
  setPlace(id, { dx: r((p?.dx ?? 0) + dx), dy: r((p?.dy ?? 0) + dy) });
};
/** A piece sized `f` times about the page point `a` (page units; the page `W` × `H`). */
export const sizePiece = (id: string, f: number, a: { x: number; y: number }, W: number, H: number) => setPlace(id, sizedPlace(placeNow(getDoc(), id), f, a, W, H));

/** Whether a piece shows (a part of the sign through its switch, the rest through its place). */
export const pieceShown = (doc: CourseDoc, id: string) => {
  const h = signHole(doc), part = byId.get(id)?.part;
  if (part && h && !signOf(doc, h).show(part)) return false;
  return !placeNow(doc, id)?.hidden;
};
export const setPieceShown = (id: string, v: boolean) => {
  const part = byId.get(id)?.part, doc = getDoc(), h = signHole(doc);
  if (part && (!v || (h && !signOf(doc, h).show(part)))) {
    if (forHole() && h) changeDoc(d => ({ holes: d.holes.map(x => (x.id === h ? { ...x, sign: { ...x.sign, show: { ...x.sign?.show, [part]: v } } } : x)) }));
    else changeDoc(d => ({ style: { ...d.style, sign: { ...d.style.sign, show: { ...d.style.sign?.show, [part]: v } } } }));
    if (v && placeNow(getDoc(), id)?.hidden) setPlace(id, { hidden: undefined });
    return;
  }
  setPlace(id, { hidden: v ? undefined : true });
};

/** Delete on the page: the piece picked is hidden (Layers brings it back). */
export const hideSignSel = () => {
  const { designSel, set } = useEditor.getState();
  if (!designSel) return;
  setPieceShown(designSel, false);
  set({ designSel: null });
};

const FONTS: { id: string; label: string }[] = [
  { id: "", label: "The course's lettering" },
  { id: "Oswald", label: "Oswald" },
  { id: "Inter", label: "Inter" },
  { id: "Bitter", label: "Bitter" },
  { id: "Script", label: "Kaushan Script" }
];

/** Layers: every piece of the sign, shown or hidden, to pick or bring back. */
export function SignLayers() {
  const doc = useCourse(s => s.doc);
  const sel = useEditor(e => e.designSel);
  const set = useEditor(e => e.set);
  const list = piecesFor(doc);
  return (
    <div className="rounded-[14px] bg-white/[0.05] py-1" role="list" aria-label="Layers" data-testid="sign-layers">
      {list.map(p => {
        const on = pieceShown(doc, p.id), picked = sel === p.id, moved = !!placeNow(doc, p.id);
        return (
          <div key={p.id} role="listitem" className={`flex items-center gap-1 px-1.5 ${picked ? "bg-orange-400/15" : ""}`}>
            <button className={`flex-1 text-left px-1.5 py-1.5 text-[13px] ${on ? "text-zinc-100" : "text-zinc-500"} ${picked ? "font-semibold" : ""}`} onClick={() => set({ designSel: picked ? null : p.id })} data-testid={`layer-${p.id}`}>
              {pieceLabel(p.id)}{moved && <span className="ml-1.5 w-1.5 h-1.5 inline-block rounded-full bg-orange-400 align-middle" aria-label="Changed" />}
            </button>
            <button className="p-1.5 rounded hover:bg-white/[0.1] text-zinc-400" aria-label={on ? `Hide ${pieceLabel(p.id)}` : `Show ${pieceLabel(p.id)}`} title={on ? "Hide" : "Show"} onClick={() => setPieceShown(p.id, !on)} data-testid={`layer-eye-${p.id}`}>
              {on ? <Eye size={14} /> : <EyeOff size={14} />}
            </button>
          </div>
        );
      })}
    </div>
  );
}

/** The picked piece's own settings: size, font, colors, back to its look's. */
export function SignPieceSettings() {
  const doc = useCourse(s => s.doc);
  const sel = useEditor(e => e.designSel);
  if (!sel || !byId.has(sel)) return <p className="text-[12px] text-zinc-500 mt-2">Click a piece on the sign, or its name above, to move it, size it or change its colors. Drag a corner to resize. Arrow keys nudge it.</p>;
  const p = placeNow(doc, sel) ?? {};
  const commit = () => useCourse.getState().commit();
  return (
    <div className="mt-3" data-testid="sign-piece">
      <div className="flex items-center justify-between mb-1">
        <div className="text-[13px] font-semibold text-zinc-100">{pieceLabel(sel)}</div>
        <button className="text-xs text-orange-300 hover:text-orange-200 flex items-center gap-1 disabled:opacity-40" disabled={!placeNow(doc, sel)} onClick={() => setPlace(sel, null)} data-testid="piece-reset"><RotateCcw size={12} /> Reset</button>
      </div>
      <Slider label="Size" min={0.3} max={3} step={0.05} value={p.scale ?? 1} onChange={v => setPlace(sel, { scale: v }, false)} onDone={commit} format={v => `${Math.round(v * 100)}%`} />
      <Field label="Font">
        <select aria-label="Font" className="w-full bg-white/[0.08] rounded-[10px] px-2.5 py-1.5 text-sm text-zinc-100" value={p.font ?? ""} onChange={e => setPlace(sel, { font: e.target.value || undefined })}>
          {FONTS.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
        </select>
      </Field>
      <ColorInput label="Lettering color" value={p.color ?? "#ffffff"} onChange={v => setPlace(sel, { color: v }, false)} onDone={commit} />
      <ColorInput label="Panel color" value={p.fill ?? "#1b4332"} onChange={v => setPlace(sel, { fill: v }, false)} onDone={commit} />
      {(p.color || p.fill) && <button className="text-xs text-zinc-400 hover:text-zinc-200" onClick={() => setPlace(sel, { color: undefined, fill: undefined })}>Its look's own colors</button>}
    </div>
  );
}
