// The side panel follows the steps: what to do now, and the lists for it. The map stays the one
// canvas; the steps never lock anything.
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, ArrowRight, ChevronUp, Link2, Info, Loader2, X, ClipboardCheck, Download, Eye, EyeOff, MapPinned, Palette, Plus, Route, Trash2, Users, type LucideIcon } from "lucide-react";
import { TEE_LEVELS, TEE_ORDER, generateId, FT_PER_M } from "../constants";
import { activeLayout, holeBaskets, holeTees } from "../lib/course";
import { EXAMPLE_ID } from "../lib/example";
import { courseIssues, courseStats, courseTotals, levelsOnCourse, openIssues, playsOf, swapped, type SafetyIssue } from "../lib/holeStats";
import { fmtArea, fmtDist, fmtElev, toUnits } from "../lib/units";
import { addLayoutTees, pickLayout, select, uncutTrees } from "../state/actions";
import { toast } from "../state/toast";
import { changeDoc, useCourse, useEditor, type Step } from "../state/course";
import { SHOW_EVENT } from "./showSetting";
import type { Layout, PinPosition, TeeLevel } from "../types";
import { refreshOsm, useOsm } from "../state/osm";
import { measureLidar } from "../state/lidar";
import { newCourse } from "../state/files";
import { saplings, yearsSince } from "../lib/lidar";
import { getView } from "../state/view";
import { Button, Facts, Field, HelpLink, Section, Segmented, Slider, TextInput, Toggle } from "./ui";
import { DesignPanel } from "./DesignPanel";
import { ExportPanel } from "./ExportPanel";
import { useLayout, useTouch } from "./useLayout";
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

const many = (n: number, one: string, more: string) => `${n.toLocaleString()} ${n === 1 ? one : more}`;

/** What was brought in by itself (from the photo, from OpenStreetMap, from the measured trees), to
 * take out at once (Undo puts a group back). */
function BroughtIn() {
  const doc = useCourse(s => s.doc);
  type Item = (typeof doc.items)[number];
  const fromPhoto = (i: Item) => (i.type === "tree" || i.type === "area") && i.importSource === "photo";
  const fromOsm = (i: Item) => (i.type === "area" || i.type === "line" || i.type === "structure") && i.importSource === "osm";
  const traced = (i: Item) => i.type === "structure" && i.importSource === "traced";
  const stand = (i: Item) => i.type === "area" && i.importSource === "lidar";
  const photoTrees = doc.items.filter(i => i.type === "tree" && fromPhoto(i)).length;
  const photoAreas = doc.items.filter(i => i.type === "area" && fromPhoto(i)).length;
  const groups: { testid?: string; text: string; out: (i: Item) => boolean; said: string }[] = [];
  if (photoTrees || photoAreas) groups.push({ testid: "photo-found", text: `${[photoAreas ? many(photoAreas, "area", "areas") : "", photoTrees ? many(photoTrees, "tree", "trees") : ""].filter(Boolean).join(" and ")} from the photo`, out: fromPhoto, said: "Took out what came from the photo." });
  const stands = doc.items.filter(stand).length;
  // (a stand's measured trees go with it: they belong to its woods)
  if (stands) groups.push({ testid: "stands-found", text: `${many(stands, "stand", "stands")} of woods from the measured trees`, out: stand, said: "Took out the woods made from the measured trees, and the trees standing in them." });
  const osm = doc.items.filter(fromOsm).length;
  if (osm) groups.push({ testid: "osm-found", text: `${many(osm, "shape", "shapes")} from OpenStreetMap`, out: fromOsm, said: "Took out what came from OpenStreetMap." });
  const air = doc.items.filter(traced).length;
  if (air) groups.push({ testid: "traced-found", text: `${many(air, "building", "buildings")} traced from the air`, out: traced, said: "Took out the buildings traced from the air." });
  if (!groups.length) return null;
  return (
    <Section title="Brought in automatically" help="brought-in" testid="brought-in">
      <div className="space-y-1.5">
        {groups.map(g => (
          <div key={g.text} className="flex items-center justify-between gap-2 text-xs text-zinc-300" data-testid={g.testid}>
            {g.text}
            <Button small tone="danger" onClick={() => { changeDoc(d => ({ items: d.items.filter(i => !g.out(i)) })); toast(g.said, "info", true); }}>Remove all</Button>
          </div>
        ))}
      </div>
    </Section>
  );
}

function SiteStep({ onFindSite }: { onFindSite: () => void }) {
  const doc = useCourse(s => s.doc);
  const ed = useEditor();
  const osmBusy = useOsm(s => s.busy);
  // (a phone's or a tablet's header has Find your park)
  const compact = useLayout() !== "desktop";
  const set = (patch: Partial<typeof doc>, history = true) => changeDoc(() => patch, history);
  const typed = () => useCourse.getState().commit();
  const relief = useMemo(() => {
    const v = Object.values(doc.terrainHeights);
    return v.length ? Math.max(0, ...v) - Math.min(0, ...v) : 0;
  }, [doc.terrainHeights]);
  const u = doc.units;
  // (the example: no real park behind it, so a course of your own is the way to one)
  const example = doc.id === EXAMPLE_ID;
  const placed = !!doc.site.bounds;
  // (ground to tell about: a site brought in, or the example's own)
  const facts = placed || !!doc.background || !!doc.lidar;
  // (nothing yet: the welcome card over the map has Find your park)
  const empty = !doc.background && !doc.holes.length && !doc.items.length;
  const notes = doc.site.notes ?? [];
  return (
    <>
      {example ? (
        <Section title="Example course" testid="example-site" help="example-course">
          <div className="flex flex-col items-start gap-1.5">
            <Button tone="primary" full onClick={() => void newCourse()} testid="example-new-course"><Plus size={16} /> Start your own course</Button>
            <Button small onClick={onFindSite} testid="find-site"><MapPinned size={14} /> Find your park</Button>
          </div>
        </Section>
      ) : !placed && !compact && !empty && (
        <Section>
          <Button tone="primary" full onClick={onFindSite} testid="find-site"><MapPinned size={16} /> Find your park</Button>
        </Section>
      )}
      {facts && (
        <Section title="Site" testid="site-info">
          {placed && doc.site.location && (
            <Field label="Place name" help="place-name">
              <TextInput label="Place name" value={doc.site.location.label} placeholder="The park's name" onChange={v => changeDoc(d => ({ site: { ...d.site, location: d.site.location ? { ...d.site.location, label: v } : null } }), false)} onDone={typed} />
            </Field>
          )}
          <div className="text-xs text-zinc-400 space-y-0.5">
            <div>{fmtDist(doc.canvas.width, u, false)} × {fmtDist(doc.canvas.height, u)} · {fmtArea(doc.canvas.width * doc.canvas.height, u)}</div>
            <div>Lowest point {Math.round(toUnits(doc.site.baseElevationFt, u)).toLocaleString()} {u} · {fmtDist(relief, u)} of elevation change</div>
            {doc.site.elevationSource && <div>Elevation: {doc.site.elevationSource}</div>}
            {doc.site.imagerySource && <div>Photo: {doc.site.imagerySource}</div>}
          </div>
          {notes.length > 0 && (
            <details className="mt-2 group" data-testid="site-notes"><summary className="cursor-pointer list-none text-[12.5px] font-semibold text-zinc-200 flex items-center justify-between py-1">What came in <span className="text-zinc-500 group-open:rotate-90 transition-transform">›</span></summary>
              <ul className="mt-0.5 space-y-0.5 text-[11.5px] leading-snug text-zinc-400 list-disc pl-4">{notes.map(n => <li key={n}>{n}</li>)}</ul>
            </details>
          )}
          {placed && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Button small onClick={onFindSite}>Resize or re-import the site</Button>
              {osmBusy
                ? <span className="text-xs text-zinc-300 inline-flex items-center gap-1.5 px-1 py-1" data-testid="osm-busy"><Loader2 size={13} className="animate-spin text-orange-300" /> Looking up…</span>
                : <Button small onClick={() => void refreshOsm()} testid="refresh-osm">Update paths, roads, water and buildings</Button>}
            </div>
          )}
          {(placed || doc.lidar) && (
          <div className={`mt-3 ${doc.lidar || doc.site.noLidar ? "pt-2 border-t border-white/10" : "rounded-[16px] bg-orange-500/[0.12] ring-1 ring-orange-400/30 p-3"}`} data-testid="lidar-info">
            {!doc.lidar && !doc.site.noLidar && <div className="text-[13.5px] font-semibold text-orange-100 mb-0.5 flex items-center gap-1.5">Real trees and ground <HelpLink topic="lidar" label="Real trees and ground" /></div>}
            <div className="text-xs text-zinc-400 mb-1.5 flex items-center gap-1.5">{doc.lidar ? <>{`${doc.lidar.trees.length.toLocaleString()} trees measured from the air · ${doc.lidar.source}`} <HelpLink topic="lidar" label="Measured trees" /></> : doc.site.noLidar ? <>No aerial survey here <HelpLink topic="lidar" label="Real trees and ground" /></> : "Each tree's real spot and height, and the bare ground, from an aerial survey (LiDAR) where one has been flown."}</div>
            <div className="flex flex-wrap gap-1.5">
              {ed.lidarBusy !== null
                ? <span className="text-xs text-zinc-300" data-testid="lidar-busy">Measuring… {Math.round(ed.lidarBusy * 100)}%</span>
                : placed && <Button small onClick={() => void measureLidar()} testid="measure-lidar">{doc.lidar ? "Measure again" : doc.site.noLidar ? "Check again" : "Measure trees and ground"}</Button>}
              {doc.lidar && ed.lidarBusy === null && <Button small tone="danger" onClick={() => changeDoc(d => ({ lidar: undefined, site: { ...d.site, noLidar: undefined } }))} testid="remove-lidar">Remove the measured trees</Button>}
            </div>
            {doc.lidar && doc.lidar.trees.length > 0 && (
              <details className="mt-2 group" data-testid="lidar-settings"><summary className="cursor-pointer list-none text-[12.5px] font-semibold text-zinc-200 flex items-center justify-between py-1">Measured tree settings <span className="text-zinc-500 group-open:rotate-90 transition-transform">›</span></summary>
              <div className="mt-1" data-testid="lidar-min">
                <Slider label="Leave out trees shorter than" min={0} max={60} step={1} value={doc.lidar.minHeight ?? 0}
                  format={v => (v ? fmtElev(v, u).replace(/^[+−-]/, "") : "None")}
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
          )}
        </Section>
      )}
      <Section title="Course">
        <Field label="Course name"><TextInput label="Course name" value={doc.name} onChange={v => set({ name: v }, false)} onDone={typed} /></Field>
        <Field label="Designer"><TextInput label="Designer" value={doc.designer} placeholder="Your name or club" onChange={v => set({ designer: v }, false)} onDone={typed} /></Field>
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

/** The layouts to pick from (the one worked on: its tees and pins stand out on the map); `slim`:
 * just each one's tee color, its name in the tip. */
export function LayoutPicker({ compact = false, slim = false }: { compact?: boolean; slim?: boolean }) {
  const doc = useCourse(s => s.doc);
  if (doc.layouts.length < 2) return null;
  return (
    <>
    <div role="radiogroup" aria-label="Layout" data-testid="layout-picker" className={`flex flex-wrap gap-1 ${compact ? "" : "mb-2"}`}>
      {doc.layouts.map(l => {
        const on = l.id === doc.activeLayout;
        return (
          <button key={l.id} role="radio" aria-checked={on} onClick={() => pickLayout(l.id)}
            title={`${l.name}: ${TEE_LEVELS[l.tee].label.toLowerCase()} tees to pin ${l.pin}`} aria-label={slim ? l.name : undefined}
            className={`flex items-center gap-1.5 rounded-full py-1 text-[12px] font-semibold min-w-0 touch:py-2 ${slim ? "w-full justify-center px-1" : "px-2.5"} ${on ? "bg-white/[0.18] text-zinc-50 ring-1 ring-white/25" : "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.07]"}`}>
            <span className="w-2.5 h-2.5 rounded-full shrink-0 ring-1 ring-black/40" style={{ background: TEE_LEVELS[l.tee].color }} />
            {!slim && <span className="truncate">{l.name}</span>}
          </button>
        );
      })}
    </div>
    {!slim && <LayoutGaps compact={compact} />}
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
              <Segmented label="Layout tees" value={l.tee} onChange={v => setLayouts(doc.layouts.map(x => (x.id === l.id ? { ...x, tee: v as TeeLevel } : x)))} options={TEE_ORDER.map(t => ({ value: t, label: <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full ring-1 ring-black/40 shrink-0" style={{ background: TEE_LEVELS[t].color }} />{TEE_LEVELS[t].label}</span>, title: `${TEE_LEVELS[t].label} tees` }))} />
              <Segmented label="Layout pins" value={l.pin} onChange={v => setLayouts(doc.layouts.map(x => (x.id === l.id ? { ...x, pin: v as PinPosition } : x)))} options={(["A", "B", "C", "D"] as PinPosition[]).map(p => ({ value: p, label: p, title: `Pin ${p}` }))} />
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
  const checks = useHoleChecks();
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
                        {s.complete ? <>{fmtDist(s.length, u)} · {fmtElev(s.elevationChange, u)}{tees.length > 1 ? ` · ${tees.length} tees` : ""}</> : s.teeId ? "Needs a basket" : "Needs a tee"}
                      </span>
                    </span>
                    <CheckDot check={checks.get(s.holeId)} />
                    {changed.has(s.holeId) && <span className="w-2 h-2 rounded-full bg-orange-400 shrink-0" title="Changed in your draft" data-testid="draft-dot" />}
                    <span className="text-sm font-bold text-zinc-200 tabular-nums whitespace-nowrap">Par {s.par}</span>
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

/** The worst first: problems, then warnings, then the heads-ups. */
const SEVERITY: Record<SafetyIssue["level"], number> = { danger: 0, warning: 1, info: 2 };

/** Each hole's worst open check (a problem or a warning; heads-ups don't count), with what it says. */
function useHoleChecks() {
  const doc = useCourse(s => s.doc);
  return useMemo(() => {
    const worst = new Map<string, SafetyIssue>();
    for (const i of openIssues(doc, courseIssues(doc)).open) {
      if (i.level === "info") continue;
      for (const h of i.holes) { const had = worst.get(h); if (!had || SEVERITY[i.level] < SEVERITY[had.level]) worst.set(h, i); }
    }
    return worst;
  }, [doc]);
}

/** A hole row's dot for its worst check (none when it has none). */
const CheckDot = ({ check }: { check?: SafetyIssue }) =>
  check ? <span className={`w-2 h-2 rounded-full shrink-0 ${check.level === "danger" ? "bg-red-400" : "bg-amber-400"}`} title={check.text} aria-label={`Check: ${check.text}`} data-testid="hole-check-dot" /> : null;

/** The course checked: its numbers, the problems found (each shown on the map too), the holes. */
export function ReviewStep() {
  const doc = useCourse(s => s.doc);
  const stats = courseStats(doc);
  const totals = useMemo(() => courseTotals(doc, stats), [doc, stats]);
  const all = courseIssues(doc);
  const { open, ignored } = openIssues(doc, all);
  // (the worst first)
  const issues = [...open].sort((a, b) => SEVERITY[a.level] - SEVERITY[b.level]);
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
        <p className="text-xs text-zinc-500 mt-1">{totals.complete ? `Average hole ${fmtDist(totals.length / totals.complete, u)} · ${Object.entries(totals.parCounts).sort(([a], [b]) => Number(a) - Number(b)).map(([p, n]) => `${n} par ${p}${n === 1 ? "" : "s"}`).join(", ")}` : "No finished holes yet"}</p>
        {levels.length > 0 && <p className="text-[11px] text-zinc-500 mt-2">Tee colors on the course: {levels.map(l => TEE_LEVELS[l].label).join(", ")}.</p>}
      </Section>
      <Section title={`Found (${issues.length})`} testid="issues" help="checks">
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
            <Segmented label="Safe distance" value={doc.rules.safetyGapFt ?? 0} onChange={v => set({ safetyGapFt: v || undefined })} options={[{ value: 0, label: "Auto" }, ...(doc.units === "m" ? [15, 20, 30, 45].map(m => ({ value: Math.round(m * FT_PER_M), label: `${m} m` })) : [50, 75, 100, 150].map(f => ({ value: f, label: `${f} ft` })))]} />
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
      {step === "design" && <div data-testid="holes-panel"><HolesStep /></div>}
      {step === "design" && <Section title="Checks" testid="checks-link"><ProblemsCount full /></Section>}
      {step === "map" && <DesignPanel />}
      {step === "export" && <ExportPanel />}
    </>
  );
}

/** The checks found on the course, as a count to open them by: red for a problem, amber for a
 * warning, plain when there are only heads-ups, green when there's nothing. */
export function ProblemsCount({ full }: { full?: boolean }) {
  const doc = useCourse(s => s.doc);
  const open = useEditor(e => e.problemsOpen);
  const found = useMemo(() => openIssues(doc, courseIssues(doc)).open, [doc]);
  const n = found.length;
  const worst = found.reduce<SafetyIssue["level"] | null>((w, i) => (!w || SEVERITY[i.level] < SEVERITY[w] ? i.level : w), null);
  const tone = worst === "danger" ? "bg-red-500/[0.18] text-red-200 ring-1 ring-red-400/40" : worst === "warning" ? "bg-amber-500/[0.16] text-amber-100 ring-1 ring-amber-400/40" : worst === "info" ? "bg-white/[0.1] text-zinc-100 ring-1 ring-white/15" : "bg-emerald-500/[0.14] text-emerald-200";
  const badge = worst === "danger" ? "bg-red-400 text-red-950" : worst === "warning" ? "bg-amber-400 text-amber-950" : "bg-sky-400 text-sky-950";
  return (
    <button
      data-testid="problems-button"
      aria-expanded={open}
      onClick={() => useEditor.getState().set({ problemsOpen: !open })}
      className={`${full ? "w-full justify-center" : ""} inline-flex items-center gap-2 h-9 touch:h-11 px-3 rounded-full text-[12.5px] font-semibold ${tone}`}
    >
      {n ? <span className={`min-w-[18px] h-[18px] px-1 rounded-full text-[11px] font-bold leading-[18px] text-center ${badge}`}>{n}</span> : <ClipboardCheck size={15} />}
      {n ? "Checks" : "No problems"}
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
  const checks = useHoleChecks();
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
    <div className={`absolute left-3 top-3 bottom-3 ${more ? "z-30" : "z-20"} flex flex-col gap-2 pointer-events-none`} data-testid="holes-column">
      <div className={`glass pointer-events-auto rounded-[22px] p-1.5 flex flex-col gap-0.5 max-h-full min-h-0 ${slim ? "w-[52px]" : "w-[172px]"}`} data-testid="hole-list">
        {doc.layouts.length > 1 && <div className="pb-1 mb-0.5 border-b border-white/10"><LayoutPicker compact slim={slim} /></div>}
        <div className="overflow-y-auto min-h-0 flex flex-col gap-0.5">
          {stats.map(s => {
            const hole = doc.holes.find(h => h.id === s.holeId)!;
            const sel = ed.selectedId === s.holeId || ed.activeHoleId === s.holeId;
            return (
              <button key={s.holeId} data-testid="hole-row" title={`${hole.name || `Hole ${s.label}`}${slim && s.complete ? ` · ${fmtDist(s.length, u)} · Par ${s.par}` : ""}${checks.get(s.holeId) ? ` · ${checks.get(s.holeId)!.text}` : ""}`}
                onClick={() => { select(s.holeId); requestAnimationFrame(() => getView()?.fitHole(s.holeId)); }}
                className={`flex items-center gap-2 rounded-[14px] py-1 text-left ${slim ? "justify-center px-1" : "pl-1 pr-2"} ${sel ? "bg-white/[0.16] text-zinc-50" : "text-zinc-300"}`}>
                <span className="min-w-[24px] h-6 px-1 rounded-full flex items-center justify-center text-[11.5px] font-bold shrink-0" style={{ background: TEE_LEVELS[s.level].color, color: TEE_LEVELS[s.level].ink }} data-testid="hole-badge">{s.label}</span>
                {/* (slim: just the number, its length and par for the tooltip and screen readers) */}
                <span className={slim ? "sr-only" : "text-[12.5px] tabular-nums truncate flex-1 min-w-0"}>{s.complete ? `${fmtDist(s.length, u)} · Par ${s.par}` : s.teeId ? "Needs a basket" : "Needs a tee"}</span>
                {!slim && <CheckDot check={checks.get(s.holeId)} />}
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
        <button data-testid="new-hole" title="New hole (H)" aria-label="New hole" onClick={() => ed.set({ tool: "add-hole" })} className={`flex items-center gap-2 rounded-[14px] py-1 text-[12.5px] font-semibold ${slim ? "justify-center px-1" : "pl-1 pr-2"} ${ed.tool === "add-hole" ? "bg-orange-500 text-zinc-950" : "text-orange-300"}`}>
          <span className={`w-6 h-6 rounded-full flex items-center justify-center ${ed.tool === "add-hole" ? "bg-zinc-950/20" : "bg-orange-500 text-zinc-950"}`}><Plus size={14} /></span>{!slim && "New hole"}
        </button>
      </div>
      {/* (no holes yet: no totals to open) */}
      {doc.holes.length > 0 && <div className="glass pointer-events-auto rounded-[18px] mt-auto relative" ref={moreRef}>
        <button className={`w-full flex gap-3 items-end py-2 text-left ${slim ? "justify-center px-1" : "pl-3.5 pr-2.5"}`} onClick={() => setMore(m => !m)} aria-expanded={more} title={slim ? `${totals.complete} holes · par ${totals.par} · ${fmtDist(totals.length, u)}` : "Course totals and layouts"} data-testid="course-totals-button">
          {/* (slim: just the par; the rest for screen readers) */}
          {[[totals.complete, "holes"], [totals.par, "par"], [fmtDist(totals.length, u), "total"]].map(([v, k]) => (
            <span key={k as string} className={slim && k !== "par" ? "sr-only" : undefined}><span className="block text-[15px] font-bold text-zinc-50 leading-tight tabular-nums">{v}</span><span className="text-[11px] text-zinc-400">{k}</span></span>
          ))}
          {!slim && <ChevronUp size={15} className={`ml-auto self-center text-zinc-400 transition-transform ${more ? "rotate-180" : ""}`} aria-hidden />}
        </button>
        {more && (
          <div className="glass-solid absolute left-0 bottom-full mb-2 w-[320px] rounded-[20px] max-h-[70vh] overflow-y-auto" data-testid="course-more">
            <HolesStep course />
          </div>
        )}
      </div>}
    </div>
  );
}

export function SidePanel({ onFindSite }: { onFindSite: () => void }) {
  const step = useEditor(e => e.step);
  const i = STEPS.findIndex(s => s.id === step);
  const meta = STEPS[i];
  const { open } = useSelection();
  // (something picked on Site: its settings here, with a way back to the step's. Not what was
  // still picked when the step was opened: the step's own panel first)
  const selectedId = useEditor(e => e.selectedId), group = useEditor(e => e.group);
  const keyNow = selectedId ?? group.join(",");
  const seen = useRef({ step, carried: keyNow });
  if (seen.current.step !== step) seen.current = { step, carried: keyNow };
  else if (seen.current.carried && seen.current.carried !== keyNow) seen.current.carried = "";
  if (open && step === "site" && keyNow !== seen.current.carried)
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
