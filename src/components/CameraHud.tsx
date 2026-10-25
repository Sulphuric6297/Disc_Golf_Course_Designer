// Flying the camera yourself, first person, to make a hole's flyover: moved with the keyboard (on a
// phone, a thumb stick and up and down buttons), turned by dragging the view, and a keyframe added
// right where it is, looking where it looks.
import { useEffect, useState, type PointerEvent as RPointerEvent } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Check, Play, Plus, RefreshCw, Square, Trash2, X } from "lucide-react";
import { holeLabel } from "../lib/course";
import { LENS, flyoverOf, lensLabel } from "../lib/flight";
import { fmtDist } from "../lib/units";
import { getDoc, updateHole, useCourse, useEditor } from "../state/course";
import { getView } from "../state/view";
import { toast } from "../state/toast";
import type { FlyKey } from "../types";
import { HelpLink } from "./ui";

/** The hole being flown and its keyframes, as they are now. */
const now = () => {
  const ed = useEditor.getState();
  const hole = getDoc().holes.find(h => h.id === ed.teeView);
  const keys = hole?.flyKeys ?? [];
  const at = ed.flyKey !== null && ed.flyKey < keys.length ? ed.flyKey : null;
  return { ed, hole, keys, at };
};

/** A keyframe where the camera is, after the picked one (or at the end); it's picked then. */
export const addKeyHere = () => {
  const { ed, hole, keys, at } = now();
  const k = getView()?.freeKey();
  if (!hole || !k) return;
  const i = at !== null ? at + 1 : keys.length;
  updateHole(hole.id, { flyKeys: [...keys.slice(0, i), k, ...keys.slice(i)] });
  ed.set({ flyKey: i });
  if (keys.length === 0) toast("Keyframe 1 added. Move somewhere else and add another, and the flyover goes from one to the next.");
};

/** The picked keyframe moved to where the camera is now (its time kept). */
const updateKeyHere = () => {
  const { hole, keys, at } = now();
  const k = getView()?.freeKey();
  if (!hole || !k || at === null) return;
  updateHole(hole.id, { flyKeys: keys.map((o, j) => (j === at ? { ...k, ...(o.secs !== undefined ? { secs: o.secs } : {}) } : o)) });
};

/** The camera put at the keyframe `d` on from the picked one. */
const jump = (d: number) => {
  const { ed, keys, at } = now();
  if (!keys.length) return;
  const i = Math.max(0, Math.min(keys.length - 1, at === null ? (d > 0 ? 0 : keys.length - 1) : at + d));
  getView()?.freeGo(keys[i]);
  ed.set({ flyKey: i });
};

/** Whether the picked keyframe can go: not one of a flight's last two (the hole would quietly fly
 * by itself again; the Flyover section has the same rule). */
const removable = (count: number) => count !== 2;
const REMOVE_NO = "A flight needs two keyframes";

const removeKey = () => {
  const { ed, hole, keys, at } = now();
  if (!hole || at === null || !removable(keys.length)) return;
  const next = keys.filter((_, j) => j !== at);
  updateHole(hole.id, { flyKeys: next.length ? next : undefined });
  ed.set({ flyKey: next.length ? Math.max(0, at - 1) : null });
};

/** The keys that move the camera: forward, right and up for each. */
const MOVES: Record<string, [number, number, number]> = {
  w: [1, 0, 0], arrowup: [1, 0, 0], s: [-1, 0, 0], arrowdown: [-1, 0, 0],
  d: [0, 1, 0], arrowright: [0, 1, 0], a: [0, -1, 0], arrowleft: [0, -1, 0],
  e: [0, 0, 1], " ": [0, 0, 1], q: [0, 0, -1], c: [0, 0, -1]
};

/** Which way a keyframe looks (a unit vector), over the ground as the map has it. */
const facing = (k: FlyKey) => {
  const g = (x: number, y: number) => getView()?.groundHeight(x, y) ?? 0;
  const dx = k.lookX - k.x, dy = k.lookY - k.y, dz = g(k.lookX, k.lookY) + (k.lookAlt ?? 3) - (g(k.x, k.y) + k.alt);
  const l = Math.hypot(dx, dy, dz) || 1;
  return [dx / l, dy / l, dz / l];
};

/** Whether the camera (`cam`) is just where keyframe `k` puts it, looking the same way with the
 * same lens (nothing to update). The way it looks is compared, not the spot it looks at: the same
 * view can be aimed at a point nearer or farther along the same line. */
const same = (cam: FlyKey | null | undefined, k: FlyKey | null | undefined, lens: number) => {
  if (!cam || !k) return false;
  const a = facing(cam), b = facing(k);
  const turned = Math.acos(Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2])) * (180 / Math.PI);
  return Math.hypot(cam.x - k.x, cam.y - k.y) < 0.6 && Math.abs(cam.alt - k.alt) < 0.6 && turned < 0.6 && Math.round(cam.fov ?? lens) === Math.round(k.fov ?? lens);
};

/** A thumb stick: pushed, the camera moves that way (up is forward), faster the further. */
function Stick() {
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const R = 42;
  const down = (e: RPointerEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    const r = el.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const at = (ev: { clientX: number; clientY: number }) => {
      let dx = ev.clientX - cx, dy = ev.clientY - cy;
      const d = Math.hypot(dx, dy);
      if (d > R) { dx *= R / d; dy *= R / d; }
      setKnob({ x: dx, y: dy });
      getView()?.freeMove({ f: -dy / R, s: dx / R });
    };
    at(e);
    const move = (ev: PointerEvent) => { if (ev.pointerId === e.pointerId) at(ev); };
    const up = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return;
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      setKnob({ x: 0, y: 0 });
      getView()?.freeMove({ f: 0, s: 0 });
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
  };
  return (
    <div className="relative w-[124px] h-[124px] rounded-full bg-black/35 ring-1 ring-white/25 backdrop-blur-sm touch-none pointer-events-auto" onPointerDown={down} aria-label="Move the camera" role="application" data-testid="cam-stick">
      <div className="absolute left-1/2 top-1/2 w-[52px] h-[52px] -ml-[26px] -mt-[26px] rounded-full bg-white/80 shadow-lg" style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }} />
    </div>
  );
}

/** Held, the camera rises (1) or sinks (-1). */
function Lift({ dir }: { dir: 1 | -1 }) {
  const go = (on: boolean) => getView()?.freeMove({ u: on ? dir : 0 });
  return (
    <button
      className="w-14 h-14 rounded-2xl bg-black/35 ring-1 ring-white/25 backdrop-blur-sm text-white flex items-center justify-center active:bg-white/25 touch-none pointer-events-auto"
      aria-label={dir > 0 ? "Up" : "Down"}
      onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); go(true); }}
      onPointerUp={() => go(false)}
      onPointerCancel={() => go(false)}
      onContextMenu={e => e.preventDefault()}
      data-testid={dir > 0 ? "cam-up" : "cam-down"}
    >
      {dir > 0 ? <ChevronUp size={26} /> : <ChevronDown size={26} />}
    </button>
  );
}

export function CameraHud({ compact = false }: { compact?: boolean }) {
  const doc = useCourse(s => s.doc);
  const ed = useEditor();
  const hole = doc.holes.find(h => h.id === ed.teeView);
  const keys = hole?.flyKeys ?? [];
  const at = ed.flyKey !== null && ed.flyKey < keys.length ? ed.flyKey : null;
  const [lens, setLens] = useState(60);
  const [alt, setAlt] = useState(0);
  const [moved, setMoved] = useState(false);
  const flying = ed.flyover;
  // (from the picked keyframe, or from the tee; back to the plain view when done)
  useEffect(() => {
    let raf = requestAnimationFrame(() => {
      const v = getView();
      const { keys, at } = now();
      v?.freeCam(at !== null ? keys[at] : null);
      if (v) setLens(v.freeLens());
    });
    return () => {
      cancelAnimationFrame(raf);
      getView()?.freeCam(false);
      raf = 0;
    };
  }, [ed.teeView]);
  // (how high it is and its lens, and whether it's been moved off the picked keyframe)
  useEffect(() => {
    const t = window.setInterval(() => {
      const v = getView(), k = v?.freeKey();
      if (!k) return;
      setAlt(k.alt);
      setLens(k.fov ?? 60);
      const { keys, at, hole } = now();
      setMoved(at !== null && !same(k, keys[at], flyoverOf(getDoc(), hole).fov));
    }, 150);
    return () => window.clearInterval(t);
  }, []);
  // The keyboard: held keys move it; Enter adds, U updates, [ and ] go to the keyframe before or
  // after, Esc is done. (Ahead of the app's own keys while this shows)
  useEffect(() => {
    const held = new Set<string>();
    let fast = false;
    const apply = () => {
      const m = [0, 0, 0];
      for (const k of held) MOVES[k].forEach((v, j) => (m[j] += v));
      getView()?.freeMove({ f: Math.sign(m[0]), s: Math.sign(m[1]), u: Math.sign(m[2]), fast });
    };
    const typing = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      return !!t && (t.tagName === "TEXTAREA" || t.tagName === "SELECT" || (t.tagName === "INPUT" && (t as HTMLInputElement).type !== "range") || t.isContentEditable);
    };
    const down = (e: KeyboardEvent) => {
      if (typing(e) || e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key.toLowerCase();
      fast = e.shiftKey;
      const busy = useEditor.getState().flyover;
      if (k === "escape") { e.preventDefault(); e.stopPropagation(); if (busy) useEditor.getState().set({ flyover: false }); else useEditor.getState().set({ teeView: null, flyCam: false, flyover: false }); return; }
      if (busy) return;
      if (MOVES[k]) { held.add(k); apply(); e.preventDefault(); e.stopPropagation(); return; }
      if (k === "shift") { apply(); return; }
      if (e.repeat) return;
      if (k === "enter" || k === "k") { e.preventDefault(); e.stopPropagation(); addKeyHere(); return; }
      if (k === "u") { e.preventDefault(); e.stopPropagation(); updateKeyHere(); return; }
      if (k === "[" || k === "]") { e.preventDefault(); e.stopPropagation(); jump(k === "[" ? -1 : 1); }
    };
    const up = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      fast = e.shiftKey;
      if (MOVES[k]) { held.delete(k); e.preventDefault(); }
      apply();
    };
    const clear = () => { held.clear(); fast = false; apply(); };
    window.addEventListener("keydown", down, true);
    window.addEventListener("keyup", up, true);
    window.addEventListener("blur", clear);
    return () => {
      window.removeEventListener("keydown", down, true);
      window.removeEventListener("keyup", up, true);
      window.removeEventListener("blur", clear);
      clear();
    };
  }, []);
  if (!hole) return null;
  const u = doc.units;
  const done = () => ed.set({ teeView: null, flyCam: false, flyover: false });
  const play = () => ed.set({ flyover: true });
  const setLensTo = (v: number) => setLens(getView()?.freeLens(v) ?? v);
  const go = (i: number) => { getView()?.freeGo(keys[i]); ed.set({ flyKey: i }); };
  const addBtn = (
    <button className={`shrink-0 rounded-full ${compact ? "flex-[2] h-11 px-4 text-[14px] justify-center" : "h-9 px-4 text-[13.5px]"} font-bold flex items-center gap-1.5 bg-orange-500 text-zinc-950 hover:bg-orange-400`} onClick={addKeyHere} title={at !== null ? `Add a keyframe here, after keyframe ${at + 1} (Enter)` : "Add a keyframe right here, looking where the camera looks (Enter)"} data-testid="cam-add"><Plus size={16} /> Add keyframe</button>
  );
  // (the arrows a thumb's size on a phone)
  const arrow = `shrink-0 ${compact ? "w-11 h-11 rounded-xl" : "w-8 h-8 rounded-lg"} text-zinc-300 hover:bg-white/10 active:bg-white/15 flex items-center justify-center disabled:opacity-30`;
  // The keyframes in order, along the bottom with the camera's buttons: tap one to go to it (and
  // change it), Add keyframe at the end to add one where the camera is
  const strip = (
    <div className="flex items-center gap-1.5 min-w-0">
      <button className={arrow} aria-label="Keyframe before ( [ )" title="Keyframe before ( [ )" disabled={!keys.length} onClick={() => jump(-1)}><ChevronLeft size={18} /></button>
      <div className="flex items-center gap-1.5 overflow-x-auto min-w-0 py-0.5 dg-scroll" data-testid="cam-keys">
        {keys.map((_, i) => (
          <button key={i} className={`relative shrink-0 ${compact ? "w-11 h-11 text-[15px]" : "w-9 h-9 text-[13.5px]"} rounded-xl font-bold text-white ${i === at ? "bg-orange-500 ring-2 ring-white" : "bg-sky-600/90 hover:bg-sky-500"}`} aria-label={`Go to keyframe ${i + 1}`} aria-pressed={i === at} title={`Keyframe ${i + 1}: go to it`} onClick={() => go(i)}>
            {i + 1}
            {i === at && moved && <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-yellow-300 ring-2 ring-zinc-900" aria-hidden />}
          </button>
        ))}
        {!keys.length && <span className="text-[12.5px] text-zinc-300 px-1 whitespace-nowrap">No keyframes yet</span>}
      </div>
      <button className={arrow} aria-label="Keyframe after ( ] )" title="Keyframe after ( ] )" disabled={!keys.length} onClick={() => jump(1)}><ChevronRight size={18} /></button>
      {!compact && <span className="ml-auto" />}
      {!compact && addBtn}
    </div>
  );
  const pill = "rounded-full px-3.5 py-2 text-[13.5px] font-semibold flex items-center gap-1.5 text-white hover:bg-white/10 disabled:opacity-40 disabled:hover:bg-transparent";
  const title = <><span className="truncate min-w-0">Camera · Hole {holeLabel(doc, hole.id)}</span><HelpLink topic="fly-camera" label="Flying the camera yourself" /></>;
  const status = at !== null ? `Keyframe ${at + 1} of ${keys.length}${moved ? ". Moved. Update puts it here." : ""}` : keys.length ? "Pick a keyframe to go to it and change it" : "Fly somewhere you like, then add a keyframe";
  const playTitle = keys.length < 2 ? "Add a second keyframe to play the flight." : "Fly through the keyframes";
  const canRemove = removable(keys.length);
  const readout = `${fmtDist(alt, u)} up · lens ${lensLabel(lens)}`;
  if (flying)
    return (
      <div className="absolute inset-0 pointer-events-none z-20" data-pov-ui>
        <div className="absolute bottom-[max(16px,env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 pointer-events-auto glass rounded-full p-1 border border-white/10 shadow-2xl">
          <button className={pill} onClick={() => ed.set({ flyover: false })} data-testid="cam-stop"><Square size={14} /> Stop</button>
        </div>
      </div>
    );
  if (compact)
    return (
      <div className="absolute inset-0 pointer-events-none z-20" data-pov-ui data-testid="camera-hud">
        <div className="absolute left-2 right-2 top-[max(8px,env(safe-area-inset-top))] pointer-events-auto glass rounded-2xl px-3 py-2 text-white shadow-2xl border border-white/10">
          <div className="flex items-center gap-2">
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-semibold flex items-center gap-1.5 min-w-0">{title}</div>
              <div className="text-[12px] text-zinc-300 tabular-nums" data-testid="cam-readout">{readout}</div>
            </div>
            <button className="h-11 px-3.5 rounded-xl bg-white/10 text-[14px] font-semibold flex items-center gap-1" onClick={done} data-testid="cam-done"><Check size={17} /> Done</button>
          </div>
          <input aria-label="Lens" type="range" min={LENS.min} max={LENS.max} value={lens} onChange={e => setLensTo(Number(e.target.value))} className="slider w-full h-7 mt-1" />
        </div>
        {/* (above the stick and the up and down arrows) */}
        <div className="absolute left-1/2 -translate-x-1/2 bottom-[calc(max(10px,env(safe-area-inset-bottom))+292px)] w-max max-w-[calc(100%-24px)] text-center text-[13px] text-white/90 bg-black/45 rounded-2xl px-3 py-1" data-testid="cam-hint">Drag to look around. The stick moves you, the arrows go up and down.</div>
        <div className="absolute left-3 bottom-[calc(max(10px,env(safe-area-inset-bottom))+156px)]"><Stick /></div>
        <div className="absolute right-3 bottom-[calc(max(10px,env(safe-area-inset-bottom))+156px)] flex flex-col gap-2"><Lift dir={1} /><Lift dir={-1} /></div>
        <div className="absolute left-2 right-2 bottom-[max(8px,env(safe-area-inset-bottom))] pointer-events-auto glass rounded-[22px] p-2 border border-white/10 shadow-2xl">
          {strip}
          <div className="mt-1.5 px-1 text-[12px] text-zinc-300 truncate" data-testid="cam-status">{status}</div>
          <div className="mt-1.5 flex items-center gap-1">
            {addBtn}
            {at !== null && <button className="flex-1 h-11 rounded-2xl bg-white/[0.1] text-white text-[13px] font-semibold flex items-center justify-center gap-1 active:bg-white/20 disabled:opacity-40" onClick={updateKeyHere} disabled={!moved} data-testid="cam-update"><RefreshCw size={14} /> Update {at + 1}</button>}
            {at !== null && <button className="w-11 h-11 rounded-2xl text-white flex items-center justify-center active:bg-white/15 disabled:opacity-40" onClick={removeKey} disabled={!canRemove} aria-label={`Remove keyframe ${at + 1}`} title={canRemove ? `Remove keyframe ${at + 1}` : REMOVE_NO} data-testid="cam-remove"><Trash2 size={16} /></button>}
            <button className="w-11 h-11 rounded-2xl text-white flex items-center justify-center active:bg-white/15 disabled:opacity-40" onClick={play} disabled={keys.length < 2} aria-label="Play" title={playTitle} data-testid="cam-play"><Play size={17} /></button>
          </div>
        </div>
      </div>
    );
  return (
    <div className="absolute inset-0 pointer-events-none z-20" data-pov-ui data-testid="camera-hud">
      <div className="absolute top-4 left-4 pointer-events-auto glass rounded-full pl-4 pr-1.5 py-1.5 text-white shadow-2xl border border-white/10 flex items-center gap-3">
        <div className="text-[14px] font-semibold flex items-center gap-1.5">{title}</div>
        <div className="text-[12.5px] text-zinc-300 tabular-nums" data-testid="cam-readout">{readout}</div>
        <button className={pill} onClick={done} title="Back to the map (Esc)" data-testid="cam-done"><X size={15} /> Done</button>
      </div>
      <div className="absolute bottom-[136px] left-1/2 -translate-x-1/2 text-[12px] text-white/85 bg-black/45 rounded-lg px-2.5 py-1 whitespace-nowrap">W A S D or the arrows to move · Space or E up, Q down · Shift for faster · drag to look · scroll for the lens</div>
      <div className="absolute bottom-5 left-1/2 -translate-x-1/2 w-[min(760px,calc(100%-32px))] pointer-events-auto glass rounded-[24px] p-2 border border-white/10 shadow-2xl">
        {strip}
        <div className="mt-1.5 flex items-center gap-1">
          <div className="flex-1 min-w-0 px-2 text-[12.5px] text-zinc-300 truncate" data-testid="cam-status">{status}</div>
          {at !== null && <button className={`${pill} bg-white/[0.08]`} onClick={updateKeyHere} disabled={!moved} title={`Move keyframe ${at + 1} to here (U)`} data-testid="cam-update"><RefreshCw size={14} /> Update {at + 1}</button>}
          {at !== null && <button className={`${pill} hover:!text-red-300`} onClick={removeKey} disabled={!canRemove} aria-label={`Remove keyframe ${at + 1}`} title={canRemove ? `Remove keyframe ${at + 1}` : REMOVE_NO} data-testid="cam-remove"><Trash2 size={14} /></button>}
          <label className="flex items-center gap-2 px-2 text-[12.5px] text-zinc-300">Lens<input aria-label="Lens" type="range" min={LENS.min} max={LENS.max} value={lens} onChange={e => setLensTo(Number(e.target.value))} className="slider w-24" /></label>
          <button className={pill} onClick={play} disabled={keys.length < 2} title={playTitle} data-testid="cam-play"><Play size={14} /> Play</button>
        </div>
      </div>
    </div>
  );
}
