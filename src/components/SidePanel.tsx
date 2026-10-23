// The side panel follows the steps: what to do now, and the lists for it. The map stays the one
// canvas; the steps never lock anything.
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, ArrowRight, Link2, Info, X, ClipboardCheck, Download, Eye, EyeOff, MapPinned, Palette, Plus, Route, Trash2, Users, type LucideIcon } from "lucide-react";
import { TEE_LEVELS, TEE_ORDER, generateId } from "../constants";
import { activeLayout, holeBaskets, holeTees } from "../lib/course";
import { courseIssues, courseStats, courseTotals, levelsOnCourse, openIssues, playsOf, swapped, type SafetyIssue } from "../lib/holeStats";
import { fmtDist, fmtElev, toUnits } from "../lib/units";
import { addLayoutTees, pickLayout, select, uncutTrees } from "../state/actions";
import { toast } from "../state/toast";
import { changeDoc, useCourse, useEditor, type Step } from "../state/course";
import { SHOW_EVENT } from "./showSetting";
import type { Layout, PinPosition, TeeLevel } from "../types";
import { refreshOsm } from "../state/osm";
import { measureLidar } from "../state/lidar";
import { saplings, yearsSince } from "../lib/lidar";
import { getView } from "../state/view";
import { Button, Facts, Field, HelpLink, Section, Segmented, Slider, TextInput, Toggle } from "./ui";
import { DesignPanel } from "./DesignPanel";
import { ExportPanel } from "./ExportPanel";
import { useTouch } from "./useLayout";
import { LockedRow } from "./DemoNote";
import { InspectorBody, PANEL_INSET, SelectionHeader, useSelection } from "./Inspector";
import { SERVER } from "../auth/api";
import { draftHoles } from "../auth/courses";
import { NearbyCourses, NearbySafety } from "../auth/Nearby";

export const STEPS: { id: Step; label: string; title: string }[] = [
  { id: "site", label: "Site", title: "Your site" },
  { id: "design", label: "Design", title: "Design" },
  { id: "map", label: "Map", title: "Map" },
  { id: "export", label: "Export", title: "Export" }
];

/** The steps' icons (the phone's step bar and rail). */
export const STEP_ICONS: Record<Step, LucideIcon> = { site: MapPinned, design: Route, map: Palette, export: Download };

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
    <div className="px-4 py-3 flex justify-end">
      <Button tone="ghost" onClick={() => useEditor.getState().set({ step: next.id, tool: "select" })} testid="next-step">Next: {next.label} <ArrowRight size={15} /></Button>
    </div>
  );
};

const ToolCard = ({ icon, title, onClick, active, testid }: { icon: ReactNode; title: string; onClick: () => void; active?: boolean; testid?: string }) => {
  const touch = useTouch();
  return (
    <button onClick={onClick} data-testid={testid} className={`w-full text-left flex gap-3 items-center rounded-lg px-3 py-2 touch:py-2.5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 ${active ? "bg-orange-500/10 ring-1 ring-orange-500/40" : "bg-white/[0.07] hover:bg-white/[0.09]"}`}>
      <span className={active ? "text-orange-300" : "text-zinc-400"}>{icon}</span>
      <span>
        <span className="block text-sm font-semibold text-zinc-100">{touch ? touchWords(title) : title}</span>
      </span>
    </button>
  );
};

/** What was brought in by itself (from the photo, from OpenStreetMap), to take out at once. */
function BroughtIn() {
  const doc = useCourse(s => s.doc);
  const photoTrees = doc.items.filter(i => i.type === "tree" && i.importSource === "photo").length;
  const photoAreas = doc.items.filter(i => i.type === "area" && i.importSource === "photo").length;
  const osm = doc.items.filter(i => (i.type === "area" || i.type === "line" || i.type === "structure") && i.importSource === "osm").length;
  return (
    <>
      {(photoTrees > 0 || photoAreas > 0 || osm > 0) && (
        <Section title="Brought in automatically" help="brought-in">
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
    </>
  );
}

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
            <Button small onClick={() => refreshOsm()} testid="refresh-osm">Update paths, roads and water</Button>
          </div>
          <div className={`mt-3 ${doc.lidar ? "pt-2 border-t border-white/10" : "rounded-[16px] bg-orange-500/[0.12] ring-1 ring-orange-400/30 p-3"}`} data-testid="lidar-info">
            {!doc.lidar && <div className="text-[13.5px] font-semibold text-orange-100 mb-0.5 flex items-center gap-1.5">Real trees and ground <HelpLink topic="lidar" label="Real trees and ground" /></div>}
            <div className="text-xs text-zinc-400 mb-1.5 flex items-center gap-1.5">{doc.lidar ? <>{`${doc.lidar.trees.length.toLocaleString()} trees measured from the air · ${doc.lidar.source}`} <HelpLink topic="lidar" label="Measured trees" /></> : "Each tree's real spot and height, and the bare ground, from an aerial survey (LiDAR) where one has been flown."}</div>
            <div className="flex flex-wrap gap-1.5">
              {ed.lidarBusy !== null
                ? <span className="text-xs text-zinc-300" data-testid="lidar-busy">Measuring… {Math.round(ed.lidarBusy * 100)}%</span>
                : <Button small onClick={() => void measureLidar()} testid="measure-lidar">{doc.lidar ? "Measure again" : "Measure trees and ground"}</Button>}
              {doc.lidar && ed.lidarBusy === null && <Button small tone="danger" onClick={() => changeDoc(() => ({ lidar: undefined }))} testid="remove-lidar">Remove the measured trees</Button>}
            </div>
            {doc.lidar && doc.lidar.trees.length > 0 && (
              <details className="mt-2 group" data-testid="lidar-settings"><summary className="cursor-pointer list-none text-[12.5px] font-semibold text-zinc-200 flex items-center justify-between py-1">Measured tree settings <span className="text-zinc-500 group-open:rotate-90 transition-transform">›</span></summary>
              <div className="mt-1" data-testid="lidar-min">
                <Slider label="Leave out trees shorter than" min={0} max={60} step={1} value={doc.lidar.minHeight ?? 0}
                  format={v => (v ? `${fmtElev(v, doc.units).replace(/^[+−-]/, "")} and up` : "All")}
                  onChange={v => changeDoc(d => (d.lidar ? { lidar: { ...d.lidar, minHeight: v || undefined } } : {}), false)} onDone={() => useCourse.getState().commit()} />
                <div className="text-[11px] text-zinc-500">{(() => { const m = doc.lidar.minHeight ?? 0; const n = m ? doc.lidar.trees.filter(t => t[2] >= m).length : doc.lidar.trees.length; return `${n.toLocaleString()} of ${doc.lidar.trees.length.toLocaleString()} kept`; })()}</div>
                <div className="mt-2" data-testid="lidar-grow">
                  <Slider label="Growth since the survey" min={0} max={25} step={1} value={doc.lidar.growYears ?? 0}
                    format={v => (v ? `${v} year${v === 1 ? "" : "s"} · ${saplings(doc.lidar!.trees, v).length.toLocaleString()} new` : "As measured")}
                    onChange={v => changeDoc(d => (d.lidar ? { lidar: { ...d.lidar, growYears: v || undefined } } : {}), false)} onDone={() => useCourse.getState().commit()} />
                  {yearsSince(doc.lidar.source) > 0 && (doc.lidar.growYears ?? 0) !== yearsSince(doc.lidar.source) && (
                    <button className="text-[12px] text-orange-300 hover:text-orange-200" onClick={() => changeDoc(d => (d.lidar ? { lidar: { ...d.lidar, growYears: yearsSince(d.lidar.source) } } : {}))} data-testid="grow-today">Grow to today ({yearsSince(doc.lidar.source)} years)</button>
                  )}
                </div>
                {(doc.cutTrees?.length ?? 0) > 0 && (
                  <div className="mt-2 text-[11px] text-zinc-400" data-testid="cut-by-hand">{doc.cutTrees!.length} sapling{doc.cutTrees!.length === 1 ? "" : "s"} or planted tree{doc.cutTrees!.length === 1 ? "" : "s"} cut down by hand · <button className="text-orange-300 hover:text-orange-200" onClick={uncutTrees}>Bring them back</button></div>
                )}
                {(() => {
                  // (trees drawn by hand standing on a measured one: the survey has them already)
                  const doubled = doc.items.filter(i => i.type === "tree" && doc.lidar!.trees.some(t => Math.hypot(t[0] - i.x, t[1] - i.y) < Math.max(6, t[3] * 0.5)));
                  return doubled.length > 0 ? (
                    <div className="mt-2 text-[11px] text-zinc-400" data-testid="doubled-trees">{doubled.length} tree{doubled.length === 1 ? "" : "s"} placed by hand stand{doubled.length === 1 ? "s" : ""} on a measured one · <button className="text-orange-300 hover:text-orange-200" onClick={() => { const ids = new Set(doubled.map(i => i.id)); changeDoc(d => ({ items: d.items.filter(i => !ids.has(i.id)) })); }}>Remove those placed by hand</button></div>
                  ) : null;
                })()}
                <div className="mt-2" data-testid="lidar-clear">
                  <Toggle label="Clear trees from the fairways" hint="Turn it off to keep the real trees where the holes play and cut them by hand instead." checked={doc.lidar.clearFairways !== false}
                    onChange={v => changeDoc(d => (d.lidar ? { lidar: { ...d.lidar, clearFairways: v ? undefined : false } } : {}))} />
                </div>

              </div>
              </details>
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
      <BroughtIn />
      {SERVER ? <NearbyCourses /> : (
        <Section title="Park" testid="nearby">
          <div className="rounded-[16px] bg-white/[0.06] overflow-hidden"><LockedRow id="park" icon={<Users size={16} />} label="Other courses in this park" sub="Shown on this map, with a warning when holes get too close" /></div>
        </Section>
      )}
      <NextButton step="site" />
    </>
  );
}

/** The layout picked, where its holes have no tee of its color: they play from another one (so the
 * layout plays like it), and its tees can be added to them all at once. */
function LayoutGaps({ compact = false }: { compact?: boolean }) {
  const doc = useCourse(s => s.doc);
  const layout = doc.layouts.length > 1 ? activeLayout(doc) : undefined;
  if (!layout) return null;
  const missing = doc.holes.filter(h => { const t = holeTees(doc, h.id); return t.length > 0 && !t.some(x => x.level === layout.tee); }).length;
  if (!missing) return null;
  const color = TEE_LEVELS[layout.tee].label.toLowerCase();
  const all = missing === doc.holes.length;
  return (
    <div className={`text-[11.5px] leading-snug text-zinc-300 ${compact ? "px-1 pt-1.5" : "mt-1 mb-2"}`} data-testid="layout-gaps">
      {all ? `None of the holes have a ${color} tee yet, so this layout plays the same as the others.` : `${missing} hole${missing === 1 ? " has" : "s have"} no ${color} tee, so ${missing === 1 ? "it plays" : "they play"} from the nearest one.`}
      <button className="block mt-1 font-semibold text-orange-300 hover:text-orange-200" onClick={() => { const n = addLayoutTees(layout.tee); if (n) toast(`Added ${n} ${color} tee${n === 1 ? "" : "s"}. Drag them where you want them.`, "success", true); }} data-testid="layout-add-tees">Add {color} tees to {all ? "every hole" : missing === 1 ? "that hole" : "those holes"}</button>
    </div>
  );
}

/** The layouts to pick from (the one worked on: its tees and pins stand out on the map). */
export function LayoutPicker({ compact = false }: { compact?: boolean }) {
  const doc = useCourse(s => s.doc);
  if (doc.layouts.length < 2) return null;
  return (
    <>
    <div role="radiogroup" aria-label="Layout" data-testid="layout-picker" className={`flex flex-wrap gap-1 ${compact ? "" : "mb-2"}`}>
      {doc.layouts.map(l => {
        const on = l.id === doc.activeLayout;
        return (
          <button key={l.id} role="radio" aria-checked={on} onClick={() => pickLayout(l.id)}
            title={`${l.name}: ${TEE_LEVELS[l.tee].label.toLowerCase()} tees to pin ${l.pin}`}
            className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold min-w-0 touch:py-2 ${on ? "bg-white/[0.18] text-zinc-50 ring-1 ring-white/25" : "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.07]"}`}>
            <span className="w-2.5 h-2.5 rounded-full shrink-0 ring-1 ring-black/40" style={{ background: TEE_LEVELS[l.tee].color }} />
            <span className="truncate">{l.name}</span>
          </button>
        );
      })}
    </div>
    <LayoutGaps compact={compact} />
    </>
  );
}

function LayoutEditor({ open, setOpen, picker = true }: { open: boolean; setOpen: (f: (o: boolean) => boolean) => void; picker?: boolean }) {
  const doc = useCourse(s => s.doc);
  const setLayouts = (layouts: Layout[]) => changeDoc(() => ({ layouts }));
  return (
    <Section title="Layouts" help="layouts" right={<button className="text-xs text-orange-300 hover:text-orange-200" onClick={() => setOpen(o => !o)}>{open ? "Done" : "Edit layouts"}</button>}>
      {picker && <LayoutPicker />}
      {open && (
        <div className="mt-2 space-y-2" data-testid="layout-editor">
          {doc.layouts.map(l => (
            <div key={l.id} className="bg-white/[0.07] rounded-lg p-2 space-y-1.5">
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
            changeDoc(d => ({ layouts: [...d.layouts, { id, name: TEE_LEVELS[tee].label, tee, pin: "A" }] }));
            pickLayout(id);
          }}><Plus size={14} /> Add a layout</Button>
        </div>
      )}
    </Section>
  );
}

/** The holes: the new hole tool, the layouts, each hole to pick, the course's totals (the phone's
 * sheet). `course`: only what is the whole course's (the holes column has the rest). */
export function HolesStep({ course = false }: { course?: boolean }) {
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
      {!course && (
        <Section>
          <ToolCard icon={<Route size={18} />} title="New hole (H)" active={ed.tool === "add-hole"} onClick={() => ed.set({ tool: "add-hole" })} testid="new-hole" />
        </Section>
      )}
      {!oneLayout && <LayoutEditor open={layoutsOpen} setOpen={setLayoutsOpen} picker={!course} />}
      <Section title={`${played} hole${played === 1 ? "" : "s"}`} testid={course ? "course-holes" : "hole-list"} right={oneLayout ? <button className="text-xs text-orange-300 hover:text-orange-200 touch:py-2" onClick={() => setLayoutsOpen(true)}>Edit layouts</button> : undefined}>
        {course ? null : doc.holes.length === 0 ? (
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
                    className={`w-full flex items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors ${sel ? "bg-orange-500/15 ring-1 ring-orange-400/60" : "hover:bg-white/[0.09]"}`}
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
          <div className={course ? "" : "mt-3"}><Facts testid="course-totals" items={[["Par", totals.par], ["Length", fmtDist(totals.length, u)], ["Walking", fmtDist(totals.walk, u)]]} /></div>
        )}
      </Section>
    </>
  );
}

const IssueIcon = ({ level }: { level: SafetyIssue["level"] }) => (
  level === "info" ? <Info size={14} className="text-sky-400 shrink-0 mt-0.5" /> : <AlertTriangle size={14} className={`${level === "danger" ? "text-red-400" : "text-amber-400"} shrink-0 mt-0.5`} />
);

/** The course checked: its numbers, the problems found (each shown on the map too), the holes. */
export function ReviewStep() {
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
        <Facts items={[["Holes", totals.complete], ["Par", totals.par], ["Length", fmtDist(totals.length, u)], ["Walking", fmtDist(totals.walk, u)], ["Climb", fmtDist(totals.climb, u)]]} />
        <p className="text-xs text-zinc-500 mt-1">{totals.complete ? `Average hole ${fmtDist(totals.length / totals.complete, u)} · ` : ""}Par mix {Object.entries(totals.parCounts).map(([p, n]) => `${n}×${p}`).join(" ") || "–"}</p>
        {levels.length > 0 && <p className="text-[11px] text-zinc-500 mt-2">Tee colors on the course: {levels.map(l => TEE_LEVELS[l].label).join(", ")}.</p>}
      </Section>
      <Section title={`Checks (${issues.length})`} testid="issues" help="checks">
        {issues.length === 0 ? (
          <p className="text-xs text-emerald-300">No problems found.</p>
        ) : (
          <ul className="space-y-1">
            {issues.map(issue => (
              <li key={issue.id} className="flex items-start gap-1 group">
                <button
                  className="flex-1 min-w-0 flex gap-2 items-start text-left text-xs text-zinc-200 hover:bg-white/[0.09] rounded px-1.5 py-1"
                  data-testid="issue-row"
                  onClick={() => {
                    if (issue.holes[0]) select(issue.holes[0]);
                    getView()?.fitBounds({ minX: issue.at.x - 120, minY: issue.at.y - 120, maxX: issue.at.x + 120, maxY: issue.at.y + 120 });
                  }}
                >
                  <IssueIcon level={issue.level} />
                  {issue.text}
                </button>
                <button className="shrink-0 p-1 touch:p-2.5 rounded text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.09]" title="Ignore" aria-label="Ignore" data-testid="issue-ignore" onClick={() => ignore(issue.id, true)}>
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
                    <button className="shrink-0 p-1 touch:p-2.5 rounded text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.09]" title="Check again" aria-label="Check again" onClick={() => ignore(issue.id, false)}>
                      <Eye size={13} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        <div className="mt-3 border-t border-white/[0.08] pt-2">
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
              <tr key={s.holeId} className="hover:bg-white/[0.09] cursor-pointer" onClick={() => { select(s.holeId); requestAnimationFrame(() => getView()?.fitHole(s.holeId)); }}>
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
    </>
  );
}

/** The step's own content (lists, settings and tools), under its heading. (Design on a big
 * screen has none: the map is the step, see HolesColumn and Problems.) */
export function StepContent({ onFindSite }: { onFindSite: () => void }) {
  const step = useEditor(e => e.step);
  return (
    <>
      {step === "site" && <SiteStep onFindSite={onFindSite} />}
      {step === "design" && <HolesStep />}
      {step === "design" && <Section title="Checks" testid="checks-link"><ProblemsCount full /></Section>}
      {step === "map" && <DesignPanel />}
      {step === "export" && <ExportPanel />}
    </>
  );
}

/** The problems found on the course, as a count to open them by (green when there are none). */
export function ProblemsCount({ full }: { full?: boolean }) {
  const doc = useCourse(s => s.doc);
  const open = useEditor(e => e.problemsOpen);
  const n = useMemo(() => openIssues(doc, courseIssues(doc)).open.length, [doc]);
  return (
    <button
      data-testid="problems-button"
      aria-expanded={open}
      onClick={() => useEditor.getState().set({ problemsOpen: !open })}
      className={`${full ? "w-full justify-center" : ""} inline-flex items-center gap-2 h-9 px-3 rounded-full text-[12.5px] font-semibold ${n ? "bg-red-500/[0.18] text-red-200 ring-1 ring-red-400/40" : "bg-emerald-500/[0.14] text-emerald-200"}`}
    >
      {n ? <span className="w-[18px] h-[18px] rounded-full bg-red-400 text-red-950 text-[11px] font-bold leading-[18px] text-center">{n}</span> : <ClipboardCheck size={15} />}
      {n ? `Problem${n === 1 ? "" : "s"}` : "No problems"}
    </button>
  );
}

/** The checks, opened from the problems count: a glass panel over the map's right side. */
export function ProblemsPanel() {
  const open = useEditor(e => e.problemsOpen);
  if (!open) return null;
  return (
    <div className="glass-solid absolute right-3 top-3 bottom-3 z-30 w-[340px] max-w-[calc(100%-24px)] rounded-[24px] overflow-y-auto" role="dialog" aria-label="Checks" data-testid="problems-panel">
      <div className="flex items-center justify-between px-4 pt-3.5">
        <h2 className="text-[17px] font-bold text-zinc-50">Checks</h2>
        <button className="p-1.5 rounded-full text-zinc-400 hover:text-zinc-50" aria-label="Close checks" onClick={() => useEditor.getState().set({ problemsOpen: false })}><X size={16} /></button>
      </div>
      <ReviewStep />
    </div>
  );
}

/** The holes, floating down the map's left side (Design): each to fly to and pick, a new one, the
 * course's totals and layouts behind a button. While something is picked its panel sits next to
 * the list, and the list is just the holes' numbers. */
export function HolesColumn() {
  const doc = useCourse(s => s.doc);
  const ed = useEditor();
  const slim = useSelection().open;
  const stats = courseStats(doc);
  const totals = useMemo(() => courseTotals(doc, stats), [doc, stats]);
  const [more, setMore] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  // (opened by search: a course setting asked for)
  useEffect(() => {
    const on = (e: Event) => { if ((e as CustomEvent).detail === "course") setMore(true); };
    window.addEventListener(SHOW_EVENT, on);
    return () => window.removeEventListener(SHOW_EVENT, on);
  }, []);
  // (the course popover closes with Esc or a click elsewhere, like the other menus)
  useEffect(() => {
    if (!more) return;
    const down = (e: PointerEvent) => { if (!moreRef.current?.contains(e.target as Node)) setMore(false); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); setMore(false); } };
    window.addEventListener("pointerdown", down, true);
    window.addEventListener("keydown", key, true);
    return () => { window.removeEventListener("pointerdown", down, true); window.removeEventListener("keydown", key, true); };
  }, [more]);
  const u = doc.units;
  // (Fitting the map keeps clear of the column: its width and margins; and of the picked thing's
  // panel next to it, without the map moving when something is clicked)
  useEffect(() => {
    let raf = 0;
    const set = () => { const v = getView(); if (v) v.setLeftInset(196); else raf = requestAnimationFrame(set); };
    set();
    return () => { cancelAnimationFrame(raf); getView()?.setLeftInset(0); };
  }, []);
  useEffect(() => {
    const v = getView();
    if (v && v.leftInset) v.leftInset = slim ? PANEL_INSET : 196;
  }, [slim]);
  return (
    <div className="absolute left-3 top-3 bottom-3 z-20 flex flex-col gap-2 pointer-events-none" data-testid="holes-column">
      <div className={`glass pointer-events-auto rounded-[22px] p-1.5 flex flex-col gap-0.5 max-h-full min-h-0 ${slim ? "w-[52px]" : "w-[172px]"}`} data-testid="hole-list">
        {doc.layouts.length > 1 && !slim && <div className="pb-1 mb-0.5 border-b border-white/10"><LayoutPicker compact /></div>}
        <div className="overflow-y-auto min-h-0 flex flex-col gap-0.5">
          {stats.map(s => {
            const hole = doc.holes.find(h => h.id === s.holeId)!;
            const sel = ed.selectedId === s.holeId || ed.activeHoleId === s.holeId;
            return (
              <button key={s.holeId} data-testid="hole-row" title={`${hole.name || `Hole ${s.label}`}${slim && s.complete ? ` · ${fmtDist(s.length, u)} · Par ${s.par}` : ""}`}
                onClick={() => { select(s.holeId); requestAnimationFrame(() => getView()?.fitHole(s.holeId)); }}
                className={`flex items-center gap-2 rounded-[14px] py-1 text-left ${slim ? "justify-center px-1" : "pl-1 pr-2"} ${sel ? "bg-white/[0.16] text-zinc-50" : "text-zinc-300"}`}>
                <span className="min-w-[24px] h-6 px-1 rounded-full flex items-center justify-center text-[11.5px] font-bold shrink-0" style={{ background: TEE_LEVELS[s.level].color, color: TEE_LEVELS[s.level].ink }} data-testid="hole-badge">{s.label}</span>
                {/* (slim: just the number, its length and par for the tooltip and screen readers) */}
                <span className={slim ? "sr-only" : "text-[12.5px] tabular-nums truncate flex-1 min-w-0"}>{s.complete ? `${fmtDist(s.length, u)} · P${s.par}` : "unfinished"}</span>
                {!slim && (() => {
                  // (more than one tee: a dot for each color; a basket shared with another hole: a link)
                  const tees = holeTees(doc, s.holeId);
                  const shared = holeBaskets(doc, s.holeId).some(b => b.holeId !== s.holeId || !!b.alsoHoles?.length);
                  return (
                    <span className="flex items-center gap-0.5 shrink-0" data-testid="hole-row-marks">
                      {tees.length > 1 && tees.map(t => <span key={t.id} className="w-1.5 h-1.5 rounded-full ring-1 ring-black/40" style={{ background: TEE_LEVELS[t.level].color }} title={`${TEE_LEVELS[t.level].label} tee`} />)}
                      {shared && <Link2 size={11} className="text-zinc-400 ml-0.5" aria-label="Shares its basket with another hole" />}
                    </span>
                  );
                })()}
              </button>
            );
          })}
        </div>
        <button data-testid="new-hole" title="New hole" aria-label="New hole" onClick={() => ed.set({ tool: "add-hole" })} className={`flex items-center gap-2 rounded-[14px] py-1 text-[12.5px] font-semibold ${slim ? "justify-center px-1" : "pl-1 pr-2"} ${ed.tool === "add-hole" ? "bg-orange-500 text-zinc-950" : "text-orange-300"}`}>
          <span className={`w-6 h-6 rounded-full flex items-center justify-center ${ed.tool === "add-hole" ? "bg-zinc-950/20" : "bg-orange-500 text-zinc-950"}`}><Plus size={14} /></span>{!slim && "New hole"}
        </button>
      </div>
      <div className={`glass pointer-events-auto rounded-[18px] mt-auto relative ${slim ? "hidden" : ""}`} ref={moreRef}>
        <button className="w-full flex gap-3 items-end px-3.5 py-2 text-left" onClick={() => setMore(m => !m)} aria-expanded={more} data-testid="course-totals-button">
          {[[totals.complete, "holes"], [totals.par, "par"], [fmtDist(totals.length, u), "total"]].map(([v, k]) => (
            <span key={k as string}><span className="block text-[15px] font-bold text-zinc-50 leading-tight tabular-nums">{v}</span><span className="text-[11px] text-zinc-400">{k}</span></span>
          ))}
        </button>
        {more && (
          <div className="glass-solid absolute left-0 bottom-full mb-2 w-[320px] rounded-[20px] max-h-[70vh] overflow-y-auto" data-testid="course-more">
            <HolesStep course />
          </div>
        )}
      </div>
    </div>
  );
}

export function SidePanel({ onFindSite }: { onFindSite: () => void }) {
  const step = useEditor(e => e.step);
  const i = STEPS.findIndex(s => s.id === step);
  const meta = STEPS[i];
  const { open } = useSelection();
  // (something picked on Site: its settings here, with a way back to the step's)
  if (open && step === "site")
    return (
      <aside className="glass w-[340px] shrink-0 rounded-[24px] overflow-y-auto" aria-label="Step panel" data-testid="side-panel">
        <div data-testid="inspector" aria-label="Selection">
          <SelectionHeader back={meta.title} />
          <InspectorBody />
        </div>
      </aside>
    );
  return (
    <aside className="glass w-[340px] shrink-0 rounded-[24px] overflow-y-auto" aria-label="Step panel" data-testid="side-panel">
      <div className="px-4 pt-4 pb-1">
        <div className="text-[11.5px] font-semibold text-orange-300">Step {i + 1} of {STEPS.length}</div>
        <h2 className="text-[22px] leading-tight font-bold tracking-[-0.02em] text-zinc-50">{meta.title}</h2>
      </div>
      <StepContent onFindSite={onFindSite} />
    </aside>
  );
}
