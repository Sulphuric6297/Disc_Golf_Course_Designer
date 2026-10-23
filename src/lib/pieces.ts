// Printouts laid out by hand (tee signs, hole pages): every piece of a page can be moved, sized,
// recolored, set in another font or hidden, over where its look puts it. A piece's place is kept
// as a shift (shares of the page) and a size (times its own, about the page's corner), so a look
// lays out each hole as it always has and the changes ride on top of it.
import qrcode from "qrcode-generator";
import type { PiecePlace, PrintExtra, Sponsor } from "../types";
import { titleStack } from "./mapSvg";

const n = (v: number) => (Math.round(v * 100) / 100).toString();

/** The fonts a piece can be set in: the app's own (the course's lettering by default), or any
 * Google font by its family name. */
const OWN = new Set(["", "Oswald", "Inter", "Bitter", "Script"]);
export const pieceFont = (f: string) => (OWN.has(f) ? titleStack(f) : `'${f.replace(/'/g, "")}', Inter, Arial, sans-serif`);

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

const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** What a hole's text fills in: {hole}, {par}, {length}, {course}, {name}. */
export type HoleFacts = { hole: string; par: string; length: string; course: string; name: string };
export const fillIn = (text: string, f: HoleFacts) => text.replace(/\{(hole|par|length|course|name)\}/gi, (_, k: string) => f[k.toLowerCase() as keyof HoleFacts] ?? "");

/** A QR code as squares of a path, `size` across, a quiet margin of light round it. */
export const qrSvg = (url: string, x: number, y: number, size: number) => {
  const q = qrcode(0, "M");
  q.addData(url || " ");
  q.make();
  const c = q.getModuleCount(), cell = size / (c + 2);
  let d = "";
  for (let r = 0; r < c; r++) for (let k = 0; k < c; k++) if (q.isDark(r, k)) d += `M${n(x + (k + 1) * cell)} ${n(y + (r + 1) * cell)}h${n(cell)}v${n(cell)}h${n(-cell)}z`;
  return `<rect x="${n(x)}" y="${n(y)}" width="${n(size)}" height="${n(size)}" fill="#ffffff" data-fill="1"/><path d="${d}" fill="#111111"/>`;
};

/** The extras on a page (text, pictures, sponsors, QR codes) for one hole, each its own piece
 * ("x:ID"). `font`: the course's lettering. */
export const extrasSvg = (extras: PrintExtra[] | undefined, sponsors: Sponsor[] | undefined, holeId: string, facts: HoleFacts, W: number, H: number, font: string, wrap: (id: string, content: string) => string) => {
  const out: string[] = [];
  for (const e of extras ?? []) {
    if (e.holes?.length && !e.holes.includes(holeId)) continue;
    const X = e.x * W, Y = e.y * H, w = e.w * W;
    let body = "";
    if (e.kind === "text") {
      const size = e.size ?? 24, lines = fillIn(e.text ?? "", facts).split("\n");
      const ax = e.align === "middle" ? X + w / 2 : e.align === "end" ? X + w : X;
      body = lines.map((l, i) => `<text x="${n(ax)}" y="${n(Y + size * (0.9 + i * 1.2))}" text-anchor="${e.align ?? "start"}" font-family="${pieceFont(e.font || font)}" font-weight="${e.bold ? 700 : 500}" font-size="${n(size)}" fill="${e.color ?? "#111111"}">${esc(l)}</text>`).join("");
    } else if (e.kind === "image" && e.src) {
      body = `<image href="${e.src}" x="${n(X)}" y="${n(Y)}" width="${n(w)}" height="${n(w * (e.aspect ?? 1))}" preserveAspectRatio="xMidYMid meet"/>`;
    } else if (e.kind === "qr") {
      body = qrSvg(e.url ?? "", X, Y, w);
      if (e.text) body += `<text x="${n(X + w / 2)}" y="${n(Y + w + (e.size ?? 12) * 1.2)}" text-anchor="middle" font-family="${pieceFont(e.font || font)}" font-weight="600" font-size="${n(e.size ?? 12)}" fill="${e.color ?? "#111111"}">${esc(fillIn(e.text, facts))}</text>`;
    } else if (e.kind === "sponsors") {
      // (this hole's sponsors side by side under a small heading: each its logo, its line of text, or both)
      const here = (sponsors ?? []).filter(sp => !sp.holes?.length || sp.holes.includes(holeId));
      if (!here.length) continue;
      const size = e.size ?? 14, gap = size * 0.8, cw = (w - gap * (here.length - 1)) / here.length;
      const head = here.length > 1 ? "HOLE SPONSORS" : "HOLE SPONSOR";
      const parts = [`<text x="${n(X)}" y="${n(Y + size * 0.8)}" font-family="${pieceFont(e.font || font)}" font-weight="700" font-size="${n(size * 0.7)}" letter-spacing="${n(size * 0.12)}" fill="${e.color ?? "#111111"}" fill-opacity="0.7">${head}</text>`];
      here.forEach((sp, i) => {
        const cx = X + i * (cw + gap), top = Y + size * 1.4;
        let y = top;
        if (sp.logo) {
          const lh = Math.min(cw * (sp.aspect ?? 0.5), size * 6);
          parts.push(`<image href="${sp.logo}" x="${n(cx)}" y="${n(y)}" width="${n(cw)}" height="${n(lh)}" preserveAspectRatio="xMidYMid meet"/>`);
          y += lh + size * 0.4;
        }
        const line = sp.text?.trim() || (sp.logo ? "" : sp.name);
        if (line) parts.push(`<text x="${n(cx + cw / 2)}" y="${n(y + size * 0.9)}" text-anchor="middle" font-family="${pieceFont(e.font || font)}" font-weight="700" font-size="${n(size)}" fill="${e.color ?? "#111111"}">${esc(line)}</text>`);
      });
      body = parts.join("");
    }
    if (body) out.push(wrap(`x:${e.id}`, body));
  }
  return out.join("");
};
