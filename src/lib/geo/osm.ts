// Paths, roads, streams, water, parking, playgrounds and buildings from OpenStreetMap (free, no
// key), so the map shows what is around the holes and the safety checks know about it.
import type { GeoBounds } from "./core";

export const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter"
];
/** How long to wait for one Overpass server before trying the next (they can stall). */
export const OVERPASS_TIMEOUT_MS = 20000;

export type LatLon = { lat: number; lon: number };
export type OsmFeature =
  | { geom: "line"; kind: "path" | "road" | "stream" | "fence"; points: LatLon[]; name?: string }
  | { geom: "area"; kind: "water" | "parking" | "building" | "nogo" | "woods" | "sand"; points: LatLon[]; name?: string };

const PATHS = new Set(["footway", "path", "track", "cycleway", "bridleway", "steps", "pedestrian"]);
const ROADS = new Set(["residential", "service", "unclassified", "tertiary", "secondary", "primary", "trunk", "living_street", "road"]);

/** What an OSM way is, for the course map (or null to skip it). */
export const classifyOsm = (tags: Record<string, string>, closed: boolean): { geom: "line" | "area"; kind: OsmFeature["kind"] } | null => {
  if (tags.leisure === "disc_golf_course") return null;
  if (closed && (tags.natural === "water" || tags.landuse === "reservoir" || tags.landuse === "basin" || tags.water)) return { geom: "area", kind: "water" };
  if (closed && tags.amenity === "parking") return { geom: "area", kind: "parking" };
  if (closed && tags.building) return { geom: "area", kind: "building" };
  if (closed && (tags.leisure === "playground" || tags.leisure === "pitch" || tags.leisure === "swimming_pool" || tags.leisure === "garden" || tags.landuse === "residential")) return { geom: "area", kind: "nogo" };
  if (closed && (tags.natural === "wood" || tags.landuse === "forest")) return { geom: "area", kind: "woods" };
  if (closed && (tags.natural === "sand" || tags.natural === "beach" || tags.golf === "bunker")) return { geom: "area", kind: "sand" };
  if (tags.waterway && ["stream", "river", "ditch", "canal", "drain"].includes(tags.waterway)) return { geom: "line", kind: "stream" };
  if (tags.highway && PATHS.has(tags.highway)) return { geom: "line", kind: "path" };
  if (tags.highway && ROADS.has(tags.highway)) return { geom: "line", kind: "road" };
  if (tags.barrier === "fence" || tags.barrier === "wall") return { geom: "line", kind: "fence" };
  return null;
};

export const fetchOsmFeatures = async (bounds: GeoBounds, timeoutMs = OVERPASS_TIMEOUT_MS): Promise<OsmFeature[]> => {
  const bbox = `${bounds.south},${bounds.west},${bounds.north},${bounds.east}`;
  const query = `[out:json][timeout:25];(way["highway"](${bbox});way["waterway"](${bbox});way["natural"~"water|wood|sand|beach"](${bbox});way["landuse"~"reservoir|basin|forest"](${bbox});way["amenity"="parking"](${bbox});way["building"](${bbox});way["leisure"~"playground|pitch|swimming_pool|garden"](${bbox});way["barrier"~"fence|wall"](${bbox}););out geom;`;
  let lastError: unknown = null;
  for (const endpoint of OVERPASS_ENDPOINTS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `data=${encodeURIComponent(query)}`,
        signal: controller.signal
      });
      if (!res.ok) throw new Error(`Overpass ${res.status}`);
      const json = await res.json();
      const out: OsmFeature[] = [];
      for (const el of json.elements ?? []) {
        if (el.type !== "way" || !Array.isArray(el.geometry) || el.geometry.length < 2) continue;
        const tags: Record<string, string> = el.tags ?? {};
        const pts: LatLon[] = el.geometry.map((g: LatLon) => ({ lat: g.lat, lon: g.lon }));
        const closed = pts.length >= 4 && pts[0].lat === pts[pts.length - 1].lat && pts[0].lon === pts[pts.length - 1].lon;
        const what = classifyOsm(tags, closed);
        if (!what) continue;
        if (what.geom === "area") out.push({ geom: "area", kind: what.kind as any, points: pts.slice(0, -1), name: tags.name });
        else out.push({ geom: "line", kind: what.kind as any, points: pts, name: tags.name });
      }
      return out;
    } catch (err) {
      lastError = err;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError instanceof Error ? lastError : new Error("OpenStreetMap lookup failed.");
};
