// The app on a phone (and a phone turned on its side). The map is the screen; everything else
// is within reach of a thumb:
// - upright: a floating top bar (name, 2D/3D, menu), map controls on the right, a bottom
//   sheet with the step's panel, the selection or the active tool, and the six steps along the
//   bottom;
// - on its side: the steps in a rail on the left, the panel beside it, the map on the right.
// Tools are a row of labelled buttons at the top of the panel; drawing gets Undo, Cancel and Done
// buttons over the map (there is no Enter, Backspace or Esc on a phone), and holding a finger on
// a thing opens its menu (the right-click).
import { Woods } from "../Woods";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type UIEvent } from "react";
import { Menu, ChevronDown, ListChecks, Check, ChevronLeft, Copy, Ellipsis, Eye, FilePlus, FolderOpen, HelpCircle, Lock, Maximize2, PanelLeftClose, PanelLeftOpen, Plane, Redo2, Save, Search, Trash2, Undo2, Unlock, X } from "lucide-react";
import { STRUCTURE_KINDS } from "../../constants";
import { holeLabel, holeNumber } from "../../lib/course";
import { courseIssues, courseStats, courseTotals, holeStats, openIssues, playsOf } from "../../lib/holeStats";
import { landscapeOf } from "../../lib/landscapes";
import { fmtDist, fmtElev } from "../../lib/units";
import { canPaste, copySelection, deleteSelection, duplicateSelection, markObBeyond, pasteClipboard, select } from "../../state/actions";
import { getDoc, updateItem, useCourse, useEditor, type Step } from "../../state/course";
import { deleteRecent, newCourse, openCourseFile, openRecent, recentCourses, saveCourseFile } from "../../state/files";
import type { PlanMeta } from "../../lib/storage";
import type { CourseItem, P } from "../../types";
import { HoleSteps } from "../HoleSteps";
import { InspectorBody, groupSummary, itemTitle, useSelection } from "../Inspector";
import { MapViewport } from "../MapViewport";
import { getView } from "../../state/view";
import { MapDesigner } from "../MapDesigner";
import { STEPS, STEP_ICONS, StepContent, touchWords } from "../SidePanel";
import { TeeViewHud } from "../TeeViewHud";
import { CameraHud } from "../CameraHud";
import { TOOLS, toolHint, toolOptions } from "../Toolbar";
import { ExportProgressPill } from "../ExportProgress";
import { ActionSheet, type SheetAction } from "./ActionSheet";
import { BottomSheet, type Detent } from "./BottomSheet";
import { HereButton } from "../MyLocation";
import { HoleStrip, ItemStrip } from "./HoleStrip";
import { GettingStarted, openGettingStarted } from "../GettingStarted";
import { useGps } from "../../state/gps";
import { accountActions, CourseChip } from "../../auth/AccountMenu";
import { LOCKED, showLocked, type LockedId } from "../DemoNote";

/** The phone menu's rows for what a server adds, in the demo: there, with a lock. */
const demoActions = () => (["comments", "history", "courses", "share", "account", "demo"] as LockedId[]).map(id => {
  const Icon = LOCKED[id].icon;
  return { label: id === "demo" ? "About the demo" : `${LOCKED[id].title} (locked)`, icon: <Icon size={19} />, run: () => showLocked(id), testid: `menu-locked-${id}` };
});
import { ViewerPanelBody } from "../../auth/ViewerPanel";
import { SERVER } from "../../auth/api";
import { CoursePageButton, SITE_TOKEN } from "../../auth/PublicSite";

export type MenuInfo = { clientX: number; clientY: number; itemId: string | null; ground: P | null; under?: string | null };

type ShellProps = {
  layout: "phone" | "rail";
  onFindSite: () => void;
  onHelp: () => void;
  /** Search: holes, tools, settings and help. */
  onGoTo: () => void;
  onContextMenu: (info: MenuInfo) => void;
  /** The welcome card for an empty course, when it shows. */
  welcome: ReactNode;
  /** The toasts, kept clear of the panel by `bottom` pixels. */
  toasts: (bottom: number) => ReactNode;
};

const TOOL_TITLES: Record<string, string> = {
  "add-hole": "New hole", "add-tee": "Another tee", "add-basket": "Another pin", "add-mando": "Mando", "add-dropzone": "Drop zone",
  "draw-area": "Draw an area", "draw-line": "Draw a line", sculpt: "Shape the ground", "draw-structure": "Build", "add-tree": "Trees", "add-amenity": "Amenities",
  "add-label": "Text label", measure: "Measure"
};

/** The shell never scrolls (it can't with `overflow: clip`; older Safari only has `hidden`, which
 * the browser can still scroll to bring something into view): put it back. */
const keepPut = (e: UIEvent<HTMLElement>) => {
  const el = e.currentTarget;
  if (el.scrollTop || el.scrollLeft) el.scrollTo(0, 0);
};

/** How tall the sheet is when a step opens (the map first where the step is about the map). */
const STEP_DETENT: Record<Step, Detent> = { site: "half", design: "peek", map: "peek", export: "half" };

const Logo = ({ size = 30 }: { size?: number }) => (
  // (the badge: a fairway through the woods at sunrise)
  <img src={`${import.meta.env.BASE_URL}logo-128.png`} width={size} height={size} alt="" aria-hidden className="block rounded-full shrink-0 drop-shadow-[0_2px_6px_rgba(0,0,0,0.35)]" draggable={false} />
);

const iconBtn = "w-11 h-11 shrink-0 flex items-center justify-center rounded-xl text-zinc-300 active:bg-white/[0.13] hover:bg-white/[0.09] focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 disabled:opacity-30";

/** What the panel shows: the active tool, the selection, or the step. */
function useMode() {
  const tool = useEditor(e => e.tool);
  const { open } = useSelection();
  return tool !== "select" ? "tool" : open ? "selection" : "step";
}

/** The course's one-line summary: holes and par. */
function useSummary() {
  const doc = useCourse(s => s.doc);
  return useMemo(() => {
    const stats = courseStats(doc);
    const t = courseTotals(doc, stats);
    // (a hole with two numbers counts twice, as on the scorecard)
    return { holes: doc.holes.reduce((n, h) => n + playsOf(doc, h.id), 0), par: t.par, complete: t.complete, length: t.length, issues: openIssues(doc, courseIssues(doc)).open.length, units: doc.units };
  }, [doc]);
}

// ---------------------------------------------------------------------------------- steps

/** Drops a drawing under way (only then: clearing redraws the map, a frame a slow phone pays for). */
const stopDrawing = () => {
  if (useEditor.getState().drawPoints > 0) getView()?.cancelDrawing();
};

function goStep(id: Step, setDetent: (d: Detent) => void, toggle: () => void) {
  const ed = useEditor.getState();
  if (ed.step === id && ed.tool === "select" && !ed.selectedId) { toggle(); return; }
  stopDrawing();
  select(null);
  ed.set({ step: id, tool: "select" });
  setDetent(STEP_DETENT[id]);
}

function BottomNav({ onStep }: { onStep: (s: Step) => void }) {
  const step = useEditor(e => e.step);
  return (
    <nav aria-label="Steps" className="glass shrink-0 relative z-40 mx-2 mt-1.5 mb-[max(8px,env(safe-area-inset-bottom))] rounded-[30px]" data-testid="bottom-nav">
      <ol className="flex px-1">
        {STEPS.map((s, i) => {
          const Icon = STEP_ICONS[s.id];
          const on = step === s.id;
          return (
            <li key={s.id} className="flex-1 min-w-0">
              <button
                onClick={() => onStep(s.id)}
                aria-current={on ? "step" : undefined}
                className="w-full h-[60px] flex flex-col items-center justify-center gap-1 focus:outline-none focus-visible:bg-white/[0.08] rounded-[26px]"
              >
                <span className={`flex items-center justify-center w-[52px] h-[30px] rounded-full transition-colors ${on ? "bg-white/[0.12] text-orange-300" : "text-zinc-400"}`}><Icon size={21} strokeWidth={on ? 2.4 : 2} /></span>
                <span className={`text-[12px] leading-none font-semibold tracking-tight ${on ? "text-zinc-50" : "text-zinc-400"}`}><span className="sr-only">Step {i + 1}: </span>{s.label}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function NavRail({ onStep, onMenu, panelOpen, onPanel }: { onStep: (s: Step) => void; onMenu: () => void; panelOpen: boolean; onPanel: () => void }) {
  const step = useEditor(e => e.step);
  return (
    <nav aria-label="Steps" className="glass w-[72px] shrink-0 relative z-40 flex flex-col items-center my-2 ml-[max(8px,env(safe-area-inset-left))] rounded-[26px] py-1" data-testid="nav-rail">
      <button className={`${iconBtn} [@media(max-height:400px)]:h-10`} aria-label="Menu: files, help" onClick={onMenu} data-testid="app-menu-button"><Logo size={28} /></button>
      <ol className="flex-1 min-h-0 flex flex-col justify-center w-full">
        {STEPS.map((s, i) => {
          const Icon = STEP_ICONS[s.id];
          const on = step === s.id;
          return (
            <li key={s.id} className="flex-1 min-h-0 max-h-[52px]">
              <button onClick={() => onStep(s.id)} aria-current={on ? "step" : undefined} className="w-full h-full flex flex-col items-center justify-center gap-0.5 focus:outline-none focus-visible:bg-white/[0.06]">
                <span className={`flex items-center justify-center w-[46px] h-[26px] rounded-full ${on ? "bg-orange-500/20 text-orange-300" : "text-zinc-400"}`}><Icon size={19} strokeWidth={on ? 2.4 : 2} /></span>
                <span className={`text-[11px] leading-none font-semibold ${on ? "text-zinc-50" : "text-zinc-400"}`}><span className="sr-only">Step {i + 1}: </span>{s.label}</span>
              </button>
            </li>
          );
        })}
      </ol>
      <button className={`${iconBtn} [@media(max-height:400px)]:h-10`} aria-label={panelOpen ? "Hide the panel" : "Show the panel"} aria-expanded={panelOpen} onClick={onPanel} data-testid="panel-toggle">
        {panelOpen ? <PanelLeftClose size={20} /> : <PanelLeftOpen size={20} />}
      </button>
    </nav>
  );
}

function StepHeader({ onFindSite }: { onFindSite: () => void }) {
  const step = useEditor(e => e.step);
  const site = useCourse(s => s.doc.site);
  const canvas = useCourse(s => s.doc.canvas);
  const look = useCourse(s => landscapeOf(s.doc.style).label);
  const sum = useSummary();
  const i = STEPS.findIndex(s => s.id === step);
  const meta = STEPS[i];
  const chip = (text: string) => <span className="shrink-0 text-[13px] font-semibold text-zinc-200 bg-white/[0.07] rounded-full px-3 py-1.5 tabular-nums">{text}</span>;
  const right =
    step === "site" ? (!site.bounds ? <button className="shrink-0 h-10 px-4 rounded-full bg-orange-500 text-zinc-950 text-[14px] font-bold active:bg-orange-600" onClick={onFindSite}>Find your park</button> : site.bounds ? chip(`${((canvas.width * canvas.height) / 43560).toFixed(1)} acres`) : null)
    : step === "design" ? (sum.holes ? chip(`${sum.holes} hole${sum.holes === 1 ? "" : "s"} · Par ${sum.par}`) : null)
    : step === "map" ? chip(look)
    : null;
  return (
    <div className="touch-none flex items-center gap-3 px-4 pb-3" data-testid="sheet-header">
      <div className="flex-1 min-w-0">
        <div className="text-[11px] font-bold tracking-wider text-orange-400 uppercase">Step {i + 1} of {STEPS.length}</div>
        <h2 className="text-[20px] font-bold text-zinc-50 leading-tight truncate" data-testid="sheet-title">{meta.title}</h2>
      </div>
      {right}
    </div>
  );
}

// ---------------------------------------------------------------------------------- tools

// (view only: no tools to change the course with)
function ToolStrip() {
  return useCourse(s => s.readOnly) ? null : <Tools />;
}

function Tools() {
  const tool = useEditor(e => e.tool);
  const set = useEditor(e => e.set);
  const canUndo = useCourse(s => s.past.length > 0);
  const canRedo = useCourse(s => s.future.length > 0);
  const row = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Keep the active tool in sight
    const el = row.current?.querySelector<HTMLElement>(`[data-tool="${tool}"]`);
    const box = row.current;
    if (!el || !box) return;
    const l = el.offsetLeft - box.offsetLeft, r = l + el.offsetWidth;
    if (l < box.scrollLeft || r > box.scrollLeft + box.clientWidth) box.scrollTo({ left: l - 12, behavior: "smooth" });
  }, [tool]);
  const pick = (mode: (typeof TOOLS)[number]["mode"]) => {
    if (mode !== tool) stopDrawing();
    set({ tool: mode });
  };
  return (
    <div className="flex items-center gap-1 pl-2 pr-1.5 pb-2" data-testid="tool-strip">
      <div ref={row} role="toolbar" aria-label="Tools" className="flex-1 min-w-0 flex gap-1 overflow-x-auto dg-noscrollbar dg-fade-r touch-pan-x pr-6">
        {TOOLS.map(t => {
          const on = tool === t.mode;
          return (
            <button
              key={t.mode}
              data-tool={t.mode}
              data-testid={`tool-${t.mode}`}
              aria-label={touchWords(t.label)}
              aria-pressed={on}
              onClick={() => pick(t.mode)}
              className={`shrink-0 min-w-[56px] h-[54px] px-1.5 rounded-xl flex flex-col items-center justify-center gap-1 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 ${on ? "bg-orange-500 text-zinc-950 shadow-lg shadow-orange-900/40" : "text-zinc-300 active:bg-white/[0.13] bg-white/[0.07]"}`}
            >
              {t.icon}
              <span className="text-[11px] leading-none font-semibold whitespace-nowrap">{t.short}</span>
            </button>
          );
        })}
      </div>
      <div className="w-px h-9 bg-white/[0.12] mx-0.5 shrink-0" />
      <button className={`${iconBtn} h-[54px] w-10`} aria-label="Undo" disabled={!canUndo} onClick={() => useCourse.getState().undo()}><Undo2 size={20} /></button>
      <button className={`${iconBtn} h-[54px] w-10`} aria-label="Redo" disabled={!canRedo} onClick={() => useCourse.getState().redo()}><Redo2 size={20} /></button>
    </div>
  );
}

function ToolHeader() {
  const ed = useEditor();
  const t = TOOLS.find(x => x.mode === ed.tool);
  const options = toolOptions(ed);
  const hint = toolHint(ed, true);
  return (
    <div className="pb-3" data-testid="tool-header">
      <div className="touch-none flex items-start gap-2 pl-4 pr-2">
        <div className="flex-1 min-w-0 pt-1">
          <div className="text-[16px] font-bold text-zinc-50 flex items-center gap-2" data-testid="sheet-title"><span className="text-orange-300">{t?.icon}</span>{TOOL_TITLES[ed.tool] ?? t?.short}</div>
          {hint && <p className="text-[14px] leading-snug text-zinc-300 mt-0.5" data-testid="tool-hint">{hint}</p>}
        </div>
        <button className={iconBtn} aria-label="Back to Select" title="Back to Select" onClick={() => { stopDrawing(); ed.set({ tool: "select" }); }} data-testid="tool-close"><X size={20} /></button>
      </div>
      {options && <div className="mt-2.5 px-4 flex gap-1.5 overflow-x-auto dg-noscrollbar dg-fade-r touch-pan-x" data-testid="tool-options">{options.filter(o => (o as { key?: string } | null)?.key !== "brush")}<span className="shrink-0 w-4" aria-hidden /></div>}
      {/* (the brush's size and strength on a row of their own: there's no room beside the rest) */}
      {options?.some(o => (o as { key?: string } | null)?.key === "brush") && <div className="mt-2 px-4 flex">{options.find(o => (o as { key?: string } | null)?.key === "brush")}</div>}
    </div>
  );
}

/** Undo, Cancel and Done while drawing (no Backspace, Esc or Enter on a phone). */
function DrawBar({ bottom }: { bottom: number }) {
  const tool = useEditor(e => e.tool);
  const n = useEditor(e => e.drawPoints);
  const structureKind = useEditor(e => e.structureKind);
  const teeView = useEditor(e => e.teeView);
  const gpsOn = useGps(g => g.mode !== "off");
  if (teeView) return null;
  const kind = tool === "draw-area" ? "area" : tool === "draw-line" ? "line" : tool === "draw-structure" ? (STRUCTURE_KINDS[structureKind].shape === "outline" ? "area" : "line") : null;
  const pill = "absolute left-1/2 -translate-x-1/2 z-30 w-max max-w-[calc(100%-16px)] flex items-center gap-1 p-1.5 rounded-full glass border border-white/10 shadow-2xl transition-[bottom] duration-300";
  const btn = "h-11 px-4 rounded-full flex items-center gap-1.5 text-[15px] font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400";
  if (kind && n > 0) {
    const need = kind === "area" ? 3 : 2;
    return (
      <div className={pill} style={{ bottom }} role="toolbar" aria-label="Drawing" data-testid="draw-bar">
        <button className={`${btn} text-zinc-200 active:bg-white/[0.13]`} onClick={() => getView()?.undoPoint()} data-testid="draw-undo"><Undo2 size={18} /> Undo</button>
        <button className={`${btn} text-zinc-200 active:bg-white/[0.13]`} onClick={() => getView()?.cancelDrawing()} data-testid="draw-cancel"><X size={18} /> Cancel</button>
        <button className={`${btn} bg-orange-500 text-zinc-950 disabled:opacity-40 active:bg-orange-600`} disabled={n < need} onClick={() => getView()?.finishDrawing()} data-testid="draw-done">
          <Check size={18} strokeWidth={3} /> Done
          <span className="text-[13px] font-medium opacity-80 tabular-nums">{n < need ? `${n}/${need}` : n}</span>
        </button>
      </div>
    );
  }
  // (where you stand, once you've shown it on the map: a button beside the words)
  const here = `${btn} bg-sky-500/90 text-white active:bg-sky-600 disabled:opacity-90`;
  if (tool === "add-hole" && n === 1) {
    return (
      <div className={pill} style={{ bottom }} role="toolbar" aria-label="New hole" data-testid="draw-bar">
        <span className="pl-3 pr-1 text-[15px] text-zinc-100 font-semibold">{gpsOn ? "Basket spot" : "Now tap the basket spot"}</span>
        <HereButton what="basket" className={here} />
        <button className={`${btn} text-zinc-200 active:bg-white/[0.13]`} onClick={() => getView()?.cancelDrawing()} data-testid="draw-cancel"><X size={18} /> Cancel</button>
      </div>
    );
  }
  if (gpsOn && (tool === "add-hole" || tool === "add-tee" || tool === "add-basket")) {
    const what = tool === "add-basket" ? "pin" : "tee";
    return (
      <div className={pill} style={{ bottom }} role="toolbar" aria-label="Where you stand" data-testid="here-bar">
        <span className="pl-3 pr-1 text-[15px] text-zinc-100 font-semibold">Tap the map, or</span>
        <HereButton what={what} className={here} />
      </div>
    );
  }
  return null;
}

// ---------------------------------------------------------------------------------- selection

function SelectionHeader({ onMore }: { onMore: () => void }) {
  const doc = useCourse(s => s.doc);
  const step = useEditor(e => e.step);
  const { hole, item, group } = useSelection();
  const s = useMemo(() => (hole ? holeStats(doc, hole) : null), [doc, hole]);
  const u = doc.units;
  const holeId = hole?.id ?? (item && "holeId" in item ? item.holeId : undefined);
  const title = hole ? `Hole ${holeLabel(doc, hole.id)}${hole.name ? ` · ${hole.name}` : ""}` : item ? itemTitle(item) : group.length ? `${group.length} selected` : "";
  const sub = hole
    ? s?.complete ? `${fmtDist(s.length, u)} · Par ${s.par} · ${fmtElev(s.elevationChange, u)}` : s?.teeId ? "Needs a basket" : "Needs a tee"
    : holeId ? `Hole ${holeLabel(doc, holeId)}` : item?.locked ? "Locked in place" : item ? "Whole course" : groupSummary(doc, group).join(" · ");
  const back = STEPS.find(x => x.id === step)?.label ?? "the step";
  return (
    <div className="touch-none flex items-center gap-0.5 pl-1.5 pr-2 pb-2" data-testid="selection-header">
      <button className={iconBtn} aria-label={`Back to ${back}`} title={`Back to ${back}`} onClick={() => select(null)} data-testid="selection-back"><ChevronLeft size={26} /></button>
      <div className="flex-1 min-w-0 pl-0.5">
        <div className="text-[17px] font-bold text-zinc-50 truncate leading-tight" data-testid="sheet-title">{title}</div>
        {holeId && !hole ? (
          <button className="text-[13px] text-orange-300 font-semibold" onClick={() => select(holeId)}>{sub} ›</button>
        ) : (
          <div className="text-[13px] text-zinc-400 truncate tabular-nums">{sub}</div>
        )}
      </div>
      {hole && <HoleSteps holeId={hole.id} big />}
      {hole && s?.complete && <button className={iconBtn} aria-label="View from the tee" title="View from the tee" onClick={() => useEditor.getState().set({ teeView: hole.id, flyover: false })}><Eye size={20} /></button>}
      {group.length > 0 && <button className={iconBtn} aria-label="Duplicate" title="Duplicate" onClick={duplicateSelection}><Copy size={19} /></button>}
      <button className={`${iconBtn} hover:text-red-400`} aria-label="Delete" title="Delete" onClick={deleteSelection} data-testid="selection-delete"><Trash2 size={19} /></button>
      {!group.length && <button className={iconBtn} aria-label="More actions" title="More actions" onClick={onMore} data-testid="selection-more"><Ellipsis size={22} /></button>}
    </div>
  );
}

/** A hole's or an item's menu (long-press on the map, or "More" on the selection). */
export function ItemMenu({ itemId, onClose }: { itemId: string; onClose: () => void }) {
  const doc = getDoc();
  const hole = doc.holes.find(h => h.id === itemId);
  const item = doc.items.find(i => i.id === itemId);
  if (!hole && !item) return null;
  const holeId = hole?.id ?? (item && "holeId" in item ? item.holeId : undefined);
  const holeDone = !!holeId && holeStats(doc, doc.holes.find(h => h.id === holeId)!).complete;
  const n = hole ? holeNumber(doc, hole.id) : 0;
  const set = useEditor.getState().set;
  const a: SheetAction[] = [];
  if (holeId && holeDone) {
    a.push({ label: "View from the tee", icon: <Eye size={19} />, run: () => set({ teeView: holeId, flyover: false }), testid: "menu-tee-view" });
    a.push({ label: "Fly over the hole", icon: <Plane size={19} />, run: () => set({ teeView: holeId, flyover: true }) });
  }
  a.push({ label: hole ? "Zoom to this hole" : "Zoom to it", icon: <Maximize2 size={18} />, run: () => (hole ? getView()?.fitHole(hole.id) : getView()?.reveal(itemId)) });
  if (item && ((item.type === "area" && item.kind === "water") || (item.type === "line" && item.kind !== "ob" && item.kind !== "walk"))) {
    a.push({ label: item.ob === true ? "Remove the red OB edge" : "Mark as OB (red edge)", run: () => updateItem(item.id, (item.ob === true ? { ob: undefined, obBeyond: undefined, obHoles: undefined, obStretches: undefined } : { ob: true }) as Partial<CourseItem>), testid: "menu-ob" });
  }
  if (item?.type === "line" && item.kind !== "ob" && item.kind !== "walk") {
    if (!(item.ob === true && item.obBeyond)) a.push({ label: "Mark as OB and beyond", run: () => markObBeyond(item.id), testid: "menu-ob-beyond" });
    a.push({ label: "OB along a stretch", run: () => set({ obPick: item.id, pickCut: false, tool: "select" }), testid: "menu-ob-stretch" });
  }
  if (item?.type === "line" && !item.locked) a.push({ label: "Remove a stretch", run: () => set({ obPick: item.id, pickCut: true, tool: "select" }), testid: "menu-cut-stretch" });
  // (on one of the things picked together: for all of them)
  const group = useEditor.getState().group;
  const inGroup = !!item && group.includes(item.id);
  a.push({ label: inGroup ? `Copy ${group.length}` : "Copy", icon: <Copy size={18} />, run: () => { if (!inGroup) select(itemId); copySelection(); } });
  const here = item ? { x: item.x + 30, y: item.y + 30 } : null;
  if (canPaste() && here) a.push({ label: "Paste next to it", icon: <Copy size={18} />, run: () => pasteClipboard(here) });
  a.push({ label: inGroup ? `Duplicate ${group.length}` : "Duplicate", icon: <Copy size={18} />, run: () => { if (!inGroup) select(itemId); duplicateSelection(); } });
  if (item && !inGroup) a.push({ label: item.locked ? "Unlock" : "Lock in place", icon: item.locked ? <Unlock size={18} /> : <Lock size={18} />, run: () => updateItem(item.id, { locked: !item.locked } as Partial<CourseItem>) });
  a.push({ label: inGroup ? `Delete ${group.length}` : "Delete", icon: <Trash2 size={18} />, danger: true, run: () => { if (!inGroup) select(itemId); deleteSelection(); }, testid: "menu-delete" });
  const title = hole ? `Hole ${n}${hole.name ? ` · ${hole.name}` : ""}` : itemTitle(item!);
  const sub = holeId && !hole ? `Hole ${holeLabel(doc, holeId)}` : undefined;
  return <ActionSheet title={title} subtitle={sub} actions={a} onClose={onClose} testid="item-menu" />;
}

// ---------------------------------------------------------------------------------- app menu

function AppMenu({ onClose, onHelp, onGoTo, onOpenFile }: { onClose: () => void; onHelp: () => void; onGoTo: () => void; onOpenFile: () => void }) {
  const [recent, setRecent] = useState<PlanMeta[]>([]);
  const name = useCourse(s => s.doc.name);
  useEffect(() => { void recentCourses().then(setRecent); }, []);
  const actions: SheetAction[] = [
    { label: "Search settings and help", icon: <Search size={19} />, run: onGoTo, testid: "menu-search" },
    { label: "Getting started", icon: <ListChecks size={19} />, run: openGettingStarted, testid: "menu-getting-started" },
    { label: "New course", icon: <FilePlus size={19} />, run: () => void newCourse() },
    { label: "Open a course file…", icon: <FolderOpen size={19} />, run: onOpenFile },
    { label: "Save as a file", icon: <Save size={19} />, run: () => saveCourseFile() },
    { label: "Help guide", icon: <HelpCircle size={19} />, run: onHelp, testid: "menu-help" },
    ...(SERVER ? accountActions() : demoActions())
  ];
  return (
    <>
      <ActionSheet title={name} subtitle="HyzerLab" actions={actions} onClose={onClose} testid="app-menu">
        {recent.length > 0 && (
          <div className="border-b border-white/5">
            <div className="px-4 pt-2.5 pb-1 text-[12px] uppercase tracking-wider font-bold text-zinc-500">{SERVER ? "Courses" : "Recent courses"}</div>
            <div className="flex gap-2 overflow-x-auto dg-noscrollbar px-4 pb-3 touch-pan-x">
              {recent.map(r => (
                <div key={r.id} className="shrink-0 flex items-center bg-white/[0.07] rounded-xl" data-testid="recent-course">
                  <button className="text-left pl-3 pr-1 py-2 min-h-[48px]" onClick={() => { onClose(); void openRecent(r.id); }}>
                    <span className="block text-[14px] text-zinc-100 max-w-[180px] truncate">{r.name}</span>
                    <span className="block text-[12px] text-zinc-400">{r.holes} hole{r.holes === 1 ? "" : "s"} · {new Date(r.updatedAt).toLocaleDateString()}</span>
                  </button>
                  <button className="w-10 h-12 flex items-center justify-center text-zinc-500" aria-label={`Delete ${r.name}`} onClick={() => { void deleteRecent(r.id).then(() => recentCourses().then(setRecent)); }}><Trash2 size={16} /></button>
                </div>
              ))}
            </div>
          </div>
        )}
      </ActionSheet>
    </>
  );
}

function ViewToggle({ vertical = false }: { vertical?: boolean }) {
  const view = useEditor(e => e.view);
  const set = useEditor(e => e.set);
  return (
    <div className={`flex ${vertical ? "flex-col" : ""} bg-white/[0.07] rounded-xl p-0.5 shrink-0`} role="radiogroup" aria-label="View">
      {(["2d", "3d"] as const).map(v => (
        <button key={v} role="radio" aria-checked={view === v} onClick={() => set({ view: v })} data-testid={`view-${v}`} className={`${vertical ? "w-11 h-9" : "w-10 h-10"} rounded-[10px] text-[14px] font-bold focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 ${view === v ? "bg-zinc-100 text-zinc-900" : "text-zinc-300"}`}>
          {v.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

function PhoneTopBar({ onMenu }: { onMenu: () => void }) {
  const name = useCourse(s => s.doc.name);
  const sum = useSummary();
  const sub = sum.complete ? `${sum.complete} hole${sum.complete === 1 ? "" : "s"} · Par ${sum.par} · ${fmtDist(sum.length, sum.units)}` : "HyzerLab";
  return (
    <div className="absolute left-0 right-0 top-0 z-30 px-2 pt-[max(8px,env(safe-area-inset-top))] pointer-events-none" data-testid="top-bar">
      <div className="glass pointer-events-auto flex items-center gap-1 h-[56px] pl-1 pr-1 rounded-[22px]">
        {/* (the menu: a button that looks like one, and the course's name opens it too) */}
        {SITE_TOKEN ? <CoursePageButton /> : <button className="w-11 h-11 shrink-0 flex items-center justify-center rounded-[14px] bg-white/[0.1] active:bg-white/[0.18] text-zinc-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400" aria-label="Menu: files, help" onClick={onMenu} data-testid="app-menu-button"><Menu size={22} /></button>}
        {SITE_TOKEN ? (
          <div className="flex-1 min-w-0 pl-0.5">
            <div className="text-[15px] font-bold text-zinc-50 truncate leading-tight" data-testid="course-name">{name}</div>
            <div className="text-[12px] text-zinc-400 truncate tabular-nums">{sub}</div>
          </div>
        ) : (
          <button className="flex-1 min-w-0 min-h-11 pl-1.5 text-left rounded-[12px] active:bg-white/[0.07] focus:outline-none" onClick={onMenu} aria-label={`${name}: open the menu`}>
            <div className="text-[15px] font-bold text-zinc-50 truncate leading-tight flex items-center gap-1" data-testid="course-name"><span className="truncate">{name}</span><ChevronDown size={15} className="shrink-0 text-zinc-400" /></div>
            <div className="text-[12px] text-zinc-400 truncate tabular-nums">{sub}</div>
          </button>
        )}
        {SERVER && <CourseChip />}
        <ViewToggle />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------- the panel

/** The panel's header and content, for the bottom sheet and the side panel. */
function usePanel({ onFindSite, onMore, phone = false }: { onFindSite: () => void; onMore: () => void; phone?: boolean }) {
  const readOnly = useCourse(s => s.readOnly);
  const mode = useMode();
  const step = useEditor(e => e.step);
  const tool = useEditor(e => e.tool);
  const selectedId = useEditor(e => e.selectedId);
  const meta = STEPS.find(s => s.id === step)!;
  // (a hole picked: its strip of settings in the tools' place, the hole kept in view above it)
  const { hole: pickedHole, item: pickedItem, group: pickedGroup } = useSelection();
  // (a phone only: a tablet's side panel has the room for all of it, beside the map)
  const strip = phone && mode === "selection" && !!pickedHole && !readOnly;
  // (anything else picked, on its own: its strip too)
  const itemStrip = phone && mode === "selection" && !pickedHole && !!pickedItem && !pickedGroup.length && !readOnly;
  const tools = (step === "design" || mode === "tool") && !strip && !itemStrip;
  const header = (
    <>
      {tools && <ToolStrip />}
      {mode === "tool" ? <ToolHeader /> : mode === "selection" ? <SelectionHeader onMore={onMore} /> : <StepHeader onFindSite={onFindSite} />}
      {strip && <HoleStrip hole={pickedHole} />}
      {itemStrip && <ItemStrip key={pickedItem.id} item={pickedItem} />}
    </>
  );
  const body = mode === "selection" ? (
    <div data-testid="inspector" aria-label="Selection" className="pb-4">
      <InspectorBody />
    </div>
  ) : (
    <div className="pb-4" data-testid="step-panel">
      <StepContent onFindSite={onFindSite} />
    </div>
  );
  // What changed in the panel, said to screen readers (the panel changes without the focus moving)
  const doc = useCourse(s => s.doc);
  const said = mode === "selection" && selectedId
    ? `${doc.holes.some(h => h.id === selectedId) ? `Hole ${holeLabel(doc, selectedId)}` : (() => { const it = doc.items.find(i => i.id === selectedId); return it ? itemTitle(it) : ""; })()} selected`
    : mode === "tool" ? `${TOOL_TITLES[tool] ?? tool}: ${toolHint(useEditor.getState(), true) ?? ""}`
    : `Step ${STEPS.findIndex(s => s.id === step) + 1}: ${meta.title}`;
  const announce = <div aria-live="polite" className="sr-only" data-testid="announce">{said}</div>;
  // (view only: the course and its holes, nothing to change)
  if (readOnly) return { mode, header: null, body: <ViewerPanelBody />, announce, key: "viewer" };
  return { mode, header, body, announce, key: mode === "selection" ? `sel:${selectedId}` : `step:${step}:${mode === "tool" ? tool : ""}` };
}

// ---------------------------------------------------------------------------------- shells

export function CompactShell(props: ShellProps) {
  return props.layout === "phone" ? <PhoneShell {...props} /> : <RailShell {...props} />;
}

function useMenus(onHelp: () => void, onGoTo: () => void) {
  const [appMenu, setAppMenu] = useState(false);
  const [more, setMore] = useState(false);
  const selectedId = useEditor(e => e.selectedId);
  // (outside the menu: the menu closes while the file is being picked)
  const file = useRef<HTMLInputElement>(null);
  const menus = (
    <>
      <input ref={file} type="file" className="hidden" aria-label="Open course file" onChange={e => { const f = e.target.files?.[0]; if (f) void openCourseFile(f); e.target.value = ""; }} />
      {appMenu && <AppMenu onClose={() => setAppMenu(false)} onHelp={onHelp} onGoTo={onGoTo} onOpenFile={() => file.current?.click()} />}
      {more && selectedId && <ItemMenu itemId={selectedId} onClose={() => setMore(false)} />}
    </>
  );
  return { menus, openApp: () => setAppMenu(true), openMore: () => setMore(true) };
}

function PhoneShell({ onFindSite, onHelp, onGoTo, onContextMenu, welcome, toasts }: ShellProps) {
  const ed = useEditor();
  const readOnly = useCourse(s => s.readOnly);
  const [detent, setDetent] = useState<Detent>(() => STEP_DETENT[useEditor.getState().step]);
  const [restH, setRestH] = useState(180);
  const [mainH, setMainH] = useState(700);
  const main = useRef<HTMLDivElement>(null);
  const { menus, openApp, openMore } = useMenus(onHelp, onGoTo);
  const panel = usePanel({ onFindSite, onMore: openMore, phone: true });
  const immersive = !!ed.teeView;
  // (No sheet under the welcome card: it is the first step's panel, with the same two choices)
  const sheet = !immersive && !welcome;
  const sheetH = sheet ? restH : 0;

  useEffect(() => {
    const el = main.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setMainH(el.clientHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Picking a tool brings the sheet down so the map is free to tap on; picking something from a
  // full-height list brings it to half height, so the map shows it
  const prevMode = useRef(panel.mode);
  useLayoutEffect(() => {
    if (panel.mode === "tool" && prevMode.current !== "tool") setDetent("peek");
    prevMode.current = panel.mode;
  }, [panel.mode]);
  // (a hole or a thing picked: down to its strip, the map free above it)
  const holePicked = !readOnly && !!ed.selectedId && (getDoc().holes.some(h => h.id === ed.selectedId) || getDoc().items.some(i => i.id === ed.selectedId));
  useLayoutEffect(() => {
    // (a hole: down to its strip, the map free above it; view only: its numbers come up)
    if (holePicked) setDetent("peek");
    else if (ed.selectedId) setDetent(d => (d === "full" ? "half" : readOnly && d === "peek" ? "half" : d));
  }, [ed.selectedId]);
  // (a piece picked on a printout's page: the sheet down, the page and its toolbar free above it)
  useLayoutEffect(() => {
    if (ed.designSel && (ed.step === "map" || ed.step === "export")) setDetent("peek");
  }, [ed.designSel]);
  // (and the hole brought into the map above the sheet once the sheet has its height: once a
  // pick, never again as the sheet is dragged up or down for more of its settings)
  const revealed = useRef<string | null>(null);
  useEffect(() => {
    if (!holePicked || !ed.selectedId) { revealed.current = null; return; }
    const id = ed.selectedId;
    if (revealed.current === id) return;
    const t = window.setTimeout(() => { revealed.current = id; getView()?.reveal(id); }, 320);
    return () => window.clearTimeout(t);
  }, [ed.selectedId, holePicked, sheetH]);

  // Fitting holes and items keeps them clear of the sheet (set before the fit that follows a
  // pick from the list)
  useLayoutEffect(() => {
    const v = getView();
    if (!v) return;
    v.rightInset = 0;
    v.bottomInset = sheetH;
    v.topInset = immersive ? 0 : 64;
  }, [sheetH, immersive]);
  useEffect(() => () => { const v = getView(); if (v) { v.bottomInset = 0; v.topInset = 0; } }, []);

  const toggle = useCallback(() => setDetent(d => (d === "peek" ? "half" : "peek")), []);
  const onStep = (s: Step) => goStep(s, setDetent, toggle);
  const top = 72; // below the top bar
  const design = (ed.step === "map" || ed.step === "export") && !ed.teeView;
  // (Room for the map's buttons: between the top bar and the sheet, less the drawing buttons;
  // none under the welcome card or the Design preview)
  const controlsRoom = welcome || design ? 0 : mainH - sheetH - top - 12 - (ed.drawPoints > 0 ? 64 : 0);

  return (
    <div className="dg-compact fixed inset-0 flex flex-col bg-zinc-950 text-zinc-100 overflow-hidden isolate" data-layout="phone" onScroll={keepPut}>
      <Woods />
      <main ref={main} className="relative flex-1 min-h-0">
        <MapViewport onContextMenu={onContextMenu} compact="phone" controlsTop={top} controlsRoom={immersive ? 0 : controlsRoom} />
        {design && (
          <div className="absolute inset-x-0 top-0 z-20" style={{ bottom: sheetH }}>
            <MapDesigner compact topInset={top} preview={ed.step === "export"} />
          </div>
        )}
        {!immersive && <PhoneTopBar onMenu={openApp} />}
        {!immersive && <GettingStarted phone />}
        {!immersive && <DrawBar bottom={sheetH + 12} />}
        {ed.teeView && (ed.flyCam && !useCourse.getState().readOnly ? <CameraHud compact /> : <TeeViewHud compact />)}
        <ExportProgressPill top={immersive ? undefined : top + 4} />
        {toasts(immersive ? 96 : sheetH + 12)}
        {welcome && !immersive && (
          <div className="absolute inset-0 z-10 flex items-end justify-center px-3 pb-3 pointer-events-none" style={{ paddingTop: top }}>{welcome}</div>
        )}
        {sheet && (
          <BottomSheet detent={detent} onDetent={setDetent} header={panel.header} label={panel.mode === "selection" ? "Selection" : panel.mode === "tool" ? "Tool" : "Step panel"} topGap={top + 8} onHeight={setRestH} contentKey={panel.key}>
            {panel.body}
          </BottomSheet>
        )}
      </main>
      {!immersive && !readOnly && <BottomNav onStep={onStep} />}
      {panel.announce}
      {menus}
    </div>
  );
}

function RailShell({ onFindSite, onHelp, onGoTo, onContextMenu, welcome, toasts }: ShellProps) {
  const ed = useEditor();
  const [open, setOpen] = useState(true);
  const { menus, openApp, openMore } = useMenus(onHelp, onGoTo);
  const panel = usePanel({ onFindSite, onMore: openMore });
  const immersive = !!ed.teeView;
  const body = useRef<HTMLDivElement>(null);
  useEffect(() => { body.current?.scrollTo({ top: 0 }); }, [panel.key]);
  useEffect(() => {
    const v = getView();
    if (v) { v.rightInset = 0; v.bottomInset = 0; v.topInset = 0; }
  }, []);
  const onStep = (s: Step) => {
    setOpen(true);
    goStep(s, () => {}, () => setOpen(o => !o));
  };
  const design = (ed.step === "map" || ed.step === "export") && !ed.teeView;
  return (
    <div className="dg-compact fixed inset-0 flex bg-zinc-950 text-zinc-100 overflow-hidden isolate" data-layout="rail" onScroll={keepPut}>
      <Woods />
      {!immersive && <NavRail onStep={onStep} onMenu={openApp} panelOpen={open} onPanel={() => setOpen(o => !o)} />}
      {!immersive && open && (
        <aside className="glass dg-side w-[300px] [@media(min-height:600px)]:w-[340px] shrink-0 flex flex-col m-2 ml-2 rounded-[24px] overflow-hidden relative z-30" aria-label={panel.mode === "selection" ? "Selection" : "Step panel"} data-testid="side-sheet">
          <div className="shrink-0 pt-2">{panel.header}</div>
          <div ref={body} className="dg-scroll flex-1 min-h-0 overflow-y-auto pb-[env(safe-area-inset-bottom)]">{panel.body}</div>
        </aside>
      )}
      <main className="relative flex-1 min-w-0">
        <MapViewport onContextMenu={onContextMenu} compact="rail" controlsTop={8} controlsRoom={immersive || design ? 0 : 999} />
        {design && <div className="absolute inset-0 z-20"><MapDesigner compact topInset={0} preview={ed.step === "export"} /></div>}
        {!immersive && <DrawBar bottom={12} />}
        {ed.teeView && (ed.flyCam && !useCourse.getState().readOnly ? <CameraHud compact /> : <TeeViewHud compact />)}
        <ExportProgressPill />
        {toasts(16)}
        {welcome && !immersive && <div className="absolute inset-0 z-10 flex items-center justify-center px-3 pointer-events-none">{welcome}</div>}
      </main>
      {panel.announce}
      {menus}
    </div>
  );
}
