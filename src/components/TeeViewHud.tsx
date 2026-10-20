// What shows over the view from a tee or a flyover: the hole's numbers and the controls.
import { useMemo } from "react";
import { ChevronLeft, ChevronRight, Plane, X } from "lucide-react";
import { TEE_LEVELS } from "../constants";
import { holeStats } from "../lib/holeStats";
import { fmtDist, fmtElev } from "../lib/units";
import { useCourse, useEditor } from "../state/course";
import { ElevationProfile } from "./ElevationProfile";
import { SceneButton } from "./ScenePanel";

export function TeeViewHud() {
  const doc = useCourse(s => s.doc);
  const ed = useEditor();
  const hole = doc.holes.find(h => h.id === ed.teeView);
  const s = useMemo(() => (hole ? holeStats(doc, hole) : null), [doc, hole]);
  if (!hole || !s) return null;
  const done = doc.holes.filter(h => holeStats(doc, h).complete);
  const i = done.findIndex(h => h.id === hole.id);
  const go = (d: number) => {
    const next = done[(i + d + done.length) % done.length];
    if (next) ed.set({ teeView: next.id, flyover: ed.flyover });
  };
  const lvl = TEE_LEVELS[s.level];
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
        <button className="px-3 py-1.5 rounded-full text-sm font-semibold text-white hover:bg-white/10 flex items-center gap-1.5" onClick={() => ed.set({ teeView: null, flyover: false })} data-testid="hud-close"><X size={15} /> Back to map</button>
      </div>
      <div className="absolute top-4 right-4 pointer-events-auto"><SceneButton /></div>
      {!ed.flyover && <div className="absolute bottom-20 left-1/2 -translate-x-1/2 text-xs text-white/80 bg-black/40 rounded px-2 py-1">Drag to look around · scroll to zoom · ← → other holes · Esc back to the map</div>}
    </div>
  );
}
