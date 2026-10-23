// The map view: one 3D scene that is a flat-looking map when you look straight down and a 3D
// model of the course when you tilt it (from the Security Camera Planner's map view). Navigation
// works like a web map (drag to pan, scroll or pinch to zoom at the cursor, right-drag or
// Ctrl/Shift-drag to rotate and tilt); editing works the same at any angle: click to place, drag
// things to move them, and drag the handles on the selection (doglegs, fairway width, corners).
// It can also look from a tee down its hole, and fly over a hole.
//
// Plan (x, y) is world (x, z) with Y up; plan units are feet.
import { BRUSH_SECTION, TREE_PATCH } from "../lib/view";
import * as THREE from "three";
import CameraControls from "camera-controls";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { Sky } from "three/examples/jsm/objects/Sky.js";
import { INK, MANDO, RESTRICTED, amenitySymbol, dropZoneSymbol, symbolSvg } from "../lib/symbols";
import { AMENITY_KINDS, AREA_KINDS, CIRCLE_ONE_FT, EYE_HEIGHT_FT, LINE_KINDS, OBJECT_ELEVATION_OFFSET, PATH_SURFACES, STRUCTURE_KINDS, TEE_LEVELS, clamp } from "../constants";
import { FAIRWAY_STATIONS, beyondSides, areaObEdges, areaRing, isRing, ringStretch, sharedWalks, teeLines, walkRoutes, autoWalks, areaCurves, areaPath, basketFor, basketHoles, curves, fairwayOutline, mergeStretches, obFor, obPicked, obRanges, widthAlong, widthFactors, widthsWithEnd, widthsWithPoint, widthsWithout, widthVaries, holeLabel, fairwayShiftAt, fairwayWidthAt, linePath, stationsOf, withStation, withoutStation, holeBaskets, holeNumber, holeTees, teeAim, throwLine } from "../lib/course";
import { boundsOf, centroid, dist, distanceToPath, inBounds, nearestAlong, offsetPath, pathLength, pointAlong, pointBoundsGap, pointInPolygon, polygonArea, simplify, smoothPath, subPath } from "../lib/geom";
import { parForDistance } from "../lib/holeStats";
import { heightAt } from "../lib/terrainGrid";
import { conifersOf, treeMixOf } from "../lib/landscapes";
import { fmtArea, fmtDist, fmtElev } from "../lib/units";
import { BASKET_BAND, createAmenity, createBasket, createDropZone, createMando, createTeePad, fitTeePad } from "../three/courseModels";
import { drapedPoints, drapedPolygon, drapedRibbon } from "../three/drape";
import { dab, strokeOutline } from "../lib/brush";
import { disposeObjectDeep } from "../three/dispose";
import { create3dTree, getTreeSignature } from "../three/trees";
import { createMeasuredWoods, createUnderbrush, createWoods, createWoodsWhere } from "../three/woods";
import { standingTrees, grownTree, grownTrees } from "../lib/lidar";
import type { WoodedGrid } from "../lib/forest";
import { autoFlight, flightClock, flyoverOf, keyFlight, keysFromFlight, type Air, type Canopy, type Crown } from "../lib/flight";
import { VIDEO_HOLD, titleStrength } from "../lib/video";
import { drawOverlay, holeTitle, overlayShow, type HoleTitle } from "./flyTitle";
import { forestDetail, type Forest, type TreeSpot } from "../three/treeKit";
import { GRASS, Grass, type GrassQuality } from "../three/grass";
import { Tufts } from "../three/tufts";
import { setWaterSky, waterMaterial, waterUniforms } from "../three/water";
import { createStructure } from "../three/structures";
import { isLineKind, orientedBox, structureBounds, structureHeight, structurePath, structureWidth, turnShape } from "../lib/structures";
import type { AmenityItem, AreaItem, BasketItem, CourseItem, FlyKey, Hole, LabelItem, LineItem, MandoItem, StructureItem, TeeItem, TeeLevel, TreeItem, BrushKind, PathTier } from "../types";
import { Ground } from "./ground";
import { grassMaps, grassTerrain } from "./grassMaps";
import type { FlightFrames, FlyoverVideo, FrameInfo, RecordOptions } from "./flyoverVideo";
import type { LocationMark, P, ViewCallbacks, ViewDoc, ViewInfo, ViewTool } from "./types";

CameraControls.install({ THREE });
const { ACTION } = CameraControls;

const DEG = Math.PI / 180;
// The light of ez-tree's demo (photographed leaves and bark read true under it): a strong sun, a
// soft even sky, and Neutral tone mapping at twice the exposure
const SUN_INTENSITY = 5;
const HEMI_INTENSITY = 0.5;
const EXPOSURE = 2;
const CLICK_PX = 4;
/** A finger moves a little in a tap (more than a mouse in a click). */
const TOUCH_SLOP = 10;
/** Holding a finger this long on an item opens its menu (the touch right-click). */
const LONG_PRESS_MS = 500;
const TILT_TOP = 8 * DEG;
const DEFAULT_TILT = 55 * DEG;
const MAX_TILT = 84 * DEG;
/** The map's lens: narrow looking straight down (map-like), wider tilted (a real perspective). */
const FOV_TOP = 30, FOV_TILT = 45;
const SELECT = "#22d3ee";
const LIFT = 0.45;

type Drag = { move: (e: PointerEvent) => void; end: (e: PointerEvent) => void };
type Handle = {
  el: HTMLDivElement;
  kind: string;
  index?: number;
  world: () => THREE.Vector3 | null;
  start: (e: PointerEvent) => Drag | null;
  visible?: () => boolean;
};
type Overlay = { el: HTMLDivElement; anchor: THREE.Vector3; dy: number; sig: string; rank: number; w?: number; h?: number; minPx?: number; key?: string };

const STYLE = `
.dg-layer{position:absolute;inset:0;pointer-events:none;overflow:hidden}
.dg-ov{position:absolute;left:0;top:0;will-change:transform;white-space:nowrap}
.dg-tee{pointer-events:auto;cursor:move;min-width:22px;height:22px;padding:0 5px;border-radius:999px;display:flex;align-items:center;justify-content:center;background:var(--c);color:var(--ink);font:800 12px/1 Oswald,Inter,system-ui,sans-serif;border:2px solid rgba(15,23,42,.85);box-shadow:0 1px 4px rgba(0,0,0,.5)}
.dg-basket .dg-shared{position:absolute;top:-15px;left:50%;transform:translateX(-50%);font:800 10px/1 Oswald,Inter,system-ui,sans-serif;font-style:normal;color:#fff;background:#0f172a;border-radius:6px;padding:2px 4px;white-space:nowrap}
.dg-tee.alt{min-width:15px;height:15px;font-size:9px;padding:0 3px;opacity:.9}
.dg-tee.off{min-width:11px;height:11px;font-size:0;padding:0;border-width:1.5px;opacity:.5}
.dg-basket.off{opacity:.45;scale:.7}
.dg-tee.sel,.dg-basket.sel,.dg-chip.sel{outline:3px solid ${SELECT};outline-offset:1px}
.dg-basket{pointer-events:auto;cursor:move;width:20px;height:20px;border-radius:50%;background:#0f172a;border:2.5px solid var(--c);display:flex;align-items:center;justify-content:center;box-shadow:0 1px 4px rgba(0,0,0,.5)}
.dg-basket::after{content:"";width:8px;height:8px;border-radius:50%;background:var(--c)}
.dg-basket b{position:absolute;left:15px;top:-7px;font:800 9px/1 Inter,system-ui,sans-serif;color:#fff;background:#0f172a;border-radius:4px;padding:2px 3px}
.dg-dist{pointer-events:none;padding:2px 7px;border-radius:6px;background:rgba(15,23,42,.82);color:#f8fafc;font:700 11px Inter,system-ui,sans-serif;box-shadow:0 1px 3px rgba(0,0,0,.4)}
.dg-dist i{font-style:normal;color:#fde68a;margin-left:5px}
.dg-sym{pointer-events:auto;cursor:move;filter:drop-shadow(0 1px 2px rgba(0,0,0,.55));border-radius:6px}
.dg-sym.sel{outline:3px solid ${SELECT};outline-offset:2px}
.dg-chip{pointer-events:auto;cursor:move;min-width:18px;height:18px;padding:0 4px;border-radius:5px;display:flex;align-items:center;justify-content:center;color:#fff;font:800 10px/1 Inter,system-ui,sans-serif;border:1.5px solid rgba(255,255,255,.9);box-shadow:0 1px 3px rgba(0,0,0,.5)}
.dg-text{pointer-events:auto;cursor:move;font-weight:700;font-family:Inter,system-ui,sans-serif;text-shadow:0 0 3px #000,0 0 2px #000}
.dg-area{pointer-events:none;font:700 11px Inter,system-ui,sans-serif;color:#fff;text-shadow:0 0 3px #000,0 0 2px #000;opacity:.9}
.dg-issue{pointer-events:auto;cursor:help;width:20px;height:20px;border-radius:50%;display:flex;align-items:center;justify-content:center;font:900 12px/1 Inter,system-ui,sans-serif;color:#fff;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.55)}
.dg-measure{pointer-events:none;padding:1px 6px;border-radius:6px;background:#facc15;color:#1c1917;font:700 11px Inter,system-ui,sans-serif;box-shadow:0 1px 3px rgba(0,0,0,.4)}
.dg-measure.total{background:#1c1917;color:#facc15}
.dg-me{pointer-events:none;width:20px;height:20px;border-radius:50%;background:#0a84ff;border:3px solid #fff;box-shadow:0 1px 6px rgba(0,0,0,.55);position:absolute}
.dg-me::after{content:"";position:absolute;inset:-9px;border-radius:50%;background:rgba(10,132,255,.35);animation:dgme 2s ease-out infinite;z-index:-1}
.dg-me.dim{background:#8e8e93}.dg-me.dim::after{display:none}
.dg-me i{position:absolute;left:50%;top:50%;width:64px;height:64px;margin:-32px 0 0 -32px;border-radius:50%;background:conic-gradient(from -28deg,rgba(10,132,255,.55),rgba(10,132,255,0) 56deg,rgba(10,132,255,0) 304deg,rgba(10,132,255,.55));-webkit-mask:radial-gradient(circle,#000 30%,transparent 72%);mask:radial-gradient(circle,#000 30%,transparent 72%);z-index:-2}
.dg-me.dim i{display:none}
@keyframes dgme{0%{transform:scale(.6);opacity:1}100%{transform:scale(1.6);opacity:0}}
.dg-me-tag{pointer-events:none;padding:3px 8px;border-radius:999px;background:rgba(15,23,20,.82);color:#f8fafc;font:700 11.5px Inter,system-ui,sans-serif;box-shadow:0 1px 4px rgba(0,0,0,.45);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px)}
.dg-measure.live{background:rgba(28,25,23,.72);color:#fde68a;box-shadow:none}
.dg-mpt{pointer-events:none;width:12px;height:12px;border-radius:50%;background:#facc15;border:2.5px solid #1c1917;box-shadow:0 1px 4px rgba(0,0,0,.5)}
.dg-mpt.live{background:#fff;opacity:.85}
.dg-h{position:absolute;left:0;top:0;pointer-events:auto;will-change:translate;box-sizing:border-box;touch-action:none}
.dg-h[data-handle=corner],.dg-h[data-handle=dogleg]{width:14px;height:14px;border-radius:50%;background:#fff;border:2.5px solid #0891b2;cursor:grab;box-shadow:0 1px 3px rgba(0,0,0,.5)}
.dg-h[data-handle=dogleg]{border-color:#f59e0b}
.dg-h[data-handle=extend]{width:15px;height:15px;border-radius:50%;background:#fff;border:2px solid #f97316;cursor:copy;display:flex;align-items:center;justify-content:center;font:700 12px/1 Inter,sans-serif;color:#f97316}.dg-h[data-handle=extend]::after{content:"+"}
.dg-h[data-handle=walkout],.dg-h[data-handle=walkin]{width:13px;height:13px;border-radius:3px;background:#e2e8f0;border:2px dashed #475569;cursor:grab;box-shadow:0 1px 3px rgba(0,0,0,.5)}
.dg-h[data-handle=flykey]{width:20px;height:20px;border-radius:6px;background:#0284c7;border:2px solid #fff;color:#fff;font:800 11px/16px Inter,system-ui,sans-serif;text-align:center;cursor:grab;box-shadow:0 1px 4px rgba(0,0,0,.5)}
.dg-h[data-handle=flykey]::after{content:attr(data-n)}
.dg-h[data-handle=flylook]{width:12px;height:12px;border-radius:50%;border:2.5px solid #38bdf8;background:rgba(15,23,42,.35);cursor:grab}
.dg-h[data-handle=mid]{width:11px;height:11px;border-radius:50%;background:rgba(255,255,255,.6);border:2px solid #0891b2;cursor:copy}
.dg-h[data-handle=mid][data-kind=line]{border-color:#f59e0b}
.dg-h[data-handle=width]{width:13px;height:13px;border-radius:3px;background:#fff;border:2.5px solid #16a34a;cursor:ew-resize;box-shadow:0 1px 3px rgba(0,0,0,.5)}
.dg-h[data-handle=linewidth]{width:12px;height:12px;border-radius:3px;background:#fff;border:2.5px solid #0284c7;cursor:ew-resize;box-shadow:0 1px 3px rgba(0,0,0,.5)}
.dg-h[data-handle=widen]{width:11px;height:11px;border-radius:50%;background:rgba(255,255,255,.85);border:1.5px solid #16a34a;cursor:copy;display:flex;align-items:center;justify-content:center;font:700 10px/1 Inter,sans-serif;color:#16a34a}.dg-h[data-handle=widen]::after{content:"+"}
.dg-h[data-handle=rotate]{width:24px;height:24px;border-radius:50%;background:#fff;border:2.5px solid #2563eb;cursor:grab;box-shadow:0 1px 3px rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;color:#2563eb;font:900 14px system-ui}
.dg-h[data-handle=radius]{width:15px;height:15px;border-radius:50%;background:#16a34a;border:2.5px solid #fff;cursor:ew-resize;box-shadow:0 1px 3px rgba(0,0,0,.5)}
.dg-h[data-handle=height]{width:16px;height:22px;border-radius:5px;background:#f59e0b;border:2.5px solid #fff;cursor:ns-resize;box-shadow:0 1px 3px rgba(0,0,0,.5)}
.dg-marquee{position:absolute;left:0;top:0;pointer-events:none;border:1.5px dashed #f59e0b;background:rgba(245,158,11,.12);border-radius:2px;z-index:5}
.dg-stump{width:12px;height:12px;border-radius:50%;background:#8b5e3c;border:2.5px solid #f3dfc1;box-shadow:0 1px 3px rgba(0,0,0,.55);cursor:pointer;pointer-events:auto}
.dg-stump:hover{transform:scale(1.25)}
.dg-stump.kept{background:rgba(34,197,94,.35);border-color:#22c55e}
.dg-h[data-handle=obend]{width:13px;height:13px;border-radius:3px;background:#fff;border:3px solid #dc2626;cursor:grab;box-shadow:0 1px 3px rgba(0,0,0,.5)}
.dg-h[data-handle=obmark]{width:13px;height:13px;border-radius:50%;background:#dc2626;border:2.5px solid #fff;pointer-events:none;box-shadow:0 1px 3px rgba(0,0,0,.5)}
.dg-h[data-handle=draw]{width:10px;height:10px;border-radius:50%;background:#fff;border:2px solid #f59e0b;pointer-events:none}
.dg-h[data-handle=draw][data-index="0"]{width:14px;height:14px;pointer-events:auto;cursor:pointer;border-width:3px}
@media (pointer:coarse){.dg-h{transform-origin:center}.dg-h[data-handle]{scale:1.5}.dg-h[data-handle]::before{content:"";position:absolute;left:50%;top:50%;width:30px;height:30px;translate:-50% -50%;border-radius:50%}.dg-tee::before,.dg-basket::before,.dg-sym::before,.dg-chip::before{content:"";position:absolute;inset:-10px}}
`;

const lineMats = new Set<LineMaterial>();
/** A finger is the main pointer (handles are drawn bigger there). */
const COARSE = typeof matchMedia !== "undefined" && matchMedia("(pointer: coarse)").matches;

/** How high woods' trees reach, ft (the tallest of three/woods). */
/** How close to a trunk counts, ft (flyovers ease around trunks). */
const TRUNK_ROOM = 8;
/** A basket's height, ft, and how tall it shows on screen (px) once its badge gives way to it in 3D. */
const BASKET_FT = 4.6, BASKET_SEEN_PX = 24;
/** Squares the trees are filed by for flyovers, ft. */
const CROWN_CELL = 40;

/** A point on a smooth curve (Catmull-Rom) through points, `u` (0..1) of the way from point i to the next. */
const curveBetween = (pts: THREE.Vector3[], i: number, u: number, out: THREE.Vector3) => {
  const n = pts.length - 1;
  const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n, i)], c = pts[Math.min(n, i + 1)], d = pts[Math.min(n, i + 2)];
  const f = (p0: number, p1: number, p2: number, p3: number) => p1 + 0.5 * u * (p2 - p0 + u * (2 * p0 - 5 * p1 + 4 * p2 - p3 + u * (3 * (p1 - p2) + p3 - p0)));
  return out.set(f(a.x, b.x, c.x, d.x), f(a.y, b.y, c.y, d.y), f(a.z, b.z, c.z, d.z));
};

/** The painted map for the ground (a picture's URL) and where it shows woods. */
export type PaintedLook = { url: string; wooded: WoodedGrid | null };
/** A sharper painting of part of the site (see state/paintedGround: paintedDetail). */
export type PaintedDetailLook = { canvas: HTMLCanvasElement; rect: { x: number; y: number; width: number; height: number } };

const gridIds = new WeakMap<object, number>();
let nextGridId = 1;
/** A short name for a woods grid (it is only ever replaced, never changed). */
const idOfGrid = (g: object) => {
  if (!gridIds.has(g)) gridIds.set(g, nextGridId++);
  return gridIds.get(g)!;
};

/** The longest a flyover waits for the course to load before it flies anyway. */
const FLY_WAIT_MS = 15_000;
// Whether three.js's loaders still have textures on their way
let loadingTextures = 0;
THREE.DefaultLoadingManager.onStart = () => { loadingTextures++; };
THREE.DefaultLoadingManager.onLoad = () => { loadingTextures = 0; };
const texturesLoading = () => loadingTextures > 0;

export class CourseView {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: CameraControls;
  private sun = new THREE.DirectionalLight(0xfff6e5, SUN_INTENSITY);
  private hemi = new THREE.HemisphereLight(0xeef4ff, 0x6b6250, HEMI_INTENSITY);
  private ground: Ground;
  private itemsGroup = new THREE.Group();
  private shapesGroup = new THREE.Group();
  /** Other courses on the same ground: their holes, drawn faintly over this one's map. */
  private nearbyGroup = new THREE.Group();
  private fx = new THREE.Group();
  private labelsLayer: HTMLDivElement;
  private handlesLayer: HTMLDivElement;
  private objects = new Map<string, { obj: THREE.Object3D; sig: string }>();
  private shapes = new Map<string, { obj: THREE.Object3D; sig: string }>();
  private overlays = new Map<string, Overlay>();
  private handles: Handle[] = [];
  private handleKey = "";
  private selectionFx: THREE.Object3D | null = null;
  /** Things picked together (each outlined; dragging one moves them all). */
  private group: string[] = [];
  /** The box being drawn to pick things with. */
  private marquee: HTMLDivElement | null = null;
  private hoverFx: THREE.Object3D | null = null;
  private ghost: THREE.Object3D | null = null;
  private ghostKey = "";
  private lastCorner: { id: string; index: number; time: number } | null = null;
  private doc: ViewDoc | null = null;
  private heightsVersion = 0;
  private heightsRef: unknown = null;
  private selectedId: string | null = null;
  private hoverId: string | null = null;
  private tool: ViewTool = { mode: "select", areaKind: "ob", lineKind: "ob", shape: "points" };
  private teeLevel: TeeLevel = "blue";
  private raycaster = new THREE.Raycaster();
  private dirty = true;
  private shadowsDirty = true;
  private raf = 0;
  private clock = new THREE.Clock();
  private size = { width: 1, height: 1 };
  private pose: "top" | "tilt" = "top";
  private posePinned = false;
  private dragging = false;
  private spaceDown = false;
  private restoreLeft: (() => void) | null = null;
  private viewListeners = new Set<(info: ViewInfo) => void>();
  private lastViewKey = "";
  private fitted = false;
  private ro: ResizeObserver;
  private env: THREE.Texture;
  private hoverFrame = 0;
  private lastPointer: { x: number; y: number } | null = null;
  private disposers: (() => void)[] = [];
  private sky: THREE.Texture;
  // Drawing a new hole, area or line
  private holeStart: P | null = null;
  private drawPts: P[] = [];
  private cursor: P | null = null;
  /** A rectangle or circle being made with two clicks: where the first click was. */
  private shapeAnchor: { x: number; y: number; shape: "box" | "circle" } | null = null;
  private draft: THREE.Object3D | null = null;
  private draftLabel: HTMLDivElement | null = null;
  // Tee view and flyover
  private povCam = new THREE.PerspectiveCamera(62, 16 / 9, 0.3, 30000);
  private povHole: string | null = null;
  private povLook = { yaw: 0, pitch: 0 };
  /** A flight under way: `dur` s of path, played over `play` s (`at`: path time at a moment; see flightClock). */
  /** A flyover holds its first picture until the hole's detail and textures are in and a few
   * frames are drawn (so it looks right from the start), ten seconds at most. */
  private flyWait: { since: number; loaded: boolean; frames: number } | null = null;
  private detailReady: Promise<unknown> = Promise.resolve();
  private fly: { pts: THREE.Vector3[]; look: THREE.Vector3[]; fov: number[]; t: number; dur: number; play: number; at: (t: number) => number; done?: () => void; title?: HoleTitle } | null = null;
  /** A hole whose line is being plotted by hand, and its turns so far (from the tee). */
  private plotHole: string | null = null;
  /** Marking a stretch of OB along a line: the line, and where along it the stretch starts (0..1). */
  private obPick: { id: string; from: number | null; cut: boolean } | null = null;
  /** While marking a stretch round a ring: how far round the pointer has gone from its start (and
   * where it was last), which way the stretch goes; and the stretch shown so far. */
  private obTravel = { sum: 0, last: 0 };
  private obPreview: THREE.Object3D | null = null;
  /** The trees measured from the air that are cut down (cleared for play, or taken out), and those
   * kept standing where they would be (by index). */
  private lidarState: { stand: number[]; cut: number[]; kept: number[] } | null = null;
  /** Slow things (woods planted round the clearings) put off while dragging: done at its end. */
  private afterDrag = false;
  /** Woods planted so far (for tests: none while dragging, only those near what moved). */
  private plantings = 0;
  private lidarKey = "";
  /** Where the course clears the ground for play (fairways, tees, baskets, water, paths). */
  private clearedAt: (p: P, reach: number) => boolean = () => false;
  private plotPts: P[] = [];
  private lastPlotClick: { x: number; y: number; time: number } | null = null;
  /** The last press on a walk's end (a second one soon after resets it). */
  private lastWalkTap: { key: string; time: number } | null = null;
  /** The tee view's field of view, kept while a flight sets its own. */
  private povFov = 62;
  private skyBox: Sky;
  /** Grass blades near the camera, in 3D (see three/grass). */
  readonly grass = new Grass();
  /** Tufts of grass and wildflowers (ez-tree's demo's) among the blades. */
  readonly tufts = new Tufts(this.grass);
  private grassInputs: unknown[] = [];
  /** The sky as an environment for water to reflect (made again when the sun moves). */
  private skyEnv: THREE.WebGLRenderTarget | null = null;
  private skyEnvKey = "";
  private grassBuilt = 0;
  private grassTimer = 0;
  private lastSky = false;
  private readonly haze = new THREE.FogExp2(0xffffff, 0);
  private grassTerrainRef: unknown = null;
  private grassPhoto: unknown = null;
  private grassSetting: GrassQuality | "auto" = "auto";
  private wind = true;
  /** Drawn without a graphics card (software rendering): the grass starts off. */
  readonly software: boolean;
  /** A phone or small tablet (touch first, small screen). */
  readonly mobile: boolean;
  private maxRatio = 1;
  private tier = 0;
  private perfSamples: number[] = [];
  private fastWindows = 0;
  private lastRender = 0;
  /** The last tick drew a picture (two in a row: the gap between them is a real frame time). */
  private drewLastTick = false;
  /** Recordings under way (their frames come first: the screen is drawn less often meanwhile). */
  private recordings = 0;
  private adaptiveForced = false;
  private paused = false;
  private frames = 0;
  private povMarker: HTMLDivElement | null = null;
  private disposed = false;

  constructor(private container: HTMLDivElement, private cb: ViewCallbacks) {
    // (no preserveDrawingBuffer: snapshots render and read in one go, and keeping the buffer
    // costs frame rate on phone GPUs)
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    // Phones and tablets: a little less sharp (their screens are dense; every pixel costs)
    this.mobile = typeof matchMedia !== "undefined" && matchMedia("(pointer: coarse)").matches && Math.min(screen.width, screen.height) < 900;
    this.maxRatio = Math.min(window.devicePixelRatio || 1, this.mobile ? 1.5 : 2);
    this.renderer.setPixelRatio(this.maxRatio);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = EXPOSURE;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.shadowMap.autoUpdate = false;
    const canvas = this.renderer.domElement;
    canvas.style.position = "absolute";
    canvas.style.inset = "0";
    canvas.style.display = "block";
    container.appendChild(canvas);

    if (!document.getElementById("dg-view-style")) {
      const style = document.createElement("style");
      style.id = "dg-view-style";
      style.textContent = STYLE;
      document.head.appendChild(style);
    }
    this.labelsLayer = document.createElement("div");
    this.labelsLayer.className = "dg-layer";
    this.handlesLayer = document.createElement("div");
    this.handlesLayer.className = "dg-layer";
    container.appendChild(this.labelsLayer);
    container.appendChild(this.handlesLayer);

    // A dusky backdrop behind the site, the deep green of the woods (the app's palette)
    {
      const c = document.createElement("canvas");
      c.width = 2;
      c.height = 256;
      const g = c.getContext("2d")!;
      const grad = g.createLinearGradient(0, 0, 0, 256);
      grad.addColorStop(0, "#0e1810");
      grad.addColorStop(0.6, "#16261a");
      grad.addColorStop(1, "#203524");
      g.fillStyle = grad;
      g.fillRect(0, 0, 2, 256);
      this.sky = new THREE.CanvasTexture(c);
      this.sky.colorSpace = THREE.SRGBColorSpace;
      this.scene.background = this.sky;
    }
    // Daylight sky (a physical sky model lit by the course's sun) and the ground out to the
    // horizon, for the tilted view and the view from a tee
    {
      this.skyBox = new Sky();
      const sm = this.skyBox.material as THREE.ShaderMaterial;
      Object.assign(sm.uniforms, { turbidity: { value: 3.2 }, rayleigh: { value: 1.1 }, mieCoefficient: { value: 0.004 }, mieDirectionalG: { value: 0.82 } });
      // The model is bright: brought down to the scene's exposure
      sm.uniforms.uHaze = { value: new THREE.Color("#c4d0d9") };
      // Brought down to the scene's exposure, and melting into the haze at the horizon (where the
      // land fades into the same haze)
      sm.fragmentShader = sm.fragmentShader
        .replace("uniform vec3 up;", "uniform vec3 up;\nuniform vec3 uHaze;")
        .replace("#include <tonemapping_fragment>", "gl_FragColor.rgb = mix( uHaze, gl_FragColor.rgb * 0.46, smoothstep( -0.02, 0.2, direction.y ) );\n#include <tonemapping_fragment>");
      this.skyBox.renderOrder = -10;
      this.skyBox.visible = false;
      this.skyBox.frustumCulled = false;
      this.skyBox.raycast = () => {};
    }
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.env = pmrem.fromScene(new RoomEnvironment()).texture;
    pmrem.dispose();
    this.scene.environment = this.env;
    this.scene.add(this.hemi);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(this.mobile ? 1024 : 2048, this.mobile ? 1024 : 2048);
    this.scene.add(this.sun, this.sun.target);
    // Two lines no one sees, kept for good: three.js drops a shader once nothing uses it, and a
    // lone outline (a selected shape's, redrawn as it is dragged) would otherwise have the fat
    // lines' shaders built again on every move, seconds each on a slow graphics chip
    for (const dashed of [undefined, 1]) {
      const keep = this.fatLine([new THREE.Vector3(0, -5000, 0), new THREE.Vector3(0.01, -5000, 0)], "#000000", 1, { dashed, opacity: 0 });
      keep.frustumCulled = false;
      this.scene.add(keep);
    }

    this.camera = new THREE.PerspectiveCamera(30, 1, 0.5, 40000);
    this.controls = new CameraControls(this.camera, canvas);
    const c = this.controls;
    void c.setLookAt(800, 2400, 550, 800, 0, 550, false);
    c.mouseButtons.left = ACTION.NONE;
    c.mouseButtons.middle = ACTION.ROTATE;
    c.mouseButtons.right = ACTION.ROTATE;
    c.mouseButtons.wheel = ACTION.NONE;
    c.touches.one = ACTION.TOUCH_TRUCK;
    c.touches.two = ACTION.NONE; // (two fingers are handled here: see twoFingers)
    c.touches.three = ACTION.TOUCH_TRUCK;
    c.minPolarAngle = 0;
    c.maxPolarAngle = MAX_TILT;
    c.smoothTime = 0.16;
    c.draggingSmoothTime = 0.06;
    c.azimuthRotateSpeed = 0.7;
    c.polarRotateSpeed = 0.7;
    c.dollyToCursor = true;
    c.addEventListener("controlend", () => this.snapNorth());
    c.addEventListener("controlstart", () => { this.posePinned = false; this.autoFit = null; this.onUserMove?.(); });
    c.addEventListener("rest", () => { this.posePinned = false; });

    this.ground = new Ground(this.renderer, () => this.invalidate(true));
    this.scene.add(this.ground.group, this.shapesGroup, this.itemsGroup, this.nearbyGroup, this.fx, this.skyBox, this.grass.group, this.tufts.group);
    // (the scene and the items' group never move. A frame works out again only the woods' matrices
    // (their trees near the camera change); each item's are set as it's placed)
    this.scene.matrixAutoUpdate = false;
    this.itemsGroup.matrixAutoUpdate = false;
    this.itemsGroup.updateMatrixWorld = force => {
      for (const c of this.itemsGroup.children) if (!c.userData.placed || force) c.updateMatrixWorld(force);
    };
    {
      const gl = this.renderer.getContext();
      const info = gl.getExtension("WEBGL_debug_renderer_info");
      const name = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : "";
      this.software = /swiftshader|llvmpipe|software|basic render/i.test(name);
      // Without a graphics card, or on a phone, fewer trees in full detail
      if (this.software) forestDetail.nearFt = 70;
      else if (this.mobile) forestDetail.nearFt = 150;
    }

    const on = <K extends keyof HTMLElementEventMap>(el: HTMLElement | Window, type: K, fn: (e: HTMLElementEventMap[K]) => void, opts?: AddEventListenerOptions) => {
      el.addEventListener(type, fn as EventListener, opts);
      this.disposers.push(() => el.removeEventListener(type, fn as EventListener, opts));
    };
    on(container, "pointerdown", e => this.onPointerDown(e), { capture: true });
    on(container, "wheel", e => this.onWheel(e), { capture: true, passive: false });
    on(container, "pointermove", e => this.onHoverMove(e));
    on(container, "pointerleave", () => { this.lastPointer = null; this.cb.onHover(null); this.setHover(null); this.updateGhost(null); this.invalidate(); });
    on(container, "dblclick", e => this.onDoubleClick(e));
    on(window, "pointerup", e => this.touchUp(e));
    on(window, "pointercancel", e => this.touchUp(e));
    on(container, "contextmenu", e => e.preventDefault());
    on(window, "keydown", e => { if (e.key === " " && !(e.target as HTMLElement)?.closest?.("input,textarea,select")) this.spaceDown = true; });
    on(window, "keyup", e => { if (e.key === " ") this.spaceDown = false; });

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(container);
    this.resize();
    this.loop();
  }

  // ------------------------------------------------------------------ public API

  setDoc(doc: ViewDoc) {
    const prev = this.doc;
    this.doc = doc;
    if (doc.heights !== this.heightsRef) {
      this.heightsRef = doc.heights;
      this.heightsVersion++;
    }
    const groundChanged = this.ground.update(doc);
    this.syncItems();
    this.syncShapes();
    this.syncSelection();
    this.syncOverlays();
    this.syncHandles();
    this.updateLimits();
    this.placeSun();
    if (groundChanged || !prev || prev.course.items !== doc.course.items || prev.sun !== doc.sun) this.shadowsDirty = true;
    if (!this.fitted && this.size.width > 1) {
      this.fitted = true;
      this.fitCourse(false);
    }
    if (this.holeStart || this.drawPts.length) this.drawDraft();
    this.invalidate();
  }

  setGroup(ids: string[]) {
    if (ids.length === this.group.length && ids.every((x, i) => x === this.group[i])) return;
    this.group = ids;
    this.syncSelection();
    this.syncOverlays();
    this.invalidate();
  }

  /** Other courses on the same ground: each one's holes (tee to basket, in this course's plan
   * coordinates) in its color. */
  setNearby(courses: { color: string; lines: P[][] }[]) {
    for (const o of [...this.nearbyGroup.children]) { this.nearbyGroup.remove(o); disposeObjectDeep(o); }
    // (a hole's number, beside its tee, in the course's color)
    const number = (n: number, color: string, p: P) => {
      const cv = document.createElement("canvas");
      cv.width = cv.height = 64;
      const g = cv.getContext("2d")!;
      g.fillStyle = color;
      g.beginPath(); g.arc(32, 32, 30, 0, Math.PI * 2); g.fill();
      g.fillStyle = "#111"; g.font = "bold 34px sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
      g.fillText(String(n), 32, 34);
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), depthTest: false, transparent: true }));
      s.scale.set(16, 16, 1);
      s.position.set(p.x, this.h(p.x, p.y) + 10, p.y);
      s.renderOrder = 8;
      return s;
    };
    for (const c of courses) {
      c.lines.forEach((l, i) => { if (l.length >= 2) this.nearbyGroup.add(number(i + 1, c.color, l[0])); });
      for (const l of c.lines) {
        if (l.length < 2) continue;
        this.nearbyGroup.add(this.fatLine(this.drapeLine(l, LIFT + 0.3), c.color, 3, { dashed: 10, opacity: 0.9, order: 6 }));
        for (const [p, r] of [[l[0], 5], [l[l.length - 1], 4]] as const) {
          const dot = new THREE.Mesh(new THREE.CircleGeometry(r, 18), new THREE.MeshBasicMaterial({ color: c.color, transparent: true, opacity: 0.95, depthTest: false }));
          dot.rotation.x = -Math.PI / 2;
          dot.position.set(p.x, this.h(p.x, p.y) + LIFT + 0.4, p.y);
          dot.renderOrder = 7;
          this.nearbyGroup.add(dot);
        }
      }
    }
    this.invalidate();
  }

  /** View only (a course shared to look at): no handles on the selection. */
  private readOnly = false;
  setReadOnly(on: boolean) {
    if (on === this.readOnly) return;
    this.readOnly = on;
    this.syncHandles();
    if (this.doc) { this.syncShapes(); this.syncOverlays(); this.invalidate(); }
  }

  /** The stumps of cut-down trees everywhere (close enough to see), not only on the hole picked. */
  private showStumps = false;
  setShowStumps(on: boolean) {
    if (on === this.showStumps) return;
    this.showStumps = on;
    this.invalidate();
  }

  /** The hole a thing is part of (its tee, its basket), for a map only looked at: only holes are
   * picked there. */
  private holeFor(id: string | null): string | null {
    if (!id) return null;
    if (this.hole(id)) return id;
    const it = this.item(id);
    return it && (it.type === "tee" || it.type === "basket") ? it.holeId ?? null : null;
  }

  setSelection(id: string | null) {
    if (id === this.selectedId) return;
    this.selectedId = id;
    this.syncSelection();
    this.syncOverlays();
    this.syncHandles();
    this.syncShapes();
    this.invalidate();
  }

  setTool(tool: ViewTool, teeLevel = this.teeLevel) {
    const leaving = tool.mode !== this.tool.mode || this.drawn(tool) !== this.drawn();
    this.teeLevel = teeLevel;
    if (leaving && this.tool.mode === "measure") this.clearMeasure();
    if (leaving || tool.shape !== this.tool.shape) {
      if (this.plotHole) this.endPlot();
      // (marking a stretch of OB goes on in Select, which it starts in)
      if (this.obPick && tool.mode !== "select") this.endObPick();
      this.clearDrawing();
    }
    this.tool = tool;
    if (tool.mode === "select") this.updateGhost(null);
    this.updateCursor();
    this.handleKey = "";
    this.syncHandles();
    this.invalidate();
  }

  onView(fn: (info: ViewInfo) => void) {
    this.viewListeners.add(fn);
    fn(this.viewInfo());
    return () => this.viewListeners.delete(fn);
  }

  invalidate(shadows = false) {
    this.dirty = true;
    if (shadows) this.shadowsDirty = true;
  }

  /** Look straight down (2D) or tilt into 3D, animated. */
  setPose(pose: "top" | "tilt", animate = true, fromUser = false) {
    const polar = this.controls.polarAngle;
    this.pose = pose;
    this.posePinned = true;
    if (fromUser) this.cb.onPose(pose);
    if (pose === "top") {
      if (polar < 1e-3 && Math.abs(this.wrappedAzimuth()) < 1e-3) return;
      void this.controls.rotateTo(this.northAzimuth(), 0, animate);
    } else if (polar <= TILT_TOP) {
      void this.controls.rotatePolarTo(DEFAULT_TILT, animate);
    }
    this.invalidate();
  }

  resetNorth() {
    void this.controls.rotateAzimuthTo(this.northAzimuth(), true);
  }

  private northAzimuth() {
    return this.controls.azimuthAngle - this.wrappedAzimuth();
  }

  /** Turn the view; positive turns the heading clockwise (the map turns the other way). */
  rotateBy(deg: number) {
    void this.controls.rotate(-deg * DEG, 0, true);
  }

  tiltBy(deg: number) {
    void this.controls.rotate(0, -deg * DEG, true);
  }

  zoomBy(factor: number) {
    const d = this.controls.distance / factor;
    void this.controls.dollyTo(clamp(d, this.controls.minDistance, this.controls.maxDistance), true);
  }

  /** Fit plan bounds in view, keeping the current rotation and tilt. */
  /** Pixels on the right covered by a panel: fitting keeps things clear of them. */
  rightInset = 0;
  /** Pixels on the left covered by a panel (the holes column). */
  leftInset = 0;
  /** The fit the map was last put at, until it is moved by hand. */
  private autoFit: (() => void) | null = null;
  /** A panel over the map's left side shown or gone: the map slides over by half of it, so what
   * was in the middle stays in the middle of what can be seen. */
  setLeftInset(px: number) {
    const delta = px - this.leftInset;
    this.leftInset = px;
    if (!delta || !this.fitted || this.size.height < 2) return;
    // (still as fitted, untouched: fitted again, around the panel)
    if (this.autoFit) return this.autoFit();
    const worldPerPx = (2 * this.controls.distance * Math.tan((this.camera.fov * DEG) / 2)) / this.size.height;
    const right = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0);
    right.y = 0;
    if (right.lengthSq() < 1e-6) return;
    right.normalize().multiplyScalar(-(delta / 2) * worldPerPx);
    const t = this.controls.getTarget(new THREE.Vector3(), true).add(right);
    void this.controls.moveTo(t.x, t.y, t.z, false);
    this.controls.update(0);
    this.camera.updateMatrixWorld();
    this.invalidate();
  }
  /** Pixels at the bottom and top covered by panels (a phone's bottom sheet; its top bar). */
  bottomInset = 0;
  topInset = 0;

  /** The plan offset that moves a point from the screen's middle to the middle of the part of the
   * map between the top and bottom panels, at `dist` from the camera. */
  private insetShift(dist: number) {
    const below = clamp(this.bottomInset, 0, this.size.height * 0.6), above = clamp(this.topInset, 0, this.size.height * 0.3);
    if (below === above) return { x: 0, y: 0 };
    const worldPerPx = (2 * dist * Math.tan((this.camera.fov * DEG) / 2)) / Math.max(1, this.size.height);
    const up = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 1);
    up.y = 0;
    if (up.lengthSq() > 1e-6) up.normalize();
    const k = ((below - above) / 2) * worldPerPx / Math.max(0.35, Math.cos(this.controls.polarAngle));
    return { x: -up.x * k, y: -up.z * k };
  }

  fitBounds(b: { minX: number; minY: number; maxX: number; maxY: number }, opts: { minSpan?: number; margin?: number; animate?: boolean } = {}) {
    const doc = this.doc;
    if (!doc) return;
    this.autoFit = null;
    const margin = opts.margin ?? 1.2;
    const minSpan = opts.minSpan ?? 0;
    const w = Math.max(b.maxX - b.minX, minSpan, 1) * margin;
    const d = Math.max(b.maxY - b.minY, minSpan * 0.6, 1) * margin;
    const inset = clamp(this.rightInset, 0, this.size.width * 0.5);
    const leftIn = clamp(this.leftInset, 0, this.size.width * 0.3);
    const covered = clamp(this.bottomInset, 0, this.size.height * 0.6) + clamp(this.topInset, 0, this.size.height * 0.3);
    const H = Math.max(1, this.size.height);
    const aspect = Math.max(1, this.size.width - inset - leftIn) / H;
    const t = Math.tan((this.camera.fov * DEG) / 2);
    const dist = clamp(Math.max(d / (2 * t), w / (2 * t * aspect)) * (H / Math.max(1, H - covered)), this.controls.minDistance, this.controls.maxDistance);
    let cx = (b.minX + b.maxX) / 2;
    let cy = (b.minY + b.maxY) / 2;
    const worldPerPx = (2 * dist * t) / H;
    if (inset !== leftIn) {
      // Look a little off the middle, so the middle lands in the visible part
      const right = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0);
      right.y = 0;
      if (right.lengthSq() > 1e-6) right.normalize();
      const off = (inset - leftIn) / 2;
      cx += right.x * off * worldPerPx;
      cy += right.z * off * worldPerPx;
    }
    // (And between the top and bottom panels)
    const shift = this.insetShift(dist);
    cx += shift.x;
    cy += shift.y;
    const animate = opts.animate ?? true;
    void this.controls.moveTo(cx, this.h(cx, cy), cy, animate);
    void this.controls.dollyTo(dist, animate);
    // (not animated: there at once, not at the next frame)
    if (!animate) {
      this.controls.update(0);
      this.camera.updateMatrixWorld();
    }
    this.invalidate();
  }

  fitSite(animate = true) {
    const doc = this.doc;
    if (!doc) return;
    this.fitBounds({ minX: 0, minY: 0, maxX: doc.canvas.width, maxY: doc.canvas.height }, { margin: 1, animate });
    this.autoFit = () => this.fitSite(false);
  }

  /** Fit the holes (or the whole site when there are none). */
  fitCourse(animate = true) {
    const doc = this.doc;
    if (!doc) return;
    const pts = doc.course.items.filter(i => i.type === "tee" || i.type === "basket") as P[];
    if (pts.length < 2) return this.fitSite(animate);
    this.fitBounds(boundsOf(pts), { margin: 1.25, minSpan: 300, animate });
    this.autoFit = () => this.fitCourse(false);
  }

  /** Fit one hole (tee to basket, with its fairway). */
  fitHole(holeId: string, animate = true) {
    const doc = this.doc;
    const s = doc?.stats.find(x => x.holeId === holeId);
    if (!doc || !s || !s.line.length) return;
    const hole = doc.course.holes.find(h => h.id === holeId);
    const pad = (hole?.fairwayWidth ?? 30) / 2 + 30;
    const b = boundsOf(s.line);
    this.fitBounds({ minX: b.minX - pad, minY: b.minY - pad, maxX: b.maxX + pad, maxY: b.maxY + pad }, { margin: 1.15, minSpan: 160, animate });
  }

  /** Brings an item or hole into view if it is off screen. */
  reveal(id: string, rightInset = 0) {
    const b = this.itemBounds(id);
    if (!b) return;
    const box = this.screenBox(id);
    const m = 24;
    const left = this.leftInset, visibleW = this.size.width - rightInset;
    const top = this.topInset, visibleH = this.size.height - this.bottomInset;
    if (box && box.x >= left + m && box.y >= top + m && box.x + box.width <= visibleW - m && box.y + box.height <= visibleH - m) return;
    if (box && (box.width > visibleW - left - 2 * m || box.height > visibleH - top - 2 * m)) {
      this.fitBounds(b, { margin: 1.3 });
      return;
    }
    // (In the middle of the part of the map between the panels)
    const shift = this.insetShift(this.controls.distance);
    const cx = (b.minX + b.maxX) / 2 + shift.x;
    const cy = (b.minY + b.maxY) / 2 + shift.y;
    void this.controls.moveTo(cx, this.h(cx, cy), cy, true);
    this.invalidate();
  }

  /** Bounds of an item (or a hole's throw line) on the plan. */
  itemBounds(id: string) {
    const doc = this.doc;
    if (!doc) return null;
    const hole = doc.course.holes.find(h => h.id === id);
    if (hole) {
      const s = doc.stats.find(x => x.holeId === id);
      return s?.line.length ? boundsOf(s.line) : null;
    }
    const item = doc.course.items.find(i => i.id === id);
    if (!item) return null;
    if (item.type === "area" || item.type === "line") return boundsOf(item.points);
    if (item.type === "structure") return structureBounds(item);
    const r = item.type === "tree" ? item.radius : item.type === "tee" ? item.padLength / 2 : 4;
    return { minX: item.x - r, minY: item.y - r, maxX: item.x + r, maxY: item.y + r };
  }

  /** Plan point (on the ground) -> client (page) coordinates. */
  toClient(x: number, y: number, lift = 0) {
    const s = this.project(new THREE.Vector3(x, this.h(x, y) + lift, y));
    const r = this.container.getBoundingClientRect();
    return s ? { x: r.left + s.x, y: r.top + s.y } : null;
  }

  /** Client point -> plan point on the ground (null if it misses the ground). */
  toPlan(clientX: number, clientY: number) {
    const g = this.groundAt(clientX, clientY);
    return g ? { x: g.x, y: g.z } : null;
  }

  /** Screen rectangle of an item or hole (container pixels). */
  screenBox(id: string) {
    const b = this.itemBounds(id);
    if (!b) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const [x, y] of [[b.minX, b.minY], [b.maxX, b.minY], [b.maxX, b.maxY], [b.minX, b.maxY]]) {
      const s = this.project(new THREE.Vector3(x, this.h(x, y), y));
      if (!s) continue;
      minX = Math.min(minX, s.x); maxX = Math.max(maxX, s.x);
      minY = Math.min(minY, s.y); maxY = Math.max(maxY, s.y);
    }
    return Number.isFinite(minX) ? { x: minX, y: minY, width: maxX - minX, height: maxY - minY } : null;
  }

  viewInfo(): ViewInfo {
    const az = this.wrappedAzimuth();
    const dist = this.controls.distance;
    const pxPerUnit = this.size.height / (2 * dist * Math.tan((this.camera.fov * DEG) / 2));
    return { heading: ((-az / DEG) % 360 + 360) % 360, tiltDeg: this.controls.polarAngle / DEG, pxPerUnit, width: this.size.width, height: this.size.height };
  }

  capture() {
    this.render();
    return this.renderer.domElement.toDataURL("image/png");
  }

  /** A picture of the scene from a tee (for the hole sheets), at the given size. */
  renderTeeView(holeId: string, width: number, height: number): HTMLCanvasElement | null {
    if (!this.doc) return null;
    const prev = { hole: this.povHole, look: { ...this.povLook } };
    this.povHole = holeId;
    this.povLook = { yaw: 0, pitch: 0 };
    const out = document.createElement("canvas");
    out.width = width;
    out.height = height;
    const ratio = this.renderer.getPixelRatio();
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(width, height, false);
    this.lastRender = 0;
    this.drawPov({ x: 0, y: 0, width, height });
    out.getContext("2d")?.drawImage(this.renderer.domElement, 0, 0);
    this.renderer.setPixelRatio(ratio);
    this.renderer.setSize(this.size.width, this.size.height, false);
    this.povHole = prev.hole;
    this.povLook = prev.look;
    this.render();
    return out;
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    clearTimeout(this.grassTimer);
    this.grass.dispose();
    this.tufts.dispose();
    this.skyEnv?.dispose();
    this.ro.disconnect();
    this.disposers.forEach(d => d());
    this.endDragListeners?.();
    this.controls.dispose();
    this.ground.dispose();
    disposeObjectDeep(this.scene);
    this.env.dispose();
    this.sky.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.container.innerHTML = "";
  }

  // ------------------------------------------------------------------ tee view and flyover

  /** Look from a hole's tee down the hole (null: back to the map). */
  setTeeView(holeId: string | null) {
    this.fly = null;
    if (holeId === this.povHole) return;
    this.povHole = holeId;
    this.povLook = { yaw: 0, pitch: 0 };
    this.detailReady = this.updateDetail().catch(() => {});
    this.controls.enabled = !holeId;
    this.labelsLayer.style.display = holeId ? "none" : "";
    this.handlesLayer.style.display = holeId ? "none" : "";
    // (back on the map: nothing of the tee view or a flight left over it)
    if (!holeId && this.povMarker) this.povMarker.style.display = "none";
    if (!holeId && this.flyCanvas) this.flyCanvas.style.display = "none";
    this.updateCursor();
    this.invalidate();
  }

  /** Fly over a hole from behind the tee to the basket; `done` runs when it lands. */
  /** Flies over a hole just as a recording shows it: its title held a moment on the first
   * picture, the flight (the title fading), a moment at the basket. */
  flyover(holeId: string, done?: () => void) {
    const path = this.flightPath(holeId);
    if (!path || !this.doc) {
      this.fly = null;
      this.flyWait = null;
      this.cb.onFlyWait(null);
      done?.();
      return;
    }
    this.setTeeView(holeId);
    if (!this.fly) this.povFov = this.povCam.fov;
    this.fly = { ...path, t: -VIDEO_HOLD.intro, done, title: holeTitle(this.doc.course, holeId) };
    const wait: { since: number; loaded: boolean; frames: number } = { since: performance.now(), loaded: false, frames: 0 };
    this.flyWait = wait;
    this.cb.onFlyWait("map");
    void (async () => {
      const left = () => performance.now() - wait.since < FLY_WAIT_MS;
      const pause = () => new Promise(r => setTimeout(r, 100));
      // (the painted ground still being painted, then its sharp close-up, then any textures
      // still on their way: the photo, the trees' leaves)
      await new Promise(r => setTimeout(r, 150));
      while (this.paintedPending && left()) await pause();
      if (this.flyWait === wait) this.cb.onFlyWait("detail");
      await this.detailReady;
      if (this.flyWait === wait) this.cb.onFlyWait("textures");
      while (texturesLoading() && left()) await pause();
      wait.loaded = true;
    })();
    this.invalidate();
  }

  /** The flight over a hole: camera and look-at points (by itself from behind the tee to the
   * basket, over the trees; or through the hole's keyframes), fields of view, and how long it
   * takes (s). */
  private flightPath(holeId: string): { pts: THREE.Vector3[]; look: THREE.Vector3[]; fov: number[]; dur: number; play: number; at: (t: number) => number } | null {
    const doc = this.doc;
    const s = doc?.stats.find(x => x.holeId === holeId);
    if (!doc || !s?.complete) return null;
    const hole = doc.course.holes.find(h => h.id === holeId);
    const set = flyoverOf(doc.course, hole);
    const ground = (x: number, y: number) => this.h(x, y);
    const byHand = !!hole?.flyKeys && hole.flyKeys.length >= 2;
    const trees = (p: P, r: number) => this.canopyAt(p, r);
    const f = byHand ? keyFlight(hole!.flyKeys!, set, ground, trees) : autoFlight(smoothPath(s.line, 16), set, ground, trees);
    if (!f) return null;
    const v = (a: Air) => new THREE.Vector3(a.x, a.z, a.y);
    // (slowing to a stop at the end; by itself, getting going gently too)
    const clock = flightClock(f.dur, !byHand);
    return { pts: f.cam.map(v), look: f.look.map(v), fov: f.fov, dur: f.dur, play: clock.play, at: clock.at };
  }

  /** Keyframes to start a hand-made flyover from: the flight it flies by itself, at a few moments. */
  autoKeys(holeId: string): FlyKey[] | null {
    const doc = this.doc;
    const s = doc?.stats.find(x => x.holeId === holeId);
    if (!doc || !s?.complete) return null;
    const ground = (x: number, y: number) => this.h(x, y);
    const set = flyoverOf(doc.course, doc.course.holes.find(h => h.id === holeId));
    const canopy = (p: P, r: number) => this.canopyAt(p, r);
    const f = autoFlight(smoothPath(s.line, 16), set, ground, canopy);
    // (each at the flyover's height, out of the trees)
    return f ? keysFromFlight(f, ground, 4, set.height, canopy) : null;
  }

  // Drawn curves and outlines, kept while what they come from is the same (a course's items and
  // holes are replaced when they change, never changed in place): hovering and redrawing after a
  // change work them out again only for what changed
  private drawnOf = new WeakMap<object, { pts: P[]; box: ReturnType<typeof boundsOf> }>();
  private shapeOf(i: AreaItem | LineItem) {
    let d = this.drawnOf.get(i);
    if (!d) {
      const pts = i.type === "area" ? areaPath(i) : linePath(i);
      this.drawnOf.set(i, (d = { pts, box: boundsOf(pts) }));
    }
    return d;
  }
  private kept = new Map<string, { dep: unknown; key: string; val: unknown }>();
  /** `make()`'s answer, kept in `slot` while `dep` is the same object and `key` the same text. */
  private keep<T>(slot: string, dep: unknown, key: string, make: () => T): T {
    const m = this.kept.get(slot);
    if (m && m.dep === dep && m.key === key) return m.val as T;
    const val = make();
    this.kept.set(slot, { dep, key, val });
    return val;
  }
  /** A hole's fairway round one of its throw lines (curved `per` points a leg), kept. */
  private outline(hole: Hole, line: P[], slot: string, per: number, extra: number, steps: number) {
    return this.keep(`fair:${hole.id}:${slot}:${per}:${extra}:${steps}`, hole, JSON.stringify(line), () => fairwayOutline(hole, smoothPath(line, per), extra, steps));
  }
  /** Every tree standing on the course as a crown (placed ones, and those of the woods and of the
   * painted map), filed by 40 ft squares; made again when they change. */
  private crownFile: { key: unknown[]; cells: Map<string, Crown[]>; widest: number } | null = null;
  private crownsFiled() {
    const doc = this.doc!;
    const forests = [...this.shapes].filter(([k]) => k.startsWith("woods:") || k === "painted-woods").map(([, e]) => e.obj);
    const key = [doc.course.items, this.heightsVersion, ...forests];
    const f = this.crownFile;
    if (f && f.key.length === key.length && f.key.every((k, i) => k === key[i])) return f;
    const cells = new Map<string, Crown[]>();
    let widest = 0;
    const add = (c: Crown) => {
      const k = `${Math.floor(c.x / CROWN_CELL)},${Math.floor(c.y / CROWN_CELL)}`;
      const list = cells.get(k);
      if (list) list.push(c); else cells.set(k, [c]);
      widest = Math.max(widest, c.r);
    };
    // (leaves from about a third of the way up a broadleaf, lower on a pine, the ground for a bush)
    const low = (shape?: string) => (shape === "bush" ? 0 : shape === "conifer" ? 0.12 : 0.3);
    for (const i of doc.course.items) {
      if (i.type !== "tree") continue;
      const g = this.h(i.x, i.y), h = i.height ?? i.radius * 2.6;
      add({ x: i.x, y: i.y, r: i.radius * (i.width ?? 1), base: g + h * low(i.treeType), top: g + h });
    }
    for (const obj of forests) for (const t of (obj.userData.spots ?? []) as TreeSpot[]) add({ x: t.x, y: t.y, r: t.width / 2, base: t.ground + t.height * low(t.shape), top: t.ground + t.height });
    return (this.crownFile = { key, cells, widest });
  }

  /** What stands over a point, within `reach` ft (for flyovers): the trees whose leaves reach that
   * near (each one's crown, its trunk close by) and built things from the ground up. Ft on the
   * terrain's datum. */
  private canopyAt(p: P, reach: number): Canopy | null {
    const doc = this.doc;
    if (!doc) return null;
    let base = Infinity, top = -Infinity;
    const trunks: P[] = [], crowns: Crown[] = [];
    const { cells, widest } = this.crownsFiled();
    const R = reach + Math.max(widest, TRUNK_ROOM);
    for (let cx = Math.floor((p.x - R) / CROWN_CELL); cx <= Math.floor((p.x + R) / CROWN_CELL); cx++) {
      for (let cy = Math.floor((p.y - R) / CROWN_CELL); cy <= Math.floor((p.y + R) / CROWN_CELL); cy++) {
        for (const c of cells.get(`${cx},${cy}`) ?? []) {
          const d = Math.hypot(c.x - p.x, c.y - p.y);
          if (d < reach + c.r) {
            base = Math.min(base, c.base);
            top = Math.max(top, c.top);
            crowns.push(c);
          }
          if (d < reach + TRUNK_ROOM) trunks.push({ x: c.x, y: c.y });
        }
      }
    }
    for (const i of doc.course.items) {
      if (i.type !== "structure" || isLineKind(i.kind)) continue;
      const b = boundsOf(i.points);
      if (p.x < b.minX - reach || p.x > b.maxX + reach || p.y < b.minY - reach || p.y > b.maxY + reach) continue;
      if (pointInPolygon(p, i.points) || distanceToPath(p, [...i.points, i.points[0]]) < reach) {
        base = Math.min(base, this.h(p.x, p.y));
        top = Math.max(top, this.h(p.x, p.y) + structureHeight(i) + 10);
      }
    }
    return Number.isFinite(top) || trunks.length ? { base, top, trunks, crowns } : null;
  }

  stopFlyover() {
    if (this.fly) this.povCam.fov = this.povFov;
    this.fly = null;
    this.invalidate();
  }

  /** Where the tee view stands and looks (tee + eye height, toward the first point of the line). */
  private povPose(): { eye: THREE.Vector3; target: THREE.Vector3 } | null {
    const doc = this.doc;
    if (!doc || !this.povHole) return null;
    const s = doc.stats.find(x => x.holeId === this.povHole);
    if (!s || s.line.length < 2) return null;
    const tee = s.line[0];
    const next = s.line[1];
    const eye = new THREE.Vector3(tee.x, this.h(tee.x, tee.y) + EYE_HEIGHT_FT + 0.35, tee.y);
    const base = Math.atan2(next.y - tee.y, next.x - tee.x) + this.povLook.yaw;
    const d = Math.max(60, dist(tee, next));
    const tx = tee.x + Math.cos(base) * d, ty = tee.y + Math.sin(base) * d;
    const ground = this.h(next.x, next.y) + 3;
    const flatPitch = Math.atan2(ground - eye.y, dist(tee, next));
    const pitch = clamp(flatPitch + this.povLook.pitch, -80 * DEG, 60 * DEG);
    return { eye, target: new THREE.Vector3(tx, eye.y + Math.tan(pitch) * d, ty) };
  }

  /** Draws the tee view or flyover into `rect` on screen, or (a recording) into all of `target`. */
  private drawPov(rect: { x: number; y: number; width: number; height: number }, target?: THREE.WebGLRenderTarget) {
    const doc = this.doc;
    if (!doc) return;
    const cam = this.povCam;
    if (this.fly) {
      const f = this.fly;
      // (where along the flight: its motion easing in and out; see flightClock)
      const e = f.dur > 0 ? clamp(f.at(f.t) / f.dur, 0, 1) : 1;
      const idx = e * (f.pts.length - 1);
      const i0 = Math.floor(idx), i1 = Math.min(f.pts.length - 1, i0 + 1);
      // (on a smooth curve through the flight's points, not straight from one to the next)
      curveBetween(f.pts, i0, idx - i0, cam.position);
      cam.lookAt(curveBetween(f.look, i0, idx - i0, new THREE.Vector3()));
      cam.fov = f.fov[i0] + (f.fov[i1] - f.fov[i0]) * (idx - i0);
    } else {
      const pose = this.povPose();
      if (!pose) return;
      cam.position.copy(pose.eye);
      cam.lookAt(pose.target);
    }
    cam.aspect = rect.width / Math.max(1, rect.height);
    const span = this.siteSpan();
    cam.far = span * 12;
    cam.near = 0.3;
    cam.updateProjectionMatrix();
    // Sky, the land out to the horizon, haze and grass, only for this picture
    const restore = this.atmosphere(cam, true);
    this.ground.extras.visible = false;
    this.updateGrass(cam, true);
    this.updateForests(cam.position);
    waterUniforms.uTime.value = this.clock.elapsedTime;
    waterUniforms.uWind.value = this.wind ? 1 : 0.25;
    this.fx.visible = false;
    const hidden = this.fly ? this.hideForFlight() : [];
    this.ground.detailActive(true);
    if (this.shadowsDirty) {
      this.placeSun();
      this.renderer.shadowMap.needsUpdate = true;
      this.shadowsDirty = false;
    }
    if (target) {
      this.renderer.setRenderTarget(target);
      this.renderer.clear();
      this.renderer.render(this.scene, cam);
      this.renderer.setRenderTarget(null);
    } else {
      this.renderer.setViewport(rect.x, rect.y, rect.width, rect.height);
      this.renderer.setScissor(rect.x, rect.y, rect.width, rect.height);
      this.renderer.setScissorTest(true);
      this.renderer.render(this.scene, cam);
      this.renderer.setScissorTest(false);
    }
    restore();
    for (const o of hidden) o.visible = true;
    this.ground.extras.visible = true;
    this.fx.visible = true;
    if (!target) {
      this.placePovMarker(cam, rect);
      this.placeFlyOverlay(cam, rect);
    }
  }

  /** Hides what the flown hole's flyover is set not to show (the disc's flight, lines of play,
   * putting circles, OB, other holes' lines, walks); returns what it hid, to show again. */
  private hideForFlight(): THREE.Object3D[] {
    const doc = this.doc, holeId = this.povHole;
    if (!doc || !holeId) return [];
    const f = flyoverOf(doc.course, doc.course.holes.find(h => h.id === holeId));
    const items = new Map(doc.course.items.map(i => [i.id, i]));
    const hidden: THREE.Object3D[] = [];
    for (const [key, { obj }] of this.shapes) {
      const at = key.indexOf(":");
      const kind = key.slice(0, at), id = key.slice(at + 1);
      const it = items.get(id);
      // (whose it is: the flown hole's, or another's)
      const own = (holes: (string | undefined)[]) => holes.includes(holeId);
      let show = true;
      if (kind === "throw") show = f.playLine && (!!it && it.type === "tee" && (own([it.holeId]) || f.otherHoles));
      else if (kind === "circle") show = f.circle && (!!it && it.type === "basket" && (own(basketHoles(it)) || f.otherHoles));
      else if (kind === "walk") show = f.walks;
      else if ((kind === "line" || kind === "area") && it && (it.type === "line" || it.type === "area")) {
        if (it.kind === "ob") show = f.ob;
        else if (it.kind === "walk") show = f.walks;
      }
      if (!show && obj.visible) {
        obj.visible = false;
        hidden.push(obj);
      }
    }
    return hidden;
  }

  private flyCanvas: HTMLCanvasElement | null = null;
  /** Over a flyover on screen: what a recording shows over it (the hole's badge and title, the
   * basket with the distance left, the course's name), drawn the same way. */
  private placeFlyOverlay(cam: THREE.PerspectiveCamera, rect: { x: number; y: number; width: number; height: number }) {
    const f = this.fly, doc = this.doc;
    if (!f?.title || !doc || !this.povHole) {
      if (this.flyCanvas) this.flyCanvas.style.display = "none";
      return;
    }
    if (!this.flyCanvas) {
      this.flyCanvas = document.createElement("canvas");
      this.flyCanvas.setAttribute("data-testid", "fly-overlay");
      this.flyCanvas.style.cssText = "position:absolute;pointer-events:none;z-index:1";
      this.container.appendChild(this.flyCanvas);
    }
    const c = this.flyCanvas, dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = rect.width, h = rect.height;
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
    }
    Object.assign(c.style, { display: "block", left: `${rect.x}px`, top: `${this.size.height - rect.y - h}px`, width: `${w}px`, height: `${h}px` });
    const g = c.getContext("2d")!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    const s = doc.stats.find(x => x.holeId === this.povHole);
    let info: FrameInfo | null = null;
    if (s?.complete) {
      const b = s.line[s.line.length - 1];
      const q = new THREE.Vector3(b.x, this.h(b.x, b.y) + 5, b.y).project(cam);
      const inside = q.z <= 1 && Math.abs(q.x) <= 1.05 && Math.abs(q.y) <= 1.05;
      info = { basket: inside ? { x: ((q.x + 1) / 2) * w, y: ((1 - q.y) / 2) * h } : null, toBasket: dist({ x: cam.position.x, y: cam.position.z }, b) };
    }
    // (what it shows as set now, if changed mid-flight)
    drawOverlay(g, w, h, { ...f.title, show: overlayShow(doc.course, this.povHole ?? "") }, titleStrength(f.t), info, doc.course);
  }

  /** In the tee view: a marker over the basket (too small to see from far away) with the distance. */
  private placePovMarker(cam: THREE.PerspectiveCamera, rect: { x: number; y: number; width: number; height: number }) {
    const doc = this.doc;
    const s = doc?.stats.find(x => x.holeId === this.povHole);
    if (!this.povMarker) {
      this.povMarker = document.createElement("div");
      this.povMarker.setAttribute("data-testid", "pov-basket");
      this.povMarker.style.cssText = "position:absolute;left:0;top:0;pointer-events:none;display:flex;flex-direction:column;align-items:center;font:700 12px Inter,system-ui,sans-serif;color:#fff;text-shadow:0 1px 3px rgba(0,0,0,.8)";
      this.container.appendChild(this.povMarker);
    }
    const el = this.povMarker;
    if (!doc || !s?.complete || rect.width !== this.size.width || this.fly?.title) { el.style.display = "none"; return; }
    const b = s.line[s.line.length - 1];
    const p = new THREE.Vector3(b.x, this.h(b.x, b.y) + 5, b.y).project(cam);
    if (p.z > 1 || p.x < -1.1 || p.x > 1.1 || p.y < -1.1 || p.y > 1.1) { el.style.display = "none"; return; }
    el.style.display = "flex";
    const d = this.fly ? dist({ x: cam.position.x, y: cam.position.z }, b) : s.length;
    el.innerHTML = `<span style="background:${doc.course.style.basket};color:#111;border-radius:999px;padding:2px 8px;text-shadow:none;box-shadow:0 1px 4px rgba(0,0,0,.5)">${fmtDist(d, doc.course.units)}</span><span style="font-size:16px;line-height:14px;color:${doc.course.style.basket}">▼</span>`;
    const x = ((p.x + 1) / 2) * rect.width, y = ((1 - p.y) / 2) * rect.height;
    el.style.transform = `translate(${Math.round(x - el.offsetWidth / 2)}px, ${Math.round(y - el.offsetHeight)}px)`;
  }

  /** Where the tee view is (for the HUD): progress of a flyover 0..1, or null. */
  flyProgress() {
    return this.fly ? clamp(this.fly.t / this.fly.play, 0, 1) : null;
  }

  // ------------------------------------------------------------------ flyover videos

  /** Records flyovers of the holes, one after another, to a video file: rendered offline, frame by
   * frame at a steady 1/fps step, into an offscreen picture of the asked size (the view on screen
   * keeps its size and goes on as before). See flyoverVideo.ts. */
  async recordFlyover(holeIds: string[], opts: RecordOptions & { ground?: PaintedLook | null }): Promise<FlyoverVideo> {
    if (!this.doc || this.disposed) throw new Error("The map isn't ready yet.");
    const doc = this.doc.course;
    const { recordFlights } = await import("./flyoverVideo");
    // The ground the video shows (the painted map, or the photo), whatever the screen shows
    if (opts.ground !== undefined) {
      this.paintedRecord = opts.ground;
      await this.applyPainted();
    }
    try {
      return await recordFlights(this.flightFrames(opts.width, opts.height), doc, holeIds, opts);
    } finally {
      if (opts.ground !== undefined) {
        this.paintedRecord = undefined;
        void this.applyPainted();
      } else void this.updateDetail();
    }
  }

  /** The painted map on the ground for the tee view and flyovers, with trees where it paints
   * woods (null: the photo). */
  setPaintedGround(look: PaintedLook | null) {
    this.paintedScreen = look;
    const done = this.applyPainted();
    this.detailReady = done.catch(() => {});
    return done;
  }

  /** A painted ground on its way (the tee view's Design look being painted): a flyover waits. */
  private paintedPending = false;
  setPaintedPending(on: boolean) { this.paintedPending = on; }

  private paintedScreen: PaintedLook | null = null;
  /** While recording: the ground the video shows (undefined: as on screen). */
  private paintedRecord: PaintedLook | null | undefined = undefined;
  /** Where the painting on the ground shows woods (3D trees stand there). */
  private paintedWoods: WoodedGrid | null = null;

  /** Paints the sharp picture round a hole (set by the app; null: none). */
  private detailPainter: ((holeId: string, maxPx: number) => Promise<PaintedDetailLook | null>) | null = null;
  setDetailPainter(fn: ((holeId: string, maxPx: number) => Promise<PaintedDetailLook | null>) | null) {
    this.detailPainter = fn;
    void this.updateDetail();
  }
  /** The longest side of the sharp painting (what the graphics card takes, at most 4096). */
  detailPx() {
    return Math.min(4096, this.renderer.capabilities.maxTextureSize, COARSE ? 2048 : 3072);
  }
  private detailAsk = 0;
  /** The sharp painting round `holeId` (default: the hole looked at), while the painted map shows.
   * While a video records, only the recording sets it (for each hole before its frames). */
  private async updateDetail(holeId = this.povHole, forVideo = false) {
    if (this.recordings > 0 && !forVideo) return;
    const ask = ++this.detailAsk;
    const look = this.paintedRecord !== undefined ? this.paintedRecord : this.paintedScreen;
    if (!holeId || !look || !this.detailPainter) {
      this.ground.setPaintedDetail(null);
      return;
    }
    const d = await this.detailPainter(holeId, this.detailPx());
    // (still wanted: asked for last, the same hole, the painted map still on)
    if (this.disposed || ask !== this.detailAsk) return;
    const now = this.paintedRecord !== undefined ? this.paintedRecord : this.paintedScreen;
    if (now && (forVideo || holeId === this.povHole)) this.ground.setPaintedDetail(d);
  }

  private async applyPainted() {
    const look = this.paintedRecord !== undefined ? this.paintedRecord : this.paintedScreen;
    await this.ground.setPainted(look?.url ?? null);
    if (this.disposed) return;
    if (!look) this.ground.setPaintedDetail(null);
    else await this.updateDetail();
    const woods = this.ground.paintedTexture ? look?.wooded ?? null : null;
    if (woods !== this.paintedWoods || this.shapesPainted !== !!this.ground.paintedTexture) {
      this.paintedWoods = woods;
      this.syncShapes();
    }
    this.invalidate(true);
  }
  /** Whether the shapes on the ground were last drawn for the painted map. */
  private shapesPainted = false;

  /** Flights over holes drawn offscreen at a fixed size, one moment at a time (for a recording):
   * like the flyover on screen, into a render target of its own. */
  flightFrames(width: number, height: number): FlightFrames {
    const gl = this.renderer.getContext();
    if (Math.max(width, height) > Math.min(this.renderer.capabilities.maxTextureSize, gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) as number)) {
      throw new Error("This computer's graphics can't draw a video that big: pick a smaller size.");
    }
    // Smooth edges (fewer samples on very big pictures, where they matter less and cost the most)
    const rt = new THREE.WebGLRenderTarget(width, height, { samples: width * height > 4e6 ? 2 : 4, type: THREE.UnsignedByteType, stencilBuffer: true });
    // Rendered exactly like the screen (tone mapping, sRGB colors) and with the same shaders: three
    // only does that for the screen and XR targets, so this target says it is one; its plain RGBA8
    // storage then holds the finished sRGB colors
    rt.texture.internalFormat = "RGBA8";
    rt.texture.colorSpace = THREE.SRGBColorSpace;
    (rt as unknown as { isXRRenderTarget: boolean }).isXRRenderTarget = true;
    const raw = new Uint8Array(width * height * 4);
    this.recordings++;
    this.setVideoDetail(true);
    let open = true;
    const paths = new Map<string, ReturnType<CourseView["flightPath"]>>();
    const path = (id: string) => {
      if (!paths.has(id)) paths.set(id, this.flightPath(id));
      return paths.get(id) ?? null;
    };
    return {
      duration: id => path(id)?.play ?? 0,
      prepare: id => this.updateDetail(id, true),
      draw: (id, t, out): FrameInfo => {
        const p = path(id);
        if (!p) throw new Error("That hole can't be flown over.");
        if (this.disposed || !this.doc) throw new Error("The map view closed.");
        const cam = this.povCam;
        const saved = { fly: this.fly, hole: this.povHole, look: this.povLook, pos: cam.position.clone(), quat: cam.quaternion.clone(), fov: cam.fov, aspect: cam.aspect, near: cam.near, far: cam.far };
        let info: FrameInfo = { basket: null, toBasket: 0 };
        try {
          this.fly = { ...p, t };
          this.povHole = id;
          this.povLook = { yaw: 0, pitch: 0 };
          cam.fov = 62;
          this.drawPov({ x: 0, y: 0, width, height }, rt);
          this.renderer.readRenderTargetPixels(rt, 0, 0, width, height, raw);
          const s = this.doc.stats.find(x => x.holeId === id);
          if (s?.complete) {
            const b = s.line[s.line.length - 1];
            const q = new THREE.Vector3(b.x, this.h(b.x, b.y) + 5, b.y).project(cam);
            const inside = q.z <= 1 && Math.abs(q.x) <= 1.05 && Math.abs(q.y) <= 1.05;
            info = { basket: inside ? { x: ((q.x + 1) / 2) * width, y: ((1 - q.y) / 2) * height } : null, toBasket: dist({ x: cam.position.x, y: cam.position.z }, b) };
          }
        } finally {
          this.fly = saved.fly;
          this.povHole = saved.hole;
          this.povLook = saved.look;
          cam.position.copy(saved.pos);
          cam.quaternion.copy(saved.quat);
          Object.assign(cam, { fov: saved.fov, aspect: saved.aspect, near: saved.near, far: saved.far });
          cam.updateProjectionMatrix();
        }
        // WebGL reads the bottom row first; the picture is opaque
        const row = width * 4;
        for (let y = 0; y < height; y++) out.set(raw.subarray((height - 1 - y) * row, (height - y) * row), y * row);
        for (let i = 3; i < out.length; i += 4) out[i] = 255;
        return info;
      },
      dispose: () => {
        rt.dispose();
        if (open) this.recordings--;
        open = false;
        if (this.recordings === 0) this.setVideoDetail(false);
        this.invalidate();
      }
    };
  }

  // ------------------------------------------------------------------ frame loop

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    const dt = this.clock.getDelta();
    if (this.controls.update(dt)) this.dirty = true;
    if (this.fly) {
      // Held on its first picture until everything's in (a few frames drawn after), then at most
      // a quarter second per frame: a slow first frame (or a tab coming back from the background)
      // must not skip the flight
      const w = this.flyWait;
      if (w && (w.loaded ? ++w.frames < 4 : true) && performance.now() - w.since < FLY_WAIT_MS) { /* waiting */ }
      else {
        if (w) this.cb.onFlyWait(null);
        this.flyWait = null;
        this.fly.t += Math.min(dt, 0.25);
      }
      this.dirty = true;
      // (a moment at the basket before it ends, as in a recording)
      if (this.fly.t >= this.fly.play + (this.fly.title ? VIDEO_HOLD.outro : 0)) {
        const done = this.fly.done;
        this.fly = null;
        this.povCam.fov = this.povFov;
        done?.();
      }
    }
    if (this.draftPending) {
      this.draftPending = false;
      this.drawDraft();
    }
    // Grass swaying and water rippling in the wind, from the tee (at most 30 frames a second on a
    // phone when nothing else moves: the battery matters more than the breeze; and still while a
    // video records, whose frames would otherwise wait on the screen's)
    const breeze = !!this.povHole && this.wind && this.recordings === 0;
    if (breeze && !(this.mobile && !this.dirty && performance.now() - this.lastRender < 33)) this.dirty = true;
    // (While a video records, the screen at most 8 times a second: on a slow device its pictures
    // would take the recording's time, and the recording is what is being waited for)
    if (!this.dirty || this.size.width <= 1 || this.paused || (this.recordings > 0 && performance.now() - this.lastRender < 125)) {
      this.drewLastTick = false;
      return;
    }
    this.dirty = false;
    const now = performance.now();
    // Frame after frame (something moving, a picture on every tick): how long each took, to keep
    // the frame rate up. Only ticks that drew one after the other count, so the pauses between
    // two separate changes are never taken for slow frames, and frames however slow always count
    // (not a gap of minutes, though: a tab coming back from the background)
    if (this.drewLastTick && now - this.lastRender < 2000) this.perfSample(now - this.lastRender);
    this.drewLastTick = true;
    this.lastRender = now;
    this.frames++;
    this.render();
  };

  /**
   * Quality that keeps the view smooth: frame times are watched while the view moves, and when
   * frames run slow (under 30 a second) the picture gets a step less sharp (pixel ratio), then
   * less grass, softer shadows and fewer trees in full detail; it steps back up when there is
   * room again. Software rendering (no graphics card) keeps its own fixed, lower settings.
   */
  perfSample(ms: number) {
    if (this.software && !this.adaptiveForced) return;
    const s = this.perfSamples;
    s.push(ms);
    // A window of 24 frames, or a second and a half on a slow device (24 frames at 5 a second
    // would be five seconds of a juddering view for every step)
    if (s.length < 6 || (s.length < 24 && s.reduce((a, b) => a + b, 0) < 1500)) return;
    const sorted = [...s].sort((a, b) => a - b);
    const median = sorted[s.length >> 1];
    s.length = 0;
    if (median > 34 && this.tier < 4) {
      this.fastWindows = 0;
      // (Very slow, under about 14 frames a second: two steps at once)
      this.setTier(this.tier + (median > 70 ? 2 : 1));
    } else if (median < 17 && this.tier > 0) {
      // (only after a few quick windows in a row: no flickering between two levels)
      if (++this.fastWindows >= 3) {
        this.fastWindows = 0;
        this.setTier(this.tier - 1);
      }
    } else this.fastWindows = 0;
  }

  /** A quality level: 0 full .. 4 the lightest. */
  setTier(tier: number) {
    this.tier = Math.max(0, Math.min(4, tier));
    const ratio = Math.max(0.75, this.maxRatio * [1, 0.85, 0.72, 0.6, 0.5][this.tier]);
    if (Math.abs(this.renderer.getPixelRatio() - ratio) > 0.01) {
      this.renderer.setPixelRatio(ratio);
      this.renderer.setSize(this.size.width, this.size.height, false);
    }
    // (a video records with its own: see setVideoDetail)
    if (this.videoDetail) return this.invalidate();
    const shadow = this.tier >= 3 ? 512 : this.mobile || this.tier >= 2 ? 1024 : 2048;
    if (this.sun.shadow.mapSize.x !== shadow) {
      this.sun.shadow.mapSize.set(shadow, shadow);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
      this.shadowsDirty = true;
    }
    forestDetail.nearFt = (this.software ? 70 : this.mobile ? 150 : 260) * (this.tier >= 3 ? 0.6 : 1);
    forestDetail.version++;
    this.invalidate();
  }

  /** While a video records: drawn farther and finer than on screen (each frame can take its time):
   * trees in full detail much farther out, the most grass, finer shadows, thinner haze. */
  private videoDetail = false;
  private setVideoDetail(on: boolean) {
    if (on === this.videoDetail) return;
    this.videoDetail = on;
    if (!on) {
      // (back to what this device draws on screen)
      this.setTier(this.tier);
      return;
    }
    // (without a graphics card, only the thinner haze: each frame is slow enough already)
    if (this.software) return;
    forestDetail.nearFt = this.mobile ? 400 : 700;
    forestDetail.version++;
    const shadow = Math.min(this.mobile ? 2048 : 4096, this.renderer.capabilities.maxTextureSize);
    if (this.sun.shadow.mapSize.x !== shadow) {
      this.sun.shadow.mapSize.set(shadow, shadow);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
      this.shadowsDirty = true;
    }
  }

  /**
   * Covered by another screen (the Design step's page): draw nothing until shown again (it would
   * only cost a phone its battery). Changes made meanwhile are drawn when it comes back.
   */
  setPaused(on: boolean) {
    if (on === this.paused) return;
    this.paused = on;
    this.lastRender = 0;
    if (!on) this.invalidate();
  }

  /** For tests: whether the view is drawing, how many pictures it has drawn, and whether a video records. */
  drawInfo() {
    return { paused: this.paused, frames: this.frames, recording: this.recordings > 0 };
  }

  /** For tests: the quality level now. */
  qualityInfo() {
    return { tier: this.tier, pixelRatio: this.renderer.getPixelRatio(), shadow: this.sun.shadow.mapSize.x, nearFt: forestDetail.nearFt, grass: this.grassQuality(), mobile: this.mobile, software: this.software, video: this.videoDetail, haze: this.videoDetail ? 0.5 : 1 };
  }

  /** For tests: let the frame-rate watch work under software rendering too (a fresh window). */
  forceAdaptive(on = true) {
    this.adaptiveForced = on;
    this.perfSamples.length = 0;
  }

  private render() {
    if (this.povHole) {
      this.renderer.setClearColor(0x000000, 1);
      this.renderer.clear();
      this.drawPov({ x: 0, y: 0, width: this.size.width, height: this.size.height });
      this.renderer.setViewport(0, 0, this.size.width, this.size.height);
      return;
    }
    // Tilting widens the lens; the camera moves in to keep the scale where it looks
    {
      const t = clamp((this.controls.polarAngle - TILT_TOP) / (55 * DEG - TILT_TOP), 0, 1);
      const fov = FOV_TOP + (FOV_TILT - FOV_TOP) * t * t * (3 - 2 * t);
      if (Math.abs(this.camera.fov - fov) > 0.05) {
        const k = Math.tan((this.camera.fov * DEG) / 2) / Math.tan((fov * DEG) / 2);
        this.camera.fov = fov;
        this.camera.updateProjectionMatrix();
        void this.controls.dollyTo(this.controls.distance * k, false);
        this.controls.update(0);
      }
    }
    const dist = this.controls.distance;
    const near = clamp(dist * 0.01, 0.05, 20);
    const far = dist * 6 + this.siteSpan() * 4;
    if (Math.abs(this.camera.near - near) > near * 0.2 || Math.abs(this.camera.far - far) > far * 0.2) {
      this.camera.near = near;
      this.camera.far = far;
      this.camera.updateProjectionMatrix();
    }
    if (this.shadowsDirty) {
      this.placeSun();
      this.renderer.shadowMap.needsUpdate = true;
      this.shadowsDirty = false;
    }
    this.camera.updateMatrixWorld();
    const tilted = this.controls.polarAngle > TILT_TOP;
    this.ground.detailActive(dist < 250);
    // Tilted, the course is a place: sky, haze, land to the horizon and grass up close
    this.lastSky = false;
    const restore = tilted ? this.atmosphere(this.camera, false) : null;
    this.updateGrass(this.camera, tilted);
    this.updateForests(this.camera.position);
    waterUniforms.uTime.value = this.clock.elapsedTime;
    this.renderer.render(this.scene, this.camera);
    restore?.();
    this.layout();
    const info = this.viewInfo();
    const key = `${info.heading.toFixed(2)}|${info.tiltDeg.toFixed(2)}|${info.pxPerUnit.toFixed(5)}|${info.width}|${info.height}|${this.camera.position.x.toFixed(2)}|${this.camera.position.z.toFixed(2)}`;
    if (key !== this.lastViewKey) {
      this.lastViewKey = key;
      this.viewListeners.forEach(fn => fn(info));
      const pose = this.controls.polarAngle > TILT_TOP ? "tilt" : "top";
      if (pose !== this.pose && !this.posePinned) {
        this.pose = pose;
        this.cb.onPose(pose);
      }
    }
  }

  private resize() {
    const r = this.container.getBoundingClientRect();
    const width = Math.max(1, Math.round(r.width));
    const height = Math.max(1, Math.round(r.height));
    if (width === this.size.width && height === this.size.height) return;
    this.size = { width, height };
    this.renderer.setSize(width, height, false);
    this.renderer.domElement.style.width = `${width}px`;
    this.renderer.domElement.style.height = `${height}px`;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    lineMats.forEach(m => m.resolution.set(width, height));
    if (!this.fitted && this.doc && width > 1) {
      this.fitted = true;
      this.fitCourse(false);
    }
    this.invalidate();
  }

  private siteSpan() {
    return this.doc ? Math.max(this.doc.canvas.width, this.doc.canvas.height) : 1500;
  }

  /**
   * Sky, haze and the land out to the horizon around a camera, for one picture (`eyeLevel`: seen
   * from the ground, where the haze thickens sooner). Returns how to put the map's backdrop back.
   */
  private atmosphere(cam: THREE.PerspectiveCamera, eyeLevel: boolean) {
    const span = this.siteSpan();
    const sm = this.skyBox.material as THREE.ShaderMaterial;
    this.skyBox.scale.setScalar(cam.far * 1.05);
    this.skyBox.position.copy(cam.position);
    this.skyBox.visible = true;
    this.lastSky = true;
    this.skyBox.updateMatrixWorld();
    this.ground.landscape(true);
    const prevFog = this.scene.fog;
    const prevBg = this.scene.background;
    const haze = sm.uniforms.uHaze.value as THREE.Color;
    // Thin haze over the site, thick toward the horizon: distance reads as distance
    // (thinner in a video: it reaches farther)
    const thin = this.videoDetail ? 0.5 : 1;
    // (one haze, its density and color set each picture: a new one would have every material
    // worked out again, each frame)
    this.haze.density = (eyeLevel ? 0.8 / (span * 2.4) : 0.7 / (span * 3.2)) * thin;
    this.haze.color.copy(haze);
    this.scene.fog = this.haze;
    this.scene.background = haze;
    return () => {
      this.scene.fog = prevFog;
      this.scene.background = prevBg;
      this.skyBox.visible = false;
      this.ground.landscape(false);
    };
  }

  /** Grass blades near the camera: in 3D only (looking straight down they can't be seen). */
  private updateGrass(cam: THREE.PerspectiveCamera, on: boolean) {
    const doc = this.doc;
    const q = this.grassQuality();
    this.grass.setQuality(on && doc ? q : 0);
    this.tufts.setQuality(on && doc ? q : 0);
    if (!doc || !on || !q) {
      this.grass.group.visible = false;
      this.tufts.group.visible = false;
      return;
    }
    // What grows where: painted again when the course changed (at most a few times a second
    // while something is dragged)
    const key = [doc.course.items, doc.stats, doc.groundPaint, doc.course.style, doc.groundColor, doc.canvas, doc.course.holes];
    if (key.some((k, i) => (this.grassInputs[i] ?? null) !== k)) {
      const now = performance.now();
      if (now - this.grassBuilt > 300 || !this.grassInputs.length) {
        this.grassInputs = key;
        this.grassBuilt = now;
        const maps = grassMaps(doc);
        if (maps) this.grass.setMaps(maps);
      } else {
        clearTimeout(this.grassTimer);
        this.grassTimer = window.setTimeout(() => this.invalidate(), 320);
      }
    }
    if (this.grassTerrainRef !== doc.heights) {
      this.grassTerrainRef = doc.heights;
      this.grass.setTerrain(grassTerrain(doc));
    }
    const photo = this.ground.paintedTexture ?? (this.ground.photo && doc.background.opacity > 0.3 ? this.ground.photo : null);
    if (this.grassPhoto !== photo) {
      this.grassPhoto = photo;
      this.grass.setPhoto(photo, doc.background.rect, 0.8);
    }
    const p = cam.position;
    const t = this.clock.elapsedTime;
    const wind = this.wind && this.povHole ? 0.14 : 0.05;
    this.grass.update(p, this.h(clamp(p.x, 0, doc.canvas.width), clamp(p.z, 0, doc.canvas.height)), t, wind);
    this.tufts.update(p, t, wind, this.grass.group.visible);
  }

  /** What a stretch of water mirrors on its banks: woods close by (high and dark) or open grass. */
  private waterShore(pts: P[]): [string, number] {
    const doc = this.doc;
    if (!doc) return ["#2a3a24", 0.08];
    const b = boundsOf(pts);
    const near = (p: P) => p.x > b.minX - 60 && p.x < b.maxX + 60 && p.y > b.minY - 60 && p.y < b.maxY + 60;
    const st = doc.course.style;
    const wooded = doc.course.items.some(i => (i.type === "area" && i.kind === "woods" && i.points.some(near)) || (i.type === "tree" && near(i)));
    return wooded || st.forest === "everywhere" ? [st.trees, 0.26] : [doc.groundColor, 0.06];
  }

  /** The sky as an environment map, for water to reflect (only when the sun has moved). */
  private updateSkyEnv(dir: THREE.Vector3) {
    const key = `${dir.x.toFixed(3)},${dir.y.toFixed(3)},${dir.z.toFixed(3)}`;
    if (key === this.skyEnvKey) return;
    this.skyEnvKey = key;
    const sky = new Sky();
    const src = this.skyBox.material as THREE.ShaderMaterial;
    const mat = src.clone();
    for (const k of Object.keys(src.uniforms)) {
      const v = src.uniforms[k].value;
      mat.uniforms[k] = { value: v && typeof v.clone === "function" ? v.clone() : v };
    }
    sky.material = mat;
    sky.scale.setScalar(1000);
    const scene = new THREE.Scene();
    scene.add(sky);
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const rt = pmrem.fromScene(scene, 0, 1, 3000);
    pmrem.dispose();
    mat.dispose();
    sky.geometry.dispose();
    this.skyEnv?.dispose();
    this.skyEnv = rt;
    setWaterSky(rt.texture);
  }

  /** Woods: the trees near the camera in full detail. */
  private updateForests(eye: THREE.Vector3) {
    for (const o of this.itemsGroup.children) (o.userData.forest as Forest | undefined)?.update(eye);
  }

  /** How much grass to draw: as set, or (automatically) none without a graphics card. */
  private grassQuality(): GrassQuality {
    // (a video: the most grass, but where there is no graphics card or it is switched off)
    if (this.videoDetail && !this.software && this.grassSetting !== 0) return 3;
    if (this.grassSetting !== "auto") return this.grassSetting;
    // Automatic: off without a graphics card, low on a phone, and less while frames run slow
    const base = this.software ? 0 : this.mobile ? 1 : 2;
    return Math.max(0, base - (this.tier >= 4 ? 2 : this.tier >= 2 ? 1 : 0)) as GrassQuality;
  }

  /** Grass detail (0 off .. 3 high, or automatic) and whether it sways in the wind. */
  setGrass(quality: GrassQuality | "auto", wind = this.wind) {
    this.grassSetting = quality;
    this.wind = wind;
    this.invalidate();
  }

  /** Ground height at a plan point, ft (for tests and scripted views). */
  groundHeight(x: number, y: number) {
    return this.h(x, y);
  }

  /** For tests: how tall the 3D grass grows at plan points, ft (0: none grows there). */
  grassHeights(pts: P[]) {
    const maps = this.doc ? grassMaps(this.doc) : null;
    if (!maps) return [];
    const g = maps.field.getContext("2d", { willReadFrequently: true })!;
    const kx = maps.field.width / maps.rect.width, ky = maps.field.height / maps.rect.height;
    return pts.map(p => {
      const d = g.getImageData(Math.floor((p.x - maps.rect.x) * kx), Math.floor((p.y - maps.rect.y) * ky), 1, 1).data;
      return d[1] > 12 ? (d[0] / 255) * GRASS.max : 0;
    });
  }

  /** For tests: trees in the woods, and how many are drawn in full detail (as seen from `eye`). */
  forestInfo(eye?: { x: number; y: number; z: number }) {
    if (eye) this.updateForests(new THREE.Vector3(eye.x, eye.y, eye.z));
    let trees = 0, near = 0, conifers = 0;
    for (const o of this.itemsGroup.children) {
      const c = (o.userData.forest as Forest | undefined)?.counts();
      if (c) { trees += c.trees; near += c.near; conifers += c.conifers; }
    }
    return { trees, near, conifers, plantings: this.plantings };
  }

  /** For tests: trees of the woods standing within `r` ft of a plan point. */
  treesNear(x: number, y: number, r: number) {
    let n = 0;
    for (const o of this.itemsGroup.children) n += (o.userData.forest as Forest | undefined)?.treesNear(x, y, r) ?? 0;
    return n;
  }

  /** For tests: the last picture's sky, sun and grass. */
  sceneInfo() {
    const d = this.sun.position.clone().sub(this.sun.target.position).normalize();
    return {
      sky: this.lastSky,
      sun: { x: d.x, y: d.y, z: d.z },
      exposure: this.renderer.toneMappingExposure,
      grass: { quality: this.grass.getQuality(), visible: this.grass.group.visible, blades: this.grass.blades },
      software: this.software
    };
  }

  private placeSun() {
    const doc = this.doc;
    if (!doc) return;
    const span = this.siteSpan();
    const center = new THREE.Vector3(doc.canvas.width / 2, 0, doc.canvas.height / 2);
    let dir = new THREE.Vector3(-0.45, 1, 0.55).normalize();
    let strength = 1;
    if (doc.sun) {
      const az = doc.sun.azimuth * DEG, alt = Math.max(4, doc.sun.altitude) * DEG;
      dir = new THREE.Vector3(Math.sin(az) * Math.cos(alt), Math.sin(alt), -Math.cos(az) * Math.cos(alt));
      strength = doc.sun.altitude <= 0 ? 0.08 : Math.min(1, 0.35 + doc.sun.altitude / 25);
    }
    // Darker shadows: less light from the sky filling them in
    const shadows = clamp(doc.sun?.shadows ?? 0.65, 0, 1);
    this.sun.intensity = SUN_INTENSITY * strength;
    this.hemi.intensity = HEMI_INTENSITY * (0.45 + 0.55 * Math.min(1, strength * 1.2)) * (1.55 - 0.85 * shadows);
    this.renderer.toneMappingExposure = EXPOSURE * Math.pow(2, (doc.sun?.light ?? 0) * 1.6);
    // The sky's sun, and its haze: blue-grey at midday, warmer when the sun is low
    {
      const sm = this.skyBox.material as THREE.ShaderMaterial;
      (sm.uniforms.sunPosition.value as THREE.Vector3).copy(dir);
      const low = 1 - clamp((Math.asin(clamp(dir.y, -1, 1)) / DEG - 8) / 40, 0, 1);
      (sm.uniforms.uHaze.value as THREE.Color).set("#c4d0d9").lerp(new THREE.Color("#dcc8ae"), low * 0.65);
      this.updateSkyEnv(dir);
    }
    this.sun.position.copy(center).add(dir.multiplyScalar(span * 1.5));
    this.sun.target.position.copy(center);
    const cam = this.sun.shadow.camera;
    cam.left = -span * 0.8;
    cam.right = span * 0.8;
    cam.top = span * 0.8;
    cam.bottom = -span * 0.8;
    cam.near = 1;
    cam.far = span * 4;
    cam.updateProjectionMatrix();
    const texel = (span * 1.6) / this.sun.shadow.mapSize.x;
    this.sun.shadow.normalBias = Math.max(0.6, texel * 2.5);
    this.sun.shadow.bias = -0.001;
  }

  private updateLimits() {
    const doc = this.doc;
    if (!doc) return;
    const span = this.siteSpan();
    this.controls.minDistance = 8;
    this.controls.maxDistance = span * 3;
    const pad = span * 0.25;
    this.controls.setBoundary(new THREE.Box3(new THREE.Vector3(-pad, -1e4, -pad), new THREE.Vector3(doc.canvas.width + pad, 1e4, doc.canvas.height + pad)));
  }

  private wrappedAzimuth() {
    const a = this.controls.azimuthAngle % (Math.PI * 2);
    return a > Math.PI ? a - Math.PI * 2 : a < -Math.PI ? a + Math.PI * 2 : a;
  }

  private snapNorth() {
    const a = this.wrappedAzimuth();
    if (Math.abs(a) > 1e-4 && Math.abs(a) < 7 * DEG) void this.controls.rotateAzimuthTo(this.northAzimuth(), true);
  }

  // ------------------------------------------------------------------ geometry helpers

  private project(v: THREE.Vector3) {
    const p = v.clone().project(this.camera);
    if (p.z > 1 || p.z < -1) return null;
    return { x: ((p.x + 1) / 2) * this.size.width, y: ((1 - p.y) / 2) * this.size.height };
  }

  /** World units per screen pixel at a point. */
  private upp(v: THREE.Vector3) {
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    const depth = Math.max(0.01, v.clone().sub(this.camera.position).dot(dir));
    return (2 * depth * Math.tan((this.camera.fov * DEG) / 2)) / this.size.height;
  }

  private ray(clientX: number, clientY: number) {
    const r = this.container.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    this.camera.updateMatrixWorld();
    this.raycaster.setFromCamera(ndc, this.camera);
    return this.raycaster.ray;
  }

  private groundAt(clientX: number, clientY: number): THREE.Vector3 | null {
    const ray = this.ray(clientX, clientY);
    const hit = this.ground.rayHit(ray);
    if (hit) return hit;
    const out = new THREE.Vector3();
    return ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), out) ? out : null;
  }

  private planeAt(clientX: number, clientY: number, y: number): THREE.Vector3 | null {
    const out = new THREE.Vector3();
    return this.ray(clientX, clientY).intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -y), out) ? out : null;
  }

  private h(x: number, y: number) {
    return this.doc ? heightAt(this.doc.heights, this.doc.gridSize, x, y) : 0;
  }

  private item(id: string | null): CourseItem | null {
    return id ? this.doc?.course.items.find(i => i.id === id) ?? null : null;
  }

  private hole(id: string | null): Hole | null {
    return id ? this.doc?.course.holes.find(h => h.id === id) ?? null : null;
  }

  private num(holeId: string | undefined) {
    return holeId && this.doc ? holeLabel(this.doc.course, holeId) : "";
  }

  // ------------------------------------------------------------------ fat lines

  private fatLine(pts: THREE.Vector3[], color: string, widthPx: number, opts: { dashed?: number; opacity?: number; depthTest?: boolean; order?: number } = {}) {
    const geo = new LineGeometry();
    geo.setPositions(pts.flatMap(p => [p.x, p.y, p.z]));
    const mat = new LineMaterial({
      color: new THREE.Color(color).getHex(),
      linewidth: widthPx,
      transparent: true,
      opacity: opts.opacity ?? 1,
      dashed: !!opts.dashed,
      dashSize: opts.dashed ?? 1,
      gapSize: (opts.dashed ?? 1) * 0.7,
      depthTest: opts.depthTest ?? true,
      depthWrite: false
    });
    mat.resolution.set(this.size.width, this.size.height);
    lineMats.add(mat);
    const origDispose = mat.dispose.bind(mat);
    mat.dispose = () => { lineMats.delete(mat); origDispose(); };
    const line = new Line2(geo, mat);
    if (opts.dashed) line.computeLineDistances();
    line.renderOrder = opts.order ?? 3;
    line.raycast = () => {};
    return line;
  }

  private drapeLine(pts: P[], lift = LIFT, closed = false) {
    const grid = this.doc?.gridSize || 20;
    return drapedPoints(pts, (x, y) => this.h(x, y), Math.max(4, grid / 2), lift, closed);
  }

  /** The tee colors and pins only the other layouts play (faded while this one is worked on). */
  private otherLayouts() {
    const course = this.doc!.course;
    const on = course.layouts.find(l => l.id === course.activeLayout) ?? course.layouts[0];
    const rest = course.layouts.filter(l => l !== on);
    return { tees: new Set(rest.map(l => l.tee).filter(t => t !== on?.tee)), pins: new Set(rest.map(l => l.pin).filter(p => p !== on?.pin)) };
  }

  // ------------------------------------------------------------------ scene sync: 3D objects

  private signature(item: CourseItem) {
    const doc = this.doc!;
    switch (item.type) {
      case "tee": return JSON.stringify([item.level, item.padLength, item.padWidth, item.surface, this.num(item.holeId)]);
      case "basket": return JSON.stringify([doc.course.style.basketBand ?? BASKET_BAND, this.num(item.holeId)]);
      case "mando": return item.side;
      case "dropzone": return "dz";
      case "tree": return getTreeSignature(item as TreeItem) + item.id + (this.doc ? `|${this.doc.course.style.trees}|${this.doc.course.style.landscape ?? ""}|${this.doc.course.style.treeMix?.join() ?? ""}` : "");
      case "amenity": return item.kind;
      default: return "";
    }
  }

  private buildObject(item: CourseItem): THREE.Object3D | null {
    const doc = this.doc!;
    switch (item.type) {
      case "tee": return createTeePad(item, this.num(item.holeId));
      case "basket": return createBasket(doc.course.style.basketBand ?? BASKET_BAND, this.num(item.holeId));
      case "mando": return createMando(item.side);
      case "dropzone": return createDropZone();
      case "tree": { const st = doc.course.style; return create3dTree(item, { color: st.trees, mix: treeMixOf(st) }); }
      case "amenity": return createAmenity(item.kind);
      default: return null;
    }
  }

  private place(obj: THREE.Object3D, item: CourseItem) {
    const doc = this.doc!;
    const g = this.h(item.x, item.y);
    if (item.type === "tee") {
      const aim = teeAim(doc.course, item);
      obj.position.set(item.x, g, item.y);
      obj.rotation.set(0, -aim * DEG, 0);
      // (level on sloping ground, never cut by it)
      fitTeePad(obj, item, aim, (x, y) => this.h(x, y));
    } else if (item.type === "basket") {
      obj.position.set(item.x, g + (item.raised ?? 0), item.y);
      obj.rotation.set(0, 0, 0);
    } else {
      obj.position.set(item.x, g + OBJECT_ELEVATION_OFFSET, item.y);
      obj.rotation.set(0, -item.rotation * DEG, 0);
    }
  }

  private tagObject(obj: THREE.Object3D, id: string) {
    obj.userData.itemId = id;
    obj.traverse(o => {
      o.userData.itemId = id;
      if ((o as THREE.Mesh).isMesh && !(o as THREE.Mesh).castShadow && o.parent === obj) (o as THREE.Mesh).castShadow = true;
    });
  }

  private syncItems() {
    const doc = this.doc!;
    const seen = new Set<string>();
    for (const item of doc.course.items) {
      if (item.type === "label" || item.type === "area" || item.type === "line") continue;
      seen.add(item.id);
      const sig = this.signature(item);
      let entry = this.objects.get(item.id);
      if (!entry || entry.sig !== sig) {
        if (entry) {
          this.itemsGroup.remove(entry.obj);
          disposeObjectDeep(entry.obj);
        }
        const obj = this.buildObject(item);
        if (!obj) continue;
        this.tagObject(obj, item.id);
        entry = { obj, sig };
        this.objects.set(item.id, entry);
        this.itemsGroup.add(obj);
        this.shadowsDirty = true;
      }
      this.place(entry.obj, item);
      // (an item stays where it's placed: its matrices worked out here, not again every frame for
      // the thousands of parts the trees, tees and baskets are made of)
      entry.obj.userData.placed = true;
      entry.obj.updateMatrixWorld(true);
    }
    for (const [id, entry] of this.objects) {
      if (seen.has(id)) continue;
      this.itemsGroup.remove(entry.obj);
      disposeObjectDeep(entry.obj);
      this.objects.delete(id);
      this.shadowsDirty = true;
    }
  }

  // ------------------------------------------------------------------ scene sync: drawn shapes

  /**
   * Everything drawn on the ground: areas, lines, fairways, throw lines (and their flight arcs in
   * 3D), putting circles, next-tee walks and mando lines. Each piece is rebuilt only when what it
   * depends on changes.
   */
  private syncShapes() {
    const doc = this.doc!;
    const course = doc.course;
    const st = course.style;
    const seen = new Set<string>();
    const hv = this.heightsVersion;
    const put = (key: string, sig: string, make: () => THREE.Object3D | null, group: THREE.Group = this.shapesGroup, slow = false) => {
      seen.add(key);
      const entry = this.shapes.get(key);
      if (entry && entry.sig === sig) return;
      // (slow to make, such as woods: kept as they are while dragging, made again at its end)
      if (slow && entry && this.dragging) { this.afterDrag = true; return; }
      if (entry) {
        entry.obj.parent?.remove(entry.obj);
        disposeObjectDeep(entry.obj);
        this.shapes.delete(key);
      }
      const obj = make();
      if (!obj) return;
      obj.traverse(o => { o.raycast = () => {}; });
      if (!obj.name) obj.name = key;
      group.add(obj);
      this.shapes.set(key, { obj, sig });
    };
    const pdga = st.markings === "pdga";
    const color = (kind: string) => (kind === "ob" ? (pdga ? "#ffffff" : st.ob) : kind === "nogo" && pdga ? RESTRICTED : kind === "hazard" ? st.hazard : kind === "water" ? st.water : kind === "fairway" ? st.fairway : kind === "woods" ? st.trees : null);
    const photo = !!doc.background.url && doc.background.opacity > 0.3;
    // The painted map on the ground (flyovers, the tee view): it has the fairways, grass, woods,
    // paths and roads painted already; the rules (OB, hazards), water and what stands up stay
    const painted = !!this.ground.paintedTexture;
    this.shapesPainted = painted;
    // A map only looked at (shared to view, the public page): what stands there, rendered, and
    // the rules (OB, hazards, mandos); not the editor's outlines and dashes
    const clean = this.readOnly;
    // Paths and roads stack where they cross as the style says (bottom first): each tier drawn
    // after the ones under it
    const tiers: PathTier[] = st.pathOrder?.length === 4 ? st.pathOrder : ["dirt", "gravel", "walkway", "road"];
    const tierOf = (kind: string, surface?: string): PathTier => (kind === "road" ? "road" : surface === "paved" ? "walkway" : surface === "gravel" || surface === "woodchips" ? "gravel" : "dirt");
    const tierOrder = (t: PathTier) => 2.05 + tiers.indexOf(t) * 0.15;

    // Fairways (under everything else): one from each tee of a hole, and where fairways meet (a
    // hole's tees, holes sharing a basket) they make one: drawn once where they overlap, their
    // edges only where they aren't inside another
    const fairways = doc.stats.flatMap(s => {
      const hole = course.holes.find(h => h.id === s.holeId);
      if (!hole || !s.complete || !hole.fairway || painted) return [];
      return [{ hole, polys: teeLines(course, hole, s.line, s.teeId).map((l, k) => this.outline(hole, l, `tee${k}`, 10, 0, 12)) }];
    });
    const allFair = fairways.flatMap(f => f.polys.map(p => ({ p, box: boundsOf(p) })));
    for (const { hole, polys } of fairways) {
      const boxes = polys.map(boundsOf);
      const near = allFair.filter(o => !polys.includes(o.p) && boxes.some(b => o.box.minX < b.maxX && o.box.maxX > b.minX && o.box.minY < b.maxY && o.box.maxY > b.minY));
      put(`fair:${hole.id}`, JSON.stringify([polys, near.map(o => o.p), hv, st.fairway, photo]), () => {
        const g = new THREE.Group();
        const mat = new THREE.MeshLambertMaterial({ color: st.fairway, transparent: true, opacity: photo ? 0.22 : 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6 });
        // (each spot drawn once, however many fairways cover it)
        Object.assign(mat, { stencilWrite: true, stencilRef: 1, stencilFunc: THREE.NotEqualStencilFunc, stencilZPass: THREE.ReplaceStencilOp });
        polys.forEach((poly, k) => {
          const mesh = new THREE.Mesh(drapedPolygon(poly, (x, y) => this.h(x, y), doc.gridSize, 0.12), k ? mat.clone() : mat);
          mesh.renderOrder = 1;
          mesh.receiveShadow = true;
          g.add(mesh);
          // Its edge, but where it runs inside another fairway
          const others = [...polys.filter((_, j) => j !== k), ...near.map(o => o.p)];
          let run: P[] = [];
          const flush = () => {
            if (run.length >= 2) g.add(this.fatLine(this.drapeLine(run, 0.2), st.fairway, 1.5, { opacity: photo ? 0.8 : 0.5, order: 2 }));
            run = [];
          };
          for (const p of [...poly, poly[0]]) {
            if (others.some(o => pointInPolygon(p, o))) flush();
            else run.push(p);
          }
          flush();
        });
        return g;
      });
    }
    // Where woods have no trees: fairways, water, open areas, paths, roads, creeks, tees, baskets
    // and built things (as on the painted map)
    // (`play`: only what's cleared for play, fairways, tees and baskets: the trees measured from the
    // air are real, and a crown over a path or a road doesn't stand on it)
    const clearingsFor = (play: boolean) => {
      const polys: P[][] = [], lines: { pts: P[]; half: number }[] = [], discs: { p: P; r: number }[] = [];
      for (const s of doc.stats) {
        const hole = course.holes.find(h => h.id === s.holeId);
        if (s.complete && hole) teeLines(course, hole, s.line, s.teeId).forEach((l, k) => polys.push(this.outline(hole, l, `tee${k}`, 8, hole.fairway ? 0 : -hole.fairwayWidth * 0.4, 6)));
      }
      for (const it of course.items) {
        if (it.type === "area" && (play ? ["fairway", "green"] : ["fairway", "green", "water", "parking", "building", "sand", "rough", "nogo"]).includes(it.kind)) polys.push(this.shapeOf(it).pts);
        else if (it.type === "line" && !play && it.kind !== "ob" && it.kind !== "fence") lines.push({ pts: this.shapeOf(it).pts, half: ((it.width ?? LINE_KINDS[it.kind].width) * Math.max(...widthFactors(it))) / 2 + 3 });
        else if (it.type === "tee") discs.push({ p: it, r: Math.max(12, it.padLength) });
        else if (it.type === "basket") discs.push({ p: it, r: CIRCLE_ONE_FT * 0.6 });
        else if (it.type === "structure" && !play) {
          // (a building, shelter or deck: none inside it, nor right against its walls)
          if (STRUCTURE_KINDS[it.kind].shape === "outline") { polys.push(it.points); lines.push({ pts: [...it.points, it.points[0]], half: 4 }); }
          else lines.push({ pts: it.points, half: (it.width ?? 6) / 2 + 6 });
        }
      }
      type Box = { minX: number; minY: number; maxX: number; maxY: number };
      const shapes = polys.filter(pp => pp.length >= 3).map(pts => ({ pts, closed: [...pts, pts[0]], box: boundsOf(pts) }));
      const paths = lines.filter(l => l.pts.length > 1).map(l => ({ ...l, box: boundsOf(l.pts) }));
      const meets = (b: Box, c: Box, m: number) => b.minX - m <= c.maxX && b.maxX + m >= c.minX && b.minY - m <= c.maxY && b.maxY + m >= c.minY;
      const r = (v: number) => Math.round(v);
      /** The clearings near a box (all of them: none given): a test of a spot, and a key that
       * changes only when one of them really moved (rounded to a foot). */
      const near = (box?: Box) => {
        // (a tree's crown reaches out: what's this far outside the box still matters)
        const M = 80;
        const ss = box ? shapes.filter(x => meets(x.box, box, M)) : shapes;
        const ls = box ? paths.filter(x => meets(x.box, box, x.half + M)) : paths;
        const ds = box ? discs.filter(d => d.p.x > box.minX - d.r - M && d.p.x < box.maxX + d.r + M && d.p.y > box.minY - d.r - M && d.p.y < box.maxY + d.r + M) : discs;
        const test = (p: P, reach: number) => {
          for (const x of ss) {
            const b = x.box;
            if (p.x < b.minX - reach || p.x > b.maxX + reach || p.y < b.minY - reach || p.y > b.maxY + reach) continue;
            if (pointInPolygon(p, x.pts) || (reach > 0 && distanceToPath(p, x.closed) < reach)) return true;
          }
          for (const l of ls) {
            const b = l.box, m = l.half + reach;
            if (p.x < b.minX - m || p.x > b.maxX + m || p.y < b.minY - m || p.y > b.maxY + m) continue;
            if (distanceToPath(p, l.pts) < m) return true;
          }
          for (const d of ds) if (Math.hypot(p.x - d.p.x, p.y - d.p.y) < d.r + reach) return true;
          return false;
        };
        const key = JSON.stringify([ss.map(x => x.pts.map(q => [r(q.x), r(q.y)])), ls.map(l => [l.half, l.pts.map(q => [r(q.x), r(q.y)])]), ds.map(d => [r(d.p.x), r(d.p.y), d.r])]);
        return { test, key };
      };
      const all = near();
      return { test: all.test, key: all.key, near };
    };
    const clearings = clearingsFor(false);
    // Where no tree stands, whatever the survey found: in water, on roads, paths, creeks and walks,
    // on buildings, parking and built things (a trunk there is a bridge, a car, a wire or noise)
    const nowhereFor = () => {
      const polys: P[][] = [], lines: { pts: P[]; half: number }[] = [];
      for (const it of course.items) {
        // (and woods given drawn trees or none: no measured ones there)
        if (it.type === "area" && (["water", "parking", "building"].includes(it.kind) || (it.kind === "woods" && (it.trees === "drawn" || it.trees === "none")))) polys.push(this.shapeOf(it).pts);
        else if (it.type === "line" && ["road", "path", "walk", "stream"].includes(it.kind)) lines.push({ pts: this.shapeOf(it).pts, half: ((it.width ?? LINE_KINDS[it.kind].width) * Math.max(...widthFactors(it))) / 2 });
        else if (it.type === "structure") {
          // (a building's outline: none inside it, nor with its trunk against the walls)
          if (STRUCTURE_KINDS[it.kind].shape === "outline") { polys.push(it.points); lines.push({ pts: [...it.points, it.points[0]], half: 3 }); }
          else lines.push({ pts: it.points, half: (it.width ?? 6) / 2 + 2 });
        }
      }
      const shapes = polys.filter(pp => pp.length >= 3).map(pts => ({ pts, box: boundsOf(pts) }));
      const paths = lines.filter(l => l.pts.length > 1).map(l => ({ ...l, box: boundsOf(l.pts) }));
      const test = (p: P) => {
        for (const x of shapes) if (p.x >= x.box.minX && p.x <= x.box.maxX && p.y >= x.box.minY && p.y <= x.box.maxY && pointInPolygon(p, x.pts)) return true;
        for (const l of paths) {
          const b = l.box, m = l.half;
          if (p.x < b.minX - m || p.x > b.maxX + m || p.y < b.minY - m || p.y > b.maxY + m) continue;
          if (distanceToPath(p, l.pts) < m) return true;
        }
        return false;
      };
      const r = (v: number) => Math.round(v);
      return { test, key: JSON.stringify([shapes.map(x => x.pts.map(q => [r(q.x), r(q.y)])), paths.map(l => [r(l.half), l.pts.map(q => [r(q.x), r(q.y)])])]) };
    };
    // Trees measured from the air: cut down where the course clears the ground for play, unless
    // kept (in place of the woods' made-up trees)
    // (grown to today, as many years as the course asks)
    // Where trees were cut down by hand (saplings, planted ones): nothing grows or is planted there
    const cut = course.cutTrees ?? [];
    const cutAt = (p: P) => cut.some(c => Math.hypot(c.x - p.x, c.y - p.y) < 4);
    const cutKey = cut.length ? JSON.stringify(cut) : "";
    const measuredCount = course.lidar?.trees.length ?? 0;
    // (the same list while the measured trees, the growth and the cut spots are the same: the
    // forest is only rebuilt when one of them changes, not on every change to the course)
    const grownList = course.lidar?.trees.length
      ? this.keep("lidar:list", course.lidar.trees, JSON.stringify([course.lidar.growYears ?? 0, cutKey]), () => grownTrees(course.lidar!).filter((t, k) => k < measuredCount || !cutAt({ x: t[0], y: t[1] })))
      : null;
    const lidar = grownList ? { ...course.lidar!, trees: grownList } : null;
    const measured = !!lidar;
    this.lidarState = null;
    if (lidar) {
      const forPlay = clearingsFor(true);
      const nowhere = nowhereFor();
      const cleared = forPlay.test;
      const clearing = lidar.clearFairways !== false;
      this.clearedAt = (p, reach) => (clearing && cleared(p, reach)) || nowhere.test(p);
      const fresh = JSON.stringify([lidar.kept, lidar.removed, lidar.minHeight ?? 0, lidar.growYears ?? 0, lidar.clearFairways !== false, forPlay.key, nowhere.key, cutKey]);
      if (this.dragging && this.lidarKey && fresh !== this.lidarKey) this.afterDrag = true;
      else this.lidarKey = fresh;
      const state = this.keep("lidar", lidar.trees, this.lidarKey, () => {
        const { stand, cut } = standingTrees(lidar, cleared, nowhere.test);
        const keptSet = new Set(lidar.kept ?? []);
        return { stand, cut, kept: clearing ? stand.filter(k => keptSet.has(k) && forPlay.test({ x: lidar.trees[k][0], y: lidar.trees[k][1] }, lidar.trees[k][3] * 0.3)) : [] };
      });
      this.lidarState = state;
      put("woods:lidar", JSON.stringify([idOfGrid(lidar.trees), lidar.growYears ?? 0, state.cut, hv, st.trees, st.landscape, st.treeMix, st.conifers]), () => {
        const woods = createMeasuredWoods(state.stand.map(k => ({ tree: lidar.trees[k], index: k })), (x, y) => this.h(x, y), st.trees, treeMixOf(st));
        this.shadowsDirty = true;
        return woods;
      }, this.itemsGroup, true);
    }
    // Areas: fill plus outline (and a red OB edge, all round or along its stretches)
    const obEdge = (a: AreaItem, g: THREE.Group) => {
      for (const piece of areaObEdges({ ...a, straight: true })) g.add(this.fatLine(this.drapeLine(piece, LIFT + 0.05), color("ob")!, 3, { order: 5 }));
    };
    const areas = (course.items.filter(i => i.type === "area") as AreaItem[]).map(a => ({ ...a, points: this.shapeOf(a).pts })).sort((a, b) => polygonArea(b.points) - polygonArea(a.points));
    areas.forEach((a, order) => {
      const meta = AREA_KINDS[a.kind];
      const c = color(a.kind) ?? meta.color;
      put(`area:${a.id}`, JSON.stringify([a.points, a.kind, hv, c, photo, order, a.ob, a.obStretches, a.kind === "water" ? this.waterShore(a.points) : 0, painted, clean]), () => {
        const g = new THREE.Group();
        const fill = photo ? meta.fill : Math.min(0.9, meta.fill + 0.35);
        const rule = a.kind === "ob" || a.kind === "hazard" || a.kind === "casual" || a.kind === "nogo";
        // (on the painted ground, or looked at only: no translucent fills, only the rules' edges)
        if ((painted || clean) && a.kind !== "water") {
          if (rule) g.add(this.fatLine(this.drapeLine(a.points, LIFT, true), c, 3, { order: 4, dashed: a.kind === "ob" ? undefined : 6 }));
          if (a.ob === true && a.kind !== "ob") obEdge(a, g);
          return g;
        }
        if (a.kind === "water") {
          // Water lies at the level of its banks nearby (a pond level, a river sloping down its
          // length), and never under the ground: over the highest corner of the ground's cell it's
          // in (ground measured from the air is bumpy, and its triangles rise between samples)
          const cell = doc.gridSize || 20;
          const banks: { x: number; y: number; h: number }[] = [];
          for (let i = 0; i < a.points.length; i++) {
            const p = a.points[i], q = a.points[(i + 1) % a.points.length];
            const n = Math.max(1, Math.ceil(Math.hypot(q.x - p.x, q.y - p.y) / 8));
            for (let k = 0; k < n; k++) { const x = p.x + ((q.x - p.x) * k) / n, y = p.y + ((q.y - p.y) * k) / n; banks.push({ x, y, h: this.h(x, y) }); }
          }
          const lowest = Math.min(...banks.map(b => b.h));
          const REACH = 90;
          const bankLevel = (x: number, y: number) => {
            let m = Infinity;
            for (const b of banks) if (Math.abs(b.x - x) < REACH && Math.abs(b.y - y) < REACH && b.h < m) m = b.h;
            return Number.isFinite(m) ? m : lowest;
          };
          const cellTop = (x: number, y: number) => {
            const i = Math.floor(x / cell) * cell, j = Math.floor(y / cell) * cell;
            return Math.max(this.h(i, j), this.h(i + cell, j), this.h(i, j + cell), this.h(i + cell, j + cell));
          };
          const surface = (x: number, y: number) => Math.max(bankLevel(x, y) + 0.2, cellTop(x, y) + 0.3);
          const pond = new THREE.Mesh(drapedPolygon(a.points, surface, cell / 2, 0), waterMaterial(c, ...this.waterShore(a.points)));
          pond.renderOrder = 2;
          pond.receiveShadow = true;
          g.add(pond);
          if (a.ob === true) obEdge(a, g);
          return g;
        }
        // (A woods' floor goes under the fairways and paths through it, and under its ponds)
        const floor = a.kind === "woods";
        const mesh = new THREE.Mesh(
          drapedPolygon(a.points, (x, y) => this.h(x, y), doc.gridSize, floor ? 0.08 : 0.15 + order * 0.01),
          new THREE.MeshLambertMaterial({ color: c, transparent: true, opacity: floor ? Math.min(fill, 0.45) : fill, depthWrite: false, polygonOffset: true, polygonOffsetFactor: floor ? -1 : -4, polygonOffsetUnits: floor ? -2 : -8 })
        );
        mesh.renderOrder = floor ? 0.5 : a.kind === "parking" ? tierOrder("road") : 2 + order * 0.001;
        mesh.receiveShadow = true;
        g.add(mesh);
        const w = a.kind === "ob" || a.kind === "hazard" || a.kind === "casual" || a.kind === "nogo" ? 3 : 1.5;
        if (w === 3 || !clean) g.add(this.fatLine(this.drapeLine(a.points, LIFT, true), c, w, { order: 4, dashed: a.kind === "hazard" || a.kind === "casual" || a.kind === "nogo" ? 6 : undefined }));
        // Marked OB (water, say): its red OB edge
        if (a.ob === true && a.kind !== "ob") obEdge(a, g);
        return g;
      });
      // Woods: trees standing in it (shadows and all)
      // (its own drawn trees: without measured ones, or when it asks for them, or filling in
      // between the measured ones as thickly as it asks; none when it says so)
      if (a.kind === "woods" && a.trees !== "none" && (!measured || a.trees === "drawn")) {
        const here = clearings.near(boundsOf(a.points));
        put(`woods:${a.id}`, JSON.stringify([a.points, hv, st.trees, st.landscape, st.treeMix, st.conifers, here.key, cutKey, a.pines, a.bushes, a.density, a.heights]), () => {
          this.plantings++;
          const woods = createWoods(a.points, (x, y) => this.h(x, y), st.trees, conifersOf(st), treeMixOf(st), (p, r) => here.test(p, r) || cutAt(p), 22 / Math.sqrt(Math.max(0.2, a.density ?? 1)), { pines: a.pines, bushes: a.bushes, heights: a.heights });
          woods.traverse(o => { o.userData.itemId = a.id; });
          this.shadowsDirty = true;
          return woods;
        }, this.itemsGroup, true);
      }
      // Underbrush beneath a wood (measured or drawn): its own bushes and young trees, kept off
      // the fairways, paths and water, and off the spots cut by hand
      if (a.kind === "woods" && a.trees !== "none" && (a.underbrush || a.brush?.some(b => b.level !== "none"))) {
        const here = clearings.near(boundsOf(a.points));
        const sections = (a.brush ?? []).filter(b => b.points.length >= 3);
        const inSection = (p: P) => sections.some(b => pointInPolygon(p, b.points));
        const edge = Math.min(1, Math.max(0, a.brushEdge ?? 0.6));
        // (`over`: the sections drawn after this one, which have their say where they overlap it)
        const plant = (key: string, outline: P[], level: "light" | "medium" | "heavy", kind: BrushKind, outside: boolean, over: P[][] = []) =>
          put(key, JSON.stringify([outline, level, kind, hv, st.trees, st.landscape, st.treeMix, st.conifers, here.key, cutKey, outside ? sections.map(b => b.points) : over, edge, a.points]), () => {
            this.plantings++;
            // (the wood's own level stays out of its sections; a section keeps to the wood)
            const keepOut = (p: P, r: number) => here.test(p, r) || cutAt(p) || (outside ? inSection(p) : !pointInPolygon(p, a.points) || over.some(o => pointInPolygon(p, o)));
            const brush = createUnderbrush(outline, (x, y) => this.h(x, y), st.trees, treeMixOf(st), keepOut, level, edge, a.points, kind);
            brush.traverse(o => { o.userData.itemId = a.id; });
            this.shadowsDirty = true;
            return brush;
          }, this.itemsGroup, true);
        const kind = a.brushKind ?? "mixed";
        if (a.underbrush) plant(`woods:${a.id}:under`, a.points, a.underbrush, kind, true);
        sections.forEach((b, i) => { if (b.level !== "none") plant(`woods:${a.id}:under:${i}`, b.points, b.level, b.kind ?? kind, false, sections.slice(i + 1).map(s => s.points)); });
      }
      // Custom: the measured trees stand as usual, and each patch drawn inside is filled in with
      // drawn trees as thickly as it says, never under a measured crown; outlined while picked
      if (a.kind === "woods" && a.trees === "custom" && measured && a.patches?.length) {
        const standing = this.lidarState?.stand ?? [], trees = lidar?.trees ?? [];
        a.patches.forEach((patch, i) => {
          const here = clearings.near(boundsOf(patch.points));
          const fill = Math.min(1, Math.max(0.1, patch.fill));
          put(`woods:${a.id}:patch:${i}`, JSON.stringify([patch.points, fill, hv, st.trees, st.landscape, st.treeMix, st.conifers, here.key, this.lidarKey, cutKey, a.pines, a.bushes, a.heights]), () => {
            this.plantings++;
            const box = boundsOf(patch.points);
            const near = standing.map(k => trees[k]).filter(t => t && t[0] >= box.minX - 40 && t[0] <= box.maxX + 40 && t[1] >= box.minY - 40 && t[1] <= box.maxY + 40);
            const keepOut = (p: P, reach: number) => here.test(p, reach) || cutAt(p) || near.some(t => Math.hypot(t[0] - p.x, t[1] - p.y) < t[3] * 0.8 + 4);
            const woods = createWoods(patch.points, (x, y) => this.h(x, y), st.trees, conifersOf(st), treeMixOf(st), keepOut, 22 / Math.sqrt(fill), { pines: a.pines, bushes: a.bushes, heights: a.heights });
            woods.traverse(o => { o.userData.itemId = a.id; });
            this.shadowsDirty = true;
            return woods;
          }, this.itemsGroup, true);
          if (a.id === this.selectedId) put(`woods:${a.id}:patchline:${i}`, JSON.stringify([patch.points, hv]), () => this.fatLine(this.drapeLine(patch.points, LIFT + 0.05, true), "#86efac", 1.5, { order: 5, dashed: 5 }));
        });
      }
    });
    // A hand-made flyover of the selected hole: its path over the ground, and where each keyframe looks
    const flyHole = this.hole(this.selectedId);
    if (flyHole?.flyKeys && flyHole.flyKeys.length >= 2 && !this.povHole) {
      const keys = flyHole.flyKeys;
      put(`flykeys:${flyHole.id}`, JSON.stringify([keys, hv, course.flyover, flyHole.flyover]), () => {
        const g = new THREE.Group();
        const f = keyFlight(keys, flyoverOf(course, flyHole), (x, y) => this.h(x, y));
        if (f) g.add(this.fatLine(this.drapeLine(f.cam.map(c => ({ x: c.x, y: c.y })), 0.6), "#38bdf8", 2.5, { order: 8, dashed: 8 }));
        for (const k of keys) g.add(this.fatLine(this.drapeLine([{ x: k.x, y: k.y }, { x: k.lookX, y: k.lookY }], 0.6), "#38bdf8", 1.5, { opacity: 0.7, order: 8 }));
        return g;
      });
    }
    // The painted map's own woods: trees standing on it
    const pw = painted && !measured ? this.paintedWoods : null;
    if (pw) {
      put("painted-woods", JSON.stringify([idOfGrid(pw), hv, st.trees, st.landscape, st.treeMix, st.conifers, clearings.key, cutKey]), () => {
        const inside = (p: P) => {
          const c = Math.floor((p.x - pw.x0) / pw.ftPerCell), r = Math.floor((p.y - pw.y0) / pw.ftPerCell);
          return c >= 0 && r >= 0 && c < pw.cols && r < pw.rows && pw.data[r * pw.cols + c] === 1;
        };
        // (as thick as the painting's tree cover)
        const woods = createWoodsWhere({ minX: 0, minY: 0, maxX: doc.canvas.width, maxY: doc.canvas.height }, inside, (x, y) => this.h(x, y), st.trees, conifersOf(st), treeMixOf(st), (p, r) => clearings.test(p, r) || cutAt(p), 22 / Math.sqrt(Math.max(0.15, pw.cover)));
        this.shadowsDirty = true;
        return woods;
      }, this.itemsGroup, true);
    }
    // Lines
    for (const l of course.items.filter(i => i.type === "line") as LineItem[]) {
      if (painted && (l.kind === "path" || l.kind === "road" || l.kind === "walk") && l.ob !== true) continue;
      const meta = LINE_KINDS[l.kind];
      // (paths and walks in their surface's color; dirt in the map's path color)
      const surfaced = (l.kind === "path" || l.kind === "walk") && l.surface && l.surface !== "dirt" ? PATH_SURFACES[l.surface].color : null;
      const c = l.kind === "ob" ? color("ob")! : surfaced ?? (l.kind === "path" || (l.kind === "walk" && l.width) ? st.path : l.kind === "stream" ? st.water : meta.color);
      const width = l.width ?? meta.width;
      // Marked OB: along all of it or its stretches; OB "and beyond" from its edge on the holes' side
      const obParts = l.ob === true && l.kind !== "ob" && l.points.length >= 2 ? obRanges(l).map(([a, b]) => {
        const piece = subPath(this.shapeOf(l).pts, a, b);
        return { a, b, piece, sides: l.obBeyond ? beyondSides(l, piece, doc.stats.filter(st => st.complete && obFor(course, l, st.holeId)).map(st => st.line), !obPicked(course, l).length) : null };
      }).filter(o => o.piece.length >= 2) : [];
      put(`line:${l.id}`, JSON.stringify([l.points, l.straight, l.kind, width, l.widths, hv, c, l.ob, l.obToward, l.kind === "stream" ? this.waterShore(l.points) : 0, obParts.map(o => [o.a, o.b, o.sides]), st.pathOrder]), () => {
        const g = new THREE.Group();
        const pts = this.shapeOf(l).pts;
        // (wider or narrower along the way: a creek that opens out)
        const along = widthAlong(l, width);
        // Marked OB (a creek, a road): a red edge either side (or on the holes' side only)
        const obMat = () => new THREE.MeshLambertMaterial({ color: color("ob")!, transparent: true, opacity: 0.95, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6 });
        for (const { a, b, piece, sides } of obParts) {
          const at = (u: number) => along(a + (b - a) * u);
          if (width > 0 && !sides) {
            const edge = new THREE.Mesh(drapedRibbon(piece, u => at(u) + 5, (x, y) => this.h(x, y), Math.max(3, doc.gridSize / 2), 0.16), obMat());
            edge.renderOrder = 1.9;
            g.add(edge);
          } else if (width > 0 && sides) {
            for (const side of sides) {
              const edge = new THREE.Mesh(drapedRibbon(offsetPath(piece, u => side * (at(u) / 2 + 2)), () => 4, (x, y) => this.h(x, y), Math.max(3, doc.gridSize / 2), 0.16), obMat());
              edge.renderOrder = 1.9;
              g.add(edge);
            }
          } else g.add(this.fatLine(this.drapeLine(piece), color("ob")!, 5, { order: 4.9 }));
        }
        if (width > 0 && l.points.length >= 2) {
          const ribbon = new THREE.Mesh(
            drapedRibbon(pts, along, (x, y) => this.h(x, y), Math.max(3, doc.gridSize / 2), 0.18),
            l.kind === "stream" ? waterMaterial(c, ...this.waterShore(l.points)) : new THREE.MeshLambertMaterial({ color: c, transparent: true, opacity: 1, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8 })
          );
          // (walks to the next hole over every other path)
          // (a walk to the next hole over the paths of its own kind it crosses)
          ribbon.renderOrder = l.kind === "stream" ? 2 : tierOrder(tierOf(l.kind, l.surface)) + (l.kind === "walk" ? 0.07 : 0);
          ribbon.receiveShadow = true;
          g.add(ribbon);
        } else {
          g.add(this.fatLine(this.drapeLine(pts, l.kind === "walk" ? LIFT + 0.15 : LIFT), c, l.kind === "ob" ? 3.5 : 2.5, { order: l.kind === "walk" ? 6 : 5, dashed: l.kind === "walk" ? 5 : l.kind === "fence" ? 2 : undefined }));
        }
        // (a walk with a width: its dashes along the middle too)
        if (l.kind === "walk" && width > 0) g.add(this.fatLine(this.drapeLine(pts, LIFT + 0.15), "#e2e8f0", 1.6, { dashed: 2.5, opacity: 0.85, order: 6 }));
        return g;
      });
    }
    // Built things: bridges, boardwalks, stairs, walls, buildings, shelters and decks, as models
    // at real size on the ground (each one rebuilt only when it or the ground changes)
    for (const st of course.items.filter(i => i.type === "structure") as StructureItem[]) {
      // (rebuilt on any change to it: its shape, size, roof, look or colors)
      put(`struct:${st.id}`, JSON.stringify([{ ...st, label: undefined, locked: undefined }, hv]), () => {
        const model = createStructure(st, (x, y) => this.h(x, y));
        model.traverse(o => { o.userData.itemId = st.id; });
        this.shadowsDirty = true;
        return model;
      }, this.itemsGroup);
    }
    // Throw lines, flight arcs and putting circles
    const tees = new Map(doc.stats.map(s => [s.holeId, s]));
    const off = this.otherLayouts();
    for (const hole of course.holes) {
      const s = tees.get(hole.id);
      const sel = this.selectedId === hole.id || doc.activeHoleId === hole.id;
      // Every tee's line (other tees fainter)
      for (const tee of holeTees(course, hole.id)) {
        const basket = basketFor(course, hole.id, doc.course.layouts.find(l => l.id === course.activeLayout)?.pin);
        if (!basket) continue;
        const main = s?.teeId === tee.id;
        // (another layout's tee: its line only while its hole is picked)
        const faded = !main && off.tees.has(tee.level);
        const line = smoothPath(throwLine(hole, tee, basket), 12);
        put(`throw:${tee.id}`, JSON.stringify([line, hv, main, sel, faded, clean && this.selectedId === hole.id]), () => {
          const g = new THREE.Group();
          if (clean ? this.selectedId !== hole.id : (!st.throwLines || faded) && !sel) return g;
          g.add(this.fatLine(this.drapeLine(line, LIFT + 0.1), sel ? SELECT : main ? "#ffffff" : TEE_LEVELS[tee.level].color, sel ? 3.5 : main ? 2.5 : 1.5, { dashed: main ? undefined : 7, opacity: main ? 0.95 : 0.75, order: 6 }));
          return g;
        });
      }
      for (const b of holeBaskets(course, hole.id)) {
        put(`circle:${b.id}`, JSON.stringify([b.x, b.y, hv, st.circle, clean]), () => {
          const g = new THREE.Group();
          if (!st.circle || clean) return g;
          const ring: P[] = [];
          for (let i = 0; i < 64; i++) ring.push({ x: b.x + Math.cos((i / 64) * Math.PI * 2) * CIRCLE_ONE_FT, y: b.y + Math.sin((i / 64) * Math.PI * 2) * CIRCLE_ONE_FT });
          g.add(this.fatLine(this.drapeLine(ring, 0.3, true), "#ffffff", 1.2, { opacity: 0.55, dashed: 3, order: 3 }));
          return g;
        });
      }
    }
    // Walks to the next tee
    if (st.nextTee) {
      // (from outside the putting circle to behind the next tee: see walkEnds)
      for (const { from, to, a } of autoWalks(doc.course.items, doc.stats, course.holes)) {
        const hole = course.holes.find(h => h.id === a.holeId);
        const wide = hole?.walkWidth ?? st.walkWidth, surface = hole?.walkSurface;
        put(`walk:${a.holeId}`, JSON.stringify([from, to, hv, wide, surface, painted, st.path, clean]), () => {
          const g = new THREE.Group();
          if (dist(from, to) < 10) return g;
          // (a path on the ground, as wide as walks are set, in its surface's color; on the painted
          // ground the painting has it)
          if (!painted) {
            const mesh = new THREE.Mesh(
              drapedRibbon([from, to], wide ?? 6, (x, y) => this.h(x, y), Math.max(3, doc.gridSize / 2), 0.17),
              new THREE.MeshLambertMaterial({ color: surface && surface !== "dirt" ? PATH_SURFACES[surface].color : st.path, transparent: true, opacity: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8 })
            );
            // (walks to the next hole over the paths of their own kind they cross, under the kinds above)
            mesh.renderOrder = tierOrder(tierOf("walk", surface)) + 0.07;
            g.add(mesh);
          }
          return g;
        });
      }
    }
    // Mandos, on the ground: the restricted line out to the side the disc must not pass (red),
    // and an arrow curving past the post on the side it must pass, in the direction of play
    const mandos = course.items.filter(i => i.type === "mando") as MandoItem[];
    for (const m of mandos) {
      const pair = m.pairId ? mandos.find(o => o.id === m.pairId) : undefined;
      if (pair) {
        // A gate: each post's restricted line points away from the other; one arrow through the gap
        put(`mando:${m.id}`, JSON.stringify([m.x, m.y, pair.x, pair.y, m.rotation, hv]), () => {
          const g = new THREE.Group();
          const dx = m.x - pair.x, dy = m.y - pair.y, l = Math.hypot(dx, dy) || 1;
          const out = [{ x: m.x + (dx / l) * 2.5, y: m.y + (dy / l) * 2.5 }, { x: m.x + (dx / l) * 30, y: m.y + (dy / l) * 30 }];
          g.add(this.fatLine(this.drapeLine(out, 0.4), "#ffffff", 5, { order: 5, opacity: 0.85 }));
          g.add(this.fatLine(this.drapeLine(out, 0.45), "#e11d2e", 3, { order: 6 }));
          if (m.id < pair.id) {
            const a = m.rotation * DEG, f = { x: Math.cos(a), y: Math.sin(a) };
            const mid = { x: (m.x + pair.x) / 2, y: (m.y + pair.y) / 2 };
            const tail = { x: mid.x - f.x * 16, y: mid.y - f.y * 16 }, tip = { x: mid.x + f.x * 16, y: mid.y + f.y * 16 };
            const w1 = { x: tip.x - Math.cos(a - 0.5) * 6, y: tip.y - Math.sin(a - 0.5) * 6 }, w2 = { x: tip.x - Math.cos(a + 0.5) * 6, y: tip.y - Math.sin(a + 0.5) * 6 };
            g.add(this.fatLine(this.drapeLine([tail, tip], 0.4), "#ffffff", 5, { order: 5, opacity: 0.85 }));
            g.add(this.fatLine(this.drapeLine([tail, tip], 0.45), "#f97316", 3, { order: 6 }));
            g.add(this.fatLine(this.drapeLine([w1, tip, w2], 0.45), "#f97316", 3, { order: 6 }));
          }
          return g;
        });
        continue;
      }
      put(`mando:${m.id}`, JSON.stringify([m.x, m.y, m.rotation, m.side, hv]), () => {
        const a = m.rotation * DEG;
        // Looking along the play direction (+angle), "right" on screen is +90° (plan y points down)
        const f = { x: Math.cos(a), y: Math.sin(a) };
        const right = { x: -f.y, y: f.x };
        const s = m.side === "left" ? -1 : 1;
        const at = (along: number, across: number) => ({ x: m.x + f.x * along + right.x * s * across, y: m.y + f.y * along + right.y * s * across });
        const g = new THREE.Group();
        g.add(this.fatLine(this.drapeLine([at(0, -2.5), at(0, -38)], 0.4), "#ffffff", 5, { order: 5, opacity: 0.85 }));
        g.add(this.fatLine(this.drapeLine([at(0, -2.5), at(0, -38)], 0.45), "#e11d2e", 3, { order: 6 }));
        // The pass arrow: a curve round the post, then its head
        const curve: P[] = [];
        for (let i = 0; i <= 16; i++) {
          const t = i / 16;
          const p0 = at(-22, 6), c = at(0, 20), p1 = at(18, 8);
          curve.push({ x: (1 - t) * (1 - t) * p0.x + 2 * (1 - t) * t * c.x + t * t * p1.x, y: (1 - t) * (1 - t) * p0.y + 2 * (1 - t) * t * c.y + t * t * p1.y });
        }
        const end = curve[curve.length - 1], before = curve[curve.length - 3];
        const ha = Math.atan2(end.y - before.y, end.x - before.x);
        const tip = { x: end.x + Math.cos(ha) * 5, y: end.y + Math.sin(ha) * 5 };
        const w1 = { x: end.x - Math.cos(ha - 1.1) * 6, y: end.y - Math.sin(ha - 1.1) * 6 };
        const w2 = { x: end.x - Math.cos(ha + 1.1) * 6, y: end.y - Math.sin(ha + 1.1) * 6 };
        g.add(this.fatLine(this.drapeLine(curve, 0.4), "#ffffff", 5, { order: 5, opacity: 0.85 }));
        g.add(this.fatLine(this.drapeLine(curve, 0.45), "#f97316", 3, { order: 6 }));
        g.add(this.fatLine(this.drapeLine([w1, tip, w2], 0.45), "#f97316", 3, { order: 6 }));
        return g;
      });
    }
    for (const [key, entry] of this.shapes) {
      if (seen.has(key)) continue;
      entry.obj.parent?.remove(entry.obj);
      disposeObjectDeep(entry.obj);
      this.shapes.delete(key);
    }
  }

  // ------------------------------------------------------------------ selection and hover

  private syncSelection() {
    if (this.selectionFx) {
      this.fx.remove(this.selectionFx);
      disposeObjectDeep(this.selectionFx);
      this.selectionFx = null;
    }
    const fx = this.outlineFor(this.selectedId, SELECT, 1);
    if (this.group.length) {
      const g = new THREE.Group();
      for (const id of this.group.slice(0, 400)) {
        const o = this.outlineFor(id, SELECT, 1);
        if (o) g.add(o);
      }
      if (fx) g.add(fx);
      this.selectionFx = g;
      this.fx.add(g);
    } else if (fx) {
      this.selectionFx = fx;
      this.fx.add(fx);
    }
  }

  private outlineFor(id: string | null, color: string, opacity: number): THREE.Object3D | null {
    const doc = this.doc;
    if (!doc || !id) return null;
    const g = new THREE.Group();
    const hole = this.hole(id);
    if (hole) {
      const s = doc.stats.find(x => x.holeId === hole.id);
      if (!s || s.line.length < 2) return null;
      const line = smoothPath(s.line, 10);
      g.add(this.fatLine(this.drapeLine(fairwayOutline(hole, line, 0, 12), 0.5, true), color, 2, { opacity: opacity * 0.9, dashed: 5, order: 9 }));
      return g;
    }
    const item = this.item(id);
    if (!item || item.type === "label") return null;
    if (item.type === "structure") {
      // Its outline (or both edges of a bridge or wall), seen through whatever stands over it
      const pts = isLineKind(item.kind) ? structurePath(item) : item.points;
      const w = isLineKind(item.kind) ? structureWidth(item) / 2 + 0.6 : 0;
      const edge = (off: number) => pts.map((p, i) => {
        const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)], l = Math.hypot(b.x - a.x, b.y - a.y) || 1;
        return { x: p.x - ((b.y - a.y) / l) * off, y: p.y + ((b.x - a.x) / l) * off };
      });
      const rings = w ? [[...edge(w), ...edge(-w).reverse()]] : [pts];
      for (const r of rings) g.add(this.fatLine(this.drapeLine(r, LIFT + 0.3, true), color, 3, { opacity, order: 9, depthTest: false }));
    } else if (item.type === "area") {
      g.add(this.fatLine(this.drapeLine(item.points, LIFT + 0.2, true), color, 3.5, { opacity, order: 9 }));
      // (a wood's underbrush sections and tree patches, while it's the one picked)
      if (id === this.selectedId && item.kind === "woods") {
        for (const b of item.brush ?? []) if (b.points.length >= 3) g.add(this.fatLine(this.drapeLine(b.points, LIFT + 0.25, true), BRUSH_SECTION, 3, { opacity, order: 9, dashed: 6, depthTest: false }));
        for (const p of item.patches ?? []) if (p.points.length >= 3) g.add(this.fatLine(this.drapeLine(p.points, LIFT + 0.25, true), TREE_PATCH, 3, { opacity, order: 9, dashed: 6, depthTest: false }));
      }
    }
    else if (item.type === "line") g.add(this.fatLine(this.drapeLine(item.points, LIFT + 0.2), color, 5, { opacity: opacity * 0.6, order: 9 }));
    else {
      const r = item.type === "tree" ? item.radius * (item.width ?? 1) * 1.05 : item.type === "tee" ? item.padLength * 0.62 : item.type === "basket" ? 3 : 3.5;
      const ring: P[] = [];
      for (let i = 0; i < 48; i++) ring.push({ x: item.x + Math.cos((i / 48) * Math.PI * 2) * r, y: item.y + Math.sin((i / 48) * Math.PI * 2) * r });
      g.add(this.fatLine(this.drapeLine(ring, 0.4, true), color, 2.5, { opacity, order: 9 }));
    }
    return g;
  }

  private setHover(id: string | null) {
    if (id === this.hoverId) return;
    this.hoverId = id;
    if (this.hoverFx) {
      this.fx.remove(this.hoverFx);
      disposeObjectDeep(this.hoverFx);
      this.hoverFx = null;
    }
    if (id && id !== this.selectedId && !this.group.includes(id)) {
      this.hoverFx = this.outlineFor(id, "#ffffff", 0.5);
      if (this.hoverFx) this.fx.add(this.hoverFx);
    }
    this.updateCursor();
    this.invalidate();
  }

  // ------------------------------------------------------------------ labels and badges (DOM)

  private syncOverlays() {
    const doc = this.doc;
    if (!doc) return;
    const course = doc.course;
    const seen = new Set<string>();
    const put = (key: string, sig: string, rank: number, make: () => HTMLDivElement, anchor: THREE.Vector3, dy: number, minPx = 0) => {
      seen.add(key);
      let o = this.overlays.get(key);
      if (!o || o.sig !== sig) {
        o?.el.remove();
        const el = make();
        el.classList.add("dg-ov");
        this.labelsLayer.appendChild(el);
        o = { el, anchor, dy, sig, rank, minPx, key };
        this.overlays.set(key, o);
      }
      o.anchor = anchor;
      o.dy = dy;
    };
    const at = (p: P, lift = 0) => new THREE.Vector3(p.x, this.h(p.x, p.y) + lift, p.y);
    const mainTees = new Set(doc.stats.map(s => s.teeId));
    const mainBaskets = new Set(doc.stats.map(s => s.basketId));
    const off = this.otherLayouts();
    const picked = new Set(this.group);
    const clean = this.readOnly;
    for (const item of course.items) {
      const sel = item.id === this.selectedId || picked.has(item.id);
      if (clean && (item.type === "tee" || item.type === "basket") && !(item.type === "tee" ? mainTees : mainBaskets).has(item.id)) continue;
      if (clean && (item.type === "mando" || item.type === "dropzone" || item.type === "amenity")) continue;
      if (item.type === "tee") {
        const t = item as TeeItem;
        const lvl = TEE_LEVELS[t.level];
        const n = this.num(t.holeId);
        const main = mainTees.has(t.id);
        // (another layout's tee: small and faint while this one is worked on)
        const faded = !main && !sel && off.tees.has(t.level);
        put(`tee:${t.id}`, `${n}|${t.level}|${sel}|${main}|${faded}|${clean}`, main ? 0 : 2, () => {
          const el = document.createElement("div");
          el.className = `dg-tee${main ? "" : " alt"}${faded ? " off" : ""}${sel ? " sel" : ""}`;
          el.dataset.itemId = t.id;
          el.setAttribute("data-testid", "tee-badge");
          el.style.setProperty("--c", lvl.color);
          el.style.setProperty("--ink", lvl.ink);
          el.title = clean ? `Hole ${n}` : `Hole ${n} · ${lvl.label} tee: drag to move`;
          if (clean) el.style.cursor = "pointer";
          el.textContent = String(n);
          return el;
        }, at(t, 1), 0);
      } else if (item.type === "basket") {
        const b = item as BasketItem;
        // (a basket several holes play to: each one's number)
        const n = basketHoles(b).filter(h => this.num(h)).sort((x, y) => holeNumber(this.doc!.course, x) - holeNumber(this.doc!.course, y)).map(h => this.num(h)).join(" & ");
        const shared = !!b.alsoHoles?.length;
        const multi = holeBaskets(course, b.holeId).length > 1;
        const main = mainBaskets.has(b.id);
        const faded = !main && !sel && off.pins.has(b.position);
        put(`basket:${b.id}`, `${n}|${b.position}|${multi}|${sel}|${main}|${faded}|${course.style.basket}|${clean}`, main ? 1 : 3, () => {
          const el = document.createElement("div");
          el.className = `dg-basket${faded ? " off" : ""}${sel ? " sel" : ""}`;
          el.dataset.itemId = b.id;
          el.setAttribute("data-testid", "basket-badge");
          el.style.setProperty("--c", course.style.basket);
          el.style.opacity = main ? "1" : "0.75";
          el.title = clean ? `Hole ${n}` : `Hole ${n} basket${multi ? ` (pin ${b.position})` : ""}: drag to move`;
          if (clean) el.style.cursor = "pointer";
          if (multi) {
            const tag = document.createElement("b");
            tag.textContent = b.position;
            el.appendChild(tag);
          }
          if (shared) {
            const tag = document.createElement("i");
            tag.className = "dg-shared";
            tag.textContent = n;
            el.appendChild(tag);
          }
          return el;
        }, at(b, 2), 0);
      } else if (item.type === "mando" || item.type === "dropzone" || item.type === "amenity") {
        // The same symbols as the printed map (the mando's arrow and line are drawn on the ground)
        const isM = item.type === "mando", isDz = item.type === "dropzone";
        const kind = item.type === "amenity" ? (item as AmenityItem).kind : null;
        put(`chip:${item.id}`, `${kind ?? item.type}|${sel}`, 2, () => {
          const el = document.createElement("div");
          el.className = `dg-sym${sel ? " sel" : ""}`;
          el.dataset.itemId = item.id;
          el.setAttribute("data-testid", `${item.type}-chip`);
          el.title = `${isM ? `Mando: pass on the ${item.side} (drag the round handle to turn it)` : isDz ? "Drop zone" : AMENITY_KINDS[kind!].label}: drag to move`;
          el.innerHTML = isM
            ? symbolSvg(`<circle r="5.5" fill="#fff" stroke="${INK}" stroke-width="1.6"/><circle r="2.4" fill="${MANDO}"/>`, 18)
            : isDz ? symbolSvg(dropZoneSymbol({ x: 0, y: 0 }, 1.15), 24) : symbolSvg(amenitySymbol(kind!, { x: 0, y: 0 }, 1), kind === "here" ? 34 : 22, kind === "here" ? 22 : 16);
          return el;
        }, at(item, 3), isM ? 0 : -10, 0);
      } else if (item.type === "label") {
        const l = item as LabelItem;
        put(`txt:${l.id}`, `${l.text}|${l.color}|${l.fontSize}|${sel}|${clean}`, 2, () => {
          const el = document.createElement("div");
          el.className = "dg-text";
          if (clean) el.style.pointerEvents = "none";
          else el.dataset.itemId = l.id;
          el.style.color = l.color;
          el.style.fontSize = `${clamp(l.fontSize, 9, 40)}px`;
          if (sel) el.style.outline = `2px solid ${SELECT}`;
          el.textContent = l.text;
          return el;
        }, at(l, 0.5), 0);
      } else if ((item.type === "area" || item.type === "structure") && item.label) {
        put(`area:${item.id}`, item.label, 4, () => {
          const el = document.createElement("div");
          el.className = "dg-area";
          el.textContent = item.label!;
          return el;
        }, at(item, 0.5), 0, 0);
      }
    }
    // Distance chips on each throw line (on a map looked at: the hole picked only)
    for (const s of doc.stats) {
      if (!s.complete || (clean && s.holeId !== this.selectedId)) continue;
      // Halfway, or nearby where no mando or drop zone sits (nor, on the selected hole, the dot
      // halfway along each leg that bends it)
      const marks: { p: P; r: number }[] = course.items.filter(i => i.type === "mando" || i.type === "dropzone").map(p => ({ p, r: 28 }));
      // (a dot's clearance at least the chip's half width on screen, zoomed out too)
      const chipR = (60 * 2 * this.controls.distance * Math.tan((this.camera.fov * DEG) / 2)) / Math.max(1, this.size.height);
      if (s.holeId === this.selectedId) for (let i = 1; i < s.line.length; i++) marks.push({ p: { x: (s.line[i - 1].x + s.line[i].x) / 2, y: (s.line[i - 1].y + s.line[i].y) / 2 }, r: Math.max(28, s.length * 0.1, chipR) });
      const mid = [0.5, 0.35, 0.65, 0.25, 0.75].map(f => pointAlong(s.line, s.length * f).point).find(q => marks.every(m => dist(m.p, q) > m.r)) ?? pointAlong(s.line, s.length / 2).point;
      const text = `${fmtDist(s.length, course.units)}`;
      const extra = `P${s.par}${Math.abs(s.elevationChange) >= 3 ? ` · ${fmtElev(s.elevationChange, course.units)}` : ""}`;
      put(`dist:${s.holeId}`, `${text}|${extra}`, 3, () => {
        const el = document.createElement("div");
        el.className = "dg-dist";
        el.setAttribute("data-testid", "hole-distance");
        el.textContent = text;
        const i = document.createElement("i");
        i.textContent = extra;
        el.appendChild(i);
        return el;
      }, at(mid, 1), 0, 110);
    }
    // Walks leaving a basket that holes share: which hole each goes to
    if (course.style.nextTee && !clean) {
      for (const r of sharedWalks(walkRoutes(course.items, doc.stats, course.holes))) {
        const len = pathLength(r.points);
        const text = `→ ${r.b.label}`;
        put(`walk:${r.a.holeId}`, text, 2, () => {
          const el = document.createElement("div");
          el.className = "dg-dist";
          el.setAttribute("data-testid", "walk-tag");
          el.textContent = text;
          return el;
        }, at(pointAlong(r.points, len * 0.32).point, 1), 0, 60);
      }
    }
    // Problems (Review step)
    (doc.issues ?? []).forEach((issue, i) => {
      if (clean || (issue.level === "info" && !issue.holes.length)) return;
      put(`issue:${i}`, `${issue.text}|${issue.level}`, 0, () => {
        const el = document.createElement("div");
        el.className = "dg-issue";
        el.setAttribute("data-testid", "issue-marker");
        el.style.background = issue.level === "danger" ? "#dc2626" : issue.level === "warning" ? "#d97706" : "#2563eb";
        el.title = `Checks: ${issue.text}`;
        el.textContent = issue.level === "info" ? "i" : "!";
        return el;
      }, at(issue.at, 2), -18);
    });
    // Trees measured from the air that are cut down: a stump to bring each back; those kept where
    // they'd be cut, a ring to cut them down after all
    const lidar = course.lidar, ls = this.lidarState;
    if (lidar && ls && !clean) {
      const mark = (k: number, kept: boolean) => {
        // (a sapling grown since the survey isn't in the list: no stump for it)
        const t = lidar.trees[k];
        if (!t) return;
        const [x, y] = t;
        put(`stump:${k}`, String(kept), 4, () => {
          const el = document.createElement("div");
          el.className = kept ? "dg-stump kept" : "dg-stump";
          el.dataset.stump = String(k);
          el.setAttribute("data-testid", kept ? "kept-tree" : "stump");
          el.title = kept ? "Cut down" : "Bring back";
          return el;
        }, at({ x, y }, 0.5), 0);
      };
      ls.cut.forEach(k => mark(k, false));
      ls.kept.forEach(k => mark(k, true));
    }
    for (const [key, o] of this.overlays) {
      if (!seen.has(key)) {
        o.el.remove();
        this.overlays.delete(key);
      }
    }
  }

  /** Whether a stump (or a kept tree's ring) shows: close enough to see, or on the hole picked. */
  private stumpShown(o: Overlay, picked: { line: P[]; half: number } | null) {
    if (this.readOnly) return false;
    if (picked && distanceToPath({ x: o.anchor.x, y: o.anchor.z }, picked.line) < picked.half) return true;
    return this.showStumps && 1 / this.upp(o.anchor) >= 0.8;
  }

  /** A measured tree cut down (taken out, or cleared for play) or brought back, one undo step. */
  toggleLidarTree(k: number) {
    const lidar = this.doc?.course.lidar, ls = this.lidarState;
    if (!lidar || !ls || !lidar.trees[k]) return;
    const kept = new Set(lidar.kept ?? []), removed = new Set(lidar.removed ?? []);
    const [x, y, , r] = lidar.trees[k];
    if (ls.stand.includes(k)) {
      if (kept.has(k)) kept.delete(k);
      else removed.add(k);
    } else {
      removed.delete(k);
      if (this.clearedAt({ x, y }, r * 0.3)) kept.add(k);
    }
    const list = (set: Set<number>) => (set.size ? [...set].sort((a, b) => a - b) : undefined);
    this.cb.onLidar({ kept: list(kept), removed: list(removed) });
  }

  /** The measured tree standing at a spot (its trunk within reach), if any. */
  /** The trees under the pointer, nearest the eye first, by the shapes they're drawn with: a
   * trunk, and a crown round its upper part (a crown seen from the side or tilted is far from the
   * ground behind it). Measured trees, the saplings grown since the survey and the trees planted in
   * woods; not the tree items (they're picked as items). A sapling under a big crown is in the list
   * too, after the big tree. */
  treesAtScreen(clientX: number, clientY: number, max = 6): NonNullable<ReturnType<CourseView["treeAt"]>>[] {
    const ray = this.ray(clientX, clientY).clone();
    const hits: { t: number; tree: NonNullable<ReturnType<CourseView["treeAt"]>> }[] = [];
    const a = new THREE.Vector3(), b = new THREE.Vector3(), onRay = new THREE.Vector3(), c = new THREE.Vector3(), o = new THREE.Vector3(), d = new THREE.Vector3();
    // (a crown: an ellipsoid round the upper part; at least 3 ft across, so a sprout can be hit)
    const crownHit = (x: number, y: number, ground: number, height: number, radius: number) => {
      const rx = Math.max(1.5, radius), ry = Math.max(1.5, height * 0.34);
      c.set(x, ground + height * 0.64, y);
      o.copy(ray.origin).sub(c); d.copy(ray.direction);
      o.x /= rx; o.z /= rx; o.y /= ry; d.x /= rx; d.z /= rx; d.y /= ry;
      const A = d.dot(d), B = 2 * o.dot(d), C = o.dot(o) - 1, disc = B * B - 4 * A * C;
      if (disc < 0) return Infinity;
      const t = (-B - Math.sqrt(disc)) / (2 * A);
      return t > 0 ? t : Infinity;
    };
    const test = (x: number, y: number, ground: number, height: number, radius: number, tree: NonNullable<ReturnType<CourseView["treeAt"]>>) => {
      let t = crownHit(x, y, ground, height, radius);
      // (its trunk, below the crown)
      a.set(x, ground, y); b.set(x, ground + height * 0.4, y);
      const r = Math.max(1, radius * 0.12);
      if (ray.distanceSqToSegment(a, b, onRay) <= r * r) t = Math.min(t, onRay.distanceTo(ray.origin));
      if (t < Infinity) hits.push({ t, tree });
    };
    const lidar = this.doc?.course.lidar, ls = this.lidarState;
    if (lidar && ls) {
      for (const k of ls.stand) {
        const tr = lidar.trees[k];
        if (!tr) continue;
        const [x, y, h, r] = grownTree(tr, lidar.growYears ?? 0);
        test(x, y, this.h(x, y), h, r, { kind: "measured", k });
      }
    }
    for (const g of this.itemsGroup.children) {
      const spots = g.userData.spots as TreeSpot[] | undefined;
      if (!spots) continue;
      // (the measured forest: its measured trees are tested above by index; its saplings here)
      const measuredCount = g.userData.measured ? (lidar?.trees.length ?? 0) : 0;
      const indexOf = g.userData.indexes as number[] | undefined;
      spots.forEach((s, i) => {
        if (measuredCount && indexOf && indexOf[i] < measuredCount) return;
        test(s.x, s.y, s.ground, s.height, s.width / 2, { kind: "spot", x: s.x, y: s.y, height: s.height, width: s.width, conifer: s.shape === "conifer" });
      });
    }
    return hits.sort((p, q) => p.t - q.t).slice(0, max).map(h => h.tree);
  }

  /** How a tree looks where it stands (its shape variant, turn and leaf color), so a tree made the
   * course's own looks just the same. */
  lookOf(tree: NonNullable<ReturnType<CourseView["treeAt"]>>): { variant: number; rotation: number; leaf: string } | null {
    for (const g of this.itemsGroup.children) {
      const spots = g.userData.spots as TreeSpot[] | undefined;
      if (!spots) continue;
      const indexOf = g.userData.indexes as number[] | undefined;
      const i = tree.kind === "measured" ? (g.userData.measured && indexOf ? indexOf.indexOf(tree.k) : -1) : spots.findIndex(s => Math.abs(s.x - tree.x) < 0.05 && Math.abs(s.y - tree.y) < 0.05);
      if (i >= 0) { const s = spots[i]; return { variant: s.variant, rotation: Math.round((-s.turn / DEG) * 10) / 10, leaf: `#${s.tint.getHexString()}` }; }
    }
    return null;
  }

  /** The nearest tree under the pointer (see treesAtScreen). */
  treeAtScreen(clientX: number, clientY: number): ReturnType<CourseView["treeAt"]> {
    return this.treesAtScreen(clientX, clientY, 1)[0] ?? null;
  }

  /** Any tree standing at a spot that isn't an item of its own: a measured one (its index), or a
   * sapling or planted tree (where it stands and its size). */
  treeAt(p: P): { kind: "measured"; k: number } | { kind: "spot"; x: number; y: number; height: number; width: number; conifer: boolean } | null {
    const k = this.lidarTreeAt(p);
    if (k !== null) return { kind: "measured", k };
    let best: TreeSpot | null = null, bestD = Infinity;
    const look = (g: THREE.Object3D) => {
      const spots = g.userData.spots as TreeSpot[] | undefined;
      if (!spots) return;
      for (const s of spots) {
        const d = Math.hypot(s.x - p.x, s.y - p.y);
        if (d < Math.max(4, s.width * 0.3) && d < bestD) { best = s; bestD = d; }
      }
    };
    this.itemsGroup.children.forEach(look);
    const b = best as TreeSpot | null;
    return b ? { kind: "spot", x: b.x, y: b.y, height: b.height, width: b.width, conifer: b.shape === "conifer" } : null;
  }

  lidarTreeAt(p: P): number | null {
    const lidar = this.doc?.course.lidar, ls = this.lidarState;
    if (!lidar || !ls) return null;
    let best: number | null = null, bestD = Infinity;
    for (const k of ls.stand) {
      const t = lidar.trees[k];
      if (!t) continue; // (a sapling since the survey: not one to cut by hand)
      const [x, y, , r] = t, d = Math.hypot(x - p.x, y - p.y);
      if (d < Math.max(4, r * 0.6) && d < bestD) { best = k; bestD = d; }
    }
    return best;
  }

  // ------------------------------------------------------------------ handles

  private syncHandles() {
    const doc = this.doc;
    if (!doc) return;
    const editing = this.tool.mode === "select" && !this.readOnly;
    const sel = editing ? this.item(this.selectedId) : null;
    const holeId = editing ? (this.hole(this.selectedId)?.id ?? doc.activeHoleId) : null;
    const hole = this.hole(holeId);
    const drawing = this.drawn() ? this.drawPts.length : -1;
    const key = `${sel?.id ?? ""}|${sel?.locked ?? ""}|${sel && (sel.type === "area" || sel.type === "line" || sel.type === "structure") ? `${sel.points.length}${sel.type === "structure" || sel.type === "line" ? sel.kind : ""}` : ""}|${hole ? `${hole.id}:${hole.doglegs.length}:${doc.stats.find(s => s.holeId === hole.id)?.complete}:${hole.flyKeys?.length ?? 0}:${hole.fairwayStations?.length ?? 0}:${this.selectedId === hole.id}:${doc.course.holes.length}:${doc.course.style.nextTee}` : ""}|${drawing}`;
    const obKey = `${sel?.type === "line" || sel?.type === "area" ? `${sel.ob}:${sel.obStretches?.length ?? 0}` : ""}|${this.obPick ? `${this.obPick.id}:${this.obPick.from}:${this.obPick.cut}` : ""}`;
    if (`${this.readOnly}${key}${obKey}` === this.handleKey) return;
    this.handleKey = `${this.readOnly}${key}${obKey}`;
    this.handles.forEach(h => h.el.remove());
    this.handles = [];
    const add = (kind: string, world: () => THREE.Vector3 | null, start: Handle["start"], opts: { index?: number; title?: string; data?: Record<string, string>; visible?: () => boolean } = {}) => {
      const el = document.createElement("div");
      el.className = "dg-h";
      el.dataset.handle = kind;
      el.setAttribute("data-testid", `handle-${kind}`);
      if (opts.index !== undefined) el.dataset.index = String(opts.index);
      if (opts.title) el.title = opts.title;
      Object.entries(opts.data ?? {}).forEach(([k, v]) => (el.dataset[k] = v));
      this.handlesLayer.appendChild(el);
      this.handles.push({ el, kind, index: opts.index, world, start, visible: opts.visible });
    };
    // Marking a stretch of OB: where it starts, once clicked
    const pick = this.obPick, picked = pick && pick.from !== null ? (this.item(pick.id) as LineItem | AreaItem | null) : null;
    if (pick && (picked?.type === "line" || picked?.type === "area")) {
      add("obmark", () => {
        const pts = this.obPath(picked), p = pointAlong(pts, (pick.from ?? 0) * pathLength(pts)).point;
        return new THREE.Vector3(p.x, this.h(p.x, p.y) + 0.3, p.y);
      }, () => null);
    }
    if (drawing > 0) {
      for (let i = 0; i < this.drawPts.length; i++) {
        add("draw", () => { const p = this.drawPts[i]; return p ? new THREE.Vector3(p.x, this.h(p.x, p.y), p.y) : null; }, () => {
          // Clicking the first point closes an area
          if (i === 0 && this.drawn() === "area") this.finishDrawing();
          return null;
        }, { index: i, title: i === 0 ? "Click to close the shape" : undefined });
      }
      if (this.size.width > 1) this.layout();
      return;
    }
    if (hole) this.holeHandles(hole.id, add);
    if (sel && !sel.locked) this.itemHandles(sel, add);
    // Place them now (not on the next frame), so a quick second click finds them where they were
    if (this.size.width > 1) this.layout();
  }

  private itemHandles(sel: CourseItem, add: (kind: string, world: () => THREE.Vector3 | null, start: Handle["start"], opts?: any) => void) {
    if (sel.type === "area" || sel.type === "line" || sel.type === "structure") {
      this.pointHandles(sel.id, add);
      this.turnHandle(sel.id, add);
    }
    if (sel.type === "line" && sel.kind === "stream") this.lineWidthHandles(sel.id, add);
    if ((sel.type === "line" || sel.type === "area") && sel.ob === true && sel.obStretches?.length && !sel.locked) this.obStretchHandles(sel.id, add);
    if (sel.type === "structure" && !isLineKind(sel.kind)) this.outlineHandles(sel.id, add);
    else if (sel.type === "tree") {
      const id = sel.id;
      add("radius", () => {
        const t = this.item(id) as TreeItem | null;
        if (!t) return null;
        const r = t.radius * (t.width ?? 1);
        return new THREE.Vector3(t.x + r, this.h(t.x + r, t.y) + 0.2, t.y);
      }, e => this.planeDrag(e, id, (p, t) => ({ radius: Math.max(2, Math.hypot(p.x - t.x, p.y - t.y) / ((t as TreeItem).width ?? 1)) })), { title: "Drag to resize the crown" });
    } else if (sel.type === "mando" || sel.type === "tee" || sel.type === "amenity") {
      const id = sel.id;
      const reach = sel.type === "tee" ? sel.padLength / 2 + 6 : 14;
      add("rotate", () => {
        const it = this.item(id);
        if (!it) return null;
        const a = (it.type === "tee" ? teeAim(this.doc!.course, it) : it.rotation) * DEG;
        // (On a touch screen, where handles are bigger, never on top of the thing itself when
        // zoomed out: a little way off on screen)
        const r = COARSE ? Math.max(reach, 40 * this.upp(new THREE.Vector3(it.x, this.h(it.x, it.y), it.y))) : reach;
        const x = it.x + Math.cos(a) * r, y = it.y + Math.sin(a) * r;
        return new THREE.Vector3(x, this.h(x, y) + 0.3, y);
      }, e => this.planeDrag(e, id, (p, it, ev) => {
        let deg = (Math.atan2(p.y - it.y, p.x - it.x) * 180) / Math.PI;
        if (ev.shiftKey) deg = Math.round(deg / 15) * 15;
        deg = ((deg % 360) + 360) % 360;
        return it.type === "tee" ? { rotation: deg, aimFixed: true } : { rotation: deg };
      }), { title: sel.type === "mando" ? "Drag to turn the arrow (the direction of play)" : sel.type === "tee" ? "Drag to turn the pad (Shift snaps 15°)" : "Drag to turn it" });
    }
  }

  /** A hole's doglegs: drag a dot to move a turn, pull a mid dot to add one, double-click to remove one; and a square for the fairway width. */
  private holeHandles(holeId: string, add: (kind: string, world: () => THREE.Vector3 | null, start: Handle["start"], opts?: any) => void) {
    const stats = () => this.doc?.stats.find(s => s.holeId === holeId) ?? null;
    const hole = () => this.hole(holeId);
    const at = (p: P) => new THREE.Vector3(p.x, this.h(p.x, p.y) + 0.3, p.y);
    const h0 = hole();
    const s0 = stats();
    if (!h0 || !s0?.complete) return;
    const dragPoint = (index: number, start: P[]): Drag => {
      const pts = start.map(p => ({ ...p }));
      const y = this.h(pts[index].x, pts[index].y);
      return {
        move: ev => {
          const hit = this.planeAt(ev.clientX, ev.clientY, y);
          if (!hit) return;
          pts[index] = { x: hit.x, y: hit.z };
          this.cb.onHoleChange(holeId, { doglegs: pts.map(p => ({ ...p })) });
        },
        end: () => this.cb.onCommit()
      };
    };
    h0.doglegs.forEach((_, i) => {
      add("dogleg", () => { const p = hole()?.doglegs[i]; return p ? at(p) : null; }, e => {
        const h = hole();
        if (!h) return null;
        const now = performance.now();
        const last = this.lastCorner;
        this.lastCorner = { id: holeId, index: i, time: now };
        if (e.altKey || (last && last.id === holeId && last.index === i && now - last.time < 400)) {
          this.lastCorner = null;
          this.cb.onHoleChange(holeId, { doglegs: h.doglegs.filter((_, k) => k !== i) });
          this.cb.onCommit();
          return null;
        }
        return dragPoint(i, h.doglegs);
      }, { index: i, title: "Drag to move this turn · double-click to remove it" });
    });
    // The walks on to the next tee and in from the hole before (while the hole is selected): where
    // each starts and ends, to drag (double-click: back where it goes by itself)
    if (this.selectedId === holeId && this.doc?.course.style.nextTee) {
      const walks = () => (this.doc ? autoWalks(this.doc.course.items, this.doc.stats, this.doc.course.holes) : []);
      const end = (which: "out" | "in") => {
        const w = walks().find(x => (which === "out" ? x.a.holeId : x.b.holeId) === holeId);
        return w ? { at: which === "out" ? w.from : w.to, anchor: which === "out" ? w.basket : w.tee } : null;
      };
      for (const which of ["out", "in"] as const) {
        if (!end(which)) continue;
        add(which === "out" ? "walkout" : "walkin", () => { const e = end(which); return e ? at(e.at) : null; }, () => {
          const e0 = end(which);
          if (!e0) return null;
          const now = performance.now();
          const key = `${holeId}:${which}`;
          if (this.lastWalkTap && this.lastWalkTap.key === key && now - this.lastWalkTap.time < 400) {
            this.lastWalkTap = null;
            this.cb.onHoleChange(holeId, which === "out" ? { walkOut: undefined } : { walkIn: undefined });
            this.cb.onCommit();
            return null;
          }
          this.lastWalkTap = { key, time: now };
          const y = this.h(e0.at.x, e0.at.y);
          const r1 = (v: number) => Math.round(v * 10) / 10;
          return {
            move: ev => {
              const hit = this.planeAt(ev.clientX, ev.clientY, y);
              if (!hit) return;
              const off = { x: r1(hit.x - e0.anchor.x), y: r1(hit.z - e0.anchor.y) };
              this.cb.onHoleChange(holeId, which === "out" ? { walkOut: off } : { walkIn: off });
            },
            end: () => this.cb.onCommit()
          };
        }, { title: which === "out" ? "Where the walk to the next tee starts: drag · double-click to reset" : "Where the walk from the hole before arrives: drag · double-click to reset" });
      }
    }
    // A hand-made flyover (while the hole is selected): each keyframe's camera spot (numbered) and
    // what it looks at, to drag
    const keys = h0.flyKeys;
    if (keys && keys.length >= 2 && this.selectedId === holeId) {
      const dragKey = (index: number, look: boolean): Drag | null => {
        const list = hole()?.flyKeys?.map(k => ({ ...k }));
        const k0 = list?.[index];
        if (!list || !k0) return null;
        const y = look ? this.h(k0.lookX, k0.lookY) : this.h(k0.x, k0.y);
        const r1 = (v: number) => Math.round(v * 10) / 10;
        return {
          move: ev => {
            const hit = this.planeAt(ev.clientX, ev.clientY, y);
            if (!hit) return;
            list[index] = look ? { ...list[index], lookX: r1(hit.x), lookY: r1(hit.z) } : { ...list[index], x: r1(hit.x), y: r1(hit.z) };
            this.cb.onHoleChange(holeId, { flyKeys: list.map(k => ({ ...k })) });
          },
          end: () => this.cb.onCommit()
        };
      };
      keys.forEach((_, i) => {
        add("flylook", () => { const k = hole()?.flyKeys?.[i]; return k ? at({ x: k.lookX, y: k.lookY }) : null; }, () => dragKey(i, true), { index: i, title: `Where keyframe ${i + 1} looks: drag` });
        add("flykey", () => { const k = hole()?.flyKeys?.[i]; return k ? at(k) : null; }, () => dragKey(i, false), { index: i, title: `Flyover keyframe ${i + 1}: drag to move the camera`, data: { n: String(i + 1) } });
      });
    }
    // Mid dots between each pair of line points: pulling one adds a turn there
    const n = s0.line.length;
    for (let i = 0; i + 1 < n; i++) {
      add("mid", () => {
        const s = stats();
        if (!s || s.line.length !== n) return null;
        const a = s.line[i], b = s.line[i + 1];
        return at({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
      }, () => {
        const s = stats(), h = hole();
        if (!s || !h) return null;
        const a = s.line[i], b = s.line[i + 1];
        const doglegs = [...h.doglegs];
        // Line point i+1 is dogleg i (point 0 is the tee)
        doglegs.splice(i, 0, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
        this.cb.onHoleChange(holeId, { doglegs });
        return dragPoint(i, doglegs);
      }, {
        index: i,
        title: "Drag to bend the hole here",
        data: { kind: "line" },
        visible: () => {
          const s = stats();
          if (!s || s.line.length !== n) return false;
          const a = this.project(at(s.line[i])), b = this.project(at(s.line[i + 1]));
          return !!a && !!b && Math.hypot(a.x - b.x, a.y - b.y) > 36;
        }
      });
    }
    // Fairway width: squares on both edges at points along the hole (to start with: just off the
    // tee, the landing zones, round the basket); each moves its own edge (Shift: both), blending
    // smoothly into the rest; a + between them adds a point there, a double-click takes one out
    const along = (t: number, flip: 1 | -1) => {
      const s = stats();
      if (!s || s.line.length < 2) return null;
      const line = smoothPath(s.line, 10);
      const { point, angle } = pointAlong(line, pathLength(line) * t);
      return { point, n: { x: -Math.sin(angle) * flip, y: Math.cos(angle) * flip } };
    };
    // (this side's edge: the middle, moved off the line maybe, plus half the width)
    const edgeAt = (h: Hole, t: number, flip: 1 | -1) => {
      const sd = along(t, flip);
      if (!sd || !h.fairway) return null;
      const e = fairwayShiftAt(h)(t) * flip + fairwayWidthAt(h)(t) / 2;
      return at({ x: sd.point.x + sd.n.x * e, y: sd.point.y + sd.n.y * e });
    };
    const widthDrag = (index: number, t: number, flip: 1 | -1, h0: Hole): Drag | null => {
      const sd = along(t, flip);
      if (!sd) return null;
      const y = this.h(sd.point.x, sd.point.y);
      // (across the hole, toward this side: the middle and the far edge when picked up)
      const mid0 = fairwayShiftAt(h0)(t) * flip, far0 = mid0 - fairwayWidthAt(h0)(t) / 2;
      return {
        move: ev => {
          const h = hole();
          const hit = this.planeAt(ev.clientX, ev.clientY, y);
          if (!hit || !h) return;
          const d = (hit.x - sd.point.x) * sd.n.x + (hit.z - sd.point.y) * sd.n.y;
          // This side only (the other edge stays), or both sides alike with Shift
          const w = ev.shiftKey ? clamp(2 * Math.abs(d - mid0), 8, 300) : clamp(d - far0, 8, 300);
          const mid = ev.shiftKey ? mid0 : far0 + w / 2;
          const S = stationsOf(h);
          const shape = h.fairwayShape?.length === S.length ? [...h.fairwayShape] : S.map(() => 1);
          const shift = h.fairwayShift?.length === S.length ? [...h.fairwayShift] : S.map(() => 0);
          shape[index] = Math.round((w / h.fairwayWidth) * 100) / 100;
          shift[index] = Math.round(((mid * flip) / h.fairwayWidth) * 100) / 100;
          this.cb.onHoleChange(holeId, { fairwayShape: shape, fairwayShift: shift.some(v => v !== 0) ? shift : undefined });
        },
        end: () => this.cb.onCommit()
      };
    };
    // Only where it stands clear of the tee, the basket and the hole's distance label on screen
    // (a short hole seen from far, or a touch screen's bigger handles: a square on the tee would
    // take the tee's taps and its long-press menu, one on the label would hide it)
    const clear = (p: THREE.Vector3 | null) => {
      const s = stats();
      const me = p && this.project(p);
      if (!s || !me || s.line.length < 2) return false;
      const room = COARSE ? 44 : 24;
      const chip = this.overlays.get(`dist:${holeId}`);
      const c = chip && chip.el.style.display !== "none" && chip.w && chip.h ? this.project(chip.anchor) : null;
      // (the square on the label: within the label's box grown by the square's own half size)
      const half = COARSE ? 11 : 6;
      if (c && Math.abs(me.x - c.x) < chip!.w! / 2 + half && Math.abs(me.y - c.y - chip!.dy) < chip!.h! / 2 + half) return false;
      return [s.line[0], s.line[s.line.length - 1]].every(q => {
        const e = this.project(at(q));
        return !!e && Math.hypot(e.x - me.x, e.y - me.y) >= room;
      });
    };
    const h1 = hole();
    const S0 = h1 ? stationsOf(h1) : FAIRWAY_STATIONS;
    S0.forEach((_, i) => {
      for (const flip of [1, -1] as const) {
        const tOf = () => { const h = hole(); return h ? stationsOf(h)[i] : undefined; };
        const pos = () => { const h = hole(), t = tOf(); return h && t !== undefined ? edgeAt(h, t, flip) : null; };
        add("width", pos, e => {
          const h0 = hole(), t = tOf();
          if (!h0 || t === undefined) return null;
          // (a double-click takes the point out)
          const now = performance.now(), last = this.lastCorner;
          this.lastCorner = { id: `${holeId}:w`, index: i, time: now };
          if (e.altKey || (last && last.id === `${holeId}:w` && last.index === i && now - last.time < 400)) {
            this.lastCorner = null;
            this.cb.onHoleChange(holeId, withoutStation(h0, i));
            this.cb.onCommit();
            return null;
          }
          return widthDrag(i, t, flip, h0);
        }, { index: i * 2 + (flip === 1 ? 0 : 1), title: "Drag: this side wider or narrower · Shift: both sides · double-click: remove", data: { station: String(i), side: String(flip) }, visible: () => clear(pos()) });
      }
    });
    // (between the points, and between them and the tee and the basket)
    const gaps = [0, ...S0, 1];
    for (let g = 0; g + 1 < gaps.length; g++) {
      for (const flip of [1, -1] as const) {
        const mid = () => {
          const h = hole();
          if (!h) return null;
          const S = [0, ...stationsOf(h), 1];
          return S.length === gaps.length ? (S[g] + S[g + 1]) / 2 : null;
        };
        const pos = () => { const h = hole(), t = mid(); return h && t !== null ? edgeAt(h, t, flip) : null; };
        add("widen", pos, () => {
          const h0 = hole(), t = mid();
          if (!h0 || t === null) return null;
          const { index, patch } = withStation(h0, t);
          this.cb.onHoleChange(holeId, patch);
          return widthDrag(index, t, flip, { ...h0, ...patch });
        }, {
          index: g * 2 + (flip === 1 ? 0 : 1),
          title: "Drag to make the fairway wider or narrower here",
          data: { side: String(flip) },
          visible: () => {
            const h = hole(), t = mid();
            if (!h || t === null) return false;
            const S = [0, ...stationsOf(h), 1];
            const a = edgeAt(h, S[g], flip), b = edgeAt(h, S[g + 1], flip), me = pos();
            const pa = a && this.project(a), pb = b && this.project(b);
            return !!pa && !!pb && Math.hypot(pa.x - pb.x, pa.y - pb.y) > 70 && clear(me);
          }
        });
      }
    }
  }

  /** An area's corners or a line's points: drag to move, double-click to remove, pull a mid dot to add one. */
  private pointHandles(id: string, add: (kind: string, world: () => THREE.Vector3 | null, start: Handle["start"], opts?: any) => void) {
    const it = () => this.item(id) as AreaItem | LineItem | StructureItem | null;
    const at = (p: P) => new THREE.Vector3(p.x, this.h(p.x, p.y) + 0.3, p.y);
    const first = it();
    if (!first) return;
    const closed = first.type === "area" || (first.type === "structure" && !isLineKind(first.kind));
    const min = closed ? 3 : 2;
    const drag = (index: number, start: P[]): Drag => {
      const pts = start.map(p => ({ ...p }));
      const y = this.h(pts[index].x, pts[index].y);
      return {
        move: ev => {
          const hit = this.planeAt(ev.clientX, ev.clientY, y);
          if (!hit) return;
          pts[index] = { x: hit.x, y: hit.z };
          this.cb.onChange(id, { points: pts.map(p => ({ ...p })) });
        },
        end: () => this.cb.onCommit()
      };
    };
    const n = first.points.length;
    for (let i = 0; i < n; i++) {
      add("corner", () => { const p = it()?.points[i]; return p ? at(p) : null; }, e => {
        const cur = it();
        if (!cur) return null;
        const now = performance.now();
        const last = this.lastCorner;
        this.lastCorner = { id, index: i, time: now };
        if (e.altKey || (last && last.id === id && last.index === i && now - last.time < 400)) {
          this.lastCorner = null;
          if (cur.points.length > min) {
            this.cb.onChange(id, { points: cur.points.filter((_, k) => k !== i), ...(cur.type === "line" ? { widths: widthsWithout(cur, i) } : {}) });
            this.cb.onCommit();
          }
          return null;
        }
        return drag(i, cur.points);
      }, { index: i, title: "Drag to move this point · double-click to remove it" });
      if (!closed && i + 1 >= n) continue;
      add("mid", () => {
        const pts = it()?.points;
        if (!pts || pts.length !== n) return null;
        const a = pts[i], b = pts[(i + 1) % n];
        return at({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
      }, () => {
        const cur = it();
        if (!cur) return null;
        const a = cur.points[i], b = cur.points[(i + 1) % cur.points.length];
        const next = [...cur.points.slice(0, i + 1), { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, ...cur.points.slice(i + 1)];
        this.cb.onChange(id, { points: next, ...(cur.type === "line" ? { widths: widthsWithPoint(cur, i) } : {}) });
        return drag(i + 1, next);
      }, {
        index: i,
        title: "Drag to add a point here",
        visible: () => {
          const pts = it()?.points;
          if (!pts || pts.length !== n) return false;
          const a = this.project(at(pts[i])), b = this.project(at(pts[(i + 1) % n]));
          return !!a && !!b && Math.hypot(a.x - b.x, a.y - b.y) > 40;
        }
      });
    }
    // A line goes on from either end: pull the + beyond an end for another point there
    if (closed) return;
    for (const end of [0, 1] as const) {
      const spot = () => {
        const pts = it()?.points;
        if (!pts || pts.length < 2) return null;
        const a = end ? pts[pts.length - 1] : pts[0], b = end ? pts[pts.length - 2] : pts[1];
        const len = Math.hypot(a.x - b.x, a.y - b.y) || 1;
        const reach = Math.max(4, 26 * this.upp(at(a)));
        return { x: a.x + ((a.x - b.x) / len) * reach, y: a.y + ((a.y - b.y) / len) * reach };
      };
      add("extend", () => { const p = spot(); return p ? at(p) : null; }, () => {
        const cur = it(), p = spot();
        if (!cur || !p) return null;
        const next = end ? [...cur.points, p] : [p, ...cur.points];
        this.cb.onChange(id, { points: next, ...(cur.type === "line" ? { widths: widthsWithEnd(cur, end) } : {}) });
        return drag(end ? next.length - 1 : 0, next);
      }, { index: end, title: "Drag to make it longer" });
    }
  }

  /** A creek's width at each of its points: a square on either bank, dragged out or in (the rest of
   * it keeps its width); double-click: back to the creek's width. */
  private lineWidthHandles(id: string, add: (kind: string, world: () => THREE.Vector3 | null, start: Handle["start"], opts?: any) => void) {
    const it = () => this.item(id) as LineItem | null;
    const first = it();
    if (!first || first.points.length < 2) return;
    const n = first.points.length;
    // (across the line at point i, from the points either side of it)
    const across = (pts: P[], i: number) => {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      return { x: -(b.y - a.y) / len, y: (b.x - a.x) / len };
    };
    const base = (l: LineItem) => l.width ?? LINE_KINDS[l.kind].width;
    for (let i = 0; i < n; i++) {
      for (const side of [1, -1] as const) {
        // (on the bank, or clear of the point's own handle on a narrow creek)
        const pos = () => {
          const l = it();
          if (!l || l.points.length !== n) return null;
          const p = l.points[i], nm = across(l.points, i), y = this.h(p.x, p.y);
          const half = Math.max((base(l) * widthFactors(l)[i]) / 2, 16 * this.upp(new THREE.Vector3(p.x, y, p.y)));
          const q = { x: p.x + nm.x * half * side, y: p.y + nm.y * half * side };
          return new THREE.Vector3(q.x, this.h(q.x, q.y) + 0.3, q.y);
        };
        add("linewidth", pos, e => {
          const l0 = it();
          if (!l0 || l0.points.length !== n) return null;
          const now = performance.now(), last = this.lastCorner;
          this.lastCorner = { id: `${id}:lw`, index: i, time: now };
          if (e.altKey || (last && last.id === `${id}:lw` && last.index === i && now - last.time < 400)) {
            this.lastCorner = null;
            const f = widthFactors(l0).map((v, k) => (k === i ? 1 : v));
            this.cb.onChange(id, { widths: widthVaries({ kind: "stream", points: l0.points, widths: f }) ? f : undefined });
            this.cb.onCommit();
            return null;
          }
          const p = l0.points[i], nm = across(l0.points, i), w0 = base(l0);
          const y = this.h(p.x, p.y);
          // (by how far it is pulled out or in from where it was taken)
          const out = (x: number, z: number) => ((x - p.x) * nm.x + (z - p.y) * nm.y) * side;
          const g0 = this.planeAt(e.clientX, e.clientY, y);
          if (!g0) return null;
          const from = out(g0.x, g0.z), half0 = (w0 * widthFactors(l0)[i]) / 2;
          return {
            move: ev => {
              const hit = this.planeAt(ev.clientX, ev.clientY, y);
              if (!hit || w0 <= 0) return;
              const half = Math.max(0.5, half0 + out(hit.x, hit.z) - from);
              const f = widthFactors(it() ?? l0).slice();
              f[i] = Math.round((2 * half / w0) * 100) / 100;
              this.cb.onChange(id, { widths: widthVaries({ kind: "stream", points: l0.points, widths: f }) ? f : undefined });
            },
            end: () => this.cb.onCommit()
          };
        }, {
          index: i * 2 + (side === 1 ? 0 : 1),
          title: "Drag: wider or narrower here · double-click: back to the creek's width",
          data: { point: String(i), side: String(side) }
        });
      }
    }
  }

  /** The ends of a line's OB stretches: each dragged along the line (a stretch dragged to nothing
   * goes). */
  private obStretchHandles(id: string, add: (kind: string, world: () => THREE.Vector3 | null, start: Handle["start"], opts?: any) => void) {
    const it = () => this.item(id) as LineItem | AreaItem | null;
    const first = it();
    if (!first?.obStretches) return;
    const at = (l: LineItem | AreaItem, t: number) => {
      const pts = this.obPath(l);
      return pointAlong(pts, t * pathLength(pts)).point;
    };
    first.obStretches.forEach((_, k) => {
      for (const end of [0, 1] as const) {
        add("obend", () => {
          const l = it(), st = l?.obStretches?.[k];
          if (!l || !st) return null;
          const p = at(l, st[end]);
          return new THREE.Vector3(p.x, this.h(p.x, p.y) + 0.3, p.y);
        }, () => {
          const l0 = it();
          if (!l0?.obStretches?.[k]) return null;
          return {
            move: ev => {
              const l = it(), g = this.groundAt(ev.clientX, ev.clientY);
              if (!l?.obStretches?.[k] || !g) return;
              const t = nearestAlong(this.obPath(l), { x: g.x, y: g.z }).t;
              this.cb.onChange(id, { obStretches: l.obStretches.map((st, j) => (j === k ? (end ? [st[0], t] : [t, st[1]]) : st)) });
            },
            end: () => {
              const l = it();
              if (l?.obStretches) {
                const kept = mergeStretches(l.obStretches);
                this.cb.onChange(id, kept.length ? { obStretches: kept } : { obStretches: undefined, ob: undefined });
              }
              this.cb.onCommit();
            }
          };
        }, { index: k * 2 + end, title: "Drag along it", data: { stretch: String(k), end: String(end) } });
      }
    });
  }

  /** Mark a stretch of OB along a line (a road, a path...), or (`cut`) a stretch to take out of it:
   * click where it starts, then where it ends. */
  setObPick(id: string | null, cut = false) {
    if ((this.obPick?.id ?? null) === id && (this.obPick?.cut ?? false) === cut) return;
    this.obPick = id ? { id, from: null, cut } : null;
    this.syncHandles();
    this.updateCursor();
    this.invalidate();
  }

  /** Mark a stretch of OB along a line starting at a spot on it (from its right-click menu): then
   * a click where it ends. */
  startObPick(id: string, from: P, cut = false) {
    const l = this.item(id) as LineItem | AreaItem | null;
    if (l?.type !== "line" && l?.type !== "area") return;
    this.obPick = { id, from: nearestAlong(this.obPath(l), from).t, cut: cut && l.type === "line" };
    this.obTravel = { sum: 0, last: this.obPick.from ?? 0 };
    this.syncHandles();
    this.updateCursor();
    this.invalidate();
  }

  /** A click while marking a stretch of OB: on the line, its start, then its end (then done). */
  private obPickClick(p: P) {
    const pick = this.obPick, l = pick ? (this.item(pick.id) as LineItem | AreaItem | null) : null;
    if (!pick || (l?.type !== "line" && l?.type !== "area")) return this.endObPick();
    const pts = this.obPath(l), near = nearestAlong(pts, p);
    // (near the line or the edge: within its width, a few steps, or a few pixels of it)
    const reach = Math.max((l.type === "line" ? (l.width ?? LINE_KINDS[l.kind].width) / 2 : 0) + 12, 20 * this.upp(new THREE.Vector3(p.x, this.h(p.x, p.y), p.y)));
    if (near.distance > reach) return;
    if (pick.from === null) {
      this.obPick = { ...pick, from: near.t };
      this.obTravel = { sum: 0, last: near.t };
      this.syncHandles();
      this.invalidate();
      return;
    }
    if (Math.abs(near.t - pick.from) * pathLength(pts) < 2) return;
    // Round a ring: the way the pointer went round from the start (a finger: the shorter way)
    const ring = isRing(pts);
    const added: [number, number][] = ring ? ringStretch(pick.from, near.t, Math.abs(this.obTravel.sum) > 0.01 ? Math.sign(this.obTravel.sum) : 0) : [[pick.from, near.t]];
    if (pick.cut && l.type === "line") {
      this.endObPick();
      this.cb.onCutLine(l.id, pick.from, near.t);
      return;
    }
    // (only along its stretches from now: marked OB all along, it was OB everywhere)
    const had = l.ob === true ? l.obStretches ?? [] : [];
    this.cb.onChange(l.id, { ob: true, obStretches: mergeStretches([...had, ...added]) });
    this.cb.onCommit();
    this.endObPick();
  }

  /** What OB stretches run along: a line as drawn, or an area's edge all the way round. */
  private obPath(i: LineItem | AreaItem) {
    return i.type === "line" ? this.shapeOf(i).pts : areaRing({ ...i, straight: true, points: this.shapeOf(i).pts });
  }

  /** The stretch so far while marking one round a ring (from its start to the pointer, the way it went). */
  private obPickHover(p: P) {
    const pick = this.obPick, l = pick ? (this.item(pick.id) as LineItem | AreaItem | null) : null;
    if (this.obPreview) { this.fx.remove(this.obPreview); disposeObjectDeep(this.obPreview); this.obPreview = null; }
    if (!pick || pick.from === null || (l?.type !== "line" && l?.type !== "area")) return;
    const pts = this.obPath(l);
    const t = nearestAlong(pts, p).t;
    let d = t - this.obTravel.last;
    const ring = isRing(pts);
    if (ring) d = ((d + 1.5) % 1) - 0.5;
    this.obTravel = { sum: this.obTravel.sum + d, last: t };
    const parts = ring ? ringStretch(pick.from, t, Math.abs(this.obTravel.sum) > 0.01 ? Math.sign(this.obTravel.sum) : 0) : [[Math.min(pick.from, t), Math.max(pick.from, t)] as [number, number]];
    const g = new THREE.Group();
    for (const [a, b] of parts) {
      const piece = subPath(pts, a, b);
      if (piece.length >= 2) g.add(this.fatLine(this.drapeLine(piece, LIFT + 0.4), pick.cut ? "#f8fafc" : "#ef4444", 4, { dashed: 6, depthTest: false, order: 29, opacity: 0.9 }));
    }
    this.obPreview = g;
    this.fx.add(g);
    this.invalidate();
  }

  private endObPick() {
    if (this.obPreview) { this.fx.remove(this.obPreview); disposeObjectDeep(this.obPreview); this.obPreview = null; }
    if (!this.obPick) return;
    this.obPick = null;
    this.syncHandles();
    this.updateCursor();
    this.cb.onObPickEnd();
    this.invalidate();
  }

  /** A drawn shape's round handle (an area, a line, anything built): turn it about its middle
   * (Shift: 15° steps). */
  private turnHandle(id: string, add: (kind: string, world: () => THREE.Vector3 | null, start: Handle["start"], opts?: any) => void) {
    const it = () => this.item(id) as AreaItem | LineItem | StructureItem | null;
    add("rotate", () => {
      const st = it();
      if (!st || st.points.length < 2) return null;
      const box = orientedBox(st.points);
      const reach = box.b + Math.max(6, 34 * this.upp(new THREE.Vector3(box.c.x, this.h(box.c.x, box.c.y), box.c.y)));
      const p = { x: box.c.x - box.v.x * reach, y: box.c.y - box.v.y * reach };
      return new THREE.Vector3(p.x, this.h(p.x, p.y) + 0.3, p.y);
    }, e => {
      const st0 = it();
      if (!st0 || st0.locked) return null;
      const c = orientedBox(st0.points).c;
      const y = this.h(c.x, c.y);
      const g0 = this.planeAt(e.clientX, e.clientY, y);
      if (!g0) return null;
      const a0 = Math.atan2(g0.z - c.y, g0.x - c.x);
      const start = st0.points.map(p => ({ ...p })), at0 = { x: st0.x, y: st0.y };
      return {
        move: ev => {
          const hit = this.planeAt(ev.clientX, ev.clientY, y);
          if (!hit) return;
          let d = Math.atan2(hit.z - c.y, hit.x - c.x) - a0;
          if (ev.shiftKey) d = Math.round(d / (15 * DEG)) * 15 * DEG;
          this.cb.onChange(id, turnShape(start, at0, d, c));
        },
        end: () => this.cb.onCommit()
      };
    }, { title: "Drag to turn · Shift: 15° steps" });
  }

  /** A building's, shelter's or deck's height handle (as in the Security Camera Planner), in the tilted view. */
  private outlineHandles(id: string, add: (kind: string, world: () => THREE.Vector3 | null, start: Handle["start"], opts?: any) => void) {
    const it = () => this.item(id) as StructureItem | null;
    add("height", () => {
      const st = it();
      if (!st || st.points.length < 3) return null;
      const c = orientedBox(st.points).c;
      return new THREE.Vector3(c.x, Math.max(...st.points.map(p => this.h(p.x, p.y))) + structureHeight(st), c.y);
    }, e => {
      const st0 = it();
      if (!st0 || st0.locked) return null;
      const c = orientedBox(st0.points).c;
      const base = Math.max(...st0.points.map(p => this.h(p.x, p.y)));
      // Up and down a wall through the middle, facing the camera
      const at = new THREE.Vector3(c.x, base, c.y);
      const facing = new THREE.Vector3().subVectors(this.camera.position, at).setY(0);
      if (facing.lengthSq() < 1e-6) return null;
      const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(facing.normalize(), at);
      void e;
      const max = st0.kind === "building" ? 40 : st0.kind === "shelter" ? 20 : 10;
      return {
        move: ev => {
          const hit = new THREE.Vector3();
          if (!this.ray(ev.clientX, ev.clientY).intersectPlane(plane, hit)) return;
          this.cb.onChange(id, { height: Math.round(clamp(hit.y - base, st0.kind === "deck" ? 0.5 : 6, max) * 2) / 2 });
        },
        end: () => this.cb.onCommit()
      };
    }, { title: "Drag up or down for the height", visible: () => this.controls.polarAngle > 15 * DEG });
  }

  private planeDrag(e: PointerEvent, id: string, patch: (p: P, item: CourseItem, ev: PointerEvent) => Record<string, unknown> | null): Drag | null {
    const item = this.item(id);
    if (!item) return null;
    const planeY = this.h(item.x, item.y);
    void e;
    return {
      move: ev => {
        const cur = this.item(id);
        const hit = this.planeAt(ev.clientX, ev.clientY, planeY);
        if (!cur || !hit) return;
        const next = patch({ x: hit.x, y: hit.z }, cur, ev);
        if (next) this.cb.onChange(id, next);
      },
      end: () => this.cb.onCommit()
    };
  }

  // ------------------------------------------------------------------ per-frame layout of DOM bits

  private layoutOverlays() {
    const list = [...this.overlays.values()].sort((a, b) => a.rank - b.rank);
    const taken: { x0: number; y0: number; x1: number; y1: number }[] = [];
    const hits = (r: { x0: number; y0: number; x1: number; y1: number }) => taken.some(t => r.x0 < t.x1 && r.x1 > t.x0 && r.y0 < t.y1 && r.y1 > t.y0);
    const doc = this.doc;
    const tilted = this.controls.polarAngle > 15 * DEG;
    // (the hole picked: the stumps on its fairway show however far out)
    const pickedHole = this.hole(this.selectedId), pickedStats = pickedHole && doc?.stats.find(x => x.holeId === pickedHole.id);
    const picked = pickedHole && pickedStats?.complete ? { line: pickedStats.line, half: pickedHole.fairwayWidth / 2 + 25 } : null;
    const focusHole = this.holeFor(this.selectedId) ?? this.holeFor(this.hoverId) ?? this.doc?.activeHoleId ?? null;
    for (const o of list) {
      const s = this.project(o.anchor);
      if (!s || s.x < -60 || s.y < -60 || s.x > this.size.width + 60 || s.y > this.size.height + 60 || (o.key?.startsWith("stump:") && !this.stumpShown(o, picked))) {
        o.el.style.display = "none";
        continue;
      }
      // In 3D, a basket close enough to see is itself (at its real size), not its badge
      if (tilted && o.key?.startsWith("basket:")) {
        const foot = o.anchor.clone().setY(o.anchor.y - 2), top = this.project(foot.clone().setY(foot.y + BASKET_FT)), low = this.project(foot);
        if (top && low && Math.hypot(top.x - low.x, top.y - low.y) >= BASKET_SEEN_PX) { o.el.style.display = "none"; continue; }
      }
      // In 3D, a hole's distance chip only for the hole picked or pointed at (they crowd the view)
      if (tilted && o.key?.startsWith("dist:") && o.key !== `dist:${focusHole}`) { o.el.style.display = "none"; continue; }
      // Distance chips only when their hole is long enough on screen
      if (o.minPx && doc) {
        const key = [...this.overlays.entries()].find(([, v]) => v === o)?.[0] ?? "";
        const st = doc.stats.find(x => key === `dist:${x.holeId}`);
        if (st) {
          const a = this.project(new THREE.Vector3(st.line[0].x, this.h(st.line[0].x, st.line[0].y), st.line[0].y));
          const end = st.line[st.line.length - 1];
          const b = this.project(new THREE.Vector3(end.x, this.h(end.x, end.y), end.y));
          if (!a || !b || Math.hypot(a.x - b.x, a.y - b.y) < o.minPx) { o.el.style.display = "none"; continue; }
        }
      }
      o.el.style.display = "";
      if (!o.w || !o.h) { o.w = o.el.offsetWidth; o.h = o.el.offsetHeight; }
      const w = o.w, h = o.h;
      const x = s.x - w / 2, y = s.y - h / 2 + o.dy;
      const box = (dy: number) => ({ x0: x, y0: y + dy, x1: x + w, y1: y + dy + h });
      let dy = 0;
      if (o.rank >= 3) {
        const covered = hits(box(0));
        o.el.style.visibility = covered ? "hidden" : "";
        if (covered) continue;
      } else {
        o.el.style.visibility = "";
        const step = h + 2;
        dy = [0, step, -step, 2 * step, -2 * step].find(d => !hits(box(d))) ?? 0;
      }
      taken.push(box(dy));
      o.el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y + dy)}px)`;
    }
  }

  private layout() {
    const place = (el: HTMLElement, world: THREE.Vector3 | null, dy = 0) => {
      const s = world ? this.project(world) : null;
      if (!s || s.x < -60 || s.y < -60 || s.x > this.size.width + 60 || s.y > this.size.height + 60) {
        el.style.display = "none";
        return;
      }
      el.style.display = "";
      el.style.translate = `${Math.round(s.x - el.offsetWidth / 2)}px ${Math.round(s.y - el.offsetHeight / 2 + dy)}px`;
    };
    this.layoutOverlays();
    for (const m of this.measureLabels) place(m.el, m.at, m.el.classList.contains("dg-mpt") ? 0 : -14);
    this.placeMe(place);
    if (this.draftLabel && this.draftAt) place(this.draftLabel, this.draftAt, -22);
    for (const h of this.handles) {
      let w: THREE.Vector3 | null = null;
      try { w = h.visible && !h.visible() ? null : h.world(); } catch { w = null; }
      if (!w) {
        h.el.style.display = "none";
        continue;
      }
      place(h.el, w);
    }
  }

  // ------------------------------------------------------------------ picking

  /**
   * What is under a client point: small things by screen distance first (badges are DOM and pick
   * themselves), then drawn lines and throw lines (within a few pixels), then areas (smallest first).
   */
  private pick(clientX: number, clientY: number): string | null {
    const doc = this.doc;
    if (!doc) return null;
    const r = this.container.getBoundingClientRect();
    const sx = clientX - r.left;
    const sy = clientY - r.top;
    let best: { id: string; score: number } | null = null;
    // A fingertip is less exact than a mouse pointer: reach a little further
    const reach = this.fingers ? 1.6 : 1;
    for (const item of doc.course.items) {
      if (item.type === "area" || item.type === "line" || item.type === "label" || item.type === "structure") continue;
      const a = new THREE.Vector3(item.x, this.h(item.x, item.y) + 1, item.y);
      const s = this.project(a);
      if (!s) continue;
      const upp = this.upp(a);
      const real = item.type === "tree" ? item.radius * (item.width ?? 1) : item.type === "tee" ? item.padLength / 2 : item.type === "amenity" ? 4 : 2;
      const radius = Math.max((item.type === "tree" ? 8 : 13) * reach, real / upp);
      const d = Math.hypot(s.x - sx, s.y - sy);
      if (d <= radius) {
        const score = d / radius + (item.type === "tree" ? 0.5 : 0);
        if (!best || score < best.score) best = { id: item.id, score };
      }
    }
    if (best) return best.id;
    const g = this.groundAt(clientX, clientY);
    if (!g) return null;
    const p = { x: g.x, y: g.z };
    const upp = this.upp(g);
    const tol = 7 * reach * upp;
    // Built things (they stand over what is drawn on the ground): on a bridge or wall, or inside a
    // building's outline
    let near: { id: string; d: number } | null = null;
    const built = doc.course.items.filter(i => i.type === "structure") as StructureItem[];
    for (const st of built) {
      // (Lines first: stairs up to a deck, a bridge by a shelter; then the smallest outline)
      const d = isLineKind(st.kind) ? distanceToPath(p, structurePath(st)) - structureWidth(st) / 2 : st.points.length >= 3 && pointInPolygon(p, st.points) ? tol + polygonArea(st.points) * 1e-9 : Infinity;
      if (d < tol * 1.01 + 1 && (!near || d < near.d)) near = { id: st.id, d };
    }
    if (near) return near.id;
    // Drawn lines, then throw lines
    for (const l of doc.course.items.filter(i => i.type === "line") as LineItem[]) {
      const drawn = this.shapeOf(l), half = (l.width ?? LINE_KINDS[l.kind].width) / 2;
      if (pointBoundsGap(p, drawn.box) - half >= tol) continue;
      const d = distanceToPath(p, drawn.pts) - half;
      if (d < tol && (!near || d < near.d)) near = { id: l.id, d };
    }
    if (near) return near.id;
    // An automatic walk to the next tee: its hole (whose panel can take it away)
    if (doc.course.style.nextTee) {
      for (const w of this.keep("walks", doc, "", () => autoWalks(doc.course.items, doc.stats, doc.course.holes))) {
        const d = distanceToPath(p, [w.from, w.to]);
        if (d < tol && (!near || d < near.d)) near = { id: w.a.holeId, d };
      }
      if (near) return near.id;
    }
    for (const s of doc.stats) {
      if (!s.complete) continue;
      const d = distanceToPath(p, this.keep(`line:${s.holeId}`, null, JSON.stringify(s.line), () => smoothPath(s.line, 8)));
      if (d < tol && (!near || d < near.d)) near = { id: s.holeId, d };
    }
    if (near) return near.id;
    const areas = (doc.course.items.filter(i => i.type === "area") as AreaItem[]).map(a => ({ id: a.id, ...this.shapeOf(a) })).filter(a => inBounds(p, a.box) && pointInPolygon(p, a.pts));
    if (areas.length) return areas.sort((a, b) => polygonArea(a.pts) - polygonArea(b.pts))[0].id;
    // Inside a fairway: its hole
    for (const s of doc.stats) {
      const hole = this.hole(s.holeId);
      if (!hole?.fairway || !s.complete) continue;
      if (pointInPolygon(p, this.outline(hole, s.line, "line", 8, 0, 8))) return hole.id;
    }
    return null;
  }

  // ------------------------------------------------------------------ pointer input

  private endDragListeners: (() => void) | null = null;
  /** When two fingers were last on the map (a pinch): a tap then is no tap. */
  private pinchAt = 0;

  /** Press that becomes a click (no movement) or a drag. */
  private gesture(e: PointerEvent, h: { click?: (ev: PointerEvent) => void; drag?: (start: PointerEvent) => Drag | null }) {
    const sx = e.clientX;
    const sy = e.clientY;
    const id = e.pointerId;
    const slop = e.pointerType === "touch" ? TOUCH_SLOP : CLICK_PX;
    const began = performance.now();
    let drag: Drag | null = null;
    let moved = false;
    let lastEv: PointerEvent = e;
    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== id) return;
      lastEv = ev;
      if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) > slop) {
        moved = true;
        drag = h.drag?.(e) ?? null;
        if (drag) this.setDragging(true);
      }
      if (drag) {
        drag.move(ev);
        this.invalidate();
      }
    };
    const up = (ev: PointerEvent) => {
      if (ev.pointerId !== id) return;
      cleanup();
      // (a finger that was part of a pinch, or lifted just after one, taps nothing)
      const pinched = ev.pointerType === "touch" && (this.touchIds.size > 0 || this.pinchAt >= began - 50 || performance.now() - this.pinchAt < 350);
      if (drag) {
        drag.end(ev);
        this.setDragging(false);
      } else if (!moved && !pinched) h.click?.(ev);
      this.invalidate();
    };
    const cleanup = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      this.endDragListeners = null;
    };
    this.endDragListeners?.();
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    // (ended from outside, by a second finger say: a drag under way is ended, so its change lands)
    this.endDragListeners = () => {
      cleanup();
      if (drag) { drag.end(lastEv); this.setDragging(false); drag = null; }
    };
  }

  private setDragging(on: boolean) {
    if (this.dragging === on) return;
    this.dragging = on;
    if (!on) {
      this.handleKey = "";
      this.syncHandles();
      if (this.afterDrag && this.doc) { this.afterDrag = false; this.syncShapes(); this.invalidate(); }
    }
    this.updateCursor();
  }

  /** Map-style pan: the ground point under the cursor stays under the cursor. */
  private panDrag(e: PointerEvent): Drag | null {
    const g0 = this.groundAt(e.clientX, e.clientY);
    if (!g0) return null;
    this.container.style.cursor = "grabbing";
    return {
      move: ev => {
        const g1 = this.planeAt(ev.clientX, ev.clientY, g0.y);
        if (!g1) return;
        this.shift(g0.x - g1.x, g0.z - g1.z);
      },
      end: () => this.updateCursor()
    };
  }

  private shift(dx: number, dz: number) {
    const t = this.controls.getTarget(new THREE.Vector3(), false);
    void this.controls.moveTo(t.x + dx, t.y, t.z + dz, false);
    this.controls.update(0);
    this.camera.updateMatrixWorld();
    this.invalidate();
  }

  private itemDrag(e: PointerEvent, id: string): Drag | null {
    const item = this.item(id);
    if (!item) return null;
    const planeY = this.h(item.x, item.y);
    const hit0 = this.planeAt(e.clientX, e.clientY, planeY);
    if (!hit0) return null;
    const start = { x: hit0.x, y: hit0.z };
    const shape = item.type === "area" || item.type === "line" || item.type === "structure" ? item.points.map(p => ({ ...p })) : null;
    const off = { x: item.x - hit0.x, y: item.y - hit0.z };
    return {
      move: ev => {
        const hit = this.planeAt(ev.clientX, ev.clientY, planeY);
        if (!hit) return;
        if (shape) {
          const dx = hit.x - start.x, dy = hit.z - start.y;
          this.cb.onChange(id, { points: shape.map(p => ({ x: p.x + dx, y: p.y + dy })), x: item.x + dx, y: item.y + dy });
        } else {
          this.cb.onChange(id, { x: hit.x + off.x, y: hit.z + off.y });
        }
      },
      end: () => this.cb.onCommit()
    };
  }

  // ------------------------------------------------------------------ touch: two fingers, long-press

  /** Fingers on the map now. */
  private touchIds = new Set<number>();
  private longPress: { id: number; t0: number; fire: () => void; stop: () => void } | null = null;
  /** Whether the last press was a finger (taps get a bigger reach for picking things). */
  private fingers = false;

  /** Where each finger is now (screen px). */
  private fingerAt = new Map<number, { x: number; y: number }>();
  /** Two fingers on the map, as on Google Earth: a pinch zooms around the point between them, a
   * twist turns the map around it (it stays under the fingers), a slide up or down tilts. */
  private pinch: { d: number; a: number; cy: number } | null = null;
  /** Two fingers that came down on the thing picked: they size and turn it, not the map. */
  private pinchItem: { id: string; base: CourseItem; d0: number; a0: number; aim: number } | null = null;
  private readonly twoFingers = (e: PointerEvent) => {
    const f = this.fingerAt.get(e.pointerId);
    if (!f) return;
    f.x = e.clientX; f.y = e.clientY;
    if (this.touchIds.size !== 2 || !this.pinch) return;
    const [p, q] = [...this.touchIds].map(id => this.fingerAt.get(id)!);
    if (!p || !q) return;
    const d = Math.max(1, Math.hypot(q.x - p.x, q.y - p.y)), a = Math.atan2(q.y - p.y, q.x - p.x), cx = (p.x + q.x) / 2, cy = (p.y + q.y) / 2;
    const was = this.pinch;
    this.pinch = { d, a, cy };
    if (this.pinchItem) {
      const patch = this.pinchedPatch(this.pinchItem, d / this.pinchItem.d0, ((a - this.pinchItem.a0) * 180) / Math.PI);
      if (patch) this.cb.onChange(this.pinchItem.id, patch);
      return;
    }
    // (the map turns with the fingers and stays under them: around the ground between them)
    let da = a - was.a;
    if (da > Math.PI) da -= 2 * Math.PI; else if (da < -Math.PI) da += 2 * Math.PI;
    if (Math.abs(da) > 1e-4) {
      const under = this.groundAt(cx, cy);
      if (under) {
        // (camera and target turned together about the vertical through that ground point)
        const pos = this.controls.getPosition(new THREE.Vector3(), true), tgt = this.controls.getTarget(new THREE.Vector3(), true);
        const up = new THREE.Vector3(0, 1, 0);
        const np = pos.sub(under).applyAxisAngle(up, da).add(under), nt = tgt.sub(under).applyAxisAngle(up, da).add(under);
        void this.controls.setLookAt(np.x, np.y, np.z, nt.x, nt.y, nt.z, false);
      } else void this.controls.rotate(da, 0, false);
    }
    if (Math.abs(was.cy - cy) > 0.5) void this.controls.rotate(0, (was.cy - cy) * (MAX_TILT / Math.max(300, this.size.height * 0.6)), false);
    if (Math.abs(d / was.d - 1) > 1e-3) this.zoomAt(cx, cy, was.d / d, false);
    this.invalidate();
  };
  private startPinch() {
    const [p, q] = [...this.touchIds].map(id => this.fingerAt.get(id)!);
    if (!p || !q) return;
    this.pinch = { d: Math.max(1, Math.hypot(q.x - p.x, q.y - p.y)), a: Math.atan2(q.y - p.y, q.x - p.x), cy: (p.y + q.y) / 2 };
    // (both fingers on or right by the thing picked: it's the thing they size and turn)
    this.pinchItem = null;
    const it = this.selectedId && !this.readOnly ? this.item(this.selectedId) : null;
    if (it && !it.locked && it.type !== "basket") {
      const box = this.screenBox(it.id);
      const near = (f: { x: number; y: number }) => {
        const r = this.container.getBoundingClientRect();
        const x = f.x - r.left, y = f.y - r.top, m = 48;
        return !!box && x >= box.x - m && x <= box.x + box.width + m && y >= box.y - m && y <= box.y + box.height + m;
      };
      if (near(p) && near(q)) this.pinchItem = { id: it.id, base: structuredClone(it), d0: this.pinch.d, a0: this.pinch.a, aim: it.type === "tee" ? teeAim(this.doc!.course, it) : 0 };
    }
  }
  /** What two fingers on a thing make of it: bigger or smaller by `k`, turned by `turn` degrees. */
  private pinchedPatch(pi: NonNullable<CourseView["pinchItem"]>, k: number, turn: number): Record<string, unknown> | null {
    const b = pi.base;
    const clampTo = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
    const round1 = (v: number) => Math.round(v * 10) / 10;
    const spin = (p: P, c: P) => {
      const r = (turn * Math.PI) / 180, dx = (p.x - c.x) * k, dy = (p.y - c.y) * k;
      return { x: c.x + dx * Math.cos(r) - dy * Math.sin(r), y: c.y + dx * Math.sin(r) + dy * Math.cos(r) };
    };
    switch (b.type) {
      case "tree": {
        const h = b.height ?? b.radius * 2.6;
        return { radius: round1(clampTo(b.radius * k, 1, 45)), height: Math.round(clampTo(h * k, 2, 120)) };
      }
      case "tee": return { padLength: round1(clampTo(b.padLength * k, 4, 30)), padWidth: round1(clampTo(b.padWidth * k, 2, 20)), rotation: Math.round(pi.aim + turn), aimFixed: true };
      case "mando": case "amenity": case "dropzone": case "label": return { rotation: Math.round((b.rotation ?? 0) + turn) };
      case "area": case "line": case "structure": {
        const c = centroid(b.points);
        return { points: b.points.map(p => spin(p, c)) };
      }
      default: return null;
    }
  }
  private endPinch() {
    if (this.touchIds.size === 0) window.removeEventListener("pointermove", this.twoFingers);
    if (this.pinchItem) { this.pinchItem = null; this.cb.onCommit(); }
    if (!this.pinch) return;
    this.pinch = null;
    this.snapNorth();
  }

  private touchUp(e: PointerEvent) {
    this.fingerAt.delete(e.pointerId);
    if (this.touchIds.delete(e.pointerId) && this.touchIds.size >= 1) this.pinchAt = performance.now();
    if (this.touchIds.size < 2) this.endPinch();
    else if (this.touchIds.size === 2 && !this.pinch) this.startPinch();
    if (this.touchIds.size === 0) window.removeEventListener("pointermove", this.twoFingers);
    const lp = this.longPress;
    if (lp?.id !== e.pointerId) return;
    // (Held long enough, even if a busy page ran the timer late: still the long-press)
    if (e.type === "pointerup" && e.timeStamp - lp.t0 >= LONG_PRESS_MS) lp.fire();
    else this.cancelLongPress();
  }

  private cancelLongPress() {
    this.longPress?.stop();
    this.longPress = null;
  }

  /** A second finger on the map: the camera pinches, turns and tilts; nothing is placed or picked. */
  private secondFinger() {
    this.cancelLongPress();
    this.marquee?.remove();
    this.marquee = null;
    if (this.shaping) {
      this.shaping = false;
      this.draftPending = false;
      this.cancelDrawing();
    }
    this.endDragListeners?.();
    this.setDragging(false);
  }

  /** A finger on a handle: it moves once the finger does (a handle's hit area is big for a finger,
   * so a tap on a hole's line often lands on one); a tap selects what the handle belongs to. */
  private fingerOnHandle(e: PointerEvent, h: Handle) {
    const x0 = e.clientX, y0 = e.clientY, id = e.pointerId, began = performance.now();
    let drag: Drag | null = null, moved = false;
    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== id) return;
      if (!moved) {
        if (Math.hypot(ev.clientX - x0, ev.clientY - y0) <= TOUCH_SLOP) return;
        moved = true;
        drag = h.start(e);
        if (!drag) { cleanup(); this.invalidate(); return; }
        this.setDragging(true);
      }
      drag?.move(ev);
      this.invalidate();
    };
    const up = (ev: PointerEvent) => {
      if (ev.pointerId !== id) return;
      cleanup();
      const pinched = this.touchIds.size > 0 || this.pinchAt >= began - 50 || performance.now() - this.pinchAt < 350;
      if (drag) {
        drag.end(ev);
        this.setDragging(false);
      } else if (!moved && !pinched && ev.type === "pointerup") {
        const owner = this.selectedId ?? this.doc?.activeHoleId ?? null;
        if (owner && owner !== this.selectedId) this.cb.onSelect(owner);
      }
      this.invalidate();
    };
    const cleanup = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      this.endDragListeners = null;
    };
    // (a second finger ends this: see secondFinger)
    this.endDragListeners?.();
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    this.endDragListeners = cleanup;
  }

  /** Holding a finger still on an item opens its menu, like a right-click (on open ground: what
   * can start there). */
  private startLongPress(e: PointerEvent, target: HTMLElement) {
    this.cancelLongPress();
    const id = e.pointerId, x = e.clientX, y = e.clientY;
    const move = (ev: PointerEvent) => {
      if (ev.pointerId === id && Math.hypot(ev.clientX - x, ev.clientY - y) > TOUCH_SLOP) this.cancelLongPress();
    };
    const stop = () => {
      window.clearTimeout(timer);
      window.removeEventListener("pointermove", move);
    };
    const fire = () => {
      this.cancelLongPress();
      const domItem = (target.closest?.("[data-item-id]") as HTMLElement | null)?.dataset.itemId ?? null;
      const itemId = domItem ?? this.pick(x, y);
      // (open ground too, to change: what can start there)
      if (!itemId && !this.treeAtScreen(x, y) && (this.readOnly || !this.groundAt(x, y))) return;
      // The press is now the menu's: no tap, no drag, and the map stops following the finger
      this.endDragListeners?.();
      this.setDragging(false);
      this.controls.cancel();
      try { navigator.vibrate?.(12); } catch { /* not allowed */ }
      const g = this.groundAt(x, y);
      this.cb.onContextMenu({ clientX: x, clientY: y, itemId, ground: g ? { x: g.x, y: g.z } : null });
    };
    window.addEventListener("pointermove", move);
    const timer = window.setTimeout(fire, LONG_PRESS_MS);
    this.longPress = { id, t0: e.timeStamp, fire, stop };
  }

  private onPointerDown(e: PointerEvent) {
    const target = e.target as HTMLElement;
    if (!this.doc) return;
    this.fingers = e.pointerType === "touch";
    if (this.fingers) {
      this.touchIds.add(e.pointerId);
      this.fingerAt.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.touchIds.size === 1) window.addEventListener("pointermove", this.twoFingers);
      if (this.touchIds.size > 1) {
        this.pinchAt = performance.now();
        this.secondFinger();
        if (this.touchIds.size === 2) this.startPinch();
        else this.endPinch();
        return;
      }
      // (Not on a handle that moves something: holding one still before dragging it slowly is no
      // menu; a line's middle dot is fine, it is where a finger lands to hold a hole)
      const handle = (target.closest?.("[data-handle]") as HTMLElement | null)?.dataset.handle;
      if (!this.povHole && this.tool.mode === "select" && e.button === 0 && (!handle || handle === "mid")) this.startLongPress(e, target);
    }
    if (this.povHole) {
      if (e.button !== 0 || target.closest?.("button,input,select,[data-pov-ui]")) return;
      e.preventDefault();
      e.stopPropagation();
      this.povDrag(e);
      return;
    }
    if (e.button === 2) {
      const x0 = e.clientX, y0 = e.clientY, id = e.pointerId;
      const up = (ev: PointerEvent) => {
        if (ev.pointerId !== id) return;
        window.removeEventListener("pointerup", up, true);
        if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < 5 && !this.readOnly) {
          const domItem = (target.closest?.("[data-item-id]") as HTMLElement | null)?.dataset.itemId ?? null;
          const g = this.groundAt(ev.clientX, ev.clientY);
          this.cb.onContextMenu({ clientX: ev.clientX, clientY: ev.clientY, itemId: domItem ?? this.pick(ev.clientX, ev.clientY), ground: g ? { x: g.x, y: g.z } : null });
        }
      };
      window.addEventListener("pointerup", up, true);
      return;
    }
    // A stump: the tree back (or a kept tree's ring: cut down after all). Not while an area or
    // line is being drawn: a loop round the stumps starts on one as often as not
    const stumpEl = target.closest?.("[data-stump]") as HTMLElement | null;
    if (stumpEl && e.button === 0 && !this.drawn(this.tool)) {
      e.stopPropagation();
      e.preventDefault();
      this.gesture(e, { click: () => this.toggleLidarTree(Number(stumpEl.dataset.stump)) });
      return;
    }
    const handleEl = target.closest?.("[data-handle]") as HTMLElement | null;
    if (handleEl && e.button === 0) {
      const h = this.handles.find(x => x.el === handleEl);
      if (!h) return;
      if (e.pointerType === "touch" && h.kind !== "draw") {
        // (the handles of the hole in hand while it isn't picked: a tap picks it, a drag moves
        // the map, not the hole; nothing moves by accident while panning or pinching)
        const owner = this.selectedId ?? this.doc?.activeHoleId ?? null;
        if (owner !== this.selectedId) {
          this.gesture(e, { click: () => { if (owner) this.cb.onSelect(owner); } });
          return;
        }
        e.stopPropagation();
        e.preventDefault();
        this.fingerOnHandle(e, h);
        return;
      }
      e.stopPropagation();
      e.preventDefault();
      const drag = h.start(e);
      if (!drag) { this.invalidate(); return; }
      const id = e.pointerId;
      this.setDragging(true);
      const move = (ev: PointerEvent) => { if (ev.pointerId === id) { drag.move(ev); this.invalidate(); } };
      const up = (ev: PointerEvent) => {
        if (ev.pointerId !== id) return;
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        window.removeEventListener("pointercancel", up);
        drag.end(ev);
        this.setDragging(false);
        this.invalidate();
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      window.addEventListener("pointercancel", up);
      return;
    }
    const touch = e.pointerType === "touch";
    if (this.spaceDown && e.button === 0) {
      e.stopPropagation();
      this.gesture(e, { drag: s => this.panDrag(s) });
      return;
    }
    // Tilting and turning: the middle button, or Ctrl / Alt (Cmd) + drag, whatever is under the
    // pointer (zoomed in, something always is); Shift + drag too, except where it draws a box
    const held = e.ctrlKey || e.metaKey || e.altKey;
    const shiftTurn = e.shiftKey && this.tool.mode !== "measure" && this.tool.mode !== "select";
    // (the middle button: the camera's own, set to turn and tilt)
    if (e.button !== 0) return;
    const domItem = (target.closest?.("[data-item-id]") as HTMLElement | null)?.dataset.itemId ?? null;
    if (held || (shiftTurn && !domItem && !(this.tool.mode === "select" && this.pick(e.clientX, e.clientY)))) {
      this.controls.mouseButtons.left = ACTION.ROTATE;
      const restore = () => {
        this.controls.mouseButtons.left = ACTION.NONE;
        window.removeEventListener("pointerup", restore);
        this.restoreLeft = null;
      };
      this.restoreLeft?.();
      this.restoreLeft = restore;
      window.addEventListener("pointerup", restore);
      return;
    }
    const stop = () => { if (!touch) e.stopPropagation(); };
    const panOrNothing = (s: PointerEvent) => (touch ? null : this.panDrag(s));
    const tool = this.tool;
    const groundClick = (fn: (p: P, ev: PointerEvent) => void) => (ev: PointerEvent) => {
      const g = this.groundAt(ev.clientX, ev.clientY);
      if (g) fn({ x: g.x, y: g.z }, ev);
    };
    if (tool.mode === "measure") {
      stop();
      this.gesture(e, { click: ev => { const g = this.groundAt(ev.clientX, ev.clientY); if (g) this.addMeasurePoint(g, ev.shiftKey); }, drag: panOrNothing });
      return;
    }
    if (this.obPick) {
      stop();
      this.gesture(e, { click: groundClick(p => this.obPickClick(p)), drag: panOrNothing });
      return;
    }
    if (this.plotHole) {
      // Plotting a hole's line: clicks add turns; a drag draws it freehand
      e.stopPropagation();
      this.gesture(e, { click: groundClick((p, ev) => this.plotClick(p, ev)), drag: s => this.plotDrag(s) });
      return;
    }
    if (tool.mode === "add-hole") {
      stop();
      this.gesture(e, {
        click: groundClick(g => {
          // (a click on a basket already there plays the new hole to it)
          const onBasket = domItem ? this.doc?.course.items.find(i => i.id === domItem && i.type === "basket") : undefined;
          const p = this.holeStart && onBasket ? { x: onBasket.x, y: onBasket.y } : g;
          if (!this.holeStart) {
            this.holeStart = p;
            this.cursor = p;
            this.drawDraft();
            this.cb.onDrawProgress(1);
          } else {
            const start = this.holeStart;
            this.holeStart = null;
            this.clearDraft();
            this.cb.onDrawProgress(0);
            if (dist(start, p) > 10) this.cb.onHole(start, p);
          }
        }),
        drag: panOrNothing
      });
      return;
    }
    if (tool.mode === "sculpt") {
      // The ground tool: a drag paints, a tap is one dab (two fingers still move the map)
      e.stopPropagation();
      this.gesture(e, { drag: s => this.sculptDrag(s), click: groundClick(p => { const d = this.sculptDrag(e, p); d?.end(e); }) });
      return;
    }
    if (this.drawn(tool)) {
      // A rectangle, circle or freehand shape is dragged out (clicking still adds points); with a
      // finger too, so the map stays put (two fingers still move it)
      const shape = this.drawn(tool) === "line" && (tool.shape === "box" || tool.shape === "circle") ? "freehand" : tool.shape;
      const shaped = shape !== "points" && !this.drawPts.length && !this.shapeAnchor;
      if (shaped) e.stopPropagation();
      else stop();
      this.gesture(e, {
        drag: shaped ? s => this.shapeDrag(s, shape) : panOrNothing,
        click: groundClick(p0 => {
          // (painting: a tap paints a round spot)
          if (shape === "paint") {
            const out = strokeOutline([p0], this.tool.brush?.size ?? 20);
            if (out) { this.drawPts = out; if (!this.finishDrawing()) this.cancelDrawing(); }
            return;
          }
          // A rectangle or a circle by clicks: one corner (or the middle), then the other corner
          // (or the edge); dragging one out works too
          if (shape === "box" || shape === "circle") {
            const a = this.shapeAnchor;
            if (!a) {
              this.shapeAnchor = { x: e.clientX, y: e.clientY, shape };
              this.drawPts = [];
              this.cursor = null;
              this.cb.onDrawProgress(1);
              return;
            }
            this.shapeAnchor = null;
            const pts = this.shapePoints(a.shape, a, { x: e.clientX, y: e.clientY });
            if (pts) {
              this.drawPts = pts;
              if (!this.finishDrawing()) this.cancelDrawing();
            }
            return;
          }
          const p = this.snap(p0);
          const last = this.drawPts[this.drawPts.length - 1];
          if (last && dist(last, p) < 1) return;
          this.drawPts.push(p);
          this.cursor = p;
          this.drawDraft();
          this.cb.onDrawProgress(this.drawPts.length);
          this.handleKey = "";
          this.syncHandles();
        })
      });
      return;
    }
    if (tool.mode !== "select") {
      stop();
      this.gesture(e, {
        click: groundClick(p => {
          this.updateGhost(null);
          this.cb.onPlace(tool.mode, p);
        }),
        drag: panOrNothing
      });
      return;
    }
    // Select mode (on a map only looked at, a hole or nothing)
    const hit = this.readOnly ? this.holeFor(domItem ?? this.pick(e.clientX, e.clientY)) : domItem ?? this.pick(e.clientX, e.clientY);
    // A tree under the pointer, over nothing or over an area or line (most trees stand in a wood):
    // a click opens the tree's menu (cut it, make it the course's own, or select the wood)
    const hitItem = hit ? this.item(hit) : null;
    // (over a hole's line or fairway too: a tree stands above it; tees, baskets, signs and the
    // course's own trees still come first)
    const overBig = !hit || (!!hitItem && (hitItem.type === "area" || hitItem.type === "line" || hitItem.type === "structure")) || (!hitItem && !!this.hole(hit));
    if (overBig && !e.shiftKey && !tool.dragSelect && !this.readOnly) {
      const tree = this.treeAtScreen(e.clientX, e.clientY);
      if (tree) {
        const moves = !!hitItem && hit === this.selectedId && !hitItem.locked;
        if (moves) e.stopPropagation(); else stop();
        this.gesture(e, {
          // (picked like any tree: the same panel, moved once picked, deleted with Del)
          click: () => this.cb.onAdoptTree(tree, this.lookOf(tree)),
          drag: moves ? s => this.itemDrag(s, hit!) : panOrNothing
        });
        return;
      }
    }
    // Shift (or the Drag to select option): a drag draws a box to pick things with; Shift+click
    // adds a thing to the ones picked (or takes it out)
    const add = e.shiftKey && !touch && !this.readOnly;
    const boxing = !this.readOnly && (add || !!tool.dragSelect);
    if (!hit) {
      if (boxing) {
        e.stopPropagation();
        this.gesture(e, { click: () => { if (!add) this.cb.onSelect(null); }, drag: s => this.boxDrag(s, add) });
        return;
      }
      stop();
      this.gesture(e, {
        click: () => this.cb.onSelect(null),
        drag: panOrNothing
      });
      return;
    }
    if (add) {
      e.stopPropagation();
      this.gesture(e, { click: () => this.cb.onSelect(hit, true), drag: s => this.boxDrag(s, true) });
      return;
    }
    const item = this.item(hit);
    // (with a finger, while Drag to select is on, a tap puts a thing in with the ones picked or
    // takes it out)
    const tapAdds = touch && !!tool.dragSelect;
    // One of the things picked together: dragging it moves them all (a click picks it alone)
    if (item && this.group.includes(hit)) {
      e.stopPropagation();
      this.gesture(e, { click: () => this.cb.onSelect(hit, tapAdds), drag: s => this.groupDrag(s, hit) });
      return;
    }
    if (tapAdds) {
      e.stopPropagation();
      this.gesture(e, { click: () => this.cb.onSelect(hit, true), drag: s => this.boxDrag(s, false) });
      return;
    }
    // Holes, areas and lines move only once selected (dragging across the map still pans, or
    // draws a box); a hole itself never moves (move its tee or basket); a locked item never moves
    // With a finger, everything moves only once picked: a drag across a thing pans the map
    const big = !item || item.type === "area" || item.type === "line" || item.type === "structure" || item.type === "tree" || touch;
    if ((big && hit !== this.selectedId) || !item || item.locked) {
      if (boxing) e.stopPropagation();
      else stop();
      this.gesture(e, { click: () => this.cb.onSelect(hit), drag: boxing ? s => this.boxDrag(s, false) : panOrNothing });
      return;
    }
    e.stopPropagation();
    if (hit !== this.selectedId) this.cb.onSelect(hit);
    this.gesture(e, { drag: s => this.itemDrag(s, hit) });
  }

  /** Draws a box on the screen; what lies inside it when let go is picked (a shape when all of it
   * is inside, so a big area under everything doesn't come along). */
  private boxDrag(start: PointerEvent, add: boolean): Drag | null {
    const rect = this.container.getBoundingClientRect();
    const x0 = start.clientX - rect.left, y0 = start.clientY - rect.top;
    const box = document.createElement("div");
    box.className = "dg-marquee";
    box.setAttribute("data-testid", "select-box");
    this.marquee?.remove();
    this.marquee = box;
    this.labelsLayer.appendChild(box);
    let x1 = x0, y1 = y0;
    const draw = () => {
      box.style.transform = `translate(${Math.min(x0, x1)}px, ${Math.min(y0, y1)}px)`;
      box.style.width = `${Math.abs(x1 - x0)}px`;
      box.style.height = `${Math.abs(y1 - y0)}px`;
    };
    draw();
    return {
      move: ev => {
        x1 = ev.clientX - rect.left;
        y1 = ev.clientY - rect.top;
        draw();
      },
      end: () => {
        box.remove();
        this.marquee = null;
        const r = { l: Math.min(x0, x1), r: Math.max(x0, x1), t: Math.min(y0, y1), b: Math.max(y0, y1) };
        if (r.r - r.l < 3 && r.b - r.t < 3) return;
        this.cb.onBoxSelect(this.itemsIn(r), add, this.treesIn(r));
      }
    };
  }

  /** The measured trees and the saplings grown since the survey standing inside a rectangle on
   * the screen (their trunks), each with its look: to be made the course's own and picked. */
  private treesIn(r: { l: number; r: number; t: number; b: number }) {
    const lidar = this.doc?.course.lidar, ls = this.lidarState;
    const out: { tree: NonNullable<ReturnType<CourseView["treeAt"]>>; look: ReturnType<CourseView["lookOf"]> }[] = [];
    if (!lidar || !ls) return out;
    const inside = (x: number, y: number) => {
      const s = this.project(new THREE.Vector3(x, this.h(x, y), y));
      return !!s && s.x >= r.l && s.x <= r.r && s.y >= r.t && s.y <= r.b;
    };
    for (const g of this.itemsGroup.children) {
      if (!g.userData.measured) continue;
      const spots = g.userData.spots as TreeSpot[], indexOf = g.userData.indexes as number[] | undefined;
      spots.forEach((s, i) => {
        if (!inside(s.x, s.y)) return;
        const k = indexOf?.[i] ?? -1;
        const look = { variant: s.variant, rotation: Math.round((-s.turn / DEG) * 10) / 10, leaf: `#${s.tint.getHexString()}` };
        out.push({ tree: k >= 0 && k < lidar.trees.length ? { kind: "measured", k } : { kind: "spot", x: s.x, y: s.y, height: s.height, width: s.width, conifer: s.shape === "conifer" }, look });
      });
    }
    return out;
  }

  /** The things inside a rectangle on the screen (container pixels). */
  private itemsIn(r: { l: number; r: number; t: number; b: number }): string[] {
    const doc = this.doc;
    if (!doc) return [];
    const inside = (p: P) => {
      const s = this.project(new THREE.Vector3(p.x, this.h(p.x, p.y), p.y));
      return !!s && s.x >= r.l && s.x <= r.r && s.y >= r.t && s.y <= r.b;
    };
    return doc.course.items
      .filter(i => (i.type === "area" || i.type === "line" || i.type === "structure" ? i.points.length > 0 && i.points.every(inside) : inside(i)))
      .map(i => i.id);
  }

  /** Drags the things picked together (and the bends of holes that go with them). */
  private groupDrag(e: PointerEvent, id: string): Drag | null {
    const item = this.item(id);
    const doc = this.doc;
    if (!item || !doc) return null;
    const planeY = this.h(item.x, item.y);
    const hit0 = this.planeAt(e.clientX, e.clientY, planeY);
    if (!hit0) return null;
    const base = doc.course;
    const ids = [...this.group];
    return {
      move: ev => {
        const hit = this.planeAt(ev.clientX, ev.clientY, planeY);
        if (hit) this.cb.onMoveGroup(base, ids, hit.x - hit0.x, hit.z - hit0.z);
      },
      end: () => this.cb.onCommit()
    };
  }

  // ------------------------------------------------------------------ drawing new holes, areas and lines

  private draftAt: THREE.Vector3 | null = null;

  private shaping = false;
  private draftPending = false;

  /** What a drawing tool draws: an outline ("area": areas, buildings, shelters, decks), a line
   * (lines, bridges, boardwalks, stairs, walls), or nothing. */
  private drawn(tool = this.tool): "area" | "line" | null {
    if (tool.mode === "draw-area") return "area";
    if (tool.mode === "draw-line") return "line";
    if (tool.mode === "draw-structure") return STRUCTURE_KINDS[tool.structureKind ?? "bridge"].shape === "outline" ? "area" : "line";
    return null;
  }

  /** A point being drawn, moved onto a corner of a shape already drawn when it is within a few
   * pixels of one (so OB lines and areas meet without gaps). */
  private snap(p: P): P {
    const doc = this.doc;
    if (!doc) return p;
    const tol = 9 * this.upp(new THREE.Vector3(p.x, this.h(p.x, p.y), p.y));
    let best: P | null = null, bd = tol;
    for (const i of doc.course.items) {
      if (i.type !== "area" && i.type !== "line" && i.type !== "structure") continue;
      for (const q of i.points) {
        const d = dist(p, q);
        if (d < bd) { bd = d; best = q; }
      }
    }
    return best ? { x: best.x, y: best.y } : p;
  }

  /** Drags out a new area or line: a rectangle (square to the screen), a circle from its middle, or freehand. */
  private shapeDrag(start: PointerEvent, shape: "box" | "circle" | "freehand" | "paint"): { move: (ev: PointerEvent) => void; end: (ev: PointerEvent) => void } | null {
    const g0 = this.groundAt(start.clientX, start.clientY);
    if (!g0) return null;
    const a = { x: g0.x, y: g0.z };
    const free: P[] = [a];
    const ground = (x: number, y: number) => {
      const g = this.groundAt(x, y);
      return g ? { x: g.x, y: g.z } : null;
    };
    // Freehand points every few pixels (in feet at this zoom)
    const step = Math.max(1.5, 6 / Math.max(0.01, this.viewInfo().pxPerUnit));
    const build = (ev: PointerEvent) => {
      if (shape === "box" || shape === "circle") {
        const pts = this.shapePoints(shape, { x: start.clientX, y: start.clientY }, { x: ev.clientX, y: ev.clientY });
        if (!pts) return;
        this.drawPts = pts;
      } else if (shape === "paint") {
        // (painted: the brush's track, its outline shown as it goes)
        const b = ground(ev.clientX, ev.clientY);
        const r = this.tool.brush?.size ?? 20;
        if (b && dist(free[free.length - 1], b) >= Math.max(step, r / 5)) free.push(b);
        this.drawPts = strokeOutline(free, r) ?? [];
        this.showBrush(b, r);
      } else {
        const b = ground(ev.clientX, ev.clientY);
        if (b && dist(free[free.length - 1], b) >= step) free.push(b);
        this.drawPts = [...free];
      }
      this.cursor = null;
      // Redrawn once per frame (moves can come faster than the draped shape is rebuilt)
      this.draftPending = true;
      this.invalidate();
    };
    this.shaping = true;
    return {
      move: build,
      end: ev => {
        build(ev);
        this.draftPending = false;
        this.shaping = false;
        if (shape === "freehand") this.drawPts = simplify(this.drawPts, step * 0.5);
        if (!this.finishDrawing()) this.cancelDrawing();
      }
    };
  }

  // ------------------------------------------------------------------ the brush (ground, painting)

  private brushRing: { obj: THREE.Object3D; r: number } | null = null;
  /** The brush's circle on the ground under the pointer (null: hidden). Made once for a size and
   * moved after (made again every move, its line's material went with it, and that's slow). */
  private showBrush(at: P | null, r: number) {
    if (!at) {
      if (this.brushRing?.obj.visible) { this.brushRing.obj.visible = false; this.invalidate(); }
      return;
    }
    if (!this.brushRing || this.brushRing.r !== r) {
      if (this.brushRing) { this.fx.remove(this.brushRing.obj); disposeObjectDeep(this.brushRing.obj); }
      const ring: THREE.Vector3[] = [];
      for (let i = 0; i <= 48; i++) ring.push(new THREE.Vector3(Math.cos((i / 48) * Math.PI * 2) * r, 0, Math.sin((i / 48) * Math.PI * 2) * r));
      const g = new THREE.Group();
      g.add(this.fatLine(ring, "#1c1917", 4, { depthTest: false, order: 29, opacity: 0.45 }));
      g.add(this.fatLine(ring, "#fafaf9", 2, { depthTest: false, order: 30, opacity: 0.95 }));
      this.brushRing = { obj: g, r };
      this.fx.add(g);
    }
    this.brushRing.obj.position.set(at.x, this.h(at.x, at.y) + LIFT + 0.4, at.y);
    this.brushRing.obj.visible = true;
    this.invalidate();
  }

  /** The ground tool's stroke: dabs along the drag and, held still, again and again where it is;
   * the ground sent on live (a few times a second) and once more when let go, as one undo step. */
  private sculptDrag(start: PointerEvent, at0?: P): { move: (ev: PointerEvent) => void; end: (ev: PointerEvent) => void } | null {
    const doc = this.doc;
    if (!doc || this.readOnly) return null;
    const g0 = at0 ? { x: at0.x, z: at0.y } : this.groundAt(start.clientX, start.clientY);
    if (!g0) return null;
    const b = this.tool.brush ?? { size: 25, strength: 5, ground: "raise" as const };
    const heights: Record<string, number> = { ...doc.heights };
    const W = doc.course.canvas.width, H = doc.course.canvas.height;
    // (raise and lower: a quarter foot a dab at strength 1; flatten and smooth: how far a dab goes)
    const amount = b.ground === "raise" || b.ground === "lower" ? b.strength * 0.12 : Math.min(1, b.strength * 0.05);
    const level = heightAt(doc.heights, doc.gridSize, g0.x, g0.z);
    let last: P = { x: g0.x, y: g0.z }, frame = 0;
    const put = (p: P) => dab(heights, doc.gridSize, W, H, p, b.size, b.ground, amount, level);
    // (while painting, only the ground itself reshapes, once a frame at most: the trees, lines,
    // contours and the painted map follow once, when the stroke ends)
    const show = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => { frame = 0; this.ground.previewHeights(heights); this.invalidate(); });
    };
    const send = (done: boolean) => { if (done) this.cb.onTerrain?.({ ...heights }, true); else show(); };
    put(last);
    show();
    this.setDragging(true);
    // (held still: it keeps working where the brush is)
    const hold = window.setInterval(() => { put(last); show(); }, 90);
    return {
      move: ev => {
        const g = this.groundAt(ev.clientX, ev.clientY);
        if (!g) return;
        const p = { x: g.x, y: g.z };
        const d = dist(last, p), step = Math.max(1, b.size / 4);
        for (let k = 1; k <= Math.floor(d / step); k++) put({ x: last.x + ((p.x - last.x) * k * step) / d, y: last.y + ((p.y - last.y) * k * step) / d });
        if (d >= step) last = p;
        this.showBrush(p, b.size);
        send(false);
      },
      end: () => {
        window.clearInterval(hold);
        if (frame) cancelAnimationFrame(frame);
        this.setDragging(false);
        send(true);
      }
    };
  }

  /** A rectangle (square to the screen) between two screen points, or a circle from its middle to
   * its edge, on the ground. */
  private shapePoints(shape: "box" | "circle", from: { x: number; y: number }, to: { x: number; y: number }): P[] | null {
    const ground = (x: number, y: number) => {
      const g = this.groundAt(x, y);
      return g ? { x: g.x, y: g.z } : null;
    };
    if (shape === "box") {
      // (a few pixels each way at least: two clicks in a line make no rectangle)
      if (Math.abs(to.x - from.x) < 4 || Math.abs(to.y - from.y) < 4) return null;
      const c = [[from.x, from.y], [to.x, from.y], [to.x, to.y], [from.x, to.y]].map(([x, y]) => ground(x, y));
      return c.every(Boolean) && dist(c[0]!, c[2]!) > 1 ? (c as P[]) : null;
    }
    const a = ground(from.x, from.y), b = ground(to.x, to.y);
    if (!a || !b || dist(a, b) < 1) return null;
    const r = dist(a, b);
    return Array.from({ length: 36 }, (_, i) => ({ x: a.x + Math.cos((i / 36) * Math.PI * 2) * r, y: a.y + Math.sin((i / 36) * Math.PI * 2) * r }));
  }

  /** Ends drawing an area or line (Enter, double-click, or clicking the first point). */
  finishDrawing() {
    if (this.plotHole) return this.finishPlot();
    const kind = this.drawn();
    const pts = this.drawPts;
    if (kind && pts.length >= (kind === "area" ? 3 : 2)) {
      this.drawPts = [];
      this.clearDraft();
      this.cb.onDrawProgress(0);
      // (a rectangle stays square-cornered)
      this.cb.onDrawn(this.tool.mode === "draw-structure" ? "structure" : kind, pts, { straight: this.tool.shape === "box" });
      this.handleKey = "";
      this.syncHandles();
      return true;
    }
    return false;
  }

  /** Plot a hole's line by hand: clicks along it from the tee (or a freehand drag), to the basket. */
  setPlotLine(holeId: string | null) {
    if (holeId === this.plotHole) return;
    this.plotHole = holeId;
    this.plotPts = [];
    this.lastPlotClick = null;
    this.cursor = null;
    if (holeId) this.drawDraft();
    else this.clearDraft();
    this.invalidate();
  }

  /** The line plotted so far becomes the hole's (Enter, double-click, the basket, Done). */
  finishPlot() {
    const holeId = this.plotHole;
    if (!holeId) return false;
    this.cb.onHoleChange(holeId, { doglegs: this.plotPts.map(p => ({ ...p })) });
    this.cb.onCommit();
    this.endPlot();
    return true;
  }

  private endPlot() {
    this.plotHole = null;
    this.plotPts = [];
    this.cursor = null;
    this.clearDraft();
    this.cb.onPlotEnd();
    this.invalidate();
  }

  /** A click while plotting: a turn there, or done (on the basket, or a second click on the same spot). */
  private plotClick(p: P, ev: PointerEvent) {
    const s = this.doc?.stats.find(x => x.holeId === this.plotHole);
    if (!s?.complete) return;
    const basket = s.line[s.line.length - 1];
    const bs = this.project(new THREE.Vector3(basket.x, this.h(basket.x, basket.y), basket.y));
    const rect = this.container.getBoundingClientRect();
    const onBasket = !!bs && Math.hypot(bs.x - (ev.clientX - rect.left), bs.y - (ev.clientY - rect.top)) < 16;
    const last = this.lastPlotClick;
    const again = !!last && ev.timeStamp - last.time < 400 && Math.hypot(last.x - ev.clientX, last.y - ev.clientY) < 8;
    this.lastPlotClick = { x: ev.clientX, y: ev.clientY, time: ev.timeStamp };
    if (onBasket || again) {
      this.finishPlot();
      return;
    }
    this.plotPts.push(p);
    this.drawDraft();
  }

  /** A drag while plotting: the line drawn freehand from wherever it starts (then done). */
  private plotDrag(start: PointerEvent): Drag | null {
    const s = this.doc?.stats.find(x => x.holeId === this.plotHole);
    const g0 = this.groundAt(start.clientX, start.clientY);
    if (!s?.complete || !g0) return null;
    const tee = s.line[0], basket = s.line[s.line.length - 1];
    const free: P[] = [...this.plotPts, { x: g0.x, y: g0.z }];
    const step = Math.max(2, 6 / Math.max(0.01, this.viewInfo().pxPerUnit));
    return {
      move: ev => {
        const g = this.groundAt(ev.clientX, ev.clientY);
        if (g && dist(free[free.length - 1], { x: g.x, y: g.z }) >= step) free.push({ x: g.x, y: g.z });
        this.plotPts = free;
        this.cursor = null;
        this.drawDraft();
      },
      end: () => {
        // Smoothed into turns, none right at the tee or the basket
        const turns = simplify([tee, ...free, basket], step * 1.5).slice(1, -1).filter(p => dist(p, tee) > 12 && dist(p, basket) > 12);
        this.plotPts = turns;
        this.finishPlot();
      }
    };
  }

  /** Takes back the last point drawn (Backspace). */
  undoPoint() {
    if (this.plotHole) {
      if (!this.plotPts.length) return false;
      this.plotPts.pop();
      this.drawDraft();
      return true;
    }
    if (this.holeStart) { this.cancelDrawing(); return true; }
    if (!this.drawPts.length) return false;
    this.drawPts.pop();
    this.drawDraft();
    this.cb.onDrawProgress(this.drawPts.length);
    this.handleKey = "";
    this.syncHandles();
    return true;
  }

  /** Drops what is being drawn (Esc). Returns whether there was anything. */
  cancelDrawing() {
    if (this.plotHole) {
      this.endPlot();
      return true;
    }
    if (this.obPick) {
      this.endObPick();
      return true;
    }
    return this.clearDrawing();
  }

  /** Whatever is half drawn let go of. */
  private clearDrawing() {
    const had = !!this.holeStart || this.drawPts.length > 0 || !!this.shapeAnchor;
    this.holeStart = null;
    this.shapeAnchor = null;
    this.drawPts = [];
    this.clearDraft();
    if (had) {
      this.cb.onDrawProgress(0);
      this.handleKey = "";
      this.syncHandles();
    }
    return had;
  }

  private clearDraft() {
    if (this.draft) {
      this.fx.remove(this.draft);
      disposeObjectDeep(this.draft);
      this.draft = null;
    }
    this.draftLabel?.remove();
    this.draftLabel = null;
    this.draftAt = null;
    this.invalidate();
  }

  private drawDraft() {
    const doc = this.doc;
    if (this.draft) {
      this.fx.remove(this.draft);
      disposeObjectDeep(this.draft);
      this.draft = null;
    }
    if (!doc) return;
    const g = new THREE.Group();
    let label = "";
    if (this.holeStart) {
      const a = this.holeStart, b = this.cursor ?? a;
      g.add(this.fatLine(this.drapeLine([a, b], LIFT + 0.2), "#ffffff", 3, { dashed: 6, depthTest: false, order: 20 }));
      const len = dist(a, b);
      const dh = this.h(b.x, b.y) - this.h(a.x, a.y);
      const eff = len + (doc.course.rules?.elevationFactor ?? 3) * dh;
      label = len > 1 ? `${fmtDist(len, doc.course.units)}${Math.abs(dh) >= 1 ? ` · ${fmtElev(dh, doc.course.units)}` : ""} · par ${parForDistance(eff, this.teeLevel)}` : this.fingers ? "Tap where the basket goes" : "Click where the basket goes";
      this.draftAt = new THREE.Vector3(b.x, this.h(b.x, b.y), b.y);
    } else if (this.plotHole) {
      const s = doc.stats.find(x => x.holeId === this.plotHole);
      if (s?.complete) {
        const tee = s.line[0], basket = s.line[s.line.length - 1];
        const done = [tee, ...this.plotPts];
        const reach = this.cursor ? [...done, this.cursor] : done;
        // (the curve the hole's line will take through the turns so far, on to the basket)
        g.add(this.fatLine(this.drapeLine(smoothPath([...reach, basket], 10), LIFT + 0.2), "#fde68a", 3, { depthTest: false, order: 20 }));
        for (const p of this.plotPts) {
          const ring: P[] = [];
          for (let i = 0; i < 16; i++) ring.push({ x: p.x + Math.cos((i / 16) * Math.PI * 2) * 2.5, y: p.y + Math.sin((i / 16) * Math.PI * 2) * 2.5 });
          g.add(this.fatLine(this.drapeLine(ring, LIFT + 0.3, true), "#f59e0b", 3, { depthTest: false, order: 21 }));
        }
        const len = pathLength([...reach, basket]);
        label = `${fmtDist(len, doc.course.units)} · ${this.plotPts.length} turn${this.plotPts.length === 1 ? "" : "s"}`;
        const last = reach[reach.length - 1];
        this.draftAt = new THREE.Vector3(last.x, this.h(last.x, last.y), last.y);
      }
    } else if (this.drawPts.length) {
      let pts = [...this.drawPts];
      if (this.cursor) pts.push(this.cursor);
      const area = this.drawn() === "area";
      // (a path, walk, creek or road curves through its points as they are added)
      if (this.tool.mode === "draw-line" && curves({ kind: this.tool.lineKind })) pts = linePath({ kind: this.tool.lineKind, points: pts });
      const color = this.tool.mode === "draw-structure" ? STRUCTURE_KINDS[this.tool.structureKind ?? "bridge"].color : area ? AREA_KINDS[this.tool.areaKind].color : LINE_KINDS[this.tool.lineKind].color;
      // (an area curves through its corners as they are added, but a rectangle)
      const outline = area && pts.length >= 3 && this.tool.mode === "draw-area" && this.tool.shape !== "box" && areaCurves({ kind: this.tool.areaKind }) ? areaPath({ kind: this.tool.areaKind, points: pts }) : pts;
      if (area && pts.length >= 3) {
        const mesh = new THREE.Mesh(drapedPolygon(outline, (x, y) => this.h(x, y), doc.gridSize, 0.3), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.25, depthWrite: false, depthTest: false }));
        mesh.renderOrder = 19;
        g.add(mesh);
      }
      g.add(this.fatLine(this.drapeLine(area && pts.length >= 3 ? [...outline, outline[0]] : pts, LIFT + 0.2), color === "#ffffff" ? "#fde68a" : color, 3, { depthTest: false, order: 20 }));
      const len = pathLength(pts);
      // (With a finger: the Done button finishes, so the label only counts)
      const finish = this.fingers ? "" : " · Enter or double-click to finish";
      label = this.shaping
        ? area ? `${fmtArea(Math.abs(polygonArea(pts)), doc.course.units)} · ${this.fingers ? "lift" : "let go"} to finish` : `${fmtDist(len, doc.course.units)} · ${this.fingers ? "lift" : "let go"} to finish`
        : area
        ? `${pts.length - (this.cursor ? 1 : 0)} points${finish}`
        : `${fmtDist(len, doc.course.units)}${finish}`;
      const last = pts[pts.length - 1];
      this.draftAt = new THREE.Vector3(last.x, this.h(last.x, last.y), last.y);
    }
    g.traverse(o => { o.raycast = () => {}; });
    this.draft = g;
    this.fx.add(g);
    if (!this.draftLabel) {
      this.draftLabel = document.createElement("div");
      this.draftLabel.className = "dg-ov dg-measure total";
      this.draftLabel.setAttribute("data-testid", "draft-label");
      this.draftLabel.style.position = "absolute";
      this.labelsLayer.appendChild(this.draftLabel);
    }
    this.draftLabel.textContent = label;
    this.invalidate();
  }

  // ------------------------------------------------------------------ wheel, measure, hover

  private onWheel(e: WheelEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (this.povHole) {
      const delta = (e.deltaMode !== 0 ? e.deltaY * 33 : e.deltaY) * 0.0015;
      this.povCam.fov = clamp(this.povCam.fov * Math.exp(delta), 15, 100);
      this.invalidate();
      return;
    }
    const line = e.deltaMode !== 0;
    if (!e.ctrlKey && Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
      const g0 = this.groundAt(e.clientX, e.clientY);
      const g1 = g0 && this.planeAt(e.clientX - e.deltaX, e.clientY, g0.y);
      if (g0 && g1) this.shift(g0.x - g1.x, g0.z - g1.z);
      return;
    }
    const delta = (line ? e.deltaY * 33 : e.deltaY) * (e.ctrlKey ? 0.01 : 0.002);
    this.zoomAt(e.clientX, e.clientY, Math.exp(delta));
  }

  // ------------------------------------------------------------------ you, on the map (GPS)

  /** Called when someone moves the map by hand (the map stops following you). */
  onUserMove: (() => void) | null = null;
  private me: { mark: LocationMark; dot: HTMLDivElement; cone: HTMLElement; tag: HTMLDivElement; at: THREE.Vector3; ring: THREE.Object3D | null } | null = null;

  /** You on the map (null: not shown); `follow`: the map keeps you in the middle of what's visible. */
  setLocation(mark: LocationMark | null, follow = false) {
    if (!mark) {
      if (this.me) {
        this.me.dot.remove();
        this.me.tag.remove();
        if (this.me.ring) { this.fx.remove(this.me.ring); disposeObjectDeep(this.me.ring); }
        this.me = null;
        this.invalidate();
      }
      return;
    }
    if (!this.me) {
      const dot = document.createElement("div");
      dot.className = "dg-ov dg-me";
      dot.setAttribute("data-testid", "my-location");
      const cone = document.createElement("i");
      dot.appendChild(cone);
      const tag = document.createElement("div");
      tag.className = "dg-ov dg-me-tag";
      tag.setAttribute("data-testid", "my-location-tag");
      this.labelsLayer.append(dot, tag);
      this.me = { mark, dot, cone, tag, at: new THREE.Vector3(), ring: null };
    }
    const me = this.me;
    const was = me.mark;
    me.mark = mark;
    me.at.set(mark.at.x, this.h(mark.at.x, mark.at.y) + 1, mark.at.y);
    me.dot.classList.toggle("dim", mark.dim);
    me.tag.textContent = mark.tag;
    me.tag.style.visibility = mark.tag ? "" : "hidden";
    // The circle of how sure it is, and the dashed line on to the basket
    const moved = !me.ring || was.acc !== mark.acc || was.at.x !== mark.at.x || was.at.y !== mark.at.y || was.to?.x !== mark.to?.x || was.to?.y !== mark.to?.y || was.dim !== mark.dim;
    if (moved) {
      if (me.ring) { this.fx.remove(me.ring); disposeObjectDeep(me.ring); }
      const g = new THREE.Group();
      const r = Math.max(4, mark.acc);
      const ring: P[] = [];
      for (let i = 0; i < 72; i++) ring.push({ x: mark.at.x + Math.cos((i / 72) * Math.PI * 2) * r, y: mark.at.y + Math.sin((i / 72) * Math.PI * 2) * r });
      const color = mark.dim ? "#8e8e93" : "#0a84ff";
      const disc = new THREE.Mesh(drapedPolygon(ring, (x, y) => this.h(x, y), this.doc?.gridSize ?? 20, 0.4), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.16, depthWrite: false, depthTest: false }));
      disc.renderOrder = 27;
      g.add(disc);
      g.add(this.fatLine(this.drapeLine(ring, 0.5, true), color, 1.5, { opacity: 0.55, depthTest: false, order: 28 }));
      if (mark.to) g.add(this.fatLine(this.drapeLine([mark.at, mark.to], LIFT + 0.35), "#ffffff", 2, { dashed: 6, opacity: 0.85, depthTest: false, order: 28 }));
      me.ring = g;
      this.fx.add(g);
    }
    if (follow) {
      const shift = this.insetShift(this.controls.distance);
      const cx = mark.at.x + shift.x, cy = mark.at.y + shift.y;
      void this.controls.moveTo(cx, this.h(cx, cy), cy, true);
    }
    this.invalidate();
  }

  /** A spot for the tool in hand, as if tapped there (where you stand, from the GPS): a new hole's
   * tee and then its basket, another tee or pin. False: not taken (the basket right by the tee). */
  toolPoint(p: P) {
    const mode = this.tool.mode;
    if (mode === "add-hole") {
      if (!this.holeStart) {
        this.holeStart = p;
        this.cursor = p;
        this.drawDraft();
        this.cb.onDrawProgress(1);
        return true;
      }
      if (dist(this.holeStart, p) <= 10) return false;
      const start = this.holeStart;
      this.holeStart = null;
      this.clearDraft();
      this.cb.onDrawProgress(0);
      this.cb.onHole(start, p);
      return true;
    }
    if (mode === "add-tee" || mode === "add-basket") { this.cb.onPlace(mode, p); return true; }
    return false;
  }

  /** The measure tool started at a spot (from the map's menu): the next tap measures from there. */
  measureFrom(p: P) {
    this.measurePts = [new THREE.Vector3(p.x, this.h(p.x, p.y), p.y)];
    this.measureCursor = null;
    this.drawMeasure();
  }

  /** Puts the dot (and its cone, turned the way you face on the screen) where you are. */
  private placeMe(place: (el: HTMLElement, world: THREE.Vector3 | null, dy?: number) => void) {
    const me = this.me;
    if (!me) return;
    place(me.dot, me.at);
    place(me.tag, me.at, 26);
    const f = me.mark.facing;
    if (f === null) { me.cone.style.display = "none"; return; }
    // (the way you face, as the screen shows it: north is -y on the plan, east +x)
    const a = this.project(me.at);
    const ahead = new THREE.Vector3(me.mark.at.x + Math.sin(f * DEG) * 30, me.at.y, me.mark.at.y - Math.cos(f * DEG) * 30);
    const b = this.project(ahead);
    if (!a || !b) { me.cone.style.display = "none"; return; }
    me.cone.style.display = "";
    me.cone.style.transform = `rotate(${Math.atan2(b.x - a.x, -(b.y - a.y))}rad)`;
  }

  private measurePts: THREE.Vector3[] = [];
  private measureCursor: THREE.Vector3 | null = null;
  private measureLine: THREE.Object3D | null = null;
  private measureLabels: { el: HTMLDivElement; at: THREE.Vector3 }[] = [];

  /** Points measured so far (plan coordinates), and the total length. */
  measurement() {
    const pts = this.measurePts.map(v => ({ x: v.x, y: v.z }));
    return { points: pts, total: pathLength(pts) };
  }

  private clearMeasure() {
    this.measurePts = [];
    this.measureCursor = null;
    this.drawMeasure();
  }

  /** A click: the first point stays where it was put, each click after it moves the other end
   * (Shift+click adds a turn instead: a path); Esc or another tool ends it. */
  private addMeasurePoint(p: THREE.Vector3, keepGoing: boolean) {
    if (this.measurePts.length >= 2 && !keepGoing) this.measurePts = [this.measurePts[0]];
    this.measurePts.push(p.clone());
    this.drawMeasure();
  }

  private drawMeasure() {
    if (this.measureLine) {
      this.fx.remove(this.measureLine);
      disposeObjectDeep(this.measureLine);
      this.measureLine = null;
    }
    this.measureLabels.forEach(l => l.el.remove());
    this.measureLabels = [];
    const pts = [...this.measurePts];
    if (this.measureCursor && pts.length === 1) pts.push(this.measureCursor);
    const units = this.doc?.course.units ?? "ft";
    // (two points put down: where the next click would move the end to, faint, from the first)
    const ahead = this.measureCursor && this.measurePts.length === 2 ? [this.measurePts[0], this.measureCursor] : null;
    if (ahead && Math.hypot(ahead[1].x - this.measurePts[1].x, ahead[1].z - this.measurePts[1].z) < 0.5) ahead.length = 0;
    // A dot at each point (the pointer's end fainter)
    pts.forEach((v, i) => {
      const el = document.createElement("div");
      el.className = `dg-ov dg-mpt${i >= this.measurePts.length ? " live" : ""}`;
      el.setAttribute("data-testid", "measure-point");
      this.labelsLayer.appendChild(el);
      this.measureLabels.push({ el, at: v.clone() });
    });
    if (pts.length >= 2) {
      // (a thin line on a dark casing: it reads over grass, photo and woods alike)
      const line = this.drapeLine(pts.map(v => ({ x: v.x, y: v.z })), LIFT + 0.3);
      const g = new THREE.Group();
      g.add(this.fatLine(line, "#1c1917", 4.5, { depthTest: false, order: 29, opacity: 0.55 }));
      g.add(this.fatLine(line, "#facc15", 2, { depthTest: false, order: 30 }));
      if (ahead?.length) {
        const next = this.drapeLine(ahead.map(v => ({ x: v.x, y: v.z })), LIFT + 0.3);
        g.add(this.fatLine(next, "#facc15", 1.5, { depthTest: false, order: 30, opacity: 0.6, dashed: 4 }));
        const d = Math.hypot(ahead[1].x - ahead[0].x, ahead[1].z - ahead[0].z);
        const dh = ahead[1].y - ahead[0].y;
        const dot = document.createElement("div");
        dot.className = "dg-ov dg-mpt live";
        this.labelsLayer.appendChild(dot);
        this.measureLabels.push({ el: dot, at: ahead[1].clone() });
        if (d >= 0.5) {
          const el = document.createElement("div");
          el.className = "dg-ov dg-measure live";
          el.setAttribute("data-testid", "measure-next");
          el.textContent = `${fmtDist(d, units)}${Math.abs(dh) >= 1 ? ` · ${fmtElev(dh, units)}` : ""}`;
          this.labelsLayer.appendChild(el);
          this.measureLabels.push({ el, at: ahead[1].clone() });
        }
      }
      this.measureLine = g;
      this.fx.add(this.measureLine);
      let total = 0;
      for (let i = 1; i < pts.length; i++) {
        const d = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
        total += d;
        const dh = pts[i].y - pts[i - 1].y;
        // (the pointer still on the point just put down: no "0 ft" tag)
        if (d < 0.5) continue;
        const el = document.createElement("div");
        el.className = "dg-ov dg-measure";
        el.setAttribute("data-testid", "measure-label");
        el.textContent = `${fmtDist(d, units)}${Math.abs(dh) >= 1 ? ` · ${fmtElev(dh, units)}` : ""}`;
        this.labelsLayer.appendChild(el);
        this.measureLabels.push({ el, at: pts[i - 1].clone().lerp(pts[i], 0.5) });
      }
      if (pts.length > 2) {
        const el = document.createElement("div");
        el.className = "dg-ov dg-measure total";
        el.textContent = `Total ${fmtDist(total, units)}`;
        this.labelsLayer.appendChild(el);
        this.measureLabels.push({ el, at: pts[pts.length - 1].clone() });
      }
    }
    this.invalidate();
  }

  /** Drag in the tee view to look around. */
  private povDrag(e: PointerEvent) {
    if (this.fly) return;
    const x0 = e.clientX, y0 = e.clientY;
    const start = { ...this.povLook };
    const degPerPx = this.povCam.fov / Math.max(1, this.size.height);
    const move = (ev: PointerEvent) => {
      this.povLook = {
        yaw: start.yaw - (ev.clientX - x0) * degPerPx * DEG,
        pitch: clamp(start.pitch + (ev.clientY - y0) * degPerPx * DEG, -70 * DEG, 50 * DEG)
      };
      this.invalidate();
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  /** Zoom keeping the ground point under the cursor fixed. */
  private zoomAt(clientX: number, clientY: number, factor: number, smooth = true) {
    const pos = this.controls.getPosition(new THREE.Vector3(), true);
    const target = this.controls.getTarget(new THREE.Vector3(), true);
    const d = pos.distanceTo(target);
    const f = clamp(d * factor, this.controls.minDistance, this.controls.maxDistance) / d;
    if (Math.abs(f - 1) < 1e-4) return;
    const p = this.groundAt(clientX, clientY) ?? target.clone();
    const np = p.clone().add(pos.sub(p).multiplyScalar(f));
    const nt = p.clone().add(target.sub(p).multiplyScalar(f));
    void this.controls.setLookAt(np.x, np.y, np.z, nt.x, nt.y, nt.z, smooth);
    this.controls.normalizeRotations();
    this.invalidate();
  }

  private onDoubleClick(e: MouseEvent) {
    if (this.povHole) return;
    if (this.drawn()) {
      // The double-click's two clicks each added a point: drop the repeat, then finish
      if (this.drawPts.length >= 2 && dist(this.drawPts[this.drawPts.length - 1], this.drawPts[this.drawPts.length - 2]) < 3) this.drawPts.pop();
      this.finishDrawing();
      return;
    }
    if (this.tool.mode !== "select") return;
    if ((e.target as HTMLElement).closest?.("[data-handle],[data-item-id]")) return;
    if (this.pick(e.clientX, e.clientY)) return;
    this.zoomAt(e.clientX, e.clientY, 0.5);
  }

  private onHoverMove(e: PointerEvent) {
    if (e.buttons || this.dragging || this.povHole) return;
    this.lastPointer = { x: e.clientX, y: e.clientY };
    if (this.hoverFrame) return;
    this.hoverFrame = requestAnimationFrame(() => {
      this.hoverFrame = 0;
      const p = this.lastPointer;
      if (!p || !this.doc) return;
      const g = this.groundAt(p.x, p.y);
      this.cb.onHover(g ? { x: g.x, y: g.z } : null);
      if (this.obPick && g) { this.obPickHover({ x: g.x, y: g.z }); return; }
      // (the brush's circle where it would paint)
      const painting = this.tool.mode === "sculpt" || (this.tool.mode === "draw-area" && this.tool.shape === "paint");
      if (painting) this.showBrush(g ? { x: g.x, y: g.z } : null, this.tool.brush?.size ?? 20);
      else if (this.brushRing?.obj.visible) this.showBrush(null, 0);
      if (this.tool.mode === "measure") {
        // (only over the site: a tilted view's horizon would stretch the line across the screen)
        const w = this.doc.course.canvas;
        const over = !!g && g.x >= 0 && g.z >= 0 && g.x <= w.width && g.z <= w.height;
        if ((this.measurePts.length === 1 || this.measurePts.length === 2) && (over || this.measureCursor)) {
          this.measureCursor = over ? g : null;
          this.drawMeasure();
        }
        return;
      }
      if (this.shapeAnchor) {
        const pts = this.shapePoints(this.shapeAnchor.shape, this.shapeAnchor, p);
        if (pts) {
          this.drawPts = pts;
          this.cursor = null;
          this.drawDraft();
          this.drawPts = [];
        }
        return;
      }
      if (this.holeStart || this.drawPts.length || this.plotHole) {
        if (g) {
          this.cursor = { x: g.x, y: g.z };
          this.drawDraft();
        }
        return;
      }
      const target = document.elementFromPoint(p.x, p.y) as HTMLElement | null;
      if (this.tool.mode === "select") {
        const dom = (target?.closest?.("[data-item-id]") as HTMLElement | null)?.dataset.itemId ?? null;
        const over = dom ?? (target?.closest?.("[data-handle]") ? null : this.pick(p.x, p.y));
        this.setHover(this.readOnly ? this.holeFor(over) : over);
      } else {
        this.setHover(null);
        this.updateGhost(g);
      }
    });
  }

  private updateCursor() {
    const t = this.tool;
    let c = t.dragSelect && t.mode === "select" ? "crosshair" : "grab";
    if (this.povHole) c = "move";
    else if (this.obPick) c = "crosshair";
    else if (t.mode !== "select") c = "crosshair";
    else if (this.hoverId) {
      const it = this.item(this.hoverId);
      c = !it || ((it.type === "area" || it.type === "line" || it.type === "structure") && this.hoverId !== this.selectedId && !this.group.includes(this.hoverId)) ? "pointer" : "move";
    }
    this.container.style.cursor = c;
  }

  // ------------------------------------------------------------------ placement preview

  private updateGhost(at: THREE.Vector3 | null) {
    const mode = this.tool.mode;
    const kind = mode === "add-tee" ? "tee" : mode === "add-basket" ? "basket" : mode === "add-mando" ? "mando" : mode === "add-dropzone" ? "dropzone" : mode === "add-tree" ? "tree" : mode === "add-amenity" ? "amenity" : "";
    if (!at || !kind || !this.doc) {
      if (this.ghost) {
        this.fx.remove(this.ghost);
        disposeObjectDeep(this.ghost);
        this.ghost = null;
        this.ghostKey = "";
      }
      this.invalidate();
      return;
    }
    if (this.ghostKey !== kind) {
      if (this.ghost) {
        this.fx.remove(this.ghost);
        disposeObjectDeep(this.ghost);
      }
      this.ghostKey = kind;
      const obj = kind === "basket" ? createBasket(this.doc.course.style.basketBand ?? BASKET_BAND)
        : kind === "mando" ? createMando("right")
        : kind === "dropzone" ? createDropZone()
        : kind === "amenity" ? createAmenity("bench")
        : kind === "tree" ? create3dTree({ id: "ghost", type: "tree", x: 0, y: 0, rotation: 0, radius: 14, height: 40, color: "#4a7a3a" })
        : createTeePad({ id: "ghost", type: "tee", holeId: "", level: this.teeLevel, x: 0, y: 0, rotation: 0, padWidth: 5, padLength: 12, surface: "concrete" }, 0);
      obj.traverse(o => {
        const mesh = o as THREE.Mesh;
        const see = (m: THREE.Material) => { const c = m.clone(); c.userData = { ...c.userData, shared: false }; c.transparent = true; c.opacity = 0.55; c.depthWrite = false; return c; };
        if (mesh.material) mesh.material = Array.isArray(mesh.material) ? mesh.material.map(see) : see(mesh.material);
        o.raycast = () => {};
      });
      this.ghost = obj;
      this.fx.add(obj);
    }
    this.ghost!.position.set(at.x, at.y + OBJECT_ELEVATION_OFFSET, at.z);
    this.invalidate();
  }
}
