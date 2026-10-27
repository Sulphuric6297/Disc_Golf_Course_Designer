// Looking up OpenStreetMap again for the site already brought in (its servers are often busy, so
// the import may have come without paths, roads, water and buildings): what came from it before
// is replaced, unless it was changed by hand since, and Undo brings it back. As on the import,
// OpenStreetMap's woods give way to the stands of measured trees.
import { create } from "zustand";
import { OSM_ASKING, OSM_NOTHING, OSM_UNREACHABLE, freshOnly, fromMaps, osmItems } from "../lib/importSite";
import { changeDoc, getDoc } from "./course";
import { toast } from "./toast";

/** A lookup under way (the Site step's button shows it). */
export const useOsm = create<{ busy: boolean }>(() => ({ busy: false }));

export const refreshOsm = async () => {
  const d = getDoc();
  if (!d.site.bounds || useOsm.getState().busy) return;
  useOsm.setState({ busy: true });
  toast(OSM_ASKING, "info", false, undefined, 4000);
  try {
    // (a fresh answer: one kept from the map tiles is asked of Overpass again, for its fuller one)
    const { items, summary } = await osmItems(d.site.bounds, d.canvas.width, d.canvas.height, { fresh: true });
    changeDoc(doc => {
      // (with measured trees: OpenStreetMap's woods, drawn by hand and often over a whole hillside,
      // aren't brought back over them; nor its trees)
      const measured = !!doc.lidar?.trees.length;
      const kept = doc.items.filter(i => !fromMaps(i));
      const fresh = freshOnly(kept, items.filter(i => !(measured && i.type === "area" && i.kind === "woods") && !(measured && i.type === "tree" && i.treeType !== "bush")));
      return { items: [...kept, ...fresh], site: { ...doc.site, osmFailed: undefined } };
    });
    toast(summary ? `From OpenStreetMap: ${summary}.` : OSM_NOTHING, "success", true, undefined, 8000);
  } catch (err) {
    console.warn("OpenStreetMap lookup failed", err);
    // (remembered: the Site step says so until a lookup gets through)
    changeDoc(doc => ({ site: { ...doc.site, osmFailed: true } }), false);
    osmFailedToast();
  } finally {
    useOsm.setState({ busy: false });
  }
};

/** OpenStreetMap couldn't be reached: said plainly, with Try again. */
export const osmFailedToast = () => toast(OSM_UNREACHABLE, "error", false, { label: "Try again", run: () => void refreshOsm() }, 30000);
