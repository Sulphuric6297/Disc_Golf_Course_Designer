// What shows over the view from a tee or a flyover: the hole's numbers and the controls.
import { useMemo, useState } from "react";
import { Camera, ChevronLeft, ChevronRight, Clapperboard, Plane, X } from "lucide-react";
import { TEE_LEVELS } from "../constants";
import { holeStats } from "../lib/holeStats";
import { fmtDist, fmtElev } from "../lib/units";
import { useCourse, useEditor } from "../state/course";
import { useExportJob } from "../state/exportJob";
import { recordVideo, useVideoSettings } from "../state/video";
import { VIDEO_SIZES } from "../lib/video";
import { ElevationProfile } from "./ElevationProfile";
import { SceneButton } from "./ScenePanel";
import { FlyoverSettingsPanel } from "./FlyoverSettings";

export function TeeViewHud({ compact = false }: { compact?: boolean }) {
  const doc = useCourse(s => s.doc);
  const ed = useEditor();
  const job = useExportJob(s => s.job);
  const video = useVideoSettings();
  const hole = doc.holes.find(h => h.id === ed.teeView);
  const s = useMemo(() => (hole ? holeStats(doc, hole) : null), [doc, hole]);
  const [camera, setCamera] = useState(false);
  if (!hole || !s) return null;
  const done = doc.holes.filter(h => holeStats(doc, h).complete);
  const i = done.findIndex(h => h.id === hole.id);
  const go = (d: number) => {
    const next = done[(i + d + done.length) % done.length];
    if (next) ed.set({ teeView: next.id, flyover: ed.flyover });
  };
  const lvl = TEE_LEVELS[s.level];
  if (compact) {
    // A phone: the hole's card across the top, big buttons along the bottom (thumb's reach)
    const bar = "flex-1 min-w-0 h-14 rounded-2xl flex flex-col items-center justify-center gap-1 text-[12px] font-semibold text-white active:bg-white/15 disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400";
    return (
      <div className="absolute inset-0 pointer-events-none z-20" data-pov-ui>
        <div className="absolute left-2 right-2 top-[max(8px,env(safe-area-inset-top))] pointer-events-auto bg-zinc-950/80 rounded-2xl px-3 py-2.5 text-white shadow-2xl border border-white/10 max-w-[420px]" data-testid="tee-view-hud">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 shrink-0 rounded-full flex items-center justify-center text-[22px] font-bold" style={{ background: lvl.color, color: lvl.ink, fontFamily: "Oswald, Inter" }}>{s.number}</div>
            <div className="flex-1 min-w-0">
              <div className="text-[12px] uppercase tracking-wider text-zinc-300 truncate">{hole.name || `Hole ${s.number}`}</div>
              <div className="text-[22px] font-bold leading-tight" style={{ fontFamily: "Oswald, Inter" }}>Par {s.par} · {fmtDist(s.length, doc.units)}</div>
              <div className="text-[13px] text-zinc-300">{fmtElev(s.elevationChange, doc.units)} · plays like {fmtDist(s.playsLike, doc.units)}</div>
            </div>
            <SceneButton big />
          </div>
          <div className="mt-1.5"><ElevationProfile doc={doc} line={s.line} height={56} /></div>
          {hole.notes && <p className="text-[13px] text-zinc-200 mt-1 line-clamp-2">{hole.notes}</p>}
        </div>
        {!ed.flyover && !camera && <div className="absolute bottom-[calc(env(safe-area-inset-bottom)+92px)] left-1/2 -translate-x-1/2 text-[13px] text-white/90 bg-black/45 rounded-full px-3 py-1 whitespace-nowrap">Drag to look around</div>}
        <div className="absolute left-2 right-2 bottom-[max(8px,env(safe-area-inset-bottom))] pointer-events-auto flex items-center gap-1 bg-zinc-950/85 rounded-[22px] p-1.5 border border-white/10 shadow-2xl">
          <button className={bar} onClick={() => go(-1)}><ChevronLeft size={22} /><span>Previous</span></button>
          <button className={`${bar} ${ed.flyover ? "bg-orange-500" : ""}`} onClick={() => ed.set({ flyover: !ed.flyover })} data-testid="hud-flyover"><Plane size={20} /><span>{ed.flyover ? "Flying…" : "Fly over"}</span></button>
          <button className={bar} onClick={() => go(1)}><ChevronRight size={22} /><span>Next</span></button>
          <button className={bar} onClick={() => void recordVideo([hole.id])} disabled={!!job} data-testid="hud-record"><Clapperboard size={20} /><span>{job?.kind === "video" ? `${Math.round((job.progress ?? 0) * 100)}%` : "Record"}</span></button>
          <button className={`${bar} ${camera ? "bg-white/15" : ""}`} onClick={() => setCamera(c => !c)} aria-pressed={camera} data-testid="hud-camera"><Camera size={20} /><span>Camera</span></button>
          <button className={bar} onClick={() => ed.set({ teeView: null, flyover: false })} data-testid="hud-close"><X size={20} /><span>Map</span></button>
        </div>
        {camera && (
          <div className="absolute left-2 right-2 bottom-[calc(max(8px,env(safe-area-inset-bottom))+80px)] pointer-events-auto bg-zinc-950/90 rounded-2xl p-3 border border-white/10 shadow-2xl max-h-[45vh] overflow-y-auto">
            <FlyoverSettingsPanel />
          </div>
        )}
      </div>
    );
  }
  return (
    <div className="absolute inset-0 pointer-events-none z-20" data-pov-ui>
      <div className="absolute top-4 left-4 pointer-events-auto bg-zinc-950/80 backdrop-blur rounded-2xl px-4 py-3 text-white shadow-2xl border border-white/10 w-[280px]" data-testid="tee-view-hud">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full flex items-center justify-center text-2xl font-bold" style={{ background: lvl.color, color: lvl.ink, fontFamily: "Oswald, Inter" }}>{s.number}</div>
          <div>
            <div className="text-xs uppercase tracking-wider text-zinc-300">{hole.name || `Hole ${s.number}`}</div>
            <div className="text-2xl font-bold leading-tight" style={{ fontFamily: "Oswald, Inter" }}>Par {s.par} · {fmtDist(s.length, doc.units)}</div>
            <div className="text-xs text-zinc-300">{fmtElev(s.elevationChange, doc.units)} · plays like {fmtDist(s.playsLike, doc.units)}</div>
          </div>
        </div>
        <div className="mt-2"><ElevationProfile doc={doc} line={s.line} height={70} /></div>
        {hole.notes && <p className="text-xs text-zinc-200 mt-1">{hole.notes}</p>}
      </div>
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 pointer-events-auto flex items-center gap-2 bg-zinc-950/85 backdrop-blur rounded-full px-2 py-1.5 border border-white/10 shadow-2xl">
        <button className="p-2 rounded-full hover:bg-white/10 text-white" aria-label="Previous hole" title="Previous hole (←)" onClick={() => go(-1)}><ChevronLeft size={18} /></button>
        <button className={`px-3 py-1.5 rounded-full text-sm font-semibold flex items-center gap-1.5 ${ed.flyover ? "bg-orange-500 text-white" : "text-white hover:bg-white/10"}`} onClick={() => ed.set({ flyover: !ed.flyover })} data-testid="hud-flyover"><Plane size={15} /> {ed.flyover ? "Flying…" : "Fly over"}</button>
        <button className="p-2 rounded-full hover:bg-white/10 text-white" aria-label="Next hole" title="Next hole (→)" onClick={() => go(1)}><ChevronRight size={18} /></button>
        <button
          className="px-3 py-1.5 rounded-full text-sm font-semibold flex items-center gap-1.5 text-white hover:bg-white/10 disabled:opacity-60 disabled:hover:bg-transparent"
          onClick={() => void recordVideo([hole.id])}
          disabled={!!job}
          title={`Record (${VIDEO_SIZES[video.resolution].label}, ${video.fps} fps)`}
          data-testid="hud-record"
        >
          <Clapperboard size={15} /> {job?.kind === "video" ? `Recording ${Math.round((job.progress ?? 0) * 100)}%` : "Record"}
        </button>
        <button className={`px-3 py-1.5 rounded-full text-sm font-semibold flex items-center gap-1.5 text-white ${camera ? "bg-white/15" : "hover:bg-white/10"}`} onClick={() => setCamera(c => !c)} aria-pressed={camera} data-testid="hud-camera"><Camera size={15} /> Camera</button>
        <button className="px-3 py-1.5 rounded-full text-sm font-semibold text-white hover:bg-white/10 flex items-center gap-1.5" onClick={() => ed.set({ teeView: null, flyover: false })} data-testid="hud-close"><X size={15} /> Back to map</button>
      </div>
      {camera && (
        <div className="absolute bottom-20 left-1/2 -translate-x-1/2 w-[320px] pointer-events-auto bg-zinc-950/90 backdrop-blur rounded-2xl p-4 border border-white/10 shadow-2xl">
          <FlyoverSettingsPanel />
        </div>
      )}
      <div className="absolute top-4 right-4 pointer-events-auto"><SceneButton /></div>
      {!ed.flyover && !camera && <div className="absolute bottom-20 left-1/2 -translate-x-1/2 text-xs text-white/80 bg-black/40 rounded px-2 py-1">Drag to look around · scroll to zoom · ← → other holes · Esc back to the map</div>}
    </div>
  );
}
