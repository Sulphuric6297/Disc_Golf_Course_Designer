// The app: header with the steps, the step panel, the map (2D and 3D in one view), the tools, the
// inspector for the selection, and the dialogs.
import { usePageToasts } from "./auth/Home";
import { SHOW_EVENT } from "./components/showSetting";
import { inDraft, saveDraftAs, saveNow, useServerCourse } from "./auth/courses";
import { SERVER } from "./auth/api";
import { HelpGuide } from "./components/help/HelpGuide";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { MapPinned, Route, X } from "lucide-react";
import { Header } from "./components/Header";
import { ViewerPanel } from "./auth/ViewerPanel";
import { HolesColumn, ProblemsPanel, SidePanel } from "./components/SidePanel";
import { MapViewport } from "./components/MapViewport";
import { getView } from "./state/view";
import { Toolbar, TOOLS, CHOICE_KEYS, drawChoice, pickTool, useMapInsets, useToolbarRoom } from "./components/Toolbar";
import { treeActions, treesAt, treeTitle, underAction } from "./components/treeActions";
import { startTour } from "./components/Tour";
import { Inspector } from "./components/Inspector";
import { stepHole } from "./components/HoleSteps";
import { GoTo } from "./components/GoTo";
import { SiteImportDialog } from "./components/SiteImportDialog";
import { TeeViewHud } from "./components/TeeViewHud";
import { CameraHud } from "./components/CameraHud";
import { MapDesigner } from "./components/MapDesigner";
import { ExportProgressPill } from "./components/ExportProgress";
import { Button, HELP_EVENT } from "./components/ui";
import { GettingStarted, openGettingStarted } from "./components/GettingStarted";
import { useLayout, useTouch } from "./components/useLayout";
import { CompactShell, GroundMenu, ItemMenu } from "./components/mobile/CompactShell";
import { useCourse, useEditor, getDoc, changeDoc, updateItem } from "./state/course";
import { bendHoleAt, placeAt, canPaste, copySelection, cutSelection, deleteSelection, duplicateSelection, markObBeyond, nudgeSelection, pasteClipboard, select, selectAll } from "./state/actions";
import { osmFailedToast } from "./state/osm";
import { restoreAutosave, startAutosave } from "./state/files";
import { toast, useToasts } from "./state/toast";
import { courseStats, holeStats } from "./lib/holeStats";
import { fromMaps, isImported, reframeDesign, type ImportedSite } from "./lib/importSite";
import { holeLabel } from "./lib/course";
import { geoRefOf, reframe } from "./lib/geoRef";
import { Woods } from "./components/Woods";
import type { CourseItem, P } from "./types";

const NO_TOASTS: ReturnType<typeof useToasts.getState>["toasts"] = [];
function Toasts({ bottom }: { bottom?: number }) {
  // (a Courses page up over the editor: its own show them)
  const paged = usePageToasts(s => s.on);
  const all = useToasts(s => s.toasts);
  const toasts = paged ? NO_TOASTS : all;
  const dismiss = useToasts(s => s.dismiss);
  const undo = useCourse(s => s.undo);
  // (on a computer: just above the tools, with their options and hint, and centred on the part of
  // the map the panels leave clear)
  const tools = useToolbarRoom(s => s.height);
  const inset = useMapInsets();
  return (
    <div className={`absolute flex flex-col items-center gap-2 z-40 pointer-events-none ${bottom !== undefined ? "left-1/2 -translate-x-1/2 w-max max-w-[calc(100%-16px)]" : ""}`} style={bottom !== undefined ? { bottom } : { bottom: tools ? 16 + tools + 10 : 120, left: inset.left, right: inset.right }}>
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


function ContextMenu({ info, onClose }: { info: { clientX: number; clientY: number; itemId: string | null; ground: P | null; under?: string | null }; onClose: () => void }) {
  const doc = getDoc();
  const hole = doc.holes.find(h => h.id === info.itemId);
  const item = doc.items.find(i => i.id === info.itemId);
  useEffect(() => {
    const close = () => onClose();
    // (Esc closes the menu, and only the menu: the tool and the selection stay)
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } };
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", esc, true);
    return () => { window.removeEventListener("pointerdown", close); window.removeEventListener("keydown", esc, true); };
  }, [onClose]);
  // Where it opens: down and right of the pointer, or up or left of it where there's no room
  // (measured once drawn; a screen too short for it scrolls it)
  const box = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState<{ left: number; top: number } | null>(null);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const w = el.offsetWidth, h = el.offsetHeight;
    setAt({
      left: info.clientX + w + 8 > window.innerWidth ? Math.max(8, info.clientX - w) : info.clientX,
      top: info.clientY + h + 8 > window.innerHeight ? Math.max(8, info.clientY - h) : info.clientY
    });
  }, [info.clientX, info.clientY]);
  // (every tree the click passed through, nearest first: a sprout under a big crown is there too;
  // and what the tree stands over, to pick instead)
  const readOnly = useCourse.getState().readOnly;
  const trees = readOnly ? [] : treesAt(info.clientX, info.clientY, info.ground);
  const tree = trees[0] ?? null;
  const under = tree ? underAction(doc, info.under) : null;
  // On open ground: what can start there (a tee or pin for the hole being worked on, a turn in
  // its line, a new hole, measuring), as a long press on a phone's map offers
  const ed = useEditor.getState();
  const working = !hole && !item && info.ground && !readOnly ? doc.holes.find(h => h.id === (ed.activeHoleId ?? ed.selectedId)) : undefined;
  // (not on a tree standing over something: that's the tree's menu)
  const here = !hole && !item && !info.under && !!info.ground && !readOnly && ed.step === "design";
  if (!hole && !item && !tree && !here && !(canPaste() && info.ground)) return null;
  const row = "w-full text-left px-3 py-1.5 touch:py-3 touch:text-[15px] text-sm text-zinc-200 hover:bg-white/[0.09]";
  const toolThen = (tool: "add-hole" | "measure", then: (p: P) => void) => () => {
    useEditor.getState().set({ tool });
    const p = info.ground!;
    requestAnimationFrame(() => requestAnimationFrame(() => then(p)));
    onClose();
  };
  const run = (fn: () => void) => () => { fn(); onClose(); };
  const holeId = hole?.id ?? (item && "holeId" in item ? item.holeId : undefined);
  // (on one of the things picked together: for all of them)
  const group = useEditor.getState().group;
  const inGroup = !!item && group.includes(item.id);
  // (copied: said, with how to paste it)
  const copy = () => { if (!inGroup) select(info.itemId); if (copySelection()) toast("Copied. Ctrl+V pastes it where the pointer is, or right-click and Paste here."); };
  const done = !!holeId && holeStats(doc, doc.holes.find(h => h.id === holeId)!).complete;
  return (
    <div ref={box} className="fixed z-50 w-52 touch:w-56 max-h-[calc(100dvh-16px)] overflow-y-auto glass-solid rounded-xl touch:rounded-2xl shadow-xl shadow-black/40 ring-1 ring-white/10 py-1" style={at ?? { left: info.clientX, top: info.clientY, visibility: "hidden" }} role="menu" onPointerDown={e => e.stopPropagation()} data-testid="map-menu">
      {here && (
        <div className={trees.length || canPaste() ? "border-b border-white/[0.08] mb-1 pb-1" : ""} data-testid="map-menu-here">
          {working && <div className="px-3 pt-1 pb-0.5 text-[11px] text-zinc-500">Hole {holeLabel(doc, working.id)}</div>}
          {working && <button className={row} role="menuitem" onClick={run(() => placeAt("add-tee", info.ground!))}>Add a tee here</button>}
          {working && <button className={row} role="menuitem" onClick={run(() => placeAt("add-basket", info.ground!))}>Add a pin here</button>}
          {working && holeStats(doc, working).complete && <button className={row} role="menuitem" onClick={run(() => bendHoleAt(working.id, info.ground!))}>Bend the hole here</button>}
          <button className={row} role="menuitem" onClick={toolThen("add-hole", p => getView()?.toolPoint(p))}>New hole, tee here</button>
          <button className={row} role="menuitem" onClick={toolThen("measure", p => getView()?.measureFrom(p))}>Measure from here</button>
        </div>
      )}
      {holeId && done && (
        <>
          {/* (a tee: the view from that one, whatever color the layout plays) */}
          <button className={row} role="menuitem" onClick={run(() => useEditor.getState().set({ teeView: holeId, teeViewTee: item?.type === "tee" ? item.id : null, flyover: false }))}>{item?.type === "tee" ? "View from this tee" : "View from the tee"}</button>
          <button className={row} role="menuitem" onClick={run(() => useEditor.getState().set({ teeView: holeId, flyover: true }))}>Fly over the hole</button>
        </>
      )}
      {/* (on the hole's own line: a turn in it there) */}
      {hole && done && info.ground && !readOnly && <button className={row} role="menuitem" onClick={run(() => bendHoleAt(hole.id, info.ground!))}>Bend the hole here</button>}
      {item && (item.type === "area" && item.kind !== "ob" || item.type === "line" && item.kind !== "ob" && item.kind !== "walk") && (
        <button className={row} role="menuitem" onClick={run(() => updateItem(item.id, (item.ob === true ? { ob: undefined, obBeyond: undefined, obHoles: undefined, obStretches: undefined } : { ob: true }) as Partial<CourseItem>))}>{item.ob === true ? "Remove the red OB edge" : "Mark as OB (red edge)"}</button>
      )}
      {item?.type === "line" && item.kind !== "ob" && item.kind !== "walk" && !(item.ob === true && item.obBeyond) && <button className={row} role="menuitem" onClick={run(() => markObBeyond(item.id))}>Mark as OB and beyond</button>}
      {item && (item.type === "line" && item.kind !== "ob" && item.kind !== "walk" || item.type === "area" && item.kind !== "ob") && info.ground && (
        <button className={row} role="menuitem" onClick={run(() => { getView()?.startObPick(item.id, info.ground!); useEditor.getState().set({ obPick: item.id, pickCut: false, tool: "select" }); })}>{item.type === "area" ? "OB along the edge from here" : "OB stretch from here"}</button>
      )}
      {item?.type === "line" && !item.locked && info.ground && <button className={row} role="menuitem" onClick={run(() => { getView()?.startObPick(item.id, info.ground!, true); useEditor.getState().set({ obPick: item.id, pickCut: true, tool: "select" }); })}>Remove a stretch from here</button>}
      {trees.map((t, n) => {
        const label = treeTitle(doc, t);
        return (
          <div key={n} className={n ? "border-t border-white/[0.08] mt-1 pt-1" : ""} data-testid="tree-menu-tree">
            <div className="px-3 pt-1 pb-0.5 text-[11px] text-zinc-500">{n === 0 && trees.length > 1 ? `${label} · in front` : label}</div>
            {treeActions(t).map(a => <button key={a.testid} className={row} role="menuitem" onClick={run(a.run)} data-testid={a.testid}>{a.label}</button>)}
          </div>
        );
      })}
      {under && <button className={`${row} border-t border-white/[0.08]`} role="menuitem" onClick={run(under.run)} data-testid={under.testid}>{under.label}</button>}
      {(hole || item) && <button className={row} role="menuitem" onClick={run(copy)}>{inGroup ? `Copy ${group.length}` : "Copy"}</button>}
      {canPaste() && info.ground && <button className={row} role="menuitem" onClick={run(() => pasteClipboard(info.ground))}>Paste here</button>}
      {(hole || item) && <button className={row} role="menuitem" onClick={run(() => { if (!inGroup) select(info.itemId); duplicateSelection(); })}>{inGroup ? `Duplicate ${group.length}` : "Duplicate"}</button>}
      {item && !inGroup && <button className={row} role="menuitem" onClick={run(() => updateItem(item.id, { locked: !item.locked } as Partial<CourseItem>))}>{item.locked ? "Unlock" : "Lock in place"}</button>}
      {(hole || item) && <button className={`${row} text-red-300`} role="menuitem" onClick={run(() => { if (!inGroup) select(info.itemId); deleteSelection(); })}>{inGroup ? `Delete ${group.length}` : "Delete"}</button>}
    </div>
  );
}

/** Ctrl+S: saved now (a draft into its history too), and said so. */
function saveByHand() {
  if (!SERVER) { toast("Saved. Your work saves by itself in this browser.", "success"); return; }
  if (useCourse.getState().readOnly) { toast("This course is view only.", "info"); return; }
  const draft = inDraft();
  void (draft ? saveDraftAs("") : saveNow()).then(
    () => { if (useServerCourse.getState().status === "saved") toast(draft ? "Saved to your draft." : "Saved.", "success"); else toast("Not saved yet: see the save status in the top bar.", "error"); },
    e => toast(`Couldn't save: ${e instanceof Error ? e.message : "try again"}.`, "error")
  );
}

export default function App() {
  const ed = useEditor();
  // (view only: no tools to change the course with)
  const readOnly = useCourse(s => s.readOnly);
  const layout = useLayout();
  const doc = useCourse(s => s.doc);
  const [findSite, setFindSite] = useState(false);
  useEffect(() => {
    const on = (e: Event) => { if ((e as CustomEvent).detail === "find-site") setFindSite(true); };
    window.addEventListener(SHOW_EVENT, on);
    return () => window.removeEventListener(SHOW_EVENT, on);
  }, []);
  // (the help guide, open at a topic when one is asked for)
  const [help, setHelp] = useState<false | { topic?: string }>(false);
  useEffect(() => {
    const on = (e: Event) => setHelp({ topic: (e as CustomEvent).detail });
    window.addEventListener(HELP_EVENT, on);
    return () => window.removeEventListener(HELP_EVENT, on);
  }, []);
  const touchUi = useTouch();
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
    const keptOsm = (i: CourseItem) => !!site.osmFailed && fromMaps(i);
    const designed = d0.items.filter(i => !isImported(i) || keptOsm(i));
    const carried = from && site.site.bounds ? reframeDesign({ holes: d0.holes, items: designed }, from, { ...site.site.bounds, ...site.canvas }) : { holes: d0.holes, items: designed, outside: 0 };
    changeDoc(d => ({
      canvas: site.canvas,
      gridSize: site.gridSize,
      terrainHeights: site.terrainHeights,
      terrainOriginal: undefined,
      background: site.background,
      site: site.site,
      groundPaint: {},
      // (named for the park only when one was found by name)
      name: d.name === "New Disc Golf Course" && site.site.location?.label ? `${site.site.location.label.split(",")[0]} Disc Golf Course` : d.name,
      // (the trees cut down stay cut, on the same spot on the ground)
      cutTrees: from && site.site.bounds ? d.cutTrees?.map(reframe(from, { ...site.site.bounds, ...site.canvas })) : d.cutTrees,
      holes: carried.holes,
      items: [...carried.items, ...site.mapped, ...site.trees],
      lidar: site.lidar
    }));
    setFindSite(false);
    useEditor.getState().set({ step: "design", tool: "select" });
    setTimeout(() => getView()?.fitSite(), 50);
    const outside = carried.outside ? ` ${carried.outside} ${carried.outside === 1 ? "thing you drew is" : "things you drew are"} now past the site's edges.` : "";
    // (what came in is listed on the Site step)
    toast(`Site brought in.${outside}`, "success", false, { label: "View in 3D", run: () => useEditor.getState().set({ view: "3d" }) }, 12000);
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
      // (while drawing, the last point first, as Backspace does)
      if (mod && e.key.toLowerCase() === "z") { e.preventDefault(); if (e.shiftKey) useCourse.getState().redo(); else if (!view?.undoPoint()) useCourse.getState().undo(); return; }
      if (mod && e.key.toLowerCase() === "y") { e.preventDefault(); useCourse.getState().redo(); return; }
      // (Ctrl+S: your draft saved now, into the history; out of a draft, saved now)
      if (mod && e.key.toLowerCase() === "s") { e.preventDefault(); saveByHand(); return; }
      if (mod && e.key.toLowerCase() === "d") { e.preventDefault(); if (s.step !== "map") duplicateSelection(); return; }
      if (mod && e.key.toLowerCase() === "c" && !s.teeView && s.step !== "map") { if (copySelection()) { e.preventDefault(); toast("Copied. Ctrl+V pastes it where the pointer is."); } return; }
      if (mod && e.key.toLowerCase() === "x" && !s.teeView && s.step !== "map") { e.preventDefault(); cutSelection(); return; }
      // (where the pointer is over the map; off it, next to where it was copied from)
      if (mod && e.key.toLowerCase() === "v" && !s.teeView && s.step !== "map") { e.preventDefault(); s.set({ tool: "select" }); pasteClipboard(view?.pointerGround()); return; }
      if (mod && e.key.toLowerCase() === "a" && !s.teeView && s.step !== "map") { e.preventDefault(); s.set({ tool: "select" }); selectAll(); return; }
      if (mod) return;
      // (AltGr types characters: only the [ and ] it types go on to the shortcuts)
      if (((e.ctrlKey && e.altKey) || e.getModifierState?.("AltGraph")) && e.key !== "[" && e.key !== "]") return;
      if (s.teeView) {
        // (Esc stops a flight first, back at the tee; then leaves the tee view)
        if (e.key === "Escape") s.set(s.flyover ? { flyover: false } : { teeView: null, flyover: false });
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
        if (s.problemsOpen) { s.set({ problemsOpen: false }); return; }
        if (s.tool !== "select") { s.set({ tool: "select" }); return; }
        if (s.selectedId || s.group.length) { select(null); return; }
        return;
      }
      if (e.key === "Enter") {
        if (view?.finishDrawing()) { e.preventDefault(); return; }
        // (a shape begun but too short to finish: the drawing says so itself)
        if (s.drawPoints > 0) return;
        // (on a button, a link or a menu row reached with the keyboard, Enter is that control's)
        if (target.closest?.("button,a,summary,[role=button],[role=menuitem],[role=option],[role=radio],[role=tab]") && target.matches?.(":focus-visible")) return;
        // The view from the tee: of the hole picked, or of the tee or basket picked (from that tee);
        // a button just clicked (a hole's row, say) isn't pressed again by it
        const d = getDoc();
        const it = d.items.find(i => i.id === s.selectedId);
        const holeId = d.holes.some(h => h.id === s.selectedId) ? s.selectedId : it && (it.type === "tee" || it.type === "basket") ? it.holeId : null;
        const hole = d.holes.find(h => h.id === holeId);
        if (hole && holeStats(d, hole).complete) { e.preventDefault(); s.set({ teeView: hole.id, teeViewTee: it?.type === "tee" ? it.id : null, flyover: false }); }
        return;
      }
      // (on the Design page, these keys are the page's: the map's selection isn't seen there)
      if (s.step === "map" && (e.key === "Backspace" || e.key === "Delete" || e.key.startsWith("Arrow"))) return;
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
      if (e.key === "?") { setHelp(h => (h ? false : {})); return; }
      if (e.key === "/") { e.preventDefault(); setGoTo(true); return; }
      if ((e.key === "[" || e.key === "]") && s.step !== "map") { stepHole(e.key === "[" ? -1 : 1); return; }
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
      // (the tools' letters: only where the tools are, not on the Map and Export pages)
      if (s.step === "map" || s.step === "export") return;
      const choice = CHOICE_KEYS[k] ? TOOLS.flatMap(t => t.choices ?? []).find(c => c.id === CHOICE_KEYS[k]) : undefined;
      if (choice) { drawChoice(choice, false); return; }
      const tool = TOOLS.find(t => t.key === k);
      if (tool) pickTool(tool);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const empty = useMemo(() => !doc.background && !doc.holes.length && !doc.items.length, [doc]);
  const showWelcome = ready && empty && ed.step === "site";
  const onContextMenu = (i: { clientX: number; clientY: number; itemId: string | null; ground: P | null; under?: string | null }) => setMenu(i);
  const welcome = (
    <div className="pointer-events-auto glass-solid rounded-2xl shadow-2xl ring-1 ring-white/10 p-6 w-[440px] max-w-full text-center" data-testid="welcome">
      <div className="w-12 h-12 rounded-xl bg-orange-500/15 text-orange-400 flex items-center justify-center mx-auto mb-3"><Route size={24} /></div>
      <h2 className="text-xl font-bold text-zinc-50">Design your disc golf course</h2>
      <div className="mt-4 flex flex-col gap-2">
        <Button tone="primary" full onClick={() => setFindSite(true)} testid="welcome-find"><MapPinned size={16} /> Find your park</Button>
        <Button full onClick={() => useEditor.getState().set({ step: "design", tool: "add-hole" })} testid="welcome-blank">Start on open ground</Button>
      </div>
      <button className="mt-3 text-[13px] font-semibold text-orange-300 hover:text-orange-200 touch:min-h-[44px]" onClick={() => (SERVER ? openGettingStarted() : void startTour())} data-testid="welcome-tour">{SERVER ? "New here? Open Getting started" : "New here? Show me around"}</button>
    </div>
  );
  const dialogs = (
    <>
      {findSite && <SiteImportDialog onClose={() => setFindSite(false)} onImported={onImported} />}
      {help && <HelpGuide onClose={() => setHelp(false)} topic={help.topic} touch={touchUi} />}
      {goTo && <GoTo onClose={() => setGoTo(false)} onHelp={topic => setHelp({ topic })} />}
    </>
  );

  if (layout !== "desktop") {
    return (
      <>
        <CompactShell
          layout={layout}
          onFindSite={() => setFindSite(true)}
          onHelp={() => setHelp({})}
          onGoTo={() => setGoTo(true)}
          onContextMenu={onContextMenu}
          welcome={showWelcome ? welcome : null}
          toasts={bottom => <Toasts bottom={bottom} />}
        />
        {dialogs}
        {menu?.itemId && <ItemMenu itemId={menu.itemId} at={menu} onClose={() => setMenu(null)} />}
        {menu && !menu.itemId && menu.ground && <GroundMenu info={menu} onClose={() => setMenu(null)} />}
      </>
    );
  }

  return (
    <div className="h-screen w-screen flex flex-col bg-zinc-950 text-zinc-100 overflow-hidden relative isolate">
      <Woods />
      <Header onHelp={() => setHelp({})} onGoTo={() => setGoTo(true)} />
      {!ed.teeView && <div className="fixed inset-0 pointer-events-none z-30"><div className="relative w-full h-full"><GettingStarted /></div></div>}
      <div className="flex-1 flex min-h-0 gap-2.5 p-2.5 relative">
        {readOnly ? <ViewerPanel /> : ed.step !== "design" && <SidePanel onFindSite={() => setFindSite(true)} />}
        <main className="flex-1 relative min-w-0 rounded-[20px] overflow-hidden ring-1 ring-white/10">
          <MapViewport onContextMenu={onContextMenu} />
          {(ed.step === "map" || ed.step === "export") && !ed.teeView && <MapDesigner preview={ed.step === "export"} />}
          {ed.step === "design" && !readOnly && !ed.teeView && <HolesColumn />}
          {ed.step === "design" && !readOnly && <ProblemsPanel />}
          {ed.step === "design" || ed.step === "site" ? !readOnly && <Toolbar /> : null}
          {ed.step === "design" && !readOnly && <Inspector />}
          {ed.teeView && (ed.flyCam && !readOnly ? <CameraHud /> : <TeeViewHud />)}
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
