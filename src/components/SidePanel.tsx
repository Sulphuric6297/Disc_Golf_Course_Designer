// The side panel follows the steps: what to do now, and the lists for it. The map stays the one
// canvas; the steps never lock anything.
import { useMemo, useState, type ReactNode } from "react";
import { AlertTriangle, ArrowRight, CircleDot, ClipboardCheck, Download, Eye, EyeOff, Info, MapPinned, Palette, Pentagon, Plus, Route, Signpost, Spline, Trash2, TreeDeciduous, type LucideIcon } from "lucide-react";
import { AREA_KINDS, LINE_KINDS, STRUCTURE_KINDS, TEE_LEVELS, TEE_ORDER, generateId } from "../constants";
import { activeLayout, holeTees } from "../lib/course";
import { courseIssues, courseStats, courseTotals, levelsOnCourse, openIssues, playsOf, swapped, type SafetyIssue } from "../lib/holeStats";
import { fmtDist, fmtElev, toUnits } from "../lib/units";
import { select } from "../state/actions";
import { changeDoc, useCourse, useEditor, type Step } from "../state/course";
import type { AreaKind, Layout, LineKind, PinPosition, StructureKind, TeeLevel, ToolMode } from "../types";
import { refreshOsm } from "../state/osm";
import { measureLidar } from "../state/lidar";
import { saplings, yearsSince } from "../lib/lidar";
import { getView } from "./MapViewport";
import { structureIcon } from "./Toolbar";
import { Button, Field, Section, Segmented, Slider, Stat, TextInput, Toggle } from "./ui";
import { DesignPanel } from "./DesignPanel";
import { ExportPanel } from "./ExportPanel";
import { useTouch } from "./useLayout";
import { SERVER } from "../auth/api";
import { draftHoles } from "../auth/courses";
import { NearbyCourses, NearbySafety } from "../auth/Nearby";

export const STEPS: { id: Step; label: string; title: string }[] = [
  { id: "site", label: "Site", title: "Your site" },
  { id: "holes", label: "Holes", title: "Holes" },
  { id: "features", label: "Features", title: "OB, mandos and more" },
  { id: "review", label: "Review", title: "Review" },
  { id: "design", label: "Design", title: "Map design" },
  { id: "export", label: "Export", title: "Export" }
];

/** The steps' icons (the phone's step bar and rail). */
export const STEP_ICONS: Record<Step, LucideIcon> = { site: MapPinned, holes: Route, features: Signpost, review: ClipboardCheck, design: Palette, export: Download };

/** Mouse words for a touch screen: tap instead of click, hold instead of right-click, no key letters. */
export const touchWords = (text: string) =>
  text
    .replace(/,? then double-click the other/g, ", then the other and Done")
    .replace(/Right-click/g, "Hold a finger on")
    .replace(/\b([Cc])lick(s|ing)?\b/g, (_m, c: string, end?: string) => `${c === "C" ? "T" : "t"}ap${end === "ing" ? "ping" : end ?? ""}`)
    .replace(/ \((?:[A-Z]|[A-Z] \/ [A-Z])\)$/, "");

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

const ToolCard = ({ icon, title, onClick, active, testid }: { icon: ReactNode; title: string; onClick: () => void; active?: boolean; testid?: string }) => {
  const touch = useTouch();
  return (
    <button onClick={onClick} data-testid={testid} className={`w-full text-left flex gap-3 items-start rounded-lg px-3 py-2 touch:py-2.5 border transition-colors ${active ? "border-orange-400 bg-orange-500/10" : "border-zinc-800 hover:border-zinc-600 bg-zinc-800/40"}`}>
      <span className="mt-0.5 text-orange-300">{icon}</span>
      <span>
        <span className="block text-sm font-semibold text-zinc-100">{touch ? touchWords(title) : title}</span>
      </span>
    </button>
  );
};

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
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Button small onClick={onFindSite}>Resize or re-import the site</Button>
            <Button small onClick={() => void refreshOsm()} testid="refresh-osm">Update paths, roads and water</Button>
          </div>
          <div className="mt-3 pt-2 border-t border-white/10" data-testid="lidar-info">
            <div className="text-xs text-zinc-400 mb-1.5">{doc.lidar ? `${doc.lidar.trees.length.toLocaleString()} trees measured from the air · ${doc.lidar.source}` : "Trees and ground from LiDAR"}</div>
            <div className="flex flex-wrap gap-1.5">
              {ed.lidarBusy !== null
                ? <span className="text-xs text-zinc-300" data-testid="lidar-busy">Measuring… {Math.round(ed.lidarBusy * 100)}%</span>
                : <Button small onClick={() => void measureLidar()} testid="measure-lidar">{doc.lidar ? "Measure again" : "Measure trees and ground"}</Button>}
              {doc.lidar && ed.lidarBusy === null && <Button small tone="danger" onClick={() => changeDoc(() => ({ lidar: undefined }))} testid="remove-lidar">Remove the trees</Button>}
            </div>
            {doc.lidar && doc.lidar.trees.length > 0 && (
              <div className="mt-2" data-testid="lidar-min">
                <Slider label="Smallest tree kept" min={0} max={60} step={1} value={doc.lidar.minHeight ?? 0}
                  format={v => (v ? `${fmtElev(v, doc.units).replace(/^[+−-]/, "")} and up` : "All")}
                  onChange={v => changeDoc(d => (d.lidar ? { lidar: { ...d.lidar, minHeight: v || undefined } } : {}), false)} onDone={() => useCourse.getState().commit()} />
                <div className="text-[11px] text-zinc-500">{(() => { const m = doc.lidar.minHeight ?? 0; const n = m ? doc.lidar.trees.filter(t => t[2] >= m).length : doc.lidar.trees.length; return `${n.toLocaleString()} of ${doc.lidar.trees.length.toLocaleString()} kept`; })()}</div>
                <div className="mt-2" data-testid="lidar-grow">
                  <Slider label="Grown since the survey" min={0} max={25} step={1} value={doc.lidar.growYears ?? 0}
                    format={v => (v ? `${v} year${v === 1 ? "" : "s"} · ${saplings(doc.lidar!.trees, v).length.toLocaleString()} new` : "As measured")}
                    onChange={v => changeDoc(d => (d.lidar ? { lidar: { ...d.lidar, growYears: v || undefined } } : {}), false)} onDone={() => useCourse.getState().commit()} />
                  {yearsSince(doc.lidar.source) > 0 && (doc.lidar.growYears ?? 0) !== yearsSince(doc.lidar.source) && (
                    <button className="text-[12px] text-orange-300 hover:text-orange-200" onClick={() => changeDoc(d => (d.lidar ? { lidar: { ...d.lidar, growYears: yearsSince(d.lidar.source) } } : {}))} data-testid="grow-today">Grow to today ({yearsSince(doc.lidar.source)} years)</button>
                  )}
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Button small onClick={() => ed.set({ tool: "draw-area", areaKind: "woods", drawShape: "freehand", lidarLasso: "cut" })} testid="lasso-cut">Cut trees in an area</Button>
                  <Button small onClick={() => ed.set({ tool: "draw-area", areaKind: "woods", drawShape: "freehand", lidarLasso: "keep" })} testid="lasso-keep">Bring trees back in an area</Button>
                </div>
              </div>
            )}
          </div>
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
        <Toggle label="Satellite photo" checked={ed.photo} onChange={v => ed.set({ photo: v })} />
        <Toggle label="Contour lines" checked={ed.contours} onChange={v => ed.set({ contours: v })} />
        <Toggle label="Hill shading" checked={ed.shading} onChange={v => ed.set({ shading: v })} />
        <Toggle label="Ground texture up close" checked={ed.groundDetail} onChange={v => ed.set({ groundDetail: v })} />
      </Section>
      {SERVER && <NearbyCourses />}
      <NextButton step="site" />
    </>
  );
}

function LayoutEditor({ open, setOpen }: { open: boolean; setOpen: (f: (o: boolean) => boolean) => void }) {
  const doc = useCourse(s => s.doc);
  const setLayouts = (layouts: Layout[]) => changeDoc(() => ({ layouts }));
  return (
    <Section title="Layout" right={<button className="text-xs text-orange-300 hover:text-orange-200" onClick={() => setOpen(o => !o)}>{open ? "Done" : "Edit layouts"}</button>}>
      {doc.layouts.length > 1 && <Segmented label="Active layout" value={doc.activeLayout} onChange={v => changeDoc(() => ({ activeLayout: v }))} options={doc.layouts.map(l => ({ value: l.id, label: <span className="flex items-center gap-1 justify-center"><span className="w-2 h-2 rounded-full" style={{ background: TEE_LEVELS[l.tee].color }} />{l.name}</span> }))} />}
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
  // (in a draft on a HyzerLab server: the holes it changes)
  const changed = useMemo(() => (SERVER ? draftHoles(doc) : new Set<string>()), [doc]);
  const ed = useEditor();
  const stats = courseStats(doc);
  const totals = useMemo(() => courseTotals(doc, stats), [doc, stats]);
  // (a hole with two numbers counts twice, as on the scorecard)
  const played = doc.holes.reduce((n, h) => n + playsOf(doc, h.id), 0);
  const u = doc.units;
  // One layout: no switcher above the list, its editor a link in the list's header
  const [layoutsOpen, setLayoutsOpen] = useState(false);
  const oneLayout = doc.layouts.length < 2 && !layoutsOpen;
  return (
    <>
      <Section>
        <ToolCard icon={<Route size={18} />} title="New hole (H)" active={ed.tool === "add-hole"} onClick={() => ed.set({ tool: "add-hole" })} testid="new-hole" />
      </Section>
      {!oneLayout && <LayoutEditor open={layoutsOpen} setOpen={setLayoutsOpen} />}
      <Section title={`${played} hole${played === 1 ? "" : "s"}`} testid="hole-list" right={oneLayout ? <button className="text-xs text-orange-300 hover:text-orange-200 touch:py-2" onClick={() => setLayoutsOpen(true)}>Edit layouts</button> : undefined}>
        {doc.holes.length === 0 ? (
          <p className="text-xs text-zinc-400">No holes yet.</p>
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
                    <span className="min-w-[1.5rem] h-6 px-1 rounded-full flex items-center justify-center text-[12px] font-bold shrink-0 whitespace-nowrap" style={{ background: TEE_LEVELS[s.level].color, color: TEE_LEVELS[s.level].ink, fontFamily: "Oswald, Inter" }} data-testid="hole-badge">{s.label}</span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm text-zinc-100 truncate">{hole.name || `Hole ${s.label}`}</span>
                      <span className="block text-[11px] text-zinc-400">
                        {s.complete ? <>{fmtDist(s.length, u)} · {fmtElev(s.elevationChange, u)}{tees.length > 1 ? ` · ${tees.length} tees` : ""}</> : "unfinished"}
                      </span>
                    </span>
                    {changed.has(s.holeId) && <span className="w-2 h-2 rounded-full bg-orange-400 shrink-0" title="Changed in your draft" data-testid="draft-dot" />}
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
        {doc.holes.length > 1 && (
          <div className="mt-3" data-testid="auto-walks">
            <Toggle label="Walks to the next hole (automatic)" checked={doc.style.nextTee} onChange={v => changeDoc(d => ({ style: { ...d.style, nextTee: v } }))} />
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
  const area = (kind: AreaKind) => (
    <ToolCard key={kind} icon={<Pentagon size={17} style={{ color: AREA_KINDS[kind].color }} />} title={AREA_KINDS[kind].label} active={ed.tool === "draw-area" && ed.areaKind === kind} onClick={() => ed.set({ tool: "draw-area", areaKind: kind })} testid={`feature-area-${kind}`} />
  );
  const line = (kind: LineKind) => (
    <ToolCard key={kind} icon={<Spline size={17} style={{ color: LINE_KINDS[kind].color }} />} title={LINE_KINDS[kind].label} active={ed.tool === "draw-line" && ed.lineKind === kind} onClick={() => ed.set({ tool: "draw-line", lineKind: kind })} testid={`feature-line-${kind}`} />
  );
  const built = (kind: StructureKind) => (
    <ToolCard key={kind} icon={<span className="inline-block" dangerouslySetInnerHTML={{ __html: structureIcon(kind, 18, `card-${kind}`) }} />} title={STRUCTURE_KINDS[kind].label} active={ed.tool === "draw-structure" && ed.structureKind === kind} onClick={() => ed.set({ tool: "draw-structure", structureKind: kind, drawShape: STRUCTURE_KINDS[kind].shape === "outline" ? "box" : "points" })} testid={`feature-structure-${kind}`} />
  );
  const tool = (mode: ToolMode, icon: ReactNode, title: string) => (
    <ToolCard key={mode} icon={icon} title={title} active={ed.tool === mode} onClick={() => ed.set({ tool: mode })} testid={`feature-${mode}`} />
  );
  const photoTrees = doc.items.filter(i => i.type === "tree" && i.importSource === "photo").length;
  const photoAreas = doc.items.filter(i => i.type === "area" && i.importSource === "photo").length;
  const osm = doc.items.filter(i => (i.type === "area" || i.type === "line" || i.type === "structure") && i.importSource === "osm").length;
  return (
    <>
      <Section title="Rules of play">
        <div className="space-y-1.5">
          {area("ob")}
          {line("ob")}
          {area("hazard")}
          {tool("add-mando", <Signpost size={17} className="text-orange-400" />, "Mando (M)")}
          {tool("add-dropzone", <CircleDot size={17} className="text-orange-400" />, "Drop zone (Z)")}
        </div>
      </Section>
      <Section title="The land">
        <div className="space-y-1.5">
          {area("water")}
          {line("stream")}
          {area("woods")}
          {tool("add-tree", <TreeDeciduous size={17} className="text-green-400" />, "Trees (R)")}
          {area("fairway")}
          {area("nogo")}
          {area("casual")}
        </div>
      </Section>
      <Section title="Getting around">
        <div className="space-y-1.5">
          {line("path")}
          {line("walk")}
          {line("road")}
          {line("fence")}
          {area("parking")}
          {tool("add-amenity", <Info size={17} className="text-sky-400" />, "Benches, signs, parking… (A)")}
        </div>
      </Section>
      <Section title="Buildings and bridges (S)" testid="feature-structures">
        <div className="space-y-1.5">
          {built("bridge")}
          {built("boardwalk")}
          {built("stairs")}
          {built("wall")}
          {built("building")}
          {built("shelter")}
          {built("deck")}
        </div>
      </Section>
      {(photoTrees > 0 || photoAreas > 0 || osm > 0) && (
        <Section title="Brought in automatically">
          {(photoTrees > 0 || photoAreas > 0) && (
            <div className="flex items-center justify-between text-xs text-zinc-300 mb-1.5" data-testid="photo-found">
              {[photoAreas ? `${photoAreas} area${photoAreas > 1 ? "s" : ""}` : "", photoTrees ? `${photoTrees} trees` : ""].filter(Boolean).join(" and ")} from the photo
              <Button small tone="danger" onClick={() => changeDoc(d => ({ items: d.items.filter(i => !((i.type === "tree" || i.type === "area") && i.importSource === "photo")) }))}>Remove all</Button>
            </div>
          )}
          {osm > 0 && (
            <div className="flex items-center justify-between text-xs text-zinc-300">
              {osm} shapes from OpenStreetMap
              <Button small tone="danger" onClick={() => changeDoc(d => ({ items: d.items.filter(i => !((i.type === "area" || i.type === "line" || i.type === "structure") && i.importSource === "osm")) }))}>Remove all</Button>
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
  const stats = courseStats(doc);
  const totals = useMemo(() => courseTotals(doc, stats), [doc, stats]);
  const all = courseIssues(doc);
  const { open: issues, ignored } = openIssues(doc, all);
  const ignore = (id: string, off: boolean) =>
    changeDoc(d => {
      const list = (d.ignoredChecks ?? []).filter(x => x !== id && x !== swapped(id));
      return { ignoredChecks: off ? [...list, id] : list.length ? list : undefined };
    });
  const [showIgnored, setShowIgnored] = useState(false);
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
            {issues.map(issue => (
              <li key={issue.id} className="flex items-start gap-1 group">
                <button
                  className="flex-1 min-w-0 flex gap-2 items-start text-left text-xs text-zinc-200 hover:bg-zinc-800 rounded px-1.5 py-1"
                  data-testid="issue-row"
                  onClick={() => {
                    if (issue.holes[0]) select(issue.holes[0]);
                    getView()?.fitBounds({ minX: issue.at.x - 120, minY: issue.at.y - 120, maxX: issue.at.x + 120, maxY: issue.at.y + 120 });
                  }}
                >
                  <IssueIcon level={issue.level} />
                  {issue.text}
                </button>
                <button className="shrink-0 p-1 touch:p-2.5 rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800" title="Ignore" aria-label="Ignore" data-testid="issue-ignore" onClick={() => ignore(issue.id, true)}>
                  <EyeOff size={13} />
                </button>
              </li>
            ))}
          </ul>
        )}
        {ignored.length > 0 && (
          <div className="mt-2" data-testid="issues-ignored">
            <button className="text-[11px] text-zinc-400 hover:text-zinc-200" aria-expanded={showIgnored} onClick={() => setShowIgnored(v => !v)}>
              Ignored ({ignored.length})
            </button>
            {showIgnored && (
              <ul className="space-y-1 mt-1">
                {ignored.map(issue => (
                  <li key={issue.id} className="flex items-start gap-1 text-xs text-zinc-500" data-testid="ignored-row">
                    <span className="flex-1 min-w-0 flex gap-2 items-start px-1.5 py-1"><IssueIcon level={issue.level} />{issue.text}</span>
                    <button className="shrink-0 p-1 touch:p-2.5 rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800" title="Check again" aria-label="Check again" onClick={() => ignore(issue.id, false)}>
                      <Eye size={13} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        <div className="mt-3 border-t border-zinc-800 pt-2">
          <Field label="Safe distance between holes">
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
                <td className="py-0.5">{s.label}</td>
                <td className="text-right">{s.par}</td>
                <td className="text-right">{s.complete ? fmtDist(s.length, u, false) : "–"}</td>
                <td className="text-right">{s.complete ? fmtDist(s.playsLike, u, false) : "–"}</td>
                <td className="text-right">{s.complete ? fmtElev(s.elevationChange, u).replace(` ${u}`, "") : "–"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
      {SERVER && <NearbySafety />}
      <NextButton step="review" />
    </>
  );
}

/** The step's own content (lists, settings and tools), under its heading. */
export function StepContent({ onFindSite }: { onFindSite: () => void }) {
  const step = useEditor(e => e.step);
  return (
    <>
      {step === "site" && <SiteStep onFindSite={onFindSite} />}
      {step === "holes" && <HolesStep />}
      {step === "features" && <FeaturesStep />}
      {step === "review" && <ReviewStep />}
      {step === "design" && <DesignPanel />}
      {step === "export" && <ExportPanel />}
    </>
  );
}

export function SidePanel({ onFindSite }: { onFindSite: () => void }) {
  const step = useEditor(e => e.step);
  const i = STEPS.findIndex(s => s.id === step);
  const meta = STEPS[i];
  return (
    <aside className="w-[340px] shrink-0 bg-zinc-900 border-r border-zinc-800 overflow-y-auto" aria-label="Step panel" data-testid="side-panel">
      <div className="px-4 pt-4 pb-2">
        <div className="text-[11px] font-bold tracking-wider text-orange-400 uppercase">Step {i + 1} of {STEPS.length}</div>
        <h2 className="text-lg font-bold text-zinc-50">{meta.title}</h2>
      </div>
      <StepContent onFindSite={onFindSite} />
    </aside>
  );
}
