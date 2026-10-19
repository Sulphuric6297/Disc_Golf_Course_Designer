// The course document. Plan units are feet; plan (x, y) is east and south from the site's
// north-west corner (north is up), and maps to 3D world (x, z) with Y up.

export type P = { x: number; y: number };

/** Tee colors, longest to shortest (the PDGA's Gold / Blue / White / Red skill levels, plus Green). */
export type TeeLevel = "gold" | "blue" | "white" | "red" | "green";
export type TeeSurface = "concrete" | "turf" | "rubber" | "pavers" | "gravel" | "natural";
export type PinPosition = "A" | "B" | "C" | "D";

export interface BaseItem {
  id: string;
  x: number;
  y: number;
  /** Degrees, clockwise on screen from east (+x). */
  rotation: number;
  /** Locked in place: it can be picked, but not moved, reshaped or deleted. */
  locked?: boolean;
}

/** A tee pad (one hole can have several, one per tee color). */
export interface TeeItem extends BaseItem {
  type: "tee";
  holeId: string;
  level: TeeLevel;
  /** Pad size in feet (width across the throw, length along it). */
  padWidth: number;
  padLength: number;
  surface: TeeSurface;
  /** Turned by hand; otherwise the pad faces down its hole. */
  aimFixed?: boolean;
}

/** A basket (target). A hole can have several pin positions (A, B, C...). */
export interface BasketItem extends BaseItem {
  type: "basket";
  holeId: string;
  position: PinPosition;
  /** Raised on a platform or slope above the ground, ft (an elevated basket). */
  raised?: number;
}

/** A mandatory: the disc must pass on this side of it (an arrow sign on a post or a tree). */
export interface MandoItem extends BaseItem {
  type: "mando";
  holeId?: string;
  /** The side the disc must pass: as seen looking along the arrow (rotation = direction of play). */
  side: "left" | "right";
  /** A one-way gate for a double mando: its partner. */
  pairId?: string;
}

/** Where a player throws from after missing a mando or going OB. */
export interface DropZoneItem extends BaseItem {
  type: "dropzone";
  holeId?: string;
}

export type TreeKind = "deciduous" | "conifer" | "palm" | "bush";
export interface TreeItem extends BaseItem {
  type: "tree";
  /** Crown radius, ft. */
  radius: number;
  height?: number;
  width?: number;
  treeType?: TreeKind;
  color: string;
  /** Found on the imported aerial photo (replaced on re-import). */
  importSource?: "photo";
}

export type AmenityKind = "bench" | "trash" | "sign" | "kiosk" | "restroom" | "parking" | "water" | "practice" | "shelter" | "bridge";
export interface AmenityItem extends BaseItem {
  type: "amenity";
  kind: AmenityKind;
  label?: string;
}

export interface LabelItem extends BaseItem {
  type: "label";
  text: string;
  fontSize: number;
  color: string;
}

/** Areas drawn on the map. OB and hazards are what play cares about; the rest make the map read. */
export type AreaKind = "ob" | "hazard" | "water" | "fairway" | "green" | "woods" | "rough" | "nogo" | "parking" | "building" | "sand";
export interface AreaItem extends BaseItem {
  type: "area";
  kind: AreaKind;
  /** Outline in plan coordinates (x, y of the item is its middle). */
  points: P[];
  /** For one hole only (unset: the whole course). */
  holeId?: string;
  label?: string;
  /** Brought in from OpenStreetMap (replaced on re-import). */
  importSource?: "osm";
}

/** Lines drawn on the map: OB lines (the line itself is OB), paths, roads, fences, streams. */
export type LineKind = "ob" | "path" | "road" | "fence" | "stream" | "walk";
export interface LineItem extends BaseItem {
  type: "line";
  kind: LineKind;
  points: P[];
  /** Drawn width in feet (paths, roads and streams). */
  width?: number;
  holeId?: string;
  label?: string;
  /** Brought in from OpenStreetMap (replaced on re-import). */
  importSource?: "osm";
}

export type CourseItem = TeeItem | BasketItem | MandoItem | DropZoneItem | TreeItem | AmenityItem | LabelItem | AreaItem | LineItem;
export type ItemType = CourseItem["type"];

/** A hole. Its tees and baskets are items that point back to it; the order in `holes` is the
 * order of play. */
export interface Hole {
  id: string;
  /** Shown name, e.g. "The Gauntlet" (optional). */
  name?: string;
  /** Par set by hand; unset: worked out from the hole's length, elevation and shape. */
  par?: number;
  /** Turning points of the throw line between the tee and the basket (plan coordinates). */
  doglegs: P[];
  /** Fairway width, ft (drawn along the throw line). */
  fairwayWidth: number;
  /** Draw the fairway along the throw line (off: only a drawn fairway area, or none). */
  fairway: boolean;
  /** Heavy foliage makes a hole play longer (PDGA par guidelines). Unset: worked out from the trees. */
  foliage?: "light" | "heavy";
  /** Notes for the tee sign and the hole sheet (hole rules: OB, mandos, drop zones). */
  notes?: string;
}

/** A layout picks which tee and pin each hole uses (e.g. "Blue", long tees to B pins). */
export interface Layout {
  id: string;
  name: string;
  tee: TeeLevel;
  pin: PinPosition;
}

export type MapTheme = "forest" | "illustrated" | "satellite" | "topo" | "minimal" | "night";

/** A basket's mark on the printed map: side view, side view in a round badge, a pin flag, target
 * rings, or the hole number in a circle. */
export type BasketMark = "basket" | "badge" | "flag" | "target" | "number";
export type PaperSize = "letter" | "tabloid" | "18x24" | "24x36" | "a4" | "a3";

export interface MapStyle {
  theme: MapTheme;
  /** Title block. */
  title: string;
  subtitle: string;
  footer: string;
  /** Colors. */
  fairway: string;
  rough: string;
  ob: string;
  hazard: string;
  water: string;
  path: string;
  trees: string;
  basket: string;
  /** How baskets are drawn on printed maps and tee signs. */
  basketMark: BasketMark;
  /** Satellite photo strength under the drawing (0..1). */
  photo: number;
  /** Contour lines and hill shading. */
  contours: boolean;
  hillshade: boolean;
  /** Throw lines, distance labels and walking arrows to the next tee. */
  throwLines: boolean;
  distances: boolean;
  nextTee: boolean;
  /** Putting circle (10 m) around each basket. */
  circle: boolean;
  legend: boolean;
  holeTable: boolean;
  north: boolean;
  scale: boolean;
  /** Lettering: "Script" sets the title in a brush script (the rest in Oswald). */
  font: "Inter" | "Oswald" | "Bitter" | "Script";
  /** Forest style: where to paint woods (everywhere off the fairways, where the photo shows trees,
   * or only drawn woods and single trees). */
  forest: "everywhere" | "photo" | "woods";
  /** Forest style: how thick the woods are, from a few scattered clumps (0.1) to solid canopy (1). */
  treeCover: number;
  /** Turn of the map on the page, degrees (0: north up). */
  rotation: number;
  /** How big labels are (1 = normal). */
  labelScale: number;
  paper: PaperSize;
  orientation: "auto" | "portrait" | "landscape";
}

export type Units = "ft" | "m";

export interface SiteInfo {
  /** The searched place (the middle of the imported area). */
  location: { lat: number; lon: number; label: string } | null;
  /** Real-world edges of the plan. */
  bounds: { north: number; south: number; west: number; east: number } | null;
  /** Real elevation (ft above sea level) of terrain height 0. */
  baseElevationFt: number;
  imagerySource?: string;
  elevationSource?: string;
}

export interface CourseDoc {
  version: 1;
  /** Stable name for the course library. */
  id?: string;
  name: string;
  designer: string;
  site: SiteInfo;
  /** Plan size, ft. */
  canvas: { width: number; height: number };
  /** Terrain grid spacing, ft; heights are keyed "x,y" at grid points. */
  gridSize: number;
  terrainHeights: Record<string, number>;
  /** Painted ground (lib/groundPaint): a material per painted square foot, keyed "i,j". */
  groundPaint: Record<string, number>;
  /** The aerial photo covering the plan (a data URL), or none. */
  background: string | null;
  holes: Hole[];
  items: CourseItem[];
  layouts: Layout[];
  activeLayout: string;
  style: MapStyle;
  units: Units;
  rules: CourseRules;
}

/** Settings for the checks and the par estimate. */
export interface CourseRules {
  /** Clear distance wanted between one hole's throw line and other holes, roads and paths, ft.
   * Unset: the larger of 50 ft and 15% of the hole's length (the PDGA gives no number). */
  safetyGapFt?: number;
  /** Feet of length one foot of climb adds (PDGA par guidelines: 3). */
  elevationFactor: number;
  /** Price list for the parts list (US dollars). */
  prices: { basket: number; teePad: number; sign: number; bench: number; trash: number; kiosk: number; sleeve: number };
}

export type ToolMode =
  | "select"
  | "add-hole"
  | "add-tee"
  | "add-basket"
  | "add-mando"
  | "add-dropzone"
  | "add-tree"
  | "add-amenity"
  | "add-label"
  | "draw-area"
  | "draw-line"
  | "measure";
