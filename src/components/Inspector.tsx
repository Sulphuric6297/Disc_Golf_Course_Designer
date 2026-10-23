// The panel for what is selected: a hole (par, fairway, notes, numbers, profile) or one item.
import { PlaceByGps } from "./PlaceByGps";
import { BRUSH_SECTION } from "../lib/view";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronLeft, Copy, Eye, Lock, Plane, RotateCcw, RotateCw, Trash2, Unlock, X, Plus } from "lucide-react";
import { AMENITY_KINDS, AREA_KINDS, LINE_KINDS, PATH_SURFACES, PIN_POSITIONS, STRUCTURE_KINDS, STRUCTURE_ORDER, TEE_LEVELS, TEE_ORDER, TEE_SURFACES } from "../constants";
import { areaPath, areaRing, byNumber, obFor, obSides, sideCompass, holeBaskets, holeLabel, holeNumber, holeTees, ITEM_LABELS, linePath, obPicked, parseHoleNumbers, wholeHoles, widthFactors, widthVaries } from "../lib/course";
import { pathLength, polygonArea } from "../lib/geom";
import { BUILDING_LOOKS, boxOutline, gazeboOutline, structureHeight, structureRoof, structureWidth, turnShape } from "../lib/structures";
import { STRUCTURE_INK } from "../lib/symbols";
import { courseStats, holeStats } from "../lib/holeStats";
import { fmtDist, fmtElev } from "../lib/units";
import { fairwayTrees } from "../lib/lidar";
import { conifersOf } from "../lib/landscapes";
import { addHoleOb, deleteSelection, duplicateSelection, markObBeyond, startAnotherPin, startAnotherTee, startHoleToBasket, select, setTeeLevel, shareBasket } from "../state/actions";
import { changeDoc, setHoleNumber, updateHole, updateItem, useCourse, useEditor } from "../state/course";
import type { AmenityKind, AreaItem, AreaKind, CourseDoc, CourseItem, Hole, LineItem, LineKind, P, PathSurface, RoofKind, StructureItem, StructureKind, TeeSurface, BrushKind } from "../types";
import { ElevationProfile } from "./ElevationProfile";
import { TreeSettings } from "./TreeSettings";
import { HoleFlight } from "./FlyoverSettings";
import { HoleSteps } from "./HoleSteps";
import { getView } from "../state/view";
import { Button, ChoiceList, ColorInput, Field, NumberInput, Section, Segmented, Slider, Facts, TextInput, Toggle } from "./ui";

const shapeText = { straight: "Straight", left: "Turns left", right: "Turns right", "s-curve": "S-curve" };
/** A small size to the half foot (or tenth of a meter): "2.5 ft". */
const fmtSize = (ft: number, units: "ft" | "m") => (units === "m" ? `${(ft / 3.28084).toFixed(1)} m` : `${Math.round(ft * 2) / 2} ft`);

/** A gentle curve for a hole: one turn halfway along, off to the left (-1) or right (1) by a
 * sixth of its length (its handle drags it on from there). */
const bendHole = (line: P[], side: 1 | -1): P[] => {
  const a = line[0], b = line[line.length - 1];
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const off = (len / 6) * side;
  return [{ x: (a.x + b.x) / 2 - ((b.y - a.y) / len) * off, y: (a.y + b.y) / 2 + ((b.x - a.x) / len) * off }];
};

/** A hole's number, typed in (kept on Enter or when the field is left; Esc puts it back). */
function HoleNumberInput({ holeId, value }: { holeId: string; value: string }) {
  const [text, setText] = useState(value);
  useEffect(() => { setText(value); }, [value]);
  // (more than one number: "3/12")
  const keep = () => {
    const [first, ...more] = parseHoleNumbers(text);
    if (first) setHoleNumber(holeId, first, more);
    else setText(value);
  };
  return (
    <label className="flex flex-col items-center gap-0.5 shrink-0">
      <span className="text-[10px] uppercase tracking-wider text-zinc-400">No.</span>
      <input
        aria-label="Hole number"
        data-testid="hole-number"
        inputMode="numeric"
        className="w-16 touch:w-20 h-8 touch:h-11 rounded-lg bg-white/[0.07] border border-white/[0.12] text-center text-sm touch:text-base font-bold text-zinc-50 focus:outline-none focus:ring-2 focus:ring-sky-400/80"
        value={text}
        onChange={e => setText(e.target.value.replace(/[^0-9/, &]/g, "").slice(0, 16))}
        onFocus={e => e.target.select()}
        onBlur={keep}
        onKeyDown={e => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          else if (e.key === "Escape") { setText(String(value)); (e.target as HTMLInputElement).blur(); }
          e.stopPropagation();
        }}
      />
    </label>
  );
}

/** The measured trees on a hole's fairway: how many are cut down and kept, and all of them back
 * or down at once. */
function FairwayTrees({ hole, line }: { hole: Hole; line: P[] }) {
  const lidar = useCourse(s => s.doc.lidar);
  const { cut, kept } = useMemo(() => fairwayTrees({ lidar }, hole, line), [lidar, hole, line]);
  if (!cut.length && !kept.length) return null;
  const setLidar = (patch: { kept?: number[]; removed?: number[] }) => changeDoc(d => (d.lidar ? { lidar: { ...d.lidar, ...patch } } : {}));
  const list = (v: number[]) => (v.length ? [...new Set(v)].sort((a, b) => a - b) : undefined);
  return (
    <Field label="Trees on the fairway">
      <div className="flex items-center justify-between gap-2" data-testid="fairway-trees">
        <span className="text-sm text-zinc-200">{[cut.length ? `${cut.length} cut down` : "", kept.length ? `${kept.length} kept` : ""].filter(Boolean).join(" · ")}</span>
        <div className="flex gap-1.5">
          {cut.length > 0 && <Button small onClick={() => setLidar({ kept: list([...(lidar?.kept ?? []), ...cut]), removed: list((lidar?.removed ?? []).filter(k => !cut.includes(k))) })} testid="trees-back">Bring all back</Button>}
          {kept.length > 0 && <Button small onClick={() => setLidar({ kept: list((lidar?.kept ?? []).filter(k => !kept.includes(k))) })} testid="trees-down">Cut all down</Button>}
        </div>
      </div>
    </Field>
  );
}

/** Every walk to the next tee this wide (holes' own widths let go). */
export const setAllWalks = (w: number, history = true) =>
  changeDoc(d => ({
    style: { ...d.style, walkWidth: w },
    holes: d.holes.some(h => h.walkWidth !== undefined) ? d.holes.map(h => (h.walkWidth === undefined ? h : { ...h, walkWidth: undefined })) : d.holes,
    // (walks drawn by hand too)
    items: d.items.some(i => i.type === "line" && i.kind === "walk") ? d.items.map(i => (i.type === "line" && i.kind === "walk" ? { ...i, width: w } : i)) : d.items
  }), history);

/** A hole's tees and baskets, a row each (its color or pin, how long the hole is from it): one
 * picked opens up in place with its own settings; another click on it closes it. */
function HoleParts({ hole, part }: { hole: Hole; part?: CourseItem }) {
  const doc = useCourse(s => s.doc);
  const u = doc.units;
  const tees = holeTees(doc, hole.id);
  const baskets = holeBaskets(doc, hole.id);
  const open = useRef<HTMLDivElement>(null);
  useEffect(() => { open.current?.scrollIntoView?.({ block: "nearest" }); }, [part?.id]);
  const row = (id: string, mark: JSX.Element, label: string, sub: string | null, item: CourseItem) => {
    const on = part?.id === id;
    return (
      <div key={id} ref={on ? open : undefined} className={`rounded-[12px] ${on ? "bg-white/[0.09] ring-1 ring-orange-400/50" : ""}`} data-testid="hole-part">
        <button className={`w-full flex items-center gap-2 rounded-[12px] px-2.5 py-1.5 touch:py-3 text-left ${on ? "" : "hover:bg-white/[0.07]"}`} onClick={() => select(on ? hole.id : id)} aria-expanded={on} title={on ? "Close it" : "Open its settings (and pick it on the map)"} data-testid={`hole-part-${item.type}`}>
          {mark}
          <span className="flex-1 min-w-0 text-[13px] text-zinc-100 truncate">{label}</span>
          {sub && <span className="text-[12px] text-zinc-400 tabular-nums">{sub}</span>}
          <ChevronDown size={15} className={`text-zinc-500 transition-transform ${on ? "rotate-180" : ""}`} />
        </button>
        {on && (
          <div className="px-2.5 pb-1" data-testid="hole-part-settings">
            <ItemInspector item={item} bare />
            {"x" in item && <PlaceByGps item={item as never} inline />}
          </div>
        )}
      </div>
    );
  };
  return (
    <Section title="Tees and baskets" testid="hole-parts">
      <div className="flex flex-col gap-0.5" data-testid="hole-tees">
        {tees.map(t => row(t.id, <span className="w-3 h-3 rounded-full ring-1 ring-black/40 shrink-0" style={{ background: TEE_LEVELS[t.level].color }} />, `${TEE_LEVELS[t.level].label} tee`, fmtDist(holeStats(doc, hole, { id: "x", name: "", tee: t.level, pin: "A" }).length, u), t))}
        {baskets.map(b => row(b.id, <span className="w-3 h-3 rounded-full border-2 shrink-0" style={{ borderColor: doc.style.basket }} />, baskets.length > 1 || b.position !== "A" ? `Basket, pin ${b.position}` : "Basket", b.holeId !== hole.id ? `hole ${holeLabel(doc, b.holeId ?? "")}'s` : null, b))}
        {!tees.length && !baskets.length && <p className="text-[12px] text-zinc-400 px-1">None yet.</p>}
      </div>
    </Section>
  );
}

function HoleInspector({ hole, part }: { hole: Hole; part?: CourseItem }) {
  const doc = useCourse(s => s.doc);
  const s = useMemo(() => holeStats(doc, hole), [doc, hole]);
  const label = holeLabel(doc, hole.id);
  const u = doc.units;
  const tees = holeTees(doc, hole.id);
  const baskets = holeBaskets(doc, hole.id);
  // The hole whose basket this one plays to, when it shares one
  const sharing = baskets.find(b => b.holeId !== hole.id)?.holeId ?? null;
  const set = (patch: Partial<Hole>) => updateHole(hole.id, patch);
  return (
    <>
      <Section>
        <div className="flex items-center gap-2 mb-2" data-insp-title>
          <div className={`min-w-10 h-10 px-1.5 rounded-full bg-orange-500 text-zinc-950 flex items-center justify-center ${label.length > 3 ? "text-sm" : "text-lg"} font-bold`} style={{ fontFamily: "Oswald, Inter" }}>{label}</div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold text-zinc-50 truncate" data-testid="inspector-title">Hole {label}{hole.name ? ` · ${hole.name}` : ""}</div>
            <div className="text-xs text-zinc-400">{s.complete ? `${fmtDist(s.length, u)} · Par ${s.par} · ${shapeText[s.shape]}` : s.teeId ? "Needs a basket" : "Needs a tee"}</div>
          </div>
          <HoleNumberInput holeId={hole.id} value={label} />
        </div>
        {(() => { const mine = label.split("/"); const clash = doc.holes.filter(h => h.id !== hole.id).flatMap(h => holeLabel(doc, h.id).split("/")).find(v => mine.includes(v)); return clash ? <div className="text-xs text-amber-300 -mt-1 mb-2" data-testid="hole-number-taken">Another hole is also Hole {clash}</div> : null; })()}
        {s.complete && (
          <Facts testid="hole-stats" items={[["Length", fmtDist(s.length, u)], [s.elevationChange > 0 ? "Uphill" : s.elevationChange < 0 ? "Downhill" : "Elevation", fmtElev(s.elevationChange, u)], ["Plays like", `${fmtDist(s.playsLike, u)}${s.foliage === "heavy" ? " (heavy foliage)" : ""}`]]} />
        )}
        {s.complete && (
          <div className="flex gap-1.5 mt-2">
            <Button small onClick={() => useEditor.getState().set({ teeView: hole.id, flyover: false })} testid="tee-view"><Eye size={14} /> View from tee</Button>
            <Button small onClick={() => useEditor.getState().set({ teeView: hole.id, flyover: true })} testid="flyover"><Plane size={14} /> Fly over</Button>
          </div>
        )}
        {s.complete && (
          <div className="mt-3">
            <div className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wide mb-1">Add OB</div>
            <div className="flex gap-1.5" role="group" aria-label="Add OB">
              <Button small onClick={() => addHoleOb(hole.id, "left")} testid="ob-left">Left side</Button>
              <Button small onClick={() => addHoleOb(hole.id, "right")} testid="ob-right">Right side</Button>
              <Button small onClick={() => addHoleOb(hole.id, "long")} testid="ob-long">Behind basket</Button>
            </div>
          </div>
        )}
      </Section>
      <HoleParts hole={hole} part={part} />
      <Section title="How it's played" help="tees-pins" testid="how-played">
        {(() => {
          // (the layout worked on, on a hole with no tee of its color: played from the nearest)
          const layout = doc.layouts.length > 1 ? doc.layouts.find(l => l.id === doc.activeLayout) : undefined;
          if (!layout || !tees.length || tees.some(t => t.level === layout.tee)) return null;
          const lvl = TEE_LEVELS[layout.tee];
          return (
            <div className="flex items-center gap-2 mb-2 text-[11px] text-zinc-300 leading-snug" data-testid="layout-missing-tee">
              <span className="flex-1">No {lvl.label.toLowerCase()} tee yet: the {layout.name} layout plays this hole from the {TEE_LEVELS[tees.find(t => t.id === s.teeId)?.level ?? tees[0].level].label.toLowerCase()} one.</span>
              <Button small onClick={() => useEditor.getState().set({ tool: "add-tee", teeLevel: layout.tee, activeHoleId: hole.id })}>Add one</Button>
            </div>
          );
        })()}
        {(() => {
          // (which holes finish at its basket)
          const others = doc.holes.filter(h => h.id !== hole.id && holeBaskets(doc, h.id).some(b => baskets.some(x => x.id === b.id)));
          return others.length > 0 && <div className="text-[11.5px] text-zinc-400 mb-2" data-testid="shared-with">Its basket is shared with hole{others.length === 1 ? "" : "s"} {others.map(h => holeLabel(doc, h.id)).join(", ")}.</div>;
        })()}
        <div className="flex flex-col gap-1.5" data-testid="hole-grow">
          <button className="flex items-start gap-2.5 text-left rounded-[12px] bg-white/[0.06] hover:bg-white/[0.11] px-2.5 py-2" onClick={() => startAnotherTee(hole.id)} data-testid="another-tee">
            <span className="mt-0.5 w-4 h-2.5 rounded-sm shrink-0" style={{ background: TEE_LEVELS[TEE_ORDER.find(l => !tees.some(t => t.level === l)) ?? "red"].color }} />
            <span><span className="block text-[13px] font-semibold text-zinc-100">Another tee for this hole</span><span className="block text-[11.5px] text-zinc-400">Shorter or longer, for another skill level. Same hole number.</span></span>
          </button>
          {s.complete && (
            <button className="flex items-start gap-2.5 text-left rounded-[12px] bg-white/[0.06] hover:bg-white/[0.11] px-2.5 py-2" onClick={() => startHoleToBasket(hole.id)} data-testid="hole-to-basket">
              <Plus size={16} className="mt-0.5 shrink-0 text-orange-300" />
              <span><span className="block text-[13px] font-semibold text-zinc-100">New hole to this basket</span><span className="block text-[11.5px] text-zinc-400">A separate hole, with its own number, that finishes at this basket.</span></span>
            </button>
          )}
          <button className="flex items-start gap-2.5 text-left rounded-[12px] bg-white/[0.06] hover:bg-white/[0.11] px-2.5 py-2" onClick={() => startAnotherPin(hole.id)} data-testid="another-pin">
            <span className="mt-0.5 w-3.5 h-3.5 rounded-full border-2 shrink-0" style={{ borderColor: doc.style.basket }} />
            <span><span className="block text-[13px] font-semibold text-zinc-100">Another pin position</span><span className="block text-[11.5px] text-zinc-400">The same hole to a different basket spot (pin B, C…).</span></span>
          </button>
        </div>
        {doc.holes.length > 1 && (
          <details className="mt-2" open={!!sharing || undefined}><summary className="cursor-pointer text-[11.5px] text-zinc-400 hover:text-zinc-200">Play to another hole's basket instead</summary>
            <select aria-label="Basket" data-testid="share-basket" className="mt-1.5 w-full bg-white/[0.07] rounded-lg px-2 py-1.5 text-sm" value={sharing ?? ""} onChange={e => shareBasket(hole.id, e.target.value || null)}>
              <option value="">Its own basket</option>
              {doc.holes.filter(h => h.id !== hole.id && holeBaskets(doc, h.id).some(b => b.holeId === h.id)).map(h => <option key={h.id} value={h.id}>Hole {holeLabel(doc, h.id)}'s basket</option>)}
            </select>
          </details>
        )}
      </Section>
      {s.complete && (
        <Section title="Elevation profile">
          <ElevationProfile doc={doc} line={s.line} />
          <div className="text-[11px] text-zinc-400 mt-1">
            Tee {fmtDist(s.teeElevation, u)} · basket {fmtDist(s.basketElevation, u)} · steepest {Math.round(s.maxSlope)}%
          </div>
        </Section>
      )}
      <Section title="Par and play" help="par">
        <Field label="Par">
          <Segmented
            label="Par"
            value={hole.par ?? 0}
            onChange={v => set({ par: v === 0 ? undefined : v })}
            options={[{ value: 0, label: `Auto (${s.parAuto})` }, ...[2, 3, 4, 5, 6].map(p => ({ value: p, label: String(p) }))]}
          />
        </Field>
        <Field label="Foliage" hint="Heavy foliage makes it play longer: its plays-like length and par.">
          <Segmented label="Foliage" value={hole.foliage ?? "auto"} onChange={v => set({ foliage: v === "auto" ? undefined : (v as "light" | "heavy") })} options={[{ value: "auto", label: `Auto (${s.foliage})` }, { value: "light", label: "Light" }, { value: "heavy", label: "Heavy" }]} />
        </Field>
        <Toggle label="Draw the fairway" checked={hole.fairway} onChange={v => set({ fairway: v })} />
        {hole.fairway && (
          <>
            <Slider label={hole.fairwayShape ? "Fairway width (all along)" : "Fairway width"} min={10} max={150} value={hole.fairwayWidth} onChange={v => set({ fairwayWidth: v })} format={v => fmtDist(v, u)} />
            <div className="flex items-center justify-between gap-2 -mt-1 mb-2" data-testid="fairway-shape">
              <p className="text-[11px] text-zinc-400 leading-snug">
                {hole.fairwayShape
                  ? `Shaped: ${hole.fairwayShape.map(f => fmtDist(f * hole.fairwayWidth, u)).join(" · ")}`
                  : hole.fairwayShift ? "Shaped" : "The same width all along. Drag the squares on its edges to shape it."}
              </p>
              {(hole.fairwayShape || hole.fairwayShift) && <button className="shrink-0 text-xs text-orange-300 hover:text-orange-200" onClick={() => set({ fairwayShape: undefined, fairwayShift: undefined, fairwayStations: undefined })}>Make it even</button>}
            </div>
          </>
        )}
        {doc.lidar && s.complete && <FairwayTrees hole={hole} line={s.line} />}
        <Field label="Name (optional)"><TextInput label="Hole name" value={hole.name ?? ""} placeholder="e.g. The Gauntlet" onChange={v => set({ name: v || undefined })} /></Field>
        <Field label="Notes and hole rules"><TextInput area label="Hole notes" value={hole.notes ?? ""} placeholder="e.g. OB left of the path. Mando right of the big oak; drop zone by the bench." onChange={v => set({ notes: v || undefined })} /></Field>
        {s.complete && (
          <div className="flex flex-wrap gap-1.5">
            <Button small tone="primary" onClick={() => useEditor.getState().set({ plotLine: hole.id, tool: "select" })} testid="plot-line">Plot the line</Button>
            <Button small onClick={() => set({ doglegs: bendHole(s.line, -1) })} testid="bend-left">Bend left</Button>
            <Button small onClick={() => set({ doglegs: bendHole(s.line, 1) })} testid="bend-right">Bend right</Button>
            {hole.doglegs.length > 0 && <Button small onClick={() => set({ doglegs: [] })}>Straighten</Button>}
          </div>
        )}
      </Section>
      {s.complete && (
        <Section title="In play">
          <ul className="text-xs text-zinc-300 space-y-1" data-testid="hole-in-play">
            <li>{s.treesOnLine ? `${s.treesOnLine} tree${s.treesOnLine === 1 ? "" : "s"} on the throw line` : "Clear throw line"} · {s.treesInFairway} in the fairway</li>
            <li>{s.obInPlay ? `OB in play${s.obCrossed ? ` (crosses ${s.obCrossed})` : ""}` : "No OB in play"}{s.obNearBasket ? " · OB within 10 m of the basket" : ""}</li>
            <li>Difficulty {"●".repeat(s.difficulty)}{"○".repeat(5 - s.difficulty)}</li>
          </ul>
        </Section>
      )}
      {s.complete && (
        <Section title="Flyover" help="flyover">
          <HoleFlight hole={hole} />
        </Section>
      )}
    </>
  );
}

/** What a path or a walk is made of. */
function SurfacePick({ value, onChange }: { value?: PathSurface; onChange: (v: PathSurface | undefined) => void }) {
  return (
    <Field label="Surface">
      <select aria-label="Surface" data-testid="path-surface" className="w-full bg-white/[0.07] rounded-lg px-2 py-1.5 text-sm" value={value ?? "dirt"} onChange={e => onChange(e.target.value === "dirt" ? undefined : (e.target.value as PathSurface))}>
        {(Object.keys(PATH_SURFACES) as PathSurface[]).map(k => <option key={k} value={k}>{PATH_SURFACES[k].label}</option>)}
      </select>
    </Field>
  );
}

/** A hole's chip in a pick of holes. */
const holeChip = (on: boolean) => `px-2 py-1 touch:py-2 rounded-md text-xs font-semibold border ${on ? "bg-orange-500/20 border-orange-400 text-orange-100" : "border-white/[0.12] text-zinc-300 hover:border-zinc-500"}`;

/** Whether water, a creek, a road, a fence or a path is out of bounds (and shown so on the map);
 * a line OB beyond it too, and along all of it or stretches of it. */
/** A woods area's trees in 3D: measured from the air, drawn, or none (with measured trees only). */
const BRUSH_LEVELS = [{ value: "none", label: "None" }, { value: "light", label: "Light" }, { value: "medium", label: "Medium" }, { value: "heavy", label: "Heavy" }] as const;
type BrushLevel = (typeof BRUSH_LEVELS)[number]["value"];

const BRUSH_KINDS: { value: BrushKind; label: string }[] = [{ value: "mixed", label: "A mix" }, { value: "thicket", label: "Thicket" }, { value: "briars", label: "Briars & thorns" }, { value: "weeds", label: "Weeds" }];
const kindSelect = "bg-white/[0.07] rounded-lg px-2 py-1.5 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-sky-400/80";

/** A wood's underbrush: its own level and kind, and sections drawn inside it with their own. */
function WoodsBrush({ item }: { item: AreaItem }) {
  const drawing = useEditor(e => e.patchFor === item.id && e.patchBrush);
  const sections = item.brush ?? [];
  const setSections = (next: { points: P[]; level: BrushLevel; kind?: BrushKind }[]) => updateItem(item.id, { brush: next.length ? next : undefined } as Partial<CourseItem>);
  const draw = () => useEditor.getState().set({ tool: "draw-area", areaKind: "woods", drawShape: "freehand", patchFor: item.id, patchBrush: true });
  const kind = item.brushKind ?? "mixed";
  return (
    <div className="mb-3" data-testid="woods-brush">
      <Field label={sections.length ? "Underbrush (the rest of the wood)" : "Underbrush"} help="woods" hint="Bushes, thickets, briars and weeds under the trees. It stays off fairways and paths.">
        <Segmented label="Underbrush" value={item.underbrush ?? "none"} onChange={v => updateItem(item.id, { underbrush: v === "none" ? undefined : v } as Partial<CourseItem>)} options={[...BRUSH_LEVELS]} />
      </Field>
      {(item.underbrush || sections.length > 0) && (
        <label className="flex items-center gap-2 mb-3 text-xs text-zinc-400">
          <span className="w-16 shrink-0">What grows</span>
          <select aria-label="What the underbrush is" data-testid="brush-kind" className={`${kindSelect} flex-1 min-w-0`} value={kind} onChange={e => updateItem(item.id, { brushKind: e.target.value === "mixed" ? undefined : e.target.value } as Partial<CourseItem>)}>
            {BRUSH_KINDS.map(k => <option key={k.value} value={k.value}>{k.label}</option>)}
          </select>
        </label>
      )}
      {sections.length > 0 && <div className="text-[11px] text-zinc-500 mb-1.5"><span className="inline-block w-3 border-t-2 border-dashed align-middle mr-1.5" style={{ borderColor: BRUSH_SECTION }} />Sections, outlined on the map: each its own underbrush (where they overlap, the later one's).</div>}
      {sections.map((b, k) => (
        <div key={k} className="rounded-lg bg-white/[0.07] p-2 mb-1.5" data-testid="brush-section">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-semibold text-zinc-300">Section {k + 1}</span>
            <button className="p-1 rounded text-zinc-500 hover:text-red-300 hover:bg-white/[0.09]" aria-label={`Remove section ${k + 1}`} title="Remove" onClick={() => setSections(sections.filter((_, m) => m !== k))}><Trash2 size={13} /></button>
          </div>
          <Segmented label={`Section ${k + 1} underbrush`} value={b.level} onChange={v => setSections(sections.map((q, m) => (m === k ? { ...q, level: v } : q)))} options={[...BRUSH_LEVELS]} />
          {b.level !== "none" && (
            <select aria-label={`Section ${k + 1}: what grows`} className={`${kindSelect} w-full mt-1.5`} value={b.kind ?? ""} onChange={e => setSections(sections.map((q, m) => (m === k ? { ...q, kind: (e.target.value || undefined) as BrushKind | undefined } : q)))}>
              <option value="">As the rest ({BRUSH_KINDS.find(x => x.value === kind)!.label.toLowerCase()})</option>
              {BRUSH_KINDS.map(x => <option key={x.value} value={x.value}>{x.label}</option>)}
            </select>
          )}
        </div>
      ))}
      {drawing
        ? <div className="text-xs text-orange-300">Draw around the part of the wood with the mouse held down (a finger on a phone); let go to finish. Esc cancels.</div>
        : <Button small onClick={draw} testid="brush-draw-section" title="Draw around part of this wood to give it its own underbrush"><Plus size={13} /> Draw a section with its own underbrush</Button>}
      {(item.underbrush || sections.some(b => b.level !== "none")) && (
        <div className="mt-2">
          <Slider label="Thicker at the edges" min={0} max={100} step={5} value={Math.round((item.brushEdge ?? 0.6) * 100)}
            onChange={v => updateItem(item.id, { brushEdge: v / 100 } as Partial<CourseItem>, false)} onDone={() => useCourse.getState().commit()}
            format={v => (v === 0 ? "Even everywhere" : `${100 - v}% as much deep inside`)} />
        </div>
      )}
    </div>
  );
}

/** How a wood the app plants fills itself: its mix of pines and bushes, how thick, how tall. */
function WoodsMix({ item }: { item: AreaItem }) {
  const style = useCourse(s => s.doc.style);
  const u = useCourse(s => s.doc.units);
  const set = (patch: Partial<AreaItem>, history = false) => updateItem(item.id, patch as Partial<CourseItem>, history);
  const done = () => useCourse.getState().commit();
  const [lo, hi] = item.heights ?? [38, 72];
  const own = item.pines !== undefined || item.bushes !== undefined || item.density !== undefined || item.heights !== undefined;
  return (
    <div className="mb-3" data-testid="woods-mix">
      <div className="text-xs text-zinc-400 mb-1">The trees it grows</div>
      <Slider label="Pines" min={0} max={100} step={5} value={Math.round((item.pines ?? conifersOf(style)) * 100)} onChange={v => set({ pines: v / 100 })} onDone={done} format={v => `${v}%`} />
      <Slider label="Bushes" min={0} max={80} step={5} value={Math.round((item.bushes ?? 0) * 100)} onChange={v => set({ bushes: v ? v / 100 : undefined })} onDone={done} format={v => (v ? `${v}%` : "None")} />
      <Slider label="Density" min={20} max={250} step={10} value={Math.round((item.density ?? 1) * 100)} onChange={v => set({ density: v / 100 })} onDone={done} format={v => (v === 100 ? "Usual" : v < 100 ? `Sparser (${v}%)` : `Denser (${v}%)`)} />
      <Slider label="Shortest trees" min={8} max={100} value={Math.round(lo)} onChange={v => set({ heights: [Math.min(v, hi - 2), hi] })} onDone={done} format={v => fmtDist(v, u)} />
      <Slider label="Tallest trees" min={12} max={130} value={Math.round(hi)} onChange={v => set({ heights: [lo, Math.max(v, lo + 2)] })} onDone={done} format={v => fmtDist(v, u)} />
      {own && <Button small tone="ghost" onClick={() => set({ pines: undefined, bushes: undefined, density: undefined, heights: undefined }, true)} testid="woods-usual" title="The landscape's own mix again"><RotateCcw size={13} /> Reset</Button>}
      <div className="text-[11px] text-zinc-500 mt-1">Any of its trees: click it to change just that one.</div>
    </div>
  );
}

function WoodsTrees({ item }: { item: AreaItem }) {
  const measured = useCourse(s => !!s.doc.lidar?.trees.length);
  const drawing = useEditor(e => e.patchFor === item.id);
  // (a course without measured trees: the wood grows its own, set here)
  if (!measured) return <WoodsMix item={item} />;
  const mode = item.trees ?? "measured";
  const patches = item.patches ?? [];
  const setPatches = (next: { points: P[]; fill: number }[], history = true) => updateItem(item.id, { patches: next.length ? next : undefined } as Partial<CourseItem>, history);
  // A patch: drawn over the wood with the Area tool; it lands in this wood's patches
  const draw = () => useEditor.getState().set({ tool: "draw-area", areaKind: "woods", drawShape: "freehand", patchFor: item.id });
  return (
    <>
      <Field label="Trees in these woods" help="woods">
        <ChoiceList label="Trees in these woods" testid="woods-trees" value={mode} onChange={v => updateItem(item.id, { trees: v === "measured" ? undefined : v } as Partial<CourseItem>)}
          options={[
            { value: "measured", label: "Real trees", hint: "The trees the aerial survey (LiDAR) found here, at their real size and spot. Trees in a fairway are cut down." },
            { value: "custom", label: "Real trees plus fill-in", hint: "The real trees, plus trees the app plants in patches you draw. Use it where the survey missed trees or new ones have grown." },
            { value: "drawn", label: "Planted by the app", hint: "Ignores the survey here. The app plants its own trees, using the mix below." },
            { value: "none", label: "No trees", hint: "Clears every tree in these woods, even ones the survey found." }
          ]} />
      </Field>
      {(mode === "drawn" || mode === "custom") && <WoodsMix item={item} />}
      {mode === "custom" && (
        <div className="mb-3" data-testid="woods-patches">
          {patches.map((p, k) => (
            <div key={k} className="flex items-center gap-2 mb-1" data-testid="woods-patch">
              <span className="text-xs text-zinc-300 w-14 shrink-0">Patch {k + 1}</span>
              <input type="range" aria-label={`Patch ${k + 1} density`} min={0.1} max={1} step={0.1} value={p.fill} className="flex-1 accent-orange-500"
                onChange={e => setPatches(patches.map((q, m) => (m === k ? { ...q, fill: parseFloat(e.target.value) } : q)), false)} onPointerUp={() => useCourse.getState().commit()} onKeyUp={() => useCourse.getState().commit()} />
              <span className="text-xs text-zinc-400 tabular-nums w-9 text-right">{Math.round(p.fill * 100)}%</span>
              <button className="p-1 rounded text-zinc-500 hover:text-red-300 hover:bg-white/[0.09]" aria-label={`Remove patch ${k + 1}`} title="Remove" onClick={() => setPatches(patches.filter((_, m) => m !== k))}><Trash2 size={13} /></button>
            </div>
          ))}
          {!patches.length && <div className="text-[11px] text-zinc-500 mb-1">No patches yet.</div>}
          {drawing
            ? <div className="text-xs text-orange-300">Draw the patch over the wood with the mouse held down; let go to finish (Esc cancels).</div>
            : <Button small onClick={draw} testid="woods-draw-patch">Draw a patch</Button>}
          <div className="text-[11px] text-zinc-500 mt-1">Drawn trees fill each patch in between the measured ones; its slider sets how many. The rest of the wood stays as it is.</div>
        </div>
      )}
    </>
  );
}

function ObChoice({ item }: { item: AreaItem | LineItem }) {
  const doc = useCourse(s => s.doc);
  const units = doc.units;
  const wet = item.kind === "water" || item.kind === "stream";
  const line = item.type === "line" ? item : null;
  const value = item.ob === true ? (line?.obBeyond ? "beyond" : "edge") : item.ob === false || !wet ? "no" : "yes";
  const options = [{ value: "no", label: "Not OB" }, ...(wet ? [{ value: "yes", label: "OB (no line)" }] : []), { value: "edge", label: "OB, red edge" }, ...(line ? [{ value: "beyond", label: "OB and beyond" }] : [])];
  const pick = (v: string) => {
    if (line && v === "beyond") return markObBeyond(item.id);
    updateItem(item.id, {
      ob: v === "edge" ? true : v === "no" ? (wet ? false : undefined) : undefined,
      ...(line ? { obBeyond: undefined, obToward: undefined, ...(v === "edge" ? {} : { obStretches: undefined, obHoles: undefined }) } : v === "edge" ? {} : { obStretches: undefined })
    } as Partial<CourseItem>);
  };
  // (a line along its length, an area round its edge)
  const len = line ? pathLength(linePath(line)) : item.type === "area" ? pathLength(areaRing(item)) : 0;
  const stretches = item.obStretches;
  const markStretch = () => useEditor.getState().set({ obPick: item.id, pickCut: false, tool: "select" });
  // The holes it is OB for (none picked: all of them)
  const picked = line ? obPicked(doc, line) : [];
  const setObHoles = (ids: string[]) => updateItem(item.id, { obHoles: ids.length ? ids : undefined } as Partial<CourseItem>);
  return (
    <>
      <Field label="Out of bounds" help="ob">
        <Segmented label="Out of bounds" value={value} onChange={pick} options={options} />
      </Field>
      {line?.obBeyond && item.ob === true && (() => {
        // Which side is out: the app's guess (away from the holes beside it), or either side
        const drawn = linePath(line);
        const lines = courseStats(doc).filter(st => st.complete && obFor(doc, line, st.holeId)).map(st => st.line);
        const guess = obSides(drawn, lines, 300, true)[0] === 1 ? -1 : 1;
        const name = (s: 1 | -1) => `${sideCompass(drawn, s)[0].toUpperCase()}${sideCompass(drawn, s).slice(1)} side`;
        return (
          <Field label="Out of bounds to the">
            <Segmented label="OB side" value={line.obToward ?? 0} onChange={v => updateItem(item.id, { obToward: v === 0 ? undefined : v } as Partial<CourseItem>)}
              options={[{ value: 0, label: `Auto (${sideCompass(drawn, guess)})` }, { value: 1, label: name(1) }, { value: -1, label: name(-1) }]} />
          </Field>
        );
      })()}
      {item.ob === true && (
        <Field label={line ? "OB along" : "OB along its edge"}>
          <div className="flex flex-col gap-1.5" data-testid="ob-stretches">
            {stretches?.length ? stretches.map(([a, b], k) => (
              <div key={k} className="flex items-center gap-2 text-sm text-zinc-200" data-testid="ob-stretch">
                <span className="flex-1 tabular-nums">{fmtDist(Math.min(a, b) * len, units, false)} to {fmtDist(Math.max(a, b) * len, units)}</span>
                <button className="p-1 rounded hover:bg-white/[0.09] text-zinc-400" aria-label={`Remove stretch ${k + 1}`} onClick={() => {
                  const rest = stretches.filter((_, j) => j !== k);
                  updateItem(item.id, (rest.length ? { obStretches: rest } : { obStretches: undefined, ob: undefined }) as Partial<CourseItem>);
                }}><X size={14} /></button>
              </div>
            )) : <span className="text-sm text-zinc-200">{line ? "All of it" : "All the way round"}</span>}
            <div className="flex gap-1.5">
              <Button small onClick={markStretch} testid="ob-mark-stretch">{stretches?.length ? "Add a stretch" : "Only a stretch"}</Button>
              {!!stretches?.length && <Button small onClick={() => updateItem(item.id, { obStretches: undefined } as Partial<CourseItem>)} testid="ob-all">{line ? "All of it" : "All the way round"}</Button>}
            </div>
          </div>
        </Field>
      )}
      {line && item.ob === true && (
        <Field label="OB for">
          <div className="flex flex-wrap gap-1" role="group" aria-label="OB for holes" data-testid="ob-for">
            <button className={holeChip(!picked.length)} aria-pressed={!picked.length} onClick={() => setObHoles([])}>All holes</button>
            {byNumber(doc.holes).map(h => {
              const on = picked.includes(h.id);
              return <button key={h.id} className={holeChip(on)} aria-pressed={on} aria-label={`Hole ${holeLabel(doc, h.id)}`} onClick={() => setObHoles(on ? picked.filter(x => x !== h.id) : [...picked, h.id])}>{holeLabel(doc, h.id)}</button>;
            })}
          </div>
        </Field>
      )}
    </>
  );
}

/** Turn buttons for a drawn shape (about its middle). */
function TurnShape({ item }: { item: AreaItem | LineItem | StructureItem }) {
  if (item.locked || item.points.length < 2) return null;
  const turn = (deg: number) => updateItem(item.id, turnShape(item.points, item, (deg * Math.PI) / 180) as Partial<CourseItem>);
  const b = "flex-1 h-8 touch:h-11 rounded-lg border border-white/[0.12] hover:border-zinc-500 text-xs font-semibold text-zinc-200 flex items-center justify-center gap-1";
  return (
    <Field label="Turn">
      <div className="flex gap-1.5" data-testid="turn-shape">
        <button className={b} aria-label="Turn left 15°" onClick={() => turn(-15)}><RotateCcw size={13} /> 15°</button>
        <button className={b} aria-label="Turn right 15°" onClick={() => turn(15)}><RotateCw size={13} /> 15°</button>
        <button className={b} aria-label="Turn right 90°" onClick={() => turn(90)}><RotateCw size={13} /> 90°</button>
      </div>
    </Field>
  );
}

/** A thing's settings (`bare`: only them, with no title: a tee or basket in its hole's panel). */
function ItemInspector({ item, bare = false }: { item: CourseItem; bare?: boolean }) {
  const doc = useCourse(s => s.doc);
  const u = doc.units;
  const set = (patch: Record<string, unknown>, history = true) => updateItem(item.id, patch as Partial<CourseItem>, history);
  const holeOptions = [{ value: "", label: "Whole course" }, ...doc.holes.map(h => ({ value: h.id, label: `Hole ${holeLabel(doc, h.id)}` }))];
  // (shapes and built things can belong to several holes: an OB line along two fairways)
  const shared = item.type === "area" || item.type === "line" || item.type === "structure";
  const mine = "holeId" in item && item.holeId ? [item.holeId, ...((shared && item.alsoHoles) || [])] : [];
  const setHoles = (ids: string[]) => set({ holeId: ids[0], alsoHoles: ids.length > 1 ? ids.slice(1) : undefined });
  const chip = holeChip;
  const holePicker = shared ? (
    <Field label="Belongs to">
      <div className="flex flex-wrap gap-1" role="group" aria-label="Belongs to holes" data-testid="belongs-to">
        <button className={chip(!mine.length)} aria-pressed={!mine.length} onClick={() => setHoles([])}>Whole course</button>
        {byNumber(doc.holes).map(h => {
          const on = mine.includes(h.id);
          return <button key={h.id} className={chip(on)} aria-pressed={on} aria-label={`Hole ${holeLabel(doc, h.id)}`} onClick={() => setHoles(on ? mine.filter(x => x !== h.id) : [...mine, h.id])}>{holeLabel(doc, h.id)}</button>;
        })}
      </div>
    </Field>
  ) : (
    <Field label="Belongs to">
      <select aria-label="Belongs to hole" className="w-full bg-white/[0.07] rounded-lg px-2 py-1.5 text-sm" value={("holeId" in item && item.holeId) || ""} onChange={e => set({ holeId: e.target.value || undefined })}>
        {holeOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </Field>
  );
  let body: JSX.Element | null = null;
  // A length typed in the course's units (kept in feet)
  const M = 3.28084;
  const lenIn = (label: string, ft: number, min: number, max: number, onFt: (v: number) => void) => u === "m"
    ? <NumberInput label={label} value={Math.round((ft / M) * 10) / 10} min={Math.round((min / M) * 10) / 10} max={Math.round((max / M) * 10) / 10} step={0.1} unit="m" onChange={v => onFt(Math.round(v * M * 10) / 10)} />
    : <NumberInput label={label} value={ft} min={min} max={max} step={0.5} unit="ft" onChange={onFt} />;
  switch (item.type) {
    case "tee":
      body = (
        <>
          {holeStats(doc, doc.holes.find(h => h.id === item.holeId) ?? doc.holes[0]).complete && doc.holes.some(h => h.id === item.holeId) && (
            <div className="mb-3"><Button small onClick={() => useEditor.getState().set({ teeView: item.holeId, teeViewTee: item.id, flyover: false })} testid="tee-view-this"><Eye size={14} /> View from this tee</Button></div>
          )}
          <Field label="Tee color (skill level)">
            <Segmented label="Tee color" value={item.level} onChange={v => setTeeLevel(item.id, v)} options={TEE_ORDER.map(l => ({ value: l, label: TEE_LEVELS[l].label, title: `${TEE_LEVELS[l].skill} (${TEE_LEVELS[l].rating})` }))} />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Pad width">{lenIn("Pad width", item.padWidth, 2, 20, v => set({ padWidth: v }))}</Field>
            <Field label="Pad length">{lenIn("Pad length", item.padLength, 4, 30, v => set({ padLength: v }))}</Field>
          </div>
          <Field label="Surface">
            <select aria-label="Tee surface" className="w-full bg-white/[0.07] rounded-lg px-2 py-1.5 text-sm" value={item.surface} onChange={e => set({ surface: e.target.value as TeeSurface })}>
              {(Object.keys(TEE_SURFACES) as TeeSurface[]).map(k => <option key={k} value={k}>{TEE_SURFACES[k].label}</option>)}
            </select>
          </Field>
          {item.aimFixed && <Button small onClick={() => set({ aimFixed: false })}>Face down the hole again</Button>}
        </>
      );
      break;
    case "basket":
      body = (
        <>
          <Field label="Pin position">
            <Segmented label="Pin position" value={item.position} onChange={v => set({ position: v })} options={PIN_POSITIONS.map(p => ({ value: p, label: p }))} />
          </Field>
          <Field label="Raised above the ground">
            {lenIn("Raised", item.raised ?? 0, 0, 30, v => set({ raised: v || undefined }))}
          </Field>
        </>
      );
      break;
    case "mando":
      body = (
        <>
          <Field label="The disc must pass">
            <Segmented label="Mando side" value={item.side} onChange={v => set({ side: v })} options={[{ value: "left", label: "Left of it" }, { value: "right", label: "Right of it" }]} />
          </Field>
          {holePicker}
        </>
      );
      break;
    case "dropzone":
      body = holePicker;
      break;
    case "area":
      body = (
        <>
          <Field label="Kind">
            <select aria-label="Area kind" className="w-full bg-white/[0.07] rounded-lg px-2 py-1.5 text-sm" value={item.kind} onChange={e => set({ kind: e.target.value as AreaKind })}>
              {(Object.keys(AREA_KINDS) as AreaKind[]).map(k => <option key={k} value={k}>{AREA_KINDS[k].label}</option>)}
            </select>
          </Field>
          <Field label="Name on the map (optional)"><TextInput label="Area name" value={item.label ?? ""} onChange={v => set({ label: v || undefined })} /></Field>
          {item.kind !== "ob" && <ObChoice item={item} />}
          {item.kind === "woods" && <WoodsTrees item={item} />}
          {item.kind === "woods" && <WoodsBrush item={item} />}
          {(item.kind === "ob" || item.kind === "hazard") && holePicker}
          {item.kind !== "parking" && item.kind !== "building" && <Toggle label="Curved" checked={!item.straight} onChange={v => set({ straight: v ? undefined : true })} />}
          <TurnShape item={item} />
          <div className="text-xs text-zinc-400">{Math.round(polygonArea(areaPath(item))).toLocaleString()} sq ft ({(polygonArea(areaPath(item)) / 43560).toFixed(2)} acres) · {item.points.length} corners</div>
        </>
      );
      break;
    case "line":
      body = (
        <>
          <Field label="Kind">
            <select aria-label="Line kind" className="w-full bg-white/[0.07] rounded-lg px-2 py-1.5 text-sm" value={item.kind} onChange={e => set({ kind: e.target.value as LineKind })}>
              {(Object.keys(LINE_KINDS) as LineKind[]).map(k => <option key={k} value={k}>{LINE_KINDS[k].label}</option>)}
            </select>
          </Field>
          {(LINE_KINDS[item.kind].width > 0 || item.kind === "walk") && <Slider label={widthVaries(item) ? "Width (all along)" : "Width"} min={1} max={item.kind === "stream" ? 200 : 60} value={item.width ?? (LINE_KINDS[item.kind].width || 6)} onChange={v => set({ width: v })} format={v => fmtDist(v, u)} />}
          {item.kind === "stream" && widthVaries(item) && (
            <div className="flex items-center justify-between gap-2 -mt-1 mb-2" data-testid="line-widths">
              <p className="text-[11px] text-zinc-400 leading-snug">{fmtDist(Math.min(...widthFactors(item)) * (item.width ?? LINE_KINDS.stream.width), u)} to {fmtDist(Math.max(...widthFactors(item)) * (item.width ?? LINE_KINDS.stream.width), u)}</p>
              <button className="shrink-0 text-xs text-orange-300 hover:text-orange-200" onClick={() => set({ widths: undefined })}>Even width</button>
            </div>
          )}
          {(item.kind === "path" || item.kind === "walk") && <SurfacePick value={item.surface} onChange={v => set({ surface: v })} />}
          {item.kind === "fence" && (
            <>
              <Field label="Fence">
                <Segmented label="What the fence is" value={item.fenceStyle ?? "rail"} onChange={v => set({ fenceStyle: v === "rail" ? undefined : v })} options={[{ value: "rail", label: "Posts and rails" }, { value: "boards", label: "Boards" }, { value: "chain", label: "Chain link" }]} />
              </Field>
              <Slider label="Height" min={2} max={12} step={0.5} value={item.fenceHeight ?? 4} onChange={v => set({ fenceHeight: v })} format={v => fmtDist(v, u)} />
            </>
          )}
          <Toggle label="Curved" checked={!item.straight} onChange={v => set({ straight: v ? undefined : true })} />
          <Field label="Name on the map (optional)"><TextInput label="Line name" value={item.label ?? ""} onChange={v => set({ label: v || undefined })} /></Field>
          {item.kind !== "ob" && item.kind !== "walk" && <ObChoice item={item} />}
          {item.kind === "ob" && holePicker}
          <TurnShape item={item} />
          {!item.locked && <div className="mb-2"><Button small onClick={() => useEditor.getState().set({ obPick: item.id, pickCut: true, tool: "select" })} testid="line-cut">Remove a stretch</Button></div>}
          <div className="text-xs text-zinc-400">{fmtDist(pathLength(item.points), u)} long</div>
        </>
      );
      break;
    case "structure": {
      const meta = STRUCTURE_KINDS[item.kind];
      const line = meta.shape === "line";
      // (A line can only become another line, an outline another outline)
      const kinds = STRUCTURE_ORDER.filter(k => STRUCTURE_KINDS[k].shape === meta.shape);
      body = (
        <>
          <Field label="Kind">
            <select aria-label="Structure kind" className="w-full bg-white/[0.07] rounded-lg px-2 py-1.5 text-sm" value={item.kind} onChange={e => set({ kind: e.target.value as StructureKind })}>
              {kinds.map(k => <option key={k} value={k}>{STRUCTURE_KINDS[k].label}</option>)}
            </select>
          </Field>
          {line && <Slider label={item.kind === "wall" ? "Thickness" : "Width"} min={1} max={item.kind === "wall" ? 6 : 24} step={0.5} value={structureWidth(item)} onChange={v => set({ width: v })} format={v => fmtSize(v, u)} />}
          {meta.heightLabel && <Slider label={meta.heightLabel} min={item.kind === "building" || item.kind === "shelter" ? 6 : 0} max={item.kind === "building" ? 40 : item.kind === "shelter" ? 20 : item.kind === "wall" ? 12 : 10} step={0.5} value={structureHeight(item)} onChange={v => set({ height: v })} format={v => fmtSize(v, u)} />}
          {item.kind === "building" && (
            <Field label="Looks like">
              <div className="grid grid-cols-3 gap-1" role="radiogroup" aria-label="Looks like" data-testid="building-looks">
                {BUILDING_LOOKS.map(l => {
                  const on = structureRoof(item) === l.roof && item.wallColor === l.wallColor && item.roofColor === l.roofColor;
                  return (
                    <button key={l.id} role="radio" aria-checked={on} data-testid={`building-look-${l.id}`} onClick={() => set({ roof: l.roof as RoofKind, wallColor: l.wallColor, roofColor: l.roofColor })} className={`rounded-md border px-1.5 py-1 flex items-center gap-1.5 text-[11px] font-semibold ${on ? "border-orange-500 bg-orange-500/10 text-zinc-100" : "border-white/[0.12] text-zinc-300 hover:border-zinc-500"}`}>
                      <span className="w-3 h-3 rounded-sm" style={{ background: `linear-gradient(135deg, ${l.roofColor} 50%, ${l.wallColor} 50%)` }} />
                      {l.label}
                    </button>
                  );
                })}
              </div>
            </Field>
          )}
          {item.kind === "shelter" && (
            <Field label="Shape">
              <Segmented label="Shelter shape" value={structureRoof(item) === "pyramid" && item.points.length === 8 ? "gazebo" : "rectangle"} onChange={v => set(v === "gazebo" ? { points: gazeboOutline(item.points), roof: "pyramid" } : { points: boxOutline(item.points), roof: "hip" })} options={[{ value: "rectangle", label: "Pavilion" }, { value: "gazebo", label: "Gazebo" }]} />
            </Field>
          )}
          {(item.kind === "building" || item.kind === "shelter") && (
            <>
              <Field label="Roof">
                <Segmented label="Roof" value={structureRoof(item)} onChange={v => set({ roof: v as RoofKind })} options={[{ value: "gable", label: "Gable" }, { value: "hip", label: "Hip" }, { value: "pyramid", label: "Pyramid" }, { value: "shed", label: "Shed" }, { value: "flat", label: "Flat" }]} />
              </Field>
              <div className="grid grid-cols-2 gap-x-3">
                <ColorInput label="Roof color" value={item.roofColor ?? (item.kind === "shelter" ? STRUCTURE_INK.shelter : STRUCTURE_INK.roof)} onChange={(v: string) => set({ roofColor: v }, false)} onDone={() => useCourse.getState().commit()} />
                {item.kind === "building" && <ColorInput label="Wall color" value={item.wallColor ?? "#6e5036"} onChange={(v: string) => set({ wallColor: v }, false)} onDone={() => useCourse.getState().commit()} />}
              </div>
            </>
          )}
          <Field label="Name on the map (optional)"><TextInput label="Structure name" value={item.label ?? ""} placeholder={item.kind === "building" ? "e.g. Clubhouse" : item.kind === "bridge" ? "e.g. Mill Creek Bridge" : ""} onChange={v => set({ label: v || undefined })} /></Field>
          {holePicker}
          <TurnShape item={item} />
          <div className="text-xs text-zinc-400" data-testid="structure-size">{line ? `${fmtDist(pathLength(item.points), u)} long` : `${Math.round(polygonArea(item.points)).toLocaleString()} sq ft · ${item.points.length} corners`}</div>
        </>
      );
      break;
    }
    case "tree":
      body = <TreeSettings item={item} set={(patch, history = true) => set(patch as Record<string, unknown>, history)} />;
      break;
    case "amenity":
      body = (
        <>
          <Field label="Kind">
            <select aria-label="Amenity kind" className="w-full bg-white/[0.07] rounded-lg px-2 py-1.5 text-sm" value={item.kind} onChange={e => set({ kind: e.target.value as AmenityKind })}>
              {(Object.keys(AMENITY_KINDS) as AmenityKind[]).map(k => <option key={k} value={k}>{AMENITY_KINDS[k].label}</option>)}
            </select>
          </Field>
          <Field label="Name (optional)"><TextInput label="Amenity name" value={item.label ?? ""} onChange={v => set({ label: v || undefined })} /></Field>
        </>
      );
      break;
    case "label":
      body = (
        <>
          <Field label="Text"><TextInput label="Label text" value={item.text} onChange={v => set({ text: v })} /></Field>
          <Slider label="Size" min={9} max={40} value={item.fontSize} onChange={v => set({ fontSize: v })} format={v => `${v}px`} />
          <Field label="Color"><input aria-label="Label color" type="color" value={item.color} onChange={e => set({ color: e.target.value })} className="w-12 h-8 rounded border border-zinc-600 bg-transparent" /></Field>
        </>
      );
      break;
  }
  const holeId = "holeId" in item ? item.holeId : undefined;
  const title = itemTitle(item);
  if (bare) return body;
  return (
    <>
      <Section testid="item-title">
        <div className="text-sm font-bold text-zinc-50" data-testid="inspector-title">{title}</div>
        {holeId && (
          <button className="text-xs text-orange-300 hover:text-orange-200" onClick={() => select(holeId)}>
            Hole {holeLabel(doc, holeId)} →
          </button>
        )}
      </Section>
      <Section>{body}</Section>
    </>
  );
}

/** What a selected item is called ("Blue tee", "OB area", "Bridge"…). */
export function itemTitle(item: CourseItem) {
  return item.type === "tee" ? `${TEE_LEVELS[item.level].label} tee` : item.type === "basket" ? `Basket (pin ${item.position})` : item.type === "area" ? AREA_KINDS[item.kind].label : item.type === "line" ? LINE_KINDS[item.kind].label : item.type === "amenity" ? AMENITY_KINDS[item.kind].label : item.type === "structure" ? STRUCTURE_KINDS[item.kind].label : ITEM_LABELS[item.type];
}

/** How much of the map's left side is covered on Design while something is picked: the slim hole
 * list and the panel next to it (fitting a hole keeps clear of them). */
export const PANEL_INSET = 388;

/** The selected hole or item, while it is shown (only with the Select tool: while placing things
 * the whole map stays clear to click on). */
export function useSelection() {
  const doc = useCourse(s => s.doc);
  const selectedId = useEditor(e => e.selectedId);
  const teeView = useEditor(e => e.teeView);
  const tool = useEditor(e => e.tool);
  const ids = useEditor(e => e.group);
  const hole = doc.holes.find(h => h.id === selectedId);
  const item = doc.items.find(i => i.id === selectedId);
  const group = useMemo(() => {
    const set = new Set(ids);
    return set.size ? doc.items.filter(i => set.has(i.id)) : [];
  }, [doc.items, ids]);
  return { hole, item, group, open: !!(hole || item || group.length) && !teeView && tool === "select" };
}

/** What things picked together are, by kind ("Tree ×12"), whole holes first. */
export function groupSummary(doc: CourseDoc, items: CourseItem[]) {
  const holes = wholeHoles(doc, new Set(items.map(i => i.id)));
  const inHoles = new Set(holes.flatMap(h => [...holeTees(doc, h.id), ...holeBaskets(doc, h.id)].map(i => i.id)));
  const counts = new Map<string, number>();
  for (const i of items) {
    if (inHoles.has(i.id)) continue;
    const k = i.type === "basket" ? "Basket" : itemTitle(i);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return [
    ...(holes.length === 1 ? [`Hole ${holeLabel(doc, holes[0].id)}`] : holes.length ? [`Holes ${holes.map(h => holeNumber(doc, h.id)).sort((a, b) => a - b).join(", ")}`] : []),
    ...[...counts].map(([k, n]) => (n > 1 ? `${k} ×${n}` : k))
  ];
}

/** Things picked together. */
function GroupInspector({ items }: { items: CourseItem[] }) {
  const doc = useCourse(s => s.doc);
  const parts = useMemo(() => groupSummary(doc, items), [doc, items]);
  return (
    <Section>
      <div className="text-sm font-bold text-zinc-50 mb-2" data-testid="inspector-title">{items.length} selected</div>
      <div className="flex flex-wrap gap-1.5" data-testid="group-kinds">
        {parts.map(p => <span key={p} className="px-2 py-0.5 rounded-full bg-white/[0.07] border border-white/[0.12] text-xs text-zinc-200">{p}</span>)}
      </div>
    </Section>
  );
}

/** The selection's own content: the hole or the item, its numbers and settings. */
export function InspectorBody() {
  const { hole, item, group } = useSelection();
  const doc = useCourse(s => s.doc);
  // (a tee or basket: its hole's panel, with it opened up there)
  const owner = item && (item.type === "tee" || item.type === "basket") ? doc.holes.find(h => h.id === item.holeId) : undefined;
  return (
    <>
      {hole ? <HoleInspector hole={hole} /> : owner ? <HoleInspector hole={owner} part={item} /> : item ? <ItemInspector item={item} /> : group.length ? <GroupInspector items={group} /> : null}
      {item && !owner && "x" in item && "y" in item && item.type !== "area" && item.type !== "line" && item.type !== "structure" && <PlaceByGps item={item as never} />}
      {hole && <div className="px-4 pb-3"><Button small full onClick={() => getView()?.fitHole(hole.id)}>Zoom to this hole</Button></div>}
    </>
  );
}

/** Lock, duplicate, delete and close; `big` for touch (44 px targets). */
export function InspectorActions({ big = false, close = true }: { big?: boolean; close?: boolean }) {
  const { item, group } = useSelection();
  // (things picked together: locked once every one of them is)
  const locked = group.length ? group.every(i => i.locked) : !!item?.locked;
  const lock = () => {
    if (item) updateItem(item.id, { locked: !locked });
    else if (group.length) {
      const ids = new Set(group.map(i => i.id));
      changeDoc(d => ({ items: d.items.map(i => (ids.has(i.id) ? { ...i, locked: !locked } : i)) }));
    }
  };
  const base = big ? "w-11 h-11 flex items-center justify-center rounded-xl text-zinc-300 hover:bg-white/[0.09]" : "p-1.5 rounded text-zinc-400 hover:bg-white/[0.09]";
  const b = `${base} hover:text-zinc-50`;
  const sz = big ? 19 : 15;
  return (
    <>
      {(item || group.length > 0) && <button className={b} title={locked ? "Unlock" : "Lock in place"} aria-label={locked ? "Unlock" : "Lock"} onClick={lock}>{locked ? <Lock size={sz} /> : <Unlock size={sz} />}</button>}
      <button className={b} title="Duplicate (Ctrl+D)" aria-label="Duplicate" onClick={duplicateSelection}><Copy size={sz} /></button>
      <button className={`${base} hover:text-red-400`} title="Delete (Del)" aria-label="Delete" onClick={deleteSelection}><Trash2 size={sz} /></button>
      {close && <button className={b} title="Close (Esc)" aria-label="Close" onClick={() => select(null)}><X size={sz} /></button>}
    </>
  );
}

/** The top of the selection's panel: back to the step (`back`: its name), or the holes before and
 * after; then lock, duplicate, delete and close. */
export function SelectionHeader({ back }: { back?: string }) {
  const { hole, item } = useSelection();
  // (a tee or basket open in its hole's panel: named here, by what acts on it)
  const part = item && (item.type === "tee" || item.type === "basket") ? itemTitle(item) : null;
  return (
    <div className="flex items-center gap-0.5 px-2 pt-2">
      {part && !back && <span className="pl-1.5 text-[12.5px] font-semibold text-zinc-300 truncate" data-testid="selection-part">{part}</span>}
      {back ? (
        <button className="flex items-center gap-1 pl-1 pr-2.5 py-1 touch:py-2.5 rounded-lg text-[13px] font-semibold text-zinc-300 hover:text-zinc-50 hover:bg-white/[0.09]" onClick={() => select(null)} data-testid="selection-back"><ChevronLeft size={17} />{back}</button>
      ) : hole && <HoleSteps holeId={hole.id} />}
      <div className="flex-1" />
      <InspectorActions close={!back} />
    </div>
  );
}

/** What's picked, on Design: down the map's left side next to the hole list (slim while this
 * shows), so the map's middle and right stay clear to work on. (On Site it takes the step's panel.) */
export function Inspector() {
  const { open } = useSelection();
  if (!open) return null;
  return (
    <aside className="absolute top-3 left-[76px] w-[300px] max-h-[calc(100%-24px)] flex flex-col glass rounded-[22px] shadow-xl shadow-black/40 z-20" data-testid="inspector" aria-label="Selection">
      <SelectionHeader />
      <div className="overflow-y-auto min-h-0">
        <InspectorBody />
      </div>
    </aside>
  );
}
