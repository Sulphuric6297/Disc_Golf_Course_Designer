// A park's fields, courts and play areas, laid out to real proportions inside their outlines: what
// is painted on the ground (grass, dirt, court colors, white lines, water, mulch) and what stands
// up (goals, nets, hoops, bases, backstops, play structures). Pure: the printed map draws the marks
// as SVG, the 3D view paints them into one texture per field and builds the props.
import { FIELD_KINDS } from "../constants";
import type { AreaItem, FieldKind, MapTheme, P } from "../types";
import { courtGrid, fieldHome, fieldKindOf } from "./fields";
import { offsetPolygon, orientedBox } from "./structures";

// ------------------------------------------------------------------ colors

export type FieldInk =
  | "grass" | "stripe" | "endzone" | "dirt" | "mound" | "chalk" | "court" | "courtOut" | "kitchen" | "key" | "hard"
  | "sand" | "tape" | "water" | "deep" | "lane" | "coping" | "deck" | "rubber" | "track" | "mulch" | "curb" | "concrete"
  | "skate" | "bowl" | "ramp" | "metal" | "splash" | "spray" | "worn" | "bed" | "path" | "plant" | "plant2" | "flower"
  | "flower2" | "play1" | "play2" | "play3" | "wood" | "fence" | "shadow" | "net";

/** Inks that are grass (the 3D grass grows there, mown). */
export const GRASS_INKS = new Set<FieldInk>(["grass", "stripe", "endzone", "worn"]);

const NATURAL: Record<FieldInk, string> = {
  grass: "#5b8a3a", stripe: "#679a44", endzone: "#4f7c33", dirt: "#b17b4e", mound: "#a46c42", chalk: "#f4f4ee",
  court: "#3a6ea9", courtOut: "#4b7e57", kitchen: "#2d5c92", key: "#a34c33", hard: "#5a6168", sand: "#dcc79b", tape: "#2c6db6",
  water: "#45b1dc", deep: "#2f97cc", lane: "#1f4f8c", coping: "#ece7dc", deck: "#d6cfc0", rubber: "#3f7f9a", track: "#b5533c",
  mulch: "#7a5437", curb: "#cfc8b8", concrete: "#c9c4b9", skate: "#bcb8af", bowl: "#a19d94", ramp: "#adaaa2", metal: "#6c7177",
  splash: "#4b8fca", spray: "#eaf7ff", worn: "#9f8c60", bed: "#4f3725", path: "#bdb29a", plant: "#3e7b33", plant2: "#5e9339",
  flower: "#d8577a", flower2: "#e8b33a", play1: "#d24532", play2: "#2f6fd0", play3: "#f2c230", wood: "#b88a58", fence: "#56524c",
  shadow: "#2b2a27", net: "#262626"
};

const hex = (c: string) => { const v = parseInt(c.replace("#", "").slice(0, 6), 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255]; };
const toHex = (r: number, g: number, b: number) => `#${[r, g, b].map(x => Math.round(Math.max(0, Math.min(255, x))).toString(16).padStart(2, "0")).join("")}`;
/** `a` moved toward `b` by `k` (0..1). */
export const mixHex = (a: string, b: string, k: number) => { const x = hex(a), y = hex(b); return toHex(x[0] + (y[0] - x[0]) * k, x[1] + (y[1] - x[1]) * k, x[2] + (y[2] - x[2]) * k); };
const lighten = (a: string, k: number) => (k >= 0 ? mixHex(a, "#ffffff", k) : mixHex(a, "#000000", -k));

/**
 * The colors fields are drawn in: as they really are ("natural", the 3D view), or toned for a map
 * style. `grass` is the map's own fairway color, which the fields' grass leans toward.
 */
export const fieldInks = (look: MapTheme | "natural", grass?: string): Record<FieldInk, string> => {
  const c = { ...NATURAL };
  if (grass && /^#[0-9a-f]{6}$/i.test(grass)) {
    c.grass = mixHex(NATURAL.grass, grass, look === "natural" ? 0.35 : 0.7);
    c.stripe = lighten(c.grass, 0.09);
    c.endzone = lighten(c.grass, -0.12);
    c.worn = mixHex(c.grass, NATURAL.worn, 0.6);
  }
  const all = (f: (v: string) => string, keep: FieldInk[] = []) => { for (const k of Object.keys(c) as FieldInk[]) if (!keep.includes(k)) c[k] = f(c[k]); };
  switch (look) {
    case "illustrated": all(v => lighten(v, 0.1), ["grass", "stripe", "endzone", "chalk"]); break;
    case "topo": all(v => mixHex(v, "#fbf7ea", 0.35), ["chalk"]); break;
    case "minimal": all(v => mixHex(v, "#ffffff", 0.55), ["chalk"]); c.chalk = "#ffffff"; c.fence = "#8a8a8a"; c.net = "#555555"; break;
    case "night": all(v => lighten(v, -0.45)); c.chalk = "#dfe6e1"; c.spray = "#bfe4f5"; break;
    case "forest": all(v => lighten(v, -0.06), ["chalk"]); break;
    case "natural":
      // (the 3D view lights them brightly: a little deeper, the pale paving most)
      all(v => lighten(v, -0.14), ["chalk", "spray", "coping"]);
      for (const k of ["concrete", "skate", "bowl", "ramp", "deck", "curb", "sand"] as FieldInk[]) c[k] = lighten(c[k], -0.12);
      break;
    default: break;
  }
  return c;
};

// ------------------------------------------------------------------ what a field is made of

/** A mark painted on the ground: a filled shape, a line (`w` ft wide; `dash` ft on and off), or a
 * disc. Marks are clipped to the outline unless `out` (a pool's deck round its water). `minor`:
 * a fine line that a small map may draw fainter. `up`: something that stands up (a play
 * structure, a net, a raised bed), drawn on maps but left off the 3D ground, where it stands. */
export type FieldMark = (
  | { k: "fill"; pts: P[]; ink: FieldInk; out?: boolean }
  | { k: "line"; pts: P[]; w: number; ink: FieldInk; closed?: boolean; dash?: [number, number]; round?: boolean; out?: boolean; minor?: boolean }
  | { k: "disc"; c: P; r: number; ink: FieldInk; out?: boolean }
) & { up?: boolean };

/** What stands up, at real size (ft): `dir` is a unit vector in plan coordinates. */
export type FieldProp =
  | { k: "goal"; at: P; dir: P; w: number; h: number }
  | { k: "uprights"; at: P; dir: P; w: number }
  | { k: "net"; a: P; b: P; top: number; mid: number; drop: number; post: number }
  | { k: "hoop"; at: P; dir: P }
  | { k: "base"; at: P; dir: P; size: number; h: number }
  | { k: "fence"; pts: P[]; h: number; closed?: boolean }
  | { k: "deck"; c: P; u: P; size: number; h: number; color: string; roof?: string }
  | { k: "slide"; from: P; to: P; top: number; color: string }
  | { k: "bridge"; a: P; b: P; h: number }
  | { k: "swings"; c: P; u: P; len: number; seats: number }
  | { k: "ramp"; c: P; u: P; len: number; w: number; h: number }
  | { k: "rail"; a: P; b: P; h: number }
  | { k: "bars"; a: P; b: P; h: number }
  | { k: "spray"; at: P; h: number; color: string }
  | { k: "bed"; pts: P[]; h: number }
  | { k: "plant"; at: P; r: number; color: string };

export type FieldPlan = {
  kind: FieldKind;
  outline: P[];
  marks: FieldMark[];
  props: FieldProp[];
  /** How far past the outline the marks reach (ft). */
  reach: number;
};

/** A frame lined up with the outline's long side (turned `turn` degrees): its middle `c`, its
 * length direction `u` and width direction `v`, half the length `a` and half the width `b`. */
type Frame = { c: P; u: P; v: P; a: number; b: number };

const frameOf = (pts: P[], turn = 0): Frame => {
  const box = orientedBox(pts);
  const r = (turn * Math.PI) / 180, cs = Math.cos(r), sn = Math.sin(r);
  const u = { x: box.u.x * cs - box.u.y * sn, y: box.u.x * sn + box.u.y * cs }, v = { x: -u.y, y: u.x };
  let s0 = Infinity, s1 = -Infinity, t0 = Infinity, t1 = -Infinity;
  for (const p of pts) {
    const s = p.x * u.x + p.y * u.y, t = p.x * v.x + p.y * v.y;
    s0 = Math.min(s0, s); s1 = Math.max(s1, s); t0 = Math.min(t0, t); t1 = Math.max(t1, t);
  }
  const cs0 = (s0 + s1) / 2, ct0 = (t0 + t1) / 2;
  return { c: { x: u.x * cs0 + v.x * ct0, y: u.y * cs0 + v.y * ct0 }, u, v, a: (s1 - s0) / 2, b: (t1 - t0) / 2 };
};

const add = (p: P, d: P, k: number): P => ({ x: p.x + d.x * k, y: p.y + d.y * k });
const len = (d: P) => Math.hypot(d.x, d.y);
const unit = (d: P): P => { const l = len(d) || 1; return { x: d.x / l, y: d.y / l }; };
const turnBy = (d: P, deg: number): P => { const r = (deg * Math.PI) / 180; return { x: d.x * Math.cos(r) - d.y * Math.sin(r), y: d.x * Math.sin(r) + d.y * Math.cos(r) }; };
const clampN = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/** Points round an ellipse (or a circle), `n` of them. */
const ellipse = (c: P, ax: P, rx: number, ry: number, n = 40, from = 0, to = Math.PI * 2): P[] => {
  const ay = { x: -ax.y, y: ax.x };
  const closed = Math.abs(to - from - Math.PI * 2) < 1e-6;
  const m = closed ? n : n + 1;
  return Array.from({ length: m }, (_, i) => {
    const t = from + ((to - from) * i) / n;
    return { x: c.x + ax.x * Math.cos(t) * rx + ay.x * Math.sin(t) * ry, y: c.y + ax.y * Math.cos(t) * rx + ay.y * Math.sin(t) * ry };
  });
};

/** A stadium (a running track's shape): straights `s` long either way of the middle, ends round. */
const stadium = (at: (s: number, t: number) => P, s: number, r: number, n = 24): P[] => {
  const out: P[] = [];
  for (let i = 0; i <= n; i++) { const t = -Math.PI / 2 + (Math.PI * i) / n; out.push(at(s + Math.cos(t) * r, Math.sin(t) * r)); }
  for (let i = 0; i <= n; i++) { const t = Math.PI / 2 + (Math.PI * i) / n; out.push(at(-s + Math.cos(t) * r, Math.sin(t) * r)); }
  return out;
};

/** The part of a polygon on the side of a line where dot(p - o, nrm) <= off. */
const clipHalf = (poly: P[], o: P, nrm: P, off: number) => {
  const side = (p: P) => (p.x - o.x) * nrm.x + (p.y - o.y) * nrm.y - off;
  const out: P[] = [];
  poly.forEach((cur, i) => {
    const prev = poly[(i + poly.length - 1) % poly.length];
    const sc = side(cur), sp = side(prev);
    if ((sc <= 0) !== (sp <= 0)) { const t = sp / (sp - sc); out.push({ x: prev.x + (cur.x - prev.x) * t, y: prev.y + (cur.y - prev.y) * t }); }
    if (sc <= 0) out.push(cur);
  });
  return out;
};

/** Where a ray from `o` along `d` first leaves the outline: how far, the edge it crosses and the point. */
const rayOut = (poly: P[], o: P, d: P) => {
  let best = { t: Infinity, edge: -1, p: o };
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const ex = b.x - a.x, ey = b.y - a.y;
    const den = d.x * ey - d.y * ex;
    if (Math.abs(den) < 1e-9) continue;
    const t = ((a.x - o.x) * ey - (a.y - o.y) * ex) / den;
    const s = ((a.x - o.x) * d.y - (a.y - o.y) * d.x) / den;
    if (t > 1e-6 && s >= 0 && s <= 1 && t < best.t) best = { t, edge: i, p: { x: o.x + d.x * t, y: o.y + d.y * t } };
  }
  return best;
};

const seeded = (seed: number) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

// ------------------------------------------------------------------ the layouts

/** A field's layout, or null for an outline too small to hold one. */
export const fieldPlan = (a: Pick<AreaItem, "points" | "field" | "fieldTurn" | "home" | "id">): FieldPlan | null => {
  const outline = a.points;
  if (outline.length < 3) return null;
  const kind = fieldKindOf(a);
  const F = frameOf(outline, a.fieldTurn ?? 0);
  if (F.a < 2 || F.b < 2) return null;
  const at = (s: number, t: number): P => ({ x: F.c.x + F.u.x * s + F.v.x * t, y: F.c.y + F.u.y * s + F.v.y * t });
  const rect = (s0: number, t0: number, s1: number, t1: number) => [at(s0, t0), at(s1, t0), at(s1, t1), at(s0, t1)];
  const marks: FieldMark[] = [];
  const props: FieldProp[] = [];
  const plan: FieldPlan = { kind, outline, marks, props, reach: 0 };
  const fill = (pts: P[], ink: FieldInk, out = false) => marks.push({ k: "fill", pts, ink, ...(out ? { out } : {}) });
  const line = (pts: P[], w: number, ink: FieldInk = "chalk", more: Partial<Extract<FieldMark, { k: "line" }>> = {}) => marks.push({ k: "line", pts, w, ink, ...more });
  const box = (pts: P[], w: number, ink: FieldInk = "chalk", more: Partial<Extract<FieldMark, { k: "line" }>> = {}) => line(pts, w, ink, { closed: true, ...more });
  const disc = (c: P, r: number, ink: FieldInk) => marks.push({ k: "disc", c, r, ink });
  /** Mown stripes across the length. */
  const stripes = (n: number) => {
    const w = (2 * F.a) / n;
    for (let i = 1; i < n; i += 2) fill(rect(-F.a + i * w, -F.b - 1, -F.a + (i + 1) * w, F.b + 1), "stripe");
  };

  switch (kind) {
    case "baseball":
    case "softball":
      ballField(plan, fieldHome(a), kind === "softball");
      break;

    case "soccer": {
      fill(outline, "grass");
      const L = 2 * F.a, W = 2 * F.b;
      stripes(Math.max(6, Math.round(L / 28) * 2));
      const m = clampN(Math.min(L, W) * 0.03, 2, 10);
      const hl = F.a - m, hw = F.b - m;
      const k = clampN(Math.min(L / 330, W / 210), 0.32, 1);
      const lw = 0.4;
      box(rect(-hl, -hw, hl, hw), lw);
      line([at(0, -hw), at(0, hw)], lw);
      box(ellipse(at(0, 0), F.u, 30 * k, 30 * k, 48), lw);
      disc(at(0, 0), 0.9, "chalk");
      for (const sg of [-1, 1]) {
        const pd = 54 * k, pw = Math.min(66 * k, hw - 3), gd = 18 * k, gw = Math.min(30 * k, hw - 4);
        line([at(sg * hl, -pw), at(sg * (hl - pd), -pw), at(sg * (hl - pd), pw), at(sg * hl, pw)], lw);
        line([at(sg * hl, -gw), at(sg * (hl - gd), -gw), at(sg * (hl - gd), gw), at(sg * hl, gw)], lw);
        const spot = sg * (hl - 36 * k);
        disc(at(spot, 0), 0.9, "chalk");
        // (the penalty arc: the part of the circle round the spot outside the box)
        const r = 30 * k, edge = Math.acos(clampN((pd - 36 * k) / r, -1, 1));
        line(ellipse(at(spot, 0), { x: -sg * F.u.x, y: -sg * F.u.y }, r, r, 20, -edge, edge), lw);
        // (the corner arcs, a quarter circle into the field from each corner)
        for (const tg of [-1, 1]) { const from = tg === sg ? 0 : -Math.PI / 2; line(ellipse(at(sg * hl, tg * hw), { x: -sg * F.u.x, y: -sg * F.u.y }, 3 * k, 3 * k, 6, from, from + Math.PI / 2), lw); }
        const gwid = Math.max(12, 24 * k);
        props.push({ k: "goal", at: at(sg * hl, 0), dir: { x: -sg * F.u.x, y: -sg * F.u.y }, w: gwid, h: gwid >= 20 ? 8 : 6.5 });
      }
      break;
    }

    case "football": {
      fill(outline, "grass");
      const L = 2 * F.a, W = 2 * F.b;
      const m = clampN(Math.min(L, W) * 0.04, 3, 12);
      const hl = F.a - m, hw = F.b - m;
      const yd = (2 * hl) / 120;
      for (const sg of [-1, 1]) fill(rect(sg * hl, -hw, sg * (hl - 10 * yd), hw), "endzone");
      stripes(24);
      box(rect(-hl, -hw, hl, hw), Math.max(0.5, Math.min(2, yd * 0.6)));
      for (let i = 0; i <= 20; i++) {
        const s = -hl + 10 * yd + i * 5 * yd;
        line([at(s, -hw), at(s, hw)], i === 0 || i === 20 ? 0.67 : 0.33, "chalk", { minor: i % 2 === 1 });
      }
      // Hash marks every yard, by the sidelines and in from them
      const ticks: P[][] = [];
      for (let y = 1; y < 100; y++) {
        if (y % 5 === 0) continue;
        const s = -hl + 10 * yd + y * yd;
        for (const t of [-hw + 0.7, hw - 2.7, -hw / 3 - 1, hw / 3 - 1]) ticks.push([at(s, t), at(s, t + 2)]);
      }
      for (const tk of ticks) line(tk, 0.33, "chalk", { minor: true });
      for (const sg of [-1, 1]) props.push({ k: "uprights", at: at(sg * hl, 0), dir: { x: -sg * F.u.x, y: -sg * F.u.y }, w: 18.5 });
      break;
    }

    case "multi": {
      fill(outline, "grass");
      stripes(Math.max(4, Math.round(F.a / 14) * 2));
      const m = clampN(Math.min(F.a, F.b) * 0.06, 2, 10);
      box(rect(-F.a + m, -F.b + m, F.a - m, F.b - m), 0.33, "chalk", { minor: true });
      break;
    }

    case "tennis":
    case "pickleball":
    case "basketball":
    case "volleyball":
      courts(plan, kind, a.fieldTurn ?? 0);
      break;

    case "playground": {
      fill(outline, "mulch");
      line(outline, 1.6, "curb", { closed: true });
      playground(plan, F, a.id ?? "");
      break;
    }

    case "pool": {
      line(outline, 12, "deck", { closed: true, out: true });
      fill(outline, "water");
      // (lighter in the shallows round the edge)
      fill(offsetPolygon(outline, -Math.min(4, Math.min(F.a, F.b) * 0.3)), "deep");
      // Lanes along a long, square-ish pool
      if (F.a >= 30 && F.b >= 10 && Math.abs(polyArea(outline)) > 0.8 * 4 * F.a * F.b) {
        const n = Math.max(2, Math.floor((2 * F.b) / 7));
        const lw = (2 * F.b) / n;
        for (let i = 0; i < n; i++) {
          const t = -F.b + lw * (i + 0.5);
          line([at(-F.a + 6, t), at(F.a - 6, t)], 0.8, "lane");
          for (const sg of [-1, 1]) line([at(sg * (F.a - 6), t - 1.5), at(sg * (F.a - 6), t + 1.5)], 0.8, "lane");
        }
      }
      line(outline, 1.6, "coping", { closed: true, out: true });
      plan.reach = 6;
      break;
    }

    case "splash": {
      fill(outline, "concrete");
      const r = Math.min(F.a, F.b) * 0.8;
      fill(ellipse(F.c, F.u, r, r, 48), "splash");
      box(ellipse(F.c, F.u, r, r, 48), 0.8, "coping");
      disc(F.c, r * 0.22, "play3");
      const rnd = seeded(7);
      for (let i = 0; i < 9; i++) {
        const t = (i / 9) * Math.PI * 2;
        const p = add(F.c, turnBy(F.u, (t * 180) / Math.PI), r * 0.62);
        disc(p, Math.max(0.8, r * 0.07), "spray");
        if (i % 3 === 0) props.push({ k: "spray", at: p, h: 3 + rnd() * 5, color: ["#2f6fd0", "#f2c230", "#3a9d4f"][i / 3] });
      }
      break;
    }

    case "skate": {
      fill(outline, "skate");
      const A = F.a, B = F.b;
      // A bowl at one end, a quarter pipe at the other, a rail between
      const bc = at(-A * 0.42, 0), brx = A * 0.4, bry = B * 0.62;
      fill(ellipse(bc, F.u, brx, bry, 40), "bowl");
      fill(ellipse(add(bc, F.u, brx * 0.08), F.u, brx * 0.6, bry * 0.55, 32), "ramp");
      box(ellipse(bc, F.u, brx, bry, 40), 0.7, "coping");
      const qd = Math.min(12, A * 0.22);
      fill(rect(A - qd - 1, -B * 0.7, A - 1, B * 0.7), "ramp");
      for (let i = 1; i <= 3; i++) line([at(A - 1 - qd * (i / 4), -B * 0.7), at(A - 1 - qd * (i / 4), B * 0.7)], 0.3, "bowl", { minor: true });
      line([at(A - qd - 1, -B * 0.7), at(A - qd - 1, B * 0.7)], 0.5, "coping");
      line([at(A * 0.02, -B * 0.35), at(A * 0.32, -B * 0.35)], 0.5, "metal", { up: true });
      props.push({ k: "ramp", c: at(A - 1 - qd / 2, 0), u: { x: F.u.x, y: F.u.y }, len: qd, w: B * 1.4, h: Math.min(6, qd * 0.5) });
      props.push({ k: "rail", a: at(A * 0.02, -B * 0.35), b: at(A * 0.32, -B * 0.35), h: 1.4 });
      break;
    }

    case "track": {
      fill(outline, "grass");
      const m = 2;
      const R = F.b - m, S = Math.max(0, F.a - m - R);
      // (lanes 4 ft wide, eight of them on a full-size track, fewer on a smaller one)
      const n = clampN(Math.round((R * 0.22) / 4), 3, 8);
      const lw = Math.min(4, (R * 0.3) / n);
      const inner = R - n * lw;
      fill(stadium(at, S, R, 32), "track");
      fill(stadium(at, S, inner, 32), "grass");
      for (let i = 0; i <= n; i++) box(stadium(at, S, inner + i * lw, 32), i === 0 || i === n ? 0.4 : 0.17, "chalk", { minor: i > 0 && i < n });
      line([at(S * 0.6, inner), at(S * 0.6, R)], 0.4);
      break;
    }

    case "dog": {
      fill(outline, "grass");
      const rnd = seeded(13);
      for (let i = 0; i < 3; i++) {
        const c = at((rnd() - 0.5) * F.a * 1.2, (rnd() - 0.5) * F.b * 1.2);
        fill(ellipse(c, turnBy(F.u, rnd() * 180), Math.min(F.a, F.b) * (0.12 + rnd() * 0.12), Math.min(F.a, F.b) * (0.08 + rnd() * 0.08), 20), "worn");
      }
      // The gate's worn patch, at the middle of the first side
      const g0 = outline[0], g1 = outline[1];
      fill(ellipse({ x: (g0.x + g1.x) / 2, y: (g0.y + g1.y) / 2 }, unit({ x: g1.x - g0.x, y: g1.y - g0.y }), 9, 6, 20), "worn");
      line(outline, 0.6, "fence", { closed: true, dash: [2.5, 1.5] });
      props.push({ k: "fence", pts: outline, h: 5, closed: true });
      break;
    }

    case "garden":
      garden(plan, F, a.id ?? "");
      break;
  }
  return plan;
};

const polyArea = (pts: P[]) => pts.reduce((s, p, i) => { const q = pts[(i + 1) % pts.length]; return s + p.x * q.y - q.x * p.y; }, 0) / 2;

/**
 * A baseball or softball field: home plate at a corner, the bases on a diamond as big as the field
 * allows (90 ft bases on a full baseball field, 60 on a softball or a Little League one), the dirt
 * infield, the mound or pitcher's circle, foul lines out to the outline, a warning track along the
 * outfield and a chain-link backstop behind home.
 */
const ballField = (plan: FieldPlan, hi: number, soft: boolean) => {
  const { outline, marks, props } = plan;
  const fill = (pts: P[], ink: FieldInk) => marks.push({ k: "fill", pts, ink });
  const line = (pts: P[], w: number, ink: FieldInk = "chalk", closed = false) => marks.push({ k: "line", pts, w, ink, closed });
  fill(outline, "grass");
  const corner = outline[hi];
  const prev = outline[(hi + outline.length - 1) % outline.length], next = outline[(hi + 1) % outline.length];
  let f = unit({ x: unit({ x: prev.x - corner.x, y: prev.y - corner.y }).x + unit({ x: next.x - corner.x, y: next.y - corner.y }).x, y: unit({ x: prev.x - corner.x, y: prev.y - corner.y }).y + unit({ x: next.x - corner.x, y: next.y - corner.y }).y });
  if (!Number.isFinite(f.x) || len(f) < 0.5) f = unit({ x: polyCentroid(outline).x - corner.x, y: polyCentroid(outline).y - corner.y });
  const D0 = rayOut(outline, corner, f).t;
  if (!Number.isFinite(D0) || D0 < 30) return;
  const s = soft ? clampN(D0 * 0.27, 35, 60) : clampN(D0 * 0.25, 40, 90);
  const sc = s / (soft ? 60 : 90);
  const rb = clampN(s * 0.33, 12, 30);
  const H = add(corner, f, rb);
  const right = { x: -f.y, y: f.x };
  const at = (x: number, y: number): P => ({ x: H.x + f.x * x + right.x * y, y: H.y + f.y * x + right.y * y });
  // The outfield mown in bands across the line to center field
  const band = clampN(D0 * 0.05, 8, 20), wide = D0 * 1.5;
  for (let d = -rb; d < D0 * 1.2; d += band * 2) marks.push({ k: "fill", pts: [at(d, -wide), at(d + band, -wide), at(d + band, wide), at(d, wide)], ink: "stripe" });
  const q = s / Math.SQRT2;
  const first = at(q, q), second = at(2 * q, 0), third = at(q, -q);
  const dR = turnBy(f, 45), dL = turnBy(f, -45);
  const hitR = rayOut(outline, H, dR), hitL = rayOut(outline, H, dL);
  // The outfield: the outline between the foul lines, away from home
  const fence: P[] = [];
  if (hitR.edge >= 0 && hitL.edge >= 0) {
    const n = outline.length;
    const walk = (from: number, to: number, step: 1 | -1) => {
      const pts: P[] = [];
      let i = from, guard = 0;
      while (i !== to && guard++ < n) { i = (i + step + n) % n; pts.push(outline[i]); if (i === hi) return null; }
      return pts;
    };
    const fwd = walk(hitR.edge, hitL.edge, 1), back = walk((hitR.edge + 1) % n, (hitL.edge + 1) % n, -1);
    const mid = fwd ?? back;
    if (mid) fence.push(hitR.p, ...mid, hitL.p);
  }
  // Warning track along the outfield fence
  if (fence.length >= 2) line(fence, clampN(D0 * 0.035, 6, 15) * 2, "dirt");
  // The infield dirt: round the mound out to the edge of the grass, between the foul lines
  const mound = at((soft ? 43 : 60.5) * sc, 0);
  const R = (soft ? 63 : 95) * sc;
  let dirt = ellipse(mound, f, R, R, 56);
  const nR = turnBy(f, 135), nL = turnBy(f, -135);
  dirt = clipHalf(dirt, H, nR, 4 * sc);
  dirt = clipHalf(dirt, H, nL, 4 * sc);
  dirt = clipHalf(dirt, H, { x: -f.x, y: -f.y }, 2 * sc);
  fill(dirt, "dirt");
  // Baseball's infield grass, inside the base paths
  if (!soft) {
    const w = 3.5 * sc;
    fill([at(w * Math.SQRT2 + 4 * sc, 0), at(q, q - w * Math.SQRT2), at(2 * q - w * Math.SQRT2, 0), at(q, -q + w * Math.SQRT2)], "grass");
  }
  marks.push({ k: "disc", c: H, r: 13 * sc, ink: "dirt" });
  for (const b of [first, second, third]) marks.push({ k: "disc", c: b, r: 6 * sc, ink: "dirt" });
  if (soft) marks.push({ k: "line", pts: ellipse(mound, f, 8, 8, 32), w: 0.25, ink: "chalk", closed: true });
  else marks.push({ k: "disc", c: mound, r: 9 * sc, ink: "mound" });
  // Foul lines, out to the outline
  if (Number.isFinite(hitR.t)) line([H, hitR.p], 0.33);
  if (Number.isFinite(hitL.t)) line([H, hitL.p], 0.33);
  // Batter's boxes, home plate, the rubber and the bases
  for (const sg of [-1, 1]) line([at(-3, sg * 1.2), at(3, sg * 1.2), at(3, sg * 5.2), at(-3, sg * 5.2)], 0.25, "chalk", true);
  fill([at(0.35, -0.71), at(0.35, 0.71), at(-0.35, 0.71), at(-0.85, 0), at(-0.35, -0.71)], "chalk");
  const pitch = (soft ? 43 : 60.5) * sc;
  fill([at(pitch - 0.25, -1), at(pitch + 0.25, -1), at(pitch + 0.25, 1), at(pitch - 0.25, 1)], "chalk");
  const bs = 1.25;
  for (const b of [first, second, third]) {
    fill([add(add(b, dR, bs / 2), dL, bs / 2), add(add(b, dR, bs / 2), dL, -bs / 2), add(add(b, dR, -bs / 2), dL, -bs / 2), add(add(b, dR, -bs / 2), dL, bs / 2)], "chalk");
    props.push({ k: "base", at: b, dir: dR, size: bs, h: 0.25 });
  }
  // The backstop: chain link round behind home
  const back: P[] = [];
  for (let i = 0; i <= 12; i++) back.push(add(H, turnBy(f, 112 + (136 * i) / 12), rb));
  props.push({ k: "fence", pts: back, h: soft ? 14 : 16 });
  if (fence.length >= 2) props.push({ k: "fence", pts: fence, h: soft ? 5 : 6 });
  plan.reach = 0;
};

const polyCentroid = (pts: P[]) => ({ x: pts.reduce((s, p) => s + p.x, 0) / pts.length, y: pts.reduce((s, p) => s + p.y, 0) / pts.length });

/** One court of each kind: its length and width (ft). */
const COURTS = {
  tennis: { L: 78, W: 36 },
  pickleball: { L: 44, W: 20 },
  basketball: { L: 94, W: 50 },
  volleyball: { L: 52.5, W: 26.25 }
};

/**
 * Courts side by side or end to end, as many as the outline holds (the grid the panel counts them
 * on), each at its real size in its share of the outline (smaller if that's too small): tennis and
 * pickleball in blue on a green surround with their lines and nets (and the fence round tennis
 * courts); basketball with the keys, circles and three-point arcs and a hoop at each end (half a
 * court when its share is short); sand volleyball with its boundary straps and net.
 */
const courts = (plan: FieldPlan, kind: keyof typeof COURTS, turn: number) => {
  const { marks, props, outline } = plan;
  const F = frameOf(outline, turn);
  const [cl, cw] = FIELD_KINDS[kind].size;
  // (turned by hand: the grid in the turned frame, worked out the same way)
  const grid = turn ? (() => {
    const long = 2 * F.a, short = 2 * F.b;
    const fit = (l: number, w: number) => {
      const nx = Math.max(1, Math.round(long / l)), ny = Math.max(1, Math.round(short / w));
      return { nx, ny, miss: Math.abs(long - nx * l) / long + Math.abs(short - ny * w) / short };
    };
    const across = fit(cw, cl), along = fit(cl, cw);
    return across.miss <= along.miss ? { ...across, across: true } : { ...along, across: false };
  })() : courtGrid(kind, outline);
  const { nx, ny, across } = grid;
  const at = (s: number, t: number): P => ({ x: F.c.x + F.u.x * s + F.v.x * t, y: F.c.y + F.u.y * s + F.v.y * t });
  const fill = (pts: P[], ink: FieldInk) => marks.push({ k: "fill", pts, ink });
  const line = (pts: P[], w: number, ink: FieldInk = "chalk", closed = false) => marks.push({ k: "line", pts, w, ink, closed });
  fill(outline, kind === "volleyball" ? "sand" : kind === "basketball" ? "hard" : "courtOut");
  const cu = (2 * F.a) / nx, cv = (2 * F.b) / ny;
  const lw = 0.17;
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < ny; j++) {
      const mid = { s: -F.a + cu * (i + 0.5), t: -F.b + cv * (j + 0.5) };
      // The court's own frame: x along its length, y across it
      const availL = across ? cv : cu, availW = across ? cu : cv;
      const half = kind === "basketball" && availL < 70;
      const L0 = half ? 47 : COURTS[kind].L, W0 = COURTS[kind].W;
      const k = Math.max(0.3, Math.min(1, availL / (half ? 47 * 1.08 : cl), availW / cw));
      const ux = across ? { x: F.v.x, y: F.v.y } : { x: F.u.x, y: F.u.y };
      const vy = { x: -ux.y, y: ux.x };
      const c0 = at(mid.s, mid.t);
      const C = (x: number, y: number): P => ({ x: c0.x + ux.x * x + vy.x * y, y: c0.y + ux.y * x + vy.y * y });
      const R = (x0: number, y0: number, x1: number, y1: number) => [C(x0, y0), C(x1, y0), C(x1, y1), C(x0, y1)];
      const hl = (L0 * k) / 2, hw = (W0 * k) / 2;
      if (kind === "tennis") {
        fill(R(-hl, -hw, hl, hw), "court");
        line(R(-hl, -hw, hl, hw), 0.33, "chalk", true);
        const sw = 13.5 * k, sl = 21 * k;
        line([C(-hl, -sw), C(hl, -sw)], lw);
        line([C(-hl, sw), C(hl, sw)], lw);
        line([C(-sl, -sw), C(-sl, sw)], lw);
        line([C(sl, -sw), C(sl, sw)], lw);
        line([C(-sl, 0), C(sl, 0)], lw);
        line([C(-hl, 0), C(-hl + 0.5, 0)], lw);
        line([C(hl, 0), C(hl - 0.5, 0)], lw);
        line([C(0, -hw - 3 * k), C(0, hw + 3 * k)], 0.35, "net");
        props.push({ k: "net", a: C(0, -hw - 3 * k), b: C(0, hw + 3 * k), top: 3.5, mid: 3, drop: 3.5, post: 3.6 });
      } else if (kind === "pickleball") {
        fill(R(-hl, -hw, hl, hw), "court");
        fill(R(-7 * k, -hw, 7 * k, hw), "kitchen");
        line(R(-hl, -hw, hl, hw), lw, "chalk", true);
        line([C(-7 * k, -hw), C(-7 * k, hw)], lw);
        line([C(7 * k, -hw), C(7 * k, hw)], lw);
        line([C(-hl, 0), C(-7 * k, 0)], lw);
        line([C(7 * k, 0), C(hl, 0)], lw);
        line([C(0, -hw - 1), C(0, hw + 1)], 0.3, "net");
        props.push({ k: "net", a: C(0, -hw - 1), b: C(0, hw + 1), top: 3, mid: 2.83, drop: 2.6, post: 3.1 });
      } else if (kind === "volleyball") {
        line(R(-hl, -hw, hl, hw), 0.25, "tape", true);
        line([C(0, -hw - 3), C(0, hw + 3)], 0.3, "net");
        props.push({ k: "net", a: C(0, -hw - 3), b: C(0, hw + 3), top: 7.97, mid: 7.9, drop: 3.3, post: 8.4 });
      } else {
        // Basketball: the keys, the circles and the three-point arcs; a hoop at each end
        line(R(-hl, -hw, hl, hw), lw, "chalk", true);
        if (!half) {
          line([C(0, -hw), C(0, hw)], lw);
          line(ellipse(C(0, 0), ux, 6 * k, 6 * k, 32), lw, "chalk", true);
        } else line(ellipse(C(-hl, 0), ux, 6 * k, 6 * k, 16, -Math.PI / 2, Math.PI / 2), lw);
        for (const sg of half ? [1] : [-1, 1]) {
          const base = sg * hl, ft = sg * (hl - 19 * k), lane = 6 * k;
          fill([C(base, -lane), C(ft, -lane), C(ft, lane), C(base, lane)], "key");
          line([C(base, -lane), C(ft, -lane), C(ft, lane), C(base, lane)], lw);
          const out = { x: -sg * ux.x, y: -sg * ux.y };
          line(ellipse(C(ft, 0), out, 6 * k, 6 * k, 16, -Math.PI / 2, Math.PI / 2), lw);
          marks.push({ k: "line", pts: ellipse(C(ft, 0), out, 6 * k, 6 * k, 16, Math.PI / 2, Math.PI * 1.5), w: lw, ink: "chalk", dash: [1.2, 1] });
          const rim = sg * (hl - 5.25 * k), r3 = Math.min(19.75 * k, hw - 0.5);
          const reach = Math.acos(clampN((-5.25 * k) / r3, -1, 1));
          line(ellipse(C(rim, 0), out, r3, r3, 28, -reach, reach), lw);
          props.push({ k: "hoop", at: C(rim, 0), dir: out });
        }
      }
    }
  }
  if (kind === "tennis") props.push({ k: "fence", pts: outline, h: 10, closed: true });
};

/**
 * A playground: a play structure (platforms, one with a roof, a bridge between, two slides) and,
 * where there's room, a swing set over a rubber pad, on mulch inside a curb.
 */
const playground = (plan: FieldPlan, F: Frame, id: string) => {
  const { marks, props } = plan;
  const fill = (pts: P[], ink: FieldInk) => marks.push({ k: "fill", pts, ink });
  const line = (pts: P[], w: number, ink: FieldInk, round = false) => marks.push({ k: "line", pts, w, ink, round });
  const at = (s: number, t: number): P => ({ x: F.c.x + F.u.x * s + F.v.x * t, y: F.c.y + F.u.y * s + F.v.y * t });
  const swings = F.a * 2 >= 55 && F.b * 2 >= 22;
  // (the structure in the room left by the swings: platforms about 5 ft square on a usual one)
  const room = swings ? F.a * 1.1 : F.a * 2;
  const S = clampN(Math.min(room, F.b * 2), 12, 60);
  const ds = clampN(S * 0.12, 3.5, 6.5);
  const sc = swings ? -F.a * 0.4 : 0;
  const rnd = seeded(idSeed(id) + 3);
  const colors = ["#d24532", "#2f6fd0", "#3a9d4f", "#f2c230"];
  const inkOf: FieldInk[] = ["play1", "play2", "plant2", "play3"];
  const r1 = Math.floor(rnd() * 3), r2 = (r1 + 1 + Math.floor(rnd() * 2)) % 3;
  // Three platforms in an L, a bridge between each, a slide off each end, monkey bars off the
  // middle and a ladder up the first
  const gap = ds * 1.7;
  const A = at(sc - gap, -gap * 0.35), B = at(sc, -gap * 0.35), C = at(sc, gap * 0.65);
  const sq = (c: P, h: number) => [add(add(c, F.u, -h), F.v, -h), add(add(c, F.u, h), F.v, -h), add(add(c, F.u, h), F.v, h), add(add(c, F.u, -h), F.v, h)];
  const from = marks.length;
  // (soft shadows first, then the bridges, the platforms, the slides and bars, the roofs)
  for (const c of [B, C]) fill(sq(add(add(c, F.u, ds * 0.25), F.v, ds * 0.25), ds * 0.6), "shadow");
  line([A, B], ds * 0.45, "wood");
  line([B, C], ds * 0.45, "wood");
  fill(sq(A, ds / 2), "play2");
  fill(sq(B, ds / 2), "wood");
  fill(sq(C, ds / 2), "wood");
  const slide1 = add(A, F.u, -ds * 2.4), slide2 = add(C, F.v, ds * 2.4);
  line([add(A, F.u, -ds / 2), slide1], 1.9, "play3", true);
  line([add(C, F.v, ds / 2), slide2], 1.9, "play1", true);
  const bars0 = add(B, F.u, ds / 2), bars1 = add(B, F.u, ds / 2 + ds * 2.2);
  for (const e of [-0.8, 0.8]) line([add(bars0, F.v, e), add(bars1, F.v, e)], 0.25, "metal");
  for (let i = 0; i <= 6; i++) { const q = add(bars0, F.u, (i / 6) * ds * 2.2); line([add(q, F.v, -0.8), add(q, F.v, 0.8)], 0.18, "metal"); }
  for (let i = 0; i < 3; i++) { const q = add(A, F.v, -ds / 2 - 0.7 - i * 0.9); line([add(q, F.u, -1), add(q, F.u, 1)], 0.35, "play2"); }
  for (const [c, ink] of [[B, inkOf[r1]], [C, inkOf[r2]]] as const) {
    // (a roof: four faces up to a point)
    const eaves = sq(c, ds * 0.62);
    fill(eaves, ink);
    line([eaves[0], eaves[2]], 0.25, "shadow");
    line([eaves[1], eaves[3]], 0.25, "shadow");
  }
  for (let i = from; i < marks.length; i++) marks[i].up = true;
  props.push({ k: "deck", c: A, u: F.u, size: ds, h: 3.5, color: "#2f6fd0" });
  props.push({ k: "deck", c: B, u: F.u, size: ds, h: 5, color: "#b88a58", roof: colors[r1] });
  props.push({ k: "deck", c: C, u: F.u, size: ds, h: 6, color: "#b88a58", roof: colors[r2] });
  props.push({ k: "bridge", a: A, b: B, h: 4.2 });
  props.push({ k: "bridge", a: B, b: C, h: 5.5 });
  props.push({ k: "slide", from: add(A, F.u, -ds / 2), to: slide1, top: 3.5, color: "#f2c230" });
  props.push({ k: "slide", from: add(C, F.v, ds / 2), to: slide2, top: 6, color: "#d24532" });
  props.push({ k: "bars", a: bars0, b: bars1, h: 7 });
  if (swings) {
    const seats = clampN(Math.floor((F.b * 2 - 8) / 5), 2, 4);
    const beam = seats * 4.5 + 2;
    const c = at(F.a * 0.5, 0);
    fill([add(add(c, F.u, -9), F.v, -beam / 2 - 1), add(add(c, F.u, 9), F.v, -beam / 2 - 1), add(add(c, F.u, 9), F.v, beam / 2 + 1), add(add(c, F.u, -9), F.v, beam / 2 + 1)], "rubber");
    const from2 = marks.length;
    line([add(c, F.v, -beam / 2), add(c, F.v, beam / 2)], 0.6, "metal");
    for (const e of [-1, 1]) line([add(add(c, F.v, (e * beam) / 2), F.u, -3), add(add(c, F.v, (e * beam) / 2), F.u, 3)], 0.4, "metal");
    for (let i = 0; i < seats; i++) {
      const t = -beam / 2 + 1 + 2.25 + i * 4.5;
      const p = add(c, F.v, t);
      fill(sq(p, 0.5).map((q, j) => add(q, F.v, j === 0 || j === 3 ? -0.5 : 0.5)), "shadow");
    }
    for (let i = from2; i < marks.length; i++) marks[i].up = true;
    props.push({ k: "swings", c, u: F.v, len: beam, seats });
  }
};

const idSeed = (id: string) => { let h = 7; for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 2147483646; return h + 1; };

/** A community garden: raised beds in rows with gravel between, each planted. */
const garden = (plan: FieldPlan, F: Frame, id: string) => {
  const { marks, props, outline } = plan;
  marks.push({ k: "fill", pts: outline, ink: "path" });
  const at = (s: number, t: number): P => ({ x: F.c.x + F.u.x * s + F.v.x * t, y: F.c.y + F.u.y * s + F.v.y * t });
  const rnd = seeded(idSeed(id));
  const bw = 4, pathW = 3, seg = 12, gap = 3;
  const rows = Math.max(1, Math.floor((2 * F.b - pathW) / (bw + pathW)));
  const cols = Math.max(1, Math.floor((2 * F.a - gap) / (seg + gap)));
  const segL = Math.min(seg, (2 * F.a - gap * (cols + 1)) / cols);
  const tw = rows * bw + (rows - 1) * pathW, sw = cols * segL + (cols - 1) * gap;
  const inks: FieldInk[] = ["plant", "plant2", "plant", "flower", "plant2", "flower2"];
  const colors: Record<string, string> = { plant: "#3e7b33", plant2: "#5e9339", flower: "#d8577a", flower2: "#e8b33a" };
  for (let r = 0; r < rows; r++) {
    for (let cIdx = 0; cIdx < cols; cIdx++) {
      const s0 = -sw / 2 + cIdx * (segL + gap), t0 = -tw / 2 + r * (bw + pathW);
      const bed = [at(s0, t0), at(s0 + segL, t0), at(s0 + segL, t0 + bw), at(s0, t0 + bw)];
      if (!bed.every(p => inside(p, outline))) continue;
      marks.push({ k: "fill", pts: bed, ink: "bed", up: true });
      marks.push({ k: "line", pts: bed, w: 0.35, ink: "wood", closed: true, up: true });
      props.push({ k: "bed", pts: bed, h: 1 });
      const ink = inks[Math.floor(rnd() * inks.length)];
      for (let x = s0 + 1.2; x < s0 + segL - 0.6; x += 2.1) {
        for (const tt of [t0 + 1.1, t0 + bw - 1.1]) {
          const p = at(x + (rnd() - 0.5) * 0.4, tt + (rnd() - 0.5) * 0.4), r0 = 0.7 + rnd() * 0.35;
          marks.push({ k: "disc", c: p, r: r0, ink, up: true });
          props.push({ k: "plant", at: p, r: r0, color: colors[ink] });
        }
      }
    }
  }
};

const inside = (p: P, poly: P[]) => {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) c = !c;
  }
  return c;
};

// ------------------------------------------------------------------ drawing the marks

const num = (v: number) => (Math.round(v * 100) / 100).toString();
const dOf = (pts: P[], closed?: boolean) => pts.map((q, i) => `${i ? "L" : "M"}${num(q.x)} ${num(q.y)}`).join("") + (closed ? "Z" : "");

/**
 * A field as SVG in plan coordinates (feet): its marks clipped to its outline. Lines are never
 * thinner than `minLine` ft (a fine line a little fainter then); `id` names the clip path.
 */
export const fieldSvg = (plan: FieldPlan, inks: Record<FieldInk, string>, minLine: number, id: string) => {
  const clip = `${id.replace(/[^\w-]/g, "")}-fc`;
  const inner: string[] = [], outer: string[] = [];
  for (const m of plan.marks) {
    const to = m.out ? outer : inner;
    if (m.k === "fill") to.push(`<path d="${dOf(m.pts, true)}" fill="${inks[m.ink]}"/>`);
    else if (m.k === "disc") to.push(`<circle cx="${num(m.c.x)}" cy="${num(m.c.y)}" r="${num(m.r)}" fill="${inks[m.ink]}"/>`);
    else {
      const thin = m.w < minLine;
      const w = Math.max(m.w, minLine * (m.minor ? 0.6 : 1));
      const op = thin ? (m.minor ? 0.55 : 0.85) : 1;
      to.push(`<path d="${dOf(m.pts, m.closed)}" fill="none" stroke="${inks[m.ink]}" stroke-width="${num(w)}"${op < 1 ? ` stroke-opacity="${op}"` : ""} stroke-linejoin="round"${m.round ? ` stroke-linecap="round"` : ""}${m.dash ? ` stroke-dasharray="${num(Math.max(m.dash[0], w * 2))} ${num(Math.max(m.dash[1], w * 1.5))}"` : ""}/>`);
    }
  }
  // (what reaches outside the outline, a pool's deck, under; its coping over)
  const under = outer.filter((_, i) => i === 0), over = outer.slice(1);
  return `<g data-field="${plan.kind}">${under.join("")}<clipPath id="${clip}"><path d="${dOf(plan.outline, true)}"/></clipPath><g clip-path="url(#${clip})">${inner.join("")}</g>${over.join("")}</g>`;
};

/**
 * A field painted on a canvas whose transform is already in plan feet: the marks clipped to the
 * outline; lines at least `minPx` pixels wide (`ppf` pixels per foot). `ground`: only what lies on
 * the ground (the 3D view stands the rest up).
 */
export const paintField = (g: CanvasRenderingContext2D, plan: FieldPlan, inks: Record<FieldInk, string>, ppf: number, minPx = 1.1, ground = false) => {
  const path = (pts: P[], closed?: boolean) => {
    g.beginPath();
    pts.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
    if (closed) g.closePath();
  };
  const draw = (m: FieldMark) => {
    if (m.k === "fill") { path(m.pts, true); g.fillStyle = inks[m.ink]; g.fill(); }
    else if (m.k === "disc") { g.beginPath(); g.arc(m.c.x, m.c.y, m.r, 0, Math.PI * 2); g.fillStyle = inks[m.ink]; g.fill(); }
    else {
      path(m.pts, m.closed);
      g.strokeStyle = inks[m.ink];
      g.lineWidth = Math.max(m.w, minPx / ppf);
      g.lineJoin = "round";
      g.lineCap = m.round ? "round" : "butt";
      g.setLineDash(m.dash ? [m.dash[0], m.dash[1]] : []);
      g.stroke();
      g.setLineDash([]);
    }
  };
  const outer = plan.marks.filter(m => m.out);
  if (outer[0]) draw(outer[0]);
  g.save();
  path(plan.outline, true);
  g.clip();
  for (const m of plan.marks) if (!m.out && !(ground && (m.up || (m.k === "line" && m.ink === "net")))) draw(m);
  g.restore();
  for (const m of outer.slice(1)) draw(m);
};

/** A field's sample for the legend, in a box `w` × `h` from (0, 0): its kind laid out in a little
 * outline of its own (a ball field as a fan from home plate). */
export const fieldLegend = (kind: FieldKind, w: number, h: number, inks: Record<FieldInk, string>, id: string) => {
  let outline: P[];
  const ft = kind === "baseball" ? 330 : kind === "softball" ? 230 : 0;
  if (ft) {
    // A fan: home at the bottom middle, the foul lines out at 45°, the outfield's arc between
    const R = ft;
    outline = [{ x: 0, y: 0 }];
    for (let i = 0; i <= 10; i++) { const t = ((-135 + (90 * i) / 10) * Math.PI) / 180; outline.push({ x: Math.cos(t) * R, y: Math.sin(t) * R }); }
  } else {
    const [L] = FIELD_KINDS[kind].size;
    const H = (L * h) / w;
    outline = [{ x: -L / 2, y: -H / 2 }, { x: L / 2, y: -H / 2 }, { x: L / 2, y: H / 2 }, { x: -L / 2, y: H / 2 }];
  }
  const plan = fieldPlan({ points: outline, field: kind, home: ft ? 0 : undefined, id });
  if (!plan) return "";
  const xs = outline.map(p => p.x), ys = outline.map(p => p.y);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const k = Math.min(w / (x1 - x0), h / (y1 - y0));
  const tx = w / 2 - ((x0 + x1) / 2) * k, ty = h / 2 - ((y0 + y1) / 2) * k;
  const edge = `<path d="${dOf(outline, true)}" fill="none" stroke="#000" stroke-opacity="0.25" stroke-width="${num(0.6 / k)}"/>`;
  return `<g transform="translate(${num(tx)} ${num(ty)}) scale(${num(k)})">${fieldSvg(plan, inks, 0.5 / k, `lg-${id}`)}${edge}</g>`;
};
