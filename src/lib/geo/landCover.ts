// What the ground in an aerial photo is made of, spot by spot: lawn and planting, concrete, asphalt,
// or bare soil, gravel and mulch. The map view lays a real-scale texture of each over the photo
// (keeping the photo's own colors), so a blurry photo reads as grass, pavement and dirt up close.
// Pure functions over RGBA pixels.
import type { DetectImage } from "./detect";

/** The kinds of ground, in the order of the mask's channels (red, green, blue, alpha). */
export const COVER_CLASSES = ["grass", "concrete", "asphalt", "soil"] as const;
export type CoverClass = (typeof COVER_CLASSES)[number];

export type CoverWeights = Record<CoverClass | "none", number> & { sure: number };

const ramp = (v: number, a: number, b: number) => (v <= a ? 0 : v >= b ? 1 : (v - a) / (b - a));

/**
 * How much one photo color looks like each kind of ground (the five shares add up to 1), and how
 * sure that is: deep shadow says little. `rough` is how grainy the photo is around it (the spread of
 * its brightness over a few feet, 0-1).
 * - Plants: greener than they are red or blue (excess green), even in shade or dry.
 * - Soil, gravel, mulch, dry dirt: warm (red/yellow over blue) without the green; grainy tan is
 *   dirt or gravel, smooth beige is concrete.
 * - Pavement: grey; light grey concrete, dark grey asphalt.
 * - None: water and pools (blue), and strong colors that are none of these.
 */
export const coverOfColor = (r: number, g: number, b: number, rough = 0): CoverWeights => {
  const sum = r + g + b + 1;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  const light = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  const sat = mx > 0 ? (mx - mn) / mx : 0;
  const chroma = (mx - mn) / 255;
  const exg = (2 * g - r - b) / sum;
  const warm = (r - b) / sum;
  const blue = (b - (r + g) / 2) / sum;
  // Pools and ponds are clearly blue; hazy asphalt is only a little
  const water = ramp(blue, 0.05, 0.12) * ramp(sat, 0.25, 0.4);
  const plant = (1 - water) * ramp(exg, 0.015, 0.07);
  const soil = (1 - water) * (1 - plant) * Math.min(1, ramp(warm, 0.03, 0.12) * (0.6 + 1.2 * ramp(rough, 0.02, 0.08)));
  const rest = Math.max(0, 1 - water - plant - soil);
  // Grey enough for pavement; a strong odd color (a painted court, a car) is none of these
  const odd = rest * ramp(chroma, 0.2, 0.32);
  const pave = rest - odd;
  const bright = ramp(light, 0.36, 0.56);
  return {
    grass: plant,
    concrete: pave * bright,
    asphalt: pave * (1 - bright),
    soil,
    none: water + odd,
    sure: 0.03 + 0.97 * ramp(light, 0.07, 0.22)
  };
};

/** Box blur of a float plane in place (radius r, both directions), via running sums. */
const boxBlur = (v: Float32Array, w: number, h: number, r: number, tmp: Float32Array) => {
  if (r < 1) return;
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let s = 0;
    for (let x = -r; x <= r; x++) s += v[row + Math.min(w - 1, Math.max(0, x))];
    for (let x = 0; x < w; x++) {
      tmp[row + x] = s / (2 * r + 1);
      s += v[row + Math.min(w - 1, x + r + 1)] - v[row + Math.max(0, x - r)];
    }
  }
  for (let x = 0; x < w; x++) {
    let s = 0;
    for (let y = -r; y <= r; y++) s += tmp[Math.min(h - 1, Math.max(0, y)) * w + x];
    for (let y = 0; y < h; y++) {
      v[y * w + x] = s / (2 * r + 1);
      s += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
    }
  }
};
/** Two box blurs: close to a Gaussian, no blocky edges. */
const blur = (v: Float32Array, w: number, h: number, r: number, tmp: Float32Array) => {
  boxBlur(v, w, h, r, tmp);
  boxBlur(v, w, h, r, tmp);
};

/**
 * The ground cover mask of an aerial photo, the same size as the photo: per pixel, the share of
 * grass, concrete, asphalt and soil (0-255 in the red, green, blue and alpha bytes; what is left is
 * none of them). Each pixel's color is weighed by how sure it is and smoothed over about a foot,
 * so edges follow the photo; deep shadows take what is around them over a few yards.
 */
export const classifyCover = (img: DetectImage, opts: { pxPerFt: number }) => {
  const { width: w, height: h, data } = img;
  const n = w * h;
  const planes = [0, 1, 2, 3, 4].map(() => new Float32Array(n));
  const sure = new Float32Array(n);
  const keys = [...COVER_CLASSES, "none"] as const;
  const tmp = new Float32Array(n);
  // How grainy the photo is around each pixel: the spread of brightness over about 3 ft
  const lum = new Float32Array(n), lum2 = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const l = (0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2]) / 255;
    lum[i] = l;
    lum2[i] = l * l;
  }
  const roughR = Math.max(1, Math.round(1.5 * opts.pxPerFt));
  boxBlur(lum, w, h, roughR, tmp);
  boxBlur(lum2, w, h, roughR, tmp);
  for (let i = 0; i < n; i++) {
    const c = coverOfColor(data[i * 4], data[i * 4 + 1], data[i * 4 + 2], Math.sqrt(Math.max(0, lum2[i] - lum[i] * lum[i])));
    sure[i] = c.sure;
    for (let k = 0; k < 5; k++) planes[k][i] = c[keys[k]] * c.sure;
  }
  // Fine (about a foot) and coarse (about 15 ft) smoothing, blended by how sure the fine one is
  const fineR = Math.max(1, Math.round(0.5 * opts.pxPerFt));
  const coarseR = Math.max(2, Math.round(9 * opts.pxPerFt));
  const coarse = planes.map(p => p.slice());
  const sureCoarse = sure.slice();
  for (const p of planes) blur(p, w, h, fineR, tmp);
  blur(sure, w, h, fineR, tmp);
  for (const p of coarse) blur(p, w, h, coarseR, tmp);
  blur(sureCoarse, w, h, coarseR, tmp);
  const out = new Uint8ClampedArray(n * 4);
  const k2 = 0.25;
  for (let i = 0; i < n; i++) {
    const den = sure[i] + k2 * sureCoarse[i];
    if (den <= 1e-6) continue;
    for (let k = 0; k < 4; k++) out[i * 4 + k] = Math.round((255 * (planes[k][i] + k2 * coarse[k][i])) / den);
  }
  return { data: out, width: w, height: h };
};

/** The kind of ground with the largest share at a pixel of a cover mask (null: none of them). */
export const coverAt = (mask: { data: Uint8ClampedArray; width: number }, x: number, y: number): CoverClass | null => {
  const i = (Math.round(y) * mask.width + Math.round(x)) * 4;
  let best = -1, at = 0;
  for (let k = 0; k < 4; k++) if (mask.data[i + k] > best) { best = mask.data[i + k]; at = k; }
  const none = 255 - mask.data[i] - mask.data[i + 1] - mask.data[i + 2] - mask.data[i + 3];
  return best > none ? COVER_CLASSES[at] : null;
};
