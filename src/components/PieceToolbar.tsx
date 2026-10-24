// The toolbar over what's picked on a printout's page, right beside it (on a phone, docked at the
// bottom in reach of a thumb, Done at its start where it never scrolls away): what it is, then
// only the settings it has. Font, size, lettering and panel color, bold, italic and alignment for
// text, its words or link, how solid it is, how far it's turned, its place among what was added,
// then Reset, Duplicate and Hide or Delete. The same for the course map, tee signs, hole pages and
// the scorecard.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { AlignCenter, AlignLeft, AlignRight, Bold, BringToFront, Check, Copy, EyeOff, Italic, Layers, Link2, Minus, MoreHorizontal, Pencil, Plus, RotateCcw, SendToBack, Sun, Trash2 } from "lucide-react";
import { fontsIn } from "../lib/fontLoad";
import { useCourse } from "../state/course";
import { FontPicker } from "./FontPicker";
import { duplicatePicked, moreOf, orderOf, patchPicked, pickedOf, removePicked, reorderPicked, resetPicked, type TargetKey } from "./printouts";

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

export function PieceToolbar({ t, id, onGrow, onPreviewFont, onEditText, onDone, onPanel, docked = false }: {
  t: TargetKey;
  id: string;
  /** Bigger or smaller by `f` (about its top-left corner). */
  onGrow: (f: number) => void;
  onPreviewFont: (font: string | null) => void;
  onEditText: () => void;
  onDone: () => void;
  /** Docked: whether one of its settings is open in the short panel over it. */
  onPanel?: (open: boolean) => void;
  docked?: boolean;
}) {
  const doc = useCourse(c => c.doc);
  const p = pickedOf(doc, t, id);
  const [pop, setPop] = useState<"link" | "opacity" | "more" | "order" | null>(null);
  const linkRef = useRef<HTMLInputElement>(null);
  useEffect(() => { onPanel?.(docked && !!pop); }, [docked, pop, onPanel]);
  // (another piece picked: nothing of the last one's left open)
  useEffect(() => setPop(null), [id]);
  if (!p) return null;
  // (a pop-up: under its button; docked, in the short panel over the toolbar instead, see below)
  const float = (el: ReactNode) => (docked ? null : el);
  const popAt = (w: string) => `absolute left-0 top-full mt-2 ${w} z-[80] glass ring-1 ring-white/15 rounded-[14px]`;
  const linkBody = <input ref={linkRef} aria-label="Link" placeholder="https://" className="w-full rounded-[10px] bg-white/[0.1] px-2.5 py-2 text-sm text-zinc-50 placeholder:text-zinc-500 focus:outline-none" value={p.url ?? ""} onChange={e => patchPicked(t, id, { url: e.target.value }, false)} onBlur={commit} onKeyDown={e => { if (e.key === "Enter") { commit(); setPop(null); } }} />;
  const opacityBody = (
    <>
      <div className="flex justify-between text-[12px] text-zinc-300 mb-1"><span>{docked ? "" : "How solid it is"}</span><span className="tabular-nums">{Math.round((p.opacity ?? 1) * 100)}%</span></div>
      <input type="range" min={0.05} max={1} step={0.05} aria-label="How solid it is" className="slider w-full touch:h-7" value={p.opacity ?? 1} onChange={e => patchPicked(t, id, { opacity: Number(e.target.value) }, false)} onPointerUp={commit} />
    </>
  );
  const b = "h-8 min-w-8 touch:h-11 touch:min-w-11 shrink-0 flex items-center justify-center gap-1 rounded-full px-1.5 text-zinc-100 hover:bg-white/[0.12] disabled:opacity-40";
  const sep = <span className="w-px h-5 bg-white/15 shrink-0 mx-0.5" />;
  const size = p.pt !== undefined ? `${Math.round(p.pt)}` : p.scale !== undefined ? `${Math.round(p.scale * 100)}%` : null;
  const align = p.align ?? "start";
  const nextAlign = align === "start" ? "middle" : align === "middle" ? "end" : "start";
  const AlignIcon = align === "middle" ? AlignCenter : align === "end" ? AlignRight : AlignLeft;
  const order = orderOf(doc, t, id);
  const rot = Math.round(p.rot ?? 0);
  const orderBody = (o: [number, number]) => (
    <div className="flex flex-col" data-testid="piece-order-menu">
      {([[2, "To the front", BringToFront], [1, "Forward", BringToFront], [-1, "Backward", SendToBack], [-2, "To the back", SendToBack]] as const).map(([d, label, Icon]) => (
        <button key={label} className="flex items-center gap-2.5 px-2.5 py-2 touch:py-3 rounded-[10px] hover:bg-white/[0.08] text-[13px] text-zinc-100 text-left disabled:opacity-40" disabled={d > 0 ? o[0] === o[1] - 1 : o[0] === 0} onClick={() => reorderPicked(t, id, d)}><Icon size={15} />{label}</button>
      ))}
    </div>
  );
  const moreBody = (
    <div data-testid="piece-more-menu">
      {moreOf(doc, t, id).map(m => (
        <label key={m.label} className="flex items-center justify-between gap-3 px-2 py-1.5 touch:py-3 rounded-[10px] hover:bg-white/[0.08] text-[13px] text-zinc-100 cursor-pointer">
          {m.label}<input type="checkbox" checked={m.on} onChange={e => m.set(e.target.checked)} className="accent-orange-400 w-4 h-4" />
        </label>
      ))}
    </div>
  );
  const tools = (
    <>
      <span className="text-[12px] touch:text-[13px] font-semibold text-zinc-300 pl-1.5 pr-1 max-w-[130px] truncate shrink-0" data-testid="piece-name">{p.label}</span>
      {p.has.font && <div className="shrink-0"><FontPicker compact label="Font" value={p.font} inherit="Course font" onPick={f => patchPicked(t, id, { font: f })} onPreview={onPreviewFont} used={fontsIn(doc)} testid="piece-font" /></div>}
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
      {p.has.italic && <button className={`${b} ${p.italic ? "bg-white/[0.18]" : ""}`} aria-pressed={!!p.italic} aria-label="Italic" title="Italic" onClick={() => patchPicked(t, id, { italic: !p.italic })} data-testid="piece-italic"><Italic size={15} /></button>}
      {p.has.align && <button className={b} aria-label={`Lines: ${align === "start" ? "left" : align === "middle" ? "centered" : "right"}`} title="Line up the lines" onClick={() => patchPicked(t, id, { align: nextAlign })}><AlignIcon size={15} /></button>}
      {p.has.text && <button className={b} aria-label="Edit the words" title={docked ? "Edit the words (or tap it again)" : "Edit the words (or double-click it)"} onClick={onEditText} data-testid="piece-edit-text"><Pencil size={14} /></button>}
      {p.has.url && (
        <span className="relative shrink-0">
          <button className={`${b} ${pop === "link" ? "bg-white/[0.18]" : ""}`} aria-label="Where it takes you" title="Where it takes you" onClick={() => { setPop(pop === "link" ? null : "link"); setTimeout(() => linkRef.current?.focus(), 0); }}><Link2 size={15} /></button>
          {pop === "link" && float(<div className={`${popAt("w-72")} p-2`}>{linkBody}</div>)}
        </span>
      )}
      {p.has.opacity && (
        <span className="relative shrink-0">
          <button className={`${b} ${pop === "opacity" ? "bg-white/[0.18]" : ""}`} aria-label="How solid it is" title="How solid it is" onClick={() => setPop(pop === "opacity" ? null : "opacity")} data-testid="piece-opacity"><Sun size={15} /></button>
          {pop === "opacity" && float(<div className={`${popAt("w-56")} px-3 py-2.5`}>{opacityBody}</div>)}
        </span>
      )}
      {p.has.turn && rot !== 0 && <button className={`${b} px-2 text-[12px] tabular-nums`} aria-label={`Turned ${rot}°: straighten it`} title="Straighten it" onClick={() => patchPicked(t, id, { rot: 0 })} data-testid="piece-straighten">{rot}°</button>}
      {order && order[1] > 1 && (
        <span className="relative shrink-0">
          <button className={`${b} ${pop === "order" ? "bg-white/[0.18]" : ""}`} aria-label="In front or behind" title="In front or behind the other things you added" onClick={() => setPop(pop === "order" ? null : "order")} data-testid="piece-order"><Layers size={15} /></button>
          {pop === "order" && float(<div className={`${popAt("w-56")} p-1.5`}>{orderBody(order)}</div>)}
        </span>
      )}
      {moreOf(doc, t, id).length > 0 && (
        <span className="relative shrink-0">
          <button className={`${b} ${pop === "more" ? "bg-white/[0.18]" : ""}`} aria-label="More settings" title="More" onClick={() => setPop(pop === "more" ? null : "more")} data-testid="piece-more"><MoreHorizontal size={15} /></button>
          {pop === "more" && float(<div className={`${popAt("w-56")} p-2`}>{moreBody}</div>)}
        </span>
      )}
      {sep}
      {p.changed && <button className={b} aria-label="Reset" title="Back as its look has it" onClick={() => resetPicked(t, id)} data-testid="piece-reset"><RotateCcw size={14} /></button>}
      {p.duplicable && <button className={b} aria-label="Duplicate" title="Duplicate (Ctrl+D)" onClick={() => duplicatePicked(t, id)} data-testid="piece-duplicate"><Copy size={14} /></button>}
      <button className={b} aria-label={p.removable ? "Delete" : "Hide"} title={p.removable ? "Delete" : "Hide (Layers brings it back)"} onClick={() => removePicked(t, id)} data-testid="piece-remove">{p.removable ? <Trash2 size={14} /> : <EyeOff size={14} />}</button>
    </>
  );
  if (docked) {
    // A phone: Done first and always there; the rest scrolls beside it. A setting that needs more
    // room opens in a short panel just over the toolbar, with its own Done
    const panels = { link: ["Where it takes you", linkBody], opacity: ["How solid it is", opacityBody], order: ["In front or behind", order ? orderBody(order) : null], more: ["More", moreBody] } as const;
    const open = pop ? panels[pop] : null;
    return (
      <div className="w-full flex flex-col items-stretch gap-1.5" onPointerDown={e => e.stopPropagation()}>
        {open && (
          <div className="glass ring-1 ring-white/15 shadow-xl rounded-[22px] max-h-[38vh] overflow-y-auto dg-scroll" data-page-bar data-testid="piece-panel" role="region" aria-label={open[0]}>
            <div className="flex items-center gap-2 pl-4 pr-1.5 pt-1.5">
              <span className="flex-1 text-[15px] font-bold text-zinc-50">{open[0]}</span>
              <button className="h-10 shrink-0 flex items-center gap-1 rounded-full px-3.5 bg-[#a7d46f] text-[#14230d] text-[13.5px] font-bold" onClick={() => setPop(null)} aria-label="Done" data-testid="piece-panel-done"><Check size={16} /> Done</button>
            </div>
            <div className="px-3 pt-1 pb-3">{open[1]}</div>
          </div>
        )}
        <div className="self-center glass ring-1 ring-white/15 shadow-xl flex items-center rounded-full p-1 max-w-full" data-page-bar data-testid="piece-toolbar" role="toolbar" aria-label={`${p.label} settings`}>
          <button className="h-11 shrink-0 flex items-center gap-1 rounded-full pl-3 pr-3.5 bg-[#a7d46f] text-[#14230d] text-[13.5px] font-bold" onClick={onDone} aria-label="Done" data-testid="piece-done"><Check size={16} /> Done</button>
          <div className="flex items-center gap-0.5 overflow-x-auto dg-scroll min-w-0 pl-1">{tools}</div>
        </div>
      </div>
    );
  }
  return (
    <div className="glass ring-1 ring-white/15 shadow-xl flex items-center gap-0.5 rounded-full px-1.5 py-1" data-page-bar data-testid="piece-toolbar" role="toolbar" aria-label={`${p.label} settings`} onPointerDown={e => e.stopPropagation()}>
      {tools}
    </div>
  );
}
