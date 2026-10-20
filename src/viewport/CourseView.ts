// The map view: one 3D scene that is a flat-looking map when you look straight down and a 3D
// model of the course when you tilt it (from the Security Camera Planner's map view). Navigation
// works like a web map (drag to pan, scroll or pinch to zoom at the cursor, right-drag or
// Ctrl/Shift-drag to rotate and tilt); editing works the same at any angle: click to place, drag
// things to move them, and drag the handles on the selection (doglegs, fairway width, corners).
// It can also look from a tee down its hole, and fly over a hole.
//
// Plan (x, y) is world (x, z) with Y up; plan units are feet.
import * as THREE from "three";
import CameraControls from "camera-controls";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { Sky } from "three/examples/jsm/objects/Sky.js";
import { INK, MANDO, RESTRICTED, amenitySymbol, dropZoneSymbol, symbolSvg } from "../lib/symbols";
import { AMENITY_KINDS, AREA_KINDS, CIRCLE_ONE_FT, EYE_HEIGHT_FT, LINE_KINDS, OBJECT_ELEVATION_OFFSET, STRUCTURE_KINDS, TEE_LEVELS, clamp } from "../constants";
import { FAIRWAY_STATIONS, autoWalks, basketFor, fairwayOutline, fairwayWidthAt, holeBaskets, holeNumber, holeTees, teeAim, throwLine } from "../lib/course";
import { boundsOf, dist, distanceToPath, pathLength, pointAlong, pointInPolygon, polygonArea, simplify, smoothPath } from "../lib/geom";
import { parForDistance } from "../lib/holeStats";
import { heightAt } from "../lib/terrainGrid";
import { landscapeOf } from "../lib/landscapes";
import { fmtArea, fmtDist, fmtElev } from "../lib/units";
import { createAmenity, createBasket, createDropZone, createMando, createTeePad } from "../three/courseModels";
import { drapedPoints, drapedPolygon, drapedRibbon } from "../three/drape";
import { disposeObjectDeep } from "../three/dispose";
import { create3dTree, getTreeSignature } from "../three/trees";
import { createWoods } from "../three/woods";
import { forestDetail, type Forest } from "../three/treeKit";
import { GRASS, Grass, type GrassQuality } from "../three/grass";
import { setWaterSky, waterMaterial, waterUniforms } from "../three/water";
import { createStructure } from "../three/structures";
import { isLineKind, orientedBox, structureBounds, structureHeight, structurePath, structureWidth } from "../lib/structures";
import type { AmenityItem, AreaItem, BasketItem, CourseItem, Hole, LabelItem, LineItem, MandoItem, StructureItem, TeeItem, TeeLevel, TreeItem } from "../types";
import { Ground } from "./ground";
import { grassMaps, grassTerrain } from "./grassMaps";
import type { FlightFrames, FlyoverVideo, FrameInfo, RecordOptions } from "./flyoverVideo";
import type { P, ViewCallbacks, ViewDoc, ViewInfo, ViewTool } from "./types";

CameraControls.install({ THREE });
const { ACTION } = CameraControls;

const DEG = Math.PI / 180;
const SUN_INTENSITY = 2.4;
const HEMI_INTENSITY = 0.9;
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
type Overlay = { el: HTMLDivElement; anchor: THREE.Vector3; dy: number; sig: string; rank: number; w?: number; h?: number; minPx?: number };

const STYLE = `
.dg-layer{position:absolute;inset:0;pointer-events:none;overflow:hidden}
.dg-ov{position:absolute;left:0;top:0;will-change:transform;white-space:nowrap}
.dg-tee{pointer-events:auto;cursor:move;min-width:22px;height:22px;padding:0 5px;border-radius:999px;display:flex;align-items:center;justify-content:center;background:var(--c);color:var(--ink);font:800 12px/1 Oswald,Inter,system-ui,sans-serif;border:2px solid rgba(15,23,42,.85);box-shadow:0 1px 4px rgba(0,0,0,.5)}
.dg-tee.alt{min-width:15px;height:15px;font-size:9px;padding:0 3px;opacity:.9}
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
.dg-h{position:absolute;left:0;top:0;pointer-events:auto;will-change:translate;box-sizing:border-box;touch-action:none}
.dg-h[data-handle=corner],.dg-h[data-handle=dogleg]{width:14px;height:14px;border-radius:50%;background:#fff;border:2.5px solid #0891b2;cursor:grab;box-shadow:0 1px 3px rgba(0,0,0,.5)}
.dg-h[data-handle=dogleg]{border-color:#f59e0b}
.dg-h[data-handle=mid]{width:11px;height:11px;border-radius:50%;background:rgba(255,255,255,.6);border:2px solid #0891b2;cursor:copy}
.dg-h[data-handle=mid][data-kind=line]{border-color:#f59e0b}
.dg-h[data-handle=width]{width:13px;height:13px;border-radius:3px;background:#fff;border:2.5px solid #16a34a;cursor:ew-resize;box-shadow:0 1px 3px rgba(0,0,0,.5)}
.dg-h[data-handle=rotate]{width:24px;height:24px;border-radius:50%;background:#fff;border:2.5px solid #2563eb;cursor:grab;box-shadow:0 1px 3px rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;color:#2563eb;font:900 14px system-ui}
.dg-h[data-handle=radius]{width:15px;height:15px;border-radius:50%;background:#16a34a;border:2.5px solid #fff;cursor:ew-resize;box-shadow:0 1px 3px rgba(0,0,0,.5)}
.dg-h[data-handle=height]{width:16px;height:22px;border-radius:5px;background:#f59e0b;border:2.5px solid #fff;cursor:ns-resize;box-shadow:0 1px 3px rgba(0,0,0,.5)}
.dg-h[data-handle=draw]{width:10px;height:10px;border-radius:50%;background:#fff;border:2px solid #f59e0b;pointer-events:none}
.dg-h[data-handle=draw][data-index="0"]{width:14px;height:14px;pointer-events:auto;cursor:pointer;border-width:3px}
@media (pointer:coarse){.dg-h{transform-origin:center}.dg-h[data-handle]{scale:1.5}.dg-h[data-handle]::before{content:"";position:absolute;left:50%;top:50%;width:30px;height:30px;translate:-50% -50%;border-radius:50%}.dg-tee::before,.dg-basket::before,.dg-sym::before,.dg-chip::before{content:"";position:absolute;inset:-10px}}
`;

const lineMats = new Set<LineMaterial>();
/** A finger is the main pointer (handles are drawn bigger there). */
const COARSE = typeof matchMedia !== "undefined" && matchMedia("(pointer: coarse)").matches;

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
  private arcsGroup = new THREE.Group();
  private fx = new THREE.Group();
  private labelsLayer: HTMLDivElement;
  private handlesLayer: HTMLDivElement;
  private objects = new Map<string, { obj: THREE.Object3D; sig: string }>();
  private shapes = new Map<string, { obj: THREE.Object3D; sig: string }>();
  private overlays = new Map<string, Overlay>();
  private handles: Handle[] = [];
  private handleKey = "";
  private selectionFx: THREE.Object3D | null = null;
  private hoverFx: THREE.Object3D | null = null;
  private ghost: THREE.Object3D | null = null;
  private ghostKey = "";
  private lastCorner: { id: string; index: number; time: number } | null = null;
  private doc: ViewDoc | null = null;
  private heightsVersion = 0;
  private heightsRef: unknown = null;
  private selectedId: string | null = null;
  private hoverId: string | null = null;
  private tool: ViewTool = { mode: "select", areaKind: "ob", lineKind: "ob", shape: "points", readOnly: false };
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
  private fly: { pts: THREE.Vector3[]; look: THREE.Vector3[]; t: number; dur: number; done?: () => void } | null = null;
  private skyBox: Sky;
  /** Grass blades near the camera, in 3D (see three/grass). */
  readonly grass = new Grass();
  private grassInputs: unknown[] = [];
  /** The sky as an environment for water to reflect (made again when the sun moves). */
  private skyEnv: THREE.WebGLRenderTarget | null = null;
  private skyEnvKey = "";
  private grassBuilt = 0;
  private grassTimer = 0;
  private lastSky = false;
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
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
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

    // A dusky backdrop behind the site when tilted, in the app's dark palette
    {
      const c = document.createElement("canvas");
      c.width = 2;
      c.height = 256;
      const g = c.getContext("2d")!;
      const grad = g.createLinearGradient(0, 0, 0, 256);
      grad.addColorStop(0, "#101418");
      grad.addColorStop(0.6, "#1d252b");
      grad.addColorStop(1, "#2c3a36");
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

    this.camera = new THREE.PerspectiveCamera(30, 1, 0.5, 40000);
    this.controls = new CameraControls(this.camera, canvas);
    const c = this.controls;
    void c.setLookAt(800, 2400, 550, 800, 0, 550, false);
    c.mouseButtons.left = ACTION.NONE;
    c.mouseButtons.middle = ACTION.NONE;
    c.mouseButtons.right = ACTION.ROTATE;
    c.mouseButtons.wheel = ACTION.NONE;
    c.touches.one = ACTION.TOUCH_TRUCK;
    c.touches.two = ACTION.TOUCH_DOLLY_ROTATE;
    c.touches.three = ACTION.TOUCH_TRUCK;
    c.minPolarAngle = 0;
    c.maxPolarAngle = MAX_TILT;
    c.smoothTime = 0.16;
    c.draggingSmoothTime = 0.06;
    c.azimuthRotateSpeed = 0.7;
    c.polarRotateSpeed = 0.7;
    c.dollyToCursor = true;
    c.addEventListener("controlend", () => this.snapNorth());
    c.addEventListener("controlstart", () => { this.posePinned = false; });
    c.addEventListener("rest", () => { this.posePinned = false; });

    this.ground = new Ground(this.renderer, () => this.invalidate(true));
    this.scene.add(this.ground.group, this.shapesGroup, this.arcsGroup, this.itemsGroup, this.fx, this.skyBox, this.grass.group);
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
    if (leaving || tool.shape !== this.tool.shape) this.cancelDrawing();
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
    const margin = opts.margin ?? 1.2;
    const minSpan = opts.minSpan ?? 0;
    const w = Math.max(b.maxX - b.minX, minSpan, 1) * margin;
    const d = Math.max(b.maxY - b.minY, minSpan * 0.6, 1) * margin;
    const inset = clamp(this.rightInset, 0, this.size.width * 0.5);
    const covered = clamp(this.bottomInset, 0, this.size.height * 0.6) + clamp(this.topInset, 0, this.size.height * 0.3);
    const H = Math.max(1, this.size.height);
    const aspect = (this.size.width - inset) / H;
    const t = Math.tan((this.camera.fov * DEG) / 2);
    const dist = clamp(Math.max(d / (2 * t), w / (2 * t * aspect)) * (H / Math.max(1, H - covered)), this.controls.minDistance, this.controls.maxDistance);
    let cx = (b.minX + b.maxX) / 2;
    let cy = (b.minY + b.maxY) / 2;
    const worldPerPx = (2 * dist * t) / H;
    if (inset > 0) {
      // Look a little right of the middle, so the middle lands in the visible part
      const right = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0);
      right.y = 0;
      if (right.lengthSq() > 1e-6) right.normalize();
      cx += right.x * (inset / 2) * worldPerPx;
      cy += right.z * (inset / 2) * worldPerPx;
    }
    // (And between the top and bottom panels)
    const shift = this.insetShift(dist);
    cx += shift.x;
    cy += shift.y;
    const animate = opts.animate ?? true;
    void this.controls.moveTo(cx, this.h(cx, cy), cy, animate);
    void this.controls.dollyTo(dist, animate);
    this.invalidate();
  }

  fitSite(animate = true) {
    const doc = this.doc;
    if (!doc) return;
    this.fitBounds({ minX: 0, minY: 0, maxX: doc.canvas.width, maxY: doc.canvas.height }, { margin: 1, animate });
  }

  /** Fit the holes (or the whole site when there are none). */
  fitCourse(animate = true) {
    const doc = this.doc;
    if (!doc) return;
    const pts = doc.course.items.filter(i => i.type === "tee" || i.type === "basket") as P[];
    if (pts.length < 2) return this.fitSite(animate);
    this.fitBounds(boundsOf(pts), { margin: 1.25, minSpan: 300, animate });
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
    const visibleW = this.size.width - rightInset;
    const top = this.topInset, visibleH = this.size.height - this.bottomInset;
    if (box && box.x >= m && box.y >= top + m && box.x + box.width <= visibleW - m && box.y + box.height <= visibleH - m) return;
    if (box && (box.width > visibleW - 2 * m || box.height > visibleH - top - 2 * m)) {
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
    this.controls.enabled = !holeId;
    this.labelsLayer.style.display = holeId ? "none" : "";
    this.handlesLayer.style.display = holeId ? "none" : "";
    if (!holeId && this.povMarker) this.povMarker.style.display = "none";
    this.updateCursor();
    this.invalidate();
  }

  /** Fly over a hole from behind the tee to the basket; `done` runs when it lands. */
  flyover(holeId: string, done?: () => void) {
    const path = this.flightPath(holeId);
    if (!path) return;
    this.setTeeView(holeId);
    this.fly = { ...path, t: 0, done };
    this.invalidate();
  }

  /** The flight over a hole: camera and look-at points from behind the tee to the basket, and how
   * long it takes (s). */
  private flightPath(holeId: string): { pts: THREE.Vector3[]; look: THREE.Vector3[]; dur: number } | null {
    const s = this.doc?.stats.find(x => x.holeId === holeId);
    if (!s?.complete) return null;
    const line = smoothPath(s.line, 16);
    const len = pathLength(line);
    const start = line[0], end = line[line.length - 1];
    const a0 = pointAlong(line, 0).angle;
    const back = { x: start.x - Math.cos(a0) * 60, y: start.y - Math.sin(a0) * 60 };
    const pts: THREE.Vector3[] = [];
    const look: THREE.Vector3[] = [];
    const n = 60;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      // Camera: from behind and above the tee, along the line, ending short of the basket
      const d = -60 + t * (len - 25 + 60);
      const p = d < 0 ? { x: start.x + (back.x - start.x) * (-d / 60), y: start.y + (back.y - start.y) * (-d / 60) } : pointAlong(line, d).point;
      const alt = 45 + Math.sin(Math.PI * Math.min(1, t * 1.1)) * Math.min(60, len * 0.12) - t * 25;
      pts.push(new THREE.Vector3(p.x, this.h(p.x, p.y) + alt, p.y));
      const ahead = pointAlong(line, Math.min(len, Math.max(0, d) + Math.max(120, len * 0.35))).point;
      const toward = t > 0.75 ? end : ahead;
      look.push(new THREE.Vector3(toward.x, this.h(toward.x, toward.y) + 3, toward.y));
    }
    return { pts, look, dur: clamp(len / 70, 6, 14) };
  }

  stopFlyover() {
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
      const k = clamp(f.t / f.dur, 0, 1);
      const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      const idx = e * (f.pts.length - 1);
      const i0 = Math.floor(idx), i1 = Math.min(f.pts.length - 1, i0 + 1);
      cam.position.lerpVectors(f.pts[i0], f.pts[i1], idx - i0);
      cam.lookAt(new THREE.Vector3().lerpVectors(f.look[i0], f.look[i1], idx - i0));
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
    this.arcsGroup.visible = true;
    this.fx.visible = false;
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
    this.ground.extras.visible = true;
    this.fx.visible = true;
    if (!target) this.placePovMarker(cam, rect);
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
    if (!doc || !s?.complete || rect.width !== this.size.width) { el.style.display = "none"; return; }
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
    return this.fly ? clamp(this.fly.t / this.fly.dur, 0, 1) : null;
  }

  // ------------------------------------------------------------------ flyover videos

  /** Records flyovers of the holes, one after another, to a video file: rendered offline, frame by
   * frame at a steady 1/fps step, into an offscreen picture of the asked size (the view on screen
   * keeps its size and goes on as before). See flyoverVideo.ts. */
  async recordFlyover(holeIds: string[], opts: RecordOptions): Promise<FlyoverVideo> {
    if (!this.doc || this.disposed) throw new Error("The map isn't ready yet.");
    const doc = this.doc.course;
    const { recordFlights } = await import("./flyoverVideo");
    return recordFlights(this.flightFrames(opts.width, opts.height), doc, holeIds, opts);
  }

  /** Flights over holes drawn offscreen at a fixed size, one moment at a time (for a recording):
   * like the flyover on screen, into a render target of its own. */
  flightFrames(width: number, height: number): FlightFrames {
    const gl = this.renderer.getContext();
    if (Math.max(width, height) > Math.min(this.renderer.capabilities.maxTextureSize, gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) as number)) {
      throw new Error("This computer's graphics can't draw a video that big: pick a smaller size.");
    }
    // Smooth edges (fewer samples on very big pictures, where they matter less and cost the most)
    const rt = new THREE.WebGLRenderTarget(width, height, { samples: width * height > 4e6 ? 2 : 4, type: THREE.UnsignedByteType });
    // Rendered exactly like the screen (tone mapping, sRGB colors) and with the same shaders: three
    // only does that for the screen and XR targets, so this target says it is one; its plain RGBA8
    // storage then holds the finished sRGB colors
    rt.texture.internalFormat = "RGBA8";
    rt.texture.colorSpace = THREE.SRGBColorSpace;
    (rt as unknown as { isXRRenderTarget: boolean }).isXRRenderTarget = true;
    const raw = new Uint8Array(width * height * 4);
    this.recordings++;
    let open = true;
    const paths = new Map<string, ReturnType<CourseView["flightPath"]>>();
    const path = (id: string) => {
      if (!paths.has(id)) paths.set(id, this.flightPath(id));
      return paths.get(id) ?? null;
    };
    return {
      duration: id => path(id)?.dur ?? 0,
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
      // At most a quarter second per frame: a slow first frame (or a tab coming back from the
      // background) must not skip the flight
      this.fly.t += Math.min(dt, 0.25);
      this.dirty = true;
      if (this.fly.t >= this.fly.dur) {
        const done = this.fly.done;
        this.fly = null;
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
    const shadow = this.tier >= 3 ? 512 : this.mobile || this.tier >= 2 ? 1024 : 2048;
    if (this.sun.shadow.mapSize.x !== shadow) {
      this.sun.shadow.mapSize.set(shadow, shadow);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
      this.shadowsDirty = true;
    }
    forestDetail.nearFt = (this.software ? 70 : this.mobile ? 150 : 260) * (this.tier >= 3 ? 0.6 : 1);
    this.invalidate();
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
    return { tier: this.tier, pixelRatio: this.renderer.getPixelRatio(), shadow: this.sun.shadow.mapSize.x, nearFt: forestDetail.nearFt, grass: this.grassQuality(), mobile: this.mobile, software: this.software };
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
    this.arcsGroup.visible = tilted;
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
    this.scene.fog = new THREE.FogExp2(haze.getHex(THREE.LinearSRGBColorSpace), eyeLevel ? 0.8 / (span * 2.4) : 0.7 / (span * 3.2));
    (this.scene.fog as THREE.FogExp2).color.copy(haze);
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
    if (!doc || !on || !q) {
      this.grass.group.visible = false;
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
    const photo = this.ground.photo && doc.background.opacity > 0.3 ? this.ground.photo : null;
    if (this.grassPhoto !== photo) {
      this.grassPhoto = photo;
      this.grass.setPhoto(photo, doc.background.rect, 0.8);
    }
    const p = cam.position;
    const t = this.clock.elapsedTime;
    this.grass.update(p, this.h(clamp(p.x, 0, doc.canvas.width), clamp(p.z, 0, doc.canvas.height)), t, this.wind && this.povHole ? 0.14 : 0.05);
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
    return { trees, near, conifers };
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
    this.renderer.toneMappingExposure = 1.05 * Math.pow(2, (doc.sun?.light ?? 0) * 1.6);
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
    const terrain = this.ground.terrain;
    if (terrain) {
      const hit = this.raycaster.intersectObject(terrain, false)[0];
      if (hit) return hit.point.clone();
    }
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
    return holeId && this.doc ? holeNumber(this.doc.course, holeId) : 0;
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

  // ------------------------------------------------------------------ scene sync: 3D objects

  private signature(item: CourseItem) {
    const doc = this.doc!;
    switch (item.type) {
      case "tee": return JSON.stringify([item.level, item.padLength, item.padWidth, item.surface, this.num(item.holeId)]);
      case "basket": return doc.course.style.basket;
      case "mando": return item.side;
      case "dropzone": return "dz";
      case "tree": return getTreeSignature(item as TreeItem) + item.id;
      case "amenity": return item.kind;
      default: return "";
    }
  }

  private buildObject(item: CourseItem): THREE.Object3D | null {
    const doc = this.doc!;
    switch (item.type) {
      case "tee": return createTeePad(item, this.num(item.holeId));
      case "basket": return createBasket(doc.course.style.basket);
      case "mando": return createMando(item.side);
      case "dropzone": return createDropZone();
      case "tree": return create3dTree(item);
      case "amenity": return createAmenity(item.kind);
      default: return null;
    }
  }

  private place(obj: THREE.Object3D, item: CourseItem) {
    const doc = this.doc!;
    const g = this.h(item.x, item.y);
    if (item.type === "tee") {
      obj.position.set(item.x, g, item.y);
      obj.rotation.set(0, -teeAim(doc.course, item) * DEG, 0);
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
    const put = (key: string, sig: string, make: () => THREE.Object3D | null, group: THREE.Group = this.shapesGroup) => {
      seen.add(key);
      const entry = this.shapes.get(key);
      if (entry && entry.sig === sig) return;
      if (entry) {
        entry.obj.parent?.remove(entry.obj);
        disposeObjectDeep(entry.obj);
        this.shapes.delete(key);
      }
      const obj = make();
      if (!obj) return;
      obj.traverse(o => { o.raycast = () => {}; });
      group.add(obj);
      this.shapes.set(key, { obj, sig });
    };
    const pdga = st.markings === "pdga";
    const color = (kind: string) => (kind === "ob" ? (pdga ? "#ffffff" : st.ob) : kind === "nogo" && pdga ? RESTRICTED : kind === "hazard" ? st.hazard : kind === "water" ? st.water : kind === "fairway" ? st.fairway : kind === "woods" ? st.trees : null);
    const photo = !!doc.background.url && doc.background.opacity > 0.3;

    // Fairways (under everything else)
    for (const s of doc.stats) {
      const hole = course.holes.find(h => h.id === s.holeId);
      if (!hole || !s.complete || !hole.fairway) continue;
      const line = smoothPath(s.line, 10);
      put(`fair:${hole.id}`, JSON.stringify([line, hole.fairwayWidth, hole.fairwayShape, hv, st.fairway, photo]), () => {
        const g = new THREE.Group();
        const poly = fairwayOutline(hole, line, 0, 12);
        const mesh = new THREE.Mesh(
          drapedPolygon(poly, (x, y) => this.h(x, y), doc.gridSize, 0.12),
          new THREE.MeshLambertMaterial({ color: st.fairway, transparent: true, opacity: photo ? 0.22 : 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6 })
        );
        mesh.renderOrder = 1;
        mesh.receiveShadow = true;
        g.add(mesh);
        g.add(this.fatLine(this.drapeLine(poly, 0.2, true), st.fairway, 1.5, { opacity: photo ? 0.8 : 0.5, order: 2 }));
        return g;
      });
    }
    // Where woods have no trees: fairways, water, open areas, paths, roads, creeks, tees, baskets
    // and built things (as on the painted map)
    const clearings = (() => {
      const polys: P[][] = [], lines: { pts: P[]; half: number }[] = [], discs: { p: P; r: number }[] = [];
      for (const s of doc.stats) {
        const hole = course.holes.find(h => h.id === s.holeId);
        if (s.complete && hole) polys.push(fairwayOutline(hole, smoothPath(s.line, 8), hole.fairway ? 0 : -hole.fairwayWidth * 0.4, 6));
      }
      for (const it of course.items) {
        if (it.type === "area" && ["fairway", "green", "water", "parking", "building", "sand", "rough", "nogo"].includes(it.kind)) polys.push(it.points);
        else if (it.type === "line" && it.kind !== "ob" && it.kind !== "fence") lines.push({ pts: it.points, half: (it.width ?? LINE_KINDS[it.kind].width) / 2 + 3 });
        else if (it.type === "tee") discs.push({ p: it, r: Math.max(12, it.padLength) });
        else if (it.type === "basket") discs.push({ p: it, r: CIRCLE_ONE_FT * 0.6 });
        else if (it.type === "structure") lines.push({ pts: it.points, half: (it.width ?? 6) / 2 + 6 });
      }
      const boxes = polys.map(boundsOf);
      const test = (p: P, reach: number) => {
        for (let i = 0; i < polys.length; i++) {
          const b = boxes[i];
          if (p.x < b.minX - reach || p.x > b.maxX + reach || p.y < b.minY - reach || p.y > b.maxY + reach) continue;
          if (pointInPolygon(p, polys[i]) || (reach > 0 && distanceToPath(p, [...polys[i], polys[i][0]]) < reach)) return true;
        }
        for (const l of lines) if (l.pts.length > 1 && distanceToPath(p, l.pts) < l.half + reach) return true;
        for (const d of discs) if (Math.hypot(p.x - d.p.x, p.y - d.p.y) < d.r + reach) return true;
        return false;
      };
      // Rounded to a foot, so the woods are planted again only when a clearing really moved
      const r = (v: number) => Math.round(v);
      const key = JSON.stringify([polys.map(pp => pp.map(q => [r(q.x), r(q.y)])), lines.map(l => [l.half, l.pts.map(q => [r(q.x), r(q.y)])]), discs.map(d => [r(d.p.x), r(d.p.y), d.r])]);
      return { test, key };
    })();
    // Areas: fill plus outline
    const areas = (course.items.filter(i => i.type === "area") as AreaItem[]).sort((a, b) => polygonArea(b.points) - polygonArea(a.points));
    areas.forEach((a, order) => {
      const meta = AREA_KINDS[a.kind];
      const c = color(a.kind) ?? meta.color;
      put(`area:${a.id}`, JSON.stringify([a.points, a.kind, hv, c, photo, order, a.ob, a.kind === "water" ? this.waterShore(a.points) : 0]), () => {
        const g = new THREE.Group();
        const fill = photo ? meta.fill : Math.min(0.9, meta.fill + 0.35);
        if (a.kind === "water") {
          // Water lies level at its shore's lowest point, and where the ground (measured only every
          // few yards) rises above that, it rides just over the ground instead of sinking under it
          const level = Math.min(...a.points.map(p => this.h(p.x, p.y))) + 0.2;
          const pond = new THREE.Mesh(drapedPolygon(a.points, (x, y) => Math.max(level, this.h(x, y) + 0.2), doc.gridSize / 2, 0), waterMaterial(c, ...this.waterShore(a.points)));
          pond.renderOrder = 2;
          pond.receiveShadow = true;
          g.add(pond);
          if (a.ob === true) g.add(this.fatLine(this.drapeLine(a.points, LIFT + 0.05, true), color("ob")!, 3, { order: 5 }));
          return g;
        }
        // (A woods' floor goes under the fairways and paths through it, and under its ponds)
        const floor = a.kind === "woods";
        const mesh = new THREE.Mesh(
          drapedPolygon(a.points, (x, y) => this.h(x, y), doc.gridSize, floor ? 0.08 : 0.15 + order * 0.01),
          new THREE.MeshLambertMaterial({ color: c, transparent: true, opacity: floor ? Math.min(fill, 0.45) : fill, depthWrite: false, polygonOffset: true, polygonOffsetFactor: floor ? -1 : -4, polygonOffsetUnits: floor ? -2 : -8 })
        );
        mesh.renderOrder = floor ? 0.5 : 2 + order * 0.001;
        mesh.receiveShadow = true;
        g.add(mesh);
        const w = a.kind === "ob" || a.kind === "hazard" || a.kind === "casual" || a.kind === "nogo" ? 3 : 1.5;
        g.add(this.fatLine(this.drapeLine(a.points, LIFT, true), c, w, { order: 4, dashed: a.kind === "hazard" || a.kind === "casual" || a.kind === "nogo" ? 6 : undefined }));
        // Marked OB (water, say): its red OB edge
        if (a.ob === true && a.kind !== "ob") g.add(this.fatLine(this.drapeLine(a.points, LIFT + 0.05, true), color("ob")!, 3, { order: 5 }));
        return g;
      });
      // Woods: trees standing in it (shadows and all)
      if (a.kind === "woods") put(`woods:${a.id}`, JSON.stringify([a.points, hv, st.trees, st.landscape, clearings.key]), () => {
        const land = landscapeOf(st);
        const woods = createWoods(a.points, (x, y) => this.h(x, y), st.trees, land.conifers, land.mix, clearings.test);
        woods.traverse(o => { o.userData.itemId = a.id; });
        this.shadowsDirty = true;
        return woods;
      }, this.itemsGroup);
    });
    // Lines
    for (const l of course.items.filter(i => i.type === "line") as LineItem[]) {
      const meta = LINE_KINDS[l.kind];
      const c = l.kind === "ob" ? color("ob")! : l.kind === "path" ? st.path : l.kind === "stream" ? st.water : meta.color;
      const width = l.width ?? meta.width;
      put(`line:${l.id}`, JSON.stringify([l.points, l.kind, width, hv, c, l.ob, l.kind === "stream" ? this.waterShore(l.points) : 0]), () => {
        const g = new THREE.Group();
        // Marked OB (a creek, a road): a red edge either side
        if (l.ob === true && l.kind !== "ob" && l.points.length >= 2) {
          if (width > 0) {
            const edge = new THREE.Mesh(
              drapedRibbon(l.points, width + 5, (x, y) => this.h(x, y), Math.max(3, doc.gridSize / 2), 0.16),
              new THREE.MeshLambertMaterial({ color: color("ob")!, transparent: true, opacity: 0.95, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6 })
            );
            edge.renderOrder = 1.9;
            g.add(edge);
          } else g.add(this.fatLine(this.drapeLine(l.points), color("ob")!, 5, { order: 4.9 }));
        }
        if (width > 0 && l.points.length >= 2) {
          const ribbon = new THREE.Mesh(
            drapedRibbon(l.kind === "stream" ? smoothPath(l.points, 8) : l.points, width, (x, y) => this.h(x, y), Math.max(3, doc.gridSize / 2), 0.18),
            l.kind === "stream" ? waterMaterial(c, ...this.waterShore(l.points)) : new THREE.MeshLambertMaterial({ color: c, transparent: true, opacity: 0.9, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8 })
          );
          ribbon.renderOrder = 2;
          ribbon.receiveShadow = true;
          g.add(ribbon);
        } else {
          g.add(this.fatLine(this.drapeLine(l.points), c, l.kind === "ob" ? 3.5 : 2.5, { order: 5, dashed: l.kind === "walk" ? 5 : l.kind === "fence" ? 2 : undefined }));
        }
        return g;
      });
    }
    // Built things: bridges, boardwalks, stairs, walls, buildings, shelters and decks, as models
    // at real size on the ground (each one rebuilt only when it or the ground changes)
    for (const st of course.items.filter(i => i.type === "structure") as StructureItem[]) {
      put(`struct:${st.id}`, JSON.stringify([st.kind, st.points, st.width, st.height, st.roof, hv]), () => {
        const model = createStructure(st, (x, y) => this.h(x, y));
        model.traverse(o => { o.userData.itemId = st.id; });
        this.shadowsDirty = true;
        return model;
      }, this.itemsGroup);
    }
    // Throw lines, flight arcs and putting circles
    const tees = new Map(doc.stats.map(s => [s.holeId, s]));
    for (const hole of course.holes) {
      const s = tees.get(hole.id);
      const sel = this.selectedId === hole.id || doc.activeHoleId === hole.id;
      // Every tee's line (other tees fainter)
      for (const tee of holeTees(course, hole.id)) {
        const basket = basketFor(course, hole.id, doc.course.layouts.find(l => l.id === course.activeLayout)?.pin);
        if (!basket) continue;
        const main = s?.teeId === tee.id;
        const line = smoothPath(throwLine(hole, tee, basket), 12);
        put(`throw:${tee.id}`, JSON.stringify([line, hv, main, sel]), () => {
          const g = new THREE.Group();
          if (!st.throwLines && !sel) return g;
          g.add(this.fatLine(this.drapeLine(line, LIFT + 0.1), sel ? SELECT : main ? "#ffffff" : TEE_LEVELS[tee.level].color, sel ? 3.5 : main ? 2.5 : 1.5, { dashed: main ? undefined : 7, opacity: main ? 0.95 : 0.75, order: 6 }));
          return g;
        });
        if (main && line.length >= 2) {
          put(`arc:${hole.id}`, JSON.stringify([line, hv]), () => {
            // The disc's flight: up from the tee and down to the basket, about 15% of the length high at most
            const len = pathLength(line);
            const pts: THREE.Vector3[] = [];
            const n = 48;
            for (let i = 0; i <= n; i++) {
              const t = i / n;
              const p = pointAlong(line, t * len).point;
              const peak = Math.min(60, len * 0.12);
              const lift = 5 + Math.sin(Math.PI * Math.pow(t, 0.8)) * peak - t * 2.5;
              pts.push(new THREE.Vector3(p.x, this.h(p.x, p.y) + lift, p.y));
            }
            const g = new THREE.Group();
            g.add(this.fatLine(pts, "#fde68a", 2, { opacity: 0.85, dashed: 4, order: 7 }));
            return g;
          }, this.arcsGroup);
        }
      }
      for (const b of holeBaskets(course, hole.id)) {
        put(`circle:${b.id}`, JSON.stringify([b.x, b.y, hv, st.circle]), () => {
          const g = new THREE.Group();
          if (!st.circle) return g;
          const ring: P[] = [];
          for (let i = 0; i < 64; i++) ring.push({ x: b.x + Math.cos((i / 64) * Math.PI * 2) * CIRCLE_ONE_FT, y: b.y + Math.sin((i / 64) * Math.PI * 2) * CIRCLE_ONE_FT });
          g.add(this.fatLine(this.drapeLine(ring, 0.3, true), "#ffffff", 1.2, { opacity: 0.55, dashed: 3, order: 3 }));
          return g;
        });
      }
    }
    // Walks to the next tee
    if (st.nextTee) {
      for (const { from, to, a } of autoWalks(doc.course.items, doc.stats)) {
        put(`walk:${a.holeId}`, JSON.stringify([from, to, hv]), () => {
          const g = new THREE.Group();
          if (dist(from, to) < 40) return g;
          // Leave the putting area and arrive behind the tee
          const k0 = Math.min(0.4, CIRCLE_ONE_FT / dist(from, to)), k1 = Math.max(0.6, 1 - 15 / dist(from, to));
          const s0 = { x: from.x + (to.x - from.x) * k0, y: from.y + (to.y - from.y) * k0 };
          const s1 = { x: from.x + (to.x - from.x) * k1, y: from.y + (to.y - from.y) * k1 };
          g.add(this.fatLine(this.drapeLine([s0, s1], 0.35), "#e2e8f0", 1.6, { dashed: 2.5, opacity: 0.85, order: 4 }));
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
    if (fx) {
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
    } else if (item.type === "area") g.add(this.fatLine(this.drapeLine(item.points, LIFT + 0.2, true), color, 3.5, { opacity, order: 9 }));
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
    if (id && id !== this.selectedId) {
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
        o = { el, anchor, dy, sig, rank, minPx };
        this.overlays.set(key, o);
      }
      o.anchor = anchor;
      o.dy = dy;
    };
    const at = (p: P, lift = 0) => new THREE.Vector3(p.x, this.h(p.x, p.y) + lift, p.y);
    const mainTees = new Set(doc.stats.map(s => s.teeId));
    const mainBaskets = new Set(doc.stats.map(s => s.basketId));
    for (const item of course.items) {
      const sel = item.id === this.selectedId;
      if (item.type === "tee") {
        const t = item as TeeItem;
        const lvl = TEE_LEVELS[t.level];
        const n = this.num(t.holeId);
        const main = mainTees.has(t.id);
        put(`tee:${t.id}`, `${n}|${t.level}|${sel}|${main}`, main ? 0 : 2, () => {
          const el = document.createElement("div");
          el.className = `dg-tee${main ? "" : " alt"}${sel ? " sel" : ""}`;
          el.dataset.itemId = t.id;
          el.setAttribute("data-testid", "tee-badge");
          el.style.setProperty("--c", lvl.color);
          el.style.setProperty("--ink", lvl.ink);
          el.title = `Hole ${n} · ${lvl.label} tee: drag to move`;
          el.textContent = String(n);
          return el;
        }, at(t, 1), 0);
      } else if (item.type === "basket") {
        const b = item as BasketItem;
        const n = this.num(b.holeId);
        const multi = holeBaskets(course, b.holeId).length > 1;
        const main = mainBaskets.has(b.id);
        put(`basket:${b.id}`, `${n}|${b.position}|${multi}|${sel}|${main}|${course.style.basket}`, main ? 1 : 3, () => {
          const el = document.createElement("div");
          el.className = `dg-basket${sel ? " sel" : ""}`;
          el.dataset.itemId = b.id;
          el.setAttribute("data-testid", "basket-badge");
          el.style.setProperty("--c", course.style.basket);
          el.style.opacity = main ? "1" : "0.75";
          el.title = `Hole ${n} basket${multi ? ` (pin ${b.position})` : ""}: drag to move`;
          if (multi) {
            const tag = document.createElement("b");
            tag.textContent = b.position;
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
        put(`txt:${l.id}`, `${l.text}|${l.color}|${l.fontSize}|${sel}`, 2, () => {
          const el = document.createElement("div");
          el.className = "dg-text";
          el.dataset.itemId = l.id;
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
    // Distance chips on each throw line
    for (const s of doc.stats) {
      if (!s.complete) continue;
      // Halfway, or nearby where no mando or drop zone sits
      const marks = course.items.filter(i => i.type === "mando" || i.type === "dropzone");
      const mid = [0.5, 0.35, 0.65, 0.25, 0.75].map(f => pointAlong(s.line, s.length * f).point).find(q => marks.every(m => dist(m, q) > 28)) ?? pointAlong(s.line, s.length / 2).point;
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
    // Problems (Review step)
    (doc.issues ?? []).forEach((issue, i) => {
      if (issue.level === "info" && !issue.holes.length) return;
      put(`issue:${i}`, `${issue.text}|${issue.level}`, 0, () => {
        const el = document.createElement("div");
        el.className = "dg-issue";
        el.setAttribute("data-testid", "issue-marker");
        el.style.background = issue.level === "danger" ? "#dc2626" : issue.level === "warning" ? "#d97706" : "#2563eb";
        el.title = issue.text;
        el.textContent = issue.level === "info" ? "i" : "!";
        return el;
      }, at(issue.at, 2), -18);
    });
    for (const [key, o] of this.overlays) {
      if (!seen.has(key)) {
        o.el.remove();
        this.overlays.delete(key);
      }
    }
  }

  // ------------------------------------------------------------------ handles

  private syncHandles() {
    const doc = this.doc;
    if (!doc) return;
    const editing = this.tool.mode === "select" && !this.tool.readOnly;
    const sel = editing ? this.item(this.selectedId) : null;
    const holeId = editing ? (this.hole(this.selectedId)?.id ?? doc.activeHoleId) : null;
    const hole = this.hole(holeId);
    const drawing = this.drawn() ? this.drawPts.length : -1;
    const key = `${sel?.id ?? ""}|${sel?.locked ?? ""}|${sel && (sel.type === "area" || sel.type === "line" || sel.type === "structure") ? `${sel.points.length}${sel.type === "structure" ? sel.kind : ""}` : ""}|${hole ? `${hole.id}:${hole.doglegs.length}:${doc.stats.find(s => s.holeId === hole.id)?.complete}` : ""}|${drawing}`;
    if (key === this.handleKey) return;
    this.handleKey = key;
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
    if (sel.type === "area" || sel.type === "line" || sel.type === "structure") this.pointHandles(sel.id, add);
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
    // Fairway width: squares on the fairway's edges at points along the hole (just off the tee,
    // the landing zones, round the basket), alternately left and right: each widens or narrows
    // the fairway there, blending smoothly into the rest
    FAIRWAY_STATIONS.forEach((t, i) => {
      const flip = i % 2 ? -1 : 1;
      const side = () => {
        const s = stats();
        if (!s || s.line.length < 2) return null;
        const line = smoothPath(s.line, 10);
        const { point, angle } = pointAlong(line, pathLength(line) * t);
        return { point, n: { x: -Math.sin(angle) * flip, y: Math.cos(angle) * flip } };
      };
      const pos = () => {
        const sd = side(), h = hole();
        if (!sd || !h || !h.fairway) return null;
        const w = fairwayWidthAt(h)(t);
        return at({ x: sd.point.x + (sd.n.x * w) / 2, y: sd.point.y + (sd.n.y * w) / 2 });
      };
      // Only where it stands clear of the tee, the basket and the hole's distance label on screen
      // (a short hole seen from far, or a touch screen's bigger handles: a square on the tee
      // would take the tee's taps and its long-press menu, one on the label would hide it);
      // zoomed in on the hole, all four are there
      const clear = () => {
        const s = stats(), p = pos();
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
      add("width", pos, () => {
        const sd = side(), h0 = hole();
        if (!sd || !h0) return null;
        const y = this.h(sd.point.x, sd.point.y);
        return {
          move: ev => {
            const h = hole();
            const hit = this.planeAt(ev.clientX, ev.clientY, y);
            if (!hit || !h) return;
            const w = clamp(2 * Math.abs((hit.x - sd.point.x) * sd.n.x + (hit.z - sd.point.y) * sd.n.y), 8, 300);
            const shape = h.fairwayShape?.length === FAIRWAY_STATIONS.length ? [...h.fairwayShape] : FAIRWAY_STATIONS.map(() => 1);
            shape[i] = Math.round((w / h.fairwayWidth) * 100) / 100;
            this.cb.onHoleChange(holeId, { fairwayShape: shape });
          },
          end: () => this.cb.onCommit()
        };
      }, { index: i, title: "Drag to make the fairway wider or narrower here", data: { station: String(i) }, visible: clear });
    });
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
            this.cb.onChange(id, { points: cur.points.filter((_, k) => k !== i) });
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
        this.cb.onChange(id, { points: next });
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
  }

  /** A building's, shelter's or deck's own handles (as in the Security Camera Planner): turn it
   * about its middle (Shift: 15° steps), and, in the tilted view, its height. */
  private outlineHandles(id: string, add: (kind: string, world: () => THREE.Vector3 | null, start: Handle["start"], opts?: any) => void) {
    const it = () => this.item(id) as StructureItem | null;
    add("rotate", () => {
      const st = it();
      if (!st || st.points.length < 3) return null;
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
      const start = st0.points.map(p => ({ ...p }));
      return {
        move: ev => {
          const hit = this.planeAt(ev.clientX, ev.clientY, y);
          if (!hit) return;
          let d = Math.atan2(hit.z - c.y, hit.x - c.x) - a0;
          if (ev.shiftKey) d = Math.round(d / (15 * DEG)) * 15 * DEG;
          const cs = Math.cos(d), sn = Math.sin(d);
          this.cb.onChange(id, { points: start.map(p => ({ x: c.x + (p.x - c.x) * cs - (p.y - c.y) * sn, y: c.y + (p.x - c.x) * sn + (p.y - c.y) * cs })) });
        },
        end: () => this.cb.onCommit()
      };
    }, { title: "Drag to turn · Shift: 15° steps" });
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
    for (const o of list) {
      const s = this.project(o.anchor);
      if (!s || s.x < -60 || s.y < -60 || s.x > this.size.width + 60 || s.y > this.size.height + 60) {
        o.el.style.display = "none";
        continue;
      }
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
    for (const m of this.measureLabels) place(m.el, m.at, -12);
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
      const d = distanceToPath(p, l.points) - ((l.width ?? LINE_KINDS[l.kind].width) / 2);
      if (d < tol && (!near || d < near.d)) near = { id: l.id, d };
    }
    if (near) return near.id;
    for (const s of doc.stats) {
      if (!s.complete) continue;
      const d = distanceToPath(p, smoothPath(s.line, 8));
      if (d < tol && (!near || d < near.d)) near = { id: s.holeId, d };
    }
    if (near) return near.id;
    const areas = (doc.course.items.filter(i => i.type === "area") as AreaItem[]).filter(a => pointInPolygon(p, a.points));
    if (areas.length) return areas.sort((a, b) => polygonArea(a.points) - polygonArea(b.points))[0].id;
    // Inside a fairway: its hole
    for (const s of doc.stats) {
      const hole = this.hole(s.holeId);
      if (!hole?.fairway || !s.complete) continue;
      if (pointInPolygon(p, fairwayOutline(hole, smoothPath(s.line, 8), 0, 8))) return hole.id;
    }
    return null;
  }

  // ------------------------------------------------------------------ pointer input

  private endDragListeners: (() => void) | null = null;

  /** Press that becomes a click (no movement) or a drag. */
  private gesture(e: PointerEvent, h: { click?: (ev: PointerEvent) => void; drag?: (start: PointerEvent) => Drag | null }) {
    const sx = e.clientX;
    const sy = e.clientY;
    const id = e.pointerId;
    const slop = e.pointerType === "touch" ? TOUCH_SLOP : CLICK_PX;
    let drag: Drag | null = null;
    let moved = false;
    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== id) return;
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
      if (drag) {
        drag.end(ev);
        this.setDragging(false);
      } else if (!moved) h.click?.(ev);
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
    this.endDragListeners = cleanup;
  }

  private setDragging(on: boolean) {
    if (this.dragging === on) return;
    this.dragging = on;
    if (!on) {
      this.handleKey = "";
      this.syncHandles();
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

  private touchUp(e: PointerEvent) {
    this.touchIds.delete(e.pointerId);
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
    const x0 = e.clientX, y0 = e.clientY, id = e.pointerId;
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
      if (drag) {
        drag.end(ev);
        this.setDragging(false);
      } else if (!moved && ev.type === "pointerup") {
        const owner = this.selectedId ?? this.doc?.activeHoleId ?? null;
        if (owner && owner !== this.selectedId) this.cb.onSelect(owner);
      }
      this.invalidate();
    };
    const cleanup = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  }

  /** Holding a finger still on an item opens its menu, like a right-click. */
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
      if (!itemId) return;
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
      if (this.touchIds.size > 1) {
        this.secondFinger();
        return;
      }
      // (Not on a handle that moves something: holding one still before dragging it slowly is no
      // menu; a line's middle dot is fine, it is where a finger lands to hold a hole)
      const handle = (target.closest?.("[data-handle]") as HTMLElement | null)?.dataset.handle;
      if (!this.povHole && !this.tool.readOnly && this.tool.mode === "select" && e.button === 0 && (!handle || handle === "mid")) this.startLongPress(e, target);
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
        if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < 5) {
          const domItem = (target.closest?.("[data-item-id]") as HTMLElement | null)?.dataset.itemId ?? null;
          const g = this.groundAt(ev.clientX, ev.clientY);
          this.cb.onContextMenu({ clientX: ev.clientX, clientY: ev.clientY, itemId: domItem ?? this.pick(ev.clientX, ev.clientY), ground: g ? { x: g.x, y: g.z } : null });
        }
      };
      window.addEventListener("pointerup", up, true);
      return;
    }
    const handleEl = target.closest?.("[data-handle]") as HTMLElement | null;
    if (handleEl && e.button === 0) {
      e.stopPropagation();
      e.preventDefault();
      const h = this.handles.find(x => x.el === handleEl);
      if (!h) return;
      if (e.pointerType === "touch" && h.kind !== "draw") {
        this.fingerOnHandle(e, h);
        return;
      }
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
    if (e.button === 1 || (this.spaceDown && e.button === 0)) {
      e.stopPropagation();
      this.gesture(e, { drag: s => this.panDrag(s) });
      return;
    }
    if (e.button !== 0) return;
    const modifierRotate = e.ctrlKey || e.metaKey || e.altKey || (e.shiftKey && this.tool.mode !== "measure");
    const domItem = (target.closest?.("[data-item-id]") as HTMLElement | null)?.dataset.itemId ?? null;
    if (modifierRotate && !domItem && !(this.tool.mode === "select" && this.pick(e.clientX, e.clientY))) {
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
    if (tool.readOnly) {
      const hit = domItem ?? this.pick(e.clientX, e.clientY);
      stop();
      this.gesture(e, { click: () => this.cb.onSelect(hit), drag: panOrNothing });
      return;
    }
    if (tool.mode === "measure") {
      stop();
      this.gesture(e, { click: ev => { const g = this.groundAt(ev.clientX, ev.clientY); if (g) this.addMeasurePoint(g, ev.shiftKey); }, drag: panOrNothing });
      return;
    }
    if (tool.mode === "add-hole") {
      stop();
      this.gesture(e, {
        click: groundClick(p => {
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
    // Select mode
    const hit = domItem ?? this.pick(e.clientX, e.clientY);
    if (!hit) {
      stop();
      this.gesture(e, { click: () => this.cb.onSelect(null), drag: panOrNothing });
      return;
    }
    const item = this.item(hit);
    // Holes, areas and lines move only once selected (dragging across the map still pans);
    // a hole itself never moves (move its tee or basket); a locked item never moves
    const big = !item || item.type === "area" || item.type === "line" || item.type === "structure";
    if ((big && hit !== this.selectedId) || !item || item.locked) {
      stop();
      this.gesture(e, { click: () => this.cb.onSelect(hit), drag: panOrNothing });
      return;
    }
    e.stopPropagation();
    if (hit !== this.selectedId) this.cb.onSelect(hit);
    this.gesture(e, { drag: s => this.itemDrag(s, hit) });
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
  private shapeDrag(start: PointerEvent, shape: "box" | "circle" | "freehand"): { move: (ev: PointerEvent) => void; end: (ev: PointerEvent) => void } | null {
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
    const kind = this.drawn();
    const pts = this.drawPts;
    if (kind && pts.length >= (kind === "area" ? 3 : 2)) {
      this.drawPts = [];
      this.clearDraft();
      this.cb.onDrawProgress(0);
      this.cb.onDrawn(this.tool.mode === "draw-structure" ? "structure" : kind, pts);
      this.handleKey = "";
      this.syncHandles();
      return true;
    }
    return false;
  }

  /** Takes back the last point drawn (Backspace). */
  undoPoint() {
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
    } else if (this.drawPts.length) {
      const pts = [...this.drawPts];
      if (this.cursor) pts.push(this.cursor);
      const area = this.drawn() === "area";
      const color = this.tool.mode === "draw-structure" ? STRUCTURE_KINDS[this.tool.structureKind ?? "bridge"].color : area ? AREA_KINDS[this.tool.areaKind].color : LINE_KINDS[this.tool.lineKind].color;
      if (area && pts.length >= 3) {
        const mesh = new THREE.Mesh(drapedPolygon(pts, (x, y) => this.h(x, y), doc.gridSize, 0.3), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.25, depthWrite: false, depthTest: false }));
        mesh.renderOrder = 19;
        g.add(mesh);
      }
      g.add(this.fatLine(this.drapeLine(area && pts.length >= 3 ? [...pts, pts[0]] : pts, LIFT + 0.2), color === "#ffffff" ? "#fde68a" : color, 3, { depthTest: false, order: 20 }));
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
      this.draftLabel.className = "dg-measure total";
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

  private addMeasurePoint(p: THREE.Vector3, keepGoing: boolean) {
    if (this.measurePts.length >= 2 && !keepGoing) this.measurePts = [];
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
    if (pts.length >= 2) {
      this.measureLine = this.fatLine(this.drapeLine(pts.map(v => ({ x: v.x, y: v.z })), LIFT + 0.3), "#facc15", 3, { depthTest: false, order: 30 });
      this.fx.add(this.measureLine);
      let total = 0;
      for (let i = 1; i < pts.length; i++) {
        const d = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
        total += d;
        const dh = pts[i].y - pts[i - 1].y;
        const el = document.createElement("div");
        el.className = "dg-measure";
        el.setAttribute("data-testid", "measure-label");
        el.textContent = `${fmtDist(d, units)}${Math.abs(dh) >= 1 ? ` · ${fmtElev(dh, units)}` : ""}`;
        this.labelsLayer.appendChild(el);
        this.measureLabels.push({ el, at: pts[i - 1].clone().lerp(pts[i], 0.5) });
      }
      if (pts.length > 2) {
        const el = document.createElement("div");
        el.className = "dg-measure total";
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
  private zoomAt(clientX: number, clientY: number, factor: number) {
    const pos = this.controls.getPosition(new THREE.Vector3(), true);
    const target = this.controls.getTarget(new THREE.Vector3(), true);
    const d = pos.distanceTo(target);
    const f = clamp(d * factor, this.controls.minDistance, this.controls.maxDistance) / d;
    if (Math.abs(f - 1) < 1e-4) return;
    const p = this.groundAt(clientX, clientY) ?? target.clone();
    const np = p.clone().add(pos.sub(p).multiplyScalar(f));
    const nt = p.clone().add(target.sub(p).multiplyScalar(f));
    void this.controls.setLookAt(np.x, np.y, np.z, nt.x, nt.y, nt.z, true);
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
      if (this.tool.mode === "measure") {
        if (this.measurePts.length === 1 && g) {
          this.measureCursor = g;
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
      if (this.holeStart || this.drawPts.length) {
        if (g) {
          this.cursor = { x: g.x, y: g.z };
          this.drawDraft();
        }
        return;
      }
      const target = document.elementFromPoint(p.x, p.y) as HTMLElement | null;
      if (this.tool.mode === "select" || this.tool.readOnly) {
        const dom = (target?.closest?.("[data-item-id]") as HTMLElement | null)?.dataset.itemId ?? null;
        this.setHover(dom ?? (target?.closest?.("[data-handle]") ? null : this.pick(p.x, p.y)));
      } else {
        this.setHover(null);
        this.updateGhost(g);
      }
    });
  }

  private updateCursor() {
    const t = this.tool;
    let c = "grab";
    if (this.povHole) c = "move";
    else if (t.readOnly) c = this.hoverId ? "pointer" : "grab";
    else if (t.mode !== "select") c = "crosshair";
    else if (this.hoverId) {
      const it = this.item(this.hoverId);
      c = !it || ((it.type === "area" || it.type === "line" || it.type === "structure") && this.hoverId !== this.selectedId) ? "pointer" : "move";
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
      const obj = kind === "basket" ? createBasket(this.doc.course.style.basket)
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
