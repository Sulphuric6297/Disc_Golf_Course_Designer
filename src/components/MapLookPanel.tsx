// The Design step's map style: pick one of the styles, then change any part of the map on its own
// (its trees, grass, fairways, paths and roads, water and light), each choice shown as a picture.
// A part changed shows a dot, and the style card says "Mixed"; each part goes back to its style's
// own in one click. Each part's colors are the course's own: kept when the style changes.
import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, ChevronRight, RotateCcw } from "lucide-react";
import { COLOR_PICKS, conifersOf, paintedPinesOf, tallGrassOf, treeMixOf } from "../lib/landscapes";
import { LIGHT_MODES, LOOK_THEMES, PART_CHOICES, compassName, latitudeOf, lightOf, lookParts, partChanged, sunArc, sunFromOf, themeOf, type LookPart, type LookParts } from "../lib/mapLook";
import { useCourse } from "../state/course";
import type { MapStyle, PathTier } from "../types";
import { FineTuning, setStyle, WoodsOptions } from "./DesignPanel";
import { ColorInput, Slider } from "./ui";

/** A slider that changes the map when let go (painting takes a moment). */
function LookSlider({ value, label, min, max, step, format, onDone }: { value: number; label: string; min: number; max: number; step: number; format: (v: number) => string; onDone: (v: number) => void }) {
  const [v, setV] = useState(value);
  const moved = useRef(false);
  useEffect(() => { setV(value); }, [value]);
  return <Slider label={label} min={min} max={max} step={step} value={v} onChange={x => { moved.current = true; setV(x); }} onDone={() => { if (moved.current && v !== value) onDone(v); moved.current = false; }} format={format} />;
}
const pct = (x: number) => `${Math.round(x * 100)}%`;

/** Where the sun shines from, by the compass: only along the sun's real path at the course's
 * latitude (never from the north, north of the tropics). */
export function SunFromSlider({ s, live }: { s: MapStyle; live?: boolean }) {
  const site = useCourse(c => c.doc.site);
  const lat = latitudeOf(site);
  const { mid, half } = sunArc(lat);
  const bearing = sunFromOf(s, lat);
  const off = ((bearing - mid + 540) % 360) - 180;
  const [v, setV] = useState(off);
  useEffect(() => { setV(off); }, [off]);
  const toBearing = (o: number) => Math.round((mid + o + 360) % 360);
  return (
    <Slider label="Sun from the" min={-half} max={half} step={5} value={v}
      onChange={x => { setV(x); if (live) setStyle({ sunFrom: toBearing(x) }, false); }}
      onDone={() => { if (live) useCourse.getState().commit(); else if (toBearing(v) !== bearing) setStyle({ sunFrom: toBearing(v) }); }}
      format={x => compassName(toBearing(x))} />
  );
}

const TIER_LABEL: Record<PathTier, string> = { dirt: "Dirt trails", gravel: "Gravel and wood chips", walkway: "Paved walkways", road: "Roads and parking" };
const DEFAULT_ORDER: PathTier[] = ["dirt", "gravel", "walkway", "road"];

/** How paths and roads stack where they cross: top of the list is drawn on top. */
function PathOrder({ s }: { s: MapStyle }) {
  const order = s.pathOrder?.length === 4 ? s.pathOrder : DEFAULT_ORDER;
  const top = [...order].reverse();
  const move = (t: PathTier, by: number) => {
    const list = [...top], i = list.indexOf(t), j = i + by;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    const next = list.reverse();
    setStyle({ pathOrder: next.join() === DEFAULT_ORDER.join() ? undefined : next });
  };
  return (
    <div className="mt-2" data-testid="path-order">
      <div className="text-xs text-zinc-400 mb-1">Where they cross, on top first</div>
      {top.map((t, i) => (
        <div key={t} className="flex items-center gap-2 px-2 py-1.5 rounded-md glass mb-1">
          <span className="text-xs text-zinc-200 flex-1">{TIER_LABEL[t]}</span>
          <button className="p-1 rounded text-zinc-400 hover:text-zinc-100 disabled:opacity-30" disabled={i === 0} aria-label={`Move ${TIER_LABEL[t]} up`} onClick={() => move(t, -1)}><ArrowUp size={13} /></button>
          <button className="p-1 rounded text-zinc-400 hover:text-zinc-100 disabled:opacity-30" disabled={i === top.length - 1} aria-label={`Move ${TIER_LABEL[t]} down`} onClick={() => move(t, 1)}><ArrowDown size={13} /></button>
        </div>
      ))}
    </div>
  );
}

type Part = LookPart | "light";
const PART_LABEL: Record<Part, string> = { trees: "Trees", grass: "Grass", fairway: "Fairways", paths: "Paths and roads", water: "Water", light: "Light and shadow" };
/** Each part's color on the map (its field in the style), and its own color's label. */
const COLOR_FIELD = { trees: "trees", grass: "rough", fairway: "fairway", paths: "path", water: "water" } as const;
const COLOR_LABEL: Record<LookPart, string> = { trees: "Trees", grass: "Grass", fairway: "Fairway", paths: "Paths", water: "Water" };
const commit = () => useCourse.getState().commit();

type Thumb = { id: string; label: string; img: string; on: boolean; pick: () => void };
/** Choices as pictures (each a small painting of the map with it), two to a row. */
function Thumbs({ label, items, testid }: { label: string; items: Thumb[]; testid?: string }) {
  return (
    <div className="grid grid-cols-2 gap-x-2 gap-y-2.5 mb-2.5" role="radiogroup" aria-label={label} data-testid={testid}>
      {items.map(c => (
        <button key={c.id} role="radio" aria-checked={c.on} onClick={c.pick} data-testid={testid && `${testid}-${c.id}`} className="group text-center rounded-[12px]">
          <img src={c.img} alt="" loading="lazy" className={`block w-full aspect-[3/2] object-cover rounded-[12px] transition ${c.on ? "ring-[2.5px] ring-orange-400" : "ring-1 ring-white/15 group-hover:ring-white/35"}`} draggable={false} />
          <span className={`block px-1 pt-1 text-[11px] leading-tight ${c.on ? "text-zinc-50 font-semibold" : "text-zinc-400"}`}>{c.label}</span>
        </button>
      ))}
    </div>
  );
}

/** A part's colors: a few to pick (as pictures), or its own. */
function PartColors({ p, s }: { p: LookPart; s: MapStyle }) {
  const field = COLOR_FIELD[p], value = s[field], base = import.meta.env.BASE_URL;
  const mix = treeMixOf(s).join();
  const picks = COLOR_PICKS[p] as { id: string; label: string; color: string; mix?: string[] }[];
  return (
    <>
      <div className="text-xs text-zinc-400 mt-1 mb-1">{p === "trees" ? "Leaf colors" : "Colors"}</div>
      <Thumbs label={`${PART_LABEL[p]} colors`} testid={`colors-${p}`} items={picks.map(c => ({
        id: c.id, label: c.label, img: `${base}parts/${p}-color-${c.id}.jpg`,
        on: c.color.toLowerCase() === value.toLowerCase() && (p !== "trees" || (c.mix ?? []).join() === mix),
        pick: () => setStyle({ [field]: c.color, ...(p === "trees" ? { treeMix: c.mix ?? [] } : {}) })
      }))} />
      <ColorInput label={COLOR_LABEL[p]} value={value} onChange={v => setStyle({ [field]: v, ...(p === "trees" ? { treeMix: [] } : {}) }, false)} onDone={commit} />
      {p === "grass" && <ColorInput label="Tall grass" value={tallGrassOf(s)} onChange={v => setStyle({ tallGrass: v }, false)} onDone={commit} />}
    </>
  );
}

export function MapLookPanel() {
  const s = useCourse(c => c.doc.style);
  // (the trees open to start with: the part most changed)
  const [open, setOpen] = useState<Part | null>("trees");
  const theme = themeOf(s), parts = lookParts(s), lt = lightOf(s);
  const mixed = (Object.keys(PART_LABEL) as Part[]).some(p => (p === "light" ? !!s.lightMode || s.goldenSun !== undefined : partChanged(s, p)));
  /** One part's setting changed (kept apart from its style's own). */
  const setPart = <K extends LookPart>(part: K, patch: Partial<LookParts[K]>) => setStyle({ lookParts: { ...s.lookParts, [part]: { ...s.lookParts?.[part], ...patch } } });
  const resetPart = (part: Part) => {
    if (part === "light") { setStyle({ lightMode: undefined, goldenSun: undefined, sunFrom: undefined, sunHeight: undefined, shadows: undefined }); return; }
    const own = { ...s.lookParts };
    delete own[part];
    setStyle({ lookParts: Object.keys(own).length ? own : undefined, ...(part === "paths" ? { pathOrder: undefined } : {}) });
  };
  const pickTheme = (id: string) => setStyle({ mapLook: id === "classic" ? undefined : (id as MapStyle["mapLook"]), lookParts: undefined, lightMode: undefined, goldenSun: undefined });
  const current = (p: Part) => (p === "light" ? LIGHT_MODES.find(m => m.id === lt.mode)!.label : (PART_CHOICES[p] as { id: string; label: string }[]).find(c => c.id === parts[p].style)?.label ?? "");
  const changed = (p: Part) => (p === "light" ? !!s.lightMode || s.goldenSun !== undefined || s.sunFrom !== undefined : partChanged(s, p) || (p === "paths" && !!s.pathOrder));
  const base = import.meta.env.BASE_URL;
  const painted = parts.trees.style !== "classic";
  const pinesNow = painted ? paintedPinesOf(s, parts.trees.pines) : conifersOf(s);

  return (
    <div data-testid="map-look">
      <div className="grid grid-cols-2 gap-x-2.5 gap-y-3" role="radiogroup" aria-label="Map style" data-testid="map-styles">
        {LOOK_THEMES.map(t => {
          const on = theme.id === t.id;
          return (
            <button key={t.id} role="radio" aria-checked={on} onClick={() => pickTheme(t.id)} title={t.hint} data-testid={`map-style-${t.id}`} className="group relative text-center rounded-[14px]">
              <img src={`${base}looks/${t.id}.jpg`} alt="" className={`block w-full aspect-[3/2] object-cover rounded-[14px] transition ${on ? "ring-[2.5px] ring-orange-400" : "ring-1 ring-white/15 group-hover:ring-white/35"}`} draggable={false} />
              <span className={`block pt-1.5 text-xs ${on ? "text-zinc-50 font-semibold" : "text-zinc-400"}`}>{t.label}</span>
              {on && mixed && <span className="absolute top-1.5 right-1.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-black/55 backdrop-blur text-orange-200">Mixed</span>}
            </button>
          );
        })}
      </div>
      <div className="text-[11px] text-zinc-500 mt-1.5 mb-3">{theme.hint}</div>

      <div className="flex items-center justify-between mb-1.5">
        <div className="text-[12px] font-semibold text-zinc-400 px-1">Parts of the map</div>
        {mixed && <button className="text-xs text-orange-300 hover:text-orange-200 flex items-center gap-1" onClick={() => pickTheme(theme.id)}><RotateCcw size={12} /> Reset all</button>}
      </div>
      <div className="rounded-[16px] bg-white/[0.06] overflow-hidden">
      {(Object.keys(PART_LABEL) as Part[]).map(p => {
        const isOpen = open === p;
        const pic = p === "light" ? `${base}parts/light-${lt.mode}.jpg` : `${base}parts/${p}-${parts[p].style}.jpg`;
        return (
          <div key={p} className="relative before:absolute before:left-[52px] before:right-0 before:top-0 before:h-px before:bg-white/[0.07] first:before:hidden" data-testid={`look-part-${p}`}>
            <button className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-white/[0.04]" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : p)}>
              <img src={pic} alt="" className="w-7 h-7 rounded-[8px] object-cover ring-1 ring-white/10" draggable={false} />
              <span className="text-[13.5px] font-medium text-zinc-100 flex-1">{PART_LABEL[p]}</span>
              {changed(p) && <span className="w-1.5 h-1.5 rounded-full bg-orange-400" aria-label="Changed" />}
              {p !== "light" && <span className="w-3 h-3 rounded-[4px] ring-1 ring-white/20" style={{ background: s[COLOR_FIELD[p]] }} />}
              <span className="text-[12.5px] text-zinc-400">{current(p)}</span>
              <ChevronRight size={15} className={`text-zinc-500 transition-transform ${isOpen ? "rotate-90" : ""}`} />
            </button>
            {isOpen && (
              <div className="px-3 pb-3.5 pt-0.5">
                {p === "light" ? (
                  <>
                    <Thumbs label="Light" items={LIGHT_MODES.map(m => ({ id: m.id, label: m.label, img: `${base}parts/light-${m.id}.jpg`, on: lt.mode === m.id, pick: () => setStyle({ lightMode: m.id }) }))} />
                    {lt.mode === "golden" && <LookSlider value={lt.sun} label="Golden sun" min={0} max={1} step={0.05} format={x => (x < 0.05 ? "The style's daylight" : pct(x))} onDone={v => setStyle({ goldenSun: v, lightMode: "golden" })} />}
                    <SunFromSlider s={s} />
                    {lt.mode === "midday" && <LookSlider value={s.sunHeight ?? 38} label="Sun height" min={12} max={80} step={2} format={x => `${Math.round(x)}° · ${x < 25 ? "long shadows" : x < 50 ? "afternoon" : "midday"}`} onDone={v => setStyle({ sunHeight: v })} />}
                    <LookSlider value={s.shadows ?? 0.65} label="Shadows" min={0} max={1} step={0.05} format={pct} onDone={v => setStyle({ shadows: v })} />
                    <div className="-mx-4"><FineTuning s={s} /></div>
                  </>
                ) : (
                  <>
                    <Thumbs label={PART_LABEL[p]} items={(PART_CHOICES[p] as { id: string; label: string }[]).map(c => ({ id: c.id, label: c.label, img: `${base}parts/${p}-${c.id}.jpg`, on: parts[p].style === c.id, pick: () => setPart(p, { style: c.id } as never) }))} />
                    <PartColors p={p} s={s} />
                    {p === "trees" && (
                      <>
                        <LookSlider value={pinesNow} label="Pines" min={0} max={0.9} step={0.05} format={pct} onDone={v => setStyle({ conifers: v })} />
                        <WoodsOptions s={s} />
                        {painted && (
                          <>
                            <LookSlider value={parts.trees.density} label="Density" min={0.4} max={1.6} step={0.05} format={pct} onDone={v => setPart("trees", { density: v })} />
                            <LookSlider value={parts.trees.size} label="Size" min={0.6} max={1.5} step={0.05} format={pct} onDone={v => setPart("trees", { size: v })} />
                            <LookSlider value={parts.trees.variety} label="Color variety" min={0} max={1} step={0.05} format={pct} onDone={v => setPart("trees", { variety: v })} />
                          </>
                        )}
                      </>
                    )}
                    {p === "grass" && (
                      <>
                        <LookSlider value={parts.grass.bright} label="Brightness" min={0.7} max={1.5} step={0.02} format={pct} onDone={v => setPart("grass", { bright: v })} />
                        {parts.grass.style !== "painted" && <LookSlider value={parts.grass.texture} label="Texture" min={0} max={2} step={0.05} format={pct} onDone={v => setPart("grass", { texture: v })} />}
                      </>
                    )}
                    {p === "fairway" && <LookSlider value={parts.fairway.bright} label="Brightness" min={0.8} max={1.3} step={0.02} format={pct} onDone={v => setPart("fairway", { bright: v })} />}
                    {p === "paths" && <PathOrder s={s} />}
                  </>
                )}
                {changed(p) && <button className="mt-2 text-xs text-orange-300 hover:text-orange-200 flex items-center gap-1" onClick={() => resetPart(p)}><RotateCcw size={12} /> Back to the style's own</button>}
              </div>
            )}
          </div>
        );
      })}
      </div>
    </div>
  );
}
