// Going from hole to hole: the previous and next hole in the list's order, brought into view.
import { ChevronLeft, ChevronRight } from "lucide-react";
import { holeLabel } from "../lib/course";
import { select } from "../state/actions";
import { getDoc, useCourse, useEditor } from "../state/course";
import { getView } from "../state/view";

/** The hole `delta` places on from the one being worked on (round the end of the list). */
export const neighbourHole = (holeId: string | null, delta: number) => {
  const holes = getDoc().holes;
  if (!holes.length) return null;
  const i = holes.findIndex(h => h.id === holeId);
  if (i < 0) return holes[delta > 0 ? 0 : holes.length - 1];
  return holes[(i + delta + holes.length) % holes.length];
};

/** Selects the previous (-1) or next (1) hole and slides it into view (never a zoom). */
export const stepHole = (delta: number) => {
  const ed = useEditor.getState();
  const next = neighbourHole(ed.activeHoleId ?? ed.selectedId, delta);
  if (!next) return;
  select(next.id);
  requestAnimationFrame(() => getView()?.reveal(next.id));
};

/** Previous and next hole buttons (`big`: 44 px, for fingers, as one pill). */
export function HoleSteps({ holeId, big = false }: { holeId: string; big?: boolean }) {
  const doc = useCourse(s => s.doc);
  if (doc.holes.length < 2) return null;
  const prev = neighbourHole(holeId, -1), next = neighbourHole(holeId, 1);
  const btn = `${big ? "w-11 h-11 rounded-xl" : "w-7 h-7 rounded-lg touch:w-11 touch:h-11"} shrink-0 flex items-center justify-center text-zinc-300 hover:bg-white/[0.09] hover:text-zinc-50 active:bg-white/[0.13] focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400`;
  return (
    <div className={`flex items-center shrink-0 ${big ? "bg-white/[0.07] rounded-xl" : ""}`} data-testid="hole-steps">
      <button className={btn} aria-label={`Previous hole (${holeLabel(doc, prev!.id)})`} title={`Previous: hole ${holeLabel(doc, prev!.id)} ([)`} onClick={() => stepHole(-1)} data-testid="hole-prev"><ChevronLeft size={big ? 22 : 18} /></button>
      <button className={btn} aria-label={`Next hole (${holeLabel(doc, next!.id)})`} title={`Next: hole ${holeLabel(doc, next!.id)} (])`} onClick={() => stepHole(1)} data-testid="hole-next"><ChevronRight size={big ? 22 : 18} /></button>
    </div>
  );
}
