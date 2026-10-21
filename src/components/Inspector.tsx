// The panel for what is selected: a hole (par, fairway, notes, numbers, profile) or one item.
import { useEffect, useMemo, useState } from "react";
import { Copy, Eye, Lock, Plane, RotateCcw, RotateCw, Trash2, Unlock, X } from "lucide-react";
import { AMENITY_KINDS, AREA_KINDS, LINE_KINDS, PATH_SURFACES, PIN_POSITIONS, STRUCTURE_KINDS, STRUCTURE_ORDER, TEE_LEVELS, TEE_ORDER, TEE_SURFACES } from "../constants";
import { areaPath, autoWalks, byNumber, holeBaskets, holeLabel, holeNumber, holeTees, ITEM_LABELS, parseHoleNumbers, wholeHoles, widthFactors, widthVaries } from "../lib/course";
import { pathLength, polygonArea } from "../lib/geom";
import { BUILDING_LOOKS, boxOutline, gazeboOutline, structureHeight, structureRoof, structureWidth, turnShape } from "../lib/structures";
import { STRUCTURE_INK } from "../lib/symbols";
import { courseStats, holeStats } from "../lib/holeStats";
import { fmtDist, fmtElev, toUnits } from "../lib/units";
import { addHoleOb, deleteSelection, duplicateSelection, editWalks, select, setTeeLevel, shareBasket } from "../state/actions";
import { changeDoc, setHoleNumber, updateHole, updateItem, useCourse, useEditor } from "../state/course";
import type { AmenityKind, AreaItem, AreaKind, CourseDoc, CourseItem, Hole, LineItem, LineKind, P, PathSurface, RoofKind, StructureItem, StructureKind, TeeSurface, TreeKind } from "../types";
import { ElevationProfile } from "./ElevationProfile";
import { HoleFlight } from "./FlyoverSettings";
import { HoleSteps } from "./HoleSteps";
import { getView } from "./MapViewport";
import { Button, ColorInput, Field, NumberInput, Section, Segmented, Slider, Stat, TextInput, Toggle } from "./ui";

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
  useEffect(() => setText(value), [value]);
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
        className="w-16 touch:w-20 h-8 touch:h-11 rounded-lg bg-zinc-800 border border-zinc-700 text-center text-sm touch:text-base font-bold text-zinc-50 focus:outline-none focus:border-orange-400"
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

/** Every walk to the next tee this wide (holes' own widths let go). */
export const setAllWalks = (w: number, history = true) =>
  changeDoc(d => ({
    style: { ...d.style, walkWidth: w },
    holes: d.holes.some(h => h.walkWidth !== undefined) ? d.holes.map(h => (h.walkWidth === undefined ? h : { ...h, walkWidth: undefined })) : d.holes,
    // (walks drawn by hand too)
    items: d.items.some(i => i.type === "line" && i.kind === "walk") ? d.items.map(i => (i.type === "line" && i.kind === "walk" ? { ...i, width: w } : i)) : d.items
  }), history);

function HoleInspector({ hole }: { hole: Hole }) {
  const doc = useCourse(s => s.doc);
  const s = useMemo(() => holeStats(doc, hole), [doc, hole]);
  const label = holeLabel(doc, hole.id);
  // The walk on to the next tee, while it is the automatic one
  const walkNext = useMemo(() => (doc.style.nextTee ? autoWalks(doc.items, courseStats(doc), doc.holes).find(w => w.a.holeId === hole.id) ?? null : null), [doc, hole.id]);
  const nextNo = walkNext ? holeLabel(doc, walkNext.b.holeId) : "";
  const u = doc.units;
  const tees = holeTees(doc, hole.id);
  const baskets = holeBaskets(doc, hole.id);
  // The hole whose basket this one plays to, when it shares one
  const sharing = baskets.find(b => b.holeId !== hole.id)?.holeId ?? null;
  const set = (patch: Partial<Hole>) => updateHole(hole.id, patch);
  const ro = useEditor(e => e.viewOnly);
  return (
    <>
      <Section>
        <div className="flex items-center gap-2 mb-2" data-insp-title>
          <div className={`min-w-10 h-10 px-1.5 rounded-full bg-orange-500 text-white flex items-center justify-center ${label.length > 3 ? "text-sm" : "text-lg"} font-bold`} style={{ fontFamily: "Oswald, Inter" }}>{label}</div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold text-zinc-50 truncate" data-testid="inspector-title">Hole {label}{hole.name ? ` · ${hole.name}` : ""}</div>
            <div className="text-xs text-zinc-400">{s.complete ? `${fmtDist(s.length, u)} · Par ${s.par} · ${shapeText[s.shape]}` : s.teeId ? "Needs a basket" : "Needs a tee"}</div>
          </div>
          {!ro && <HoleNumberInput holeId={hole.id} value={label} />}
        </div>
        {!ro && (() => { const mine = label.split("/"); const clash = doc.holes.filter(h => h.id !== hole.id).flatMap(h => holeLabel(doc, h.id).split("/")).find(v => mine.includes(v)); return clash ? <div className="text-xs text-amber-300 -mt-1 mb-2" data-testid="hole-number-taken">Another hole is also Hole {clash}</div> : null; })()}
        {s.complete && (
          <div className="grid grid-cols-3 gap-1.5" data-testid="hole-stats">
            <Stat label="Length" value={fmtDist(s.length, u)} />
            <Stat label="Elevation" value={fmtElev(s.elevationChange, u)} sub={s.elevationChange > 0 ? "uphill" : s.elevationChange < 0 ? "downhill" : undefined} />
            <Stat label="Plays like" value={fmtDist(s.playsLike, u)} sub={s.foliage === "heavy" ? "heavy foliage" : undefined} />
          </div>
        )}
        {s.complete && (
          <div className="flex gap-1.5 mt-2">
            <Button small onClick={() => useEditor.getState().set({ teeView: hole.id, flyover: false })} testid="tee-view"><Eye size={14} /> View from tee</Button>
            <Button small onClick={() => useEditor.getState().set({ teeView: hole.id, flyover: true })} testid="flyover"><Plane size={14} /> Fly over</Button>
          </div>
        )}
        {s.complete && !ro && (
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
      {s.complete && (
        <Section title="Elevation profile">
          <ElevationProfile doc={doc} line={s.line} />
          <div className="text-[11px] text-zinc-400 mt-1">
            Tee {Math.round(toUnits(s.teeElevation, u))} {u} · basket {Math.round(toUnits(s.basketElevation, u))} {u} · steepest {Math.round(s.maxSlope)}%
          </div>
        </Section>
      )}
      {!ro && (
        <Section title="Par and play">
          <Field label="Par">
            <Segmented
              label="Par"
              value={hole.par ?? 0}
              onChange={v => set({ par: v === 0 ? undefined : v })}
              options={[{ value: 0, label: `Auto (${s.parAuto})` }, ...[2, 3, 4, 5, 6].map(p => ({ value: p, label: String(p) }))]}
            />
          </Field>
          <Field label="Foliage">
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
                    : hole.fairwayShift ? "Shaped" : "Even width"}
                </p>
                {(hole.fairwayShape || hole.fairwayShift) && <button className="shrink-0 text-xs text-orange-300 hover:text-orange-200" onClick={() => set({ fairwayShape: undefined, fairwayShift: undefined, fairwayStations: undefined })}>Even width</button>}
              </div>
            </>
          )}
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
      )}
      {!ro && walkNext && (
        <Section title={`Walk to hole ${nextNo}`} testid="hole-walk">
          <Slider label="Width" min={1} max={20} step={0.5} value={hole.walkWidth ?? doc.style.walkWidth ?? 6} onChange={v => set({ walkWidth: v })} format={v => fmtDist(v, u)} />
          <Slider label="All walks" min={1} max={20} step={0.5} value={doc.style.walkWidth ?? 6} onChange={v => setAllWalks(v, false)} onDone={() => useCourse.getState().commit()} format={v => fmtDist(v, u)} />
          <SurfacePick value={hole.walkSurface} onChange={v => set({ walkSurface: v })} />
          <div className="flex flex-wrap gap-1.5">
            <Button small onClick={() => editWalks(hole.id)} testid="edit-walk">Edit the walk to hole {nextNo}</Button>
            {hole.walkOut && <Button small onClick={() => set({ walkOut: undefined })} testid="walk-out-reset">Start off the green again</Button>}
            <Button small tone="danger" onClick={() => set({ walkOff: true })} testid="walk-remove"><Trash2 size={13} /> Remove this walk</Button>
          </div>
        </Section>
      )}
      {!ro && hole.walkOff && doc.style.nextTee && (
        <Section title="Walk to the next hole" testid="hole-walk-off">
          <Button small onClick={() => set({ walkOff: undefined })} testid="walk-restore">Add the walk back</Button>
        </Section>
      )}
      {s.complete && (
        <Section title="In play">
          <ul className="text-xs text-zinc-300 space-y-1" data-testid="hole-in-play">
            <li>{s.treesOnLine ? `${s.treesOnLine} tree${s.treesOnLine === 1 ? "" : "s"} on the throw line` : "Clear throw line"} · {s.treesInFairway} in the fairway</li>
            <li>{s.obInPlay ? `OB in play${s.obCrossed ? ` (crosses ${s.obCrossed})` : ""}` : "No OB in play"}{s.obNearBasket ? " · OB within 10 m of the basket" : ""}</li>
            <li>Difficulty {"●".repeat(s.difficulty)}{"○".repeat(5 - s.difficulty)}</li>
          </ul>
        </Section>
      )}
      <Section title="Tees and pins">
        {!ro && doc.holes.length > 1 && (
          <Field label="Basket">
            <select aria-label="Basket" data-testid="share-basket" className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-sm" value={sharing ?? ""} onChange={e => shareBasket(hole.id, e.target.value || null)}>
              <option value="">Its own</option>
              {doc.holes.filter(h => h.id !== hole.id && holeBaskets(doc, h.id).some(b => b.holeId === h.id)).map(h => <option key={h.id} value={h.id}>Hole {holeLabel(doc, h.id)}'s</option>)}
            </select>
          </Field>
        )}
        <ul className="space-y-1">
          {tees.map(t => (
            <li key={t.id}>
              <button className="w-full flex items-center gap-2 text-left text-xs text-zinc-200 hover:bg-zinc-800 rounded px-1.5 py-1" onClick={() => select(t.id)}>
                <span className="w-3 h-3 rounded-sm border border-black/40" style={{ background: TEE_LEVELS[t.level].color }} />
                {TEE_LEVELS[t.level].label} tee
                <span className="ml-auto text-zinc-400">{fmtDist(holeStats(doc, hole, { id: "x", name: "", tee: t.level, pin: "A" }).length, u)}</span>
              </button>
            </li>
          ))}
          {baskets.map(b => (
            <li key={b.id}>
              <button className="w-full flex items-center gap-2 text-left text-xs text-zinc-200 hover:bg-zinc-800 rounded px-1.5 py-1" onClick={() => select(b.id)}>
                <span className="w-3 h-3 rounded-full border-2" style={{ borderColor: doc.style.basket }} />
                Pin {b.position}
              </button>
            </li>
          ))}
        </ul>
      </Section>
      {!ro && s.complete && (
        <Section title="Flyover">
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
      <select aria-label="Surface" data-testid="path-surface" className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-sm" value={value ?? "dirt"} onChange={e => onChange(e.target.value === "dirt" ? undefined : (e.target.value as PathSurface))}>
        {(Object.keys(PATH_SURFACES) as PathSurface[]).map(k => <option key={k} value={k}>{PATH_SURFACES[k].label}</option>)}
      </select>
    </Field>
  );
}

/** Whether water, a creek, a road, a fence or a path is out of bounds (and shown so on the map). */
function ObChoice({ item }: { item: AreaItem | LineItem }) {
  const wet = item.kind === "water" || item.kind === "stream";
  const value = item.ob === true ? "edge" : item.ob === false || !wet ? "no" : "yes";
  const options = [{ value: "no", label: "Not OB" }, ...(wet ? [{ value: "yes", label: "OB" }] : []), { value: "edge", label: "OB, red edge" }];
  return (
    <Field label="Out of bounds">
      <Segmented label="Out of bounds" value={value} onChange={v => updateItem(item.id, { ob: v === "edge" ? true : v === "no" ? (wet ? false : undefined) : undefined } as Partial<CourseItem>)} options={options} />
    </Field>
  );
}

/** Turn buttons for a drawn shape (about its middle). */
function TurnShape({ item }: { item: AreaItem | LineItem | StructureItem }) {
  if (item.locked || item.points.length < 2) return null;
  const turn = (deg: number) => updateItem(item.id, turnShape(item.points, item, (deg * Math.PI) / 180) as Partial<CourseItem>);
  const b = "flex-1 h-8 touch:h-11 rounded-lg border border-zinc-700 hover:border-zinc-500 text-xs font-semibold text-zinc-200 flex items-center justify-center gap-1";
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

function ItemInspector({ item }: { item: CourseItem }) {
  const doc = useCourse(s => s.doc);
  const ro = useEditor(e => e.viewOnly);
  const u = doc.units;
  const set = (patch: Record<string, unknown>, history = true) => updateItem(item.id, patch as Partial<CourseItem>, history);
  const holeOptions = [{ value: "", label: "Whole course" }, ...doc.holes.map(h => ({ value: h.id, label: `Hole ${holeLabel(doc, h.id)}` }))];
  // (shapes and built things can belong to several holes: an OB line along two fairways)
  const shared = item.type === "area" || item.type === "line" || item.type === "structure";
  const mine = "holeId" in item && item.holeId ? [item.holeId, ...((shared && item.alsoHoles) || [])] : [];
  const setHoles = (ids: string[]) => set({ holeId: ids[0], alsoHoles: ids.length > 1 ? ids.slice(1) : undefined });
  const chip = (on: boolean) => `px-2 py-1 touch:py-2 rounded-md text-xs font-semibold border ${on ? "bg-orange-500/20 border-orange-400 text-orange-100" : "border-zinc-700 text-zinc-300 hover:border-zinc-500"}`;
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
      <select aria-label="Belongs to hole" className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-sm" value={("holeId" in item && item.holeId) || ""} onChange={e => set({ holeId: e.target.value || undefined })}>
        {holeOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </Field>
  );
  let body: JSX.Element | null = null;
  switch (item.type) {
    case "tee":
      body = (
        <>
          <Field label="Tee color (skill level)">
            <Segmented label="Tee color" value={item.level} onChange={v => setTeeLevel(item.id, v)} options={TEE_ORDER.map(l => ({ value: l, label: TEE_LEVELS[l].label, title: `${TEE_LEVELS[l].skill} (${TEE_LEVELS[l].rating})` }))} />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Pad width"><NumberInput label="Pad width" value={item.padWidth} min={2} max={20} step={0.5} unit="ft" onChange={v => set({ padWidth: v })} /></Field>
            <Field label="Pad length"><NumberInput label="Pad length" value={item.padLength} min={4} max={30} step={0.5} unit="ft" onChange={v => set({ padLength: v })} /></Field>
          </div>
          <Field label="Surface">
            <select aria-label="Tee surface" className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-sm" value={item.surface} onChange={e => set({ surface: e.target.value as TeeSurface })}>
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
            <NumberInput label="Raised" value={item.raised ?? 0} min={0} max={30} step={0.5} unit="ft" onChange={v => set({ raised: v || undefined })} />
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
            <select aria-label="Area kind" className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-sm" value={item.kind} onChange={e => set({ kind: e.target.value as AreaKind })}>
              {(Object.keys(AREA_KINDS) as AreaKind[]).map(k => <option key={k} value={k}>{AREA_KINDS[k].label}</option>)}
            </select>
          </Field>
          <Field label="Name on the map (optional)"><TextInput label="Area name" value={item.label ?? ""} onChange={v => set({ label: v || undefined })} /></Field>
          {item.kind === "water" && <ObChoice item={item} />}
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
            <select aria-label="Line kind" className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-sm" value={item.kind} onChange={e => set({ kind: e.target.value as LineKind })}>
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
          <Toggle label="Curved" checked={!item.straight} onChange={v => set({ straight: v ? undefined : true })} />
          <Field label="Name on the map (optional)"><TextInput label="Line name" value={item.label ?? ""} onChange={v => set({ label: v || undefined })} /></Field>
          {item.kind !== "ob" && item.kind !== "walk" && <ObChoice item={item} />}
          {item.kind === "ob" && holePicker}
          <TurnShape item={item} />
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
            <select aria-label="Structure kind" className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-sm" value={item.kind} onChange={e => set({ kind: e.target.value as StructureKind })}>
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
                    <button key={l.id} role="radio" aria-checked={on} data-testid={`building-look-${l.id}`} onClick={() => set({ roof: l.roof as RoofKind, wallColor: l.wallColor, roofColor: l.roofColor })} className={`rounded-md border px-1.5 py-1 flex items-center gap-1.5 text-[11px] font-semibold ${on ? "border-orange-500 bg-orange-500/10 text-zinc-100" : "border-zinc-700 text-zinc-300 hover:border-zinc-500"}`}>
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
      body = (
        <>
          <Field label="Kind">
            <Segmented label="Tree kind" value={item.treeType ?? "deciduous"} onChange={v => set({ treeType: v as TreeKind })} options={[{ value: "deciduous", label: "Leafy" }, { value: "conifer", label: "Pine" }, { value: "palm", label: "Palm" }, { value: "bush", label: "Bush" }]} />
          </Field>
          <Slider label="Crown radius" min={2} max={40} value={Math.round(item.radius)} onChange={v => set({ radius: v })} format={v => fmtDist(v, u)} />
          {/* (taller or shorter keeps its shape: the crown grows or shrinks with it) */}
          <Slider label="Height" min={3} max={110} value={Math.round(item.height ?? item.radius * 2.6)} onChange={v => { const h0 = item.height ?? item.radius * 2.6; set({ height: v, radius: Math.max(2, Math.min(40, Math.round(item.radius * (v / h0) * 10) / 10)) }); }} format={v => fmtDist(v, u)} />
        </>
      );
      break;
    case "amenity":
      body = (
        <>
          <Field label="Kind">
            <select aria-label="Amenity kind" className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-sm" value={item.kind} onChange={e => set({ kind: e.target.value as AmenityKind })}>
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
      {!ro && <Section>{body}</Section>}
    </>
  );
}

/** What a selected item is called ("Blue tee", "OB area", "Bridge"…). */
export function itemTitle(item: CourseItem) {
  return item.type === "tee" ? `${TEE_LEVELS[item.level].label} tee` : item.type === "basket" ? `Basket (pin ${item.position})` : item.type === "area" ? AREA_KINDS[item.kind].label : item.type === "line" ? LINE_KINDS[item.kind].label : item.type === "amenity" ? AMENITY_KINDS[item.kind].label : item.type === "structure" ? STRUCTURE_KINDS[item.kind].label : ITEM_LABELS[item.type];
}

/** How much of the map's right side the inspector covers (fitting a hole keeps clear of it). */
export const INSPECTOR_INSET = 470;

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
        {parts.map(p => <span key={p} className="px-2 py-0.5 rounded-full bg-zinc-800 border border-zinc-700 text-xs text-zinc-200">{p}</span>)}
      </div>
    </Section>
  );
}

/** The selection's own content: the hole or the item, its numbers and settings. */
export function InspectorBody() {
  const { hole, item, group } = useSelection();
  return (
    <>
      {hole ? <HoleInspector hole={hole} /> : item ? <ItemInspector item={item} /> : group.length ? <GroupInspector items={group} /> : null}
      {hole && <div className="px-4 pb-3"><Button small full onClick={() => getView()?.fitHole(hole.id)}>Zoom to this hole</Button></div>}
    </>
  );
}

/** Lock, duplicate, delete and close; `big` for touch (44 px targets). */
export function InspectorActions({ big = false, close = true }: { big?: boolean; close?: boolean }) {
  const { item, group } = useSelection();
  const ro = useEditor(e => e.viewOnly);
  // (things picked together: locked once every one of them is)
  const locked = group.length ? group.every(i => i.locked) : !!item?.locked;
  const lock = () => {
    if (item) updateItem(item.id, { locked: !locked });
    else if (group.length) {
      const ids = new Set(group.map(i => i.id));
      changeDoc(d => ({ items: d.items.map(i => (ids.has(i.id) ? { ...i, locked: !locked } : i)) }));
    }
  };
  const base = big ? "w-11 h-11 flex items-center justify-center rounded-xl text-zinc-300 hover:bg-zinc-800" : "p-1.5 rounded text-zinc-400 hover:bg-zinc-800";
  const b = `${base} hover:text-white`;
  const sz = big ? 19 : 15;
  return (
    <>
      {!ro && (
        <>
          {(item || group.length > 0) && <button className={b} title={locked ? "Unlock" : "Lock in place"} aria-label={locked ? "Unlock" : "Lock"} onClick={lock}>{locked ? <Lock size={sz} /> : <Unlock size={sz} />}</button>}
          <button className={b} title="Duplicate (Ctrl+D)" aria-label="Duplicate" onClick={duplicateSelection}><Copy size={sz} /></button>
          <button className={`${base} hover:text-red-400`} title="Delete (Del)" aria-label="Delete" onClick={deleteSelection}><Trash2 size={sz} /></button>
        </>
      )}
      {close && <button className={b} title="Close (Esc)" aria-label="Close" onClick={() => select(null)}><X size={sz} /></button>}
    </>
  );
}

export function Inspector() {
  const { open, hole } = useSelection();
  useEffect(() => {
    const v = getView();
    if (v) v.rightInset = open ? INSPECTOR_INSET : 0;
  }, [open]);
  if (!open) return null;
  return (
    <aside className="absolute top-3 right-[150px] w-[300px] max-h-[calc(100%-120px)] overflow-y-auto bg-zinc-900/95 backdrop-blur border border-zinc-700/70 rounded-xl shadow-2xl z-20" data-testid="inspector" aria-label="Selection">
      <div className="flex items-center gap-0.5 px-2 pt-2">
        {hole && <HoleSteps holeId={hole.id} />}
        <div className="flex-1" />
        <InspectorActions />
      </div>
      <InspectorBody />
    </aside>
  );
}
