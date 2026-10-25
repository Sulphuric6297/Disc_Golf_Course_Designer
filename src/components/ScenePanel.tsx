// The view: what this device shows while working (the photo, lines, grass), and the course's own
// landscape, basket band, sun and shadows. The rest of the light is the course map's, set with its
// look on the Map step.
import { useEffect, useRef, useState } from "react";
import { ChevronRight, Layers, X } from "lucide-react";
import { FOCUS, HelpLink, POPOVER } from "./ui";
import { useCourse, useEditor } from "../state/course";
import { setStyle, StyleSlider } from "./DesignPanel";
import { Segmented, Toggle } from "./ui";
import { LandscapePicker } from "./LandscapePicker";
import { SunFromSlider } from "./MapLookPanel";
import { SHOW_EVENT, showSetting } from "./showSetting";
import { BAND_COLORS, BASKET_BAND } from "../three/courseModels";

/** The View button. `big`: a thumb's size, its panel opening to its left (beside it) rather than
 * below; `size` sets the button's size alone (44 px beside other 44 px buttons); `label`: a tile,
 * the icon over a 12 px label (a phone's tee view card). */
export function SceneButton({ className = "", big = false, size, label }: { className?: string; big?: boolean; size?: "small" | "big"; label?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  // (opened by search: a setting in it asked for)
  useEffect(() => {
    const on = (e: Event) => { if ((e as CustomEvent).detail === "view") setOpen(true); };
    window.addEventListener(SHOW_EVENT, on);
    return () => window.removeEventListener(SHOW_EVENT, on);
  }, []);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    // (Esc closes just this, before the map hears it)
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); setOpen(false); } };
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", esc, true);
    return () => { window.removeEventListener("pointerdown", close); window.removeEventListener("keydown", esc, true); };
  }, [open]);
  // (no backdrop blur: on a touch screen it turns near-black, index.css)
  const large = (size ?? (big ? "big" : "small")) === "big";
  return (
    <div className={`relative pointer-events-auto ${className}`} ref={ref}>
      {label ? (
        <button
          className={`w-14 h-11 rounded-xl flex flex-col items-center justify-center gap-0.5 text-[12px] font-semibold text-white ${FOCUS} ${open ? "bg-white/15" : "bg-white/[0.07] active:bg-white/15"}`}
          title="View: photo, lines, grass, landscape"
          aria-expanded={open}
          onClick={() => setOpen(o => !o)}
          data-testid="scene-button"
        >
          <Layers size={17} /><span className="leading-none">{label}</span>
        </button>
      ) : (
        <button
          className={`glass ${large ? "rounded-2xl w-11 h-11" : "rounded-lg w-8 h-8"} flex items-center justify-center shadow-lg shadow-black/30 ring-1 transition-colors ${FOCUS} ${open ? "ring-sky-400 text-zinc-50" : "ring-white/10 text-zinc-300 hover:text-zinc-50"}`}
          title="View: photo, lines, grass, landscape"
          aria-label="View"
          aria-expanded={open}
          onClick={() => setOpen(o => !o)}
          data-testid="scene-button"
        >
          <Layers size={large ? 20 : 16} />
        </button>
      )}
      {open && <ScenePanel onClose={() => setOpen(false)} big={big || !!label} place={label ? "right-0 top-[52px]" : big ? "right-[52px] top-0" : "right-0 top-10"} />}
    </div>
  );
}

const HEAD = "text-[11px] font-semibold text-zinc-500 mb-1.5";

function ScenePanel({ onClose, big, place }: { onClose: () => void; big?: boolean; place: string }) {
  const s = useCourse(c => c.doc.style);
  const grass = useEditor(e => e.grass);
  const wind = useEditor(e => e.wind);
  const stumps = useEditor(e => e.stumps);
  const measured = useCourse(c => !!c.doc.lidar?.trees.length && !c.readOnly);
  const editing = useCourse(c => !c.readOnly);
  const ed = useEditor();
  const set = useEditor(e => e.set);
  // (as tall as the room below it on screen, scrolling inside: never cut off at the bottom)
  const box = useRef<HTMLDivElement>(null);
  const [room, setRoom] = useState<number | null>(null);
  useEffect(() => {
    const fit = () => { const r = box.current?.getBoundingClientRect(); if (r) setRoom(Math.max(180, window.innerHeight - r.top - 16)); };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);
  // (from a tee or in a flyover, the ground there: painted or the photo)
  const fromTee = !!ed.teeView;
  // (the painted map on the ground repaints with the sun: changed when a slider is let go)
  const live = !(fromTee && ed.flyLook === "painted");
  return (
    <div ref={box} className={`absolute ${place} overflow-y-auto dg-scroll overscroll-contain w-72 ${POPOVER} p-3 z-30 text-left`} style={room ? { maxHeight: room } : undefined} data-testid="scene-panel">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-semibold text-zinc-100 flex items-center gap-1.5">View <HelpLink topic="view-panel" label="View" /></div>
        <button className={`text-zinc-400 hover:text-zinc-50 ${big ? "w-9 h-9 -m-2 flex items-center justify-center" : ""}`} title="Close" aria-label="Close" onClick={onClose}><X size={15} /></button>
      </div>
      {/* This device's view while working: not saved with the course (viewers' own look: Share) */}
      <div className={HEAD}>This screen</div>
      {editing && (
        <div className="mb-2" data-testid="map-display">
          {/* (from a tee the ground is the flight's: the same setting as the tee view's Settings) */}
          {fromTee ? (
            <div className="mb-2" data-testid="view-ground">
              <div className="text-xs text-zinc-400 mb-1">Ground</div>
              <Segmented label="Ground" value={ed.flyLook} onChange={v => set({ flyLook: v })} options={[{ value: "painted", label: "Painted map" }, { value: "photo", label: "Photo" }]} />
            </div>
          ) : <Toggle label="Satellite photo" checked={ed.photo} onChange={v => set({ photo: v })} />}
          <Toggle label="Contour lines" checked={ed.contours} onChange={v => set({ contours: v })} />
          <Toggle label="Hill shading" checked={ed.shading} onChange={v => set({ shading: v })} />
          <Toggle label="Ground texture up close" checked={ed.groundDetail} onChange={v => set({ groundDetail: v })} />
        </div>
      )}
      <div className="text-xs text-zinc-400 mb-1">Grass blades</div>
      <Segmented
        label="Grass blades"
        value={grass}
        onChange={v => set({ grass: v })}
        options={[
          { value: "auto", label: "Auto" },
          { value: 0, label: "Off" },
          { value: 1, label: "Low" },
          { value: 2, label: "Medium" },
          { value: 3, label: "High" }
        ]}
      />
      <Toggle label="Grass sways in the wind" checked={wind} onChange={v => set({ wind: v })} />
      {measured && <Toggle label="Stumps where trees were cut" checked={stumps} onChange={v => set({ stumps: v })} />}
      {/* The course's own look (everyone sees it, on the printed map too) */}
      {editing && (
        <div className="mt-3 pt-3 border-t border-white/[0.07]" data-testid="course-look">
          <div className={HEAD}>Course look</div>
          <div className="text-xs text-zinc-400 mb-1">Landscape</div>
          <LandscapePicker />
          <div className="h-2" />
          <div className="text-xs text-zinc-400 mb-1">Basket band</div>
          {/* (a finger's 44 px round each swatch: six to the row, touching) */}
          <div className="flex gap-1.5 touch:gap-0" role="radiogroup" aria-label="Basket band" data-testid="basket-band">
            {BAND_COLORS.map(([c, name]) => {
              const on = (s.basketBand ?? BASKET_BAND) === c;
              return (
                <button key={c} role="radio" aria-checked={on} aria-label={name} title={name} onClick={() => setStyle({ basketBand: c === BASKET_BAND ? undefined : c })}
                  className={`group w-7 h-7 touch:w-11 touch:h-11 rounded-full flex items-center justify-center ${FOCUS}`}>
                  <span className={`block w-7 h-7 rounded-full ${on ? "ring-2 ring-white ring-offset-2 ring-offset-zinc-900" : "ring-1 ring-white/15 group-hover:ring-white/40"}`} style={{ background: c }} />
                </button>
              );
            })}
          </div>
          <div className="h-2" />
          <div data-testid="view-light">
            <SunFromSlider s={s} live={live} />
            <StyleSlider k="shadows" value={s.shadows ?? 0.65} label="Shadows" min={0} max={1} step={0.05} format={x => `${Math.round(x * 100)}%`} live={live} />
          </div>
          {/* (the rest of the light is the course map's: set there, with the rest of its look; on a
              phone the Map step's Style tool opens to it, as search's Show me does) */}
          <button className="mt-2 w-full flex items-center justify-between rounded-[12px] bg-white/[0.06] px-3 py-2 touch:py-2.5 text-left text-[13px] text-zinc-200" data-testid="light-link"
            onClick={() => { onClose(); void showSetting({ step: "map", tab: "map", look: "light", find: "look-part-light" }); }}>
            <span>Light and shadow</span>
            <ChevronRight size={15} className="text-zinc-500" />
          </button>
        </div>
      )}
    </div>
  );
}
