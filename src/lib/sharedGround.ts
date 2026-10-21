// One ground for a park: a course takes another's terrain (and measured trees) where their sites
// overlap, by where both are on the earth (they can be framed differently); its own elsewhere.
// Its holes, OB and everything drawn stay as they are.
import { heightAt } from "./terrainGrid";
import type { CourseDoc, LidarTree, P, TreeItem } from "../types";

/** What comes across with the ground. */
export type GroundShare = { /** the measured trees */ trees: boolean; /** the trees planted by hand */ planted: boolean };

/** A plan point of course `to` on course `from`'s plan (by where both are on the earth). */
const across = (x: number, y: number, to: CourseDoc, from: CourseDoc): P | null => {
  const a = to.site.bounds, b = from.site.bounds;
  if (!a || !b) return null;
  const lon = a.west + (x / to.canvas.width) * (a.east - a.west), lat = a.north - (y / to.canvas.height) * (a.north - a.south);
  return { x: ((lon - b.west) / (b.east - b.west)) * from.canvas.width, y: ((b.north - lat) / (b.north - b.south)) * from.canvas.height };
};

/** The same trees in a new list: each of `picks` (indices into `was`) as the index of the tree
 * standing where it stood in `now`, within `reach` ft; those with none there are dropped. */
const samePlaces = (picks: number[] | undefined, was: LidarTree[], now: LidarTree[], reach = 3) => {
  if (!picks?.length) return undefined;
  const out: number[] = [];
  for (const k of picks) {
    const t = was[k];
    if (!t) continue;
    let best = -1, d = reach * reach;
    now.forEach((u, j) => { const dd = (u[0] - t[0]) ** 2 + (u[1] - t[1]) ** 2; if (dd < d) { d = dd; best = j; } });
    if (best >= 0) out.push(best);
  }
  return out.length ? out.sort((a, b) => a - b) : undefined;
};

/** Course `to` with `from`'s ground where they overlap (its own elsewhere), and `from`'s measured
 * trees on its ground if asked. Its holes, OB and everything drawn: as they are. So are its own
 * decisions about trees: the ones it cut down or kept stay so (found by where they stand), while
 * `from`'s cuts and keeps are its own and don't come across. A tree on one course's fairway is only
 * cleared there: each course clears its own fairways when drawn.
 *
 * The trees planted by hand come across too if asked (the same tree has the same id on both),
 * except the ones `to` already has and the ones it cut down after an earlier share: a tree
 * deleted off one course's fairway stands on the other. */
export function withGround(to: CourseDoc, from: CourseDoc, share: boolean | GroundShare): CourseDoc {
  const { trees, planted } = typeof share === "boolean" ? { trees: share, planted: false } : share;
  const g = to.gridSize || 20;
  const heights = { ...to.terrainHeights };
  const shift = (from.site.baseElevationFt ?? 0) - (to.site.baseElevationFt ?? 0);
  for (let y = 0; y <= to.canvas.height; y += g) for (let x = 0; x <= to.canvas.width; x += g) {
    const p = across(x, y, to, from);
    if (!p || p.x < 0 || p.y < 0 || p.x > from.canvas.width || p.y > from.canvas.height) continue;
    heights[`${x},${y}`] = Math.round((heightAt(from.terrainHeights, from.gridSize, p.x, p.y) + shift) * 100) / 100;
  }
  let lidar = to.lidar;
  if (trees && from.lidar?.trees.length) {
    // (the other way round: this course's points onto `to`'s plan)
    const moved: LidarTree[] = [];
    for (const t of from.lidar.trees) {
      const q = across(t[0], t[1], from, to);
      if (q && q.x >= 0 && q.y >= 0 && q.x <= to.canvas.width && q.y <= to.canvas.height) moved.push([Math.round(q.x * 10) / 10, Math.round(q.y * 10) / 10, t[2], t[3], t[4]]);
    }
    const own = to.lidar?.trees ?? [];
    lidar = {
      source: from.lidar.source, trees: moved,
      removed: samePlaces(to.lidar?.removed, own, moved), kept: samePlaces(to.lidar?.kept, own, moved),
      minHeight: to.lidar?.minHeight ?? from.lidar.minHeight, growYears: to.lidar?.growYears ?? from.lidar.growYears,
    };
  }
  let items = to.items, sharedTrees = to.site.sharedTrees;
  if (planted) {
    const have = new Set(to.items.map(i => i.id)), cleared = new Set((to.site.sharedTrees ?? []).filter(id => !have.has(id)));
    const added: TreeItem[] = [];
    for (const i of from.items) {
      if (i.type !== "tree" || have.has(i.id) || cleared.has(i.id)) continue;
      const q = across(i.x, i.y, from, to);
      if (q && q.x >= 0 && q.y >= 0 && q.x <= to.canvas.width && q.y <= to.canvas.height) added.push({ ...i, x: Math.round(q.x * 10) / 10, y: Math.round(q.y * 10) / 10 });
    }
    if (added.length) {
      items = [...to.items, ...added];
      sharedTrees = [...new Set([...(to.site.sharedTrees ?? []), ...added.map(i => i.id)])];
    }
  }
  return { ...to, items, terrainHeights: heights, lidar, site: { ...to.site, sharedTrees, elevationSource: from.site.elevationSource ?? to.site.elevationSource } };
}

