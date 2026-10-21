// Bringing in a real site: the satellite photo, the ground's elevation, the trees on the photo and
// what OpenStreetMap knows (paths, roads, water, parking, buildings). Everything comes from free
// services with no keys, as in the Security Camera Planner.
import { clamp } from "../constants";
import type { AreaItem, CourseDoc, CourseItem, Hole, LineItem, P, SiteInfo, TreeItem } from "../types";
import { FEET_PER_METER, getGeoBounds, type GeoBounds, type SiteSelection } from "./geo/core";
import { canopyMask, detectTrees, waterRegions, woodsRegions } from "./geo/detect";
import { fetchBestElevationGrid } from "./geo/elevation";
import { fetchLidar } from "./geo/lidarFetch";
import { groundOnGrid } from "./lidar";
import { creditHeightPx, fetchMapImagery, type MapImagerySource } from "./geo/imagery";
import { fetchOsmFeatures } from "./geo/osm";
import { fetchTileFeatures } from "./geo/vectorTiles";
import { createArea, createLine, createStructure, createTree } from "./course";
import { centroid, clipPathToRect, clipPolygonToRect, pointInPolygon, polygonArea, simplify } from "./geom";
import { reframe, toPlanXY, type GeoRef } from "./geoRef";

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
};

export type ImportOptions = {
  imagery: MapImagerySource | "none";
  trees: boolean;
  osm: boolean;
  /** Trees and ground measured from the air (LiDAR), where a survey covers the site. */
  lidar?: boolean;
  /** What it is doing: step `step` of `of`, and how far along that step is (0..1) where known. */
  onStatus: (text: string, progress?: { step: number; of: number; fraction?: number }) => void;
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

const loadImage = (url: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });

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

/** What the satellite photo shows: stands of trees (as woods areas), the trees standing on their
 * own (as trees) and open water (as water areas). */
export const natureFromPhoto = async (url: string, width: number, height: number, onStep: (text: string, fraction: number) => void = () => {}): Promise<{ trees: TreeItem[]; woods: AreaItem[]; water: AreaItem[] }> => {
  // (a pause between the long steps, so the page shows how far along it is)
  const breathe = () => new Promise(r => setTimeout(r, 30));
  const img = await loadImage(url);
  const widthM = width / FEET_PER_METER;
  // About 30 cm per pixel: plenty for crowns, and quick
  const scale = Math.min(1, widthM / 0.3 / img.naturalWidth);
  const w = Math.max(16, Math.round(img.naturalWidth * scale));
  const h = Math.max(16, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return { trees: [], woods: [], water: [] };
  ctx.drawImage(img, 0, 0, w, h);
  const creditTop = h - Math.ceil(creditHeightPx(img.naturalWidth) * (h / img.naturalHeight)) - 1;
  const mpp = widthM / w;
  const pixels = ctx.getImageData(0, 0, w, h);
  const opts = { metersPerPx: mpp, exclude: (_x: number, y: number) => y >= creditTop };
  onStep("Finding the trees on the photo…", 0.05);
  await breathe();
  const canopy = canopyMask(pixels, opts);
  onStep("Tracing the woods…", 0.35);
  await breathe();
  const area = (kind: "woods" | "water", outline: { x: number; y: number }[], tolerance: number) => ({ ...createArea(kind, outlineToPlan(outline, w, h, width, height, tolerance)), importSource: "photo" as const }) as AreaItem;
  const woods = canopy ? woodsRegions(canopy).map(r => area("woods", r.outline, 4)).filter(a => a.points.length >= 3) : [];
  onStep("Finding water on the photo…", 0.55);
  await breathe();
  const water = waterRegions(pixels, opts).map(r => area("water", r.outline, 2)).filter(a => a.points.length >= 3);
  onStep("Placing the trees…", 0.75);
  await breathe();
  // The trees in a stand are the woods now; the rest stand on their own
  const trees = detectTrees(pixels, { ...opts, maxTrees: 400, canopy })
    .map(t => {
      const radius = clamp(t.radiusPx * mpp * FEET_PER_METER, 5, 35);
      return createTree({ x: (t.x / w) * width, y: (t.y / h) * height }, { radius, height: clamp(radius * 2.6, 15, 85), importSource: "photo" });
    })
    .filter(t => !woods.some(a => pointInPolygon(t, a.points)) && !water.some(a => pointInPolygon(t, a.points)));
  return { trees, woods, water };
};

/** Whether a thing was brought in by an import (found on the photo, or from OpenStreetMap). */
export const isImported = (i: CourseItem) => (i.type === "tree" || i.type === "area" || i.type === "line" || i.type === "structure") && !!i.importSource;

const OSM_NAMES: Record<string, [string, string]> = {
  path: ["path", "paths"], road: ["road", "roads"], stream: ["stream", "streams"], water: ["water area", "water areas"],
  woods: ["wooded area", "wooded areas"], rough: ["grass area", "grass areas"],
  parking: ["parking lot", "parking lots"], building: ["building", "buildings"]
};

/**
 * What OpenStreetMap has on the site, as course items: lines and areas cut to the site's edges
 * (a road runs on for miles, a river's outline can be bigger than the whole park), and a summary
 * ("2 paths, 1 road, 1 water area"). Throws when no server could be reached.
 */
export const osmItems = async (bounds: GeoBounds, width: number, height: number, onServer?: (index: number) => void) => {
  // (every Overpass server busy: the same OpenStreetMap data from OpenFreeMap's map tiles)
  const features = await fetchOsmFeatures(bounds, undefined, onServer).catch(err => fetchTileFeatures(bounds).catch(() => Promise.reject(err)));
  const ref = { ...bounds, width, height };
  // (a little past the edges, so lines run cleanly off the map)
  const edge = { x0: -20, y0: -20, x1: width + 20, y1: height + 20 };
  const items: CourseItem[] = [];
  for (const f of features) {
    const plan = f.points.map(p => toPlanXY(ref, p.lat, p.lon));
    if (f.geom === "area") {
      const pts = simplify(clipPolygonToRect(plan, edge), 1);
      if (pts.length < 3 || Math.abs(polygonArea(pts)) < 4) continue;
      if (f.kind === "building") {
        // A building to edit like one drawn: walls, a roof, a height
        const b = createStructure("building", pts);
        if (f.building?.heightM) b.height = Math.round(Math.min(40, Math.max(8, f.building.heightM * FEET_PER_METER)) * 2) / 2;
        if (f.building?.roof) b.roof = f.building.roof;
        if (f.name) b.label = f.name;
        items.push({ ...b, importSource: "osm" });
        continue;
      }
      const area = createArea(f.kind, pts) as AreaItem;
      if (f.name) area.label = f.name;
      items.push({ ...area, importSource: "osm" });
    } else {
      for (const piece of clipPathToRect(plan, edge)) {
        const pts = simplify(piece, 1);
        if (pts.length < 2) continue;
        const line = createLine(f.kind, pts) as LineItem;
        if (f.name && f.kind !== "path") line.label = f.name;
        items.push({ ...line, importSource: "osm" });
      }
    }
  }
  const summary = Object.entries(OSM_NAMES)
    .map(([k, [one, many]]) => {
      const n = items.filter(m => (m as AreaItem | LineItem).kind === k).length;
      return n ? `${n} ${n === 1 ? one : many}` : "";
    })
    .filter(Boolean)
    .join(", ");
  return { items, summary };
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
    return moved;
  });
  const holes = design.holes.map(h => ({ ...h, doglegs: h.doglegs.map(f) }));
  const outside = items.filter(i => i.x < 0 || i.y < 0 || i.x > to.width || i.y > to.height).length;
  return { holes, items, outside };
};

/** Said when OpenStreetMap couldn't be reached. */
export const OSM_UNREACHABLE = "Couldn't reach OpenStreetMap: paths, roads and water weren't brought in.";

export const importSite = async (selection: SiteSelection, opts: ImportOptions): Promise<ImportedSite> => {
  const location = selection.center;
  const grid = gridFor(selection.widthFt);
  // The plan is the selected area at 1 unit = 1 ft, a whole number of grid cells, so the photo,
  // the terrain and everything drawn line up exactly
  const width = Math.max(1, Math.round(selection.widthFt / grid)) * grid;
  const height = Math.max(1, Math.round(selection.heightFt / grid)) * grid;
  const bounds = getGeoBounds(location, width, height);
  const notes: string[] = [];
  // The steps it takes, to say which one it is on
  const steps = [opts.imagery !== "none" ? "photo" : "", "elevation", opts.lidar ? "lidar" : "", opts.trees && opts.imagery === "satellite" ? "nature" : "", opts.osm ? "osm" : ""].filter(Boolean);
  const status = (step: string, text: string, fraction?: number) => opts.onStatus(text, { step: steps.indexOf(step) + 1, of: steps.length, fraction });

  let background: string | null = null;
  let imagerySource: string | undefined;
  if (opts.imagery !== "none") {
    const what = opts.imagery === "satellite" ? "Downloading the satellite photo…" : "Downloading the map…";
    status("photo", what, 0);
    const map = await fetchMapImagery(location, width, height, opts.imagery, f => status("photo", what, f));
    background = map.url;
    imagerySource = map.sourceLabel;
    if (map.partial) notes.push("Some map tiles were missing.");
  }

  status("elevation", "Downloading elevation…");
  const spacing = Math.max(grid / 2, Math.max(width, height) / 600);
  const samplesX = clamp(Math.round(width / spacing) + 1, 2, 800);
  const samplesY = clamp(Math.round(height / spacing) + 1, 2, 800);
  const elev = await fetchBestElevationGrid(location, width, height, samplesX, samplesY);
  let terrainHeights = heightsFromSamples(elev.values, samplesX, samplesY, elev.min, width, height, grid);
  let baseFt = elev.min * FEET_PER_METER, reliefFt = (elev.max - elev.min) * FEET_PER_METER, elevationSource = elev.source;

  // Trees and ground measured from the air, where a survey covers it
  let lidar: CourseDoc["lidar"];
  if (opts.lidar) {
    const what = "Measuring trees and ground from the air (LiDAR)…";
    status("lidar", what, 0);
    const got = await fetchLidar({ ...bounds, width, height }, f => status("lidar", what, f)).catch(err => {
      console.warn("LiDAR failed", err);
      return null;
    });
    if (got) {
      const g = groundOnGrid(got.measured, width, height, grid);
      terrainHeights = g.heights;
      baseFt = g.min;
      reliefFt = g.max - g.min;
      elevationSource = got.source;
      lidar = { source: got.source, trees: got.trees };
      notes.push(`${got.trees.length.toLocaleString()} trees measured from the air (${got.source}).`);
    }
  }
  notes.push(reliefFt < 1 ? "Nearly flat (under 1 ft of elevation change)." : `${Math.round(reliefFt)} ft of elevation change across the site.`);

  let found: { trees: TreeItem[]; woods: AreaItem[]; water: AreaItem[] } = { trees: [], woods: [], water: [] };
  if (opts.trees && background && opts.imagery === "satellite") {
    status("nature", "Finding woods, trees and water on the photo…", 0);
    found = await natureFromPhoto(background, width, height, (text, f) => status("nature", text, f)).catch(err => {
      console.warn("Tree detection failed", err);
      return { trees: [], woods: [], water: [] };
    });
  }

  let mapped: CourseItem[] = [];
  let osmFailed = false;
  if (opts.osm) {
    const ask = "Looking up paths, water and roads on OpenStreetMap…";
    status("osm", ask);
    try {
      const found = await osmItems(bounds, width, height, i => status("osm", i ? "OpenStreetMap is busy: asking another server…" : ask));
      mapped = found.items;
      notes.push(found.summary ? `From OpenStreetMap: ${found.summary}.` : "OpenStreetMap has no paths, roads or water mapped here.");
    } catch (err) {
      console.warn("OpenStreetMap lookup failed", err);
      osmFailed = true;
    }
  }

  // What OpenStreetMap maps already (its woods and water) needn't come again from the photo
  const mappedAs = (kind: string) => mapped.filter((m): m is AreaItem => m.type === "area" && m.kind === kind);
  const inside = (p: P, kind: string) => mappedAs(kind).some(a => pointInPolygon(p, a.points));
  // (with the trees measured from the air, none guessed from the photo)
  const woods = lidar ? [] : found.woods.filter(a => !inside(centroid(a.points), "woods"));
  const water = found.water.filter(a => !inside(centroid(a.points), "water"));
  const trees = lidar ? [] : found.trees.filter(t => !inside(t, "woods") && !inside(t, "water"));
  const counted = [[woods.length, "wooded area", "wooded areas"], [trees.length, "tree", "trees"], [water.length, "water area", "water areas"]] as const;
  const said = counted.filter(([n]) => n > 0).map(([n, one, many]) => `${n} ${n === 1 ? one : many}`);
  if (said.length) notes.push(`On the photo: ${said.join(", ")}.`);
  mapped = [...mapped, ...woods, ...water];

  return {
    canvas: { width, height },
    gridSize: grid,
    terrainHeights,
    background,
    site: {
      location,
      bounds,
      baseElevationFt: Math.round(baseFt * 10) / 10,
      imagerySource,
      elevationSource
    },
    trees,
    mapped,
    notes,
    osmFailed,
    lidar
  };
};

