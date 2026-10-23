// How flyovers fly (the course's own, on screen and in videos): the ground they show, the
// camera's height, speed and field of view, where it starts and how far ahead it looks; and a
// hole's own flight through keyframes.
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { flyoverOf, keyBetween } from "../lib/flight";
import { holeLabel } from "../lib/course";
import { fmtDist } from "../lib/units";
import { changeDoc, updateHole, useCourse, useEditor } from "../state/course";
import type { FlyKey, FlyoverSettings, FlyShow, Hole } from "../types";
import { getView } from "../state/view";
import { ApplyToHoles } from "./ApplyToHoles";
import { Button, NumberInput, Segmented, Slider, Toggle } from "./ui";

/** What a flyover can show, in the order the switches are listed. */
const FLY_SHOW: [FlyShow, string][] = [
  ["title", "Hole title"],
  ["badge", "Hole badge"],
  ["pinDistance", "Distance to the pin"],
  ["courseName", "Course name"],
  ["playLine", "Line of play"],
  ["circle", "Putting circle"],
  ["ob", "OB"],
  ["otherHoles", "Other holes"],
  ["walks", "Paths to the next tee"]
];

/** How flyovers fly: for one hole (`holeId`: its own settings, over the course's) or for all
 * holes (the course's). `only`: this hole's, with no choice; `keys`: through keyframes (only the
 * speed and field of view apply); `ground`: with the choice of ground. */
export function FlyoverSettingsPanel({ holeId, only, keys, ground = true }: { holeId?: string; only?: boolean; keys?: boolean; ground?: boolean }) {
  const doc = useCourse(s => s.doc);
  const look = useEditor(e => e.flyLook);
  const setEd = useEditor(e => e.set);
  const hole = holeId ? doc.holes.find(h => h.id === holeId) : undefined;
  const [scope, setScope] = useState<"hole" | "course">(hole ? "hole" : "course");
  const forHole = !!hole && (only || scope === "hole");
  const f = flyoverOf(doc, forHole ? hole : undefined);
  // (keyframes are this hole's own: for all holes, every setting)
  const keyed = !!keys && forHole;
  const u = doc.units;
  // (live while a slider moves; one undo step when it is let go)
  const set = (patch: Partial<FlyoverSettings>) =>
    forHole
      ? changeDoc(d => ({ holes: d.holes.map(h => (h.id === hole!.id ? { ...h, flyover: { ...h.flyover, ...patch } } : h)) }), false)
      : changeDoc(d => ({ flyover: { ...d.flyover, ...patch } }), false);
  const done = () => useCourse.getState().commit();
  const ft = (v: number) => fmtDist(v, u);
  // A switch: one undo step
  const showPart = (k: FlyShow, v: boolean) =>
    changeDoc(d => (forHole ? { holes: d.holes.map(h => (h.id === hole!.id ? { ...h, flyover: { ...h.flyover, [k]: v } } : h)) } : { flyover: { ...d.flyover, [k]: v } }));
  return (
    <div data-testid="flyover-settings">
      {ground && (
        <div className="mb-2.5">
          <Segmented label="Ground" value={look} onChange={v => setEd({ flyLook: v })} options={[{ value: "painted", label: "Painted map" }, { value: "photo", label: "Photo" }]} />
        </div>
      )}
      {hole && !only && (
        <div className="mb-2.5">
          <Segmented label="Settings for" value={scope} onChange={setScope} options={[{ value: "course", label: "All holes" }, { value: "hole", label: `Hole ${holeLabel(doc, hole.id)}` }]} />
        </div>
      )}
      {!keyed && <Slider label="Camera height" min={10} max={250} step={5} value={f.height} onChange={v => set({ height: v })} onDone={done} format={ft} />}
      <Slider label="Speed" min={0.25} max={3} step={0.05} value={f.speed} onChange={v => set({ speed: v })} onDone={done} format={v => `${Math.round(v * 100) / 100}×`} />
      <Slider label="Field of view" min={20} max={100} value={f.fov} onChange={v => set({ fov: v })} onDone={done} format={v => `${v}°`} />
      {!keyed && (
        <>
          <Slider label="Camera starts behind the tee" min={0} max={400} step={5} value={f.behind} onChange={v => set({ behind: v })} onDone={done} format={ft} />
          <Slider label="Camera off to the side" min={-200} max={200} step={5} value={f.side} onChange={v => set({ side: v })} onDone={done} format={v => (v === 0 ? "On the line" : `${ft(Math.abs(v))} ${v > 0 ? "right" : "left"}`)} />
          <Slider label="Camera looks ahead" min={30} max={500} step={10} value={f.lookAhead} onChange={v => set({ lookAhead: v })} onDone={done} format={ft} />
        </>
      )}
      <div className="text-xs text-zinc-300 mt-2.5 mb-0.5">On screen</div>
      <div className="grid grid-cols-2 gap-x-2 mb-2" data-testid="flyover-show">
        {FLY_SHOW.map(([k, label]) => (
          <Toggle key={k} label={label} checked={f[k]} onChange={v => showPart(k, v)} />
        ))}
      </div>
      {/* (from a hole: its settings to the holes picked; for all holes: the picked holes follow them) */}
      <div className="flex flex-wrap items-start gap-2">
        <ApplyToHoles
          fromId={forHole ? hole!.id : undefined}
          testid="flyover-apply"
          apply={ids => changeDoc(d => ({ holes: d.holes.map(h => (ids.includes(h.id) ? { ...h, flyover: forHole && hole!.flyover ? { ...hole!.flyover } : undefined } : h)) }))}
        />
        {!forHole && <Button small onClick={() => changeDoc(() => ({ flyover: undefined }))} disabled={!doc.flyover} testid="flyover-defaults">Reset</Button>}
      </div>
    </div>
  );
}

/** A hole's flight: by itself, or through keyframes (each one's height, field of view and seconds). */
export function HoleFlight({ hole }: { hole: Hole }) {
  const doc = useCourse(s => s.doc);
  const set = useEditor(e => e.set);
  const keys = hole.flyKeys && hole.flyKeys.length >= 2 ? hole.flyKeys : null;
  const f = flyoverOf(doc);
  const setKeys = (next: FlyKey[] | undefined) => updateHole(hole.id, { flyKeys: next });
  const edit = (i: number, patch: Partial<FlyKey>) => keys && setKeys(keys.map((k, j) => (j === i ? { ...k, ...patch } : k)));
  const byHand = () => {
    const start = getView()?.autoKeys(hole.id);
    if (start) setKeys(start);
  };
  return (
    <div data-testid="hole-flight">
      <Segmented label="Flyover" value={keys ? "keys" : "auto"} onChange={v => (v === "keys" ? byHand() : setKeys(undefined))} options={[{ value: "auto", label: "By itself" }, { value: "keys", label: "Keyframes" }]} />
      <div className="mt-2.5"><FlyoverSettingsPanel holeId={hole.id} keys={!!keys} ground={false} /></div>
      {keys && (
        <div className="mt-2 space-y-1.5" data-testid="fly-keys">
          <div className="grid grid-cols-[22px_1fr_1fr_1fr_28px] gap-1 text-[10px] uppercase tracking-wide text-zinc-500 px-0.5">
            <span />
            <span>Height</span>
            <span>View</span>
            <span>Seconds</span>
            <span />
          </div>
          {keys.map((k, i) => (
            <div key={i} className="grid grid-cols-[22px_1fr_1fr_1fr_28px] gap-1 items-center" data-testid="fly-key">
              <span className="w-[20px] h-[20px] rounded-md bg-sky-600 text-white text-[11px] font-bold flex items-center justify-center">{i + 1}</span>
              <NumberInput label={`Keyframe ${i + 1} height`} value={Math.round(k.alt)} min={2} max={1000} onChange={v => edit(i, { alt: v })} />
              <NumberInput label={`Keyframe ${i + 1} field of view`} value={k.fov ?? f.fov} min={15} max={110} onChange={v => edit(i, { fov: v })} />
              {i === 0 ? <span className="text-xs text-zinc-500 text-center">0</span> : <NumberInput label={`Keyframe ${i + 1} seconds`} value={k.secs ?? NaN} min={0.5} max={60} step={0.5} onChange={v => edit(i, { secs: v })} />}
              <button className="p-1 rounded text-zinc-400 hover:text-red-400 hover:bg-white/[0.09] disabled:opacity-30" aria-label={`Remove keyframe ${i + 1}`} disabled={keys.length <= 2} onClick={() => setKeys(keys.filter((_, j) => j !== i))}><Trash2 size={14} /></button>
            </div>
          ))}
          <div className="flex gap-1.5 pt-1">
            <Button small onClick={() => setKeys([...keys.slice(0, -1), keyBetween(keys[keys.length - 2], keys[keys.length - 1]), keys[keys.length - 1]])} testid="fly-key-add"><Plus size={13} /> Keyframe</Button>
            <Button small onClick={() => set({ teeView: hole.id, flyover: true })} testid="fly-preview">Fly over</Button>
          </div>
        </div>
      )}
    </div>
  );
}
