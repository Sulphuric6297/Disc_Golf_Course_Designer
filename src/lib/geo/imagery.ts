import { clamp } from "../../constants";
import { ELEVATION_TILE_SIZE, FEET_PER_METER, GeoBounds, SiteLocation, getGeoBounds, latToPixel, loadTileMosaic, lonToPixel, mercatorBbox } from "./core";


export type MapImagerySource = "satellite" | "streets";
export const MAP_IMAGERY_SOURCES: Record<MapImagerySource, {
  label: string;
  maxZoom: number;
  attribution: string;
  url: (z: number, x: number, y: number) => string;
  // Coverage lookup for zoom levels that only exist in some areas (high-res aerials).
  tilemap?: (z: number, x: number, y: number) => string;
}> = {
  satellite: {
    label: "Satellite",
    maxZoom: 21,
    attribution: "Imagery © Esri, Maxar, Vexcel, Earthstar Geographics",
    url: (z, x, y) => `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`,
    tilemap: (z, x, y) => `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tilemap/${z}/${y}/${x}/1/1?f=json`
  },
  streets: {
    label: "Street Map",
    maxZoom: 19,
    attribution: "© OpenStreetMap contributors",
    url: (z, x, y) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`
  }
};
// Statewide high-resolution orthoimagery (public ArcGIS ImageServers, no key).
// Tried first when the site falls inside the region; falls back to Esri if unavailable.
export const STATE_ORTHO_SOURCES: {
  label: string;
  attribution: string;
  region: GeoBounds;
  feetPerPixel: number;
  services: string[];
}[] = [
  {
    label: "NC OneMap 6-inch orthoimagery",
    attribution: "Imagery © NC OneMap / NC Orthoimagery Program",
    region: { south: 33.75, north: 36.6, west: -84.33, east: -75.4 },
    feetPerPixel: 0.5,
    services: [
      "https://services.nconemap.gov/secure/rest/services/Imagery/Orthoimagery_Latest/ImageServer",
      "https://services.gis.nc.gov/secure/rest/services/Imagery/Orthoimagery_Latest/ImageServer"
    ]
  }
];

export const findStateOrtho = (lat: number, lon: number) =>
  STATE_ORTHO_SOURCES.find(src => lat >= src.region.south && lat <= src.region.north && lon >= src.region.west && lon <= src.region.east);

export const loadBlobImage = (blob: Blob) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Invalid image")); };
    img.src = url;
  });

const creditFontPx = (imageWidth: number) => Math.max(6, Math.round(imageWidth / 140));
/** Height of the provider credit box drawn along the bottom edge of an exported map image. */
export const creditHeightPx = (imageWidth: number) => creditFontPx(imageWidth) * 1.6;

// Draws the provider credit in the corner of an exported map image.
export const drawAttribution = (ctx: CanvasRenderingContext2D, width: number, height: number, text: string) => {
  const fontSize = creditFontPx(width);
  ctx.font = `${fontSize}px sans-serif`;
  const textW = ctx.measureText(text).width;
  ctx.fillStyle = "rgba(0,0,0,0.5)";
  ctx.fillRect(width - textW - fontSize, height - fontSize * 1.6, textW + fontSize, fontSize * 1.6);
  ctx.fillStyle = "#ffffff";
  ctx.fillText(text, width - textW - fontSize / 2, height - fontSize * 0.45);
};

// Exports a north-up image of the bounds from an ArcGIS ImageServer, in 2048px chunks so any server limit is respected.
export const fetchArcgisExportImage = async (
  serviceUrl: string,
  bounds: GeoBounds,
  widthPx: number,
  heightPx: number,
  attribution: string
) => {
  const out = document.createElement("canvas");
  out.width = widthPx;
  out.height = heightPx;
  const ctx = out.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas unavailable");
  const chunk = 2048;
  const lonPerPx = (bounds.east - bounds.west) / widthPx;
  const latPerPx = (bounds.north - bounds.south) / heightPx;
  const jobs: Promise<void>[] = [];
  for (let py = 0; py < heightPx; py += chunk) {
    for (let px = 0; px < widthPx; px += chunk) {
      const w = Math.min(chunk, widthPx - px);
      const h = Math.min(chunk, heightPx - py);
      const west = bounds.west + px * lonPerPx;
      const east = west + w * lonPerPx;
      const north = bounds.north - py * latPerPx;
      const south = north - h * latPerPx;
      const params = new URLSearchParams({
        bbox: mercatorBbox({ west, east, north, south }),
        bboxSR: "3857",
        imageSR: "3857",
        size: `${w},${h}`,
        adjustAspectRatio: "false",
        format: "jpg",
        interpolation: "RSP_BilinearInterpolation",
        f: "image"
      });
      jobs.push((async () => {
        const res = await fetch(`${serviceUrl}/exportImage?${params.toString()}`);
        if (!res.ok) throw new Error(`Imagery service ${res.status}`);
        const blob = await res.blob();
        if (!blob.type.startsWith("image/")) throw new Error("Imagery service returned no image");
        const img = await loadBlobImage(blob);
        ctx.drawImage(img, px, py, w, h);
      })());
    }
  }
  await Promise.all(jobs);
  // Outside the program's coverage the service returns blank (black/white) pixels.
  const sample = ctx.getImageData(0, 0, widthPx, heightPx).data;
  let blank = 0;
  let total = 0;
  const step = Math.max(4, Math.floor(sample.length / 4 / 5000)) * 4;
  for (let i = 0; i < sample.length; i += step) {
    const r = sample[i], g = sample[i + 1], b = sample[i + 2];
    if ((r < 4 && g < 4 && b < 4) || (r > 251 && g > 251 && b > 251)) blank++;
    total++;
  }
  if (blank / Math.max(total, 1) > 0.3) throw new Error("Imagery service has no coverage here");
  drawAttribution(ctx, widthPx, heightPx, attribution);
  return out.toDataURL("image/jpeg", 0.92);
};

export const MAP_IMAGERY_MAX_TILES = 196;
// ~4K image: sharp in 2D and within every GPU's texture limit for 3D.
export const MAP_IMAGERY_TARGET_PX = 4096;

// Downloads a north-up map image exactly covering widthFt x heightFt centered on the location.
export const fetchMapImagery = async (
  location: SiteLocation,
  widthFt: number,
  heightFt: number,
  source: MapImagerySource
): Promise<{ url: string; partial: boolean; sourceLabel: string }> => {
  const config = MAP_IMAGERY_SOURCES[source];
  const bounds = getGeoBounds(location, widthFt, heightFt);
  const stateOrtho = source === "satellite" ? findStateOrtho(location.lat, location.lon) : undefined;
  if (stateOrtho) {
    const scale = Math.min(1, MAP_IMAGERY_TARGET_PX / (Math.max(widthFt, heightFt) / stateOrtho.feetPerPixel));
    const widthPx = Math.max(1, Math.round((widthFt / stateOrtho.feetPerPixel) * scale));
    const heightPx = Math.max(1, Math.round((heightFt / stateOrtho.feetPerPixel) * scale));
    for (const service of stateOrtho.services) {
      try {
        const url = await fetchArcgisExportImage(service, bounds, widthPx, heightPx, stateOrtho.attribution);
        return { url, partial: false, sourceLabel: stateOrtho.label };
      } catch (err) {
        console.info(`${stateOrtho.label} unavailable from ${service}`, err);
      }
    }
  }
  // Pick the zoom whose resolution gives roughly MAP_IMAGERY_TARGET_PX across the area.
  const metersPerPx = widthFt / FEET_PER_METER / MAP_IMAGERY_TARGET_PX;
  const cosLat = Math.cos((location.lat * Math.PI) / 180);
  const idealZoom = Math.ceil(Math.log2((156543.03392 * cosLat) / Math.max(metersPerPx, 0.01)));
  let zoom = clamp(idealZoom, 1, config.maxZoom);
  // Use the sharpest imagery level that actually exists here (beyond z19 coverage is regional).
  if (config.tilemap) {
    while (zoom > 19) {
      const tx = Math.floor(lonToPixel(location.lon, zoom) / ELEVATION_TILE_SIZE);
      const ty = Math.floor(latToPixel(location.lat, zoom) / ELEVATION_TILE_SIZE);
      try {
        const res = await fetch(config.tilemap(zoom, tx, ty));
        const json = res.ok ? await res.json() : null;
        if (json && !json.adjusted && Array.isArray(json.data) && json.data[0] === 1) break;
      } catch {
        // fall through to a lower zoom
      }
      zoom -= 1;
    }
  }
  const mosaic = await loadTileMosaic(bounds, zoom, MAP_IMAGERY_MAX_TILES, config.url);
  if (!mosaic.loadedAny) {
    throw new Error(`Couldn't download ${config.label.toLowerCase()} imagery.`);
  }
  const nw = mosaic.toMosaic(bounds.north, bounds.west);
  const se = mosaic.toMosaic(bounds.south, bounds.east);
  const cropW = Math.max(1, se.x - nw.x);
  const cropH = Math.max(1, se.y - nw.y);
  const outScale = Math.min(1, MAP_IMAGERY_TARGET_PX / Math.max(cropW, cropH));
  const out = document.createElement("canvas");
  out.width = Math.max(1, Math.round(cropW * outScale));
  out.height = Math.max(1, Math.round(cropH * outScale));
  const outCtx = out.getContext("2d");
  if (!outCtx) throw new Error("Your browser couldn't create a canvas for map data.");
  outCtx.imageSmoothingQuality = "high";
  outCtx.drawImage(mosaic.canvas, nw.x, nw.y, cropW, cropH, 0, 0, out.width, out.height);
  // Attribution required by the tile providers.
  drawAttribution(outCtx, out.width, out.height, config.attribution);
  const metersPerPixel = (156543.03392 * cosLat) / Math.pow(2, mosaic.z);
  return {
    url: out.toDataURL("image/jpeg", 0.92),
    partial: !mosaic.loadedAll,
    sourceLabel: `${config.label === "Satellite" ? "Esri satellite" : "OpenStreetMap"} (~${Math.round(metersPerPixel * 100)} cm/pixel)`
  };
};

// Satellite + labels for browsing in the site picker (the imported image itself has no labels).
export const PICKER_LAYERS: Record<MapImagerySource, { url: string; overlays: string[]; maxNativeZoom: number }> = {
  satellite: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    overlays: [
      "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}",
      "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"
    ],
    maxNativeZoom: 19
  },
  streets: {
    url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    overlays: [],
    maxNativeZoom: 19
  }
};
