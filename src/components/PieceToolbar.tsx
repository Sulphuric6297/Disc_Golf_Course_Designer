// The toolbar over what's picked on a printout's page, right beside it (on a phone, docked at the
// bottom in reach of a thumb): what it is, then only the settings it has. Font, size, lettering
// and panel color, bold and alignment for text, its words or link, how solid a picture is, then
// Reset, Duplicate and Hide or Delete. The same for the course map, tee signs, hole pages and
// the scorecard.
import { useRef, useState, type ReactElement } from "react";
import { createPortal } from "react-dom";
import { AlignCenter, AlignLeft, AlignRight, Bold, Check, Copy, EyeOff, Link2, Minus, MoreHorizontal, Pencil, Plus, RotateCcw, Sun, Trash2 } from "lucide-react";
import { fontsIn } from "../lib/fontLoad";
import { useCourse } from "../state/course";
import { FontPicker } from "./FontPicker";
import { duplicatePicked, moreOf, patchPicked, pickedOf, removePicked, resetPicked, type TargetKey } from "./printouts";

const commit = () => useCourse.getState().commit();

/** A color swatch: the color picker on a click, live while it's dragged, one undo step. */
function Swatch({ value, fallback, label, onChange, icon }: { value?: string; fallback: string; label: string; onChange: (v: string) => void; icon: "letters" | "panel" }) {
  return (
    <label className="relative h-8 w-8 touch:h-11 touch:w-11 shrink-0 flex items-center justify-center rounded-full hover:bg-white/[0.12] cursor-pointer" title={label}>
      {icon === "letters"
        ? <span className="flex flex-col items-center leading-none"><span className="text-[14px] font-bold text-zinc-50">A</span><span className="mt-0.5 h-[4px] w-4 rounded-full ring-1 ring-white/30" style={{ background: value ?? fallback }} /></span>
        : <span className="h-4 w-4 rounded-[5px] ring-1 ring-white/40" style={{ background: value ?? fallback }} />}
      <input type="color" aria-label={label} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" value={value ?? fallback} onChange={e => onChange(e.target.value)} onBlur={commit} />
    </label>
  );
}

export function PieceToolbar({ t, id, onGrow, onPreviewFont, onEditText, onDone, docked = false }: {
  t: TargetKey;
  id: string;
  /** Bigger or smaller by `f` (about its top-left corner). */
  onGrow: (f: number) => void;
  onPreviewFont: (font: string | null) => void;
  onEditText: () => void;
  onDone: () => void;
  docked?: boolean;
}) {
  const doc = useCourse(c => c.doc);
  const p = pickedOf(doc, t, id);
  const [pop, setPop] = useState<"link" | "opacity" | "more" | null>(null);
  const linkRef = useRef<HTMLInputElement>(null);
  if (!p) return null;
  // (docked, a pop-up goes over everything: the toolbar's own frame would cut it off)
  const float = (el: ReactElement) => (docked ? createPortal(el, document.body) : el);
  const b = "h-8 min-w-8 touch:h-11 touch:min-w-11 shrink-0 flex items-center justify-center gap-1 rounded-full px-1.5 text-zinc-100 hover:bg-white/[0.12] disabled:opacity-40";
  const sep = <span className="w-px h-5 bg-white/15 shrink-0 mx-0.5" />;
  const size = p.pt !== undefined ? `${Math.round(p.pt)}` : p.scale !== undefined ? `${Math.round(p.scale * 100)}%` : null;
  const align = p.align ?? "start";
  const nextAlign = align === "start" ? "middle" : align === "middle" ? "end" : "start";
  const AlignIcon = align === "middle" ? AlignCenter : align === "end" ? AlignRight : AlignLeft;
  return (
    <div className={`glass ring-1 ring-white/15 shadow-xl flex items-center gap-0.5 rounded-full px-1.5 py-1 ${docked ? "overflow-x-auto dg-scroll max-w-full" : ""}`} data-page-bar data-testid="piece-toolbar" role="toolbar" aria-label={`${p.label} settings`} onPointerDown={e => e.stopPropagation()}>
      <span className="text-[12px] touch:text-[13px] font-semibold text-zinc-300 pl-1.5 pr-1 max-w-[130px] truncate shrink-0" data-testid="piece-name">{p.label}</span>
      {p.has.font && <div className="shrink-0"><FontPicker compact label="Font" value={p.font} inherit="The course's lettering" onPick={f => patchPicked(t, id, { font: f })} onPreview={onPreviewFont} used={fontsIn(doc)} testid="piece-font" /></div>}
      {p.has.size && size !== null && (
        <span className="flex items-center shrink-0" data-testid="piece-size">
          <button className={b} aria-label="Smaller" title="Smaller" onClick={() => onGrow(1 / 1.12)}><Minus size={15} /></button>
          <span className="text-[12.5px] tabular-nums text-zinc-100 min-w-[38px] text-center">{size}</span>
          <button className={b} aria-label="Bigger" title="Bigger" onClick={() => onGrow(1.12)}><Plus size={15} /></button>
        </span>
      )}
      {(p.has.color || p.has.fill) && sep}
      {p.has.color && <Swatch icon="letters" label="Lettering color" value={p.color} fallback="#ffffff" onChange={v => patchPicked(t, id, { color: v }, false)} />}
      {p.has.fill && <Swatch icon="panel" label="Panel color" value={p.fill} fallback="#1b4332" onChange={v => patchPicked(t, id, { fill: v }, false)} />}
      {p.has.bold && <button className={`${b} ${p.bold ? "bg-white/[0.18]" : ""}`} aria-pressed={!!p.bold} aria-label="Bold" title="Bold" onClick={() => patchPicked(t, id, { bold: !p.bold })}><Bold size={15} /></button>}
      {p.has.align && <button className={b} aria-label={`Lines: ${align === "start" ? "left" : align === "middle" ? "centered" : "right"}`} title="Line up the lines" onClick={() => patchPicked(t, id, { align: nextAlign })}><AlignIcon size={15} /></button>}
      {p.has.text && <button className={b} aria-label="Edit the words" title="Edit the words (or double-click it)" onClick={onEditText} data-testid="piece-edit-text"><Pencil size={14} /></button>}
      {p.has.url && (
        <span className="relative shrink-0">
          <button className={`${b} ${pop === "link" ? "bg-white/[0.18]" : ""}`} aria-label="Where it takes you" title="Where it takes you" onClick={() => { setPop(pop === "link" ? null : "link"); setTimeout(() => linkRef.current?.focus(), 0); }}><Link2 size={15} /></button>
          {pop === "link" && float(
            <div className={`${docked ? "fixed left-2 right-2 bottom-24" : "absolute left-0 top-full mt-2 w-72"} z-[80] glass ring-1 ring-white/15 rounded-[14px] p-2`}>
              <input ref={linkRef} aria-label="Link" placeholder="https://" className="w-full rounded-[10px] bg-white/[0.1] px-2.5 py-2 text-sm text-zinc-50 placeholder:text-zinc-500 focus:outline-none" value={p.url ?? ""} onChange={e => patchPicked(t, id, { url: e.target.value }, false)} onBlur={commit} onKeyDown={e => { if (e.key === "Enter") { commit(); setPop(null); } }} />
            </div>
          )}
        </span>
      )}
      {p.has.opacity && (
        <span className="relative shrink-0">
          <button className={`${b} ${pop === "opacity" ? "bg-white/[0.18]" : ""}`} aria-label="How solid it is" title="How solid it is" onClick={() => setPop(pop === "opacity" ? null : "opacity")}><Sun size={15} /></button>
          {pop === "opacity" && float(
            <div className={`${docked ? "fixed left-2 right-2 bottom-24" : "absolute left-0 top-full mt-2 w-56"} z-[80] glass ring-1 ring-white/15 rounded-[14px] px-3 py-2.5`}>
              <input type="range" min={0.05} max={1} step={0.05} aria-label="How solid it is" className="w-full" value={p.opacity ?? 1} onChange={e => patchPicked(t, id, { opacity: Number(e.target.value) }, false)} onPointerUp={commit} />
            </div>
          )}
        </span>
      )}
      {moreOf(doc, t, id).length > 0 && (
        <span className="relative shrink-0">
          <button className={`${b} ${pop === "more" ? "bg-white/[0.18]" : ""}`} aria-label="More settings" title="More" onClick={() => setPop(pop === "more" ? null : "more")} data-testid="piece-more"><MoreHorizontal size={15} /></button>
          {pop === "more" && float(
            <div className={`${docked ? "fixed left-2 right-2 bottom-24" : "absolute left-0 top-full mt-2 w-56"} z-[80] glass ring-1 ring-white/15 rounded-[14px] p-2`} data-testid="piece-more-menu">
              {moreOf(doc, t, id).map(m => (
                <label key={m.label} className="flex items-center justify-between gap-3 px-2 py-1.5 touch:py-3 rounded-[10px] hover:bg-white/[0.08] text-[13px] text-zinc-100 cursor-pointer">
                  {m.label}<input type="checkbox" checked={m.on} onChange={e => m.set(e.target.checked)} className="accent-orange-400 w-4 h-4" />
                </label>
              ))}
            </div>
          )}
        </span>
      )}
      {sep}
      {p.changed && <button className={b} aria-label="Reset" title="Back as its look has it" onClick={() => resetPicked(t, id)} data-testid="piece-reset"><RotateCcw size={14} /></button>}
      {p.duplicable && <button className={b} aria-label="Duplicate" title="Duplicate (Ctrl+D)" onClick={() => duplicatePicked(t, id)} data-testid="piece-duplicate"><Copy size={14} /></button>}
      <button className={b} aria-label={p.removable ? "Delete" : "Hide"} title={p.removable ? "Delete" : "Hide (Layers brings it back)"} onClick={() => removePicked(t, id)} data-testid="piece-remove">{p.removable ? <Trash2 size={14} /> : <EyeOff size={14} />}</button>
      {docked && <button className={`${b} bg-white/[0.12] px-3 text-[13px] font-semibold`} onClick={onDone} aria-label="Done"><Check size={15} /> Done</button>}
    </div>
  );
}
