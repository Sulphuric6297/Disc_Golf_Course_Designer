// Measuring the trees and the ground from the air (LiDAR) for the site already brought in: the
// trees measured before (and any kept or taken out) are replaced, the ground too, and the import's
// last step follows (the stands of woods, the photo's trees and woods taken out where the survey
// has them); Undo brings it all back.
import { fetchLidar } from "../lib/geo/lidarFetch";
import { groundOnGrid } from "../lib/lidar";
import { withMeasuredTrees } from "../lib/importSite";
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
      // (remembered: the Site step says so, with Check again)
      changeDoc(doc => ({ site: { ...doc.site, noLidar: true, lidarFailed: undefined } }), false);
      toast("No aerial survey covers this site.", "info", false, undefined, 8000);
      return;
    }
    const g = groundOnGrid(got.measured, d.canvas.width, d.canvas.height, d.gridSize);
    changeDoc(doc => ({
      lidar: { source: got.source, trees: got.trees },
      terrainHeights: g.heights,
      terrainOriginal: undefined,
      items: withMeasuredTrees(doc.items, got.trees, doc.canvas.width, doc.canvas.height).items,
      site: { ...doc.site, baseElevationFt: Math.round(g.min * 10) / 10, elevationSource: got.source, noLidar: undefined, lidarFailed: undefined }
    }));
    toast(`${got.trees.length.toLocaleString()} trees measured from the air (${got.source}).`, "success", true, undefined, 8000);
  } catch (err) {
    console.warn("LiDAR failed", err);
    changeDoc(doc => ({ site: { ...doc.site, lidarFailed: true } }), false);
    toast("Couldn't read the aerial survey.", "error", false, { label: "Try again", run: () => void measureLidar() }, 20000);
  } finally {
    busy(null);
  }
};
