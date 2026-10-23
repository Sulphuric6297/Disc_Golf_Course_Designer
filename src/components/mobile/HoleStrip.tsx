// A hole picked on a phone: its everyday settings in a short strip under the map (like a photo
// editor's row of adjustments), so the hole stays in view while it changes. A row of chips, each
// with what it's set to; the chip picked shows its control below: a dial for a length (dragged
// sideways under a fixed needle, the map following live), or a few choices. The rest of the hole's
// settings are further up the sheet, as before.
import { useRef, useState, type ReactNode } from "react";
import { Navigation, Plus } from "lucide-react";
import { AREA_KINDS, LINE_KINDS, PIN_POSITIONS, STRUCTURE_KINDS, TEE_LEVELS, TEE_ORDER } from "../../constants";
import { holeBaskets, holeTees, teeAim } from "../../lib/course";
import { holeStats } from "../../lib/holeStats";
import { fmtDist } from "../../lib/units";
import { addHoleOb, select, setTeeLevel, startAnotherPin, startAnotherTee, startHoleToBasket } from "../../state/actions";
import { updateHole, updateItem, useCourse } from "../../state/course";
import { canShowLocation, spotHere, useGps } from "../../state/gps";
import { toast } from "../../state/toast";
import type { AreaItem, AreaKind, BasketItem, CourseItem, Hole, LineItem, LineKind, MandoItem, StructureItem, TeeItem, TreeItem, TreeKind } from "../../types";
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
        {chip === "tees" ? (
          <>
            <button className={small} onClick={() => startAnotherTee(hole.id)} data-testid="strip-add-tee"><Plus size={16} /> Tee for this hole</button>
            {s.complete && <button className={small} onClick={() => startHoleToBasket(hole.id)} data-testid="strip-hole-to-basket"><Plus size={16} /> New hole to this basket</button>}
          </>
        ) : <button className={small} onClick={() => startAnotherPin(hole.id)} data-testid="strip-add-pin"><Plus size={16} /> Another pin</button>}
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

type ItemChip = { id: string; label: ReactNode; control: ReactNode };
// (the chip open for each kind of thing stays open from one to the next)
const lastItemChip: Record<string, string> = {};

/** Anything else picked on a phone (a tree, a tee, a basket, a mando…): its everyday settings in
 * the same short strip, the map in view above it (pinch or twist the thing itself on the map to
 * size or turn it; these are for exact numbers). With your location on: Move here. */
export function ItemStrip({ item }: { item: CourseItem }) {
  const doc = useCourse(s => s.doc);
  const u = doc.units;
  const set = (patch: Record<string, unknown>, history = true) => updateItem(item.id, patch as Partial<CourseItem>, history);
  const live = (patch: Record<string, unknown>) => set(patch, false);
  const done = () => useCourse.getState().commit();
  const deg = (v: number) => `${Math.round(((v % 360) + 360) % 360)}°`;
  const chips: ItemChip[] = [];
  if (item.type === "tree") {
    const t = item as TreeItem;
    const height = t.height ?? t.radius * 2.6;
    chips.push(
      { id: "height", label: <>Height <span className="opacity-60">{fmtDist(height, u)}</span></>, control: <Dial label="Tree height" value={Math.round(height)} min={2} max={120} step={1} format={v => `${fmtDist(v, u)} tall`} onChange={v => live({ height: v, radius: Math.max(1, Math.min(45, Math.round(t.radius * (v / height) * 10) / 10)) })} onDone={done} /> },
      { id: "spread", label: <>Spread <span className="opacity-60">{fmtDist(t.radius * 2, u)}</span></>, control: <Dial label="Crown spread" value={Math.round(t.radius * 2)} min={2} max={90} step={1} format={v => `${fmtDist(v, u)} across`} onChange={v => live({ radius: v / 2 })} onDone={done} /> },
      { id: "kind", label: <>Kind</>, control: <Segmented label="Tree kind" value={t.treeType ?? "deciduous"} onChange={v => set({ treeType: v as TreeKind, species: undefined, variant: undefined, leaf: undefined })} options={[{ value: "deciduous", label: "Leafy" }, { value: "conifer", label: "Pine" }, { value: "bush", label: "Bush" }]} /> },
      { id: "lean", label: <>Lean <span className="opacity-60">{t.lean ? `${t.lean}°` : "none"}</span></>, control: <Dial label="Lean" value={Math.round(t.lean ?? 0)} min={0} max={30} step={1} format={v => (v ? `Leans ${v}°` : "Upright")} onChange={v => live({ lean: v || undefined })} onDone={done} /> }
    );
    if (t.lean) chips.push({ id: "leanDir", label: <>Leans toward</>, control: <Dial label="Leaning toward" value={Math.round(t.leanDir ?? 0)} min={0} max={345} step={15} format={v => `Toward ${["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round(v / 45) % 8]}`} onChange={v => live({ leanDir: v })} onDone={done} /> });
  } else if (item.type === "tee") {
    const t = item as TeeItem;
    const aim = Math.round(teeAim(doc, t));
    chips.push(
      { id: "color", label: <>Color <span className="inline-block w-2.5 h-2.5 rounded-full align-middle ring-1 ring-black/40 ml-0.5" style={{ background: TEE_LEVELS[t.level].color }} /></>, control: (
        <div className="flex gap-1.5 overflow-x-auto touch-pan-x dg-scroll -mx-1 px-1">
          {TEE_ORDER.map(l => <button key={l} className={`${small} ${t.level === l ? "!bg-zinc-100 !text-zinc-900" : ""}`} onClick={() => setTeeLevel(t.id, l)}><span className="w-2.5 h-2.5 rounded-full ring-1 ring-black/40" style={{ background: TEE_LEVELS[l].color }} />{TEE_LEVELS[l].label}</button>)}
        </div>
      ) },
      { id: "facing", label: <>Facing <span className="opacity-60">{deg(aim)}</span></>, control: <Dial label="Facing" value={aim} min={-720} max={720} step={1} format={v => `Points ${deg(v)}`} onChange={v => live({ rotation: v, aimFixed: true })} onDone={done} /> },
      { id: "length", label: <>Pad <span className="opacity-60">{fmtDist(t.padLength, u)}</span></>, control: <Dial label="Pad length" value={t.padLength} min={4} max={30} step={0.5} format={v => `${fmtDist(v, u)} long`} onChange={v => live({ padLength: v })} onDone={done} /> },
      { id: "width", label: <>Width <span className="opacity-60">{fmtDist(t.padWidth, u)}</span></>, control: <Dial label="Pad width" value={t.padWidth} min={2} max={20} step={0.5} format={v => `${fmtDist(v, u)} wide`} onChange={v => live({ padWidth: v })} onDone={done} /> }
    );
  } else if (item.type === "basket") {
    const b = item as BasketItem;
    chips.push(
      { id: "pin", label: <>Pin <span className="opacity-60">{b.position}</span></>, control: <Segmented label="Pin position" value={b.position} onChange={v => set({ position: v })} options={PIN_POSITIONS.map(p => ({ value: p, label: `Pin ${p}` }))} /> },
      { id: "raised", label: <>Raised <span className="opacity-60">{b.raised ? fmtDist(b.raised, u) : "no"}</span></>, control: <Dial label="Raised above the ground" value={b.raised ?? 0} min={0} max={20} step={0.5} format={v => (v ? `${fmtDist(v, u)} up` : "On the ground")} onChange={v => live({ raised: v || undefined })} onDone={done} /> }
    );
  } else if (item.type === "mando" || item.type === "amenity" || item.type === "dropzone" || item.type === "label") {
    const r = Math.round((item as { rotation?: number }).rotation ?? 0);
    chips.push({ id: "turn", label: <>Turn <span className="opacity-60">{deg(r)}</span></>, control: <Dial label="Turn" value={r} min={-720} max={720} step={1} format={v => `Turned ${deg(v)}`} onChange={v => live({ rotation: v })} onDone={done} /> });
    if (item.type === "mando") chips.push({ id: "side", label: <>Pass <span className="opacity-60">{(item as MandoItem).side}</span></>, control: <Segmented label="Mando side" value={(item as MandoItem).side} onChange={v => set({ side: v })} options={[{ value: "left", label: "Pass on the left" }, { value: "right", label: "Pass on the right" }]} /> });
  } else if (item.type === "area" || item.type === "line") {
    // A shape: what kind, its OB, and a woods' trees and underbrush (tap a corner to delete it)
    const kinds = item.type === "area" ? (Object.keys(AREA_KINDS) as AreaKind[]).map(k => [k, AREA_KINDS[k].label.replace(/ \(.*\)/, ""), AREA_KINDS[k].color]) : (Object.keys(LINE_KINDS) as LineKind[]).map(k => [k, LINE_KINDS[k].label, LINE_KINDS[k].color]);
    const kindLabel = item.type === "area" ? AREA_KINDS[item.kind].label.replace(/ \(.*\)/, "") : LINE_KINDS[item.kind].label;
    chips.push({ id: "kind", label: <>{kindLabel}</>, control: (
      <div className="flex gap-1.5 overflow-x-auto touch-pan-x dg-scroll -mx-1 px-1">
        {kinds.map(([k, label, color]) => <button key={k} className={`${small} ${item.kind === k ? "!bg-zinc-100 !text-zinc-900" : ""}`} onClick={() => set({ kind: k })}><span className="w-2.5 h-2.5 rounded-full ring-1 ring-black/40" style={{ background: color }} />{label}</button>)}
      </div>
    ) });
    if (item.type === "line" && LINE_KINDS[item.kind].width > 0) {
      const w = item.width ?? LINE_KINDS[item.kind].width;
      chips.push({ id: "width", label: <>Width <span className="opacity-60">{fmtDist(w, u)}</span></>, control: <Dial label="Width" value={w} min={1} max={60} step={0.5} format={v => `${fmtDist(v, u)} wide`} onChange={v => live({ width: v })} onDone={done} /> });
    }
    const a = item as AreaItem | LineItem;
    if (a.kind !== "ob" && a.kind !== "walk") chips.push({ id: "ob", label: <>OB <span className="opacity-60">{a.ob === true ? "red edge" : "no"}</span></>, control: <Segmented label="Out of bounds" value={a.ob === true ? "edge" : "no"} onChange={v => set(v === "edge" ? { ob: true } : { ob: undefined, obStretches: undefined, obBeyond: undefined })} options={[{ value: "no", label: "Not OB" }, { value: "edge", label: "OB, red edge" }]} /> });
    if (item.type === "area" && item.kind === "woods") {
      if (doc.lidar?.trees.length) chips.push({ id: "trees", label: <>Trees</>, control: <Segmented label="Trees in these woods" value={item.trees ?? "measured"} onChange={v => set({ trees: v === "measured" ? undefined : v })} options={[{ value: "measured", label: "Real" }, { value: "custom", label: "Real + fill" }, { value: "drawn", label: "App's" }, { value: "none", label: "None" }]} /> });
      chips.push({ id: "brush", label: <>Underbrush <span className="opacity-60">{item.underbrush ?? "none"}</span></>, control: <Segmented label="Underbrush" value={item.underbrush ?? "none"} onChange={v => set({ underbrush: v === "none" ? undefined : v })} options={[{ value: "none", label: "None" }, { value: "light", label: "Light" }, { value: "medium", label: "Medium" }, { value: "heavy", label: "Heavy" }]} /> });
    }
  } else if (item.type === "structure") {
    const s = item as StructureItem;
    const h = s.height ?? STRUCTURE_KINDS[s.kind].height;
    chips.push({ id: "height", label: <>Height <span className="opacity-60">{fmtDist(h, u)}</span></>, control: <Dial label="Height" value={h} min={0} max={40} step={0.5} format={v => fmtDist(v, u)} onChange={v => live({ height: v })} onDone={done} /> });
    if (STRUCTURE_KINDS[s.kind].shape !== "outline") chips.push({ id: "width", label: <>Width <span className="opacity-60">{fmtDist(s.width ?? 6, u)}</span></>, control: <Dial label="Width" value={s.width ?? 6} min={2} max={30} step={0.5} format={v => `${fmtDist(v, u)} wide`} onChange={v => live({ width: v })} onDone={done} /> });
  }
  const [open, setOpen] = useState<string>(() => lastItemChip[item.type] ?? chips[0]?.id ?? "");
  const pick = (c: string) => { lastItemChip[item.type] = c; setOpen(c); };
  const chip = chips.find(c => c.id === open) ?? chips[0];
  const placeable = item.type !== "area" && item.type !== "line" && item.type !== "structure";
  if (!chips.length && !placeable) return null;
  return (
    <div className="px-3 pb-3" data-testid="item-strip">
      <div className="flex gap-1.5 overflow-x-auto touch-pan-x dg-scroll -mx-3 px-3 pb-2" role="tablist" aria-label="Settings">
        {placeable && <MoveHere item={item} />}
        {chips.map(c => <button key={c.id} role="tab" aria-selected={chip?.id === c.id} className={chipCls(chip?.id === c.id)} onClick={() => pick(c.id)} data-testid={`strip-${c.id}`}>{c.label}</button>)}
      </div>
      {chip?.control}
    </div>
  );
}

/** Where you're standing: the picked thing put there, once a few seconds still give a sure spot
 * (its dot green when it's within 10 ft, amber within 25, red past that, as field apps show it).
 * Shown once your location is on. */
function MoveHere({ item }: { item: CourseItem }) {
  const mode = useGps(g => g.mode);
  const settling = useGps(g => g.settling);
  const acc = useGps(g => g.fix?.acc ?? null);
  const units = useCourse(s => s.doc.units);
  if (mode === "off" || !canShowLocation()) return null;
  const go = async () => {
    const f = await spotHere();
    if (!f) { toast("Couldn't get a sure spot. Try again in the open.", "info"); return; }
    updateItem(item.id, { x: f.at.x, y: f.at.y } as Partial<CourseItem>);
    toast(`Moved to where you're standing (within ${fmtDist(f.acc, units)}).`, "success", true);
  };
  const quality = acc === null ? "bg-zinc-400" : acc <= 10 ? "bg-emerald-400" : acc <= 25 ? "bg-amber-300" : "bg-red-400";
  return (
    <button className="shrink-0 h-9 px-3 rounded-full text-[13.5px] font-semibold whitespace-nowrap bg-sky-500/90 text-white active:bg-sky-600 flex items-center gap-1.5" onClick={() => void go()} disabled={settling} data-testid="move-here">
      <Navigation size={14} fill="currentColor" className={settling ? "animate-pulse" : ""} />
      {settling ? `Hold still${acc !== null ? ` · ± ${fmtDist(acc, units)}` : "…"}` : "Move here"}
      <span className={`w-2 h-2 rounded-full ${quality}`} aria-hidden />
    </button>
  );
}
