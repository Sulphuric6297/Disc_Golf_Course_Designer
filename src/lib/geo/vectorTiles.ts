// OpenStreetMap's paths, roads, water, woods, grass and buildings from OpenFreeMap's vector tiles
// (free, no key, served from a CDN), for when every Overpass server is busy. The tiles follow the
// OpenMapTiles schema; this reads them (Mapbox Vector Tile protobufs) without a library.
import type { GeoBounds } from "./core";
import { osmBuilding, type LatLon, type OsmFeature } from "./osm";

export const OPENFREEMAP_TILEJSON = "https://tiles.openfreemap.org/planet";
/** The tiles' most detailed zoom (each about 2.4 km across at the equator). */
const ZOOM = 14;

// ---------------------------------------------------------------- protobuf reading

class Pbf {
  pos = 0;
  constructor(private buf: Uint8Array, readonly end = buf.length) {}
  varint(): number {
    let result = 0, shift = 0, b: number;
    do {
      b = this.buf[this.pos++];
      result += (b & 0x7f) * 2 ** shift;
      shift += 7;
    } while (b >= 0x80 && shift < 70);
    return result;
  }
  /** Each field of a message: its number, wire type and where its bytes are. */
  *fields(): Generator<{ field: number; type: number }> {
    while (this.pos < this.end) {
      const tag = this.varint();
      yield { field: Math.floor(tag / 8), type: tag & 7 };
    }
  }
  bytes(): Pbf {
    const len = this.varint();
    const sub = new Pbf(this.buf, this.pos + len);
    sub.pos = this.pos;
    this.pos += len;
    return sub;
  }
  string(): string {
    const sub = this.bytes();
    return new TextDecoder().decode(this.buf.subarray(sub.pos, sub.end));
  }
  packed(): number[] {
    const sub = this.bytes(), out: number[] = [];
    while (sub.pos < sub.end) out.push(sub.varint());
    return out;
  }
  skip(type: number) {
    if (type === 0) this.varint();
    else if (type === 1) this.pos += 8;
    else if (type === 2) this.pos += this.varint();
    else if (type === 5) this.pos += 4;
  }
  float(): number {
    const v = new DataView(this.buf.buffer, this.buf.byteOffset + this.pos, 4).getFloat32(0, true);
    this.pos += 4;
    return v;
  }
  double(): number {
    const v = new DataView(this.buf.buffer, this.buf.byteOffset + this.pos, 8).getFloat64(0, true);
    this.pos += 8;
    return v;
  }
}

const zigzag = (n: number) => (n % 2 === 1 ? -(n + 1) / 2 : n / 2);

export type TileFeature = { type: 1 | 2 | 3; tags: Record<string, string | number | boolean>; rings: { x: number; y: number }[][] };
export type TileLayer = { name: string; extent: number; features: TileFeature[] };

/** The layers of a vector tile: each feature's tags and its geometry (tile units, 0..extent). */
export const decodeMvt = (data: Uint8Array): TileLayer[] => {
  const tile = new Pbf(data);
  const layers: TileLayer[] = [];
  for (const { field, type } of tile.fields()) {
    if (field !== 3 || type !== 2) { tile.skip(type); continue; }
    const l = tile.bytes();
    const keys: string[] = [], values: (string | number | boolean)[] = [];
    const raw: { tags: number[]; type: number; geom: number[] }[] = [];
    let name = "", extent = 4096;
    for (const f of l.fields()) {
      if (f.field === 1) name = l.string();
      else if (f.field === 3) keys.push(l.string());
      else if (f.field === 5) extent = l.varint();
      else if (f.field === 4) {
        const v = l.bytes();
        let value: string | number | boolean = "";
        for (const g of v.fields()) {
          if (g.field === 1) value = v.string();
          else if (g.field === 2) value = v.float();
          else if (g.field === 3) value = v.double();
          else if (g.field === 4 || g.field === 5) value = v.varint();
          else if (g.field === 6) value = zigzag(v.varint());
          else if (g.field === 7) value = v.varint() !== 0;
          else v.skip(g.type);
        }
        values.push(value);
      } else if (f.field === 2) {
        const fe = l.bytes();
        const feat = { tags: [] as number[], type: 0, geom: [] as number[] };
        for (const g of fe.fields()) {
          if (g.field === 2) feat.tags = fe.packed();
          else if (g.field === 3) feat.type = fe.varint();
          else if (g.field === 4) feat.geom = fe.packed();
          else fe.skip(g.type);
        }
        raw.push(feat);
      } else l.skip(f.type);
    }
    const features: TileFeature[] = [];
    for (const r of raw) {
      if (r.type < 1 || r.type > 3) continue;
      const tags: TileFeature["tags"] = {};
      for (let i = 0; i + 1 < r.tags.length; i += 2) tags[keys[r.tags[i]]] = values[r.tags[i + 1]];
      // Commands: move to (1), line to (2), close (7), each with a count; then zigzag deltas
      const rings: { x: number; y: number }[][] = [];
      let x = 0, y = 0, cur: { x: number; y: number }[] = [];
      for (let i = 0; i < r.geom.length; ) {
        const cmd = r.geom[i] & 7, count = r.geom[i] >> 3;
        i++;
        if (cmd === 7) { if (cur.length) cur.push({ ...cur[0] }); continue; }
        for (let k = 0; k < count && i + 1 < r.geom.length + 1; k++) {
          x += zigzag(r.geom[i++]);
          y += zigzag(r.geom[i++]);
          if (cmd === 1) {
            if (cur.length) rings.push(cur);
            cur = [{ x, y }];
          } else cur.push({ x, y });
        }
      }
      if (cur.length) rings.push(cur);
      features.push({ type: r.type as 1 | 2 | 3, tags, rings });
    }
    layers.push({ name, extent, features });
  }
  return layers;
};

// ---------------------------------------------------------------- tiles to course features

/** Signed area of a ring in tile units: an outer ring of a polygon is positive (clockwise on screen). */
const ringArea = (r: { x: number; y: number }[]) => {
  let a = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j].x - r[i].x) * (r[j].y + r[i].y);
  return a / 2;
};

const ROAD_CLASSES = new Set(["motorway", "trunk", "primary", "secondary", "tertiary", "minor", "service", "busway"]);
const STREAM_CLASSES = new Set(["stream", "river", "canal", "drain", "ditch"]);
const GRASS_CLASSES = new Set(["grass"]);

/** What a tile feature is for the course map (the OpenMapTiles schema), or null to leave it out. */
export const classifyTileFeature = (layer: string, f: TileFeature): { geom: "line" | "area"; kind: OsmFeature["kind"] } | null => {
  const cls = String(f.tags.class ?? ""), sub = String(f.tags.subclass ?? "");
  if (layer === "transportation" && f.type === 2) {
    if (cls === "path" || cls === "track") return { geom: "line", kind: "path" };
    if (ROAD_CLASSES.has(cls)) return { geom: "line", kind: "road" };
    return null;
  }
  if (layer === "waterway" && f.type === 2 && STREAM_CLASSES.has(cls)) return { geom: "line", kind: "stream" };
  if (layer === "water" && f.type === 3) return { geom: "area", kind: "water" };
  if (layer === "landcover" && f.type === 3) {
    if (cls === "wood") return { geom: "area", kind: "woods" };
    if (GRASS_CLASSES.has(cls) && sub !== "park") return { geom: "area", kind: "rough" };
    if (cls === "sand") return { geom: "area", kind: "sand" };
    return null;
  }
  if (layer === "building" && f.type === 3) return { geom: "area", kind: "building" };
  return null;
};

/** The features of one tile (x, y at ZOOM), in latitude and longitude. */
export const tileFeatures = (layers: TileLayer[], tx: number, ty: number, z = ZOOM): OsmFeature[] => {
  const n = 2 ** z;
  const out: OsmFeature[] = [];
  for (const layer of layers) {
    const ll = (p: { x: number; y: number }): LatLon => {
      const px = tx + p.x / layer.extent, py = ty + p.y / layer.extent;
      return { lon: (px / n) * 360 - 180, lat: (Math.atan(Math.sinh(Math.PI * (1 - (2 * py) / n))) * 180) / Math.PI };
    };
    for (const f of layer.features) {
      const what = classifyTileFeature(layer.name, f);
      if (!what) continue;
      const name = typeof f.tags.name === "string" ? f.tags.name : undefined;
      if (what.geom === "line") {
        for (const r of f.rings) if (r.length >= 2) out.push({ geom: "line", kind: what.kind as "path", points: r.map(ll), name });
      } else {
        // Outer rings only (an island in a pond stays water on the course map)
        for (const r of f.rings) {
          if (r.length < 4 || ringArea(r) <= 0) continue;
          const pts = r.slice(0, -1).map(ll);
          if (what.kind === "building") {
            const h = Number(f.tags.render_height);
            out.push({ geom: "area", kind: "building", points: pts, name, building: { ...osmBuilding({}), heightM: Number.isFinite(h) && h > 0 ? h : undefined } });
          } else out.push({ geom: "area", kind: what.kind as "water", points: pts, name });
        }
      }
    }
  }
  return out;
};

/** The tiles (x, y at ZOOM) covering a box. */
export const tilesFor = (b: GeoBounds, z = ZOOM) => {
  const n = 2 ** z;
  const tx = (lon: number) => Math.floor(((lon + 180) / 360) * n);
  const ty = (lat: number) => Math.floor(((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) * n);
  const out: { x: number; y: number }[] = [];
  for (let x = tx(b.west); x <= tx(b.east); x++) for (let y = ty(b.north); y <= ty(b.south); y++) out.push({ x, y });
  return out;
};

/** What OpenFreeMap's tiles hold for a box. Throws when they can't be reached. */
export const fetchTileFeatures = async (bounds: GeoBounds, timeoutMs = 20000): Promise<OsmFeature[]> => {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const tj = await (await fetch(OPENFREEMAP_TILEJSON, { signal: ctrl.signal })).json();
    const template = String(tj.tiles?.[0] ?? "");
    if (!template) throw new Error("OpenFreeMap has no tiles.");
    const tiles = tilesFor(bounds);
    if (tiles.length > 16) throw new Error("Too big an area for the map tiles.");
    const out: OsmFeature[] = [];
    for (const t of tiles) {
      const res = await fetch(template.replace("{z}", String(ZOOM)).replace("{x}", String(t.x)).replace("{y}", String(t.y)), { signal: ctrl.signal });
      if (res.status === 204 || res.status === 404) continue;
      if (!res.ok) throw new Error(`OpenFreeMap ${res.status}`);
      out.push(...tileFeatures(decodeMvt(new Uint8Array(await res.arrayBuffer())), t.x, t.y));
    }
    return out;
  } finally {
    clearTimeout(timer);
  }
};
