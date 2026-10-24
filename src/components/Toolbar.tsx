// The tools along the bottom of the map, with the active tool's options and a hint above them.
import { holeLabel } from "../lib/course";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Armchair, BoxSelect, Brush, Mountain, Circle, CircleDot, Ellipsis, Footprints, Hand, House, MousePointer2, PenLine, RectangleHorizontal, Redo2, Route, Ruler, ShieldAlert, Signpost, Spline, Sprout, Square, Target, TreeDeciduous, Type, Undo2, Waves } from "lucide-react";
import { amenitySymbol, structureLegend, symbolSvg } from "../lib/symbols";
import { AMENITY_KINDS, AREA_KINDS, LINE_KINDS, STRUCTURE_KINDS, STRUCTURE_ORDER, TEE_LEVELS, TEE_ORDER } from "../constants";
import { getDoc, useCourse, useEditor } from "../state/course";
import type { AmenityKind, AreaKind, DrawShape, LineKind, StructureKind, ToolMode, TreeKind } from "../types";
import { useTouch } from "./useLayout";
import { fmtDist } from "../lib/units";

/** A built thing's map symbol, small (for the tool's chips and the Features list). */
export const structureIcon = (kind: StructureKind, size: number, id: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 16 16" style="overflow:visible;display:block">${structureLegend(kind, 16, 16, 0.9, undefined, id)}</svg>`;

type Editor = ReturnType<typeof useEditor.getState>;

/** One thing a tool puts on the course: how it's drawn (an area, a line, a spot) and of what kind. */
export type ToolChoice = { id: string; label: string; mode: ToolMode; set: Partial<Editor>; color?: string; icon?: ReactNode };
/** A tool: named for what goes on the course (not for how it's drawn), so a fence is under Build and a
 * road under Paths and roads. `choices`: what it has, each drawn its own way; `mode` the first's. */
export type Tool = { id: string; mode: ToolMode; key: string; label: string; short: string; icon: ReactNode; group: number; choices?: ToolChoice[] };

const area = (k: AreaKind, label: string): ToolChoice => ({ id: `area-kind-${k}`, label, mode: "draw-area", set: { areaKind: k }, color: AREA_KINDS[k].color });
const line = (k: LineKind, label: string): ToolChoice => ({ id: `line-kind-${k}`, label, mode: "draw-line", set: { lineKind: k }, color: LINE_KINDS[k].color });
const built = (k: StructureKind): ToolChoice => ({ id: `structure-kind-${k}`, label: STRUCTURE_KINDS[k].label, mode: "draw-structure", set: { structureKind: k }, icon: <span className="inline-block" dangerouslySetInnerHTML={{ __html: structureIcon(k, 16, `chip-${k}`) }} /> });
const tree = (k: TreeKind, label: string): ToolChoice => ({ id: `tree-kind-${k}`, label, mode: "add-tree", set: { treeKind: k } });

export const TOOLS: Tool[] = [
  { id: "select", mode: "select", key: "V", label: "Select and move", short: "Select", icon: <MousePointer2 size={18} />, group: 0 },
  { id: "hole", mode: "add-hole", key: "H", label: "New hole: click the tee, then the basket", short: "Hole", icon: <Route size={18} />, group: 1 },
  { id: "tee", mode: "add-tee", key: "T", label: "Another tee for this hole", short: "Tee", icon: <RectangleHorizontal size={18} />, group: 1 },
  { id: "pin", mode: "add-basket", key: "B", label: "Another pin position for this hole", short: "Pin", icon: <Target size={18} />, group: 1 },
  {
    id: "rules", mode: "draw-area", key: "O", label: "OB and rules: OB areas and lines, hazards, casual areas, out of play, mandos, drop zones", short: "OB & rules", icon: <ShieldAlert size={18} />, group: 2,
    choices: [
      area("ob", "OB area"), line("ob", "OB line"), area("hazard", "Hazard"), area("casual", "Casual area"), area("nogo", "Out of play"),
      { id: "mando-kind-single", label: "Mando", mode: "add-mando", set: { mandoKind: "single" }, icon: <Signpost size={14} /> },
      { id: "mando-kind-gate", label: "Mando gate", mode: "add-mando", set: { mandoKind: "gate" }, icon: <Signpost size={14} /> },
      { id: "dropzone-kind", label: "Drop zone", mode: "add-dropzone", set: {}, icon: <CircleDot size={14} /> }
    ]
  },
  { id: "paths", mode: "draw-line", key: "L", label: "Paths and roads: walking paths, next-tee routes, roads, parking", short: "Paths & roads", icon: <Footprints size={18} />, group: 3, choices: [line("path", "Walking path"), line("walk", "Next-tee route"), line("road", "Road"), area("parking", "Parking lot")] },
  { id: "water", mode: "draw-area", key: "W", label: "Water: ponds, lakes and streams", short: "Water", icon: <Waves size={18} />, group: 3, choices: [area("water", "Pond or lake"), line("stream", "Stream")] },
  { id: "trees", mode: "add-tree", key: "R", label: "Trees and woods: a tree at a time, or a stand of woods", short: "Trees", icon: <TreeDeciduous size={18} />, group: 3, choices: [tree("deciduous", "Leafy tree"), tree("conifer", "Pine"), tree("bush", "Bush"), area("woods", "Woods")] },
  { id: "grass", mode: "draw-area", key: "U", label: "Grass and ground: fairways, landing zones, tall grass, sand and dirt", short: "Grass", icon: <Sprout size={18} />, group: 3, choices: [area("fairway", "Fairway"), area("green", "Landing zone"), area("rough", "Tall grass"), area("sand", "Sand or dirt")] },
  {
    id: "build", mode: "draw-structure", key: "S", label: "Build: buildings, shelters, decks, bridges, boardwalks, stairs, walls, fences", short: "Build", icon: <House size={18} />, group: 3,
    choices: [built("building"), built("shelter"), built("deck"), built("bridge"), built("boardwalk"), built("stairs"), built("wall"), line("fence", "Fence")]
  },
  { id: "amenities", mode: "add-amenity", key: "A", label: "Amenities: bench, trash can, sign, parking…", short: "Amenities", icon: <Armchair size={18} />, group: 4 },
  { id: "label", mode: "add-label", key: "K", label: "Text label", short: "Label", icon: <Type size={18} />, group: 4 },
  { id: "ground", mode: "sculpt", key: "G", label: "Shape the ground: paint to raise, lower, flatten or smooth it", short: "Ground", icon: <Mountain size={18} />, group: 5 },
  { id: "measure", mode: "measure", key: "D", label: "Measure distance and elevation", short: "Measure", icon: <Ruler size={18} />, group: 5 }
];

/** Keys that go straight to one of a tool's choices. */
export const CHOICE_KEYS: Record<string, string> = { M: "mando-kind-single", Z: "dropzone-kind" };

const matches = (ed: Editor, c: ToolChoice) => ed.tool === c.mode && Object.entries(c.set).every(([k, v]) => (ed as Record<string, unknown>)[k] === v);
/** The tool in use: the one whose choice is being drawn (or, a kind no tool lists, the first that draws that way). */
export const toolOf = (ed: Editor): Tool | undefined =>
  TOOLS.find(t => (t.choices ? t.choices.some(c => matches(ed, c)) : t.mode === ed.tool)) ?? TOOLS.find(t => t.choices?.some(c => c.mode === ed.tool));
/** The choice of the tool in use being drawn. */
export const choiceOf = (ed: Editor) => toolOf(ed)?.choices?.find(c => matches(ed, c));

// (each tool picks up again with what it last drew)
const lastChoice = new Map<string, ToolChoice>();
/** Draw this choice (its tool comes forward); `remember`: the tool picks up with it next time
 * (not for a key that goes straight to it, like Z for a drop zone: O still gives what O last did). */
export const drawChoice = (c: ToolChoice, remember = true) => {
  const ed = useEditor.getState();
  const t = TOOLS.find(x => x.choices?.includes(c));
  if (t && remember) lastChoice.set(t.id, c);
  const set: Partial<Editor> = { tool: c.mode, ...c.set };
  // (built things: outlines by a box, a bridge or wall along its line, as before)
  if (c.mode === "draw-structure" && c.set.structureKind) set.drawShape = STRUCTURE_KINDS[c.set.structureKind].shape === "outline" ? "box" : "points";
  ed.set(set);
};
/** Take up a tool: what it last drew, or its first choice. */
export const pickTool = (t: Tool) => {
  if (!t.choices) { useEditor.getState().set({ tool: t.mode }); return; }
  drawChoice(lastChoice.get(t.id) ?? t.choices[0]);
};

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
  measure: "Click a start point, then click anywhere to measure from it · Shift+click adds a turn · Esc to finish",
  sculpt: "Drag over the ground to paint it · hold still to keep going · right-drag moves the map · Ctrl+Z undoes a stroke"
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
  measure: "Tap a start point, then tap anywhere to measure from it",
  sculpt: "Paint the ground with one finger · two fingers move the map"
};

const SHAPES: Record<DrawShape, { label: string; title: string; icon: ReactNode }> = {
  points: { label: "Points", title: "Click each corner or bend", icon: <Spline size={13} /> },
  box: { label: "Rectangle", title: "Drag a rectangle", icon: <Square size={13} /> },
  circle: { label: "Circle", title: "Drag from the middle out", icon: <Circle size={13} /> },
  freehand: { label: "Freehand", title: "Drag to draw", icon: <PenLine size={13} /> },
  paint: { label: "Paint", title: "Paint it on with a brush (its edge comes out smooth)", icon: <Brush size={13} /> }
};

/** The brush's size and strength, small, beside the tool's other choices. */
const BrushSliders = ({ ed, strength = true }: { ed: Editor; strength?: boolean }) => {
  const units = useCourse(s => s.doc.units);
  return (
    <div key="brush" className="flex shrink-0 touch:flex-1 items-center gap-3 glass ring-1 ring-white/10 rounded-full px-3 py-1 touch:py-1.5 touch:justify-between" data-testid="brush-sliders">
      <label className="flex items-center gap-1.5 text-xs touch:text-[13px] text-zinc-300 whitespace-nowrap">Brush
        <input type="range" aria-label="Brush size" min={4} max={150} step={1} value={ed.brushSize} onChange={e => ed.set({ brushSize: Number(e.target.value) })} className="slider w-20 touch:w-24" style={{ ["--fill" as string]: `${((ed.brushSize - 4) / 146) * 100}%` }} />
        <span className="tabular-nums w-12">{fmtDist(ed.brushSize * 2, units)}</span>
      </label>
      {strength && (
        <label className="flex items-center gap-1.5 text-xs touch:text-[13px] text-zinc-300 whitespace-nowrap">Strength
          <input type="range" aria-label="Brush strength" min={1} max={10} step={1} value={ed.brushStrength} onChange={e => ed.set({ brushStrength: Number(e.target.value) })} className="slider w-16 touch:w-20" style={{ ["--fill" as string]: `${((ed.brushStrength - 1) / 9) * 100}%` }} />
          <span className="tabular-nums w-4">{ed.brushStrength}</span>
        </label>
      )}
    </div>
  );
};

const GROUND_BRUSHES = [
  { value: "raise", label: "Raise", title: "Builds the ground up under the brush" },
  { value: "lower", label: "Lower", title: "Digs the ground down under the brush" },
  { value: "flatten", label: "Flatten", title: "Levels the ground to the height where the stroke starts (a tee pad, a green)" },
  { value: "smooth", label: "Smooth", title: "Evens out bumps and steps, keeping the overall slope" },
  { value: "restore", label: "Restore", title: "Puts the ground back to its height as measured, wherever you've changed it" }
] as const;
const SHAPE_HINTS: Record<DrawShape, string> = {
  points: "",
  box: "Click one corner, then the opposite corner (or drag) · Esc cancels",
  circle: "Click the middle, then the edge (or drag) · Esc cancels",
  freehand: "Drag to draw; let go to finish · Esc cancels",
  paint: "Paint the area on with the brush; let go to finish · a click paints a round spot"
};
const TOUCH_SHAPE_HINTS: Record<DrawShape, string> = {
  points: "",
  box: "Tap one corner, then the opposite corner",
  circle: "Tap the middle, then the edge",
  freehand: "Draw with one finger; lift it to finish",
  paint: "Paint the area on with one finger; lift it to finish"
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
  const kit = toolOf(ed);
  if (kit?.choices) {
    const how = ed.tool === "draw-area" ? [shapes(["points", "box", "circle", "freehand", "paint"]), ...(ed.drawShape === "paint" ? [<BrushSliders key="brush" ed={ed} strength={false} />] : [])]
      : ed.tool === "draw-line" ? [shapes(["points", "freehand"])]
      : ed.tool === "draw-structure" ? [shapes(STRUCTURE_KINDS[ed.structureKind].shape === "outline" ? ["points", "box", "circle", "freehand"] : ["points", "freehand"])]
      : [];
    // (what to put down first, then how to draw it)
    return [...kit.choices.map(c => <Chip key={c.id} active={matches(ed, c)} color={c.color} onClick={() => drawChoice(c)} testid={c.id}>{c.icon}{c.label}</Chip>), ...how];
  }
  switch (ed.tool) {
      case "select":
        // What a drag on the map does: move the map, or draw a box to select things
        return [
          <div key="drag" className="flex shrink-0 gap-0.5 glass ring-1 ring-white/10 rounded-full p-0.5" role="radiogroup" aria-label="Drag on the map">
            <span className="pl-2 pr-1 self-center text-[11px] text-zinc-400 whitespace-nowrap touch:hidden">Dragging the map:</span>
            {([[false, "Moves it", <Hand key="i" size={13} />, "drag-pan"], [true, "Draws a box to select", <BoxSelect key="i" size={13} />, "drag-select"]] as const).map(([on, label, icon, id]) => (
              <button key={id} role="radio" aria-checked={ed.dragSelect === on} data-testid={id} title={on ? "Drag a box around things to select them (Shift+drag)" : "Drag to move the map"} onClick={() => set({ dragSelect: on })} className={`flex items-center gap-1 px-2 py-0.5 touch:py-1.5 touch:px-2.5 touch:text-[13px] whitespace-nowrap rounded-full text-xs font-semibold ${ed.dragSelect === on ? "bg-orange-500 text-zinc-950" : "text-zinc-300 hover:bg-white/[0.09]"}`}>
                {icon}{label}
              </button>
            ))}
          </div>
        ];
      case "add-hole":
      case "add-tee":
        return TEE_ORDER.map(l => <Chip key={l} active={ed.teeLevel === l} color={TEE_LEVELS[l].color} onClick={() => set({ teeLevel: l })} testid={`tee-level-${l}`}>{TEE_LEVELS[l].label}</Chip>);
      case "sculpt":
        return [
          <div key="ground" className="flex shrink-0 gap-0.5 glass ring-1 ring-white/10 rounded-full p-0.5 mr-1" role="radiogroup" aria-label="What the brush does">
            {GROUND_BRUSHES.map(g => (
              <button key={g.value} role="radio" aria-checked={ed.groundBrush === g.value} title={g.title} data-testid={`ground-${g.value}`} onClick={() => set({ groundBrush: g.value })} className={`px-2.5 py-0.5 touch:py-1.5 touch:px-3 touch:text-[13px] whitespace-nowrap rounded-full text-xs font-semibold ${ed.groundBrush === g.value ? "bg-orange-500 text-zinc-950" : "text-zinc-300 hover:bg-white/[0.09]"}`}>{g.label}</button>
            ))}
          </div>,
          <BrushSliders key="brush" ed={ed} />
        ];
      case "draw-area":
        return [shapes(["points", "box", "circle", "freehand", "paint"]), ...(ed.drawShape === "paint" ? [<BrushSliders key="brush" ed={ed} strength={false} />] : []), ...(Object.keys(AREA_KINDS) as AreaKind[]).map(k => <Chip key={k} active={ed.areaKind === k} color={AREA_KINDS[k].color} onClick={() => set({ areaKind: k })} testid={`area-kind-${k}`}>{AREA_KINDS[k].label.replace(/ \(.*\)/, "")}</Chip>)];
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
  if (ed.tool === "add-tee" || ed.tool === "add-basket") {
    const doc = getDoc();
    const click = touch ? "Tap" : "Click";
    if (ed.tool === "add-tee" && ed.holeToBasket) {
      const b = doc.items.find(i => i.id === ed.holeToBasket);
      const of = b && "holeId" in b && b.holeId ? ` hole ${holeLabel(doc, b.holeId)}'s` : " that";
      return `${click} where the new hole's tee goes. It will play to${of} basket.`;
    }
    const hole = doc.holes.find(h => h.id === ed.activeHoleId);
    if (!hole) return `Pick a hole first, then ${click.toLowerCase()} where its ${ed.tool === "add-tee" ? "new tee" : "new pin"} goes`;
    return ed.tool === "add-tee"
      ? `${click} where hole ${holeLabel(doc, hole.id)}'s ${TEE_LEVELS[ed.teeLevel].label.toLowerCase()} tee goes (same hole, another skill level)`
      : `${click} where hole ${holeLabel(doc, hole.id)}'s next pin position goes`;
  }
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
const STEP_TOOLS: Record<string, string[]> = {
  site: ["select", "paths", "water", "trees", "grass", "build", "ground", "measure"],
  design: ["select", "hole", "tee", "pin", "rules", "paths", "water", "trees", "grass", "build", "ground", "measure"],
  export: ["select"]
};

// (on a wide screen, each tool's name under its icon)
const BAR_BTN = "dg-toolbtn relative w-10 h-10 rounded-xl flex items-center justify-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400";

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
  const options = toolOptions(ed);
  const hint = toolHint(ed, touch);
  const main = STEP_TOOLS[ed.step] ?? STEP_TOOLS.design;
  const active = toolOf(ed)?.id;
  const shown = TOOLS.filter(t => main.includes(t.id) || t.id === active);
  const rest = TOOLS.filter(t => !shown.includes(t));
  const tool = (t: Tool, inMenu = false) => (
    <button
      key={t.id}
      title={`${t.label} (${t.key})`}
      aria-label={t.label}
      aria-pressed={active === t.id}
      data-tool={t.id}
      onClick={() => { pickTool(t); setMore(false); }}
      className={inMenu
        ? `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 ${active === t.id ? "bg-orange-500 text-zinc-950" : "text-zinc-200 hover:bg-white/[0.09]"}`
        : `${BAR_BTN} ${active === t.id ? "bg-orange-500 text-zinc-950" : "text-zinc-300 hover:bg-white/[0.09] hover:text-zinc-50"}`}
    >
      {t.icon}
      {inMenu ? <span className="flex-1">{t.short}</span> : <span className="dg-toolname">{t.short}</span>}
      <span className={inMenu ? "text-[11px] opacity-60 touch:hidden" : "absolute bottom-0.5 right-1 text-[8px] font-bold opacity-60 touch:hidden"}>{t.key}</span>
    </button>
  );
  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 z-20 max-w-[calc(100%-24px)]">
      {options && <div className="flex flex-wrap justify-center gap-1.5 max-w-[760px]" data-testid="tool-options">{options}</div>}
      {hint && <div className="text-xs text-zinc-100 glass backdrop-blur rounded-lg px-3 py-1.5 ring-1 ring-white/10 text-center" data-testid="tool-hint">{hint}</div>}
      <div className="flex items-center gap-0.5 max-w-full glass backdrop-blur rounded-2xl px-1.5 py-1.5 shadow-xl shadow-black/40 ring-1 ring-white/10" role="toolbar" aria-label="Tools" data-testid="tool-bar">
        {shown.map((t, i) => (
          <div key={t.id} className="flex items-center shrink-0">
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
