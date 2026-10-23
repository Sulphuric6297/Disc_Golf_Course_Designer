// Turning the SVG pages into pictures and PDFs, in the browser: an SVG is drawn into a canvas at
// the wanted resolution, and a PDF is written with one full-page JPEG per page (no library needed).

import { fontCssUrl, fontsInSvg } from "./fontLoad";

const FONT_CSS_URL = "https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&family=Oswald:wght@500;700&family=Bitter:wght@700&family=Kaushan+Script&display=swap";

/** A stylesheet's fonts as data (only its Latin files, one per family and weight). */
const inlineFonts = async (cssUrl: string) => {
  const res = await fetch(cssUrl);
  if (!res.ok) throw new Error("No such font.");
  const css = await res.text();
  const split = css.split("/* ");
  const blocks = split.some(b => b.startsWith("latin */")) ? split.filter(b => b.startsWith("latin */")) : css.split("@font-face").slice(1).map(b => `@font-face${b}`);
  const out: string[] = [];
  for (const b of blocks) {
    const url = /url\((https:[^)]+\.woff2)\)/.exec(b)?.[1];
    if (!url) continue;
    const buf = new Uint8Array(await (await fetch(url)).arrayBuffer());
    let bin = "";
    for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    out.push(b.slice(b.indexOf("@font-face")).replace(url, `data:font/woff2;base64,${btoa(bin)}`));
  }
  return out.join("\n");
};

/** Fonts for exported pictures: an SVG drawn as an image can't use the page's web fonts, so the
 * map's fonts are fetched once and embedded, and with them any Google font a tee sign or hole
 * page was set in (bold too where it has one; if one can't be had, the usual fallbacks are used). */
let fontCss: Promise<string> | null = null;
const moreCss = new Map<string, Promise<string>>();
export const embeddedFonts = (more: string[] = []) => {
  if (!fontCss) fontCss = inlineFonts(FONT_CSS_URL).catch(() => "");
  const extra = more.map(f => {
    if (!moreCss.has(f)) moreCss.set(f, inlineFonts(fontCssUrl(f)).catch(() => inlineFonts(fontCssUrl(f, false))).catch(() => ""));
    return moreCss.get(f)!;
  });
  return Promise.all([fontCss, ...extra]).then(all => all.filter(Boolean).join("\n"));
};

/** An SVG document (with its viewBox in points) drawn at `dpi` into a canvas. */
export const svgToCanvas = async (svg: string, widthPt: number, heightPt: number, dpi = 150) => {
  const css = await embeddedFonts(fontsInSvg(svg));
  const withFonts = css ? svg.replace(/(<svg[^>]*>)/, `$1<style>${css}</style>`) : svg;
  const w = Math.round((widthPt / 72) * dpi), h = Math.round((heightPt / 72) * dpi);
  const sized = withFonts.replace(/<svg([^>]*?) width="[^"]*" height="[^"]*"/, `<svg$1 width="${w}" height="${h}"`);
  const url = URL.createObjectURL(new Blob([sized], { type: "image/svg+xml" }));
  try {
    const img = new Image();
    img.decoding = "async";
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("The map couldn't be drawn."));
      img.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("No canvas.");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
};

export const canvasBlob = (canvas: HTMLCanvasElement, type = "image/png", quality = 0.92) =>
  new Promise<Blob>((resolve, reject) => canvas.toBlob(b => (b ? resolve(b) : reject(new Error("Couldn't make the picture."))), type, quality));

/** A PNG no bigger than `maxBytes` (UDisc takes tee sign pictures under 5 MB): lower resolution until it fits. */
export const pngUnder = async (svg: string, w: number, h: number, maxBytes: number, dpi = 150) => {
  for (let d = dpi; d >= 50; d = Math.round(d * 0.8)) {
    const blob = await canvasBlob(await svgToCanvas(svg, w, h, d));
    if (blob.size <= maxBytes) return blob;
  }
  return canvasBlob(await svgToCanvas(svg, w, h, 50));
};

/** The most pixels a printed picture may have: what a computer's browser holds safely in one
 * picture (an iPhone's or iPad's far less). */
const maxPixels = () =>
  typeof navigator !== "undefined" && (/iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent))) ? 16e6 : 40e6;

/** Print resolution for a page this size (points): `most` dpi (300) where the picture fits, less
 * on big posters (200 dpi on 24 × 36 in, 150 on 36 × 48 in). */
export const printDpi = (widthPt: number, heightPt: number, most = 300) => {
  const wIn = widthPt / 72, hIn = heightPt / 72;
  const fit = Math.sqrt(maxPixels() / (wIn * hIn));
  // (no side over 16,000 pixels: browsers stop there)
  const side = 16000 / Math.max(wIn, hIn);
  return Math.max(72, Math.floor(Math.min(most, fit, side) / 25) * 25);
};

/** One page of a PDF, its picture compressed straight away (so a stack of big pages never needs
 * every picture at full size at once). */
export type PdfPage = { jpeg: Uint8Array; pxW: number; pxH: number; widthPt: number; heightPt: number };
export const pdfPage = async (canvas: HTMLCanvasElement, widthPt: number, heightPt: number): Promise<PdfPage> => {
  const jpeg = new Uint8Array(await (await canvasBlob(canvas, "image/jpeg", 0.93)).arrayBuffer());
  const page = { jpeg, pxW: canvas.width, pxH: canvas.height, widthPt, heightPt };
  // (let the picture go now)
  canvas.width = canvas.height = 1;
  return page;
};

/** A PDF with one picture per page, each page its own size (points). */
export const pdfFromPages = async (pages: PdfPage[]) => {
  const enc = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;
  const push = (data: string | Uint8Array) => {
    const bytes = typeof data === "string" ? enc.encode(data) : data;
    chunks.push(bytes);
    length += bytes.length;
  };
  const obj = (id: number, body: () => void) => {
    offsets[id] = length;
    push(`${id} 0 obj\n`);
    body();
    push("\nendobj\n");
  };
  push("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
  const count = pages.length;
  // 1 catalog, 2 pages, then 3 objects per page: page, image, contents
  const pageId = (i: number) => 3 + i * 3;
  obj(1, () => push("<< /Type /Catalog /Pages 2 0 R >>"));
  obj(2, () => push(`<< /Type /Pages /Count ${count} /Kids [${pages.map((_, i) => `${pageId(i)} 0 R`).join(" ")}] >>`));
  for (let i = 0; i < count; i++) {
    const { jpeg, pxW, pxH, widthPt: w, heightPt: h } = pages[i];
    const id = pageId(i);
    obj(id, () => push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w.toFixed(2)} ${h.toFixed(2)}] /Resources << /XObject << /Im${i} ${id + 1} 0 R >> >> /Contents ${id + 2} 0 R >>`));
    obj(id + 1, () => {
      push(`<< /Type /XObject /Subtype /Image /Width ${pxW} /Height ${pxH} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`);
      push(jpeg);
      push("\nendstream");
    });
    const content = `q ${w.toFixed(2)} 0 0 ${h.toFixed(2)} 0 0 cm /Im${i} Do Q`;
    obj(id + 2, () => push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`));
  }
  const xref = length;
  const total = 3 + count * 3;
  push(`xref\n0 ${total}\n0000000000 65535 f \n`);
  for (let i = 1; i < total; i++) push(`${String(offsets[i]).padStart(10, "0")} 00000 n \n`);
  push(`trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(chunks as BlobPart[], { type: "application/pdf" });
};
