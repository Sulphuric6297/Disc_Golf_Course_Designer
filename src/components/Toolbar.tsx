// The tools along the bottom of the map, with the active tool's options and a hint above them.
import type { ReactNode } from "react";
import { Armchair, CircleDot, MousePointer2, Pentagon, RectangleHorizontal, Redo2, Route, Ruler, Signpost, Spline, Target, TreeDeciduous, Type, Undo2 } from "lucide-react";
import { AMENITY_KINDS, AREA_KINDS, LINE_KINDS, TEE_LEVELS, TEE_ORDER } from "../constants";
import { useCourse, useEditor } from "../state/course";
import type { AmenityKind, AreaKind, LineKind, ToolMode, TreeKind } from "../types";

export const TOOLS: { mode: ToolMode; key: string; label: string; icon: ReactNode; group: number }[] = [
  { mode: "select", key: "V", label: "Select and move", icon: <MousePointer2 size={18} />, group: 0 },
  { mode: "add-hole", key: "H", label: "New hole: click the tee, then the basket", icon: <Route size={18} />, group: 1 },
  { mode: "add-tee", key: "T", label: "Another tee for this hole", icon: <RectangleHorizontal size={18} />, group: 1 },
  { mode: "add-basket", key: "B", label: "Another pin position for this hole", icon: <Target size={18} />, group: 1 },
  { mode: "add-mando", key: "M", label: "Mandatory (mando)", icon: <Signpost size={18} />, group: 2 },
  { mode: "add-dropzone", key: "Z", label: "Drop zone", icon: <CircleDot size={18} />, group: 2 },
  { mode: "draw-area", key: "O", label: "Draw an area: OB, hazard, water, fairway, woods…", icon: <Pentagon size={18} />, group: 2 },
  { mode: "draw-line", key: "L", label: "Draw a line: OB line, path, road, fence, stream…", icon: <Spline size={18} />, group: 2 },
  { mode: "add-tree", key: "R", label: "Tree", icon: <TreeDeciduous size={18} />, group: 3 },
  { mode: "add-amenity", key: "A", label: "Bench, trash can, sign, parking…", icon: <Armchair size={18} />, group: 3 },
  { mode: "add-label", key: "K", label: "Text label", icon: <Type size={18} />, group: 3 },
  { mode: "measure", key: "D", label: "Measure distance and elevation", icon: <Ruler size={18} />, group: 4 }
];

const HINTS: Partial<Record<ToolMode, string>> = {
  "add-hole": "Click where the tee goes, then where the basket goes. Keep going for the next hole · Esc when done",
  "add-tee": "Click to add another tee (another color) to the selected hole",
  "add-basket": "Click to add another pin position (B, C…) to the selected hole",
  "add-mando": "Click to place a mando; turn its arrow to the direction of play, and pick which side the disc must pass",
  "add-dropzone": "Click to place a drop zone",
  "draw-area": "Click the corners · double-click or Enter to finish · Backspace removes the last point · Esc cancels",
  "draw-line": "Click along the line · double-click or Enter to finish · Backspace removes the last point · Esc cancels",
  "add-tree": "Click to plant trees",
  "add-amenity": "Click to place it",
  "add-label": "Click to place a label, then type its text in the panel",
  measure: "Click two points for distance and elevation change · Shift+click to keep going"
};

const Chip = ({ active, onClick, children, color, testid }: { active: boolean; onClick: () => void; children: ReactNode; color?: string; testid?: string }) => (
  <button
    onClick={onClick}
    data-testid={testid}
    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border transition-colors ${active ? "bg-zinc-100 text-zinc-900 border-white" : "bg-zinc-800/90 text-zinc-300 border-zinc-700 hover:border-zinc-500"}`}
  >
    {color && <span className="w-2.5 h-2.5 rounded-full border border-black/30" style={{ background: color }} />}
    {children}
  </button>
);

export function Toolbar() {
  const ed = useEditor();
  const canUndo = useCourse(s => s.past.length > 0);
  const canRedo = useCourse(s => s.future.length > 0);
  const undo = useCourse(s => s.undo);
  const redo = useCourse(s => s.redo);
  if (ed.viewOnly || ed.teeView) return null;
  const set = ed.set;
  const options = (() => {
    switch (ed.tool) {
      case "add-hole":
      case "add-tee":
        return TEE_ORDER.map(l => <Chip key={l} active={ed.teeLevel === l} color={TEE_LEVELS[l].color} onClick={() => set({ teeLevel: l })} testid={`tee-level-${l}`}>{TEE_LEVELS[l].label}</Chip>);
      case "draw-area":
        return (Object.keys(AREA_KINDS) as AreaKind[]).map(k => <Chip key={k} active={ed.areaKind === k} color={AREA_KINDS[k].color} onClick={() => set({ areaKind: k })} testid={`area-kind-${k}`}>{AREA_KINDS[k].label.replace(/ \(.*\)/, "")}</Chip>);
      case "draw-line":
        return (Object.keys(LINE_KINDS) as LineKind[]).map(k => <Chip key={k} active={ed.lineKind === k} color={LINE_KINDS[k].color} onClick={() => set({ lineKind: k })} testid={`line-kind-${k}`}>{LINE_KINDS[k].label}</Chip>);
      case "add-amenity":
        return (Object.keys(AMENITY_KINDS) as AmenityKind[]).map(k => <Chip key={k} active={ed.amenityKind === k} color={AMENITY_KINDS[k].color} onClick={() => set({ amenityKind: k })}>{AMENITY_KINDS[k].label}</Chip>);
      case "add-tree":
        return (["deciduous", "conifer", "palm", "bush"] as TreeKind[]).map(k => <Chip key={k} active={ed.treeKind === k} onClick={() => set({ treeKind: k })}>{k === "deciduous" ? "Leafy tree" : k === "conifer" ? "Pine" : k === "palm" ? "Palm" : "Bush"}</Chip>);
      default:
        return null;
    }
  })();
  const hint = ed.tool === "select" ? "Drag to pan · scroll or pinch to zoom · right-drag or Shift+drag to turn and tilt" : HINTS[ed.tool];
  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 z-20 max-w-[calc(100%-24px)]">
      {options && <div className="flex flex-wrap justify-center gap-1.5 max-w-[760px]" data-testid="tool-options">{options}</div>}
      {hint && <div className="text-xs text-zinc-100 bg-zinc-900/85 backdrop-blur rounded-lg px-3 py-1.5 border border-zinc-700/50 text-center" data-testid="tool-hint">{hint}</div>}
      <div className="flex items-center gap-1 bg-zinc-900/95 backdrop-blur border border-zinc-700/70 rounded-2xl px-2 py-1.5 shadow-2xl" role="toolbar" aria-label="Tools">
        {TOOLS.map((t, i) => (
          <div key={t.mode} className="flex items-center">
            {i > 0 && TOOLS[i - 1].group !== t.group && <div className="w-px h-6 bg-zinc-700 mx-1" />}
            <button
              title={`${t.label} (${t.key})`}
              aria-label={t.label}
              aria-pressed={ed.tool === t.mode}
              data-tool={t.mode}
              onClick={() => set({ tool: t.mode })}
              className={`relative w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${ed.tool === t.mode ? "bg-orange-500 text-white shadow-lg" : "text-zinc-300 hover:bg-zinc-800 hover:text-white"}`}
            >
              {t.icon}
              <span className="absolute bottom-0.5 right-1 text-[8px] font-bold opacity-60">{t.key}</span>
            </button>
          </div>
        ))}
        <div className="w-px h-6 bg-zinc-700 mx-1" />
        <button title="Undo (Ctrl+Z)" aria-label="Undo" disabled={!canUndo} onClick={undo} className="w-10 h-10 rounded-xl flex items-center justify-center text-zinc-300 hover:bg-zinc-800 disabled:opacity-30"><Undo2 size={18} /></button>
        <button title="Redo (Ctrl+Shift+Z)" aria-label="Redo" disabled={!canRedo} onClick={redo} className="w-10 h-10 rounded-xl flex items-center justify-center text-zinc-300 hover:bg-zinc-800 disabled:opacity-30"><Redo2 size={18} /></button>
      </div>
    </div>
  );
}
