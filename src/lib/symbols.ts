// The course's symbols, drawn the same way on the printed map, the tee signs, the legend and the
// editor's map: basket marks, mandos, drop zones, and pictograms for benches, parking, restrooms
// and the rest. Each returns SVG markup centered on a point; `u` is the size of one unit (a
// symbol is about 13 to 16 units across).
import type { AmenityKind, BasketMark, P } from "../types";

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
  water: "#0284c7", practice: "#ea580c", shelter: "#7c2d12", bridge: "#78350f", firstaid: "#dc2626", picnic: "#92400e", here: "#facc15"
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
