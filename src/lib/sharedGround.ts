// One ground for a park: a course takes another's terrain (and measured trees) where their sites
// overlap, by where both are on the earth (they can be framed differently); its own elsewhere.
// Its holes, OB and everything drawn stay as they are.
import { heightAt } from "./terrainGrid";
import type { CourseDoc, LidarTree, P } from "../types";

/** A plan point of course `to` on course `from`'s plan (by where both are on the earth). */
const across = (x: number, y: number, to: CourseDoc, from: CourseDoc): P | null => {
  const a = to.site.bounds, b = from.site.bounds;
  if (!a || !b) return null;
  const lon = a.west + (x / to.canvas.width) * (a.east - a.west), lat = a.north - (y / to.canvas.height) * (a.north - a.south);
  return { x: ((lon - b.west) / (b.east - b.west)) * from.canvas.width, y: ((b.north - lat) / (b.north - b.south)) * from.canvas.height };
};

/** Course `to` with `from`'s ground where they overlap (its own elsewhere), and `from`'s measured
 * trees on its ground if asked. Its holes, OB and everything drawn: as they are. */
export function withGround(to: CourseDoc, from: CourseDoc, trees: boolean): CourseDoc {
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
    lidar = { source: from.lidar.source, trees: moved, minHeight: from.lidar.minHeight, growYears: from.lidar.growYears };
  }
  return { ...to, terrainHeights: heights, lidar, site: { ...to.site, elevationSource: from.site.elevationSource ?? to.site.elevationSource } };
}

