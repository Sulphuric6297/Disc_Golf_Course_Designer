import type { AreaKind, CourseDoc, LineKind, P, ToolMode, DrawShape, StructureKind } from "../types";
import type { HoleStats, SafetyIssue } from "../lib/holeStats";

export type { P };
export type Rect = { x: number; y: number; width: number; height: number };
export type ContourSegment = { x1: number; y1: number; x2: number; y2: number; level: number };

/** What the ground layer draws. Plan units are feet; plan (x, y) is 3D (x, z), Y up. */
export type GroundDoc = {
  canvas: { width: number; height: number };
  unitsPerFoot: number;
  gridSize: number;
  showGrid: boolean;
  heights: Record<string, number>;
  terrain: { min: number; max: number; relief: number };
  background: { url: string | null; rect: Rect; opacity: number };
  overlay: "off" | "contours" | "shaded";
  contours: { segments: ContourSegment[]; interval: number };
  shadeUrl: string | null;
  /** Real-scale grass, paving and soil texture over the aerial photo, where the photo shows them. */
  groundDetail: boolean;
  groundPaint: Record<string, number>;
  /** Color of the ground where there is no photo (the map theme's rough). */
  groundColor: string;
};

/** Everything the map view draws. */
export type ViewDoc = GroundDoc & {
  course: CourseDoc;
  /** Numbers for each hole in the active layout (lengths, the throw line used). */
  stats: HoleStats[];
  /** The hole being edited: its doglegs and fairway width get handles. */
  activeHoleId: string | null;
  /** Problems to pin on the map (Review step), or none. */
  issues: SafetyIssue[] | null;
  /** The course's sun (its light settings): compass direction it shines from, height above the
   * horizon (degrees), how dark the shadows are (0..1) and the overall brightness (-0.3..0.3). */
  sun: { azimuth: number; altitude: number; shadows?: number; light?: number } | null;
};

/** The active tool, as far as the map view cares. */
export type ViewTool = {
  mode: ToolMode;
  areaKind: AreaKind;
  lineKind: LineKind;
  /** What the Build tool draws (along a line, or an outline). */
  structureKind?: StructureKind;
  /** How areas and lines are drawn. */
  shape: DrawShape;
  /** Select: a drag on the map draws a box to pick things with (instead of moving the map). */
  dragSelect?: boolean;
};

export type ViewInfo = {
  /** Compass heading of the top of the screen, degrees clockwise from north. */
  heading: number;
  /** 0 = looking straight down. */
  tiltDeg: number;
  /** On-screen pixels per foot at the center of the view. */
  pxPerUnit: number;
  width: number;
  height: number;
};

export type ViewCallbacks = {
  /** A thing picked (or nothing); `add`: Shift+click, into or out of the things picked together. */
  onSelect: (id: string | null, add?: boolean) => void;
  /** What a drag box took in; `add`: with what was picked already. */
  onBoxSelect: (ids: string[], add: boolean) => void;
  /** Live: the things picked together moved by (dx, dy) from where they were in `base`. */
  onMoveGroup: (base: CourseDoc, ids: string[], dx: number, dy: number) => void;
  /** A click with a placing tool (tee, basket, mando, drop zone, tree, amenity, label). */
  onPlace: (mode: ToolMode, p: P) => void;
  /** A new hole: where its tee and basket go. */
  onHole: (tee: P, basket: P) => void;
  /** An area, line or built thing finished drawing. */
  onDrawn: (kind: "area" | "line" | "structure", points: P[], opts?: { straight?: boolean }) => void;
  /** Live edits while dragging (no undo step); onCommit ends the gesture. */
  onChange: (id: string, patch: Record<string, unknown>) => void;
  /** Live edits to a hole (doglegs, fairway width). */
  onHoleChange: (holeId: string, patch: Record<string, unknown>) => void;
  onCommit: () => void;
  onHover: (p: P | null) => void;
  onPose: (pose: "top" | "tilt") => void;
  /** Tee view: moved to another hole with the arrow keys, or closed. */
  onTeeView: (holeId: string | null) => void;
  onContextMenu: (info: { clientX: number; clientY: number; itemId: string | null; ground: P | null }) => void;
  onDrawProgress: (points: number) => void;
  /** Plotting a hole's line by hand ended (finished or cancelled). */
  onPlotEnd: () => void;
  /** Marking a stretch of OB along a line ended (marked or cancelled). */
  onObPickEnd: () => void;
  /** Trees measured from the air kept standing where they'd be cleared, or taken out (one undo step). */
  onLidar: (patch: { kept?: number[]; removed?: number[] }) => void;
};
