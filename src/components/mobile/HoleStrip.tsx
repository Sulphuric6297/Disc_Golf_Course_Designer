// A hole picked on a phone: its everyday settings in a short strip under the map (like a photo
// editor's row of adjustments), so the hole stays in view while it changes. A row of chips, each
// with what it's set to; the chip picked shows its control below: a dial for a length (dragged
// sideways under a fixed needle, the map following live), or a few choices. The rest of the hole's
// settings are further up the sheet, as before.
import { useRef, useState, type ReactNode } from "react";
import { Plus } from "lucide-react";
import { TEE_LEVELS } from "../../constants";
import { holeBaskets, holeTees } from "../../lib/course";
import { holeStats } from "../../lib/holeStats";
import { fmtDist } from "../../lib/units";
import { addHoleOb, select } from "../../state/actions";
import { updateHole, useCourse, useEditor } from "../../state/course";
import type { Hole } from "../../types";
import { Segmented } from "../ui";

type Chip = "par" | "fairway" | "tees" | "pins" | "ob" | "foliage";
// (the chip open stays open from hole to hole)
let lastChip: Chip = "fairway";

/** A dial: drag it sideways (or the arrow keys) to change a number; the needle stays put and the
 * marks slide under it. `onChange` live while dragging, `onDone` once let go. */
export function Dial({ value, min, max, step, label, format, onChange, onDone }: { value: number; min: number; max: number; step: number; label: string; format: (v: number) => string; onChange: (v: number) => void; onDone: () => void }) {
  const PX = 9; // a step per this many pixels
  const drag = useRef<{ x: number; v: number } | null>(null);
  const clampV = (v: number) => Math.min(max, Math.max(min, Math.round(v / step) * step));
  const down = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, v: value };
  };
  const move = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    // (dragged left: the marks move left, the number goes up, as on a tape)
    const v = clampV(d.v + ((d.x - e.clientX) / PX) * step);
    if (v !== value) onChange(v);
  };
  const up = () => { if (drag.current) { drag.current = null; onDone(); } };
  const key = (e: React.KeyboardEvent) => {
    const by = e.key === "ArrowRight" || e.key === "ArrowUp" ? step : e.key === "ArrowLeft" || e.key === "ArrowDown" ? -step : 0;
    if (!by) return;
    e.preventDefault();
    onChange(clampV(value + by));
    onDone();
  };
  const shift = -((value - min) / step) * PX;
  return (
    <div role="slider" tabIndex={0} aria-label={label} aria-valuemin={min} aria-valuemax={max} aria-valuenow={value} aria-valuetext={format(value)}
      className="relative h-[52px] rounded-2xl bg-black/25 overflow-hidden touch-none cursor-ew-resize select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onKeyDown={key} data-testid="dial">
      <div className="absolute inset-x-0 top-1.5 text-center text-[13px] font-bold text-zinc-50 tabular-nums pointer-events-none">{format(value)}</div>
      <div className="absolute inset-x-0 bottom-2 h-5 pointer-events-none" style={{
        backgroundImage: "repeating-linear-gradient(90deg, rgba(255,255,255,.75) 0 2px, transparent 2px 90px), repeating-linear-gradient(90deg, rgba(255,255,255,.35) 0 1.5px, transparent 1.5px 9px)",
        backgroundSize: "90px 20px, 9px 12px", backgroundRepeat: "repeat-x", backgroundPosition: `calc(50% + ${shift}px) 0, calc(50% + ${shift}px) 8px`,
        WebkitMaskImage: "linear-gradient(90deg, transparent, #000 20%, #000 80%, transparent)", maskImage: "linear-gradient(90deg, transparent, #000 20%, #000 80%, transparent)"
      }} />
      <div className="absolute left-1/2 top-1.5 bottom-1.5 w-[3px] -ml-[1.5px] rounded bg-orange-300 shadow-[0_0_8px_rgba(163,217,119,0.7)] pointer-events-none" />
    </div>
  );
}

const chipCls = (on: boolean) => `shrink-0 h-9 px-3 rounded-full text-[13.5px] font-semibold whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 ${on ? "bg-zinc-100 text-zinc-900" : "bg-white/[0.08] text-zinc-200 active:bg-white/[0.14]"}`;
const small = "h-10 px-3 rounded-xl text-[13.5px] font-semibold bg-white/[0.08] text-zinc-100 active:bg-white/[0.14] flex items-center gap-1.5 whitespace-nowrap";

export function HoleStrip({ hole }: { hole: Hole }) {
  const doc = useCourse(s => s.doc);
  const s = holeStats(doc, hole);
  const u = doc.units;
  const [chip, setChip] = useState<Chip>(lastChip);
  const pick = (c: Chip) => { lastChip = c; setChip(c); };
  const tees = holeTees(doc, hole.id);
  const pins = holeBaskets(doc, hole.id);
  const set = (patch: Partial<Hole>, history = true) => updateHole(hole.id, patch, history);
  const chips: [Chip, ReactNode][] = [
    ["par", <>Par <span className="opacity-60">{hole.par ?? s.parAuto}</span></>],
    ["fairway", <>Fairway <span className="opacity-60">{hole.fairway ? fmtDist(hole.fairwayWidth, u) : "off"}</span></>],
    ["tees", <>Tees <span className="opacity-60">{tees.length}</span></>],
    ["pins", <>Pins <span className="opacity-60">{pins.length}</span></>],
    ["ob", <>OB</>],
    ["foliage", <>Foliage <span className="opacity-60">{hole.foliage ?? "auto"}</span></>]
  ];
  let control: ReactNode = null;
  if (chip === "par") control = <Segmented label="Par" value={hole.par ?? 0} onChange={v => set({ par: v === 0 ? undefined : v })} options={[{ value: 0, label: `Auto ${s.parAuto}` }, ...[2, 3, 4, 5, 6].map(p => ({ value: p, label: String(p) }))]} />;
  else if (chip === "fairway") control = hole.fairway
    ? <Dial label="Fairway width" value={hole.fairwayWidth} min={10} max={150} step={1} format={v => `${fmtDist(v, u)} wide`} onChange={v => set({ fairwayWidth: v }, false)} onDone={() => useCourse.getState().commit()} />
    : <button className={small} onClick={() => set({ fairway: true })}><Plus size={16} /> Draw the fairway</button>;
  else if (chip === "tees" || chip === "pins") {
    const items = chip === "tees"
      ? tees.map(t => ({ id: t.id, label: `${TEE_LEVELS[t.level].label}${t.id === s.teeId ? " · played" : ""}`, dot: TEE_LEVELS[t.level].color }))
      : pins.map(b => ({ id: b.id, label: `Pin ${b.position}${b.id === s.basketId ? " · played" : ""}`, dot: doc.style.basket }));
    control = (
      <div className="flex gap-1.5 overflow-x-auto touch-pan-x dg-scroll -mx-1 px-1">
        {items.map(i => <button key={i.id} className={small} onClick={() => select(i.id)}><span className="w-2.5 h-2.5 rounded-full ring-1 ring-black/40" style={{ background: i.dot }} />{i.label}</button>)}
        <button className={small} onClick={() => useEditor.getState().set({ tool: chip === "tees" ? "add-tee" : "add-basket" })} data-testid={chip === "tees" ? "strip-add-tee" : "strip-add-pin"}><Plus size={16} /> {chip === "tees" ? "Tee" : "Pin"}</button>
      </div>
    );
  } else if (chip === "ob") control = (
    <div className="flex gap-1.5">
      {s.complete
        ? (["left", "right", "long"] as const).map(w => <button key={w} className={`${small} flex-1 justify-center`} onClick={() => addHoleOb(hole.id, w)}>{w === "left" ? "Left side" : w === "right" ? "Right side" : "Behind"}</button>)
        : <span className="text-[13px] text-zinc-400 px-1 py-2">Needs a tee and a basket first.</span>}
    </div>
  );
  else if (chip === "foliage") control = <Segmented label="Foliage" value={hole.foliage ?? "auto"} onChange={v => set({ foliage: v === "auto" ? undefined : (v as "light" | "heavy") })} options={[{ value: "auto", label: `Auto (${s.foliage})` }, { value: "light", label: "Light" }, { value: "heavy", label: "Heavy" }]} />;
  return (
    <div className="px-3 pb-3" data-testid="hole-strip">
      <div className="flex gap-1.5 overflow-x-auto touch-pan-x dg-scroll -mx-3 px-3 pb-2" role="tablist" aria-label="Hole settings">
        {chips.map(([c, text]) => <button key={c} role="tab" aria-selected={chip === c} className={chipCls(chip === c)} onClick={() => pick(c)} data-testid={`strip-${c}`}>{text}</button>)}
      </div>
      {control}
    </div>
  );
}
