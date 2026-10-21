// Publishing a course's public site: the official layout (never a draft), with the parts its
// links allow made here in the owner's browser (pictures, GPS files, the numbers) and sent to the
// server; the course itself only when a link shows its map or 3D view.
import { normalizeCourse } from "../lib/course";
import { canopyFor } from "../lib/forest";
import { courseStats, courseTotals, playsOf } from "../lib/holeStats";
import { holeLabel } from "../lib/course";
import { paintedForPrint, renderPoster } from "../lib/mapSvg";
import { canvasBlob, svgToCanvas } from "../lib/raster";
import { safeDoc } from "../lib/safeDoc";
import { renderScorecard, renderTeeSign } from "../lib/teeSign";
import { toGPX, toKML } from "../lib/exports";
import { reliefOf } from "../components/useRelief";
import type { CourseDoc } from "../types";
import { api } from "./api";
import { LINK_DEFAULT, PARTS, type Perms } from "./perms";

const asData = (blob: Blob) => new Promise<string>((ok, bad) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = bad; r.readAsDataURL(blob); });
const picture = async (svg: string, w: number, h: number, px: number) => asData(await canvasBlob(await svgToCanvas(svg, w, h, (72 * px) / w), "image/webp", 0.86));
const text = (s: string, mime: string) => `data:${mime};base64,${btoa(unescape(encodeURIComponent(s)))}`;

/** The parts of the site: all its working links allow (a new link's, with none). */
export async function siteParts(courseId: string): Promise<Perms> {
  const links = (await api<{ perms: Perms; revoked: boolean }[]>("GET", `courses/${courseId}/links`)).filter(l => !l.revoked);
  if (!links.length) return LINK_DEFAULT;
  return Object.fromEntries(PARTS.map(p => [p, links.some(l => l.perms[p])]));
}

export async function publishSite(courseId: string, progress: (s: string) => void = () => {}) {
  const parts = await siteParts(courseId);
  progress("Reading the course");
  const c = await api<{ doc: CourseDoc; hasBackground: boolean }>("GET", `courses/${courseId}`);
  const photo = c.hasBackground ? (await api<{ data: string | null }>("GET", `courses/${courseId}/background`)).data : null;
  const doc = normalizeCourse(safeDoc({ ...c.doc, background: photo }));
  const stats = courseStats(doc);
  const totals = courseTotals(doc, stats);
  const info = {
    name: doc.name, designer: doc.designer, units: doc.units,
    totals: { holes: doc.holes.reduce((n, h) => n + playsOf(doc, h.id), 0), par: totals.par, length: Math.round(totals.length), climb: Math.round(totals.climb) },
    holes: stats.map(s => {
      const h = doc.holes.find(x => x.id === s.holeId)!;
      return { label: holeLabel(doc, s.holeId), name: h.name ?? "", par: s.par, length: Math.round(s.length), elevation: Math.round(s.elevationChange), playsLike: Math.round(s.playsLike) };
    })
  };
  const files: { name: string; data: string }[] = [];
  const art = { ...reliefOf(doc), canopy: await canopyFor(doc) };
  if (parts.printedMap) {
    progress("Drawing the course map");
    const p = await paintedForPrint(page => (72 * 2000) / page.width, () => renderPoster(doc, art));
    files.push({ name: "map.webp", data: await picture(p.svg, p.width, p.height, 2000) });
  }
  if (parts.teeSigns) {
    for (let i = 0; i < doc.holes.length; i++) {
      progress(`Tee sign ${i + 1} of ${doc.holes.length}`);
      const s = await paintedForPrint(page => (page ? (72 * 1200) / page.width : 72), () => renderTeeSign(doc, doc.holes[i].id, "12x18", art));
      if (s) files.push({ name: `sign-${i + 1}.webp`, data: await picture(s.svg, s.width, s.height, 1200) });
    }
  }
  if (parts.scorecard) {
    progress("The scorecard");
    const s = renderScorecard(doc);
    files.push({ name: "scorecard.webp", data: await picture(s.svg, s.width, s.height, 1600) });
  }
  if (parts.downloads) {
    files.push({ name: "course.gpx", data: text(toGPX(doc), "application/gpx+xml") });
    files.push({ name: "course.kml", data: text(toKML(doc), "application/vnd.google-earth.kml+xml") });
  }
  const showsCourse = !!(parts.map || parts.view3d || parts.flyovers);
  if (showsCourse && photo) {
    const m = /^data:image\/(png|jpeg|webp);/.exec(photo);
    if (m) files.push({ name: `photo.${m[1]}`, data: photo });
  }
  progress("Sending");
  return api<{ version: number }>("POST", `courses/${courseId}/site`, { parts, info, doc: showsCourse ? { ...doc, background: null } : null, files });
}
