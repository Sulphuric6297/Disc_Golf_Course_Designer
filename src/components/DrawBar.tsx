// Undo, Cancel and Done while drawing, the same on a computer and a phone (a phone has no
// Backspace, Esc or Enter); for a rectangle or a circle clicked out, what the next click does; while
// a phone's box select is on, how it works and Done; and the same buttons while a hole's line is
// plotted by hand.
import type { ReactNode } from "react";
import { Check, Undo2, X } from "lucide-react";
import { STRUCTURE_KINDS } from "../constants";
import { useEditor } from "../state/course";
import { useGps } from "../state/gps";
import { getView } from "../state/view";
import { HereButton } from "./MyLocation";
import { useTouch } from "./useLayout";

const PILL = "pointer-events-auto w-max max-w-[calc(100%-16px)] flex items-center gap-1 p-1.5 rounded-full glass border border-white/10 shadow-2xl";
/** Over a phone's map, `bottom` px up from its foot. */
const PILL_AT = "absolute left-1/2 -translate-x-1/2 z-30 transition-[bottom] duration-300";
const BTN = "h-9 px-3 touch:h-11 touch:px-4 rounded-full flex items-center gap-1.5 text-sm touch:text-[15px] font-semibold shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400";
const WORDS = "pl-3 pr-1 text-sm touch:text-[15px] text-zinc-100 font-semibold";

/** The pill: in the flow (a computer's tools), or over the map `bottom` px up. */
function Pill({ bottom, label, testid, wrap, children }: { bottom?: number; label: string; testid: string; wrap?: boolean; children: ReactNode }) {
  return <div className={`${PILL} ${bottom !== undefined ? PILL_AT : ""} ${wrap ? "rounded-[24px]" : ""}`} style={bottom !== undefined ? { bottom } : undefined} role="toolbar" aria-label={label} data-testid={testid}>{children}</div>;
}

/** Undo, Cancel and Done; `n`/`need`: the points so far and how many it takes (none: Done any time). */
export function DrawButtons({ onUndo, onCancel, onDone, n, need, ids = "draw" }: { onUndo: () => void; onCancel: () => void; onDone: () => void; n?: number; need?: number; ids?: string }) {
  const short = n !== undefined && need !== undefined && n < need;
  return (
    <>
      <button className={`${BTN} text-zinc-200 hover:bg-white/[0.09] active:bg-white/[0.13]`} onClick={onUndo} data-testid={`${ids}-undo`}><Undo2 size={18} /> Undo</button>
      <button className={`${BTN} text-zinc-200 hover:bg-white/[0.09] active:bg-white/[0.13]`} onClick={onCancel} data-testid={`${ids}-cancel`}><X size={18} /> Cancel</button>
      <button className={`${BTN} bg-orange-500 text-zinc-950 hover:bg-orange-400 disabled:opacity-40 active:bg-orange-600`} disabled={short} onClick={onDone} data-testid={`${ids}-done`}>
        <Check size={18} strokeWidth={3} /> Done
        {n !== undefined && need !== undefined && <span className="text-[13px] font-medium opacity-80 tabular-nums">{short ? `${n}/${need}` : n}</span>}
      </button>
    </>
  );
}

/** While a hole's line is plotted by hand: the hole, what to do, and the drawing's buttons. */
export function PlotPill({ hole }: { hole: string }) {
  const click = useTouch() ? "Tap" : "Click";
  return (
    <Pill label="Plotting the line" testid="plot-bar" wrap>
      <span className={WORDS}>Hole {hole}</span>
      <span className="pr-1 text-xs touch:text-[13px] text-zinc-300 min-w-0">{click} along the line</span>
      <DrawButtons ids="plot" onUndo={() => getView()?.undoPoint()} onCancel={() => getView()?.cancelDrawing()} onDone={() => getView()?.finishPlot()} />
    </Pill>
  );
}

/** Whether the drawing buttons (or a phone's box select's) are over the map: the toasts go above them. */
export function useDrawBarShown() {
  const tool = useEditor(e => e.tool);
  const n = useEditor(e => e.drawPoints);
  const boxing = useEditor(e => e.dragSelect && e.tool === "select" && (e.step === "design" || e.step === "site"));
  const teeView = useEditor(e => !!e.teeView && (!e.teeEdit || e.flyover));
  const gpsOn = useGps(g => g.mode !== "off");
  return !teeView && (n > 0 || boxing || (gpsOn && (tool === "add-hole" || tool === "add-tee" || tool === "add-basket")));
}

/** The drawing's bar: over a phone's map at `bottom` (with box select's), or in a computer's tools. */
export function DrawBar({ bottom }: { bottom?: number }) {
  const tool = useEditor(e => e.tool);
  const n = useEditor(e => e.drawPoints);
  const structureKind = useEditor(e => e.structureKind);
  const shape = useEditor(e => e.drawShape);
  const boxing = useEditor(e => e.dragSelect && (e.step === "design" || e.step === "site"));
  const teeView = useEditor(e => !!e.teeView && (!e.teeEdit || e.flyover));
  const gpsOn = useGps(g => g.mode !== "off");
  const touch = useTouch();
  if (teeView) return null;
  const click = touch ? "tap" : "click";
  const kind = tool === "draw-area" ? "area" : tool === "draw-line" ? "line" : tool === "draw-structure" ? (STRUCTURE_KINDS[structureKind].shape === "outline" ? "area" : "line") : null;
  const cancel = <button className={`${BTN} text-zinc-200 hover:bg-white/[0.09] active:bg-white/[0.13]`} onClick={() => getView()?.cancelDrawing()} data-testid="draw-cancel"><X size={18} /> Cancel</button>;
  // (a rectangle or a circle by clicks: its first corner or its middle down, the shape on the next)
  if (kind === "area" && (shape === "box" || shape === "circle") && n > 0) {
    return <Pill bottom={bottom} label="Drawing" testid="draw-bar"><span className={WORDS}>{shape === "box" ? `Now ${click} the opposite corner` : `Now ${click} the edge`}</span>{cancel}</Pill>;
  }
  // (a computer's box select: its hint says how, and Esc or the map's button ends it)
  if (tool === "select" && boxing && bottom !== undefined) {
    return (
      <Pill bottom={bottom} label="Select with a box" testid="box-bar" wrap>
        <span className="pl-3 pr-1 text-[14px] leading-snug text-zinc-100 font-semibold">Drag a box around things · tap to add or take one out</span>
        <button className={`${BTN} bg-orange-500 text-zinc-950 active:bg-orange-600`} onClick={() => useEditor.getState().set({ dragSelect: false })} data-testid="box-done"><Check size={18} strokeWidth={3} /> Done</button>
      </Pill>
    );
  }
  if (kind && n > 0) {
    return (
      <Pill bottom={bottom} label="Drawing" testid="draw-bar">
        <DrawButtons n={n} need={kind === "area" ? 3 : 2} onUndo={() => getView()?.undoPoint()} onCancel={() => getView()?.cancelDrawing()} onDone={() => getView()?.finishDrawing()} />
      </Pill>
    );
  }
  // (where you stand, once you've shown it on the map: a button beside the words)
  const here = `${BTN} bg-sky-500/90 text-white active:bg-sky-600 disabled:opacity-90`;
  if (tool === "add-hole" && n === 1) {
    return (
      <Pill bottom={bottom} label="New hole" testid="draw-bar">
        <span className={WORDS}>{gpsOn ? "Basket spot" : `Now ${click} the basket spot`}</span>
        <HereButton what="basket" className={here} />
        {cancel}
      </Pill>
    );
  }
  if (gpsOn && (tool === "add-hole" || tool === "add-tee" || tool === "add-basket")) {
    return (
      <Pill bottom={bottom} label="Where you stand" testid="here-bar">
        <span className={WORDS}>{touch ? "Tap" : "Click"} the map, or</span>
        <HereButton what={tool === "add-basket" ? "pin" : "tee"} className={here} />
      </Pill>
    );
  }
  return null;
}
