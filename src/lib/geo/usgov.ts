// The US government's own maps of a site, free to use, no key, open to any website (CORS):
// - creeks, rivers, canals and ponds: USGS 3D Hydrography Program (3DHP), the national map of
//   water, refreshed from the newest surveys (it finds small creeks no one has put on OpenStreetMap);
// - wetlands: USFWS National Wetlands Inventory (marsh, wet meadows, swamps, ponds);
// - buildings: FEMA / Oak Ridge National Laboratory's USA Structures, every building in the US
//   outlined from aerial photos and checked by hand (CC BY 4.0).
// Each comes as the same features OpenStreetMap's do, so they're drawn the same way.
import { fetchJson, type GeoBounds } from "./core";
import type { LatLon, OsmFeature } from "./osm";

const HYDRO = "https://hydro.nationalmap.gov/arcgis/rest/services/3DHP_all/FeatureServer";
const WETLANDS = "https://fwspublicservices.wim.usgs.gov/wetlandsmapservice/rest/services/Wetlands/MapServer/0";
const STRUCTURES = "https://services2.arcgis.com/FiaPA4ga0iQKduv3/arcgis/rest/services/USA_Structures_View/FeatureServer/0";

/** The credit for each, as printed on the map. */
export const GOV_CREDITS = {
  usgs: "Water: USGS The National Map, 3D Hydrography Program",
  nwi: "Wetlands: U.S. Fish & Wildlife Service, National Wetlands Inventory",
  fema: "Buildings: FEMA, Oak Ridge National Laboratory USA Structures"
} as const;

/** The lower 48, Alaska and Hawaii, roughly: where these maps are. */
const US: GeoBounds[] = [
  { south: 24.3, north: 49.5, west: -125, east: -66.8 },
  { south: 51, north: 71.5, west: -170, east: -129 },
  { south: 18.8, north: 22.4, west: -160.5, east: -154.6 }
];
export const inUS = (b: GeoBounds) => US.some(r => b.west < r.east && b.east > r.west && b.south < r.north && b.north > r.south);

type EsriFeature = { attributes: Record<string, unknown>; geometry?: { paths?: number[][][]; rings?: number[][][] } };

/** The features of one layer over a box (outlines and lines in degrees), up to `max`. */
const query = async (layer: string, b: GeoBounds, fields: string, opts: { signal?: AbortSignal; timeoutMs?: number; max?: number; where?: string } = {}) => {
  const q = new URLSearchParams({
    where: opts.where ?? "1=1",
    geometry: `${b.west},${b.south},${b.east},${b.north}`,
    geometryType: "esriGeometryEnvelope", inSR: "4326", spatialRel: "esriSpatialRelIntersects",
    outFields: fields, outSR: "4326", returnGeometry: "true", resultRecordCount: String(opts.max ?? 2000), f: "json"
  });
  const json = await fetchJson(`${layer}/query?${q}`, opts.timeoutMs ?? 20000, opts.signal);
  return (json.features ?? []) as EsriFeature[];
};

const lonLat = (pts: number[][]): LatLon[] => pts.map(([lon, lat]) => ({ lat, lon }));
const text = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
/** Its name, in whichever field the layer keeps it. */
const nameOf = (a: Record<string, unknown>) => text(a.gnisidlabel) ?? text(a.gnis_name) ?? text(a.GNIS_NAME) ?? text(a.name);

/** A creek's width from its stream order (how many branches have joined it): a first-order
 * creek a step across, a big river many yards. */
const widthByOrder = (order: unknown) => {
  const o = typeof order === "number" ? order : 1;
  return o <= 1 ? 1 : o === 2 ? 1.5 : o === 3 ? 3 : o === 4 ? 6 : o === 5 ? 12 : 25;
};

/** Creeks, rivers and canals (their lines, not the connectors through lakes), and lakes and ponds
 * (marshes and swamps as wet ground). */
export const fetchWater = async (b: GeoBounds, opts: { signal?: AbortSignal } = {}): Promise<OsmFeature[]> => {
  const [lines, bodies] = await Promise.all([
    query(`${HYDRO}/50`, b, "featuretypelabel,streamorder,gnisidlabel", opts),
    // (the lakes and ponds layer sometimes answers with nothing: the creeks still come)
    query(`${HYDRO}/60`, b, "featuretypelabel,gnisidlabel", opts).catch(err => { if (opts.signal?.aborted) throw err; console.info("USGS ponds unavailable", err); return [] as EsriFeature[]; })
  ]);
  const out: OsmFeature[] = [];
  for (const f of lines) {
    const kind = String(f.attributes.featuretypelabel ?? "");
    if (!/channel|canal|ditch|stream|river/i.test(kind)) continue;
    for (const path of f.geometry?.paths ?? []) if (path.length >= 2) out.push({ geom: "line", kind: "stream", points: lonLat(path), name: nameOf(f.attributes), widthM: widthByOrder(f.attributes.streamorder) });
  }
  for (const f of bodies) {
    const kind = String(f.attributes.featuretypelabel ?? "");
    const wet = /swamp|marsh|wetland/i.test(kind);
    for (const ring of f.geometry?.rings ?? []) if (ring.length >= 4) out.push({ geom: "area", kind: wet ? "rough" : "water", points: lonLat(ring), name: nameOf(f.attributes) });
  }
  return out;
};

/** Wetlands: open water where it's a pond or lake, wet ground (rough) where it's marsh, a wet
 * meadow, a swamp or a bog; rivers' own channels are left to the water's lines. */
export const fetchWetlands = async (b: GeoBounds, opts: { signal?: AbortSignal } = {}): Promise<OsmFeature[]> => {
  const got = await query(WETLANDS, b, "WETLAND_TYPE,ATTRIBUTE", { ...opts, max: 500 });
  const out: OsmFeature[] = [];
  for (const f of got) {
    const type = String(f.attributes.WETLAND_TYPE ?? "");
    if (/riverine/i.test(type)) continue;
    const water = /pond|lake/i.test(type);
    for (const ring of f.geometry?.rings ?? []) if (ring.length >= 4) out.push({ geom: "area", kind: water ? "water" : "rough", points: lonLat(ring), name: water ? undefined : "Wetland" });
  }
  return out;
};

/** Every building outlined, with what it's used for (a home, a school, a farm building) where
 * known. The service sometimes stalls: a short wait, then its ids first and the outlines by id. */
export const fetchStructures = async (b: GeoBounds, opts: { signal?: AbortSignal } = {}): Promise<OsmFeature[]> => {
  const fields = "OCC_CLS,PRIM_OCC,HEIGHT";
  let got: EsriFeature[];
  try {
    got = await query(STRUCTURES, b, fields, { ...opts, timeoutMs: 12000 });
  } catch (err) {
    if (opts.signal?.aborted) throw err;
    const q = new URLSearchParams({ where: "1=1", geometry: `${b.west},${b.south},${b.east},${b.north}`, geometryType: "esriGeometryEnvelope", inSR: "4326", spatialRel: "esriSpatialRelIntersects", returnIdsOnly: "true", f: "json" });
    const ids = ((await fetchJson(`${STRUCTURES}/query?${q}`, 12000, opts.signal)).objectIds ?? []) as number[];
    if (!ids.length) return [];
    const byId = new URLSearchParams({ objectIds: ids.slice(0, 1000).join(","), outFields: fields, outSR: "4326", returnGeometry: "true", f: "json" });
    got = ((await fetchJson(`${STRUCTURES}/query?${byId}`, 20000, opts.signal)).features ?? []) as EsriFeature[];
  }
  const out: OsmFeature[] = [];
  for (const f of got) {
    const ring = f.geometry?.rings?.[0];
    if (!ring || ring.length < 4) continue;
    const h = typeof f.attributes.HEIGHT === "number" && f.attributes.HEIGHT > 0 ? f.attributes.HEIGHT : undefined;
    out.push({ geom: "area", kind: "building", points: lonLat(ring), building: h ? { heightM: h } : {} });
  }
  return out;
};

const PADUS = "https://services.arcgis.com/v01gqwM5QqNysAAi/arcgis/rest/services/Fee_Managers_PADUS/FeatureServer/0";
/** The credit for the park edges, from the USGS's own citation. */
export const PADUS_CREDIT = "Park boundaries: USGS Gap Analysis Project, PAD-US 4.1";

/** The public land a spot is on, from the USGS's Protected Areas Database (city and county parks,
 * school grounds, state and federal land): the smallest under 2,000 acres that holds it (a national
 * forest is no frame for a course), its name and its outline. Null where none is. */
export const padusOutline = async (at: { lat: number; lon: number }, signal?: AbortSignal) => {
  const q = new URLSearchParams({
    where: "1=1", geometry: `${at.lon},${at.lat}`, geometryType: "esriGeometryPoint", inSR: "4326",
    spatialRel: "esriSpatialRelIntersects", outFields: "Unit_Nm,Loc_Nm,GIS_Acres", outSR: "4326", returnGeometry: "true", f: "json"
  });
  const json = await fetchJson(`${PADUS}/query?${q}`, 10000, signal);
  const got = ((json.features ?? []) as EsriFeature[])
    .map(f => ({ f, acres: typeof f.attributes.GIS_Acres === "number" ? f.attributes.GIS_Acres : Infinity }))
    .filter(x => x.acres < 2000 && (x.f.geometry?.rings?.[0]?.length ?? 0) >= 4)
    .sort((a, b) => a.acres - b.acres)[0];
  if (!got) return null;
  // (the outer ring holding the spot, or the biggest)
  const rings = got.f.geometry!.rings!.map(lonLat);
  const holds = (r: LatLon[]) => {
    let inside = false;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const a = r[i], b = r[j];
      if ((a.lat > at.lat) !== (b.lat > at.lat) && at.lon < ((b.lon - a.lon) * (at.lat - a.lat)) / (b.lat - a.lat) + a.lon) inside = !inside;
    }
    return inside;
  };
  const outline = rings.find(holds) ?? rings.sort((a, b) => b.length - a.length)[0];
  return { name: text(got.f.attributes.Loc_Nm) ?? text(got.f.attributes.Unit_Nm), outline };
};
