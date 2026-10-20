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
  if (areas.some(a => a.kind === "ob" && near(a)) || obLine) out.push("OB is marked in red.");
  if (areas.some(a => a.kind === "water" && near(a))) out.push("Water is OB.");
  if (areas.some(a => a.kind === "hazard" && near(a))) out.push("Hazard: play it where it lies, plus one throw.");
  const mandos = doc.items.filter(i => i.type === "mando" && i.holeId === holeId);
  const dz = doc.items.filter(i => i.type === "dropzone" && i.holeId === holeId);
  if (mandos.length) out.push(mandos.length === 1 ? `Mando: the disc must pass ${(mandos[0] as { side: string }).side} of the marked post.` : `${mandos.length} mandos on this hole: pass on the side of each arrow.`);
  if (dz.length) out.push(`Drop zone: play from the DZ after a missed mando${s.obInPlay ? " or OB" : ""}.`);
  if (s.obNearBasket) out.push("OB within 10 m of the basket: putt with care.");
  return out;
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
  const dark = "#13311d";

  parts.push(`<rect width="${n(W)}" height="${n(H)}" fill="${pal.paper}"/>`);
  // Header band
  parts.push(`<rect width="${n(W)}" height="${n(header.h)}" fill="${dark}"/>`);
  parts.push(`<rect y="${n(header.h - 6 * ts)}" width="${n(W)}" height="${n(6 * ts)}" fill="${lvl.color}"/>`);
  const r = header.h * 0.36;
  parts.push(`<circle cx="${n(m + r)}" cy="${n(header.h * 0.5)}" r="${n(r)}" fill="${lvl.color}" stroke="#ffffff" stroke-width="${n(4 * ts)}"/>`);
  parts.push(`<text x="${n(m + r)}" y="${n(header.h * 0.5 + r * 0.06)}" text-anchor="middle" dominant-baseline="central" font-family="${F}" font-weight="700" font-size="${n(r * 1.25)}" fill="${lvl.ink}">${st.number}</text>`);
  const tx = m + 2 * r + 16 * ts;
  // The course name across the top, the par under it on the left, the distances on the right
  const name = (doc.name || "").toUpperCase();
  const nameSize = Math.min(10 * ts, ((W - tx - m) / Math.max(1, name.length)) * 1.55);
  parts.push(`<text x="${n(tx)}" y="${n(header.h * 0.2)}" font-family="Inter, Arial, sans-serif" font-weight="600" font-size="${n(nameSize)}" fill="#d1fae5" letter-spacing="${n(nameSize * 0.12)}">${esc(name)}</text>`);
  parts.push(`<text x="${n(tx)}" y="${n(header.h * 0.6)}" font-family="${F}" font-weight="700" font-size="${n(34 * ts)}" fill="#ffffff">PAR ${st.complete ? st.par : "–"}</text>`);
  if (hole.name) parts.push(`<text x="${n(tx)}" y="${n(header.h * 0.83)}" font-family="${F}" font-weight="500" font-size="${n(13 * ts)}" fill="#bbf7d0">${esc(hole.name)}</text>`);
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
  const map = renderMapLayers(doc, view, { stats, contours: opts.contours, hillshade: opts.hillshade, focusHole: holeId, textScale: ts * 0.75, fontFamily: st0.font, canopy: opts.canopy }, `ts${st.number}`);
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
  parts.push(`<text x="${n(W - m)}" y="${n(by)}" text-anchor="end" font-family="Inter, Arial, sans-serif" font-size="${n(8 * ts)}" fill="${pal.inkSoft}">Hole ${st.number} of ${doc.holes.length}${layout && doc.layouts.length > 1 ? ` · ${esc(layout.name)} layout` : ""}</text>`);
  return { svg: wrapSvg(W, H, parts.join("")), width: W, height: H };
};

/** A printable scorecard: par and length per layout for every hole, totals, and rows for players. */
export const renderScorecard = (doc: CourseDoc, players = 5) => {
  const W = 11 * 72, H = 8.5 * 72;
  const m = 30;
  const F = font(doc.style.font);
  const stats = doc.holes.map(h => holeStats(doc, h, activeLayout(doc)));
  const n9 = stats.length > 9;
  type Col = { label: string; holes: number[]; total?: boolean };
  const cols: Col[] = [];
  const front = stats.slice(0, n9 ? Math.ceil(stats.length / 2) : stats.length);
  front.forEach((_, i) => cols.push({ label: String(i + 1), holes: [i] }));
  if (n9) {
    cols.push({ label: "OUT", holes: front.map((_, i) => i), total: true });
    stats.slice(front.length).forEach((_, i) => cols.push({ label: String(front.length + i + 1), holes: [front.length + i] }));
    cols.push({ label: "IN", holes: stats.slice(front.length).map((_, i) => front.length + i), total: true });
  }
  cols.push({ label: "TOTAL", holes: stats.map((_, i) => i), total: true });
  const labelW = 120;
  const cw = (W - 2 * m - labelW) / cols.length;
  const rowH = 26;
  const parts: string[] = [`<rect width="${W}" height="${H}" fill="#ffffff"/>`];
  parts.push(`<text x="${m}" y="${m + 18}" font-family="${F}" font-weight="700" font-size="24" fill="#111">${esc((doc.name || "Scorecard").toUpperCase())}</text>`);
  parts.push(`<text x="${W - m}" y="${m + 16}" text-anchor="end" font-family="Inter, Arial, sans-serif" font-size="10" fill="#444">Date ______________   Layout ______________</text>`);
  if (doc.site.location) parts.push(`<text x="${m}" y="${m + 34}" font-family="Inter, Arial, sans-serif" font-size="9" fill="#555">${esc(doc.site.location.label)}</text>`);
  let y = m + 52;
  const row = (label: string, values: (string | number)[], opts: { fill?: string; ink?: string; bold?: boolean; dot?: string } = {}) => {
    parts.push(`<rect x="${m}" y="${y}" width="${W - 2 * m}" height="${rowH}" fill="${opts.fill ?? "#ffffff"}" stroke="#222" stroke-width="0.8"/>`);
    if (opts.dot) parts.push(`<circle cx="${m + 12}" cy="${y + rowH / 2}" r="5" fill="${opts.dot}" stroke="#333" stroke-width="0.6"/>`);
    parts.push(`<text x="${m + (opts.dot ? 22 : 8)}" y="${y + rowH / 2}" dominant-baseline="central" font-family="${F}" font-weight="700" font-size="11" fill="${opts.ink ?? "#111"}">${esc(label)}</text>`);
    cols.forEach((c, i) => {
      const x = m + labelW + cw * i;
      parts.push(`<line x1="${x}" y1="${y}" x2="${x}" y2="${y + rowH}" stroke="#222" stroke-width="${c.total ? 1.4 : 0.6}"/>`);
      if (c.total) parts.push(`<rect x="${x}" y="${y}" width="${cw}" height="${rowH}" fill="#000" fill-opacity="0.06"/>`);
      const v = values[i];
      if (v !== "" && v !== undefined) parts.push(`<text x="${x + cw / 2}" y="${y + rowH / 2}" text-anchor="middle" dominant-baseline="central" font-family="${opts.bold ? F : "Inter, Arial, sans-serif"}" font-weight="${opts.bold ? 700 : 500}" font-size="${opts.bold ? 12 : 10}" fill="${opts.ink ?? "#111"}">${v}</text>`);
    });
    y += rowH;
  };
  row("HOLE", cols.map(c => c.label), { fill: "#13311d", ink: "#ffffff", bold: true });
  row("PAR", cols.map(c => c.holes.reduce((t, i) => t + (stats[i]?.complete ? stats[i].par : 0), 0) || "–"), { bold: true, fill: "#f0fdf4" });
  for (const l of doc.layouts) {
    const ls = doc.holes.map(h => holeStats(doc, h, l));
    row(`${l.name.toUpperCase()} (${doc.units})`.slice(0, 18), cols.map(c => {
      const v = c.holes.reduce((t, i) => t + (ls[i]?.complete ? ls[i].length : 0), 0);
      return v ? Math.round(doc.units === "m" ? v / FT_PER_M : v) : "–";
    }), { dot: TEE_LEVELS[l.tee].color });
  }
  y += 10;
  for (let p = 0; p < players; p++) row(`PLAYER ${p + 1}`, cols.map(() => ""));
  y += 14;
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
  const F = font(sty.font);
  const col = { x: 0, w: W * 0.34 };
  const mapBox = { x: col.w, y: 0, w: W - col.w, h: H };
  const map = holeMap(doc, holeId, mapBox, opts, 1.6 * u, `ws${holeId.slice(-4)}`);
  const st = map.st;
  const tees = holeTees(doc, holeId);
  const mainTee = tees.find(t => t.id === st.teeId) ?? tees[0];
  const lvl = TEE_LEVELS[mainTee?.level ?? "blue"];
  const parts: string[] = [];
  const ink = "#0f1f12";
  parts.push(`<rect width="${n(W)}" height="${n(H)}" fill="#f5f4ee"/>`);
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
  // The column
  const cx = col.w / 2;
  let y = 46 * u;
  let name = (sty.title || doc.name || "").trim();
  const the = /^the\s+/i.test(name);
  if (the) name = name.replace(/^the\s+/i, "");
  name = name.replace(/\s+disc\s+golf(\s+course)?$/i, "");
  const nameSize = Math.min(44 * u, ((col.w * 0.85) / Math.max(4, name.length)) * (sty.font === "Script" ? 2.1 : 1.8));
  if (the) parts.push(`<text x="${n(cx)}" y="${n(y - nameSize * 0.55)}" text-anchor="middle" font-family="${F}" font-weight="700" font-size="${n(9 * u)}" fill="${ink}">THE</text>`);
  parts.push(`<text x="${n(cx)}" y="${n(y + nameSize * 0.25)}" text-anchor="middle" font-family="${titleStack(sty.font)}" font-weight="700" font-size="${n(nameSize)}" fill="${ink}">${esc(sty.font === "Script" ? name : name.toUpperCase())}</text>`);
  y += nameSize * 0.5 + 12 * u;
  parts.push(`<text x="${n(cx)}" y="${n(y)}" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-weight="800" font-size="${n(7.5 * u)}" letter-spacing="${n(2.2 * u)}" fill="${ink}">DISC GOLF COURSE</text>`);
  y += 22 * u;
  // The hole number in a dark box, the par on a tag in the tee color
  const box = Math.min(col.w * 0.62, H * 0.3);
  parts.push(`<rect x="${n(cx - box / 2)}" y="${n(y)}" width="${n(box)}" height="${n(box)}" fill="#151a14"/>`);
  parts.push(`<text x="${n(cx)}" y="${n(y + box * 0.53)}" text-anchor="middle" dominant-baseline="central" font-family="Oswald, Arial, sans-serif" font-weight="700" font-size="${n(box * 0.82)}" fill="#ffffff">${st.number}</text>`);
  const tagW = box * 0.7, tagH = 26 * u;
  parts.push(`<path d="M${n(cx - tagW / 2)} ${n(y + box - 2 * u)}h${n(tagW)}l${n(-8 * u)} ${n(tagH)}h${n(-tagW + 16 * u)}z" fill="${lvl.color}" stroke="${lvl.color === "#f8fafc" ? "#151a14" : lvl.color}" stroke-width="${n(1.5 * u)}"/>`);
  parts.push(`<text x="${n(cx)}" y="${n(y + box - 2 * u + tagH / 2)}" text-anchor="middle" dominant-baseline="central" font-family="Oswald, Arial, sans-serif" font-weight="700" font-size="${n(16 * u)}" fill="${lvl.ink}">PAR ${st.complete ? st.par : "–"}</text>`);
  y += box + tagH + 22 * u;
  // The distance, big
  const len = st.complete ? Math.round(doc.units === "m" ? st.length / FT_PER_M : st.length) : 0;
  parts.push(`<text x="${n(cx)}" y="${n(y + 46 * u)}" text-anchor="middle" font-family="Oswald, Arial, sans-serif" font-weight="700" font-size="${n(66 * u)}" fill="${ink}">${len || "–"}</text>`);
  y += 62 * u;
  parts.push(`<text x="${n(cx)}" y="${n(y)}" text-anchor="middle" font-family="Oswald, Arial, sans-serif" font-weight="600" font-size="${n(14 * u)}" letter-spacing="${n(2 * u)}" fill="${ink}">${doc.units === "m" ? "METERS" : "FEET"}</text>`);
  y += 14 * u;
  // Other tees, small
  const others = tees.filter(t => t.id !== mainTee?.id);
  const basket = doc.items.find(i => i.id === st.basketId && i.type === "basket") as BasketItem | undefined;
  others.forEach(t => {
    const L = TEE_LEVELS[t.level];
    const l2 = basket ? holeStats(doc, hole, { id: "x", name: "", tee: t.level, pin: basket.position }).length : 0;
    y += 18 * u;
    parts.push(`<rect x="${n(cx - 58 * u)}" y="${n(y - 9 * u)}" width="${n(116 * u)}" height="${n(17 * u)}" rx="${n(8.5 * u)}" fill="${L.color}" stroke="#151a14" stroke-width="${n(0.8 * u)}"/><text x="${n(cx)}" y="${n(y)}" text-anchor="middle" dominant-baseline="central" font-family="Oswald, Arial, sans-serif" font-weight="600" font-size="${n(10 * u)}" fill="${L.ink}">${L.label.toUpperCase()} ${Math.round(doc.units === "m" ? l2 / FT_PER_M : l2)} ${doc.units.toUpperCase()}</text>`);
  });
  y += 30 * u;
  // Hole notes
  const notes = [hole.notes ?? "", ...(hole.notes ? [] : autoRules(doc, holeId))].filter(Boolean).join(" ");
  parts.push(`<line x1="${n(col.w * 0.12)}" x2="${n(col.w * 0.88)}" y1="${n(y - 12 * u)}" y2="${n(y - 12 * u)}" stroke="${ink}" stroke-opacity="0.25"/>`);
  parts.push(`<text x="${n(cx)}" y="${n(y)}" text-anchor="middle" font-family="Oswald, Arial, sans-serif" font-weight="700" font-size="${n(11 * u)}" letter-spacing="${n(1.5 * u)}" fill="${ink}">HOLE NOTES</text>`);
  wrap(notes || "Play it as it lies.", 30).slice(0, 5).forEach((l, i) => parts.push(`<text x="${n(cx)}" y="${n(y + 16 * u + i * 12 * u)}" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-weight="600" font-size="${n(8.5 * u)}" fill="#3b463a">${esc(l.toUpperCase())}</text>`));
  // A little map of the whole course with this hole picked out ("you are here")
  {
    const top = y + 16 * u + 5 * 12 * u + 14 * u;
    const bottom = H - 36 * u;
    const mh = bottom - top, mw = col.w * 0.8;
    if (mh > 70 * u) {
      const lines = map.stats.filter(x => x.complete);
      const all = lines.flatMap(x => x.line);
      const b = boundsOf(all);
      const k = Math.min(mw / Math.max(1, b.maxX - b.minX), mh / Math.max(1, b.maxY - b.minY)) * 0.9;
      const ox = cx - ((b.minX + b.maxX) / 2) * k, oy = top + mh / 2 - ((b.minY + b.maxY) / 2) * k;
      const pth = (pts: P[]) => pts.map((q, i) => `${i ? "L" : "M"}${n(ox + q.x * k)} ${n(oy + q.y * k)}`).join("");
      parts.push(`<text x="${n(cx)}" y="${n(top - 4 * u)}" text-anchor="middle" font-family="Oswald, Arial, sans-serif" font-weight="600" font-size="${n(8 * u)}" letter-spacing="${n(1.2 * u)}" fill="#3b463a">COURSE MAP</text>`);
      for (const x of lines) {
        const me = x.holeId === holeId;
        parts.push(`<path d="${pth(smoothPath(x.line, 6))}" fill="none" stroke="${me ? lvl.color === "#f8fafc" ? "#151a14" : lvl.color : "#9aa598"}" stroke-width="${n((me ? 3.2 : 1.6) * u)}" stroke-linecap="round"/>`);
        const t = x.line[0];
        parts.push(`<text x="${n(ox + t.x * k)}" y="${n(oy + t.y * k - 4 * u)}" text-anchor="middle" font-family="Oswald, Arial, sans-serif" font-weight="700" font-size="${n((me ? 9 : 6.5) * u)}" fill="${me ? "#151a14" : "#7b867a"}">${x.number}</text>`);
      }
    }
  }
  // Bottom of the column
  const credit = doc.designer ? `DESIGNED BY ${doc.designer.toUpperCase()}` : `HOLE ${st.number} OF ${doc.holes.length}`;
  parts.push(`<text x="${n(cx)}" y="${n(H - 20 * u)}" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-weight="700" font-size="${n(7.5 * u)}" letter-spacing="${n(1 * u)}" fill="#3b463a">${esc(credit)}</text>`);
  return { svg: wrapSvg(W, H, parts.join("")), width: W, height: H };
};
