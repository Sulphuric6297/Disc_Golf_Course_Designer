// A hole's Flyover panel, the same in the hole's panel and from the tee's Settings: Automatic (the
// camera's height, speed and lens, where it starts) or through keyframes (a timeline of them, the
// picked one's height, lens and time, the camera to fly yourself, the keyframes moved in 3D); and
// what shows while it flies.
import { ChevronLeft, ChevronRight, Move3d, Play, Plus, Trash2, Video } from "lucide-react";
import { useRef, useState, type PointerEvent as RPointerEvent, type ReactNode } from "react";
import { LENS, flyoverOf, insertKey, keyTimes, lensLabel } from "../lib/flight";
import { holeLabel } from "../lib/course";
import { fmtDist } from "../lib/units";
import { changeDoc, updateHole, useCourse, useEditor } from "../state/course";
import { select } from "../state/actions";
import type { FlyKey, FlyoverSettings, FlyShow, Hole } from "../types";
import { getView } from "../state/view";
import { toast } from "../state/toast";
import { ApplyToHoles } from "./ApplyToHoles";
import { Button, Field, Segmented, Slider, Toggle } from "./ui";

/** What a flyover can show, in the order the switches are listed. */
const FLY_SHOW: [FlyShow, string][] = [
  ["title", "Big title at the start"],
  ["badge", "Hole number in the corner"],
  ["pinDistance", "Distance to the pin"],
  ["courseName", "Course name"],
  ["playLine", "Throw line"],
  ["circle", "Putting circle"],
  ["ob", "OB"],
  ["otherHoles", "Other holes' lines and circles"],
  ["walks", "Paths to the next tee"]
];

/** A part folded away, its name and a few words on what's in it. */
const Fold = ({ title, note, testid, children }: { title: string; note?: string; testid?: string; children: ReactNode }) => (
  <details className="mt-3 rounded-[14px] bg-white/[0.06] group" data-testid={testid}>
    <summary className="cursor-pointer list-none flex items-center justify-between gap-2 px-2.5 py-2 text-[13px] font-medium text-zinc-100">
      {title}
      <span className="flex items-center gap-2 text-xs text-zinc-500">{note}<span className="group-open:rotate-90 transition-transform">›</span></span>
    </summary>
    <div className="px-2.5 pb-2.5">{children}</div>
  </details>
);

/** The keyframes along the flight's time: each a numbered mark to pick, or (after the first) to
 * drag to change when it comes, the ones either side staying put. */
function KeyTimeline({ times, picked, onPick, onRetime }: { times: number[]; picked: number | null; onPick: (i: number) => void; onRetime: (i: number, t: number, end: boolean) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const dur = times[times.length - 1] || 1;
  // (a little room after the last, to drag it later)
  const span = dur * 1.15;
  const down = (i: number) => (e: RPointerEvent) => {
    onPick(i);
    const el = ref.current;
    if (i === 0 || !el) return;
    e.preventDefault();
    const r = el.getBoundingClientRect();
    const lo = times[i - 1] + 0.5, hi = i + 1 < times.length ? times[i + 1] - 0.5 : span;
    const tAt = (x: number) => Math.round(Math.min(hi, Math.max(lo, ((x - r.left) / r.width) * span)) * 10) / 10;
    let t = times[i];
    const move = (ev: PointerEvent) => { t = tAt(ev.clientX); onRetime(i, t, false); };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      onRetime(i, t, true);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  };
  return (
    <div className="pt-1 pb-0.5" data-testid="fly-timeline">
      <div ref={ref} className="relative h-8 touch:h-11 mx-3">
        <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-1 rounded-full bg-white/[0.12]" />
        <div className="absolute left-0 top-1/2 -translate-y-1/2 h-1 rounded-full bg-sky-500/60" style={{ width: `${(dur / span) * 100}%` }} />
        {times.map((t, i) => (
          <button
            key={i}
            className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-[22px] h-[22px] touch:w-8 touch:h-8 rounded-md text-[11px] touch:text-[13px] font-bold text-white border-2 border-white shadow ${i === picked ? "bg-orange-500" : "bg-sky-600"} ${i ? "cursor-ew-resize" : ""} touch-none focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-300`}
            style={{ left: `${(t / span) * 100}%`, zIndex: i === picked ? 2 : 1 }}
            onPointerDown={down(i)}
            onKeyDown={e => {
              // (arrows: a tenth of a second sooner or later)
              if (!i || (e.key !== "ArrowLeft" && e.key !== "ArrowRight")) return;
              e.preventDefault();
              const lo = times[i - 1] + 0.5, hi = i + 1 < times.length ? times[i + 1] - 0.5 : span;
              onRetime(i, Math.round(Math.min(hi, Math.max(lo, t + (e.key === "ArrowLeft" ? -0.1 : 0.1))) * 10) / 10, true);
            }}
            aria-label={`Keyframe ${i + 1}, at ${t.toFixed(1)} s`}
            aria-pressed={i === picked}
            title={i ? `Keyframe ${i + 1} at ${t.toFixed(1)} s: drag to change when it comes` : "Keyframe 1: the start"}
            data-testid="fly-key"
          >{i + 1}</button>
        ))}
      </div>
      <div className="flex justify-between text-[11px] text-zinc-500 tabular-nums px-0.5"><span>0 s</span><span>{dur.toFixed(1)} s</span></div>
    </div>
  );
}

/** Flying the camera yourself, from keyframe `at` of a hole (null: from the tee). */
export const cameraFrom = (holeId: string, at: number | null) => useEditor.getState().set({ teeView: holeId, teeViewTee: null, flyover: false, flyCam: true, flyKey: at });

/** A hole's keyframes on the map, tilted into 3D: each camera at its height, to drag. */
export const keysIn3D = (holeId: string) => {
  const ed = useEditor.getState();
  ed.set({ teeView: null, flyover: false, flyCam: false, teeSettings: false, view: "3d", ...(ed.step !== "design" ? { step: "design" as const } : {}) });
  select(holeId);
  requestAnimationFrame(() => getView()?.fitHole(holeId));
};

/** Which flyover settings change: this hole's own, or the ones for all holes. They start on the
 * hole's own when it has some. */
const useScope = (hole: Hole) => useState<"hole" | "course">(hole.flyover ? "hole" : "course");

/** What shows while it flies: the switches, for all holes or this hole (`scope`; its choice here
 * unless `chosen` says it's chosen above), Apply to holes and Reset. */
function OnScreen({ hole, scope, setScope, chosen = false }: { hole: Hole; scope: "hole" | "course"; setScope: (v: "hole" | "course") => void; chosen?: boolean }) {
  const doc = useCourse(s => s.doc);
  const forHole = scope === "hole";
  const f = flyoverOf(doc, forHole ? hole : undefined);
  // A switch: one undo step
  const showPart = (k: FlyShow, v: boolean) =>
    changeDoc(d => (forHole ? { holes: d.holes.map(h => (h.id === hole.id ? { ...h, flyover: { ...h.flyover, [k]: v } } : h)) } : { flyover: { ...d.flyover, [k]: v } }));
  const on = FLY_SHOW.filter(([k]) => f[k]).length;
  return (
    <Fold title="What's on screen" note={`${on} of ${FLY_SHOW.length}`} testid="flyover-onscreen">
      {!chosen && <Field label="These are for"><Segmented label="These are for" value={scope} onChange={setScope} options={[{ value: "course", label: "All holes" }, { value: "hole", label: `Hole ${holeLabel(doc, hole.id)}` }]} /></Field>}
      <div className="flex flex-col mb-2" data-testid="flyover-show">
        {FLY_SHOW.map(([k, label]) => <Toggle key={k} label={label} checked={f[k]} onChange={v => showPart(k, v)} />)}
      </div>
      {/* (from a hole: its settings to the holes picked; for all holes: the picked holes follow them) */}
      <div className="flex flex-wrap items-start gap-2">
        <ApplyToHoles
          fromId={forHole ? hole.id : undefined}
          testid="flyover-apply"
          apply={ids => changeDoc(d => ({ holes: d.holes.map(h => (ids.includes(h.id) ? { ...h, flyover: forHole && hole.flyover ? { ...hole.flyover } : undefined } : h)) }))}
        />
        {/* (a hole's own back to the all-holes ones; those back to the app's own) */}
        {forHole
          ? <Button small onClick={() => updateHole(hole.id, { flyover: undefined })} disabled={!hole.flyover} testid="flyover-hole-reset">Reset</Button>
          : <Button small onClick={() => changeDoc(() => ({ flyover: undefined }))} disabled={!doc.flyover} testid="flyover-defaults">Reset</Button>}
      </div>
    </Fold>
  );
}

/** A hole flying by itself: the camera's height, speed and lens (this hole's own or for all
 * holes), where it starts folded under them, and the camera to fly yourself and add keyframes. */
function AutoFlight({ hole }: { hole: Hole }) {
  const doc = useCourse(s => s.doc);
  const [scope, setScope] = useScope(hole);
  const forHole = scope === "hole";
  const f = flyoverOf(doc, forHole ? hole : undefined);
  const ft = (v: number) => fmtDist(v, doc.units);
  // (live while a slider moves; one undo step when it is let go)
  const set = (patch: Partial<FlyoverSettings>) =>
    forHole
      ? changeDoc(d => ({ holes: d.holes.map(h => (h.id === hole.id ? { ...h, flyover: { ...h.flyover, ...patch } } : h)) }), false)
      : changeDoc(d => ({ flyover: { ...d.flyover, ...patch } }), false);
  const done = () => useCourse.getState().commit();
  const all = hole.flyKeys ?? [];
  return (
    <div className="mt-3">
      <Field label="These are for"><Segmented label="These are for" value={scope} onChange={setScope} options={[{ value: "course", label: "All holes" }, { value: "hole", label: `Hole ${holeLabel(doc, hole.id)}` }]} /></Field>
      <Slider label="Camera height" min={4} max={250} step={1} value={f.height} onChange={v => set({ height: v })} onDone={done} format={ft} />
      <Slider label="Speed" min={0.25} max={3} step={0.05} value={f.speed} onChange={v => set({ speed: v })} onDone={done} format={v => `${Math.round(v * 100) / 100}×`} />
      <Slider label="Lens" min={LENS.min} max={LENS.max} value={f.fov} onChange={v => set({ fov: v })} onDone={done} format={lensLabel} />
      <Fold title="Where the camera starts" note="Behind, side, ahead" testid="flyover-start">
        <Slider label="Camera starts behind the tee" min={0} max={400} step={5} value={f.behind} onChange={v => set({ behind: v })} onDone={done} format={ft} />
        <Slider label="Camera off to the side" min={-200} max={200} step={5} value={f.side} onChange={v => set({ side: v })} onDone={done} format={v => (v === 0 ? "On the line" : `${ft(Math.abs(v))} ${v > 0 ? "right" : "left"}`)} />
        <Slider label="Camera looks ahead" min={30} max={500} step={10} value={f.lookAhead} onChange={v => set({ lookAhead: v })} onDone={done} format={ft} />
      </Fold>
      <div className="mt-2.5"><Button full onClick={() => cameraFrom(hole.id, all.length ? all.length - 1 : null)} testid="fly-camera"><Video size={15} /> Fly the camera and add keyframes</Button></div>
      <OnScreen hole={hole} scope={scope} setScope={setScope} chosen />
    </div>
  );
}

/** A hole flying through its keyframes: a timeline of them (pick one; drag it to change when it
 * comes), the picked one's height, lens and time, the camera to fly yourself, the keyframes moved
 * in 3D, a new one, and playing it. */
function KeyFlight({ hole, keys }: { hole: Hole; keys: FlyKey[] }) {
  const doc = useCourse(s => s.doc);
  const pickedRaw = useEditor(e => e.flyKey);
  const setEd = useEditor(e => e.set);
  const [scope, setScope] = useScope(hole);
  const fs = flyoverOf(doc, hole);
  const ground = (x: number, y: number) => getView()?.groundHeight(x, y) ?? 0;
  const times = keyTimes(keys, fs, ground);
  const p = pickedRaw !== null ? Math.min(pickedRaw, keys.length - 1) : null;
  const k = p !== null ? keys[p] : null;
  const setKeys = (next: FlyKey[], history = true) => updateHole(hole.id, { flyKeys: next }, history);
  // (live while a slider or mark moves; one undo step when it's let go)
  const edit = (i: number, patch: Partial<FlyKey>) => setKeys(keys.map((k, j) => (j === i ? { ...k, ...patch } : k)), false);
  const done = () => useCourse.getState().commit();
  const add = () => {
    const r = insertKey(keys, p ?? keys.length - 2, fs, ground);
    setKeys(r.keys);
    setEd({ flyKey: r.at });
  };
  const remove = () => {
    if (p === null || keys.length <= 2) return;
    setKeys(keys.filter((_, j) => j !== p));
    setEd({ flyKey: Math.max(0, p - 1) });
  };
  // (a mark dragged to time t: it and the one after split the time between their neighbours)
  const r1 = (v: number) => Math.round(v * 10) / 10;
  const retime = (i: number, t: number, end: boolean) => {
    setKeys(keys.map((k, j) => (j === i ? { ...k, secs: r1(t - times[i - 1]) } : j === i + 1 ? { ...k, secs: r1(times[i + 1] - t) } : k)), false);
    if (end) done();
  };
  const step = "w-8 h-8 touch:w-11 touch:h-11 rounded-lg flex items-center justify-center text-zinc-300 hover:bg-white/[0.09] hover:text-zinc-50 disabled:opacity-30 disabled:hover:bg-transparent";
  return (
    <div className="mt-2" data-testid="fly-keys">
      <KeyTimeline times={times} picked={p} onPick={i => setEd({ flyKey: i })} onRetime={retime} />
      {k && p !== null && (
        <div className="mt-1.5 rounded-[14px] bg-white/[0.06] px-2.5 pt-1.5 pb-0.5" data-testid="fly-key-card">
          <div className="flex items-center gap-0.5 mb-1.5">
            <button className={step} aria-label="Previous keyframe" disabled={p === 0} onClick={() => setEd({ flyKey: p - 1 })}><ChevronLeft size={17} /></button>
            <span className="flex-1 text-center text-[13px] font-semibold text-zinc-100"><span data-testid="fly-key-title">Keyframe {p + 1}</span> <span className="font-normal text-zinc-400 tabular-nums">· {times[p].toFixed(1)} s</span></span>
            <button className={step} aria-label="Next keyframe" disabled={p === keys.length - 1} onClick={() => setEd({ flyKey: p + 1 })}><ChevronRight size={17} /></button>
            <button className={`${step} hover:!text-red-400`} aria-label={`Remove keyframe ${p + 1}`} title={keys.length <= 2 ? "A flight needs two keyframes" : "Remove it"} disabled={keys.length <= 2} onClick={remove}><Trash2 size={15} /></button>
          </div>
          <Slider label="Height" min={2} max={Math.max(400, Math.round(k.alt))} value={Math.round(k.alt)} onChange={v => edit(p, { alt: v })} onDone={done} format={v => fmtDist(v, doc.units)} />
          <Slider label="Lens" min={LENS.min} max={LENS.max} value={k.fov ?? fs.fov} onChange={v => edit(p, { fov: v })} onDone={done} format={lensLabel} />
          {p > 0 && <Slider label={`Time from keyframe ${p}`} min={0.5} max={Math.max(30, Math.ceil(times[p] - times[p - 1]))} step={0.1} value={r1(times[p] - times[p - 1])} onChange={v => edit(p, { secs: r1(v) })} onDone={done} format={v => `${v.toFixed(1)} s`} />}
        </div>
      )}
      <div className="mt-2.5"><Button full tone="primary" onClick={() => cameraFrom(hole.id, p ?? 0)} testid="fly-camera"><Video size={15} /> Fly the camera</Button></div>
      <div className="grid grid-cols-3 gap-1.5 mt-1.5">
        <Button small onClick={() => keysIn3D(hole.id)} testid="fly-in-3d" title="On the map, tilted: drag each camera up, down or along"><Move3d size={13} /> In 3D</Button>
        <Button small onClick={add} testid="fly-key-add" title={p !== null ? `A new one after keyframe ${p + 1}` : undefined}><Plus size={13} /> Keyframe</Button>
        <Button small onClick={() => setEd({ teeView: hole.id, flyover: true, flyCam: false, teeSettings: false })} testid="fly-preview"><Play size={13} /> Play</Button>
      </div>
      <OnScreen hole={hole} scope={scope} setScope={setScope} />
    </div>
  );
}

/** A hole's Flyover panel: Automatic, or through keyframes, and what's on screen. The same in the
 * hole's panel and from the tee's Settings. */
export function HoleFlight({ hole }: { hole: Hole }) {
  const setEd = useEditor(e => e.set);
  const all = hole.flyKeys ?? [];
  const keys = all.length >= 2 ? all : null;
  const byHand = () => {
    const start = getView()?.autoKeys(hole.id);
    if (start) { updateHole(hole.id, { flyKeys: start }); setEd({ flyKey: 0 }); }
  };
  // (back to Automatic: the keyframes go, said so, with Undo)
  const automatic = () => {
    if (!keys) return;
    updateHole(hole.id, { flyKeys: undefined });
    toast("Keyframes removed. This hole flies by itself again.", "info", true);
  };
  return (
    <div data-testid="hole-flight">
      <div data-testid="flyover-settings">
        <Segmented label="Flyover" value={keys ? "keys" : "auto"} onChange={v => (v === "keys" ? byHand() : automatic())} options={[{ value: "auto", label: "Automatic" }, { value: "keys", label: "Keyframes" }]} />
        {/* (a new hole, or keys gone: its own settings start again) */}
        {keys ? <KeyFlight key={hole.id} hole={hole} keys={keys} /> : <AutoFlight key={hole.id} hole={hole} />}
      </div>
    </div>
  );
}
