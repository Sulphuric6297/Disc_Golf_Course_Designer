// Shadows on an aerial photo: which way they fall (measured on the photo itself: crowns and the
// dark ground beside them), and how tall a lone tree is from its shadow's length and the sun's
// height that day. Pure functions over RGBA pixels.
import type { DetectImage } from "./detect";

/** The ground's typical brightness away from the canopy (visible, and near-infrared when there is
 * one): medians, every few pixels. */
const groundLevels = (img: DetectImage, mask: Uint8Array, nir?: Uint8Array) => {
  const L: number[] = [], N: number[] = [];
  const d = img.data;
  for (let i = 0; i < mask.length; i += 7) {
    if (mask[i]) continue;
    L.push(0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]);
    if (nir) N.push(nir[i]);
  }
  const med = (a: number[]) => (a.length ? (a.sort((x, y) => x - y), a[a.length >> 1]) : 0);
  return { L: med(L), N: med(N) };
};

/** Dark ground: shade (or water, or dark pavement) off the canopy. */
const shadeTest = (img: DetectImage, mask: Uint8Array, nir?: Uint8Array) => {
  const lv = groundLevels(img, mask, nir);
  const d = img.data;
  return (i: number) => {
    if (mask[i]) return false;
    const l = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
    return l < lv.L * SHADE_LIGHT && (!nir || nir[i] < lv.N * SHADE_NIR);
  };
};
// Shade: darker than this share of the open ground's brightness (and of its near-infrared).
const SHADE_LIGHT = 0.62;
const SHADE_NIR = 0.72;

/**
 * Which way the shadows fall (a unit vector in pixels, x east and y south), measured on the
 * photo: from the canopy's edges, the direction in which dark ground lies most often, a couple of
 * meters out. Null when no direction stands out (an overcast day, or too few trees).
 */
export const shadowDirection = (img: DetectImage, mask: Uint8Array, mpp: number, nir?: Uint8Array) => {
  const { width: w, height: h } = img;
  const shade = shadeTest(img, mask, nir);
  // The canopy's edge pixels, a spread-out sample of them
  const edge: number[] = [];
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x;
    if (mask[i] && (!mask[i - 1] || !mask[i + 1] || !mask[i - w] || !mask[i + w])) edge.push(i);
  }
  if (edge.length < 200) return null;
  const every = Math.max(1, Math.floor(edge.length / 30000));
  const DIRS = 48;
  const score = new Float64Array(DIRS);
  const dists = [1.5, 2.5, 3.5, 5].map(m => m / mpp);
  for (let k = 0; k < DIRS; k++) {
    const a = (k / DIRS) * Math.PI * 2, ux = Math.cos(a), uy = Math.sin(a);
    let hit = 0, seen = 0;
    for (let e = 0; e < edge.length; e += every) {
      const x0 = edge[e] % w, y0 = (edge[e] / w) | 0;
      for (const t of dists) {
        const x = Math.round(x0 + ux * t), y = Math.round(y0 + uy * t);
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        seen++;
        if (shade(y * w + x)) hit++;
      }
    }
    score[k] = seen ? hit / seen : 0;
  }
  // (smoothed over the neighbouring directions: a shadow is a few degrees wide)
  const sm = Array.from(score, (_, k) => (score[(k + DIRS - 1) % DIRS] + 2 * score[k] + score[(k + 1) % DIRS]) / 4);
  let best = 0;
  for (let k = 1; k < DIRS; k++) if (sm[k] > sm[best]) best = k;
  const opposite = sm[(best + DIRS / 2) % DIRS];
  if (sm[best] - opposite < 0.015 || sm[best] < opposite * SHADOW_CLEAR) return null;
  // (the peak's middle, between its neighbours)
  const l = sm[(best + DIRS - 1) % DIRS], r = sm[(best + 1) % DIRS];
  const off = l + r - 2 * sm[best] !== 0 ? (0.5 * (l - r)) / (l + r - 2 * sm[best]) : 0;
  const a = ((best + Math.max(-0.5, Math.min(0.5, off))) / DIRS) * Math.PI * 2;
  return { dx: Math.cos(a), dy: Math.sin(a), strength: sm[best], opposite };
};
// The shadows' side must be this many times darker than the side facing the sun.
const SHADOW_CLEAR = 1.2;

/** How much shade a crown (pixels) has beside it on the shadow side, as anything standing up
 * does: the share of the ground from its edge to `reachM` out that's dark. */
export const shadeBeside = (img: DetectImage, mask: Uint8Array, dir: { dx: number; dy: number }, mpp: number, nir?: Uint8Array, reachM = 5) => {
  const { width: w, height: h } = img;
  const shade = shadeTest(img, mask, nir);
  return (t: { x: number; y: number; radiusPx: number }) => {
    let dark = 0, cnt = 0;
    const half = Math.max(1, Math.round(t.radiusPx * 0.6));
    for (let s = Math.round(t.radiusPx * 0.7); s < t.radiusPx + reachM / mpp; s++) {
      for (let q = -half; q <= half; q += 2) {
        const x = Math.round(t.x + dir.dx * s - dir.dy * q), y = Math.round(t.y + dir.dy * s + dir.dx * q);
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        const i = y * w + x;
        if (mask[i]) continue;
        cnt++;
        if (shade(i)) dark++;
      }
    }
    return cnt ? dark / cnt : 0;
  };
};

/** The sun's height (radians) on a day at a latitude, given its compass direction (radians
 * clockwise from north): from the spherical triangle of the pole, the zenith and the sun. */
export const sunElevation = (date: string, latDeg: number, azimuth: number) => {
  const t = Date.parse(`${date.slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(t)) return null;
  const day = (t - Date.UTC(new Date(t).getUTCFullYear(), 0, 0)) / 864e5;
  const decl = ((23.44 * Math.PI) / 180) * Math.sin((2 * Math.PI * (284 + day)) / 365);
  const lat = (latDeg * Math.PI) / 180;
  // sin(decl) = sin(lat) sin(el) + cos(lat) cos(el) cos(az)
  const a = Math.sin(lat), b = Math.cos(lat) * Math.cos(azimuth);
  const R = Math.hypot(a, b), psi = Math.atan2(b, a);
  const s = Math.sin(decl) / R;
  if (Math.abs(s) > 1) return null;
  const els = [Math.asin(s) - psi, Math.PI - Math.asin(s) - psi].map(e => ((e + 3 * Math.PI) % (2 * Math.PI)) - Math.PI);
  const ok = els.filter(e => e > (8 * Math.PI) / 180 && e < (88 * Math.PI) / 180);
  return ok.length === 1 ? ok[0] : null;
};

/**
 * Each lone tree's height (ft) from its shadow, where it shows clearly: the shadow's far tip is
 * where the treetop's shadow lands, so its distance from the crown's middle times the tangent of
 * the sun's height is the tree's height. Undefined where it can't say (no date, a shadow running
 * into other shade, or none to see).
 */
export const treeHeights = (
  img: DetectImage,
  mask: Uint8Array,
  trees: { x: number; y: number; radiusPx: number }[],
  dir: { dx: number; dy: number },
  mpp: number,
  opts: { date?: string; lat?: number },
  nir?: Uint8Array
): (number | undefined)[] => {
  if (!opts.date || opts.lat === undefined) return trees.map(() => undefined);
  const azimuth = Math.atan2(-dir.dx, dir.dy); // the sun's side: against the shadow (x east, y south)
  const el = sunElevation(opts.date, opts.lat, (azimuth + 2 * Math.PI) % (2 * Math.PI));
  if (el === null) return trees.map(() => undefined);
  const { width: w, height: h } = img;
  const shade = shadeTest(img, mask, nir);
  const maxRun = 45 / mpp;
  return trees.map(t => {
    // Along the shadow's direction from the crown's middle, a band half the crown wide: the last
    // step that is still mostly shade (little gaps allowed: a crown's shadow is lacy).
    const half = Math.max(1, Math.round(t.radiusPx * 0.4));
    let last = -1, gap = 0, any = 0;
    for (let s = Math.round(t.radiusPx * 0.5); s < maxRun; s++) {
      let dark = 0, cnt = 0, leaf = 0;
      for (let q = -half; q <= half; q++) {
        const x = Math.round(t.x + dir.dx * s - dir.dy * q), y = Math.round(t.y + dir.dy * s + dir.dx * q);
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        cnt++;
        const i = y * w + x;
        if (mask[i]) leaf++;
        else if (shade(i)) dark++;
      }
      if (!cnt) return undefined;
      // (into another crown past its own: that one's shade and leaves hide where this one's ends)
      if (s > t.radiusPx * 1.3 && leaf > cnt * 0.5) return undefined;
      if (dark >= cnt * 0.4) { last = s; gap = 0; any++; }
      else if (s > t.radiusPx && ++gap > 2 / mpp && any) break;
    }
    if (last < 0 || any < 2) return undefined;
    if (last >= maxRun - 1) return undefined;
    // (a round crown's shadow reaches past its top's, by its edge: r / cos(el) of shadow for r of
    // height, so the crown's radius comes off that much)
    const r = t.radiusPx * mpp * 3.28084;
    const ft = (last + 0.5) * mpp * 3.28084 * Math.tan(el) + r * (1 - 1 / Math.cos(el));
    return ft >= 8 && ft <= 130 ? Math.round(ft) : undefined;
  });
};
