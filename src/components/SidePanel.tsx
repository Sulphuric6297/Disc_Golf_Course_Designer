// The side panel follows the steps: what to do now, and the lists for it. The map stays the one
// canvas; the steps never lock anything.
import { useMemo, useState, type ReactNode } from "react";
import { AlertTriangle, ArrowRight, CircleDot, Info, MapPinned, Pentagon, Plus, Route, Signpost, Spline, Trash2, TreeDeciduous } from "lucide-react";
import { AREA_KINDS, LINE_KINDS, TEE_LEVELS, TEE_ORDER, generateId } from "../constants";
import { activeLayout, holeTees } from "../lib/course";
import { courseTotals, holeStats, levelsOnCourse, safetyIssues, type SafetyIssue } from "../lib/holeStats";
import { fmtDist, fmtElev, toUnits } from "../lib/units";
import { select } from "../state/actions";
import { changeDoc, useCourse, useEditor, type Step } from "../state/course";
import type { AreaKind, Layout, LineKind, PinPosition, TeeLevel, ToolMode } from "../types";
import { getView } from "./MapViewport";
import { Button, Field, Section, Segmented, Stat, TextInput, Toggle } from "./ui";
import { DesignPanel } from "./DesignPanel";
import { ExportPanel } from "./ExportPanel";

export const STEPS: { id: Step; label: string; title: string; blurb: string }[] = [
  { id: "site", label: "Site", title: "Your site", blurb: "The satellite photo, elevation, trees, paths and water for the land the course goes on." },
  { id: "holes", label: "Holes", title: "Holes", blurb: "Click a tee spot, then a basket spot. Bend the line with its dots; add more tees and pins." },
  { id: "features", label: "Features", title: "OB, mandos and more", blurb: "Out of bounds, hazards, water, mandos, drop zones, paths, benches and signs." },
  { id: "review", label: "Review", title: "Review", blurb: "Par, lengths, elevation and safety checks for the whole course." },
  { id: "design", label: "Design", title: "Map design", blurb: "Make the course map beautiful: style, colors, labels and the title block." },
  { id: "export", label: "Export", title: "Export and share", blurb: "Course map, tee signs, scorecard, GPS files, and a link to share." }
];

const NextButton = ({ step }: { step: Step }) => {
  const i = STEPS.findIndex(s => s.id === step);
  const next = STEPS[i + 1];
  if (!next) return null;
  return (
    <div className="px-4 py-3">
      <Button full onClick={() => useEditor.getState().set({ step: next.id, tool: "select" })} testid="next-step">Next: {next.label} <ArrowRight size={15} /></Button>
    </div>
  );
};

const ToolCard = ({ icon, title, text, onClick, active, testid }: { icon: ReactNode; title: string; text: string; onClick: () => void; active?: boolean; testid?: string }) => (
  <button onClick={onClick} data-testid={testid} className={`w-full text-left flex gap-3 items-start rounded-lg px-3 py-2 border transition-colors ${active ? "border-orange-400 bg-orange-500/10" : "border-zinc-800 hover:border-zinc-600 bg-zinc-800/40"}`}>
    <span className="mt-0.5 text-orange-300">{icon}</span>
    <span>
      <span className="block text-sm font-semibold text-zinc-100">{title}</span>
      <span className="block text-[11px] text-zinc-400">{text}</span>
    </span>
  </button>
);

function SiteStep({ onFindSite }: { onFindSite: () => void }) {
  const doc = useCourse(s => s.doc);
  const ed = useEditor();
  const set = (patch: Partial<typeof doc>) => changeDoc(() => patch);
  const relief = useMemo(() => {
    const v = Object.values(doc.terrainHeights);
    return v.length ? Math.max(0, ...v) - Math.min(0, ...v) : 0;
  }, [doc.terrainHeights]);
  return (
    <>
      {!doc.site.bounds ? (
        <Section>
          <Button tone="primary" full onClick={onFindSite} testid="find-site"><MapPinned size={16} /> Find your park</Button>
          <p className="text-xs text-zinc-400 mt-2">Search for the park or address, frame the area, and the photo, elevation, trees and paths come in by themselves. Or design on open ground: the Hole tool works right away.</p>
        </Section>
      ) : (
        <Section title="Site" testid="site-info">
          <div className="text-sm text-zinc-100 mb-1">{doc.site.location?.label}</div>
          <div className="text-xs text-zinc-400 space-y-0.5">
            <div>{Math.round(doc.canvas.width).toLocaleString()} × {Math.round(doc.canvas.height).toLocaleString()} ft · {((doc.canvas.width * doc.canvas.height) / 43560).toFixed(1)} acres</div>
            <div>Lowest point {Math.round(toUnits(doc.site.baseElevationFt, doc.units))} {doc.units} · {fmtDist(relief, doc.units)} of relief</div>
            {doc.site.elevationSource && <div>Elevation: {doc.site.elevationSource}</div>}
            {doc.site.imagerySource && <div>Photo: {doc.site.imagerySource}</div>}
          </div>
          <div className="mt-2"><Button small onClick={onFindSite}>Change or re-import the site</Button></div>
        </Section>
      )}
      <Section title="Course">
        <Field label="Course name"><TextInput label="Course name" value={doc.name} onChange={v => set({ name: v })} /></Field>
        <Field label="Designer"><TextInput label="Designer" value={doc.designer} placeholder="Your name or club" onChange={v => set({ designer: v })} /></Field>
        <Field label="Distances in">
          <Segmented label="Units" value={doc.units} onChange={v => set({ units: v })} options={[{ value: "ft", label: "Feet" }, { value: "m", label: "Meters" }]} />
        </Field>
      </Section>
      <Section title="Map display">
        <Toggle label="Satellite photo" checked={ed.photo} onChange={v => ed.set({ photo: v })} hint={ed.photo ? undefined : "Showing the drawn map in the Design step's colors."} />
        <Toggle label="Contour lines" checked={ed.contours} onChange={v => ed.set({ contours: v })} />
        <Toggle label="Hill shading" checked={ed.shading} onChange={v => ed.set({ shading: v })} />
        <Toggle label="Ground texture up close" checked={ed.groundDetail} onChange={v => ed.set({ groundDetail: v })} />
      </Section>
      <NextButton step="site" />
    </>
  );
}

function LayoutEditor() {
  const doc = useCourse(s => s.doc);
  const [open, setOpen] = useState(false);
  const setLayouts = (layouts: Layout[]) => changeDoc(() => ({ layouts }));
  return (
    <Section title="Layout" right={<button className="text-xs text-orange-300 hover:text-orange-200" onClick={() => setOpen(o => !o)}>{open ? "Done" : "Edit layouts"}</button>}>
      <Segmented label="Active layout" value={doc.activeLayout} onChange={v => changeDoc(() => ({ activeLayout: v }))} options={doc.layouts.map(l => ({ value: l.id, label: <span className="flex items-center gap-1 justify-center"><span className="w-2 h-2 rounded-full" style={{ background: TEE_LEVELS[l.tee].color }} />{l.name}</span> }))} />
      <p className="text-[11px] text-zinc-500 mt-1.5">A layout plays each hole from one tee color to one pin position. Lengths and par follow it.</p>
      {open && (
        <div className="mt-2 space-y-2" data-testid="layout-editor">
          {doc.layouts.map(l => (
            <div key={l.id} className="bg-zinc-800/60 rounded-lg p-2 space-y-1.5">
              <div className="flex gap-1.5">
                <TextInput label="Layout name" value={l.name} onChange={v => setLayouts(doc.layouts.map(x => (x.id === l.id ? { ...x, name: v } : x)))} />
                {doc.layouts.length > 1 && <button aria-label="Remove layout" className="text-zinc-400 hover:text-red-400 px-1" onClick={() => changeDoc(d => ({ layouts: d.layouts.filter(x => x.id !== l.id), activeLayout: d.activeLayout === l.id ? d.layouts.find(x => x.id !== l.id)!.id : d.activeLayout }))}><Trash2 size={14} /></button>}
              </div>
              <Segmented label="Layout tees" value={l.tee} onChange={v => setLayouts(doc.layouts.map(x => (x.id === l.id ? { ...x, tee: v as TeeLevel } : x)))} options={TEE_ORDER.map(t => ({ value: t, label: TEE_LEVELS[t].label }))} />
              <Segmented label="Layout pins" value={l.pin} onChange={v => setLayouts(doc.layouts.map(x => (x.id === l.id ? { ...x, pin: v as PinPosition } : x)))} options={(["A", "B", "C", "D"] as PinPosition[]).map(p => ({ value: p, label: `Pin ${p}` }))} />
            </div>
          ))}
          <Button small onClick={() => {
            const id = `layout-${generateId()}`;
            const used = new Set(doc.layouts.map(l => l.tee));
            const tee = TEE_ORDER.find(t => !used.has(t)) ?? "white";
            changeDoc(d => ({ layouts: [...d.layouts, { id, name: TEE_LEVELS[tee].label, tee, pin: "A" }], activeLayout: id }));
          }}><Plus size={14} /> Add a layout</Button>
        </div>
      )}
    </Section>
  );
}

function HolesStep() {
  const doc = useCourse(s => s.doc);
  const ed = useEditor();
  const stats = useMemo(() => doc.holes.map(h => holeStats(doc, h)), [doc]);
  const totals = useMemo(() => courseTotals(doc, stats), [doc, stats]);
  const u = doc.units;
  return (
    <>
      <Section>
        <ToolCard icon={<Route size={18} />} title="New hole (H)" text="Click where the tee goes, then where the basket goes. Keep clicking pairs for the next holes." active={ed.tool === "add-hole"} onClick={() => ed.set({ tool: "add-hole" })} testid="new-hole" />
      </Section>
      <LayoutEditor />
      <Section title={`${doc.holes.length} hole${doc.holes.length === 1 ? "" : "s"}`} testid="hole-list">
        {doc.holes.length === 0 ? (
          <p className="text-xs text-zinc-400">No holes yet. Pick the Hole tool and click a tee spot, then a basket spot.</p>
        ) : (
          <ol className="space-y-0.5">
            {stats.map(s => {
              const hole = doc.holes.find(h => h.id === s.holeId)!;
              const sel = ed.selectedId === s.holeId || ed.activeHoleId === s.holeId;
              const tees = holeTees(doc, s.holeId);
              return (
                <li key={s.holeId}>
                  <button
                    data-testid="hole-row"
                    onClick={() => { select(s.holeId); requestAnimationFrame(() => getView()?.fitHole(s.holeId)); }}
                    className={`w-full flex items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors ${sel ? "bg-orange-500/15 ring-1 ring-orange-400/60" : "hover:bg-zinc-800"}`}
                  >
                    <span className="w-6 h-6 rounded-full flex items-center justify-center text-[12px] font-bold shrink-0" style={{ background: TEE_LEVELS[s.level].color, color: TEE_LEVELS[s.level].ink, fontFamily: "Oswald, Inter" }}>{s.number}</span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm text-zinc-100 truncate">{hole.name || `Hole ${s.number}`}</span>
                      <span className="block text-[11px] text-zinc-400">
                        {s.complete ? <>{fmtDist(s.length, u)} · {fmtElev(s.elevationChange, u)}{tees.length > 1 ? ` · ${tees.length} tees` : ""}</> : "unfinished"}
                      </span>
                    </span>
                    <span className="text-sm font-bold text-zinc-200 tabular-nums">P{s.par}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        )}
        {totals.complete > 0 && (
          <div className="grid grid-cols-3 gap-1.5 mt-3" data-testid="course-totals">
            <Stat label="Par" value={totals.par} />
            <Stat label="Length" value={fmtDist(totals.length, u)} />
            <Stat label="Walking" value={fmtDist(totals.walk, u)} sub="between holes" />
          </div>
        )}
      </Section>
      <NextButton step="holes" />
    </>
  );
}

function FeaturesStep() {
  const doc = useCourse(s => s.doc);
  const ed = useEditor();
  const area = (kind: AreaKind, text: string) => (
    <ToolCard key={kind} icon={<Pentagon size={17} style={{ color: AREA_KINDS[kind].color }} />} title={AREA_KINDS[kind].label} text={text} active={ed.tool === "draw-area" && ed.areaKind === kind} onClick={() => ed.set({ tool: "draw-area", areaKind: kind })} testid={`feature-area-${kind}`} />
  );
  const line = (kind: LineKind, text: string) => (
    <ToolCard key={kind} icon={<Spline size={17} style={{ color: LINE_KINDS[kind].color }} />} title={LINE_KINDS[kind].label} text={text} active={ed.tool === "draw-line" && ed.lineKind === kind} onClick={() => ed.set({ tool: "draw-line", lineKind: kind })} testid={`feature-line-${kind}`} />
  );
  const tool = (mode: ToolMode, icon: ReactNode, title: string, text: string) => (
    <ToolCard key={mode} icon={icon} title={title} text={text} active={ed.tool === mode} onClick={() => ed.set({ tool: mode })} testid={`feature-${mode}`} />
  );
  const photoTrees = doc.items.filter(i => i.type === "tree" && i.importSource === "photo").length;
  const osm = doc.items.filter(i => (i.type === "area" || i.type === "line") && i.importSource === "osm").length;
  return (
    <>
      <Section title="Rules of play">
        <div className="space-y-1.5">
          {area("ob", "Draw around it: landing inside is OB.")}
          {line("ob", "A line that is OB (a road edge, a fence line).")}
          {area("hazard", "A penalty area that isn't OB.")}
          {tool("add-mando", <Signpost size={17} className="text-orange-400" />, "Mando (M)", "Click beside the hole's line where the post or tree is: it faces down the hole, passed on the line's side. Or a gate of two posts to pass between.")}
          {tool("add-dropzone", <CircleDot size={17} className="text-orange-400" />, "Drop zone (Z)", "Where to throw from after a missed mando or OB.")}
        </div>
        <p className="text-[11px] text-zinc-400 mt-2">Quick OB: pick a hole and use <b>Add OB</b> (left side, right side, behind the basket). Right-click a creek, road or fence to mark it OB. Areas can be dragged out as a rectangle or circle, or drawn freehand.</p>
      </Section>
      <Section title="The land">
        <div className="space-y-1.5">
          {area("water", "Ponds and lakes.")}
          {line("stream", "Creeks and ditches.")}
          {area("woods", "Thick woods, drawn as canopy.")}
          {tool("add-tree", <TreeDeciduous size={17} className="text-green-400" />, "Trees (R)", "Single trees that matter for play.")}
          {area("fairway", "A fairway shape drawn by hand (instead of the automatic one).")}
          {area("nogo", "Playgrounds, gardens, private land: keep throws away.")}
          {area("casual", "Casual relief: move the lie out, no penalty (marked blue).")}
        </div>
      </Section>
      <Section title="Getting around">
        <div className="space-y-1.5">
          {line("path", "Trails between holes.")}
          {line("walk", "The way to the next tee.")}
          {line("road", "Roads and drives.")}
          {line("fence", "Fences and walls.")}
          {area("parking", "Parking lots.")}
          {tool("add-amenity", <Info size={17} className="text-sky-400" />, "Benches, signs, parking… (A)", "Pick the kind in the bar above the tools.")}
        </div>
      </Section>
      {(photoTrees > 0 || osm > 0) && (
        <Section title="Brought in automatically">
          {photoTrees > 0 && (
            <div className="flex items-center justify-between text-xs text-zinc-300 mb-1.5">
              {photoTrees} trees found on the photo
              <Button small tone="danger" onClick={() => changeDoc(d => ({ items: d.items.filter(i => !(i.type === "tree" && i.importSource === "photo")) }))}>Remove all</Button>
            </div>
          )}
          {osm > 0 && (
            <div className="flex items-center justify-between text-xs text-zinc-300">
              {osm} shapes from OpenStreetMap
              <Button small tone="danger" onClick={() => changeDoc(d => ({ items: d.items.filter(i => !((i.type === "area" || i.type === "line") && i.importSource === "osm")) }))}>Remove all</Button>
            </div>
          )}
        </Section>
      )}
      <NextButton step="features" />
    </>
  );
}

const IssueIcon = ({ level }: { level: SafetyIssue["level"] }) => (
  level === "info" ? <Info size={14} className="text-sky-400 shrink-0 mt-0.5" /> : <AlertTriangle size={14} className={`${level === "danger" ? "text-red-400" : "text-amber-400"} shrink-0 mt-0.5`} />
);

function ReviewStep() {
  const doc = useCourse(s => s.doc);
  const stats = useMemo(() => doc.holes.map(h => holeStats(doc, h)), [doc]);
  const totals = useMemo(() => courseTotals(doc, stats), [doc, stats]);
  const issues = useMemo(() => safetyIssues(doc, stats), [doc, stats]);
  const u = doc.units;
  const layout = activeLayout(doc);
  const levels = levelsOnCourse(doc);
  const set = (patch: Partial<typeof doc.rules>) => changeDoc(d => ({ rules: { ...d.rules, ...patch } }));
  return (
    <>
      <Section title={`Course · ${layout?.name ?? ""} layout`} testid="review-summary">
        <div className="grid grid-cols-3 gap-1.5">
          <Stat label="Holes" value={totals.complete} />
          <Stat label="Par" value={totals.par} />
          <Stat label="Length" value={fmtDist(totals.length, u)} sub={totals.complete ? `avg ${fmtDist(totals.length / totals.complete, u)}` : undefined} />
          <Stat label="Walking" value={fmtDist(totals.walk, u)} />
          <Stat label="Climb" value={fmtDist(totals.climb, u)} />
          <Stat label="Par mix" value={<span className="text-sm">{Object.entries(totals.parCounts).map(([p, n]) => `${n}×${p}`).join(" ") || "–"}</span>} />
        </div>
        {levels.length > 0 && <p className="text-[11px] text-zinc-500 mt-2">Tee colors on the course: {levels.map(l => TEE_LEVELS[l].label).join(", ")}.</p>}
      </Section>
      <Section title={`Checks (${issues.length})`} testid="issues">
        {issues.length === 0 ? (
          <p className="text-xs text-emerald-300">No problems found.</p>
        ) : (
          <ul className="space-y-1">
            {issues.map((issue, i) => (
              <li key={i}>
                <button
                  className="w-full flex gap-2 items-start text-left text-xs text-zinc-200 hover:bg-zinc-800 rounded px-1.5 py-1"
                  data-testid="issue-row"
                  onClick={() => {
                    if (issue.holes[0]) select(issue.holes[0]);
                    getView()?.fitBounds({ minX: issue.at.x - 120, minY: issue.at.y - 120, maxX: issue.at.x + 120, maxY: issue.at.y + 120 });
                  }}
                >
                  <IssueIcon level={issue.level} />
                  {issue.text}
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-3 border-t border-zinc-800 pt-2">
          <Field label="Safe distance between holes" hint="The PDGA gives no number; automatic is the larger of 50 ft and 15% of the hole's length.">
            <Segmented label="Safe distance" value={doc.rules.safetyGapFt ?? 0} onChange={v => set({ safetyGapFt: v || undefined })} options={[{ value: 0, label: "Auto" }, { value: 50, label: "50 ft" }, { value: 75, label: "75 ft" }, { value: 100, label: "100 ft" }, { value: 150, label: "150 ft" }]} />
          </Field>
        </div>
      </Section>
      <Section title="Holes">
        <table className="w-full text-xs text-zinc-300 tabular-nums" data-testid="review-table">
          <thead className="text-zinc-500 text-[10px] uppercase">
            <tr><th className="text-left font-semibold">#</th><th className="text-right font-semibold">Par</th><th className="text-right font-semibold">Length</th><th className="text-right font-semibold">Plays</th><th className="text-right font-semibold">Elev</th></tr>
          </thead>
          <tbody>
            {stats.map(s => (
              <tr key={s.holeId} className="hover:bg-zinc-800 cursor-pointer" onClick={() => { select(s.holeId); requestAnimationFrame(() => getView()?.fitHole(s.holeId)); }}>
                <td className="py-0.5">{s.number}</td>
                <td className="text-right">{s.par}</td>
                <td className="text-right">{s.complete ? fmtDist(s.length, u, false) : "–"}</td>
                <td className="text-right">{s.complete ? fmtDist(s.playsLike, u, false) : "–"}</td>
                <td className="text-right">{s.complete ? fmtElev(s.elevationChange, u).replace(` ${u}`, "") : "–"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
      <NextButton step="review" />
    </>
  );
}

export function SidePanel({ onFindSite }: { onFindSite: () => void }) {
  const step = useEditor(e => e.step);
  const viewOnly = useEditor(e => e.viewOnly);
  const i = STEPS.findIndex(s => s.id === step);
  const meta = STEPS[i];
  return (
    <aside className="w-[340px] shrink-0 bg-zinc-900 border-r border-zinc-800 overflow-y-auto" aria-label="Step panel" data-testid="side-panel">
      <div className="px-4 pt-4 pb-2">
        <div className="text-[11px] font-bold tracking-wider text-orange-400 uppercase">Step {i + 1} of {STEPS.length}</div>
        <h2 className="text-lg font-bold text-zinc-50">{meta.title}</h2>
        <p className="text-sm text-zinc-400">{meta.blurb}</p>
      </div>
      {step === "site" && <SiteStep onFindSite={onFindSite} />}
      {step === "holes" && (viewOnly ? <ReviewStep /> : <HolesStep />)}
      {step === "features" && <FeaturesStep />}
      {step === "review" && <ReviewStep />}
      {step === "design" && <DesignPanel />}
      {step === "export" && <ExportPanel />}
    </aside>
  );
}
