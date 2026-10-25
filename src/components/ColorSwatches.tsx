// Picking a color, the same everywhere a printout's color is picked (a piece's lettering or panel
// on the page, the General tab's colors): the course's own colors first, a swatch each (header,
// header lettering, page, text, basket, the tees'), then Custom (the system's color picker).
import { useState } from "react";
import { TEE_LEVELS, TEE_ORDER } from "../constants";
import { cardStyle } from "../lib/teeSign";
import { useCourse } from "../state/course";
import type { CourseDoc, TeeItem } from "../types";
import { FOCUS } from "./ui";

/** The course's own colors, by name (each once). */
export const courseColors = (doc: CourseDoc) => {
  const c = cardStyle(doc);
  const tees = new Set(doc.items.filter((i): i is TeeItem => i.type === "tee").map(t => t.level));
  const out: { label: string; value: string }[] = [
    { label: "Header", value: c.header }, { label: "Header lettering", value: c.accent }, { label: "Page color", value: c.paper },
    { label: "Text color", value: c.ink }, { label: "Basket", value: doc.style.basket },
    ...TEE_ORDER.filter(l => !tees.size || tees.has(l)).map(l => ({ label: `${TEE_LEVELS[l].label} tee`, value: TEE_LEVELS[l].color }))
  ];
  return out.filter((x, i) => out.findIndex(y => y.value.toLowerCase() === x.value.toLowerCase()) === i);
};

/** The swatches, and Custom. `onPick`: a color (`live`: the custom picker on its way, one undo
 * step once it closes, at `onDone`); `none`: a way to have no color (a piece's panel). */
export function ColorSwatches({ value, onPick, onDone, none }: { value?: string; onPick: (c: string, live?: boolean) => void; onDone?: () => void; none?: { label: string; on: () => void } }) {
  const doc = useCourse(c => c.doc);
  const v = value?.toLowerCase();
  return (
    <div data-testid="color-swatches">
      <div className="text-[11.5px] font-semibold text-zinc-400 mb-1.5">This course</div>
      <div className="flex flex-wrap gap-1.5">
        {courseColors(doc).map(c => (
          <button key={c.label} type="button" aria-label={c.label} title={c.label} aria-pressed={v === c.value.toLowerCase()} onClick={() => onPick(c.value)}
            className={`w-7 h-7 touch:w-10 touch:h-10 rounded-full ring-1 ring-white/25 ${v === c.value.toLowerCase() ? "outline outline-2 outline-orange-400 outline-offset-2" : ""} ${FOCUS}`} style={{ background: c.value }} data-testid="color-swatch" />
        ))}
      </div>
      <div className="flex items-center gap-1.5 mt-2.5">
        <label className="relative flex items-center gap-2 rounded-full bg-white/[0.08] hover:bg-white/[0.14] pl-1.5 pr-3 py-1 touch:min-h-11 text-[12.5px] font-semibold text-zinc-100 cursor-pointer">
          <span className="w-5 h-5 rounded-full ring-1 ring-white/30" style={{ background: "conic-gradient(#ef4444, #f59e0b, #84cc16, #06b6d4, #6366f1, #d946ef, #ef4444)" }} />
          Custom
          <input type="color" aria-label="Custom color" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" value={value ?? "#ffffff"} onChange={e => onPick(e.target.value, true)} onBlur={onDone} data-testid="color-custom" />
        </label>
        {none && <button type="button" className="rounded-full bg-white/[0.08] hover:bg-white/[0.14] px-3 py-1 touch:min-h-11 text-[12.5px] font-semibold text-zinc-100" onClick={none.on} data-testid="color-none">{none.label}</button>}
      </div>
    </div>
  );
}

/** A labelled color in a panel: its swatch, opening the course's colors under it. */
export function ColorField({ label, value, onChange, onDone }: { label: string; value: string; onChange: (v: string, live?: boolean) => void; onDone?: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="py-1">
      <button type="button" className={`w-full flex items-center justify-between gap-2 rounded-[8px] ${FOCUS}`} aria-label={label} aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="text-xs text-zinc-300">{label}</span>
        <span className="w-9 h-7 touch:w-11 touch:h-9 rounded ring-1 ring-white/20 shrink-0" style={{ background: value }} />
      </button>
      {open && <div className="mt-1.5 rounded-[12px] bg-white/[0.05] p-2"><ColorSwatches value={value} onPick={(c, live) => { onChange(c, live); if (!live) setOpen(false); }} onDone={() => { onDone?.(); }} /></div>}
    </div>
  );
}
