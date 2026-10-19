// The map view (2D and 3D are one view): the CourseView engine, fed from the course store.
import { useEffect, useMemo, useRef, useState } from "react";
import { Compass, Maximize2, Minus, Plus, RotateCcw, RotateCw } from "lucide-react";
import { CourseView } from "../viewport/CourseView";
import type { ViewDoc, ViewInfo } from "../viewport/types";
import { useCourse, useEditor, updateItem, updateHole, useCourse as courseStore } from "../state/course";
import { addDrawn, addHole, placeAt, select } from "../state/actions";
import { holeStats, safetyIssues } from "../lib/holeStats";
import { contoursOf, hillshadeCanvas } from "../lib/relief";
import { terrainStats, heightAt } from "../lib/terrainGrid";
import { niceScaleBar } from "../lib/view";
import { centroid } from "../lib/geom";
import { fmtElev } from "../lib/units";
import type { P } from "../types";

let current: CourseView | null = null;
/** The live map view (for buttons elsewhere: fit, tee view, snapshots). */
export const getView = () => current;

export const themeGround = (theme: string, rough: string) => (theme === "night" ? "#24302a" : theme === "minimal" ? "#eef0e6" : rough);

export function MapViewport({ onContextMenu }: { onContextMenu: (info: { clientX: number; clientY: number; itemId: string | null; ground: P | null }) => void }) {
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
      onSelect: id => select(id),
      onPlace: (mode, p) => placeAt(mode, p),
      onHole: (tee, basket) => addHole(tee, basket),
      onDrawn: (kind, pts) => {
        addDrawn(kind, pts);
        useEditor.getState().set({ tool: "select" });
      },
      onChange: (id, patch) => {
        const next = { ...patch } as Record<string, unknown>;
        if (Array.isArray(next.points)) Object.assign(next, centroid(next.points as P[]));
        updateItem(id, next, false);
      },
      onHoleChange: (id, patch) => updateHole(id, patch, false),
      onCommit: () => courseStore.getState().commit(),
      onHover: p => setHover(p),
      onPose: pose => useEditor.getState().set({ view: pose === "top" ? "2d" : "3d" }),
      onTeeView: id => useEditor.getState().set({ teeView: id }),
      onContextMenu: i => menuRef.current(i),
      onDrawProgress: n => useEditor.getState().set({ drawPoints: n })
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

  const stats = useMemo(() => doc.holes.map(h => holeStats(doc, h)), [doc]);
  const terrain = useMemo(() => terrainStats(doc.terrainHeights), [doc.terrainHeights]);
  const contours = useMemo(() => (ed.contours ? contoursOf(doc.terrainHeights, doc.gridSize, doc.canvas.width, doc.canvas.height) : { segments: [], interval: 1 }), [ed.contours, doc.terrainHeights, doc.gridSize, doc.canvas]);
  const shadeUrl = useMemo(() => (ed.shading && terrain.relief > 1 ? hillshadeCanvas(doc.terrainHeights, doc.gridSize, doc.canvas.width, doc.canvas.height).toDataURL() : null), [ed.shading, terrain.relief, doc.terrainHeights, doc.gridSize, doc.canvas]);
  const issues = useMemo(() => (ed.step === "review" ? safetyIssues(doc, stats) : null), [ed.step, doc, stats]);

  const viewDoc: ViewDoc = useMemo(() => ({
    course: doc,
    stats,
    activeHoleId: ed.activeHoleId,
    issues,
    sun: null,
    canvas: doc.canvas,
    unitsPerFoot: 1,
    gridSize: doc.gridSize,
    showGrid: !doc.background,
    heights: doc.terrainHeights,
    terrain,
    background: { url: doc.background, rect: { x: 0, y: 0, width: doc.canvas.width, height: doc.canvas.height }, opacity: ed.photo ? 1 : 0 },
    overlay: shadeUrl ? "shaded" : contours.segments.length ? "contours" : "off",
    contours,
    shadeUrl,
    groundDetail: ed.groundDetail,
    groundPaint: doc.groundPaint,
    groundColor: themeGround(doc.style.theme, doc.style.rough)
  }), [doc, stats, ed.activeHoleId, issues, terrain, ed.photo, shadeUrl, contours, ed.groundDetail]);

  useEffect(() => { view?.setDoc(viewDoc); }, [view, viewDoc]);
  useEffect(() => { view?.setSelection(ed.selectedId); }, [view, ed.selectedId]);
  useEffect(() => {
    view?.setTool({ mode: ed.viewOnly ? "select" : ed.tool, areaKind: ed.areaKind, lineKind: ed.lineKind, readOnly: ed.viewOnly }, ed.teeLevel);
  }, [view, ed.tool, ed.areaKind, ed.lineKind, ed.viewOnly, ed.teeLevel]);
  useEffect(() => { view?.setPose(ed.view === "2d" ? "top" : "tilt"); }, [view, ed.view]);
  useEffect(() => {
    if (!view) return;
    if (ed.flyover && ed.teeView) view.flyover(ed.teeView, () => useEditor.getState().set({ flyover: false }));
    else view.setTeeView(ed.teeView);
  }, [view, ed.teeView, ed.flyover]);

  const scale = info ? niceScaleBar(info.pxPerUnit, 110) : null;
  const elevation = hover ? heightAt(doc.terrainHeights, doc.gridSize, hover.x, hover.y) + doc.site.baseElevationFt : null;
  const btn = "w-8 h-8 flex items-center justify-center text-zinc-300 hover:text-white hover:bg-zinc-700/70 transition-colors";

  return (
    <div className="absolute inset-0">
      <div ref={ref} data-testid="plan" className="absolute inset-0 overflow-hidden" />
      {!ed.teeView && (
        <>
          <div className="absolute top-3 right-3 flex gap-2 items-start pointer-events-none">
            {scale && (
              <div className="pointer-events-auto bg-zinc-900/85 backdrop-blur rounded-lg px-2.5 py-1.5 border border-zinc-700/60 shadow" data-testid="scale-bar">
                <div className="text-[11px] text-zinc-200 font-semibold mb-1">{doc.units === "m" ? `${Math.round(scale.feet / 3.28084)} m` : scale.label}</div>
                <div className="h-1.5 border-x-2 border-b-2 border-white" style={{ width: scale.px }} />
              </div>
            )}
            <button
              className="pointer-events-auto bg-zinc-900/85 backdrop-blur rounded-lg w-11 h-11 flex flex-col items-center justify-center border border-zinc-700/60 shadow"
              title="North up (N)"
              onClick={() => view?.resetNorth()}
              data-testid="compass"
            >
              <Compass size={18} className="text-red-400" style={{ transform: `rotate(${-(info?.heading ?? 0)}deg)` }} />
              <span className="text-[9px] font-bold text-zinc-300">N</span>
            </button>
            <div className="pointer-events-auto flex flex-col bg-zinc-900/85 backdrop-blur rounded-lg border border-zinc-700/60 shadow overflow-hidden">
              <button className={btn} title="Zoom in (+)" onClick={() => view?.zoomBy(1.4)}><Plus size={16} /></button>
              <button className={btn} title="Zoom out (−)" onClick={() => view?.zoomBy(1 / 1.4)}><Minus size={16} /></button>
              <button className={btn} title="Show the whole course (0)" onClick={() => view?.fitCourse()}><Maximize2 size={15} /></button>
            </div>
            <div className="pointer-events-auto flex flex-col bg-zinc-900/85 backdrop-blur rounded-lg border border-zinc-700/60 shadow overflow-hidden">
              <button className={btn} title="Turn left (Q)" onClick={() => view?.rotateBy(-30)}><RotateCcw size={15} /></button>
              <button className={btn} title="Turn right (E)" onClick={() => view?.rotateBy(30)}><RotateCw size={15} /></button>
            </div>
          </div>
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
