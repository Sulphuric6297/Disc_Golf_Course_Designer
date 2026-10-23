// "Apply to holes…": a hole's own settings (or the ones for all holes) given to the holes picked.
import { useState } from "react";
import { byNumber, holeLabel } from "../lib/course";
import { useCourse } from "../state/course";
import { Button, Toggle } from "./ui";

/** A button that opens a pick of holes (all of them, or some), then `apply` with their ids.
 * `fromId`: the hole the settings come from (not in the pick). */
export function ApplyToHoles({ fromId, apply, testid }: { fromId?: string; apply: (ids: string[]) => void; testid?: string }) {
  const holes = useCourse(s => s.doc.holes);
  const doc = useCourse(s => s.doc);
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
      <Button small onClick={() => (open ? close() : setOpen(true))}>Apply to holes…</Button>
      {open && (
        <div role="dialog" aria-label="Apply to holes" className="mt-1.5 rounded-lg border border-white/[0.12] glass p-2" data-testid="apply-holes">
          <Toggle label="All holes" checked={all} onChange={v => setPicked(v ? others.map(h => h.id) : [])} />
          <div className="grid grid-cols-6 gap-1 my-1.5">
            {others.map(h => {
              const on = picked.includes(h.id);
              return (
                <button
                  key={h.id}
                  aria-pressed={on}
                  aria-label={`Hole ${holeLabel(doc, h.id)}`}
                  className={`rounded-md py-1 touch:py-2.5 text-xs font-semibold border ${on ? "bg-orange-500 border-orange-400 text-zinc-950" : "bg-white/[0.07] border-white/[0.12] text-zinc-300 hover:bg-white/[0.13]"}`}
                  onClick={() => setPicked(p => (on ? p.filter(x => x !== h.id) : [...p, h.id]))}
                >
                  {holeLabel(doc, h.id)}
                </button>
              );
            })}
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
