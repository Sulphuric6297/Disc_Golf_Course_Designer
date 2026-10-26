// The course's symbols, drawn the same way on the printed map, the tee signs, the legend and the
// editor's map: basket marks, mandos, drop zones, pictograms for benches, parking, restrooms
// and the rest, and built things (bridges, buildings...). Each returns SVG markup centered on a
// point; `u` is the size of one unit (a symbol is about 13 to 16 units across).
import type { AmenityKind, BasketMark, P, RoofKind, StructureKind } from "../types";
import { offsetPolygon, orientedBox, roofOf } from "./structures";

const n = (v: number) => (Math.round(v * 100) / 100).toString();
const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export const INK = "#1b1d1a";
export const MANDO = "#f97316";
export const RESTRICTED = "#e11d2e";

/** Dark or white, whichever reads on `color`. */
export const inkOn = (color: string) => {
  const v = parseInt(color.replace("#", "").slice(0, 6), 16);
  const lum = (0.3 * ((v >> 16) & 255) + 0.59 * ((v >> 8) & 255) + 0.11 * (v & 255)) / 255;
  return Number.isNaN(lum) || lum > 0.55 ? INK : "#ffffff";
};

// ------------------------------------------------------------------ baskets

export const BASKET_MARKS: { value: BasketMark; label: string; title: string }[] = [
  { value: "basket", label: "Basket", title: "A small basket seen from the side, as on painted course maps" },
  { value: "badge", label: "Badge", title: "A basket in a round badge: clear on any background" },
  { value: "flag", label: "Flag", title: "A pin flag, like a golf map" },
  { value: "target", label: "Target", title: "Target rings" },
  { value: "number", label: "Number", title: "The hole number in a circle" }
];

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
 * A basket on the map, drawn as the chosen mark, centered on `p` (a mark is about 15 units tall).
 * `color` is the style's basket color; `label` is the hole number.
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

// ------------------------------------------------------------------ mandos and drop zones

/**
 * A mandatory: the post (or tree), an arrow curving past it on the side the disc must pass, in the
 * direction of play, and the restricted line out to the other side. `angle` is the direction of
 * play on the page (degrees, clockwise from east); `side` is the side to pass, looking along it.
 */
export const mandoSymbol = (p: P, angle: number, side: "left" | "right", u: number) => {
  const a = (angle * Math.PI) / 180;
  const fx = Math.cos(a), fy = Math.sin(a);
  // On the page (y down), the right of the direction of play is the direction turned +90°
  const rx = -fy, ry = fx;
  const s = side === "left" ? -1 : 1;
  const sx = rx * s, sy = ry * s;
  const at = (along: number, across: number) => ({ x: p.x + (fx * along + sx * across) * u, y: p.y + (fy * along + sy * across) * u });
  const pt = (q: P) => `${n(q.x)} ${n(q.y)}`;
  // The restricted line, out the side not to pass
  const r0 = at(0, -2.4), r1 = at(0, -9.5);
  const restricted = `M${pt(r0)}L${pt(r1)}`;
  // The pass arrow, curving round the post
  const a0 = at(-6.5, 2.2), c = at(0, 6.8), a1 = at(5.4, 2.6);
  const arrow = `M${pt(a0)}Q${pt(c)} ${pt(a1)}`;
  // Arrowhead along the curve's end direction
  const ex = a1.x - c.x, ey = a1.y - c.y, el = Math.hypot(ex, ey) || 1;
  const hx = ex / el, hy = ey / el;
  const tip = { x: a1.x + hx * 2.4 * u, y: a1.y + hy * 2.4 * u };
  const w1 = { x: a1.x - hy * 1.9 * u, y: a1.y + hx * 1.9 * u }, w2 = { x: a1.x + hy * 1.9 * u, y: a1.y - hx * 1.9 * u };
  const head = `M${pt(tip)}L${pt(w1)}L${pt(w2)}Z`;
  return `<g data-symbol="mando"><path d="${restricted}" stroke="#ffffff" stroke-width="${n(3.2 * u)}" stroke-linecap="round"/><path d="${restricted}" stroke="${RESTRICTED}" stroke-width="${n(1.7 * u)}" stroke-linecap="round"/><path d="${arrow}" fill="none" stroke="#ffffff" stroke-width="${n(3.1 * u)}" stroke-linecap="round"/><path d="${head}" fill="#ffffff" stroke="#ffffff" stroke-width="${n(1.4 * u)}" stroke-linejoin="round"/><path d="${arrow}" fill="none" stroke="${MANDO}" stroke-width="${n(1.6 * u)}" stroke-linecap="round"/><path d="${head}" fill="${MANDO}"/><circle cx="${n(p.x)}" cy="${n(p.y)}" r="${n(2.5 * u)}" fill="#ffffff" stroke="${INK}" stroke-width="${n(0.9 * u)}"/><circle cx="${n(p.x)}" cy="${n(p.y)}" r="${n(1 * u)}" fill="${MANDO}"/></g>`;
};

/**
 * A gate (a double mando): two posts the disc must pass between, the restricted lines pointing
 * out from each, and one arrow through the gap in the direction of play (`angle`, as above).
 */
export const gateSymbol = (a: P, b: P, angle: number, u: number) => {
  const pt = (q: P) => `${n(q.x)} ${n(q.y)}`;
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const t = (angle * Math.PI) / 180;
  const fx = Math.cos(t), fy = Math.sin(t);
  const out = (p: P) => {
    const dx = p.x - mid.x, dy = p.y - mid.y, l = Math.hypot(dx, dy) || 1;
    return `M${pt({ x: p.x + (dx / l) * 2.4 * u, y: p.y + (dy / l) * 2.4 * u })}L${pt({ x: p.x + (dx / l) * 9 * u, y: p.y + (dy / l) * 9 * u })}`;
  };
  const restricted = out(a) + out(b);
  const s0 = { x: mid.x - fx * 6 * u, y: mid.y - fy * 6 * u }, s1 = { x: mid.x + fx * 4.5 * u, y: mid.y + fy * 4.5 * u };
  const tip = { x: s1.x + fx * 2.6 * u, y: s1.y + fy * 2.6 * u };
  const head = `M${pt(tip)}L${pt({ x: s1.x - fy * 2 * u, y: s1.y + fx * 2 * u })}L${pt({ x: s1.x + fy * 2 * u, y: s1.y - fx * 2 * u })}Z`;
  const arrow = `M${pt(s0)}L${pt(s1)}`;
  const post = (p: P) => `<circle cx="${n(p.x)}" cy="${n(p.y)}" r="${n(2.5 * u)}" fill="#ffffff" stroke="${INK}" stroke-width="${n(0.9 * u)}"/><circle cx="${n(p.x)}" cy="${n(p.y)}" r="${n(1 * u)}" fill="${MANDO}"/>`;
  return `<g data-symbol="gate"><path d="${restricted}" stroke="#ffffff" stroke-width="${n(3.2 * u)}" stroke-linecap="round"/><path d="${restricted}" stroke="${RESTRICTED}" stroke-width="${n(1.7 * u)}" stroke-linecap="round"/><path d="${arrow}" stroke="#ffffff" stroke-width="${n(3.1 * u)}" stroke-linecap="round"/><path d="${head}" fill="#ffffff" stroke="#ffffff" stroke-width="${n(1.4 * u)}" stroke-linejoin="round"/><path d="${arrow}" stroke="${MANDO}" stroke-width="${n(1.6 * u)}" stroke-linecap="round"/><path d="${head}" fill="${MANDO}"/>${post(a)}${post(b)}</g>`;
};

/** A drop zone: "DZ" in a white disc ringed in orange. */
export const dropZoneSymbol = (p: P, u: number) =>
  `<g data-symbol="dropzone"><circle cx="${n(p.x)}" cy="${n(p.y)}" r="${n(6.4 * u)}" fill="#ffffff" stroke="${MANDO}" stroke-width="${n(1.4 * u)}"/><circle cx="${n(p.x)}" cy="${n(p.y)}" r="${n(4.9 * u)}" fill="none" stroke="${MANDO}" stroke-width="${n(0.4 * u)}" stroke-dasharray="${n(0.9 * u)} ${n(0.7 * u)}"/><text x="${n(p.x)}" y="${n(p.y + 0.2 * u)}" text-anchor="middle" dominant-baseline="central" font-family="Inter, Arial, sans-serif" font-weight="800" font-size="${n(4.6 * u)}" fill="${MANDO}">DZ</text></g>`;

// ------------------------------------------------------------------ amenities

export const AMENITY_COLORS: Record<AmenityKind, string> = {
  bench: "#8a5a22", trash: "#475569", sign: "#0f766e", kiosk: "#0e7490", restroom: "#2563eb", parking: "#1d4ed8",
  water: "#0284c7", practice: "#ea580c", shelter: "#7c2d12", bridge: "#78350f", firstaid: "#dc2626", picnic: "#92400e", here: "#facc15",
  grill: "#b45309", fitness: "#15803d", flagpole: "#475569", light: "#a16207", pole: "#78716c", bikerack: "#0f766e", fountain: "#0284c7", gate: "#57534e"
};

/** A white pictogram in unit coordinates (about ±6), for the badge. */
const pictogram = (kind: AmenityKind, f: (x: number, y: number) => string, u: number, bg: string) => {
  const W = "#ffffff";
  const rect = (x: number, y: number, w: number, h: number, r = 0.4) => `M${f(x + r, y)}L${f(x + w - r, y)}Q${f(x + w, y)} ${f(x + w, y + r)}L${f(x + w, y + h - r)}Q${f(x + w, y + h)} ${f(x + w - r, y + h)}L${f(x + r, y + h)}Q${f(x, y + h)} ${f(x, y + h - r)}L${f(x, y + r)}Q${f(x, y)} ${f(x + r, y)}Z`;
  const fill = (d: string, c = W) => `<path d="${d}" fill="${c}"/>`;
  const line = (d: string, w: number, c = W) => `<path d="${d}" fill="none" stroke="${c}" stroke-width="${n(w * u)}" stroke-linecap="round" stroke-linejoin="round"/>`;
  const circle = (x: number, y: number, r: number, c = W) => fill(`M${f(x - r, y)}A${n(r * u)} ${n(r * u)} 0 1 0 ${f(x + r, y)}A${n(r * u)} ${n(r * u)} 0 1 0 ${f(x - r, y)}Z`, c);
  switch (kind) {
    case "parking":
      return fill(`M${f(-3.2, 5.6)}L${f(-3.2, -5.6)}L${f(1, -5.6)}Q${f(4.6, -5.6)} ${f(4.6, -2.1)}Q${f(4.6, 1.4)} ${f(1, 1.4)}L${f(-0.6, 1.4)}L${f(-0.6, 5.6)}Z`) + fill(`M${f(-0.6, -3.3)}L${f(0.8, -3.3)}Q${f(2, -3.3)} ${f(2, -2.1)}Q${f(2, -0.9)} ${f(0.8, -0.9)}L${f(-0.6, -0.9)}Z`, bg);
    case "restroom":
      return circle(-2.8, -4.4, 1.3) + fill(rect(-4.2, -2.6, 2.8, 5, 0.8)) + fill(rect(-3.9, 2, 0.9, 3.8, 0.3)) + fill(rect(-2.6, 2, 0.9, 3.8, 0.3)) + line(`M${f(0, -5.6)}L${f(0, 5.6)}`, 0.5) + circle(2.8, -4.4, 1.3) + fill(`M${f(2, -2.6)}L${f(3.6, -2.6)}L${f(5.2, 2.6)}L${f(0.4, 2.6)}Z`) + fill(rect(1.9, 2.4, 0.9, 3.4, 0.3)) + fill(rect(2.9, 2.4, 0.9, 3.4, 0.3));
    case "trash":
      return line(`M${f(-4.4, -4.2)}L${f(4.4, -4.2)}M${f(-1.3, -5.5)}L${f(1.3, -5.5)}`, 1.1) + fill(`M${f(-3.5, -3)}L${f(3.5, -3)}L${f(2.7, 5.5)}L${f(-2.7, 5.5)}Z`) + line(`M${f(-1.2, -1.4)}L${f(-1, 3.8)}M${f(1.2, -1.4)}L${f(1, 3.8)}`, 0.6, bg);
    case "bench":
      return fill(rect(-5.8, -4.4, 11.6, 1.7, 0.4)) + fill(rect(-5.8, -0.7, 11.6, 1.7, 0.4)) + fill(rect(-4.9, 1, 1.3, 4.4, 0.3)) + fill(rect(3.6, 1, 1.3, 4.4, 0.3)) + fill(rect(-4.6, -2.9, 0.9, 2.4, 0)) + fill(rect(3.7, -2.9, 0.9, 2.4, 0));
    case "water":
      return fill(`M${f(0, -6.2)}C${f(2.2, -2.8)} ${f(4.6, -0.4)} ${f(4.6, 2)}A${n(4.6 * u)} ${n(4.6 * u)} 0 0 1 ${f(-4.6, 2)}C${f(-4.6, -0.4)} ${f(-2.2, -2.8)} ${f(0, -6.2)}Z`) + line(`M${f(-2.2, 1.8)}Q${f(-2, 3.9)} ${f(0, 4.1)}`, 0.8, bg);
    case "kiosk":
      return fill(rect(-5.6, -5.8, 11.2, 7.4, 0.8)) + fill(rect(-4.3, 1.2, 1.2, 4.6, 0.3)) + fill(rect(3.1, 1.2, 1.2, 4.6, 0.3)) + circle(0, -3.9, 0.9, bg) + fill(rect(-0.65, -2.4, 1.3, 3.2, 0.3), bg);
    case "sign":
      return fill(rect(-4.6, -5.8, 9.2, 6, 0.6)) + fill(rect(-0.65, 0, 1.3, 5.8, 0.3)) + line(`M${f(-2.6, -3.6)}L${f(2.6, -3.6)}M${f(-2.6, -1.6)}L${f(1.4, -1.6)}`, 0.7, bg);
    case "practice": {
      const b = basketShape((x, y) => f(x * 0.72, y * 0.72), u * 0.72, W, W, false);
      return b.body;
    }
    case "shelter":
      return fill(`M${f(-6.4, -0.8)}L${f(0, -6.2)}L${f(6.4, -0.8)}Z`) + fill(rect(-4.9, -0.8, 1.3, 5.6, 0.2)) + fill(rect(3.6, -0.8, 1.3, 5.6, 0.2)) + line(`M${f(-6, 5.2)}L${f(6, 5.2)}`, 0.9);
    case "bridge":
      return fill(rect(-6.4, -2.2, 12.8, 1.7, 0.3)) + line(`M${f(-5.4, 5)}Q${f(0, -1.6)} ${f(5.4, 5)}`, 1.3) + line(`M${f(-5.4, -2)}L${f(-5.4, -4.6)}M${f(5.4, -2)}L${f(5.4, -4.6)}M${f(-5.4, -4.6)}L${f(5.4, -4.6)}`, 0.7);
    case "firstaid":
      return fill(rect(-1.6, -5.2, 3.2, 10.4, 0.3)) + fill(rect(-5.2, -1.6, 10.4, 3.2, 0.3));
    case "picnic":
      return fill(rect(-5.8, -4.4, 11.6, 1.7, 0.4)) + line(`M${f(-2.8, -2.8)}L${f(-4.8, 5.2)}M${f(2.8, -2.8)}L${f(4.8, 5.2)}`, 1.2) + fill(rect(-6.6, 0.6, 13.2, 1.4, 0.4));
    case "grill":
      // A kettle grill: the lid's dome and handle, the bowl, three legs
      return fill(`M${f(-4.8, -0.9)}A${n(4.8 * u)} ${n(4.4 * u)} 0 0 1 ${f(4.8, -0.9)}Z`) + fill(rect(-1.1, -6.3, 2.2, 1, 0.3)) + fill(`M${f(-4.8, 0.1)}L${f(4.8, 0.1)}A${n(4.8 * u)} ${n(3.4 * u)} 0 0 1 ${f(-4.8, 0.1)}Z`) + line(`M${f(-2.6, 2.8)}L${f(-4, 6)}M${f(2.6, 2.8)}L${f(4, 6)}M${f(0, 3.4)}L${f(0, 6)}`, 0.9);
    case "fitness":
      // A dumbbell
      return line(`M${f(-3.6, 0)}L${f(3.6, 0)}`, 1.2) + fill(rect(-5.8, -3.4, 1.8, 6.8, 0.5)) + fill(rect(4, -3.4, 1.8, 6.8, 0.5)) + fill(rect(-3.9, -2.2, 1.2, 4.4, 0.3)) + fill(rect(2.7, -2.2, 1.2, 4.4, 0.3));
    case "flagpole":
      return line(`M${f(-3.4, -5.4)}L${f(-3.4, 5.8)}M${f(-5.4, 5.8)}L${f(-1.4, 5.8)}`, 0.95) + circle(-3.4, -5.9, 0.75) + fill(`M${f(-2.9, -5.4)}C${f(-0.6, -6.6)} ${f(1.9, -4.4)} ${f(5, -5.2)}L${f(5, -0.6)}C${f(1.9, 0.2)} ${f(-0.6, -2)} ${f(-2.9, -0.8)}Z`);
    case "light":
      // A lamp post: the pole, its arm and the lamp, light falling from it
      return line(`M${f(-2, 5.4)}L${f(-2, -3.6)}Q${f(-2, -5.6)} ${f(0.6, -5.6)}L${f(1.2, -5.6)}`, 1) + fill(`M${f(0.4, -6.1)}L${f(4.8, -6.1)}L${f(4, -4.4)}L${f(1.2, -4.4)}Z`) + fill(rect(-3.8, 5, 3.6, 1, 0.3)) + line(`M${f(2.6, -3.4)}L${f(2.6, -1.4)}M${f(1, -3.4)}L${f(0.2, -1.8)}M${f(4.2, -3.4)}L${f(5, -1.8)}`, 0.6);
    case "pole":
      // A utility pole: the crossarm, its insulators and braces
      return line(`M${f(0, -6)}L${f(0, 6)}`, 1.2) + line(`M${f(-5.4, -3.6)}L${f(5.4, -3.6)}`, 1) + line(`M${f(-2.8, -3.6)}L${f(0, -1.4)}L${f(2.8, -3.6)}`, 0.6) + circle(-4.4, -4.9, 0.75) + circle(4.4, -4.9, 0.75) + circle(0, -6.2, 0.75);
    case "bikerack": {
      // A bicycle
      const ring = (x: number, y: number, r: number) => `M${f(x - r, y)}A${n(r * u)} ${n(r * u)} 0 1 0 ${f(x + r, y)}A${n(r * u)} ${n(r * u)} 0 1 0 ${f(x - r, y)}Z`;
      return line(ring(-3.5, 2.3, 2.6) + ring(3.5, 2.3, 2.6), 0.8) + line(`M${f(-3.5, 2.3)}L${f(-0.8, -1.6)}L${f(2.4, -1.6)}L${f(3.5, 2.3)}M${f(-0.8, -1.6)}L${f(0.4, 2.3)}L${f(-3.5, 2.3)}M${f(0.4, 2.3)}L${f(2.4, -1.6)}M${f(-2, -2.8)}L${f(0.1, -2.8)}M${f(-0.8, -1.6)}L${f(-1, -2.8)}M${f(2.4, -1.6)}L${f(2.8, -3.6)}L${f(4, -3.6)}`, 0.75);
    }
    case "fountain":
      // A basin with water springing up and falling either side
      return fill(`M${f(-5.8, 2.4)}L${f(5.8, 2.4)}L${f(4.4, 5.8)}L${f(-4.4, 5.8)}Z`) + fill(rect(-0.65, -1, 1.3, 3.6, 0.2)) + line(`M${f(0, -1)}L${f(0, -5.8)}M${f(0, -1.4)}Q${f(-1.2, -5.6)} ${f(-4.6, 1.2)}M${f(0, -1.4)}Q${f(1.2, -5.6)} ${f(4.6, 1.2)}`, 0.85);
    case "gate":
      // Two posts and a gate between them
      return fill(rect(-6, -5.2, 1.5, 10.8, 0.3)) + fill(rect(4.5, -5.2, 1.5, 10.8, 0.3)) + line(`M${f(-4, -3.2)}L${f(4, -3.2)}M${f(-4, 3.6)}L${f(4, 3.6)}M${f(-4, 3.6)}L${f(4, -3.2)}`, 0.95) + line(`M${f(-1.4, -3.2)}L${f(-1.4, 3.6)}M${f(1.4, -3.2)}L${f(1.4, 3.6)}`, 0.6);
    default:
      return "";
  }
};

/** A rounded square in the amenity's color with its white pictogram (13 units across). */
export const amenitySymbol = (kind: AmenityKind, p: P, u: number) => {
  const f = (x: number, y: number) => `${n(p.x + x * u)} ${n(p.y + y * u)}`;
  if (kind === "here") {
    // "You are here": a big yellow disc, as on trailhead boards
    const lines = ["YOU", "ARE", "HERE"];
    return `<g data-symbol="here"><circle cx="${n(p.x)}" cy="${n(p.y)}" r="${n(10 * u)}" fill="${AMENITY_COLORS.here}" stroke="${INK}" stroke-width="${n(0.8 * u)}"/>${lines.map((t, i) => `<text x="${n(p.x)}" y="${n(p.y + (i - 1) * 4.2 * u)}" text-anchor="middle" dominant-baseline="central" font-family="Oswald, 'Arial Narrow', Arial, sans-serif" font-weight="700" font-size="${n(4.2 * u)}" fill="${INK}">${t}</text>`).join("")}</g>`;
  }
  const bg = AMENITY_COLORS[kind];
  const h = 6.6;
  return `<g data-symbol="${kind}"><rect x="${n(p.x - h * u)}" y="${n(p.y - h * u)}" width="${n(2 * h * u)}" height="${n(2 * h * u)}" rx="${n(2.6 * u)}" fill="${bg}" stroke="#ffffff" stroke-width="${n(1 * u)}"/>${pictogram(kind, (x, y) => f(x * 0.82, y * 0.82), u * 0.82, bg)}</g>`;
};

/** A symbol as a standalone SVG element (for the editor's map and the panels). */
export const symbolSvg = (inner: string, size: number, box = 16) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="${-box / 2} ${-box / 2} ${box} ${box}" style="overflow:visible;display:block">${inner}</svg>`;

// ------------------------------------------------------------------ built things

/** The colors built things are drawn in (each map style picks its own). */
export type StructureInk = {
  casing: string; deck: string; seam: string; rail: string; stone: string; joint: string;
  roof: string; shelter: string; ridge: string; shadow: string;
};
export const STRUCTURE_INK: StructureInk = {
  casing: "#2a2018", deck: "#c9ad84", seam: "#86684a", rail: "#5b432f", stone: "#bab2a4", joint: "#6c655a",
  roof: "#94603f", shelter: "#5a7c5c", ridge: "#f3e9d6", shadow: "#0a1306"
};

/** How to draw built things: drawing units per point (for widths that must stay visible) and per
 * foot (for real sizes), the sun (a unit vector toward it, in drawing coordinates, and its height
 * in degrees), the drop shadow's strength (0: none) and blur, the colors, and an id prefix for
 * clip paths. */
export type StructureDraw = { u: number; ft: number; sun: P; sunHeight: number; shadow: number; blur?: string; ink: StructureInk; id: string };

/** Lighter (amount > 0) or darker (< 0) version of a hex color. */
const tint = (hex: string, amount: number) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const v = parseInt(m[1], 16);
  const ch = (c: number) => Math.round(Math.max(0, Math.min(255, amount >= 0 ? c + (255 - c) * amount : c * (1 + amount))));
  return `#${((ch((v >> 16) & 255) << 16) | (ch((v >> 8) & 255) << 8) | ch(v & 255)).toString(16).padStart(6, "0")}`;
};
const dLine = (pts: P[]) => pts.map((q, i) => `${i ? "L" : "M"}${n(q.x)} ${n(q.y)}`).join("");
const dPoly = (pts: P[]) => `${dLine(pts)}Z`;
/** A polyline moved sideways by `off` (toward (-dy, dx) of its direction). */
const sideways = (pts: P[], off: number) => pts.map((p, i) => {
  const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
  const l = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  return { x: p.x - ((b.y - a.y) / l) * off, y: p.y + ((b.x - a.x) / l) * off };
});
const safeId = (id: string) => id.replace(/[^\w-]/g, "");
const LINE_KINDS_BUILT: StructureKind[] = ["bridge", "boardwalk", "stairs", "wall"];

/**
 * A built thing on a map, drawn to scale: bridges as planked decks with dark casings, railings and
 * the short ticks of their abutments at the banks; boardwalks as planks; stairs as hatched steps;
 * walls as a thick stone line; buildings as their roofs (ridge and hips, the faces toward the sun
 * lighter, a soft shadow); shelters as an open roof (dashed eaves); decks as planks. `pts` is the
 * line from end to end, or the outline; `width` and `height` are in feet.
 */
export const structureSymbol = (kind: StructureKind, pts: P[], width: number, height: number, roofKind: RoofKind, d: StructureDraw): string => {
  if (pts.length < 2) return "";
  const { u, ft, ink } = d;
  const el = (Math.max(10, Math.min(85, d.sunHeight)) * Math.PI) / 180;
  const away = { x: -d.sun.x, y: -d.sun.y };
  // How far a shadow falls from something `h` ft tall (shortened, as on drawn maps; at most `max` points)
  const fall = (h: number, max: number) => {
    const L = Math.min(max * u, Math.max(0.5 * u, ((h * ft) / Math.tan(el)) * 0.55));
    return { x: away.x * L, y: away.y * L };
  };
  const shadowOf = (shape: (dx: number, dy: number) => string, v: P) => {
    if (d.shadow <= 0) return "";
    const copies = Array.from({ length: 6 }, (_, k) => shape((v.x * k) / 5, (v.y * k) / 5)).join("");
    return `<g opacity="${n(d.shadow)}"${d.blur ? ` filter="${d.blur}"` : ""}>${copies}</g>`;
  };
  const tag = (body: string) => `<g data-structure="${kind}">${body}</g>`;

  if (LINE_KINDS_BUILT.includes(kind)) {
    const line = dLine(pts);
    const stroke = (color: string, w: number, extra = "") => `<path d="${line}" fill="none" stroke="${color}" stroke-width="${n(w)}" stroke-linejoin="round"${extra}/>`;
    const moved = (color: string, w: number) => (dx: number, dy: number) => `<path d="${line}" transform="translate(${n(dx)} ${n(dy)})" fill="none" stroke="${color}" stroke-width="${n(w)}" stroke-linejoin="round"/>`;
    if (kind === "wall") {
      const W = Math.max(width * ft, 2.4 * u);
      const blocks = Math.max(1.8 * ft, 2.4 * u);
      // The side toward the sun catches the light
      const a = pts[0], b = pts[pts.length - 1];
      const lit = (-(b.y - a.y) * d.sun.x + (b.x - a.x) * d.sun.y) >= 0 ? 1 : -1;
      return tag(
        shadowOf(moved(ink.shadow, W), fall(height, 3.5)) +
        stroke(ink.casing, W + 1.2 * u, ` stroke-linecap="square"`) +
        stroke(ink.stone, W, ` stroke-linecap="square"`) +
        stroke(ink.joint, W, ` stroke-dasharray="${n(0.4 * u)} ${n(blocks)}"`) +
        `<path d="${dLine(sideways(pts, lit * W * 0.26))}" fill="none" stroke="${tint(ink.stone, 0.5)}" stroke-opacity="0.75" stroke-width="${n(Math.min(W * 0.3, 0.5 * u))}" stroke-linejoin="round"/>`
      );
    }
    if (kind === "stairs") {
      const W = Math.max(width * ft, 3.6 * u);
      const tread = Math.max(1.4 * ft, 1.7 * u);
      return tag(
        stroke(ink.casing, W + 1.1 * u, ` stroke-linecap="butt"`) +
        stroke(ink.stone, W, ` stroke-linecap="butt"`) +
        stroke(ink.casing, W, ` stroke-linecap="butt" stroke-dasharray="${n(0.5 * u)} ${n(tread - 0.5 * u)}"`)
      );
    }
    // Bridges and boardwalks: a deck of boards across, between rails
    const bridge = kind === "bridge";
    const W = Math.max(width * ft, (bridge ? 4.6 : 3.8) * u);
    const cas = (bridge ? 1.1 : 0.65) * u;
    const pitch = Math.max(0.7 * ft, 1.25 * u);
    const parts = [
      shadowOf(moved(ink.shadow, W + 2 * cas), fall(height + (bridge ? 3.5 : 0.8), bridge ? 4 : 2.5)),
      stroke(bridge ? ink.casing : ink.rail, W + 2 * cas, ` stroke-linecap="butt"`),
      stroke(ink.deck, W, ` stroke-linecap="butt"`),
      stroke(ink.seam, W - (bridge ? 1.2 * u : 0), ` stroke-linecap="butt" stroke-dasharray="${n(0.32 * u)} ${n(pitch - 0.32 * u)}"`)
    ];
    if (bridge) {
      // Railings along both edges
      for (const s of [-1, 1]) parts.push(`<path d="${dLine(sideways(pts, s * (W / 2 - 0.45 * u)))}" fill="none" stroke="${ink.rail}" stroke-width="${n(0.75 * u)}" stroke-linejoin="round"/>`);
      // The abutments: short ticks flaring out at each end, onto the banks
      const wing = 2.9 * u;
      const ticks: string[] = [];
      for (const [p, q] of [[pts[0], pts[1]], [pts[pts.length - 1], pts[pts.length - 2]]] as [P, P][]) {
        const l = Math.hypot(q.x - p.x, q.y - p.y) || 1;
        const t = { x: (q.x - p.x) / l, y: (q.y - p.y) / l }, nn = { x: -t.y, y: t.x };
        for (const s of [-1, 1]) {
          const c = { x: p.x + nn.x * s * (W / 2 + cas * 0.5), y: p.y + nn.y * s * (W / 2 + cas * 0.5) };
          ticks.push(`M${n(c.x)} ${n(c.y)}L${n(c.x + (-t.x + nn.x * s) * wing * 0.7071)} ${n(c.y + (-t.y + nn.y * s) * wing * 0.7071)}`);
        }
      }
      parts.push(`<path d="${ticks.join("")}" fill="none" stroke="${ink.casing}" stroke-width="${n(1.15 * u)}" stroke-linecap="round"/>`);
    }
    return tag(parts.join(""));
  }

  // Outlines: buildings, shelters and decks
  if (pts.length < 3) return "";
  const cid = `${safeId(d.id)}-c`;
  if (kind === "deck") {
    const box = orientedBox(pts);
    const pitch = Math.max(0.65 * ft, 1.3 * u);
    const seams: string[] = [];
    for (let t = -box.b + pitch; t < box.b; t += pitch) {
      const a = { x: box.c.x + box.v.x * t - box.u.x * (box.a + 1), y: box.c.y + box.v.y * t - box.u.y * (box.a + 1) };
      const b = { x: box.c.x + box.v.x * t + box.u.x * (box.a + 1), y: box.c.y + box.v.y * t + box.u.y * (box.a + 1) };
      seams.push(`M${n(a.x)} ${n(a.y)}L${n(b.x)} ${n(b.y)}`);
    }
    const poly = dPoly(pts);
    const rail = height > 2 ? `<path d="${dPoly(offsetPolygon(pts, -Math.max(0.5 * ft, 0.9 * u)))}" fill="none" stroke="${ink.rail}" stroke-width="${n(0.7 * u)}" stroke-linejoin="round"/>` : "";
    return tag(
      shadowOf((dx, dy) => `<path d="${poly}" transform="translate(${n(dx)} ${n(dy)})" fill="${ink.shadow}"/>`, fall(height + (height > 2 ? 3 : 0), 3.5)) +
      `<clipPath id="${cid}"><path d="${poly}"/></clipPath><path d="${poly}" fill="${ink.deck}"/>` +
      `<path d="${seams.join("")}" clip-path="url(#${cid})" fill="none" stroke="${ink.seam}" stroke-width="${n(0.32 * u)}"/>` +
      rail + `<path d="${poly}" fill="none" stroke="${ink.casing}" stroke-width="${n(0.8 * u)}" stroke-linejoin="round"/>`
    );
  }
  // Roofs: each face shaded by how squarely it faces the sun
  const shelter = kind === "shelter";
  const roof = roofOf(pts, roofKind, 1.5 * ft);
  const slope = Math.atan(roof.pitch);
  const sun3 = { x: d.sun.x * Math.cos(el), y: d.sun.y * Math.cos(el), z: Math.sin(el) };
  const base = shelter ? ink.shelter : ink.roof;
  const eaves = dPoly(roof.eaves);
  const faces: string[] = [];
  const texture: string[] = [];
  roof.facets.forEach((f, i) => {
    const lam = (f.out.x * sun3.x + f.out.y * sun3.y) * Math.sin(slope) + Math.cos(slope) * sun3.z;
    const fill = tint(base, Math.max(-0.42, Math.min(0.3, (lam - sun3.z) * 1.25)));
    const poly = dPoly(f.poly);
    faces.push(`<path d="${poly}" fill="${fill}" stroke="${ink.ridge}" stroke-opacity="0.85" stroke-width="${n(0.55 * u)}" stroke-linejoin="round"/>`);
    // Shingle courses along the eaves (a building), or the ribs of a metal roof down the slope (a shelter)
    const id = `${cid}${i}`;
    const along = shelter ? f.out : { x: -f.out.y, y: f.out.x };
    const across = { x: -along.y, y: along.x };
    const proj = (p: P, v: P) => p.x * v.x + p.y * v.y;
    const ac = f.poly.map(p => proj(p, across)), al = f.poly.map(p => proj(p, along));
    const lo = Math.min(...ac), hi = Math.max(...ac), a0 = Math.min(...al) - 1, a1 = Math.max(...al) + 1;
    const gap = shelter ? Math.max(1.6 * ft, 1.6 * u) : Math.max(1.1 * ft, 1.25 * u);
    const lines: string[] = [];
    for (let c = lo + gap / 2; c < hi; c += gap) {
      const p0 = { x: across.x * c + along.x * a0, y: across.y * c + along.y * a0 }, p1 = { x: across.x * c + along.x * a1, y: across.y * c + along.y * a1 };
      lines.push(`M${n(p0.x)} ${n(p0.y)}L${n(p1.x)} ${n(p1.y)}`);
    }
    if (lines.length) texture.push(`<clipPath id="${id}"><path d="${poly}"/></clipPath><path d="${lines.join("")}" clip-path="url(#${id})" fill="none" stroke="#000" stroke-opacity="0.16" stroke-width="${n(0.32 * u)}"/>`);
  });
  // (a flat roof: a parapet just inside its edge)
  const parapet = roofKind === "flat" ? `<path d="${dPoly(offsetPolygon(roof.eaves, -Math.max(1.1 * ft, 0.9 * u)))}" fill="none" stroke="${ink.ridge}" stroke-opacity="0.7" stroke-width="${n(0.5 * u)}" stroke-linejoin="round"/>` : "";
  const outline = parapet + (shelter
    ? `<path d="${eaves}" fill="none" stroke="${ink.casing}" stroke-width="${n(0.75 * u)}" stroke-dasharray="${n(1.6 * u)} ${n(0.9 * u)}" stroke-linejoin="round"/>`
    : `<path d="${eaves}" fill="none" stroke="${ink.casing}" stroke-width="${n(0.8 * u)}" stroke-linejoin="round"/>`);
  return tag(
    shadowOf((dx, dy) => `<path d="${eaves}" transform="translate(${n(dx)} ${n(dy)})" fill="${ink.shadow}"/>`, fall(height + roof.rise / Math.max(1e-6, ft) / 2, 7)) +
    faces.join("") + texture.join("") + outline
  );
};

/** A built thing's sample for the legend and the tool chips, in a box `w` × `h` from (0, 0). */
export const structureLegend = (kind: StructureKind, w: number, h: number, u: number, ink: StructureInk = STRUCTURE_INK, id = `lg-${kind}`) => {
  const sun = { x: -0.7071, y: -0.7071 };
  const look = (ft: number): StructureDraw => ({ u, ft, sun, sunHeight: 40, shadow: 0, ink, id });
  if (LINE_KINDS_BUILT.includes(kind)) {
    const width = kind === "bridge" ? 6 : kind === "boardwalk" ? 5 : kind === "stairs" ? 4 : 2;
    return structureSymbol(kind, [{ x: w * 0.12, y: h / 2 }, { x: w * 0.88, y: h / 2 }], width, 1, "gable", look((h * (kind === "wall" ? 0.36 : 0.58)) / width));
  }
  const ft = h * 0.055;
  const m = 1.5 * ft + 0.5 * u;
  const rect = [{ x: m, y: m }, { x: w - m, y: m }, { x: w - m, y: h - m }, { x: m, y: h - m }];
  return structureSymbol(kind, rect, 0, kind === "deck" ? 1 : 10, kind === "shelter" ? "hip" : "gable", look(ft));
};
