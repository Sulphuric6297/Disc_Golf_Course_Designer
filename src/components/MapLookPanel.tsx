// The Design step's map style: pick one of the styles, then change any part of the map on its own
// (its trees, grass, fairways, paths and roads, water and light). A part changed shows a dot, and
// the style card says "Mixed"; each part goes back to its style's own in one click.
import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, ChevronRight, RotateCcw } from "lucide-react";
import { LIGHT_MODES, LOOK_THEMES, PART_CHOICES, compassName, latitudeOf, lightOf, lookParts, partChanged, sunArc, sunFromOf, themeOf, type LookPart, type LookParts } from "../lib/mapLook";
import { useCourse } from "../state/course";
import type { MapStyle, PathTier } from "../types";
import { setStyle } from "./DesignPanel";
import { Segmented, Slider } from "./ui";

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
        <div key={t} className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-zinc-900/60 mb-1">
          <span className="text-xs text-zinc-200 flex-1">{TIER_LABEL[t]}</span>
          <button className="p-1 rounded text-zinc-400 hover:text-zinc-100 disabled:opacity-30" disabled={i === 0} aria-label={`Move ${TIER_LABEL[t]} up`} onClick={() => move(t, -1)}><ArrowUp size={13} /></button>
          <button className="p-1 rounded text-zinc-400 hover:text-zinc-100 disabled:opacity-30" disabled={i === top.length - 1} aria-label={`Move ${TIER_LABEL[t]} down`} onClick={() => move(t, 1)}><ArrowDown size={13} /></button>
        </div>
      ))}
    </div>
  );
}

const PART_LABEL: Record<LookPart | "light", string> = { trees: "Trees", grass: "Grass", fairway: "Fairways", paths: "Paths and roads", water: "Water", light: "Light and shadow" };

export function MapLookPanel() {
  const s = useCourse(c => c.doc.style);
  const [open, setOpen] = useState<LookPart | "light" | null>(null);
  const theme = themeOf(s), parts = lookParts(s), lt = lightOf(s);
  const mixed = (Object.keys(PART_LABEL) as (LookPart | "light")[]).some(p => (p === "light" ? !!s.lightMode || s.goldenSun !== undefined : partChanged(s, p)));
  /** One part's setting changed (kept apart from its style's own). */
  const setPart = <K extends LookPart>(part: K, patch: Partial<LookParts[K]>) => setStyle({ lookParts: { ...s.lookParts, [part]: { ...s.lookParts?.[part], ...patch } } });
  const resetPart = (part: LookPart | "light") => {
    if (part === "light") { setStyle({ lightMode: undefined, goldenSun: undefined, sunFrom: undefined, sunHeight: undefined, shadows: undefined }); return; }
    const own = { ...s.lookParts };
    delete own[part];
    setStyle({ lookParts: Object.keys(own).length ? own : undefined, ...(part === "paths" ? { pathOrder: undefined } : {}) });
  };
  const pickTheme = (id: string) => setStyle({ mapLook: id === "classic" ? undefined : (id as MapStyle["mapLook"]), lookParts: undefined, lightMode: undefined, goldenSun: undefined });
  const current = (p: LookPart | "light") => (p === "light" ? LIGHT_MODES.find(m => m.id === lt.mode)!.label : (PART_CHOICES[p] as { id: string; label: string }[]).find(c => c.id === parts[p].style)?.label ?? "");
  const changed = (p: LookPart | "light") => (p === "light" ? !!s.lightMode || s.goldenSun !== undefined || s.sunFrom !== undefined : partChanged(s, p) || (p === "paths" && !!s.pathOrder));
  const base = import.meta.env.BASE_URL;

  return (
    <div data-testid="map-look">
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Map style" data-testid="map-styles">
        {LOOK_THEMES.map(t => {
          const on = theme.id === t.id;
          return (
            <button key={t.id} role="radio" aria-checked={on} onClick={() => pickTheme(t.id)} title={t.hint} data-testid={`map-style-${t.id}`}
              className={`relative text-left rounded-xl overflow-hidden bg-zinc-800 ring-1 transition ${on ? "ring-2 ring-orange-400" : "ring-white/10 hover:ring-white/30"}`}>
              <img src={`${base}looks/${t.id}.jpg`} alt="" className="block w-full aspect-[3/2] object-cover" draggable={false} />
              <span className="block px-2 py-1.5 text-xs font-semibold text-zinc-100">{t.label}</span>
              {on && mixed && <span className="absolute top-1.5 right-1.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-black/60 text-orange-200">Mixed</span>}
            </button>
          );
        })}
      </div>
      <div className="text-[11px] text-zinc-500 mt-1.5 mb-3">{theme.hint}</div>

      <div className="flex items-center justify-between mb-1.5">
        <div className="text-xs font-semibold text-zinc-400">Parts of the map</div>
        {mixed && <button className="text-xs text-orange-300 hover:text-orange-200 flex items-center gap-1" onClick={() => pickTheme(theme.id)}><RotateCcw size={12} /> Reset all</button>}
      </div>
      {(Object.keys(PART_LABEL) as (LookPart | "light")[]).map(p => {
        const isOpen = open === p;
        return (
          <div key={p} className="rounded-lg bg-zinc-800/70 mb-1.5" data-testid={`look-part-${p}`}>
            <button className="w-full flex items-center gap-2 px-2.5 py-2 text-left" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : p)}>
              <span className="text-sm font-semibold text-zinc-100 flex-1">{PART_LABEL[p]}</span>
              {changed(p) && <span className="w-1.5 h-1.5 rounded-full bg-orange-400" aria-label="Changed" />}
              <span className="text-xs text-zinc-400">{current(p)}</span>
              <ChevronRight size={14} className={`text-zinc-500 transition-transform ${isOpen ? "rotate-90" : ""}`} />
            </button>
            {isOpen && (
              <div className="px-2.5 pb-3">
                {p === "light" ? (
                  <>
                    <Segmented label="Light" value={lt.mode} onChange={v => setStyle({ lightMode: v })} options={LIGHT_MODES.map(m => ({ value: m.id, label: m.label }))} />
                    <div className="h-2" />
                    {lt.mode === "golden" && <LookSlider value={lt.sun} label="Golden sun" min={0} max={1} step={0.05} format={x => (x < 0.05 ? "The style's daylight" : pct(x))} onDone={v => setStyle({ goldenSun: v, lightMode: "golden" })} />}
                    <SunFromSlider s={s} />
                    {lt.mode === "midday" && <LookSlider value={s.sunHeight ?? 38} label="Sun height" min={12} max={80} step={2} format={x => `${Math.round(x)}° · ${x < 25 ? "long shadows" : x < 50 ? "afternoon" : "midday"}`} onDone={v => setStyle({ sunHeight: v })} />}
                    <LookSlider value={s.shadows ?? 0.65} label="Shadows" min={0} max={1} step={0.05} format={pct} onDone={v => setStyle({ shadows: v })} />
                  </>
                ) : (
                  <>
                    <div className="flex flex-wrap gap-1.5 mb-2" role="radiogroup" aria-label={PART_LABEL[p]}>
                      {(PART_CHOICES[p] as { id: string; label: string }[]).map(c => {
                        const on = parts[p].style === c.id;
                        return (
                          <button key={c.id} role="radio" aria-checked={on} onClick={() => setPart(p, { style: c.id } as never)}
                            className={`px-2.5 py-1.5 rounded-md text-xs font-semibold ${on ? "bg-orange-500/20 text-orange-100 ring-1 ring-orange-400" : "bg-zinc-900/60 text-zinc-300 hover:bg-zinc-700"}`}>{c.label}</button>
                        );
                      })}
                    </div>
                    {p === "trees" && parts.trees.style !== "classic" && (
                      <>
                        <LookSlider value={parts.trees.density} label="Density" min={0.4} max={1.6} step={0.05} format={pct} onDone={v => setPart("trees", { density: v })} />
                        <LookSlider value={parts.trees.size} label="Size" min={0.6} max={1.5} step={0.05} format={pct} onDone={v => setPart("trees", { size: v })} />
                        <LookSlider value={parts.trees.variety} label="Color variety" min={0} max={1} step={0.05} format={pct} onDone={v => setPart("trees", { variety: v })} />
                        <LookSlider value={parts.trees.pines} label="Pines" min={0} max={0.9} step={0.05} format={pct} onDone={v => setPart("trees", { pines: v })} />
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
  );
}
