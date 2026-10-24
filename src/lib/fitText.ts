// Lettering kept inside its panel or column, whatever the font: a printout marks each text that
// has a limit with `data-fit` (the widest it may be, in the page's units). Once the page is drawn
// and its fonts are in, each such text is measured, and one that would run past its edge is set
// smaller until it fits (on the screen as it's drawn, and in every export before it's made).
import { fontsInSvg, loadFont } from "./fontLoad";

/** ` data-fit="…"`, for a text no wider than `w`. */
export const fitAttr = (w: number) => ` data-fit="${Math.round(w * 10) / 10}"`;
/** And no taller than `h` above its baseline, as its letters really draw in the font it's set in
 * (a tall, narrow font's digits stand far higher than most: a big number would reach up into
 * what's over it). */
export const capAttr = (h: number) => ` data-cap="${Math.round(h * 10) / 10}"`;

let pen: CanvasRenderingContext2D | null = null;
/** How far `el`'s letters rise above its baseline at font size `fs` (null: it can't be measured). */
const inkAbove = (el: SVGTextElement, fs: number) => {
  pen ??= document.createElement("canvas").getContext("2d");
  if (!pen) return null;
  const cs = getComputedStyle(el);
  pen.font = `${cs.fontStyle} ${cs.fontWeight} ${fs}px ${cs.fontFamily}`;
  const m = pen.measureText(el.textContent ?? "");
  return m.actualBoundingBoxAscent || null;
};

/** Every marked text under `root` brought back inside its width (its own size first, smaller only
 * if it has to be). */
export const fitTexts = (root: ParentNode) => {
  for (const el of Array.from(root.querySelectorAll<SVGTextElement>("text[data-fit]"))) {
    const cap = Number(el.getAttribute("data-cap"));
    const max = Number(el.getAttribute("data-fit"));
    if (!(max > 0)) continue;
    const own = el.getAttribute("data-fs") ?? el.getAttribute("font-size");
    if (!own) continue;
    el.setAttribute("data-fs", own);
    el.setAttribute("font-size", own);
    let len = 0;
    try { len = el.getComputedTextLength(); } catch { continue; }
    let fs = Number(own);
    if (len > max) fs = Math.round(fs * (max / len) * 0.98 * 100) / 100;
    if (cap > 0) {
      const up = inkAbove(el, fs);
      if (up && up > cap) fs = Math.round(fs * (cap / up) * 100) / 100;
    }
    if (fs !== Number(own)) el.setAttribute("font-size", String(fs));
  }
};

/** A page's SVG with its marked texts fitted (drawn out of sight, its fonts loaded first). */
export const fitSvgString = async (svg: string) => {
  if (!svg.includes("data-fit") || typeof document === "undefined") return svg;
  const fonts = fontsInSvg(svg);
  fonts.forEach(f => loadFont(f));
  try {
    await Promise.all(fonts.map(f => document.fonts.load(`700 24px '${f}'`).catch(() => [])));
    await document.fonts.ready;
  } catch { /* the fallbacks measure instead */ }
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;left:-100000px;top:0;visibility:hidden;pointer-events:none";
  host.innerHTML = svg;
  document.body.appendChild(host);
  try {
    fitTexts(host);
    return host.innerHTML;
  } finally {
    host.remove();
  }
};
