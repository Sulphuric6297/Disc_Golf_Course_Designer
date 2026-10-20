// Paths, roads, streams, water, woods, grass, parking, playgrounds and buildings from OpenStreetMap (free, no
// key), so the map shows what is around the holes and the safety checks know about it.
import type { GeoBounds } from "./core";

export const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  // (the server once at overpass.kumi.systems)
  "https://overpass.private.coffee/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter"
];
/** How long to wait for one Overpass server before trying the next (a busy one can take half a
 * minute to answer, or stall). */
export const OVERPASS_TIMEOUT_MS = 35000;

export type LatLon = { lat: number; lon: number };
export type OsmFeature =
  | { geom: "line"; kind: "path" | "road" | "stream" | "fence"; points: LatLon[]; name?: string }
  | { geom: "area"; kind: "water" | "parking" | "building" | "nogo" | "woods" | "sand" | "rough"; points: LatLon[]; name?: string; building?: OsmBuilding };

/** What OpenStreetMap says about a building's shape: its height (m) and roof. */
export type OsmBuilding = { heightM?: number; roof?: "gable" | "hip" | "flat" | "shed" | "pyramid" };

const ROOF_SHAPES: Record<string, OsmBuilding["roof"]> = { gabled: "gable", hipped: "hip", half_hipped: "hip", flat: "flat", skillion: "shed", lean_to: "shed", pyramidal: "pyramid", dome: "pyramid", onion: "pyramid" };

/** A building's height (to the eaves, m) and roof from its tags, where mapped. */
export const osmBuilding = (tags: Record<string, string>): OsmBuilding => {
  const m = parseFloat(tags["building:height"] ?? tags.height ?? "");
  const levels = parseFloat(tags["building:levels"] ?? "");
  return {
    heightM: Number.isFinite(levels) && levels > 0 ? levels * 3 : Number.isFinite(m) && m > 0 ? m : undefined,
    roof: ROOF_SHAPES[tags["roof:shape"] ?? ""] ?? undefined
  };
};

const PATHS = new Set(["footway", "path", "track", "cycleway", "bridleway", "steps", "pedestrian"]);
const ROADS = new Set(["residential", "service", "unclassified", "tertiary", "secondary", "primary", "trunk", "motorway", "living_street", "road", "tertiary_link", "secondary_link", "primary_link", "trunk_link", "motorway_link"]);
const GRASS_NATURAL = new Set(["grassland", "scrub", "heath"]);
const GRASS_LANDUSE = new Set(["meadow", "grass", "village_green"]);
const STREAMS = new Set(["stream", "river", "brook", "ditch", "canal", "drain", "tidal_channel"]);

/** What an OSM way is, for the course map (or null to skip it). */
export const classifyOsm = (tags: Record<string, string>, closed: boolean): { geom: "line" | "area"; kind: OsmFeature["kind"] } | null => {
  if (tags.leisure === "disc_golf_course") return null;
  if (closed && (tags.natural === "water" || tags.landuse === "reservoir" || tags.landuse === "basin" || tags.water || tags.waterway === "riverbank")) return { geom: "area", kind: "water" };
  if (closed && tags.amenity === "parking") return { geom: "area", kind: "parking" };
  if (closed && tags.building) return { geom: "area", kind: "building" };
  if (closed && (tags.leisure === "playground" || tags.leisure === "pitch" || tags.leisure === "swimming_pool" || tags.leisure === "garden" || tags.landuse === "residential")) return { geom: "area", kind: "nogo" };
  if (closed && (tags.natural === "wood" || tags.landuse === "forest")) return { geom: "area", kind: "woods" };
  if (closed && (tags.natural === "sand" || tags.natural === "beach" || tags.golf === "bunker")) return { geom: "area", kind: "sand" };
  // Meadows, grassland, scrub and lawns: grass areas (rough)
  if (closed && (GRASS_NATURAL.has(tags.natural ?? "") || GRASS_LANDUSE.has(tags.landuse ?? ""))) return { geom: "area", kind: "rough" };
  if (tags.waterway && STREAMS.has(tags.waterway)) return { geom: "line", kind: "stream" };
  if (tags.highway && PATHS.has(tags.highway)) return { geom: "line", kind: "path" };
  if (tags.highway && ROADS.has(tags.highway)) return { geom: "line", kind: "road" };
  if (tags.barrier === "fence" || tags.barrier === "wall") return { geom: "line", kind: "fence" };
  return null;
};

type OsmMember = { type: string; role?: string; geometry?: (LatLon | null)[] };

/**
 * A multipolygon's outer rings, joined from its member ways (they meet end to end, either way
 * round). Lakes and wide rivers are mapped like this, in pieces; the islands (inner rings) stay
 * water on the course map.
 */
export const outerRings = (members: OsmMember[]): LatLon[][] => {
  const same = (a: LatLon, b: LatLon) => a.lat === b.lat && a.lon === b.lon;
  const parts = members
    .filter(m => m.type === "way" && m.role !== "inner" && Array.isArray(m.geometry))
    .map(m => m.geometry!.filter((g): g is LatLon => !!g).map(g => ({ lat: g.lat, lon: g.lon })))
    .filter(p => p.length >= 2);
  const rings: LatLon[][] = [];
  while (parts.length) {
    let ring = parts.shift()!;
    for (let grew = true; grew && !same(ring[0], ring[ring.length - 1]); ) {
      grew = false;
      const end = ring[ring.length - 1];
      const i = parts.findIndex(p => same(p[0], end) || same(p[p.length - 1], end));
      if (i < 0) break;
      const p = parts.splice(i, 1)[0];
      ring = ring.concat(same(p[0], end) ? p.slice(1) : p.slice(0, -1).reverse());
      grew = true;
    }
    if (ring.length >= 4 && same(ring[0], ring[ring.length - 1])) rings.push(ring.slice(0, -1));
  }
  return rings;
};

/** What an Overpass answer holds for the course map: its ways, and its multipolygons' outlines. */
export const osmFeaturesFrom = (json: { elements?: any[] }): OsmFeature[] => {
  const out: OsmFeature[] = [];
  for (const el of json.elements ?? []) {
    const tags: Record<string, string> = el.tags ?? {};
    if (el.type === "way") {
      if (!Array.isArray(el.geometry)) continue;
      const pts: LatLon[] = el.geometry.filter(Boolean).map((g: LatLon) => ({ lat: g.lat, lon: g.lon }));
      if (pts.length < 2) continue;
      const closed = pts.length >= 4 && pts[0].lat === pts[pts.length - 1].lat && pts[0].lon === pts[pts.length - 1].lon;
      const what = classifyOsm(tags, closed);
      if (!what) continue;
      if (what.geom === "area") out.push({ geom: "area", kind: what.kind as any, points: pts.slice(0, -1), name: tags.name, ...(what.kind === "building" ? { building: osmBuilding(tags) } : {}) });
      else out.push({ geom: "line", kind: what.kind as any, points: pts, name: tags.name });
    } else if (el.type === "relation" && tags.type === "multipolygon") {
      const what = classifyOsm(tags, true);
      if (what?.geom !== "area") continue;
      for (const ring of outerRings(el.members ?? [])) out.push({ geom: "area", kind: what.kind as any, points: ring, name: tags.name });
    }
  }
  return out;
};

/** The Overpass query for a box: ways, and the multipolygons that lakes, rivers and woods are often mapped as. */
export const overpassQuery = (bounds: GeoBounds) => {
  const box = `(${bounds.south},${bounds.west},${bounds.north},${bounds.east});`;
  const ways = ['way["highway"]', 'way["waterway"]', 'way["natural"~"^(water|wood|sand|beach|grassland|scrub|heath)$"]', 'way["landuse"~"^(reservoir|basin|forest|meadow|grass|village_green)$"]', 'way["amenity"="parking"]', 'way["building"]', 'way["leisure"~"^(playground|pitch|swimming_pool|garden)$"]', 'way["barrier"~"^(fence|wall)$"]'];
  const mp = 'relation["type"="multipolygon"]';
  const relations = [`${mp}["natural"~"^(water|wood|sand|beach|grassland|scrub|heath)$"]`, `${mp}["landuse"~"^(reservoir|basin|forest|meadow|grass)$"]`, `${mp}["waterway"="riverbank"]`, `${mp}["amenity"="parking"]`];
  return `[out:json][timeout:30];(${[...ways, ...relations].map(q => q + box).join("")});out geom;`;
};

/**
 * Paths, roads, water and the rest from OpenStreetMap, asking the next server when one is busy or
 * slow (the main one often is). `onServer` hears which server is being asked (0 first).
 */
export const fetchOsmFeatures = async (bounds: GeoBounds, timeoutMs = OVERPASS_TIMEOUT_MS, onServer?: (index: number) => void): Promise<OsmFeature[]> => {
  const query = overpassQuery(bounds);
  let lastError: unknown = null;
  for (const [index, endpoint] of OVERPASS_ENDPOINTS.entries()) {
    onServer?.(index);
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
      // (A server out of time or memory still answers 200, with what it had and a remark)
      if (typeof json.remark === "string" && /runtime error|timed out|out of memory/i.test(json.remark)) throw new Error(json.remark);
      return osmFeaturesFrom(json);
    } catch (err) {
      lastError = err;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError instanceof Error ? lastError : new Error("OpenStreetMap lookup failed.");
};
