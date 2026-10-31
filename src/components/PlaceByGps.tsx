// On the course: a tee, basket or anything else put where you stand (Move here, once your location
// is on). The same button on a phone's strip and in a tablet's panel; a computer isn't carried round
// the course.
import { useEffect, useState } from "react";
import { CORNER_EVENT } from "../viewport/CourseView";
import { Navigation } from "lucide-react";
import { dist } from "../lib/geom";
import { fmtDist } from "../lib/units";
import { updateItem, useCourse } from "../state/course";
import { canShowLocation, spotHere, useGps } from "../state/gps";
import { toast } from "../state/toast";
import type { CourseItem } from "../types";
import { useLayout, useTouch } from "./useLayout";

/** Where you're standing: the picked thing put there, once a few seconds still give a sure spot
 * (its dot green when it's within 10 ft, amber within 25, red past that, as field apps show it).
 * Shown once your location is on: a chip on a phone's strip, or (`wide`) across a panel. */
export function MoveHere({ item, wide = false, className = "" }: { item: CourseItem; wide?: boolean; className?: string }) {
  const mode = useGps(g => g.mode);
  const settling = useGps(g => g.settling);
  const acc = useGps(g => g.fix?.acc ?? null);
  const units = useCourse(s => s.doc.units);
  // (shown once the site is placed on the earth)
  useCourse(s => !!s.doc.site.bounds);
  // (the spot found, waiting for Move it: never a surprise, how far it goes is said first)
  const [found, setFound] = useState<{ at: { x: number; y: number }; acc: number } | null>(null);
  if (mode === "off" || !canShowLocation()) return null;
  const go = async () => {
    const f = await spotHere();
    if (!f) { toast("Couldn't get a sure spot. Try again in the open.", "info"); return; }
    setFound(f);
  };
  const move = () => {
    if (!found) return;
    updateItem(item.id, { x: found.at.x, y: found.at.y } as Partial<CourseItem>);
    toast(`Moved to where you're standing (within ${fmtDist(found.acc, units)}).`, "success", true);
    setFound(null);
  };
  const quality = acc === null ? "bg-zinc-400" : acc <= 10 ? "bg-emerald-400" : acc <= 25 ? "bg-amber-300" : "bg-red-400";
  if (found && "x" in item) {
    const far = dist(found.at, item as { x: number; y: number });
    const sure = found.acc <= 10 ? "Good" : found.acc <= 25 ? "Fair" : "Weak";
    return (
      <div className={`${wide ? "w-full" : "shrink-0"} flex items-center gap-1.5 ${className}`} data-testid="move-here-check">
        <span className="px-1 text-[12.5px] text-zinc-300 whitespace-nowrap tabular-nums">{sure} · ± {fmtDist(found.acc, units)} · moves {fmtDist(far, units)}</span>
        <button className="h-10 touch:h-11 px-3 rounded-full text-[13.5px] font-semibold bg-white/[0.09] text-zinc-100 active:bg-white/[0.14]" onClick={() => setFound(null)} data-testid="move-here-cancel">Cancel</button>
        <button className="h-10 touch:h-11 px-3 rounded-full text-[13.5px] font-semibold bg-lime-400 text-zinc-950 active:bg-lime-500" onClick={move} data-testid="move-here-go">Move it</button>
      </div>
    );
  }
  return (
    <button className={`${wide ? "w-full justify-center h-11" : "shrink-0 h-10 touch:h-11"} px-3 rounded-full text-[13.5px] font-semibold whitespace-nowrap bg-sky-500/90 text-white active:bg-sky-600 disabled:opacity-80 flex items-center gap-1.5 ${className}`}
      onClick={() => void go()} disabled={settling} aria-busy={settling || undefined} data-testid="move-here">
      <Navigation size={14} fill="currentColor" className={settling ? "animate-pulse" : ""} />
      {settling ? `Hold still${acc !== null ? ` · ± ${fmtDist(acc, units)}` : "…"}` : "Move here"}
      <span className={`w-2 h-2 rounded-full ${quality}`} aria-hidden />
    </button>
  );
}

/** Move here in a tablet's panel (a phone has it on its strip). `inline`: inside another panel's row. */
export function PlaceByGps({ item, inline = false }: { item: Extract<CourseItem, { x: number; y: number }>; inline?: boolean }) {
  const touch = useTouch();
  const phone = useLayout() === "phone";
  if (!touch || phone) return null;
  return <MoveHere item={item} wide className={inline ? "mb-2" : "mx-4 mb-3 !w-[calc(100%-2rem)]"} />;
}

/** A line's or an area's corner picked (its handle pressed): Move this corner here, the corner put
 * where you stand, the rest of the shape staying. The same check first as Move here: how far. */
export function MoveCornerHere({ item }: { item: Extract<CourseItem, { points: { x: number; y: number }[] }> }) {
  const mode = useGps(g => g.mode);
  const settling = useGps(g => g.settling);
  const units = useCourse(s => s.doc.units);
  const [corner, setCorner] = useState<number | null>(null);
  const [found, setFound] = useState<{ at: { x: number; y: number }; acc: number } | null>(null);
  useEffect(() => {
    setCorner(null);
    const on = (e: Event) => { const d = (e as CustomEvent<{ id: string; index: number }>).detail; if (d.id === item.id) { setCorner(d.index); setFound(null); } };
    window.addEventListener(CORNER_EVENT, on);
    return () => window.removeEventListener(CORNER_EVENT, on);
  }, [item.id]);
  if (mode === "off" || !canShowLocation() || corner === null || !item.points[corner]) return null;
  if (found) {
    const far = dist(found.at, item.points[corner]);
    return (
      <div className="shrink-0 flex items-center gap-1.5" data-testid="corner-here-check">
        <span className="px-1 text-[12.5px] text-zinc-300 whitespace-nowrap tabular-nums">± {fmtDist(found.acc, units)} · moves {fmtDist(far, units)}</span>
        <button className="h-10 touch:h-11 px-3 rounded-full text-[13.5px] font-semibold bg-white/[0.09] text-zinc-100 active:bg-white/[0.14]" onClick={() => setFound(null)}>Cancel</button>
        <button className="h-10 touch:h-11 px-3 rounded-full text-[13.5px] font-semibold bg-lime-400 text-zinc-950 active:bg-lime-500" data-testid="corner-here-go" onClick={() => {
          updateItem(item.id, { points: item.points.map((p, k) => (k === corner ? found.at : p)) } as Partial<CourseItem>);
          toast(`Corner moved to where you're standing (within ${fmtDist(found.acc, units)}).`, "success", true);
          setFound(null);
        }}>Move it</button>
      </div>
    );
  }
  return (
    <button className="shrink-0 h-10 touch:h-11 px-3 rounded-full text-[13.5px] font-semibold whitespace-nowrap bg-sky-500/90 text-white active:bg-sky-600 disabled:opacity-80 flex items-center gap-1.5" disabled={settling} data-testid="corner-here"
      onClick={() => void spotHere().then(f => (f ? setFound(f) : toast("Couldn't get a sure spot. Try again in the open.", "info")))}>
      <Navigation size={14} fill="currentColor" className={settling ? "animate-pulse" : ""} />
      {settling ? "Hold still…" : "Move this corner here"}
    </button>
  );
}
