// Small building blocks shared by the panels, and the look they share: surfaces in three greys
// (zinc-950 behind, zinc-900 panels, zinc-800 controls) told apart by spacing rather than lines,
// text-sm with zinc-400 for the quieter words, one orange button per view (dark words on it),
// and a sky-blue ring where the keyboard focus is.
import { useEffect, useRef, useState, type ReactNode } from "react";

/** The focus ring (keyboard only). */
export const FOCUS = "focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400";
/** A floating surface: a menu, a popover, a card over the map. */
export const POPOVER = "bg-zinc-900 rounded-xl shadow-xl shadow-black/40 ring-1 ring-white/10";
/** A row in a menu. */
export const MENU_ROW = `w-full flex items-center gap-2 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-800 text-left disabled:opacity-40 ${FOCUS}`;
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
export const inputCls = "w-full bg-zinc-800 rounded-lg px-2.5 py-1.5 text-sm touch:py-2.5 touch:text-base text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-sky-400/80";

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
    <input aria-label={label} type="range" className={`w-full accent-orange-500 touch:h-7 ${FOCUS} rounded`} min={min} max={max} step={step} value={value} onChange={e => onChange(parseFloat(e.target.value))} onPointerUp={onDone} onKeyUp={onDone} onBlur={onDone} />
  </div>
);

export function Segmented<T extends string | number>({ value, options, onChange, label }: { value: T; options: { value: T; label: ReactNode; title?: string }[]; onChange: (v: T) => void; label?: string }) {
  return (
    <div className="flex flex-wrap gap-0.5 bg-zinc-800 p-0.5 rounded-lg" role="radiogroup" aria-label={label}>
      {options.map(o => (
        <button
          key={String(o.value)}
          role="radio"
          aria-checked={value === o.value}
          title={o.title}
          onClick={() => onChange(o.value)}
          className={`flex-1 min-w-[2.2rem] px-2 py-1 touch:py-2.5 touch:text-[13px] rounded-md text-xs font-semibold transition-colors ${FOCUS} ${value === o.value ? "bg-zinc-100 text-zinc-900 shadow-sm" : "text-zinc-300 hover:text-zinc-50 hover:bg-zinc-700/60"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export const Toggle = ({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) => (
  <label className="flex items-start gap-2.5 py-1 touch:py-2.5 cursor-pointer select-none">
    <input type="checkbox" className={`mt-0.5 accent-orange-500 w-4 h-4 touch:w-5 touch:h-5 shrink-0 ${FOCUS} rounded`} checked={checked} onChange={e => onChange(e.target.checked)} />
    <span>
      <span className="block text-sm text-zinc-200">{label}</span>
      {hint && <span className="block text-[11px] text-zinc-500">{hint}</span>}
    </span>
  </label>
);

export const Button = ({ children, onClick, tone = "default", disabled, title, testid, full, small }: { children: ReactNode; onClick: () => void; tone?: "default" | "primary" | "danger" | "ghost"; disabled?: boolean; title?: string; testid?: string; full?: boolean; small?: boolean }) => {
  const tones = {
    default: "bg-zinc-800 hover:bg-zinc-700 text-zinc-100",
    primary: "bg-orange-500 hover:bg-orange-400 text-zinc-950",
    danger: "bg-zinc-800 hover:bg-red-500/20 text-red-300",
    ghost: "text-zinc-300 hover:text-zinc-50 hover:bg-zinc-800"
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      data-testid={testid}
      className={`${full ? "w-full" : ""} inline-flex items-center justify-center gap-1.5 rounded-lg font-semibold transition-colors disabled:opacity-40 disabled:pointer-events-none ${FOCUS} ${small ? "px-2.5 py-1 text-xs touch:py-2.5 touch:text-[13px]" : "px-3 py-2 text-sm touch:py-3"} ${tones[tone]}`}
    >
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
