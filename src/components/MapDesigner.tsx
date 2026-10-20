// The Design step's preview: the printed course map (or a tee sign, a hole page, or the
// scorecard) exactly as it will print, updating as the style changes.
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { Minus, Plus, Scan } from "lucide-react";
import { renderPoster, withPaintLimit } from "../lib/mapSvg";

/** A phone or small tablet (touch first, small screen). */
const PHONE = typeof matchMedia !== "undefined" && matchMedia("(pointer: coarse)").matches && typeof screen !== "undefined" && Math.min(screen.width, screen.height) < 900;
import { SIGN_SIZES, renderScorecard, renderTeeSign, type SignSize } from "../lib/teeSign";
import { HOLE_PAGES, renderHolePage, type HolePageSize } from "../lib/holePage";
import { useCourse, useEditor } from "../state/course";
import { useCanopy, useRelief } from "./useRelief";

type Preview = "map" | "sign" | "page" | "scorecard";

export function MapDesigner() {
  const live = useCourse(s => s.doc);
  const doc = useDeferredValue(live);
  const relief0 = useRelief(doc);
  const canopy = useCanopy(doc);
  const relief = useMemo(() => ({ ...relief0, canopy }), [relief0, canopy]);
  const [preview, setPreview] = useState<Preview>("map");
  const [hole, setHole] = useState<string | null>(null);
  const [signSize, setSignSize] = useState<SignSize>("18x12");
  const [pageSize, setPageSize] = useState<HolePageSize>("letter");
  const [zoom, setZoom] = useState<number | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const activeHole = useEditor(e => e.activeHoleId);
  const holeId = hole && doc.holes.some(h => h.id === hole) ? hole : activeHole && doc.holes.some(h => h.id === activeHole) ? activeHole : doc.holes[0]?.id ?? null;

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // On a phone the preview is painted smaller (it is seen small; quicker and lighter on memory)
  const page = useMemo(() => withPaintLimit(PHONE ? 1500 : 2400, () => {
    if (preview === "sign" && holeId) return renderTeeSign(doc, holeId, signSize, relief);
    if (preview === "page" && holeId) return renderHolePage(doc, holeId, pageSize, relief);
    if (preview === "scorecard") return renderScorecard(doc);
    return renderPoster(doc, relief);
  }), [doc, relief, preview, holeId, signSize, pageSize]);

  if (!page) return null;
  const fit = Math.min((size.w - 48) / page.width, (size.h - 48) / page.height);
  const k = zoom ?? fit;
  const tab = (id: Preview, label: string) => (
    <button key={id} role="tab" aria-selected={preview === id} onClick={() => { setPreview(id); setZoom(null); }} className={`px-3 py-1.5 rounded-lg text-sm font-semibold ${preview === id ? "bg-zinc-100 text-zinc-900" : "text-zinc-300 hover:bg-zinc-800"}`}>
      {label}
    </button>
  );
  return (
    <div className="absolute inset-0 z-20 bg-zinc-800 flex flex-col" data-testid="map-designer">
      <div className="flex items-center gap-2 px-3 py-2 bg-zinc-900 border-b border-zinc-800">
        <div role="tablist" className="flex gap-1">{[tab("map", "Course map"), tab("sign", "Tee sign"), tab("page", "Hole page"), tab("scorecard", "Scorecard")]}</div>
        {(preview === "sign" || preview === "page") && doc.holes.length > 0 && (
          <select aria-label={preview === "sign" ? "Hole for the tee sign" : "Hole for the hole page"} className="bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1 text-sm" value={holeId ?? ""} onChange={e => setHole(e.target.value)}>
            {doc.holes.map((h, i) => <option key={h.id} value={h.id}>Hole {i + 1}</option>)}
          </select>
        )}
        {preview === "sign" && (
          <select aria-label="Tee sign size" className="bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1 text-sm" value={signSize} onChange={e => { setSignSize(e.target.value as SignSize); setZoom(null); }}>
            {(Object.keys(SIGN_SIZES) as SignSize[]).map(k => <option key={k} value={k}>{SIGN_SIZES[k].label}</option>)}
          </select>
        )}
        {preview === "page" && (
          <select aria-label="Hole page size" className="bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1 text-sm" value={pageSize} onChange={e => { setPageSize(e.target.value as HolePageSize); setZoom(null); }}>
            {(Object.keys(HOLE_PAGES) as HolePageSize[]).map(k => <option key={k} value={k}>{HOLE_PAGES[k].label}</option>)}
          </select>
        )}
        <div className="ml-auto flex items-center gap-1 text-zinc-300">
          <button className="p-1.5 rounded hover:bg-zinc-800" aria-label="Zoom out" onClick={() => setZoom(Math.max(0.1, k / 1.25))}><Minus size={16} /></button>
          <span className="text-xs w-12 text-center tabular-nums">{Math.round(k * 100)}%</span>
          <button className="p-1.5 rounded hover:bg-zinc-800" aria-label="Zoom in" onClick={() => setZoom(Math.min(6, k * 1.25))}><Plus size={16} /></button>
          <button className="p-1.5 rounded hover:bg-zinc-800" aria-label="Fit the page" onClick={() => setZoom(null)}><Scan size={16} /></button>
        </div>
      </div>
      <div ref={box} className="flex-1 overflow-auto">
        <div className="min-w-full min-h-full flex items-center justify-center p-6">
          <div
            data-testid="design-page"
            className="shadow-2xl bg-white shrink-0"
            style={{ width: page.width * k, height: page.height * k }}
            dangerouslySetInnerHTML={{ __html: page.svg.replace(/^<svg([^>]*?) width="[^"]*" height="[^"]*"/, `<svg$1 width="${page.width * k}" height="${page.height * k}"`) }}
          />
        </div>
      </div>
      {doc.holes.length === 0 && <div className="absolute inset-0 flex items-center justify-center pointer-events-none"><div className="bg-zinc-900/90 rounded-xl px-4 py-3 text-sm text-zinc-200">Add holes on the Holes step to see them here.</div></div>}
    </div>
  );
}
