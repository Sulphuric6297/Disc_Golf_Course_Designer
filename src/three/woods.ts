// Woods in 3D: a drawn woods area filled with real-looking trees (see treeKit), drawn instanced
// so thousands stay quick: mostly broadleaf canopy trees with some conifers, a few smaller trees
// beneath them, each its own height, crown, lean and shade of green.
import type { BrushKind, LidarTree, P } from "../types";
import { BRUSH_VARIANTS } from "./ezShapes";
import { nearestOnSegment, pointInPolygon } from "../lib/geom";
import { Forest, VARIANTS, type TreeSpot } from "./treeKit";
import { foliageTint } from "./trees";

const MAX_TREES = 6000;

/** How a wood fills itself (unset: the landscape's mix, usual heights). */
export type WoodsFill = { pines?: number; bushes?: number; heights?: [number, number] };

/** A number in [0, 1) of a spot and a salt: the same every time (the woods' own draws are left as
 * they were, so a wood's mix or heights changed never moves its other trees). */
const spotDraw = (p: P, salt: number) => {
  let n = Math.imul(Math.round(p.x * 10) ^ 0x5bd1e995, 0x2c1b3c6d) ^ Math.imul(Math.round(p.y * 10) + salt * 7919, 0x297a2d39);
  n = Math.imul(n ^ (n >>> 15), 0x85ebca6b);
  n = Math.imul(n ^ (n >>> 13), 0xc2b2ae35);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
};

/** Trees about every `spacing` feet inside the outline, standing on the ground. */
export const createWoods = (outline: P[], groundAt: (x: number, y: number) => number, color: string, conifers = 0.22, mix: string[] = [], keepOut: (p: P, reach: number) => boolean = () => false, spacing = 22, fill: WoodsFill = {}) => {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of outline) { minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y); }
  return createWoodsWhere(outline.length >= 3 ? { minX, minY, maxX, maxY } : null, p => pointInPolygon(p, outline), groundAt, color, fill.pines ?? conifers, mix, keepOut, spacing, fill);
};

/** Trees about every `spacing` feet wherever `inside` says, within the bounds, standing on the ground. */
export const createWoodsWhere = (bounds: { minX: number; minY: number; maxX: number; maxY: number } | null, inside: (p: P) => boolean, groundAt: (x: number, y: number) => number, color: string, conifers = 0.22, mix: string[] = [], keepOut: (p: P, reach: number) => boolean = () => false, spacing = 22, fill: WoodsFill = {}) => {
  const spots: TreeSpot[] = [];
  if (bounds) {
    const { minX, minY, maxX, maxY } = bounds;
    const area = (maxX - minX) * (maxY - minY);
    const step = Math.max(spacing, Math.sqrt(area / MAX_TREES));
    let seed = Math.round(Math.abs(minX * 13 + minY * 7)) % 2147483646 + 1;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let y = minY; y <= maxY; y += step * 0.87) {
      for (let x = minX + ((Math.round((y - minY) / step) % 2) * step) / 2; x <= maxX; x += step) {
        const p = { x: x + (rnd() - 0.5) * step * 0.7, y: y + (rnd() - 0.5) * step * 0.7 };
        if (!inside(p)) continue;
        const u = rnd();
        // (a bush, for its share of the spots: a draw of its own)
        const bush = (fill.bushes ?? 0) > 0 && spotDraw(p, 1) < (fill.bushes ?? 0);
        const shape = bush ? "bush" : u < conifers ? "conifer" : "broadleaf";
        // Now and then a smaller tree under the big ones
        const small = rnd() < 0.18;
        let height = small ? 16 + rnd() * 12 : shape === "conifer" ? 45 + rnd() * 35 : 38 + rnd() * 34;
        // (heights asked for: the same spread of sizes within them; a bush its own few feet)
        if (fill.heights && !bush) { const [lo, hi] = fill.heights, t = Math.min(1, Math.max(0, (height - 16) / 64)); height = lo + (hi - lo) * t; }
        if (bush) height = 3 + spotDraw(p, 2) * 6;
        const width = bush ? height * (1.2 + spotDraw(p, 3) * 0.6) : (shape === "conifer" ? height * 0.42 : Math.max(step * 1.25, height * 0.62)) * (0.8 + rnd() * 0.4) * (small ? 0.7 : 1);
        const tree: TreeSpot = {
          ...p,
          ground: 0,
          height,
          width,
          shape,
          variant: Math.floor(rnd() * VARIANTS[shape]),
          // (conifers darker and bluer than the broadleaf trees)
          tint: shape === "conifer" ? foliageTint(color, rnd).offsetHSL(0.03, -0.06, -0.08) : foliageTint(mix.length ? mix[Math.floor(rnd() * mix.length)] : color, rnd),
          turn: rnd() * Math.PI * 2,
          lean: (rnd() - 0.5) * 0.06
        };
        // None on the fairways, water, paths, tees and baskets (crowns may lean over the edges).
        // (Every draw above is made either way, so clearing one spot leaves the other trees be.)
        if (keepOut(p, width * 0.3)) continue;
        tree.ground = groundAt(p.x, p.y);
        spots.push(tree);
      }
    }
  }
  const forest = new Forest(spots);
  forest.group.name = "woods";
  forest.group.userData.forest = forest;
  // (where each tree stands and how big it is: flyovers keep clear of them)
  forest.group.userData.spots = spots;
  return forest.group;
};

/** Trees measured from the air, each where it stands, as tall and as wide as measured. */
export const createMeasuredWoods = (trees: { tree: LidarTree; index: number }[], groundAt: (x: number, y: number) => number, color: string, mix: string[] = []) => {
  const spots: TreeSpot[] = trees.map(({ tree: [x, y, height, radius, conifer], index }) => {
    // (each its own look, the same every time it's drawn)
    let seed = (index * 7919 + 13) % 2147483646 + 1;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const shape = conifer ? "conifer" : "broadleaf";
    return {
      x, y,
      ground: groundAt(x, y),
      height,
      width: radius * 2,
      shape,
      variant: Math.floor(rnd() * VARIANTS[shape]),
      tint: conifer ? foliageTint(color, rnd).offsetHSL(0.03, -0.06, -0.08) : foliageTint(mix.length ? mix[Math.floor(rnd() * mix.length)] : color, rnd),
      turn: rnd() * Math.PI * 2,
      lean: (rnd() - 0.5) * 0.06
    };
  });
  const forest = new Forest(spots);
  forest.group.name = "woods";
  forest.group.userData.forest = forest;
  forest.group.userData.spots = spots;
  forest.group.userData.measured = true;
  forest.group.userData.indexes = trees.map(t => t.index);
  return forest.group;
};

/** How far apart the underbrush grows, ft, how big its bushes, how much of them are the twiggy
 * airy ones, and how far off it is drawn (light, medium, heavy: a thicket you can't see into). */
const BRUSH = {
  light: { spacing: 22, height: [2, 4.5], width: [1.1, 1.8], airy: 0.15, reach: 360, size: 0.8 },
  medium: { spacing: 12, height: [2.5, 6], width: [1.2, 2], airy: 0.25, reach: 320, size: 1 },
  heavy: { spacing: 6.5, height: [3.5, 8.5], width: [1.4, 2.4], airy: 0.4, reach: 240, size: 1.2 }
} as const;
type BrushLevel = keyof typeof BRUSH;

/** What grows in underbrush: bushes, thicket shrubs, briars, weeds. */
type Growth = "shrub" | "thicket" | "briars" | "weeds";
/** How much of each growth a kind of underbrush has, out in the light at the wood's edge (`sun`
 * 1) and deep in the shade (0): weeds and briars want light, shrubs and thickets stand shade. */
const SHARES: Record<BrushKind, (sun: number) => Record<Growth, number>> = {
  mixed: sun => ({ shrub: 0.3, thicket: 0.15 + 0.15 * (1 - sun), briars: 0.25 + 0.15 * sun, weeds: 0.04 + 0.26 * sun }),
  thicket: sun => ({ shrub: 0.25, thicket: 0.6, briars: 0.06 + 0.06 * sun, weeds: 0.02 + 0.05 * sun }),
  briars: sun => ({ shrub: 0.1, thicket: 0.05, briars: 0.7, weeds: 0.05 + 0.15 * sun }),
  weeds: sun => ({ shrub: 0.08, thicket: 0, briars: 0.1 + 0.07 * sun, weeds: 0.75 })
};
const pickGrowth = (shares: Record<Growth, number>, draw: number): Growth => {
  const total = shares.shrub + shares.thicket + shares.briars + shares.weeds;
  let d = draw * total;
  for (const g of ["shrub", "thicket", "briars", "weeds"] as const) { d -= shares[g]; if (d <= 0) return g; }
  return "shrub";
};

/** How far a point is from an outline's edge, inside or out. */
const edgeDistance = (p: P, poly: P[]) => {
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) best = Math.min(best, nearestOnSegment(p, poly[i], poly[(i + 1) % poly.length]).distance);
  return best;
};

/** How deep into a wood the light reaches for underbrush, ft (past it, the edge's extra fades out). */
const EDGE_DEPTH = 45;

/** Underbrush in a wood, about every `spacing` feet (closer the heavier), kept off what `keepOut`
 * says: bushes, thicket shrubs, briars and weeds as its kind has them (weeds and briars out
 * where the light reaches, along the edge), and now and then a young tree. */
export const createUnderbrush = (outline: P[], groundAt: (x: number, y: number) => number, color: string, mix: string[], keepOut: (p: P, reach: number) => boolean, level: BrushLevel, edge = 0.6, wood: P[] = outline, kind: BrushKind = "mixed") => {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of outline) { minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y); }
  const spots: TreeSpot[] = [];
  const b = BRUSH[level];
  const step = Math.max(b.spacing, Math.sqrt(((maxX - minX) * (maxY - minY)) / MAX_TREES));
  const range = (d: number, [lo, hi]: readonly [number, number]) => lo + d * (hi - lo);
  if (outline.length >= 3) {
    for (let y = minY; y <= maxY; y += step * 0.87) {
      for (let x = minX + ((Math.round((y - minY) / step) % 2) * step) / 2; x <= maxX; x += step) {
        const p = { x: x + (spotDraw({ x, y }, 11) - 0.5) * step * 0.9, y: y + (spotDraw({ x, y }, 12) - 0.5) * step * 0.9 };
        if (!pointInPolygon(p, outline)) continue;
        // (thickest along the wood's edge, where the light gets in; thinner deep inside)
        const sun = Math.exp(-edgeDistance(p, wood) / EDGE_DEPTH);
        if (edge > 0 && spotDraw(p, 24) > 1 - edge * (1 - sun)) continue;
        const young = spotDraw(p, 13) < (level === "heavy" || kind !== "mixed" ? 0.08 : 0.14);
        const growth = young ? null : pickGrowth(SHARES[kind](sun), spotDraw(p, 26));
        const dh = spotDraw(p, 15), dw = spotDraw(p, 17), dv = spotDraw(p, 20);
        let height: number, width: number, variant: number;
        if (!growth) {
          // a young oak or ash
          height = 7 + spotDraw(p, 14) * 9;
          width = height * (0.45 + spotDraw(p, 16) * 0.2);
          variant = 4 + Math.floor(spotDraw(p, 19) * 2);
        } else if (growth === "thicket") {
          // laurel and rhododendron: taller and wider than the bushes, packed
          height = range(dh, b.height) * 1.3;
          width = height * range(dw, [1.2, 1.8]);
          variant = BRUSH_VARIANTS.thicket[Math.floor(dv * 2)];
        } else if (growth === "briars") {
          // briars: chest- to head-high tangles of arching canes, wide, running into each other
          height = range(dh, [3.5, 7]) * b.size;
          width = height * range(dw, [1.5, 2.3]);
          variant = BRUSH_VARIANTS.briars[Math.floor(dv * 2)];
        } else if (growth === "weeds") {
          // weeds: upright stalks, narrow
          height = range(dh, [2.5, 5]) * b.size;
          width = height * range(dw, [0.6, 1]);
          variant = BRUSH_VARIANTS.weeds[Math.floor(dv * 2)];
        } else {
          // bushes: the round and dense ones, and the twiggy airy ones, more of those the heavier
          height = range(dh, b.height);
          width = height * range(dw, b.width);
          variant = spotDraw(p, 25) < b.airy ? 4 + Math.floor(dv * 2) : Math.floor(dv * 4);
        }
        if (keepOut(p, width * 0.4)) continue;
        const r = () => spotDraw(p, 18 + spots.length % 7);
        const tint = foliageTint(mix.length ? mix[Math.floor(spotDraw(p, 21) * mix.length)] : color, r);
        // (briars a cooler, deeper green; weeds a yellower one)
        if (growth === "briars") tint.offsetHSL(0.025, 0.06, -0.04);
        else if (growth === "weeds") tint.offsetHSL(-0.035, 0.04, 0.03);
        spots.push({
          ...p,
          ground: groundAt(p.x, p.y),
          height,
          width,
          shape: growth ? "bush" : "broadleaf",
          variant,
          tint,
          turn: spotDraw(p, 22) * Math.PI * 2,
          lean: (spotDraw(p, 23) - 0.5) * (growth === "weeds" ? 0.2 : 0.08)
        });
      }
    }
  }
  // (lighter versions than trees get: the middle one close by, the lightest beyond)
  const forest = new Forest(spots, b.reach, { levels: ["mid", "far", "brush"], nearFt: 45, midFt: 110 });
  forest.group.name = "woods";
  forest.group.userData.forest = forest;
  forest.group.userData.spots = spots;
  forest.group.userData.underbrush = true;
  return forest.group;
};
