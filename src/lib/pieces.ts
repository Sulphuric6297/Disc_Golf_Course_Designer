// Printouts laid out by hand (tee signs, hole pages): every piece of a page can be moved, sized,
// recolored, set in another font or hidden, over where its look puts it. A piece's place is kept
// as a shift (shares of the page) and a size (times its own, about the page's corner), so a look
// lays out each hole as it always has and the changes ride on top of it.
import type { PiecePlace } from "../types";
import { titleStack } from "./mapSvg";

const n = (v: number) => (Math.round(v * 100) / 100).toString();

/** The fonts a piece can be set in (the course's lettering by default). */
export const pieceFont = (f: string) => titleStack(f);

/**
 * Pieces for one page: `wrap` puts a piece's drawing in its own group (moved, sized, restyled as
 * placed; nothing when hidden), `group` does it for everything pushed onto `parts` since `from`,
 * and `style` is the page's restyling (scoped to this page, `uid`, so pages shown side by side
 * keep their own).
 */
export const piecer = (place: (id: string) => PiecePlace | undefined, W: number, H: number, uid: string) => {
  const css: string[] = [];
  const scope = `pc${uid.replace(/[^a-z0-9]/gi, "")}`;
  const wrap = (id: string, content: string) => {
    if (!content) return "";
    const p = place(id);
    if (p?.hidden) return "";
    const k = p?.scale ?? 1, dx = (p?.dx ?? 0) * W, dy = (p?.dy ?? 0) * H;
    const t = dx || dy || k !== 1 ? ` transform="translate(${n(dx)} ${n(dy)}) scale(${n(k)})"` : "";
    const sel = `#${scope} [data-el="${id}"]`;
    if (p?.font) css.push(`${sel} text,${sel} tspan{font-family:${pieceFont(p.font)} !important}`);
    if (p?.color) css.push(`${sel} text,${sel} tspan{fill:${p.color} !important}`);
    if (p?.fill) css.push(`${sel} [data-fill]{fill:${p.fill} !important}`);
    return `<g data-el="${id}"${t}>${content}</g>`;
  };
  const group = (parts: string[], from: number, id: string) => {
    const c = parts.splice(from).join("");
    const w = wrap(id, c);
    if (w) parts.push(w);
  };
  /** The page's drawing with its restyling, for wrapSvg. */
  const page = (body: string) => `<g id="${scope}">${css.length ? `<style>${css.join("")}</style>` : ""}${body}</g>`;
  return { wrap, group, page };
};

/** A piece sized by `f` about the page point `a` (from its place before). */
export const sizedPlace = (p: PiecePlace | undefined, f: number, a: { x: number; y: number }, W: number, H: number): PiecePlace => {
  const k = p?.scale ?? 1, dx = (p?.dx ?? 0) * W, dy = (p?.dy ?? 0) * H;
  const r = (v: number) => Math.round(v * 10000) / 10000;
  return { ...p, scale: r(Math.max(0.1, Math.min(10, k * f))), dx: r((a.x * (1 - f) + f * dx) / W), dy: r((a.y * (1 - f) + f * dy) / H) };
};
