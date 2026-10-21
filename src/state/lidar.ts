// Measuring the trees and the ground from the air (LiDAR) for the site already brought in: the
// trees measured before (and any kept or taken out) are replaced, the ground too; Undo brings them back.
import { fetchLidar } from "../lib/geo/lidarFetch";
import { groundOnGrid } from "../lib/lidar";
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
