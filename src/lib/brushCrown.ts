// The Hand painted look's treetops (lib/mapLook), painted the way the reference is: every crown is
// clumps of leaf groups, every group three to five brush strokes out from a shared middle, every
// stroke a flat-brush dab with a scalloped edge and the bristles' marks in its paint. The light is
// the map's sun: the clumps toward it in yellow-green, those away from it in deep shade; the sunny
// groups lie over the shaded ones and each casts a soft shadow on the leaves under it. Nothing is
// pasted: every tree is painted from its own seed. Each tree is painted on a small canvas of its
// own (so the soft shadows only blur that much), then laid on the map.
type RGB = [number, number, number];
type Ctx = CanvasRenderingContext2D;
export type BrushTree = { x: number; y: number; r: number; col: RGB; seed: number };

const hash = (a: number, b: number) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };
const css = (c: number[], a = 1) => `rgba(${c.map(v => Math.round(Math.max(0, Math.min(255, v)))).join(",")},${a})`;
const mix = (a: number[], b: number[], k: number): RGB => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
const rng = (s: number) => { s = (Math.abs(Math.floor(s)) % 2147483646) + 1; return () => (s = (s * 16807) % 2147483647) / 2147483647; };
const canvas = (w: number, h: number) => { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; };

/** The look, as tuned against the reference: leaf groups' size and spacing, the crown's clumps,
 * how the light falls across them, its bands from shade to sun, the shade's and sun's paint. */
const P = {
  sec: 0.27, armLen: 0.75, armWid: 0.89, armOut: 0.1, sprayGap: 1.05, sprays: 2, clumps: 4.7, clumpR: 0.42, clumpD: 0.56,
  env: 0.96, envLump: 0.13, litBase: 0.46, litIn: 0.8, litTree: 0.8, litNoise: 0.4, lo: -0.57, hi: 0.66, nb: 7,
  shadow: [31, 38, 28] as RGB, sun: [178, 168, 74] as RGB, tex: 0.6, lift: 0.07, sink: 0.21, clumpVar: 0.12, clumpHue: 8,
  scallop: 0.19, bumpsMin: 9, shadeRim: 0.32, shadeRimCol: [110, 168, 150] as RGB, sunRim: 0.08, shadeTex: 0.22, shadeVar: 1.2
};

// ---------------------------------------------------------------- one brush stroke

let bristleTex: HTMLCanvasElement | null = null;
/** The brush's own marks: fine bristle lines side by side, each lighter or darker than the next and
 * fading in and out along its length, over a faint grain (half grey: laid over the paint, it only
 * lightens and darkens it). */
const bristles = () => {
  if (bristleTex) return bristleTex;
  const S = 256, c = canvas(S, S), t = c.getContext("2d")!, im = t.createImageData(S, S);
  const smooth = (v: number, k: number) => { const i = Math.floor(v), f = v - i, u = f * f * (3 - 2 * f); return hash(i, k) * (1 - u) + hash(i + 1, k) * u; };
  for (let x = 0; x < S; x++) {
    const line = (hash(x, 1) - 0.5) * 0.9 + (smooth(x / 6, 2) - 0.5) * 0.8 + (smooth(x / 23, 3) - 0.5) * 0.5;
    for (let y = 0; y < S; y++) {
      const along = smooth(y / 30 + x * 0.37, 4) * 0.7 + 0.3, grain = (hash(x * 7 + y, 5) - 0.5) * 0.18;
      const v = Math.max(0, Math.min(255, 128 + (line * along + grain) * 70)), i = (y * S + x) * 4;
      im.data[i] = im.data[i + 1] = im.data[i + 2] = v; im.data[i + 3] = 255;
    }
  }
  t.putImageData(im, 0, 0);
  return (bristleTex = c);
};

type StrokeOpts = { sun: number[]; bumps: number; flat?: boolean; alpha?: number; rim?: number; rimCol?: RGB; texMin?: number };
/** A stroke's outline from its base at (x0, y0) toward `ang`: squarish, as a flat brush leaves it,
 * narrower at the base, a little lopsided, its edge in scallops each its own size (at least seven
 * points a scallop, so each stays round, and about one every pixel and a half). */
const outline = (g: Ctx, x0: number, y0: number, ang: number, len: number, wid: number, sd: number, bumps: number) => {
  const ux = Math.cos(ang), uy = Math.sin(ang), vx = -uy, vy = ux, n = Math.max(bumps * 7, Math.min(160, Math.round((len + wid) * 1.6)));
  const cx = x0 + ux * len * 0.5, cy = y0 + uy * len * 0.5, sc = P.scallop, ph = hash(sd, 1) * 6.28, asymK = (hash(sd, 8) - 0.5) * 0.35;
  g.beginPath();
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * 6.2832, c = Math.cos(t), s = Math.sin(t);
    const c2 = Math.sign(c) * Math.pow(Math.abs(c), 0.82), s2 = Math.sign(s) * Math.pow(Math.abs(s), 0.82);
    const w = (wid / 2) * (0.74 + 0.26 * c) * (1 + asymK * s);
    const warp = t + 0.35 * Math.sin(t * 2 + ph) + 0.18 * Math.sin(t * 5 + ph * 2);
    const u = (warp * bumps) / 6.2832 + ph, bi = Math.floor(u), f = u - bi;
    const size = 0.72 + hash(((bi % bumps) + bumps) % bumps, sd) * 0.7;
    const bump = 1 - sc * size + sc * size * 2 * Math.pow(Math.sin(f * Math.PI), 0.45);
    const px = c2 * (len / 2) * bump, py = s2 * w * bump;
    g.lineTo(cx + ux * px + vx * py, cy + uy * px + vy * py);
  }
  g.closePath();
};
/** A stroke painted: one paint, its sunny edge lighter (in the shade most), a touch lighter toward
 * the sun and darker away, the bristles' marks along it, its edge a shade darker where the paint
 * gathers. Flat: the shape alone, one paint (shadows, and the deep shade under the leaves). */
const stroke = (g: Ctx, x0: number, y0: number, ang: number, len: number, wid: number, col: RGB, sd: number, o: StrokeOpts) => {
  const light = mix(P.sun, [255, 255, 255], 0.3), dark = P.shadow, sun = o.sun;
  outline(g, x0, y0, ang, len, wid, sd, o.bumps);
  g.fillStyle = css(col, o.alpha ?? 1); g.fill();
  if (o.flat) return;
  g.save(); g.clip();
  if (o.rim) {
    g.strokeStyle = css(mix(col, o.rimCol ?? light, o.rim)); g.lineWidth = Math.max(1.2, wid * 0.16); g.stroke();
    outline(g, x0 - sun[0] * wid * 0.07, y0 - sun[1] * wid * 0.07, ang, len, wid, sd, o.bumps);
    g.fillStyle = css(col); g.fill();
  }
  const cx = x0 + Math.cos(ang) * len * 0.5, cy = y0 + Math.sin(ang) * len * 0.5, R = Math.max(len, wid);
  const gr = g.createLinearGradient(cx + sun[0] * R * 0.6, cy + sun[1] * R * 0.6, cx - sun[0] * R * 0.6, cy - sun[1] * R * 0.6);
  gr.addColorStop(0, css(mix(col, light, P.lift))); gr.addColorStop(0.5, css(col, 0)); gr.addColorStop(1, css(mix(col, dark, P.sink)));
  g.fillStyle = gr; g.fillRect(cx - R, cy - R, R * 2, R * 2);
  // (the bristles: about forty across, never finer than a pixel and a half; none on a stroke too
  // small to show them)
  if (wid >= 5) {
    const px = Math.max(1.5, wid / 40), fine = Math.min(1, wid / 60), lum = (0.3 * col[0] + 0.59 * col[1] + 0.11 * col[2]) / 255;
    g.save();
    g.translate(cx, cy); g.rotate(ang + Math.PI / 2 + (hash(sd, 4) - 0.5) * 0.15); g.scale(px, px);
    g.translate(-hash(sd, 6) * 256, -hash(sd, 7) * 256);
    g.globalCompositeOperation = "overlay"; g.globalAlpha = P.tex * Math.min(1, Math.max(o.texMin ?? 0.35, (lum - 0.2) * 2.2)) * (0.45 + 0.55 * fine);
    g.fillStyle = g.createPattern(bristles(), "repeat")!;
    const span = (R * 1.5) / px; g.fillRect(hash(sd, 6) * 256 - span / 2, hash(sd, 7) * 256 - span / 2, span, span);
    g.restore();
  }
  outline(g, x0, y0, ang, len, wid, sd, o.bumps);
  g.strokeStyle = css(mix(col, dark, 0.25), 0.22); g.lineWidth = Math.max(1, wid * 0.08); g.stroke();
  g.restore();
};

// ---------------------------------------------------------------- one crown

type Arm = { x: number; y: number; a: number; len: number; wid: number; sd: number; bumps: number };
type Group = { c: number; k: number; arms: Arm[]; edge?: boolean };
type Clump = { x: number; y: number; r: number; top?: boolean; k: number; dl: number; hue: number };

/** A crown at (x, y), R px across its middle, in its leaf colour `base`, lit from `sun` (toward it). */
const paintCrown = (g: Ctx, x: number, y: number, R: number, base: RGB, seed: number, sun: number[]) => {
  const r = rng(seed * 1e6 + 1), nb = P.nb;
  // (its bands of light, shade to sun; a band past the darkest goes darker still)
  const band = (k: number) => { const v = Math.max(-1, P.lo + ((P.hi - P.lo) * Math.min(nb - 1, k)) / (nb - 1)); return v < 0 ? mix(base, P.shadow, -v) : mix(base, P.sun, v); };
  const bandOf = (lit: number) => Math.max(0, Math.min(nb - 1, Math.round(lit * (nb - 1))));
  const toSun = (dx: number, dy: number) => dx * sun[0] + dy * sun[1];
  // (small crowns: leaf groups never smaller than reads, so fewer of them)
  const sec = Math.max(P.sec * Math.min(1.7, Math.max(1, 34 / R)), 3.4 / R), sr = R * sec;
  const groupOf = (gx: number, gy: number, rad: number, k: number, c: number): Group => {
    const n = r() < 0.6 ? 4 : r() < 0.5 ? 3 : 5, a0 = r() * 6.2832, arms: Arm[] = [];
    for (let i = 0; i < n; i++) {
      const a = a0 + (i / n) * 6.2832 + (r() - 0.5) * 0.7, len = rad * P.armLen * (0.8 + r() * 0.5);
      arms.push({ x: gx - Math.cos(a) * len * P.armOut, y: gy - Math.sin(a) * len * P.armOut, a, len, wid: len * P.armWid * (0.85 + r() * 0.3), sd: Math.floor(r() * 1e6), bumps: P.bumpsMin + Math.floor(r() * 4) });
    }
    return { c, k, arms };
  };
  // The crown's edge: round, a few gentle lumps; no group past it
  const eph = r() * 7, eph2 = r() * 7, edgeAt = (a: number) => R * P.env * (1 + P.envLump * Math.sin(a * 3 + eph) + P.envLump * 0.6 * Math.sin(a * 5 + eph2));
  const inside = (px: number, py: number, rad: number) => Math.hypot(px - x, py - y) + rad * 0.8 <= edgeAt(Math.atan2(py - y, px - x));
  // The clumps: one near the middle, the rest round it; each a little its own in light and green
  const nc = Math.max(2, Math.round(P.clumps) + Math.floor(r() * 2));
  const clumps: Clump[] = [{ x: x + (r() - 0.5) * R * 0.15, y: y + (r() - 0.5) * R * 0.15, r: R * (P.clumpR + 0.04), top: true, k: 0, dl: 0, hue: 0 }];
  for (let i = 0; i < nc; i++) { const a = (i / nc) * 6.2832 + r() * 0.7, d = R * (P.clumpD - 0.06 + r() * 0.12); clumps.push({ x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, r: R * (P.clumpR - 0.04 + r() * 0.1), k: 0, dl: 0, hue: 0 }); }
  clumps.forEach(c => { c.k = c.top ? 9 : toSun(c.x - x, c.y - y) / R + r() * 0.6; c.dl = (r() - 0.5) * 2 * P.clumpVar; c.hue = (r() - 0.5) * 2 * P.clumpHue; });
  // (those away from the sun first; the middle one last, on top)
  clumps.sort((p, q) => p.k - q.k);
  const groups: Group[] = [], under: Group[] = [];
  const litAt = (px: number, py: number, c: Clump) => P.litBase + (toSun(px - c.x, py - c.y) / (c.r * 1.3)) * P.litIn + (toSun(c.x - x, c.y - y) / (R * 1.1)) * P.litTree;
  clumps.forEach((c, ci) => {
    // (the clump's inner leaves, in its own shade: what shows between its groups)
    const step = sr * 1.6;
    for (let gy = -c.r; gy <= c.r; gy += step) for (let gx = -c.r; gx <= c.r; gx += step) {
      const ux = c.x + gx + (r() - 0.5) * sr * 0.6, uy = c.y + gy + (r() - 0.5) * sr * 0.6;
      if (Math.hypot(ux - c.x, uy - c.y) > c.r * 0.9 || !inside(ux, uy, sr)) continue;
      under.push(groupOf(ux, uy, sr, bandOf(litAt(ux, uy, c)) - 2, ci));
    }
    const spots: { x: number; y: number }[] = [], want = Math.round((c.r / sr) ** 2 * P.sprays);
    for (let t = 0; t < want * 12 && spots.length < want; t++) {
      const a = r() * 6.2832, d = Math.sqrt(r()) * c.r * 0.9, sx = c.x + Math.cos(a) * d, sy = c.y + Math.sin(a) * d;
      if (!inside(sx, sy, sr) || spots.some(o => Math.hypot(o.x - sx, o.y - sy) < sr * P.sprayGap)) continue;
      spots.push({ x: sx, y: sy });
    }
    // (in a clump: its side away from the sun first, its sunny side over it)
    spots.sort((p, q) => toSun(p.x - c.x, p.y - c.y) - toSun(q.x - c.x, q.y - c.y));
    for (const s of spots) {
      let k = bandOf(litAt(s.x, s.y, c) + (c.top ? 0.06 : 0) + c.dl + (r() - 0.5) * P.litNoise);
      // (in the shade, leaves a band or so apart from one another, so they don't merge)
      if (k <= 2) k = Math.max(0, Math.min(2, k + Math.round((r() - 0.4) * P.shadeVar)));
      groups.push(groupOf(s.x, s.y, sr * (0.85 + r() * 0.3), k, ci));
    }
  });
  // A ring of groups along the edge, so the outline is leaves all the way round
  const ring = Math.round((2 * Math.PI * R * P.env) / (sr * P.sprayGap * 1.2));
  for (let i = 0; i < ring; i++) {
    const a = (i / ring) * 6.2832 + (r() - 0.5) * 0.2, d = edgeAt(a) - sr * 0.75, ex = x + Math.cos(a) * d, ey = y + Math.sin(a) * d;
    let ci = 0, best = Infinity;
    clumps.forEach((c, j) => { const dd = Math.hypot(c.x - ex, c.y - ey) - c.r; if (dd < best) { best = dd; ci = j; } });
    groups.push({ ...groupOf(ex, ey, sr * (0.85 + r() * 0.3), bandOf(litAt(ex, ey, clumps[ci]) - 0.08), ci), edge: true });
  }
  // (clump by clump, its edge groups first)
  groups.sort((p, q) => p.c - q.c || (q.edge ? 1 : 0) - (p.edge ? 1 : 0));
  const draw = (gr: Group, k: number, flat = false, dx = 0, dy = 0, alpha = 1) => {
    const h = clumps[gr.c].hue, c0 = band(k), col: RGB = [c0[0] + h, c0[1] + h * 0.3, c0[2] - h * 0.4];
    const shade = k <= 2, o: StrokeOpts = { sun, bumps: 0, flat, alpha, ...(flat ? {} : { rim: shade ? P.shadeRim : P.sunRim, rimCol: shade ? P.shadeRimCol : undefined, texMin: shade ? P.shadeTex : 0.35 }) };
    for (const s of gr.arms) stroke(g, s.x + dx, s.y + dy, s.a, s.len, s.wid, col, s.sd, { ...o, bumps: s.bumps });
  };
  // (shadows fall away from the sun)
  const ox = -sun[0] * sr * 0.12, oy = -sun[1] * sr * 0.12;
  // Under it all: the crown's deep shade, solid inside its edge, then in the groups' own shapes
  const deep = mix(band(0), P.shadow, 0.5);
  g.fillStyle = css(deep);
  g.beginPath();
  for (let i = 0; i <= 72; i++) { const a = (i / 72) * 6.2832, rr = edgeAt(a) * 0.8; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
  g.fill();
  for (const o of groups) for (const s of o.arms) stroke(g, s.x + ox * 0.6, s.y + oy * 0.6, s.a, s.len, s.wid, deep, s.sd, { sun, bumps: s.bumps, flat: true });
  // (its limbs, showing here and there between the clumps)
  g.strokeStyle = "rgba(60,46,30,0.9)"; g.lineCap = "round";
  for (const c of clumps) { g.lineWidth = Math.max(0.6, R * 0.025); g.beginPath(); g.moveTo(x, y); g.lineTo(c.x, c.y); g.stroke(); }
  const blur = sr * 0.06;
  let last = -1;
  for (const o of groups) {
    if (o.c !== last) { last = o.c; for (const q of under) if (q.c === o.c) draw(q, q.k + 1); }
    // (each group's soft shadow on the leaves under it, never past the crown's edge)
    g.save(); g.globalCompositeOperation = "source-atop"; if (blur >= 0.5) g.filter = `blur(${Math.max(0.8, blur).toFixed(1)}px)`;
    draw(o, o.k - 3, true, ox * 1.4, oy * 1.4, 0.6);
    g.restore();
    draw(o, o.k);
  }
};

let own: HTMLCanvasElement | null = null;
/** The trees, painted one by one (each on its own canvas, then laid on the map), those away from
 * the sun first so the sunny side of the woods lies over the rest; a step at a time, so the page
 * stays free while they paint. `sun`: toward the sun, on the page. */
export function* drawBrushedSteps(g: Ctx, trees: BrushTree[], sun: number[]) {
  const sorted = [...trees].sort((p, q) => p.x * sun[0] + p.y * sun[1] - (q.x * sun[0] + q.y * sun[1]));
  let since = performance.now();
  for (const t of sorted) {
    const S = Math.ceil(t.r * 3.4) + 24, half = S / 2;
    if (!own || own.width < S) own = canvas(Math.max(S, 128), Math.max(S, 128));
    const o = own.getContext("2d")!;
    o.setTransform(1, 0, 0, 1, 0, 0); o.clearRect(0, 0, S, S);
    paintCrown(o, half + (t.x - Math.floor(t.x)), half + (t.y - Math.floor(t.y)), t.r, t.col, t.seed, sun);
    g.drawImage(own, 0, 0, S, S, Math.floor(t.x) - half, Math.floor(t.y) - half, S, S);
    if (performance.now() - since > 12) { yield; since = performance.now(); }
  }
}
