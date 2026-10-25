// On the course: a tee, basket or anything else put where you stand (Move here, once your location
// is on). The same button on a phone's strip and in a tablet's panel; a computer isn't carried round
// the course.
import { Navigation } from "lucide-react";
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
  if (mode === "off" || !canShowLocation()) return null;
  const go = async () => {
    const f = await spotHere();
    if (!f) { toast("Couldn't get a sure spot. Try again in the open.", "info"); return; }
    updateItem(item.id, { x: f.at.x, y: f.at.y } as Partial<CourseItem>);
    toast(`Moved to where you're standing (within ${fmtDist(f.acc, units)}).`, "success", true);
  };
  const quality = acc === null ? "bg-zinc-400" : acc <= 10 ? "bg-emerald-400" : acc <= 25 ? "bg-amber-300" : "bg-red-400";
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
