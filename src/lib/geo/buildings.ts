// Buildings traced from aerial imagery, for the ones OpenStreetMap hasn't mapped: Overture Maps'
// buildings (Microsoft's and Google's footprints, Esri's community maps, OpenStreetMap), read
// straight from its tile file (PMTiles, any website may read it) a few tiles at a time. No library:
// the tile file's directory and the tiles themselves are small formats, read here.
//
// Data © OpenStreetMap contributors, Overture Maps Foundation, Microsoft, Esri, Google (ODbL).
import type { CourseItem, P, RoofKind, StructureItem } from "../../types";
import type { GeoBounds } from "./core";
import { roofHeights, type Measured } from "../lidar";
import { boundsOf, nearestOnSegment, pointInPolygon, polygonArea, simplify } from "../geom";
import { boxOutline, orientedBox, roofOf } from "../structures";
import { createStructure } from "../course";
import { components, morph, traceOutline } from "./detect";

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
  // (a request that stalls gives up after 20 s, so the import never waits on it for ever)
  const res = await fetch(url, { headers: { Range: `bytes=${from}-${to}` }, signal: AbortSignal.timeout(20000) });
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
  const release = ((await (await fetch(CATALOG, { signal: AbortSignal.timeout(15000) })).json()) as { latest?: string }).latest;
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

/** The roof the survey shows over a building's outline: the kind whose slopes fit its heights best
 * (flat, a single slope, a gable or a hip, its ridge along the building or across it), its pitch
 * (rise over run) and its eaves (ft over the ground). Each kind is fitted as eaves + pitch × how far
 * in from the walls a spot is; a tree or a chimney over the roof (the highest tenth that misses the
 * fit) left out. Null where the survey shows too little of the roof, or no kind fits it within 2 ft. */
export const roofShape = (m: Pick<Measured, "nx" | "ny" | "cell" | "ground" | "surface" | "snx" | "sny">, outline: P[]) => {
  if (outline.length < 3) return null;
  const sc = m.cell * 2, b = boundsOf(outline), pts: P[] = [], hs: number[] = [];
  for (let j = Math.max(0, Math.floor(b.minY / sc)); j <= Math.min(m.sny - 1, Math.floor(b.maxY / sc)); j++)
    for (let i = Math.max(0, Math.floor(b.minX / sc)); i <= Math.min(m.snx - 1, Math.floor(b.maxX / sc)); i++) {
      const p = { x: (i + 0.5) * sc, y: (j + 0.5) * sc };
      if (!pointInPolygon(p, outline) || outline.some((q, k) => nearestOnSegment(p, q, outline[(k + 1) % outline.length]).distance < sc * 0.75)) continue;
      const top = m.surface[j * m.snx + i], gi = Math.min(m.nx - 1, i * 2), gj = Math.min(m.ny - 1, j * 2);
      if (Number.isFinite(top) && Number.isFinite(m.ground[gj * m.nx + gi])) { pts.push(p); hs.push(top - m.ground[gj * m.nx + gi]); }
    }
  // (a dozen spots at least, about 200 sq ft of roof)
  if (hs.length < 12) return null;
  const n = hs.length;
  // h = e + k × run, least squares over the spots kept (k = 0: flat)
  const fit = (runs: number[] | null, keep: boolean[]) => {
    let sw = 0, sx = 0, sy = 0, sxx = 0, sxy = 0;
    for (let q = 0; q < n; q++) if (keep[q]) { const x = runs ? runs[q] : 0; sw++; sx += x; sy += hs[q]; sxx += x * x; sxy += x * hs[q]; }
    const den = sw * sxx - sx * sx;
    const k = runs && Math.abs(den) > 1e-6 ? (sw * sxy - sx * sy) / den : 0;
    const e = (sy - k * sx) / Math.max(1, sw);
    let rss = 0;
    for (let q = 0; q < n; q++) if (keep[q]) { const r = hs[q] - e - k * (runs ? runs[q] : 0); rss += r * r; }
    return { e, k, rss, m: sw };
  };
  const kinds: { kind: RoofKind; across: boolean }[] = [
    { kind: "flat", across: false }, { kind: "shed", across: false }, { kind: "gable", across: false },
    { kind: "gable", across: true }, { kind: "hip", across: false }
  ];
  let best: { kind: RoofKind; across: boolean; e: number; k: number; rms: number; score: number } | null = null;
  for (const c of kinds) {
    const runs = c.kind === "flat" ? null : (() => { const r = roofOf(outline, c.kind, 0, 1, Infinity, c.across); return pts.map(p => r.run(p)); })();
    let keep = hs.map(() => true);
    let f = fit(runs, keep);
    // (once more without the highest tenth above the fit: a tree's leaves, a chimney)
    const res = hs.map((h, q) => h - f.e - f.k * (runs ? runs[q] : 0));
    const cut = [...res].sort((x, y) => x - y)[Math.floor(n * 0.9)];
    keep = res.map(r => r < cut || r <= 0.5);
    f = fit(runs, keep);
    // (a slope that falls inward, or one steeper than 18 in 12, isn't a roof)
    if (runs && (f.k < 0.08 || f.k > 1.5)) continue;
    const rms = Math.sqrt(f.rss / Math.max(1, f.m));
    // (more slopes have to fit enough better to be worth it)
    const score = f.m * Math.log(Math.max(1e-4, f.rss / Math.max(1, f.m))) + (runs ? 2 : 1) * Math.log(f.m) * 2;
    if (!best || score < best.score) best = { kind: c.kind, across: c.across, e: f.e, k: f.k, rms, score };
  }
  if (!best || best.rms > 2 || best.e < 6) return null;
  return {
    kind: best.kind, across: best.across,
    // (to the nearest inch in 12)
    pitch: best.kind === "flat" ? undefined : Math.round(best.k * 12) / 12,
    eaves: Math.min(80, best.e)
  };
};

/** How much of an outline (moved by `dx`, `dy`) the survey shows standing 6 ft or more over the
 * ground: a share of its spots (4 ft apart). */
const raisedShare = (m: Pick<Measured, "nx" | "ny" | "cell" | "ground" | "surface" | "snx" | "sny">, outline: P[], dx = 0, dy = 0) => {
  const sc = m.cell * 2, b = boundsOf(outline);
  let n = 0, up = 0;
  for (let j = Math.max(0, Math.floor((b.minY + dy) / sc)); j <= Math.min(m.sny - 1, Math.floor((b.maxY + dy) / sc)); j++)
    for (let i = Math.max(0, Math.floor((b.minX + dx) / sc)); i <= Math.min(m.snx - 1, Math.floor((b.maxX + dx) / sc)); i++) {
      const p = { x: (i + 0.5) * sc - dx, y: (j + 0.5) * sc - dy };
      if (!pointInPolygon(p, outline)) continue;
      const top = m.surface[j * m.snx + i], gi = Math.min(m.nx - 1, i * 2), gj = Math.min(m.ny - 1, j * 2), gr = m.ground[gj * m.nx + gi];
      if (!Number.isFinite(top) || !Number.isFinite(gr)) continue;
      n++;
      if (top - gr > 6) up++;
    }
  return n ? up / n : null;
};

/** A building's outline lined up with where the survey shows its roof: moved up to 12 ft (2 ft at a
 * time) to stand over the most of it, where that's clearly better than where it came (maps and
 * photos are often a few feet off). Its share standing, as it came and as moved. */
export const fitToSurvey = (m: Pick<Measured, "nx" | "ny" | "cell" | "ground" | "surface" | "snx" | "sny">, outline: P[]) => {
  const was = raisedShare(m, outline);
  if (was === null) return null;
  let best = { dx: 0, dy: 0, share: was };
  for (let dy = -12; dy <= 12; dy += 2) for (let dx = -12; dx <= 12; dx += 2) {
    if (!dx && !dy) continue;
    const s = raisedShare(m, outline, dx, dy);
    if (s !== null && s > best.share + 1e-9) best = { dx, dy, share: s };
  }
  return { was, ...(best.share > was + 0.15 ? best : { dx: 0, dy: 0, share: was }) };
};

/**
 * The buildings as the survey measured them: on 4 ft squares, where something stands 7 ft or more
 * over the ground and is a building's (sorted so by the survey, or solid: the laser came back from
 * it once, as from a roof, not on through as through leaves), in patches of 200 sq ft or more, small
 * gaps closed. Each patch's outline (a clean rectangle where it nearly is one), and which square is
 * whose (`label`, 1 the first).
 */
export const surveyFootprints = (m: Pick<Measured, "nx" | "ny" | "cell" | "ground" | "surface" | "snx" | "sny" | "nUp" | "nMulti"> & { bldg?: Uint8Array }) => {
  const { snx, sny, nx, ny } = m, sc = m.cell * 2;
  const mask = new Uint8Array(snx * sny), raised = new Uint8Array(snx * sny);
  // A roof is a plane (flat, or a slope the same all over): the square and the eight round it lie on
  // one within 9 in; a tree's top, leaves or bare, is lumps and gaps
  const planar = (i: number, j: number) => {
    if (i < 1 || j < 1 || i >= snx - 1 || j >= sny - 1) return false;
    let n = 0, sx = 0, sy = 0, sz = 0, sxx = 0, syy = 0, sxy = 0, sxz = 0, syz = 0;
    const zs: [number, number, number][] = [];
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      const z = m.surface[(j + dj) * snx + i + di];
      if (!Number.isFinite(z)) return false;
      zs.push([di, dj, z]);
      n++; sx += di; sy += dj; sz += z; sxx += di * di; syy += dj * dj; sxy += di * dj; sxz += di * z; syz += dj * z;
    }
    // (the grid's offsets are symmetric: the plane's slopes each way are their own sums)
    const a = sxz / sxx, b = syz / syy, c = sz / n;
    let rss = 0;
    for (const [x, y, z] of zs) { const r = z - (c + a * x + b * y); rss += r * r; }
    return Math.sqrt(rss / n) < 0.75 && Math.abs(a) < sc * 1.2 && Math.abs(b) < sc * 1.2;
  };
  for (let j = 0; j < sny; j++) for (let i = 0; i < snx; i++) {
    let up = 0, mu = 0, b = 0, gr = Infinity;
    for (let dj = 0; dj < 2; dj++) for (let di = 0; di < 2; di++) {
      const a = i * 2 + di, c = j * 2 + dj;
      if (a >= nx || c >= ny) continue;
      const k = c * nx + a;
      up += m.nUp[k]; mu += m.nMulti[k]; b |= m.bldg?.[k] ?? 0;
      if (Number.isFinite(m.ground[k])) gr = Math.min(gr, m.ground[k]);
    }
    const top = m.surface[j * snx + i];
    if (!Number.isFinite(top) || !Number.isFinite(gr) || top - gr < 7) continue;
    raised[j * snx + i] = 1;
    if (b || planar(i, j)) mask[j * snx + i] = 1;
  }
  // (its ridge and its edges, where the squares round aren't all on its plane: grown back out a
  // square, over what stands up only)
  const grown = morph(morph(morph(mask, snx, sny, 1, "grow"), snx, sny, 1, "shrink"), snx, sny, 1, "grow");
  const closed = new Uint8Array(snx * sny);
  for (let k = 0; k < closed.length; k++) closed[k] = grown[k] && raised[k] ? 1 : 0;
  const label = new Int32Array(snx * sny);
  const outlines: P[][] = [];
  for (const comp of components(closed, snx, sny, Math.ceil(200 / (sc * sc)))) {
    const ring = traceOutline(snx, sny, comp).map(q => ({ x: q.x * sc, y: q.y * sc }));
    let pts = simplify(ring, sc * 0.75);
    if (pts.length < 3) continue;
    // (a rectangle near enough: as a rectangle, its sides straight)
    const box = orientedBox(pts);
    if (polygonArea(pts) >= box.a * box.b * 4 * 0.85) pts = boxOutline(pts);
    outlines.push(pts);
    for (const k of comp) label[k] = outlines.length;
  }
  return { outlines, label, snx, sny, sc };
};

/**
 * The maps' buildings set by the survey's as they're brought in: one that matches a building the
 * survey measured takes its outline (where it stands, its true shape: a map's outline is often a
 * few feet off, or two buildings and a deck run together); FEMA's or one traced from the air over
 * flat ground (a slab, a deck, a pool) is left out; one the survey doesn't show at all (built since)
 * stays as it came. A building the survey measured that no map has comes in as measured.
 */
export const setBySurvey = (items: CourseItem[], m: Measured) => {
  const fp = surveyFootprints(m);
  const { label, snx, sny, sc } = fp;
  const used = new Set<number>();
  let matched = 0, dropped = 0;
  const out: CourseItem[] = [];
  const isMapped = (i: CourseItem): i is StructureItem => i.type === "structure" && i.kind === "building" && (i.importSource === "osm" || i.importSource === "traced" || i.importSource === "fema");
  // (the bigger buildings first: they choose their match first)
  const order = items.map((i, k) => ({ i, k, a: isMapped(i) ? polygonArea(i.points) : 0 })).sort((x, y) => y.a - x.a);
  const result = new Map<number, CourseItem | null>();
  for (const { i, k } of order) {
    if (!isMapped(i)) { result.set(k, i); continue; }
    // Its squares, and whose they are
    const b = boundsOf(i.points), count = new Map<number, number>();
    let n = 0;
    for (let j = Math.max(0, Math.floor(b.minY / sc)); j <= Math.min(sny - 1, Math.floor(b.maxY / sc)); j++)
      for (let x = Math.max(0, Math.floor(b.minX / sc)); x <= Math.min(snx - 1, Math.floor(b.maxX / sc)); x++) {
        if (!pointInPolygon({ x: (x + 0.5) * sc, y: (j + 0.5) * sc }, i.points)) continue;
        n++;
        const L = label[j * snx + x];
        if (L) count.set(L, (count.get(L) ?? 0) + 1);
      }
    let best = 0, bestN = 0;
    for (const [L, c] of count) if (c > bestN && !used.has(L)) { best = L; bestN = c; }
    const size = best ? fp.outlines[best - 1] && Math.round(polygonArea(fp.outlines[best - 1]) / (sc * sc)) : 0;
    if (best && n && bestN / n > 0.3 && bestN / Math.max(1, size) > 0.3) {
      used.add(best);
      matched++;
      const pts = fp.outlines[best - 1];
      const c = pts.reduce((s, p) => ({ x: s.x + p.x / pts.length, y: s.y + p.y / pts.length }), { x: 0, y: 0 });
      result.set(k, { ...i, points: pts.map(p => ({ ...p })), x: c.x, y: c.y });
      continue;
    }
    // (no building the survey measured there: flat ground under a FEMA or traced one, left out)
    const share = raisedShare(m, i.points);
    if (share !== null && share < 0.33 && i.importSource !== "osm") { dropped++; result.set(k, null); continue; }
    result.set(k, i);
  }
  items.forEach((_, k) => { const v = result.get(k); if (v) out.push(v); });
  // The survey's buildings no map has (450 sq ft and more)
  let added = 0;
  fp.outlines.forEach((pts, k) => {
    if (used.has(k + 1) || polygonArea(pts) < 450) return;
    if (out.some(i => i.type === "structure" && i.points.length > 2 && pointInPolygon(pts[0], i.points))) return;
    out.push({ ...createStructure("building", pts.map(p => ({ ...p }))), importSource: "lidar" } as StructureItem);
    added++;
  });
  return { items: out, matched, dropped, added };
};

/**
 * Buildings lined up with the survey as they're brought in (`opts.fit`): each moved over its roof as
 * the survey shows it; one traced from the air or from FEMA where the survey shows flat ground (a
 * slab, a deck, a pool: under a third of it standing) left out. OpenStreetMap's are kept, moved.
 */
export const fittedToSurvey = (items: CourseItem[], m: Measured): { items: CourseItem[]; moved: number; dropped: number } => {
  let moved = 0, dropped = 0;
  const out: CourseItem[] = [];
  for (const i of items) {
    if (i.type !== "structure" || i.kind !== "building" || (i.importSource !== "osm" && i.importSource !== "traced" && i.importSource !== "fema")) { out.push(i); continue; }
    const fit = fitToSurvey(m, i.points);
    if (!fit) { out.push(i); continue; }
    if (fit.share < 0.33 && i.importSource !== "osm") { dropped++; continue; }
    if (fit.dx || fit.dy) {
      moved++;
      out.push({ ...i, x: i.x + fit.dx, y: i.y + fit.dy, points: i.points.map(p => ({ x: p.x + fit.dx, y: p.y + fit.dy })) });
    } else out.push(i);
  }
  return { items: out, moved, dropped };
};

/**
 * The buildings that came in without a height (OpenStreetMap's and those traced from the air),
 * given the one the survey measured over their roofs: the walls up to the eaves, and a flat roof
 * where the roof is level. A height the map has is kept. A building the survey doesn't show (built
 * since it flew) stays as it came. `sign` is called on each one changed (the import's `signed`).
 */
export const withMeasuredHeights = (items: CourseItem[], m: Measured, sign: (i: StructureItem) => StructureItem = i => i): CourseItem[] =>
  items.map(i => {
    if (i.type !== "structure" || i.kind !== "building" || (i.importSource !== "osm" && i.importSource !== "traced" && i.importSource !== "fema" && i.importSource !== "lidar")) return i;
    // The roof's own shape where the survey shows it clearly: its kind (unless the map names one, or
    // it's been measured before), its pitch and the way its ridge runs, the walls up to its eaves
    const shape = roofShape(m, i.points);
    const reshape = shape && i.roofPitch === undefined && i.ridgeAcross === undefined && (!i.roof || i.importSource === "traced" || i.roof === shape.kind);
    if (shape && (reshape || i.height === undefined)) {
      const out: StructureItem = { ...i };
      if (i.height === undefined) out.height = Math.round(shape.eaves * 2) / 2;
      if (reshape) {
        out.roof = shape.kind;
        if (shape.pitch) out.roofPitch = shape.pitch;
        if (shape.across) out.ridgeAcross = true;
      }
      return sign(out);
    }
    if (i.height !== undefined) return i;
    const r = roofHeights(m, i.points);
    if (!r) return i;
    const out: StructureItem = { ...i, height: Math.round(r.eaves * 2) / 2 };
    if (r.flat && !i.roof) out.roof = "flat";
    return sign(out);
  });
