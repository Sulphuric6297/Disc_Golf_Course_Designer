// The tools along the bottom of the map, with the active tool's options and a hint above them.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Armchair, BoxSelect, Circle, CircleDot, Ellipsis, Hand, House, MousePointer2, PenLine, Pentagon, RectangleHorizontal, Redo2, Route, Ruler, Signpost, Spline, Square, Target, TreeDeciduous, Type, Undo2 } from "lucide-react";
import { amenitySymbol, structureLegend, symbolSvg } from "../lib/symbols";
import { AMENITY_KINDS, AREA_KINDS, LINE_KINDS, STRUCTURE_KINDS, STRUCTURE_ORDER, TEE_LEVELS, TEE_ORDER } from "../constants";
import { useCourse, useEditor } from "../state/course";
import type { AmenityKind, AreaKind, DrawShape, LineKind, StructureKind, ToolMode, TreeKind } from "../types";
import { useTouch } from "./useLayout";

/** A built thing's map symbol, small (for the tool's chips and the Features list). */
export const structureIcon = (kind: StructureKind, size: number, id: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 16 16" style="overflow:visible;display:block">${structureLegend(kind, 16, 16, 0.9, undefined, id)}</svg>`;

export const TOOLS: { mode: ToolMode; key: string; label: string; short: string; icon: ReactNode; group: number }[] = [
  { mode: "select", key: "V", label: "Select and move", short: "Select", icon: <MousePointer2 size={18} />, group: 0 },
  { mode: "add-hole", key: "H", label: "New hole: click the tee, then the basket", short: "Hole", icon: <Route size={18} />, group: 1 },
  { mode: "add-tee", key: "T", label: "Another tee for this hole", short: "Tee", icon: <RectangleHorizontal size={18} />, group: 1 },
  { mode: "add-basket", key: "B", label: "Another pin position for this hole", short: "Pin", icon: <Target size={18} />, group: 1 },
  { mode: "add-mando", key: "M", label: "Mandatory (mando)", short: "Mando", icon: <Signpost size={18} />, group: 2 },
  { mode: "add-dropzone", key: "Z", label: "Drop zone", short: "Drop zone", icon: <CircleDot size={18} />, group: 2 },
  { mode: "draw-area", key: "O", label: "Draw an area: OB, hazard, water, fairway, woods…", short: "Area", icon: <Pentagon size={18} />, group: 2 },
  { mode: "draw-line", key: "L", label: "Draw a line: OB line, path, road, fence, stream…", short: "Line", icon: <Spline size={18} />, group: 2 },
  { mode: "draw-structure", key: "S", label: "Build: bridge, boardwalk, stairs, wall, building, shelter, deck", short: "Build", icon: <House size={18} />, group: 2 },
  { mode: "add-tree", key: "R", label: "Tree", short: "Tree", icon: <TreeDeciduous size={18} />, group: 3 },
  { mode: "add-amenity", key: "A", label: "Amenities: bench, trash can, sign, parking…", short: "Amenities", icon: <Armchair size={18} />, group: 3 },
  { mode: "add-label", key: "K", label: "Text label", short: "Label", icon: <Type size={18} />, group: 3 },
  { mode: "measure", key: "D", label: "Measure distance and elevation", short: "Measure", icon: <Ruler size={18} />, group: 4 }
];

const HINTS: Partial<Record<ToolMode, string>> = {
  "add-hole": "Click where the tee goes, then where the basket goes. Keep going for the next hole · Esc when done",
  "add-tee": "Click to add another tee to the selected hole",
  "add-basket": "Click to add another pin position (B, C…) to the selected hole",
  "add-mando": "Click beside the hole's line where the post or tree is",
  "add-dropzone": "Click to place a drop zone",
  "draw-area": "Click the corners · double-click or Enter to finish · Backspace removes the last point · Esc cancels",
  "draw-line": "Click along the line · double-click or Enter to finish · Backspace removes the last point · Esc cancels",
  "draw-structure": "Click along it, end to end · double-click or Enter to finish · Backspace removes the last point · Esc cancels",
  "add-tree": "Click to plant trees",
  "add-amenity": "Click to place it",
  "add-label": "Click to place a label, then type its text in the panel",
  measure: "Click a start point, then click anywhere to measure from it · Shift+click adds a turn · Esc to finish"
};

/** The same, for a touch screen (no keys, no right button, no double-click). */
const TOUCH_HINTS: Partial<Record<ToolMode, string>> = {
  select: "Drag to pan · pinch to zoom · two fingers to turn and tilt · hold on a thing for its menu",
  "add-hole": "Tap where the tee goes, then where the basket goes. Keep going for the next hole",
  "add-tee": "Tap to add another tee to the selected hole",
  "add-basket": "Tap to add another pin position (B, C…) to the selected hole",
  "add-mando": "Tap beside the hole's line where the post or tree is",
  "add-dropzone": "Tap to place a drop zone",
  "draw-area": "Tap the corners, then Done (or tap the first corner again)",
  "draw-line": "Tap along the line, then Done",
  "draw-structure": "Tap along it, end to end, then Done",
  "add-tree": "Tap to plant trees",
  "add-amenity": "Tap to place it",
  "add-label": "Tap to place a label, then type its text",
  measure: "Tap a start point, then tap anywhere to measure from it"
};

const SHAPES: Record<DrawShape, { label: string; title: string; icon: ReactNode }> = {
  points: { label: "Points", title: "Click each corner or bend", icon: <Spline size={13} /> },
  box: { label: "Rectangle", title: "Drag a rectangle", icon: <Square size={13} /> },
  circle: { label: "Circle", title: "Drag from the middle out", icon: <Circle size={13} /> },
  freehand: { label: "Freehand", title: "Drag to draw", icon: <PenLine size={13} /> }
};
const SHAPE_HINTS: Record<DrawShape, string> = {
  points: "",
  box: "Click one corner, then the opposite corner (or drag) · Esc cancels",
  circle: "Click the middle, then the edge (or drag) · Esc cancels",
  freehand: "Drag to draw; let go to finish · Esc cancels"
};
const TOUCH_SHAPE_HINTS: Record<DrawShape, string> = {
  points: "",
  box: "Tap one corner, then the opposite corner",
  circle: "Tap the middle, then the edge",
  freehand: "Draw with one finger; lift it to finish"
};

const Chip = ({ active, onClick, children, color, testid }: { active: boolean; onClick: () => void; children: ReactNode; color?: string; testid?: string }) => (
  <button
    onClick={onClick}
    data-testid={testid}
    className={`flex items-center gap-1.5 px-2.5 py-1 touch:py-2 touch:px-3 touch:text-[13px] shrink-0 whitespace-nowrap rounded-full text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 ${active ? "bg-zinc-100 text-zinc-900" : "glass text-zinc-300 ring-1 ring-white/10 hover:bg-white/[0.09]"}`}
  >
    {color && <span className="w-2.5 h-2.5 rounded-full border border-black/30" style={{ background: color }} />}
    {children}
  </button>
);

type Editor = ReturnType<typeof useEditor.getState>;

/** The active tool's options (tee colors, kinds of area or line, how to draw…), or null. */
export function toolOptions(ed: Editor): ReactNode[] | null {
  const set = ed.set;
  // How to draw: point by point, or drag a rectangle, a circle or a freehand shape
  const shapes = (list: DrawShape[]) => (
    <div key="shapes" className="flex shrink-0 gap-0.5 glass ring-1 ring-white/10 rounded-full p-0.5 mr-1" role="radiogroup" aria-label="How to draw">
      {list.map(sh => {
        // (Lines can't be rectangles or circles: those draw freehand)
        const on = ed.drawShape === sh || (sh === "freehand" && !list.includes(ed.drawShape));
        return (
          <button key={sh} role="radio" aria-checked={on} data-testid={`draw-shape-${sh}`} title={SHAPES[sh].title} onClick={() => set({ drawShape: sh })} className={`flex items-center gap-1 px-2 py-0.5 touch:py-1.5 touch:px-2.5 touch:text-[13px] whitespace-nowrap rounded-full text-xs font-semibold ${on ? "bg-orange-500 text-zinc-950" : "text-zinc-300 hover:bg-white/[0.09]"}`}>
            {SHAPES[sh].icon}{SHAPES[sh].label}
          </button>
        );
      })}
    </div>
  );
  switch (ed.tool) {
      case "select":
        // What a drag on the map does: move the map, or draw a box to select things
        return [
          <div key="drag" className="flex shrink-0 gap-0.5 glass ring-1 ring-white/10 rounded-full p-0.5" role="radiogroup" aria-label="Drag on the map">
            {([[false, "Move the map", <Hand key="i" size={13} />, "drag-pan"], [true, "Select", <BoxSelect key="i" size={13} />, "drag-select"]] as const).map(([on, label, icon, id]) => (
              <button key={id} role="radio" aria-checked={ed.dragSelect === on} data-testid={id} title={on ? "Drag a box around things to select them (Shift+drag)" : "Drag to move the map"} onClick={() => set({ dragSelect: on })} className={`flex items-center gap-1 px-2 py-0.5 touch:py-1.5 touch:px-2.5 touch:text-[13px] whitespace-nowrap rounded-full text-xs font-semibold ${ed.dragSelect === on ? "bg-orange-500 text-zinc-950" : "text-zinc-300 hover:bg-white/[0.09]"}`}>
                {icon}{label}
              </button>
            ))}
          </div>
        ];
      case "add-hole":
      case "add-tee":
        return TEE_ORDER.map(l => <Chip key={l} active={ed.teeLevel === l} color={TEE_LEVELS[l].color} onClick={() => set({ teeLevel: l })} testid={`tee-level-${l}`}>{TEE_LEVELS[l].label}</Chip>);
      case "draw-area":
        return [shapes(["points", "box", "circle", "freehand"]), ...(Object.keys(AREA_KINDS) as AreaKind[]).map(k => <Chip key={k} active={ed.areaKind === k} color={AREA_KINDS[k].color} onClick={() => set({ areaKind: k })} testid={`area-kind-${k}`}>{AREA_KINDS[k].label.replace(/ \(.*\)/, "")}</Chip>)];
      case "draw-line":
        return [shapes(["points", "freehand"]), ...(Object.keys(LINE_KINDS) as LineKind[]).map(k => <Chip key={k} active={ed.lineKind === k} color={LINE_KINDS[k].color} onClick={() => set({ lineKind: k })} testid={`line-kind-${k}`}>{LINE_KINDS[k].label}</Chip>)];
      case "draw-structure":
        return [
          shapes(STRUCTURE_KINDS[ed.structureKind].shape === "outline" ? ["points", "box", "circle", "freehand"] : ["points", "freehand"]),
          ...STRUCTURE_ORDER.map(k => (
            <Chip key={k} active={ed.structureKind === k} onClick={() => set({ structureKind: k, drawShape: STRUCTURE_KINDS[k].shape === "outline" ? "box" : "points" })} testid={`structure-kind-${k}`}>
              <span className="inline-block" dangerouslySetInnerHTML={{ __html: structureIcon(k, 16, `chip-${k}`) }} />
              {STRUCTURE_KINDS[k].label}
            </Chip>
          ))
        ];
      case "add-amenity":
        return (Object.keys(AMENITY_KINDS) as AmenityKind[]).map(k => (
          <Chip key={k} active={ed.amenityKind === k} testid={`amenity-kind-${k}`} onClick={() => set({ amenityKind: k })}>
            <span className="inline-block" dangerouslySetInnerHTML={{ __html: symbolSvg(amenitySymbol(k, { x: 0, y: 0 }, 1), 16, k === "here" ? 22 : 16) }} />
            {k === "here" ? "You are here" : AMENITY_KINDS[k].label}
          </Chip>
        ));
      case "add-mando":
        return [
          <Chip key="single" active={ed.mandoKind === "single"} testid="mando-kind-single" onClick={() => set({ mandoKind: "single" })}>One post</Chip>,
          <Chip key="gate" active={ed.mandoKind === "gate"} testid="mando-kind-gate" onClick={() => set({ mandoKind: "gate" })}>Gate</Chip>
        ];
      case "add-tree":
        return (["deciduous", "conifer", "bush"] as TreeKind[]).map(k => <Chip key={k} active={ed.treeKind === k} onClick={() => set({ treeKind: k })}>{k === "deciduous" ? "Leafy tree" : k === "conifer" ? "Pine" : "Bush"}</Chip>);
      default:
        return null;
    }
}

/** What to do with the active tool, worded for a mouse and keys or for a touch screen. */
export function toolHint(ed: Editor, touch = false): string | undefined {
  const drawing = ed.tool === "draw-area" || ed.tool === "draw-line" || ed.tool === "draw-structure";
  const lineDrawn = ed.tool === "draw-line" || (ed.tool === "draw-structure" && STRUCTURE_KINDS[ed.structureKind].shape === "line");
  const shape = lineDrawn && (ed.drawShape === "box" || ed.drawShape === "circle") ? "freehand" : ed.drawShape;
  if (touch) {
    return drawing && shape !== "points" ? TOUCH_SHAPE_HINTS[shape]
      : ed.tool === "add-mando" && ed.mandoKind === "gate" ? "Tap on the hole's line where the gate is"
      : ed.tool === "draw-structure" && ed.structureKind === "bridge" ? "Tap one bank, then the other, then Done"
      : ed.tool === "draw-structure" && !lineDrawn ? "Tap the corners, then Done"
      : ed.tool === "select" && ed.dragSelect ? "Drag a box around things · tap to add or take one out · two fingers move the map"
      : TOUCH_HINTS[ed.tool];
  }
  // (none with Select itself: the map stays clear; its gestures are in the shortcuts dialog)
  return ed.tool === "select" ? (ed.dragSelect ? "Drag a box around things · Shift+click adds or takes one out · right-drag to turn and tilt" : undefined)
    : drawing && shape !== "points" ? SHAPE_HINTS[shape]
    : ed.tool === "add-mando" && ed.mandoKind === "gate" ? "Click on the hole's line where the gate is"
    : ed.tool === "draw-structure" && ed.structureKind === "bridge" ? "Click one bank, then double-click the other (or Enter) · Backspace removes the last point · Esc cancels"
    : ed.tool === "draw-structure" && !lineDrawn ? "Click the corners · double-click or Enter to finish · Esc cancels"
    : HINTS[ed.tool];
}

/** The tools a step is about; the rest wait under More (and come forward while in use). */
const STEP_TOOLS: Record<string, ToolMode[]> = {
  site: ["select", "draw-area", "draw-line", "add-tree", "measure"],
  design: ["select", "add-hole", "add-tee", "add-basket", "add-mando", "draw-area", "draw-line", "draw-structure", "add-tree", "measure"],
  export: ["select"]
};

const BAR_BTN = "relative w-10 h-10 rounded-xl flex items-center justify-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400";

export function Toolbar() {
  const ed = useEditor();
  const canUndo = useCourse(s => s.past.length > 0);
  const canRedo = useCourse(s => s.future.length > 0);
  const undo = useCourse(s => s.undo);
  const redo = useCourse(s => s.redo);
  const touch = useTouch();
  const [more, setMore] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!more) return;
    const close = (e: MouseEvent) => { if (!moreRef.current?.contains(e.target as Node)) setMore(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setMore(false); };
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", esc);
    return () => { window.removeEventListener("pointerdown", close); window.removeEventListener("keydown", esc); };
  }, [more]);
  if (ed.teeView) return null;
  const set = ed.set;
  const options = toolOptions(ed);
  const hint = toolHint(ed, touch);
  const main = STEP_TOOLS[ed.step] ?? STEP_TOOLS.design;
  const shown = TOOLS.filter(t => main.includes(t.mode) || t.mode === ed.tool);
  const rest = TOOLS.filter(t => !shown.includes(t));
  const tool = (t: (typeof TOOLS)[number], inMenu = false) => (
    <button
      key={t.mode}
      title={`${t.label} (${t.key})`}
      aria-label={t.label}
      aria-pressed={ed.tool === t.mode}
      data-tool={t.mode}
      onClick={() => { set({ tool: t.mode }); setMore(false); }}
      className={inMenu
        ? `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 ${ed.tool === t.mode ? "bg-orange-500 text-zinc-950" : "text-zinc-200 hover:bg-white/[0.09]"}`
        : `${BAR_BTN} ${ed.tool === t.mode ? "bg-orange-500 text-zinc-950" : "text-zinc-300 hover:bg-white/[0.09] hover:text-zinc-50"}`}
    >
      {t.icon}
      {inMenu ? <span className="flex-1">{t.short}</span> : null}
      <span className={inMenu ? "text-[11px] opacity-60 touch:hidden" : "absolute bottom-0.5 right-1 text-[8px] font-bold opacity-60 touch:hidden"}>{t.key}</span>
    </button>
  );
  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 z-20 max-w-[calc(100%-24px)]">
      {options && <div className="flex flex-wrap justify-center gap-1.5 max-w-[760px]" data-testid="tool-options">{options}</div>}
      {hint && <div className="text-xs text-zinc-100 glass backdrop-blur rounded-lg px-3 py-1.5 ring-1 ring-white/10 text-center" data-testid="tool-hint">{hint}</div>}
      <div className="flex items-center gap-0.5 max-w-full glass backdrop-blur rounded-2xl px-1.5 py-1.5 shadow-xl shadow-black/40 ring-1 ring-white/10" role="toolbar" aria-label="Tools">
        {shown.map((t, i) => (
          <div key={t.mode} className="flex items-center shrink-0">
            {i > 0 && shown[i - 1].group !== t.group && <div className="w-px h-5 bg-white/[0.12] mx-1" />}
            {tool(t)}
          </div>
        ))}
        {rest.length > 0 && (
          <div className="relative shrink-0" ref={moreRef}>
            <button className={`${BAR_BTN} ${more ? "bg-white/[0.07] text-zinc-50" : "text-zinc-300 hover:bg-white/[0.09] hover:text-zinc-50"}`} title="More tools" aria-label="More tools" aria-haspopup="menu" aria-expanded={more} onClick={() => setMore(m => !m)} data-testid="more-tools"><Ellipsis size={18} /></button>
            {more && (
              <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 w-56 glass-solid rounded-xl shadow-xl shadow-black/40 ring-1 ring-white/10 p-1 flex flex-col" role="menu" data-testid="more-tools-menu">
                {rest.map(t => tool(t, true))}
              </div>
            )}
          </div>
        )}
        <div className="w-px h-5 bg-white/[0.12] mx-1 shrink-0" />
        <button title="Undo (Ctrl+Z)" aria-label="Undo" disabled={!canUndo} onClick={undo} className={`${BAR_BTN} shrink-0 text-zinc-300 hover:bg-white/[0.09] disabled:opacity-30`}><Undo2 size={18} /></button>
        <button title="Redo (Ctrl+Shift+Z)" aria-label="Redo" disabled={!canRedo} onClick={redo} className={`${BAR_BTN} shrink-0 text-zinc-300 hover:bg-white/[0.09] disabled:opacity-30`}><Redo2 size={18} /></button>
      </div>
    </div>
  );
}
