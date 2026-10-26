// Woods, lone trees and water on a photo's pixels (pure: no page needed, so it can run in a
// worker). With a near-infrared band (NAIP's) leaves, shadows and water are told apart by it;
// without, by color and texture.
import { canopyMask, detectTrees, waterRegions, woodsRegions, type DetectImage, type Region } from "./detect";
import { shadeBeside, shadowDirection, treeHeights } from "./shadows";

/** The most trees found on a photo that come in on their own (outside woods). */
const MAX_PHOTO_TREES = 400;
// A lone tree has at least this share of sure leaves at its middle, and of shade beside it.
const LONE_LEAF = 0.5;
const LONE_SHADE = 0.15;
// Without the infrared: a lone crown at least this wide (m, radius), and this dark for the lawn.
const LONE_RGB_R = 2;
const LONE_RGB_DARK = 0.65;

export type PhotoFound = {
  w: number;
  h: number;
  /** Tree canopy, per pixel (null: too little vegetation to tell). */
  mask: Uint8Array | null;
  woods: Region[];
  water: Region[];
  /** The trees standing on their own (pixels): crown radius, and height where its shadow says. */
  trees: { x: number; y: number; radiusPx: number; heightFt?: number }[];
  /** Which way shadows fall on the photo (unit vector, pixels: x east, y south), when it shows. */
  shadow: { dx: number; dy: number } | null;
};

/**
 * Woods, lone trees and water on a photo's pixels. `date` (YYYY-MM-DD) and `lat`, when known,
 * let a tree's shadow measure its height (the sun's height from the day and the shadows' own
 * direction). Without an infrared band, lone trees aren't looked for on a photo taken bare
 * (`season` "leaf-off"): there a tree and its long winter shadow are one dark blob, like many
 * that aren't trees.
 */
export const findNature = (photo: { pixels: DetectImage; nir?: Uint8Array; mpp: number }, opts: { date?: string; lat?: number; waterOnly?: boolean; season?: string } = {}): PhotoFound => {
  const { pixels, nir, mpp } = photo;
  const w = pixels.width, h = pixels.height;
  const o = { metersPerPx: mpp, nir };
  const water = waterRegions(pixels, o);
  if (opts.waterOnly) return { w, h, mask: null, woods: [], water, trees: [], shadow: null };
  const canopy = canopyMask(pixels, o);
  if (!canopy) return { w, h, mask: null, woods: [], water, trees: [], shadow: null };
  const stand = new Uint8Array(w * h);
  const woods = woodsRegions(canopy, undefined, stand);
  const shadow = shadowDirection(pixels, canopy.mask, mpp, nir);
  // The trees in a stand are the woods now; the rest stand on their own
  const inWoods = (x: number, y: number) => stand[Math.min(h - 1, Math.max(0, Math.round(y))) * w + Math.min(w - 1, Math.max(0, Math.round(x)))] === 1;
  // A tree on its own: mostly sure leaves at its middle (by the infrared, where there is one, not
  // only lumpy green), and, where the shadows show, shade beside it on their side (a patch of
  // tall grass or a dark lawn stands up from nothing)
  const leaf = canopy.leaf;
  // (color alone: a crown a couple of meters across at least, and clearly darker than the lawn,
  // as a tree's shaded leaves are, where a clump of tall grass or a bush isn't)
  const leafy = (t: { x: number; y: number; radiusPx: number }) => {
    if (!leaf && t.radiusPx * mpp < LONE_RGB_R) return false;
    const r = Math.max(1, Math.round(t.radiusPx * 0.6));
    let on = 0, all = 0, light = 0;
    for (let y = Math.max(0, Math.round(t.y) - r); y <= Math.min(h - 1, Math.round(t.y) + r); y++)
      for (let x = Math.max(0, Math.round(t.x) - r); x <= Math.min(w - 1, Math.round(t.x) + r); x++) {
        if ((x - t.x) ** 2 + (y - t.y) ** 2 > r * r) continue;
        all++;
        if (leaf) on += leaf[y * w + x];
        else light += canopy.luma[y * w + x];
      }
    if (!all) return false;
    return leaf ? on / all >= LONE_LEAF : light / all < canopy.lawn * LONE_RGB_DARK;
  };
  const beside = shadow ? shadeBeside(pixels, canopy.mask, shadow, mpp, nir) : null;
  const found = !leaf && opts.season === "leaf-off" ? [] : detectTrees(pixels, { ...o, maxTrees: Infinity, canopy }).filter(t => !inWoods(t.x, t.y) && leafy(t) && (!beside || beside(t) >= LONE_SHADE)).slice(0, MAX_PHOTO_TREES);
  const heights = shadow ? treeHeights(pixels, canopy.mask, found, shadow, mpp, opts, nir) : [];
  const trees = found.map((t, k) => ({ ...t, heightFt: heights[k] }));
  return { w, h, mask: canopy.mask, woods, water, trees, shadow };
};
