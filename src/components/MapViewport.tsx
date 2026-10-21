// The map view (2D and 3D are one view): the CourseView engine, fed from the course store.
import { useEffect, useMemo, useRef, useState } from "react";
import { BoxSelect, Compass, Maximize2, Minus, Plus, RotateCcw, RotateCw } from "lucide-react";
import { useAllowed } from "../auth/perms";
import { FOCUS } from "./ui";
import { CourseView } from "../viewport/CourseView";
import type { ViewDoc, ViewInfo } from "../viewport/types";
import { lassoTrees } from "../state/lidar";
import { changeDoc, useCourse, useEditor, updateItem, updateHole, useCourse as courseStore } from "../state/course";
import { addDrawn, addHole, boxSelect, cutStretch, moveGroup, placeAt, select } from "../state/actions";
import { courseIssues, courseStats, openIssues } from "../lib/holeStats";
import { contoursOf, hillshadeCanvas } from "../lib/relief";
import { terrainStats, heightAt } from "../lib/terrainGrid";
import { niceScaleBar } from "../lib/view";
import { centroid } from "../lib/geom";
import { fmtElev } from "../lib/units";
import type { P } from "../types";
import { SceneButton } from "./ScenePanel";
import { landscapeOf } from "../lib/landscapes";
import { paintedDetail, usePaintedGround } from "../state/paintedGround";

let current: CourseView | null = null;
/** The live map view (for buttons elsewhere: fit, tee view, snapshots). */
export const getView = () => current;

type MenuInfo = { clientX: number; clientY: number; itemId: string | null; ground: P | null };

/**
 * The map and its controls. `compact` lays the controls out for a phone (a column of 44 px
 * buttons under the top bar, `controlsTop` from the top, the turn buttons left out when less
 * than `controlsRoom` pixels are free above the panel) or a phone on its side (2D/3D with them).
 */
export function MapViewport({ onContextMenu, compact, controlsTop = 0, controlsRoom = 999 }: { onContextMenu: (info: MenuInfo) => void; compact?: "phone" | "rail"; controlsTop?: number; controlsRoom?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<CourseView | null>(null);
  const [info, setInfo] = useState<ViewInfo | null>(null);
  const [hover, setHover] = useState<P | null>(null);
  const doc = useCourse(s => s.doc);
  const ed = useEditor();
  const menuRef = useRef(onContextMenu);
  menuRef.current = onContextMenu;

  useEffect(() => {
    if (!ref.current) return;
    const v = new CourseView(ref.current, {
      onSelect: (id, add) => select(id, add),
      onBoxSelect: (ids, add) => boxSelect(ids, add),
      onMoveGroup: (base, ids, dx, dy) => moveGroup(base, ids, dx, dy, false),
      onPlace: (mode, p) => placeAt(mode, p),
      onHole: (tee, basket) => addHole(tee, basket),
      onDrawn: (kind, pts, opts) => {
        // (drawn to cut measured trees in, or bring them back: no area made)
        const lasso = useEditor.getState().lidarLasso;
        if (lasso && kind === "area") lassoTrees(pts, lasso);
        else addDrawn(kind, pts, opts);
        useEditor.getState().set({ tool: "select", lidarLasso: null });
      },
      onChange: (id, patch) => {
        const next = { ...patch } as Record<string, unknown>;
        if (Array.isArray(next.points)) Object.assign(next, centroid(next.points as P[]));
        updateItem(id, next, false);
      },
      onHoleChange: (id, patch) => updateHole(id, patch, false),
      onCommit: () => courseStore.getState().commit(),
      onHover: setHover,
      onPose: pose => useEditor.getState().set({ view: pose === "top" ? "2d" : "3d" }),
      onTeeView: id => useEditor.getState().set({ teeView: id }),
      onContextMenu: i => menuRef.current(i),
      onDrawProgress: n => useEditor.getState().set({ drawPoints: n }),
      onPlotEnd: () => useEditor.getState().set({ plotLine: null }),
      onObPickEnd: () => useEditor.getState().set({ obPick: null, pickCut: false }),
      onCutLine: (id, a, b) => cutStretch(id, a, b),
      onLidar: patch => changeDoc(d => (d.lidar ? { lidar: { ...d.lidar, ...patch } } : {})),
      onFlyWait: waiting => useEditor.getState().set({ flyLoading: waiting })
    });
    current = v;
    (window as any).__dgView = v;
    setView(v);
    const off = v.onView(setInfo);
    return () => {
      off();
      v.dispose();
      if (current === v) current = null;
    };
  }, []);

  const stats = courseStats(doc);
  const terrain = useMemo(() => terrainStats(doc.terrainHeights), [doc.terrainHeights]);
  const contours = useMemo(() => (ed.contours ? contoursOf(doc.terrainHeights, doc.gridSize, doc.canvas.width, doc.canvas.height) : { segments: [], interval: 1 }), [ed.contours, doc.terrainHeights, doc.gridSize, doc.canvas]);
  const shadeUrl = useMemo(() => (ed.shading && terrain.relief > 1 && (doc.style.reliefScale ?? 1) > 0 ? hillshadeCanvas(doc.terrainHeights, doc.gridSize, doc.canvas.width, doc.canvas.height, undefined, doc.style.reliefScale ?? 1).toDataURL() : null), [ed.shading, terrain.relief, doc.terrainHeights, doc.gridSize, doc.canvas, doc.style.reliefScale]);
  const issues = useMemo(() => (ed.step === "review" ? openIssues(doc, courseIssues(doc)).open : null), [ed.step, doc]);
  // From a tee and in flyovers: the ground in the Design look (the painted map), not the photo
  const paintedOn = !!ed.teeView && ed.flyLook === "painted" && !!doc.holes.length;
  // (painted ahead while the course rests with a hole picked, so a flyover has less to wait for;
  // not while it's being changed: that would paint it over and over)
  const [restingDoc, setRestingDoc] = useState(doc);
  useEffect(() => { const t = window.setTimeout(() => setRestingDoc(doc), 1500); return () => window.clearTimeout(t); }, [doc]);
  const warmHole = ed.selectedId && doc.holes.some(h => h.id === ed.selectedId) ? ed.selectedId : ed.activeHoleId;
  const warm = !ed.teeView && ed.flyLook === "painted" && restingDoc === doc && !!warmHole && ed.step !== "design";
  const painted = usePaintedGround(paintedOn || warm);
  useEffect(() => {
    if (!warm || !warmHole || !painted) return;
    const id = window.setTimeout(() => void paintedDetail(doc, warmHole, 3072), 50);
    return () => window.clearTimeout(id);
  }, [warm, warmHole, painted, doc]);

  // The 3D view shows the course in its landscape's natural colors (whatever the map's style)
  const natural = landscapeOf(doc.style);
  const naturalStyle = useMemo(() => ({ ...doc.style, ...natural.colors }), [doc.style, natural]);
  const viewDoc: ViewDoc = useMemo(() => ({
    // (the painted map in its own colors, and what stands on it too)
    course: { ...doc, style: paintedOn ? doc.style : naturalStyle },
    stats,
    activeHoleId: ed.activeHoleId,
    issues,
    sun: { azimuth: doc.style.sunAngle ?? 315, altitude: doc.style.sunHeight ?? 38, shadows: doc.style.shadows ?? 0.65, light: doc.style.light ?? 0 },
    canvas: doc.canvas,
    unitsPerFoot: 1,
    gridSize: doc.gridSize,
    showGrid: !doc.background,
    heights: doc.terrainHeights,
    terrain,
    // (no photo while the painted map is on its way)
    background: { url: doc.background, rect: { x: 0, y: 0, width: doc.canvas.width, height: doc.canvas.height }, opacity: ed.photo && !paintedOn ? 1 : 0 },
    overlay: shadeUrl ? "shaded" : contours.segments.length ? "contours" : "off",
    contours,
    shadeUrl,
    groundDetail: ed.groundDetail,
    groundPaint: doc.groundPaint,
    groundColor: natural.colors.rough
  }), [doc, stats, ed.activeHoleId, issues, terrain, ed.photo, shadeUrl, contours, ed.groundDetail, natural, naturalStyle, paintedOn]);

  useEffect(() => { view?.setDoc(viewDoc); }, [view, viewDoc]);
  useEffect(() => { void view?.setPaintedGround(paintedOn ? painted : null); }, [view, paintedOn, painted]);
  // (a flyover waits for the painting it will fly over)
  useEffect(() => { view?.setPaintedPending(paintedOn && !painted); }, [view, paintedOn, painted]);
  // (and a sharper painting round the hole looked at, flown over or filmed)
  useEffect(() => { view?.setDetailPainter((holeId, maxPx) => paintedDetail(doc, holeId, maxPx)); }, [view, doc]);
  useEffect(() => { view?.setSelection(ed.selectedId); }, [view, ed.selectedId]);
  const readOnly = useCourse(s => s.readOnly);
  useEffect(() => { view?.setReadOnly(readOnly); }, [view, readOnly]);
  useEffect(() => { view?.setGroup(ed.group); }, [view, ed.group]);
  useEffect(() => { view?.setPlotLine(ed.plotLine); }, [view, ed.plotLine]);
  useEffect(() => { view?.setObPick(ed.obPick, ed.pickCut); }, [view, ed.obPick, ed.pickCut]);
  useEffect(() => {
    view?.setTool({ mode: ed.tool, areaKind: ed.areaKind, lineKind: ed.lineKind, structureKind: ed.structureKind, shape: ed.drawShape, dragSelect: ed.dragSelect }, ed.teeLevel);
  }, [view, ed.tool, ed.areaKind, ed.lineKind, ed.structureKind, ed.drawShape, ed.teeLevel, ed.dragSelect]);
  useEffect(() => { view?.setPose(ed.view === "2d" ? "top" : "tilt"); }, [view, ed.view]);
  useEffect(() => { view?.setGrass(ed.grass, ed.wind); }, [view, ed.grass, ed.wind]);
  // Covered by the Design step's page: the map view rests
  useEffect(() => { view?.setPaused(ed.step === "design" && !ed.teeView); }, [view, ed.step, ed.teeView]);
  useEffect(() => {
    if (!view) return;
    if (ed.flyover && ed.teeView) view.flyover(ed.teeView, () => useEditor.getState().set({ flyover: false }));
    else { view.setTeeView(ed.teeView); useEditor.getState().set({ flyLoading: false }); }
  }, [view, ed.teeView, ed.flyover]);

  const scale = info ? niceScaleBar(info.pxPerUnit, 110) : null;
  const elevation = hover ? heightAt(doc.terrainHeights, doc.gridSize, hover.x, hover.y) + doc.site.baseElevationFt : null;
  const btn = `w-8 h-8 flex items-center justify-center text-zinc-300 hover:text-zinc-50 hover:bg-zinc-700/70 transition-colors ${FOCUS} focus-visible:ring-inset`;
  // (the floating controls share one surface)
  const pad = "pointer-events-auto bg-zinc-900/90 backdrop-blur rounded-lg shadow-lg shadow-black/30 ring-1 ring-white/10";

  // (on a computer, clear of the Selection panel at the top right: 150 to 450 px from the edge)
  const obBar = ed.obPick && !ed.teeView && <ObPickBar view={view} cut={ed.pickCut} top={compact ? controlsTop + 8 : 12} right={!compact && ed.selectedId && ed.step !== "design" ? 462 : 8} />;
  const plotBar = ed.plotLine && !ed.teeView && <PlotBar view={view} holeNumber={doc.holes.findIndex(h => h.id === ed.plotLine) + 1} top={compact ? controlsTop + 8 : 12} right={!compact && ed.selectedId && ed.step !== "design" ? 462 : 8} />;
  if (compact) {
    return (
      <div className="absolute inset-0">
        <div ref={ref} data-testid="plan" className="absolute inset-0 overflow-hidden touch-none" />
        {plotBar}
        {obBar}
        {!ed.teeView && controlsRoom > 0 && <TouchControls view={view} info={info} scale={info ? niceScaleBar(info.pxPerUnit, 72) : null} units={doc.units} phone={compact === "phone"} top={controlsTop} room={controlsRoom} threeD={ed.view === "3d"} />}
      </div>
    );
  }

  return (
    <div className="absolute inset-0">
      <div ref={ref} data-testid="plan" className="absolute inset-0 overflow-hidden touch-none" />
      {plotBar}
      {obBar}
      {!ed.teeView && (
        <>
          <div className="absolute top-3 right-3 flex flex-col gap-2 items-end pointer-events-none">
            <ViewToggle pad={pad} />
            <div className="flex gap-2 items-start">
              <button className={`${pad} w-11 h-11 flex flex-col items-center justify-center ${FOCUS}`} title="North up (N)" onClick={() => view?.resetNorth()} data-testid="compass">
                <Compass size={18} className="text-red-400" style={{ transform: `rotate(${-(info?.heading ?? 0)}deg)` }} />
                <span className="text-[9px] font-bold text-zinc-300">N</span>
              </button>
              <div className={`${pad} flex flex-col overflow-hidden`}>
                <button className={btn} title="Zoom in (+)" onClick={() => view?.zoomBy(1.4)}><Plus size={16} /></button>
                <button className={btn} title="Zoom out (−)" onClick={() => view?.zoomBy(1 / 1.4)}><Minus size={16} /></button>
                <button className={btn} title="Show the whole course (0)" onClick={() => view?.fitCourse()}><Maximize2 size={15} /></button>
              </div>
              <div className="flex flex-col gap-2 items-end">
                <div className={`${pad} flex flex-col overflow-hidden`}>
                  <button className={btn} title="Turn left (Q)" onClick={() => view?.rotateBy(-30)}><RotateCcw size={15} /></button>
                  <button className={btn} title="Turn right (E)" onClick={() => view?.rotateBy(30)}><RotateCw size={15} /></button>
                </div>
                <SceneButton />
              </div>
            </div>
          </div>
          {scale && (
            <div className="absolute right-3 bottom-3 bg-zinc-900/80 rounded-md px-2 py-1 pointer-events-none" data-testid="scale-bar">
              <div className="text-[11px] text-zinc-200 font-semibold mb-0.5">{doc.units === "m" ? `${Math.round(scale.feet / 3.28084)} m` : scale.label}</div>
              <div className="h-1.5 border-x-2 border-b-2 border-white" style={{ width: scale.px }} />
            </div>
          )}
          {hover && (
            <div className="absolute left-3 bottom-3 text-[11px] text-zinc-200 bg-zinc-900/80 rounded-md px-2 py-1 pointer-events-none" data-testid="hover-readout">
              {doc.site.bounds ? `Elevation ${Math.round(doc.units === "m" ? elevation! / 3.28084 : elevation!)} ${doc.units}` : `Ground ${fmtElev(elevation!, doc.units)}`}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** Top-down or tilted: with the map's controls (a viewer sees only the views they may). */
function ViewToggle({ pad }: { pad: string }) {
  const view = useEditor(e => e.view), set = useEditor(e => e.set);
  const may2d = useAllowed("map"), may3d = useAllowed("view3d");
  const views = (["2d", "3d"] as const).filter(v => (v === "3d" ? may3d : may2d));
  if (views.length < 2) return null;
  return (
    <div className={`${pad} flex p-0.5`} role="radiogroup" aria-label="View">
      {views.map(v => (
        <button key={v} role="radio" aria-checked={view === v} onClick={() => set({ view: v })} title={v === "2d" ? "Top-down map (2)" : "Tilted 3D view (3)"} data-testid={`view-${v}`}
          className={`px-2.5 h-8 rounded-md text-xs font-bold transition-colors ${FOCUS} ${view === v ? "bg-zinc-100 text-zinc-900" : "text-zinc-300 hover:text-zinc-50 hover:bg-zinc-700/60"}`}>
          {v.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

/** The map's controls for a finger: 44 px buttons (zoom and turn also work by pinching and
 * twisting; these are the one-finger way, and the way for anyone who can't pinch). */
/** While a hole's line is plotted by hand: what to do, and Undo point, Done and Cancel (for a finger too). */
function ObPickBar({ view, cut, top, right }: { view: CourseView | null; cut: boolean; top: number; right: number }) {
  const b = "px-3 h-9 touch:h-11 rounded-lg text-sm font-semibold";
  return (
    <div className="absolute left-2 z-20 flex justify-center pointer-events-none" style={{ top, right }}>
    <div className="pointer-events-auto flex items-center gap-2 bg-zinc-900/95 rounded-xl shadow-xl shadow-black/40 ring-1 ring-white/10 px-3 py-2 max-w-full" data-testid="ob-pick-bar">
      <span className="text-sm text-zinc-100 font-semibold whitespace-nowrap">{cut ? "Remove a stretch" : "OB stretch"}</span>
      <span className="text-xs text-zinc-300 hidden sm:inline">Click where it starts, then where it ends</span>
      <button className={`${b} text-zinc-300 hover:bg-zinc-800`} onClick={() => view?.cancelDrawing()} data-testid="ob-pick-cancel">Cancel</button>
    </div>
    </div>
  );
}

function PlotBar({ view, holeNumber, top, right }: { view: CourseView | null; holeNumber: number; top: number; right: number }) {
  const b = "px-3 h-9 touch:h-11 rounded-lg text-sm font-semibold";
  return (
    <div className="absolute left-2 z-20 flex justify-center pointer-events-none" style={{ top, right }}>
    <div className="pointer-events-auto flex items-center gap-2 bg-zinc-900/95 rounded-xl shadow-xl shadow-black/40 ring-1 ring-white/10 px-3 py-2 max-w-full" data-testid="plot-bar">
      <span className="text-sm text-zinc-100 font-semibold whitespace-nowrap">Hole {holeNumber}</span>
      <span className="text-xs text-zinc-300 hidden sm:inline">Click along the line to the basket, or drag it</span>
      <button className={`${b} text-zinc-200 hover:bg-zinc-800`} onClick={() => view?.undoPoint()} data-testid="plot-undo">Undo point</button>
      <button className={`${b} bg-orange-500 text-zinc-950 hover:bg-orange-400`} onClick={() => view?.finishPlot()} data-testid="plot-done">Done</button>
      <button className={`${b} text-zinc-300 hover:bg-zinc-800`} onClick={() => view?.cancelDrawing()} data-testid="plot-cancel">Cancel</button>
    </div>
    </div>
  );
}

function TouchControls({ view, info, scale, units, phone, top, room, threeD }: { view: CourseView | null; info: ViewInfo | null; scale: { px: number; label: string; feet: number } | null; units: "ft" | "m"; phone: boolean; top: number; room: number; threeD: boolean }) {
  const set = useEditor(e => e.set);
  const mode = useEditor(e => e.view);
  const boxing = useEditor(e => e.dragSelect);
  const editing = useEditor(e => e.step !== "design");
  const b = "w-11 h-11 flex items-center justify-center text-zinc-100 active:bg-zinc-700 focus:outline-none focus-visible:bg-zinc-700";
  const group = "pointer-events-auto flex flex-col bg-zinc-900/90 rounded-2xl border border-white/10 shadow-[0_6px_20px_rgba(0,0,0,0.35)] overflow-hidden divide-y divide-white/5";
  // On a phone the compass only once the map is turned (as in map apps), and only what fits above
  // the panel: zoom (88), then the whole course, box select and turning, each with its 8 px gap
  const heading = info?.heading ?? 0;
  const compass = !phone || Math.min(heading, 360 - heading) > 1;
  let used = 88 + (compass ? 52 : 0) + (threeD ? 52 : 0);
  const fits = (h: number) => {
    if (phone && used + h > room) return false;
    used += h;
    return true;
  };
  const fit = fits(52);
  const box = editing && fits(52);
  const turn = fits(96);
  return (
    <>
      {scale && (
        <div className="absolute left-2 z-10 pointer-events-none bg-zinc-900/80 rounded-lg px-2 py-1 border border-white/10" style={{ top: top + 2 }} data-testid="scale-bar">
          <div className="text-[11px] text-zinc-100 font-semibold leading-none mb-1">{units === "m" ? `${Math.round(scale.feet / 3.28084)} m` : scale.label}</div>
          <div className="h-1.5 border-x-2 border-b-2 border-white" style={{ width: scale.px }} />
        </div>
      )}
      <div className="absolute right-2 z-10 flex flex-col gap-2 items-end pointer-events-none" style={{ top }} data-testid="map-controls">
        {!phone && (
          <div className="pointer-events-auto flex flex-col bg-zinc-900/90 rounded-2xl border border-white/10 p-0.5" role="radiogroup" aria-label="View">
            {(["2d", "3d"] as const).map(v => (
              <button key={v} role="radio" aria-checked={mode === v} onClick={() => set({ view: v })} className={`w-10 h-9 rounded-[12px] text-[13px] font-bold ${mode === v ? "bg-zinc-100 text-zinc-900" : "text-zinc-300"}`}>{v.toUpperCase()}</button>
            ))}
          </div>
        )}
        <div className={phone ? "flex flex-col gap-2 items-end" : "grid grid-cols-2 gap-2"}>
          <div className="flex flex-col gap-2">
            {compass && (
              <button className={`${group} ${b}`} aria-label="North up" title="North up" onClick={() => view?.resetNorth()} data-testid="compass">
                <Compass size={20} className="text-red-400" style={{ transform: `rotate(${-heading}deg)` }} />
              </button>
            )}
            <div className={group}>
              <button className={b} aria-label="Zoom in" onClick={() => view?.zoomBy(1.4)}><Plus size={20} /></button>
              <button className={b} aria-label="Zoom out" onClick={() => view?.zoomBy(1 / 1.4)}><Minus size={20} /></button>
            </div>
            {box && (
              <button className={`${group} ${b} ${boxing ? "!bg-orange-500 !text-zinc-950" : ""}`} aria-label="Select with a box" title="Select with a box" aria-pressed={boxing} onClick={() => set({ dragSelect: !boxing, tool: "select" })} data-testid="touch-drag-select">
                <BoxSelect size={19} />
              </button>
            )}
          </div>
          <div className="flex flex-col gap-2">
            {fit && <button className={`${group} ${b}`} aria-label="Show the whole course" onClick={() => view?.fitCourse()}><Maximize2 size={18} /></button>}
            {turn && (
              <div className={group}>
                <button className={b} aria-label="Turn left" onClick={() => view?.rotateBy(-30)}><RotateCcw size={18} /></button>
                <button className={b} aria-label="Turn right" onClick={() => view?.rotateBy(30)}><RotateCw size={18} /></button>
              </div>
            )}
          </div>
        </div>
        {threeD && <SceneButton big />}
      </div>
    </>
  );
}
