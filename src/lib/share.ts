// Share links: the whole course design packed into the link itself (the site is static, with no
// server to keep it on). The satellite photo and the elevation are left out: they are downloaded
// again for the same place when the link is opened.
import type { CourseDoc, P } from "../types";
import { generateId } from "../constants";
import { normalizeCourse } from "./course";

export const SHARE_PARAM = "course";

/** What goes in a link: the design without the photo and the terrain. */
export const shareable = (doc: CourseDoc) => {
  const { background: _bg, terrainHeights: _t, ...rest } = doc;
  void _bg;
  void _t;
  // (the logo and pictures on the map's page too: a picture would make the link too long to send)
  const { logo: _logo, images: _images, ...style } = rest.style;
  void _logo;
  void _images;
  return { ...rest, style };
};

const toBase64Url = (bytes: Uint8Array) => {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const fromBase64Url = (text: string) => {
  const bin = atob(text.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((text.length + 3) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

const pipe = async (bytes: Uint8Array, stream: CompressionStream | DecompressionStream) => {
  const res = new Response(new Blob([bytes as Uint8Array<ArrayBuffer>]).stream().pipeThrough(stream));
  return new Uint8Array(await res.arrayBuffer());
};

/** Numbers to a hundredth (an eighth of an inch on the site), smaller ones to four places
 * (settings such as 0.65 kept exactly). */
const compact = (_key: string, value: unknown) => {
  if (typeof value !== "number" || Number.isInteger(value)) return value;
  return Math.abs(value) >= 1 ? Math.round(value * 100) / 100 : Math.round(value * 10000) / 10000;
};
const r2 = (v: number) => Math.round(v * 100) / 100;

/** Outlines and lines (and a hole's turns) as one list of numbers, each point from the one before. */
const PACK = "~p";
const packPoints = (pts: P[]) => {
  const out: number[] = [];
  let px = 0, py = 0;
  for (const p of pts) {
    const x = r2(p.x), y = r2(p.y);
    out.push(r2(x - px), r2(y - py));
    px = x;
    py = y;
  }
  return out;
};
const unpackPoints = (flat: number[]) => {
  const out: P[] = [];
  let x = 0, y = 0;
  for (let i = 0; i + 1 < flat.length; i += 2) {
    x = r2(x + flat[i]);
    y = r2(y + flat[i + 1]);
    out.push({ x, y });
  }
  return out;
};
const ITEMS = "~i";

/**
 * What a link holds, packed tight with nothing left out: every setting and every point (to a
 * hundredth of a foot), points as steps from the one before, the items of each kind as columns.
 * Every id is kept (the woods, creeks and trees are drawn from them).
 */
const packCourse = (doc: CourseDoc) => {
  const s = shareable(doc);
  const holes = s.holes.map(h => {
    const { doglegs, ...rest } = h;
    return { ...rest, [PACK]: packPoints(doglegs) };
  });
  const rows = s.items.map(i => {
    const o: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(i)) {
      if (k === "type" || v === undefined) continue;
      o[k === "points" ? PACK : k] = k === "points" && Array.isArray(v) ? packPoints(v as P[]) : v;
    }
    return { type: i.type as string, o };
  });
  // The items of each kind as columns, in the order they came
  const kinds = [...new Set(rows.map(r => r.type))];
  const table: Record<string, { k: string[]; c: unknown[][] }> = {};
  for (const type of kinds) {
    const list = rows.filter(r => r.type === type).map(r => r.o);
    const keys = [...new Set(list.flatMap(o => Object.keys(o)))];
    table[type] = { k: keys, c: keys.map(k => list.map(o => (k in o ? o[k] : null))) };
  }
  const { items: _items, holes: _holes, ...rest } = s;
  void _items;
  void _holes;
  return JSON.stringify({ ...rest, holes, [ITEMS]: { order: rows.map(r => kinds.indexOf(r.type)), table } }, compact);
};

const unpackCourse = (raw: Record<string, unknown>) => {
  const holes = Array.isArray(raw.holes)
    ? raw.holes.map(h => {
        const { [PACK]: flat, ...rest } = h as Record<string, unknown>;
        return { ...rest, doglegs: Array.isArray(flat) ? unpackPoints(flat as number[]) : [] };
      })
    : raw.holes;
  const packed = raw[ITEMS] as { order: number[]; table: Record<string, { k: string[]; c: unknown[][] }> } | undefined;
  const { [ITEMS]: _packed, ...rest } = raw;
  void _packed;
  if (!packed) return { ...rest, holes };
  const kinds = Object.keys(packed.table);
  const byKind = kinds.map(type => {
    const { k, c } = packed.table[type];
    return Array.from({ length: c[0]?.length ?? 0 }, (_, r) => {
      const o: Record<string, unknown> = { id: generateId(), type };
      k.forEach((key, ci) => {
        const v = c[ci][r];
        if (v === null || v === undefined) return;
        if (key === PACK) o.points = unpackPoints(v as number[]);
        else o[key] = v;
      });
      return o;
    });
  });
  const next = kinds.map(() => 0);
  return { ...rest, holes, items: packed.order.map(ki => byKind[ki][next[ki]++]) };
};

/** A course as a link keeps it (the same whatever order an object's keys come in), to tell
 * whether a link brings it back whole. */
const comparable = (doc: CourseDoc) => {
  const canonical = (k: string, v: unknown) =>
    v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map(key => [key, (v as Record<string, unknown>)[key]])) : compact(k, v);
  return JSON.stringify(shareable(doc), canonical);
};

/** The course as the text after "#course=" (compressed when the browser can): packed tight, and
 * checked to come back exactly as it is (if not, it goes as it is, longer). */
export const encodeCourse = async (doc: CourseDoc) => {
  const plain = new TextEncoder().encode(JSON.stringify(shareable(doc), compact));
  if (typeof CompressionStream === "undefined") return `j${toBase64Url(plain)}`;
  const tight = `y${toBase64Url(await pipe(new TextEncoder().encode(packCourse(doc)), new CompressionStream("deflate-raw")))}`;
  try {
    const back = await decodeCourse(tight);
    if (comparable(back) === comparable(normalizeCourse(JSON.parse(new TextDecoder().decode(plain))))) return tight;
  } catch {
    /* the plain kind below */
  }
  return `z${toBase64Url(await pipe(plain, new CompressionStream("deflate-raw")))}`;
};

export const decodeCourse = async (text: string): Promise<CourseDoc> => {
  const kind = text[0];
  const bytes = fromBase64Url(text.slice(1));
  let json: Uint8Array;
  if (kind === "z" || kind === "y") {
    if (typeof DecompressionStream === "undefined") throw new Error("This browser can't open compressed course links.");
    json = await pipe(bytes, new DecompressionStream("deflate-raw"));
  } else if (kind === "j") json = bytes;
  else throw new Error("This link doesn't hold a course.");
  // ("y": the short kind, points packed; "z" and "j": links made before it)
  const parsed = JSON.parse(new TextDecoder().decode(json));
  const raw = kind === "y" && parsed && typeof parsed === "object" ? unpackCourse(parsed) : parsed;
  if (!raw || typeof raw !== "object" || !Array.isArray(raw.holes)) throw new Error("This link doesn't hold a course.");
  return normalizeCourse(raw);
};

/** A link to this page with the course in it. */
export const shareUrl = async (doc: CourseDoc, base = `${location.origin}${location.pathname}`) => `${base}#${SHARE_PARAM}=${await encodeCourse(doc)}`;

/** The packed course in a link's hash, if there is one. */
export const courseInHash = (hash: string) => {
  const m = hash.match(new RegExp(`[#&]${SHARE_PARAM}=([A-Za-z0-9_-]+)`));
  return m ? m[1] : null;
};
