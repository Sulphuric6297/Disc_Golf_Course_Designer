// The Export step: printable maps, tee signs, scorecards and hole sheets, hole-by-hole pages and
// GPS files, flyover videos, GPS and data files, and the parts list.
import { useState, type ReactNode } from "react";
import { Box, ChevronRight, Clapperboard, FileDown, FileJson, Image as ImageIcon, Link2, Map as MapIcon, Users } from "lucide-react";
import { SERVER, useAuth } from "../auth/api";
import { useServerCourse } from "../auth/courses";
import JSZip from "jszip";
import { PAPER, paintedForPrint, renderPoster } from "../lib/mapSvg";
import { SIGN_SIZES, renderScorecard, renderTeeSign, type SignSize } from "../lib/teeSign";
import { HOLE_PAGES, renderHolePage, type HolePageSize } from "../lib/holePage";
import { holeGeoJSON, holesCsv, partsCsv, partsList, stakeOutCsv, toGPX, toGeoJSON, toKML } from "../lib/exports";
import { canvasBlob, pdfFromPages, pdfPage, pngUnder, printDpi, svgToCanvas } from "../lib/raster";
import { courseStats, holeStats } from "../lib/holeStats";
import { holeLabel, holeNumber } from "../lib/course";
import { VIDEO_SIZES, VIDEO_HOLD, type VideoResolution } from "../lib/video";
import { autoSeconds, flightClock, flyoverOf, keySeconds } from "../lib/flight";
import { changeDoc, getDoc, useCourse } from "../state/course";
import { download, fileName, saveCourseFile } from "../state/files";
import { runExport, useExportJob, type JobControl } from "../state/exportJob";
import { recordVideo, useVideoSettings } from "../state/video";
import type { CourseDoc, CourseRules, PaperSize } from "../types";
import { getView } from "../state/view";
import { reliefOf } from "./useRelief";
import { canopyFor } from "../lib/forest";
import { setStyle } from "./DesignPanel";
import { ExportBanner, ProgressBar } from "./ExportProgress";
import { Button, Field, Section, Segmented } from "./ui";

const svgBlob = (svg: string) => new Blob([svg], { type: "image/svg+xml" });
const two = (i: number) => String(i).padStart(2, "0");
const selectCls = "bg-white/[0.07] rounded-lg px-2 py-1 text-xs";

/** Contours, hill shading and (Forest style) the photo's canopy, for drawing a page. */
const art = async (d: CourseDoc) => ({ ...reliefOf(d), canopy: await canopyFor(d) });

/** Holes with a tee and a basket, in the order of play. */
const playable = (d: CourseDoc) => {
  const stats = courseStats(d);
  return d.holes.filter((_, k) => stats[k].complete);
};

/** Seconds of video for the holes (each one's flight, by itself or through its keyframes). */
const videoSeconds = (d: CourseDoc, ids: string[]) =>
  ids.reduce((t, id) => {
    const h = d.holes.find(x => x.id === id);
    if (!h) return t;
    const set = flyoverOf(d, h);
    const keyed = !!h.flyKeys && h.flyKeys.length >= 2;
    const flight = keyed ? keySeconds(h.flyKeys!, set, () => 0).reduce((a, b) => a + b, 0) : autoSeconds(holeStats(d, h).length, set);
    // (as it plays: slowing to a stop at the end)
    return t + flightClock(flight, !keyed).play + VIDEO_HOLD.intro + VIDEO_HOLD.outro;
  }, 0);
const minSec = (s: number) => (s >= 60 ? `${Math.floor(s / 60)} min ${Math.round(s % 60)} s` : `${Math.round(s)} s`);

export function ExportPanel() {
  const doc = useCourse(s => s.doc);
  const job = useExportJob(s => s.job);
  const busy = !!job;
  // (the course's sizes: the ones the Map step shows)
  const signSize: SignSize = doc.style.signSize ?? "18x12";
  const setSignSize = (v: SignSize) => setStyle({ signSize: v });
  const [pagePick, setPagePick] = useState<string>("all");
  const pageSize: HolePageSize = doc.style.holePageSize ?? "letter";
  const setPageSize = (v: HolePageSize) => setStyle({ holePageSize: v });
  const [videoPick, setVideoPick] = useState<string>("all");
  const video = useVideoSettings();
  const geo = !!doc.site.bounds;
  const complete = playable(doc);
  const pageHole = complete.find(h => h.id === pagePick) ?? null;
  const videoHoles = videoPick === "all" ? complete.map(h => h.id) : complete.some(h => h.id === videoPick) ? [videoPick] : complete.map(h => h.id);

  const run = (label: string, fn: (job: JobControl) => Promise<void> | void) => () => void runExport(label, fn);

  // Prints at print resolution: 300 dpi, less on big posters (see printDpi), the map painted to match
  const poster = async (d: CourseDoc, job: JobControl) => {
    const a = await art(d);
    job.progress(null, "Painting the map");
    const p = await paintedForPrint(page => printDpi(page.width, page.height), () => renderPoster(d, a));
    return { p, dpi: printDpi(p.width, p.height) };
  };
  const mapPdf = run("Course map PDF", async job => {
    const d = getDoc();
    const { p, dpi } = await poster(d, job);
    job.progress(null, "Making the PDF");
    download(await pdfFromPages([await pdfPage(await svgToCanvas(p.svg, p.width, p.height, dpi), p.width, p.height)]), fileName(d, "-map.pdf"));
  });
  const mapPng = run("Course map PNG", async job => {
    const d = getDoc();
    const { p, dpi } = await poster(d, job);
    job.progress(null, "Making the picture");
    download(await canvasBlob(await svgToCanvas(p.svg, p.width, p.height, dpi)), fileName(d, "-map.png"));
  });
  const mapSvg = run("Course map SVG", async job => {
    const d = getDoc();
    download(svgBlob((await poster(d, job)).p.svg), fileName(d, "-map.svg"));
  });
  const signsPdf = run("Tee signs PDF", async job => {
    const d = getDoc();
    const relief = await art(d);
    const pages = [];
    for (const h of d.holes) {
      job.progress(pages.length / d.holes.length, `Tee sign ${pages.length + 1} of ${d.holes.length}`);
      const s = await paintedForPrint(page => (page ? printDpi(page.width, page.height) : 72), () => renderTeeSign(d, h.id, signSize, relief));
      if (!s) continue;
      const dpi = printDpi(s.width, s.height);
      pages.push(await pdfPage(await svgToCanvas(s.svg, s.width, s.height, dpi), s.width, s.height));
    }
    download(await pdfFromPages(pages), fileName(d, signSize === "letter" || signSize === "a4" ? "-hole-sheets.pdf" : "-tee-signs.pdf"));
  });
  const signsZip = run("Tee sign pictures", async job => {
    const d = getDoc();
    const relief = await art(d);
    const zip = new JSZip();
    for (let i = 0; i < d.holes.length; i++) {
      job.progress(i / d.holes.length, `Tee sign ${i + 1} of ${d.holes.length}`);
      const s = await paintedForPrint(150, () => renderTeeSign(d, d.holes[i].id, signSize, relief));
      if (!s) continue;
      // UDisc takes tee sign pictures up to 5 MB
      const no = two(holeNumber(d, d.holes[i].id));
      zip.file(`hole-${no}.png`, await pngUnder(s.svg, s.width, s.height, 4.8 * 1024 * 1024, 150));
      zip.file(`hole-${no}.svg`, s.svg);
    }
    download(await zip.generateAsync({ type: "blob" }), fileName(d, "-tee-signs.zip"));
  });
  const scorecardPdf = run("Scorecard PDF", async () => {
    const d = getDoc();
    const s = renderScorecard(d);
    download(await pdfFromPages([await pdfPage(await svgToCanvas(s.svg, s.width, s.height, 300), s.width, s.height)]), fileName(d, "-scorecard.pdf"));
  });
  const snapshot = run("3D picture", async () => {
    const url = getView()?.capture();
    if (!url) return;
    download(await (await fetch(url)).blob(), fileName(getDoc(), "-3d.png"));
  });
  const text = (content: () => string, suffix: string, type: string) => run(suffix, () => download(new Blob([content()], { type }), fileName(getDoc(), suffix)));

  // --- Hole by hole

  /** The holes picked for the hole pages (all of them, or one), as they are now. */
  const pickedPages = (d: CourseDoc) => (pagePick === "all" ? playable(d) : playable(d).filter(h => h.id === pagePick));
  const holeSuffix = (d: CourseDoc, id: string) => `-hole-${holeNumber(d, id)}`;
  const pagesPdf = run("Hole pages PDF", async job => {
    const d = getDoc();
    const holes = pickedPages(d);
    if (!holes.length) throw new Error("No hole to export yet.");
    const relief = await art(d);
    const pages = [];
    for (const [i, h] of holes.entries()) {
      job.progress(i / holes.length, `Hole page ${i + 1} of ${holes.length}`);
      const dpi = HOLE_PAGES[pageSize].dpi;
      const p = (await paintedForPrint(dpi, () => renderHolePage(d, h.id, pageSize, relief)))!;
      pages.push(await pdfPage(await svgToCanvas(p.svg, p.width, p.height, dpi), p.width, p.height));
    }
    download(await pdfFromPages(pages), fileName(d, holes.length === 1 ? `${holeSuffix(d, holes[0].id)}.pdf` : "-hole-pages.pdf"));
  });
  const pagesZip = run("Hole pictures", async job => {
    const d = getDoc();
    const holes = pickedPages(d);
    if (!holes.length) throw new Error("No hole to export yet.");
    const relief = await art(d);
    const zip = new JSZip();
    for (const [i, h] of holes.entries()) {
      job.progress(i / holes.length, `Hole picture ${i + 1} of ${holes.length}`);
      const p = (await paintedForPrint(HOLE_PAGES[pageSize].dpi, () => renderHolePage(d, h.id, pageSize, relief)))!;
      zip.file(`hole-${two(holeNumber(d, h.id))}.png`, await canvasBlob(await svgToCanvas(p.svg, p.width, p.height, HOLE_PAGES[pageSize].dpi)));
    }
    download(await zip.generateAsync({ type: "blob" }), fileName(d, "-hole-pages.zip"));
  });
  const onePage = async (d: CourseDoc) => {
    if (!pageHole) throw new Error("Pick a hole first.");
    const relief = await art(d);
    return (await paintedForPrint(HOLE_PAGES[pageSize].dpi, () => renderHolePage(d, pageHole.id, pageSize, relief)))!;
  };
  const pagePng = run("Hole picture", async () => {
    const d = getDoc();
    const p = await onePage(d);
    download(await canvasBlob(await svgToCanvas(p.svg, p.width, p.height, HOLE_PAGES[pageSize].dpi)), fileName(d, `${holeSuffix(d, pageHole!.id)}.png`));
  });
  const pageSvg = run("Hole SVG", async () => {
    const d = getDoc();
    download(svgBlob((await onePage(d)).svg), fileName(d, `${holeSuffix(d, pageHole!.id)}.svg`));
  });
  const pageGeo = run("Hole GeoJSON", () => {
    const d = getDoc();
    if (!pageHole) throw new Error("Pick a hole first.");
    download(new Blob([holeGeoJSON(d, pageHole.id)], { type: "application/geo+json" }), fileName(d, `${holeSuffix(d, pageHole.id)}.geojson`));
  });

  const parts = partsList(doc);
  const setPrice = (key: keyof CourseRules["prices"], v: number) => changeDoc(d => ({ rules: { ...d.rules, prices: { ...d.rules.prices, [key]: v } } }));

  // (a size or hole to pick on its own line, the formats in a row under it)
  const Row = ({ icon, title, pick, children }: { icon: ReactNode; title: string; pick?: ReactNode; children: ReactNode }) => (
    <div className="mb-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-zinc-100 mb-1.5">{icon}{title}</div>
      {pick && <div className="mb-1.5">{pick}</div>}
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
  const nothing = !complete.length;
  const recording = job?.kind === "video" ? job : null;
  // (only the owner makes public links: others share with people)
  const owner = useServerCourse(s => s.role) === "owner";
  const shares = ([["public", <Link2 key="l" size={16} />, "Public link", "A page anyone with the link can see"], ["people", <Users key="u" size={16} />, "People", "Who can see and edit the course"]] as const).filter(([t]) => owner || t === "people");
  return (
    <>
      <ExportBanner />
      {/* (why most of the buttons below are off) */}
      {nothing && <p className="mx-4 mb-2 rounded-[14px] bg-white/[0.06] px-3 py-2 text-[12.5px] text-zinc-300" data-testid="export-needs-hole">Signs, pages, the scorecard and videos need at least one hole with a tee and a basket.</p>}
      {SERVER && (
        <Section title="Share" testid="export-share">
          <div className="rounded-[16px] bg-white/[0.06] overflow-hidden">
            {shares.map(([t, icon, label, sub], i) => (
              <button key={t} data-testid={`export-share-${t}`} onClick={() => useAuth.getState().share(t)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 text-left ${i ? "border-t border-white/[0.07]" : ""}`}>
                <span className="w-7 h-7 rounded-[8px] bg-white/[0.1] flex items-center justify-center text-zinc-200">{icon}</span>
                <span className="flex-1 min-w-0"><span className="block text-[13.5px] text-zinc-100">{label}</span><span className="block text-[11.5px] text-zinc-400">{sub}</span></span>
                <ChevronRight size={15} className="text-zinc-500" />
              </button>
            ))}
          </div>
        </Section>
      )}
      <Section title="Print" help="print">
        <Row icon={<MapIcon size={15} className="text-orange-300" />} title="Course map" pick={
          <><span className="block text-[11px] text-zinc-500 mb-0.5">Paper size</span><select aria-label="Map paper" className={`${selectCls} w-full`} value={doc.style.paper} onChange={e => setStyle({ paper: e.target.value as PaperSize })}>
            {(Object.keys(PAPER) as PaperSize[]).map(p => <option key={p} value={p}>{PAPER[p].label}</option>)}
          </select></>
        }>
          <Button small onClick={mapPdf} disabled={busy} testid="export-map-pdf"><FileDown size={13} /> PDF</Button>
          <Button small onClick={mapPng} disabled={busy} testid="export-map-png"><ImageIcon size={13} /> PNG</Button>
          <Button small onClick={mapSvg} disabled={busy} testid="export-map-svg">SVG</Button>
        </Row>
        <Row icon={<FileDown size={15} className="text-orange-300" />} title="Tee signs" pick={
          <><span className="block text-[11px] text-zinc-500 mb-0.5">Sign size</span><select aria-label="Tee sign size" className={`${selectCls} w-full`} value={signSize} onChange={e => setSignSize(e.target.value as SignSize)}>
            {(Object.keys(SIGN_SIZES) as SignSize[]).map(p => <option key={p} value={p}>{SIGN_SIZES[p].label}</option>)}
          </select></>
        }>
          <Button small onClick={signsPdf} disabled={busy || nothing} testid="export-signs-pdf"><FileDown size={13} /> PDF</Button>
          <Button small onClick={signsZip} disabled={busy || nothing} testid="export-signs-zip"><ImageIcon size={13} /> Pictures (ZIP)</Button>
        </Row>
        <Row icon={<FileDown size={15} className="text-orange-300" />} title="Scorecard">
          <Button small onClick={scorecardPdf} disabled={busy || nothing} testid="export-scorecard"><FileDown size={13} /> PDF</Button>
          <Button small onClick={run("Scorecard SVG", () => download(svgBlob(renderScorecard(getDoc()).svg), fileName(getDoc(), "-scorecard.svg")))} disabled={busy || nothing}>SVG</Button>
        </Row>
        <Row icon={<Box size={15} className="text-orange-300" />} title="3D picture">
          <Button small onClick={snapshot} disabled={busy} testid="export-3d"><ImageIcon size={13} /> PNG</Button>
        </Row>
      </Section>
      <Section title="Hole by hole" testid="hole-exports">
        <div className="flex flex-col gap-1.5 mb-1.5">
          <span className="block text-[11px] text-zinc-500 -mb-1">Which holes</span>
          <select aria-label="Hole to export" data-testid="hole-pick" className={`${selectCls} w-full`} value={pageHole ? pageHole.id : "all"} onChange={e => setPagePick(e.target.value)} disabled={nothing}>
            <option value="all">All holes{complete.length ? ` (${complete.length})` : ""}</option>
            {complete.map(h => <option key={h.id} value={h.id}>Hole {holeLabel(doc, h.id)}{h.name ? ` · ${h.name}` : ""}</option>)}
          </select>
          <span className="block text-[11px] text-zinc-500 -mb-1">Page</span>
          <select aria-label="Hole page size" data-testid="hole-page-size" className={`${selectCls} w-full`} value={pageSize} onChange={e => setPageSize(e.target.value as HolePageSize)}>
            {(Object.keys(HOLE_PAGES) as HolePageSize[]).map(k => <option key={k} value={k}>{HOLE_PAGES[k].label}</option>)}
          </select>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Button small onClick={pagesPdf} disabled={busy || nothing} testid="export-holes-pdf"><FileDown size={13} /> PDF</Button>
          {!pageHole && <Button small onClick={pagesZip} disabled={busy || nothing} testid="export-holes-zip"><ImageIcon size={13} /> Pictures (ZIP)</Button>}
          {pageHole && (
            <>
              <Button small onClick={pagePng} disabled={busy} testid="export-hole-png"><ImageIcon size={13} /> PNG</Button>
              <Button small onClick={pageSvg} disabled={busy} testid="export-hole-svg">SVG</Button>
              <Button small onClick={pageGeo} disabled={busy || !geo} testid="export-hole-geojson">GeoJSON</Button>
            </>
          )}
        </div>
      </Section>
      <Section title="Flyover video" testid="video-export" help="video">
        <Field label="Holes">
          <select aria-label="Holes to fly over" data-testid="video-holes" className={`${selectCls} w-full`} value={videoHoles.length === 1 && videoPick !== "all" ? videoPick : "all"} onChange={e => setVideoPick(e.target.value)} disabled={nothing}>
            <option value="all">The whole course, in order{complete.length ? ` (${complete.length} holes)` : ""}</option>
            {complete.map(h => <option key={h.id} value={h.id}>Hole {holeLabel(doc, h.id)}{h.name ? ` · ${h.name}` : ""}</option>)}
          </select>
        </Field>
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
          <Field label="Size">
            <select aria-label="Video size" data-testid="video-resolution" className={`${selectCls} w-full`} value={video.resolution} onChange={e => video.set({ resolution: e.target.value as VideoResolution })}>
              {(Object.keys(VIDEO_SIZES) as VideoResolution[]).map(k => <option key={k} value={k}>{VIDEO_SIZES[k].label}</option>)}
            </select>
          </Field>
          <Field label="Frame rate">
            <Segmented label="Frame rate" value={video.fps} onChange={v => video.set({ fps: v })} options={[{ value: 30, label: "30 fps" }, { value: 60, label: "60 fps" }]} />
          </Field>
        </div>
        {/* (the camera is set where its flight is seen: a hole's view, Fly over, Camera) */}
        <p className="text-[11.5px] text-zinc-500 mb-2" data-testid="video-camera-note">The camera, the ground and what shows on screen: from a tee, Camera.</p>
        {recording ? (
          <div className="mt-1" data-testid="video-progress-row">
            <div className="flex items-center justify-between text-xs text-zinc-300 mb-1">
              <span className="truncate">{recording.label}</span>
              <span className="tabular-nums">{Math.round((recording.progress ?? 0) * 100)}%</span>
            </div>
            <ProgressBar value={recording.progress} testid="video-progress" label="Recording progress" />
            <div className="mt-2"><Button small onClick={() => recording.cancel?.()} testid="video-cancel">Cancel</Button></div>
          </div>
        ) : (
          <>
            <Button tone="primary" full onClick={() => void recordVideo(videoHoles)} disabled={busy || nothing} testid="video-record"><Clapperboard size={15} /> Record {videoHoles.length === 1 ? `hole ${holeNumber(doc, videoHoles[0])}` : "the course"}</Button>
            {!nothing && <p className="text-[11px] text-zinc-500 mt-1.5">About {minSec(videoSeconds(doc, videoHoles))} of video.</p>}
          </>
        )}
      </Section>
      <Section title="GPS and data" help="gps-files">
        {!geo && <p className="text-[12px] text-zinc-400 mb-2">GPS files need the course's real place: bring in the site on the Site step.</p>}
        <Row icon={<FileJson size={15} className="text-sky-300" />} title="GPS files">
          <Button small onClick={text(() => toKML(getDoc()), ".kml", "application/vnd.google-earth.kml+xml")} disabled={busy || !geo} testid="export-kml">KML</Button>
          <Button small onClick={text(() => toGeoJSON(getDoc()), ".geojson", "application/geo+json")} disabled={busy || !geo} testid="export-geojson">GeoJSON</Button>
          <Button small onClick={text(() => toGPX(getDoc()), ".gpx", "application/gpx+xml")} disabled={busy || !geo} testid="export-gpx">GPX</Button>
        </Row>
        <Row icon={<FileJson size={15} className="text-sky-300" />} title="Spreadsheets">
          <Button small onClick={text(() => holesCsv(getDoc()), "-holes.csv", "text/csv")} disabled={busy || nothing} testid="export-holes-csv">Holes CSV</Button>
          <Button small onClick={text(() => stakeOutCsv(getDoc()), "-stake-out.csv", "text/csv")} disabled={busy || nothing} testid="export-stakeout">Stake-out CSV</Button>
        </Row>
        <Row icon={<FileJson size={15} className="text-sky-300" />} title="Course file">
          <Button small onClick={saveCourseFile} disabled={busy} testid="export-file">Save .dgcourse.json</Button>
        </Row>
      </Section>
      <Section title="Parts list and budget" testid="parts">
        {parts.lines.length === 0 ? <p className="text-xs text-zinc-400">No holes yet.</p> : (
          <>
            <table className="w-full text-xs text-zinc-300 tabular-nums">
              <tbody>
                {parts.lines.map(l => (
                  <tr key={l.item}>
                    <td className="py-0.5">{l.item}</td>
                    <td className="text-right">{l.qty}</td>
                    <td className="text-right text-zinc-400">× ${l.unitPrice}</td>
                    <td className="text-right font-semibold text-zinc-100">${l.total.toLocaleString()}</td>
                  </tr>
                ))}
                <tr className="border-t border-white/[0.12]"><td className="pt-1 font-bold text-zinc-100" colSpan={3}>Estimate</td><td className="text-right pt-1 font-bold text-zinc-50" data-testid="parts-total">${parts.total.toLocaleString()}</td></tr>
              </tbody>
            </table>
            <p className="text-[11px] text-zinc-500 mt-1">Concrete for the pads: {parts.concreteYd3.toFixed(1)} cu yd</p>
            <details className="mt-2">
              <summary className="text-xs text-orange-300 cursor-pointer">Change prices</summary>
              <div className="grid grid-cols-2 gap-2 mt-2">
                {(Object.keys(doc.rules.prices) as (keyof CourseRules["prices"])[]).map(k => (
                  <Field key={k} label={k === "teePad" ? "Tee pad" : k[0].toUpperCase() + k.slice(1)}>
                    <input aria-label={`Price ${k}`} type="number" className="w-full bg-white/[0.07] border border-white/[0.12] rounded px-2 py-1 text-xs" value={doc.rules.prices[k]} onChange={e => setPrice(k, Math.max(0, parseFloat(e.target.value) || 0))} />
                  </Field>
                ))}
              </div>
            </details>
            <div className="mt-2"><Button small onClick={text(() => partsCsv(getDoc()), "-parts.csv", "text/csv")} disabled={busy} testid="export-parts">Parts list CSV</Button></div>
          </>
        )}
      </Section>
    </>
  );
}
