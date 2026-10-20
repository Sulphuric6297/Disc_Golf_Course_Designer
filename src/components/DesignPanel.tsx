// The Design step's controls: how the printed map looks (theme, colors, title block, what shows).
import { ArrowRight, RotateCcw } from "lucide-react";
import { BASKET_MARKS, PAPER, THEME_COLORS, THEME_SHOWS, THEMES, basketMark, bestRotation, palette } from "../lib/mapSvg";
import { changeDoc, useCourse, useEditor } from "../state/course";
import { AREA_KINDS } from "../constants";
import { RESTRICTED } from "../lib/symbols";
import { LandscapePicker } from "./LandscapePicker";
import { useEffect, useRef, useState } from "react";
import type { MapStyle, MapTheme, PaperSize } from "../types";
import { Button, ColorInput, Field, Section, Segmented, Slider, TextInput, Toggle } from "./ui";

export const setStyle = (patch: Partial<MapStyle>, history = true) => changeDoc(d => ({ style: { ...d.style, ...patch } }), history);

/** How thick the painted woods are. The map repaints when the slider is let go (painting takes a moment). */
/** A slider for a style setting that repaints the map: it changes the map when let go. */
export function StyleSlider<K extends keyof MapStyle>({ k, value, label, min, max, step, format }: { k: K; value: number; label: string; min: number; max: number; step: number; format: (v: number) => string }) {
  const [v, setV] = useState(value);
  // Only a slider that was moved commits (a key let go on it, like Ctrl+Z's, must not)
  const moved = useRef(false);
  useEffect(() => setV(value), [value]);
  const done = () => {
    if (moved.current && v !== value) setStyle({ [k]: v } as Partial<MapStyle>);
    moved.current = false;
  };
  return <Slider label={label} min={min} max={max} step={step} value={v} onChange={x => { moved.current = true; setV(x); }} onDone={done} format={format} />;
}

const TreeCover = ({ value }: { value: number }) => (
  <StyleSlider k="treeCover" value={value} label="Tree cover" min={0.1} max={1} step={0.05} format={x => `${x < 0.35 ? "Sparse" : x < 0.7 ? "Open woods" : x < 0.95 ? "Thick" : "Dense"} · ${Math.round(x * 100)}%`} />
);

export const FROM = ["top", "top right", "right", "bottom right", "bottom", "bottom left", "left", "top left"];
export const signed = (x: number) => `${x > 0 ? "+" : x < 0 ? "−" : ""}${Math.round(Math.abs(x) * 100)}%`;

/** Where the light comes from, how long and dark the shadows are, and the picture's tone. */
function LightAndShadow({ s }: { s: MapStyle }) {
  return (
    <Section title="Light and shadow" testid="light-shadow" right={<button className="text-xs text-orange-300 hover:text-orange-200 flex items-center gap-1" onClick={() => setStyle({ sunAngle: 315, sunHeight: 38, shadows: 0.65, light: 0, contrast: 0, colorStrength: 1, paint: 0.8 })}><RotateCcw size={12} /> Reset</button>}>
      <StyleSlider k="sunAngle" value={s.sunAngle ?? 315} label="Sun from the" min={0} max={359} step={5} format={x => FROM[Math.round(x / 45) % 8]} />
      <StyleSlider k="sunHeight" value={s.sunHeight ?? 38} label="Sun height" min={12} max={80} step={2} format={x => `${Math.round(x)}° · ${x < 25 ? "long shadows" : x < 50 ? "afternoon" : "midday"}`} />
      <StyleSlider k="shadows" value={s.shadows ?? 0.65} label="Shadows" min={0} max={1} step={0.05} format={x => `${Math.round(x * 100)}%`} />
      <StyleSlider k="light" value={s.light ?? 0} label="Brightness" min={-0.3} max={0.3} step={0.02} format={signed} />
      <StyleSlider k="contrast" value={s.contrast ?? 0} label="Contrast" min={-0.3} max={0.4} step={0.02} format={signed} />
      <StyleSlider k="colorStrength" value={s.colorStrength ?? 1} label="Color strength" min={0.3} max={1.4} step={0.05} format={x => `${Math.round(x * 100)}%`} />
      <StyleSlider k="paint" value={s.paint ?? 0.8} label="Painted look" min={0} max={1} step={0.05} format={x => (x < 0.25 ? "Smooth" : x < 0.7 ? "Soft bands" : "Painted bands")} />
    </Section>
  );
}

export function DesignPanel() {
  const doc = useCourse(s => s.doc);
  const s = doc.style;
  const ro = useEditor(e => e.viewOnly);
  // Color pickers change the map live while dragging; the change is one undo step when it ends
  const done = () => useCourse.getState().commit();
  if (ro) return <Section><p className="text-sm text-zinc-400">This is how the course map prints. Make a copy to change its look.</p></Section>;
  return (
    <>
      <Section title="Style" testid="themes">
        <div className="grid grid-cols-2 gap-2">
          {(Object.keys(THEMES) as MapTheme[]).map(t => {
            const pal = palette({ ...s, ...THEME_COLORS[t], theme: t });
            const c = THEME_COLORS[t];
            return (
              <button
                key={t}
                data-testid={`theme-${t}`}
                aria-pressed={s.theme === t}
                onClick={() => setStyle({ theme: t, ...THEME_COLORS[t], ...THEME_SHOWS[t] })}
                className={`text-left rounded-lg border p-2 transition-colors ${s.theme === t ? "border-orange-400 bg-orange-500/10" : "border-zinc-700 hover:border-zinc-500"}`}
              >
                <div className="h-10 rounded-md mb-1.5 relative overflow-hidden" style={{ background: t === "satellite" ? "linear-gradient(135deg,#3b5a2c,#6b7f4a 40%,#4a6a35)" : t === "forest" ? `radial-gradient(circle at 20% 30%, ${c.trees} 0 18%, transparent 19%), radial-gradient(circle at 75% 25%, ${c.trees} 0 16%, transparent 17%), radial-gradient(circle at 55% 85%, ${c.trees} 0 20%, transparent 21%), radial-gradient(circle at 90% 80%, ${c.trees} 0 18%, transparent 19%), ${pal.bg}` : pal.bg }}>
                  <div className="absolute left-2 right-6 top-4 h-3 rounded-full" style={{ background: c.fairway, opacity: 0.9 }} />
                  <div className="absolute right-3 top-2 w-4 h-4 rounded-full" style={{ background: c.trees }} />
                  <div className="absolute left-3 top-4 w-2 h-3 rounded-sm" style={{ background: "#2563eb" }} />
                  <div className="absolute right-6 top-[18px] w-2 h-2 rounded-full" style={{ background: c.basket, border: "1px solid #111" }} />
                  <div className="absolute left-0 right-0 bottom-0 h-2" style={{ background: c.water, opacity: 0.8 }} />
                </div>
                <div className="text-xs font-bold text-zinc-100">{THEMES[t].label}</div>
                <div className="text-[10px] text-zinc-400 leading-tight">{THEMES[t].blurb}</div>
              </button>
            );
          })}
        </div>
        {s.theme === "forest" && (
          <div className="mt-3" data-testid="forest-options">
            <Field label="Where to paint the woods">
              <Segmented label="Woods" value={s.forest} onChange={v => setStyle({ forest: v })} options={[{ value: "photo", label: "From the photo", title: "Woods where the satellite photo shows trees" }, { value: "everywhere", label: "Everywhere", title: "Woods everywhere off the fairways, paths and open areas" }, { value: "woods", label: "Drawn only", title: "Only the woods areas and single trees you drew" }]} />
            </Field>
            <TreeCover value={s.treeCover ?? 1} />
            <p className="text-[11px] text-zinc-500 -mt-1">Fairways, putting areas, paths, water and open areas you draw stay clear. Lone trees you place stand in the open.</p>
          </div>
        )}
        {s.theme === "satellite" && !doc.background && <p className="text-[11px] text-amber-300 mt-2">There is no satellite photo yet: bring in your park on the Site step.</p>}
        {s.theme === "satellite" && doc.background && <div className="mt-2"><Slider label="Photo strength" min={0.2} max={1} step={0.05} value={s.photo} onChange={v => setStyle({ photo: v })} format={v => `${Math.round(v * 100)}%`} /></div>}
      </Section>
      <Section title="Landscape">
        <LandscapePicker />
        <p className="text-[11px] text-zinc-500 mt-1.5">{s.theme === "forest" ? "Sets the painted map's colors and woods, and the 3D view's grass and trees." : "The 3D view's grass and trees (this style keeps its own colors)."}</p>
      </Section>
      {s.theme === "forest" && <LightAndShadow s={s} />}
      <Section title="Symbols">
        <div className="grid grid-cols-5 gap-1.5" role="radiogroup" aria-label="Basket marks">
          {BASKET_MARKS.map(m => (
            <button
              key={m.value}
              role="radio"
              aria-checked={s.basketMark === m.value}
              title={m.title}
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
            { value: "map", label: "Map colors", title: "Red OB, purple out of play: what most course maps and signs use", ob: s.ob, nogo: "#7c3aed" },
            { value: "pdga", label: "PDGA colors", title: "The colors courses are marked with on the ground: white OB, red out of play (relief required)", ob: "#ffffff", nogo: RESTRICTED }
          ] as const).map(m => (
            <button
              key={m.value}
              role="radio"
              aria-checked={(s.markings ?? "map") === m.value}
              title={m.title}
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
      <Section title="Paper">
        <Field label="Size">
          <select aria-label="Paper size" className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-sm" value={s.paper} onChange={e => setStyle({ paper: e.target.value as PaperSize })}>
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
        <Toggle label="Walks to the next tee" checked={s.nextTee} onChange={v => setStyle({ nextTee: v })} />
        <Toggle label="Putting circle (10 m)" checked={s.circle} onChange={v => setStyle({ circle: v })} />
        <Toggle label="Contour lines" checked={s.contours} onChange={v => setStyle({ contours: v })} />
        <Toggle label="Hill shading" checked={s.hillshade} onChange={v => setStyle({ hillshade: v })} />
        <Toggle label="Legend" checked={s.legend} onChange={v => setStyle({ legend: v })} />
        <Toggle label="Hole table" checked={s.holeTable} onChange={v => setStyle({ holeTable: v })} />
        <Toggle label="North arrow" checked={s.north} onChange={v => setStyle({ north: v })} />
        <Toggle label="Scale bar" checked={s.scale} onChange={v => setStyle({ scale: v })} />
      </Section>
      <Section title="Colors" right={<button className="text-xs text-orange-300 hover:text-orange-200 flex items-center gap-1" onClick={() => setStyle(THEME_COLORS[s.theme])}><RotateCcw size={12} /> Theme colors</button>}>
        <div className="grid grid-cols-2 gap-x-3">
          <ColorInput label="Fairway" value={s.fairway} onChange={v => setStyle({ fairway: v }, false)} onDone={done} />
          <ColorInput label="Grass" value={s.rough} onChange={v => setStyle({ rough: v }, false)} onDone={done} />
          <ColorInput label="Trees" value={s.trees} onChange={v => setStyle({ trees: v }, false)} onDone={done} />
          <ColorInput label="Water" value={s.water} onChange={v => setStyle({ water: v }, false)} onDone={done} />
          <ColorInput label="Paths" value={s.path} onChange={v => setStyle({ path: v }, false)} onDone={done} />
          <ColorInput label="OB" value={s.ob} onChange={v => setStyle({ ob: v }, false)} onDone={done} />
          <ColorInput label="Hazard" value={s.hazard} onChange={v => setStyle({ hazard: v }, false)} onDone={done} />
          <ColorInput label="Baskets" value={s.basket} onChange={v => setStyle({ basket: v }, false)} onDone={done} />
        </div>
        <p className="text-[11px] text-zinc-500 mt-1">The live map uses the grass and fairway colors too (turn the photo off on the Site step to see the drawn map in 3D).</p>
      </Section>
      <div className="px-4 py-3">
        <Button full onClick={() => useEditor.getState().set({ step: "export" })} testid="next-step">Next: Export <ArrowRight size={15} /></Button>
      </div>
    </>
  );
}
