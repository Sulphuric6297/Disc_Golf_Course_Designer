// The 3D view's light and grass: the course's sun (the same one that lights the painted map),
// shadows and brightness, and how much grass to draw (a setting of this device).
import { useEffect, useRef, useState } from "react";
import { Layers, X } from "lucide-react";
import { FOCUS, POPOVER } from "./ui";
import { useCourse, useEditor } from "../state/course";
import { FROM, StyleSlider, setStyle, signed } from "./DesignPanel";
import { Segmented, Toggle } from "./ui";
import { LandscapePicker } from "./LandscapePicker";
import { BAND_COLORS, BASKET_BAND } from "../three/courseModels";
import { RotateCcw } from "lucide-react";

export function SceneButton({ className = "", big = false }: { className?: string; big?: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
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
        className={`bg-zinc-900/90 backdrop-blur ${big ? "rounded-2xl w-11 h-11" : "rounded-lg w-8 h-8"} flex items-center justify-center shadow-lg shadow-black/30 ring-1 transition-colors ${FOCUS} ${open ? "ring-sky-400 text-zinc-50" : "ring-white/10 text-zinc-300 hover:text-zinc-50"}`}
        title="Layers: light, landscape, grass"
        aria-label="Layers"
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
  const set = useEditor(e => e.set);
  return (
    <div className={`absolute ${big ? "right-[52px] top-0 max-h-[min(70vh,calc(100dvh-140px))] overflow-y-auto dg-scroll" : "right-0 top-10"} w-72 ${POPOVER} p-3 z-30 text-left`} data-testid="scene-panel">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-semibold text-zinc-100">Layers</div>
        <div className="flex items-center gap-2">
          <button className="text-xs text-orange-300 hover:text-orange-200 flex items-center gap-1" onClick={() => setStyle({ sunAngle: 315, sunHeight: 38, shadows: 0.65, light: 0 })}>
            <RotateCcw size={12} /> Reset
          </button>
          <button className={`text-zinc-400 hover:text-zinc-50 ${big ? "w-9 h-9 -m-2 flex items-center justify-center" : ""}`} title="Close" aria-label="Close" onClick={onClose}><X size={15} /></button>
        </div>
      </div>
      <StyleSlider live k="sunAngle" value={s.sunAngle ?? 315} label="Sun from the" min={0} max={359} step={5} format={x => FROM[Math.round(x / 45) % 8]} />
      <StyleSlider live k="sunHeight" value={s.sunHeight ?? 38} label="Sun height" min={12} max={80} step={2} format={x => `${Math.round(x)}° · ${x < 25 ? "evening" : x < 50 ? "afternoon" : "midday"}`} />
      <StyleSlider live k="shadows" value={s.shadows ?? 0.65} label="Shadows" min={0} max={1} step={0.05} format={x => `${Math.round(x * 100)}%`} />
      <StyleSlider live k="light" value={s.light ?? 0} label="Brightness" min={-0.3} max={0.3} step={0.02} format={signed} />
      <div className="text-xs text-zinc-400 mb-1">Landscape</div>
      <LandscapePicker />
      <div className="h-2" />
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
    </div>
  );
}
