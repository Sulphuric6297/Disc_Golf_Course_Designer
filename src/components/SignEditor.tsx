// Tee signs and hole pages laid out by hand, like Canva: every piece of a page (the hole's picture,
// its number, par, lengths, notes...) picked on the page or in Layers, dragged, sized from its
// corners, recolored, set in another font or hidden. For every hole at once, or for one hole on
// its own ("All holes / Hole N"); one undo step each.
import { useRef } from "react";
import { Eye, EyeOff, ImagePlus, Plus, QrCode, RotateCcw, Star, Trash2, Type } from "lucide-react";
import { generateId } from "../constants";
import { pictureFrom } from "./PageEditor";
import { FontPicker } from "./FontPicker";
import { fontsIn } from "../lib/fontLoad";
import { signOf } from "../lib/teeSign";
import { HOLE_PAGE_LOOKS, holePageOf } from "../lib/holePage";
import { holeLabel } from "../lib/course";
import { sizedPlace } from "../lib/pieces";
import { changeDoc, getDoc, useCourse, useEditor } from "../state/course";
import type { CourseDoc, PiecePlace, PrintExtra, SignPart, Sponsor } from "../types";
import { ColorInput, Field, Section, Segmented, Slider, TextInput, Toggle } from "./ui";

/** Which printout the Design step is laying out: the tee sign or the hole page. */
const target = (): "sign" | "page" => (useEditor.getState().designTab === "page" ? "page" : "sign");

/** Every piece a sign can have, by name (in the order Layers lists them). */
export const SIGN_PIECES: { id: string; label: string; part?: SignPart }[] = [
  { id: "band", label: "Header band" },
  { id: "card", label: "Card" },
  { id: "courseName", label: "Course name", part: "courseName" },
  { id: "rule", label: "Line under the name" },
  { id: "number", label: "Hole number", part: "number" },
  { id: "numberTag", label: "Hole number tag", part: "number" },
  { id: "holeTitle", label: "Hole title" },
  { id: "par", label: "Par", part: "par" },
  { id: "length", label: "Length" },
  { id: "holeName", label: "Hole name" },
  { id: "facts", label: "Elevation and plays like" },
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
  { id: "footer", label: "Footer panel" },
  { id: "legend", label: "Legend", part: "legend" },
  { id: "holeOf", label: "Hole N of M", part: "holeOf" },
  { id: "designer", label: "Designer", part: "designer" }
];
const byId = new Map(SIGN_PIECES.map(p => [p.id, p]));
const EXTRA_LABEL: Record<PrintExtra["kind"], string> = { text: "Text", image: "Picture", sponsors: "Sponsors", qr: "QR code" };
export const pieceLabel = (id: string, doc: CourseDoc = getDoc()) => {
  if (id.startsWith("x:")) {
    const e = extrasOf(doc).find(x => x.id === id.slice(2));
    return e ? (e.kind === "text" ? (e.text ?? "").split("\n")[0].slice(0, 28) || "Text" : EXTRA_LABEL[e.kind]) : "Piece";
  }
  return byId.get(id)?.label ?? "Piece";
};

/** What's been added to the sign (or the page): text, pictures, sponsors, QR codes. */
export const extrasOf = (doc: CourseDoc) => (target() === "page" ? doc.style.holePage : doc.style.sign)?.extras ?? [];
const setExtras = (f: (xs: PrintExtra[]) => PrintExtra[], history = true) =>
  changeDoc(d => (target() === "page" ? { style: { ...d.style, holePage: { ...d.style.holePage, extras: f(d.style.holePage?.extras ?? []) } } } : { style: { ...d.style, sign: { ...d.style.sign, extras: f(d.style.sign?.extras ?? []) } } }), history);
export const patchExtra = (id: string, patch: Partial<PrintExtra>, history = true) => setExtras(xs => xs.map(x => (x.id === id ? { ...x, ...patch } : x)), history);
/** Something added near the middle of the page (each a step down and right of the one before, so
 * none lands on another), and picked. */
export const addExtra = (e: Omit<PrintExtra, "id" | "x" | "y" | "w"> & Partial<PrintExtra>) => {
  const id = generateId();
  setExtras(xs => { const k = xs.length % 6; return [...xs, { x: 0.3 + k * 0.05, y: 0.3 + k * 0.08, w: 0.24, ...e, id }]; });
  useEditor.getState().set({ designSel: `x:${id}` });
};

/** The pieces each look lays out (wide and tall signs alike, unless said). */
const LOOK_PIECES: Record<string, string[]> = {
  "classic-wide": ["map", "band", "courseName", "number", "par", "lengths", "elevation", "notes", "spot", "holeOf", "designer", "north", "nextTee", "elevationStrip"],
  "classic-tall": ["band", "number", "courseName", "par", "holeName", "lengths", "map", "north", "scale", "nextTee", "elevation", "notes", "legend", "holeOf"],
  trailhead: ["map", "north", "scale", "nextTee", "number", "courseName", "lengths", "spot", "elevation", "notes", "holeOf", "designer"],
  fieldguide: ["courseName", "rule", "numberTag", "number", "par", "map", "north", "scale", "lengths", "spot", "elevation", "footRule", "notes", "nextTee"],
  openview: ["map", "courseName", "north", "card", "number", "par", "holeName", "lengths", "nextTee"],
  page: ["map", "band", "number", "courseName", "holeTitle", "holeName", "par", "length", "lengths", "facts", "north", "scale", "nextTee", "footer", "elevation", "notes", "legend", "holeOf"]
};
export const piecesFor = (doc: CourseDoc) => {
  if (target() === "page") return LOOK_PIECES.page.map(id => byId.get(id)!).filter(Boolean);
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

/** A piece's place on the shown hole's sign or page. */
export const placeNow = (doc: CourseDoc, id: string) => {
  const h = signHole(doc), page = target() === "page";
  if (!h) return (page ? doc.style.holePage : doc.style.sign)?.layout?.[id];
  return page ? holePageOf(doc, h).place(id) : signOf(doc, h).place(id);
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
  if (target() === "page") {
    if (forHole() && h) changeDoc(d => ({ holes: d.holes.map(x => (x.id === h ? { ...x, page: { ...x.page, layout: clean(x.page?.layout, holePageOf(d, h).place(id)) } } : x)) }), history);
    else changeDoc(d => ({ style: { ...d.style, holePage: { ...d.style.holePage, layout: clean(d.style.holePage?.layout, d.style.holePage?.layout?.[id]) } } }), history);
  } else if (forHole() && h) {
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
  const h = signHole(doc), part = target() === "sign" ? byId.get(id)?.part : undefined;
  if (part && h && !signOf(doc, h).show(part)) return false;
  return !placeNow(doc, id)?.hidden;
};
export const setPieceShown = (id: string, v: boolean) => {
  // (a hole page's pieces through their place alone: just the hole leaves most out to start with)
  if (target() === "page") return setPlace(id, { hidden: !v });
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
  // (what was added goes; the look's own pieces are hidden)
  if (designSel.startsWith("x:")) setExtras(xs => xs.filter(x => x.id !== designSel.slice(2)));
  else setPieceShown(designSel, false);
  set({ designSel: null });
};


/** Layers: every piece of the sign, shown or hidden, to pick or bring back. */
export function SignLayers() {
  const doc = useCourse(s => s.doc);
  const sel = useEditor(e => e.designSel);
  const set = useEditor(e => e.set);
  const list = [...piecesFor(doc), ...extrasOf(doc).map(e => ({ id: `x:${e.id}`, label: pieceLabel(`x:${e.id}`, doc) }))];
  return (
    <div className="rounded-[14px] bg-white/[0.05] py-1" role="list" aria-label="Layers" data-testid="sign-layers">
      {list.map(p => {
        const pl = placeNow(doc, p.id), on = pieceShown(doc, p.id), picked = sel === p.id;
        const moved = !!pl && Object.entries(pl).some(([k, v]) => k !== "hidden" && v !== undefined);
        return (
          <div key={p.id} role="listitem" className={`flex items-center gap-1 px-1.5 ${picked ? "bg-orange-400/15" : ""}`}>
            <button className={`flex-1 text-left px-1.5 py-1.5 text-[13px] ${on ? "text-zinc-100" : "text-zinc-500"} ${picked ? "font-semibold" : ""}`} onClick={() => set({ designSel: picked ? null : p.id })} data-testid={`layer-${p.id}`}>
              {pieceLabel(p.id, doc)}{moved && <span className="ml-1.5 w-1.5 h-1.5 inline-block rounded-full bg-orange-400 align-middle" aria-label="Changed" />}
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
  if (sel?.startsWith("x:")) return <ExtraSettings id={sel.slice(2)} />;
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
        <FontPicker value={p.font} onChange={f => setPlace(sel, { font: f })} used={fontsIn(doc)} />
      </Field>
      <ColorInput label="Lettering color" value={p.color ?? "#ffffff"} onChange={v => setPlace(sel, { color: v }, false)} onDone={commit} />
      <ColorInput label="Panel color" value={p.fill ?? "#1b4332"} onChange={v => setPlace(sel, { fill: v }, false)} onDone={commit} />
      {(p.color || p.fill) && <button className="text-xs text-zinc-400 hover:text-zinc-200" onClick={() => setPlace(sel, { color: undefined, fill: undefined })}>Its look's own colors</button>}
    </div>
  );
}

/** The Hole page tab's panel: its look, all holes or one, Layers and the picked piece. */
export function HolePageSettings() {
  const doc = useCourse(s => s.doc);
  const scope = useEditor(e => e.signScope);
  const h = signHole(doc);
  if (!doc.holes.length) return null;
  const look = doc.style.holePage?.look ?? "standard";
  return (
    <Section title="Hole pages" testid="page-settings" help="hole-pages">
      <Field label="Start from">
        <Segmented label="Hole page look" value={look} onChange={v => changeDoc(d => ({ style: { ...d.style, holePage: { look: v === "standard" ? undefined : v } } }))} options={HOLE_PAGE_LOOKS.map(l => ({ value: l.id, label: l.label }))} />
      </Field>
      {h && <div className="mb-2.5"><Segmented label="Hole page changes for" value={scope} onChange={v => useEditor.getState().set({ signScope: v })} options={[{ value: "all", label: "All holes" }, { value: "hole", label: `Hole ${holeLabel(doc, h)}` }]} /></div>}
      <AddPieces />
      <div className="text-[12px] font-semibold text-zinc-400 mt-1 mb-1.5 px-1">Layers</div>
      <SignLayers />
      <SignPieceSettings />
      <Sponsors />
    </Section>
  );
}

/** + Add: text (each hole's own number, par... filled in), a picture, the hole's sponsors, a QR code. */
export function AddPieces() {
  const file = useRef<HTMLInputElement>(null);
  const b = "flex items-center gap-1.5 rounded-full bg-white/[0.08] hover:bg-white/[0.14] px-2.5 py-1.5 text-[12.5px] font-semibold text-zinc-100";
  return (
    <div className="mb-3" data-testid="add-pieces">
      <div className="text-[12px] font-semibold text-zinc-400 mb-1.5 px-1 flex items-center gap-1"><Plus size={13} /> Add</div>
      <div className="flex flex-wrap gap-1.5">
        <button className={b} onClick={() => addExtra({ kind: "text", text: "Hole {hole}", size: 36, color: "#111111", bold: true })} data-testid="add-text"><Type size={14} /> Text</button>
        <button className={b} onClick={() => file.current?.click()} data-testid="add-picture"><ImagePlus size={14} /> Picture</button>
        <button className={b} onClick={() => addExtra({ kind: "sponsors", size: 16, w: 0.3 })} data-testid="add-sponsors"><Star size={14} /> Sponsors</button>
        <button className={b} onClick={() => addExtra({ kind: "qr", url: "", w: 0.12, text: "Scan for the course", size: 11 })} data-testid="add-qr"><QrCode size={14} /> QR code</button>
      </div>
      <input ref={file} type="file" accept="image/*" className="hidden" aria-label="Picture for the page" onChange={async e => { const f = e.target.files?.[0]; e.target.value = ""; if (f) { const p = await pictureFrom(f); addExtra({ kind: "image", src: p.src, aspect: p.aspect }); } }} />
    </div>
  );
}

/** Which holes something shows on: every hole, or the holes ticked. */
function HolePicker({ holes, onChange }: { holes?: string[]; onChange: (v: string[] | undefined) => void }) {
  const doc = useCourse(c => c.doc);
  const every = !holes?.length;
  return (
    <div className="mt-1">
      <Toggle label="On every hole" checked={every} onChange={v => onChange(v ? undefined : doc.holes.slice(0, 1).map(h => h.id))} />
      {!every && (
        <div className="flex flex-wrap gap-1 mt-1">
          {doc.holes.map(h => {
            const on = holes!.includes(h.id);
            return <button key={h.id} className={`min-w-8 px-2 py-1 rounded-full text-[12px] font-semibold ${on ? "bg-orange-400 text-zinc-950" : "bg-white/[0.08] text-zinc-300"}`} aria-pressed={on} onClick={() => { const next = on ? holes!.filter(x => x !== h.id) : [...holes!, h.id]; onChange(next.length ? next : undefined); }}>{holeLabel(doc, h.id)}</button>;
          })}
        </div>
      )}
    </div>
  );
}


/** An added piece's settings: its words (or picture, or link), size, font, color, holes. */
function ExtraSettings({ id }: { id: string }) {
  const doc = useCourse(c => c.doc);
  const e = extrasOf(doc).find(x => x.id === id);
  const file = useRef<HTMLInputElement>(null);
  if (!e) return null;
  const commit = () => useCourse.getState().commit();
  const patch = (p: Partial<PrintExtra>, history = true) => patchExtra(id, p, history);
  return (
    <div className="mt-3" data-testid="extra-settings">
      <div className="flex items-center justify-between mb-1">
        <div className="text-[13px] font-semibold text-zinc-100">{EXTRA_LABEL[e.kind]}</div>
        <button className="p-1.5 rounded hover:bg-white/[0.1] text-zinc-400" aria-label="Delete it" title="Delete" onClick={hideSignSel}><Trash2 size={14} /></button>
      </div>
      {e.kind === "text" && (
        <>
          <textarea aria-label="Text" className="w-full rounded-[10px] bg-white/[0.08] px-2.5 py-2 text-sm text-zinc-100" rows={3} value={e.text ?? ""} onChange={ev => patch({ text: ev.target.value }, false)} onBlur={commit} />
          <p className="text-[11px] text-zinc-500 mt-1 mb-1.5">{"{hole}, {par}, {length}, {course} and {name} fill in each hole's own."}</p>
        </>
      )}
      {e.kind === "qr" && (
        <>
          <Field label="Where it takes you"><TextInput label="Where it takes you" value={e.url ?? ""} onChange={v => patch({ url: v })} placeholder="https://" /></Field>
          <Field label="Words under it"><TextInput label="Words under it" value={e.text ?? ""} onChange={v => patch({ text: v })} /></Field>
        </>
      )}
      {e.kind === "image" && (
        <>
          <button className="text-xs text-orange-300 hover:text-orange-200" onClick={() => file.current?.click()}>Another picture</button>
          <input ref={file} type="file" accept="image/*" className="hidden" aria-label="Another picture" onChange={async ev => { const f = ev.target.files?.[0]; ev.target.value = ""; if (f) { const p = await pictureFrom(f); patch({ src: p.src, aspect: p.aspect }); } }} />
        </>
      )}
      {e.kind === "sponsors" && <p className="text-[11px] text-zinc-500 mb-1.5">Shows this hole's sponsors, side by side. Add them under Sponsors below.</p>}
      {e.kind !== "image" && (
        <>
          <Slider label="Letter size" min={6} max={240} step={1} value={e.size ?? 24} onChange={v => patch({ size: v }, false)} onDone={commit} format={v => `${Math.round(v)} pt`} />
          <Field label="Font">
            <FontPicker value={e.font} onChange={f => patch({ font: f })} used={fontsIn(doc)} />
          </Field>
          <ColorInput label="Color" value={e.color ?? "#111111"} onChange={v => patch({ color: v }, false)} onDone={commit} />
          {e.kind === "text" && <Toggle label="Bold" checked={!!e.bold} onChange={v => patch({ bold: v })} />}
        </>
      )}
      <HolePicker holes={e.holes} onChange={v => patch({ holes: v })} />
    </div>
  );
}

/** The course's hole sponsors: a logo, a line of text, or both; every hole or the holes picked. */
export function Sponsors() {
  const doc = useCourse(c => c.doc);
  const list = doc.style.sponsors ?? [];
  const file = useRef<HTMLInputElement>(null);
  const forLogo = useRef<string | null>(null);
  const put = (f: (xs: Sponsor[]) => Sponsor[], history = true) => changeDoc(d => ({ style: { ...d.style, sponsors: f(d.style.sponsors ?? []) } }), history);
  const patch = (id: string, p: Partial<Sponsor>, history = true) => put(xs => xs.map(x => (x.id === id ? { ...x, ...p } : x)), history);
  return (
    <div className="mt-4" data-testid="sponsors">
      <div className="flex items-center justify-between mb-1.5 px-1">
        <div className="text-[12px] font-semibold text-zinc-400">Sponsors</div>
        <button className="text-xs font-semibold text-orange-300 hover:text-orange-200 flex items-center gap-1" onClick={() => put(xs => [...xs, { id: generateId(), name: `Sponsor ${xs.length + 1}` }])} data-testid="add-sponsor"><Plus size={12} /> Add a sponsor</button>
      </div>
      {!list.length && <p className="text-[11.5px] text-zinc-500 px-1">A sponsor can have a logo, a line of text, or both, on every hole or the holes you pick. Put a Sponsors piece on the sign (Add above) to show each hole's.</p>}
      {list.map(sp => (
        <div key={sp.id} className="rounded-[14px] bg-white/[0.05] p-2.5 mb-2">
          <div className="flex items-center gap-2">
            <button className="w-11 h-11 shrink-0 rounded-[10px] bg-white/[0.08] overflow-hidden flex items-center justify-center text-zinc-400" aria-label={`Logo for ${sp.name}`} title="Pick a logo" onClick={() => { forLogo.current = sp.id; file.current?.click(); }}>
              {sp.logo ? <img src={sp.logo} alt="" className="max-w-full max-h-full object-contain" /> : <ImagePlus size={16} />}
            </button>
            <div className="flex-1 min-w-0"><TextInput label="Sponsor name" value={sp.name} onChange={v => patch(sp.id, { name: v })} /></div>
            <button className="p-1.5 rounded hover:bg-white/[0.1] text-zinc-400" aria-label={`Remove ${sp.name}`} onClick={() => put(xs => xs.filter(x => x.id !== sp.id))}><Trash2 size={14} /></button>
          </div>
          <Field label="Text on the sign"><TextInput label="Text on the sign" value={sp.text ?? ""} onChange={v => patch(sp.id, { text: v || undefined })} placeholder={sp.logo ? "None (the logo alone)" : sp.name} /></Field>
          {sp.logo && <button className="text-xs text-zinc-400 hover:text-zinc-200" onClick={() => patch(sp.id, { logo: undefined, aspect: undefined })}>No logo</button>}
          <HolePicker holes={sp.holes} onChange={v => patch(sp.id, { holes: v })} />
        </div>
      ))}
      <input ref={file} type="file" accept="image/*" className="hidden" aria-label="Sponsor logo" onChange={async e => { const f = e.target.files?.[0]; e.target.value = ""; const id = forLogo.current; if (f && id) { const p = await pictureFrom(f, 800); patch(id, { logo: p.src, aspect: p.aspect }); } }} />
    </div>
  );
}
