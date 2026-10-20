// Tee signs and hole sheets: one page per hole with its number, par, the distance from each tee,
// the hole drawn with the tee at the bottom, its elevation profile, the hole's rules, and an arrow
// to the next tee.
import { CIRCLE_ONE_FT, FT_PER_M, TEE_LEVELS } from "../constants";
import type { AreaItem, BasketItem, CourseDoc, P } from "../types";
import { activeLayout, fairwayOutline, holeBaskets, holeTees, throwLine } from "./course";
import { boundsOf, dist, pointInPolygon, rotatePoint, smoothPath } from "./geom";
import { holeStats } from "./holeStats";
import { markingsInView, northArrow, palette, renderMapLayers, scaleBar, titleStack, wrapSvg, type MapView } from "./mapSvg";
import type { CanopyGrid } from "./forest";
import type { Contours } from "./relief";
import { profileAlong } from "./terrainGrid";
import { fmtDist, fmtElev } from "./units";

export type SignSize = "18x12" | "12x18" | "18x24" | "letter" | "a4";
export const SIGN_SIZES: Record<SignSize, { label: string; w: number; h: number }> = {
  "18x12": { label: "Tee sign 18 × 12 in (wide)", w: 18, h: 12 },
  "12x18": { label: "Tee sign 12 × 18 in", w: 12, h: 18 },
  "18x24": { label: "Tee sign 18 × 24 in", w: 18, h: 24 },
  letter: { label: "Hole sheet (Letter)", w: 8.5, h: 11 },
  a4: { label: "Hole sheet (A4)", w: 8.27, h: 11.69 }
};

const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const n = (v: number) => (Math.round(v * 100) / 100).toString();
const font = (f: string) => (f === "Oswald" ? "Oswald, 'Arial Narrow', Arial, sans-serif" : f === "Bitter" ? "Bitter, Georgia, serif" : "Inter, Arial, sans-serif");

/** The look of tee signs and hole cards (the course's own, or a dark green header on light paper):
 * the header band, its light lettering (accent), the paper, the ink, a softer ink, the heading and
 * body fonts. */
export const CARD_DEFAULTS = { header: "#13311d", accent: "#d9f99d", paper: "#f5f4ee", ink: "#0f1f12", font: "Oswald" };
export const cardStyle = (doc: Pick<CourseDoc, "style">) => {
  const c = { ...CARD_DEFAULTS, ...(doc.style.card ?? {}) };
  const mix = (a: string, b: string, t: number) => {
    const p = (h: string) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
    const [x, y] = [p(a), p(b)];
    return `#${x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, "0")).join("")}`;
  };
  return { header: c.header, accent: c.accent, paper: c.paper, ink: c.ink, soft: mix(c.ink, c.paper, 0.38), head: c.font === "Script" ? "'Kaushan Script', cursive" : font(c.font), body: "Inter, Arial, sans-serif" };
};

/** Rules written out from what is drawn on and around the hole (used when it has no notes of its own). */
export const autoRules = (doc: CourseDoc, holeId: string) => {
  const hole = doc.holes.find(h => h.id === holeId)!;
  const s = holeStats(doc, hole);
  const out: string[] = [];
  if (!s.complete) return out;
  const fairway = fairwayOutline(hole, smoothPath(s.line, 8), 20, 8);
  const near = (a: AreaItem) => (!a.holeId || a.holeId === holeId) && (a.points.some(p => pointInPolygon(p, fairway)) || fairway.some(p => pointInPolygon(p, a.points)));
  const areas = doc.items.filter(i => i.type === "area") as AreaItem[];
  const obLine = doc.items.some(i => i.type === "line" && i.kind === "ob" && (!i.holeId || i.holeId === holeId) && i.points.some(p => pointInPolygon(p, fairway)));
  if (areas.some(a => a.kind === "ob" && near(a)) || obLine) out.push("OB in play.");
  if (areas.some(a => a.kind === "water" && near(a))) out.push("Water is OB.");
  if (areas.some(a => a.kind === "hazard" && near(a))) out.push("Hazard in play.");
  const mandos = doc.items.filter(i => i.type === "mando" && i.holeId === holeId);
  const dz = doc.items.filter(i => i.type === "dropzone" && i.holeId === holeId);
  if (mandos.length) out.push(mandos.length === 1 ? `Mando: pass ${(mandos[0] as { side: string }).side}.` : `${mandos.length} mandos.`);
  if (dz.length) out.push(`Drop zone for a missed mando${s.obInPlay ? " or OB" : ""}.`);
  if (s.obNearBasket) out.push("OB within 10 m of the basket.");
  return out;
};

/** The ground along a hole, tee to basket, as a filled profile in `box`. */
export const elevationProfile = (doc: CourseDoc, line: P[], box: { x: number; y: number; w: number; h: number }, c: { fill: string; stroke: string; tee: string; basket: string; width: number }) => {
  if (line.length < 2) return "";
  const prof = profileAlong(doc.terrainHeights, doc.gridSize, smoothPath(line, 6), 60);
  if (prof.length < 2) return "";
  const hs = prof.map(p => p.h);
  const lo = Math.min(...hs), hi = Math.max(...hs);
  const span = Math.max(8, hi - lo) * 1.3;
  const mid = (lo + hi) / 2;
  const total = prof[prof.length - 1].d || 1;
  const X = (d: number) => box.x + (d / total) * box.w;
  const Y = (h: number) => box.y + box.h * (0.5 - (h - mid) / span);
  const d = prof.map((p, i) => `${i ? "L" : "M"}${n(X(p.d))} ${n(Y(p.h))}`).join("");
  return `<g data-part="profile"><path d="${d}L${n(X(total))} ${n(box.y + box.h)}L${n(box.x)} ${n(box.y + box.h)}Z" fill="${c.fill}" opacity="0.75"/><path d="${d}" fill="none" stroke="${c.stroke}" stroke-width="${n(c.width)}" stroke-linejoin="round"/>`
    + `<circle cx="${n(X(0))}" cy="${n(Y(prof[0].h))}" r="${n(c.width * 2)}" fill="${c.tee}" stroke="#111"/><circle cx="${n(X(total))}" cy="${n(Y(prof[prof.length - 1].h))}" r="${n(c.width * 2)}" fill="${c.basket}" stroke="#111"/></g>`;
};

export type SignArt = { contours: Contours | null; hillshade: string | null; canopy?: CanopyGrid | null };

export const renderTeeSign = (doc: CourseDoc, holeId: string, size: SignSize, opts: SignArt) => {
  const hole = doc.holes.find(h => h.id === holeId);
  if (!hole) return null;
  if (SIGN_SIZES[size].w > SIGN_SIZES[size].h) return renderWideSign(doc, holeId, size, opts);
  const layout = activeLayout(doc);
  const stats = doc.holes.map(h => holeStats(doc, h, layout));
  const st = stats.find(s => s.holeId === holeId)!;
  const st0 = doc.style;
  const pal = palette(st0);
  const page = SIGN_SIZES[size];
  const W = page.w * 72, H = page.h * 72;
  const ts = W / (12 * 72) * 1.9;
  const m = 0.45 * 72 * (W / (12 * 72));
  const F = font(st0.font);
  const parts: string[] = [];
  const sheet = size === "letter" || size === "a4";
  const header = { h: H * (sheet ? 0.17 : 0.2) };
  const tees = holeTees(doc, holeId);
  const mainTee = tees.find(t => t.id === st.teeId) ?? tees[0];
  const lvl = TEE_LEVELS[mainTee?.level ?? "blue"];
  const card = cardStyle(doc);
  const dark = card.header;

  parts.push(`<rect width="${n(W)}" height="${n(H)}" fill="${card.paper}"/>`);
  // Header band
  parts.push(`<rect width="${n(W)}" height="${n(header.h)}" fill="${dark}"/>`);
  parts.push(`<rect y="${n(header.h - 6 * ts)}" width="${n(W)}" height="${n(6 * ts)}" fill="${lvl.color}"/>`);
  const r = header.h * 0.36;
  parts.push(`<circle cx="${n(m + r)}" cy="${n(header.h * 0.5)}" r="${n(r)}" fill="${lvl.color}" stroke="#ffffff" stroke-width="${n(4 * ts)}"/>`);
  parts.push(`<text x="${n(m + r)}" y="${n(header.h * 0.5 + r * 0.06)}" text-anchor="middle" dominant-baseline="central" font-family="${F}" font-weight="700" font-size="${n(r * 1.25)}" fill="${lvl.ink}">${st.label}</text>`);
  const tx = m + 2 * r + 16 * ts;
  // The course name across the top, the par under it on the left, the distances on the right
  const name = (doc.name || "").toUpperCase();
  const nameSize = Math.min(10 * ts, ((W - tx - m) / Math.max(1, name.length)) * 1.55);
  parts.push(`<text x="${n(tx)}" y="${n(header.h * 0.2)}" font-family="Inter, Arial, sans-serif" font-weight="600" font-size="${n(nameSize)}" fill="#d1fae5" letter-spacing="${n(nameSize * 0.12)}">${esc(name)}</text>`);
  parts.push(`<text x="${n(tx)}" y="${n(header.h * 0.6)}" font-family="${F}" font-weight="700" font-size="${n(34 * ts)}" fill="#ffffff">PAR ${st.complete ? st.par : "–"}</text>`);
  if (hole.name) parts.push(`<text x="${n(tx)}" y="${n(header.h * 0.83)}" font-family="${F}" font-weight="500" font-size="${n(13 * ts)}" fill="${card.accent}">${esc(hole.name)}</text>`);
  // Distances per tee (each tee to the layout's pin)
  const basket = holeBaskets(doc, holeId).find(b => b.position === layout?.pin) ?? holeBaskets(doc, holeId)[0];
  const rowsX = W - m;
  tees.forEach((t, i) => {
    const len = basket ? holeStats(doc, hole, { id: "sign", name: "", tee: t.level, pin: basket.position }).length : 0;
    const y = header.h * 0.4 + i * 17 * ts * (tees.length > 3 ? 0.75 : 1);
    const L = TEE_LEVELS[t.level];
    parts.push(`<rect x="${n(rowsX - 150 * ts)}" y="${n(y - 7 * ts)}" width="${n(150 * ts)}" height="${n(14 * ts)}" rx="${n(7 * ts)}" fill="${L.color}"/>`);
    parts.push(`<text x="${n(rowsX - 142 * ts)}" y="${n(y)}" dominant-baseline="central" font-family="${F}" font-weight="700" font-size="${n(10 * ts)}" fill="${L.ink}">${L.label.toUpperCase()}</text>`);
    parts.push(`<text x="${n(rowsX - 8 * ts)}" y="${n(y)}" text-anchor="end" dominant-baseline="central" font-family="${F}" font-weight="700" font-size="${n(10.5 * ts)}" fill="${L.ink}">${Math.round(len)} FT · ${Math.round(len / FT_PER_M)} M</text>`);
  });

  // The hole map, turned so the throw goes up the sign
  const footerH = H * (sheet ? 0.3 : 0.27);
  const box = { x: m, y: header.h + m * 0.7, w: W - 2 * m, h: H - header.h - m * 0.7 - footerH };
  const line = st.line.length >= 2 ? st.line : [{ x: hole.doglegs[0]?.x ?? 0, y: 0 }, { x: 0, y: 1 }];
  const a = Math.atan2(line[line.length - 1].y - line[0].y, line[line.length - 1].x - line[0].x) * 180 / Math.PI;
  const rotation = a + 90;
  const pts: P[] = [...fairwayOutline(hole, smoothPath(line, 8), 30, 8), ...tees, ...holeBaskets(doc, holeId).map(b => ({ x: b.x + CIRCLE_ONE_FT, y: b.y })), ...holeBaskets(doc, holeId).map(b => ({ x: b.x - CIRCLE_ONE_FT, y: b.y - CIRCLE_ONE_FT }))];
  doc.items.forEach(i => { if ((i.type === "mando" || i.type === "dropzone") && i.holeId === holeId) pts.push(i); });
  const rot = pts.map(p => rotatePoint(p, -rotation));
  const rb = boundsOf(rot);
  const pad = 40;
  const scale = Math.min(box.w / (rb.maxX - rb.minX + pad * 2), box.h / (rb.maxY - rb.minY + pad * 2));
  const c = rotatePoint({ x: (rb.minX + rb.maxX) / 2, y: (rb.minY + rb.maxY) / 2 }, rotation);
  const view: MapView = { cx: c.x, cy: c.y, rotation, scale, width: box.w, height: box.h };
  const map = renderMapLayers(doc, view, { stats, contours: opts.contours, hillshade: opts.hillshade, focusHole: holeId, textScale: ts * 0.75, fontFamily: st0.font, canopy: opts.canopy }, `ts${st.label}`);
  parts.push(`<clipPath id="sign-clip"><rect x="${n(box.x)}" y="${n(box.y)}" width="${n(box.w)}" height="${n(box.h)}" rx="${n(8 * ts)}"/></clipPath>`);
  parts.push(`<g clip-path="url(#sign-clip)"><g transform="translate(${n(box.x)} ${n(box.y)})">${map.svg}</g></g>`);
  parts.push(`<rect x="${n(box.x)}" y="${n(box.y)}" width="${n(box.w)}" height="${n(box.h)}" rx="${n(8 * ts)}" fill="none" stroke="${dark}" stroke-width="${n(2 * ts)}"/>`);
  // North, scale
  parts.push(`<g transform="translate(${n(box.x + box.w - 22 * ts)} ${n(box.y + 26 * ts)}) rotate(${n(-rotation)})">${northArrow(0, 0, 13 * ts, pal)}</g>`);
  parts.push(scaleBar(box.x + 10 * ts, box.y + box.h - 12 * ts, scale, ts * 0.85, pal, doc.units));
  // Next tee arrow
  const next = stats[stats.indexOf(st) + 1];
  if (next?.complete && st.complete) {
    const from = st.line[st.line.length - 1], to = next.line[0];
    const d = dist(from, to);
    const dir = rotatePoint({ x: to.x - from.x, y: to.y - from.y }, -rotation);
    const ang = Math.atan2(dir.y, dir.x) * 180 / Math.PI;
    const cx = box.x + box.w - 70 * ts, cy = box.y + box.h - 26 * ts;
    parts.push(`<g><rect x="${n(cx - 62 * ts)}" y="${n(cy - 16 * ts)}" width="${n(124 * ts)}" height="${n(32 * ts)}" rx="${n(16 * ts)}" fill="${dark}"/><g transform="translate(${n(cx - 42 * ts)} ${n(cy)}) rotate(${n(ang)})"><path d="M${n(-9 * ts)} 0H${n(7 * ts)}M${n(1 * ts)} ${n(-6 * ts)}L${n(8 * ts)} 0L${n(1 * ts)} ${n(6 * ts)}" stroke="#fff" stroke-width="${n(3 * ts)}" fill="none" stroke-linecap="round" stroke-linejoin="round"/></g><text x="${n(cx - 26 * ts)}" y="${n(cy)}" dominant-baseline="central" font-family="${F}" font-weight="700" font-size="${n(10 * ts)}" fill="#fff">HOLE ${next.number} · ${Math.round(doc.units === "m" ? d / FT_PER_M : d)} ${doc.units.toUpperCase()}</text></g>`);
  }

  // Footer: elevation profile, numbers and rules
  const fy = H - footerH + m * 0.3;
  const prof = st.complete ? profileAlong(doc.terrainHeights, doc.gridSize, smoothPath(throwLine(hole, mainTee ?? null, basket ?? null), 6), 60) : [];
  const pw = (W - 2 * m) * 0.48, ph = footerH * 0.42;
  parts.push(`<text x="${n(m)}" y="${n(fy + 6 * ts)}" font-family="${F}" font-weight="700" font-size="${n(11 * ts)}" fill="${pal.ink}">ELEVATION ${st.complete ? esc(fmtElev(st.elevationChange, doc.units).toUpperCase()) : ""}</text>`);
  if (prof.length > 1) {
    const hs = prof.map(p => p.h);
    const lo = Math.min(...hs), hi = Math.max(...hs);
    const span = Math.max(8, hi - lo) * 1.3;
    const mid = (lo + hi) / 2;
    const X = (d: number) => m + (d / prof[prof.length - 1].d) * pw;
    const Y = (h: number) => fy + 14 * ts + ph * (0.5 - (h - mid) / span);
    const d = prof.map((p, i) => `${i ? "L" : "M"}${n(X(p.d))} ${n(Y(p.h))}`).join("");
    parts.push(`<path d="${d}L${n(X(prof[prof.length - 1].d))} ${n(fy + 14 * ts + ph)}L${n(m)} ${n(fy + 14 * ts + ph)}Z" fill="${st0.fairway}" opacity="0.7"/><path d="${d}" fill="none" stroke="${dark}" stroke-width="${n(2 * ts)}"/>`);
    parts.push(`<circle cx="${n(X(0))}" cy="${n(Y(prof[0].h))}" r="${n(4 * ts)}" fill="${lvl.color}" stroke="#111"/><circle cx="${n(X(prof[prof.length - 1].d))}" cy="${n(Y(prof[prof.length - 1].h))}" r="${n(4 * ts)}" fill="${st0.basket}" stroke="#111"/>`);
    parts.push(`<text x="${n(m)}" y="${n(fy + 14 * ts + ph + 11 * ts)}" font-family="Inter, Arial, sans-serif" font-size="${n(8 * ts)}" fill="${pal.inkSoft}">Tee</text><text x="${n(m + pw)}" y="${n(fy + 14 * ts + ph + 11 * ts)}" text-anchor="end" font-family="Inter, Arial, sans-serif" font-size="${n(8 * ts)}" fill="${pal.inkSoft}">Basket · plays like ${esc(fmtDist(st.playsLike, doc.units))}</text>`);
  }
  // Rules and notes
  const nx = m + pw + 20 * ts, nw = W - m - nx;
  const rules = [hole.notes ?? "", ...(hole.notes ? [] : autoRules(doc, holeId))].filter(Boolean);
  parts.push(`<text x="${n(nx)}" y="${n(fy + 6 * ts)}" font-family="${F}" font-weight="700" font-size="${n(11 * ts)}" fill="${pal.ink}">HOLE NOTES</text>`);
  const words = rules.join(" ").split(/\s+/).filter(Boolean);
  const fs = 9.5 * ts;
  const maxChars = Math.max(10, Math.floor(nw / (fs * 0.52)));
  const wrapped: string[] = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length > maxChars) { wrapped.push(cur); cur = w; } else cur = (cur + " " + w).trim();
  }
  if (cur) wrapped.push(cur);
  (wrapped.length ? wrapped : ["Play it as it lies."]).slice(0, 7).forEach((l, i) => parts.push(`<text x="${n(nx)}" y="${n(fy + 24 * ts + i * fs * 1.35)}" font-family="Inter, Arial, sans-serif" font-size="${n(fs)}" fill="${pal.ink}">${esc(l)}</text>`));
  // Bottom strip
  const by = H - m * 0.6;
  const shown = markingsInView(doc, view);
  const legend = [shown.ob && `<tspan fill="${st0.ob}">■</tspan> OB`, shown.hazard && `<tspan fill="${st0.hazard}">■</tspan> Hazard`, shown.mando && `<tspan fill="#f97316">●</tspan> Mando / DZ`, `<tspan fill="${st0.basket}">●</tspan> Basket`].filter(Boolean).join("   ");
  parts.push(`<text x="${n(m)}" y="${n(by)}" font-family="Inter, Arial, sans-serif" font-size="${n(8 * ts)}" fill="${pal.inkSoft}">${legend}</text>`);
  parts.push(`<text x="${n(W - m)}" y="${n(by)}" text-anchor="end" font-family="Inter, Arial, sans-serif" font-size="${n(8 * ts)}" fill="${pal.inkSoft}">Hole ${st.label} of ${doc.holes.length}${layout && doc.layouts.length > 1 ? ` · ${esc(layout.name)} layout` : ""}</text>`);
  return { svg: wrapSvg(W, H, parts.join("")), width: W, height: H };
};

/**
 * A printable scorecard like the classic course card: the course's logo (or its name), Date, Par
 * and Course; a row of each hole's par (and each layout's lengths), then Name and the holes 1–9,
 * Front, 10–18, Back and Total, and rows for the players. Two cards to a letter page, with a cut
 * line between them.
 */
export const renderScorecard = (doc: CourseDoc, players = 5) => {
  const W = 11 * 72, H = 8.5 * 72;
  const cardH = H / 2;
  const card = cardStyle(doc);
  const sty = doc.style;
  const stats = doc.holes.map(h => holeStats(doc, h, activeLayout(doc)));
  const split = stats.length > 9;
  type Col = { label: string; holes: number[]; total?: boolean; extra?: boolean };
  const cols: Col[] = [];
  const front = split ? Math.ceil(stats.length / 2) : stats.length;
  for (let i = 0; i < front; i++) cols.push({ label: stats[i].label, holes: [i] });
  if (split) {
    cols.push({ label: "Front", holes: Array.from({ length: front }, (_, i) => i), total: true });
    for (let i = front; i < stats.length; i++) cols.push({ label: stats[i].label, holes: [i] });
    cols.push({ label: "Back", holes: Array.from({ length: stats.length - front }, (_, i) => front + i), total: true });
  }
  cols.push({ label: "Total", holes: stats.map((_, i) => i), total: true });
  cols.push({ label: "+/−", holes: [], extra: true });
  const par = (c: Col) => c.holes.reduce((t, i) => t + (stats[i]?.complete ? stats[i].par : 0), 0);
  const totalPar = stats.reduce((t, st) => t + (st.complete ? st.par : 0), 0);
  const fill = (hex: string, a: number) => `${hex}${Math.round(a * 255).toString(16).padStart(2, "0")}`;
  const one = (top: number) => {
    const out: string[] = [];
    const m = 26;
    // Top: the logo or the name; Date, Par and Course to fill in; where the course is
    const logoH = 50, logoW = 190;
    if (sty.logo) out.push(`<image href="${sty.logo}" x="${m}" y="${n(top + 16)}" width="${logoW}" height="${logoH}" preserveAspectRatio="xMinYMid meet"/>`);
    else {
      const name = (sty.title || doc.name || "").replace(/\s+disc\s+golf(\s+course)?$/i, "").trim() || "Disc Golf";
      const size = Math.min(30, (logoW / Math.max(4, name.length)) * (sty.font === "Script" ? 2.1 : 1.75));
      out.push(`<text x="${m}" y="${n(top + 44)}" font-family="${titleStack(sty.font)}" font-weight="700" font-size="${n(size)}" fill="${card.header}">${esc(sty.font === "Script" ? name : name.toUpperCase())}</text>`);
      out.push(`<text x="${m}" y="${n(top + 60)}" font-family="${card.body}" font-weight="800" font-size="7" letter-spacing="2" fill="${card.header}">DISC GOLF COURSE</text>`);
    }
    const fx = m + logoW + 30;
    const field = (label: string, x: number, y: number, w: number, value = "") => {
      out.push(`<text x="${n(x)}" y="${n(y)}" text-anchor="end" font-family="${card.body}" font-size="10" fill="${card.ink}">${esc(label)}</text>`);
      out.push(`<rect x="${n(x + 6)}" y="${n(y - 12)}" width="${n(w)}" height="15" fill="${fill(card.header, 0.07)}"/><line x1="${n(x + 6)}" x2="${n(x + 6 + w)}" y1="${n(y + 3)}" y2="${n(y + 3)}" stroke="${card.ink}" stroke-width="0.8"/>`);
      if (value) out.push(`<text x="${n(x + 10)}" y="${n(y)}" font-family="${card.body}" font-size="10" fill="${card.ink}">${esc(value)}</text>`);
    };
    field("Date", fx + 40, top + 34, 120);
    field("Par", fx + 210, top + 34, 34, totalPar ? String(totalPar) : "");
    field("Course", fx + 40, top + 58, 214, doc.name);
    if (doc.site.location) out.push(`<text x="${W - m}" y="${n(top + 58)}" text-anchor="end" font-family="${card.head}" font-weight="700" font-size="15" fill="${card.header}">${esc(doc.site.location.label.split(",").slice(0, 2).join(",").trim())}</text>`);
    // The grid
    const labelW = 112, gx = m, gw = W - 2 * m;
    const cw = (gw - labelW) / (cols.length + 0.4);
    const colX = (i: number) => gx + labelW + cw * i;
    let y = top + 78;
    const rowH = 21;
    const row = (label: string, values: (string | number)[], o: { head?: boolean; name?: boolean; small?: boolean; dot?: string } = {}) => {
      out.push(`<rect x="${gx}" y="${n(y)}" width="${n(labelW)}" height="${rowH}" fill="${o.name ? fill(card.header, 0.09) : "#ffffff"}" stroke="${card.ink}" stroke-width="0.9"/>`);
      if (o.dot) out.push(`<circle cx="${gx + 10}" cy="${n(y + rowH / 2)}" r="4.5" fill="${o.dot}" stroke="${card.ink}" stroke-width="0.6"/>`);
      out.push(`<text x="${gx + (o.dot ? 20 : 6)}" y="${n(y + rowH / 2)}" dominant-baseline="central" font-family="${card.body}" font-size="${o.small ? 9 : 11}" fill="${card.ink}">${esc(label)}</text>`);
      cols.forEach((c, i) => {
        const x = colX(i), w = c.extra ? cw * 1.4 : cw;
        out.push(`<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${rowH}" fill="${c.extra || (o.name && c.total) ? fill(card.header, 0.09) : "#ffffff"}" stroke="${card.ink}" stroke-width="${c.total ? 1.4 : 0.9}"/>`);
        const v = values[i];
        if (v !== "" && v !== undefined) out.push(`<text x="${n(x + w / 2)}" y="${n(y + rowH / 2)}" text-anchor="middle" dominant-baseline="central" font-family="${card.body}" font-size="${o.small ? 8.5 : c.total && !o.head ? 11 : 12}" font-weight="${o.head || c.total ? 600 : 400}" fill="${o.head ? card.ink : fill(card.ink, 0.75)}">${esc(String(v))}</text>`);
      });
      y += rowH;
    };
    row("Distance or Par", cols.map(c => (c.extra ? "" : par(c) || "")));
    if (doc.layouts.length) for (const l of doc.layouts) {
      const ls = doc.holes.map(h => holeStats(doc, h, l));
      row(`${l.name} (${doc.units})`, cols.map(c => {
        if (c.extra) return "";
        const v = c.holes.reduce((t, i) => t + (ls[i]?.complete ? ls[i].length : 0), 0);
        return v ? Math.round(doc.units === "m" ? v / FT_PER_M : v) : "";
      }), { small: true, dot: TEE_LEVELS[l.tee].color });
    }
    row("Name ↴", cols.map(c => c.label), { head: true });
    for (let p = 0; p < players; p++) row("", cols.map(() => ""), { name: true });
    return { svg: out.join(""), bottom: y };
  };
  const parts: string[] = [`<rect width="${W}" height="${H}" fill="#ffffff"/>`];
  parts.push(`<g data-part="scorecard">${one(0).svg}</g>`);
  parts.push(`<line x1="0" x2="${W}" y1="${n(cardH)}" y2="${n(cardH)}" stroke="#9ca3af" stroke-width="0.8" stroke-dasharray="6 5"/>`);
  parts.push(`<g data-part="scorecard">${one(cardH).svg}</g>`);
  return { svg: wrapSvg(W, H, parts.join("")), width: W, height: H };
};

/** Wraps text into lines of at most `max` characters. */
const wrap = (text: string, max: number) => {
  const out: string[] = [];
  let cur = "";
  for (const w of text.split(/\s+/).filter(Boolean)) {
    if ((cur + " " + w).trim().length > max && cur) { out.push(cur); cur = w; } else cur = (cur + " " + w).trim();
  }
  if (cur) out.push(cur);
  return out;
};

/** The hole drawn into a box with the tee at the bottom (for signs and hole pages). */
export const holeMap = (doc: CourseDoc, holeId: string, box: { w: number; h: number }, opts: SignArt, ts: number, uid: string) => {
  const hole = doc.holes.find(h => h.id === holeId)!;
  const stats = doc.holes.map(h => holeStats(doc, h, activeLayout(doc)));
  const st = stats.find(s => s.holeId === holeId)!;
  const tees = holeTees(doc, holeId);
  const line = st.line.length >= 2 ? st.line : [{ x: 0, y: 1 }, { x: 0, y: 0 }];
  const a = (Math.atan2(line[line.length - 1].y - line[0].y, line[line.length - 1].x - line[0].x) * 180) / Math.PI;
  const rotation = a + 90;
  const pts: P[] = [...fairwayOutline(hole, smoothPath(line, 8), 40, 8), ...tees];
  holeBaskets(doc, holeId).forEach(b => pts.push({ x: b.x + CIRCLE_ONE_FT * 1.5, y: b.y + CIRCLE_ONE_FT * 1.5 }, { x: b.x - CIRCLE_ONE_FT * 1.5, y: b.y - CIRCLE_ONE_FT * 1.5 }));
  doc.items.forEach(i => { if ((i.type === "mando" || i.type === "dropzone") && i.holeId === holeId) pts.push(i); });
  const rb = boundsOf(pts.map(p => rotatePoint(p, -rotation)));
  const scale = Math.min(box.w / (rb.maxX - rb.minX + 60), box.h / (rb.maxY - rb.minY + 60));
  const c = rotatePoint({ x: (rb.minX + rb.maxX) / 2, y: (rb.minY + rb.maxY) / 2 }, rotation);
  const view: MapView = { cx: c.x, cy: c.y, rotation, scale, width: box.w, height: box.h };
  // On a sign the hole's own line shows, faintly, even when the course map leaves lines out
  const styled = { ...doc, style: { ...doc.style, throwLines: true, circle: doc.style.circle } };
  const map = renderMapLayers(styled, view, { stats, contours: opts.contours, hillshade: opts.hillshade, focusHole: holeId, textScale: ts, fontFamily: doc.style.font, canopy: opts.canopy }, uid);
  return { ...map, rotation, scale, st, stats, view };
};

/**
 * A wide tee sign: a light column on the left with the course name, the hole number in a dark
 * box, the par on a tag in the tee color, the distance in big type and the hole notes; the hole's
 * map on the right with the tee at the bottom; the elevation change along the bottom.
 */
const renderWideSign = (doc: CourseDoc, holeId: string, size: SignSize, opts: SignArt) => {
  const hole = doc.holes.find(h => h.id === holeId)!;
  const page = SIGN_SIZES[size];
  const W = page.w * 72, H = page.h * 72;
  const u = H / (12 * 72); // 1 at 12 in tall
  const sty = doc.style;
  const col = { x: 0, w: W * 0.34 };
  const mapBox = { x: col.w, y: 0, w: W - col.w, h: H };
  const map = holeMap(doc, holeId, mapBox, opts, 1.6 * u, `ws${holeId.slice(-4)}`);
  const st = map.st;
  const tees = holeTees(doc, holeId);
  const mainTee = tees.find(t => t.id === st.teeId) ?? tees[0];
  const lvl = TEE_LEVELS[mainTee?.level ?? "blue"];
  const parts: string[] = [];
  const card = cardStyle(doc);
  parts.push(`<rect width="${n(W)}" height="${n(H)}" fill="${card.paper}"/>`);
  // The map, with the elevation strip along its bottom
  parts.push(`<clipPath id="wide-map"><rect x="${n(mapBox.x)}" y="0" width="${n(mapBox.w)}" height="${n(H)}"/></clipPath>`);
  parts.push(`<g clip-path="url(#wide-map)"><g transform="translate(${n(mapBox.x)} 0)">${map.svg}</g></g>`);
  const stripH = 30 * u;
  parts.push(`<rect x="${n(mapBox.x)}" y="${n(H - stripH)}" width="${n(mapBox.w)}" height="${n(stripH)}" fill="#0b120a" fill-opacity="0.82"/>`);
  parts.push(`<text x="${n(mapBox.x + mapBox.w / 2)}" y="${n(H - stripH / 2)}" text-anchor="middle" dominant-baseline="central" font-family="Oswald, Arial, sans-serif" font-weight="600" font-size="${n(14 * u)}" letter-spacing="${n(1.5 * u)}" fill="#ffffff">ELEVATION CHANGE FROM TEE: ${st.complete ? esc(fmtElev(st.elevationChange, doc.units).toUpperCase()) : "–"}${st.complete && Math.abs(st.playsLike - st.length) >= 10 ? ` · PLAYS LIKE ${esc(fmtDist(st.playsLike, doc.units).toUpperCase())}` : ""}</text>`);
  parts.push(`<g transform="translate(${n(W - 34 * u)} ${n(38 * u)}) rotate(${n(-map.rotation)})">${northArrow(0, 0, 20 * u, palette(sty))}</g>`);
  // The way to the next hole
  const next = map.stats[map.stats.indexOf(st) + 1];
  if (next?.complete && st.complete) {
    const from = st.line[st.line.length - 1], to = next.line[0];
    const d = dist(from, to);
    const dir = rotatePoint({ x: to.x - from.x, y: to.y - from.y }, -map.rotation);
    const ang = (Math.atan2(dir.y, dir.x) * 180) / Math.PI;
    const cx = W - 92 * u, cy = H - stripH - 30 * u;
    parts.push(`<rect x="${n(cx - 76 * u)}" y="${n(cy - 18 * u)}" width="${n(152 * u)}" height="${n(36 * u)}" rx="${n(18 * u)}" fill="#0b120a" fill-opacity="0.85"/><g transform="translate(${n(cx - 52 * u)} ${n(cy)}) rotate(${n(ang)})"><path d="M${n(-10 * u)} 0H${n(8 * u)}M${n(1 * u)} ${n(-7 * u)}L${n(9 * u)} 0L${n(1 * u)} ${n(7 * u)}" stroke="#fff" stroke-width="${n(3.4 * u)}" fill="none" stroke-linecap="round" stroke-linejoin="round"/></g><text x="${n(cx - 32 * u)}" y="${n(cy)}" dominant-baseline="central" font-family="Oswald, Arial, sans-serif" font-weight="600" font-size="${n(13 * u)}" fill="#fff">HOLE ${next.number} · ${Math.round(doc.units === "m" ? d / FT_PER_M : d)} ${doc.units.toUpperCase()}</text>`);
  }
  // The column, top to bottom: the course's name on the header band; the hole's number and par;
  // the length from each tee; the elevation along the hole; the hole notes; a little map of the
  // whole course with this hole picked out; which hole of how many
  const mx = 30 * u, cw = col.w - 2 * mx, cx = col.w / 2;
  const soft = card.soft;
  const lens = tees.map(t => {
    const basket = doc.items.find(i => i.id === st.basketId && i.type === "basket") as BasketItem | undefined;
    return { t, len: t.id === mainTee?.id ? st.length : basket ? holeStats(doc, hole, { id: "x", name: "", tee: t.level, pin: basket.position }).length : 0 };
  });
  const big = (ft: number) => `${Math.round(doc.units === "m" ? ft / FT_PER_M : ft).toLocaleString()} ${doc.units === "m" ? "M" : "FT"}`;
  // Header band: the course's name
  let name = (sty.title || doc.name || "").trim().replace(/\s+disc\s+golf(\s+course)?$/i, "");
  const bandH = 128 * u;
  parts.push(`<rect width="${n(col.w)}" height="${n(bandH)}" fill="${card.header}"/>`);
  const nameSize = Math.min(40 * u, ((cw * 0.95) / Math.max(4, name.length)) * (sty.font === "Script" ? 2.1 : 1.75));
  parts.push(`<text x="${n(cx)}" y="${n(bandH * 0.52)}" text-anchor="middle" font-family="${titleStack(sty.font)}" font-weight="700" font-size="${n(nameSize)}" fill="${card.accent}">${esc(sty.font === "Script" ? name : name.toUpperCase())}</text>`);
  parts.push(`<text x="${n(cx)}" y="${n(bandH * 0.52 + 22 * u)}" text-anchor="middle" font-family="${card.body}" font-weight="800" font-size="${n(7.5 * u)}" letter-spacing="${n(2.6 * u)}" fill="${card.accent}" fill-opacity="0.75">DISC GOLF COURSE</text>`);
  parts.push(`<rect y="${n(bandH - 5 * u)}" width="${n(col.w)}" height="${n(5 * u)}" fill="${lvl.color}"/>`);
  // The number, big, and its par on a tag in the tee's color
  let y = bandH + 34 * u;
  parts.push(`<text x="${n(cx)}" y="${n(y)}" text-anchor="middle" font-family="${card.head}" font-weight="700" font-size="${n(13 * u)}" letter-spacing="${n(3 * u)}" fill="${soft}">HOLE</text>`);
  const numSize = 132 * u;
  parts.push(`<text x="${n(cx)}" y="${n(y + numSize * 0.86)}" text-anchor="middle" font-family="${card.head}" font-weight="700" font-size="${n(numSize)}" fill="${card.ink}">${st.label}</text>`);
  y += numSize * 0.86 + 14 * u;
  const tagW = 112 * u, tagH = 30 * u;
  parts.push(`<rect x="${n(cx - tagW / 2)}" y="${n(y)}" width="${n(tagW)}" height="${n(tagH)}" rx="${n(tagH / 2)}" fill="${lvl.color}" stroke="${lvl.color === "#f8fafc" ? card.ink : lvl.color}" stroke-width="${n(1.2 * u)}"/>`);
  parts.push(`<text x="${n(cx)}" y="${n(y + tagH / 2)}" text-anchor="middle" dominant-baseline="central" font-family="${card.head}" font-weight="700" font-size="${n(17 * u)}" letter-spacing="${n(1 * u)}" fill="${lvl.ink}">PAR ${st.complete ? st.par : "–"}</text>`);
  y += tagH + 30 * u;
  // The length from each tee
  const rule = (yy: number) => parts.push(`<line x1="${n(mx)}" x2="${n(col.w - mx)}" y1="${n(yy)}" y2="${n(yy)}" stroke="${card.ink}" stroke-opacity="0.18" stroke-width="${n(1 * u)}"/>`);
  const label = (text: string, yy: number) => parts.push(`<text x="${n(mx)}" y="${n(yy)}" font-family="${card.head}" font-weight="700" font-size="${n(10.5 * u)}" letter-spacing="${n(1.8 * u)}" fill="${soft}">${esc(text)}</text>`);
  rule(y - 14 * u);
  for (const { t, len } of lens) {
    const L = TEE_LEVELS[t.level], main = t.id === mainTee?.id, rowH = main ? 30 * u : 24 * u;
    parts.push(`<circle cx="${n(mx + 8 * u)}" cy="${n(y + rowH / 2 - 4 * u)}" r="${n((main ? 8 : 6.5) * u)}" fill="${L.color}" stroke="${card.ink}" stroke-opacity="0.5" stroke-width="${n(1 * u)}"/>`);
    parts.push(`<text x="${n(mx + 24 * u)}" y="${n(y + rowH / 2 - 4 * u)}" dominant-baseline="central" font-family="${card.head}" font-weight="${main ? 700 : 600}" font-size="${n((main ? 15 : 12.5) * u)}" letter-spacing="${n(1 * u)}" fill="${card.ink}">${esc(L.label.toUpperCase())}</text>`);
    parts.push(`<text x="${n(col.w - mx)}" y="${n(y + rowH / 2 - 4 * u)}" text-anchor="end" dominant-baseline="central" font-family="${card.head}" font-weight="700" font-size="${n((main ? 22 : 15) * u)}" fill="${card.ink}">${len ? big(len) : "–"}</text>`);
    y += rowH;
  }
  y += 10 * u;
  rule(y);
  y += 22 * u;
  // The ground along the hole
  if (st.complete) {
    label(`ELEVATION ${fmtElev(st.elevationChange, doc.units).toUpperCase()}`, y);
    parts.push(`<text x="${n(col.w - mx)}" y="${n(y)}" text-anchor="end" font-family="${card.head}" font-weight="600" font-size="${n(10.5 * u)}" letter-spacing="${n(1 * u)}" fill="${soft}">PLAYS LIKE ${esc(big(st.playsLike))}</text>`);
    parts.push(elevationProfile(doc, st.line, { x: mx, y: y + 8 * u, w: cw, h: 40 * u }, { fill: sty.fairway, stroke: card.ink, tee: lvl.color, basket: sty.basket, width: 1.6 * u }));
    y += 66 * u;
    rule(y);
    y += 22 * u;
  }
  // Hole notes
  const notes = [hole.notes ?? "", ...(hole.notes ? [] : autoRules(doc, holeId))].filter(Boolean).join(" ");
  if (notes) {
    label("HOLE NOTES", y);
    const fs = 9.5 * u;
    const lines = wrap(notes, Math.max(12, Math.floor(cw / (fs * 0.5)))).slice(0, 4);
    lines.forEach((l, i) => parts.push(`<text x="${n(mx)}" y="${n(y + 18 * u + i * fs * 1.4)}" font-family="${card.body}" font-weight="500" font-size="${n(fs)}" fill="${card.ink}">${esc(l)}</text>`));
    y += 18 * u + lines.length * fs * 1.4 + 12 * u;
    rule(y);
    y += 14 * u;
  }
  // The course in miniature, in the map's colors: this hole picked out, "you are here" at its tee
  const done = map.stats.filter(x => x.complete);
  const bottom = H - 44 * u;
  if (done.length > 1 && bottom - y > 90 * u) {
    const all = done.flatMap(x => x.line);
    const b0 = boundsOf(all);
    const pad = 80;
    const b = { minX: b0.minX - pad, minY: b0.minY - pad, maxX: b0.maxX + pad, maxY: b0.maxY + pad };
    const box = { x: mx, y, w: cw, h: bottom - y };
    const k = Math.min(box.w / (b.maxX - b.minX), box.h / (b.maxY - b.minY));
    const ox = box.x + box.w / 2 - ((b.minX + b.maxX) / 2) * k, oy = box.y + box.h / 2 - ((b.minY + b.maxY) / 2) * k;
    const P2 = (q: P) => `${n(ox + q.x * k)} ${n(oy + q.y * k)}`;
    const poly = (pts: P[]) => `M${pts.map(P2).join("L")}Z`;
    const pth = (pts: P[]) => `M${pts.map(P2).join("L")}`;
    const mw = (b.maxX - b.minX) * k, mh = (b.maxY - b.minY) * k;
    const mbox = { x: box.x + (box.w - mw) / 2, y: box.y + (box.h - mh) / 2, w: mw, h: mh };
    const clip = `mini${holeId.slice(-4)}`;
    const woodsEverywhere = (sty.forest ?? "everywhere") === "everywhere";
    const mini: string[] = [`<clipPath id="${clip}"><rect x="${n(mbox.x)}" y="${n(mbox.y)}" width="${n(mbox.w)}" height="${n(mbox.h)}" rx="${n(10 * u)}"/></clipPath>`];
    mini.push(`<rect x="${n(mbox.x)}" y="${n(mbox.y)}" width="${n(mbox.w)}" height="${n(mbox.h)}" fill="${woodsEverywhere ? sty.trees : sty.rough}"/>`);
    for (const a of doc.items) {
      if (a.type === "area" && (a.kind === "woods" && !woodsEverywhere)) mini.push(`<path d="${poly(a.points)}" fill="${sty.trees}"/>`);
      if (a.type === "area" && (a.kind === "fairway" || a.kind === "nogo" || a.kind === "parking") && woodsEverywhere) mini.push(`<path d="${poly(a.points)}" fill="${sty.rough}"/>`);
    }
    for (const x of done) {
      const h = doc.holes.find(q => q.id === x.holeId);
      if (h?.fairway) mini.push(`<path d="${poly(fairwayOutline(h, smoothPath(x.line, 6), 0, 6))}" fill="${sty.fairway}"/>`);
    }
    for (const a of doc.items) {
      if (a.type === "area" && a.kind === "water") mini.push(`<path d="${poly(a.points)}" fill="${sty.water}"/>`);
      if (a.type === "line" && a.kind === "stream") mini.push(`<path d="${pth(a.points)}" fill="none" stroke="${sty.water}" stroke-width="${n(2 * u)}" stroke-linecap="round"/>`);
      if (a.type === "line" && (a.kind === "path" || a.kind === "walk")) mini.push(`<path d="${pth(a.points)}" fill="none" stroke="${sty.path}" stroke-width="${n(1.4 * u)}" stroke-linecap="round"/>`);
    }
    for (const x of done) {
      const me = x.holeId === holeId;
      mini.push(`<path d="${pth(smoothPath(x.line, 6))}" fill="none" stroke="${me ? lvl.color : "#ffffff"}" stroke-opacity="${me ? 1 : 0.75}" stroke-width="${n((me ? 3.4 : 1.4) * u)}" stroke-linecap="round"/>`);
    }
    for (const x of done) {
      const t = x.line[0], me = x.holeId === holeId;
      if (!me) mini.push(`<circle cx="${n(ox + t.x * k)}" cy="${n(oy + t.y * k)}" r="${n(6.5 * u)}" fill="${card.header}" stroke="#ffffff" stroke-width="${n(0.8 * u)}"/><text x="${n(ox + t.x * k)}" y="${n(oy + t.y * k)}" text-anchor="middle" dominant-baseline="central" font-family="${card.head}" font-weight="700" font-size="${n(7 * u)}" fill="#ffffff">${x.number}</text>`);
    }
    parts.push(`<g data-part="course-map"><g clip-path="url(#${clip})">${mini.join("")}</g><rect x="${n(mbox.x)}" y="${n(mbox.y)}" width="${n(mbox.w)}" height="${n(mbox.h)}" rx="${n(10 * u)}" fill="none" stroke="${card.ink}" stroke-opacity="0.35" stroke-width="${n(1.2 * u)}"/>`);
    // You are here
    const here = st.line[0];
    const hx = ox + here.x * k, hy = oy + here.y * k;
    parts.push(`<path d="M${n(hx)} ${n(hy)}c${n(-9 * u)} ${n(-12 * u)} ${n(-9 * u)} ${n(-24 * u)} 0 ${n(-24 * u)}s${n(9 * u)} ${n(12 * u)} 0 ${n(24 * u)}z" fill="#dc2626" stroke="#ffffff" stroke-width="${n(1.4 * u)}"/><text x="${n(hx)}" y="${n(hy - 15 * u)}" text-anchor="middle" dominant-baseline="central" font-family="${card.head}" font-weight="700" font-size="${n(8.5 * u)}" fill="#ffffff">${st.label}</text>`);
    const tagX = Math.max(mbox.x + 40 * u, Math.min(mbox.x + mbox.w - 40 * u, hx));
    parts.push(`<rect x="${n(tagX - 38 * u)}" y="${n(Math.min(hy + 6 * u, mbox.y + mbox.h - 18 * u))}" width="${n(76 * u)}" height="${n(14 * u)}" rx="${n(7 * u)}" fill="#dc2626"/><text x="${n(tagX)}" y="${n(Math.min(hy + 6 * u, mbox.y + mbox.h - 18 * u) + 7 * u)}" text-anchor="middle" dominant-baseline="central" font-family="${card.body}" font-weight="800" font-size="${n(6.5 * u)}" letter-spacing="${n(1 * u)}" fill="#ffffff">YOU ARE HERE</text></g>`);
  }
  // Which hole of how many, and who designed the course
  parts.push(`<text x="${n(mx)}" y="${n(H - 20 * u)}" font-family="${card.head}" font-weight="700" font-size="${n(9 * u)}" letter-spacing="${n(1.4 * u)}" fill="${soft}">HOLE ${st.label} OF ${doc.holes.length}</text>`);
  if (doc.designer) parts.push(`<text x="${n(col.w - mx)}" y="${n(H - 20 * u)}" text-anchor="end" font-family="${card.body}" font-weight="600" font-size="${n(7.5 * u)}" letter-spacing="${n(0.8 * u)}" fill="${soft}">DESIGNED BY ${esc(doc.designer.toUpperCase())}</text>`);
  return { svg: wrapSvg(W, H, parts.join("")), width: W, height: H };
};
