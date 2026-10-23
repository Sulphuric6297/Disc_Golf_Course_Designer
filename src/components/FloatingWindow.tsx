import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp, GripHorizontal } from "lucide-react";

type Props = {
  title: React.ReactNode;
  /** Remembers where the user put it and whether it is minimized (per browser). */
  storageKey: string;
  width: number;
  onWidth: (w: number) => void;
  minWidth?: number;
  maxWidth?: number;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  label?: string;
  /** A point (map-area pixels) the window should not cover when it first opens, e.g. the camera. */
  avoid?: () => { x: number; y: number } | null;
  /** Width of a panel covering the right of the map (the window stays clear of it). */
  rightInset?: number;
};

type Pos = { x: number; y: number };
const MARGIN = 12;
const SNAP = 32;

const load = (key: string): Pos | null => {
  try {
    const v = JSON.parse(localStorage.getItem(key) || "null");
    return v && Number.isFinite(v.x) && Number.isFinite(v.y) ? v : null;
  } catch {
    return null;
  }
};

/**
 * A window over the map: drag it by its title bar (it snaps to the map's edges), resize it from
 * its corner, or minimize it to its title bar. Double-click the title bar to put it back.
 */
export function FloatingWindow({ title, storageKey, width, onWidth, minWidth = 260, maxWidth = 900, actions, children, className = "", label, avoid, rightInset = 0 }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<Pos | null>(() => load(storageKey));
  const [min, setMin] = useState(() => {
    try { return localStorage.getItem(`${storageKey}.min`) === "1"; } catch { return false; }
  });
  const [dragging, setDragging] = useState(false);

  const bounds = () => {
    const el = ref.current;
    const parent = el?.offsetParent as HTMLElement | null;
    if (!el || !parent) return null;
    return { w: parent.clientWidth - rightInset, h: parent.clientHeight, ew: el.offsetWidth, eh: el.offsetHeight };
  };
  // Keep it inside the map area (also when the window or the panels change size).
  const clampPos = (p: Pos): Pos => {
    const b = bounds();
    if (!b) return p;
    return { x: Math.min(Math.max(0, p.x), Math.max(0, b.w - b.ew)), y: Math.min(Math.max(0, p.y), Math.max(0, b.h - b.eh)) };
  };
  // Pull it flush against an edge when it is let go close to one.
  const snap = (p: Pos): Pos => {
    const b = bounds();
    if (!b) return p;
    const right = b.w - b.ew - MARGIN;
    const bottom = b.h - b.eh - MARGIN;
    return {
      x: p.x < MARGIN + SNAP ? MARGIN : p.x > right - SNAP ? right : p.x,
      y: p.y < MARGIN + SNAP ? MARGIN : p.y > bottom - SNAP ? bottom : p.y
    };
  };
  const defaultPos = (): Pos => {
    const b = bounds();
    if (!b) return { x: 0, y: 0 };
    // Centered above the tool dock; if that would hide the thing to avoid, go to the other side.
    const center = { x: (b.w - b.ew) / 2, y: b.h - b.eh - 124 };
    const a = avoid?.();
    const covers = a && a.x > center.x - 40 && a.x < center.x + b.ew + 40 && a.y > center.y - 40 && a.y < center.y + b.eh + 40;
    if (!covers) return center;
    // Top corner away from it (the bottom-left holds the map legends, the top-right the map controls)
    return a!.x > b.w / 2 ? { x: MARGIN, y: MARGIN } : { x: b.w - b.ew - MARGIN, y: 130 };
  };

  useLayoutEffect(() => {
    setPos(p => clampPos(p ?? defaultPos()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, min, rightInset]);

  useEffect(() => {
    const onResize = () => setPos(p => (p ? clampPos(p) : p));
    window.addEventListener("resize", onResize);
    const parent = ref.current?.offsetParent;
    const ro = parent ? new ResizeObserver(onResize) : null;
    if (parent && ro) ro.observe(parent);
    return () => {
      window.removeEventListener("resize", onResize);
      ro?.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!pos) return;
    try { localStorage.setItem(storageKey, JSON.stringify(pos)); } catch { /* ignore */ }
  }, [pos, storageKey]);
  useEffect(() => {
    try { localStorage.setItem(`${storageKey}.min`, min ? "1" : "0"); } catch { /* ignore */ }
  }, [min, storageKey]);

  const startMove = (e: React.PointerEvent) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest("button")) return;
    e.preventDefault();
    const start = { x: e.clientX, y: e.clientY, pos: pos ?? defaultPos() };
    let last = start.pos;
    setDragging(true);
    const move = (ev: PointerEvent) => {
      last = clampPos({ x: start.pos.x + ev.clientX - start.x, y: start.pos.y + ev.clientY - start.y });
      setPos(last);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setDragging(false);
      setPos(clampPos(snap(last)));
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const startResize = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const start = { x: e.clientX, w: width };
    const move = (ev: PointerEvent) => onWidth(Math.round(Math.min(maxWidth, Math.max(minWidth, start.w + ev.clientX - start.x))));
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const iconBtn = "p-1 text-slate-400 hover:text-zinc-50 hover:bg-white/10 rounded transition-colors";
  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={label}
      className={`absolute z-40 glass-solid rounded-xl shadow-2xl overflow-hidden border border-white/10 ring-1 ring-black/50 ${dragging ? "" : "transition-[left,top] duration-150"} ${className}`}
      style={{ width, left: pos?.x ?? 0, top: pos?.y ?? 0, visibility: pos ? "visible" : "hidden" }}
    >
      <div
        className="flex items-center justify-between gap-2 pl-2 pr-1.5 py-1.5 bg-white/5 cursor-move select-none touch-none"
        onPointerDown={startMove}
        onDoubleClick={() => setPos(clampPos(defaultPos()))}
        title="Drag to move · double-click to put it back"
        data-testid="window-titlebar"
      >
        <div className="flex items-center gap-1.5 min-w-0">
          <GripHorizontal className="w-4 h-4 text-slate-500 shrink-0" />
          {title}
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          {actions}
          <button onClick={() => setMin(m => !m)} className={iconBtn} title={min ? "Show the picture" : "Minimize"} aria-label={min ? "Expand" : "Minimize"}>
            {min ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>
      {!min && (
        <>
          {children}
          <div
            className="absolute right-0 bottom-0 w-5 h-5 cursor-nwse-resize touch-none"
            style={{ background: "linear-gradient(135deg, transparent 55%, rgba(226,232,240,0.7) 55%)" }}
            onPointerDown={startResize}
            title="Drag to resize"
            aria-label="Resize"
            data-testid="window-resize"
          />
        </>
      )}
    </div>
  );
}
