// A viewer's downloads, as far as they may have them: GPS files, the course map, the scorecard.
import { useState } from "react";
import { Download } from "lucide-react";
import { canopyFor } from "../lib/forest";
import { toGPX, toKML } from "../lib/exports";
import { paintedForPrint, renderPoster } from "../lib/mapSvg";
import { canvasBlob, printDpi, svgToCanvas } from "../lib/raster";
import { renderScorecard } from "../lib/teeSign";
import { reliefOf } from "../components/useRelief";
import { Section } from "../components/ui";
import { getDoc } from "../state/course";
import { download, fileName } from "../state/files";
import { useAllowed } from "./perms";

export function Downloads() {
  const files = useAllowed("downloads"), map = useAllowed("printedMap"), card = useAllowed("scorecard");
  const [busy, setBusy] = useState("");
  if (!files) return null;
  const go = (what: string, fn: () => Promise<void> | void) => async () => { setBusy(what); try { await fn(); } finally { setBusy(""); } };
  const btn = "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold bg-white/[0.07] hover:bg-white/[0.13] text-zinc-100 border border-white/[0.12] disabled:opacity-50";
  return (
    <Section title="Downloads" testid="downloads">
      <div className="flex flex-wrap gap-2">
        <button className={btn} disabled={!!busy} onClick={go("gpx", () => download(new Blob([toGPX(getDoc())], { type: "application/gpx+xml" }), fileName(getDoc(), ".gpx")))}><Download size={12} /> GPX</button>
        <button className={btn} disabled={!!busy} onClick={go("kml", () => download(new Blob([toKML(getDoc())], { type: "application/vnd.google-earth.kml+xml" }), fileName(getDoc(), ".kml")))}><Download size={12} /> KML</button>
        {map && (
          <button className={btn} disabled={!!busy} onClick={go("map", async () => {
            const d = getDoc();
            const art = { ...reliefOf(d), canopy: await canopyFor(d) };
            const p = await paintedForPrint(page => printDpi(page.width, page.height), () => renderPoster(d, art));
            download(await canvasBlob(await svgToCanvas(p.svg, p.width, p.height, printDpi(p.width, p.height))), fileName(d, "-map.png"));
          })}><Download size={12} /> {busy === "map" ? "Drawing…" : "Course map"}</button>
        )}
        {card && (
          <button className={btn} disabled={!!busy} onClick={go("card", async () => {
            const d = getDoc();
            const s = renderScorecard(d);
            download(await canvasBlob(await svgToCanvas(s.svg, s.width, s.height, 200)), fileName(d, "-scorecard.png"));
          })}><Download size={12} /> Scorecard</button>
        )}
      </div>
    </Section>
  );
}
