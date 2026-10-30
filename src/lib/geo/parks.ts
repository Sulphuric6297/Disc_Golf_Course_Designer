// The park (or disc golf course) at a place found by search or a spot on the map, from
// OpenStreetMap: its outline, to frame the site to, and whether a disc golf course is mapped there
// and with how many holes. Overpass knows what a spot is inside of; Nominatim has a found place's
// outline and answers when Overpass is busy. Both are asked at once.
import { fetchJson, type GeoBounds } from "./core";
import { askOverpass, outerRings, type LatLon } from "./osm";
import { inUS, padusOutline } from "./usgov";

export type SiteOutline = {
  /** What it is: a disc golf course mapped as one, or a park (a recreation ground, a nature reserve). */
  kind: "course" | "park";
  name?: string;
  /** Its outline (the outer ring), and the box round it. */
  outline: LatLon[];
  bounds: GeoBounds;
  /** A disc golf course mapped there (its own outline, or one inside the park): its name and how
   * many holes are mapped (0: only its outline). */
  course?: { name?: string; holes: number };
  from: "overpass" | "nominatim" | "padus";
};

/** How long Overpass is waited for before Nominatim's outline is used, ms. */
const OVERPASS_WAIT_MS = 6000;

const boxOf = (pts: LatLon[]): GeoBounds => ({
  north: Math.max(...pts.map(p => p.lat)), south: Math.min(...pts.map(p => p.lat)),
  east: Math.max(...pts.map(p => p.lon)), west: Math.min(...pts.map(p => p.lon))
});
/** An outline's area, about (square degrees, scaled by latitude: for comparing). */
const areaOf = (pts: LatLon[]) => {
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) a += (pts[j].lon - pts[i].lon) * (pts[j].lat + pts[i].lat);
  return Math.abs(a / 2) * Math.cos((pts[0].lat * Math.PI) / 180);
};
const inside = (p: LatLon, ring: LatLon[]) => {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if (a.lat > p.lat !== b.lat > p.lat && p.lon < ((b.lon - a.lon) * (p.lat - a.lat)) / (b.lat - a.lat) + a.lon) c = !c;
  }
  return c;
};

/** The Overpass question: the parks and courses the spot is in, the courses within 400 m, and the
 * tees, baskets and holes mapped in them. */
export const outlineQuery = (lat: number, lon: number) => {
  const kinds = '[leisure~"^(park|disc_golf_course|recreation_ground|nature_reserve)$"]';
  return `[out:json][timeout:12];is_in(${lat},${lon})->.a;(way(pivot.a)${kinds};rel(pivot.a)${kinds};way(around:400,${lat},${lon})[leisure=disc_golf_course];rel(around:400,${lat},${lon})[leisure=disc_golf_course];)->.p;.p out geom;.p map_to_area->.pa;(node(area.pa)["disc_golf"~"^(tee|basket)$"];way(area.pa)["disc_golf"="hole"];);out tags center;`;
};

/** The outline from an Overpass answer: the disc golf course the spot is in or next to, else the
 * smallest park it's in (a nature reserve only where there's no park). */
export const outlineFrom = (json: { elements?: any[] }, at: LatLon): SiteOutline | null => {
  type Shape = { kind: string; name?: string; ring: LatLon[] };
  const shapes: Shape[] = [];
  const marks: { kind: string; ref?: string; at: LatLon }[] = [];
  for (const el of json.elements ?? []) {
    const tags: Record<string, string> = el.tags ?? {};
    if (el.type === "way" && tags.leisure && Array.isArray(el.geometry)) {
      const ring = el.geometry.filter(Boolean).map((g: LatLon) => ({ lat: g.lat, lon: g.lon }));
      if (ring.length >= 4) shapes.push({ kind: tags.leisure, name: tags.name, ring: ring.slice(0, -1) });
    } else if (el.type === "relation" && tags.leisure) {
      for (const ring of outerRings(el.members ?? [])) shapes.push({ kind: tags.leisure, name: tags.name, ring });
    } else if (tags.disc_golf) {
      const p = el.type === "node" ? { lat: el.lat, lon: el.lon } : el.center;
      if (p && Number.isFinite(p.lat)) marks.push({ kind: tags.disc_golf, ref: tags.ref, at: { lat: p.lat, lon: p.lon } });
    }
  }
  // How many holes are mapped in an outline: hole ways, else tees or baskets by number
  const holesIn = (ring: LatLon[]) => {
    const here = marks.filter(m => inside(m.at, ring));
    const ways = here.filter(m => m.kind === "hole").length;
    if (ways) return ways;
    const refs = (k: string) => new Set(here.filter(m => m.kind === k).map(m => m.ref ?? `${m.at.lat},${m.at.lon}`)).size;
    return Math.max(refs("tee"), refs("basket"));
  };
  const courses = shapes.filter(s => s.kind === "disc_golf_course").sort((a, b) => Number(inside(at, b.ring)) - Number(inside(at, a.ring)) || areaOf(b.ring) - areaOf(a.ring));
  const parks = shapes.filter(s => s.kind !== "disc_golf_course" && inside(at, s.ring)).sort((a, b) => Number(a.kind === "nature_reserve") - Number(b.kind === "nature_reserve") || areaOf(a.ring) - areaOf(b.ring));
  const course = courses[0];
  const park = parks[0];
  // (a course inside the park: the park's frame, as the course usually is most of it, with the course said)
  const courseInPark = course && park && course.ring.every(p => inside(p, park.ring));
  const main = course && !courseInPark ? course : park ?? course;
  if (!main) return null;
  return {
    kind: main === course ? "course" : "park",
    name: main.name,
    outline: main.ring,
    bounds: boxOf(main.ring),
    ...(course ? { course: { name: course.name, holes: holesIn(course.ring) } } : {}),
    from: "overpass"
  };
};

/** The outline Nominatim has: of the place found (its OpenStreetMap id, "W123"), or of what the
 * spot is on; only a park's or a course's. */
const PARK_TYPE = /^(park|disc_golf_course|recreation_ground|nature_reserve)$/;
const fromNominatim = async (at: LatLon, osmId?: string, signal?: AbortSignal, name?: string): Promise<SiteOutline | null> => {
  // (by its id; else by its name near the spot: a park's outline, where the spot alone gives the
  // street it's on; else what's at the spot)
  const near = { viewbox: `${at.lon - 0.03},${at.lat + 0.03},${at.lon + 0.03},${at.lat - 0.03}`, bounded: "1" };
  const url = osmId
    ? `https://nominatim.openstreetmap.org/lookup?${new URLSearchParams({ osm_ids: osmId, format: "jsonv2", polygon_geojson: "1" })}`
    : name
      ? `https://nominatim.openstreetmap.org/search?${new URLSearchParams({ q: name, format: "jsonv2", polygon_geojson: "1", limit: "8", ...near })}`
      : `https://nominatim.openstreetmap.org/reverse?${new URLSearchParams({ lat: String(at.lat), lon: String(at.lon), format: "jsonv2", zoom: "17", polygon_geojson: "1" })}`;
  const json = await fetchJson(url, 6000, signal);
  const list = (Array.isArray(json) ? json : [json]).filter(Boolean);
  // (a disc golf course before a park; the nearest of each)
  const rank = (r: any) => (r.type === "disc_golf_course" ? 0 : 1) * 1e6 + Math.hypot(+r.lat - at.lat, +r.lon - at.lon);
  const r = list.filter((x: any) => x.category === "leisure" && PARK_TYPE.test(x.type) && /Polygon/.test(x.geojson?.type ?? "")).sort((a: any, b: any) => rank(a) - rank(b))[0];
  if (!r) return name && !osmId ? fromNominatim(at, undefined, signal) : null;
  const g = r.geojson;
  const coords: number[][] | undefined = g?.type === "Polygon" ? g.coordinates[0] : g?.type === "MultiPolygon" ? [...g.coordinates].sort((a: number[][][], b: number[][][]) => b[0].length - a[0].length)[0][0] : undefined;
  if (!coords || coords.length < 4) return null;
  const outline = coords.slice(0, -1).map(([lon, lat]) => ({ lat, lon }));
  const course = r.type === "disc_golf_course";
  return { kind: course ? "course" : "park", name: r.name || undefined, outline, bounds: boxOf(outline), ...(course ? { course: { name: r.name || undefined, holes: 0 } } : {}), from: "nominatim" };
};

/**
 * The outline of the park or the disc golf course at a place (a search result, with its
 * OpenStreetMap id where it has one, or a spot), and the disc golf course mapped there, or null
 * where OpenStreetMap has neither. Overpass is waited for a few seconds (it knows the holes);
 * meanwhile Nominatim's outline is ready to use in its place.
 */
export const findSiteOutline = async (place: { lat: number; lon: number; osmId?: string; name?: string }, signal?: AbortSignal): Promise<SiteOutline | null> => {
  const at = { lat: place.lat, lon: place.lon };
  const overpass = askOverpass(outlineQuery(at.lat, at.lon), { timeoutMs: 12000, signal }).then(json => outlineFrom(json, at));
  const nominatim = fromNominatim(at, place.osmId, signal, place.name).catch(err => { console.info("Nominatim outline unavailable", err); return null; });
  const timely = await Promise.race([overpass.catch(() => undefined), new Promise<undefined>(r => setTimeout(() => r(undefined), OVERPASS_WAIT_MS))]);
  if (timely) return timely;
  const n = await nominatim;
  if (n) return n;
  // (Nominatim had nothing either: Overpass to the end, where it still might; then, in the US,
  // the public land the spot is on, as the USGS has it)
  const late = timely === null ? null : await overpass.catch(() => null);
  if (late) return late;
  const box = { south: at.lat, north: at.lat, west: at.lon, east: at.lon };
  if (!inUS(box)) return null;
  const p = await padusOutline(at, signal).catch(err => { console.info("PAD-US outline unavailable", err); return null; });
  return p ? { kind: "park", name: p.name, outline: p.outline, bounds: boxOf(p.outline), from: "padus" } : null;
};
