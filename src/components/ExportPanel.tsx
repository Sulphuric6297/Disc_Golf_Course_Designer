// The Export step: printable maps, tee signs, scorecards and hole sheets, GPS and data files, the
// parts list, and the share link.
import { useState, type ReactNode } from "react";
import { Box, FileDown, FileJson, Image as ImageIcon, Loader2, Map as MapIcon, Share2 } from "lucide-react";
import JSZip from "jszip";
import { PAPER, renderPoster } from "../lib/mapSvg";
import { SIGN_SIZES, renderScorecard, renderTeeSign, type SignSize } from "../lib/teeSign";
import { holesCsv, partsCsv, partsList, stakeOutCsv, toGPX, toGeoJSON, toKML } from "../lib/exports";
import { canvasBlob, pdfFromPages, pngUnder, svgToCanvas } from "../lib/raster";
import { holeStats } from "../lib/holeStats";
import { changeDoc, getDoc, useCourse, useEditor } from "../state/course";
import { download, fileName, saveCourseFile } from "../state/files";
import { toast } from "../state/toast";
import type { CourseRules, PaperSize } from "../types";
import { getView } from "./MapViewport";
import { reliefOf } from "./useRelief";
import { canopyFor } from "../lib/forest";
import { setStyle } from "./DesignPanel";
import { Button, Field, Section } from "./ui";

const svgBlob = (svg: string) => new Blob([svg], { type: "image/svg+xml" });

export function ExportPanel() {
  const doc = useCourse(s => s.doc);
  const [busy, setBusy] = useState<string | null>(null);
  const [signSize, setSignSize] = useState<SignSize>("18x12");
  const geo = !!doc.site.bounds;
  const complete = doc.holes.filter(h => holeStats(doc, h).complete);

  /** Contours, hill shading and (Forest style) the photo's canopy, for drawing a page. */
  const art = async (d: typeof doc) => ({ ...reliefOf(d), canopy: await canopyFor(d) });
  const run = (label: string, fn: () => Promise<void> | void) => async () => {
    setBusy(label);
    try {
      await fn();
    } catch (err) {
      console.error(err);
      toast(err instanceof Error ? err.message : "That export failed.", "error");
    } finally {
      setBusy(null);
    }
  };

  const mapPdf = run("Course map PDF", async () => {
    const d = getDoc();
    const p = renderPoster(d, await art(d));
    const dpi = p.page.w * p.page.h > 300 ? 120 : 200;
    download(await pdfFromPages([{ canvas: await svgToCanvas(p.svg, p.width, p.height, dpi), widthPt: p.width, heightPt: p.height }]), fileName(d, "-map.pdf"));
  });
  const mapPng = run("Course map PNG", async () => {
    const d = getDoc();
    const p = renderPoster(d, await art(d));
    download(await canvasBlob(await svgToCanvas(p.svg, p.width, p.height, 150)), fileName(d, "-map.png"));
  });
  const mapSvg = run("Course map SVG", async () => {
    const d = getDoc();
    download(svgBlob(renderPoster(d, await art(d)).svg), fileName(d, "-map.svg"));
  });
  const signsPdf = run("Tee signs PDF", async () => {
    const d = getDoc();
    const relief = await art(d);
    const pages = [];
    for (const h of d.holes) {
      const s = renderTeeSign(d, h.id, signSize, relief);
      if (!s) continue;
      setBusy(`Tee sign ${pages.length + 1} of ${d.holes.length}…`);
      pages.push({ canvas: await svgToCanvas(s.svg, s.width, s.height, signSize === "18x24" ? 100 : 130), widthPt: s.width, heightPt: s.height });
    }
    download(await pdfFromPages(pages), fileName(d, signSize === "letter" || signSize === "a4" ? "-hole-sheets.pdf" : "-tee-signs.pdf"));
  });
  const signsZip = run("Tee sign pictures", async () => {
    const d = getDoc();
    const relief = await art(d);
    const zip = new JSZip();
    for (let i = 0; i < d.holes.length; i++) {
      const s = renderTeeSign(d, d.holes[i].id, signSize, relief);
      if (!s) continue;
      setBusy(`Tee sign ${i + 1} of ${d.holes.length}…`);
      // UDisc takes tee sign pictures up to 5 MB
      zip.file(`hole-${String(i + 1).padStart(2, "0")}.png`, await pngUnder(s.svg, s.width, s.height, 4.8 * 1024 * 1024, 120));
      zip.file(`hole-${String(i + 1).padStart(2, "0")}.svg`, s.svg);
    }
    download(await zip.generateAsync({ type: "blob" }), fileName(d, "-tee-signs.zip"));
  });
  const scorecardPdf = run("Scorecard PDF", async () => {
    const d = getDoc();
    const s = renderScorecard(d);
    download(await pdfFromPages([{ canvas: await svgToCanvas(s.svg, s.width, s.height, 200), widthPt: s.width, heightPt: s.height }]), fileName(d, "-scorecard.pdf"));
  });
  const snapshot = run("3D picture", async () => {
    const url = getView()?.capture();
    if (!url) return;
    download(await (await fetch(url)).blob(), fileName(getDoc(), "-3d.png"));
  });
  const text = (content: () => string, suffix: string, type: string) => run(suffix, () => download(new Blob([content()], { type }), fileName(getDoc(), suffix)));

  const parts = partsList(doc);
  const setPrice = (key: keyof CourseRules["prices"], v: number) => changeDoc(d => ({ rules: { ...d.rules, prices: { ...d.rules.prices, [key]: v } } }));

  const Row = ({ icon, title, text: blurb, children }: { icon: ReactNode; title: string; text: string; children: ReactNode }) => (
    <div className="mb-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-zinc-100">{icon}{title}</div>
      <div className="text-[11px] text-zinc-400 mb-1.5">{blurb}</div>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
  const nothing = !complete.length;
  return (
    <>
      {busy && (
        <div className="mx-4 mt-2 flex items-center gap-2 text-sm text-orange-200 bg-orange-500/10 border border-orange-500/30 rounded-lg px-3 py-2" data-testid="export-busy">
          <Loader2 size={15} className="animate-spin" /> {busy}
        </div>
      )}
      <Section title="Share">
        <Button tone="primary" full onClick={() => useEditor.getState().set({ shareOpen: true })} testid="export-share"><Share2 size={15} /> Get a share link</Button>
        <p className="text-[11px] text-zinc-500 mt-1.5">Anyone with the link can explore the course and make their own copy.</p>
      </Section>
      <Section title="Print">
        <Row icon={<MapIcon size={15} className="text-orange-300" />} title="Course map" text="The whole course in the style from the Design step. Info boards are often 18 × 24 in.">
          <select aria-label="Map paper" className="bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1 text-xs" value={doc.style.paper} onChange={e => setStyle({ paper: e.target.value as PaperSize })}>
            {(Object.keys(PAPER) as PaperSize[]).map(p => <option key={p} value={p}>{PAPER[p].label}</option>)}
          </select>
          <Button small onClick={mapPdf} disabled={!!busy} testid="export-map-pdf"><FileDown size={13} /> PDF</Button>
          <Button small onClick={mapPng} disabled={!!busy} testid="export-map-png"><ImageIcon size={13} /> PNG</Button>
          <Button small onClick={mapSvg} disabled={!!busy} testid="export-map-svg">SVG</Button>
        </Row>
        <Row icon={<FileDown size={15} className="text-orange-300" />} title="Tee signs and hole sheets" text="One page per hole: number, par, distance from each tee, the hole map (tee at the bottom), elevation, rules and the way to the next tee.">
          <select aria-label="Tee sign size" className="bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1 text-xs" value={signSize} onChange={e => setSignSize(e.target.value as SignSize)}>
            {(Object.keys(SIGN_SIZES) as SignSize[]).map(p => <option key={p} value={p}>{SIGN_SIZES[p].label}</option>)}
          </select>
          <Button small onClick={signsPdf} disabled={!!busy || nothing} testid="export-signs-pdf"><FileDown size={13} /> PDF</Button>
          <Button small onClick={signsZip} disabled={!!busy || nothing} testid="export-signs-zip" title="PNG pictures under 5 MB each (UDisc tee sign uploads), plus SVG"><ImageIcon size={13} /> Pictures (ZIP)</Button>
        </Row>
        <Row icon={<FileDown size={15} className="text-orange-300" />} title="Scorecard" text="Par and length for each layout, totals, rows for five players.">
          <Button small onClick={scorecardPdf} disabled={!!busy || nothing} testid="export-scorecard"><FileDown size={13} /> PDF</Button>
          <Button small onClick={run("Scorecard SVG", () => download(svgBlob(renderScorecard(getDoc()).svg), fileName(getDoc(), "-scorecard.svg")))} disabled={!!busy || nothing}>SVG</Button>
        </Row>
        <Row icon={<Box size={15} className="text-orange-300" />} title="3D picture" text="The map view as it is now (tilt it with 3).">
          <Button small onClick={snapshot} disabled={!!busy} testid="export-3d"><ImageIcon size={13} /> PNG</Button>
        </Row>
      </Section>
      <Section title="GPS and data">
        {!geo && <p className="text-[11px] text-amber-300 mb-2">GPS files need a real site: bring in your park on the Site step.</p>}
        <Row icon={<FileJson size={15} className="text-sky-300" />} title="GPS files" text="Tees, baskets, mandos, drop zones, OB and throw lines with real coordinates. KML opens in Google Earth; GPX waypoints help find each spot with a phone.">
          <Button small onClick={text(() => toKML(getDoc()), ".kml", "application/vnd.google-earth.kml+xml")} disabled={!!busy || !geo} testid="export-kml">KML</Button>
          <Button small onClick={text(() => toGeoJSON(getDoc()), ".geojson", "application/geo+json")} disabled={!!busy || !geo} testid="export-geojson">GeoJSON</Button>
          <Button small onClick={text(() => toGPX(getDoc()), ".gpx", "application/gpx+xml")} disabled={!!busy || !geo} testid="export-gpx">GPX</Button>
        </Row>
        <Row icon={<FileJson size={15} className="text-sky-300" />} title="Spreadsheets" text="The hole list (par, lengths, elevations, coordinates for each layout) and the stake-out list for installing it.">
          <Button small onClick={text(() => holesCsv(getDoc()), "-holes.csv", "text/csv")} disabled={!!busy || nothing} testid="export-holes-csv">Holes CSV</Button>
          <Button small onClick={text(() => stakeOutCsv(getDoc()), "-stake-out.csv", "text/csv")} disabled={!!busy || nothing} testid="export-stakeout">Stake-out CSV</Button>
        </Row>
        <Row icon={<FileJson size={15} className="text-sky-300" />} title="Course file" text="Everything, photo and elevation included, to open again here or send to someone.">
          <Button small onClick={saveCourseFile} disabled={!!busy} testid="export-file">Save .dgcourse.json</Button>
        </Row>
      </Section>
      <Section title="Parts list and budget" testid="parts">
        {parts.lines.length === 0 ? <p className="text-xs text-zinc-400">Add holes to see what to buy.</p> : (
          <>
            <table className="w-full text-xs text-zinc-300 tabular-nums">
              <tbody>
                {parts.lines.map(l => (
                  <tr key={l.item} title={l.note}>
                    <td className="py-0.5">{l.item}</td>
                    <td className="text-right">{l.qty}</td>
                    <td className="text-right text-zinc-400">× ${l.unitPrice}</td>
                    <td className="text-right font-semibold text-zinc-100">${l.total.toLocaleString()}</td>
                  </tr>
                ))}
                <tr className="border-t border-zinc-700"><td className="pt-1 font-bold text-zinc-100" colSpan={3}>Estimate</td><td className="text-right pt-1 font-bold text-zinc-50" data-testid="parts-total">${parts.total.toLocaleString()}</td></tr>
              </tbody>
            </table>
            <p className="text-[11px] text-zinc-500 mt-1">Concrete for the pads: {parts.concreteYd3.toFixed(1)} cu yd (4 in slabs). Course design budgets usually run $350–$1,000 per hole (PDGA).</p>
            <details className="mt-2">
              <summary className="text-xs text-orange-300 cursor-pointer">Change prices</summary>
              <div className="grid grid-cols-2 gap-2 mt-2">
                {(Object.keys(doc.rules.prices) as (keyof CourseRules["prices"])[]).map(k => (
                  <Field key={k} label={k === "teePad" ? "Tee pad" : k[0].toUpperCase() + k.slice(1)}>
                    <input aria-label={`Price ${k}`} type="number" className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs" value={doc.rules.prices[k]} onChange={e => setPrice(k, Math.max(0, parseFloat(e.target.value) || 0))} />
                  </Field>
                ))}
              </div>
            </details>
            <div className="mt-2"><Button small onClick={text(() => partsCsv(getDoc()), "-parts.csv", "text/csv")} disabled={!!busy} testid="export-parts">Parts list CSV</Button></div>
          </>
        )}
      </Section>
      {useEditor.getState().viewOnly && <p className="px-4 pb-4 text-[11px] text-zinc-500">You can export a shared course too.</p>}
    </>
  );
}
