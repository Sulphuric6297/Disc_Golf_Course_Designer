// "Apply to holes…": a hole's own settings (or the ones for all holes) given to the holes picked;
// and the row of hole chips it picks them with (the same row an OB line or a mando picks its holes with).
import { useState } from "react";
import { byNumber, holeLabel } from "../lib/course";
import { useCourse } from "../state/course";
import { Button, FOCUS, Toggle } from "./ui";

/** A hole's chip in a pick of holes. */
const holeChip = (on: boolean) => `min-w-[2rem] px-2 py-1 touch:py-2 touch:min-h-[40px] rounded-md text-xs font-semibold border ${FOCUS} ${on ? "bg-orange-500/20 border-orange-400 text-orange-100" : "border-white/[0.12] text-zinc-300 hover:border-zinc-500"}`;

/**
 * Holes picked as a row of chips, by number. `all`: the name of a chip in front for all of them
 * (none picked; null: no such chip); `single`: one hole at most (a mando's). `exclude`: a hole
 * left out of the row (the one the settings come from).
 */
export function HoleChips({ picked, onChange, label, testid, all = "All holes", single = false, exclude }: { picked: string[]; onChange: (ids: string[]) => void; label: string; testid?: string; all?: string | null; single?: boolean; exclude?: string }) {
  const doc = useCourse(s => s.doc);
  const holes = byNumber(doc.holes).filter(h => h.id !== exclude);
  return (
    <div className="flex flex-wrap gap-1" role="group" aria-label={label} data-testid={testid}>
      {all !== null && <button className={holeChip(!picked.length)} aria-pressed={!picked.length} onClick={() => onChange([])}>{all}</button>}
      {holes.map(h => {
        const on = picked.includes(h.id);
        return (
          <button key={h.id} className={holeChip(on)} aria-pressed={on} aria-label={`Hole ${holeLabel(doc, h.id)}`}
            onClick={() => onChange(single ? (on ? [] : [h.id]) : on ? picked.filter(x => x !== h.id) : [...picked, h.id])}>
            {holeLabel(doc, h.id)}
          </button>
        );
      })}
    </div>
  );
}

/** A button that opens a pick of holes (all of them, or some), then `apply` with their ids.
 * `fromId`: the hole the settings come from (not in the pick). */
export function ApplyToHoles({ fromId, apply, testid, label = "Apply to holes…" }: { fromId?: string; apply: (ids: string[]) => void; testid?: string; label?: string }) {
  const holes = useCourse(s => s.doc.holes);
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const others = byNumber(holes).filter(h => h.id !== fromId);
  if (!others.length) return null;
  const all = others.every(h => picked.includes(h.id));
  const close = () => {
    setOpen(false);
    setPicked([]);
  };
  return (
    <div data-testid={testid}>
      <Button small onClick={() => (open ? close() : setOpen(true))}>{label}</Button>
      {open && (
        <div role="dialog" aria-label="Apply to holes" className="mt-1.5 rounded-lg border border-white/[0.12] glass p-2" data-testid="apply-holes">
          <Toggle label="All holes" checked={all} onChange={v => setPicked(v ? others.map(h => h.id) : [])} />
          <div className="my-1.5">
            <HoleChips label="Holes to apply them to" picked={picked} onChange={setPicked} all={null} exclude={fromId} />
          </div>
          <div className="flex gap-2">
            <Button small tone="primary" disabled={!picked.length} onClick={() => { apply(picked); close(); }}>Apply</Button>
            <Button small tone="ghost" onClick={close}>Cancel</Button>
          </div>
        </div>
      )}
    </div>
  );
}
