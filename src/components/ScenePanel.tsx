// The view: what this device shows while working (the photo, lines, grass), and the course's own
// landscape and basket band. The light is the course map's, set with its look on the Map step.
import { useEffect, useRef, useState } from "react";
import { ChevronRight, Layers, X } from "lucide-react";
import { FOCUS, POPOVER } from "./ui";
import { useCourse, useEditor } from "../state/course";
import { setStyle } from "./DesignPanel";
import { Segmented, Toggle } from "./ui";
import { LandscapePicker } from "./LandscapePicker";
import { openLookPart } from "./MapLookPanel";
import { SHOW_EVENT } from "./showSetting";
import { LIGHT_MODES, compassName, latitudeOf, lightOf, sunFromOf } from "../lib/mapLook";
import { BAND_COLORS, BASKET_BAND } from "../three/courseModels";

export function SceneButton({ className = "", big = false }: { className?: string; big?: boolean }) {
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
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", esc);
    return () => { window.removeEventListener("pointerdown", close); window.removeEventListener("keydown", esc); };
  }, [open]);
  return (
    <div className={`relative pointer-events-auto ${className}`} ref={ref}>
      <button
        className={`glass backdrop-blur ${big ? "rounded-2xl w-11 h-11" : "rounded-lg w-8 h-8"} flex items-center justify-center shadow-lg shadow-black/30 ring-1 transition-colors ${FOCUS} ${open ? "ring-sky-400 text-zinc-50" : "ring-white/10 text-zinc-300 hover:text-zinc-50"}`}
        title="View: photo, lines, grass, landscape"
        aria-label="View"
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
        data-testid="scene-button"
      >
        <Layers size={big ? 20 : 16} />
      </button>
      {open && <ScenePanel onClose={() => setOpen(false)} big={big} />}
    </div>
  );
}

function ScenePanel({ onClose, big }: { onClose: () => void; big?: boolean }) {
  const s = useCourse(c => c.doc.style);
  const grass = useEditor(e => e.grass);
  const wind = useEditor(e => e.wind);
  const stumps = useEditor(e => e.stumps);
  const measured = useCourse(c => !!c.doc.lidar?.trees.length && !c.readOnly);
  const editing = useCourse(c => !c.readOnly);
  const lat = latitudeOf(useCourse(c => c.doc.site));
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
  const lt = lightOf(s);
  return (
    <div ref={box} className={`absolute ${big ? "right-[52px] top-0" : "right-0 top-10"} overflow-y-auto dg-scroll overscroll-contain w-72 ${POPOVER} p-3 z-30 text-left`} style={room ? { maxHeight: room } : undefined} data-testid="scene-panel">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-semibold text-zinc-100">View</div>
        <button className={`text-zinc-400 hover:text-zinc-50 ${big ? "w-9 h-9 -m-2 flex items-center justify-center" : ""}`} title="Close" aria-label="Close" onClick={onClose}><X size={15} /></button>
      </div>
      {/* This device's view while working: not saved with the course (viewers' own look: Share) */}
      {editing && (
        <div className="mb-2" data-testid="map-display">
          {/* (from a tee the ground is the flight's: its Camera settings) */}
          {!fromTee && <Toggle label="Satellite photo" checked={ed.photo} onChange={v => set({ photo: v })} />}
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
      {measured && <Toggle label="Stumps of cut-down trees" hint="Everywhere close by, to bring trees back (always on the hole picked)." checked={stumps} onChange={v => set({ stumps: v })} />}
      {/* The course's own look (everyone sees it, on the printed map too) */}
      {editing && (
        <div className="mt-3 pt-3 border-t border-white/[0.07]" data-testid="course-look">
          <div className="text-xs text-zinc-400 mb-1">Landscape</div>
          <LandscapePicker />
          <div className="h-2" />
          <div className="text-xs text-zinc-400 mb-1">Basket band</div>
          <div className="flex gap-1.5" role="radiogroup" aria-label="Basket band" data-testid="basket-band">
            {BAND_COLORS.map(([c, name]) => {
              const on = (s.basketBand ?? BASKET_BAND) === c;
              return (
                <button key={c} role="radio" aria-checked={on} aria-label={name} title={name} onClick={() => setStyle({ basketBand: c === BASKET_BAND ? undefined : c })}
                  className={`w-7 h-7 rounded-full ${FOCUS} ${on ? "ring-2 ring-white ring-offset-2 ring-offset-zinc-900" : "ring-1 ring-white/15 hover:ring-white/40"}`} style={{ background: c }} />
              );
            })}
          </div>
          {/* (the light is the course map's: set there, with the rest of its look) */}
          <button className="mt-3 w-full flex items-center justify-between rounded-[12px] bg-white/[0.06] px-3 py-2 text-left text-[13px] text-zinc-200" data-testid="light-link"
            onClick={() => { openLookPart("light"); set({ step: "map", designTab: "map", teeView: null, flyover: false }); onClose(); }}>
            <span>Light: {LIGHT_MODES.find(m => m.id === lt.mode)?.label}, sun from the {compassName(sunFromOf(s, lat))}</span>
            <ChevronRight size={15} className="text-zinc-500" />
          </button>
        </div>
      )}
    </div>
  );
}
