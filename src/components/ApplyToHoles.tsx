// "Apply to holes…": a hole's own settings (or the ones for all holes) given to the holes picked;
// and the row of hole chips it picks them with (the same row an OB line or a mando picks its holes with).
import { useState } from "react";
import { byNumber, holeLabel } from "../lib/course";
import { useCourse } from "../state/course";
import type { Hole } from "../types";
import { Button, chipCls } from "./ui";

/**
 * Holes picked as a row of chips, by number (`holes`: these, or else all of the course's), with a
 * chip in front for all of them (`all`: its name; null: no such chip). `picked`: the holes' ids, or
 * "all". `single`: one hole at most (a mando's).
 */
export function HoleChips({ picked, onChange, label, testid, holes, all = "All holes", single = false }: { picked: string[] | "all"; onChange: (v: string[] | "all") => void; label: string; testid?: string; holes?: Hole[]; all?: string | null; single?: boolean }) {
  const doc = useCourse(s => s.doc);
  const row = holes ?? byNumber(doc.holes);
  const ids = picked === "all" ? [] : picked;
  return (
    <div className="flex flex-wrap gap-1" role="group" aria-label={label} data-testid={testid}>
      {all !== null && <button type="button" className={chipCls(picked === "all")} aria-pressed={picked === "all"} onClick={() => onChange("all")}>{all}</button>}
      {row.map(h => {
        const on = ids.includes(h.id);
        return (
          <button key={h.id} type="button" className={`${chipCls(on)} justify-center min-w-[2rem] touch:min-w-[44px]`} aria-pressed={on} aria-label={`Hole ${holeLabel(doc, h.id)}`}
            onClick={() => onChange(single ? (on ? "all" : [h.id]) : on ? ids.filter(x => x !== h.id) : [...ids, h.id])}>
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
  const [picked, setPicked] = useState<string[] | "all">([]);
  const others = byNumber(holes).filter(h => h.id !== fromId);
  if (!others.length) return null;
  const ids = picked === "all" ? others.map(h => h.id) : picked;
  const close = () => {
    setOpen(false);
    setPicked([]);
  };
  return (
    <div data-testid={testid}>
      <Button small onClick={() => (open ? close() : setOpen(true))}>{label}</Button>
      {open && (
        <div role="dialog" aria-label="Apply to holes" className="mt-1.5 rounded-lg border border-white/[0.12] glass p-2" data-testid="apply-holes">
          <div className="mb-1.5">
            {/* (All again: none picked) */}
            <HoleChips label="Holes to apply them to" holes={others} picked={picked} onChange={v => setPicked(v === "all" && picked === "all" ? [] : v)} />
          </div>
          <div className="flex gap-2">
            <Button small tone="primary" disabled={!ids.length} onClick={() => { apply(ids); close(); }}>Apply</Button>
            <Button small tone="ghost" onClick={close}>Cancel</Button>
          </div>
        </div>
      )}
    </div>
  );
}
