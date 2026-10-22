// Measuring the trees and the ground from the air (LiDAR) for the site already brought in: the
// trees measured before (and any kept or taken out) are replaced, the ground too; Undo brings them back.
import { fetchLidar } from "../lib/geo/lidarFetch";
import { groundOnGrid } from "../lib/lidar";
import { pointInPolygon } from "../lib/geom";
import type { P } from "../types";
import { changeDoc, getDoc, useEditor } from "./course";
import { toast } from "./toast";

export const measureLidar = async () => {
  const d = getDoc();
  if (!d.site.bounds || useEditor.getState().lidarBusy !== null) return;
  const busy = (f: number | null) => useEditor.getState().set({ lidarBusy: f });
  busy(0);
  try {
    const got = await fetchLidar({ ...d.site.bounds, width: d.canvas.width, height: d.canvas.height }, f => busy(f));
    if (!got) {
      toast("No LiDAR survey covers this site.", "info", false, undefined, 8000);
      return;
    }
    const g = groundOnGrid(got.measured, d.canvas.width, d.canvas.height, d.gridSize);
    changeDoc(doc => ({
      lidar: { source: got.source, trees: got.trees },
      terrainHeights: g.heights,
      site: { ...doc.site, baseElevationFt: Math.round(g.min * 10) / 10, elevationSource: got.source }
    }));
    toast(`${got.trees.length.toLocaleString()} trees measured from the air (${got.source}).`, "success", false, undefined, 8000);
  } catch (err) {
    console.warn("LiDAR failed", err);
    toast("Couldn't read the LiDAR survey.", "error", false, { label: "Try again", run: () => void measureLidar() }, 20000);
  } finally {
    busy(null);
  }
};

/** The measured trees inside a drawn outline: cut down, or brought back (kept standing, even on a
 * fairway). One undo step. */
export const lassoTrees = (outline: P[], how: "cut" | "keep") => {
  const lidar = getDoc().lidar;
  if (!lidar || outline.length < 3) return;
  const inside = lidar.trees.map((t, k) => (pointInPolygon({ x: t[0], y: t[1] }, outline) ? k : -1)).filter(k => k >= 0);
  if (!inside.length) { toast("No measured trees in there.", "info"); return; }
  const set = new Set(inside);
  const removed = (lidar.removed ?? []).filter(k => !set.has(k)), kept = (lidar.kept ?? []).filter(k => !set.has(k));
  changeDoc(d => ({ lidar: { ...d.lidar!, removed: how === "cut" ? [...removed, ...inside] : removed, kept: how === "keep" ? [...kept, ...inside] : kept } }));
  toast(`${inside.length.toLocaleString()} tree${inside.length === 1 ? "" : "s"} ${how === "cut" ? "cut down" : "brought back"}.`, "success");
};
