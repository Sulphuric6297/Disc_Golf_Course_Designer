// Woods in 3D: a drawn woods area filled with real-looking trees (see treeKit), drawn instanced
// so thousands stay quick: mostly broadleaf canopy trees with some conifers, a few smaller trees
// beneath them, each its own height, crown, lean and shade of green.
import type { P } from "../types";
import { pointInPolygon } from "../lib/geom";
import { Forest, VARIANTS, type TreeSpot } from "./treeKit";
import { foliageTint } from "./trees";

const MAX_TREES = 6000;

/** Trees about every `spacing` feet inside the outline, standing on the ground. */
export const createWoods = (outline: P[], groundAt: (x: number, y: number) => number, color: string, conifers = 0.22, mix: string[] = [], keepOut: (p: P, reach: number) => boolean = () => false, spacing = 22) => {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of outline) { minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y); }
  return createWoodsWhere(outline.length >= 3 ? { minX, minY, maxX, maxY } : null, p => pointInPolygon(p, outline), groundAt, color, conifers, mix, keepOut, spacing);
};

/** Trees about every `spacing` feet wherever `inside` says, within the bounds, standing on the ground. */
export const createWoodsWhere = (bounds: { minX: number; minY: number; maxX: number; maxY: number } | null, inside: (p: P) => boolean, groundAt: (x: number, y: number) => number, color: string, conifers = 0.22, mix: string[] = [], keepOut: (p: P, reach: number) => boolean = () => false, spacing = 22) => {
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
        const shape = u < conifers ? "conifer" : "broadleaf";
        // Now and then a smaller tree under the big ones
        const small = rnd() < 0.18;
        const height = small ? 16 + rnd() * 12 : shape === "conifer" ? 45 + rnd() * 35 : 38 + rnd() * 34;
        const width = (shape === "conifer" ? height * 0.42 : Math.max(step * 1.25, height * 0.62)) * (0.8 + rnd() * 0.4) * (small ? 0.7 : 1);
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
  return forest.group;
};
