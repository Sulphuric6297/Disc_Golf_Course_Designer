import { clamp } from "../../constants";


// --- Elevation Helpers ---

// Plan units are feet throughout the app (camera heights, wall heights, etc.).
export const FEET_PER_METER = 3.28084;
export const METERS_PER_DEG_LAT = 111320;
export const ELEVATION_TILE_SIZE = 256;
export const ELEVATION_MAX_ZOOM = 15;
export const ELEVATION_MAX_TILES = 36;
// Free, CORS-enabled global elevation tiles (AWS Open Data "Terrain Tiles", Terrarium encoding).
export const elevationTileUrl = (z: number, x: number, y: number) =>
  `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`;

export type SiteLocation = { lat: number; lon: number; label: string };
export type ElevationOverlayMode = "off" | "contours" | "shaded";

export const lonToPixel = (lon: number, z: number) => ((lon + 180) / 360) * ELEVATION_TILE_SIZE * Math.pow(2, z);
export const latToPixel = (lat: number, z: number) => {
  const rad = (clamp(lat, -85, 85) * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * ELEVATION_TILE_SIZE * Math.pow(2, z);
};

export const fetchJson = async (url: string, timeoutMs = 8000) => {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (json?.error) throw new Error(json.error.message || "Service error");
    return json;
  } finally {
    window.clearTimeout(timer);
  }
};

export const loadTileImage = (url: string) =>
  new Promise<HTMLImageElement | null>((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });

export type GeoBounds = { north: number; south: number; west: number; east: number };

// Real-world bounds of a widthFt x heightFt area centered on the location.
export const getGeoBounds = (location: SiteLocation, widthFt: number, heightFt: number): GeoBounds => {
  const cosLat = Math.cos((location.lat * Math.PI) / 180) || 1e-6;
  const dLat = heightFt / FEET_PER_METER / 2 / METERS_PER_DEG_LAT;
  const dLon = widthFt / FEET_PER_METER / 2 / (METERS_PER_DEG_LAT * cosLat);
  return { north: location.lat + dLat, south: location.lat - dLat, west: location.lon - dLon, east: location.lon + dLon };
};

export const getTileRange = (bounds: GeoBounds, z: number) => ({
  x0: Math.floor(lonToPixel(bounds.west, z) / ELEVATION_TILE_SIZE),
  x1: Math.floor(lonToPixel(bounds.east, z) / ELEVATION_TILE_SIZE),
  y0: Math.floor(latToPixel(bounds.north, z) / ELEVATION_TILE_SIZE),
  y1: Math.floor(latToPixel(bounds.south, z) / ELEVATION_TILE_SIZE)
});

// Downloads and stitches the web-mercator tiles covering the bounds. Lowers the zoom if it would need too many tiles.
export const loadTileMosaic = async (
  bounds: GeoBounds,
  maxZoom: number,
  maxTiles: number,
  tileUrl: (z: number, x: number, y: number) => string
) => {
  let z = maxZoom;
  let range = getTileRange(bounds, z);
  while (z > 1 && (range.x1 - range.x0 + 1) * (range.y1 - range.y0 + 1) > maxTiles) {
    z -= 1;
    range = getTileRange(bounds, z);
  }
  const canvas = document.createElement("canvas");
  canvas.width = (range.x1 - range.x0 + 1) * ELEVATION_TILE_SIZE;
  canvas.height = (range.y1 - range.y0 + 1) * ELEVATION_TILE_SIZE;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Your browser couldn't create a canvas for map data.");
  const jobs: Promise<boolean>[] = [];
  for (let ty = range.y0; ty <= range.y1; ty++) {
    for (let tx = range.x0; tx <= range.x1; tx++) {
      jobs.push(loadTileImage(tileUrl(z, tx, ty)).then(img => {
        if (!img) return false;
        ctx.drawImage(img, (tx - range.x0) * ELEVATION_TILE_SIZE, (ty - range.y0) * ELEVATION_TILE_SIZE, ELEVATION_TILE_SIZE, ELEVATION_TILE_SIZE);
        return true;
      }));
    }
  }
  const loaded = await Promise.all(jobs);
  // Converts a lat/lon to a pixel position inside the mosaic.
  const toMosaic = (lat: number, lon: number) => ({
    x: lonToPixel(lon, z) - range.x0 * ELEVATION_TILE_SIZE,
    y: latToPixel(lat, z) - range.y0 * ELEVATION_TILE_SIZE
  });
  return { canvas, ctx, z, toMosaic, loadedAny: loaded.some(Boolean), loadedAll: loaded.every(Boolean) };
};

// Web Mercator (EPSG:3857) meters. Requests to ArcGIS image services use this with
// adjustAspectRatio=false so the server returns exactly the requested area (in lat/lon degrees
// pixels aren't square, and the server would otherwise silently widen the area).
export const toMercator = (lat: number, lon: number) => ({
  x: (lon * Math.PI * 6378137) / 180,
  y: Math.log(Math.tan(Math.PI / 4 + (clamp(lat, -85, 85) * Math.PI) / 360)) * 6378137
});
export const mercatorBbox = (b: GeoBounds) => {
  const sw = toMercator(b.south, b.west);
  const ne = toMercator(b.north, b.east);
  return `${sw.x},${sw.y},${ne.x},${ne.y}`;
};

// How the plan maps to the real world (set when a site is imported).
export type PlanGeoRef = { bounds: GeoBounds; area: { x: number; y: number; width: number; height: number }; unitsPerFoot: number };

// A real-world rectangle picked on the satellite map.
export type SiteSelection = { center: SiteLocation; widthFt: number; heightFt: number };

export const selectionFromBounds = (b: GeoBounds, label: string): SiteSelection => {
  const lat = (b.north + b.south) / 2;
  const lon = (b.east + b.west) / 2;
  const cosLat = Math.cos((lat * Math.PI) / 180);
  return {
    center: { lat, lon, label },
    widthFt: Math.abs(b.east - b.west) * METERS_PER_DEG_LAT * cosLat * FEET_PER_METER,
    heightFt: Math.abs(b.north - b.south) * METERS_PER_DEG_LAT * FEET_PER_METER
  };
};

export const SITE_MAX_WIDTH_FT = 6000;
export const SITE_MIN_WIDTH_FT = 40;

export const pointInLatLonPolygon = (pt: { lat: number; lon: number }, poly: { lat: number; lon: number }[]) => {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if ((a.lat > pt.lat) !== (b.lat > pt.lat) && pt.lon < ((b.lon - a.lon) * (pt.lat - a.lat)) / (b.lat - a.lat) + a.lon) {
      inside = !inside;
    }
  }
  return inside;
};

export const latLonCentroid = (points: { lat: number; lon: number }[]) => ({
  lat: points.reduce((sum, p) => sum + p.lat, 0) / points.length,
  lon: points.reduce((sum, p) => sum + p.lon, 0) / points.length
});
