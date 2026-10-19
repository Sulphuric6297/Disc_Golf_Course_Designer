// The panel for what is selected: a hole (par, fairway, notes, numbers, profile) or one item.
import { useEffect, useMemo } from "react";
import { ArrowDown, ArrowUp, Copy, Eye, Lock, Plane, Trash2, Unlock, X } from "lucide-react";
import { AMENITY_KINDS, AREA_KINDS, LINE_KINDS, PIN_POSITIONS, TEE_LEVELS, TEE_ORDER, TEE_SURFACES } from "../constants";
import { holeBaskets, holeNumber, holeTees, ITEM_LABELS } from "../lib/course";
import { pathLength, polygonArea } from "../lib/geom";
import { holeStats } from "../lib/holeStats";
import { fmtDist, fmtElev, toUnits } from "../lib/units";
import { deleteSelection, duplicateSelection, select, setTeeLevel } from "../state/actions";
import { moveHole, updateHole, updateItem, useCourse, useEditor } from "../state/course";
import type { AmenityKind, AreaKind, CourseItem, Hole, LineKind, TeeSurface, TreeKind } from "../types";
import { ElevationProfile } from "./ElevationProfile";
import { getView } from "./MapViewport";
import { Button, Field, NumberInput, Section, Segmented, Slider, Stat, TextInput, Toggle } from "./ui";

const shapeText = { straight: "Straight", left: "Turns left", right: "Turns right", "s-curve": "S-curve" };

function HoleInspector({ hole }: { hole: Hole }) {
  const doc = useCourse(s => s.doc);
  const s = useMemo(() => holeStats(doc, hole), [doc, hole]);
  const n = holeNumber(doc, hole.id);
  const u = doc.units;
  const tees = holeTees(doc, hole.id);
  const baskets = holeBaskets(doc, hole.id);
  const set = (patch: Partial<Hole>) => updateHole(hole.id, patch);
  const ro = useEditor(e => e.viewOnly);
  return (
    <>
      <Section>
        <div className="flex items-center gap-2 mb-2">
          <div className="w-10 h-10 rounded-full bg-orange-500 text-white flex items-center justify-center text-lg font-bold" style={{ fontFamily: "Oswald, Inter" }}>{n}</div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold text-zinc-50 truncate" data-testid="inspector-title">Hole {n}{hole.name ? ` · ${hole.name}` : ""}</div>
            <div className="text-xs text-zinc-400">{s.complete ? `${fmtDist(s.length, u)} · Par ${s.par} · ${shapeText[s.shape]}` : s.teeId ? "Needs a basket" : "Needs a tee"}</div>
          </div>
          {!ro && (
            <div className="flex flex-col">
              <button className="text-zinc-400 hover:text-white disabled:opacity-30" title="Play it earlier" aria-label="Move hole earlier" disabled={n <= 1} onClick={() => moveHole(hole.id, n - 2)}><ArrowUp size={15} /></button>
              <button className="text-zinc-400 hover:text-white disabled:opacity-30" title="Play it later" aria-label="Move hole later" disabled={n >= doc.holes.length} onClick={() => moveHole(hole.id, n)}><ArrowDown size={15} /></button>
            </div>
          )}
        </div>
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
          <Field label="Par" hint={`Worked out: par ${s.parAuto} for the ${TEE_LEVELS[s.level].label} tee (PDGA: length + 3 × climb, doglegs, foliage).`}>
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
          {hole.fairway && <Slider label="Fairway width" min={10} max={150} value={hole.fairwayWidth} onChange={v => set({ fairwayWidth: v })} format={v => fmtDist(v, u)} />}
          <Field label="Name (optional)"><TextInput label="Hole name" value={hole.name ?? ""} placeholder="e.g. The Gauntlet" onChange={v => set({ name: v || undefined })} /></Field>
          <Field label="Notes and hole rules" hint="Shown on the tee sign and the hole sheet."><TextInput area label="Hole notes" value={hole.notes ?? ""} placeholder="e.g. OB left of the path. Mando right of the big oak; drop zone by the bench." onChange={v => set({ notes: v || undefined })} /></Field>
          {hole.doglegs.length > 0 && <Button small onClick={() => set({ doglegs: [] })}>Straighten the throw line</Button>}
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
        {!ro && <p className="text-[11px] text-zinc-500 mt-1.5">Add more with the Tee (T) and Basket (B) tools. Drag the orange dots on the line to move turns; pull a small dot to add one.</p>}
      </Section>
    </>
  );
}

function ItemInspector({ item }: { item: CourseItem }) {
  const doc = useCourse(s => s.doc);
  const ro = useEditor(e => e.viewOnly);
  const u = doc.units;
  const set = (patch: Record<string, unknown>) => updateItem(item.id, patch as Partial<CourseItem>);
  const holeOptions = [{ value: "", label: "Whole course" }, ...doc.holes.map((h, i) => ({ value: h.id, label: `Hole ${i + 1}` }))];
  const holePicker = (
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
          <Field label="Raised above the ground" hint="An elevated basket (on a platform or a mound).">
            <NumberInput label="Raised" value={item.raised ?? 0} min={0} max={30} step={0.5} unit="ft" onChange={v => set({ raised: v || undefined })} />
          </Field>
        </>
      );
      break;
    case "mando":
      body = (
        <>
          <Field label="The disc must pass" hint="Looking along the arrow (the direction of play). Drag the round handle to turn the arrow.">
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
          <p className="text-[11px] text-zinc-400 -mt-1 mb-2">{AREA_KINDS[item.kind].help}</p>
          <Field label="Name on the map (optional)"><TextInput label="Area name" value={item.label ?? ""} onChange={v => set({ label: v || undefined })} /></Field>
          {(item.kind === "ob" || item.kind === "hazard") && holePicker}
          <div className="text-xs text-zinc-400">{Math.round(polygonArea(item.points)).toLocaleString()} sq ft ({(polygonArea(item.points) / 43560).toFixed(2)} acres) · {item.points.length} corners</div>
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
          <p className="text-[11px] text-zinc-400 -mt-1 mb-2">{LINE_KINDS[item.kind].help}</p>
          {LINE_KINDS[item.kind].width > 0 && <Slider label="Width" min={1} max={60} value={item.width ?? LINE_KINDS[item.kind].width} onChange={v => set({ width: v })} format={v => fmtDist(v, u)} />}
          <Field label="Name on the map (optional)"><TextInput label="Line name" value={item.label ?? ""} onChange={v => set({ label: v || undefined })} /></Field>
          {item.kind === "ob" && holePicker}
          <div className="text-xs text-zinc-400">{fmtDist(pathLength(item.points), u)} long</div>
        </>
      );
      break;
    case "tree":
      body = (
        <>
          <Field label="Kind">
            <Segmented label="Tree kind" value={item.treeType ?? "deciduous"} onChange={v => set({ treeType: v as TreeKind })} options={[{ value: "deciduous", label: "Leafy" }, { value: "conifer", label: "Pine" }, { value: "palm", label: "Palm" }, { value: "bush", label: "Bush" }]} />
          </Field>
          <Slider label="Crown radius" min={2} max={40} value={Math.round(item.radius)} onChange={v => set({ radius: v })} format={v => fmtDist(v, u)} />
          <Slider label="Height" min={3} max={110} value={Math.round(item.height ?? 40)} onChange={v => set({ height: v })} format={v => fmtDist(v, u)} />
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
  const title = item.type === "tee" ? `${TEE_LEVELS[item.level].label} tee` : item.type === "basket" ? `Basket (pin ${item.position})` : item.type === "area" ? AREA_KINDS[item.kind].label : item.type === "line" ? LINE_KINDS[item.kind].label : item.type === "amenity" ? AMENITY_KINDS[item.kind].label : ITEM_LABELS[item.type];
  return (
    <>
      <Section>
        <div className="text-sm font-bold text-zinc-50" data-testid="inspector-title">{title}</div>
        {holeId && (
          <button className="text-xs text-orange-300 hover:text-orange-200" onClick={() => select(holeId)}>
            Hole {holeNumber(doc, holeId)} →
          </button>
        )}
      </Section>
      {!ro && <Section>{body}</Section>}
    </>
  );
}

/** How much of the map's right side the inspector covers (fitting a hole keeps clear of it). */
export const INSPECTOR_INSET = 470;

export function Inspector() {
  const doc = useCourse(s => s.doc);
  const selectedId = useEditor(e => e.selectedId);
  const ro = useEditor(e => e.viewOnly);
  const teeView = useEditor(e => e.teeView);
  const tool = useEditor(e => e.tool);
  const hole = doc.holes.find(h => h.id === selectedId);
  const item = doc.items.find(i => i.id === selectedId);
  // Only with the Select tool: while placing things the whole map stays clear to click on
  const open = !!(hole || item) && !teeView && tool === "select";
  useEffect(() => {
    const v = getView();
    if (v) v.rightInset = open ? INSPECTOR_INSET : 0;
  }, [open]);
  if (!open) return null;
  const locked = !!item?.locked;
  return (
    <aside className="absolute top-3 right-[150px] w-[300px] max-h-[calc(100%-120px)] overflow-y-auto bg-zinc-900/95 backdrop-blur border border-zinc-700/70 rounded-xl shadow-2xl z-20" data-testid="inspector" aria-label="Selection">
      <div className="flex items-center justify-end gap-0.5 px-2 pt-2">
        {!ro && (
          <>
            {item && <button className="p-1.5 rounded text-zinc-400 hover:text-white hover:bg-zinc-800" title={locked ? "Unlock" : "Lock in place"} aria-label={locked ? "Unlock" : "Lock"} onClick={() => updateItem(item.id, { locked: !locked })}>{locked ? <Lock size={15} /> : <Unlock size={15} />}</button>}
            <button className="p-1.5 rounded text-zinc-400 hover:text-white hover:bg-zinc-800" title="Duplicate (Ctrl+D)" aria-label="Duplicate" onClick={duplicateSelection}><Copy size={15} /></button>
            <button className="p-1.5 rounded text-zinc-400 hover:text-red-400 hover:bg-zinc-800" title="Delete (Del)" aria-label="Delete" onClick={deleteSelection}><Trash2 size={15} /></button>
          </>
        )}
        <button className="p-1.5 rounded text-zinc-400 hover:text-white hover:bg-zinc-800" title="Close (Esc)" aria-label="Close" onClick={() => select(null)}><X size={15} /></button>
      </div>
      {hole ? <HoleInspector hole={hole} /> : item ? <ItemInspector item={item} /> : null}
      {hole && <div className="px-4 pb-3"><Button small full onClick={() => getView()?.fitHole(hole.id)}>Zoom to this hole</Button></div>}
    </aside>
  );
}
