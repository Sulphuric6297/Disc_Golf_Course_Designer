// How flyovers fly (the course's own, on screen and in videos): the ground they show, the
// camera's height, speed and field of view, where it starts and how far ahead it looks; and a
// hole's own flight through keyframes.
import { Plus, Trash2 } from "lucide-react";
import { flyoverOf, keyBetween } from "../lib/flight";
import { fmtDist } from "../lib/units";
import { changeDoc, updateHole, useCourse, useEditor } from "../state/course";
import type { FlyKey, FlyoverSettings, Hole } from "../types";
import { getView } from "./MapViewport";
import { Button, NumberInput, Segmented, Slider } from "./ui";

export function FlyoverSettingsPanel() {
  const doc = useCourse(s => s.doc);
  const ro = useEditor(e => e.viewOnly);
  const look = useEditor(e => e.flyLook);
  const setEd = useEditor(e => e.set);
  const f = flyoverOf(doc);
  const u = doc.units;
  // (live while a slider moves; one undo step when it is let go)
  const set = (patch: Partial<FlyoverSettings>) => changeDoc(d => ({ flyover: { ...d.flyover, ...patch } }), false);
  const done = () => useCourse.getState().commit();
  const ft = (v: number) => fmtDist(v, u);
  return (
    <div data-testid="flyover-settings">
      <div className="mb-2.5">
        <Segmented label="Ground" value={look} onChange={v => setEd({ flyLook: v })} options={[{ value: "painted", label: "Painted map" }, { value: "photo", label: "Photo" }]} />
      </div>
      {!ro && (
        <>
          <Slider label="Height" min={10} max={250} step={5} value={f.height} onChange={v => set({ height: v })} onDone={done} format={ft} />
          <Slider label="Speed" min={0.25} max={3} step={0.05} value={f.speed} onChange={v => set({ speed: v })} onDone={done} format={v => `${Math.round(v * 100) / 100}×`} />
          <Slider label="Field of view" min={20} max={100} value={f.fov} onChange={v => set({ fov: v })} onDone={done} format={v => `${v}°`} />
          <Slider label="Start behind the tee" min={0} max={400} step={5} value={f.behind} onChange={v => set({ behind: v })} onDone={done} format={ft} />
          <Slider label="To the side" min={-200} max={200} step={5} value={f.side} onChange={v => set({ side: v })} onDone={done} format={v => (v === 0 ? "On the line" : `${ft(Math.abs(v))} ${v > 0 ? "right" : "left"}`)} />
          <Slider label="Look ahead" min={30} max={500} step={10} value={f.lookAhead} onChange={v => set({ lookAhead: v })} onDone={done} format={ft} />
          <Button small onClick={() => changeDoc(() => ({ flyover: undefined }))} disabled={!doc.flyover} testid="flyover-defaults">Default flight</Button>
        </>
      )}
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
              <button className="p-1 rounded text-zinc-400 hover:text-red-400 hover:bg-zinc-800 disabled:opacity-30" aria-label={`Remove keyframe ${i + 1}`} disabled={keys.length <= 2} onClick={() => setKeys(keys.filter((_, j) => j !== i))}><Trash2 size={14} /></button>
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
