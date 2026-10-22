// Tee sign looks beyond the first (lib/teeSign). Trailhead: the sign as a trail's marker, a
// forest-green panel with the hole's number on a cream tab, the painted hole in a cream frame, each
// tee's length on a chip, then the climb, the rules and the way on. Tall signs stack it; wide ones
// set the hole on the left and the rest beside it, with the spot under the chips as picked.
import { FT_PER_M, TEE_LEVELS } from "../constants";
import type { BasketItem, CourseDoc } from "../types";
import { holeTees } from "./course";
import { dist, rotatePoint } from "./geom";
import { holeStats, type HoleStats } from "./holeStats";
import { northArrow, palette, scaleBar, wrapSvg } from "./mapSvg";
import { fmtElev } from "./units";
import { autoRules, cardStyle, elevationProfile, esc, greenView, holeMap, miniCourseMap, signOf, SIGN_SIZES, wrap, type SignArt, type SignSize } from "./teeSign";

const n = (v: number) => (Math.round(v * 100) / 100).toString();
type Box = { x: number; y: number; w: number; h: number };

/** Each tee's length to the hole's basket (the main tee's as the hole's own). */
const teeLengths = (doc: CourseDoc, holeId: string, st: HoleStats) => {
  const hole = doc.holes.find(h => h.id === holeId)!, tees = holeTees(doc, holeId);
  const basket = doc.items.find(i => i.id === st.basketId && i.type === "basket") as BasketItem | undefined;
  const main = tees.find(t => t.id === st.teeId) ?? tees[0];
  return tees.map(t => ({ t, main: t.id === main?.id, len: t.id === main?.id ? st.length : basket ? holeStats(doc, hole, { id: "x", name: "", tee: t.level, pin: basket.position }).length : 0 }));
};

export const renderTrailhead = (doc: CourseDoc, holeId: string, size: SignSize, opts: SignArt) => {
  const hole = doc.holes.find(h => h.id === holeId);
  if (!hole) return null;
  const page = SIGN_SIZES[size];
  const W = page.w * 72, H = page.h * 72, wide = W > H;
  const u = Math.min(W, H) / 864; // 1 on a 12 in side
  const card = cardStyle(doc), sign = signOf(doc, holeId), show = sign.show, sty = doc.style;
  const cream = card.paper, green = card.header;
  const pad = 26 * u, frame = 9 * u, T = (wide ? 124 : 118) * u;
  const big = (ft: number) => `${Math.round(doc.units === "m" ? ft / FT_PER_M : ft).toLocaleString()} ${doc.units === "m" ? "M" : "FT"}`;
  const short = (ft: number) => `${Math.round(doc.units === "m" ? ft / FT_PER_M : ft).toLocaleString()}${doc.units === "m" ? " m" : "′"}`;
  const parts: string[] = [`<rect width="${n(W)}" height="${n(H)}" fill="${green}"/>`];

  // Where things go: wide, the hole on the left and the rest beside it; tall, all stacked
  const chipH = 92 * u, footH = 74 * u;
  const mapBox: Box = wide
    ? { x: pad, y: pad, w: W * 0.4, h: H - 2 * pad }
    : { x: pad, y: pad + T + 22 * u, w: W - 2 * pad, h: H - (pad + T + 22 * u) - (chipH + 18 * u + footH) - pad };
  const col: Box = wide ? { x: mapBox.x + mapBox.w + 26 * u, y: pad, w: W - (mapBox.x + mapBox.w + 26 * u) - pad, h: H - 2 * pad } : { x: pad, y: pad, w: W - 2 * pad, h: H - 2 * pad };

  // The painted hole, in its cream frame
  const inner: Box = { x: mapBox.x + frame, y: mapBox.y + frame, w: mapBox.w - 2 * frame, h: mapBox.h - 2 * frame };
  const map = holeMap(doc, holeId, { w: inner.w, h: inner.h }, opts, 1.5 * u, `th${holeId.slice(-4)}`, true);
  const st = map.st;
  const lens = teeLengths(doc, holeId, st);
  const lvl = TEE_LEVELS[lens.find(l => l.main)?.t.level ?? "blue"];
  const clip = `thmap${holeId.slice(-4)}`;
  parts.push(`<rect x="${n(mapBox.x)}" y="${n(mapBox.y)}" width="${n(mapBox.w)}" height="${n(mapBox.h)}" rx="${n(20 * u)}" fill="${cream}"/>`);
  parts.push(`<clipPath id="${clip}"><rect x="${n(inner.x)}" y="${n(inner.y)}" width="${n(inner.w)}" height="${n(inner.h)}" rx="${n(13 * u)}"/></clipPath><g clip-path="url(#${clip})" data-part="hole-map"><g transform="translate(${n(inner.x)} ${n(inner.y)})">${map.svg}</g></g>`);
  if (show("north")) parts.push(`<g transform="translate(${n(inner.x + inner.w - 30 * u)} ${n(inner.y + 34 * u)}) rotate(${n(-map.rotation)})">${northArrow(0, 0, 18 * u, palette(sty))}</g>`);
  if (show("scale")) parts.push(scaleBar(inner.x + 14 * u, inner.y + inner.h - 16 * u, map.scale, 1.1 * u, palette(sty), doc.units));
  // The way to the next tee, on the map's corner
  const next = map.stats[map.stats.indexOf(st) + 1];
  if (show("nextTee") && next?.complete && st.complete) {
    const from = st.line[st.line.length - 1], to = next.line[0];
    const dir = rotatePoint({ x: to.x - from.x, y: to.y - from.y }, -map.rotation);
    const ang = (Math.atan2(dir.y, dir.x) * 180) / Math.PI;
    const cx = inner.x + inner.w - 96 * u, cy = inner.y + inner.h - 30 * u;
    parts.push(`<g data-part="next-tee"><rect x="${n(cx - 80 * u)}" y="${n(cy - 19 * u)}" width="${n(160 * u)}" height="${n(38 * u)}" rx="${n(19 * u)}" fill="${green}" fill-opacity="0.92"/>`
      + `<g transform="translate(${n(cx - 56 * u)} ${n(cy)}) rotate(${n(ang)})"><path d="M${n(-11 * u)} 0H${n(9 * u)}M${n(3 * u)} ${n(-7 * u)}L${n(10 * u)} 0L${n(3 * u)} ${n(7 * u)}" fill="none" stroke="${cream}" stroke-width="${n(3 * u)}" stroke-linecap="round" stroke-linejoin="round"/></g>`
      + `<text x="${n(cx - 36 * u)}" y="${n(cy)}" dominant-baseline="central" font-family="${card.head}" font-weight="700" font-size="${n(16 * u)}" letter-spacing="${n(1 * u)}" fill="${cream}">HOLE ${esc(next.label)} · ${esc(big(dist(from, to)))}</text></g>`);
  }

  // The number on its cream tab; the course and par over the hole's name
  if (show("number")) {
    parts.push(`<rect x="${n(col.x)}" y="${n(col.y)}" width="${n(T)}" height="${n(T)}" rx="${n(22 * u)}" fill="${cream}"/>`);
    parts.push(`<text x="${n(col.x + T / 2)}" y="${n(col.y + T / 2 + T * 0.03)}" text-anchor="middle" dominant-baseline="central" font-family="${card.head}" font-weight="700" font-size="${n(T * (st.label.length > 2 ? 0.5 : 0.72))}" fill="${green}">${esc(st.label)}</text>`);
  }
  const nx = col.x + (show("number") ? T + 20 * u : 0), nw = col.x + col.w - nx;
  const course = (sty.title || doc.name || "").trim().replace(/\s+disc\s+golf(\s+course)?$/i, "");
  // (a hole without a name of its own: the course's name as its title)
  const title = hole.name?.trim() || (show("courseName") && course) || `Hole ${st.label}`;
  const kicker = [show("courseName") && title !== course && course.toUpperCase(), show("par") && `PAR ${st.complete ? st.par : "–"}`].filter(Boolean).join("  ·  ");
  const kSize = Math.min(17 * u, (nw / Math.max(8, kicker.length)) * 1.6);
  if (kicker) parts.push(`<text x="${n(nx)}" y="${n(col.y + T * 0.36)}" font-family="${card.head}" font-weight="600" font-size="${n(kSize)}" letter-spacing="${n(kSize * 0.24)}" fill="${card.accent}" fill-opacity="0.85">${esc(kicker)}</text>`);
  const tSize = Math.min(52 * u, (nw / Math.max(4, title.length)) * 1.9);
  parts.push(`<text x="${n(nx)}" y="${n(col.y + T * 0.82)}" font-family="${card.head}" font-weight="700" font-size="${n(tSize)}" fill="${cream}">${esc(title)}</text>`);

  // Each tee's length on a chip (wide: and what it plays like, when that differs)
  const chips = show("lengths") ? lens.map(l => ({ label: TEE_LEVELS[l.t.level].label.toUpperCase(), value: l.len ? short(l.len) : "–", color: TEE_LEVELS[l.t.level].color })) : [];
  if (st.complete && show("elevation") && Math.abs(st.playsLike - st.length) >= 10 && chips.length < 4 && !(wide && sign.spot === "stats")) chips.push({ label: "PLAYS LIKE", value: short(st.playsLike), color: sty.fairway });
  const chipY = wide ? col.y + T + 24 * u : mapBox.y + mapBox.h + 18 * u;
  if (chips.length) {
    const gap = 12 * u, cw = Math.min(300 * u, (col.w - gap * (chips.length - 1)) / chips.length);
    chips.forEach((c, i) => {
      const x = col.x + i * (cw + gap);
      parts.push(`<g data-part="tee-chip"><rect x="${n(x)}" y="${n(chipY)}" width="${n(cw)}" height="${n(chipH)}" rx="${n(12 * u)}" fill="${cream}"/>`
        + `<rect x="${n(x + 10 * u)}" y="${n(chipY + 10 * u)}" width="${n(cw - 20 * u)}" height="${n(7 * u)}" rx="${n(3.5 * u)}" fill="${c.color}"${c.color === "#f8fafc" ? ` stroke="${card.ink}" stroke-opacity="0.3" stroke-width="${n(1 * u)}"` : ""}/>`
        + `<text x="${n(x + 12 * u)}" y="${n(chipY + 38 * u)}" font-family="${card.head}" font-weight="600" font-size="${n(13 * u)}" letter-spacing="${n(2.6 * u)}" fill="${card.soft}">${esc(c.label)}</text>`
        + `<text x="${n(x + 12 * u)}" y="${n(chipY + 78 * u)}" font-family="${card.head}" font-weight="700" font-size="${n(Math.min(40 * u, cw * 0.3))}" fill="${card.ink}">${esc(c.value)}</text></g>`);
    });
  }

  // The climb and what it plays like; the rules
  const facts = [
    show("elevation") && st.complete && `${st.elevationChange >= 0 ? "▲" : "▼"} ${fmtElev(st.elevationChange, doc.units).replace(/^[+-]/, st.elevationChange >= 0 ? "+" : "−").toUpperCase()}`,
  ].filter(Boolean) as string[];
  const rules = show("notes") ? [hole.notes ?? "", ...(hole.notes ? [] : autoRules(doc, holeId))].filter(Boolean).join(" ") : "";
  const of = show("holeOf") ? `HOLE ${st.label} OF ${doc.holes.length}` : "";

  if (wide) {
    // The spot under the chips: the green or the course beside the climb, the hole's numbers, or the climb alone
    const top = chipY + (chips.length ? chipH + 22 * u : 0), bottom = col.y + col.h - footH;
    const panel = (b: Box, label: string, body: string, part: string) =>
      `<g data-part="${part}"><rect x="${n(b.x)}" y="${n(b.y)}" width="${n(b.w)}" height="${n(b.h)}" rx="${n(14 * u)}" fill="${cream}" fill-opacity="0.07" stroke="${cream}" stroke-opacity="0.16" stroke-width="${n(1.2 * u)}"/>`
      + `<text x="${n(b.x + 14 * u)}" y="${n(b.y + 24 * u)}" font-family="${card.head}" font-weight="600" font-size="${n(12 * u)}" letter-spacing="${n(2.8 * u)}" fill="${card.accent}" fill-opacity="0.85">${esc(label)}</text>${body}</g>`;
    const inside = (b: Box): Box => ({ x: b.x + 12 * u, y: b.y + 36 * u, w: b.w - 24 * u, h: b.h - 48 * u });
    // (the climb no taller than half its width: a few feet never look like a mountain)
    const low = (b: Box): Box => { const h = Math.min(b.h, b.w * 0.5); return { ...b, y: b.y + b.h - h, h }; };
    const climb = (b: Box) => panel(b, `ELEVATION${st.complete ? ` · ${fmtElev(st.elevationChange, doc.units).toUpperCase()}` : ""}`, st.complete ? elevationProfile(doc, st.line, low(inside(b)), { fill: sty.fairway, stroke: cream, tee: lvl.color, basket: sty.basket, width: 1.8 * u }) : "", "climb");
    if (bottom - top > 120 * u) {
      const h = bottom - top, half = (col.w - 14 * u) / 2;
      const left: Box = { x: col.x, y: top, w: half, h }, right: Box = { x: col.x + half + 14 * u, y: top, w: half, h };
      const done = map.stats.filter(x => x.complete);
      if (sign.spot === "green" && st.complete) {
        parts.push(panel(left, "THE GREEN", greenView(doc, holeId, map, inside(left), opts, u, sign, cream), "spot-green"));
        if (show("elevation")) parts.push(climb(right));
      } else if (sign.spot === "courseMap" && done.length > 1) {
        parts.push(panel(left, "THE COURSE", miniCourseMap(doc, holeId, st, done, inside(left), card, lvl, u), "spot-course"));
        if (show("elevation")) parts.push(climb(right));
      } else if (sign.spot === "stats" && st.complete) {
        const walkTo = next?.complete ? dist(st.line[st.line.length - 1], next.line[0]) : null;
        const tiles: [string, string][] = [["PLAYS LIKE", big(st.playsLike)], ["UP / DOWN", fmtElev(st.elevationChange, doc.units).toUpperCase()], ["FAIRWAY", big(hole.fairwayWidth)], ["TO THE NEXT TEE", walkTo === null ? "–" : big(walkTo)]];
        const gap = 14 * u, tw = (col.w - gap) / 2, th = (h - gap) / 2;
        parts.push(`<g data-part="hole-stats">${tiles.map(([k, v], i) => {
          const b: Box = { x: col.x + (i % 2) * (tw + gap), y: top + Math.floor(i / 2) * (th + gap), w: tw, h: th };
          return panel(b, k, `<text x="${n(b.x + 14 * u)}" y="${n(b.y + b.h - 18 * u)}" font-family="${card.head}" font-weight="700" font-size="${n(Math.min(64 * u, b.h * 0.45))}" fill="${cream}">${esc(v)}</text>`, "stat");
        }).join("")}</g>`);
      } else if (show("elevation")) parts.push(climb({ x: col.x, y: top, w: col.w, h }));
    }
    // Along the bottom: the climb, the rules, which hole of how many
    const line = [...facts, rules].filter(Boolean).join("   ·   ");
    const fs = 15 * u;
    const lines = wrap(line, Math.max(16, Math.floor((col.w - (of ? 150 * u : 0)) / (fs * 0.52)))).slice(0, 2);
    lines.forEach((l, i) => parts.push(`<text x="${n(col.x)}" y="${n(col.y + col.h - footH + 34 * u + i * fs * 1.45)}" font-family="${card.body}" font-weight="500" font-size="${n(fs)}" fill="${cream}" fill-opacity="0.88">${esc(l)}</text>`));
    if (of) parts.push(`<text x="${n(col.x + col.w)}" y="${n(col.y + col.h - footH + 34 * u)}" text-anchor="end" font-family="${card.head}" font-weight="600" font-size="${n(12 * u)}" letter-spacing="${n(2.4 * u)}" fill="${card.accent}" fill-opacity="0.75">${esc(of)}</text>`);
  } else {
    // Under the chips: the climb and which hole of how many, then the rules
    const fy = chipY + chipH + 34 * u;
    if (facts.length) parts.push(`<text x="${n(col.x)}" y="${n(fy)}" font-family="${card.head}" font-weight="600" font-size="${n(17 * u)}" letter-spacing="${n(1.4 * u)}" fill="${cream}">${esc(facts.join("    "))}</text>`);
    if (of) parts.push(`<text x="${n(col.x + col.w)}" y="${n(fy)}" text-anchor="end" font-family="${card.head}" font-weight="600" font-size="${n(13 * u)}" letter-spacing="${n(2.6 * u)}" fill="${card.accent}" fill-opacity="0.75">${esc(of)}</text>`);
    const fs = 14.5 * u;
    wrap(rules, Math.max(16, Math.floor(col.w / (fs * 0.52)))).slice(0, 2).forEach((l, i) => parts.push(`<text x="${n(col.x)}" y="${n(fy + 26 * u + i * fs * 1.4)}" font-family="${card.body}" font-weight="500" font-size="${n(fs)}" fill="${cream}" fill-opacity="0.85">${esc(l)}</text>`));
  }
  if (doc.designer && show("designer")) parts.push(`<text x="${n(W - pad)}" y="${n(H - 10 * u)}" text-anchor="end" font-family="${card.body}" font-weight="600" font-size="${n(9 * u)}" letter-spacing="${n(0.8 * u)}" fill="${cream}" fill-opacity="0.5">DESIGNED BY ${esc(doc.designer.toUpperCase())}</text>`);
  return { svg: wrapSvg(W, H, parts.join("")), width: W, height: H };
};
