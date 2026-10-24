// The Design step's page: the printed course map (or a tee sign, a hole page, or the scorecard)
// exactly as it will print, updating as the style changes, and laid out by hand right on it.
import { Woods } from "./Woods";
import { useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Minus, Plus, RotateCw, Scan } from "lucide-react";
import { onPaintProgress, onPainted, renderPoster, withLivePaint } from "../lib/mapSvg";
import { SIGN_SIZES, renderScorecard, renderTeeSign, type SignSize } from "../lib/teeSign";
import { HOLE_PAGES, renderHolePage, type HolePageSize } from "../lib/holePage";
import { changeDoc, useCourse, useEditor } from "../state/course";
import { holeLabel } from "../lib/course";
import { useCanopy, useRelief } from "./useRelief";
import { moveLabel } from "./PageEditor";
import { duplicatePicked, movePicked, patchPicked, pickedOf, removePicked, sizePicked, type TargetKey } from "./printouts";
import { PieceToolbar } from "./PieceToolbar";
import { fontsIn, loadFont } from "../lib/fontLoad";
import { fitTexts } from "../lib/fitText";
import { pieceFont } from "../lib/pieces";

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
  // (the Google fonts the signs and pages use, put into the page so the preview shows them)
  const fonts = fontsIn(doc).join("|");
  useEffect(() => { for (const f of fonts.split("|")) if (f) loadFont(f); }, [fonts]);
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

  // Everything on the page picked, moved and sized like in Canva, the same on the course map, a tee
  // sign, a hole page and the scorecard: a click picks (and the toolbar over it holds its
  // settings), a drag moves it (snapping to the page's edges and middle and to the other pieces,
  // pink guides showing where; Alt drags freely), the corner squares size it, a double-click on
  // text types on the page. A finger taps to pick, then drags, and pinches the picked piece to
  // size it. One undo step each.
  const designSel = useEditor(e => e.designSel);
  const setEd = useEditor(e => e.set);
  const scope = useEditor(e => e.signScope);
  const t: TargetKey = preview === "map" ? "map" : preview === "sign" ? "sign" : preview === "page" ? "page" : "card";
  const editing = !only;
  const svgHost = useRef<HTMLDivElement>(null);
  type Box = { x: number; y: number; w: number; h: number };
  const [selBox, setSelBox] = useState<Box | null>(null);
  const [hover, setHover] = useState<{ id: string; box: Box } | null>(null);
  const [guides, setGuides] = useState<{ x: number[]; y: number[] }>({ x: [], y: [] });
  const [typing, setTyping] = useState<{ id: string; text: string; box: Box } | null>(null);
  const drag = useRef<{ mode: "move" | "size" | "turn"; rot0?: number; a0?: number; c?: { x: number; y: number }; rot?: number; id: string; el: SVGGElement; orig: string; cx: number; cy: number; pid: number; k: number; W: number; H: number; box: Box; anchor: { x: number; y: number }; corner: { x: number; y: number }; f: number; dx: number; dy: number; lines: { x: number[]; y: number[] } } | null>(null);
  const elOf = (id: string) =>
    svgHost.current?.querySelector(id.startsWith("label:") ? `[data-label="${CSS.escape(id.slice(6))}"]` : `[data-el="${CSS.escape(id)}"]`) as SVGGElement | null;
  const boxOf = (el: Element): Box => {
    const box = el.getAttribute("data-box");
    if (box) {
      const [x, y, w, h] = box.split(" ").map(Number);
      return { x, y, w, h };
    }
    // (as drawn, moved and sized as it is)
    const r = el.getBoundingClientRect(), host = svgHost.current!.getBoundingClientRect(), k = kRef.current;
    return { x: (r.left - host.left) / k, y: (r.top - host.top) / k, w: r.width / k, h: r.height / k };
  };
  /** The page's size as the pieces are placed on it (the scorecard: one card of the two). */
  const dims = () => ({ W: page?.width ?? 1, H: (page?.height ?? 1) / (t === "card" ? 2 : 1) });
  /** A move on the page as feet on the ground (the map's own scale and turn). */
  const groundShift = (dx: number, dy: number) => {
    const m = svgHost.current?.querySelector("[data-el=map]");
    const k = Number(m?.getAttribute("data-k")) || 1, rot = ((Number(m?.getAttribute("data-rot")) || 0) * Math.PI) / 180;
    const c = Math.cos(-rot), sn = Math.sin(-rot);
    return { x: (dx * c + dy * sn) / k, y: (-dx * sn + dy * c) / k };
  };
  // (what can be picked: the course map's map itself can't, so a drag on it pans)
  const pickable = (id: string | null) => !!id && !(t === "map" && id === "map");
  useLayoutEffect(() => {
    const el = editing && designSel ? elOf(designSel) : null;
    setSelBox(el ? boxOf(el) : null);
  }, [page, designSel, editing, held]);
  // (leaving the Design step, or another printout, lets go of what was picked)
  useEffect(() => { if (!editing) setEd({ designSel: null }); }, [editing, setEd]);
  useEffect(() => { setEd({ designSel: null }); setHover(null); setTyping(null); }, [preview, setEd]);
  useEffect(() => () => setEd({ designSel: null }), [setEd]);
  // Each piece is picked anywhere in its outline, not only on its ink (an unseen box the size of
  // what it draws), and lettering is kept inside its panels in the fonts it's set in
  const [fontsIn2, setFontsIn2] = useState(0);
  useEffect(() => {
    const on = () => setFontsIn2(v => v + 1);
    document.fonts?.addEventListener?.("loadingdone", on);
    return () => document.fonts?.removeEventListener?.("loadingdone", on);
  }, []);
  useLayoutEffect(() => {
    const host = svgHost.current;
    if (!host) return;
    fitTexts(host);
    if (!editing) return;
    for (const g of Array.from(host.querySelectorAll<SVGGElement>("[data-el]"))) {
      if (g.hasAttribute("data-box") || g.querySelector(":scope > rect[data-hit]")) continue;
      const b = g.getBBox();
      const r = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      r.setAttribute("data-hit", "1");
      r.setAttribute("x", String(b.x)); r.setAttribute("y", String(b.y)); r.setAttribute("width", String(b.width)); r.setAttribute("height", String(b.height));
      r.setAttribute("fill", "none"); r.setAttribute("pointer-events", "all");
      g.insertBefore(r, g.firstChild);
    }
  }, [page, held, fontsIn2, editing]);

  /** What's under the pointer: a label on the course map, or the smallest piece whose box takes in
   * the point (pieces overlap: a title over a panel, a panel's box reaching over its neighbor; the
   * one meant is the smaller, as in any design app). */
  const pieceAt = (target: EventTarget | null, cx: number, cy: number) => {
    const tag = t === "map" ? (target as Element).closest?.("[data-label]") : null;
    if (tag) return `label:${tag.getAttribute("data-label")}`;
    const host = svgHost.current;
    if (!host) return null;
    const hr = host.getBoundingClientRect(), k = kRef.current, px = (cx - hr.left) / k, py = (cy - hr.top) / k;
    let best: string | null = null, area = Infinity;
    for (const g of Array.from(host.querySelectorAll("[data-el]"))) {
      const id = g.getAttribute("data-el");
      if (!pickable(id)) continue;
      const b = boxOf(g);
      if (px < b.x || px > b.x + b.w || py < b.y || py > b.y + b.h) continue;
      if (b.w * b.h < area) { area = b.w * b.h; best = id; }
    }
    return best;
  };
  /** A piece that fills most of the page (the map, a full-page panel or picture): a tap on it
   * while something else is picked lets go, the way a tap on a design's background does. */
  const fillsPage = (id: string) => {
    const el = elOf(id), { W, H } = dims();
    if (!el) return false;
    const b = boxOf(el);
    return b.w * b.h > W * H * 0.5;
  };
  /** Where things line up: the page's edges and middle, and every other piece's. */
  const linesFor = (id: string) => {
    const W = page!.width, H = page!.height, xs = [0, W / 2, W], ys = [0, H / 2, H];
    if (t === "card") ys.push(H / 4, (H * 3) / 4);
    for (const g of Array.from(svgHost.current?.querySelectorAll("[data-el]") ?? [])) {
      const gid = g.getAttribute("data-el");
      if (!gid || gid === id || (t === "map" && gid === "map")) continue;
      const b = boxOf(g);
      if (b.w > W * 0.95 && b.h > H * 0.95) continue;
      xs.push(b.x, b.x + b.w / 2, b.x + b.w);
      ys.push(b.y, b.y + b.h / 2, b.y + b.h);
    }
    return { x: xs, y: ys };
  };
  /** The nearest line to any of `edges` within reach: the shift onto it, and the line. */
  const snap = (edges: number[], lines: number[], reach: number) => {
    let best: { d: number; at: number } | null = null;
    for (const e of edges) for (const l of lines) { const d = l - e; if (Math.abs(d) <= reach && (!best || Math.abs(d) < Math.abs(best.d))) best = { d, at: l }; }
    return best;
  };

  // (a finger off the piece lets go of it only when it lifts without moving: the first of two
  // fingers pinching a small piece often lands just beside it)
  // (the angle shown while a piece is being turned)
  const [turning, setTurning] = useState<number | null>(null);
  const tapOut = useRef<{ pid: number; x: number; y: number } | null>(null);
  // (a finger picks a piece with a tap, when it lifts without moving: a drag across a piece not
  // picked scrolls the page, as on any phone)
  const tapPick = useRef<{ id: string; pid: number; x: number; y: number } | null>(null);
  const onPageDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!editing || !page || e.button !== 0 || typing) return;
    // (a field in the panel lets go, so keys like Delete go to what's picked on the page)
    const active = document.activeElement as HTMLElement | null;
    if (active?.matches?.("input,textarea,select")) active.blur();
    const corner = (e.target as HTMLElement).closest?.("[data-corner]") as HTMLElement | null;
    const turn = !!(e.target as HTMLElement).closest?.("[data-turn-handle]");
    if ((e.target as HTMLElement).closest?.("[data-page-bar]")) return;
    let id = corner || turn ? designSel : pieceAt(e.target, e.clientX, e.clientY);
    if (id && designSel && id !== designSel && !corner && !turn && fillsPage(id)) id = null;
    if (!id && e.pointerType === "touch" && designSel) { tapOut.current = { pid: e.pointerId, x: e.clientX, y: e.clientY }; return; }
    if (!id) { setEd({ designSel: null }); return; }
    const el = elOf(id);
    if (!el) return;
    const fresh = id !== designSel;
    if (!corner && !turn && fresh && e.pointerType === "touch") { tapPick.current = { id, pid: e.pointerId, x: e.clientX, y: e.clientY }; return; }
    if (fresh) setEd({ designSel: id });
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    const b = boxOf(el);
    const [sx, sy] = (corner?.dataset.corner ?? "1,1").split(",").map(Number);
    const { W, H } = dims();
    if (turn) {
      // (turned about its middle: the angle from the middle to the finger, from where it started)
      const hr = svgHost.current!.getBoundingClientRect(), k = kRef.current;
      const c = { x: hr.left + (b.x + b.w / 2) * k, y: hr.top + (b.y + b.h / 2) * k };
      drag.current = {
        mode: "turn", id, el, orig: el.getAttribute("style") ?? "", cx: e.clientX, cy: e.clientY, pid: e.pointerId, k, W, H, box: b, corner: { x: 0, y: 0 }, anchor: { x: 0, y: 0 }, f: 1, dx: 0, dy: 0, lines: { x: [], y: [] },
        c, a0: Math.atan2(e.clientY - c.y, e.clientX - c.x), rot0: pickedOf(live, t, id)?.rot ?? 0, rot: pickedOf(live, t, id)?.rot ?? 0
      };
      setHover(null);
      return;
    }
    drag.current = {
      mode: corner ? "size" : "move", id, el, orig: el.getAttribute("transform") ?? "", cx: e.clientX, cy: e.clientY, pid: e.pointerId, k: kRef.current, W, H, box: b,
      corner: { x: b.x + sx * b.w, y: b.y + sy * b.h }, anchor: { x: b.x + (1 - sx) * b.w, y: b.y + (1 - sy) * b.h }, f: 1, dx: 0, dy: 0,
      lines: corner ? { x: [], y: [] } : linesFor(id)
    };
    setHover(null);
  };
  const onPageMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) {
      // (the piece under the pointer, outlined: what a click picks)
      if (e.pointerType !== "mouse" || !editing || typing) return;
      const id = pieceAt(e.target, e.clientX, e.clientY);
      if (!id || id === designSel) { if (hover) setHover(null); return; }
      if (hover?.id !== id) { const el = elOf(id); if (el) setHover({ id, box: boxOf(el) }); }
      return;
    }
    if (d.pid !== e.pointerId) return;
    if (d.mode === "turn") {
      const a = Math.atan2(e.clientY - d.c!.y, e.clientX - d.c!.x);
      let r = d.rot0! + ((a - d.a0!) * 180) / Math.PI;
      r = ((((r + 180) % 360) + 360) % 360) - 180;
      // (straight, square and on the diagonals snap from a few degrees away; Shift: every 15)
      if (e.shiftKey) r = Math.round(r / 15) * 15;
      else { const q = Math.round(r / 45) * 45; if (Math.abs(r - q) < 4) r = q; }
      r = Math.round(r);
      d.rot = r;
      // (live: on top of the turn it had, about its middle, until it's let go)
      d.el.style.setProperty("transform-box", "fill-box");
      d.el.style.setProperty("transform-origin", "center");
      d.el.style.setProperty("rotate", `${r - d.rot0!}deg`);
      setTurning(r);
      return;
    }
    let dx = (e.clientX - d.cx) / d.k, dy = (e.clientY - d.cy) / d.k;
    if (d.mode === "move") {
      // (snapped onto the nearest line within a few pixels, shown pink)
      const reach = 6 / d.k, gx: number[] = [], gy: number[] = [];
      if (!e.altKey && !d.id.startsWith("label:")) {
        const b = d.box;
        const sxp = snap([b.x + dx, b.x + dx + b.w / 2, b.x + dx + b.w], d.lines.x, reach);
        const syp = snap([b.y + dy, b.y + dy + b.h / 2, b.y + dy + b.h], d.lines.y, reach);
        if (sxp) { dx += sxp.d; gx.push(sxp.at); }
        if (syp) { dy += syp.d; gy.push(syp.at); }
      }
      setGuides({ x: gx, y: gy });
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
    const tp = tapPick.current;
    if (tp && tp.pid === e.pointerId) {
      tapPick.current = null;
      if (Math.hypot(e.clientX - tp.x, e.clientY - tp.y) < 10) setEd({ designSel: tp.id });
    }
    const out = tapOut.current;
    if (out && out.pid === e.pointerId) {
      tapOut.current = null;
      if (Math.hypot(e.clientX - out.x, e.clientY - out.y) < 10) setEd({ designSel: null });
    }
    const d = drag.current;
    if (!d || d.pid !== e.pointerId) return;
    drag.current = null;
    setGuides({ x: [], y: [] });
    if (d.mode === "turn") {
      setTurning(null);
      if (d.orig) d.el.setAttribute("style", d.orig); else d.el.removeAttribute("style");
      if (d.rot !== d.rot0) patchPicked(t, d.id, { rot: d.rot });
      return;
    }
    if (Math.abs(e.clientX - d.cx) + Math.abs(e.clientY - d.cy) < 3) {
      d.el.setAttribute("transform", d.orig);
      setSelBox(d.box);
      // (a finger tapping what's already picked: its words to type, as in any design app)
      if (e.pointerType === "touch" && d.mode === "move" && !d.id.startsWith("label:") && pickedOf(live, t, d.id)?.has.text) startTyping(d.id);
      return;
    }
    if (d.mode === "move" && d.id.startsWith("label:")) {
      const g = groundShift(d.dx, d.dy);
      moveLabel(d.id.slice(6), g.x, g.y);
    } else if (d.mode === "move") movePicked(t, d.id, d.dx, d.dy, d.box, d.W, d.H);
    else sizePicked(t, d.id, d.f, d.anchor, d.box, d.W, d.H);
  };
  /** Double-click on text: type on the page. */
  const onPageDouble = (e: React.MouseEvent) => {
    if (!editing) return;
    const id = pieceAt(e.target, e.clientX, e.clientY);
    if (id && pickedOf(doc, t, id)?.has.text) startTyping(id);
  };
  const startTyping = (id: string) => {
    const el = elOf(id), p = pickedOf(live, t, id);
    if (!el || !p) return;
    setEd({ designSel: id });
    setTyping({ id, text: p.text ?? "", box: boxOf(el) });
  };
  const doneTyping = (keep: boolean) => {
    if (typing && keep) patchPicked(t, typing.id, { text: typing.text });
    setTyping(null);
  };
  /** The toolbar's − and +: bigger or smaller about its top-left corner. */
  const grow = (f: number) => {
    const el = designSel ? elOf(designSel) : null;
    if (!el || !designSel) return;
    const b = boxOf(el), { W, H } = dims();
    sizePicked(t, designSel, f, { x: b.x, y: b.y }, b, W, H);
  };
  /** A font shown on the picked piece while it's pointed at in the list (not kept). */
  const previewFont = (f: string | null) => {
    const el = designSel ? elOf(designSel) : null;
    if (!el) return;
    for (const x of Array.from(el.querySelectorAll<SVGElement>("text, tspan"))) {
      if (f) x.style.setProperty("font-family", pieceFont(f), "important");
      else x.style.removeProperty("font-family");
    }
    if (svgHost.current) fitTexts(svgHost.current);
  };
  // A finger on the picked piece (or its corners) moves it, never the page under it: the browser
  // is told not to scroll before it starts to (a style saying so isn't heard on a drawing's shapes)
  useEffect(() => {
    const el = pageEl.current;
    if (!el || !editing) return;
    const onStart = (ev: TouchEvent) => {
      const id = useEditor.getState().designSel;
      if (!id || ev.touches.length > 1) return;
      const tg = ev.target as Element;
      if (tg.closest?.("[data-corner],[data-turn-handle]")) { ev.preventDefault(); return; }
      const g = id.startsWith("label:") ? tg.closest?.("[data-label]") : tg.closest?.("[data-el]");
      const under = g ? (id.startsWith("label:") ? `label:${g.getAttribute("data-label")}` : g.getAttribute("data-el")) : null;
      if (under === id) ev.preventDefault();
    };
    el.addEventListener("touchstart", onStart, { passive: false });
    return () => el.removeEventListener("touchstart", onStart);
  }, [editing, page]);
  // A pinch on the picked piece (a phone) sizes it; anywhere else it zooms the page
  const pieceRef = useRef({ designSel, t, page });
  pieceRef.current = { designSel, t, page };
  useEffect(() => {
    const el = box.current;
    if (!el || !compact) return;
    let pinch: { id: string; g: SVGGElement; orig: string; d: number; box: Box; mid: { x: number; y: number }; f: number } | null = null;
    const spread = (tl: TouchList) => Math.hypot(tl[0].clientX - tl[1].clientX, tl[0].clientY - tl[1].clientY);
    const onStart = (ev: TouchEvent) => {
      const { designSel: id } = pieceRef.current;
      if (ev.touches.length !== 2 || !id || id.startsWith("label:")) return;
      const g = elOf(id), host = svgHost.current;
      if (!g || !host) return;
      const b = boxOf(g), hr = host.getBoundingClientRect(), k = kRef.current;
      const mx = ((ev.touches[0].clientX + ev.touches[1].clientX) / 2 - hr.left) / k, my = ((ev.touches[0].clientY + ev.touches[1].clientY) / 2 - hr.top) / k;
      const near = 50 / k;
      if (mx < b.x - near || mx > b.x + b.w + near || my < b.y - near || my > b.y + b.h + near) return;
      ev.stopImmediatePropagation();
      // (not a tap off it or on another piece, and not a drag by the first finger)
      tapOut.current = null;
      tapPick.current = null;
      const dr = drag.current;
      if (dr) { dr.el.setAttribute("transform", dr.orig); drag.current = null; setGuides({ x: [], y: [] }); }
      pinch = { id, g, orig: g.getAttribute("transform") ?? "", d: Math.max(1, spread(ev.touches)), box: b, mid: { x: b.x + b.w / 2, y: b.y + b.h / 2 }, f: 1 };
    };
    const onMove = (ev: TouchEvent) => {
      if (!pinch || ev.touches.length !== 2) return;
      ev.preventDefault();
      ev.stopImmediatePropagation();
      const f = Math.max(0.2, Math.min(6, spread(ev.touches) / pinch.d)), A = pinch.mid;
      pinch.f = f;
      pinch.g.setAttribute("transform", `translate(${A.x} ${A.y}) scale(${f}) translate(${-A.x} ${-A.y}) ${pinch.orig}`);
      setSelBox({ x: A.x + (pinch.box.x - A.x) * f, y: A.y + (pinch.box.y - A.y) * f, w: pinch.box.w * f, h: pinch.box.h * f });
    };
    const onEnd = (ev: TouchEvent) => {
      if (!pinch || ev.touches.length >= 2) return;
      ev.stopImmediatePropagation();
      const p = pinch, { t: tk, page: pg } = pieceRef.current;
      pinch = null;
      if (Math.abs(p.f - 1) > 0.02 && pg) sizePicked(tk, p.id, p.f, p.mid, p.box, pg.width, pg.height / (tk === "card" ? 2 : 1));
      else p.g.setAttribute("transform", p.orig);
    };
    // (heard before the page's own pinch to zoom)
    el.addEventListener("touchstart", onStart, { capture: true, passive: true });
    el.addEventListener("touchmove", onMove, { capture: true, passive: false });
    el.addEventListener("touchend", onEnd, { capture: true });
    el.addEventListener("touchcancel", onEnd, { capture: true });
    return () => {
      el.removeEventListener("touchstart", onStart, { capture: true });
      el.removeEventListener("touchmove", onMove, { capture: true });
      el.removeEventListener("touchend", onEnd, { capture: true });
      el.removeEventListener("touchcancel", onEnd, { capture: true });
    };
  }, [compact]);
  // Keys for what's picked: Delete hides it (or takes away what was added), arrows nudge it
  // (Shift: more), Ctrl+D copies what was added, Enter types into text, Esc lets go. Before the
  // map's own keys hear them.
  useEffect(() => {
    if (!editing || !designSel || typing) return;
    const onKey = (e: KeyboardEvent) => {
      const tg = e.target as HTMLElement;
      if (tg.closest?.("input,textarea,select,[contenteditable=true],[role=dialog]")) return;
      const mod = e.ctrlKey || e.metaKey;
      let used = true;
      if (e.key === "Escape") setEd({ designSel: null });
      else if (!mod && (e.key === "Delete" || e.key === "Backspace")) removePicked(t, designSel);
      else if (mod && e.key.toLowerCase() === "d") duplicatePicked(t, designSel);
      else if (!mod && e.key === "Enter" && pickedOf(live, t, designSel)?.has.text) startTyping(designSel);
      else if (!mod && e.key.startsWith("Arrow") && page) {
        const el = elOf(designSel);
        if (!el) return;
        const b = boxOf(el), step = e.shiftKey ? 10 : 1, { W, H } = dims();
        const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0, dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
        if (designSel.startsWith("label:")) { const g = groundShift(dx, dy); moveLabel(designSel.slice(6), g.x, g.y); }
        else movePicked(t, designSel, dx, dy, b, W, H);
      } else used = false;
      if (used) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [editing, designSel, page, setEd, t, typing, live]);

  if (!page) return null;
  const margin = compact ? 20 : 48;
  const fit = Math.min((size.w - margin) / page.width, (size.h - margin - (compact && designSel ? 64 : 0)) / page.height);
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
  const sel = (select: string) => `bg-white/[0.08] rounded-full px-3 ${compact ? "h-10 text-base min-w-0" : "py-1 text-sm"} ${select}`;
  const perHole = editing && (preview === "sign" || preview === "page") && !!holeId;
  // (the toolbar over the piece, under it when there's no room above; docked at the bottom on a phone)
  const barTop = selBox ? (selBox.y * k > 56 ? selBox.y * k - 50 : (selBox.y + selBox.h) * k + 14) : 0;
  const barLeft = selBox ? Math.max(0, Math.min(selBox.x * k, page.width * k - 420)) : 0;
  const toolbar = editing && designSel && selBox && !typing ? (
    <PieceToolbar t={t} id={designSel} onGrow={grow} onPreviewFont={previewFont} onEditText={() => startTyping(designSel)} onDone={() => setEd({ designSel: null })} docked={compact} />
  ) : null;
  return (
    <div className="absolute inset-0 z-20 bg-zinc-950 flex flex-col isolate overflow-hidden" style={compact ? { paddingTop: topInset } : undefined} data-testid="map-designer">
      <Woods inset />
      <div className={compact ? "flex flex-wrap items-center gap-x-2 gap-y-1.5 px-2 py-2" : "flex items-center gap-2 px-3 py-2.5 flex-wrap"}>
        <div role="tablist" className={compact ? "w-full flex gap-1" : "flex gap-1"}>{[...(only ? [] : [tab("general", "General")]), tab("map", "Course map", "Map"), tab("sign", "Tee sign", "Sign"), tab("page", "Hole page", "Page"), tab("scorecard", "Scorecard", "Card")]}</div>
        {(preview === "sign" || preview === "page") && doc.holes.length > 0 && (
          <select aria-label={preview === "sign" ? "Hole for the tee sign" : "Hole for the hole page"} className={sel("")} value={holeId ?? ""} onChange={e => setHole(e.target.value)}>
            {doc.holes.map(h => <option key={h.id} value={h.id}>Hole {holeLabel(doc, h.id)}</option>)}
          </select>
        )}
        {preview === "sign" && (
          <select aria-label="Tee sign size" className={sel("")} value={signSize} onChange={e => { setSignSize(e.target.value as SignSize); setZoom(null); }}>
            {(Object.keys(SIGN_SIZES) as SignSize[]).map(k => <option key={k} value={k}>{SIGN_SIZES[k].label}</option>)}
          </select>
        )}
        {preview === "page" && (
          <select aria-label="Hole page size" className={sel("")} value={pageSize} onChange={e => { setPageSize(e.target.value as HolePageSize); setZoom(null); }}>
            {(Object.keys(HOLE_PAGES) as HolePageSize[]).map(k => <option key={k} value={k}>{HOLE_PAGES[k].label}</option>)}
          </select>
        )}
        {perHole && (
          <div className="flex items-center gap-0.5 rounded-full bg-white/[0.08] p-0.5" role="radiogroup" aria-label="Changes go to" data-testid="change-scope">
            {(["all", "hole"] as const).map(v => (
              <button key={v} role="radio" aria-checked={scope === v} onClick={() => setEd({ signScope: v })} className={`px-2.5 ${compact ? "h-9 text-[12.5px]" : "py-1 text-xs"} rounded-full font-semibold whitespace-nowrap ${scope === v ? "bg-orange-400 text-zinc-950" : "text-zinc-300 hover:bg-white/[0.09]"}`}>
                {v === "all" ? "Every hole" : `Hole ${holeLabel(doc, holeId!)} only`}
              </button>
            ))}
          </div>
        )}
        {!compact && zoomGroup}
      </div>
      {/* (A phone: the zoom buttons float over the page, in the thumb's reach; the picked piece's
          toolbar takes their place along the bottom) */}
      {compact && !designSel && <div className="glass absolute right-2 bottom-2 z-10 rounded-[22px] p-0.5">{zoomGroup}</div>}
      {compact && toolbar && (
        <div className="absolute inset-x-2 bottom-2 z-30 flex flex-col items-center gap-1">
          <div className="pointer-events-none rounded-full bg-black/55 px-2.5 py-0.5 text-[11.5px] text-zinc-200" data-testid="phone-hint">Drag it to move · pinch it to size</div>
          {toolbar}
        </div>
      )}
      <div ref={box} className={`flex-1 overflow-auto ${compact ? "dg-scroll" : ""} cursor-grab`} data-testid="design-scroll" onPointerDown={onBoxDown} onPointerMove={onBoxMove} onPointerUp={onBoxUp} onPointerCancel={onBoxUp}>
        {/* (as wide as the page when zoomed in past the window, so all of it scrolls into view) */}
        <div className={`w-max min-w-full min-h-full flex items-center justify-center ${compact ? "p-2.5" : "p-6"}`} style={compact && designSel ? { paddingBottom: 72 } : undefined}>
          <div
            ref={pageEl}
            className="relative shrink-0"
            onPointerDown={onPageDown}
            onPointerMove={onPageMove}
            onPointerUp={onPageUp}
            onPointerCancel={onPageUp}
            onPointerLeave={() => setHover(null)}
            onDoubleClick={onPageDouble}
            style={{ width: page.width * k, height: page.height * k, ...(pinchScale ? { transform: `scale(${pinchScale.s})`, transformOrigin: `${pinchScale.ox}px ${pinchScale.oy}px` } : {}) }}
          >
            <div
              ref={svgHost}
              data-testid="design-page"
              className={`shadow-2xl bg-white ${editing ? (t === "map" ? "[&_[data-el]:not([data-el=map])]:cursor-pointer" : "[&_[data-el]]:cursor-pointer") : ""}`}
              style={{ width: page.width * k, height: page.height * k }}
              dangerouslySetInnerHTML={{ __html: held ?? html }}
            />
            {editing && <style>{`[data-testid=design-page] [data-label]{cursor:move}${designSel ? `[data-testid=design-page] ${designSel.startsWith("label:") ? `[data-label="${designSel.slice(6).replace(/"/g, "")}"]` : `[data-el="${designSel.replace(/"/g, "")}"]`}{cursor:move;touch-action:none}` : ""}`}</style>}
            {editing && hover && hover.id !== designSel && (
              <div className="absolute pointer-events-none rounded-[2px]" data-testid="page-hover" style={{ left: hover.box.x * k - 2, top: hover.box.y * k - 2, width: hover.box.w * k + 4, height: hover.box.h * k + 4, outline: "1.5px solid rgba(56,189,248,.9)" }} />
            )}
            {guides.x.map(x => <div key={`gx${x}`} className="absolute top-0 bottom-0 w-px pointer-events-none bg-pink-500" style={{ left: x * k }} data-testid="snap-guide" />)}
            {guides.y.map(y => <div key={`gy${y}`} className="absolute left-0 right-0 h-px pointer-events-none bg-pink-500" style={{ top: y * k }} data-testid="snap-guide" />)}
            {editing && designSel && selBox && (
              <div className="absolute pointer-events-none" data-testid="page-selection" style={{ left: selBox.x * k, top: selBox.y * k, width: selBox.w * k, height: selBox.h * k, outline: "2px solid #f97316", outlineOffset: 2 }}>
                {!designSel.startsWith("label:") && !typing && pickedOf(live, t, designSel)?.has.turn && (
                  <div className="absolute left-1/2 -top-9 touch:-top-12 -translate-x-1/2 flex flex-col items-center pointer-events-auto" style={{ touchAction: "none" }}>
                    <div data-turn-handle data-testid="page-turn" title="Turn it (Shift: 15° at a time)" className="w-6 h-6 touch:w-9 touch:h-9 rounded-full bg-white border-2 border-orange-500 shadow flex items-center justify-center text-orange-500 cursor-grab" style={{ touchAction: "none" }}>
                      <RotateCw size={compact ? 16 : 12} strokeWidth={2.6} />
                    </div>
                    <div className="w-px h-2.5 touch:h-3 bg-orange-500" />
                  </div>
                )}
                {turning !== null && <div className="absolute left-1/2 -translate-x-1/2 -top-[68px] touch:-top-[84px] glass rounded-full px-2.5 py-1 text-[12px] font-semibold text-zinc-50 tabular-nums" data-testid="page-turn-angle">{turning}°</div>}
                {!designSel.startsWith("label:") && !typing && ["0,0", "1,0", "0,1", "1,1"].map(c => {
                  const [cx, cy] = c.split(",").map(Number);
                  return <div key={c} data-corner={c} data-testid="page-corner" className="absolute w-3 h-3 touch:w-[18px] touch:h-[18px] bg-white border-2 border-orange-500 rounded-full pointer-events-auto" style={{ left: `calc(${cx * 100}% - ${compact ? 9 : 6}px)`, top: `calc(${cy * 100}% - ${compact ? 9 : 6}px)`, cursor: cx === cy ? "nwse-resize" : "nesw-resize", touchAction: "none" }} />;
                })}
              </div>
            )}
            {!compact && toolbar && <div className="absolute z-30" style={{ left: barLeft, top: barTop }}>{toolbar}</div>}
            {typing && (
              <textarea
                autoFocus
                aria-label="The words"
                data-testid="page-typing"
                className="absolute z-40 rounded-[8px] bg-zinc-950/90 text-zinc-50 ring-2 ring-orange-400 px-2 py-1.5 text-[15px] leading-snug resize-none focus:outline-none"
                style={{ left: typing.box.x * k - 4, top: typing.box.y * k - 4, width: Math.max(220, typing.box.w * k + 8), height: Math.max(64, typing.box.h * k + 8) }}
                value={typing.text}
                onChange={e => setTyping({ ...typing, text: e.target.value })}
                onKeyDown={e => { if (e.key === "Escape") { e.preventDefault(); doneTyping(false); } else if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); doneTyping(true); } }}
                onBlur={() => doneTyping(true)}
                onPointerDown={e => e.stopPropagation()}
              />
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
      {/* (a map is a map without holes: only the pages made for a hole say there's none yet) */}
      {doc.holes.length === 0 && (preview === "sign" || preview === "page") && <div className="absolute inset-0 flex items-center justify-center pointer-events-none"><div className="glass rounded-[18px] px-4 py-3 text-sm text-zinc-200">No holes yet: tee signs and hole pages show once there's a hole.</div></div>}
    </div>
  );
}
