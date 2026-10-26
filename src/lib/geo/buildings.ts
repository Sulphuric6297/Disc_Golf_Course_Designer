// Buildings traced from aerial imagery, for the ones OpenStreetMap hasn't mapped: Overture Maps'
// buildings (Microsoft's and Google's footprints, Esri's community maps, OpenStreetMap), read
// straight from its tile file (PMTiles, any website may read it) a few tiles at a time. No library:
// the tile file's directory and the tiles themselves are small formats, read here.
//
// Data © OpenStreetMap contributors, Overture Maps Foundation, Microsoft, Esri, Google (ODbL).
import type { CourseItem, StructureItem } from "../../types";
import type { GeoBounds } from "./core";
import { roofHeights, type Measured } from "../lidar";

export type TracedBuilding = {
  /** Its outline (the outer ring), lat/lon. */
  points: { lat: number; lon: number }[];
  /** Its height, m, when known (often measured from the air). */
  heightM?: number;
  /** Who traced it ("Microsoft ML Buildings", "Esri Community Maps", ...), and how sure they are (0-1). */
  source: string;
  confidence: number | null;
};

const CATALOG = "https://stac.overturemaps.org/catalog.json";
const FILE = (release: string) => `https://tiles.overturemaps.org/${release}/buildings.pmtiles`;
/** The zoom the buildings are kept at, whole (a tile ~2 km across at mid latitudes). */
const Z = 14;

// ---------------------------------------------------------------- reading bytes

/** Bytes `from` to `to` (inclusive) of the file. (Only a Range header: no preflight needed.) */
const range = async (url: string, from: number, to: number) => {
  const res = await fetch(url, { headers: { Range: `bytes=${from}-${to}` } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
};
const gunzip = async (b: Uint8Array) => new Uint8Array(await new Response(new Blob([b as BlobPart]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer());
/** Decompressed as the file says it's compressed (1 none, 2 gzip). */
const inflate = (b: Uint8Array, how: number) => (how === 2 ? gunzip(b) : Promise.resolve(b));

/** A little-endian whole number of up to 53 bits at `at`. */
const u64 = (b: Uint8Array, at: number) => {
  let v = 0;
  for (let i = 7; i >= 0; i--) v = v * 256 + b[at + i];
  return v;
};

/** A reader of protobuf-style varints. */
class Bytes {
  pos = 0;
  constructor(public b: Uint8Array) {}
  varint() {
    let v = 0, shift = 1, byte: number;
    do { byte = this.b[this.pos++]; v += (byte & 0x7f) * shift; shift *= 128; } while (byte & 0x80);
    return v;
  }
  get done() { return this.pos >= this.b.length; }
}

// ---------------------------------------------------------------- the tile file's directory

type Header = { rootOffset: number; rootLength: number; leafOffset: number; tileOffset: number; internal: number; tiles: number };
type Entry = { id: number; offset: number; length: number; run: number };

const headerOf = (b: Uint8Array): Header => {
  if (String.fromCharCode(...b.slice(0, 7)) !== "PMTiles" || b[7] !== 3) throw new Error("not a PMTiles v3 file");
  return { rootOffset: u64(b, 8), rootLength: u64(b, 16), leafOffset: u64(b, 40), tileOffset: u64(b, 56), internal: b[97], tiles: b[98] };
};

const directory = (b: Uint8Array): Entry[] => {
  const r = new Bytes(b), n = r.varint(), out: Entry[] = [];
  let id = 0;
  for (let i = 0; i < n; i++) { id += r.varint(); out.push({ id, offset: 0, length: 0, run: 0 }); }
  for (let i = 0; i < n; i++) out[i].run = r.varint();
  for (let i = 0; i < n; i++) out[i].length = r.varint();
  for (let i = 0; i < n; i++) {
    const v = r.varint();
    out[i].offset = v === 0 && i > 0 ? out[i - 1].offset + out[i - 1].length : v - 1;
  }
  return out;
};

/** The entry for tile `id` (a tile, a run of the same tile, or a leaf directory to look in). */
const find = (dir: Entry[], id: number) => {
  let lo = 0, hi = dir.length - 1;
  while (lo <= hi) {
    const m = (lo + hi) >> 1;
    if (dir[m].id < id) lo = m + 1;
    else if (dir[m].id > id) hi = m - 1;
    else return dir[m];
  }
  if (hi >= 0) {
    const e = dir[hi];
    if (e.run === 0 || id - e.id < e.run) return e;
  }
  return null;
};

/** A tile's number along the Hilbert curve the file orders its tiles by (PMTiles' tile id). */
export const tileId = (z: number, x: number, y: number) => {
  let acc = 0;
  for (let t = 0; t < z; t++) acc += 4 ** t;
  const n = 2 ** z;
  let d = 0, rx: number, ry: number;
  for (let s = n / 2; s >= 1; s /= 2) {
    rx = (x & s) > 0 ? 1 : 0;
    ry = (y & s) > 0 ? 1 : 0;
    d += s * s * ((3 * rx) ^ ry);
    if (ry === 0) {
      if (rx === 1) { x = s - 1 - x; y = s - 1 - y; }
      [x, y] = [y, x];
    }
  }
  return acc + d;
};

// ---------------------------------------------------------------- a tile's buildings

type Value = string | number | boolean | null;
/** A vector tile's `building` layer: each building's properties and outer rings, in tile units. */
const buildingsInTile = (b: Uint8Array) => {
  const tile = new Bytes(b);
  const out: { props: Record<string, Value>; rings: [number, number][][]; extent: number }[] = [];
  while (!tile.done) {
    const tag = tile.varint();
    if (tag >> 3 !== 3 || (tag & 7) !== 2) { skip(tile, tag & 7); continue; }
    const len = tile.varint(), layer = new Bytes(tile.b.subarray(tile.pos, tile.pos + len));
    tile.pos += len;
    let name = "", extent = 4096;
    const keys: string[] = [], values: Value[] = [], feats: Uint8Array[] = [];
    while (!layer.done) {
      const t = layer.varint(), f = t >> 3;
      if (f === 1) name = str(layer);
      else if (f === 2) feats.push(sub(layer));
      else if (f === 3) keys.push(str(layer));
      else if (f === 4) values.push(valueOf(sub(layer)));
      else if (f === 5) extent = layer.varint();
      else skip(layer, t & 7);
    }
    if (name !== "building") continue;
    for (const fb of feats) {
      const f = new Bytes(fb);
      let tags: number[] = [], geom: number[] = [], type = 0;
      while (!f.done) {
        const t = f.varint(), k = t >> 3;
        if (k === 2) tags = packed(f);
        else if (k === 3) type = f.varint();
        else if (k === 4) geom = packed(f);
        else skip(f, t & 7);
      }
      if (type !== 3) continue;
      const props: Record<string, Value> = {};
      for (let i = 0; i + 1 < tags.length; i += 2) props[keys[tags[i]]] = values[tags[i + 1]];
      out.push({ props, rings: ringsOf(geom), extent });
    }
  }
  return out;
};
const sub = (r: Bytes) => { const len = r.varint(), s = r.b.subarray(r.pos, r.pos + len); r.pos += len; return s; };
const str = (r: Bytes) => new TextDecoder().decode(sub(r));
const packed = (r: Bytes) => { const s = new Bytes(sub(r)), out: number[] = []; while (!s.done) out.push(s.varint()); return out; };
const skip = (r: Bytes, wire: number) => {
  if (wire === 0) r.varint();
  else if (wire === 1) r.pos += 8;
  else if (wire === 2) { const len = r.varint(); r.pos += len; }
  else if (wire === 5) r.pos += 4;
};
const valueOf = (b: Uint8Array): Value => {
  const r = new Bytes(b);
  while (!r.done) {
    const t = r.varint(), f = t >> 3;
    if (f === 1) return str(r);
    if (f === 2) { const v = new DataView(b.buffer, b.byteOffset + r.pos, 4).getFloat32(0, true); r.pos += 4; return v; }
    if (f === 3) { const v = new DataView(b.buffer, b.byteOffset + r.pos, 8).getFloat64(0, true); r.pos += 8; return v; }
    if (f === 4 || f === 5) return r.varint();
    if (f === 6) { const v = r.varint(); return v % 2 ? -(v + 1) / 2 : v / 2; }
    if (f === 7) return r.varint() !== 0;
    skip(r, t & 7);
  }
  return null;
};
/** A polygon's rings from its drawing commands (MoveTo, LineTo, ClosePath; zigzag deltas). */
const ringsOf = (g: number[]) => {
  const rings: [number, number][][] = [];
  let x = 0, y = 0, ring: [number, number][] = [], i = 0;
  const zz = (v: number) => ((v >>> 1) ^ -(v & 1));
  while (i < g.length) {
    const cmd = g[i] & 7, count = g[i] >> 3;
    i++;
    if (cmd === 7) { if (ring.length >= 3) rings.push(ring); ring = []; continue; }
    for (let k = 0; k < count; k++) {
      x += zz(g[i++]);
      y += zz(g[i++]);
      if (cmd === 1) { if (ring.length >= 3) rings.push(ring); ring = [[x, y]]; }
      else ring.push([x, y]);
    }
  }
  return rings;
};
/** Twice a ring's signed area (in tile units, y down: an outer ring's is positive). */
const signedArea = (r: [number, number][]) => {
  let s = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) s += (r[j][0] * r[i][1] - r[i][0] * r[j][1]);
  return s;
};

// ---------------------------------------------------------------- the site's buildings

const lonToX = (lon: number, z: number) => Math.floor(((lon + 180) / 360) * 2 ** z);
const latToY = (lat: number, z: number) => { const r = (lat * Math.PI) / 180; return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z); };
const lonOf = (x: number, z: number) => (x / 2 ** z) * 360 - 180;
const latOf = (y: number, z: number) => { const n = Math.PI - (2 * Math.PI * y) / 2 ** z; return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))); };

/** The buildings over a site that weren't mapped by OpenStreetMap, traced from imagery, each its
 * outline (outer ring), height when known, who traced it and how sure. */
export const tracedBuildings = async (bounds: GeoBounds): Promise<TracedBuilding[]> => (await allBuildings(bounds)).filter(b => b.source !== "OpenStreetMap");

// (the last few sites' lookups, shared: the import and the trees measured from the air ask at once)
const lookups = new Map<string, Promise<TracedBuilding[]>>();
/** Every building Overture has over a site: those traced from the air and OpenStreetMap's. Looked
 * up once a site, however many ask. */
export const allBuildings = (bounds: GeoBounds): Promise<TracedBuilding[]> => {
  const key = [bounds.north, bounds.south, bounds.west, bounds.east].map(v => v.toFixed(6)).join(",");
  let got = lookups.get(key);
  if (!got) {
    got = overtureBuildings(bounds);
    got.catch(() => lookups.delete(key));
    lookups.set(key, got);
    if (lookups.size > 3) lookups.delete(lookups.keys().next().value!);
  }
  return got;
};

const overtureBuildings = async (bounds: GeoBounds): Promise<TracedBuilding[]> => {
  const release = ((await (await fetch(CATALOG)).json()) as { latest?: string }).latest;
  if (!release) throw new Error("no Overture release");
  const url = FILE(release);
  const head = await range(url, 0, 16383);
  const h = headerOf(head);
  const root = directory(await inflate(head.slice(h.rootOffset, h.rootOffset + h.rootLength), h.internal));
  const leaves = new Map<number, Entry[]>();
  const entryFor = async (id: number): Promise<Entry | null> => {
    let dir = root;
    for (let depth = 0; depth < 4; depth++) {
      const e = find(dir, id);
      if (!e) return null;
      if (e.run > 0) return e;
      // (a leaf directory: read it once)
      let leaf = leaves.get(e.offset);
      if (!leaf) {
        leaf = directory(await inflate(await range(url, h.leafOffset + e.offset, h.leafOffset + e.offset + e.length - 1), h.internal));
        leaves.set(e.offset, leaf);
      }
      dir = leaf;
    }
    return null;
  };
  const out: TracedBuilding[] = [];
  const seen = new Set<string>();
  for (let x = lonToX(bounds.west, Z); x <= lonToX(bounds.east, Z); x++) {
    for (let y = latToY(bounds.north, Z); y <= latToY(bounds.south, Z); y++) {
      const e = await entryFor(tileId(Z, x, y));
      if (!e) continue;
      const data = await inflate(await range(url, h.tileOffset + e.offset, h.tileOffset + e.offset + e.length - 1), h.tiles);
      for (const b of buildingsInTile(data)) {
        const source = String(b.props["@geometry_source"] ?? "");
        const id = String(b.props.id ?? "");
        if (id && seen.has(id)) continue;
        if (id) seen.add(id);
        const outer = b.rings.find(r => signedArea(r) > 0) ?? b.rings[0];
        if (!outer) continue;
        const points = outer.map(([px, py]) => ({ lon: lonOf(x + px / b.extent, Z), lat: latOf(y + py / b.extent, Z) }));
        if (!points.some(p => p.lat <= bounds.north && p.lat >= bounds.south && p.lon >= bounds.west && p.lon <= bounds.east)) continue;
        let confidence: number | null = null;
        try { const s = JSON.parse(String(b.props.sources ?? "[]")); confidence = typeof s[0]?.confidence === "number" ? s[0].confidence : null; } catch { /* (no sources given) */ }
        const height = typeof b.props.height === "number" ? b.props.height : undefined;
        out.push({ points, heightM: height, source, confidence });
      }
    }
  }
  return out;
};

/**
 * The buildings that came in without a height (OpenStreetMap's and those traced from the air),
 * given the one the survey measured over their roofs: the walls up to the eaves, and a flat roof
 * where the roof is level. A height the map has is kept. A building the survey doesn't show (built
 * since it flew) stays as it came. `sign` is called on each one changed (the import's `signed`).
 */
export const withMeasuredHeights = (items: CourseItem[], m: Measured, sign: (i: StructureItem) => StructureItem = i => i): CourseItem[] =>
  items.map(i => {
    if (i.type !== "structure" || i.kind !== "building" || i.height !== undefined || (i.importSource !== "osm" && i.importSource !== "traced")) return i;
    const r = roofHeights(m, i.points);
    if (!r) return i;
    const out: StructureItem = { ...i, height: Math.round(r.eaves * 2) / 2 };
    if (r.flat && !i.roof) out.roof = "flat";
    return sign(out);
  });
