// Small building blocks shared by the panels, and the look they share: surfaces in three greys
// (zinc-950 behind, zinc-900 panels, zinc-800 controls) told apart by spacing rather than lines,
// text-sm with zinc-400 for the quieter words, one orange button per view (dark words on it),
// and a sky-blue ring where the keyboard focus is.
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";

/** The nearest box that scrolls (or the page). */
const scrollerOf = (el: HTMLElement | null): HTMLElement | null => {
  for (let p = el?.parentElement; p; p = p.parentElement) {
    const o = getComputedStyle(p).overflowY;
    if ((o === "auto" || o === "scroll") && p.scrollHeight > p.clientHeight) return p;
  }
  return document.scrollingElement as HTMLElement | null;
};
/**
 * Keeps a clicked row where it was when what's around it opens or closes (one part of a list
 * opened, another closing above it): `keep(row)` before the change, and after it the list scrolls
 * by however far the row moved, so it stays under the pointer.
 */
export function useKeepInPlace() {
  const pending = useRef<{ el: HTMLElement; top: number } | null>(null);
  useLayoutEffect(() => {
    const p = pending.current;
    if (!p) return;
    pending.current = null;
    const moved = p.el.getBoundingClientRect().top - p.top;
    const box = scrollerOf(p.el);
    if (box && Math.abs(moved) > 0.5) box.scrollTop += moved;
  });
  return (el: HTMLElement | null) => { if (el) pending.current = { el, top: el.getBoundingClientRect().top }; };
}

/** The focus ring (keyboard only). */
export const FOCUS = "focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400";
/** A floating surface: a menu, a popover, a card over the map. */
export const POPOVER = "glass-solid rounded-2xl shadow-xl shadow-black/40 ring-1 ring-white/10";
/** A row in a menu. */
export const MENU_ROW = `w-full flex items-center gap-2 px-3 py-2 text-sm text-zinc-200 hover:bg-white/[0.07] rounded-lg text-left disabled:opacity-40 ${FOCUS}`;
/** A quiet heading inside a menu or a list. */
export const MENU_HEAD = "px-3 pt-2 pb-1 text-[11px] font-semibold text-zinc-500";

export const MenuRow = ({ icon, children, onClick, testid, danger, disabled, role = "menuitem", checked }: { icon?: ReactNode; children: ReactNode; onClick: () => void; testid?: string; danger?: boolean; disabled?: boolean; role?: string; checked?: boolean }) => (
  <button className={`${MENU_ROW} ${danger ? "text-red-300" : ""}`} role={role} aria-checked={checked} onClick={onClick} data-testid={testid} disabled={disabled}>{icon}{children}</button>
);

export const Section = ({ title, children, right, testid }: { title?: ReactNode; children: ReactNode; right?: ReactNode; testid?: string }) => (
  <section className="px-4 py-3" data-testid={testid}>
    {title && (
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-semibold text-zinc-400">{title}</h3>
        {right}
      </div>
    )}
    {children}
  </section>
);

/** A labelled control. A group, not a <label>: the controls inside carry their own names (a
 * <label> would also name every button in a button group after the whole field). */
export const Field = ({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) => (
  <div className="block mb-3" role="group" aria-label={label}>
    <span className="block text-xs touch:text-[13px] text-zinc-400 mb-1">{label}</span>
    {children}
    {hint && <span className="block text-[11px] text-zinc-500 mt-1">{hint}</span>}
  </div>
);

// (16 px text on touch screens: phones zoom into smaller text fields when they get the focus)
export const inputCls = "w-full bg-white/[0.07] rounded-[10px] px-2.5 py-1.5 text-sm touch:py-2.5 touch:text-base text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-sky-400/80";

export const TextInput = ({ value, onChange, placeholder, label, area }: { value: string; onChange: (v: string) => void; placeholder?: string; label?: string; area?: boolean }) =>
  area ? (
    <textarea aria-label={label} className={`${inputCls} min-h-[64px] resize-y`} value={value} placeholder={placeholder} onChange={e => onChange(e.target.value)} />
  ) : (
    <input aria-label={label} className={inputCls} value={value} placeholder={placeholder} onChange={e => onChange(e.target.value)} />
  );

/** A number typed freely (cleared, part-typed): kept as typed while it is in range, kept within
 * range when the field is left or Enter is pressed. */
export function NumberInput({ value, onChange, min, max, step = 1, label, unit }: { value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; label?: string; unit?: string }) {
  const shown = Number.isFinite(value) ? String(value) : "";
  const [text, setText] = useState(shown);
  const editing = useRef(false);
  useEffect(() => { if (!editing.current) setText(shown); }, [shown]);
  const within = (v: number) => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, v));
  const keep = () => {
    editing.current = false;
    const v = parseFloat(text);
    if (Number.isFinite(v) && within(v) !== value) onChange(within(v));
    setText(Number.isFinite(v) ? String(within(v)) : shown);
  };
  return (
    <div className="flex items-center gap-1.5">
      <input
        aria-label={label}
        type="number"
        className={inputCls}
        value={text}
        min={min}
        max={max}
        step={step}
        onFocus={() => { editing.current = true; }}
        onChange={e => {
          setText(e.target.value);
          const v = parseFloat(e.target.value);
          // (live while it's a number in range; the rest when the field is left)
          if (Number.isFinite(v) && v === within(v)) onChange(v);
        }}
        onBlur={keep}
        onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
      />
      {unit && <span className="text-xs text-zinc-400">{unit}</span>}
    </div>
  );
}

export const Slider = ({ value, onChange, min, max, step = 1, label, format, onDone }: { value: number; onChange: (v: number) => void; min: number; max: number; step?: number; label: string; format?: (v: number) => string; onDone?: () => void }) => (
  <div className="mb-3">
    <div className="flex justify-between text-xs mb-1">
      <span className="text-zinc-400">{label}</span>
      <span className="text-zinc-200 tabular-nums">{format ? format(value) : value}</span>
    </div>
    <input aria-label={label} type="range" className={`slider w-full touch:h-7 ${FOCUS} rounded`} style={{ ["--fill" as string]: `${((value - min) / Math.max(1e-9, max - min)) * 100}%` }} min={min} max={max} step={step} value={value} onChange={e => onChange(parseFloat(e.target.value))} onPointerUp={onDone} onKeyUp={onDone} onBlur={onDone} />
  </div>
);

export function Segmented<T extends string | number>({ value, options, onChange, label }: { value: T; options: { value: T; label: ReactNode; title?: string }[]; onChange: (v: T) => void; label?: string }) {
  return (
    <div className="flex flex-wrap gap-0.5 bg-white/[0.07] p-[3px] rounded-[11px]" role="radiogroup" aria-label={label}>
      {options.map(o => (
        <button
          key={String(o.value)}
          role="radio"
          aria-checked={value === o.value}
          title={o.title}
          onClick={() => onChange(o.value)}
          className={`flex-1 min-w-[2.2rem] px-2 py-1 touch:py-2.5 touch:text-[13px] rounded-[8px] text-xs font-semibold transition-colors ${FOCUS} ${value === o.value ? "bg-white/[0.18] text-zinc-50 shadow-[inset_0_0.5px_0_rgba(255,255,255,0.25)]" : "text-zinc-300 hover:text-zinc-50 hover:bg-white/[0.06]"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export const Toggle = ({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) => (
  <label className="flex items-start gap-2.5 py-1 touch:py-2.5 cursor-pointer select-none">
    <input type="checkbox" className={`switch mt-0.5 ${FOCUS}`} checked={checked} onChange={e => onChange(e.target.checked)} />
    <span>
      <span className="block text-sm text-zinc-200">{label}</span>
      {hint && <span className="block text-[11px] text-zinc-500">{hint}</span>}
    </span>
  </label>
);

/** Something on its way: a spinner and what it is, shown only once the wait is long enough to
 * notice (a quick load never flashes it). */
export const Loading = ({ label, className = "" }: { label: string; className?: string }) => (
  <div className={`flex items-center justify-center gap-2 text-sm text-zinc-300 animate-[dgfade_0.25s_ease_0.25s_both] ${className}`} role="status" aria-live="polite" aria-busy="true" data-testid="loading">
    <Loader2 size={16} className="animate-spin text-orange-300 shrink-0" />
    <span>{label}</span>
  </div>
);
/** A whole screen waiting (the app opening, a course page). */
export const LoadingScreen = ({ label }: { label: string }) => (
  <div className="min-h-[100dvh] bg-zinc-950 flex items-center justify-center"><Loading label={label} /></div>
);

/** A button. One that starts something taking a while (its onClick returns a promise) shows a
 * spinner and takes no second click until it's done. */
export const Button = ({ children, onClick, tone = "default", disabled, title, testid, full, small }: { children: ReactNode; onClick: () => unknown; tone?: "default" | "primary" | "danger" | "ghost"; disabled?: boolean; title?: string; testid?: string; full?: boolean; small?: boolean }) => {
  const [busy, setBusy] = useState(false);
  const live = useRef(true);
  useEffect(() => () => { live.current = false; }, []);
  const click = () => {
    const r = onClick();
    if (r && typeof (r as Promise<unknown>).finally === "function") {
      setBusy(true);
      void (r as Promise<unknown>).catch(() => {}).finally(() => { if (live.current) setBusy(false); });
    }
  };
  const tones = {
    default: "bg-white/[0.09] hover:bg-white/[0.14] text-zinc-100",
    primary: "bg-orange-500 hover:bg-orange-400 text-zinc-950",
    danger: "bg-white/[0.09] hover:bg-red-500/20 text-red-300",
    ghost: "text-zinc-300 hover:text-zinc-50 hover:bg-white/[0.07]"
  };
  return (
    <button
      onClick={click}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      title={title}
      data-testid={testid}
      className={`${full ? "w-full" : ""} inline-flex items-center justify-center gap-1.5 rounded-full font-semibold transition-colors disabled:opacity-40 disabled:pointer-events-none ${FOCUS} ${small ? "px-2.5 py-1 text-xs touch:py-2.5 touch:text-[13px]" : "px-3 py-2 text-sm touch:py-3"} ${tones[tone]}`}
    >
      {busy && <Loader2 size={small ? 12 : 14} className="animate-spin shrink-0" />}
      {children}
    </button>
  );
};

export const ColorInput = ({ value, onChange, label, onDone }: { value: string; onChange: (v: string) => void; label: string; onDone?: () => void }) => (
  <label className="flex items-center justify-between gap-2 py-1">
    <span className="text-xs text-zinc-300">{label}</span>
    <input aria-label={label} type="color" className={`w-9 h-7 touch:w-11 touch:h-9 rounded bg-transparent cursor-pointer ${FOCUS}`} value={value} onChange={e => onChange(e.target.value)} onBlur={onDone} />
  </label>
);

/** One number with its name under it (for a row of a few). */
export const Stat = ({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) => (
  <div className="min-w-0">
    <div className="text-sm font-semibold text-zinc-50 tabular-nums leading-tight truncate">{value}</div>
    <div className="text-[11px] text-zinc-500">{label}{sub ? <span> · {sub}</span> : null}</div>
  </div>
);

/** The numbers that matter, in one line: "Par 54 · 5,210 ft · Walking 980 ft". */
export const Facts = ({ items, testid }: { items: [label: string, value: ReactNode][]; testid?: string }) => (
  <dl className="flex flex-wrap items-baseline gap-x-1 gap-y-0.5 text-sm" data-testid={testid}>
    {items.map(([label, value], i) => (
      <div key={label} className="flex items-baseline gap-1">
        {i > 0 && <span className="text-zinc-600 mr-1">·</span>}
        <dt className="text-zinc-500">{label}</dt>
        <dd className="font-semibold text-zinc-100 tabular-nums">{value}</dd>
      </div>
    ))}
  </dl>
);

/** Tabs over a panel's parts: one row of quiet labels, the open one lit and underlined. */
export function Tabs<T extends string>({ value, tabs, onChange, label }: { value: T; tabs: { value: T; label: ReactNode; testid?: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="flex gap-1 shadow-[inset_0_-1px_0_0_rgba(255,255,255,0.08)]" role="tablist" aria-label={label}>
      {tabs.map(t => (
        <button key={t.value} role="tab" aria-selected={value === t.value} onClick={() => onChange(t.value)} data-testid={t.testid}
          className={`px-3 py-2 text-sm -mb-px border-b-2 transition-colors ${FOCUS} rounded-t-md ${value === t.value ? "border-orange-500 text-zinc-50 font-semibold" : "border-transparent text-zinc-400 hover:text-zinc-100"}`}>
          {t.label}
        </button>
      ))}
    </div>
  );
}
