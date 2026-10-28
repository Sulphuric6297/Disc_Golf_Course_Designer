// What shows over the view from the tee or a flyover: the hole's numbers and the controls.
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Clapperboard, Plane, Settings2, Square, Video, X } from "lucide-react";
import { useAllowed } from "../auth/perms";
import { TEE_LEVELS } from "../constants";
import { activeLayout, holeLabel } from "../lib/course";
import { courseStats, holeStats } from "../lib/holeStats";
import { fmtDist, fmtElev } from "../lib/units";
import { useCourse, useEditor } from "../state/course";
import { useExportJob } from "../state/exportJob";
import { recordVideo, useVideoSettings } from "../state/video";
import { VIDEO_SIZES } from "../lib/video";
import type { Hole, TeeItem } from "../types";
import { ElevationProfile } from "./ElevationProfile";
import { SceneButton } from "./ScenePanel";
import { cameraFrom, HoleFlight } from "./FlyoverSettings";
import { HelpLink } from "./ui";

/** While a flyover waits for its pictures: the hole's name and numbers and a thin moving bar,
 * over the view (shown at once; it fades as the flight begins), and Cancel (it covers the bar
 * along the bottom, and the wait can be long). */
const STAGE = { map: "Painting the map", detail: "Sharpening the hole", textures: "Loading textures" } as const;
function FlyoverLoading({ title, facts, on, stage, onCancel }: { title: string; facts: string; on: boolean; stage: keyof typeof STAGE | null; onCancel: () => void }) {
  // (how long each stage takes: so a slow one can be told)
  const [secs, setSecs] = useState(0);
  useEffect(() => { setSecs(0); const t0 = performance.now(); const t = window.setInterval(() => setSecs(Math.round((performance.now() - t0) / 1000)), 1000); return () => window.clearInterval(t); }, [stage]);
  return (
    <div className={`absolute inset-0 z-30 flex flex-col items-center justify-center bg-zinc-950 transition-opacity duration-300 ${on ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}`} data-testid="flyover-loading" role="status" aria-live="polite">
      <div className="text-xl font-semibold text-zinc-50 tracking-tight">{title}</div>
      <div className="mt-1 text-sm text-zinc-400">{facts}</div>
      <div className="mt-6 w-40 h-0.5 rounded-full bg-white/[0.07] overflow-hidden">
        <div className="h-full w-1/3 rounded-full bg-orange-500 animate-[dgslide_1.2s_ease-in-out_infinite]" />
      </div>
      <div className="mt-3 text-xs text-zinc-500" data-testid="flyover-loading-line">{stage ? STAGE[stage] : "Preparing the flyover"}{secs >= 2 ? ` · ${secs} s` : ""}</div>
      <button className="mt-6 h-11 px-5 rounded-full bg-white/[0.08] text-sm font-semibold text-zinc-200 hover:bg-white/[0.14] active:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400" onClick={onCancel} data-testid="flyover-loading-cancel">Cancel</button>
    </div>
  );
}

/** The hole's Flyover panel over the view, as in the hole's panel. (The ground is in View, beside it.) */
function SettingsBox({ hole }: { hole: Hole }) {
  const doc = useCourse(s => s.doc);
  return (
    <>
      <div className="flex items-center gap-1.5 text-sm font-semibold text-zinc-100 mb-2">Flyover · Hole {holeLabel(doc, hole.id)} <HelpLink topic="flyover" label="Flyover" /></div>
      <HoleFlight hole={hole} />
    </>
  );
}

// (the settings closed again once the tee view is left; kept in the editor so the Export step can
// open the view with them up)
useEditor.subscribe((s, p) => { if (!s.teeView && p.teeView && s.teeSettings) s.set({ teeSettings: false }); });

export function TeeViewHud({ compact = false }: { compact?: boolean }) {
  const doc = useCourse(s => s.doc);
  const ed = useEditor();
  const job = useExportJob(s => s.job);
  const video = useVideoSettings();
  const hole = doc.holes.find(h => h.id === ed.teeView);
  // (from another tee of the hole: its own numbers, as the layout with that tee would play it)
  const viewed = ed.teeViewTee ? doc.items.find((i): i is TeeItem => i.id === ed.teeViewTee && i.type === "tee" && i.holeId === hole?.id) : undefined;
  const s = useMemo(() => (hole ? holeStats(doc, hole, viewed ? { ...activeLayout(doc), tee: viewed.level } : undefined) : null), [doc, hole, viewed]);
  const camera = !!ed.teeSettings;
  const setCamera = (f: (c: boolean) => boolean) => ed.set({ teeSettings: f(camera) });
  // (view only: no camera settings to change; a video only for those who may have downloads)
  const readOnly = useCourse(c => c.readOnly);
  const mayRecord = useAllowed("downloads");
  // The loading screen while the view says the flight is waiting, and from the very moment a
  // flyover is asked for until the view has said anything (two seconds at most)
  const [bridge, setBridge] = useState(false);
  const wasFlying = useRef<string | null>(null);
  const flightKey = ed.flyover ? ed.teeView : null;
  if (flightKey !== wasFlying.current) { wasFlying.current = flightKey; if (flightKey && !bridge) setBridge(true); }
  useEffect(() => {
    if (!ed.flyover || ed.flyLoading) { setBridge(false); return; }
    const t = window.setTimeout(() => setBridge(false), 2000);
    return () => window.clearTimeout(t);
  }, [ed.flyover, ed.flyLoading]);
  const waiting = ed.flyover && (ed.flyLoading !== null || bridge);
  const [showLoading, setShowLoading] = useState(false);
  useEffect(() => {
    if (waiting) { setShowLoading(true); return; }
    const t = window.setTimeout(() => setShowLoading(false), 320);
    return () => window.clearTimeout(t);
  }, [waiting]);
  if (!hole || !s) return null;
  const loading = (showLoading || waiting) && ed.flyover ? <FlyoverLoading on={waiting} stage={ed.flyLoading} onCancel={() => ed.set({ flyover: false })} title={`Hole ${s.label}${hole.name ? ` · ${hole.name}` : ""}`} facts={`${fmtDist(s.length, doc.units)} · Par ${s.par}${s.elevationChange ? ` · ${fmtElev(s.elevationChange, doc.units)}` : ""}`} /> : null;
  // (a video's progress: none while the map is painted or a hole sharpened)
  const recPct = job?.kind === "video" && job.progress !== null ? `${Math.round(job.progress * 100)}%` : null;
  const stats = courseStats(doc);
  const done = doc.holes.filter((_, k) => stats[k].complete);
  const i = done.findIndex(h => h.id === hole.id);
  const go = (d: number) => {
    const next = done[(i + d + done.length) % done.length];
    if (next) ed.set({ teeView: next.id, teeViewTee: null, flyover: ed.flyover });
  };
  const lvl = TEE_LEVELS[s.level];
  // (beside the big number: the hole's name, or the tee it's seen from)
  const sub = hole.name || `${lvl.label} tee`;
  const hint = !ed.flyover && !camera && !job;
  if (compact) {
    // A phone: the hole's card across the top, big buttons along the bottom (thumb's reach)
    const bar = "flex-1 min-w-0 h-14 rounded-2xl flex flex-col items-center justify-center gap-1 text-[12px] font-semibold text-white active:bg-white/15 disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400";
    // (the flyover's settings and the View panel: icon over label, as along the bottom; in the
    // card, or by themselves at the top right while it flies, the card hidden)
    const tiles = (
      <div className="flex items-center gap-1.5 shrink-0">
        {!readOnly && <button className={`w-14 h-11 rounded-xl flex flex-col items-center justify-center gap-0.5 text-[12px] font-semibold text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 ${camera ? "bg-white/15" : "bg-white/[0.07] active:bg-white/15"}`} onClick={() => setCamera(c => !c)} aria-pressed={camera} data-testid="hud-settings"><Settings2 size={17} /><span className="leading-none">Flyover</span></button>}
        <SceneButton label="View" />
      </div>
    );
    return (
      <div className="absolute inset-0 pointer-events-none z-20" data-pov-ui>
        {loading}
        <div className={`absolute left-2 right-2 top-[max(8px,env(safe-area-inset-top))] pointer-events-auto glass rounded-2xl px-3 py-2.5 text-white shadow-2xl border border-white/10 max-w-[420px] ${ed.flyover ? "hidden" : ""}`} data-testid="tee-view-hud">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 shrink-0 rounded-full flex items-center justify-center text-[22px] font-bold" style={{ background: lvl.color, color: lvl.ink, fontFamily: "Oswald, Inter" }}>{s.label}</div>
            <div className="flex-1 min-w-0">
              <div className="text-[12px] uppercase tracking-wider text-zinc-300 truncate">{sub}</div>
              <div className="text-[22px] font-bold leading-tight" style={{ fontFamily: "Oswald, Inter" }}>Par {s.par} · {fmtDist(s.length, doc.units)}</div>
              <div className="text-[13px] text-zinc-300">{fmtElev(s.elevationChange, doc.units)} · plays like {fmtDist(s.playsLike, doc.units)}</div>
            </div>
            {!ed.flyover && tiles}
          </div>
          <div className="mt-1.5"><ElevationProfile doc={doc} line={s.line} height={56} teeColor={lvl.color} /></div>
          {hole.notes && <p className="text-[13px] text-zinc-200 mt-1 line-clamp-2">{hole.notes}</p>}
        </div>
        {ed.flyover && <div className="absolute right-2 top-[max(8px,env(safe-area-inset-top))] pointer-events-auto glass rounded-2xl p-1.5 border border-white/10 shadow-2xl">{tiles}</div>}
        {hint && <div className="absolute bottom-[calc(env(safe-area-inset-bottom)+92px)] left-1/2 -translate-x-1/2 text-[13px] text-white/90 bg-black/45 rounded-full px-3 py-1 whitespace-nowrap">Drag to look around</div>}
        <div className="absolute left-2 right-2 bottom-[max(8px,env(safe-area-inset-bottom))] pointer-events-auto flex items-center gap-1 glass rounded-[22px] p-1.5 border border-white/10 shadow-2xl">
          <button className={bar} onClick={() => go(-1)}><ChevronLeft size={22} /><span>Previous</span></button>
          <button className={`${bar} ${ed.flyover ? "bg-orange-500" : ""}`} onClick={() => ed.set({ flyover: !ed.flyover })} data-testid="hud-flyover">{ed.flyover ? <Square size={18} /> : <Plane size={20} />}<span>{ed.flyover ? "Stop" : "Fly over"}</span></button>
          <button className={bar} onClick={() => go(1)}><ChevronRight size={22} /><span>Next</span></button>
          {mayRecord && <button className={bar} onClick={() => void recordVideo([hole.id])} disabled={!!job} data-testid="hud-record"><Clapperboard size={20} /><span>{job?.kind === "video" ? recPct ?? "…" : "Record"}</span></button>}
          {!readOnly && <button className={bar} onClick={() => cameraFrom(hole.id, null)} data-testid="hud-freecam"><Video size={20} /><span>Camera</span></button>}
          <button className={bar} onClick={() => ed.set({ teeView: null, flyover: false })} data-testid="hud-close"><X size={20} /><span>Back</span></button>
        </div>
        {camera && (
          <div className="absolute left-2 right-2 bottom-[calc(max(8px,env(safe-area-inset-bottom))+80px)] pointer-events-auto glass rounded-2xl p-3 border border-white/10 shadow-2xl max-h-[45vh] overflow-y-auto dg-scroll">
            <SettingsBox key={hole.id} hole={hole} />
          </div>
        )}
      </div>
    );
  }
  return (
    <div className="absolute inset-0 pointer-events-none z-20" data-pov-ui>
      {loading}
      <div className={`absolute top-4 left-4 pointer-events-auto glass backdrop-blur rounded-2xl px-4 py-3 text-white shadow-2xl border border-white/10 w-[280px] ${ed.flyover ? "hidden" : ""}`} data-testid="tee-view-hud">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full flex items-center justify-center text-2xl font-bold" style={{ background: lvl.color, color: lvl.ink, fontFamily: "Oswald, Inter" }}>{s.label}</div>
          <div>
            <div className="text-xs uppercase tracking-wider text-zinc-300">{sub}</div>
            <div className="text-2xl font-bold leading-tight" style={{ fontFamily: "Oswald, Inter" }}>Par {s.par} · {fmtDist(s.length, doc.units)}</div>
            <div className="text-xs text-zinc-300">{fmtElev(s.elevationChange, doc.units)} · plays like {fmtDist(s.playsLike, doc.units)}</div>
          </div>
        </div>
        <div className="mt-2"><ElevationProfile doc={doc} line={s.line} height={70} teeColor={lvl.color} /></div>
        {hole.notes && <p className="text-xs text-zinc-200 mt-1">{hole.notes}</p>}
      </div>
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 pointer-events-auto flex items-center gap-2 glass backdrop-blur rounded-full px-2 py-1.5 border border-white/10 shadow-2xl">
        <button className="p-2 rounded-full hover:bg-white/10 text-white" aria-label="Previous hole" title="Previous hole (←)" onClick={() => go(-1)}><ChevronLeft size={18} /></button>
        <button className={`px-3 py-1.5 rounded-full text-sm font-semibold flex items-center gap-1.5 ${ed.flyover ? "bg-orange-500 text-zinc-950" : "text-white hover:bg-white/10"}`} onClick={() => ed.set({ flyover: !ed.flyover })} data-testid="hud-flyover">{ed.flyover ? <><Square size={14} /> Stop</> : <><Plane size={15} /> Fly over</>}</button>
        <button className="p-2 rounded-full hover:bg-white/10 text-white" aria-label="Next hole" title="Next hole (→)" onClick={() => go(1)}><ChevronRight size={18} /></button>
        {mayRecord && <button
          className="px-3 py-1.5 rounded-full text-sm font-semibold flex items-center gap-1.5 text-white hover:bg-white/10 disabled:opacity-60 disabled:hover:bg-transparent"
          onClick={() => void recordVideo([hole.id])}
          disabled={!!job}
          title={`Record (${VIDEO_SIZES[video.resolution].label}, ${video.fps} fps)`}
          data-testid="hud-record"
        >
          <Clapperboard size={15} /> {job?.kind === "video" ? (recPct ? `Recording ${recPct}` : "Recording…") : "Record"}
        </button>}
        {!readOnly && <button className="px-3 py-1.5 rounded-full text-sm font-semibold flex items-center gap-1.5 text-white hover:bg-white/10" onClick={() => cameraFrom(hole.id, null)} title="Fly the camera yourself and add keyframes" data-testid="hud-freecam"><Video size={15} /> Camera</button>}
        {!readOnly && <button className={`px-3 py-1.5 rounded-full text-sm font-semibold flex items-center gap-1.5 text-white ${camera ? "bg-white/15" : "hover:bg-white/10"}`} onClick={() => setCamera(c => !c)} aria-pressed={camera} title="The hole's Flyover panel" data-testid="hud-settings"><Settings2 size={15} /> Settings</button>}
        <button className="px-3 py-1.5 rounded-full text-sm font-semibold text-white hover:bg-white/10 flex items-center gap-1.5" onClick={() => ed.set({ teeView: null, flyover: false })} data-testid="hud-close"><X size={15} /> Back to map</button>
      </div>
      {camera && (
        <div className="absolute bottom-20 left-1/2 -translate-x-1/2 w-[320px] max-h-[calc(100%-120px)] overflow-y-auto dg-scroll pointer-events-auto glass backdrop-blur rounded-2xl p-4 border border-white/10 shadow-2xl">
          <SettingsBox key={hole.id} hole={hole} />
        </div>
      )}
      <div className="absolute top-4 right-4 pointer-events-auto"><SceneButton /></div>
      {hint && <div className="absolute bottom-20 left-1/2 -translate-x-1/2 text-xs text-white/80 bg-black/40 rounded px-2 py-1">Drag to look around · scroll to zoom · ← → other holes · Esc back to the map</div>}
    </div>
  );
}
