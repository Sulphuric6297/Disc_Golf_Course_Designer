// What shows over the view from a tee or a flyover: the hole's numbers and the controls.
import { useEffect, useMemo, useState } from "react";
import { Camera, ChevronLeft, ChevronRight, Clapperboard, Plane, X } from "lucide-react";
import { useAllowed } from "../auth/perms";
import { TEE_LEVELS } from "../constants";
import { courseStats, holeStats } from "../lib/holeStats";
import { fmtDist, fmtElev } from "../lib/units";
import { useCourse, useEditor } from "../state/course";
import { useExportJob } from "../state/exportJob";
import { recordVideo, useVideoSettings } from "../state/video";
import { VIDEO_SIZES } from "../lib/video";
import { ElevationProfile } from "./ElevationProfile";
import { SceneButton } from "./ScenePanel";
import { FlyoverSettingsPanel } from "./FlyoverSettings";

const READYING = ["Painting the fairway…", "Growing the trees…", "Raking the tee pad…", "Checking the wind…", "Hanging the chains…", "Lining up the throw…"];

/** While a flyover waits for its pictures: a disc flying the hole over and over, the hole's
 * numbers, and a line about what's being readied (something to watch, so the wait is kept). */
function FlyoverLoading({ title, facts }: { title: string; facts: string }) {
  const [n, setN] = useState(0);
  useEffect(() => { const t = window.setInterval(() => setN(k => k + 1), 1400); return () => window.clearInterval(t); }, []);
  return (
    <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-zinc-950 pointer-events-auto" data-testid="flyover-loading" role="status" aria-live="polite">
      <svg viewBox="0 0 320 120" className="w-[320px] max-w-[80vw] h-auto" aria-hidden>
        <defs>
          <path id="fl-line" d="M 24 92 C 90 20, 200 20, 296 60" />
        </defs>
        {/* the fairway's line, the tee and the basket */}
        <use href="#fl-line" fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="2" strokeDasharray="4 6" />
        <rect x="14" y="84" width="20" height="14" rx="2" fill="#38bdf8" />
        <g transform="translate(296 60)">
          <line x1="0" y1="-26" x2="0" y2="18" stroke="#e4e4e7" strokeWidth="2" />
          <path d="M-12 -14 h24 M-10 -14 v16 M10 -14 v16 M-10 2 h20" stroke="#e4e4e7" strokeWidth="2" fill="none" strokeLinecap="round" />
        </g>
        {/* the disc */}
        <g>
          <ellipse rx="11" ry="4.5" fill="#f97316" stroke="#fdba74" strokeWidth="1.5">
            <animateMotion dur="2.4s" repeatCount="indefinite" rotate="auto" keyPoints="0;1" keyTimes="0;1" calcMode="spline" keySplines="0.3 0 0.6 1">
              <mpath href="#fl-line" />
            </animateMotion>
          </ellipse>
          <ellipse rx="11" ry="4.5" fill="rgba(0,0,0,0.25)" transform="translate(0 30) scale(1 0.5)">
            <animateMotion dur="2.4s" repeatCount="indefinite" keyPoints="0;1" keyTimes="0;1" calcMode="spline" keySplines="0.3 0 0.6 1">
              <mpath href="#fl-line" />
            </animateMotion>
          </ellipse>
        </g>
      </svg>
      <div className="mt-3 text-lg font-semibold text-zinc-50">{title}</div>
      <div className="text-sm text-zinc-400">{facts}</div>
      <div className="mt-4 h-5 text-sm text-orange-300" data-testid="flyover-loading-line">{READYING[n % READYING.length]}</div>
    </div>
  );
}

export function TeeViewHud({ compact = false }: { compact?: boolean }) {
  const doc = useCourse(s => s.doc);
  const ed = useEditor();
  const job = useExportJob(s => s.job);
  const video = useVideoSettings();
  const hole = doc.holes.find(h => h.id === ed.teeView);
  const s = useMemo(() => (hole ? holeStats(doc, hole) : null), [doc, hole]);
  const [camera, setCamera] = useState(false);
  // (view only: no camera settings to change; a video only for those who may have downloads)
  const readOnly = useCourse(c => c.readOnly);
  const mayRecord = useAllowed("downloads");
  // (the loading screen only once a wait is noticeable: no flash when all is in)
  const waiting = ed.flyover && ed.flyLoading;
  const [showLoading, setShowLoading] = useState(false);
  useEffect(() => {
    if (!waiting) { setShowLoading(false); return; }
    const t = window.setTimeout(() => setShowLoading(true), 350);
    return () => window.clearTimeout(t);
  }, [waiting]);
  if (!hole || !s) return null;
  const loading = showLoading && waiting ? <FlyoverLoading title={`Hole ${doc.holes.indexOf(hole) + 1}${hole.name ? ` · ${hole.name}` : ""}`} facts={`${fmtDist(s.length, doc.units)} · Par ${s.par}${s.elevationChange ? ` · ${fmtElev(s.elevationChange, doc.units)}` : ""}`} /> : null;
  const stats = courseStats(doc);
  const done = doc.holes.filter((_, k) => stats[k].complete);
  const i = done.findIndex(h => h.id === hole.id);
  const go = (d: number) => {
    const next = done[(i + d + done.length) % done.length];
    if (next) ed.set({ teeView: next.id, flyover: ed.flyover });
  };
  const lvl = TEE_LEVELS[s.level];
  if (compact) {
    // A phone: the hole's card across the top, big buttons along the bottom (thumb's reach)
    const bar = "flex-1 min-w-0 h-14 rounded-2xl flex flex-col items-center justify-center gap-1 text-[12px] font-semibold text-white active:bg-white/15 disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400";
    return (
      <div className="absolute inset-0 pointer-events-none z-20" data-pov-ui>
        {loading}
        <div className={`absolute left-2 right-2 top-[max(8px,env(safe-area-inset-top))] pointer-events-auto bg-zinc-950/80 rounded-2xl px-3 py-2.5 text-white shadow-2xl border border-white/10 max-w-[420px] ${ed.flyover ? "hidden" : ""}`} data-testid="tee-view-hud">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 shrink-0 rounded-full flex items-center justify-center text-[22px] font-bold" style={{ background: lvl.color, color: lvl.ink, fontFamily: "Oswald, Inter" }}>{s.label}</div>
            <div className="flex-1 min-w-0">
              <div className="text-[12px] uppercase tracking-wider text-zinc-300 truncate">{hole.name || `Hole ${s.label}`}</div>
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
          {mayRecord && <button className={bar} onClick={() => void recordVideo([hole.id])} disabled={!!job} data-testid="hud-record"><Clapperboard size={20} /><span>{job?.kind === "video" ? `${Math.round((job.progress ?? 0) * 100)}%` : "Record"}</span></button>}
          {!readOnly && <button className={`${bar} ${camera ? "bg-white/15" : ""}`} onClick={() => setCamera(c => !c)} aria-pressed={camera} data-testid="hud-camera"><Camera size={20} /><span>Camera</span></button>}
          <button className={bar} onClick={() => ed.set({ teeView: null, flyover: false })} data-testid="hud-close"><X size={20} /><span>Map</span></button>
        </div>
        {camera && (
          <div className="absolute left-2 right-2 bottom-[calc(max(8px,env(safe-area-inset-bottom))+80px)] pointer-events-auto bg-zinc-950/90 rounded-2xl p-3 border border-white/10 shadow-2xl max-h-[45vh] overflow-y-auto">
            <FlyoverSettingsPanel holeId={hole.id} />
          </div>
        )}
      </div>
    );
  }
  return (
    <div className="absolute inset-0 pointer-events-none z-20" data-pov-ui>
      {loading}
      <div className={`absolute top-4 left-4 pointer-events-auto bg-zinc-950/80 backdrop-blur rounded-2xl px-4 py-3 text-white shadow-2xl border border-white/10 w-[280px] ${ed.flyover ? "hidden" : ""}`} data-testid="tee-view-hud">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full flex items-center justify-center text-2xl font-bold" style={{ background: lvl.color, color: lvl.ink, fontFamily: "Oswald, Inter" }}>{s.label}</div>
          <div>
            <div className="text-xs uppercase tracking-wider text-zinc-300">{hole.name || `Hole ${s.label}`}</div>
            <div className="text-2xl font-bold leading-tight" style={{ fontFamily: "Oswald, Inter" }}>Par {s.par} · {fmtDist(s.length, doc.units)}</div>
            <div className="text-xs text-zinc-300">{fmtElev(s.elevationChange, doc.units)} · plays like {fmtDist(s.playsLike, doc.units)}</div>
          </div>
        </div>
        <div className="mt-2"><ElevationProfile doc={doc} line={s.line} height={70} /></div>
        {hole.notes && <p className="text-xs text-zinc-200 mt-1">{hole.notes}</p>}
      </div>
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 pointer-events-auto flex items-center gap-2 bg-zinc-950/85 backdrop-blur rounded-full px-2 py-1.5 border border-white/10 shadow-2xl">
        <button className="p-2 rounded-full hover:bg-white/10 text-white" aria-label="Previous hole" title="Previous hole (←)" onClick={() => go(-1)}><ChevronLeft size={18} /></button>
        <button className={`px-3 py-1.5 rounded-full text-sm font-semibold flex items-center gap-1.5 ${ed.flyover ? "bg-orange-500 text-zinc-950" : "text-white hover:bg-white/10"}`} onClick={() => ed.set({ flyover: !ed.flyover })} data-testid="hud-flyover"><Plane size={15} /> {ed.flyover ? "Flying…" : "Fly over"}</button>
        <button className="p-2 rounded-full hover:bg-white/10 text-white" aria-label="Next hole" title="Next hole (→)" onClick={() => go(1)}><ChevronRight size={18} /></button>
        {mayRecord && <button
          className="px-3 py-1.5 rounded-full text-sm font-semibold flex items-center gap-1.5 text-white hover:bg-white/10 disabled:opacity-60 disabled:hover:bg-transparent"
          onClick={() => void recordVideo([hole.id])}
          disabled={!!job}
          title={`Record (${VIDEO_SIZES[video.resolution].label}, ${video.fps} fps)`}
          data-testid="hud-record"
        >
          <Clapperboard size={15} /> {job?.kind === "video" ? `Recording ${Math.round((job.progress ?? 0) * 100)}%` : "Record"}
        </button>}
        {!readOnly && <button className={`px-3 py-1.5 rounded-full text-sm font-semibold flex items-center gap-1.5 text-white ${camera ? "bg-white/15" : "hover:bg-white/10"}`} onClick={() => setCamera(c => !c)} aria-pressed={camera} data-testid="hud-camera"><Camera size={15} /> Camera</button>}
        <button className="px-3 py-1.5 rounded-full text-sm font-semibold text-white hover:bg-white/10 flex items-center gap-1.5" onClick={() => ed.set({ teeView: null, flyover: false })} data-testid="hud-close"><X size={15} /> Back to map</button>
      </div>
      {camera && (
        <div className="absolute bottom-20 left-1/2 -translate-x-1/2 w-[320px] pointer-events-auto bg-zinc-950/90 backdrop-blur rounded-2xl p-4 border border-white/10 shadow-2xl">
          <FlyoverSettingsPanel holeId={hole.id} />
        </div>
      )}
      <div className="absolute top-4 right-4 pointer-events-auto"><SceneButton /></div>
      {!ed.flyover && !camera && <div className="absolute bottom-20 left-1/2 -translate-x-1/2 text-xs text-white/80 bg-black/40 rounded px-2 py-1">Drag to look around · scroll to zoom · ← → other holes · Esc back to the map</div>}
    </div>
  );
}
