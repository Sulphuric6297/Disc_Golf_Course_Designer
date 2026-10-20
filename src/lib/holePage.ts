// Hole pages: one page per hole, like a yardage book or a scoring app's hole map. The hole drawn
// in the map's style with the tee at the bottom (the tee signs' hole map), its number, par, the
// length from each tee color, the elevation change and how long it plays, the hole notes and a
// small elevation profile. Pages for print (Letter, A4, a 4 × 6 in card) and a square picture for
// sharing; pure SVG, like the course map.
import { FT_PER_M, TEE_LEVELS } from "../constants";
import type { CourseDoc, PinPosition, TeeLevel, Units } from "../types";
import { activeLayout, holeBaskets, holeTees, throwLine } from "./course";
import { dist, rotatePoint } from "./geom";
import { holeStats } from "./holeStats";
import { markingsInView, northArrow, palette, scaleBar, wrapSvg } from "./mapSvg";
import { autoRules, cardStyle, elevationProfile as profile, holeMap, type SignArt } from "./teeSign";
import { fmtDist, fmtElev } from "./units";

export type HolePageSize = "letter" | "a4" | "card" | "square";
/** Page sizes (inches) and the resolution of their pictures (the square one is 1080 px). */
export const HOLE_PAGES: Record<HolePageSize, { label: string; w: number; h: number; dpi: number }> = {
  letter: { label: "Letter page (8.5 × 11 in)", w: 8.5, h: 11, dpi: 300 },
  a4: { label: "A4 page", w: 8.27, h: 11.69, dpi: 300 },
  card: { label: "Card 4 × 6 in (yardage book)", w: 4, h: 6, dpi: 300 },
  square: { label: "Square 1080 px (social)", w: 7.5, h: 7.5, dpi: 144 }
};

const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const n = (v: number) => (Math.round(v * 100) / 100).toString();

/** "350 FT" / "107 M". */
const big = (ft: number, units: Units) => `${Math.round(units === "m" ? ft / FT_PER_M : ft).toLocaleString()} ${units === "m" ? "M" : "FT"}`;

/** Each tee's length to the layout's pin (longest tee first), and each pin's from the layout's tee
 * when the hole has more than one. */
export const holeLengths = (doc: CourseDoc, holeId: string) => {
  const hole = doc.holes.find(h => h.id === holeId)!;
  const layout = activeLayout(doc);
  const baskets = holeBaskets(doc, holeId);
  const basket = baskets.find(b => b.position === layout?.pin) ?? baskets[0];
  const st = holeStats(doc, hole, layout);
  const len = (tee: TeeLevel, pin: PinPosition) => holeStats(doc, hole, { id: "page", name: "", tee, pin }).length;
  return {
    tees: basket ? holeTees(doc, holeId).map(t => ({ level: t.level, length: len(t.level, basket.position) })) : [],
    pins: baskets.length > 1 ? baskets.map(b => ({ position: b.position, length: len(st.level, b.position) })) : []
  };
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

/** The ground from the tee to the basket, heights stretched so small changes show. */
/** One hole's page. Null for a hole that isn't there. */
export const renderHolePage = (doc: CourseDoc, holeId: string, size: HolePageSize, art: SignArt) => {
  const { header: DARK, paper: PAPER, ink: INK, soft: SOFT, head: HEAD, body: BODY, accent: ACCENT } = cardStyle(doc);
  const hole = doc.holes.find(h => h.id === holeId);
  if (!hole) return null;
  const page = HOLE_PAGES[size];
  const W = page.w * 72, H = page.h * 72;
  const u = Math.min(W, H) / 612;
  const square = Math.abs(W - H) < 1;
  const m = 22 * u;
  const units = doc.units;
  const sty = doc.style;
  const pal = palette(sty);
  const parts: string[] = [];
  const tees = holeTees(doc, holeId);
  const lengths = holeLengths(doc, holeId);

  // Where things go: a header band, a band of tee lengths, the map across the page, and the
  // footer (on the square picture the tee lengths go in the footer, beside the profile)
  const headH = (square ? 84 : 96) * u;
  const teeH = square ? 0 : 50 * u;
  const footH = square ? 92 * u : 146 * u;
  const box = { x: 0, y: headH + teeH, w: W, h: H - headH - teeH - footH };
  const uid = `hp${holeId.replace(/[^a-zA-Z0-9]/g, "").slice(-6)}`;
  const map = holeMap(doc, holeId, { w: box.w, h: box.h }, art, 1.1 * u, uid);
  const st = map.st;
  const mainTee = tees.find(t => t.id === st.teeId) ?? tees[0];
  const lvl = TEE_LEVELS[mainTee?.level ?? st.level];
  const done = st.complete;

  parts.push(`<rect width="${n(W)}" height="${n(H)}" fill="${PAPER}"/>`);
  parts.push(`<clipPath id="${uid}-clip"><rect x="${n(box.x)}" y="${n(box.y)}" width="${n(box.w)}" height="${n(box.h)}"/></clipPath>`);
  parts.push(`<g clip-path="url(#${uid}-clip)" data-part="map"><g transform="translate(${n(box.x)} ${n(box.y)})">${map.svg}</g></g>`);

  // Header: the number on a disc in the tee's color, the course, "HOLE 7" and its name, the par
  // and the length
  parts.push(`<rect width="${n(W)}" height="${n(headH)}" fill="${DARK}"/>`);
  parts.push(`<rect y="${n(headH - 4 * u)}" width="${n(W)}" height="${n(4 * u)}" fill="${lvl.color}"/>`);
  const r = headH * 0.34;
  const cx = m + r, cy = headH * 0.48;
  parts.push(`<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}" fill="${lvl.color}" stroke="#ffffff" stroke-width="${n(3.5 * u)}"/>`);
  parts.push(`<text x="${n(cx)}" y="${n(cy + r * 0.04)}" text-anchor="middle" dominant-baseline="central" font-family="${HEAD}" font-weight="700" font-size="${n(r * 1.2)}" fill="${lvl.ink}">${st.label}</text>`);
  const tx = cx + r + 16 * u;
  const right = W - m;
  const parSize = 34 * u;
  const course = (sty.title || doc.name || "").toUpperCase();
  const room = right - tx - parSize * 3.2;
  const courseSize = Math.min(9.5 * u, (room / Math.max(1, course.length)) * 1.6);
  if (course) parts.push(`<text x="${n(tx)}" y="${n(headH * 0.26)}" font-family="${BODY}" font-weight="600" font-size="${n(courseSize)}" letter-spacing="${n(courseSize * 0.12)}" fill="${ACCENT}">${esc(course)}</text>`);
  parts.push(`<text x="${n(tx)}" y="${n(headH * (hole.name ? 0.6 : 0.68))}" font-family="${HEAD}" font-weight="700" font-size="${n(32 * u)}" fill="#ffffff">HOLE ${st.label}</text>`);
  if (hole.name) {
    const nameSize = Math.min(13 * u, (room / Math.max(1, hole.name.length)) * 1.8);
    parts.push(`<text x="${n(tx)}" y="${n(headH * 0.84)}" font-family="${HEAD}" font-weight="500" font-size="${n(nameSize)}" fill="${ACCENT}">${esc(hole.name)}</text>`);
  }
  parts.push(`<text x="${n(right)}" y="${n(headH * 0.5)}" text-anchor="end" font-family="${HEAD}" font-weight="700" font-size="${n(parSize)}" fill="#ffffff">PAR ${done ? st.par : "–"}</text>`);
  parts.push(`<text x="${n(right)}" y="${n(headH * 0.8)}" text-anchor="end" font-family="${HEAD}" font-weight="600" font-size="${n(15 * u)}" letter-spacing="${n(0.8 * u)}" fill="${ACCENT}">${done ? big(st.length, units) : "UNFINISHED"}</text>`);

  // Lengths from each tee (chips in the tee colors), the elevation change, how it plays, the pins
  const chips = (x0: number, y: number) => {
    let x = x0;
    const h = 18 * u, fs = 10 * u;
    for (const t of lengths.tees) {
      const L = TEE_LEVELS[t.level];
      const text = `${L.label.toUpperCase()} ${big(t.length, units)}`;
      const w = text.length * fs * 0.52 + 18 * u;
      if (x + w > W - m) break;
      parts.push(`<g data-part="tee-length"><rect x="${n(x)}" y="${n(y - h / 2)}" width="${n(w)}" height="${n(h)}" rx="${n(h / 2)}" fill="${L.color}" stroke="#151a14" stroke-width="${n(0.8 * u)}" stroke-opacity="${L.color === "#f8fafc" ? 1 : 0.35}"/><text x="${n(x + w / 2)}" y="${n(y + 0.5 * u)}" text-anchor="middle" dominant-baseline="central" font-family="${HEAD}" font-weight="600" font-size="${n(fs)}" fill="${L.ink}">${esc(text)}</text></g>`);
      x += w + 6 * u;
    }
  };
  if (!square) chips(m, headH + 15 * u);
  const facts = done ? [`ELEVATION ${fmtElev(st.elevationChange, units).toUpperCase()}`, `PLAYS LIKE ${big(st.playsLike, units)}`] : [];
  if (lengths.pins.length) facts.push(`PINS ${lengths.pins.map(p => `${p.position} ${Math.round(units === "m" ? p.length / FT_PER_M : p.length)}`).join(" · ")}`);
  if (!square && facts.length) parts.push(`<text x="${n(m)}" y="${n(headH + 38 * u)}" font-family="${BODY}" font-weight="700" font-size="${n(9.5 * u)}" letter-spacing="${n(0.4 * u)}" fill="${SOFT}">${esc(facts.join("   ·   "))}</text>`);

  // On the map: north, the scale, the way to the next tee
  const mapTop = box.y;
  const mapBottom = box.y + box.h;
  parts.push(`<g transform="translate(${n(W - 26 * u)} ${n(mapTop + 30 * u)}) rotate(${n(-map.rotation)})">${northArrow(0, 0, 13 * u, pal)}</g>`);
  parts.push(scaleBar(12 * u, mapBottom - 12 * u, map.scale, 0.9 * u, pal, units));
  const next = map.stats[map.stats.indexOf(st) + 1];
  if (next?.complete && done) {
    const from = st.line[st.line.length - 1], to = next.line[0];
    const d = dist(from, to);
    const dir = rotatePoint({ x: to.x - from.x, y: to.y - from.y }, -map.rotation);
    const ang = (Math.atan2(dir.y, dir.x) * 180) / Math.PI;
    const px = W - 74 * u, py = mapBottom - 24 * u;
    parts.push(`<g data-part="next-tee"><rect x="${n(px - 62 * u)}" y="${n(py - 14 * u)}" width="${n(124 * u)}" height="${n(28 * u)}" rx="${n(14 * u)}" fill="#0b120a" fill-opacity="0.85"/><g transform="translate(${n(px - 42 * u)} ${n(py)}) rotate(${n(ang)})"><path d="M${n(-8 * u)} 0H${n(6 * u)}M${n(1 * u)} ${n(-5.5 * u)}L${n(7 * u)} 0L${n(1 * u)} ${n(5.5 * u)}" stroke="#fff" stroke-width="${n(2.8 * u)}" fill="none" stroke-linecap="round" stroke-linejoin="round"/></g><text x="${n(px - 26 * u)}" y="${n(py)}" dominant-baseline="central" font-family="${HEAD}" font-weight="600" font-size="${n(10.5 * u)}" fill="#fff">HOLE ${next.number} · ${esc(fmtDist(d, units).toUpperCase())}</text></g>`);
  }

  // Elevation profile and notes
  const line = done ? throwLine(hole, mainTee ?? null, holeBaskets(doc, holeId).find(b => b.id === st.basketId) ?? null) : [];
  const notes = [hole.notes ?? "", ...(hole.notes ? [] : autoRules(doc, holeId))].filter(Boolean).join(" ") || "Play it as it lies.";
  if (square) {
    const y = H - footH;
    parts.push(`<rect y="${n(y)}" width="${n(W)}" height="${n(footH)}" fill="${DARK}"/>`);
    const pw = W * 0.28;
    parts.push(profile(doc, line, { x: m, y: y + 16 * u, w: pw, h: footH - 32 * u }, { fill: sty.fairway, stroke: "#ffffff", tee: lvl.color, basket: sty.basket, width: 1.8 * u }));
    const nx = m + pw + 18 * u;
    chips(nx, y + 20 * u);
    parts.push(`<text x="${n(nx)}" y="${n(y + 46 * u)}" font-family="${HEAD}" font-weight="600" font-size="${n(12 * u)}" letter-spacing="${n(0.6 * u)}" fill="#ffffff">${esc(facts.join("  ·  "))}</text>`);
    const maxChars = Math.max(12, Math.floor((W - m - nx) / (9.5 * u * 0.55)));
    wrap(notes, maxChars).slice(0, 2).forEach((l, i) => parts.push(`<text x="${n(nx)}" y="${n(y + 64 * u + i * 13 * u)}" font-family="${BODY}" font-size="${n(9.5 * u)}" fill="#e5e7eb">${esc(l)}</text>`));
  } else {
    const y = H - footH;
    parts.push(`<rect y="${n(y)}" width="${n(W)}" height="${n(footH)}" fill="${PAPER}"/><line x1="0" x2="${n(W)}" y1="${n(y)}" y2="${n(y)}" stroke="${INK}" stroke-opacity="0.2"/>`);
    const pw = (W - 2 * m) * 0.5;
    parts.push(`<text x="${n(m)}" y="${n(y + 22 * u)}" font-family="${HEAD}" font-weight="700" font-size="${n(12 * u)}" letter-spacing="${n(0.8 * u)}" fill="${INK}">ELEVATION${done ? ` ${esc(fmtElev(st.elevationChange, units).toUpperCase())}` : ""}</text>`);
    parts.push(profile(doc, line, { x: m, y: y + 32 * u, w: pw, h: 60 * u }, { fill: sty.fairway, stroke: DARK, tee: lvl.color, basket: sty.basket, width: 1.8 * u }));
    if (done) parts.push(`<text x="${n(m)}" y="${n(y + 106 * u)}" font-family="${BODY}" font-size="${n(8 * u)}" fill="${SOFT}">Tee</text><text x="${n(m + pw)}" y="${n(y + 106 * u)}" text-anchor="end" font-family="${BODY}" font-size="${n(8 * u)}" fill="${SOFT}">Basket · plays like ${esc(fmtDist(st.playsLike, units))}</text>`);
    const nx = m + pw + 22 * u, nw = W - m - nx;
    parts.push(`<text x="${n(nx)}" y="${n(y + 22 * u)}" font-family="${HEAD}" font-weight="700" font-size="${n(12 * u)}" letter-spacing="${n(0.8 * u)}" fill="${INK}">HOLE NOTES</text>`);
    const fs = 9.5 * u;
    wrap(notes, Math.max(10, Math.floor(nw / (fs * 0.52)))).slice(0, 6).forEach((l, i) => parts.push(`<text x="${n(nx)}" y="${n(y + 40 * u + i * fs * 1.35)}" font-family="${BODY}" font-size="${n(fs)}" fill="${INK}">${esc(l)}</text>`));
    // Bottom line: what the colors mean, and which hole of how many
    const by = H - 10 * u;
    const shown = markingsInView(doc, map.view);
    const key = [shown.ob && `<tspan fill="${sty.ob}">■</tspan> OB`, shown.hazard && `<tspan fill="${sty.hazard}">■</tspan> Hazard`, shown.mando && `<tspan fill="#f97316">●</tspan> Mando / DZ`].filter(Boolean).join("   ");
    parts.push(`<text x="${n(m)}" y="${n(by)}" font-family="${BODY}" font-size="${n(7.5 * u)}" fill="${SOFT}">${key}</text>`);
    const layout = activeLayout(doc);
    parts.push(`<text x="${n(W - m)}" y="${n(by)}" text-anchor="end" font-family="${BODY}" font-size="${n(7.5 * u)}" fill="${SOFT}">Hole ${st.label} of ${doc.holes.length}${layout && doc.layouts.length > 1 ? ` · ${esc(layout.name)} layout` : ""}</text>`);
  }
  return { svg: wrapSvg(W, H, parts.join("")), width: W, height: H };
};
