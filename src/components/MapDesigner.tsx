// The Design step's preview: the printed course map (or a tee sign, a hole page, or the
// scorecard) exactly as it will print, updating as the style changes.
import { useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Minus, Plus, Scan } from "lucide-react";
import { onPainted, renderPoster, withLivePaint } from "../lib/mapSvg";
import { SIGN_SIZES, renderScorecard, renderTeeSign, type SignSize } from "../lib/teeSign";
import { HOLE_PAGES, renderHolePage, type HolePageSize } from "../lib/holePage";
import { useCourse, useEditor } from "../state/course";
import { holeNumber } from "../lib/course";
import { useCanopy, useRelief } from "./useRelief";
import { setStyle } from "./DesignPanel";

/** A phone or small tablet (touch first, small screen). */
const PHONE = typeof matchMedia !== "undefined" && matchMedia("(pointer: coarse)").matches && typeof screen !== "undefined" && Math.min(screen.width, screen.height) < 900;

type Preview = "map" | "sign" | "page" | "scorecard";

/** `compact`: a phone's layout (two rows of controls, the page fitted edge to edge, pinch to zoom);
 * `topInset` keeps the controls clear of a top bar over it. */
export function MapDesigner({ compact = false, topInset = 0 }: { compact?: boolean; topInset?: number }) {
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

  // Pinching the page (a phone): scaled live, then drawn at the new zoom with the pinched spot kept
  const pageEl = useRef<HTMLDivElement>(null);
  const [pinchScale, setPinchScale] = useState<{ s: number; ox: number; oy: number } | null>(null);
  const anchor = useRef<{ fx: number; fy: number; vx: number; vy: number } | null>(null);
  const kRef = useRef(1);
  useEffect(() => {
    const el = box.current;
    if (!el || !compact) return;
    let start: { d: number; fx: number; fy: number; vx: number; vy: number; ox: number; oy: number } | null = null;
    let last = 1;
    const pair = (t: TouchList) => {
      const r = el.getBoundingClientRect(), a = t[0], b = t[1];
      return { d: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), vx: (a.clientX + b.clientX) / 2 - r.left, vy: (a.clientY + b.clientY) / 2 - r.top };
    };
    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 2 || !pageEl.current) return;
      const p = pair(e.touches), pr = pageEl.current.getBoundingClientRect(), r = el.getBoundingClientRect();
      const ox = p.vx + r.left - pr.left, oy = p.vy + r.top - pr.top;
      start = { d: Math.max(1, p.d), fx: ox / pr.width, fy: oy / pr.height, vx: p.vx, vy: p.vy, ox, oy };
      last = 1;
    };
    const onMove = (e: TouchEvent) => {
      if (!start || e.touches.length !== 2) return;
      e.preventDefault();
      const k = kRef.current;
      last = Math.min(6 / k, Math.max(0.1 / k, pair(e.touches).d / start.d));
      setPinchScale({ s: last, ox: start.ox, oy: start.oy });
    };
    const onEnd = (e: TouchEvent) => {
      if (!start || e.touches.length >= 2) return;
      anchor.current = { fx: start.fx, fy: start.fy, vx: start.vx, vy: start.vy };
      setZoom(Math.min(6, Math.max(0.1, kRef.current * last)));
      setPinchScale(null);
      start = null;
    };
    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd);
    el.addEventListener("touchcancel", onEnd);
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
    };
  }, [compact]);
  useLayoutEffect(() => {
    const a = anchor.current, el = box.current, pg = pageEl.current;
    if (!a || !el || !pg) return;
    anchor.current = null;
    const r = el.getBoundingClientRect(), pr = pg.getBoundingClientRect();
    el.scrollLeft += pr.left - r.left + a.fx * pr.width - a.vx;
    el.scrollTop += pr.top - r.top + a.fy * pr.height - a.vy;
  });

  // The preview paints between frames (the page never freezes), smaller on a phone (it is seen
  // small; quicker and lighter on memory), and is drawn again when a painting is ready
  const [painted, setPainted] = useState(0);
  useEffect(() => onPainted(() => setPainted(v => v + 1)), []);
  const page = useMemo(() => withLivePaint(PHONE ? 1500 : 2400, () => {
    if (preview === "sign" && holeId) return renderTeeSign(doc, holeId, signSize, relief);
    if (preview === "page" && holeId) return renderHolePage(doc, holeId, pageSize, relief);
    if (preview === "scorecard") return renderScorecard(doc);
    return renderPoster(doc, relief);
  }), [doc, relief, preview, holeId, signSize, pageSize, painted]);

  // The legend's panel dragged anywhere on the course map (moved on screen while dragging, then
  // kept, as a share of the page, in one undo step)
  const legendDrag = useRef<{ el: SVGGElement; x0: number; y0: number; cx: number; cy: number; id: number; k: number; w: number; h: number } | null>(null);
  const viewOnly = useEditor(e => e.viewOnly);
  const onPageDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (viewOnly || preview !== "map" || !page) return;
    const el = (e.target as Element).closest?.('[data-panel="legend"]') as SVGGElement | null;
    if (!el) return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    legendDrag.current = { el, x0: Number(el.dataset.x), y0: Number(el.dataset.y), cx: e.clientX, cy: e.clientY, id: e.pointerId, k: kRef.current, w: page.width, h: page.height };
  };
  const onPageMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = legendDrag.current;
    if (!d || d.id !== e.pointerId) return;
    d.el.setAttribute("transform", `translate(${(e.clientX - d.cx) / d.k} ${(e.clientY - d.cy) / d.k})`);
  };
  const onPageUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = legendDrag.current;
    if (!d || d.id !== e.pointerId) return;
    legendDrag.current = null;
    if (Math.abs(e.clientX - d.cx) + Math.abs(e.clientY - d.cy) < 3) { d.el.removeAttribute("transform"); return; }
    const f = (v: number) => Math.round(Math.max(0, Math.min(1, v)) * 1000) / 1000;
    setStyle({ legendAt: { x: f(d.x0 + (e.clientX - d.cx) / (d.w * d.k)), y: f(d.y0 + (e.clientY - d.cy) / (d.h * d.k)) } });
  };

  if (!page) return null;
  const margin = compact ? 20 : 48;
  const fit = Math.min((size.w - margin) / page.width, (size.h - margin) / page.height);
  const k = zoom ?? fit;
  kRef.current = k;
  const zb = compact ? "w-10 h-10 flex items-center justify-center rounded-xl active:bg-zinc-700 hover:bg-zinc-800" : "p-1.5 rounded hover:bg-zinc-800";
  const zoomGroup = (
    <div className="ml-auto flex items-center gap-1 text-zinc-300">
      <button className={zb} aria-label="Zoom out" onClick={() => setZoom(Math.max(0.1, k / 1.25))}><Minus size={compact ? 19 : 16} /></button>
      <span className={`${compact ? "text-[13px] w-11" : "text-xs w-12"} text-center tabular-nums`} data-testid="design-zoom">{Math.round(k * 100)}%</span>
      <button className={zb} aria-label="Zoom in" onClick={() => setZoom(Math.min(6, k * 1.25))}><Plus size={compact ? 19 : 16} /></button>
      <button className={zb} aria-label="Fit the page" onClick={() => setZoom(null)}><Scan size={compact ? 19 : 16} /></button>
    </div>
  );
  const tab = (id: Preview, label: string) => (
    <button key={id} role="tab" aria-selected={preview === id} onClick={() => { setPreview(id); setZoom(null); }} className={`${compact ? "shrink-0 h-10 px-3.5 rounded-xl text-[14px]" : "px-3 py-1.5 rounded-lg text-sm"} font-semibold ${preview === id ? "bg-zinc-100 text-zinc-900" : "text-zinc-300 hover:bg-zinc-800"}`}>
      {label}
    </button>
  );
  return (
    <div className={`absolute inset-0 z-20 ${compact ? "bg-zinc-900" : "bg-zinc-800"} flex flex-col`} style={compact ? { paddingTop: topInset } : undefined} data-testid="map-designer">
      <div className={compact ? "flex flex-wrap items-center gap-x-2 gap-y-1.5 px-2 py-2 bg-zinc-900 border-b border-zinc-800" : "flex items-center gap-2 px-3 py-2 bg-zinc-900 border-b border-zinc-800"}>
        <div role="tablist" className={compact ? "w-full flex gap-1 overflow-x-auto dg-noscrollbar touch-pan-x" : "flex gap-1"}>{[tab("map", "Course map"), tab("sign", "Tee sign"), tab("page", "Hole page"), tab("scorecard", "Scorecard")]}</div>
        {(preview === "sign" || preview === "page") && doc.holes.length > 0 && (
          <select aria-label={preview === "sign" ? "Hole for the tee sign" : "Hole for the hole page"} className={`bg-zinc-800 border border-zinc-700 rounded-lg px-2 ${compact ? "h-10 text-base min-w-0" : "py-1 text-sm"}`} value={holeId ?? ""} onChange={e => setHole(e.target.value)}>
            {doc.holes.map(h => <option key={h.id} value={h.id}>Hole {holeNumber(doc, h.id)}</option>)}
          </select>
        )}
        {preview === "sign" && (
          <select aria-label="Tee sign size" className={`bg-zinc-800 border border-zinc-700 rounded-lg px-2 ${compact ? "h-10 text-base min-w-0" : "py-1 text-sm"}`} value={signSize} onChange={e => { setSignSize(e.target.value as SignSize); setZoom(null); }}>
            {(Object.keys(SIGN_SIZES) as SignSize[]).map(k => <option key={k} value={k}>{SIGN_SIZES[k].label}</option>)}
          </select>
        )}
        {preview === "page" && (
          <select aria-label="Hole page size" className={`bg-zinc-800 border border-zinc-700 rounded-lg px-2 ${compact ? "h-10 text-base min-w-0" : "py-1 text-sm"}`} value={pageSize} onChange={e => { setPageSize(e.target.value as HolePageSize); setZoom(null); }}>
            {(Object.keys(HOLE_PAGES) as HolePageSize[]).map(k => <option key={k} value={k}>{HOLE_PAGES[k].label}</option>)}
          </select>
        )}
        {!compact && zoomGroup}
      </div>
      {/* (A phone: the zoom buttons float over the page, in the thumb's reach) */}
      {compact && <div className="absolute right-2 bottom-2 z-10 rounded-2xl bg-zinc-900/95 border border-white/10 shadow-lg p-0.5">{zoomGroup}</div>}
      <div ref={box} className={`flex-1 overflow-auto ${compact ? "bg-zinc-800 dg-scroll" : ""}`}>
        <div className={`min-w-full min-h-full flex items-center justify-center ${compact ? "p-2.5" : "p-6"}`}>
          <div
            ref={pageEl}
            data-testid="design-page"
            className="shadow-2xl bg-white shrink-0 [&_[data-panel=legend]]:cursor-move"
            onPointerDown={onPageDown}
            onPointerMove={onPageMove}
            onPointerUp={onPageUp}
            onPointerCancel={onPageUp}
            style={{ width: page.width * k, height: page.height * k, ...(pinchScale ? { transform: `scale(${pinchScale.s})`, transformOrigin: `${pinchScale.ox}px ${pinchScale.oy}px` } : {}) }}
            dangerouslySetInnerHTML={{ __html: page.svg.replace(/^<svg([^>]*?) width="[^"]*" height="[^"]*"/, `<svg$1 width="${page.width * k}" height="${page.height * k}"`) }}
          />
        </div>
      </div>
      {doc.holes.length === 0 && <div className="absolute inset-0 flex items-center justify-center pointer-events-none"><div className="bg-zinc-900/90 rounded-xl px-4 py-3 text-sm text-zinc-200">No holes yet.</div></div>}
    </div>
  );
}
