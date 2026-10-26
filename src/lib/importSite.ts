// Bringing in a real site: the satellite photo, the ground's elevation, the trees measured from the
// air, the trees on the photo and what OpenStreetMap knows (paths, roads, water, parking,
// buildings, benches and the rest, a disc golf course mapped there). Every download starts at once
// and each is put together as it lands; one that fails leaves the rest (no photo: the street map
// or plain ground; no elevation: flat ground), and each says how it went (`onProgress`) and hands
// over what it brought as it lands (`onLayer`). Stop (`signal`) stops them all. What came is kept
// for the session (lib/geo/cache), so the same spot comes in again at once. Each thing brought in
// keeps what it was like when it came (`importSig`), so one changed by hand is never replaced. What
// went wrong is kept with the site, for the Site step to say. Everything comes from free services
// with no keys, as in the Security Camera Planner.
import { STRUCTURE_KINDS, LINE_KINDS, clamp, generateId } from "../constants";
import type { AmenityItem, AreaItem, CourseDoc, CourseItem, Hole, LidarTree, LineItem, P, ParkDetail, RoofKind, SiteInfo, StructureItem, TreeItem } from "../types";
import { FEET_PER_METER, getGeoBounds, isAbort, throwIfAborted, untilAborted, type GeoBounds, type SiteSelection } from "./geo/core";
import { boundsKey, cached } from "./geo/cache";
import { treeStands } from "./geo/detect";
import { fetchBestElevationGrid, usgsGroundLabel } from "./geo/elevation";
import { fetchLidar } from "./geo/lidarFetch";
import { groundOnGrid, standingTrees, surveyYear } from "./lidar";
import { canopyStands, type CanopyStand } from "./canopy";
import { fetchMapImagery, type MapImagerySource } from "./geo/imagery";
import { natureFromPhoto } from "./geo/photoNature";
import { mappedCourse, parkWords, type LatLon, type MappedCourse, type OsmBuilding, type OsmFeature } from "./geo/osm";
import { fetchOsm } from "./geo/osmFetch";
import { tracedBuildings, withMeasuredHeights, type TracedBuilding } from "./geo/buildings";
import { createAmenity, createArea, createBasket, createLine, createStructure, createTee, createTree, newHole } from "./course";
import { createField, fieldWord } from "./fields";
import { fieldOf } from "./geo/parkKinds";
import { centroid, clipPathToRect, clipPolygonToRect, pointInPolygon, polygonArea, simplify } from "./geom";
import { reframe, toPlanXY, type GeoRef } from "./geoRef";
import { roofOf } from "./structures";
import { treeFree } from "./treeFree";

export type ImportedSite = {
  canvas: { width: number; height: number };
  gridSize: number;
  terrainHeights: Record<string, number>;
  background: string | null;
  site: SiteInfo;
  trees: TreeItem[];
  mapped: CourseItem[];
  notes: string[];
  /** OpenStreetMap was asked for and couldn't be reached (the import offers to try again). */
  osmFailed?: boolean;
  /** The trees measured from the air (where a LiDAR survey covers the site). */
  lidar?: CourseDoc["lidar"];
  /** How many of the measured trees stand (none on a road or a building). */
  standing?: number;
  /** A disc golf course mapped on OpenStreetMap there: its holes, tees and baskets on the plan
   * (brought in only when asked for; `holes` can be empty when only its outline is mapped). */
  course?: { name?: string; holes: Hole[]; items: CourseItem[] };
  /** How each source went, as at the end. */
  sources: ImportProgress["sources"];
};

/** The sources a site comes from, each with its own progress. */
export type SourceId = "photo" | "elevation" | "lidar" | "osm" | "buildings" | "photoTrees";
/** Not started, under way, in, not to be had at this spot (no survey covers it, say), or failed. */
export type SourceState = "waiting" | "coming" | "done" | "not-here" | "failed";
export type SourceStatus = {
  state: SourceState;
  /** How far along (0..1), where it's known or can be judged. */
  fraction?: number;
  /** How many things it brought (trees, shapes, buildings; unset for the photo and the ground). */
  count?: number;
  /** Where it came from ("Esri satellite", "USGS 3DEP (high detail)", "USGS LiDAR 2022",
   * "Overpass" or "OpenFreeMap map tiles"), and its year where known. */
  source?: string;
  year?: number;
  /** How long it took, ms (from the import's start). */
  ms?: number;
  /** Kept from an earlier download of the same spot. */
  cached?: boolean;
  /** OpenStreetMap: a server was busy and the others are still being asked. */
  busy?: boolean;
  /** Photo trees: left out, as trees measured from the air cover the site (only its water is looked for). */
  skipped?: "measured";
  /** OpenStreetMap: the park's things it found, by what they are ({ "ball fields": 4, "playground": 1 }),
   * and the same in a line ("4 ball fields, 2 tennis courts, 1 playground"). */
  parts?: Record<string, number>;
  detail?: string;
  /** What went wrong, for the console and the Site step (not shown as is). */
  error?: string;
};
export type ImportProgress = {
  /** Only the sources asked for. */
  sources: Partial<Record<SourceId, SourceStatus>>;
  /** All of it together (0..1). */
  fraction: number;
  /** What it's doing, in a line. */
  text: string;
};
/** What a source brought, handed over the moment it lands so the map can fill in layer by layer
 * (the import's result is what's kept: OpenStreetMap's and the photo's things are sorted out
 * against each other there). */
export type ImportLayer =
  | { source: "frame"; canvas: { width: number; height: number }; gridSize: number; bounds: GeoBounds }
  | { source: "photo"; background: string; label: string }
  | { source: "elevation"; terrainHeights: Record<string, number>; baseElevationFt: number; label: string }
  | { source: "lidar"; trees: LidarTree[]; terrainHeights: Record<string, number>; baseElevationFt: number; label: string }
  | { source: "osm"; items: CourseItem[] }
  | { source: "buildings"; items: CourseItem[] }
  | { source: "photoTrees"; trees: TreeItem[]; areas: AreaItem[] };

export type ImportOptions = {
  imagery: MapImagerySource | "none";
  trees: boolean;
  osm: boolean;
  /** Trees and ground measured from the air (LiDAR), where a survey covers the site. */
  lidar?: boolean;
  /** How each source is going, and all of it together. */
  onProgress?: (p: ImportProgress) => void;
  /** What each source brought, as it lands. */
  onLayer?: (layer: ImportLayer) => void;
  /** Stops it: every download, at once (the import then rejects with an AbortError). */
  signal?: AbortSignal;
  /** (older callers) What it is doing, and how far along all of it is (`fraction`). */
  onStatus?: (text: string, progress?: { step: number; of: number; fraction?: number }) => void;
};

/** Terrain grid spacing for a site this wide: about 160 cells across, 4 to 20 ft. */
export const gridFor = (widthFt: number) => clamp(Math.round(widthFt / 160), 4, 20);

/** Turns an elevation sample grid (meters, row 0 north) into terrain heights at the plan's grid points (ft above the lowest point). */
export const heightsFromSamples = (values: Float32Array, samplesX: number, samplesY: number, min: number, width: number, height: number, grid: number) => {
  const heights: Record<string, number> = {};
  const at = (sx: number, sy: number) => values[clamp(sy, 0, samplesY - 1) * samplesX + clamp(sx, 0, samplesX - 1)];
  for (let x = 0; x <= width + 1e-6; x += grid) {
    for (let y = 0; y <= height + 1e-6; y += grid) {
      const fx = (x / width) * (samplesX - 1), fy = (y / height) * (samplesY - 1);
      const ix = Math.floor(fx), iy = Math.floor(fy);
      const tx = fx - ix, ty = fy - iy;
      const v = (at(ix, iy) * (1 - tx) + at(ix + 1, iy) * tx) * (1 - ty) + (at(ix, iy + 1) * (1 - tx) + at(ix + 1, iy + 1) * tx) * ty;
      const ft = (v - min) * FEET_PER_METER;
      if (Math.abs(ft) > 0.001) heights[`${Math.round(x)},${Math.round(y)}`] = Math.round(ft * 100) / 100;
    }
  }
  return heights;
};

/** A traced outline (photo pixels) as a shape on the plan: simplified, its corners rounded once. */
const outlineToPlan = (outline: { x: number; y: number }[], w: number, h: number, width: number, height: number, tolerance: number): P[] => {
  const pts = simplify(outline.map(p => ({ x: (p.x / w) * width, y: (p.y / h) * height })), tolerance);
  const out: P[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    out.push({ x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25 }, { x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75 });
  }
  return out.map(p => ({ x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 }));
};

/** What the photo shows: stands of trees (as woods areas), the trees standing on their own (as
 * trees) and open water (as water areas), found in a worker (geo/photoNature.ts). */
export { natureFromPhoto };

/** What a thing brought in is like (all of it but its id and this), as a short code: kept with it
 * when it comes in, so one changed since (a road made OB, a building renamed) can be told apart. */
export const signOf = (i: CourseItem) => {
  const { id: _id, importSig: _sig, ...rest } = i;
  // (keys in order, unset ones left out: the same thing gives the same code however it was built)
  const text = JSON.stringify(rest, (_k, v) => (v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map(k => [k, v[k]])) : v));
  let h = 0x811c9dc5;
  for (let k = 0; k < text.length; k++) h = Math.imul(h ^ text.charCodeAt(k), 0x01000193);
  return (h >>> 0).toString(36);
};
/** A thing as it comes in: what it's like kept with it. */
export const signed = <T extends CourseItem>(i: T): T => ({ ...i, importSig: signOf(i) });
/** Whether a thing brought in is as it came (one from before these codes counts as it came). */
export const asItCame = (i: CourseItem) => !i.importSig || i.importSig === signOf(i);

/** Whether a thing came from the maps (OpenStreetMap, or a building traced from the air) and is
 * as it came: the ones a new lookup replaces. */
export const fromMaps = (i: CourseItem) =>
  (((i.type === "area" || i.type === "line" || i.type === "structure") && (i.importSource === "osm" || i.importSource === "traced")) || ((i.type === "amenity" || i.type === "tree") && i.importSource === "osm")) && asItCame(i);

/** Whether a thing was brought in by an import (found on the photo, from OpenStreetMap, made from
 * the measured trees) and is as it came: changed since, it's yours, and stays. */
export const isImported = (i: CourseItem) => (i.type === "tree" || i.type === "area" || i.type === "line" || i.type === "structure" || i.type === "amenity") && !!i.importSource && asItCame(i);

/** What came in, less what's here already as it was changed by hand (the same thing brought in
 * again would stand beside it). */
export const freshOnly = (kept: CourseItem[], incoming: CourseItem[]) => {
  const had = new Set(kept.filter(i => i.importSig && !asItCame(i)).map(i => i.importSig));
  return had.size ? incoming.filter(i => !i.importSig || !had.has(i.importSig)) : incoming;
};

const OSM_NAMES: Record<string, [string, string]> = {
  path: ["path", "paths"], road: ["road", "roads"], stream: ["stream", "streams"], water: ["water area", "water areas"],
  woods: ["wooded area", "wooded areas"], rough: ["grass area", "grass areas"],
  parking: ["parking lot", "parking lots"], building: ["building", "buildings"], shelter: ["shelter", "shelters"],
  hedge: ["hedge", "hedges"], power: ["power line", "power lines"], tree: ["tree", "trees"],
  bench: ["bench", "benches"], picnic: ["picnic table", "picnic tables"], restroom: ["restroom", "restrooms"], drinking: ["drinking fountain", "drinking fountains"],
  trash: ["trash can", "trash cans"], sign: ["parking sign", "parking signs"], practice: ["practice basket", "practice baskets"],
  grill: ["grill", "grills"], fitness: ["fitness station", "fitness stations"], flagpole: ["flagpole", "flagpoles"], fountain: ["fountain", "fountains"],
  gate: ["gate", "gates"], bikerack: ["bike rack", "bike racks"], light: ["light pole", "light poles"], pole: ["utility pole", "utility poles"]
};
/** The most of one amenity kind brought in (street lamps and utility poles can be hundreds). */
const AMENITY_CAP = 400;
/** (an amenity's name in the summary, where it isn't its own kind's) */
const AMENITY_SAID: Record<string, string> = { water: "drinking", parking: "sign" };

/** Feet to the nearest half foot. */
const halfFt = (ft: number) => Math.round(ft * 2) / 2;

/**
 * A building's (or a shelter's) walls, ft, from what's known of it: a height to the top of the
 * roof less the roof (its own height where mapped, else the roof this outline gets: a flat roof is
 * none), else its floors' height; unset where nothing is known. Kept within the kind's heights.
 */
export const wallsFt = (b: OsmBuilding | undefined, kind: "building" | "shelter", points: P[], roof?: RoofKind) => {
  if (!b) return undefined;
  const [lo, hi] = STRUCTURE_KINDS[kind].heights;
  if (b.topM) {
    const top = b.topM * FEET_PER_METER;
    const shape = roof ?? STRUCTURE_KINDS[kind].roof ?? "gable";
    const rise = b.roofM ? b.roofM * FEET_PER_METER : shape === "flat" ? 0 : roofOf(points, shape).rise;
    // (never less than half the height: a roof taller than its walls is a guess gone wrong)
    return halfFt(clamp(Math.max(top - rise, top * 0.5), lo, hi));
  }
  if (b.heightM) return halfFt(clamp(b.heightM * FEET_PER_METER, Math.max(8, lo), hi));
  return undefined;
};

/** Trees spaced along a line (a row of trees, or a hedge's bushes), only those on the plan. */
const treesAlong = (pts: P[], spacing: number, inside: (p: P) => boolean, make: (p: P) => TreeItem) => {
  const out: TreeItem[] = [];
  let carry = spacing / 2;
  for (let k = 0; k + 1 < pts.length; k++) {
    const a = pts[k], b = pts[k + 1], len = Math.hypot(b.x - a.x, b.y - a.y);
    for (let d = carry; d <= len; d += spacing) {
      const p = { x: a.x + ((b.x - a.x) * d) / len, y: a.y + ((b.y - a.y) * d) / len };
      if (inside(p)) out.push(make(p));
    }
    carry = ((carry - len) % spacing + spacing) % spacing;
  }
  return out;
};

/** How many of each kind came in (for the summary). */
type OsmCounts = Record<string, number>;

/**
 * What OpenStreetMap has on the site as course items: lines and areas cut to the site's edges (a
 * road runs on for miles, a river's outline can be bigger than the whole park), buildings and
 * shelters to edit like ones drawn, fields, amenities, hedges and power lines, and trees (single
 * ones and rows); with how many of each came.
 */
export const osmFeatureItems = (features: OsmFeature[], ref: GeoBounds & { width: number; height: number }) => {
  const { width, height } = ref;
  // (a little past the edges, so lines run cleanly off the map)
  const edge = { x0: -20, y0: -20, x1: width + 20, y1: height + 20 };
  const onPlan = (p: P) => p.x >= 0 && p.y >= 0 && p.x <= width && p.y <= height;
  const items: CourseItem[] = [];
  const counts: OsmCounts = {};
  const count = (k: string, n = 1) => { counts[k] = (counts[k] ?? 0) + n; };
  /** The park's things, by what they are ("ball field": 4), for the summary and the progress. */
  const parks: ParkCounts = {};
  const countWords = (one: string, many: string, n = 1) => { (parks[one] ??= { one, many, n: 0 }).n += n; };
  const countPark = (p: ParkDetail) => countWords(...parkWords(p));
  const plan = (ll: LatLon) => toPlanXY(ref, ll.lat, ll.lon);
  const osmTreeItem = (at: P, t: { heightM?: number; crownM?: number; conifer?: boolean } | undefined, fallback: { radius: number; height: number }) => {
    const radius = t?.crownM ? clamp((t.crownM / 2) * FEET_PER_METER, 4, 40) : fallback.radius;
    return { ...createTree(at, { radius: Math.round(radius * 2) / 2, height: Math.round(t?.heightM ? clamp(t.heightM * FEET_PER_METER, 8, 150) : fallback.height), treeType: t?.conifer ? "conifer" : "deciduous" }), importSource: "osm" as const } as TreeItem;
  };
  for (const f of features) {
    if (f.kind === "dgCourse" || f.kind === "dgHole" || f.kind === "dgTee" || f.kind === "dgBasket") continue;
    if (f.geom === "point") {
      const at = plan(f.points[0]);
      if (!onPlan(at)) continue;
      if (f.kind === "amenity") {
        const said = AMENITY_SAID[f.amenity] ?? f.amenity;
        if ((counts[said] ?? 0) >= AMENITY_CAP) continue;
        const a = { ...createAmenity(at, f.amenity), importSource: "osm" as const } as AmenityItem;
        if (f.name) a.label = f.name;
        items.push(a);
        count(said);
      } else if (f.kind === "tree") {
        items.push(osmTreeItem(at, f.tree, { radius: 12, height: 35 }));
        count("tree");
      } else if (f.kind === "shelter") {
        // A shelter mapped as a spot: a small one built there (20 ft square; a bus or lean-to shelter less)
        const [hw, hh] = f.small ? [6, 3.5] : [10, 10];
        const s = createStructure("shelter", [{ x: at.x - hw, y: at.y - hh }, { x: at.x + hw, y: at.y - hh }, { x: at.x + hw, y: at.y + hh }, { x: at.x - hw, y: at.y + hh }]);
        if (f.name) s.label = f.name;
        items.push({ ...s, importSource: "osm" });
        count("shelter");
      } else if (f.kind === "park") {
        // (nothing of the app's to draw it as yet: counted, and kept with the map data)
        countPark(f.park);
      }
      continue;
    }
    const pts0 = f.points.map(plan);
    if (f.geom === "area") {
      const pts = simplify(clipPolygonToRect(pts0, edge), 1);
      if (pts.length < 3 || Math.abs(polygonArea(pts)) < 4) continue;
      if (f.kind === "building" || f.kind === "shelter") {
        // A building to edit like one drawn: walls, a roof, a height
        const b = createStructure(f.kind, pts);
        if (f.building?.roof) b.roof = f.building.roof;
        const walls = wallsFt(f.building, f.kind, pts, b.roof);
        if (walls) b.height = walls;
        if (f.name) b.label = f.name;
        if (f.park) b.park = f.park;
        items.push({ ...b, importSource: "osm" });
        count(f.kind);
        if (f.park && f.park.what !== "shed") countPark(f.park);
        continue;
      }
      if (f.kind === "field") {
        // A field, court or play area as the app's own (its kind from its tags and the outline it
        // keeps: a ball field's home plate is a corner of it)
        const fld = fieldOf(f.tags ?? {}, pts);
        if (!fld) continue;
        const a = createField(fld.field, pts);
        if (fld.home !== undefined) a.home = fld.home;
        if (f.name) a.label = f.name;
        if (f.park) a.park = f.park;
        items.push({ ...a, importSource: "osm" });
        // ("4 tennis courts": a court area's courts, each counted)
        const word = fieldWord(fld.field);
        countWords(word, `${word}s`, Math.max(1, fld.courts ?? 1));
        continue;
      }
      const area = createArea(f.kind, pts) as AreaItem;
      if (f.name) area.label = f.name;
      if (f.park) area.park = f.park;
      items.push({ ...area, importSource: "osm" });
      // (a ball field's infield said as one, not as the area it's drawn as)
      if (f.park) countPark(f.park);
      else count(f.kind);
    } else if (f.kind === "treeRow") {
      const made = treesAlong(pts0, 22, onPlan, p => osmTreeItem(p, f.tree, { radius: 11, height: 35 }));
      items.push(...made);
      if (made.length) count("tree", made.length);
    } else {
      let pieces = 0;
      for (const piece of clipPathToRect(pts0, edge)) {
        const pts = simplify(piece, 1);
        if (pts.length < 2) continue;
        const line = createLine(f.kind, pts) as LineItem;
        if (f.name && f.kind !== "path") line.label = f.name;
        if ((f.kind === "path" || f.kind === "road") && f.surface) line.surface = f.surface;
        if ((f.kind === "path" || f.kind === "road") && f.widthM) line.width = halfFt(clamp(f.widthM * FEET_PER_METER, 2, LINE_KINDS[f.kind].maxWidth));
        if (f.kind === "fence" && f.park) line.park = f.park;
        // (a power line's or a hedge's height, and a hedge's width, where tagged)
        if ((f.kind === "power" || f.kind === "hedge") && f.line?.height) line.fenceHeight = f.line.height;
        if (f.kind === "hedge" && f.line?.width) line.width = f.line.width;
        items.push({ ...line, importSource: "osm" });
        pieces++;
      }
      // (each piece on the site, as the Site step counts them; fences come in, but aren't said)
      if (pieces && f.kind !== "fence") count(f.kind, pieces);
      if (pieces && f.kind === "fence" && f.park) countPark(f.park);
    }
  }
  return { items, counts, parks };
};

/** A park's things by what they are, in words. */
type ParkCounts = Record<string, { one: string; many: string; n: number }>;
/** "4 ball fields, 2 tennis courts, 1 playground", most first. */
export const parkSummary = (parks: ParkCounts) =>
  Object.values(parks).sort((a, b) => b.n - a.n).map(p => `${p.n.toLocaleString()} ${p.n === 1 ? p.one : p.many}`).join(", ");

/** "2 paths, 1 road, 1 water area" (then the park's things, and the buildings traced from the
 * air), in OSM_NAMES' order. */
const osmSummary = (counts: OsmCounts, traced: number, parks: ParkCounts = {}) =>
  [
    ...Object.entries(OSM_NAMES).map(([k, [one, many]]) => {
      const n = counts[k] ?? 0;
      return n ? `${n.toLocaleString()} ${n === 1 ? one : many}` : "";
    }),
    parkSummary(parks),
    traced ? `${traced} more ${traced === 1 ? "building" : "buildings"} traced from the air` : ""
  ]
    .filter(Boolean)
    .join(", ");

/** A disc golf course mapped on OpenStreetMap, as holes on the plan: each hole's tee, basket and
 * bends, numbered and with a par where mapped; only holes whose tee and basket are on the site. */
export const courseFromMap = (course: MappedCourse, ref: GeoBounds & { width: number; height: number }) => {
  const plan = (ll: LatLon) => toPlanXY(ref, ll.lat, ll.lon);
  const on = (p: P) => p.x >= 0 && p.y >= 0 && p.x <= ref.width && p.y <= ref.height;
  const holes: Hole[] = [];
  const items: CourseItem[] = [];
  const taken = new Set<number>();
  for (const m of course.holes) {
    const tee = plan(m.tee), basket = plan(m.basket);
    if (!on(tee) || !on(basket)) continue;
    // (a number used twice: the second plays as the next free one)
    const number = m.number && !taken.has(m.number) ? m.number : undefined;
    if (number) taken.add(number);
    const hole = newHole({ doglegs: m.doglegs.map(plan), ...(number ? { number } : {}), ...(m.par ? { par: m.par } : {}) });
    holes.push(hole);
    items.push(createTee(hole.id, tee), createBasket(hole.id, basket));
  }
  return { name: course.name, holes, items };
};

/**
 * What OpenStreetMap has on the site, as course items, with a summary ("2 paths, 1 road, 1 water
 * area") and a disc golf course mapped there; and the buildings traced from the air for the ones
 * nobody's mapped. Throws when OpenStreetMap couldn't be reached. `fresh`: an answer kept from the
 * map tiles is asked for again (from Overpass, with more).
 */
export const osmItems = async (bounds: GeoBounds, width: number, height: number, opts: { signal?: AbortSignal; fresh?: boolean } = {}) => {
  const traced = cached("buildings", "traced", () => tracedBuildings(bounds), { signal: opts.signal, within: bounds }).value.catch(err => {
    if (isAbort(err)) throw err;
    console.warn("Traced buildings lookup failed", err);
    return [] as TracedBuilding[];
  });
  const answer = await fetchOsm(bounds, { signal: opts.signal, fresh: opts.fresh, headStartMs: 15000 }).value;
  const ref = { ...bounds, width, height };
  const { items, counts, parks } = osmFeatureItems(answer.features, ref);
  const more = tracedItems(await traced, items, ref);
  const mc = mappedCourse(answer.features);
  return { items: [...items, ...more].map(signed), summary: osmSummary(counts, more.length, parks), course: mc ? courseFromMap(mc, ref) : undefined };
};

/** The smallest building traced from the air that's kept, sq ft (a shed: about 3 m by 3 m). */
const TRACED_MIN_SQFT = 100;
/** How sure the tracing must be, where it says (0-1). */
const TRACED_SURE = 0.7;

/**
 * The buildings traced from the air worth adding, as buildings to edit like one drawn: only ones
 * the map doesn't have (none overlapping a building it has, nor sitting on parking or water), big
 * enough to be a building, whole on the site, and at least `TRACED_SURE` sure where the tracing
 * says how sure it is. Their heights are to the top of the roof.
 */
export const tracedItems = (traced: TracedBuilding[], mapped: CourseItem[], ref: GeoBounds & { width: number; height: number }) => {
  const taken = mapped.filter((m): m is CourseItem & { points: P[] } => (m.type === "structure" && (m.kind === "building" || m.kind === "shelter")) || (m.type === "area" && (m.kind === "parking" || m.kind === "water")));
  const overlaps = (a: P[], b: P[]) => a.some(p => pointInPolygon(p, b)) || b.some(p => pointInPolygon(p, a)) || pointInPolygon(centroid(a), b);
  const out: (CourseItem & { points: P[] })[] = [];
  for (const t of traced) {
    if (t.confidence !== null && t.confidence < TRACED_SURE) continue;
    const pts = simplify(t.points.map(p => toPlanXY(ref, p.lat, p.lon)), 0.5);
    if (pts.length < 3 || Math.abs(polygonArea(pts)) < TRACED_MIN_SQFT) continue;
    if (pts.some(p => p.x < 0 || p.y < 0 || p.x > ref.width || p.y > ref.height)) continue;
    if (taken.some(m => overlaps(pts, m.points)) || out.some(m => overlaps(pts, m.points))) continue;
    const b: StructureItem = createStructure("building", pts);
    const walls = wallsFt(t.heightM ? { topM: t.heightM } : undefined, "building", pts);
    if (walls) b.height = walls;
    out.push({ ...b, importSource: "traced" });
  }
  return out as CourseItem[];
};

/**
 * The measured trees' last step, on the import and on the Site step's Measure trees and ground:
 * their stands of woods (trees close together, each stand its own woods, the ones made before
 * replaced), and what they stand in for taken out: the trees and woods found on the photo, the
 * trees mapped one by one or in rows on OpenStreetMap, and OpenStreetMap's woods (drawn by
 * hand and often over a whole hillside) once there are stands. Woods the survey saw few trees in
 * (missed, or grown since) get drawn trees between the measured ones (the "Filled in" choice, set
 * as if by hand). Only what came in as it came is changed.
 */
/** What the woods from the measured canopy keep off: built things, water, parking, out-of-play
 * areas and fields, and roads (as wide as they're drawn). */
export const canopyKeepOut = (items: CourseItem[]) => ({
  areas: items.filter((i): i is AreaItem | StructureItem => i.type === "structure" || (i.type === "area" && ["water", "parking", "nogo", "field"].includes(i.kind))).map(i => i.points),
  lines: items.filter((i): i is LineItem => i.type === "line" && i.kind === "road").map(i => ({ points: i.points, width: i.width ?? LINE_KINDS.road.width }))
});

export const withMeasuredTrees = (items: CourseItem[], trees: LidarTree[], width: number, height: number, canopy?: CanopyStand[]) => {
  const made: AreaItem[] = [];
  // (the woods from the measured canopy where it's given: outlines on the plan already)
  if (canopy) {
    for (const s of canopy) if (s.outline.length >= 3) made.push({ ...createArea("woods", s.outline), importSource: "lidar" as const } as AreaItem);
  } else if (trees.length) {
    const { w: gw, h: gh, cell, stands } = treeStands(trees.map(t => ({ x: t[0], y: t[1], r: t[3] })), width, height);
    for (const s of stands) {
      const a = { ...createArea("woods", outlineToPlan(s.outline, gw, gh, gw * cell, gh * cell, 5)), importSource: "lidar" as const } as AreaItem;
      if (a.points.length >= 3) made.push(a);
    }
  }
  const thin = (a: AreaItem): AreaItem => {
    if (a.kind !== "woods" || a.trees) return a;
    const area = Math.abs(polygonArea(a.points));
    const n = trees.filter(t => pointInPolygon({ x: t[0], y: t[1] }, a.points)).length;
    return area > 2000 && n < area / 3000 ? { ...a, trees: "custom", patches: [{ points: a.points.map(p => ({ ...p })), fill: 0.6 }] } : a;
  };
  const kept = items
    .filter(i => {
      if (!isImported(i)) return true;
      if (i.type === "area" && i.importSource === "lidar") return false;
      if (trees.length && ((i.type === "tree" && (i.importSource === "photo" || (i.importSource === "osm" && i.treeType !== "bush"))) || (i.type === "area" && i.kind === "woods" && i.importSource === "photo"))) return false;
      return !(made.length && i.type === "area" && i.kind === "woods" && i.importSource === "osm");
    })
    .map(i => {
      if (i.type !== "area" || !isImported(i)) return i;
      const t = thin(i);
      return t === i ? i : signed(t);
    });
  const stands = made.map(a => signed(thin(a)));
  // (where the photo's woods were: before its water)
  const at = kept.findIndex(i => i.type === "area" && i.kind === "water" && i.importSource === "photo");
  return { items: at < 0 ? [...kept, ...stands] : [...kept.slice(0, at), ...stands, ...kept.slice(at)], stands: stands.length };
};

/**
 * The design carried over to a new site frame (bigger, smaller or moved): every hole, tee, basket,
 * shape and label stays on the same spot on the ground. `outside` counts the things that are now
 * past the new frame's edges (kept, to move in or remove).
 */
export const reframeDesign = (design: { holes: Hole[]; items: CourseItem[] }, from: GeoRef, to: GeoRef) => {
  const f = reframe(from, to);
  const items = design.items.map(i => {
    const at = f({ x: i.x, y: i.y });
    const moved = { ...i, x: at.x, y: at.y } as CourseItem;
    if (moved.type === "area" || moved.type === "line" || moved.type === "structure") moved.points = moved.points.map(f);
    // (one as it came still is: only the frame moved under it)
    return i.importSig && asItCame(i) ? signed(moved) : moved;
  });
  const holes = design.holes.map(h => ({ ...h, doglegs: h.doglegs.map(f) }));
  const outside = items.filter(i => i.x < 0 || i.y < 0 || i.x > to.width || i.y > to.height).length;
  return { holes, items, outside };
};

/** Said when OpenStreetMap couldn't be reached. */
export const OSM_UNREACHABLE = "Couldn't reach OpenStreetMap, so paths, roads, water and buildings weren't brought in.";
/** Said when OpenStreetMap has nothing on the site. */
export const OSM_NOTHING = "OpenStreetMap has nothing mapped here.";
/** What OpenStreetMap is asked for, while it's asked. */
export const OSM_ASKING = "Looking up paths, roads, water and buildings on OpenStreetMap…";
/** Said while an Overpass server has failed and the others are still asked. */
export const OSM_BUSY = "OpenStreetMap is busy: asking another server…";

// ---------------------------------------------------------------- progress

/** How much of the whole each source is (LiDAR's the longest), and how long one that can't say
 * how far along it is usually takes, ms (its bar eases toward the end meanwhile). */
const WEIGHT: Record<SourceId, number> = { photo: 2, elevation: 1, lidar: 4, osm: 2, buildings: 1, photoTrees: 2 };
const USUAL_MS: Partial<Record<SourceId, number>> = { elevation: 2500, osm: 8000, buildings: 4000 };

/** Each source's state, said to `onProgress` (and `onStatus`) as it changes, and twice a second
 * while anything is coming (for the bars that ease along). Quiet once closed. */
class Progress {
  readonly sources: Partial<Record<SourceId, SourceStatus>> = {};
  private since: Partial<Record<SourceId, number>> = {};
  private t0 = performance.now();
  private closed = false;
  private timer: ReturnType<typeof setInterval>;
  /** The photo trees' own step, while they're looked for. */
  step = "";
  constructor(private opts: ImportOptions, ids: SourceId[], private photoName: string) {
    for (const id of ids) this.sources[id] = { state: "waiting" };
    this.timer = setInterval(() => this.emit(), 500);
  }
  set(id: SourceId, s: Partial<SourceStatus>) {
    const was = this.sources[id];
    if (!was || this.closed) return;
    if (s.state === "coming" && was.state !== "coming") this.since[id] = performance.now();
    const next = { ...was, ...s };
    if (s.state && s.state !== "coming" && s.state !== "waiting") {
      next.ms = Math.round(performance.now() - this.t0);
      next.fraction = 1;
      delete next.busy;
    }
    this.sources[id] = next;
    this.emit();
  }
  private fractionOf(id: SourceId, s: SourceStatus) {
    if (s.state === "waiting") return 0;
    if (s.state !== "coming") return 1;
    if (s.fraction !== undefined) return s.fraction;
    const usual = USUAL_MS[id] ?? 5000;
    return 0.9 * (1 - Math.exp(-(performance.now() - (this.since[id] ?? this.t0)) / usual));
  }
  get fraction() {
    let all = 0, got = 0;
    for (const [id, s] of Object.entries(this.sources) as [SourceId, SourceStatus][]) {
      all += WEIGHT[id];
      got += WEIGHT[id] * this.fractionOf(id, s);
    }
    return all ? Math.min(1, got / all) : 1;
  }
  get text() {
    const coming = (Object.entries(this.sources) as [SourceId, SourceStatus][]).filter(([, s]) => s.state === "coming").map(([id]) => id);
    if (coming.includes("photoTrees")) return this.step || "Finding woods, trees and water on the photo…";
    const osm = this.sources.osm;
    if (coming.length === 1) {
      const id = coming[0];
      if (id === "photo") return `Downloading the ${this.photoName}…`;
      if (id === "elevation") return "Downloading elevation…";
      if (id === "lidar") return "Measuring trees and ground from the air (LiDAR)…";
      if (id === "osm") return osm?.busy ? OSM_BUSY : OSM_ASKING;
      if (id === "buildings") return "Looking up buildings traced from the air…";
    }
    if (!coming.length) return Object.values(this.sources).some(s => s.state === "waiting") ? "Finding woods, trees and water on the photo…" : "Putting it together…";
    const names: Record<SourceId, string> = { photo: this.photoName, elevation: "elevation", lidar: "measured trees", osm: "OpenStreetMap", buildings: "traced buildings", photoTrees: "" };
    const list = coming.map(id => names[id]);
    return `Bringing in the ${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}…`;
  }
  emit() {
    if (this.closed) return;
    const fraction = this.fraction, text = this.text;
    const sources = Object.fromEntries(Object.entries(this.sources).map(([k, v]) => [k, { ...v }])) as ImportProgress["sources"];
    this.opts.onProgress?.({ sources, fraction, text });
    if (this.opts.onStatus) {
      const all = Object.values(this.sources);
      const done = all.filter(s => s.state !== "waiting" && s.state !== "coming").length;
      this.opts.onStatus(text, { step: Math.min(all.length, done + 1), of: all.length, fraction });
    }
  }
  close() {
    this.emit();
    this.closed = true;
    clearInterval(this.timer);
  }
}

/** A year in a source's name ("USGS LiDAR 2022"), where it has one. */
const yearIn = (label?: string) => {
  const y = label ? surveyYear(label) : 0;
  return y > 1900 ? y : undefined;
};

// ---------------------------------------------------------------- the import

export const importSite = async (selection: SiteSelection, opts: ImportOptions): Promise<ImportedSite> => {
  const signal = opts.signal;
  throwIfAborted(signal);
  const location = selection.center;
  const grid = gridFor(selection.widthFt);
  // The plan is the selected area at 1 unit = 1 ft, a whole number of grid cells, so the photo,
  // the terrain and everything drawn line up exactly
  const width = Math.max(1, Math.round(selection.widthFt / grid)) * grid;
  const height = Math.max(1, Math.round(selection.heightFt / grid)) * grid;
  const bounds = getGeoBounds(location, width, height);
  const ref = { ...bounds, width, height };
  const here = `${boundsKey(bounds)}|${width}x${height}`;
  const notes: string[] = [];
  const satellite = opts.imagery === "satellite";
  const wantsPhotoTrees = opts.trees && satellite;
  const ids: SourceId[] = [
    ...(opts.imagery !== "none" ? ["photo" as const] : []),
    "elevation",
    ...(opts.lidar ? ["lidar" as const] : []),
    ...(opts.osm ? ["osm" as const, "buildings" as const] : []),
    ...(wantsPhotoTrees ? ["photoTrees" as const] : [])
  ];
  const progress = new Progress(opts, ids, satellite ? "satellite photo" : "map");
  const layer = (l: ImportLayer) => { if (!signal?.aborted) opts.onLayer?.(l); };
  layer({ source: "frame", canvas: { width, height }, gridSize: grid, bounds });
  // (a source that failed: said, and the rest goes on; one stopped stops it all)
  const soft = async <T>(id: SourceId, run: () => Promise<T>): Promise<T | null> => {
    try {
      return await run();
    } catch (err) {
      if (isAbort(err) || signal?.aborted) throw err;
      console.warn(`Import: ${id} failed`, err);
      progress.set(id, { state: "failed", error: err instanceof Error ? err.message : String(err) });
      return null;
    }
  };

  try {
    // The photo (the street map in its place when it can't be had)
    const photoJob = opts.imagery === "none" ? Promise.resolve(null) : soft("photo", async () => {
      progress.set("photo", { state: "coming", fraction: 0 });
      // (its near-infrared band too, a second download: leaves and water are told apart by it, and a
      // shadow or a blue roof isn't taken for a pond)
      const get = (source: MapImagerySource) => { const nir = source === "satellite"; return cached("photo", `${source}|${nir ? "nir" : ""}|${here}`, report => fetchMapImagery(location, width, height, source, report, { signal, nir }), { signal, onProgress: f => progress.set("photo", { fraction: f * 0.95 }) }); };
      let got = get(opts.imagery as MapImagerySource);
      const map = await untilAborted(got.value, signal).catch(async err => {
        if (isAbort(err) || !satellite) throw err;
        console.warn("Satellite photo failed: the street map instead", err);
        got = get("streets");
        const streets = await untilAborted(got.value, signal);
        notes.push("Couldn't download the satellite photo, so the street map is under the course.");
        return streets;
      });
      progress.set("photo", { state: "done", source: map.sourceLabel, year: map.year ?? map.photo?.year, cached: got.hit });
      layer({ source: "photo", background: map.url, label: map.sourceLabel });
      return map;
    });

    // The ground (flat when no elevation can be had)
    const spacing = Math.max(grid / 2, Math.max(width, height) / 600);
    const samplesX = clamp(Math.round(width / spacing) + 1, 2, 800);
    const samplesY = clamp(Math.round(height / spacing) + 1, 2, 800);
    // (how fine 3DEP's ground is here, "USGS 3DEP 1 m ground": asked at the same time)
    const groundLabel = cached("groundLabel", boundsKey(bounds), () => usgsGroundLabel(bounds)).value.catch(() => null);
    const elevationJob = soft("elevation", async () => {
      progress.set("elevation", { state: "coming" });
      const got = cached("elevation", `${here}|${samplesX}x${samplesY}`, () => fetchBestElevationGrid(location, width, height, samplesX, samplesY), { signal });
      const elev = await untilAborted(got.value, signal);
      const heights = heightsFromSamples(elev.values, samplesX, samplesY, elev.min, width, height, grid);
      const label = elev.source.startsWith("USGS") ? await Promise.race([groundLabel, new Promise<null>(r => setTimeout(() => r(null), 2000))]) : null;
      progress.set("elevation", { state: "done", source: label ?? elev.source, year: (elev as { year?: number }).year, cached: got.hit });
      layer({ source: "elevation", terrainHeights: heights, baseElevationFt: elev.min * FEET_PER_METER, label: elev.source });
      return { heights, elev };
    });

    // Trees and ground measured from the air, where a survey covers it
    const lidarJob = !opts.lidar ? Promise.resolve(null) : soft("lidar", async () => {
      progress.set("lidar", { state: "coming", fraction: 0 });
      // (the survey's ground checked against 3DEP's, when that's what the elevation is: awaited only
      // once the points are in, so both still download at once)
      const dem = elevationJob.then(e => (e && e.elev.source.startsWith("USGS") ? { values: e.elev.values, samplesX, samplesY } : null)).catch(() => null);
      const got = cached("lidar", here, report => fetchLidar(ref, report, { dem, signal }), { signal, onProgress: f => progress.set("lidar", { fraction: f }) });
      const lidar = await untilAborted(got.value, signal);
      if (!lidar) { progress.set("lidar", { state: "not-here", cached: got.hit }); return null; }
      const g = groundOnGrid(lidar.measured, width, height, grid);
      progress.set("lidar", { state: "done", count: lidar.trees.length, source: lidar.label ?? lidar.source, year: lidar.surveys?.[0]?.year ?? yearIn(lidar.source), cached: got.hit });
      layer({ source: "lidar", trees: lidar.trees, terrainHeights: g.heights, baseElevationFt: g.min, label: lidar.source });
      return { lidar, ground: g };
    });

    // The buildings traced from the air (sorted out against OpenStreetMap's once both are in)
    const tracedJob = !opts.osm ? Promise.resolve(null) : soft("buildings", async () => {
      progress.set("buildings", { state: "coming" });
      const got = cached("buildings", "traced", () => tracedBuildings(bounds), { signal, within: bounds });
      const list = await untilAborted(got.value, signal);
      return { list, hit: got.hit };
    });

    // The photo's woods, trees and water, once the photo's in: left out where trees measured from
    // the air cover the site (only its water is looked for then)
    const natureJob = !wantsPhotoTrees ? Promise.resolve(null) : (async () => {
      const [map, measured] = await Promise.all([photoJob, lidarJob]);
      if (!map || !satellite || /OpenStreetMap/.test(map.sourceLabel)) { progress.set("photoTrees", { state: "not-here" }); return null; }
      const waterOnly = !!measured?.lidar.trees.length;
      return soft("photoTrees", async () => {
        progress.set("photoTrees", { state: "coming", fraction: 0 });
        const got = cached("nature", `${map.sourceLabel}|${here}|${waterOnly ? "water" : "all"}`, report => natureFromPhoto(map.url, width, height, (text, f) => { progress.step = text; report(f); }, { signal, waterOnly, nir: map.nir, date: map.photo?.date, lat: location.lat }), { signal, onProgress: f => progress.set("photoTrees", { fraction: f }) });
        const n = await untilAborted(got.value, signal);
        // (a new id each time it's used: kept from before, it would share them with the last import's)
        const fresh = <T extends CourseItem>(i: T): T => ({ ...i, id: generateId() });
        const found = { trees: n.trees.map(fresh), woods: n.woods.map(fresh), water: n.water.map(fresh) };
        progress.set("photoTrees", waterOnly ? { state: "not-here", skipped: "measured", count: found.water.length, cached: got.hit } : { state: "done", count: found.trees.length + found.woods.length + found.water.length, cached: got.hit });
        layer({ source: "photoTrees", trees: found.trees, areas: [...found.woods, ...found.water] });
        return found;
      });
    })();

    // OpenStreetMap: waited for a little longer while the rest is still coming
    const restIn = Promise.allSettled([photoJob, elevationJob, lidarJob, tracedJob, natureJob]);
    const osmJob = !opts.osm ? Promise.resolve(null) : soft("osm", async () => {
      progress.set("osm", { state: "coming" });
      const got = fetchOsm(bounds, { signal, settle: restIn, onBusy: () => progress.set("osm", { busy: true }), onTiles: () => progress.set("osm", { busy: false }) });
      const answer = await untilAborted(got.value, signal);
      const { items, counts, parks } = osmFeatureItems(answer.features, ref);
      const n = items.length;
      progress.set("osm", { state: n ? "done" : "not-here", count: n, source: answer.from === "overpass" ? "Overpass" : "OpenFreeMap map tiles", cached: got.hit, ...(Object.keys(parks).length ? { parts: Object.fromEntries(Object.values(parks).map(p => [p.n === 1 ? p.one : p.many, p.n])), detail: parkSummary(parks) } : {}) });
      layer({ source: "osm", items });
      return { answer, items, counts, parks };
    });

    const [map, ground, measured, traced, nature, osm] = await untilAborted(Promise.all([photoJob, elevationJob, lidarJob, tracedJob, natureJob, osmJob]), signal);

    // ------------------------------------------------------------ put together
    const background = map?.url ?? null;
    if (map?.partial) notes.push("Some map tiles were missing.");
    if (opts.imagery !== "none" && !map) notes.push(satellite ? "Couldn't download the satellite photo or the street map, so there's plain ground under the course." : "Couldn't download the street map, so there's plain ground under the course.");

    let terrainHeights = ground?.heights ?? {};
    let baseFt = ground ? ground.elev.min * FEET_PER_METER : 0;
    let reliefFt = ground ? (ground.elev.max - ground.elev.min) * FEET_PER_METER : 0;
    let elevationSource: string | undefined = ground?.elev.source;
    if (!ground) notes.push("Couldn't download the elevation, so the ground is flat.");

    let lidar: CourseDoc["lidar"];
    let treesNoteAt = -1;
    // (none covers the site: remembered, so the Site step says so instead of offering to look)
    const noLidar = !!opts.lidar && progress.sources.lidar?.state === "not-here";
    const lidarFailed = !!opts.lidar && progress.sources.lidar?.state === "failed";
    if (opts.lidar) {
      const fromPhoto = wantsPhotoTrees && !!background;
      if (lidarFailed) notes.push(`Couldn't read the aerial survey this time${fromPhoto ? ": the trees came from the photo" : ""}.`);
      else if (noLidar) notes.push(`No aerial survey covers this spot${fromPhoto ? ": the trees came from the photo" : ""}.`);
    }
    if (measured) {
      terrainHeights = measured.ground.heights;
      baseFt = measured.ground.min;
      reliefFt = measured.ground.max - measured.ground.min;
      elevationSource = measured.lidar.source;
      lidar = { source: measured.lidar.source, trees: measured.lidar.trees };
      // (said once OpenStreetMap's in: the trees standing, none on a road or a building)
      treesNoteAt = notes.length;
    }
    if (ground || measured) notes.push(reliefFt < 1 ? "Nearly flat (under 1 ft of elevation change)." : `${Math.round(reliefFt)} ft of elevation change across the site.`);

    let mapped: CourseItem[] = [];
    let course: ImportedSite["course"];
    const osmFailed = !!opts.osm && !osm;
    if (osm) {
      const more = tracedItems(traced?.list ?? [], osm.items, ref);
      mapped = [...osm.items, ...more];
      const summary = osmSummary(osm.counts, more.length, osm.parks);
      notes.push(summary ? `From OpenStreetMap: ${summary}.` : OSM_NOTHING);
      const mc = mappedCourse(osm.answer.features);
      if (mc) course = courseFromMap(mc, ref);
      progress.set("buildings", traced ? { state: more.length ? "done" : "not-here", count: more.length, source: "Overture Maps", cached: traced.hit } : {});
      if (more.length) layer({ source: "buildings", items: more });
    } else if (traced) {
      // (OpenStreetMap out of reach: the traced buildings are left out too, as they're only the
      // ones it hasn't mapped)
      progress.set("buildings", { state: "failed", error: "OpenStreetMap out of reach" });
    }

    const found = nature ?? { trees: [], woods: [], water: [] };
    // What OpenStreetMap maps already (its woods and water) needn't come again from the photo
    const mappedAs = (kind: string) => mapped.filter((m): m is AreaItem => m.type === "area" && m.kind === kind);
    const inside = (p: P, kind: string) => mappedAs(kind).some(a => pointInPolygon(p, a.points));
    const water = found.water.filter(a => !inside(centroid(a.points), "water"));
    // (and never on a road, a building, parking or in water, as OpenStreetMap or the photo has them)
    const nowhere = treeFree([...mapped, ...found.water]);
    let all: CourseItem[] = [
      ...mapped,
      ...found.woods.filter(a => !inside(centroid(a.points), "woods") && !nowhere(centroid(a.points))),
      ...water,
      ...found.trees.filter(t => !inside(t, "woods") && !inside(t, "water") && !nowhere(t))
    ];
    // With trees measured from the air: their stands, in place of the photo's (the same step as
    // Measure trees and ground on the Site step)
    let standing: number | undefined;
    if (lidar && measured) {
      // The buildings' heights the survey measured (where the maps have none), then the woods from
      // the measured canopy, kept off buildings, water, parking, fields and roads
      all = withMeasuredHeights(all, measured.lidar.measured, signed);
      const m = withMeasuredTrees(all, lidar.trees, width, height, canopyStands(measured.lidar.measured, lidar.trees, canopyKeepOut(all)).stands);
      all = m.items;
      standing = standingTrees(lidar, () => false, treeFree(mapped)).stand.length;
      notes.splice(treesNoteAt, 0, `${standing.toLocaleString()} trees measured from the air (${measured.lidar.source}).`);
      if (m.stands) notes.push(`The measured trees in ${m.stands} ${m.stands === 1 ? "stand" : "stands"} of woods.`);
    }
    const photo = (type: string, kind?: string) => all.filter(i => (i as TreeItem | AreaItem).importSource === "photo" && i.type === type && (!kind || (i as AreaItem).kind === kind)).length;
    const counted = [[photo("area", "woods"), "wooded area", "wooded areas"], [photo("tree"), "tree", "trees"], [photo("area", "water"), "water area", "water areas"]] as const;
    const said = counted.filter(([n]) => n > 0).map(([n, one, many]) => `${n} ${n === 1 ? one : many}`);
    if (said.length) notes.push(`On the photo: ${said.join(", ")}.`);
    all = all.map(signed);
    const trees = all.filter((i): i is TreeItem => i.type === "tree");
    mapped = all.filter(i => i.type !== "tree");
    progress.close();

    return {
      canvas: { width, height },
      gridSize: grid,
      terrainHeights,
      background,
      site: {
        location,
        bounds,
        baseElevationFt: Math.round(baseFt * 10) / 10,
        imagerySource: map?.sourceLabel,
        ...(map?.photo ? { photo: { id: map.photo.id, date: map.photo.date, dateTo: map.photo.dateTo, season: map.photo.season, metersPerPx: Math.round(map.metersPerPx * 1000) / 1000, credit: map.credit } } : {}),
        elevationSource,
        // (OpenStreetMap out of reach: said in a toast of its own now, and kept here with the rest)
        notes: osmFailed ? [...notes, OSM_UNREACHABLE] : notes,
        // (what went wrong, for the Site step to say while it still holds)
        ...(noLidar ? { noLidar } : {}),
        ...(lidarFailed ? { lidarFailed } : {}),
        ...(osmFailed ? { osmFailed } : {}),
        ...(map?.partial ? { tilesMissing: true } : {})
      },
      trees,
      mapped,
      notes,
      osmFailed,
      lidar,
      standing,
      course,
      sources: progress.sources
    };
  } finally {
    progress.close();
  }
};
