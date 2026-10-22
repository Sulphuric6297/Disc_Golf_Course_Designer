// The Design step's controls: how the printed map looks (its style, colors, title block, what shows).
import { ArrowRight, RotateCcw } from "lucide-react";
import { ApplyToHoles } from "./ApplyToHoles";
import { BASKET_MARKS, PAPER, THEME_COLORS, basketMark, bestRotation } from "../lib/mapSvg";
import { landscapeOf, tallGrassOf } from "../lib/landscapes";
import { autoWalks } from "../lib/course";
import { courseStats } from "../lib/holeStats";
import { editWalks } from "../state/actions";
import { CARD_DEFAULTS, SIGN_PARTS, signOf } from "../lib/teeSign";
import { holeLabel } from "../lib/course";
import { changeDoc, useCourse, useEditor } from "../state/course";
import { AREA_KINDS } from "../constants";
import { RESTRICTED } from "../lib/symbols";
import { MapLookPanel } from "./MapLookPanel";
import { useEffect, useRef, useState } from "react";
import type { MapStyle, PaperSize, SignSettings } from "../types";
import { Button, ColorInput, Field, Section, Segmented, Slider, TextInput, Toggle } from "./ui";
import { PageElementPanel, PageSection } from "./PageEditor";
import { setAllWalks } from "./Inspector";
import { fmtDist } from "../lib/units";

export const setStyle = (patch: Partial<MapStyle>, history = true) => {
  // View only: the look changes on this screen (sun, landscape…), never saved
  if (useCourse.getState().readOnly) { useCourse.setState(s => ({ doc: { ...s.doc, style: { ...s.doc.style, ...patch } } })); return; }
  changeDoc(d => ({ style: { ...d.style, ...patch } }), history);
};

/** How thick the painted woods are. The map repaints when the slider is let go (painting takes a moment). */
/** A slider for a style setting that repaints the map: it changes the map when let go. */
/** `live`: the change shows while dragging (the 3D view's light: quick), one undo step at the end. */
export function StyleSlider<K extends keyof MapStyle>({ k, value, label, min, max, step, format, live }: { k: K; value: number; label: string; min: number; max: number; step: number; format: (v: number) => string; live?: boolean }) {
  const [v, setV] = useState(value);
  // Only a slider that was moved commits (a key let go on it, like Ctrl+Z's, must not)
  const moved = useRef(false);
  useEffect(() => { setV(value); }, [value]);
  const done = () => {
    if (live) { if (moved.current) useCourse.getState().commit(); }
    else if (moved.current && v !== value) setStyle({ [k]: v } as Partial<MapStyle>);
    moved.current = false;
  };
  return <Slider label={label} min={min} max={max} step={step} value={v} onChange={x => { moved.current = true; setV(x); if (live) setStyle({ [k]: x } as Partial<MapStyle>, false); }} onDone={done} format={format} />;
}

const TreeCover = ({ value }: { value: number }) => (
  <StyleSlider k="treeCover" value={value} label="Tree cover" min={0.1} max={1} step={0.05} format={x => `${x < 0.35 ? "Sparse" : x < 0.7 ? "Open woods" : x < 0.95 ? "Thick" : "Dense"} · ${Math.round(x * 100)}%`} />
);

/** Where the painted map has woods, and how thick (the map style's Landscape part). */
export function WoodsOptions({ s }: { s: MapStyle }) {
  return (
    <div className="mt-3" data-testid="forest-options">
      <Field label="Where to paint the woods">
        <Segmented label="Woods" value={s.forest} onChange={v => setStyle({ forest: v })} options={[{ value: "photo", label: "From the photo" }, { value: "everywhere", label: "Everywhere" }, { value: "woods", label: "Drawn only" }]} />
      </Field>
      <TreeCover value={s.treeCover ?? 1} />
    </div>
  );
}

export const FROM = ["top", "top right", "right", "bottom right", "bottom", "bottom left", "left", "top left"];
export const signed = (x: number) => `${x > 0 ? "+" : x < 0 ? "−" : ""}${Math.round(Math.abs(x) * 100)}%`;

/** Where the light comes from, how long and dark the shadows are, and the picture's tone. */
function LightAndShadow({ s }: { s: MapStyle }) {
  return (
    <Section title="Fine tuning" testid="light-shadow" right={<button className="text-xs text-orange-300 hover:text-orange-200 flex items-center gap-1" onClick={() => setStyle({ light: 0, contrast: 0, colorStrength: 1, paint: 0.8, reliefScale: 1 })}><RotateCcw size={12} /> Reset</button>}>
      <StyleSlider k="light" value={s.light ?? 0} label="Brightness" min={-0.3} max={0.3} step={0.02} format={signed} />
      <StyleSlider k="contrast" value={s.contrast ?? 0} label="Contrast" min={-0.3} max={0.4} step={0.02} format={signed} />
      <StyleSlider k="colorStrength" value={s.colorStrength ?? 1} label="Color strength" min={0.3} max={1.4} step={0.05} format={x => `${Math.round(x * 100)}%`} />
      <StyleSlider k="paint" value={s.paint ?? 0.8} label="Painted look" min={0} max={1} step={0.05} format={x => (x < 0.25 ? "Smooth" : x < 0.7 ? "Soft bands" : "Painted bands")} />
      <StyleSlider k="reliefScale" value={s.reliefScale ?? 1} label="Hills" min={0} max={3} step={0.05} format={x => (x === 0 ? "Flat" : `${x.toFixed(2).replace(/0$/, "")}×`)} />
    </Section>
  );
}

/** The course's logo for the scorecard: a picture picked from the device, made small (at most
 * 320 px across) so the course file stays light. */
function LogoPicker({ logo }: { logo?: string }) {
  const input = useRef<HTMLInputElement>(null);
  const pick = async (file: File) => {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      const k = Math.min(1, 320 / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(img.naturalWidth * k));
      c.height = Math.max(1, Math.round(img.naturalHeight * k));
      c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
      setStyle({ logo: c.toDataURL("image/png") });
    } finally {
      URL.revokeObjectURL(url);
    }
  };
  return (
    <div className="flex items-center gap-2">
      {logo && <img src={logo} alt="Course logo" className="h-9 max-w-[120px] object-contain rounded bg-white/90 p-0.5" data-testid="logo-preview" />}
      <input ref={input} type="file" accept="image/*" className="hidden" aria-label="Course logo file" data-testid="logo-input" onChange={e => { const f = e.target.files?.[0]; if (f) void pick(f); e.target.value = ""; }} />
      <Button small onClick={() => input.current?.click()}>{logo ? "Change" : "Upload"}</Button>
      {logo && <Button small onClick={() => setStyle({ logo: undefined })}>Remove</Button>}
    </div>
  );
}

/** How tee signs look: for all holes, or a hole's own (the one the tee sign preview shows): the
 * other holes on its map faded, left out or shown, and each part shown or left out. */
function TeeSignSettings() {
  const doc = useCourse(s => s.doc);
  const designHole = useEditor(e => e.designHole);
  const active = useEditor(e => e.activeHoleId);
  const holeId = [designHole, active].find(id => id && doc.holes.some(h => h.id === id)) ?? doc.holes[0]?.id ?? null;
  const hole = doc.holes.find(h => h.id === holeId);
  const [scope, setScope] = useState<"all" | "hole">("all");
  const forHole = scope === "hole" && !!hole;
  // (what shows: a hole's own over the course's, or the course's alone)
  const eff = forHole ? signOf(doc, hole!.id) : signOf({ style: doc.style, holes: [] }, "");
  const own = (forHole ? hole!.sign : doc.style.sign) ?? {};
  const patch = (p: SignSettings, history = true) =>
    changeDoc(d => (forHole ? { holes: d.holes.map(h => (h.id === hole!.id ? { ...h, sign: { ...h.sign, ...p } } : h)) } : { style: { ...d.style, sign: { ...d.style.sign, ...p } } }), history);
  const reset = forHole
    ? null
    : <button className="text-xs text-orange-300 hover:text-orange-200 flex items-center gap-1 disabled:opacity-40" disabled={!doc.style.sign} onClick={() => setStyle({ sign: undefined })}><RotateCcw size={12} /> Reset</button>;
  // (from a hole: its sign settings to the holes picked; for all holes: the picked holes follow them)
  const applyTo = (ids: string[]) => changeDoc(d => ({ holes: d.holes.map(h => (ids.includes(h.id) ? { ...h, sign: forHole && hole!.sign ? JSON.parse(JSON.stringify(hole!.sign)) : undefined } : h)) }));
  if (!doc.holes.length) return null;
  return (
    <Section title="Tee signs" testid="sign-settings" right={reset}>
      {hole && (
        <div className="mb-2.5">
          <Segmented label="Tee sign settings for" value={scope} onChange={setScope} options={[{ value: "all", label: "All holes" }, { value: "hole", label: `Hole ${holeLabel(doc, hole.id)}` }]} />
        </div>
      )}
      <Field label="Other holes">
        <Segmented label="Other holes on the sign" value={eff.others} onChange={v => patch({ others: v })} options={[{ value: "faded", label: "Faded" }, { value: "hidden", label: "Hidden" }, { value: "shown", label: "Shown" }]} />
      </Field>
      {eff.others === "faded" && <Slider label="How faded" min={0.05} max={0.9} step={0.05} value={eff.fade} onChange={v => patch({ fade: v }, false)} onDone={() => useCourse.getState().commit()} format={v => `${Math.round(v * 100)}%`} />}
      <div className="grid grid-cols-2 gap-x-3" data-testid="sign-parts">
        {SIGN_PARTS.map(p => <Toggle key={p.id} label={p.label} checked={eff.show(p.id)} onChange={v => patch({ show: { ...own.show, [p.id]: v } })} />)}
      </div>
      <div className="mt-2">
        <ApplyToHoles fromId={forHole ? hole!.id : undefined} apply={applyTo} testid="sign-apply" />
      </div>
    </Section>
  );
}

export function DesignPanel() {
  const doc = useCourse(s => s.doc);
  const s = doc.style;
  // Color pickers change the map live while dragging; the change is one undo step when it ends
  const done = () => useCourse.getState().commit();
  return (
    <>
      <PageElementPanel />
      <Section title="Map style" testid="map-style">
        <MapLookPanel />
      </Section>
      <PageSection />
      <LightAndShadow s={s} />
      <Section title="Symbols">
        <div className="grid grid-cols-5 gap-1.5" role="radiogroup" aria-label="Basket marks">
          {BASKET_MARKS.map(m => (
            <button
              key={m.value}
              role="radio"
              aria-checked={s.basketMark === m.value}
              data-testid={`basket-mark-${m.value}`}
              onClick={() => setStyle({ basketMark: m.value })}
              className={`rounded-lg border p-1 flex flex-col items-center gap-1 transition-colors ${s.basketMark === m.value ? "border-orange-500 bg-orange-500/10" : "border-zinc-700 hover:border-zinc-500"}`}
            >
              <svg viewBox="0 0 40 40" className="w-10 h-10 rounded" style={{ background: s.fairway }} dangerouslySetInnerHTML={{ __html: basketMark(m.value, { x: 20, y: m.value === "flag" ? 30 : 20 }, 2, s.basket, "7") }} />
              <span className="text-[10px] font-semibold text-zinc-300">{m.label}</span>
            </button>
          ))}
        </div>
        <div className="mt-2"><ColorInput label="Basket color" value={s.basket} onChange={v => setStyle({ basket: v }, false)} onDone={done} /></div>
        <div className="mt-3 text-xs text-zinc-400">Marking colors</div>
        <div className="mt-1 grid grid-cols-2 gap-1.5" role="radiogroup" aria-label="Marking colors">
          {([
            { value: "map", label: "Map colors", ob: s.ob, nogo: "#7c3aed" },
            { value: "pdga", label: "PDGA colors", ob: "#ffffff", nogo: RESTRICTED }
          ] as const).map(m => (
            <button
              key={m.value}
              role="radio"
              aria-checked={(s.markings ?? "map") === m.value}
              data-testid={`markings-${m.value}`}
              onClick={() => setStyle({ markings: m.value })}
              className={`rounded-lg border px-2 py-1.5 flex items-center gap-2 text-xs font-semibold text-zinc-200 transition-colors ${(s.markings ?? "map") === m.value ? "border-orange-500 bg-orange-500/10" : "border-zinc-700 hover:border-zinc-500"}`}
            >
              <span className="flex gap-0.5">
                {[m.ob, s.hazard, AREA_KINDS.casual.color, m.nogo].map((c, i) => <span key={i} className="w-2.5 h-4 rounded-sm border border-zinc-900" style={{ background: c }} />)}
              </span>
              {m.label}
            </button>
          ))}
        </div>
      </Section>
      <Section title="Title block">
        <Field label="Title"><TextInput label="Map title" value={s.title} placeholder={doc.name} onChange={v => setStyle({ title: v })} /></Field>
        <Field label="Subtitle"><TextInput label="Map subtitle" value={s.subtitle} placeholder={doc.site.location?.label ?? "Location, designer, year"} onChange={v => setStyle({ subtitle: v })} /></Field>
        <Field label="Footer note"><TextInput label="Footer note" value={s.footer} placeholder="e.g. Please carry out what you carry in" onChange={v => setStyle({ footer: v })} /></Field>
        <Field label="Lettering">
          <Segmented label="Font" value={s.font} onChange={v => setStyle({ font: v })} options={[{ value: "Script", label: <span style={{ fontFamily: "Kaushan Script" }}>Script</span> }, { value: "Oswald", label: <span style={{ fontFamily: "Oswald" }}>Oswald</span> }, { value: "Inter", label: <span style={{ fontFamily: "Inter" }}>Inter</span> }, { value: "Bitter", label: <span style={{ fontFamily: "Bitter" }}>Bitter</span> }]} />
        </Field>
        <Slider label="Label size" min={0.7} max={1.6} step={0.05} value={s.labelScale} onChange={v => setStyle({ labelScale: v })} format={v => `${Math.round(v * 100)}%`} />
      </Section>
      <Section title="Signs and cards" testid="card-style" right={s.card ? <button className="text-xs text-orange-300 hover:text-orange-200 flex items-center gap-1" onClick={() => setStyle({ card: undefined })}><RotateCcw size={12} /> Reset</button> : undefined}>
        <div className="grid grid-cols-2 gap-x-3">
          {([["header", "Header"], ["accent", "Header lettering"], ["paper", "Paper"], ["ink", "Text"]] as const).map(([key, label]) => (
            <ColorInput key={key} label={label} value={s.card?.[key] ?? CARD_DEFAULTS[key]} onChange={v => setStyle({ card: { ...s.card, [key]: v } }, false)} onDone={done} />
          ))}
        </div>
        <Field label="Course logo">
          <LogoPicker logo={s.logo} />
        </Field>
        <Field label="Headings">
          <Segmented label="Card font" value={s.card?.font ?? CARD_DEFAULTS.font} onChange={v => setStyle({ card: { ...s.card, font: v } })} options={[{ value: "Oswald", label: <span style={{ fontFamily: "Oswald" }}>Oswald</span> }, { value: "Bitter", label: <span style={{ fontFamily: "Bitter" }}>Bitter</span> }, { value: "Inter", label: <span style={{ fontFamily: "Inter" }}>Inter</span> }, { value: "Script", label: <span style={{ fontFamily: "Kaushan Script" }}>Script</span> }]} />
        </Field>
      </Section>
      <TeeSignSettings />
      <Section title="Paper">
        <Field label="Size">
          <select aria-label="Paper size" className="w-full bg-zinc-800 rounded-lg px-2 py-1.5 text-sm" value={s.paper} onChange={e => setStyle({ paper: e.target.value as PaperSize })}>
            {(Object.keys(PAPER) as PaperSize[]).map(p => <option key={p} value={p}>{PAPER[p].label}</option>)}
          </select>
        </Field>
        <Segmented label="Orientation" value={s.orientation} onChange={v => setStyle({ orientation: v })} options={[{ value: "auto", label: "Auto" }, { value: "landscape", label: "Landscape" }, { value: "portrait", label: "Portrait" }]} />
        <div className="mt-3">
          <Slider label="Turn the map" min={-180} max={180} value={s.rotation} onChange={v => setStyle({ rotation: v }, false)} onDone={done} format={v => (v === 0 ? "North up" : `${v}°`)} />
          <div className="flex gap-1.5 -mt-1">
            <Button small onClick={() => setStyle({ rotation: bestRotation(doc) })} testid="best-rotation">Turn to fill the page</Button>
            {s.rotation !== 0 && <Button small onClick={() => setStyle({ rotation: 0 })}>North up</Button>}
          </div>
        </div>
      </Section>
      <Section title="On the map">
        <Toggle label="Throw lines" checked={s.throwLines} onChange={v => setStyle({ throwLines: v })} />
        <Toggle label="Distances on the lines" checked={s.distances} onChange={v => setStyle({ distances: v })} />
        <Toggle label="Walks to the next hole (automatic)" checked={s.nextTee} onChange={v => setStyle({ nextTee: v })} />
        {s.nextTee && (
          <>
            <Slider label="Walk width" min={1} max={20} step={0.5} value={s.walkWidth ?? 6} onChange={v => setAllWalks(v, false)} onDone={done} format={v => fmtDist(v, doc.units)} />
            {autoWalks(doc.items, courseStats(doc), doc.holes).length > 0 && <div className="-mt-1 mb-1"><Button small onClick={() => editWalks(null)} testid="edit-walks">Edit the walks</Button></div>}
          </>
        )}
        <Toggle label="Putting circle (10 m)" checked={s.circle} onChange={v => setStyle({ circle: v })} />
        <Toggle label="Contour lines" checked={s.contours} onChange={v => setStyle({ contours: v })} />
        <Toggle label="Hill shading" checked={s.hillshade} onChange={v => setStyle({ hillshade: v })} />
      </Section>
      <Section title="Colors" right={<button className="text-xs text-orange-300 hover:text-orange-200 flex items-center gap-1" onClick={() => setStyle({ ...THEME_COLORS.forest, ...landscapeOf(s).colors, tallGrass: undefined })}><RotateCcw size={12} /> Style colors</button>}>
        <div className="grid grid-cols-2 gap-x-3">
          <ColorInput label="Fairway" value={s.fairway} onChange={v => setStyle({ fairway: v }, false)} onDone={done} />
          <ColorInput label="Grass" value={s.rough} onChange={v => setStyle({ rough: v }, false)} onDone={done} />
          <ColorInput label="Tall grass" value={tallGrassOf(s)} onChange={v => setStyle({ tallGrass: v }, false)} onDone={done} />
          <ColorInput label="Trees" value={s.trees} onChange={v => setStyle({ trees: v }, false)} onDone={done} />
          <ColorInput label="Water" value={s.water} onChange={v => setStyle({ water: v }, false)} onDone={done} />
          <ColorInput label="Paths" value={s.path} onChange={v => setStyle({ path: v }, false)} onDone={done} />
          <ColorInput label="OB" value={s.ob} onChange={v => setStyle({ ob: v }, false)} onDone={done} />
          <ColorInput label="Hazard" value={s.hazard} onChange={v => setStyle({ hazard: v }, false)} onDone={done} />
          <ColorInput label="Baskets" value={s.basket} onChange={v => setStyle({ basket: v }, false)} onDone={done} />
        </div>
      </Section>
      <div className="px-4 py-3">
        <Button full onClick={() => useEditor.getState().set({ step: "export" })} testid="next-step">Next: Export <ArrowRight size={15} /></Button>
      </div>
    </>
  );
}
