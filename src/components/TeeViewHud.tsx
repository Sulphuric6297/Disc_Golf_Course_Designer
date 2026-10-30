// What shows over the view from the tee or a flyover: the hole's numbers and the controls.
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, ChevronUp, Clapperboard, Footprints, Home, Maximize2, Minimize2, Pencil, Plane, Settings2, Square, Video, X } from "lucide-react";
import { useAllowed } from "../auth/perms";
import { STAND_HERE, TEE_LEVELS } from "../constants";
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
import { getView } from "../state/view";
import { useSelection } from "./Inspector";
import { useToolbarRoom } from "./Toolbar";

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
  const editing = !ed.flyover && !readOnly && !compact;
  const panel = useSelection().open;
  const toolbar = useToolbarRoom(r => r.height);
  if (ed.teeView === STAND_HERE) return <StandHere compact={compact} editing={editing} toolbar={toolbar} />;
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
  // (standing away from the tee: how far the basket is from there)
  const basket = ed.teeStand && s.basketId ? doc.items.find(i => i.id === s.basketId) : undefined;
  const sub = basket && ed.teeStand ? `${fmtDist(Math.hypot(basket.x - ed.teeStand.x, basket.y - ed.teeStand.y), doc.units)} to the basket` : hole.name || `${lvl.label} tee`;
  const hint = !ed.flyover && !camera && !job;
  if (compact) {
    // A phone: the hole's card across the top, big buttons along the bottom (thumb's reach)
    // (a thing picked: its sheet is up in the bar's place)
    const sheetUp = !readOnly && !ed.flyover && !!ed.selectedId && doc.items.some(i => i.id === ed.selectedId);
    const bar = "flex-1 min-w-0 h-14 rounded-2xl flex flex-col items-center justify-center gap-1 whitespace-nowrap " + (ed.teeStand ? "text-[11px]" : "text-[12px]") + " font-semibold text-white active:bg-white/15 disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400";
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
        {ed.teeCardHidden && !ed.flyover && <CardChip label={s.label} color={lvl.color} ink={lvl.ink} big />}
        <div className={`absolute left-2 right-2 top-[max(8px,env(safe-area-inset-top))] pointer-events-auto glass rounded-2xl px-3 py-2.5 text-white shadow-2xl border border-white/10 max-w-[420px] ${ed.flyover || ed.teeCardHidden ? "hidden" : ""}`} data-testid="tee-view-hud">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 shrink-0 rounded-full flex items-center justify-center text-[22px] font-bold" style={{ background: lvl.color, color: lvl.ink, fontFamily: "Oswald, Inter" }}>{s.label}</div>
            <div className="flex-1 min-w-0">
              <div className="text-[12px] uppercase tracking-wider text-zinc-300 truncate">{sub}</div>
              <div className="text-[22px] font-bold leading-tight" style={{ fontFamily: "Oswald, Inter" }}>Par {s.par} · {fmtDist(s.length, doc.units)}</div>
              <div className="text-[13px] text-zinc-300">{fmtElev(s.elevationChange, doc.units)} · plays like {fmtDist(s.playsLike, doc.units)}</div>
            </div>
            {!ed.flyover && tiles}
            <HideCard big />
          </div>
          <div className="mt-1.5"><ElevationProfile doc={doc} line={s.line} height={56} teeColor={lvl.color} /></div>
          {hole.notes && <p className="text-[13px] text-zinc-200 mt-1 line-clamp-2">{hole.notes}</p>}
        </div>
        {ed.flyover && <div className="absolute right-2 top-[max(8px,env(safe-area-inset-top))] pointer-events-auto glass rounded-2xl p-1.5 border border-white/10 shadow-2xl">{tiles}</div>}
        {!sheetUp && !ed.flyover && <PhoneTapRow hint={hint} canEdit={!readOnly} />}
        {!sheetUp && <div className="absolute left-2 right-2 bottom-[max(8px,env(safe-area-inset-bottom))] pointer-events-auto flex items-center gap-1 glass rounded-[22px] p-1.5 border border-white/10 shadow-2xl">
          {ed.teeStand && !ed.flyover && <button className={bar} onClick={() => ed.set({ teeStand: null })} data-testid="hud-to-tee"><Home size={20} /><span>Tee</span></button>}
          <button className={bar} onClick={() => go(-1)}><ChevronLeft size={22} /><span>Previous</span></button>
          <button className={`${bar} ${ed.flyover ? "bg-orange-500" : ""}`} onClick={() => ed.set({ flyover: !ed.flyover })} data-testid="hud-flyover">{ed.flyover ? <Square size={18} /> : <Plane size={20} />}<span>{ed.flyover ? "Stop" : "Fly over"}</span></button>
          <button className={bar} onClick={() => go(1)}><ChevronRight size={22} /><span>Next</span></button>
          {mayRecord && <button className={bar} onClick={() => void recordVideo([hole.id])} disabled={!!job} data-testid="hud-record"><Clapperboard size={20} /><span>{job?.kind === "video" ? recPct ?? "…" : "Record"}</span></button>}
          {!readOnly && <button className={bar} onClick={() => cameraFrom(hole.id, null)} data-testid="hud-freecam"><Video size={20} /><span>Camera</span></button>}
          <button className={bar} onClick={() => ed.set({ teeView: null, flyover: false })} data-testid="hud-close"><X size={20} /><span>Back</span></button>
        </div>}
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
      {/* (beside the side panel when something is picked there) */}
      {ed.teeCardHidden && !ed.flyover && <div className={`absolute top-4 ${editing && panel ? "left-[388px]" : "left-4"}`}><CardChip label={s.label} color={lvl.color} ink={lvl.ink} /></div>}
      <div className={`absolute top-4 pointer-events-auto glass backdrop-blur rounded-2xl px-4 py-3 text-white shadow-2xl border border-white/10 w-[280px] ${ed.flyover || ed.teeCardHidden ? "hidden" : ""} ${editing && panel ? "left-[388px]" : "left-4"}`} data-testid="tee-view-hud">
        <div className="relative flex items-center gap-3">
          <div className="absolute -right-2 -top-1"><HideCard /></div>
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
      {editing && <TeeMap big={ed.teeMap === "big"} off={ed.teeMap === "off"} />}
      {/* (editing: above the toolbar) */}
      <div className="absolute left-1/2 -translate-x-1/2 pointer-events-auto flex items-center gap-2 whitespace-nowrap glass backdrop-blur rounded-full px-2 py-1.5 border border-white/10 shadow-2xl" style={{ bottom: editing ? toolbar + 24 : 24 }}>
        {ed.teeStand && !ed.flyover && <button className="px-3 py-1.5 rounded-full text-sm font-semibold flex items-center gap-1.5 text-white hover:bg-white/10" onClick={() => ed.set({ teeStand: null })} title="Back to the tee" data-testid="hud-to-tee"><Home size={15} /> Tee</button>}
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
      {hint && (!editing || ed.tool === "select") && <DeskTapRow editing={editing} bottom={(editing ? toolbar + 24 : 24) + 56} holes />}
    </div>
  );
}

/** Puts the hole's card away (standing, so it doesn't cover the view). */
function HideCard({ big = false }: { big?: boolean }) {
  const set = useEditor(e => e.set);
  return (
    <button className={`${big ? "w-11 h-11" : "w-7 h-7"} shrink-0 rounded-full flex items-center justify-center text-zinc-300 hover:text-white hover:bg-white/10 active:bg-white/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400`}
      onClick={() => set({ teeCardHidden: true })} aria-label="Hide the hole's card" title="Hide the hole's card" data-testid="hud-card-hide">
      <ChevronUp size={big ? 20 : 15} />
    </button>
  );
}

/** The hole's card put away: its number in a small chip; a tap brings the card back. */
function CardChip({ label, color, ink, big = false }: { label: string; color: string; ink: string; big?: boolean }) {
  const set = useEditor(e => e.set);
  return (
    <button className={`${big ? "absolute left-2 top-[max(8px,env(safe-area-inset-top))] h-11" : "h-9"} pointer-events-auto glass rounded-full pl-1 pr-3 flex items-center gap-1.5 border border-white/10 shadow-2xl text-white text-sm font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400`}
      onClick={() => set({ teeCardHidden: false })} aria-label="Show the hole's card" title="Show the hole's card" data-testid="hud-card-show">
      <span className={`${big ? "w-9 h-9 text-lg" : "w-7 h-7 text-base"} rounded-full flex items-center justify-center font-bold`} style={{ background: color, color: ink, fontFamily: "Oswald, Inter" }}>{label}</span>
      Hole
    </button>
  );
}

/** Standing, for an editor: what a tap does, walk there or pick the thing tapped. Never both, so a
 * tap meant to change something doesn't walk, and a step doesn't pick what's in the way. */
function TapSwitch({ big = false }: { big?: boolean }) {
  const set = useEditor(e => e.set);
  const mode = useEditor(e => e.standTap ?? "walk");
  const b = (on: boolean) => `${big ? "h-11 px-4 text-[14px]" : "h-8 px-3 text-sm"} rounded-full font-semibold flex items-center gap-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 ${on ? "bg-white text-zinc-950" : "text-white hover:bg-white/10 active:bg-white/15"}`;
  return (
    <div className="pointer-events-auto flex items-center gap-1 glass rounded-full p-1 border border-white/10 shadow-2xl" role="radiogroup" aria-label="What a tap does" data-testid="tap-switch">
      <button role="radio" aria-checked={mode === "walk"} className={b(mode === "walk")} onClick={() => set({ standTap: "walk" })} title="A tap walks there" data-testid="tap-walk"><Footprints size={big ? 18 : 15} /> Walk</button>
      <button role="radio" aria-checked={mode === "edit"} className={b(mode === "edit")} onClick={() => set({ standTap: "edit" })} title="A tap picks what's there, to change it" data-testid="tap-edit"><Pencil size={big ? 17 : 14} /> Edit</button>
    </div>
  );
}

/** A phone, standing: what a tap does (an editor's switch) and a line on how to move, above the bar. */
function PhoneTapRow({ hint, canEdit }: { hint: boolean; canEdit: boolean }) {
  const edits = useEditor(e => e.standTap === "edit") && canEdit;
  return (
    <div className="absolute bottom-[calc(env(safe-area-inset-bottom)+80px)] left-1/2 -translate-x-1/2 flex flex-col items-center gap-1.5">
      {hint && <div className="text-[13px] text-white/90 bg-black/45 rounded-full px-3 py-1 whitespace-nowrap">{edits ? "Tap a thing to change it · drag to look · pinch to zoom" : "Tap the ground to walk · drag to look · pinch to zoom"}</div>}
      {canEdit && <TapSwitch big />}
    </div>
  );
}

/** A computer, standing: the editor's switch and a line on how to move. */
function DeskTapRow({ editing, bottom, holes = false }: { editing: boolean; bottom: number; holes?: boolean }) {
  const edits = useEditor(e => e.standTap === "edit") && editing;
  const line = edits ? "Click a thing to pick it · drag to look around · Esc back to the map" : `Click the ground to walk · drag to look around${holes ? " · ← → other holes" : ""} · Esc back to the map`;
  return (
    <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-2 whitespace-nowrap" style={{ bottom }}>
      {editing && <TapSwitch />}
      <div className="text-xs text-white/80 bg-black/40 rounded px-2 py-1">{line}</div>
    </div>
  );
}

/** Standing somewhere away from every hole (the person dropped there): the View panel, back to the
 * map, and the map from above while editing; no hole's card, flyover or other holes. */
function StandHere({ compact, editing, toolbar }: { compact: boolean; editing: boolean; toolbar: number }) {
  const ed = useEditor();
  const doc = useCourse(c => c.doc);
  const readOnly = useCourse(c => c.readOnly);
  const back = () => ed.set({ teeView: null, teeStand: null, flyover: false });
  if (compact) {
    // (a thing picked: its sheet is up in the bar's place)
    const sheetUp = !readOnly && !!ed.selectedId && doc.items.some(i => i.id === ed.selectedId);
    return (
      <div className="absolute inset-0 pointer-events-none z-20" data-pov-ui>
        <div className="absolute right-2 top-[max(8px,env(safe-area-inset-top))] pointer-events-auto glass rounded-2xl p-1.5 border border-white/10 shadow-2xl"><SceneButton label="View" /></div>
        {!sheetUp && <PhoneTapRow hint canEdit={!readOnly} />}
        {!sheetUp && <div className="absolute left-2 right-2 bottom-[max(8px,env(safe-area-inset-bottom))] pointer-events-auto flex items-center gap-1 glass rounded-[22px] p-1.5 border border-white/10 shadow-2xl" data-testid="stand-here-bar">
          <button className="flex-1 min-w-0 h-14 rounded-2xl flex items-center justify-center gap-2 text-[14px] font-semibold text-white active:bg-white/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400" onClick={back} data-testid="hud-close"><X size={20} /> Back to the map</button>
        </div>}
      </div>
    );
  }
  return (
    <div className="absolute inset-0 pointer-events-none z-20" data-pov-ui>
      {editing && <TeeMap big={ed.teeMap === "big"} off={ed.teeMap === "off"} />}
      <div className="absolute left-1/2 -translate-x-1/2 pointer-events-auto flex items-center gap-2 whitespace-nowrap glass backdrop-blur rounded-full px-2 py-1.5 border border-white/10 shadow-2xl" style={{ bottom: editing ? toolbar + 24 : 24 }} data-testid="stand-here-bar">
        <span className="pl-2 text-sm text-zinc-300">Standing here</span>
        <button className="px-3 py-1.5 rounded-full text-sm font-semibold text-white hover:bg-white/10 flex items-center gap-1.5" onClick={back} data-testid="hud-close"><X size={15} /> Back to map</button>
      </div>
      <div className="absolute top-4 right-4 pointer-events-auto"><SceneButton /></div>
      {(!editing || ed.tool === "select") && <DeskTapRow editing={editing} bottom={(editing ? toolbar + 24 : 24) + 56} />}
    </div>
  );
}

/** Over the corner map while editing in tee view: what it is, bigger or smaller, and the view's
 * direction from the tee (a cone). The map itself is drawn by the view. */
function TeeMap({ big, off }: { big: boolean; off: boolean }) {
  const set = useEditor(e => e.set);
  const [m, setM] = useState<ReturnType<NonNullable<ReturnType<typeof getView>>["teeMini"]>>(null);
  useEffect(() => {
    let raf = 0;
    // (each frame, but drawn again only when it changed)
    let last = "";
    const tick = () => {
      const next = getView()?.teeMini() ?? null;
      const key = JSON.stringify(next);
      if (key !== last) { last = key; setM(next); }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  if (off) return <button className="absolute top-16 right-4 pointer-events-auto glass rounded-full px-3 py-1.5 text-xs font-semibold text-white border border-white/10" onClick={() => set({ teeMap: "small" })} data-testid="tee-map-show">Show the map from above</button>;
  if (!m) return null;
  const { rect: r, tee, ahead, fov } = m;
  // (the cone: from the tee, the view's width either side of where it looks)
  let cone = "";
  if (tee && ahead) {
    const a = Math.atan2(ahead.y - tee.y, ahead.x - tee.x), len = Math.max(r.width, r.height), half = Math.min(80, fov / 2) * Math.PI / 180;
    const p = (t: number) => `${tee.x - r.x + Math.cos(a + t) * len},${tee.y - r.y + Math.sin(a + t) * len}`;
    cone = `M${tee.x - r.x},${tee.y - r.y} L${p(-half)} L${p(half)} Z`;
  }
  return (
    <div className="absolute pointer-events-none rounded-2xl ring-1 ring-white/20 shadow-2xl" style={{ left: r.x, top: r.y, width: r.width, height: r.height }} data-testid="tee-map">
      <svg className="absolute inset-0 rounded-2xl" width={r.width} height={r.height}>
        {cone && <path d={cone} fill="rgba(255,255,255,0.10)" stroke="rgba(255,255,255,0.45)" strokeWidth={1} />}
        {tee && <circle cx={tee.x - r.x} cy={tee.y - r.y} r={5} fill="#2563eb" stroke="#fff" strokeWidth={2} />}
      </svg>
      <div className="absolute left-2 top-2 flex items-center gap-1 pointer-events-auto">
        <span className="px-2 py-0.5 rounded-lg bg-black/60 text-[11.5px] text-zinc-100">From above · drag here too</span>
        <button className="p-1 rounded-lg bg-black/60 text-zinc-100 hover:bg-black/75" aria-label={big ? "Smaller" : "Bigger"} title={big ? "Smaller" : "Bigger"} onClick={() => set({ teeMap: big ? "small" : "big" })} data-testid="tee-map-size">{big ? <Minimize2 size={13} /> : <Maximize2 size={13} />}</button>
        <button className="p-1 rounded-lg bg-black/60 text-zinc-100 hover:bg-black/75" aria-label="Hide the map from above" title="Hide" onClick={() => set({ teeMap: "off" })}><X size={13} /></button>
      </div>
    </div>
  );
}
