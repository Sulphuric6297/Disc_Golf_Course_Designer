// Lettering kept inside its panel or column, whatever the font: a printout marks each text that
// has a limit with `data-fit` (the widest it may be, in the page's units). Once the page is drawn
// and its fonts are in, each such text is measured, and one that would run past its edge is set
// smaller until it fits (on the screen as it's drawn, and in every export before it's made).
import { fontsInSvg, loadFont } from "./fontLoad";

/** ` data-fit="…"`, for a text no wider than `w`. */
export const fitAttr = (w: number) => ` data-fit="${Math.round(w * 10) / 10}"`;

/** Every marked text under `root` brought back inside its width (its own size first, smaller only
 * if it has to be). */
export const fitTexts = (root: ParentNode) => {
  for (const el of Array.from(root.querySelectorAll<SVGTextElement>("text[data-fit]"))) {
    const max = Number(el.getAttribute("data-fit"));
    if (!(max > 0)) continue;
    const own = el.getAttribute("data-fs") ?? el.getAttribute("font-size");
    if (!own) continue;
    el.setAttribute("data-fs", own);
    el.setAttribute("font-size", own);
    let len = 0;
    try { len = el.getComputedTextLength(); } catch { continue; }
    if (len > max) el.setAttribute("font-size", String(Math.round(Number(own) * (max / len) * 0.98 * 100) / 100));
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
