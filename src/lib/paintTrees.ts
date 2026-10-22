// The painted map's trees in the newer looks (lib/mapLook), drawn as shapes over the painted
// ground, smooth at any size: Summer (one big rounded crown lit as a whole), Deep woods (dry-brushed
// leaf dabs, bright where the sun catches the edge), Golden (many leaf clumps lit from the sun's
// side, sunlit speckles) and Mountain pines (tiers of star-shaped boughs). Their shadows lie soft on
// the grass before them; mist, the color grade and night are laid over the whole picture after.
import type { TreeStyle, paintLight } from "./mapLook";

type RGB = [number, number, number];
export type PaintTree = { x: number; y: number; r: number; h: number; pine: boolean; col: RGB; seed: number };

const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const mix = (a: RGB, b: number[], t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const mul = (c: RGB, k: number): RGB => [c[0] * k, c[1] * k, c[2] * k];
const css = (c: number[], a = 1) => `rgba(${clamp(c[0], 0, 255) | 0},${clamp(c[1], 0, 255) | 0},${clamp(c[2], 0, 255) | 0},${a})`;
const seeded = (s: number) => () => ((s = (s * 16807) % 2147483647) / 2147483647);

type Light = ReturnType<typeof paintLight>;
type Ctx = CanvasRenderingContext2D;

/** Each style's trees' greens, for a woods color of the default landscape (the course's own trees'
 * color moves them all by as much). */
export const STYLE_GREENS: Record<Exclude<TreeStyle, "classic">, string[]> = {
  cluster: ["#3d6b2c", "#4a7a31", "#33602e", "#567f36", "#2f5a2a", "#44713a"],
  drybrush: ["#2e5524", "#3a6428", "#47702c", "#264b2c", "#507834", "#33592d"],
  golden: ["#3a5a26", "#4b6a2a", "#2e4f2a", "#5a6f2c"],
  cloud: ["#3f8a3a", "#4f9a3e", "#358040", "#62a03f", "#4a8f3c"],
  gouache: ["#3d6b2c", "#4a7a31", "#33602e", "#567f36", "#2f5a2a"]
};

const circle = (g: Ctx, x: number, y: number, r: number, fill: string | CanvasGradient) => { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fillStyle = fill; g.fill(); };

/** The shadows: a soft ellipse before each tree, away from the sun, as long as the light says. */
export const drawShadows = (g: Ctx, trees: PaintTree[], Lx: number, Ly: number, lt: Light, strength: number, soft: number) => {
  g.save();
  g.globalCompositeOperation = "multiply";
  const dark = lt.mode === "night" ? [24, 34, 70] : lt.cool > 0.3 ? [34, 52, 66] : [40, 48, 34];
  for (const t of trees) {
    const ox = -Lx * t.h * lt.len * 0.55, oy = -Ly * t.h * lt.len * 0.55;
    const cx = t.x + ox * 0.5, cy = t.y + oy * 0.5, rx = t.r * 0.95 + Math.abs(ox) * 0.5, ry = t.r * 0.95 + Math.abs(oy) * 0.5;
    const R = Math.max(rx, ry) * (1 + soft * 0.25);
    const gr = g.createRadialGradient(cx, cy, R * (0.35 - 0.2 * soft), cx, cy, R);
    gr.addColorStop(0, css(dark, 0.62 * strength));
    gr.addColorStop(1, css(dark, 0));
    g.save();
    g.translate(cx, cy); g.rotate(Math.atan2(oy, ox)); g.scale(Math.max(rx, 1) / R, Math.max(ry, 1) / R); g.translate(-cx, -cy);
    g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.fillStyle = gr; g.fill();
    g.restore();
  }
  g.restore();
};

/** A crown too small to show its leaves (a whole course on a page): one lit dome. */
const tinyCrown = (g: Ctx, t: PaintTree, Lx: number, Ly: number, hi: number[]) => {
  const gr = g.createRadialGradient(t.x + Lx * t.r * 0.45, t.y + Ly * t.r * 0.45, 0, t.x, t.y, t.r);
  gr.addColorStop(0, css(mix(mul(t.col, 1.5), hi, 0.3))); gr.addColorStop(0.55, css(t.col)); gr.addColorStop(1, css(mul(t.col, 0.45)));
  circle(g, t.x, t.y, t.r, gr);
};

/** Golden: many leaf clumps, each lit from the sun's side, sunlit speckles. */
const goldenCrown = (g: Ctx, t: PaintTree, Lx: number, Ly: number, R: () => number, warm: number) => {
  const r = t.r, c = t.col, blobs: [number, number, number][] = [[0, 0, r * 0.5]];
  for (let i = 0; i < 10; i++) { const a = (i / 10) * 6.283 + R() * 0.5, d = r * (0.42 + R() * 0.2); blobs.push([Math.cos(a) * d, Math.sin(a) * d, r * (0.28 + R() * 0.14)]); }
  for (let i = 0; i < 6; i++) { const a = (i / 6) * 6.283 + R(); blobs.push([Math.cos(a) * r * 0.22, Math.sin(a) * r * 0.22, r * (0.3 + R() * 0.1)]); }
  for (const [bx, by, br] of blobs) {
    const gr = g.createRadialGradient(t.x + bx + Lx * br * 0.55, t.y + by + Ly * br * 0.55, 0, t.x + bx, t.y + by, br * 1.05);
    gr.addColorStop(0, css(mix(mul(c, 1.6), [255, 205, 110], 0.5 * Math.max(0.3, warm))));
    gr.addColorStop(0.45, css(mix(c, [190, 150, 60], 0.2 * Math.max(0.3, warm))));
    gr.addColorStop(1, css(mix(mul(c, 0.4), [30, 45, 90], 0.3)));
    circle(g, t.x + bx, t.y + by, br, gr);
  }
  for (let i = 0; i < 12; i++) { const a = Math.atan2(Ly, Lx) + (R() - 0.5) * 2.2, d = r * (0.25 + R() * 0.6); circle(g, t.x + Math.cos(a) * d, t.y + Math.sin(a) * d, r * (0.06 + R() * 0.1), css(mix(mul(c, 1.7), [255, 210, 120], 0.55 * Math.max(0.4, warm)))); }
};
/** A wobbly round outline (a painted crown's edge). */
const blobPath = (g: Ctx, x: number, y: number, r: number, R: () => number, wob = 0.22, n = 28) => {
  g.beginPath();
  const ph = R() * 6.28;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * 6.283, rr = r * (1 + wob * (Math.sin(a * 3 + ph) * 0.5 + Math.sin(a * 5 + ph * 1.7) * 0.3 + (R() - 0.5) * 0.4));
    const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
    if (i) g.lineTo(px, py); else g.moveTo(px, py);
  }
  g.closePath();
};
/** Painted cluster (Brushwood): a few soft clumps, dry-brushed, a lighter broken rim on the sun side. */
const clusterCrown = (g: Ctx, t: PaintTree, Lx: number, Ly: number, R: () => number) => {
  const r = t.r, c = t.col, n = 3 + Math.floor(R() * 3), clumps: [number, number, number][] = [];
  for (let i = 0; i < n; i++) { const a = R() * 6.28, d = r * (0.18 + R() * 0.32); clumps.push([t.x + Math.cos(a) * d, t.y + Math.sin(a) * d, r * (0.5 + R() * 0.2)]); }
  for (const [x, y, cr] of clumps) { blobPath(g, x, y, cr * 1.02, R, 0.18); g.fillStyle = css(mix(mul(c, 0.5), [14, 34, 30], 0.3)); g.fill(); }
  for (const [x, y, cr] of clumps) {
    const gr = g.createRadialGradient(x + Lx * cr * 0.45, y + Ly * cr * 0.45, cr * 0.05, x, y, cr);
    gr.addColorStop(0, css(mix(mul(c, 1.35), [205, 220, 140], 0.25))); gr.addColorStop(0.6, css(c)); gr.addColorStop(1, css(mul(c, 0.55), 0));
    blobPath(g, x, y, cr * 0.92, R, 0.15); g.fillStyle = gr; g.fill();
  }
  // dry brush: short strokes in each clump, lit on the sun side
  g.lineCap = "round";
  const strokes = r < 10 ? 12 : 26, len = r * 0.2;
  for (const [x, y, cr] of clumps) for (let i = 0; i < strokes; i++) {
    const a = R() * 6.28, d = Math.sqrt(R()) * cr * 0.85, px = x + Math.cos(a) * d, py = y + Math.sin(a) * d, lit = clamp(0.5 + (Math.cos(a) * Lx + Math.sin(a) * Ly) * (d / cr) * 0.8);
    g.strokeStyle = css(lit > 0.55 ? mix(mul(c, 1.5), [215, 230, 150], 0.3) : mul(c, 0.7), 0.55); g.lineWidth = r * (0.06 + R() * 0.08);
    g.beginPath(); g.moveTo(px, py); g.lineTo(px + Math.cos(a + 1.7) * len, py + Math.sin(a + 1.7) * len); g.stroke();
  }
};
/** Cloud (Storybook): a scalloped crown, a thin dark rim, a bright highlight cluster toward the sun. */
const cloudCrown = (g: Ctx, t: PaintTree, Lx: number, Ly: number, R: () => number) => {
  const r = t.r, c = t.col, lobes: [number, number, number][] = [], n = 8 + Math.floor(R() * 3);
  for (let i = 0; i < n; i++) { const a = (i / n) * 6.283 + R() * 0.3; lobes.push([t.x + Math.cos(a) * r * 0.62, t.y + Math.sin(a) * r * 0.62, r * (0.38 + R() * 0.08)]); }
  lobes.push([t.x, t.y, r * 0.66]);
  const path = (k: number, dx = 0, dy = 0) => { g.beginPath(); for (const [x, y, lr] of lobes) { g.moveTo(x + dx + lr * k, y + dy); g.arc(x + dx, y + dy, lr * k, 0, 6.283); } };
  path(1.06); g.fillStyle = css(mix(mul(c, 0.38), [12, 30, 26], 0.4)); g.fill();
  path(1); g.fillStyle = css(mul(c, 0.82)); g.fill();
  path(0.78, Lx * r * 0.12, Ly * r * 0.12); g.fillStyle = css(c); g.fill();
  for (let i = 0; i < 7; i++) { const a = Math.atan2(Ly, Lx) + (R() - 0.5) * 1.6, d = r * (0.25 + R() * 0.35); circle(g, t.x + Math.cos(a) * d, t.y + Math.sin(a) * d, r * (0.16 + R() * 0.1), css(mix(mul(c, 1.35), [200, 228, 110], 0.4))); }
  for (let i = 0; i < 4; i++) { const a = Math.atan2(Ly, Lx) + (R() - 0.5) * 1.2, d = r * (0.3 + R() * 0.25); circle(g, t.x + Math.cos(a) * d, t.y + Math.sin(a) * d, r * (0.07 + R() * 0.05), "rgba(232,245,170,.9)"); }
  g.strokeStyle = css(mul(c, 0.5), 0.8); g.lineWidth = Math.max(0.6, r * 0.06);
  for (let i = 0; i < 4; i++) { const a = Math.atan2(-Ly, -Lx) + (R() - 0.5) * 1.4, d = r * (0.25 + R() * 0.3), x = t.x + Math.cos(a) * d, y = t.y + Math.sin(a) * d; g.beginPath(); g.arc(x, y, r * 0.18, a - 1.2, a + 1.2); g.stroke(); }
};
/** Gouache: three flat painted layers, dark to light, each offset toward the sun, soft edged. */
const gouacheCrown = (g: Ctx, t: PaintTree, Lx: number, Ly: number, R: () => number) => {
  const r = t.r, c = t.col;
  // (the soft edge: a dark halo just round the bottom layer)
  const halo = g.createRadialGradient(t.x, t.y, r * 0.85, t.x, t.y, r * 1.18);
  halo.addColorStop(0, css([10, 30, 20], 0.5)); halo.addColorStop(1, css([10, 30, 20], 0));
  circle(g, t.x, t.y, r * 1.18, halo);
  blobPath(g, t.x, t.y, r, R, 0.2); g.fillStyle = css(mix(mul(c, 0.5), [16, 40, 40], 0.3)); g.fill();
  blobPath(g, t.x + Lx * r * 0.14, t.y + Ly * r * 0.14, r * 0.74, R, 0.24); g.fillStyle = css(mul(c, 0.95)); g.fill();
  blobPath(g, t.x + Lx * r * 0.3, t.y + Ly * r * 0.3, r * 0.42, R, 0.3); g.fillStyle = css(mix(mul(c, 1.35), [215, 230, 150], 0.25)); g.fill();
  for (let i = 0; i < 6; i++) { const a = R() * 6.28, d = R() * r * 0.8; circle(g, t.x + Math.cos(a) * d, t.y + Math.sin(a) * d, r * (0.05 + R() * 0.05), css(mul(c, R() > 0.5 ? 1.5 : 0.6), 0.7)); }
};
/** Feathered pine (Brushwood, Gouache): rings of soft curved boughs, light tips on the sun side. */
const featherPine = (g: Ctx, t: PaintTree, Lx: number, Ly: number, R: () => number) => {
  const r = t.r, c = mix(t.col, [40, 75, 70], 0.35);
  circle(g, t.x, t.y, r * 0.8, css(mix(mul(c, 0.4), [10, 26, 30], 0.3)));
  for (let ring = 0; ring < 3; ring++) {
    const rr = r * (1 - ring * 0.27), n = 14 - ring * 3;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * 6.283 + ring * 0.4 + R() * 0.2, lit = clamp(Math.cos(a) * Lx + Math.sin(a) * Ly, -1, 1);
      const tipx = t.x + Math.cos(a) * rr, tipy = t.y + Math.sin(a) * rr, bx = t.x + Math.cos(a) * rr * 0.25, by = t.y + Math.sin(a) * rr * 0.25, w = rr * 0.22, nx = -Math.sin(a) * w, ny = Math.cos(a) * w;
      const gr = g.createLinearGradient(bx, by, tipx, tipy);
      gr.addColorStop(0, css(mul(c, 0.55 + ring * 0.1))); gr.addColorStop(1, css(mix(mul(c, 0.9 + 0.5 * Math.max(0, lit) + ring * 0.1), [205, 225, 170], Math.max(0, lit) * 0.2)));
      g.beginPath(); g.moveTo(bx, by); g.quadraticCurveTo((bx + tipx) / 2 + nx, (by + tipy) / 2 + ny, tipx, tipy); g.quadraticCurveTo((bx + tipx) / 2 - nx * 0.4, (by + tipy) / 2 - ny * 0.4, bx, by); g.fillStyle = gr; g.fill();
    }
  }
  circle(g, t.x, t.y, r * 0.1, css(mul(c, 0.45)));
};
/** Rosette pine (Storybook): rounded scalloped tiers, lit from the sun's side. */
const rosettePine = (g: Ctx, t: PaintTree, Lx: number, Ly: number, R: () => number) => {
  const r = t.r, c = mix(t.col, [40, 90, 70], 0.3);
  for (let k = 0; k < 3; k++) {
    const rr = r * (1 - k * 0.3), n = 9 - k * 2, ph = R() * 6.28;
    const gr = g.createRadialGradient(t.x + Lx * rr * 0.45, t.y + Ly * rr * 0.45, 0, t.x, t.y, rr);
    gr.addColorStop(0, css(mix(mul(c, 1.25 + k * 0.15), [200, 225, 170], 0.15))); gr.addColorStop(0.7, css(mul(c, 0.85 + k * 0.1))); gr.addColorStop(1, css(mul(c, 0.5)));
    g.beginPath();
    for (let i = 0; i < n; i++) { const a = (i / n) * 6.283 + ph; g.moveTo(t.x + Math.cos(a) * rr * 0.72 + rr * 0.33, t.y + Math.sin(a) * rr * 0.72); g.arc(t.x + Math.cos(a) * rr * 0.72, t.y + Math.sin(a) * rr * 0.72, rr * 0.33, 0, 6.283); }
    g.moveTo(t.x + rr * 0.72, t.y); g.arc(t.x, t.y, rr * 0.72, 0, 6.283);
    g.fillStyle = gr; g.fill();
    if (k < 2) { g.strokeStyle = css(mul(c, 0.45), 0.5); g.lineWidth = Math.max(0.6, r * 0.05); g.beginPath(); g.arc(t.x, t.y, rr * 0.7, 0, 6.283); g.stroke(); }
  }
};
/** Deep woods: a dark mass, its edge ragged, then many leaf dabs over it, darkest in the shade,
 * bright yellow-green where the sun catches the edge. */
const dryBrushCrown = (g: Ctx, t: PaintTree, Lx: number, Ly: number, R: () => number) => {
  const r = t.r, c = t.col, dark = mix(mul(c, 0.42), [8, 30, 28], 0.35);
  circle(g, t.x, t.y, r * 0.78, css(dark));
  for (let i = 0; i < 18; i++) { const a = (i / 18) * 6.283 + R() * 0.3, d = r * (0.78 + R() * 0.16); circle(g, t.x + Math.cos(a) * d, t.y + Math.sin(a) * d, r * (0.12 + R() * 0.09), css(dark)); }
  const dabs: [number, number, number, number, number][] = [];
  const n = r < 14 ? 40 : 85;
  for (let i = 0; i < n; i++) {
    const a = R() * 6.283, d = Math.sqrt(R()) * r * 0.92, x = Math.cos(a) * d, y = Math.sin(a) * d;
    dabs.push([x, y, r * (0.07 + R() * 0.08) * (n === 40 ? 1.35 : 1), clamp(0.45 + ((x * Lx + y * Ly) / r) * 0.75 - (d / r) * 0.1 + (R() - 0.5) * 0.35), R() * 3.14]);
  }
  dabs.sort((p, q) => p[3] - q[3]);
  const bright = mix(mul(c, 1.75), [215, 232, 120], 0.45);
  for (const [x, y, rad, lit, rot] of dabs) {
    const col = lit < 0.5 ? mix(dark, c, lit * 2) : mix(c, bright, (lit - 0.5) * 2);
    g.beginPath(); g.ellipse(t.x + x, t.y + y, rad, rad * 0.75, rot, 0, 6.2832); g.fillStyle = css(col); g.fill();
  }
};
/** A pine (Golden, Deep woods): tiers of star-shaped boughs, each spike split down its middle, the
 * sun's half bright, the far half deep. */
const pine = (g: Ctx, t: PaintTree, Lx: number, Ly: number, mountain: boolean, warm: number) => {
  const c = mix(t.col, mountain ? [45, 80, 62] : [40, 75, 70], mountain ? 0.2 : 0.4), n = mountain ? 10 : 9, tiers = mountain ? 4 : 3;
  for (let k = 0; k < tiers; k++) {
    const R0 = t.r * (mountain ? 1.05 - k * 0.24 : 1 - k * 0.28), inner = R0 * (mountain ? 0.42 : 0.45), turn = k * (mountain ? 0.33 : 0.35) + (t.seed % 1) * 6.28;
    for (let i = 0; i < n; i++) {
      const am = (i / n) * 6.283 + turn, half = Math.PI / n;
      const tip = [t.x + Math.cos(am) * R0, t.y + Math.sin(am) * R0];
      for (const side of [-1, 1]) {
        const ab = am + side * half, base = [t.x + Math.cos(ab) * inner, t.y + Math.sin(ab) * inner];
        const lit = clamp(Math.cos(am + side * (mountain ? 1.2 : 0.8)) * Lx + Math.sin(am + side * (mountain ? 1.2 : 0.8)) * Ly, -1, 1);
        let col = mountain ? mul(c, 0.6 + 0.7 * lit + k * 0.09) : mul(c, 0.7 + 0.45 * lit);
        if (mountain && lit > 0.3) col = mix(col, [215, 235, 230], (lit - 0.3) * 0.35);
        if (!mountain && warm > 0.5 && lit > 0) col = mix(col, [230, 170, 80], 0.35 * lit * warm);
        g.beginPath(); g.moveTo(t.x, t.y); g.lineTo(base[0], base[1]); g.lineTo(tip[0], tip[1]); g.closePath(); g.fillStyle = css(col); g.fill();
      }
    }
  }
};

/** The trees, smallest first (the tall ones lean over them), in a style. */
export const drawTrees = (g: Ctx, trees: PaintTree[], style: Exclude<TreeStyle, "classic">, Lx: number, Ly: number, lt: Light) => {
  const sorted = [...trees].sort((p, q) => p.h - q.h);
  for (const t of sorted) {
    const R = seeded(Math.floor(t.seed * 1e6) + 1);
    if (t.pine) {
      if (t.r < 3) circle(g, t.x, t.y, t.r, css(mul(t.col, 0.8)));
      else if (style === "cluster" || style === "gouache") featherPine(g, t, Lx, Ly, R);
      else if (style === "cloud") rosettePine(g, t, Lx, Ly, R);
      else pine(g, t, Lx, Ly, false, lt.warm);
      continue;
    }
    if (t.r < 4) { tinyCrown(g, t, Lx, Ly, style === "golden" ? [255, 205, 110] : [230, 240, 180]); continue; }
    if (style === "cluster") clusterCrown(g, t, Lx, Ly, R);
    else if (style === "cloud") cloudCrown(g, t, Lx, Ly, R);
    else if (style === "gouache") gouacheCrown(g, t, Lx, Ly, R);
    else if (style === "drybrush") dryBrushCrown(g, t, Lx, Ly, R);
    else goldenCrown(g, t, Lx, Ly, R, lt.warm);
  }
};

/** Mist in the clearings (Deep woods): soft pale veils over the open ground. */
export const drawMist = (g: Ctx, spots: { x: number; y: number; r: number }[]) => {
  g.save();
  g.globalCompositeOperation = "screen";
  for (const m of spots) {
    const gr = g.createRadialGradient(m.x, m.y, 0, m.x, m.y, m.r);
    gr.addColorStop(0, "rgba(225,235,225,.12)"); gr.addColorStop(1, "rgba(225,235,225,0)");
    g.save(); g.translate(m.x, m.y); g.rotate(-0.5); g.scale(1, 0.38); g.translate(-m.x, -m.y);
    circle(g, m.x, m.y, m.r, gr);
    g.restore();
  }
  g.restore();
};

/** The light over the whole picture: a color grade from the sun's side to the shade's (golden
 * hour's gold, each style's daylight), or night's clear moonlit blue (no haze). */
export const gradeLight = (g: Ctx, W: number, H: number, Lx: number, Ly: number, lt: Light) => {
  g.save();
  if (lt.mode === "night") {
    g.globalCompositeOperation = "multiply"; g.fillStyle = "rgb(74,96,158)"; g.fillRect(0, 0, W, H);
    g.globalCompositeOperation = "color"; g.globalAlpha = 0.22; g.fillStyle = "rgb(40,70,140)"; g.fillRect(0, 0, W, H);
  } else if (lt.grade) {
    g.globalCompositeOperation = "soft-light";
    const gr = g.createLinearGradient(W * (0.5 + Lx * 0.6), H * (0.5 + Ly * 0.6), W * (0.5 - Lx * 0.6), H * (0.5 - Ly * 0.6));
    gr.addColorStop(0, css(lt.grade[0], lt.grade[0][3])); gr.addColorStop(1, css(lt.grade[1], lt.grade[1][3]));
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
  }
  g.restore();
};
