// A course shared with you to look at: its totals, its holes (one click goes to a hole) and the
// picked hole's numbers. Nothing in it changes the course.
import { useMemo } from "react";
import { Copy, Eye } from "lucide-react";
import { TEE_LEVELS } from "../constants";
import { holeTees } from "../lib/course";
import { courseStats, courseTotals } from "../lib/holeStats";
import { fmtDist, fmtElev } from "../lib/units";
import { select } from "../state/actions";
import { useCourse, useEditor } from "../state/course";
import { getView } from "../components/MapViewport";
import { Section, Stat } from "../components/ui";
import { copyCourse, holesOf } from "./courses";

export function ViewerPanelBody() {
  const doc = useCourse(s => s.doc);
  const ed = useEditor();
  const stats = useMemo(() => courseStats(doc), [doc]);
  const totals = useMemo(() => courseTotals(doc, stats), [doc, stats]);
  const u = doc.units;
  const picked = stats.find(s => s.holeId === ed.selectedId || s.holeId === ed.activeHoleId) ?? null;
  const hole = picked ? doc.holes.find(h => h.id === picked.holeId) : null;
  return (
    <div data-testid="viewer-panel">
      <div className="px-4 pt-4 pb-3">
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-sky-900/60 text-sky-200 text-[11px] font-semibold mb-2"><Eye size={12} /> View only</span>
        <h2 className="text-lg font-bold text-zinc-50 leading-tight">{doc.name || "Untitled course"}</h2>
        {doc.designer && <p className="text-sm text-zinc-400">{doc.designer}</p>}
        <button className="mt-3 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 touch:py-2.5 text-sm font-semibold bg-zinc-800 hover:bg-zinc-700 text-zinc-100 border border-zinc-700" onClick={() => void copyCourse()} data-testid="copy-course">
          <Copy size={14} /> Make a copy
        </button>
      </div>
      {totals.complete > 0 && (
        <Section>
          <div className="grid grid-cols-3 gap-1.5" data-testid="course-totals">
            <Stat label="Holes" value={holesOf(doc)} />
            <Stat label="Par" value={totals.par} />
            <Stat label="Length" value={fmtDist(totals.length, u)} />
          </div>
        </Section>
      )}
      {picked && hole && (
        <Section title={hole.name || `Hole ${picked.label}`} testid="viewer-hole">
          <div className="grid grid-cols-3 gap-1.5">
            <Stat label="Par" value={picked.par} />
            <Stat label="Length" value={picked.complete ? fmtDist(picked.length, u) : "—"} />
            <Stat label="Elevation" value={picked.complete ? fmtElev(picked.elevationChange, u) : "—"} />
          </div>
          {picked.complete && picked.playsLike !== picked.length && <p className="text-xs text-zinc-400 mt-2">Plays like {fmtDist(picked.playsLike, u)}</p>}
        </Section>
      )}
      <Section title={`${stats.length} hole${stats.length === 1 ? "" : "s"}`} testid="hole-list">
        {stats.length === 0 ? <p className="text-xs text-zinc-400">No holes yet.</p> : (
          <ol className="space-y-0.5">
            {stats.map(s => {
              const h = doc.holes.find(x => x.id === s.holeId)!;
              const sel = picked?.holeId === s.holeId;
              const tees = holeTees(doc, s.holeId);
              return (
                <li key={s.holeId}>
                  <button data-testid="hole-row" onClick={() => { select(s.holeId); requestAnimationFrame(() => getView()?.fitHole(s.holeId)); }}
                    className={`w-full flex items-center gap-2 rounded-lg px-2 py-1.5 touch:py-2.5 text-left transition-colors ${sel ? "bg-orange-500/15 ring-1 ring-orange-400/60" : "hover:bg-zinc-800"}`}>
                    <span className="min-w-[1.5rem] h-6 px-1 rounded-full flex items-center justify-center text-[12px] font-bold shrink-0" style={{ background: TEE_LEVELS[s.level].color, color: TEE_LEVELS[s.level].ink }}>{s.label}</span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm text-zinc-100 truncate">{h.name || `Hole ${s.label}`}</span>
                      <span className="block text-[11px] text-zinc-400">{s.complete ? <>{fmtDist(s.length, u)} · {fmtElev(s.elevationChange, u)}{tees.length > 1 ? ` · ${tees.length} tees` : ""}</> : "unfinished"}</span>
                    </span>
                    <span className="text-sm font-bold text-zinc-200 tabular-nums">P{s.par}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        )}
      </Section>
    </div>
  );
}

export const ViewerPanel = () => (
  <aside className="w-[340px] shrink-0 bg-zinc-900 border-r border-zinc-800 overflow-y-auto" aria-label="Course" data-testid="side-panel">
    <ViewerPanelBody />
  </aside>
);
