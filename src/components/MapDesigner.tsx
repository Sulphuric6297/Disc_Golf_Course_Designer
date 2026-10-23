// The Design step's preview: the printed course map (or a tee sign, a hole page, or the
// scorecard) exactly as it will print, updating as the style changes.
import { Woods } from "./Woods";
import { useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { EyeOff, Minus, Plus, Scan, Trash2 } from "lucide-react";
import { onPaintProgress, onPainted, renderPoster, withLivePaint } from "../lib/mapSvg";
import { SIGN_SIZES, renderScorecard, renderTeeSign, type SignSize } from "../lib/teeSign";
import { HOLE_PAGES, renderHolePage, type HolePageSize } from "../lib/holePage";
import { changeDoc, useCourse, useEditor } from "../state/course";
import { holeLabel } from "../lib/course";
import { useCanopy, useRelief } from "./useRelief";
import { duplicateDesignSel, elementLabel, moveDesignEl, moveLabel, removeDesignSel, sizeDesignEl } from "./PageEditor";
import { hideSignSel, movePiece, pieceLabel, sizePiece } from "./SignEditor";

/** A phone or small tablet (touch first, small screen). */
const PHONE = typeof matchMedia !== "undefined" && matchMedia("(pointer: coarse)").matches && typeof screen !== "undefined" && Math.min(screen.width, screen.height) < 900;

type Preview = "map" | "sign" | "page" | "scorecard";

/** `compact`: a phone's layout (two rows of controls, the page fitted edge to edge, pinch to zoom);
 * `topInset` keeps the controls clear of a top bar over it. */
/** The page being designed (`preview`: shown only, as Export shows what goes out). */
export function MapDesigner({ compact = false, topInset = 0, preview: only = false }: { compact?: boolean; topInset?: number; preview?: boolean }) {
  const live = useCourse(s => s.doc);
  const doc = useDeferredValue(live);
  const relief0 = useRelief(doc);
  const canopy = useCanopy(doc);
  const relief = useMemo(() => ({ ...relief0, canopy }), [relief0, canopy]);
  // (the Map step's tab: General shows the course map)
  const tabId = useEditor(e => e.designTab);
  const preview: Preview = tabId === "general" ? "map" : tabId;
  const setPreview = (id: Preview | "general") => useEditor.getState().set({ designTab: id });
  const hole = useEditor(e => e.designHole);
  const setHole = (id: string) => useEditor.getState().set({ designHole: id });
  // (the course's sizes: the same ones Export prints)
  const signSize: SignSize = useCourse(c => c.doc.style.signSize) ?? "18x12";
  const pageSize: HolePageSize = useCourse(c => c.doc.style.holePageSize) ?? "letter";
  const setSignSize = (v: SignSize) => changeDoc(d => ({ style: { ...d.style, signSize: v } }));
  const setPageSize = (v: HolePageSize) => changeDoc(d => ({ style: { ...d.style, holePageSize: v } }));
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

  // While a finger is on the page its picture stays as it is: a new painting put in under the finger
  // takes away what it touched, and the gesture never hears the finger lift (a pinch stuck scaled)
  const [held, setHeld] = useState<string | null>(null);
  const htmlRef = useRef("");
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const down = () => {
      const now = htmlRef.current;
      setHeld(h => h ?? now);
    };
    const up = (e: TouchEvent) => { if (!e.touches.length) setHeld(null); };
    el.addEventListener("touchstart", down, { passive: true });
    window.addEventListener("touchend", up);
    window.addEventListener("touchcancel", up);
    return () => {
      el.removeEventListener("touchstart", down);
      window.removeEventListener("touchend", up);
      window.removeEventListener("touchcancel", up);
    };
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
  // The wheel (or a trackpad's pinch) zooms about the pointer, the spot under it staying put
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!pageEl.current) return;
      e.preventDefault();
      const r = el.getBoundingClientRect(), pr = pageEl.current.getBoundingClientRect();
      const step = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      const next = Math.min(6, Math.max(0.1, kRef.current * Math.exp(-step * (e.ctrlKey ? 0.01 : 0.0015))));
      anchor.current = { fx: (e.clientX - pr.left) / pr.width, fy: (e.clientY - pr.top) / pr.height, vx: e.clientX - r.left, vy: e.clientY - r.top };
      setZoom(next);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);
  // A press and drag on the page's background, the map (not on a label), or around the page
  // moves the zoomed page about (a finger scrolls it by itself)
  const pan = useRef<{ x: number; y: number; sl: number; st: number; id: number } | null>(null);
  const onBoxDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || e.pointerType === "touch" || !box.current) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    pan.current = { x: e.clientX, y: e.clientY, sl: box.current.scrollLeft, st: box.current.scrollTop, id: e.pointerId };
  };
  const onBoxMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const p = pan.current, el = box.current;
    if (!p || p.id !== e.pointerId || !el) return;
    el.scrollLeft = p.sl - (e.clientX - p.x);
    el.scrollTop = p.st - (e.clientY - p.y);
    el.style.cursor = "grabbing";
  };
  const onBoxUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (pan.current?.id !== e.pointerId) return;
    pan.current = null;
    if (box.current) box.current.style.cursor = "";
  };
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
  // How far the painting under way is (shown over the page while it paints)
  const [painting, setPainting] = useState<number | null>(null);
  useEffect(() => onPaintProgress(setPainting), []);
  const page = useMemo(() => withLivePaint(PHONE ? 1500 : 2400, () => {
    if (preview === "sign" && holeId) return renderTeeSign(doc, holeId, signSize, relief);
    if (preview === "page" && holeId) return renderHolePage(doc, holeId, pageSize, relief);
    if (preview === "scorecard") return renderScorecard(doc);
    return renderPoster(doc, relief);
  }), [doc, relief, preview, holeId, signSize, pageSize, painted]);

  // Everything on the course map's page picked, moved and sized like in Canva: a click picks
  // (the map itself on a second press, so it isn't moved by mistake; a finger picks first, then
  // drags), a drag moves, the corner squares size; one undo step each. Shown moving on the page
  // while dragged, then kept as shares of the page.
  const designSel = useEditor(e => e.designSel);
  const setEd = useEditor(e => e.set);
  // (a tee sign's pieces the same way: each piece of it, the hole's picture too)
  const signEdit = (preview === "sign" || preview === "page") && !only;
  const editing = (preview === "map" || signEdit) && !only;
  const svgHost = useRef<HTMLDivElement>(null);
  type Box = { x: number; y: number; w: number; h: number };
  const [selBox, setSelBox] = useState<Box | null>(null);
  const drag = useRef<{ mode: "move" | "size"; id: string; el: SVGGElement; orig: string; cx: number; cy: number; pid: number; k: number; W: number; H: number; box: Box; anchor: { x: number; y: number }; corner: { x: number; y: number }; f: number; dx: number; dy: number } | null>(null);
  const elOf = (id: string) =>
    svgHost.current?.querySelector(id.startsWith("label:") ? `[data-label="${CSS.escape(id.slice(6))}"]` : `[data-el="${CSS.escape(id)}"]`) as SVGGElement | null;
  const boxOf = (el: Element): Box => {
    const box = el.getAttribute("data-box");
    if (box) {
      const [x, y, w, h] = box.split(" ").map(Number);
      return { x, y, w, h };
    }
    // (a label on the map: where it is drawn)
    const r = el.getBoundingClientRect(), host = svgHost.current!.getBoundingClientRect(), k = kRef.current;
    return { x: (r.left - host.left) / k, y: (r.top - host.top) / k, w: r.width / k, h: r.height / k };
  };
  /** A move on the page as feet on the ground (the map's own scale and turn). */
  const groundShift = (dx: number, dy: number) => {
    const m = svgHost.current?.querySelector("[data-el=map]");
    const k = Number(m?.getAttribute("data-k")) || 1, rot = ((Number(m?.getAttribute("data-rot")) || 0) * Math.PI) / 180;
    const c = Math.cos(-rot), sn = Math.sin(-rot);
    return { x: (dx * c + dy * sn) / k, y: (-dx * sn + dy * c) / k };
  };
  useLayoutEffect(() => {
    const el = editing && designSel ? elOf(designSel) : null;
    setSelBox(el ? boxOf(el) : null);
  }, [page, designSel, editing]);
  // (leaving the course map, or the Design step, lets go of what was picked)
  useEffect(() => { if (!editing) setEd({ designSel: null }); }, [editing, setEd]);
  useEffect(() => { setEd({ designSel: null }); }, [preview, setEd]);
  // A sign's pieces are picked anywhere in their outline, not only on their ink: each gets an
  // unseen box the size of what it draws
  useLayoutEffect(() => {
    const host = svgHost.current;
    if (!signEdit || !host) return;
    for (const g of Array.from(host.querySelectorAll<SVGGElement>("[data-el]"))) {
      if (g.querySelector(":scope > rect[data-hit]")) continue;
      const b = g.getBBox();
      const r = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      r.setAttribute("data-hit", "1");
      r.setAttribute("x", String(b.x)); r.setAttribute("y", String(b.y)); r.setAttribute("width", String(b.width)); r.setAttribute("height", String(b.height));
      r.setAttribute("fill", "none"); r.setAttribute("pointer-events", "all");
      g.insertBefore(r, g.firstChild);
    }
  });
  useEffect(() => () => setEd({ designSel: null }), [setEd]);
  const onPageDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!editing || !page || e.button !== 0) return;
    // (a field in the panel lets go, so keys like Delete go to what's picked on the page)
    const active = document.activeElement as HTMLElement | null;
    if (active?.matches?.("input,textarea,select")) active.blur();
    const corner = (e.target as HTMLElement).closest?.("[data-corner]") as HTMLElement | null;
    if ((e.target as HTMLElement).closest?.("[data-page-bar]")) return;
    // (a label on the map, else what's on the page; the map itself stays where it is)
    const tag = signEdit ? null : (e.target as Element).closest?.("[data-label]") as SVGGElement | null;
    const hit = (e.target as Element).closest?.("[data-el]") as SVGGElement | null;
    const id = corner ? designSel : tag ? `label:${tag.getAttribute("data-label")}` : hit?.getAttribute("data-el") ?? null;
    if (!id || (id === "map" && !signEdit)) { setEd({ designSel: null }); return; }
    const el = elOf(id);
    if (!el) return;
    const fresh = id !== designSel;
    if (fresh) setEd({ designSel: id });
    if (!corner && fresh && e.pointerType === "touch") return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    const b = boxOf(el);
    const [sx, sy] = (corner?.dataset.corner ?? "1,1").split(",").map(Number);
    drag.current = {
      mode: corner ? "size" : "move", id, el, orig: el.getAttribute("transform") ?? "", cx: e.clientX, cy: e.clientY, pid: e.pointerId, k: kRef.current, W: page.width, H: page.height, box: b,
      corner: { x: b.x + sx * b.w, y: b.y + sy * b.h }, anchor: { x: b.x + (1 - sx) * b.w, y: b.y + (1 - sy) * b.h }, f: 1, dx: 0, dy: 0
    };
  };
  const onPageMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.pid !== e.pointerId) return;
    const dx = (e.clientX - d.cx) / d.k, dy = (e.clientY - d.cy) / d.k;
    if (d.mode === "move") {
      d.dx = dx;
      d.dy = dy;
      d.el.setAttribute("transform", `translate(${dx} ${dy}) ${d.orig}`);
      setSelBox({ ...d.box, x: d.box.x + dx, y: d.box.y + dy });
    } else {
      const A = d.anchor, C = d.corner;
      const v = { x: C.x - A.x, y: C.y - A.y }, w = { x: C.x + dx - A.x, y: C.y + dy - A.y };
      const f = Math.max(0.1, Math.min(10, (v.x * w.x + v.y * w.y) / Math.max(1e-6, v.x * v.x + v.y * v.y)));
      d.f = f;
      d.el.setAttribute("transform", `translate(${A.x} ${A.y}) scale(${f}) translate(${-A.x} ${-A.y}) ${d.orig}`);
      setSelBox({ x: A.x + (d.box.x - A.x) * f, y: A.y + (d.box.y - A.y) * f, w: d.box.w * f, h: d.box.h * f });
    }
  };
  const onPageUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.pid !== e.pointerId) return;
    drag.current = null;
    if (Math.abs(e.clientX - d.cx) + Math.abs(e.clientY - d.cy) < 3) {
      d.el.setAttribute("transform", d.orig);
      setSelBox(d.box);
      return;
    }
    if (signEdit) {
      if (d.mode === "move") movePiece(d.id, d.dx / d.W, d.dy / d.H);
      else sizePiece(d.id, d.f, d.anchor, d.W, d.H);
    } else if (d.mode === "move" && d.id.startsWith("label:")) {
      const g = groundShift(d.dx, d.dy);
      moveLabel(d.id.slice(6), g.x, g.y);
    } else if (d.mode === "move") moveDesignEl(d.id, { x: d.box.x / d.W, y: d.box.y / d.H }, d.dx / d.W, d.dy / d.H);
    else sizeDesignEl(d.id, d.f, { x: (d.anchor.x + (d.box.x - d.anchor.x) * d.f) / d.W, y: (d.anchor.y + (d.box.y - d.anchor.y) * d.f) / d.H });
  };
  // Keys for what's picked: Delete hides it (text and pictures go), arrows nudge it (Shift: more),
  // Ctrl+D copies text or a picture, Esc lets go. Before the course map's own keys hear them.
  useEffect(() => {
    if (!editing || !designSel) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest?.("input,textarea,select,[contenteditable=true]")) return;
      const mod = e.ctrlKey || e.metaKey;
      let used = true;
      if (e.key === "Escape") setEd({ designSel: null });
      else if (!mod && (e.key === "Delete" || e.key === "Backspace")) (signEdit ? hideSignSel : removeDesignSel)();
      else if (mod && e.key.toLowerCase() === "d" && !signEdit) duplicateDesignSel();
      else if (!mod && e.key.startsWith("Arrow") && page) {
        const el = elOf(designSel);
        if (!el) return;
        const b = boxOf(el), step = e.shiftKey ? 10 : 1;
        const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0, dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
        if (signEdit) movePiece(designSel, dx / page.width, dy / page.height);
        else if (designSel.startsWith("label:")) {
          const g = groundShift(dx, dy);
          moveLabel(designSel.slice(6), g.x, g.y);
        } else moveDesignEl(designSel, { x: b.x / page.width, y: b.y / page.height }, dx / page.width, dy / page.height);
      } else used = false;
      if (used) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [editing, signEdit, designSel, page, setEd]);

  if (!page) return null;
  const margin = compact ? 20 : 48;
  const fit = Math.min((size.w - margin) / page.width, (size.h - margin) / page.height);
  const k = zoom ?? fit;
  kRef.current = k;
  const html = page.svg.replace(/^<svg([^>]*?) width="[^"]*" height="[^"]*"/, `<svg$1 width="${page.width * k}" height="${page.height * k}"`);
  htmlRef.current = html;
  const zb = compact ? "w-10 h-10 flex items-center justify-center rounded-full active:bg-white/[0.14] hover:bg-white/[0.08]" : "p-1.5 rounded-full hover:bg-white/[0.08]";
  const zoomGroup = (
    <div className="ml-auto flex items-center gap-1 text-zinc-300">
      <button className={zb} aria-label="Zoom out" onClick={() => setZoom(Math.max(0.1, k / 1.25))}><Minus size={compact ? 19 : 16} /></button>
      <span className={`${compact ? "text-[13px] w-11" : "text-xs w-12"} text-center tabular-nums`} data-testid="design-zoom">{Math.round(k * 100)}%</span>
      <button className={zb} aria-label="Zoom in" onClick={() => setZoom(Math.min(6, k * 1.25))}><Plus size={compact ? 19 : 16} /></button>
      <button className={zb} aria-label="Fit the page" onClick={() => setZoom(null)}><Scan size={compact ? 19 : 16} /></button>
    </div>
  );
  // (on a phone each tab as wide as its label, short ones: all five across the screen)
  const tab = (id: Preview | "general", label: string, short = label) => (
    <button key={id} role="tab" aria-selected={(only && tabId === "general" ? "map" : tabId) === id} onClick={() => { setPreview(id); setZoom(null); }} className={`${compact ? "flex-auto min-w-0 h-10 px-2 rounded-full text-[13px] whitespace-nowrap" : "px-3.5 py-1.5 rounded-full text-sm"} font-semibold ${(only && tabId === "general" ? "map" : tabId) === id ? "bg-white/[0.2] text-zinc-50" : "text-zinc-300 hover:bg-white/[0.09]"}`}>
      {compact ? short : label}
    </button>
  );
  return (
    <div className="absolute inset-0 z-20 bg-zinc-950 flex flex-col isolate overflow-hidden" style={compact ? { paddingTop: topInset } : undefined} data-testid="map-designer">
      <Woods inset />
      <div className={compact ? "flex flex-wrap items-center gap-x-2 gap-y-1.5 px-2 py-2" : "flex items-center gap-2 px-3 py-2.5"}>
        <div role="tablist" className={compact ? "w-full flex gap-1" : "flex gap-1"}>{[...(only ? [] : [tab("general", "General")]), tab("map", "Course map", "Map"), tab("sign", "Tee sign", "Sign"), tab("page", "Hole page", "Page"), tab("scorecard", "Scorecard", "Card")]}</div>
        {(preview === "sign" || preview === "page") && doc.holes.length > 0 && (
          <select aria-label={preview === "sign" ? "Hole for the tee sign" : "Hole for the hole page"} className={`bg-white/[0.08] rounded-full px-3 ${compact ? "h-10 text-base min-w-0" : "py-1 text-sm"}`} value={holeId ?? ""} onChange={e => setHole(e.target.value)}>
            {doc.holes.map(h => <option key={h.id} value={h.id}>Hole {holeLabel(doc, h.id)}</option>)}
          </select>
        )}
        {preview === "sign" && (
          <select aria-label="Tee sign size" className={`bg-white/[0.08] rounded-full px-3 ${compact ? "h-10 text-base min-w-0" : "py-1 text-sm"}`} value={signSize} onChange={e => { setSignSize(e.target.value as SignSize); setZoom(null); }}>
            {(Object.keys(SIGN_SIZES) as SignSize[]).map(k => <option key={k} value={k}>{SIGN_SIZES[k].label}</option>)}
          </select>
        )}
        {preview === "page" && (
          <select aria-label="Hole page size" className={`bg-white/[0.08] rounded-full px-3 ${compact ? "h-10 text-base min-w-0" : "py-1 text-sm"}`} value={pageSize} onChange={e => { setPageSize(e.target.value as HolePageSize); setZoom(null); }}>
            {(Object.keys(HOLE_PAGES) as HolePageSize[]).map(k => <option key={k} value={k}>{HOLE_PAGES[k].label}</option>)}
          </select>
        )}
        {!compact && zoomGroup}
      </div>
      {/* (A phone: the zoom buttons float over the page, in the thumb's reach) */}
      {compact && <div className="glass absolute right-2 bottom-2 z-10 rounded-[22px] p-0.5">{zoomGroup}</div>}
      <div ref={box} className={`flex-1 overflow-auto ${compact ? "dg-scroll" : ""} cursor-grab`} data-testid="design-scroll" onPointerDown={onBoxDown} onPointerMove={onBoxMove} onPointerUp={onBoxUp} onPointerCancel={onBoxUp}>
        {/* (as wide as the page when zoomed in past the window, so all of it scrolls into view) */}
        <div className={`w-max min-w-full min-h-full flex items-center justify-center ${compact ? "p-2.5" : "p-6"}`}>
          <div
            ref={pageEl}
            className="relative shrink-0"
            onPointerDown={onPageDown}
            onPointerMove={onPageMove}
            onPointerUp={onPageUp}
            onPointerCancel={onPageUp}
            style={{ width: page.width * k, height: page.height * k, ...(pinchScale ? { transform: `scale(${pinchScale.s})`, transformOrigin: `${pinchScale.ox}px ${pinchScale.oy}px` } : {}) }}
          >
            <div
              ref={svgHost}
              data-testid="design-page"
              className={`shadow-2xl bg-white ${signEdit ? "[&_[data-el]]:cursor-pointer" : editing ? "[&_[data-el]:not([data-el=map])]:cursor-pointer" : ""}`}
              style={{ width: page.width * k, height: page.height * k }}
              dangerouslySetInnerHTML={{ __html: held ?? html }}
            />
            {editing && <style>{`[data-testid=design-page] [data-label]{cursor:move}${designSel ? `[data-testid=design-page] ${designSel.startsWith("label:") ? `[data-label="${designSel.slice(6).replace(/"/g, "")}"]` : `[data-el="${designSel.replace(/"/g, "")}"]`}{cursor:move;touch-action:none}` : ""}`}</style>}
            {editing && designSel && selBox && (
              <div className="absolute pointer-events-none" data-testid="page-selection" style={{ left: selBox.x * k, top: selBox.y * k, width: selBox.w * k, height: selBox.h * k, outline: "2px solid #f97316", outlineOffset: 2 }}>
                {!designSel.startsWith("label:") && ["0,0", "1,0", "0,1", "1,1"].map(c => {
                  const [cx, cy] = c.split(",").map(Number);
                  return <div key={c} data-corner={c} data-testid="page-corner" className="absolute w-3 h-3 touch:w-6 touch:h-6 bg-white border-2 border-orange-500 rounded-sm pointer-events-auto" style={{ left: `calc(${cx * 100}% - ${compact ? 12 : 6}px)`, top: `calc(${cy * 100}% - ${compact ? 12 : 6}px)`, cursor: cx === cy ? "nwse-resize" : "nesw-resize", touchAction: "none" }} />;
                })}
                <div data-page-bar className="glass absolute left-0 flex items-center gap-1 pointer-events-auto rounded-full px-1.5 py-1 whitespace-nowrap" style={{ top: selBox.y * k > 40 ? -36 : undefined, bottom: selBox.y * k > 40 ? undefined : -36 }}>
                  <span className="text-[11px] font-semibold text-zinc-200 px-1 max-w-[140px] truncate">{signEdit ? pieceLabel(designSel) : elementLabel(doc, designSel)}</span>
                  {(() => { const gone = !signEdit && (designSel.startsWith("text:") || designSel.startsWith("image:")); return <button className="p-1 rounded hover:bg-white/[0.13] text-zinc-300" aria-label={gone ? "Delete it" : "Hide it"} title={gone ? "Delete" : "Hide"} onClick={signEdit ? hideSignSel : removeDesignSel}>{gone ? <Trash2 size={13} /> : <EyeOff size={13} />}</button>; })()}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      {painting !== null && (
        <div className={`absolute left-1/2 -translate-x-1/2 ${compact ? "" : "top-14"} z-10 pointer-events-none flex items-center gap-2.5 rounded-full glass shadow-lg px-3.5 py-1.5`} style={compact ? { top: topInset + 104 } : undefined} role="progressbar" aria-label="Painting the map" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(painting * 100)} data-testid="paint-progress">
          <span className="text-xs font-semibold text-zinc-200 whitespace-nowrap">Painting the map</span>
          <span className="w-32 h-1.5 rounded-full bg-white/[0.14] overflow-hidden"><span className="block h-full bg-orange-500 transition-[width] duration-200" style={{ width: `${Math.max(3, Math.round(painting * 100))}%` }} /></span>
          <span className="text-xs tabular-nums text-zinc-300 w-8 text-right">{Math.round(painting * 100)}%</span>
        </div>
      )}
      {doc.holes.length === 0 && <div className="absolute inset-0 flex items-center justify-center pointer-events-none"><div className="glass rounded-[18px] px-4 py-3 text-sm text-zinc-200">No holes yet.</div></div>}
    </div>
  );
}
