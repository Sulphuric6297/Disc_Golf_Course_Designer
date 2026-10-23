// Google fonts used on tee signs and hole pages: loaded into the page as they're needed (a font's
// whole Latin set, or only the letters of its own name for the picker's preview), and listed from
// a course, so the Design step shows them and exports can embed them.
import type { CourseDoc, PiecePlace, PrintExtra } from "../types";

/** The fonts the app has of its own (the course's lettering), not fetched from Google. */
export const OWN_FONTS = new Set(["", "Oswald", "Inter", "Bitter", "Script", "Kaushan Script", "Arial Narrow", "Brush Script MT"]);

const family = (f: string) => encodeURIComponent(f).replace(/%20/g, "+");
/** A font's stylesheet: regular and bold where it has one (`text`: only those letters). */
export const fontCssUrl = (f: string, bold = true, text?: string) =>
  `https://fonts.googleapis.com/css2?family=${family(f)}${bold ? ":wght@400;700" : ""}${text ? `&text=${encodeURIComponent(text)}` : ""}&display=swap`;

const loaded = new Set<string>();
/** A Google font put into the page (once). */
export const loadFont = (f: string, opts: { bold?: boolean; text?: string } = {}) => {
  if (!f || OWN_FONTS.has(f) || typeof document === "undefined") return;
  const url = fontCssUrl(f, opts.bold ?? true, opts.text);
  if (loaded.has(url)) return;
  loaded.add(url);
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = url;
  // (a font without a bold: its regular alone)
  if (opts.bold ?? true) link.onerror = () => { link.remove(); loadFont(f, { ...opts, bold: false }); };
  document.head.appendChild(link);
};

/** Every Google font a course's signs and hole pages use. */
export const fontsIn = (doc: CourseDoc) => {
  const out = new Set<string>();
  const fromLayout = (l?: Record<string, PiecePlace>) => Object.values(l ?? {}).forEach(p => p.font && out.add(p.font));
  const fromExtras = (xs?: PrintExtra[]) => (xs ?? []).forEach(x => x.font && out.add(x.font));
  fromLayout(doc.style.sign?.layout);
  fromLayout(doc.style.holePage?.layout);
  fromExtras(doc.style.sign?.extras);
  fromExtras(doc.style.holePage?.extras);
  for (const h of doc.holes) { fromLayout(h.sign?.layout); fromLayout(h.page?.layout); }
  return [...out].filter(f => !OWN_FONTS.has(f));
};

/** The Google fonts a page's drawing names (for embedding in an export). */
export const fontsInSvg = (svg: string) => {
  const out = new Set<string>();
  for (const m of svg.matchAll(/font-family[:=]"?\s*'([^']+)'/g)) if (!OWN_FONTS.has(m[1])) out.add(m[1]);
  return [...out];
};
