// The phone's bottom sheet: the step's panel, the selection or the active tool, over the map.
// It rests at three heights (detents): peek (its header, so the map has the screen), half and
// full (a strip of map stays visible). Drag the handle or the header, or the content when it is
// scrolled to the top; flick to go one height up or down; tap the handle to step through them;
// with a keyboard, the handle takes the arrow keys.
//
// Smooth on phones: the sheet is always full height and slides (a GPU transform, no layout per
// frame); while a finger drags it, the position is written straight to the element once per
// frame (no React render). Only resting at a new height changes React state.
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

export type Detent = "peek" | "half" | "full";
const ORDER: Detent[] = ["peek", "half", "full"];
const NAMES: Record<Detent, string> = { peek: "small", half: "half height", full: "full height" };
const SLOP = 6;

type Props = {
  detent: Detent;
  onDetent: (d: Detent) => void;
  /** Always shown at the top (measured: the peek height is the header's height plus `peekExtra`). */
  header: ReactNode;
  children: ReactNode;
  /** How much of the content shows under the header at peek. */
  peekExtra?: number;
  /** Space kept free above the sheet at full height (the top bar, a strip of map). */
  topGap?: number;
  /** The sheet's resting height (px), when it changes. */
  onHeight?: (px: number) => void;
  label: string;
  /** Changes when the content is something else (a new selection, a new step): scrolls it to the top. */
  contentKey?: string;
};

export function BottomSheet({ detent, onDetent, header, children, peekExtra = 0, topGap = 72, onHeight, label, contentKey }: Props) {
  const sheet = useRef<HTMLDivElement>(null);
  const head = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const [headH, setHeadH] = useState(96);
  const [avail, setAvail] = useState(600);
  const [dragging, setDragging] = useState(false);
  const swallowClick = useRef(false);

  // The header's height and the space the sheet can use
  useLayoutEffect(() => {
    const h = head.current, el = sheet.current?.parentElement;
    if (!h || !el) return;
    const measure = () => {
      setHeadH(Math.round(h.getBoundingClientRect().height));
      setAvail(el.clientHeight);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(h);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const full = Math.max(160, avail - topGap);
  const peek = Math.min(full, headH + peekExtra);
  const half = Math.min(full, Math.max(peek + 60, Math.round(avail * 0.52)));
  const heights: Record<Detent, number> = { peek, half, full };
  const rest = heights[detent];
  /** Where the sheet's top is for a visible height (it slides down from full height). */
  const offset = (h: number) => `translate3d(0, ${Math.round(full - h)}px, 0)`;

  useLayoutEffect(() => { onHeight?.(rest); }, [rest, onHeight]);
  // The list's height follows the sheet: at once when it grows, after the slide when it shrinks
  const [bodyRest, setBodyRest] = useState(rest);
  useLayoutEffect(() => {
    if (rest >= bodyRest) { setBodyRest(rest); return; }
    const t = window.setTimeout(() => setBodyRest(rest), 320);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rest]);
  useEffect(() => { body.current?.scrollTo({ top: 0 }); }, [contentKey]);

  // Typing: the on-screen keyboard covers the bottom of the screen (the page doesn't resize), so
  // the sheet goes to full height, the list gets room to scroll the field above the keyboard, and
  // the field is brought into view
  const [keyboard, setKeyboard] = useState(0);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const onResize = () => setKeyboard(Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)));
    vv.addEventListener("resize", onResize);
    return () => vv.removeEventListener("resize", onResize);
  }, []);
  const onFocusIn = (e: React.FocusEvent) => {
    const el = e.target as HTMLElement;
    if (!el.matches("textarea, input:not([type=range]):not([type=checkbox]):not([type=radio]):not([type=color]):not([type=button])")) return;
    if (detent !== "full") onDetent("full");
    window.setTimeout(() => el.scrollIntoView({ block: "center", behavior: "smooth" }), 350);
  };

  const nearest = (h: number, velocity: number, from: Detent) => {
    // A flick goes one height on in its direction; otherwise the closest height
    if (Math.abs(velocity) > 0.45) {
      const i = ORDER.indexOf(from) + (velocity < 0 ? 1 : -1);
      return ORDER[Math.max(0, Math.min(ORDER.length - 1, i))];
    }
    return ORDER.reduce((best, d) => (Math.abs(heights[d] - h) < Math.abs(heights[best] - h) ? d : best), from);
  };

  /** A drag of the sheet from a press at `y0`; returns the move and end handlers. */
  const dragFrom = (y0: number) => {
    const start = rest;
    const el = sheet.current;
    let last = { y: y0, t: performance.now() }, v = 0, frame = 0, h = start;
    setDragging(true);
    return {
      move: (y: number) => {
        const now = performance.now();
        if (now > last.t) v = 0.7 * ((y - last.y) / (now - last.t)) + 0.3 * v;
        last = { y, t: now };
        h = Math.max(Math.min(peek, 56), Math.min(full, start - (y - y0)));
        if (!frame) frame = requestAnimationFrame(() => { frame = 0; if (el) el.style.transform = offset(h); });
      },
      end: (y: number) => {
        cancelAnimationFrame(frame);
        const hEnd = Math.max(peek * 0.5, Math.min(full, start - (y - y0)));
        setDragging(false);
        const to = nearest(hEnd, v, detent);
        // (Resting where it was: put it back; else React moves it)
        if (to === detent && el) requestAnimationFrame(() => { el.style.transform = offset(rest); });
        onDetent(to);
      }
    };
  };

  // Header and handle: pointer events (mouse, pen or finger)
  const onHeadDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const x0 = e.clientX, y0 = e.clientY, id = e.pointerId;
    let d: ReturnType<typeof dragFrom> | null = null;
    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== id) return;
      if (!d) {
        const dy = ev.clientY - y0, dx = ev.clientX - x0;
        if (Math.abs(dy) < SLOP || Math.abs(dy) < Math.abs(dx)) {
          if (Math.abs(dx) > SLOP) stop();
          return;
        }
        d = dragFrom(y0);
        swallowClick.current = true;
      }
      d.move(ev.clientY);
    };
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
    const up = (ev: PointerEvent) => {
      if (ev.pointerId !== id) return;
      stop();
      if (d) d.end(ev.clientY);
      // (The click that follows a drag is the drag's, not the button's under the finger)
      window.setTimeout(() => { swallowClick.current = false; }, 0);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  };

  // Content: touch events, so a drag can be the sheet's (down when scrolled to the top, up while
  // it isn't at full height) or the list's own scrolling. (Attached once: a drag re-renders the
  // sheet, and the drag under way must outlive that render)
  const latest = useRef({ detent, dragFrom });
  latest.current = { detent, dragFrom };
  useEffect(() => {
    const el = body.current;
    if (!el) return;
    let y0 = 0, x0 = 0, decided: "sheet" | "scroll" | null = null;
    let d: ReturnType<typeof dragFrom> | null = null;
    const start = (e: TouchEvent) => {
      if (e.touches.length !== 1) { decided = "scroll"; return; }
      y0 = e.touches[0].clientY;
      x0 = e.touches[0].clientX;
      decided = null;
      d = null;
    };
    const move = (e: TouchEvent) => {
      if (decided === "scroll" || e.touches.length !== 1) return;
      const y = e.touches[0].clientY, dy = y - y0, dx = e.touches[0].clientX - x0;
      if (!decided) {
        if (Math.abs(dy) < SLOP && Math.abs(dx) < SLOP) return;
        const onSlider = (e.target as HTMLElement).closest?.("input[type=range]");
        const down = dy > 0 && el.scrollTop <= 0;
        const up = dy < 0 && latest.current.detent !== "full";
        decided = !onSlider && Math.abs(dy) > Math.abs(dx) && (down || up) ? "sheet" : "scroll";
        if (decided === "sheet") d = latest.current.dragFrom(y0);
      }
      if (decided === "sheet" && d) {
        e.preventDefault();
        d.move(y);
      }
    };
    const end = (e: TouchEvent) => {
      if (decided === "sheet" && d) d.end(e.changedTouches[0]?.clientY ?? y0);
      decided = null;
      d = null;
    };
    el.addEventListener("touchstart", start, { passive: true });
    el.addEventListener("touchmove", move, { passive: false });
    el.addEventListener("touchend", end);
    el.addEventListener("touchcancel", end);
    return () => {
      el.removeEventListener("touchstart", start);
      el.removeEventListener("touchmove", move);
      el.removeEventListener("touchend", end);
      el.removeEventListener("touchcancel", end);
    };
  }, []);

  const i = ORDER.indexOf(detent);
  const next = ORDER[(i + 1) % ORDER.length];
  const onKey = (e: React.KeyboardEvent) => {
    const to = e.key === "ArrowUp" || e.key === "PageUp" ? ORDER[Math.min(2, i + 1)] : e.key === "ArrowDown" || e.key === "PageDown" ? ORDER[Math.max(0, i - 1)] : e.key === "Home" ? "full" : e.key === "End" ? "peek" : null;
    if (to) {
      e.preventDefault();
      onDetent(to);
    }
  };

  return (
    <section
      ref={sheet}
      aria-label={label}
      data-testid="sheet"
      data-detent={detent}
      className={`dg-sheet absolute left-0 right-0 bottom-0 z-30 flex flex-col bg-zinc-900 border-t border-white/10 rounded-t-[22px] shadow-[0_-6px_24px_rgba(0,0,0,0.4)] will-change-transform ${dragging ? "" : "transition-transform duration-300 ease-[cubic-bezier(0.2,0.9,0.3,1)] motion-reduce:transition-none"}`}
      style={{ height: full, transform: offset(rest) }}
      onClickCapture={e => { if (swallowClick.current) { e.preventDefault(); e.stopPropagation(); } }}
    >
      {/* (Rows in the header that should drag the sheet are touch-none; a scrolling row is pan-x) */}
      <div ref={head} className="shrink-0 select-none" onPointerDown={onHeadDown}>
        <button
          type="button"
          className="w-full flex justify-center pt-2 pb-1.5 touch-none focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 rounded-t-[22px]"
          aria-label={`Panel: ${NAMES[detent]}. Show it ${NAMES[next]}`}
          aria-expanded={detent !== "peek"}
          data-testid="sheet-handle"
          onClick={() => onDetent(next)}
          onKeyDown={onKey}
        >
          <span className="block w-10 h-[5px] rounded-full bg-zinc-500/80" aria-hidden />
        </button>
        {header}
      </div>
      {/* The list is as tall as the part of the sheet on screen (so scrolling, and the focus,
          bring things into view above the screen's edge); while dragging, as tall as it can be */}
      <div ref={body} className="dg-scroll shrink-0 overflow-y-auto overflow-x-hidden" style={{ height: Math.max(0, (dragging ? full : bodyRest) - headH), paddingBottom: keyboard }} onFocus={onFocusIn} data-testid="sheet-body">
        {children}
      </div>
    </section>
  );
}
