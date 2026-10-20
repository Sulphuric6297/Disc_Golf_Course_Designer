// Making course documents and items, and finding a hole's parts.
import { DEFAULT_CANVAS, DEFAULT_FAIRWAY_FT, DEFAULT_PAD, PIN_POSITIONS, STRUCTURE_KINDS, TEE_ORDER, TREE_COLORS, generateId } from "../constants";
import type {
  AmenityItem, AmenityKind, AreaItem, AreaKind, BasketItem, CourseDoc, CourseItem, CourseRules, DropZoneItem, Hole, LabelItem,
  Layout, LineItem, LineKind, MandoItem, MapStyle, P, PinPosition, StructureItem, StructureKind, TeeItem, TeeLevel, TreeItem
} from "../types";
import { centroid, corridor } from "./geom";

export const defaultStyle = (): MapStyle => ({
  theme: "forest",
  title: "",
  subtitle: "",
  footer: "",
  fairway: "#6f9255",
  rough: "#4d6a3c",
  ob: "#ff4b4b",
  hazard: "#ffd23f",
  water: "#23677f",
  path: "#6e5b38",
  trees: "#354a2c",
  basket: "#ffffff",
  basketMark: "basket",
  markings: "map",
  photo: 1,
  contours: false,
  hillshade: true,
  throwLines: false,
  distances: false,
  nextTee: true,
  circle: false,
  legend: false,
  holeTable: false,
  north: true,
  scale: true,
  font: "Script",
  forest: "photo",
  treeCover: 1,
  sunAngle: 315,
  sunHeight: 38,
  shadows: 0.65,
  light: 0,
  contrast: 0,
  colorStrength: 1,
  paint: 0.8,
  rotation: 0,
  labelScale: 1,
  paper: "tabloid",
  orientation: "auto"
});

export const defaultLayouts = (): Layout[] => [
  { id: "layout-main", name: "Main", tee: "blue", pin: "A" }
];

/** Prices are rough 2026 US figures for budgeting, meant to be edited. */
export const defaultRules = (): CourseRules => ({
  elevationFactor: 3,
  prices: { basket: 450, teePad: 350, sign: 120, bench: 300, trash: 150, kiosk: 1200, sleeve: 40 }
});

export const createEmptyCourse = (): CourseDoc => ({
  version: 1,
  id: generateId(),
  name: "New Disc Golf Course",
  designer: "",
  site: { location: null, bounds: null, baseElevationFt: 0 },
  canvas: { ...DEFAULT_CANVAS },
  gridSize: 20,
  terrainHeights: {},
  groundPaint: {},
  background: null,
  holes: [],
  items: [],
  layouts: defaultLayouts(),
  activeLayout: "layout-main",
  style: defaultStyle(),
  units: "ft",
  rules: defaultRules()
});

/** Fills in anything an older or hand-edited file is missing. */
export const normalizeCourse = (raw: Partial<CourseDoc>): CourseDoc => {
  const base = createEmptyCourse();
  const doc: CourseDoc = {
    ...base,
    ...raw,
    site: { ...base.site, ...(raw.site ?? {}) },
    canvas: raw.canvas && raw.canvas.width > 0 && raw.canvas.height > 0 ? raw.canvas : base.canvas,
    // (Courses saved before there was a choice of basket marks keep the mark their style had)
    style: { ...base.style, ...(raw.style && !raw.style.basketMark ? { basketMark: raw.style.theme === "forest" || !raw.style.theme ? "basket" : "target" } : {}), ...(raw.style ?? {}) },
    rules: { ...base.rules, ...(raw.rules ?? {}), prices: { ...base.rules.prices, ...(raw.rules?.prices ?? {}) } },
    holes: (raw.holes ?? []).map(h => {
      const shape = Array.isArray(h.fairwayShape) && h.fairwayShape.length === FAIRWAY_STATIONS.length && h.fairwayShape.every(v => typeof v === "number" && v > 0) ? h.fairwayShape : undefined;
      return { ...h, fairwayWidth: h.fairwayWidth ?? DEFAULT_FAIRWAY_FT, fairway: h.fairway ?? true, doglegs: h.doglegs ?? [], fairwayShape: shape };
    }),
    // (A structure needs its points and a kind this version knows)
    items: Array.isArray(raw.items) ? raw.items.filter(i => i.type !== "structure" || (Array.isArray(i.points) && i.kind in STRUCTURE_KINDS)) : [],
    layouts: raw.layouts?.length ? raw.layouts : base.layouts,
    terrainHeights: raw.terrainHeights ?? {},
    groundPaint: raw.groundPaint ?? {},
    version: 1
  };
  if (!doc.layouts.some(l => l.id === doc.activeLayout)) doc.activeLayout = doc.layouts[0].id;
  return doc;
};

/** Where along a hole its fairway can be made wider or narrower (0 = the tee, 1 = the basket):
 * just off the tee, the two landing zones, and round the basket. */
export const FAIRWAY_STATIONS = [0.15, 0.4, 0.65, 0.88];

/** A hole's fairway width at a point along it (the share of the way from tee to basket), ft:
 * its shape's widths at the stations, blended smoothly in between. */
export const fairwayWidthAt = (hole: Pick<Hole, "fairwayWidth" | "fairwayShape">) => (t: number) => {
  const f = hole.fairwayShape, S = FAIRWAY_STATIONS;
  if (!f || f.length !== S.length) return hole.fairwayWidth;
  if (t <= S[0]) return hole.fairwayWidth * f[0];
  if (t >= S[S.length - 1]) return hole.fairwayWidth * f[f.length - 1];
  let i = 0;
  while (t > S[i + 1]) i++;
  const u = (t - S[i]) / (S[i + 1] - S[i]), e = u * u * (3 - 2 * u);
  return hole.fairwayWidth * (f[i] + (f[i + 1] - f[i]) * e);
};

/** A hole's fairway outline along its (smoothed) line, `extra` ft wider all along. */
export const fairwayOutline = (hole: Pick<Hole, "fairwayWidth" | "fairwayShape">, line: P[], extra = 0, roundSteps = 12) => {
  const w = fairwayWidthAt(hole);
  return corridor(line, t => w(t) + extra, roundSteps);
};

export const newHole = (over: Partial<Hole> = {}): Hole => ({ id: `hole-${generateId()}`, doglegs: [], fairwayWidth: DEFAULT_FAIRWAY_FT, fairway: true, ...over });

export const createTee = (holeId: string, at: P, level: TeeLevel = "blue"): TeeItem => ({
  id: generateId(), type: "tee", holeId, level, x: at.x, y: at.y, rotation: 0,
  padWidth: DEFAULT_PAD.width, padLength: DEFAULT_PAD.length, surface: "concrete"
});

export const createBasket = (holeId: string, at: P, position: PinPosition = "A"): BasketItem => ({
  id: generateId(), type: "basket", holeId, position, x: at.x, y: at.y, rotation: 0
});

export const createMando = (at: P, holeId?: string, rotation = 0): MandoItem => ({ id: generateId(), type: "mando", holeId, side: "right", x: at.x, y: at.y, rotation });
export const createDropZone = (at: P, holeId?: string): DropZoneItem => ({ id: generateId(), type: "dropzone", holeId, x: at.x, y: at.y, rotation: 0 });
export const createTree = (at: P, over: Partial<TreeItem> = {}): TreeItem => ({
  id: generateId(), type: "tree", x: at.x, y: at.y, rotation: 0, radius: 14, height: 40, treeType: "deciduous", color: TREE_COLORS[0], ...over
});
export const createAmenity = (at: P, kind: AmenityKind): AmenityItem => ({ id: generateId(), type: "amenity", kind, x: at.x, y: at.y, rotation: 0 });
export const createLabel = (at: P, text = "Label"): LabelItem => ({ id: generateId(), type: "label", text, fontSize: 14, color: "#ffffff", x: at.x, y: at.y, rotation: 0 });
export const createArea = (kind: AreaKind, points: P[], holeId?: string): AreaItem => {
  const c = centroid(points);
  return { id: generateId(), type: "area", kind, points, holeId, x: c.x, y: c.y, rotation: 0 };
};
export const createLine = (kind: LineKind, points: P[], holeId?: string): LineItem => {
  const c = points.length ? { x: points.reduce((s, p) => s + p.x, 0) / points.length, y: points.reduce((s, p) => s + p.y, 0) / points.length } : { x: 0, y: 0 };
  return { id: generateId(), type: "line", kind, points, holeId, x: c.x, y: c.y, rotation: 0 };
};
/** A bridge, boardwalk, stairs or wall along `points`, or a building, shelter or deck with that outline. */
export const createStructure = (kind: StructureKind, points: P[], holeId?: string): StructureItem => {
  const c = STRUCTURE_KINDS[kind].shape === "outline" ? centroid(points) : points.length ? { x: points.reduce((s, p) => s + p.x, 0) / points.length, y: points.reduce((s, p) => s + p.y, 0) / points.length } : { x: 0, y: 0 };
  return { id: generateId(), type: "structure", kind, points, holeId, x: c.x, y: c.y, rotation: 0 };
};

// --- Finding a hole's parts ---

export const holeTees = (doc: Pick<CourseDoc, "items">, holeId: string) =>
  (doc.items.filter(i => i.type === "tee" && i.holeId === holeId) as TeeItem[]).sort((a, b) => TEE_ORDER.indexOf(a.level) - TEE_ORDER.indexOf(b.level));

export const holeBaskets = (doc: Pick<CourseDoc, "items">, holeId: string) =>
  (doc.items.filter(i => i.type === "basket" && i.holeId === holeId) as BasketItem[]).sort((a, b) => PIN_POSITIONS.indexOf(a.position) - PIN_POSITIONS.indexOf(b.position));

/** The tee a layout plays: its color, else the nearest color to it, else the first. */
export const teeFor = (doc: Pick<CourseDoc, "items">, holeId: string, level?: TeeLevel): TeeItem | null => {
  const tees = holeTees(doc, holeId);
  if (!tees.length) return null;
  if (!level) return tees[0];
  const want = TEE_ORDER.indexOf(level);
  return [...tees].sort((a, b) => Math.abs(TEE_ORDER.indexOf(a.level) - want) - Math.abs(TEE_ORDER.indexOf(b.level) - want) || TEE_ORDER.indexOf(a.level) - TEE_ORDER.indexOf(b.level))[0];
};

export const basketFor = (doc: Pick<CourseDoc, "items">, holeId: string, pin?: PinPosition): BasketItem | null => {
  const baskets = holeBaskets(doc, holeId);
  return baskets.find(b => b.position === pin) ?? baskets[0] ?? null;
};

export const activeLayout = (doc: Pick<CourseDoc, "layouts" | "activeLayout">) => doc.layouts.find(l => l.id === doc.activeLayout) ?? doc.layouts[0];

/** The throw line of a hole: tee, its doglegs, basket. */
export const throwLine = (hole: Hole, tee: P | null, basket: P | null): P[] => {
  const pts: P[] = [];
  if (tee) pts.push({ x: tee.x, y: tee.y });
  pts.push(...hole.doglegs.map(p => ({ ...p })));
  if (basket) pts.push({ x: basket.x, y: basket.y });
  return pts;
};

/** The main throw line (the layout's tee and pin). */
export const holeLine = (doc: Pick<CourseDoc, "items" | "layouts" | "activeLayout">, hole: Hole, layout = activeLayout(doc)) =>
  throwLine(hole, teeFor(doc, hole.id, layout?.tee), basketFor(doc, hole.id, layout?.pin));

/** Which hole an item belongs to (tees, baskets, mandos and drop zones; areas and lines can too). */
export const itemHoleId = (item: CourseItem | null | undefined): string | undefined =>
  item && "holeId" in item ? item.holeId : undefined;

/** Hole numbers: their place in the order of play. */
export const holeNumber = (doc: Pick<CourseDoc, "holes">, holeId: string) => doc.holes.findIndex(h => h.id === holeId) + 1;

/** The direction (degrees, 0 = +x) a tee pad faces: toward the first point of its throw line. */
export const teeAim = (doc: Pick<CourseDoc, "items" | "holes">, tee: TeeItem) => {
  if (tee.aimFixed) return tee.rotation;
  const hole = doc.holes.find(h => h.id === tee.holeId);
  if (!hole) return tee.rotation;
  const next = hole.doglegs[0] ?? basketFor(doc, hole.id);
  if (!next) return tee.rotation;
  return (Math.atan2(next.y - tee.y, next.x - tee.x) * 180) / Math.PI;
};

export const ITEM_LABELS: Record<CourseItem["type"], string> = {
  tee: "Tee",
  basket: "Basket",
  mando: "Mando",
  dropzone: "Drop zone",
  tree: "Tree",
  amenity: "Amenity",
  label: "Label",
  area: "Area",
  line: "Line",
  structure: "Structure"
};
