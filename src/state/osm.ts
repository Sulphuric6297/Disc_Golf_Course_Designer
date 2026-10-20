// Looking up OpenStreetMap again for the site already brought in (its servers are often busy, so
// the import may have come without paths, roads and water): what came from it before is replaced,
// and Undo brings that back.
import { OSM_UNREACHABLE, osmItems } from "../lib/importSite";
import { changeDoc, getDoc } from "./course";
import { toast } from "./toast";

let busy = false;

export const refreshOsm = async () => {
  const d = getDoc();
  if (!d.site.bounds || busy) return;
  busy = true;
  toast("Looking up paths, roads and water on OpenStreetMap…", "info", false, undefined, 4000);
  try {
    const { items, summary } = await osmItems(d.site.bounds, d.canvas.width, d.canvas.height);
    changeDoc(doc => ({ items: [...doc.items.filter(i => !((i.type === "area" || i.type === "line") && i.importSource === "osm")), ...items] }));
    toast(summary ? `From OpenStreetMap: ${summary}.` : "OpenStreetMap has no paths, roads or water mapped here.", "success", false, undefined, 8000);
  } catch (err) {
    console.warn("OpenStreetMap lookup failed", err);
    osmFailedToast();
  } finally {
    busy = false;
  }
};

/** OpenStreetMap couldn't be reached: said plainly, with Try again. */
export const osmFailedToast = () => toast(OSM_UNREACHABLE, "error", false, { label: "Try again", run: () => void refreshOsm() }, 30000);
