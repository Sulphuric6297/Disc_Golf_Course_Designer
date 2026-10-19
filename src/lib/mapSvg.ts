// The printed course map, as SVG: the land (photo or a drawn style), hill shading and contours,
// woods and trees, water, paths and roads, OB and hazards, then the holes (fairways, throw lines,
// tees, baskets, mandos, drop zones, distances), labels, and the frame (title, legend, hole table,
// north arrow, scale bar). The same renderer draws a single hole for tee signs, turned so the tee
// is at the bottom.
import { AMENITY_KINDS, CIRCLE_ONE_FT, FT_PER_M, LINE_KINDS, TEE_LEVELS, TEE_ORDER } from "../constants";
import type { AmenityItem, AreaItem, BasketItem, BasketMark, CourseDoc, DropZoneItem, LabelItem, LineItem, MandoItem, MapStyle, MapTheme, P, PaperSize, TeeItem, TreeItem } from "../types";
import { activeLayout, holeBaskets, teeAim } from "./course";
import { boundsOf, corridor, dist, pathLength, pointAlong, pointInPolygon, polygonArea, rectCorners, rotatePoint, smoothPath } from "./geom";
import { courseTotals, holeStats, type HoleStats } from "./holeStats";
import { forestCanvas, type CanopyGrid } from "./forest";
import { chainContours, type Contours } from "./relief";
import { fmtDist } from "./units";

export const PAPER: Record<PaperSize, { label: string; w: number; h: number }> = {
  letter: { label: "Letter 8.5 × 11 in", w: 8.5, h: 11 },
  tabloid: { label: "Tabloid 11 × 17 in", w: 11, h: 17 },
  "18x24": { label: "Poster 18 × 24 in", w: 18, h: 24 },
  "24x36": { label: "Poster 24 × 36 in", w: 24, h: 36 },
  a4: { label: "A4", w: 8.27, h: 11.69 },
  a3: { label: "A3", w: 11.69, h: 16.54 }
};

export const THEMES: Record<MapTheme, { label: string; blurb: string }> = {
  forest: { label: "Forest", blurb: "Lush painted woods with the fairways cut through, like hand-made course maps." },
  illustrated: { label: "Illustrated", blurb: "Painted park map: drawn grass, trees with shadows, hill shading." },
  satellite: { label: "Satellite", blurb: "The aerial photo with the course drawn over it." },
  topo: { label: "Topographic", blurb: "Contours and relief on a cream map, like a trail map." },
  minimal: { label: "Minimal", blurb: "Clean and printer-friendly, little ink." },
  night: { label: "Night", blurb: "Dark background with bright lines, for screens." }
};

/** What each theme shows by default: the forest look is a clean picture (no lines, legend or
 * table); the others are working maps. */
export const THEME_SHOWS: Record<MapTheme, Partial<MapStyle>> = {
  forest: { throwLines: false, distances: false, circle: false, legend: false, holeTable: false, contours: false, hillshade: true, font: "Script", basketMark: "basket" },
  illustrated: { throwLines: true, distances: true, circle: true, legend: true, holeTable: true, contours: true, hillshade: true, font: "Oswald", basketMark: "badge" },
  satellite: { throwLines: true, distances: true, circle: true, legend: true, holeTable: true, contours: false, hillshade: false, font: "Oswald", basketMark: "badge" },
  topo: { throwLines: true, distances: true, circle: true, legend: true, holeTable: true, contours: true, hillshade: true, font: "Bitter", basketMark: "target" },
  minimal: { throwLines: true, distances: true, circle: true, legend: true, holeTable: true, contours: true, hillshade: false, font: "Inter", basketMark: "target" },
  night: { throwLines: true, distances: true, circle: true, legend: true, holeTable: true, contours: true, hillshade: true, font: "Oswald", basketMark: "target" }
};

/** Theme presets: picking a theme sets these colors (they can be changed afterwards). */
export const THEME_COLORS: Record<MapTheme, Partial<MapStyle>> = {
  forest: { fairway: "#9fd060", rough: "#6b9b3d", trees: "#33612a", water: "#2f8ad6", path: "#8c6a46", ob: "#ff4b4b", hazard: "#ffd23f", basket: "#ffffff" },
  illustrated: { fairway: "#a7dc7b", rough: "#5f9447", trees: "#2d6a35", water: "#4aa3e6", path: "#e2c08d", ob: "#e5383b", hazard: "#f2c230", basket: "#f2c94c" },
  satellite: { fairway: "#b5f08a", rough: "#4f7a3a", trees: "#1f4d29", water: "#3d9be9", path: "#f1d6a6", ob: "#ff3b3b", hazard: "#ffd23f", basket: "#ffd84d" },
  topo: { fairway: "#cfe7a8", rough: "#efe9d2", trees: "#9cc58a", water: "#8cc7ef", path: "#b0703a", ob: "#d62828", hazard: "#e09f1f", basket: "#f4b41a" },
  minimal: { fairway: "#e6eedb", rough: "#ffffff", trees: "#c9d6c0", water: "#d6e8f5", path: "#b9b4ac", ob: "#d62828", hazard: "#d9a400", basket: "#222222" },
  night: { fairway: "#2f6b3a", rough: "#16211b", trees: "#0f3a1e", water: "#1d4f7a", path: "#8a7552", ob: "#ff4d6d", hazard: "#ffd166", basket: "#ffd166" }
};

type Palette = {
  bg: string; grass: string; contour: string; contourMajor: string; ink: string; inkSoft: string; paper: string; panel: string; panelInk: string;
  line: string; lineCasing: string; label: string; labelHalo: string; road: string; building: string; parking: string; grain: number; treeShadow: number;
};

export const palette = (s: MapStyle): Palette => {
  switch (s.theme) {
    case "satellite": return { bg: "#26351f", grass: s.rough, contour: "rgba(255,255,255,.35)", contourMajor: "rgba(255,255,255,.6)", ink: "#111827", inkSoft: "#4b5563", paper: "#f8f6f0", panel: "#ffffff", panelInk: "#111827", line: "#ffffff", lineCasing: "rgba(0,0,0,.55)", label: "#ffffff", labelHalo: "rgba(0,0,0,.75)", road: "#8b8d90", building: "#c8bfb0", parking: "#7d8086", grain: 0, treeShadow: 0.0 };
    case "topo": return { bg: s.rough, grass: s.rough, contour: "#c2915a", contourMajor: "#a0672e", ink: "#2b2118", inkSoft: "#6b5a47", paper: "#fbf7ea", panel: "#fffdf5", panelInk: "#2b2118", line: "#2b2118", lineCasing: "rgba(255,253,245,.9)", label: "#2b2118", labelHalo: "rgba(255,253,245,.9)", road: "#c94f3d", building: "#a39a8c", parking: "#d5d0c4", grain: 0, treeShadow: 0.12 };
    case "minimal": return { bg: "#ffffff", grass: "#ffffff", contour: "#dedede", contourMajor: "#c4c4c4", ink: "#111111", inkSoft: "#666666", paper: "#ffffff", panel: "#ffffff", panelInk: "#111111", line: "#111111", lineCasing: "rgba(255,255,255,.95)", label: "#111111", labelHalo: "rgba(255,255,255,.95)", road: "#bdbdbd", building: "#d9d9d9", parking: "#ececec", grain: 0, treeShadow: 0 };
    case "forest": return { bg: s.rough, grass: s.rough, contour: "rgba(20,40,10,.25)", contourMajor: "rgba(20,40,10,.4)", ink: "#f4f7ef", inkSoft: "#c5d3bd", paper: "#0f1a0e", panel: "rgba(8,14,7,.78)", panelInk: "#f4f7ef", line: "#ffffff", lineCasing: "rgba(0,0,0,.45)", label: "#ffffff", labelHalo: "rgba(10,25,6,.85)", road: "#cfd1cc", building: "#d9d2c3", parking: "#b9bab4", grain: 0.06, treeShadow: 0.35 };
    case "night": return { bg: s.rough, grass: s.rough, contour: "rgba(160,220,180,.18)", contourMajor: "rgba(160,220,180,.35)", ink: "#e5f2ea", inkSoft: "#93a99c", paper: "#0d1511", panel: "#121d17", panelInk: "#e5f2ea", line: "#f8fafc", lineCasing: "rgba(0,0,0,.6)", label: "#f1f5f9", labelHalo: "rgba(0,0,0,.8)", road: "#3a4048", building: "#2d3a33", parking: "#28302c", grain: 0.04, treeShadow: 0.3 };
    default: return { bg: s.rough, grass: s.rough, contour: "rgba(30,60,20,.28)", contourMajor: "rgba(30,60,20,.45)", ink: "#1f2a1c", inkSoft: "#566451", paper: "#f6f3e7", panel: "#fffdf6", panelInk: "#1f2a1c", line: "#ffffff", lineCasing: "rgba(25,45,20,.65)", label: "#ffffff", labelHalo: "rgba(20,35,15,.85)", road: "#9c9a92", building: "#e8dcc4", parking: "#bab6ab", grain: 0.07, treeShadow: 0.32 };
  }
};

const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const n = (v: number) => (Math.round(v * 100) / 100).toString();
const pts = (p: P[]) => p.map(q => `${n(q.x)},${n(q.y)}`).join(" ");
const pathD = (p: P[], closed = false) => p.map((q, i) => `${i ? "L" : "M"}${n(q.x)} ${n(q.y)}`).join("") + (closed ? "Z" : "");

/** How the map is placed: the plan point at the middle, the turn (degrees, the tee-to-basket
 * direction is "up" for tee signs) and pixels per foot, into a box of the given size. */
export type MapView = { cx: number; cy: number; rotation: number; scale: number; width: number; height: number };

export type MapLayers = {
  stats: HoleStats[];
  contours: Contours | null;
  hillshade: string | null;
  /** Show only this hole's parts (a tee sign); others are faded. */
  focusHole?: string;
  /** Text size multiplier (bigger on posters). */
  textScale: number;
  fontFamily: string;
  /** Forest style: where the photo shows trees. */
  canopy?: CanopyGrid | null;
};

export const fontStack = (f: string) => (f === "Oswald" || f === "Script" ? "Oswald, 'Arial Narrow', Arial, sans-serif" : f === "Bitter" ? "Bitter, Georgia, serif" : "Inter, Arial, sans-serif");
/** The title's lettering (the brush script for "Script"). */
export const titleStack = (f: string) => (f === "Script" ? "'Kaushan Script', 'Brush Script MT', cursive" : fontStack(f));

export const BASKET_MARKS: { value: BasketMark; label: string; title: string }[] = [
  { value: "basket", label: "Basket", title: "A small basket seen from the side, as on painted course maps" },
  { value: "badge", label: "Badge", title: "A basket in a round badge: clear on any background" },
  { value: "flag", label: "Flag", title: "A pin flag, like a golf map" },
  { value: "target", label: "Target", title: "Target rings" },
  { value: "number", label: "Number", title: "The hole number in a circle" }
];

const INK = "#1b1d1a";
/** Dark or white, whichever reads on `color`. */
const inkOn = (color: string) => {
  const v = parseInt(color.replace("#", "").slice(0, 6), 16);
  const lum = (0.3 * ((v >> 16) & 255) + 0.59 * ((v >> 8) & 255) + 0.11 * (v & 255)) / 255;
  return Number.isNaN(lum) || lum > 0.55 ? INK : "#ffffff";
};

/** The side view of a basket in unit coordinates (about 15 tall, centered): band, chains, tray, pole. */
const basketShape = (f: (x: number, y: number) => string, u: number, ink: string, band: string, detail: boolean) => {
  const chains = [-4.1, -2.5, -0.9, 0.9, 2.5, 4.1].map(x => `M${f(x, -5.4)}Q${f(x * 0.78, -2.6)} ${f(x * 0.42, 0.4)}`).join("");
  const pole = `M${f(0, -7.4)}L${f(0, 7.1)}M${f(-2.5, 7.1)}L${f(2.5, 7.1)}`;
  const tray = `M${f(-5.3, 0.3)}L${f(5.3, 0.3)}L${f(3.9, 3.9)}L${f(-3.9, 3.9)}Z`;
  const bandD = `M${f(-4.8, -7.5)}L${f(4.8, -7.5)}L${f(4.8, -5.4)}L${f(-4.8, -5.4)}Z`;
  const bars = detail ? [-3, -1, 1, 3].map(x => `M${f(x, 1)}L${f(x * 0.82, 3.4)}`).join("") : "";
  return {
    outline: `${chains}${pole}${tray}${bandD}`,
    body: `<path d="${chains}" fill="none" stroke="${ink}" stroke-width="${n(0.55 * u)}" stroke-linecap="round"/><path d="${pole}" fill="none" stroke="${ink}" stroke-width="${n(0.95 * u)}" stroke-linecap="round"/><path d="${tray}" fill="${ink}"/>${bars ? `<path d="${bars}" stroke="#8a8f88" stroke-width="${n(0.35 * u)}"/>` : ""}<path d="${bandD}" fill="${band}" stroke="${ink}" stroke-width="${n(0.6 * u)}" stroke-linejoin="round"/>`
  };
};

/**
 * A basket on the map, drawn as the chosen mark, centered on `p` (`u`: page points per unit; a
 * mark is about 15 units tall). `color` is the style's basket color; `label` is the hole number.
 */
export const basketMark = (mark: BasketMark, p: P, u: number, color: string, label = "") => `<g data-mark="${mark}">${markBody(mark, p, u, color, label)}</g>`;

const markBody = (mark: BasketMark, p: P, u: number, color: string, label: string) => {
  const f = (x: number, y: number) => `${n(p.x + x * u)} ${n(p.y + y * u)}`;
  const halo = "#ffffff";
  switch (mark) {
    case "badge": {
      const ink = inkOn(color);
      const b = basketShape((x, y) => f(x * 0.62, y * 0.62), u * 0.62, ink, ink, false);
      return `<circle cx="${n(p.x)}" cy="${n(p.y)}" r="${n(7.6 * u)}" fill="${color}" stroke="${INK}" stroke-width="${n(0.9 * u)}"/>${b.body}`;
    }
    case "flag": {
      // The cup at the basket's spot, the flag above it
      const g = (x: number, y: number) => f(x, y - 6.4);
      const flag = `M${g(0.5, -7.4)}L${g(7.4, -5)}L${g(0.5, -2.6)}Z`;
      const pole = `M${g(0, 6.3)}L${g(0, -7.6)}`;
      return `<path d="${pole}${flag}" fill="${halo}" fill-opacity="0.7" stroke="${halo}" stroke-opacity="0.7" stroke-width="${n(2 * u)}" stroke-linejoin="round" stroke-linecap="round"/><ellipse cx="${n(p.x)}" cy="${n(p.y)}" rx="${n(2.6 * u)}" ry="${n(1.05 * u)}" fill="${INK}"/><path d="${pole}" stroke="${INK}" stroke-width="${n(0.9 * u)}" stroke-linecap="round"/><path d="${flag}" fill="${color}" stroke="${INK}" stroke-width="${n(0.6 * u)}" stroke-linejoin="round"/>`;
    }
    case "target":
      return `<circle cx="${n(p.x)}" cy="${n(p.y)}" r="${n(6 * u)}" fill="${color}" stroke="${INK}" stroke-width="${n(1.1 * u)}"/><circle cx="${n(p.x)}" cy="${n(p.y)}" r="${n(3.3 * u)}" fill="none" stroke="${INK}" stroke-width="${n(0.85 * u)}"/><circle cx="${n(p.x)}" cy="${n(p.y)}" r="${n(1.1 * u)}" fill="${INK}"/>`;
    case "number":
      return `<circle cx="${n(p.x)}" cy="${n(p.y)}" r="${n(7.4 * u)}" fill="${color}" stroke="${INK}" stroke-width="${n(1 * u)}"/><text x="${n(p.x)}" y="${n(p.y + 0.4 * u)}" text-anchor="middle" dominant-baseline="central" font-family="Oswald, 'Arial Narrow', Arial, sans-serif" font-weight="700" font-size="${n((label.length > 1 ? 8.4 : 9.6) * u)}" fill="${inkOn(color)}">${esc(label || "•")}</text>`;
    default: {
      const b = basketShape(f, u, INK, color, true);
      return `<path d="${b.outline}" fill="${halo}" fill-opacity="0.65" stroke="${halo}" stroke-opacity="0.65" stroke-width="${n(2.2 * u)}" stroke-linejoin="round" stroke-linecap="round"/>${b.body}`;
    }
  }
};

/** The map itself (everything inside the frame), in a box `view.width` × `view.height`. */
export const renderMapLayers = (doc: CourseDoc, view: MapView, layers: MapLayers, uid = "m") => {
  const s = doc.style;
  const pal = palette(s);
  const k = view.scale;
  // Screen pixels -> feet inside the plan group; lines and hatching grow with the text on big prints
  const px = (v: number) => (v * Math.max(1, layers.textScale * 0.8)) / k;
  const rot = (view.rotation * Math.PI) / 180;
  const toScreen = (p: P): P => {
    const dx = p.x - view.cx, dy = p.y - view.cy;
    const c = Math.cos(-rot), sn = Math.sin(-rot);
    return { x: view.width / 2 + (dx * c - dy * sn) * k, y: view.height / 2 + (dx * sn + dy * c) * k };
  };
  const ts = layers.textScale;
  const font = fontStack(layers.fontFamily);
  const out: string[] = [];
  const defs: string[] = [];
  const focus = layers.focusHole;
  const dim = (holeId?: string) => (focus && holeId && holeId !== focus ? 0.35 : 1);
  const theme = s.theme;
  const photo = theme === "satellite" && !!doc.background;
  const forest = theme === "forest";

  // --- Patterns and filters
  const hatch = (id: string, color: string, gap: number, width: number, angle = 45) =>
    `<pattern id="${id}" patternUnits="userSpaceOnUse" width="${n(px(gap))}" height="${n(px(gap))}" patternTransform="rotate(${angle})"><rect width="${n(px(gap))}" height="${n(px(gap))}" fill="${color}" fill-opacity="0.12"/><line x1="0" y1="0" x2="0" y2="${n(px(gap))}" stroke="${color}" stroke-width="${n(px(width))}" stroke-opacity="0.8"/></pattern>`;
  defs.push(hatch(`${uid}-ob`, s.ob, 9, 1.6), hatch(`${uid}-hz`, s.hazard, 9, 1.6, -45), hatch(`${uid}-ng`, "#7c3aed", 10, 1.2));
  defs.push(`<filter id="${uid}-soft" x="-5%" y="-5%" width="110%" height="110%"><feGaussianBlur stdDeviation="${n(px(1.6))}"/></filter>`);
  defs.push(`<radialGradient id="${uid}-crown" cx="38%" cy="35%" r="70%"><stop offset="0" stop-color="#ffffff" stop-opacity="0.32"/><stop offset="0.55" stop-color="#ffffff" stop-opacity="0.05"/><stop offset="1" stop-color="#000000" stop-opacity="0.18"/></radialGradient>`);
  if (pal.grain > 0) {
    // Grass grain: tiny strokes on a repeating tile, in screen space so it prints the same at any scale
    let seed = 11;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const marks: string[] = [];
    for (let i = 0; i < 70; i++) {
      const x = rnd() * 40, y = rnd() * 40, a = (rnd() - 0.5) * 1.2;
      marks.push(`<line x1="${n(x)}" y1="${n(y)}" x2="${n(x + Math.sin(a) * 2.2)}" y2="${n(y - Math.cos(a) * 2.2)}" stroke="${rnd() > 0.5 ? "#000" : "#fff"}" stroke-opacity="${n(pal.grain * (0.6 + rnd()))}" stroke-width="0.8" stroke-linecap="round"/>`);
    }
    defs.push(`<pattern id="${uid}-grain" patternUnits="userSpaceOnUse" width="40" height="40">${marks.join("")}</pattern>`);
  }

  const g = `translate(${n(view.width / 2)} ${n(view.height / 2)}) rotate(${n(-view.rotation)}) scale(${n(k)}) translate(${n(-view.cx)} ${n(-view.cy)})`;
  out.push(`<rect width="${n(view.width)}" height="${n(view.height)}" fill="${pal.bg}"/>`);
  out.push(`<g transform="${g}">`);
  // Ground: the photo, the painted land (Forest), or the drawn grass
  if (forest && typeof document !== "undefined") {
    out.push(`</g><image href="${forestPicture(doc, view, layers)}" x="0" y="0" width="${n(view.width)}" height="${n(view.height)}" preserveAspectRatio="none"/><g transform="${g}">`);
  } else if (photo) {
    out.push(`<image href="${doc.background}" x="0" y="0" width="${doc.canvas.width}" height="${doc.canvas.height}" preserveAspectRatio="none" opacity="${n(s.photo)}"/>`);
  } else {
    out.push(`<rect x="${-doc.canvas.width}" y="${-doc.canvas.height}" width="${doc.canvas.width * 3}" height="${doc.canvas.height * 3}" fill="${pal.grass}"/>`);
  }
  if (s.hillshade && layers.hillshade && theme !== "minimal" && !forest) {
    out.push(`<image href="${layers.hillshade}" x="0" y="0" width="${doc.canvas.width}" height="${doc.canvas.height}" preserveAspectRatio="none" opacity="${theme === "satellite" ? 0.45 : theme === "night" ? 0.6 : forest ? 0.7 : 0.9}"/>`);
  }
  out.push(`</g>`);
  if (pal.grain > 0 && !photo && !forest) out.push(`<rect width="${n(view.width)}" height="${n(view.height)}" fill="url(#${uid}-grain)"/>`);
  out.push(`<g transform="${g}">`);

  // Contours
  if (s.contours && layers.contours?.segments.length) {
    const lines = chainContours(layers.contours.segments);
    const iv = layers.contours.interval;
    const minor: string[] = [], major: string[] = [];
    for (const l of lines) (Math.abs(Math.round(l.level / iv)) % 5 === 0 ? major : minor).push(pathD(l.pts));
    if (minor.length) out.push(`<path d="${minor.join("")}" fill="none" stroke="${pal.contour}" stroke-width="${n(px(0.7))}" stroke-linejoin="round"/>`);
    if (major.length) out.push(`<path d="${major.join("")}" fill="none" stroke="${pal.contourMajor}" stroke-width="${n(px(1.3))}" stroke-linejoin="round"/>`);
  }

  const items = doc.items;
  const areas = (items.filter(i => i.type === "area") as AreaItem[]).sort((a, b) => polygonArea(b.points) - polygonArea(a.points));
  const lines = items.filter(i => i.type === "line") as LineItem[];

  // Land cover areas first (under the course)
  const landFill = (a: AreaItem) => {
    switch (a.kind) {
      case "water": return s.water;
      case "woods": return s.trees;
      case "fairway": return s.fairway;
      case "green": return s.fairway;
      case "rough": return "#a8a35a";
      case "parking": return pal.parking;
      case "building": return pal.building;
      case "sand": return "#e3cf98";
      default: return null;
    }
  };
  for (const a of areas) {
    const fill = landFill(a);
    if (!fill || a.points.length < 3 || forest) continue;
    const o = dim(a.holeId);
    if (a.kind === "water") {
      out.push(`<polygon points="${pts(a.points)}" fill="${fill}" opacity="${o}" stroke="${shade(fill, -0.25)}" stroke-width="${n(px(1.4))}" stroke-linejoin="round"/>`);
      out.push(`<polygon points="${pts(a.points)}" fill="none" stroke="#ffffff" stroke-opacity="0.35" stroke-width="${n(px(3))}" stroke-linejoin="round" transform="translate(0 0)" style="paint-order:stroke"/>`);
    } else if (a.kind === "woods") {
      if (!forest) out.push(woods(a, fill, k, uid, pal.treeShadow, o));
    } else if (a.kind === "building") {
      if (pal.treeShadow > 0) out.push(`<polygon points="${pts(a.points.map(p => ({ x: p.x + px(3), y: p.y + px(3) })))}" fill="#000" opacity="${n(0.25 * o)}"/>`);
      out.push(`<polygon points="${pts(a.points)}" fill="${fill}" stroke="${shade(fill, -0.3)}" stroke-width="${n(px(1))}" opacity="${o}"/>`);
    } else {
      out.push(`<polygon points="${pts(a.points)}" fill="${fill}" opacity="${n((a.kind === "fairway" || a.kind === "green" ? 0.9 : 0.85) * o)}" stroke="${shade(fill, -0.15)}" stroke-width="${n(px(0.8))}"/>`);
    }
  }

  // Fairways along throw lines (soft edged)
  {
    for (const st of layers.stats) {
      const hole = doc.holes.find(h => h.id === st.holeId);
      if (!hole?.fairway || !st.complete || forest) continue;
      const poly = corridor(smoothPath(st.line, 10), hole.fairwayWidth, 12);
      const o = dim(hole.id) * (photo ? 0.4 : theme === "minimal" ? 0.8 : 0.95);
      out.push(`<polygon points="${pts(poly)}" fill="${s.fairway}" opacity="${n(o)}" ${theme === "minimal" ? "" : `filter="url(#${uid}-soft)"`}/>`);
      if (photo) out.push(`<polygon points="${pts(poly)}" fill="none" stroke="${s.fairway}" stroke-width="${n(px(1.2))}" opacity="${n(dim(hole.id))}"/>`);
    }
  }

  // Paths, roads, streams, fences, walks
  for (const l of lines) {
    if (l.points.length < 2 || (forest && l.kind !== "fence")) continue;
    const meta = LINE_KINDS[l.kind];
    const w = l.width ?? meta.width;
    const o = dim(l.holeId);
    // Creeks and trails wind: draw them as smooth curves through their points
    const d = pathD(l.kind === "stream" || l.kind === "path" ? smoothPath(l.points, 8) : l.points);
    if (l.kind === "road") {
      out.push(`<path d="${d}" fill="none" stroke="${shade(pal.road, -0.25)}" stroke-width="${n(Math.max(w, px(3)) + px(2))}" stroke-linecap="round" stroke-linejoin="round" opacity="${o}"/>`);
      out.push(`<path d="${d}" fill="none" stroke="${pal.road}" stroke-width="${n(Math.max(w, px(3)))}" stroke-linecap="round" stroke-linejoin="round" opacity="${o}"/>`);
      out.push(`<path d="${d}" fill="none" stroke="#ffffff" stroke-opacity="0.7" stroke-width="${n(px(0.8))}" stroke-dasharray="${n(px(6))} ${n(px(6))}"/>`);
    } else if (l.kind === "path") {
      out.push(`<path d="${d}" fill="none" stroke="${shade(s.path, -0.3)}" stroke-width="${n(Math.max(w, px(2.2)) + px(1.2))}" stroke-linecap="round" stroke-linejoin="round" opacity="${n(0.8 * o)}"/>`);
      out.push(`<path d="${d}" fill="none" stroke="${s.path}" stroke-width="${n(Math.max(w, px(2.2)))}" stroke-linecap="round" stroke-linejoin="round" opacity="${o}"/>`);
    } else if (l.kind === "stream") {
      out.push(`<path d="${d}" fill="none" stroke="${shade(s.water, -0.35)}" stroke-width="${n(Math.max(w, px(2)) + px(1))}" stroke-linecap="round" stroke-linejoin="round" opacity="${n(0.7 * o)}"/>`);
      out.push(`<path d="${d}" fill="none" stroke="${s.water}" stroke-width="${n(Math.max(w, px(2)))}" stroke-linecap="round" stroke-linejoin="round" opacity="${o}"/>`);
      out.push(`<path d="${d}" fill="none" stroke="#ffffff" stroke-opacity="0.35" stroke-width="${n(Math.max(w, px(2)) * 0.3)}" stroke-linecap="round" stroke-linejoin="round"/>`);
    } else if (l.kind === "fence") {
      out.push(`<path d="${d}" fill="none" stroke="${pal.inkSoft}" stroke-width="${n(px(1.2))}" stroke-dasharray="${n(px(1))} ${n(px(3))}" stroke-linecap="round" opacity="${o}"/>`);
      out.push(`<path d="${d}" fill="none" stroke="${pal.inkSoft}" stroke-width="${n(px(0.6))}" opacity="${o}"/>`);
    }
  }

  // Trees (shadow, crown, highlight)
  const trees = (items.filter(i => i.type === "tree") as TreeItem[]).sort((a, b) => a.y - b.y);
  if (pal.treeShadow > 0 && !photo && !forest) {
    out.push(`<g opacity="${n(pal.treeShadow)}">${trees.map(t => `<circle cx="${n(t.x + t.radius * 0.28)}" cy="${n(t.y + t.radius * 0.32)}" r="${n(t.radius * (t.width ?? 1))}" fill="#0b1a08"/>`).join("")}</g>`);
  }
  if (forest) {
    // (painted with the forest)
  } else if (!photo) {
    for (const t of trees) {
      const r = t.radius * (t.width ?? 1);
      const c = t.treeType === "conifer" ? shade(s.trees, -0.12) : t.treeType === "bush" ? shade(s.trees, 0.12) : s.trees;
      if (t.treeType === "conifer") {
        const star = Array.from({ length: 16 }, (_, i) => {
          const a = (i / 16) * Math.PI * 2, rr = i % 2 ? r * 0.72 : r;
          return { x: t.x + Math.cos(a) * rr, y: t.y + Math.sin(a) * rr };
        });
        out.push(`<polygon points="${pts(star)}" fill="${c}" stroke="${shade(c, -0.3)}" stroke-width="${n(px(0.6))}"/><polygon points="${pts(star)}" fill="url(#${uid}-crown)"/>`);
      } else {
        out.push(`<circle cx="${n(t.x)}" cy="${n(t.y)}" r="${n(r)}" fill="${c}" stroke="${shade(c, -0.3)}" stroke-width="${n(px(0.6))}"/><circle cx="${n(t.x)}" cy="${n(t.y)}" r="${n(r)}" fill="url(#${uid}-crown)"/>`);
      }
    }
  } else {
    // On the photo the trees are already there: only outline the ones that matter
    out.push(`<g fill="none" stroke="#bbf7d0" stroke-opacity="0.45" stroke-width="${n(px(0.8))}">${trees.map(t => `<circle cx="${n(t.x)}" cy="${n(t.y)}" r="${n(t.radius * (t.width ?? 1))}"/>`).join("")}</g>`);
  }

  // OB, hazards and no-go areas over the land
  for (const a of areas) {
    if (a.kind !== "ob" && a.kind !== "hazard" && a.kind !== "nogo") continue;
    const pat = a.kind === "ob" ? `${uid}-ob` : a.kind === "hazard" ? `${uid}-hz` : `${uid}-ng`;
    const col = a.kind === "ob" ? s.ob : a.kind === "hazard" ? s.hazard : "#7c3aed";
    const o = dim(a.holeId);
    out.push(`<polygon points="${pts(a.points)}" fill="url(#${pat})" stroke="${col}" stroke-width="${n(px(2.2))}" stroke-linejoin="round" ${a.kind === "hazard" ? `stroke-dasharray="${n(px(6))} ${n(px(3))}"` : ""} opacity="${o}"/>`);
  }
  for (const l of lines.filter(x => x.kind === "ob")) {
    out.push(`<path d="${pathD(l.points)}" fill="none" stroke="#ffffff" stroke-width="${n(px(4.5))}" stroke-linecap="round" stroke-linejoin="round" opacity="${n(0.8 * dim(l.holeId))}"/>`);
    out.push(`<path d="${pathD(l.points)}" fill="none" stroke="${s.ob}" stroke-width="${n(px(2.6))}" stroke-linecap="round" stroke-linejoin="round" opacity="${n(dim(l.holeId))}"/>`);
  }

  // Next-tee walks
  if (s.nextTee && !forest) {
    for (let i = 0; i + 1 < layers.stats.length; i++) {
      const a = layers.stats[i], b = layers.stats[i + 1];
      if (!a.complete || !b.complete || focus) continue;
      const from = a.line[a.line.length - 1], to = b.line[0];
      const d = dist(from, to);
      if (d < 40) continue;
      const k0 = Math.min(0.4, CIRCLE_ONE_FT / d), k1 = Math.max(0.6, 1 - 14 / d);
      const s0 = { x: from.x + (to.x - from.x) * k0, y: from.y + (to.y - from.y) * k0 };
      const s1 = { x: from.x + (to.x - from.x) * k1, y: from.y + (to.y - from.y) * k1 };
      out.push(`<path d="${pathD([s0, s1])}" fill="none" stroke="${pal.line}" stroke-opacity="0.85" stroke-width="${n(px(1.6))}" stroke-dasharray="${n(px(1.5))} ${n(px(4))}" stroke-linecap="round"/>`);
    }
    for (const l of lines.filter(x => x.kind === "walk")) {
      out.push(`<path d="${pathD(l.points)}" fill="none" stroke="${pal.line}" stroke-opacity="0.85" stroke-width="${n(px(1.6))}" stroke-dasharray="${n(px(1.5))} ${n(px(4))}" stroke-linecap="round"/>`);
    }
  }

  // Putting circles, throw lines
  for (const st of layers.stats) {
    if (!st.complete) continue;
    const o = dim(st.holeId);
    if (s.circle) {
      for (const b of holeBaskets(doc, st.holeId)) out.push(`<circle cx="${n(b.x)}" cy="${n(b.y)}" r="${n(CIRCLE_ONE_FT)}" fill="none" stroke="${pal.line}" stroke-opacity="${n(0.6 * o)}" stroke-width="${n(px(1))}" stroke-dasharray="${n(px(3))} ${n(px(3))}"/>`);
    }
  }
  if (s.throwLines) {
    for (const st of layers.stats) {
      if (!st.complete) continue;
      const hole = doc.holes.find(h => h.id === st.holeId)!;
      const o = dim(st.holeId);
      // Other tees of the hole: thinner dashed lines in their colors
      for (const tee of doc.items.filter(i => i.type === "tee" && i.holeId === st.holeId && i.id !== st.teeId) as TeeItem[]) {
        const line = smoothPath([{ x: tee.x, y: tee.y }, ...hole.doglegs, st.line[st.line.length - 1]], 10);
        out.push(`<path d="${pathD(line)}" fill="none" stroke="${TEE_LEVELS[tee.level].color === "#f8fafc" ? "#e5e7eb" : TEE_LEVELS[tee.level].color}" stroke-width="${n(px(1.6))}" stroke-dasharray="${n(px(5))} ${n(px(4))}" opacity="${n(0.9 * o)}"/>`);
      }
      const line = smoothPath(st.line, 12);
      const len = pathLength(line);
      const trim = trimPath(line, 6 / k, len - Math.max(2.2 / k * 6, 8));
      out.push(`<path d="${pathD(trim)}" fill="none" stroke="${pal.lineCasing}" stroke-width="${n(px(4.6))}" stroke-linecap="round" stroke-linejoin="round" opacity="${o}"/>`);
      out.push(`<path d="${pathD(trim)}" fill="none" stroke="${pal.line}" stroke-width="${n(px(2.4))}" stroke-linecap="round" stroke-linejoin="round" opacity="${o}"/>`);
      // Arrowhead short of the basket
      const end = pointAlong(line, Math.max(0, len - Math.max(12 / k, 6)));
      const tip = end.point, a = end.angle, al = 9 / k;
      const head = [
        { x: tip.x + Math.cos(a) * al * 0.6, y: tip.y + Math.sin(a) * al * 0.6 },
        { x: tip.x - Math.cos(a - 0.45) * al, y: tip.y - Math.sin(a - 0.45) * al },
        { x: tip.x - Math.cos(a + 0.45) * al, y: tip.y - Math.sin(a + 0.45) * al }
      ];
      out.push(`<polygon points="${pts(head)}" fill="${pal.line}" stroke="${pal.lineCasing}" stroke-width="${n(px(1))}" opacity="${o}"/>`);
    }
  }
  out.push(`</g>`);

  // --- Symbols and labels in screen space (always upright, constant size)
  const sym: string[] = [];
  const textLabel = (p: P, text: string, size: number, opts: { color?: string; halo?: string; weight?: number; anchor?: string; angle?: number; family?: string } = {}) =>
    `<text x="${n(p.x)}" y="${n(p.y)}" font-family="${opts.family ?? font}" font-size="${n(size)}" font-weight="${opts.weight ?? 700}" text-anchor="${opts.anchor ?? "middle"}" dominant-baseline="central" fill="${opts.color ?? pal.label}" stroke="${opts.halo ?? pal.labelHalo}" stroke-width="${n(size * 0.22)}" stroke-linejoin="round" paint-order="stroke"${opts.angle ? ` transform="rotate(${n(opts.angle)} ${n(p.x)} ${n(p.y)})"` : ""}>${esc(text)}</text>`;

  // Area and line names
  for (const a of areas) if (a.label) sym.push(textLabel(toScreen(labelPoint(a.points)), a.label, 10 * ts, { color: a.kind === "water" && pal.label === "#ffffff" ? "#e0f2fe" : a.kind === "water" ? shade(s.water, -0.55) : pal.label, halo: a.kind === "water" && pal.label !== "#ffffff" ? shade(s.water, 0.6) : undefined, weight: 600 }));
  for (const l of lines) if (l.label && l.points.length >= 2) {
    const mid = pointAlong(l.points, pathLength(l.points) / 2);
    let ang = (mid.angle * 180) / Math.PI - view.rotation;
    while (ang > 90) ang -= 180;
    while (ang < -90) ang += 180;
    sym.push(textLabel(toScreen(mid.point), l.label, 9 * ts, { weight: 600, angle: ang }));
  }

  // Distance labels along each throw line
  if (s.distances) {
    for (const st of layers.stats) {
      if (!st.complete || (focus && st.holeId !== focus)) continue;
      const line = smoothPath(st.line, 10);
      const mid = pointAlong(line, pathLength(line) * 0.55);
      let ang = (mid.angle * 180) / Math.PI - view.rotation;
      while (ang > 90) ang -= 180;
      while (ang < -90) ang += 180;
      const off = 9 * ts;
      const sp = toScreen(mid.point);
      const nrm = { x: -Math.sin((ang * Math.PI) / 180), y: Math.cos((ang * Math.PI) / 180) };
      sym.push(textLabel({ x: sp.x - nrm.x * off, y: sp.y - nrm.y * off }, `${fmtDist(st.length, doc.units, false)}${doc.units === "ft" ? "'" : " m"}`, 10 * ts, { angle: ang, weight: 700 }));
    }
  }

  // Mandos and drop zones
  for (const m of items.filter(i => i.type === "mando") as MandoItem[]) {
    const p = toScreen(m);
    const a = m.rotation - view.rotation;
    const r = 7 * ts;
    // Restricted side: a short orange line to the side the disc must not pass
    const sideSign = m.side === "right" ? -1 : 1;
    const ra = ((a + sideSign * 90) * Math.PI) / 180;
    sym.push(`<g opacity="${dim(m.holeId)}"><line x1="${n(p.x)}" y1="${n(p.y)}" x2="${n(p.x + Math.cos(ra) * r * 3)}" y2="${n(p.y + Math.sin(ra) * r * 3)}" stroke="#f97316" stroke-width="${n(2.4 * ts)}" stroke-linecap="round"/>`);
    sym.push(`<circle cx="${n(p.x)}" cy="${n(p.y)}" r="${n(r)}" fill="#f97316" stroke="#fff" stroke-width="${n(1.4 * ts)}"/>`);
    const pa = (a * Math.PI) / 180;
    const pass = { x: p.x - Math.cos(ra) * r * 1.9, y: p.y - Math.sin(ra) * r * 1.9 };
    sym.push(`<path d="M${n(pass.x - Math.cos(pa) * r)} ${n(pass.y - Math.sin(pa) * r)}L${n(pass.x + Math.cos(pa) * r)} ${n(pass.y + Math.sin(pa) * r)}" stroke="#f97316" stroke-width="${n(2 * ts)}" marker-end="url(#${uid}-arrow)"/>`);
    sym.push(textLabel(p, "M", 8 * ts, { color: "#fff", halo: "#f97316", weight: 800 }) + `</g>`);
  }
  defs.push(`<marker id="${uid}-arrow" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#f97316"/></marker>`);
  for (const dz of items.filter(i => i.type === "dropzone") as DropZoneItem[]) {
    const p = toScreen(dz);
    sym.push(`<g opacity="${dim(dz.holeId)}"><circle cx="${n(p.x)}" cy="${n(p.y)}" r="${n(8 * ts)}" fill="#fff" stroke="#f97316" stroke-width="${n(2 * ts)}"/>${textLabel(p, "DZ", 7 * ts, { color: "#f97316", halo: "#fff", weight: 800 })}</g>`);
  }

  // Amenities
  for (const am of items.filter(i => i.type === "amenity") as AmenityItem[]) {
    const p = toScreen(am);
    const meta = AMENITY_KINDS[am.kind];
    const w = (meta.letter.length > 1 ? 15 : 11) * ts, h = 11 * ts;
    sym.push(`<rect x="${n(p.x - w / 2)}" y="${n(p.y - h / 2)}" width="${n(w)}" height="${n(h)}" rx="${n(2.5 * ts)}" fill="${meta.color}" stroke="#fff" stroke-width="${n(1.2 * ts)}"/>${textLabel(p, meta.letter, 7 * ts, { color: "#fff", halo: meta.color, weight: 800, family: "Inter, Arial, sans-serif" })}`);
  }

  // Tees and baskets, then hole numbers
  const mainTees = new Set(layers.stats.map(st => st.teeId));
  for (const tee of items.filter(i => i.type === "tee") as TeeItem[]) {
    const o = dim(tee.holeId);
    const lvl = TEE_LEVELS[tee.level];
    // The pad at real size when that's big enough to see, else a minimum size
    const len = Math.max(tee.padLength * k, 9 * ts), wid = Math.max(tee.padWidth * k, 4.5 * ts);
    const c = toScreen(tee);
    const corners = rectCorners(c, len, wid, teeAim(doc, tee) - view.rotation);
    sym.push(`<polygon points="${pts(corners)}" fill="${lvl.color}" stroke="${lvl.color === "#f8fafc" ? "#333" : "#111"}" stroke-width="${n(0.9 * ts)}" opacity="${n(o * (mainTees.has(tee.id) ? 1 : 0.85))}"/>`);
  }
  for (const b of items.filter(i => i.type === "basket") as BasketItem[]) {
    const p = toScreen(b);
    const r = 5.2 * ts;
    const o = dim(b.holeId);
    const multi = holeBaskets(doc, b.holeId).length > 1;
    const number = layers.stats.find(st => st.holeId === b.holeId)?.number;
    sym.push(`<g opacity="${o}">${basketMark(s.basketMark ?? "basket", p, 0.72 * ts, s.basket, number ? String(number) : "")}`);
    if (multi) sym.push(textLabel({ x: p.x + r * 1.6, y: p.y - r * 1.1 }, b.position, 7 * ts, { color: pal.label, weight: 800 }));
    sym.push(`</g>`);
  }
  // Hole number badges at the tees used (the main tee), offset back from the pad
  for (const st of layers.stats) {
    const tee = items.find(i => i.id === st.teeId) as TeeItem | undefined;
    if (!tee) continue;
    const lvl = TEE_LEVELS[tee.level];
    const aim = teeAim(doc, tee);
    const back = toScreen({ x: tee.x - Math.cos((aim * Math.PI) / 180) * (tee.padLength / 2 + 2), y: tee.y - Math.sin((aim * Math.PI) / 180) * (tee.padLength / 2 + 2) });
    const dir = { x: back.x - toScreen(tee).x, y: back.y - toScreen(tee).y };
    const dl = Math.hypot(dir.x, dir.y) || 1;
    const r = 9.5 * ts;
    const at = { x: back.x + (dir.x / dl) * (r + 3 * ts), y: back.y + (dir.y / dl) * (r + 3 * ts) };
    const o = dim(st.holeId);
    if (forest) {
      // Bold white italic numbers beside the tee, as on painted course maps
      const side = { x: -dir.y / dl, y: dir.x / dl };
      const p = { x: toScreen(tee).x + side.x * 14 * ts + (dir.x / dl) * 4 * ts, y: toScreen(tee).y + side.y * 14 * ts + (dir.y / dl) * 4 * ts };
      sym.push(`<text x="${n(p.x)}" y="${n(p.y)}" font-family="${font}" font-size="${n(15 * ts)}" font-weight="700" font-style="italic" text-anchor="middle" dominant-baseline="central" fill="#ffffff" stroke="rgba(8,20,4,.75)" stroke-width="${n(2.6 * ts)}" stroke-linejoin="round" paint-order="stroke" opacity="${o}">${st.number}</text>`);
      continue;
    }
    sym.push(`<g opacity="${o}"><circle cx="${n(at.x)}" cy="${n(at.y)}" r="${n(r)}" fill="${lvl.color}" stroke="${lvl.color === "#f8fafc" ? "#1f2937" : "#ffffff"}" stroke-width="${n(1.6 * ts)}"/>${textLabel({ x: at.x, y: at.y + 0.5 * ts }, String(st.number), 11.5 * ts, { color: lvl.ink, halo: lvl.color, weight: 700 })}</g>`);
  }
  // Text labels placed on the map
  for (const l of items.filter(i => i.type === "label") as LabelItem[]) sym.push(textLabel(toScreen(l), l.text, l.fontSize * 0.8 * ts, { color: l.color, weight: 700 }));

  return { svg: `<defs>${defs.join("")}</defs>${out.join("")}${sym.join("")}`, toScreen };
};

// The painted land takes a moment: keep the last few, keyed by what they depend on (so typing a
// title or changing the OB color doesn't repaint it).
const forestCache = new Map<string, string>();
let objectIds = new WeakMap<object, number>();
let nextId = 1;
const idOf = (o: object | null | undefined) => {
  if (!o) return 0;
  if (!objectIds.has(o)) objectIds.set(o, nextId++);
  return objectIds.get(o)!;
};
const forestPicture = (doc: CourseDoc, view: MapView, layers: MapLayers) => {
  const s = doc.style;
  const canopy = s.forest === "photo" ? layers.canopy ?? null : null;
  const shapes = doc.items.filter(i => i.type !== "label" && i.type !== "mando").map(i => (i.type === "area" || i.type === "line" ? [i.type, i.kind, i.points, (i as LineItem).width] : [i.type, Math.round(i.x), Math.round(i.y), (i as TreeItem).radius]));
  const look = [s.forest, s.treeCover, s.trees, s.fairway, s.rough, s.water, s.path, s.nextTee, s.hillshade];
  const key = JSON.stringify([view, look, idOf(canopy), idOf(doc.terrainHeights), layers.stats.map(st => [st.holeId, st.line]), doc.holes.map(h => [h.id, h.fairwayWidth, h.fairway]), shapes, doc.canvas, doc.id]);
  const hit = forestCache.get(key);
  if (hit) return hit;
  const canvas = forestCanvas(doc, view, layers.stats, { mode: s.forest ?? "everywhere", canopy, style: s, density: Math.min(3, Math.max(1.5, 2400 / Math.max(view.width, view.height))) });
  // A photo-like picture: JPEG keeps it a tenth the size of a PNG
  const url = canvas.toDataURL("image/jpeg", 0.9);
  forestCache.set(key, url);
  if (forestCache.size > 6) forestCache.delete(forestCache.keys().next().value!);
  return url;
};
export const resetForestCache = () => { forestCache.clear(); objectIds = new WeakMap(); };

/** Lighter (amount > 0) or darker (< 0) version of a hex color. */
export const shade = (hex: string, amount: number) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const v = parseInt(m[1], 16);
  const ch = (c: number) => Math.round(Math.max(0, Math.min(255, amount >= 0 ? c + (255 - c) * amount : c * (1 + amount))));
  const r = ch((v >> 16) & 255), g = ch((v >> 8) & 255), b = ch(v & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
};

/** A polyline trimmed to the part between two distances along it. */
const trimPath = (line: P[], from: number, to: number) => {
  if (to <= from) return line;
  const out: P[] = [pointAlong(line, from).point];
  let acc = 0;
  for (let i = 1; i < line.length; i++) {
    acc += dist(line[i - 1], line[i]);
    if (acc > from && acc < to) out.push(line[i]);
  }
  out.push(pointAlong(line, to).point);
  return out;
};

/** A good spot inside a polygon for its name (its middle, or the most inside of a few tries). */
const labelPoint = (poly: P[]) => {
  const b = boundsOf(poly);
  const c = { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
  if (pointInPolygon(c, poly)) return c;
  let best = c, bestD = -1;
  for (let i = 1; i < 8; i++) for (let j = 1; j < 8; j++) {
    const p = { x: b.minX + ((b.maxX - b.minX) * i) / 8, y: b.minY + ((b.maxY - b.minY) * j) / 8 };
    if (!pointInPolygon(p, poly)) continue;
    const d = Math.min(...poly.map((q, k) => {
      const r = poly[(k + 1) % poly.length];
      return segDist(p, q, r);
    }));
    if (d > bestD) { bestD = d; best = p; }
  }
  return best;
};
const segDist = (p: P, a: P, b: P) => {
  const dx = b.x - a.x, dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(p.x - a.x - dx * t, p.y - a.y - dy * t);
};

/** Woods: the area in canopy green, with crowns scattered over it (deterministic). */
const woods = (a: AreaItem, color: string, k: number, uid: string, shadow: number, o: number) => {
  const b = boundsOf(a.points);
  const step = Math.max(14, 9 / k);
  const crowns: string[] = [];
  const shadows: string[] = [];
  let seed = Math.round(Math.abs(b.minX * 7 + b.minY * 13)) % 2147483646 + 1;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let y = b.minY; y <= b.maxY; y += step * 0.85) {
    for (let x = b.minX; x <= b.maxX; x += step) {
      const p = { x: x + (rnd() - 0.5) * step * 0.8, y: y + (rnd() - 0.5) * step * 0.8 };
      if (!pointInPolygon(p, a.points)) continue;
      const r = step * (0.55 + rnd() * 0.3);
      if (shadow > 0) shadows.push(`<circle cx="${n(p.x + r * 0.25)}" cy="${n(p.y + r * 0.3)}" r="${n(r)}"/>`);
      crowns.push(`<circle cx="${n(p.x)}" cy="${n(p.y)}" r="${n(r)}" fill="${shade(color, (rnd() - 0.5) * 0.18)}"/>`);
    }
  }
  const clip = `${uid}-w${Math.abs(Math.round(b.minX + b.minY * 3))}`;
  return `<g opacity="${o}"><clipPath id="${clip}"><polygon points="${pts(a.points)}"/></clipPath><polygon points="${pts(a.points)}" fill="${shade(color, -0.15)}"/><g clip-path="url(#${clip})"><g fill="#081405" opacity="${n(shadow)}">${shadows.join("")}</g>${crowns.join("")}<g fill="url(#${uid}-crown)">${crowns.join("").replace(/ fill="#[0-9a-f]{6}"/gi, "")}</g></g></g>`;
};

// ------------------------------------------------------------------ the poster

export type PosterOptions = { contours: Contours | null; hillshade: string | null; canopy?: CanopyGrid | null; dpi?: number };

/** The page size in inches for the style's paper and orientation (auto: to suit the course's shape). */
export const pageSize = (doc: CourseDoc, aspect: number) => {
  const p = PAPER[doc.style.paper];
  const landscape = doc.style.orientation === "landscape" || (doc.style.orientation === "auto" && aspect > 1.05);
  return landscape ? { w: Math.max(p.w, p.h), h: Math.min(p.w, p.h) } : { w: Math.min(p.w, p.h), h: Math.max(p.w, p.h) };
};

/** The part of the plan the map shows: the holes and what is around them, inside the site. */
export const courseBounds = (doc: CourseDoc, stats: HoleStats[]) => {
  const pts: P[] = [];
  stats.forEach(s => pts.push(...s.line));
  doc.items.forEach(i => { if (i.type === "tee" || i.type === "basket" || i.type === "mando" || i.type === "dropzone" || i.type === "amenity") pts.push(i); });
  if (pts.length < 2) return { minX: 0, minY: 0, maxX: doc.canvas.width, maxY: doc.canvas.height };
  const b = boundsOf(pts);
  const pad = Math.max(80, Math.max(b.maxX - b.minX, b.maxY - b.minY) * 0.08);
  return {
    minX: Math.max(doc.site.bounds ? 0 : -Infinity, b.minX - pad),
    minY: Math.max(doc.site.bounds ? 0 : -Infinity, b.minY - pad),
    maxX: Math.min(doc.site.bounds ? doc.canvas.width : Infinity, b.maxX + pad),
    maxY: Math.min(doc.site.bounds ? doc.canvas.height : Infinity, b.maxY + pad)
  };
};

/**
 * The whole course map page as an SVG document, sized in points (1/72 in): the map with the
 * title on top, the legend and the hole table at the side (or below, on a tall page).
 */
/** The points a map must show (tees, baskets, throw lines, mandos...), for fitting and turning it. */
export const coursePoints = (doc: CourseDoc, stats: HoleStats[]) => {
  const pts: P[] = [];
  stats.forEach(s => pts.push(...s.line));
  doc.items.forEach(i => { if (i.type === "tee" || i.type === "basket" || i.type === "mando" || i.type === "dropzone" || i.type === "amenity") pts.push(i); });
  return pts;
};

/** The turn (degrees) that lets the course fill a page of this shape best. */
export const bestRotation = (doc: CourseDoc) => {
  const stats = doc.holes.map(h => holeStats(doc, h, activeLayout(doc)));
  const pts = coursePoints(doc, stats);
  if (pts.length < 2) return 0;
  const p = PAPER[doc.style.paper];
  const long = Math.max(p.w, p.h), short = Math.min(p.w, p.h);
  let best = { deg: 0, scale: 0 };
  for (let deg = -90; deg < 90; deg += 3) {
    const b = boundsOf(pts.map(q => rotatePoint(q, -deg)));
    const w = Math.max(1, b.maxX - b.minX), h = Math.max(1, b.maxY - b.minY);
    // Either orientation of the paper
    const scale = Math.max(Math.min(long / w, short / h), Math.min(short / w, long / h));
    // Prefer north up when it's nearly as good
    if (scale > best.scale * (deg === 0 ? 0.97 : 1.03)) best = { deg, scale };
  }
  return best.deg;
};

/**
 * The whole course map page as an SVG document, sized in points (1/72 in). The Forest style is a
 * full-bleed picture with the title laid over the emptiest corner; the others put the title on
 * top and the legend and hole table at the side (or below, on a tall page).
 */
export const renderPoster = (doc: CourseDoc, opts: PosterOptions) => {
  const s = doc.style;
  const pal = palette(s);
  const layout = activeLayout(doc);
  const stats = doc.holes.map(h => holeStats(doc, h, layout));
  const totals = courseTotals(doc, stats);
  const rotation = s.rotation || 0;
  // The course's extent in the turned frame
  const raw = courseBounds(doc, stats);
  const corners = [{ x: raw.minX, y: raw.minY }, { x: raw.maxX, y: raw.minY }, { x: raw.maxX, y: raw.maxY }, { x: raw.minX, y: raw.maxY }];
  const pts = coursePoints(doc, stats);
  const rb = boundsOf((pts.length >= 2 && rotation ? pts : corners).map(q => rotatePoint(q, -rotation)));
  const pad = rotation && pts.length >= 2 ? Math.max(80, Math.max(rb.maxX - rb.minX, rb.maxY - rb.minY) * 0.08) : 0;
  const bw = Math.max(50, rb.maxX - rb.minX + pad * 2), bh = Math.max(50, rb.maxY - rb.minY + pad * 2);
  const center = rotatePoint({ x: (rb.minX + rb.maxX) / 2, y: (rb.minY + rb.maxY) / 2 }, rotation);
  const page = pageSize(doc, bw / bh);
  const W = page.w * 72, H = page.h * 72;
  const ts = (Math.min(W, H) / (8.5 * 72)) * s.labelScale;
  const m = 0.35 * 72 * Math.max(1, ts * 0.8);
  const font = fontStack(s.font);
  const landscape = W > H;
  const full = s.theme === "forest";
  const title = s.title || doc.name;
  const sub = s.subtitle || [doc.site.location?.label, doc.designer ? `Designed by ${doc.designer}` : ""].filter(Boolean).join(" · ");
  const parts: string[] = [];
  parts.push(`<rect width="${n(W)}" height="${n(H)}" fill="${pal.paper}"/>`);
  const credit = [s.footer, doc.site.imagerySource && s.theme === "satellite" ? "Imagery © Esri" : "", doc.items.some(i => (i.type === "area" || i.type === "line") && i.importSource === "osm") ? "Map data © OpenStreetMap contributors" : "", "Made with Disc Golf Course Designer"].filter(Boolean).join(" · ");

  if (full) {
    // The map fills the page; the course fits inside a margin
    const scale = Math.min((W - 2 * m) / bw, (H - 2 * m) / bh);
    const view: MapView = { cx: center.x, cy: center.y, rotation, scale, width: W, height: H };
    const map = renderMapLayers(doc, view, { stats, contours: opts.contours, hillshade: opts.hillshade, textScale: ts * 0.9, fontFamily: s.font, canopy: opts.canopy }, "pm");
    parts.push(map.svg);
    // The emptiest corner for the title
    const shown = pts.map(map.toScreen);
    const bw2 = W * 0.42, bh2 = H * 0.4;
    const spots = [{ x: 0, y: 0 }, { x: W - bw2, y: 0 }, { x: 0, y: H - bh2 }, { x: W - bw2, y: H - bh2 }];
    const busy = (c: P) => shown.filter(p => p.x >= c.x && p.x <= c.x + bw2 && p.y >= c.y && p.y <= c.y + bh2).length;
    const spot = spots.reduce((a, c) => (busy(c) < busy(a) ? c : a));
    const left = spot.x === 0, top = spot.y === 0;
    const tx = left ? m : W - m, anchor = left ? "start" : "end";
    let ty = top ? m + 6 * ts : H - bh2 + m;
    const shadow = `filter="url(#title-shadow)"`;
    parts.push(`<defs><filter id="title-shadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="${n(1.5 * ts)}" stdDeviation="${n(2.5 * ts)}" flood-color="#000" flood-opacity="0.65"/></filter><radialGradient id="title-glow" cx="${left ? 0 : 1}" cy="${top ? 0 : 1}" r="1"><stop offset="0" stop-color="#050b04" stop-opacity="0.55"/><stop offset="1" stop-color="#050b04" stop-opacity="0"/></radialGradient></defs>`);
    parts.push(`<rect x="${n(spot.x)}" y="${n(spot.y)}" width="${n(bw2)}" height="${n(bh2)}" fill="url(#title-glow)"/>`);
    // "The" small, the name big, "DISC GOLF COURSE" spaced out
    let name = title.trim();
    const the = /^the\s+/i.test(name);
    if (the) name = name.replace(/^the\s+/i, "");
    const course = /\s+disc\s+golf(\s+course)?$/i.test(name);
    if (course) name = name.replace(/\s+disc\s+golf(\s+course)?$/i, "");
    const big = Math.min(54 * ts, ((W * 0.4) / Math.max(4, name.length)) * (s.font === "Script" ? 2.1 : 1.9));
    if (the) { parts.push(`<text x="${n(tx)}" y="${n(ty + 12 * ts)}" text-anchor="${anchor}" font-family="${font}" font-weight="700" font-style="italic" font-size="${n(13 * ts)}" fill="#fff" ${shadow}>THE</text>`); ty += 10 * ts; }
    parts.push(`<text x="${n(tx)}" y="${n(ty + big * 0.95)}" text-anchor="${anchor}" font-family="${titleStack(s.font)}" font-weight="700" font-size="${n(big)}" fill="#fff" ${shadow}>${esc(s.font === "Script" ? name : name.toUpperCase())}</text>`);
    ty += big * 1.15;
    parts.push(`<text x="${n(tx)}" y="${n(ty + 12 * ts)}" text-anchor="${anchor}" font-family="Inter, Arial, sans-serif" font-weight="800" font-size="${n(12 * ts)}" letter-spacing="${n(3.2 * ts)}" fill="#fff" ${shadow}>${course || !/golf/i.test(title) ? "DISC GOLF COURSE" : ""}</text>`);
    ty += 20 * ts;
    if (sub) { parts.push(`<text x="${n(tx)}" y="${n(ty + 6 * ts)}" text-anchor="${anchor}" font-family="Inter, Arial, sans-serif" font-weight="600" font-size="${n(6.5 * ts)}" letter-spacing="${n(1 * ts)}" fill="#e7f0e2" ${shadow}>${esc(sub.toUpperCase())}</text>`); ty += 14 * ts; }
    // Layout chips: name with a rule in the tee color, then PAR | LENGTH on black
    const chips = doc.layouts.slice(0, 3).map(l => {
      const ls = doc.holes.map(h => holeStats(doc, h, l)).filter(x => x.complete);
      return { l, par: ls.reduce((t, x) => t + x.par, 0), len: ls.reduce((t, x) => t + x.length, 0) };
    }).filter(c => c.par > 0);
    const cw = 104 * ts, chH = 20 * ts;
    chips.forEach((c, i) => {
      const x0 = left ? tx + i * (cw + 8 * ts) : tx - (chips.length - i) * (cw + 8 * ts) + 8 * ts;
      const col = TEE_LEVELS[c.l.tee].color;
      parts.push(`<text x="${n(x0)}" y="${n(ty + 8 * ts)}" font-family="Oswald, Arial, sans-serif" font-weight="600" font-size="${n(7 * ts)}" fill="${col}" ${shadow}>${esc(`${c.l.name} layout`.toUpperCase())}</text>`);
      parts.push(`<rect x="${n(x0 + 52 * ts)}" y="${n(ty + 5.5 * ts)}" width="${n(cw - 52 * ts)}" height="${n(1.4 * ts)}" fill="${col}"/>`);
      parts.push(`<rect x="${n(x0)}" y="${n(ty + 12 * ts)}" width="${n(cw)}" height="${n(chH)}" fill="#0b0f0a" fill-opacity="0.88"/>`);
      parts.push(`<text x="${n(x0 + cw / 2)}" y="${n(ty + 12 * ts + chH / 2)}" text-anchor="middle" dominant-baseline="central" font-family="Oswald, Arial, sans-serif" font-weight="600" font-size="${n(11 * ts)}" fill="${col === "#f8fafc" ? "#ffffff" : col}">PAR ${c.par} <tspan fill="#ffffff" fill-opacity="0.6">|</tspan> ${esc(fmtDist(c.len, doc.units, false))}${doc.units === "ft" ? "'" : " m"}</text>`);
    });
    // North arrow, scale bar, legend and table in the other corners
    const other = spots.filter(c => c !== spot).sort((a, b) => busy(a) - busy(b));
    if (s.north) {
      const c = other[0];
      parts.push(`<g transform="translate(${n(c.x === 0 ? m + 16 * ts : W - m - 16 * ts)} ${n(c.y === 0 ? m + 20 * ts : H - m - 30 * ts)}) rotate(${n(-rotation)})">${northArrow(0, 0, 15 * ts, pal)}</g>`);
    }
    if (s.scale) parts.push(scaleBar(left && !top ? W - m - 150 * ts : m, H - m * 0.9, scale, ts, { ...pal, panel: "rgba(8,14,7,.7)", ink: "#ffffff" }, doc.units));
    if (s.legend || s.holeTable) {
      const c = other[1] ?? other[0];
      const w = 200 * ts, h = Math.min(H * 0.55, (s.holeTable ? 40 + stats.length * 12 : 0) * ts + (s.legend ? 170 : 0) * ts);
      const x = c.x === 0 ? m : W - m - w, y = c.y === 0 ? m : H - m - h - 14 * ts;
      parts.push(`<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" rx="${n(6 * ts)}" fill="${pal.panel}"/>`);
      let yy = y + 14 * ts;
      if (s.holeTable) { const t = holeTable(doc, stats, x + 10 * ts, yy, w - 20 * ts, ts * 0.9, pal, font, "vertical", h * (s.legend ? 0.6 : 0.95)); parts.push(t.svg); yy = t.bottom + 8 * ts; }
      if (s.legend) parts.push(legend(doc, x + 10 * ts, yy, w - 20 * ts, ts * 0.9, pal, font));
    }
    parts.push(`<text x="${n(W - m * 0.6)}" y="${n(H - m * 0.35)}" text-anchor="end" font-family="Inter, Arial, sans-serif" font-size="${n(6 * ts)}" fill="#ffffff" fill-opacity="0.75">${esc(credit)}</text>`);
    return { svg: wrapSvg(W, H, parts.join(""), opts.dpi), width: W, height: H, page };
  }

  const titleH = (title ? 46 : 0) * ts + (sub ? 14 * ts : 0);
  const showSide = s.legend || s.holeTable;
  const sideW = showSide && landscape ? Math.min(W * 0.26, 210 * ts) : 0;
  const bottomH = showSide && !landscape ? Math.min(H * 0.3, 150 * ts) : 0;
  const map = { x: m, y: m + titleH, w: W - 2 * m - (sideW ? sideW + m * 0.6 : 0), h: H - 2 * m - titleH - (bottomH ? bottomH + m * 0.5 : 0) - 14 * ts };
  const scale = Math.min(map.w / bw, map.h / bh);
  const view: MapView = { cx: center.x, cy: center.y, rotation, scale, width: map.w, height: map.h };
  const { svg } = renderMapLayers(doc, view, { stats, contours: opts.contours, hillshade: opts.hillshade, textScale: ts * 0.9, fontFamily: s.font, canopy: opts.canopy }, "pm");
  if (title) parts.push(`<text x="${n(m)}" y="${n(m + 30 * ts)}" font-family="${titleStack(s.font)}" font-weight="700" font-size="${n(30 * ts)}" fill="${pal.ink}" letter-spacing="${n(s.font === "Script" ? 0 : 0.5 * ts)}">${esc(s.font === "Script" ? title : title.toUpperCase())}</text>`);
  const info = `${totals.complete} HOLES · PAR ${totals.par} · ${fmtDist(totals.length, doc.units).toUpperCase()}${layout && doc.layouts.length > 1 ? ` · ${layout.name.toUpperCase()} LAYOUT` : ""}`;
  parts.push(`<text x="${n(W - m)}" y="${n(m + 28 * ts)}" text-anchor="end" font-family="${font}" font-weight="600" font-size="${n(13 * ts)}" fill="${pal.inkSoft}">${esc(info)}</text>`);
  if (sub) parts.push(`<text x="${n(m)}" y="${n(m + 46 * ts)}" font-family="Inter, Arial, sans-serif" font-size="${n(9.5 * ts)}" fill="${pal.inkSoft}">${esc(sub)}</text>`);
  // Map
  parts.push(`<clipPath id="map-clip"><rect x="${n(map.x)}" y="${n(map.y)}" width="${n(map.w)}" height="${n(map.h)}" rx="${n(4 * ts)}"/></clipPath>`);
  parts.push(`<g clip-path="url(#map-clip)"><g transform="translate(${n(map.x)} ${n(map.y)})">${svg}</g></g>`);
  parts.push(`<rect x="${n(map.x)}" y="${n(map.y)}" width="${n(map.w)}" height="${n(map.h)}" rx="${n(4 * ts)}" fill="none" stroke="${pal.ink}" stroke-opacity="0.6" stroke-width="${n(1 * ts)}"/>`);
  // North arrow and scale bar
  if (s.north) parts.push(`<g transform="translate(${n(map.x + map.w - 26 * ts)} ${n(map.y + 30 * ts)}) rotate(${n(-rotation)})">${northArrow(0, 0, 15 * ts, pal)}</g>`);
  if (s.scale) parts.push(scaleBar(map.x + 12 * ts, map.y + map.h - 14 * ts, scale, ts, pal, doc.units));
  // Side panel / bottom band
  if (showSide) {
    const box = sideW ? { x: W - m - sideW, y: map.y, w: sideW, h: map.h } : { x: m, y: map.y + map.h + m * 0.5, w: W - 2 * m, h: bottomH };
    parts.push(`<rect x="${n(box.x)}" y="${n(box.y)}" width="${n(box.w)}" height="${n(box.h)}" rx="${n(4 * ts)}" fill="${pal.panel}" stroke="${pal.ink}" stroke-opacity="0.15"/>`);
    const tableW = !sideW && s.legend && s.holeTable ? box.w * 0.62 : box.w;
    let y = box.y + 14 * ts;
    if (s.holeTable) {
      const t = holeTable(doc, stats, box.x + 10 * ts, y, tableW - 20 * ts, ts, pal, font, sideW ? "vertical" : "horizontal", sideW ? box.h * (s.legend ? 0.6 : 0.95) : box.h - 20 * ts);
      parts.push(t.svg);
      y = t.bottom + 10 * ts;
    }
    if (s.legend) {
      const lx = !sideW && s.holeTable ? box.x + tableW + 4 * ts : box.x + 10 * ts;
      const ly = !sideW && s.holeTable ? box.y + 14 * ts : y;
      parts.push(legend(doc, lx, ly, (sideW ? box.w : box.w - tableW) - 20 * ts, ts, pal, font));
    }
  }
  parts.push(`<text x="${n(m)}" y="${n(H - m * 0.55)}" font-family="Inter, Arial, sans-serif" font-size="${n(7 * ts)}" fill="${pal.inkSoft}">${esc(credit)}</text>`);
  return { svg: wrapSvg(W, H, parts.join(""), opts.dpi), width: W, height: H, page };
};

export const wrapSvg = (W: number, H: number, body: string, dpi?: number, fontCss = "") =>
  `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${dpi ? n((W / 72) * dpi) : n(W)}" height="${dpi ? n((H / 72) * dpi) : n(H)}" viewBox="0 0 ${n(W)} ${n(H)}">${fontCss ? `<style>${fontCss}</style>` : ""}${body}</svg>`;

export const northArrow = (x: number, y: number, r: number, pal: Palette) =>
  `<g transform="translate(${n(x)} ${n(y)})"><circle r="${n(r)}" fill="${pal.panel}" fill-opacity="0.9" stroke="${pal.ink}" stroke-opacity="0.4"/><path d="M0 ${n(-r * 0.8)}L${n(r * 0.42)} ${n(r * 0.45)}L0 ${n(r * 0.18)}Z" fill="${pal.ink}"/><path d="M0 ${n(-r * 0.8)}L${n(-r * 0.42)} ${n(r * 0.45)}L0 ${n(r * 0.18)}Z" fill="${pal.ink}" fill-opacity="0.45"/><text y="${n(r * 0.78)}" text-anchor="middle" dominant-baseline="hanging" font-family="Inter, Arial, sans-serif" font-weight="800" font-size="${n(r * 0.55)}" fill="${pal.ink}" transform="translate(0 ${n(-r * 1.95)})">N</text></g>`;

/** A scale bar with round lengths in feet (and meters under it). */
export const scaleBar = (x: number, y: number, pxPerFt: number, ts: number, pal: Palette, units: "ft" | "m") => {
  const target = 110 * ts;
  const unitFt = units === "m" ? FT_PER_M : 1;
  const raw = target / pxPerFt / unitFt;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const len = [1, 2, 5, 10].map(mm => mm * pow).reduce((a, c) => (Math.abs(c - raw) < Math.abs(a - raw) ? c : a));
  const w = len * unitFt * pxPerFt;
  const h = 4 * ts;
  const seg = (i: number) => `<rect x="${n(x + (w / 4) * i)}" y="${n(y - h)}" width="${n(w / 4)}" height="${n(h)}" fill="${i % 2 ? pal.panel : pal.ink}"/>`;
  return `<g><rect x="${n(x - 4 * ts)}" y="${n(y - h - 14 * ts)}" width="${n(w + 30 * ts)}" height="${n(h + 18 * ts)}" rx="${n(3 * ts)}" fill="${pal.panel}" fill-opacity="0.85"/>${[0, 1, 2, 3].map(seg).join("")}<rect x="${n(x)}" y="${n(y - h)}" width="${n(w)}" height="${n(h)}" fill="none" stroke="${pal.ink}" stroke-width="${n(0.6 * ts)}"/><text x="${n(x)}" y="${n(y - h - 4 * ts)}" font-family="Inter, Arial, sans-serif" font-size="${n(7.5 * ts)}" font-weight="600" fill="${pal.ink}">0</text><text x="${n(x + w)}" y="${n(y - h - 4 * ts)}" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="${n(7.5 * ts)}" font-weight="600" fill="${pal.ink}">${len.toLocaleString()} ${units}</text></g>`;
};

/** The hole table: one row (or column, on a wide page) per hole with par and each layout's length. */
const holeTable = (doc: CourseDoc, stats: HoleStats[], x: number, y: number, w: number, ts: number, pal: Palette, font: string, mode: "vertical" | "horizontal", maxH: number) => {
  const layouts = doc.layouts;
  const lengths = layouts.map(l => doc.holes.map(h => holeStats(doc, h, l)));
  const rows: string[] = [];
  const fs = 8.5 * ts;
  if (mode === "vertical") {
    const colW = (w - 26 * ts) / (1 + layouts.length);
    const rowH = Math.min(14 * ts, (maxH - 30 * ts) / Math.max(1, stats.length + 1));
    const f = Math.min(fs, rowH * 0.7);
    rows.push(`<text x="${n(x)}" y="${n(y)}" font-family="${font}" font-weight="700" font-size="${n(f * 1.15)}" fill="${pal.panelInk}">HOLE</text><text x="${n(x + 26 * ts + colW * 0.5)}" y="${n(y)}" text-anchor="middle" font-family="${font}" font-weight="700" font-size="${n(f * 1.15)}" fill="${pal.panelInk}">PAR</text>`);
    layouts.forEach((l, i) => {
      const cx = x + 26 * ts + colW * (1.5 + i);
      const label = l.name.toUpperCase().slice(0, 8);
      const half = label.length * f * 0.3;
      rows.push(`<circle cx="${n(cx - half - f * 0.7)}" cy="${n(y - f * 0.35)}" r="${n(f * 0.38)}" fill="${TEE_LEVELS[l.tee].color}" stroke="#333" stroke-width="0.5"/><text x="${n(cx + f * 0.3)}" y="${n(y)}" text-anchor="middle" font-family="${font}" font-weight="700" font-size="${n(f * 1.05)}" fill="${pal.panelInk}">${esc(label)}</text>`);
    });
    stats.forEach((st, r) => {
      const yy = y + (r + 1) * rowH + 4 * ts;
      if (r % 2 === 0) rows.push(`<rect x="${n(x - 4 * ts)}" y="${n(yy - rowH * 0.72)}" width="${n(w + 8 * ts)}" height="${n(rowH)}" fill="${pal.panelInk}" fill-opacity="0.05"/>`);
      rows.push(`<text x="${n(x + 6 * ts)}" y="${n(yy)}" text-anchor="middle" font-family="${font}" font-weight="700" font-size="${n(f)}" fill="${pal.panelInk}">${st.number}</text>`);
      rows.push(`<text x="${n(x + 26 * ts + colW * 0.5)}" y="${n(yy)}" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="${n(f)}" fill="${pal.panelInk}">${st.complete ? st.par : "–"}</text>`);
      layouts.forEach((_, i) => {
        const ls = lengths[i][r];
        rows.push(`<text x="${n(x + 26 * ts + colW * (1.5 + i))}" y="${n(yy)}" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="${n(f)}" fill="${pal.panelInk}">${ls.complete ? fmtDist(ls.length, doc.units, false) : "–"}</text>`);
      });
    });
    const yy = y + (stats.length + 1) * rowH + 8 * ts;
    rows.push(`<line x1="${n(x - 4 * ts)}" x2="${n(x + w + 4 * ts)}" y1="${n(yy - rowH * 0.8)}" y2="${n(yy - rowH * 0.8)}" stroke="${pal.panelInk}" stroke-opacity="0.4"/>`);
    rows.push(`<text x="${n(x)}" y="${n(yy)}" font-family="${font}" font-weight="700" font-size="${n(f)}" fill="${pal.panelInk}">TOTAL</text><text x="${n(x + 26 * ts + colW * 0.5)}" y="${n(yy)}" text-anchor="middle" font-family="${font}" font-weight="700" font-size="${n(f)}" fill="${pal.panelInk}">${stats.filter(s => s.complete).reduce((t, s) => t + s.par, 0)}</text>`);
    layouts.forEach((_, i) => rows.push(`<text x="${n(x + 26 * ts + colW * (1.5 + i))}" y="${n(yy)}" text-anchor="middle" font-family="${font}" font-weight="700" font-size="${n(f)}" fill="${pal.panelInk}">${fmtDist(lengths[i].filter(s => s.complete).reduce((t, s) => t + s.length, 0), doc.units, false)}</text>`));
    return { svg: rows.join(""), bottom: yy + 4 * ts };
  }
  // Horizontal: holes across, rows for par and each layout (two blocks of up to 9 or 12 holes)
  const per = stats.length > 12 ? Math.ceil(stats.length / 2) : stats.length;
  const blocks = Math.ceil(stats.length / Math.max(1, per));
  const labelW = 52 * ts;
  const cellW = (w - labelW) / Math.max(1, per + (blocks === 1 ? 1 : 0));
  const rowH = 12 * ts;
  let yy = y;
  for (let bI = 0; bI < blocks; bI++) {
    const slice = stats.slice(bI * per, (bI + 1) * per);
    const cell = (i: number) => x + labelW + cellW * (i + 0.5);
    const rowsDef: { label: string; dot?: string; values: (string | number)[]; bold?: boolean }[] = [
      { label: "HOLE", values: slice.map(s => s.number), bold: true },
      { label: "PAR", values: slice.map(s => (s.complete ? s.par : "–")) },
      ...layouts.map((l, i) => ({ label: l.name.toUpperCase().slice(0, 9), dot: TEE_LEVELS[l.tee].color, values: slice.map((_, j) => { const ls = lengths[i][bI * per + j]; return ls.complete ? fmtDist(ls.length, doc.units, false) : "–"; }) }))
    ];
    rowsDef.forEach((row, ri) => {
      const ry = yy + ri * rowH;
      if (ri % 2 === 1) rows.push(`<rect x="${n(x - 4 * ts)}" y="${n(ry - rowH * 0.72)}" width="${n(w + 8 * ts)}" height="${n(rowH)}" fill="${pal.panelInk}" fill-opacity="0.05"/>`);
      if (row.dot) rows.push(`<circle cx="${n(x + 3 * ts)}" cy="${n(ry - fs * 0.35)}" r="${n(fs * 0.38)}" fill="${row.dot}" stroke="#333" stroke-width="0.5"/>`);
      rows.push(`<text x="${n(x + (row.dot ? 9 * ts : 0))}" y="${n(ry)}" font-family="${font}" font-weight="700" font-size="${n(fs)}" fill="${pal.panelInk}">${esc(row.label)}</text>`);
      row.values.forEach((v, i) => rows.push(`<text x="${n(cell(i))}" y="${n(ry)}" text-anchor="middle" font-family="${row.bold ? font : "Inter, Arial, sans-serif"}" font-weight="${row.bold ? 700 : 400}" font-size="${n(fs)}" fill="${pal.panelInk}">${v}</text>`));
    });
    yy += rowsDef.length * rowH + 6 * ts;
  }
  const total = stats.filter(s => s.complete);
  rows.push(`<text x="${n(x)}" y="${n(yy + 2 * ts)}" font-family="${font}" font-weight="700" font-size="${n(fs)}" fill="${pal.panelInk}">TOTAL PAR ${total.reduce((t, s) => t + s.par, 0)} · ${layouts.map((l, i) => `${l.name} ${fmtDist(lengths[i].filter(s => s.complete).reduce((t, s) => t + s.length, 0), doc.units)}`).join(" · ")}</text>`);
  return { svg: rows.join(""), bottom: yy + 8 * ts };
};

/** The legend: only what the map shows. */
const legend = (doc: CourseDoc, x: number, y: number, w: number, ts: number, pal: Palette, font: string) => {
  const s = doc.style;
  const entries: { sym: string; text: string }[] = [];
  const sw = 18 * ts, sh = 9 * ts;
  const has = (pred: (i: (typeof doc.items)[number]) => boolean) => doc.items.some(pred);
  const levels = TEE_ORDER.filter(l => has(i => i.type === "tee" && i.level === l));
  levels.forEach(l => entries.push({ sym: `<rect x="2" y="${n(sh * 0.2)}" width="${n(sw - 4)}" height="${n(sh * 0.6)}" fill="${TEE_LEVELS[l].color}" stroke="#333" stroke-width="0.6"/>`, text: `${TEE_LEVELS[l].label} tee` }));
  if (has(i => i.type === "basket")) entries.push({ sym: basketMark(s.basketMark ?? "basket", { x: sw / 2, y: sh / 2 }, (sh * 1.25) / 16, s.basket, "1"), text: "Basket" });
  if (s.throwLines && doc.holes.length) entries.push({ sym: `<line x1="0" y1="${n(sh / 2)}" x2="${n(sw)}" y2="${n(sh / 2)}" stroke="${pal.lineCasing}" stroke-width="${n(4 * ts)}"/><line x1="0" y1="${n(sh / 2)}" x2="${n(sw)}" y2="${n(sh / 2)}" stroke="${pal.line}" stroke-width="${n(2 * ts)}"/>`, text: "Throw line" });
  if (s.nextTee && doc.holes.length > 1) entries.push({ sym: `<line x1="0" y1="${n(sh / 2)}" x2="${n(sw)}" y2="${n(sh / 2)}" stroke="${pal.panelInk}" stroke-width="${n(1.6 * ts)}" stroke-dasharray="${n(1.5 * ts)} ${n(3 * ts)}" stroke-linecap="round"/>`, text: "To the next tee" });
  if (doc.holes.some(h => h.fairway)) entries.push({ sym: `<rect width="${n(sw)}" height="${n(sh)}" rx="${n(sh / 2)}" fill="${s.fairway}"/>`, text: "Fairway" });
  const areaKinds = new Set(doc.items.filter(i => i.type === "area").map(i => (i as AreaItem).kind));
  const lineKinds = new Set(doc.items.filter(i => i.type === "line").map(i => (i as LineItem).kind));
  if (areaKinds.has("ob") || lineKinds.has("ob")) entries.push({ sym: `<rect width="${n(sw)}" height="${n(sh)}" fill="${s.ob}" fill-opacity="0.25" stroke="${s.ob}" stroke-width="${n(1.4 * ts)}"/>`, text: "Out of bounds" });
  if (areaKinds.has("hazard")) entries.push({ sym: `<rect width="${n(sw)}" height="${n(sh)}" fill="${s.hazard}" fill-opacity="0.25" stroke="${s.hazard}" stroke-width="${n(1.4 * ts)}" stroke-dasharray="${n(3 * ts)} ${n(2 * ts)}"/>`, text: "Hazard" });
  if (has(i => i.type === "mando")) entries.push({ sym: `<circle cx="${n(sw / 2)}" cy="${n(sh / 2)}" r="${n(sh * 0.48)}" fill="#f97316" stroke="#fff"/>`, text: "Mando" });
  if (has(i => i.type === "dropzone")) entries.push({ sym: `<circle cx="${n(sw / 2)}" cy="${n(sh / 2)}" r="${n(sh * 0.48)}" fill="#fff" stroke="#f97316" stroke-width="${n(1.5 * ts)}"/>`, text: "Drop zone" });
  if (areaKinds.has("water") || lineKinds.has("stream")) entries.push({ sym: `<rect width="${n(sw)}" height="${n(sh)}" rx="${n(2 * ts)}" fill="${s.water}"/>`, text: "Water" });
  if (areaKinds.has("woods") || has(i => i.type === "tree")) entries.push({ sym: `<circle cx="${n(sw * 0.35)}" cy="${n(sh / 2)}" r="${n(sh * 0.48)}" fill="${s.trees}"/><circle cx="${n(sw * 0.7)}" cy="${n(sh / 2)}" r="${n(sh * 0.4)}" fill="${shade(s.trees, 0.1)}"/>`, text: "Trees" });
  if (lineKinds.has("path")) entries.push({ sym: `<line x1="0" y1="${n(sh / 2)}" x2="${n(sw)}" y2="${n(sh / 2)}" stroke="${s.path}" stroke-width="${n(3 * ts)}" stroke-linecap="round"/>`, text: "Path" });
  if (lineKinds.has("road")) entries.push({ sym: `<line x1="0" y1="${n(sh / 2)}" x2="${n(sw)}" y2="${n(sh / 2)}" stroke="${pal.road}" stroke-width="${n(5 * ts)}"/>`, text: "Road" });
  if (areaKinds.has("nogo")) entries.push({ sym: `<rect width="${n(sw)}" height="${n(sh)}" fill="#7c3aed" fill-opacity="0.2" stroke="#7c3aed"/>`, text: "Out of play" });
  if (s.contours) entries.push({ sym: `<path d="M0 ${n(sh * 0.7)}Q${n(sw / 2)} ${n(-sh * 0.2)} ${n(sw)} ${n(sh * 0.7)}" fill="none" stroke="${pal.contourMajor === "rgba(255,255,255,.6)" ? "#666" : pal.contourMajor}" stroke-width="${n(1 * ts)}"/>`, text: "Contour line" });
  const kinds = new Set(doc.items.filter(i => i.type === "amenity").map(i => (i as AmenityItem).kind));
  kinds.forEach(kd => {
    const meta = AMENITY_KINDS[kd];
    entries.push({ sym: `<rect x="${n(sw / 2 - sh * 0.6)}" width="${n(sh * 1.2)}" height="${n(sh)}" rx="2" fill="${meta.color}"/><text x="${n(sw / 2)}" y="${n(sh / 2)}" text-anchor="middle" dominant-baseline="central" font-family="Inter, Arial, sans-serif" font-size="${n(sh * 0.62)}" font-weight="800" fill="#fff">${esc(meta.letter)}</text>`, text: meta.label });
  });
  const cols = w > 260 * ts ? 2 : 1;
  const colW = w / cols;
  const rowH = 13 * ts;
  const outParts = [`<text x="${n(x)}" y="${n(y)}" font-family="${font}" font-weight="700" font-size="${n(10 * ts)}" fill="${pal.panelInk}">LEGEND</text>`];
  entries.forEach((e, i) => {
    const cx = x + (i % cols) * colW, cy = y + 8 * ts + Math.floor(i / cols) * rowH;
    outParts.push(`<g transform="translate(${n(cx)} ${n(cy)})">${e.sym}<text x="${n(sw + 6 * ts)}" y="${n(sh / 2)}" dominant-baseline="central" font-family="Inter, Arial, sans-serif" font-size="${n(8 * ts)}" fill="${pal.panelInk}">${esc(e.text)}</text></g>`);
  });
  return outParts.join("");
};
