// Share links: the whole course design packed into the link itself (the site is static, with no
// server to keep it on). The satellite photo and the elevation are left out: they are downloaded
// again for the same place when the link is opened.
import type { CourseDoc } from "../types";
import { normalizeCourse } from "./course";

export const SHARE_PARAM = "course";

/** What goes in a link: the design without the photo and the terrain, numbers to 0.1 ft. */
export const shareable = (doc: CourseDoc) => {
  const { background: _bg, terrainHeights: _t, ...rest } = doc;
  void _bg;
  void _t;
  // (the logo too: a picture would make the link too long to send)
  const { logo: _logo, ...style } = rest.style;
  void _logo;
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

const compact = (_key: string, value: unknown) => (typeof value === "number" && !Number.isInteger(value) ? Math.round(value * 10) / 10 : value);

/** The course as the text after "#course=" (compressed when the browser can). */
export const encodeCourse = async (doc: CourseDoc) => {
  const json = new TextEncoder().encode(JSON.stringify(shareable(doc), compact));
  if (typeof CompressionStream !== "undefined") return `z${toBase64Url(await pipe(json, new CompressionStream("deflate-raw")))}`;
  return `j${toBase64Url(json)}`;
};

export const decodeCourse = async (text: string): Promise<CourseDoc> => {
  const kind = text[0];
  const bytes = fromBase64Url(text.slice(1));
  let json: Uint8Array;
  if (kind === "z") {
    if (typeof DecompressionStream === "undefined") throw new Error("This browser can't open compressed course links.");
    json = await pipe(bytes, new DecompressionStream("deflate-raw"));
  } else if (kind === "j") json = bytes;
  else throw new Error("This link doesn't hold a course.");
  const raw = JSON.parse(new TextDecoder().decode(json));
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
