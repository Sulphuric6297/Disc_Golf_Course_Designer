// The toolbar over what's picked on a printout's page, right beside it (on a phone, docked at the
// bottom in reach of a thumb, Done at its start where it never scrolls away): what it is, then
// only the settings it has. Font, size, lettering and panel color, bold, italic and alignment for
// text, its words or link, which holes it's on, how solid it is, how far it's turned, its place
// among what was added, then Reset, Duplicate and Hide or Delete. The same for the course map, tee
// signs, hole pages and the scorecard.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { AlignCenter, AlignLeft, AlignRight, Blend, Bold, BringToFront, Check, Copy, EyeOff, Flag, Italic, Link2, Minus, MoreHorizontal, Pencil, Plus, SendToBack, Trash2, Undo2 } from "lucide-react";
import { fontsIn } from "../lib/fontLoad";
import { useCourse } from "../state/course";
import { ColorSwatches } from "./ColorSwatches";
import { FontPicker } from "./FontPicker";
import { HolePicker } from "./PrintPanel";
import { duplicatePicked, moreOf, orderOf, patchPicked, pickedOf, removePicked, reorderPicked, resetPicked, takeOpening, type TargetKey } from "./printouts";

const commit = () => useCourse.getState().commit();

/** How the picked piece is drawn on the page right now (the editor reads it off the page): its
 * lettering's color and weight, its panel's color, and whether it has lettering or a panel at all. */
export type Drawn = { color?: string; fill?: string; bold?: boolean; text: boolean; panel: boolean };

/** A color's button: the lettering's (an A over its color) or the panel's (a square of it). */
function Swatch({ value, label, icon, on, onClick }: { value: string; label: string; icon: "letters" | "panel"; on: boolean; onClick: () => void }) {
  return (
    <button className={`relative h-8 w-8 touch:h-11 touch:w-11 shrink-0 flex items-center justify-center rounded-full hover:bg-white/[0.12] ${on ? "bg-white/[0.18]" : ""}`} title={label} aria-label={label} aria-expanded={on} onClick={onClick} data-testid={icon === "letters" ? "piece-color" : "piece-fill"}>
      {icon === "letters"
        ? <span className="flex flex-col items-center leading-none"><span className="text-[14px] font-bold text-zinc-50">A</span><span className="mt-0.5 h-[4px] w-4 rounded-full ring-1 ring-white/30" style={{ background: value }} /></span>
        : <span className="h-4 w-4 rounded-[5px] ring-1 ring-white/40" style={{ background: value }} />}
    </button>
  );
}

export function PieceToolbar({ t, id, onGrow, onPreviewFont, onEditText, onDone, onPanel, docked = false, drawn }: {
  t: TargetKey;
  id: string;
  /** Bigger or smaller by `f` (about its middle). */
  onGrow: (f: number) => void;
  onPreviewFont: (font: string | null) => void;
  onEditText: () => void;
  onDone: () => void;
  /** Docked: whether one of its settings is open in the short panel over it. */
  onPanel?: (open: boolean) => void;
  docked?: boolean;
  drawn?: Drawn;
}) {
  const doc = useCourse(c => c.doc);
  const p = pickedOf(doc, t, id);
  const [pop, setPop] = useState<"link" | "opacity" | "more" | "order" | "holes" | "color" | "fill" | null>(null);
  const linkRef = useRef<HTMLInputElement>(null);
  useEffect(() => { onPanel?.(docked && !!pop); }, [docked, pop, onPanel]);
  // (another piece picked: nothing of the last one's left open, but what a new one asks for: a
  // new QR code's link, to type straight away)
  useEffect(() => {
    const o = takeOpening(id);
    setPop(o);
    if (o === "link") setTimeout(() => linkRef.current?.focus(), 0);
  }, [id]);
  if (!p) return null;
  // (a piece of a look offers only what it draws: a font and lettering color where it has
  // lettering, a panel color where it has a panel)
  const has = p.kind === "piece" && t !== "map" && drawn ? { ...p.has, font: p.has.font && drawn.text, color: p.has.color && drawn.text, bold: p.has.bold && drawn.text, italic: p.has.italic && drawn.text, fill: p.has.fill && drawn.panel } : p.has;
  const bold = p.bold ?? (p.kind === "piece" ? drawn?.bold : undefined) ?? false;
  // (a pop-up: under its button; docked, in the short panel over the toolbar instead, see below)
  const float = (el: ReactNode) => (docked ? null : el);
  const popAt = (w: string) => `absolute left-0 top-full mt-2 ${w} z-[80] glass ring-1 ring-white/15 rounded-[14px]`;
  const linkBody = <input ref={linkRef} aria-label="Link" placeholder="https://" className="w-full rounded-[10px] bg-white/[0.1] px-2.5 py-2 text-sm touch:text-base text-zinc-50 placeholder:text-zinc-500 focus:outline-none" value={p.url ?? ""} onChange={e => patchPicked(t, id, { url: e.target.value }, false)} onBlur={commit} onKeyDown={e => { if (e.key === "Enter") { commit(); setPop(null); } }} />;
  const opacityBody = (
    <>
      <div className="flex justify-between text-[12px] text-zinc-300 mb-1"><span>{docked ? "" : "How solid it is"}</span><span className="tabular-nums">{Math.round((p.opacity ?? 1) * 100)}%</span></div>
      <input type="range" min={0.05} max={1} step={0.05} aria-label="How solid it is" className="slider w-full touch:h-7" value={p.opacity ?? 1} onChange={e => patchPicked(t, id, { opacity: Number(e.target.value) }, false)} onPointerUp={commit} />
    </>
  );
  const holesBody = (
    <div data-testid="piece-holes-menu">
      <HolePicker holes={p.holes} onChange={v => patchPicked(t, id, { holes: v })} />
    </div>
  );
  const b = "h-8 min-w-8 touch:h-11 touch:min-w-11 shrink-0 flex items-center justify-center gap-1 rounded-full px-1.5 text-zinc-100 hover:bg-white/[0.12] disabled:opacity-40";
  const sep = <span className="w-px h-5 bg-white/15 shrink-0 mx-0.5" />;
  const size = p.pt !== undefined ? `${Math.round(p.pt)}` : p.scale !== undefined ? `${Math.round(p.scale * 100)}%` : null;
  const align = p.align ?? "start";
  const nextAlign = align === "start" ? "middle" : align === "middle" ? "end" : "start";
  const AlignIcon = align === "middle" ? AlignCenter : align === "end" ? AlignRight : AlignLeft;
  const order = orderOf(doc, t, id);
  const rot = Math.round(p.rot ?? 0);
  const more = moreOf(doc, t, id);
  const orderBody = (o: [number, number]) => (
    <div className="flex flex-col" data-testid="piece-order-menu">
      {([[2, "To the front", BringToFront], [1, "Forward", BringToFront], [-1, "Backward", SendToBack], [-2, "To the back", SendToBack]] as const).map(([d, label, Icon]) => (
        <button key={label} className="flex items-center gap-2.5 px-2.5 py-2 touch:py-3 rounded-[10px] hover:bg-white/[0.08] text-[13px] text-zinc-100 text-left disabled:opacity-40" disabled={d > 0 ? o[0] === o[1] - 1 : o[0] === 0} onClick={() => reorderPicked(t, id, d)}><Icon size={15} />{label}</button>
      ))}
    </div>
  );
  const moreBody = (
    <div data-testid="piece-more-menu">
      {more.map(m => m.kind === "switch" ? (
        <label key={m.label} className="flex items-center justify-between gap-3 px-2 py-1.5 touch:py-3 rounded-[10px] hover:bg-white/[0.08] text-[13px] text-zinc-100 cursor-pointer">
          {m.label}<input type="checkbox" checked={m.on} onChange={e => m.set(e.target.checked)} className="accent-orange-400 w-4 h-4" />
        </label>
      ) : (
        <label key={m.label} className="block px-1 py-1">
          <span className="block text-[12px] text-zinc-300 mb-1">{m.label}</span>
          <input aria-label={m.label} className="w-full rounded-[10px] bg-white/[0.1] px-2.5 py-2 text-sm touch:text-base text-zinc-50 placeholder:text-zinc-500 focus:outline-none" value={m.value} placeholder={m.placeholder} onChange={e => m.set(e.target.value)} onBlur={commit} onKeyDown={e => { if (e.key === "Enter") { commit(); setPop(null); } }} data-testid="piece-heading" />
        </label>
      ))}
    </div>
  );
  // (the colors: the course's own and Custom, the panel's with a way to have none)
  const noPanel = p.kind === "text" && t === "map" ? "No panel" : "As the look has it";
  const colorBody = <ColorSwatches value={p.color ?? drawn?.color} onPick={(c, live) => patchPicked(t, id, { color: c }, !live)} onDone={commit} />;
  const fillBody = <ColorSwatches value={p.fill ?? drawn?.fill} onPick={(c, live) => patchPicked(t, id, { fill: c }, !live)} onDone={commit} none={p.fill ? { label: noPanel, on: () => { patchPicked(t, id, { fill: undefined }); setPop(null); } } : undefined} />;
  const hideable = p.removable || p.hideable !== false;
  const tools = (
    <>
      <span className="text-[12px] touch:text-[13px] font-semibold text-zinc-300 pl-1.5 pr-1 max-w-[130px] truncate shrink-0" data-testid="piece-name">{p.label}</span>
      {has.font && <div className="shrink-0"><FontPicker compact label="Font" value={p.font} inherit={p.inherit} onPick={f => patchPicked(t, id, { font: f })} onPreview={onPreviewFont} used={fontsIn(doc)} testid="piece-font" /></div>}
      {has.size && size !== null && (
        <span className="flex items-center shrink-0" data-testid="piece-size">
          <button className={b} aria-label="Smaller" title="Smaller" onClick={() => onGrow(1 / 1.12)}><Minus size={15} /></button>
          <span className="text-[12.5px] tabular-nums text-zinc-100 min-w-[38px] text-center">{size}</span>
          <button className={b} aria-label="Bigger" title="Bigger" onClick={() => onGrow(1.12)}><Plus size={15} /></button>
        </span>
      )}
      {(has.color || has.fill) && sep}
      {has.color && (
        <span className="relative shrink-0">
          <Swatch icon="letters" label="Lettering color" value={p.color ?? drawn?.color ?? "#ffffff"} on={pop === "color"} onClick={() => setPop(pop === "color" ? null : "color")} />
          {pop === "color" && float(<div className={`${popAt("w-64")} p-2.5`}>{colorBody}</div>)}
        </span>
      )}
      {has.fill && (
        <span className="relative shrink-0">
          <Swatch icon="panel" label="Panel color" value={p.fill ?? drawn?.fill ?? "#1b4332"} on={pop === "fill"} onClick={() => setPop(pop === "fill" ? null : "fill")} />
          {pop === "fill" && float(<div className={`${popAt("w-64")} p-2.5`}>{fillBody}</div>)}
        </span>
      )}
      {has.bold && <button className={`${b} ${bold ? "bg-white/[0.18]" : ""}`} aria-pressed={bold} aria-label="Bold" title="Bold" onClick={() => patchPicked(t, id, { bold: !bold })}><Bold size={15} /></button>}
      {has.italic && <button className={`${b} ${p.italic ? "bg-white/[0.18]" : ""}`} aria-pressed={!!p.italic} aria-label="Italic" title="Italic" onClick={() => patchPicked(t, id, { italic: !p.italic })} data-testid="piece-italic"><Italic size={15} /></button>}
      {has.align && <button className={b} aria-label={`Lines: ${align === "start" ? "left" : align === "middle" ? "centered" : "right"}`} title="Left, centered or right" onClick={() => patchPicked(t, id, { align: nextAlign })}><AlignIcon size={15} /></button>}
      {has.text && <button className={b} aria-label="Edit the words" title={docked ? "Edit the words (or tap it again)" : "Edit the words (or double-click it)"} onClick={onEditText} data-testid="piece-edit-text"><Pencil size={14} /></button>}
      {has.url && (
        <span className="relative shrink-0">
          <button className={`${b} ${pop === "link" ? "bg-white/[0.18]" : ""}`} aria-label="Where it takes you" title="Where it takes you" onClick={() => { setPop(pop === "link" ? null : "link"); setTimeout(() => linkRef.current?.focus(), 0); }}><Link2 size={15} /></button>
          {pop === "link" && float(<div className={`${popAt("w-72")} p-2`}>{linkBody}</div>)}
        </span>
      )}
      {has.holes && (
        <span className="relative shrink-0">
          <button className={`${b} px-2 text-[12px] font-semibold ${pop === "holes" ? "bg-white/[0.18]" : ""}`} aria-label="Holes it's on" title="Which holes it's on" onClick={() => setPop(pop === "holes" ? null : "holes")} data-testid="piece-holes"><Flag size={14} />{p.holes?.length ? p.holes.length : "All"}</button>
          {pop === "holes" && float(<div className={`${popAt("w-72")} p-2.5`}>{holesBody}</div>)}
        </span>
      )}
      {has.opacity && (
        <span className="relative shrink-0">
          <button className={`${b} ${pop === "opacity" ? "bg-white/[0.18]" : ""}`} aria-label="How solid it is" title="How solid it is" onClick={() => setPop(pop === "opacity" ? null : "opacity")} data-testid="piece-opacity"><Blend size={15} /></button>
          {pop === "opacity" && float(<div className={`${popAt("w-56")} px-3 py-2.5`}>{opacityBody}</div>)}
        </span>
      )}
      {has.turn && rot !== 0 && <button className={`${b} px-2 text-[12px] tabular-nums`} aria-label={`Turned ${rot}°: straighten it`} title="Straighten it" onClick={() => patchPicked(t, id, { rot: 0 })} data-testid="piece-straighten">{rot}°</button>}
      {order && order[1] > 1 && (
        <span className="relative shrink-0">
          <button className={`${b} ${pop === "order" ? "bg-white/[0.18]" : ""}`} aria-label="In front or behind" title="In front of or behind the other things you added" onClick={() => setPop(pop === "order" ? null : "order")} data-testid="piece-order"><BringToFront size={15} /></button>
          {pop === "order" && float(<div className={`${popAt("w-56")} p-1.5`}>{orderBody(order)}</div>)}
        </span>
      )}
      {more.length > 0 && (
        <span className="relative shrink-0">
          <button className={`${b} ${pop === "more" ? "bg-white/[0.18]" : ""}`} aria-label="More settings" title="More" onClick={() => setPop(pop === "more" ? null : "more")} data-testid="piece-more"><MoreHorizontal size={15} /></button>
          {pop === "more" && float(<div className={`${popAt(more.some(m => m.kind === "text") ? "w-72" : "w-56")} p-2`}>{moreBody}</div>)}
        </span>
      )}
      {sep}
      {p.changed && <button className={b} aria-label="Reset" title="Reset" onClick={() => resetPicked(t, id)} data-testid="piece-reset"><Undo2 size={14} /></button>}
      {p.duplicable && <button className={b} aria-label="Duplicate" title="Duplicate (Ctrl+D)" onClick={() => duplicatePicked(t, id)} data-testid="piece-duplicate"><Copy size={14} /></button>}
      {hideable && <button className={b} aria-label={p.removable ? "Delete" : "Hide"} title={p.removable ? "Delete" : "Hide"} onClick={() => removePicked(t, id)} data-testid="piece-remove">{p.removable ? <Trash2 size={14} /> : <EyeOff size={14} />}</button>}
    </>
  );
  if (docked) {
    // A phone: Done first and always there; the rest scrolls beside it. A setting that needs more
    // room opens in a short panel just over the toolbar, with its own Done
    const panels = { link: ["Where it takes you", linkBody], opacity: ["How solid it is", opacityBody], order: ["In front or behind", order ? orderBody(order) : null], more: ["More", moreBody], holes: ["Holes it's on", holesBody], color: ["Lettering color", colorBody], fill: ["Panel color", fillBody] } as const;
    const open = pop ? panels[pop] : null;
    return (
      <div className="w-full flex flex-col items-stretch gap-1.5" onPointerDown={e => e.stopPropagation()} onDoubleClick={e => e.stopPropagation()}>
        {open && (
          <div className="glass ring-1 ring-white/15 shadow-xl rounded-[22px] max-h-[38vh] overflow-y-auto dg-scroll" data-page-bar data-testid="piece-panel" role="region" aria-label={open[0]}>
            <div className="flex items-center gap-2 pl-4 pr-1.5 pt-1.5">
              <span className="flex-1 text-[15px] font-bold text-zinc-50">{open[0]}</span>
              <button className="h-11 shrink-0 flex items-center gap-1 rounded-full px-3.5 bg-orange-500 text-zinc-950 text-[13.5px] font-bold" onClick={() => setPop(null)} aria-label="Done" data-testid="piece-panel-done"><Check size={16} /> Done</button>
            </div>
            <div className="px-3 pt-1 pb-3">{open[1]}</div>
          </div>
        )}
        <div className="self-center glass ring-1 ring-white/15 shadow-xl flex items-center rounded-full p-1 max-w-full" data-page-bar data-testid="piece-toolbar" role="toolbar" aria-label={`${p.label} settings`}>
          <button className="h-11 shrink-0 flex items-center gap-1 rounded-full pl-3 pr-3.5 bg-orange-500 text-zinc-950 text-[13.5px] font-bold" onClick={onDone} aria-label="Done" data-testid="piece-done"><Check size={16} /> Done</button>
          {/* (faded at its right edge: more tools scroll in from there) */}
          <div className="flex items-center gap-0.5 overflow-x-auto dg-scroll min-w-0 pl-1 pr-4" style={{ maskImage: "linear-gradient(to right, #000 calc(100% - 28px), transparent)", WebkitMaskImage: "linear-gradient(to right, #000 calc(100% - 28px), transparent)" }}>{tools}</div>
        </div>
      </div>
    );
  }
  return (
    <div className="glass ring-1 ring-white/15 shadow-xl flex items-center gap-0.5 rounded-full px-1.5 py-1" data-page-bar data-testid="piece-toolbar" role="toolbar" aria-label={`${p.label} settings`} onPointerDown={e => e.stopPropagation()} onDoubleClick={e => e.stopPropagation()}>
      {tools}
    </div>
  );
}
