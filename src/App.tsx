// The app: header with the steps, the step panel, the map (2D and 3D in one view), the tools, the
// inspector for the selection, and the dialogs.
import { useEffect, useMemo, useRef, useState } from "react";
import { MapPinned, Route, X } from "lucide-react";
import { Header } from "./components/Header";
import { ViewerPanel } from "./auth/ViewerPanel";
import { SidePanel } from "./components/SidePanel";
import { MapViewport } from "./components/MapViewport";
import { getView } from "./state/view";
import { Toolbar, TOOLS } from "./components/Toolbar";
import { Inspector } from "./components/Inspector";
import { stepHole } from "./components/HoleSteps";
import { GoTo } from "./components/GoTo";
import { SiteImportDialog } from "./components/SiteImportDialog";
import { TeeViewHud } from "./components/TeeViewHud";
import { MapDesigner } from "./components/MapDesigner";
import { ExportProgressPill } from "./components/ExportProgress";
import { Button } from "./components/ui";
import { useLayout, useTouch } from "./components/useLayout";
import { CompactShell, ItemMenu } from "./components/mobile/CompactShell";
import { useCourse, useEditor, getDoc, changeDoc, updateItem } from "./state/course";
import { adoptLidarTree, adoptTreeAt, canPaste, copySelection, cutTreeAt, cutSelection, deleteSelection, duplicateSelection, markObBeyond, nudgeSelection, pasteClipboard, select, selectAll } from "./state/actions";
import { osmFailedToast } from "./state/osm";
import { restoreAutosave, startAutosave } from "./state/files";
import { toast, useToasts } from "./state/toast";
import { courseStats, holeStats } from "./lib/holeStats";
import { grownTree } from "./lib/lidar";
import { isImported, reframeDesign, type ImportedSite } from "./lib/importSite";
import { holeLabel } from "./lib/course";
import { geoRefOf } from "./lib/geoRef";
import { Woods } from "./components/Woods";
import type { CourseItem, P } from "./types";

function Toasts({ bottom }: { bottom?: number }) {
  const toasts = useToasts(s => s.toasts);
  const dismiss = useToasts(s => s.dismiss);
  const undo = useCourse(s => s.undo);
  return (
    <div className="absolute bottom-[120px] left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 z-40 pointer-events-none w-max max-w-[calc(100%-16px)]" style={bottom !== undefined ? { bottom } : undefined}>
      {toasts.map(t => (
        <div key={t.id} role="status" className={`pointer-events-auto flex items-center gap-3 rounded-xl px-4 py-2.5 touch:py-3 shadow-2xl text-sm max-w-[560px] border ${t.tone === "error" ? "bg-red-950 border-red-800 text-red-100" : t.tone === "success" ? "bg-emerald-950 border-emerald-800 text-emerald-50" : "glass border-white/[0.12] text-zinc-100"}`}>
          <span className={bottom !== undefined ? "text-[13px] leading-snug line-clamp-3" : undefined}>{t.text}</span>
          {t.undo && <button className="font-bold text-orange-300 hover:text-orange-200 touch:min-h-[40px]" onClick={() => { undo(); dismiss(t.id); }}>Undo</button>}
          {t.action && <button className="font-bold text-orange-300 hover:text-orange-200 whitespace-nowrap touch:min-h-[40px]" onClick={() => { t.action!.run(); dismiss(t.id); }}>{t.action.label}</button>}
          <button aria-label="Dismiss" className="text-zinc-400 hover:text-zinc-50 touch:w-9 touch:h-9 touch:-mr-2 touch:flex touch:items-center touch:justify-center shrink-0" onClick={() => dismiss(t.id)}><X size={14} /></button>
        </div>
      ))}
    </div>
  );
}

/** A dialog takes the focus when it opens and gives it back when it closes; Esc closes it. */
function useModal(onClose: () => void) {
  const box = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    box.current?.querySelector<HTMLElement>("button, input")?.focus({ preventScroll: true });
    const esc = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      close.current();
    };
    window.addEventListener("keydown", esc, true);
    return () => {
      window.removeEventListener("keydown", esc, true);
      before?.focus?.({ preventScroll: true });
    };
  }, []);
  return box;
}

const SHORTCUTS: [string, string][] = [
  ["V", "Select and move"], ["H", "New hole (tee, then basket)"], ["T / B", "Another tee / pin for the hole"], ["M / Z", "Mando / drop zone"],
  ["O / L", "Draw an area / a line"], ["S", "Build: bridge, boardwalk, stairs, wall, building, shelter, deck"], ["R / A / K", "Tree / bench, sign… / label"], ["D", "Measure"],
  ["Enter", "Finish drawing · view from the selected hole's tee"], ["Esc", "Cancel · back to Select · close"], ["Backspace", "Remove the last point drawn"],
  ["Shift+drag", "Select with a box"], ["Shift+click", "Add to the selection, or take out"], ["Ctrl+A", "Select everything"],
  ["Del", "Delete the selection"], ["Ctrl+D", "Duplicate"], ["Ctrl+C / X / V", "Copy / cut / paste (where the pointer is)"], ["Arrows", "Nudge 1 ft (Shift: 10 ft) · other holes in the tee view"],
  ["Ctrl+Z / Ctrl+Shift+Z", "Undo / redo"], ["2 / 3", "Top-down / 3D"], ["0 / F", "Whole course / zoom to selection"], ["[ / ]", "Previous / next hole"], ["Ctrl+K or /", "Go to a hole, step, tool or name"], ["Q / E / N", "Turn left / right / north up"], ["+ / −", "Zoom"]
];

const GESTURES: [string, string][] = [
  ["One finger", "Pan the map; drag a selected thing or its handles to move or reshape it"],
  ["Pinch", "Zoom in and out (or the + and − buttons)"],
  ["Two fingers up or down", "Tilt into 3D and back"],
  ["Two fingers sideways", "Turn the map (or the turn buttons; the compass puts north up)"],
  ["Tap", "Select a hole or a thing; with a tool, place it"],
  ["Hold", "A thing's menu: view from the tee, mark OB, duplicate, lock, delete"],
  ["Select, above the tools", "Drag a box around several things; tap one to add it or take it out"],
  ["Drag the panel", "Up for more, down for more map; tap its handle to step through"]
];

/** A dialog's box: a sheet up from the bottom on a phone, a centered box from a tablet up. */
const SHEET = "glass shadow-2xl ring-1 ring-white/10 w-full rounded-t-[22px] md:rounded-2xl max-h-[92dvh] overflow-y-auto pb-[max(20px,env(safe-area-inset-bottom))] md:pb-5 animate-[dgrise_220ms_cubic-bezier(0.2,0.9,0.3,1)] md:animate-none";
const CLOSE = "text-zinc-400 hover:text-zinc-50 touch:w-11 touch:h-11 touch:-m-2.5 touch:flex touch:items-center touch:justify-center";

function HelpDialog({ onClose }: { onClose: () => void }) {
  const touch = useTouch();
  const box = useModal(onClose);
  return (
    <div ref={box} className="fixed inset-0 z-50 bg-black/60 flex items-end md:items-center justify-center p-0 md:p-4" role="dialog" aria-modal="true" aria-label="Shortcuts and help" onClick={onClose}>
      <div className={`${SHEET} h-[92dvh] md:h-auto md:max-w-2xl p-5 md:max-h-[90vh]`} onClick={e => e.stopPropagation()}>
        {touch && (
          <>
            <div className="flex items-center mb-3">
              <h2 className="font-bold text-zinc-50 text-lg flex-1">Touch gestures</h2>
              <button aria-label="Close" className={CLOSE} onClick={onClose}><X size={18} /></button>
            </div>
            <dl className="grid grid-cols-1 sm:grid-cols-[auto_1fr] gap-x-4 text-[15px] mb-5" data-testid="gestures">
              {GESTURES.map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="font-semibold text-zinc-100 mt-2.5 sm:mt-2">{k}</dt>
                  <dd className="text-zinc-300 sm:mt-2">{v}</dd>
                </div>
              ))}
            </dl>
          </>
        )}
        <div className="flex items-center mb-3">
          <h2 className="font-bold text-zinc-50 text-lg flex-1">Keyboard shortcuts</h2>
          {!touch && <button aria-label="Close" className={CLOSE} onClick={onClose}><X size={18} /></button>}
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
          {SHORTCUTS.map(([k, v]) => (
            <div key={k} className="contents">
              <dt><kbd className="px-1.5 py-0.5 bg-white/[0.07] border border-white/[0.12] rounded text-xs text-zinc-200 font-mono">{k}</kbd></dt>
              <dd className="text-zinc-300">{v}</dd>
            </div>
          ))}
        </dl>
        <h3 className="font-bold text-zinc-100 mt-5 mb-1">Map navigation</h3>
        <p className="text-sm text-zinc-400">Drag to pan, scroll or pinch to zoom at the cursor, right-drag (or Ctrl+drag) to turn and tilt, Shift+drag to select, double-click to zoom in.</p>
        <h3 className="font-bold text-zinc-100 mt-4 mb-1">Credits</h3>
        <p className="text-xs text-zinc-500">Imagery © Esri, Maxar, Earthstar Geographics. Map data © OpenStreetMap contributors (and OpenFreeMap, OpenMapTiles). Elevation: USGS 3DEP and AWS Terrain Tiles (Mapzen).</p>
      </div>
    </div>
  );
}

function ContextMenu({ info, onClose }: { info: { clientX: number; clientY: number; itemId: string | null; ground: P | null; under?: string | null }; onClose: () => void }) {
  const doc = getDoc();
  const hole = doc.holes.find(h => h.id === info.itemId);
  const item = doc.items.find(i => i.id === info.itemId);
  useEffect(() => {
    const close = () => onClose();
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", esc);
    return () => { window.removeEventListener("pointerdown", close); window.removeEventListener("keydown", esc); };
  }, [onClose]);
  // (a tree measured from the air standing there)
  // (every tree the click passed through, nearest first: a sprout under a big crown is there too)
  const trees = getView()?.treesAtScreen(info.clientX, info.clientY) ?? [];
  if (!trees.length && info.ground) { const t = getView()?.treeAt(info.ground); if (t) trees.push(t); }
  const tree = trees[0] ?? null;
  const under = info.under ? doc.items.find(i => i.id === info.under) : undefined;
  const underHole = info.under ? doc.holes.find(h => h.id === info.under) : undefined;
  if (!hole && !item && !tree && !(canPaste() && info.ground)) return null;
  const x = Math.min(info.clientX, window.innerWidth - 220), y = Math.min(info.clientY, window.innerHeight - 200);
  const row = "w-full text-left px-3 py-1.5 text-sm text-zinc-200 hover:bg-white/[0.09]";
  const run = (fn: () => void) => () => { fn(); onClose(); };
  const holeId = hole?.id ?? (item && "holeId" in item ? item.holeId : undefined);
  // (on one of the things picked together: for all of them)
  const group = useEditor.getState().group;
  const inGroup = !!item && group.includes(item.id);
  return (
    <div className="fixed z-50 w-52 glass rounded-xl shadow-xl shadow-black/40 ring-1 ring-white/10 py-1" style={{ left: x, top: y }} role="menu" onPointerDown={e => e.stopPropagation()}>
      {holeId && holeStats(doc, doc.holes.find(h => h.id === holeId)!).complete && (
        <>
          <button className={row} role="menuitem" onClick={run(() => useEditor.getState().set({ teeView: holeId, flyover: false }))}>View from the tee</button>
          <button className={row} role="menuitem" onClick={run(() => useEditor.getState().set({ teeView: holeId, flyover: true }))}>Fly over the hole</button>
        </>
      )}
      {item && (item.type === "area" && item.kind === "water" || item.type === "line" && item.kind !== "ob" && item.kind !== "walk") && (
        <button className={row} role="menuitem" onClick={run(() => updateItem(item.id, (item.ob === true ? { ob: undefined, obBeyond: undefined, obHoles: undefined, obStretches: undefined } : { ob: true }) as Partial<CourseItem>))}>{item.ob === true ? "Remove the red OB edge" : "Mark as OB (red edge)"}</button>
      )}
      {item?.type === "line" && item.kind !== "ob" && item.kind !== "walk" && (
        <>
          {!(item.ob === true && item.obBeyond) && <button className={row} role="menuitem" onClick={run(() => markObBeyond(item.id))}>Mark as OB and beyond</button>}
          {info.ground && <button className={row} role="menuitem" onClick={run(() => { getView()?.startObPick(item.id, info.ground!); useEditor.getState().set({ obPick: item.id, pickCut: false, tool: "select" }); })}>OB stretch from here</button>}
        </>
      )}
      {item?.type === "line" && !item.locked && info.ground && <button className={row} role="menuitem" onClick={run(() => { getView()?.startObPick(item.id, info.ground!, true); useEditor.getState().set({ obPick: item.id, pickCut: true, tool: "select" }); })}>Remove a stretch from here</button>}
      {trees.map((t, n) => {
        const label = t.kind === "measured" ? (() => { const g = doc.lidar?.trees[t.k]; const h = g ? grownTree(g, doc.lidar?.growYears ?? 0)[2] : 0; return `Measured tree · ${Math.round(h)} ft`; })()
          : `${t.height < 25 ? "Sapling" : "Planted tree"} · ${Math.round(t.height)} ft`;
        return (
          <div key={n} className={n ? "border-t border-white/[0.08] mt-1 pt-1" : ""} data-testid="tree-menu-tree">
            <div className="px-3 pt-1 pb-0.5 text-[11px] text-zinc-500">{n === 0 && trees.length > 1 ? `${label} · in front` : label}</div>
            <button className={row} role="menuitem" onClick={run(() => { const look = getView()?.lookOf(t) ?? null; if (t.kind === "measured") adoptLidarTree(t.k, look); else adoptTreeAt(t, look); })} data-testid="tree-adopt">Edit this tree (height, place…)</button>
            <button className={row} role="menuitem" onClick={run(() => (t.kind === "measured" ? getView()?.toggleLidarTree(t.k) : cutTreeAt(t)))} data-testid="tree-cut">Cut down this tree</button>
          </div>
        );
      })}
      {tree && under && <button className={`${row} border-t border-white/[0.08]`} role="menuitem" onClick={run(() => select(under.id))} data-testid="tree-select-under">Select the {under.type === "area" ? (under.kind === "woods" ? "woods" : "area") : under.type === "line" ? "line" : "structure"}</button>}
      {tree && underHole && <button className={`${row} border-t border-white/[0.08]`} role="menuitem" onClick={run(() => select(underHole.id))} data-testid="tree-select-under">Select hole {holeLabel(doc, underHole.id)}</button>}
      {(hole || item) && <button className={row} role="menuitem" onClick={run(() => { if (!inGroup) select(info.itemId); copySelection(); })}>{inGroup ? `Copy ${group.length}` : "Copy"}</button>}
      {canPaste() && info.ground && <button className={row} role="menuitem" onClick={run(() => pasteClipboard(info.ground))}>Paste here</button>}
      {(hole || item) && <button className={row} role="menuitem" onClick={run(() => { if (!inGroup) select(info.itemId); duplicateSelection(); })}>{inGroup ? `Duplicate ${group.length}` : "Duplicate"}</button>}
      {item && !inGroup && <button className={row} role="menuitem" onClick={run(() => updateItem(item.id, { locked: !item.locked } as Partial<CourseItem>))}>{item.locked ? "Unlock" : "Lock in place"}</button>}
      {(hole || item) && <button className={`${row} text-red-300`} role="menuitem" onClick={run(() => { if (!inGroup) select(info.itemId); deleteSelection(); })}>{inGroup ? `Delete ${group.length}` : "Delete"}</button>}
    </div>
  );
}

export default function App() {
  const ed = useEditor();
  // (view only: no tools to change the course with)
  const readOnly = useCourse(s => s.readOnly);
  const layout = useLayout();
  const doc = useCourse(s => s.doc);
  const [findSite, setFindSite] = useState(false);
  const [help, setHelp] = useState(false);
  const [goTo, setGoTo] = useState(false);
  const [menu, setMenu] = useState<{ clientX: number; clientY: number; itemId: string | null; ground: P | null; under?: string | null } | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const stop = startAutosave();
    void (async () => {
      await restoreAutosave();
      setReady(true);
    })();
    return stop;
  }, []);

  const onImported = (site: ImportedSite) => {
    // What was designed stays on the same ground when the frame grows, shrinks or moves
    const d0 = getDoc();
    const from = geoRefOf(d0);
    // (OpenStreetMap out of reach this time: what it brought in before stays)
    const keptOsm = (i: CourseItem) => !!site.osmFailed && (i.type === "area" || i.type === "line" || i.type === "structure") && i.importSource === "osm";
    const designed = d0.items.filter(i => !isImported(i) || keptOsm(i));
    const carried = from && site.site.bounds ? reframeDesign({ holes: d0.holes, items: designed }, from, { ...site.site.bounds, ...site.canvas }) : { holes: d0.holes, items: designed, outside: 0 };
    changeDoc(d => ({
      canvas: site.canvas,
      gridSize: site.gridSize,
      terrainHeights: site.terrainHeights,
      background: site.background,
      site: site.site,
      groundPaint: {},
      name: d.name === "New Disc Golf Course" && site.site.location ? `${site.site.location.label.split(",")[0]} Disc Golf Course` : d.name,
      holes: carried.holes,
      items: [...carried.items, ...site.mapped, ...site.trees],
      lidar: site.lidar
    }));
    setFindSite(false);
    useEditor.getState().set({ step: "holes", tool: getDoc().holes.length ? "select" : "add-hole" });
    setTimeout(() => getView()?.fitSite(), 50);
    const outside = carried.outside ? ` ${carried.outside} ${carried.outside === 1 ? "thing you drew is" : "things you drew are"} now past the site's edges.` : "";
    toast(`Site brought in. ${site.notes.join(" ")}${outside}`, "success", false, { label: "View in 3D", run: () => useEditor.getState().set({ view: "3d" }) }, 12000);
    if (site.osmFailed) osmFailedToast();
  };

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      // Keys go to text fields; sliders, checkboxes and color pickers keep the shortcuts (except
      // the keys a slider uses itself)
      const input = target.tagName === "INPUT" ? (target as HTMLInputElement) : null;
      const textual = !!target.closest?.("textarea,select,[contenteditable=true]") || (!!input && !["range", "checkbox", "radio", "color", "button"].includes(input.type));
      if (textual) return;
      if (input?.type === "range" && /^(Arrow|Home|End|Page)/.test(e.key)) return;
      const s = useEditor.getState();
      const view = getView();
      // (AltGr, which types [ and ] on many keyboards, comes as Ctrl+Alt on Windows: not a shortcut)
      const mod = (e.ctrlKey || e.metaKey) && !(e.ctrlKey && e.altKey) && !e.getModifierState?.("AltGraph");
      if (mod && e.key.toLowerCase() === "k") { e.preventDefault(); setGoTo(g => !g); return; }
      if (mod && e.key.toLowerCase() === "z") { e.preventDefault(); if (e.shiftKey) useCourse.getState().redo(); else useCourse.getState().undo(); return; }
      if (mod && e.key.toLowerCase() === "y") { e.preventDefault(); useCourse.getState().redo(); return; }
      if (mod && e.key.toLowerCase() === "d") { e.preventDefault(); if (s.step !== "design") duplicateSelection(); return; }
      if (mod && e.key.toLowerCase() === "c" && !s.teeView && s.step !== "design") { if (copySelection()) e.preventDefault(); return; }
      if (mod && e.key.toLowerCase() === "x" && !s.teeView && s.step !== "design") { e.preventDefault(); cutSelection(); return; }
      if (mod && e.key.toLowerCase() === "v" && !s.teeView && s.step !== "design") { e.preventDefault(); s.set({ tool: "select" }); pasteClipboard(); return; }
      if (mod && e.key.toLowerCase() === "a" && !s.teeView && s.step !== "design") { e.preventDefault(); s.set({ tool: "select" }); selectAll(); return; }
      if (mod) return;
      // (AltGr types characters: only the [ and ] it types go on to the shortcuts)
      if (((e.ctrlKey && e.altKey) || e.getModifierState?.("AltGraph")) && e.key !== "[" && e.key !== "]") return;
      if (s.teeView) {
        if (e.key === "Escape") s.set({ teeView: null, flyover: false });
        if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
          const d = getDoc();
          const stats = courseStats(d);
          const done = d.holes.filter((_, k) => stats[k].complete);
          const i = done.findIndex(h => h.id === s.teeView);
          const next = done[(i + (e.key === "ArrowLeft" ? -1 : 1) + done.length) % done.length];
          if (next) s.set({ teeView: next.id });
        }
        return;
      }
      if (e.key === "Escape") {
        if (view?.cancelDrawing()) return;
        if (s.tool !== "select") { s.set({ tool: "select" }); return; }
        if (s.selectedId || s.group.length) { select(null); return; }
        return;
      }
      if (e.key === "Enter") {
        if (view?.finishDrawing()) return;
        const d = getDoc();
        const hole = d.holes.find(h => h.id === s.selectedId) ?? d.holes.find(h => h.id === s.activeHoleId);
        if (hole && holeStats(d, hole).complete) s.set({ teeView: hole.id, flyover: false });
        return;
      }
      // (on the Design page, these keys are the page's: the map's selection isn't seen there)
      if (s.step === "design" && (e.key === "Backspace" || e.key === "Delete" || e.key.startsWith("Arrow"))) return;
      if (e.key === "Backspace" || e.key === "Delete") {
        if (e.key === "Backspace" && view?.undoPoint()) { e.preventDefault(); return; }
        if (s.selectedId || s.group.length) { e.preventDefault(); deleteSelection(); }
        return;
      }
      if (e.key.startsWith("Arrow") && (s.selectedId || s.group.length)) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        nudgeSelection(e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0, e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0);
        return;
      }
      if (e.key === "?") { setHelp(h => !h); return; }
      if (e.key === "/") { e.preventDefault(); setGoTo(true); return; }
      if ((e.key === "[" || e.key === "]") && s.step !== "design") { stepHole(e.key === "[" ? -1 : 1); return; }
      if (e.key === "2") { s.set({ view: "2d" }); return; }
      if (e.key === "3") { s.set({ view: "3d" }); return; }
      if (e.key === "0") { view?.fitCourse(); return; }
      if (e.key === "+" || e.key === "=") { view?.zoomBy(1.4); return; }
      if (e.key === "-" || e.key === "_") { view?.zoomBy(1 / 1.4); return; }
      const k = e.key.toUpperCase();
      if (k === "F") { if (s.selectedId) { const d = getDoc(); if (d.holes.some(h => h.id === s.selectedId)) view?.fitHole(s.selectedId); else view?.reveal(s.selectedId); } return; }
      if (k === "Q") { view?.rotateBy(-30); return; }
      if (k === "E") { view?.rotateBy(30); return; }
      if (k === "N") { view?.resetNorth(); return; }
      const tool = TOOLS.find(t => t.key === k);
      if (tool) s.set({ tool: tool.mode });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const empty = useMemo(() => !doc.background && !doc.holes.length && !doc.items.length, [doc]);
  const showWelcome = ready && empty && ed.step === "site";
  const onContextMenu = (i: { clientX: number; clientY: number; itemId: string | null; ground: P | null; under?: string | null }) => setMenu(i);
  const welcome = (
    <div className="pointer-events-auto glass backdrop-blur rounded-2xl shadow-2xl ring-1 ring-white/10 p-6 w-[440px] max-w-full text-center" data-testid="welcome">
      <div className="w-12 h-12 rounded-xl bg-orange-500/15 text-orange-400 flex items-center justify-center mx-auto mb-3"><Route size={24} /></div>
      <h2 className="text-xl font-bold text-zinc-50">Design your disc golf course</h2>
      <div className="mt-4 flex flex-col gap-2">
        <Button tone="primary" full onClick={() => setFindSite(true)} testid="welcome-find"><MapPinned size={16} /> Find your park</Button>
        <Button full onClick={() => useEditor.getState().set({ step: "holes", tool: "add-hole" })} testid="welcome-blank">Start on open ground</Button>
      </div>
    </div>
  );
  const dialogs = (
    <>
      {findSite && <SiteImportDialog onClose={() => setFindSite(false)} onImported={onImported} />}
      {help && <HelpDialog onClose={() => setHelp(false)} />}
      {goTo && <GoTo onClose={() => setGoTo(false)} onHelp={() => setHelp(true)} />}
    </>
  );

  if (layout !== "desktop") {
    return (
      <>
        <CompactShell
          layout={layout}
          onFindSite={() => setFindSite(true)}
          onHelp={() => setHelp(true)}
          onContextMenu={onContextMenu}
          welcome={showWelcome ? welcome : null}
          toasts={bottom => <Toasts bottom={bottom} />}
        />
        {dialogs}
        {menu?.itemId && <ItemMenu itemId={menu.itemId} onClose={() => setMenu(null)} />}
        {menu && !menu.itemId && menu.ground && <ContextMenu info={menu} onClose={() => setMenu(null)} />}
      </>
    );
  }

  return (
    <div className="h-screen w-screen flex flex-col bg-zinc-950 text-zinc-100 overflow-hidden relative isolate">
      <Woods />
      <Header onHelp={() => setHelp(true)} onGoTo={() => setGoTo(true)} />
      <div className="flex-1 flex min-h-0 gap-2.5 p-2.5 relative">
        {readOnly ? <ViewerPanel /> : <SidePanel onFindSite={() => setFindSite(true)} />}
        <main className="flex-1 relative min-w-0 rounded-[20px] overflow-hidden ring-1 ring-white/10">
          <MapViewport onContextMenu={onContextMenu} />
          {ed.step === "design" && !ed.teeView && <MapDesigner />}
          {ed.step !== "design" && !readOnly && <Toolbar />}
          {ed.step !== "design" && !readOnly && <Inspector />}
          {ed.teeView && <TeeViewHud />}
          <ExportProgressPill />
          <Toasts />
          {showWelcome && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
              {welcome}
            </div>
          )}
        </main>
      </div>
      {dialogs}
      {menu && <ContextMenu info={menu} onClose={() => setMenu(null)} />}
    </div>
  );
}
