// Bringing in a real site: the satellite photo, the ground's elevation, the trees on the photo and
// what OpenStreetMap knows (paths, roads, water, parking, buildings). Everything comes from free
// services with no keys, as in the Security Camera Planner.
import { clamp } from "../constants";
import type { AreaItem, CourseItem, LineItem, SiteInfo, TreeItem } from "../types";
import { FEET_PER_METER, getGeoBounds, type GeoBounds, type SiteSelection } from "./geo/core";
import { detectTrees } from "./geo/detect";
import { fetchBestElevationGrid } from "./geo/elevation";
import { creditHeightPx, fetchMapImagery, type MapImagerySource } from "./geo/imagery";
import { fetchOsmFeatures } from "./geo/osm";
import { createArea, createLine, createTree } from "./course";
import { clipPathToRect, clipPolygonToRect, polygonArea, simplify } from "./geom";
import { toPlanXY } from "./geoRef";

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
};

export type ImportOptions = {
  imagery: MapImagerySource | "none";
  trees: boolean;
  osm: boolean;
  onStatus: (text: string) => void;
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

/** Tree crowns found on the photo, as trees on the plan. */
export const treesFromPhoto = async (url: string, width: number, height: number): Promise<TreeItem[]> => {
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
  if (!ctx) return [];
  ctx.drawImage(img, 0, 0, w, h);
  const creditTop = h - Math.ceil(creditHeightPx(img.naturalWidth) * (h / img.naturalHeight)) - 1;
  const mpp = widthM / w;
  const found = detectTrees(ctx.getImageData(0, 0, w, h), { metersPerPx: mpp, exclude: (_x, y) => y >= creditTop, maxTrees: 400 });
  return found.map(t => {
    const radius = clamp(t.radiusPx * mpp * FEET_PER_METER, 5, 35);
    return createTree({ x: (t.x / w) * width, y: (t.y / h) * height }, { radius, height: clamp(radius * 2.6, 15, 85), importSource: "photo" });
  });
};

const OSM_NAMES: Record<string, [string, string]> = {
  path: ["path", "paths"], road: ["road", "roads"], stream: ["stream", "streams"], water: ["water area", "water areas"],
  parking: ["parking lot", "parking lots"], building: ["building", "buildings"]
};

/**
 * What OpenStreetMap has on the site, as course items: lines and areas cut to the site's edges
 * (a road runs on for miles, a river's outline can be bigger than the whole park), and a summary
 * ("2 paths, 1 road, 1 water area"). Throws when no server could be reached.
 */
export const osmItems = async (bounds: GeoBounds, width: number, height: number, onServer?: (index: number) => void) => {
  const features = await fetchOsmFeatures(bounds, undefined, onServer);
  const ref = { ...bounds, width, height };
  // (a little past the edges, so lines run cleanly off the map)
  const edge = { x0: -20, y0: -20, x1: width + 20, y1: height + 20 };
  const items: CourseItem[] = [];
  for (const f of features) {
    const plan = f.points.map(p => toPlanXY(ref, p.lat, p.lon));
    if (f.geom === "area") {
      const pts = simplify(clipPolygonToRect(plan, edge), 1);
      if (pts.length < 3 || Math.abs(polygonArea(pts)) < 4) continue;
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

/** Said when OpenStreetMap couldn't be reached. */
export const OSM_UNREACHABLE = "Couldn't reach OpenStreetMap (its servers are busy), so paths, roads and water weren't brought in.";

export const importSite = async (selection: SiteSelection, opts: ImportOptions): Promise<ImportedSite> => {
  const location = selection.center;
  const grid = gridFor(selection.widthFt);
  // The plan is the selected area at 1 unit = 1 ft, a whole number of grid cells, so the photo,
  // the terrain and everything drawn line up exactly
  const width = Math.max(1, Math.round(selection.widthFt / grid)) * grid;
  const height = Math.max(1, Math.round(selection.heightFt / grid)) * grid;
  const bounds = getGeoBounds(location, width, height);
  const notes: string[] = [];

  let background: string | null = null;
  let imagerySource: string | undefined;
  if (opts.imagery !== "none") {
    opts.onStatus("Downloading the satellite photo…");
    const map = await fetchMapImagery(location, width, height, opts.imagery);
    background = map.url;
    imagerySource = map.sourceLabel;
    if (map.partial) notes.push("Some map tiles were missing.");
  }

  opts.onStatus("Downloading elevation…");
  const spacing = Math.max(grid / 2, Math.max(width, height) / 600);
  const samplesX = clamp(Math.round(width / spacing) + 1, 2, 800);
  const samplesY = clamp(Math.round(height / spacing) + 1, 2, 800);
  const elev = await fetchBestElevationGrid(location, width, height, samplesX, samplesY);
  const terrainHeights = heightsFromSamples(elev.values, samplesX, samplesY, elev.min, width, height, grid);
  const reliefFt = (elev.max - elev.min) * FEET_PER_METER;
  notes.push(reliefFt < 1 ? "Nearly flat (under 1 ft of elevation change)." : `${Math.round(reliefFt)} ft of elevation change across the site.`);

  let trees: TreeItem[] = [];
  if (opts.trees && background && opts.imagery === "satellite") {
    opts.onStatus("Finding trees on the photo…");
    trees = await treesFromPhoto(background, width, height).catch(err => {
      console.warn("Tree detection failed", err);
      return [];
    });
    if (trees.length) notes.push(`Placed ${trees.length} trees found on the photo; remove any that are wrong.`);
  }

  let mapped: CourseItem[] = [];
  let osmFailed = false;
  if (opts.osm) {
    const ask = "Looking up paths, water and roads on OpenStreetMap…";
    opts.onStatus(ask);
    try {
      const found = await osmItems(bounds, width, height, i => opts.onStatus(i ? `${ask} (its main server is busy: asking another)` : ask));
      mapped = found.items;
      notes.push(found.summary ? `From OpenStreetMap: ${found.summary}.` : "OpenStreetMap has no paths, roads or water mapped here.");
    } catch (err) {
      console.warn("OpenStreetMap lookup failed", err);
      osmFailed = true;
    }
  }

  return {
    canvas: { width, height },
    gridSize: grid,
    terrainHeights,
    background,
    site: {
      location,
      bounds,
      baseElevationFt: Math.round(elev.min * FEET_PER_METER * 10) / 10,
      imagerySource,
      elevationSource: elev.source
    },
    trees,
    mapped,
    notes,
    osmFailed
  };
};

