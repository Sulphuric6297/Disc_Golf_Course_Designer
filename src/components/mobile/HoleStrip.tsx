// A hole picked on a phone: its everyday settings in a short strip under the map (like a photo
// editor's row of adjustments), so the hole stays in view while it changes. A row of chips, each
// with what it's set to; the chip picked shows its control below: a dial for a length (dragged
// sideways under a fixed needle, the map following live), or a few choices. The rest of the hole's
// settings are further up the sheet, as before.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Plus } from "lucide-react";
import { AMENITY_KINDS, AMENITY_ORDER, AREA_KINDS, AREA_ORDER, FIELD_KINDS, LINE_KINDS, PATH_SURFACES, PIN_POSITIONS, STRUCTURE_KINDS, STRUCTURE_ORDER, TEE_LEVELS, TEE_ORDER, TEE_SURFACES, compassPoint } from "../../constants";
import { holeBaskets, holeTees, teeAim } from "../../lib/course";
import { holeStats } from "../../lib/holeStats";
import { MARKED_FIELDS, fieldKindOf, isBallField } from "../../lib/fields";
import { structureHeight, structureWidth } from "../../lib/structures";
import { fmtDist } from "../../lib/units";
import { addHoleOb, nextHomeCorner, obChoiceOf, pinsFull, select, setFieldKind, setFieldPlay, setLineKind, setObChoice, setPinPosition, setTeeLevel, startAnotherPin, startAnotherTee, startHoleToBasket, teesFull, type ObChoice } from "../../state/actions";
import { updateHole, updateItem, useCourse, useEditor } from "../../state/course";
import { getView } from "../../state/view";
import type { AmenityItem, AmenityKind, AreaItem, AreaKind, BasketItem, CourseItem, FieldKind, Hole, LabelItem, LineItem, LineKind, MandoItem, PathSurface, StructureItem, StructureKind, TeeItem, TeeSurface, TreeItem } from "../../types";
import { BRUSH_LEVELS, FENCE_STYLES, FieldParts, GrowsPick, HoleTrees, InspectorBody, PLAY_OPTIONS, RULE_AREAS, StructureLook, SurfacePick, THICK, TurnButtons, densityFor, growsOf, growsText, hasParts, thickOf, useHoleTrees, amenityIcon, builtIcon, fieldKindOptions, fmtSize, fmtTurn, hasObChoice, heightLabel, homeText, obOptions } from "../Inspector";
import { HoleChips } from "../ApplyToHoles";
import { MoveHere } from "../PlaceByGps";
import { KindTiles, areaPicture, bigIcon, linePicture } from "./KindTiles";
import { TREE_KINDS } from "../TreeSettings";
import { ChipPick, ColorInput, Segmented, TextInput } from "../ui";

type Chip = "par" | "fairway" | "tees" | "pins" | "ob" | "foliage" | "trees" | "name" | "all";
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
      <div className="absolute left-1/2 top-6 bottom-1.5 w-[3px] -ml-[1.5px] rounded bg-orange-300 shadow-[0_0_8px_rgba(163,217,119,0.7)] pointer-events-none" />
    </div>
  );
}

const chipCls = (on: boolean) => `shrink-0 h-10 touch:h-11 px-3 rounded-full text-[13.5px] font-semibold whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 ${on ? "bg-zinc-100 text-zinc-900" : "bg-white/[0.08] text-zinc-200 active:bg-white/[0.14]"}`;
const small = "h-11 px-3 rounded-xl text-[13.5px] font-semibold bg-white/[0.08] text-zinc-100 active:bg-white/[0.14] flex items-center gap-1.5 whitespace-nowrap";
/** Under the chips, the open chip's control: never taller than a quarter of the screen (it
 * scrolls), so the whole strip stays under half and the map keeps the rest. */
const paneCls = "max-h-[24dvh] overflow-y-auto overflow-x-hidden dg-scroll -mx-3 px-3";
/** The whole of the panel, for anything not in a chip of its own (it scrolls, as tall as a pane). */
const allSettings = <div className="-mx-4 [&_section]:px-4 [&_section]:py-2" data-testid="strip-all-pane"><InspectorBody /></div>;

export function HoleStrip({ hole }: { hole: Hole }) {
  const doc = useCourse(s => s.doc);
  const s = holeStats(doc, hole);
  const u = doc.units;
  const [chip, setChip] = useState<Chip>(lastChip);
  const pick = (c: Chip) => { lastChip = c; setChip(c); };
  const tees = holeTees(doc, hole.id);
  const pins = holeBaskets(doc, hole.id);
  const holeTrees = useHoleTrees(hole, s.complete ? s.line : null);
  const set = (patch: Partial<Hole>, history = true) => updateHole(hole.id, patch, history);
  const chips: [Chip, ReactNode][] = [
    ["par", <>Par <span className="opacity-60">{hole.par ?? `${s.parAuto} · auto`}</span></>],
    ["fairway", <>Fairway <span className="opacity-60">{hole.fairway ? fmtDist(hole.fairwayWidth, u) : "off"}</span></>],
    ["tees", <>Tees <span className="opacity-60">{tees.length}</span></>],
    ["pins", <>Pins <span className="opacity-60">{pins.length}</span></>],
    ["ob", <>Add OB</>],
    ["foliage", <>Foliage <span className="opacity-60">{hole.foliage === "light" ? "Light" : hole.foliage === "heavy" ? "Heavy" : "Auto"}</span></>],
    // (the measured trees it cut down: the way to bring them back)
    ...(holeTrees.cut.length || holeTrees.kept.length || holeTrees.standing.length ? [["trees", <>Trees <span className="opacity-60">{holeTrees.cut.length ? `${holeTrees.cut.length} cut` : holeTrees.standing.length ? `${holeTrees.standing.length} in the way` : `${holeTrees.kept.length} kept`}</span></>] as [Chip, ReactNode]] : []),
    ["name", <>{hole.name ? <>Name <span className="opacity-60">{hole.name}</span></> : hole.notes ? "Notes" : "Name and notes"}</>],
    ["all", <>All settings</>]
  ];
  let control: ReactNode = null;
  if (chip === "par") control = <Segmented label="Par" value={hole.par ?? 0} onChange={v => set({ par: v === 0 ? undefined : v })} options={[{ value: 0, label: <span className="whitespace-nowrap">Auto {s.parAuto}</span> }, ...[2, 3, 4, 5, 6].map(p => ({ value: p, label: String(p) }))]} />;
  else if (chip === "fairway") control = hole.fairway
    ? <Dial label="Fairway width" value={hole.fairwayWidth} min={10} max={150} step={1} format={v => `${fmtDist(v, u)} wide`} onChange={v => set({ fairwayWidth: v }, false)} onDone={() => useCourse.getState().commit()} />
    : <button className={small} onClick={() => set({ fairway: true })}><Plus size={16} /> Draw the fairway</button>;
  else if (chip === "tees" || chip === "pins") {
    // (each tee's length to the pin played, each pin's from the tee played)
    const tee = tees.find(t => t.id === s.teeId) ?? tees[0], pin = pins.find(b => b.id === s.basketId) ?? pins[0];
    const len = (t?: TeeItem, b?: BasketItem) => (t && b ? ` · ${fmtDist(holeStats(doc, hole, { id: "x", name: "", tee: t.level, pin: b.position }).length, u)}` : "");
    const items = chip === "tees"
      ? tees.map(t => ({ id: t.id, label: `${TEE_LEVELS[t.level].label}${len(t, pin)}${t.id === s.teeId ? " · played" : ""}`, dot: TEE_LEVELS[t.level].color }))
      : pins.map(b => ({ id: b.id, label: `Pin ${b.position}${len(tee, b)}${b.id === s.basketId ? " · played" : ""}`, dot: doc.style.basket }));
    control = (
      <div className="flex gap-1.5 overflow-x-auto touch-pan-x dg-scroll -mx-1 px-1">
        {items.map(i => <button key={i.id} className={small} onClick={() => select(i.id)}><span className="w-2.5 h-2.5 rounded-full ring-1 ring-black/40" style={{ background: i.dot }} />{i.label}</button>)}
        {chip === "tees" ? (
          <>
            {!teesFull(hole.id, true) && <button className={small} onClick={() => startAnotherTee(hole.id)} data-testid="strip-add-tee"><Plus size={16} /> Another tee for this hole</button>}
            {s.complete && <button className={small} onClick={() => startHoleToBasket(hole.id)} data-testid="strip-hole-to-basket"><Plus size={16} /> New hole to this basket</button>}
          </>
        ) : !pinsFull(hole.id, true) && <button className={small} onClick={() => startAnotherPin(hole.id)} data-testid="strip-add-pin"><Plus size={16} /> Another pin position</button>}
      </div>
    );
  } else if (chip === "ob") control = (
    <div className="flex gap-1.5">
      {s.complete
        ? (["left", "right", "long"] as const).map(w => <button key={w} className={`${small} flex-1 justify-center`} onClick={() => addHoleOb(hole.id, w)}>{w === "left" ? "Left side" : w === "right" ? "Right side" : "Behind basket"}</button>)
        : <span className="text-[13px] text-zinc-400 px-1 py-2">Needs a tee and a basket first.</span>}
    </div>
  );
  else if (chip === "trees") control = s.complete ? <HoleTrees hole={hole} line={s.line} /> : null;
  else if (chip === "name") control = (
    <div className="grid gap-2">
      <TextInput label="Hole name" value={hole.name ?? ""} placeholder="Name (optional)" onChange={v => set({ name: v || undefined }, false)} onDone={() => useCourse.getState().commit()} />
      <TextInput area label="Hole notes" value={hole.notes ?? ""} placeholder="Notes and hole rules" onChange={v => set({ notes: v || undefined }, false)} onDone={() => useCourse.getState().commit()} />
    </div>
  );
  else if (chip === "all") control = allSettings;
  else if (chip === "foliage") control = <Segmented label="Foliage" value={hole.foliage ?? "auto"} onChange={v => set({ foliage: v === "auto" ? undefined : (v as "light" | "heavy") })} options={[{ value: "auto", label: <span className="whitespace-nowrap">Auto · {s.foliage}</span> }, { value: "light", label: "Light" }, { value: "heavy", label: "Heavy" }]} />;
  return (
    <div className="px-3 pb-3" data-testid="hole-strip">
      <div className="flex gap-1.5 overflow-x-auto touch-pan-x dg-scroll -mx-3 px-3 pb-2" role="tablist" aria-label="Hole settings">
        {chips.map(([c, text]) => <button key={c} role="tab" aria-selected={chip === c} className={chipCls(chip === c)} onClick={() => pick(c)} data-testid={`strip-${c}`}>{text}</button>)}
      </div>
      <div className={paneCls} data-testid="strip-pane">{control}</div>
    </div>
  );
}

/** A chip in the strip: one that opens its control below it, or (`run`) one that acts at once. */
type ItemChip = { id: string; label: ReactNode; control?: ReactNode; run?: () => void };
// (the chip open for each kind of thing stays open from one to the next)
const lastItemChip: Record<string, string> = {};

/** Anything else picked on a phone (a tree, a tee, a basket, a mando…): its everyday settings in
 * the same short strip, the map in view above it (pinch or twist the thing itself on the map to
 * size or turn it; these are for exact numbers). With your location on: Move here (PlaceByGps.tsx). */
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
      // (as far as the panel's sliders go: a survey's tree taller than that keeps its size)
      { id: "height", label: <>Height <span className="opacity-60">{fmtDist(height, u)}</span></>, control: <Dial label="Tree height" value={Math.round(height)} min={2} max={Math.max(120, Math.round(height))} step={1} format={v => `${fmtDist(v, u)} tall`} onChange={v => live({ height: v, radius: Math.max(1, Math.min(45, Math.round(t.radius * (v / height) * 10) / 10)) })} onDone={done} /> },
      { id: "spread", label: <>Spread <span className="opacity-60">{fmtDist(t.radius * 2, u)}</span></>, control: <Dial label="Crown spread" value={Math.round(t.radius * 2)} min={2} max={Math.max(90, Math.round(t.radius * 2))} step={1} format={v => `${fmtDist(v, u)} across`} onChange={v => live({ radius: v / 2 })} onDone={done} /> },
      { id: "kind", label: <>Kind <span className="opacity-60">{TREE_KINDS.find(k => k.value === (t.treeType ?? "deciduous"))?.label}</span></>, control: <KindTiles label="Tree kind" value={t.treeType ?? "deciduous"} onChange={v => set({ treeType: v, species: undefined, variant: undefined, leaf: undefined })} options={TREE_KINDS.map(k => ({ value: k.value, label: k.label, picture: bigIcon(k.icon) }))} /> },
      { id: "lean", label: <>Lean <span className="opacity-60">{t.lean ? `${t.lean}°` : "none"}</span></>, control: <Dial label="Lean" value={Math.round(t.lean ?? 0)} min={0} max={30} step={1} format={v => (v ? `Leans ${v}°` : "Upright")} onChange={v => live({ lean: v || undefined })} onDone={done} /> }
    );
    if (t.lean) chips.push({ id: "leanDir", label: <>Leans toward</>, control: <Dial label="Leaning toward" value={Math.round(t.leanDir ?? 0)} min={0} max={345} step={15} format={v => `Toward ${compassPoint(v)}`} onChange={v => live({ leanDir: v })} onDone={done} /> });
  } else if (item.type === "tee") {
    const t = item as TeeItem;
    // (the way it faces as a compass bearing: 0° north, 90° east; its aim is 0° east, 90° south)
    const aim = Math.round(teeAim(doc, t)) + 90;
    const bearing = (v: number) => `${compassPoint(v)} · ${deg(v)}`;
    chips.push(
      { id: "view", label: <>View from this tee</>, run: () => useEditor.getState().set({ teeView: t.holeId, teeViewTee: t.id, flyover: false }) },
      { id: "color", label: <>Color <span className="inline-block w-2.5 h-2.5 rounded-full align-middle ring-1 ring-black/40 ml-0.5" style={{ background: TEE_LEVELS[t.level].color }} /></>, control: (
        <ChipPick row label="Tee color" value={t.level} onChange={v => setTeeLevel(t.id, v)} options={TEE_ORDER.map(l => ({ value: l, label: TEE_LEVELS[l].label, color: TEE_LEVELS[l].color }))} />
      ) },
      { id: "facing", label: <>Facing <span className="opacity-60">{bearing(aim)}</span></>, control: <Dial label="Facing" value={aim} min={-720} max={720} step={1} format={v => `Points ${bearing(v)}`} onChange={v => live({ rotation: v - 90, aimFixed: true })} onDone={done} /> },
      { id: "length", label: <>Length <span className="opacity-60">{fmtSize(t.padLength, u)}</span></>, control: <Dial label="Pad length" value={t.padLength} min={4} max={30} step={0.5} format={v => `${fmtSize(v, u)} long`} onChange={v => live({ padLength: v })} onDone={done} /> },
      { id: "width", label: <>Width <span className="opacity-60">{fmtSize(t.padWidth, u)}</span></>, control: <Dial label="Pad width" value={t.padWidth} min={2} max={20} step={0.5} format={v => `${fmtSize(v, u)} wide`} onChange={v => live({ padWidth: v })} onDone={done} /> }
    );
  } else if (item.type === "basket") {
    const b = item as BasketItem;
    chips.push(
      { id: "pin", label: <>Pin <span className="opacity-60">{b.position}</span></>, control: <Segmented label="Pin position" value={b.position} onChange={v => setPinPosition(b.id, v)} options={PIN_POSITIONS.map(p => ({ value: p, label: p }))} /> },
      { id: "raised", label: <>Raised <span className="opacity-60">{b.raised ? fmtSize(b.raised, u) : "no"}</span></>, control: <Dial label="Raised above the ground" value={b.raised ?? 0} min={0} max={30} step={0.5} format={v => (v ? `${fmtSize(v, u)} up` : "On the ground")} onChange={v => live({ raised: v || undefined })} onDone={done} /> }
    );
  } else if (item.type === "mando" || item.type === "amenity" || item.type === "dropzone" || item.type === "label") {
    const r = Math.round((item as { rotation?: number }).rotation ?? 0);
    chips.push({ id: "turn", label: <>Turn <span className="opacity-60">{deg(r)}</span></>, control: <Dial label="Turn" value={r} min={-720} max={720} step={1} format={v => `Turned ${deg(v)}`} onChange={v => live({ rotation: v })} onDone={done} /> });
    if (item.type === "amenity") {
      // (a bridge's or a shelter's sign is a course's from before: offered only to one that is one)
      const a = item as AmenityItem;
      const kinds = AMENITY_KINDS[a.kind].retired ? [...AMENITY_ORDER, a.kind] : AMENITY_ORDER;
      const name = (k: AmenityKind) => AMENITY_KINDS[k].pick ?? AMENITY_KINDS[k].label;
      chips.unshift({ id: "kind", label: <>Kind <span className="opacity-60">{name(a.kind)}</span></>, control: <KindTiles label="Amenity kind" value={a.kind} onChange={v => set({ kind: v })} options={kinds.map(k => ({ value: k, label: name(k), picture: bigIcon(amenityIcon(k)) }))} /> });
    }
    if (item.type === "label") {
      const l = item as LabelItem;
      chips.push({ id: "size", label: <>Size <span className="opacity-60">{l.fontSize} px</span></>, control: <Dial label="Size" value={l.fontSize} min={9} max={40} step={1} format={v => `${v} px`} onChange={v => live({ fontSize: v })} onDone={done} /> });
    }
    if (item.type === "mando") chips.push({ id: "side", label: <>Pass <span className="opacity-60">{(item as MandoItem).side} of it</span></>, control: <Segmented label="Mando side" value={(item as MandoItem).side} onChange={v => set({ side: v })} options={[{ value: "left", label: "Left of it" }, { value: "right", label: "Right of it" }]} /> });
  } else if (item.type === "area" || item.type === "line") {
    // A shape: what kind, its OB, and a woods' trees and underbrush (tap a corner to delete it).
    // (a flat building is an old course's: offered only to one that is one)
    const kinds = item.type === "area"
      ? (item.kind === "building" ? [...AREA_ORDER, item.kind] : AREA_ORDER).map(k => ({ value: k as string, label: AREA_KINDS[k].label, color: AREA_KINDS[k].color }))
      : (Object.keys(LINE_KINDS) as LineKind[]).map(k => ({ value: k as string, label: LINE_KINDS[k].label, color: LINE_KINDS[k].color }));
    const kindLabel = item.type === "area" ? AREA_KINDS[item.kind].label : LINE_KINDS[item.kind].label;
    // (a field, court or play area: its own kinds, then in or out of play, its markings or its home plate)
    const fk = item.type === "area" && item.kind === "field" ? fieldKindOf(item) : null;
    if (fk && item.type === "area") {
      chips.push(
        { id: "kind", label: <>Kind <span className="opacity-60">{FIELD_KINDS[fk].label}</span></>, control: <KindTiles label="Field kind" value={fk} onChange={(v: FieldKind) => setFieldKind(item.id, v)} options={fieldKindOptions().map(o => ({ value: o.value, label: o.label, picture: bigIcon(o.icon) }))} /> },
        { id: "play", label: <>{item.outOfPlay ? "Out of play" : "In play"}</>, control: <Segmented label="Play" value={item.outOfPlay ? "out" : "in"} onChange={v => setFieldPlay(item.id, v === "out")} options={[...PLAY_OPTIONS]} /> }
      );
      if (MARKED_FIELDS.includes(fk)) chips.push({ id: "markings", label: <>Markings <span className="opacity-60">{fmtTurn(item.fieldTurn ?? 0)}</span></>, control: <Dial label="Markings turn" value={item.fieldTurn ?? 0} min={-90} max={90} step={1} format={fmtTurn} onChange={v => live({ fieldTurn: v || undefined })} onDone={done} /> });
      if (isBallField(fk)) chips.push({ id: "home", label: <>Home plate</>, control: (
        <div className="flex items-center gap-2">
          <span className="flex-1 text-[13.5px] text-zinc-200 tabular-nums px-1">{homeText(item)}</span>
          {!item.locked && <button className={small} onClick={() => nextHomeCorner(item.id)} data-testid="strip-home-next">Next corner</button>}
        </div>
      ) });
    } else chips.push({ id: "kind", label: <>Kind <span className="opacity-60">{kindLabel}</span></>, control: (
      <KindTiles label={item.type === "area" ? "Area kind" : "Line kind"} value={item.kind as string} onChange={k => (item.type === "line" ? setLineKind(item.id, k as LineKind) : set({ kind: k }))} options={kinds.map(o => ({ value: o.value, label: o.label, picture: item.type === "area" ? areaPicture(o.value as AreaKind) : linePicture(o.value as LineKind) }))} />
    ) });
    // (a next-tee route can have none: a dashed line)
    if (item.type === "line" && (LINE_KINDS[item.kind].width > 0 || item.kind === "walk")) {
      const meta = LINE_KINDS[item.kind];
      const w = item.width ?? meta.width;
      const min = item.kind === "walk" ? 0 : 1;
      chips.push({ id: "width", label: <>Width <span className="opacity-60">{w ? fmtSize(w, u) : "none"}</span></>, control: <Dial label="Width" value={w} min={min} max={meta.maxWidth} step={0.5} format={v => (v ? `${fmtSize(v, u)} wide` : "Just a dashed line")} onChange={v => live({ width: v || undefined })} onDone={done} /> });
    }
    // (a fence: what it is, and a fence, hedge or power line how tall, as in its panel)
    if (item.type === "line" && item.kind === "fence") {
      const style = item.fenceStyle ?? "rail";
      chips.push({ id: "fence", label: <>Fence <span className="opacity-60">{FENCE_STYLES.find(f => f.value === style)?.label}</span></>, control: <ChipPick row label="What the fence is" value={style} onChange={v => set({ fenceStyle: v === "rail" ? undefined : v })} options={FENCE_STYLES} /> });
    }
    if (item.type === "line" && LINE_KINDS[item.kind].heights) {
      const meta = LINE_KINDS[item.kind], h = item.fenceHeight ?? meta.height!;
      const name = heightLabel(item.kind);
      chips.push({ id: "height", label: <>{name} <span className="opacity-60">{fmtSize(h, u)}</span></>, control: <Dial label={name} value={h} min={meta.heights![0]} max={meta.heights![1]} step={0.5} format={v => `${fmtSize(v, u)} ${item.kind === "power" ? "up" : "tall"}`} onChange={v => live({ fenceHeight: v })} onDone={done} /> });
    }
    const a = item as AreaItem | LineItem;
    if (hasObChoice(a)) {
      const ob = obChoiceOf(a);
      const opts = obOptions(a);
      // (the picked choice's own words: OB, Hazard; Penalty none when there's none)
      const said = opts.find(o => o.value === ob)?.label ?? "";
      chips.push({ id: "ob", label: ob === "no" ? <>Penalty <span className="opacity-60">none</span></> : <>{said}</>, control: <ChipPick row label="Penalty" value={ob} onChange={(v: ObChoice) => setObChoice(a.id, v)} options={opts} /> });
    }
    // (a wood: what grows, how thick, and whether the measured trees in it stay)
    if (item.type === "area" && item.kind === "woods") {
      chips.push({ id: "grows", label: <>{growsText(growsOf(item, doc.style))}</>, control: <GrowsPick row item={item} /> });
      const t = thickOf(item);
      chips.push({ id: "thick", label: <>Thick <span className="opacity-60">{THICK.find(x => x.value === t)!.label}</span></>, control: <Segmented label="How thick" value={t} onChange={v => set({ density: densityFor(v) })} options={[...THICK]} /> });
      if (doc.lidar?.trees.length) {
        const keep = item.trees !== "drawn" && item.trees !== "none";
        chips.push({ id: "trees", label: <>Measured trees <span className="opacity-60">{keep ? "kept" : "cleared"}</span></>, control: <Segmented label="Measured trees in it" value={keep ? "keep" : "clear"} onChange={v => set({ trees: v === "keep" ? undefined : "drawn" })} options={[{ value: "keep", label: "Keep them" }, { value: "clear", label: "Clear them" }]} /> });
      }
    }
    // (woods, and tall grass when you want some; a wood of bushes only is brush already)
    if (item.type === "area" && (item.kind === "rough" || (item.kind === "woods" && (item.bushes ?? 0) < 1)))
      chips.push({ id: "brush", label: <>Underbrush <span className="opacity-60">{item.underbrush ? `${item.underbrush[0].toUpperCase()}${item.underbrush.slice(1)}` : "None"}</span></>, control: <Segmented label="Underbrush" value={item.underbrush ?? "none"} onChange={v => set({ underbrush: v === "none" ? undefined : v })} options={[...BRUSH_LEVELS]} /> });
  } else if (item.type === "structure") {
    // (the same ranges as the panel's sliders; stairs follow the ground, with no height of their own)
    const s = item as StructureItem;
    const meta = STRUCTURE_KINDS[s.kind];
    // (a line can only become another line, an outline another outline)
    const kinds = STRUCTURE_ORDER.filter(k => STRUCTURE_KINDS[k].shape === meta.shape);
    chips.push({ id: "kind", label: <>Kind <span className="opacity-60">{meta.label}</span></>, control: <KindTiles label="Structure kind" value={s.kind} onChange={(v: StructureKind) => set({ kind: v })} options={kinds.map(k => ({ value: k, label: STRUCTURE_KINDS[k].label, picture: bigIcon(builtIcon(k)) }))} /> });
    if (meta.heightLabel) {
      const h = structureHeight(s);
      chips.push({ id: "height", label: <>{meta.heightLabel.split(" ")[0]} <span className="opacity-60">{fmtSize(h, u)}</span></>, control: <Dial label={meta.heightLabel} value={h} min={meta.heights[0]} max={Math.max(meta.heights[1], h)} step={0.5} format={v => fmtSize(v, u)} onChange={v => live({ height: v })} onDone={done} /> });
    }
    if (meta.shape === "line") {
      const w = structureWidth(s);
      const name = s.kind === "wall" ? "Thickness" : "Width";
      chips.push({ id: "width", label: <>{name} <span className="opacity-60">{fmtSize(w, u)}</span></>, control: <Dial label={name} value={w} min={meta.widths[0]} max={Math.max(meta.widths[1], w)} step={0.5} format={v => `${fmtSize(v, u)} ${s.kind === "wall" ? "thick" : "wide"}`} onChange={v => live({ width: v })} onDone={done} /> });
    }
  }
  // The rest of its panel, each a chip of its own, so the panel never has to come up over the map
  if (item.type === "tee") {
    const t = item as TeeItem;
    chips.push({ id: "surface", label: <>Surface <span className="opacity-60">{TEE_SURFACES[t.surface].label}</span></>, control: <ChipPick row label="Tee surface" value={t.surface} onChange={(v: TeeSurface) => set({ surface: v })} options={(Object.keys(TEE_SURFACES) as TeeSurface[]).map(k => ({ value: k, label: TEE_SURFACES[k].label, color: TEE_SURFACES[k].color }))} /> });
    if (t.aimFixed) chips.push({ id: "aim", label: <>Face down the hole</>, run: () => set({ aimFixed: false }) });
  }
  if (item.type === "area" && item.kind === "field" && hasParts(fieldKindOf(item))) {
    const parts = item as AreaItem;
    chips.splice(1, 0, { id: "parts", label: <>Parts</>, control: <div className="[&>div]:mb-0"><FieldParts item={parts} kind={fieldKindOf(parts)} /></div> });
  }
  if (item.type === "line" && (item.kind === "path" || item.kind === "walk")) {
    const l = item as LineItem;
    chips.push({ id: "surface", label: <>Surface <span className="opacity-60">{PATH_SURFACES[l.surface ?? "dirt"].label}</span></>, control: <SurfacePick value={l.surface} onChange={(v: PathSurface | undefined) => set({ surface: v })} /> });
  }
  if (item.type === "structure" && (item.kind === "building" || item.kind === "shelter")) chips.push({ id: "look", label: <>Look</>, control: <StructureLook item={item as StructureItem} /> });
  if ((item.type === "area" && item.kind !== "parking" && item.kind !== "building" && item.kind !== "field") || item.type === "line") {
    const a = item as AreaItem | LineItem;
    chips.push({ id: "curved", label: <>{a.straight ? "Straight" : "Curved"}</>, run: () => set({ straight: a.straight ? undefined : true }) });
  }
  if ((item.type === "area" || item.type === "line" || item.type === "structure") && !item.locked) chips.push({ id: "turnshape", label: <>Turn</>, control: <TurnButtons item={item} /> });
  if (item.type === "line" && !item.locked) chips.push({ id: "cut", label: <>Remove a stretch</>, run: () => useEditor.getState().set({ obPick: item.id, pickCut: true, tool: "select" }) });
  // (the holes it's for: belongs to, OB for, or counts for)
  const role = item.type === "mando" || item.type === "dropzone" || item.type === "structure" ? { label: "Belongs to", all: "Whole course" }
    : (item.type === "area" || item.type === "line") && item.kind === "ob" ? { label: "OB for", all: "All holes" }
    : item.type === "area" && (RULE_AREAS.has(item.kind) || (item.kind === "field" && item.outOfPlay)) ? { label: "Counts for", all: "All holes" } : null;
  if (role) {
    const shared = item.type === "area" || item.type === "line" || item.type === "structure";
    const own = "holeId" in item ? item.holeId : undefined;
    const mine = own ? [own, ...((shared && (item as AreaItem).alsoHoles) || [])] : [];
    chips.push({ id: "holes", label: <>{role.label} <span className="opacity-60">{mine.length ? `${mine.length} hole${mine.length > 1 ? "s" : ""}` : role.all.toLowerCase()}</span></>, control: (
      <HoleChips label={`${role.label} ${shared ? "holes" : "hole"}`} testid="belongs-to" picked={mine.length ? mine : "all"} single={!shared} all={role.all}
        onChange={v => { const ids = v === "all" ? [] : v; set(shared ? { holeId: ids[0], alsoHoles: ids.length > 1 ? ids.slice(1) : undefined } : { holeId: ids[0] }); }} />
    ) });
  }
  // (its name on the map; a label's words and color)
  if (item.type === "label") {
    const l = item as LabelItem;
    chips.unshift({ id: "text", label: <>Text</>, control: <TextInput label="Label text" testid="label-text" value={l.text} onChange={v => live({ text: v })} onDone={done} /> });
    chips.push({ id: "color", label: <>Color <span className="inline-block w-2.5 h-2.5 rounded-full align-middle ring-1 ring-black/40 ml-0.5" style={{ background: l.color }} /></>, control: <ColorInput label="Color" value={l.color} onChange={(v: string) => live({ color: v })} onDone={done} /> });
  }
  if (item.type === "area" || item.type === "line" || item.type === "structure" || item.type === "amenity") {
    const named = (item as { label?: string }).label;
    chips.push({ id: "name", label: <>Name <span className="opacity-60">{named || "none"}</span></>, control: <TextInput label={`${item.type === "area" ? "Area" : item.type === "line" ? "Line" : item.type === "structure" ? "Structure" : "Amenity"} name`} value={named ?? ""} placeholder="Name on the map (optional)" onChange={v => live({ label: v || undefined })} onDone={done} /> });
  }
  chips.push({ id: "all", label: <>All settings</>, control: allSettings });
  // (a chip that acts at once is never the one left open)
  const panes = chips.filter(c => !c.run);
  const [open, setOpen] = useState<string>(() => lastItemChip[item.type] ?? panes[0]?.id ?? "");
  // (a chip tapped, not just open as the thing is picked: only then does the camera move for it)
  const [tapped, setTapped] = useState(false);
  const pick = (c: string) => { lastItemChip[item.type] = c; setOpen(c); setTapped(true); };
  const chip = panes.find(c => c.id === open) ?? panes[0];
  // (a part of a field tapped on the map: its Parts open)
  const part = useEditor(e => e.fieldPart);
  useEffect(() => { if (part && panes.some(c => c.id === "parts")) setOpen("parts"); }, [part]);
  // (a height chip tapped in 3D: the camera looks at it from the side, and back after; not as the
  // thing is picked, when its first chip is a height: a tap on a tree mustn't swing the camera)
  const threeD = useEditor(e => e.view === "3d");
  const sideOn = threeD && tapped && (chip?.id === "height" || chip?.id === "raised");
  useEffect(() => {
    if (!sideOn) return;
    getView()?.lookAtHeight(item.id);
    return () => getView()?.lookAtHeight(null);
  }, [sideOn, item.id]);
  const placeable = item.type !== "area" && item.type !== "line" && item.type !== "structure";
  if (!chips.length && !placeable) return null;
  return (
    <div className="px-3 pb-3" data-testid="item-strip">
      <div className="flex gap-1.5 overflow-x-auto touch-pan-x dg-scroll -mx-3 px-3 pb-2" role="tablist" aria-label="Settings">
        {placeable && <MoveHere item={item} />}
        {chips.map(c => c.run
          ? <button key={c.id} className={chipCls(false)} onClick={c.run} data-testid={`strip-${c.id}`}>{c.label}</button>
          : <button key={c.id} role="tab" aria-selected={chip?.id === c.id} className={chipCls(chip?.id === c.id)} onClick={() => pick(c.id)} data-testid={`strip-${c.id}`}>{c.label}</button>)}
      </div>
      <div className={paneCls} data-testid="strip-pane">{chip?.control}</div>
    </div>
  );
}
