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
  summer: ["#4f8a3c", "#5f9842", "#447e3a", "#6aa04a", "#3f7640", "#78a84a"],
  drybrush: ["#2e5524", "#3a6428", "#47702c", "#264b2c", "#507834", "#33592d"],
  golden: ["#3a5a26", "#4b6a2a", "#2e4f2a", "#5a6f2c"],
  highland: ["#3a6440", "#456f46", "#33593c", "#527a4a", "#3d6845"]
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
/** Summer: one big rounded crown, a few broad lobes, lit as one mass: fresh pale top on the sun's
 * side, cool teal underneath; a few leaf glints. */
const summerCrown = (g: Ctx, t: PaintTree, Lx: number, Ly: number, R: () => number) => {
  const r = t.r, c = t.col, lobes: [number, number, number][] = [];
  for (let i = 0; i < 7; i++) { const a = (i / 7) * 6.283 + R() * 0.6, d = r * (0.5 + R() * 0.12); lobes.push([Math.cos(a) * d, Math.sin(a) * d, r * (0.42 + R() * 0.1)]); }
  const gr = g.createRadialGradient(t.x + Lx * r * 0.45, t.y + Ly * r * 0.45, r * 0.05, t.x - Lx * r * 0.1, t.y - Ly * r * 0.1, r * 1.15);
  gr.addColorStop(0, css(mix(mul(c, 1.55), [240, 250, 205], 0.35))); gr.addColorStop(0.45, css(mul(c, 1.05)));
  gr.addColorStop(0.8, css(mix(mul(c, 0.62), [20, 70, 80], 0.25))); gr.addColorStop(1, css(mix(mul(c, 0.45), [15, 50, 65], 0.4)));
  g.beginPath();
  for (const [bx, by, br] of lobes) { g.moveTo(t.x + bx + br, t.y + by); g.arc(t.x + bx, t.y + by, br, 0, 6.2832); }
  g.moveTo(t.x + r * 0.62, t.y); g.arc(t.x, t.y, r * 0.62, 0, 6.2832);
  g.fillStyle = gr; g.fill();
  for (const [bx, by, br] of lobes) {
    const s = g.createRadialGradient(t.x + bx + Lx * br * 0.4, t.y + by + Ly * br * 0.4, br * 0.4, t.x + bx, t.y + by, br);
    s.addColorStop(0, "rgba(0,0,0,0)"); s.addColorStop(1, "rgba(10,40,45,.28)"); circle(g, t.x + bx, t.y + by, br, s);
  }
  for (let i = 0; i < 5; i++) { const a = Math.atan2(Ly, Lx) + (R() - 0.5) * 1.6, d = r * (0.3 + R() * 0.45); circle(g, t.x + Math.cos(a) * d, t.y + Math.sin(a) * d, r * (0.05 + R() * 0.06), css(mix(mul(c, 1.7), [245, 255, 215], 0.5))); }
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
/** A pine: tiers of star-shaped boughs, each spike split down its middle, the sun's half bright,
 * the far half deep; Mountain pines with four tiers and a cool white edge on the lit spikes. */
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
    if (t.pine) { if (t.r < 3) circle(g, t.x, t.y, t.r, css(mul(t.col, 0.8))); else pine(g, t, Lx, Ly, style === "highland", lt.warm); continue; }
    if (t.r < 4) { tinyCrown(g, t, Lx, Ly, style === "golden" ? [255, 205, 110] : [230, 240, 180]); continue; }
    if (style === "summer" || style === "highland") summerCrown(g, t, Lx, Ly, R);
    else if (style === "drybrush") dryBrushCrown(g, t, Lx, Ly, R);
    else goldenCrown(g, t, Lx, Ly, R, lt.warm);
  }
};

/** Granite boulders, lit on top, their own little shadows (Mountain pines). */
export const drawBoulders = (g: Ctx, spots: { x: number; y: number; r: number }[], Lx: number, Ly: number, lt: Light, strength: number) => {
  const R = seeded(77);
  for (const b of spots) {
    const sx = b.x - Lx * b.r * lt.len, sy = b.y - Ly * b.r * lt.len;
    const sh = g.createRadialGradient(sx, sy, 0, sx, sy, b.r * 1.3);
    sh.addColorStop(0, css([26, 34, 48], 0.5 * strength)); sh.addColorStop(1, css([26, 34, 48], 0));
    circle(g, sx, sy, b.r * 1.3, sh);
    const gr = g.createRadialGradient(b.x + Lx * b.r * 0.4, b.y + Ly * b.r * 0.4, b.r * 0.1, b.x, b.y, b.r);
    gr.addColorStop(0, "#eceee8"); gr.addColorStop(0.55, "#a9ada8"); gr.addColorStop(1, "#666c6e");
    g.beginPath(); g.ellipse(b.x, b.y, b.r, b.r * 0.82, R() * 3, 0, 6.2832); g.fillStyle = gr; g.fill();
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
