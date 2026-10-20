// Built things in 3D at real size (feet): bridges, boardwalks, stairs, walls, buildings, shelters
// and decks. Each is a few meshes, one per material, with every board, post and stone merged into
// it, so a course with many of them stays quick. The materials (weathered deck boards, timber,
// stone, cedar shingles, a metal roof, siding, concrete, glass) and their textures are made once
// and shared; texture coordinates are in feet, so every texture is at its real size.
import * as THREE from "three";
import type { P, StructureItem } from "../types";
import { pointInPolygon } from "../lib/geom";
import {
  boardwalkDeck, bridgeDeck, isLineKind, offsetPolygon, orientedBox, roofBreaks, roofOf, samplePath, stairSteps,
  structureHeight, structurePath, structureRoof, structureWidth, type Roof
} from "../lib/structures";

type Ground = (x: number, y: number) => number;
const V3 = THREE.Vector3;
type V = THREE.Vector3;

// ------------------------------------------------------------------ materials

type MatKey = "deck" | "timber" | "stone" | "shingle" | "metal" | "siding" | "concrete" | "glass" | "trim" | "door";

/** A small seeded random generator, so the textures come out the same every time. */
const rng = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

/** A texture painted on a canvas, `fu` × `fv` feet, repeating. */
const paint = (w: number, h: number, fu: number, fv: number, draw: (g: CanvasRenderingContext2D, r: () => number) => void, seed: number) => {
  if (typeof document === "undefined") return null;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d");
  if (!g) return null;
  draw(g, rng(seed));
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1 / fu, 1 / fv);
  tex.anisotropy = 8;
  tex.userData.shared = true;
  return tex;
};

const hsl = (h: number, s: number, l: number, a = 1) => `hsla(${h.toFixed(1)},${(s * 100).toFixed(1)}%,${(l * 100).toFixed(1)}%,${a})`;

/** Fine streaks along a board (its grain), across `len` pixels, between `a` and `b` on the other axis. */
const grain = (g: CanvasRenderingContext2D, r: () => number, along: "x" | "y", a: number, b: number, len: number, n: number) => {
  for (let i = 0; i < n; i++) {
    const at = a + r() * (b - a);
    const dark = r() < 0.6;
    g.strokeStyle = dark ? `rgba(40,26,14,${0.05 + r() * 0.12})` : `rgba(255,240,215,${0.04 + r() * 0.08})`;
    g.lineWidth = 0.6 + r() * 1.4;
    g.beginPath();
    const wav = r() * 2.5, ph = r() * 6.3, fr = 0.004 + r() * 0.02;
    for (let t = 0; t <= len; t += 8) {
      const off = at + Math.sin(t * fr + ph) * wav;
      if (along === "x") (t ? g.lineTo(t, off) : g.moveTo(t, off));
      else (t ? g.lineTo(off, t) : g.moveTo(off, t));
    }
    g.stroke();
  }
};

const painters: Record<Exclude<MatKey, "glass" | "trim" | "door">, () => THREE.Texture | null> = {
  // Deck boards across a bridge (seams across u): weathered gray-brown, a few butt joints and knots
  deck: () => paint(512, 256, 8, 4, (g, r) => {
    const bw = 32;
    for (let x = 0; x < 512; x += bw) {
      const l = 0.43 + r() * 0.17;
      g.fillStyle = hsl(30 + r() * 10, 0.16 + r() * 0.12, l);
      g.fillRect(x, 0, bw, 256);
      grain(g, r, "y", x + 2, x + bw - 2, 256, 14);
      if (r() < 0.5) { const y = r() * 256; g.fillStyle = "rgba(30,20,12,.65)"; g.fillRect(x, y, bw, 2); }
      if (r() < 0.35) { g.fillStyle = "rgba(60,38,20,.45)"; g.beginPath(); g.ellipse(x + 6 + r() * (bw - 12), r() * 256, 2.5, 4.5, 0, 0, 7); g.fill(); }
      // The gap between boards, and the light on each board's edge
      g.fillStyle = "rgba(24,16,10,.9)";
      g.fillRect(x, 0, 3, 256);
      g.fillStyle = "rgba(255,245,225,.12)";
      g.fillRect(x + 3, 0, 2, 256);
    }
  }, 11),
  // Timber: posts, rails and beams, the grain along u
  timber: () => paint(512, 64, 8, 1, (g, r) => {
    g.fillStyle = hsl(28, 0.26, 0.33);
    g.fillRect(0, 0, 512, 64);
    grain(g, r, "x", 0, 64, 512, 40);
  }, 12),
  // Stone: courses of blocks of many lengths, mortar between, each block lit from above
  stone: () => paint(512, 512, 6, 6, (g, r) => {
    g.fillStyle = "#4a443c";
    g.fillRect(0, 0, 512, 512);
    const heights: number[] = [];
    let y = 0;
    while (y < 512) {
      let hh = 46 + Math.floor(r() * 36);
      if (512 - (y + hh) < 40) hh = 512 - y;
      heights.push(hh);
      y += hh;
    }
    y = 0;
    for (const hh of heights) {
      let x = -Math.floor(r() * 120);
      const start = x;
      while (x < start + 512) {
        const bl = Math.min(start + 512 - x, 70 + Math.floor(r() * 120));
        const tone = 0.33 + r() * 0.16, hue = 30 + r() * 14, sat = 0.04 + r() * 0.08;
        for (const sx of [x, x + 512, x - 512]) {
          g.fillStyle = hsl(hue, sat, tone);
          g.fillRect(sx + 3, y + 3, bl - 6, hh - 6);
          g.fillStyle = "rgba(255,255,255,.14)";
          g.fillRect(sx + 3, y + 3, bl - 6, 4);
          g.fillStyle = "rgba(0,0,0,.18)";
          g.fillRect(sx + 3, y + hh - 7, bl - 6, 4);
        }
        x += bl;
      }
      y += hh;
    }
    // Grit
    for (let i = 0; i < 9000; i++) {
      g.fillStyle = r() < 0.5 ? `rgba(0,0,0,${r() * 0.12})` : `rgba(255,255,255,${r() * 0.1})`;
      g.fillRect(r() * 512, r() * 512, 1 + r() * 2, 1 + r() * 2);
    }
  }, 13),
  // Cedar shingles: courses of tabs up the roof (v), each course's bottom edge in shadow
  shingle: () => paint(512, 512, 8, 8, (g, r) => {
    const row = 32;
    for (let y = 0; y < 512; y += row) {
      let x = (y / row) % 2 ? -16 - Math.floor(r() * 20) : -Math.floor(r() * 20);
      while (x < 512) {
        const tw = 34 + Math.floor(r() * 44);
        const l = 0.23 + r() * 0.08;
        g.fillStyle = hsl(22 + r() * 8, 0.1 + r() * 0.06, l);
        g.fillRect(x, y, tw, row);
        for (let k = 0; k < 4; k++) {
          g.fillStyle = `rgba(${r() < 0.5 ? "20,10,5" : "255,235,210"},${0.05 + r() * 0.08})`;
          g.fillRect(x + 3 + r() * (tw - 6), y + 4, 1 + r() * 2, row - 6);
        }
        g.fillStyle = "rgba(15,8,4,.55)";
        g.fillRect(x, y, 2, row);
        x += tw;
      }
      g.fillStyle = "rgba(10,6,3,.55)";
      g.fillRect(0, y, 512, 4);
      g.fillStyle = "rgba(255,230,200,.08)";
      g.fillRect(0, y + 4, 512, 3);
    }
  }, 14),
  // A standing-seam metal roof: ribs down the slope (along v) every 1⅓ ft
  metal: () => paint(256, 128, 4, 2, (g, r) => {
    const grad = g.createLinearGradient(0, 0, 256, 0);
    grad.addColorStop(0, "#4f6f54");
    grad.addColorStop(1, "#557659");
    g.fillStyle = grad;
    g.fillRect(0, 0, 256, 128);
    for (let x = 0; x < 256; x += 256 / 3) {
      g.fillStyle = "rgba(255,255,255,.35)";
      g.fillRect(x, 0, 3, 128);
      g.fillStyle = "rgba(0,0,0,.35)";
      g.fillRect(x + 3, 0, 4, 128);
    }
    for (let i = 0; i < 1200; i++) {
      g.fillStyle = `rgba(${r() < 0.5 ? "0,0,0" : "255,255,255"},${r() * 0.05})`;
      g.fillRect(r() * 256, r() * 128, 1, 4 + r() * 10);
    }
  }, 15),
  // Lap siding: boards along the wall, a shadow under each lap
  siding: () => paint(256, 256, 4, 4, (g, r) => {
    const row = 32;
    for (let y = 0; y < 256; y += row) {
      g.fillStyle = hsl(36 + r() * 4, 0.22, 0.6 + r() * 0.04);
      g.fillRect(0, y, 256, row);
      grain(g, r, "x", y + 3, y + row - 3, 256, 10);
      const sh = g.createLinearGradient(0, y + row - 9, 0, y + row);
      sh.addColorStop(0, "rgba(0,0,0,0)");
      sh.addColorStop(1, "rgba(0,0,0,.45)");
      g.fillStyle = sh;
      g.fillRect(0, y + row - 9, 256, 9);
      g.fillStyle = "rgba(255,240,220,.18)";
      g.fillRect(0, y, 256, 2);
    }
  }, 16),
  // Concrete: light, a little mottled and speckled
  concrete: () => paint(256, 256, 8, 8, (g, r) => {
    g.fillStyle = "#b8b3a9";
    g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 260; i++) {
      g.fillStyle = `rgba(${r() < 0.5 ? "60,55,48" : "255,255,250"},${r() * 0.05})`;
      g.beginPath();
      g.arc(r() * 256, r() * 256, 4 + r() * 18, 0, 7);
      g.fill();
    }
    for (let i = 0; i < 5000; i++) {
      g.fillStyle = `rgba(${r() < 0.5 ? "0,0,0" : "255,255,255"},${r() * 0.12})`;
      g.fillRect(r() * 256, r() * 256, 1, 1);
    }
  }, 17)
};

const mats = new Map<MatKey, THREE.Material>();
const material = (key: MatKey) => {
  let m = mats.get(key);
  if (m) return m;
  const map = key in painters ? painters[key as keyof typeof painters]() : null;
  const fallback: Record<MatKey, string> = {
    deck: "#8d7a62", timber: "#5a4330", stone: "#8c857a", shingle: "#5e4232", metal: "#4f6f54", siding: "#6e5036",
    concrete: "#b8b3a9", glass: "#3b4c5a", trim: "#e8e1d1", door: "#3e5644"
  };
  m = new THREE.MeshStandardMaterial({
    color: map ? 0xffffff : fallback[key],
    map,
    roughness: key === "glass" ? 0.18 : key === "metal" ? 0.42 : key === "trim" || key === "door" ? 0.65 : 0.92,
    metalness: key === "glass" ? 0.3 : key === "metal" ? 0.35 : 0,
    // Roofs are single sheets: seen from under the eaves too
    side: key === "shingle" || key === "metal" ? THREE.DoubleSide : THREE.FrontSide
  });
  m.userData.shared = true;
  mats.set(key, m);
  return m;
};

// ------------------------------------------------------------------ geometry

/** Triangles for one material, merged into one geometry. Coordinates are world (x, y up, z). */
class Mesher {
  pos: number[] = [];
  nor: number[] = [];
  uv: number[] = [];

  /** A triangle, turned to face `out` if given; `uv` per corner (feet). */
  tri(a: V, b: V, c: V, uv: [number, number][], out?: V) {
    const n = new V3().subVectors(b, a).cross(new V3().subVectors(c, a));
    if (n.lengthSq() < 1e-12) return;
    n.normalize();
    let ua = uv[0], ub = uv[1], uc = uv[2];
    if (out && n.dot(out) < 0) {
      [b, c] = [c, b];
      [ub, uc] = [uc, ub];
      n.negate();
    }
    for (const [p, t] of [[a, ua], [b, ub], [c, uc]] as [V, [number, number]][]) {
      this.pos.push(p.x, p.y, p.z);
      this.nor.push(n.x, n.y, n.z);
      this.uv.push(t[0], t[1]);
    }
  }

  /** A four-cornered face a-b-c-d (in order round its edge). */
  quad(a: V, b: V, c: V, d: V, uv: [number, number][], out?: V) {
    this.tri(a, b, c, [uv[0], uv[1], uv[2]], out);
    this.tri(a, c, d, [uv[0], uv[2], uv[3]], out);
  }

  /** A box around `c`: half sizes along `ex`, `ey` and `ez` (unit vectors at right angles). */
  box(c: V, ex: V, ey: V, ez: V, hx: number, hy: number, hz: number) {
    const ax: [V, number][] = [[ex, hx], [ey, hy], [ez, hz]];
    for (let i = 0; i < 3; i++) {
      const [A, ha] = ax[i], [B, hb] = ax[(i + 1) % 3], [C, hc] = ax[(i + 2) % 3];
      for (const s of [-1, 1]) {
        const f = (sb: number, sc: number) => c.clone().addScaledVector(A, s * ha).addScaledVector(B, sb * hb).addScaledVector(C, sc * hc);
        // Texture along the face's longer side
        const uvs: [number, number][] = hb >= hc
          ? [[0, 0], [2 * hb, 0], [2 * hb, 2 * hc], [0, 2 * hc]]
          : [[0, 0], [0, 2 * hb], [2 * hc, 2 * hb], [2 * hc, 0]];
        this.quad(f(-1, -1), f(1, -1), f(1, 1), f(-1, 1), uvs, A.clone().multiplyScalar(s));
      }
    }
  }

  get empty() {
    return !this.pos.length;
  }

  geometry() {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    geo.setAttribute("normal", new THREE.Float32BufferAttribute(this.nor, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(this.uv, 2));
    geo.computeBoundingSphere();
    return geo;
  }
}

const UP = new V3(0, 1, 0);
const w3 = (p: P, y: number) => new V3(p.x, y, p.y);

/**
 * A solid along a path: at each point a cross-section from `lo[i]` to `hi[i]` high, `off` to the
 * side of the path and `half` either way of that (mitered at corners). Open paths get end caps;
 * `closed` runs round a loop.
 */
const sweep = (m: Mesher, pts: P[], lo: number[], hi: number[], off: number, half: number, closed = false, top = true) => {
  const n = pts.length;
  if (n < 2) return;
  const dirOf = (a: P, b: P) => { const l = Math.hypot(b.x - a.x, b.y - a.y) || 1; return { x: (b.x - a.x) / l, y: (b.y - a.y) / l }; };
  const L: V[] = [], R: V[] = [], LH: V[] = [], RH: V[] = [], nrm: V[] = [], s: number[] = [];
  let acc = 0;
  for (let i = 0; i < n; i++) {
    const prev = closed ? pts[(i + n - 1) % n] : pts[Math.max(0, i - 1)], next = closed ? pts[(i + 1) % n] : pts[Math.min(n - 1, i + 1)];
    const d1 = dirOf(i === 0 && !closed ? pts[0] : prev, i === 0 && !closed ? next : pts[i]);
    const d2 = dirOf(i === n - 1 && !closed ? prev : pts[i], i === n - 1 && !closed ? pts[i] : next);
    const n1 = { x: -d1.y, y: d1.x }, n2 = { x: -d2.y, y: d2.x };
    let nx = n1.x + n2.x, ny = n1.y + n2.y;
    const nl = Math.hypot(nx, ny) || 1;
    nx /= nl; ny /= nl;
    const k = 1 / Math.max(0.35, nx * n1.x + ny * n1.y);
    const p = pts[i];
    const at = (o: number) => ({ x: p.x + nx * o * k, y: p.y + ny * o * k });
    L.push(w3(at(off + half), lo[i])); R.push(w3(at(off - half), lo[i]));
    LH.push(w3(at(off + half), hi[i])); RH.push(w3(at(off - half), hi[i]));
    nrm.push(new V3(nx, 0, ny));
    if (i) acc += Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y);
    s.push(acc);
  }
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const j = (i + 1) % n;
    const s0 = s[i], s1 = j === 0 ? acc + Math.hypot(pts[0].x - pts[n - 1].x, pts[0].y - pts[n - 1].y) : s[j];
    const out = nrm[i].clone().add(nrm[j]).normalize();
    if (top) m.quad(LH[i], LH[j], RH[j], RH[i], [[s0, half], [s1, half], [s1, -half], [s0, -half]], UP);
    m.quad(L[i], L[j], LH[j], LH[i], [[s0, lo[i]], [s1, lo[j]], [s1, hi[j]], [s0, hi[i]]], out);
    m.quad(R[i], R[j], RH[j], RH[i], [[s0, lo[i]], [s1, lo[j]], [s1, hi[j]], [s0, hi[i]]], out.clone().negate());
    m.quad(L[i], L[j], R[j], R[i], [[s0, half], [s1, half], [s1, -half], [s0, -half]], UP.clone().negate());
  }
  if (!closed) {
    for (const [i, sgn] of [[0, -1], [n - 1, 1]] as [number, number][]) {
      const t = new V3(pts[Math.min(n - 1, i + 1)].x - pts[Math.max(0, i - 1)].x, 0, pts[Math.min(n - 1, i + 1)].y - pts[Math.max(0, i - 1)].y).normalize().multiplyScalar(sgn);
      m.quad(L[i], R[i], RH[i], LH[i], [[half, lo[i]], [-half, lo[i]], [-half, hi[i]], [half, hi[i]]], t);
    }
  }
};

const signedArea = (poly: P[]) => poly.reduce((a, p, i) => { const q = poly[(i + 1) % poly.length]; return a + p.x * q.y - q.x * p.y; }, 0) / 2;

/** The way out of a polygon across its edge a→b (level, unit). */
const outward = (poly: P[], a: P, b: P) => {
  const l = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const sgn = signedArea(poly) > 0 ? 1 : -1;
  return new V3((sgn * (b.y - a.y)) / l, 0, (-sgn * (b.x - a.x)) / l);
};

/** A flat-topped solid on an outline: its top (texture by `uvOf`), and its sides from `lo` up. */
const prism = (m: Mesher, poly: P[], lo: number, hi: number, uvOf: (p: P) => [number, number], sides = true, bottom = false) => {
  if (poly.length < 3) return;
  const tris = THREE.ShapeUtils.triangulateShape(poly.map(p => new THREE.Vector2(p.x, p.y)), []);
  for (const [a, b, c] of tris) {
    m.tri(w3(poly[a], hi), w3(poly[b], hi), w3(poly[c], hi), [uvOf(poly[a]), uvOf(poly[b]), uvOf(poly[c])], UP);
    if (bottom) m.tri(w3(poly[a], lo), w3(poly[b], lo), w3(poly[c], lo), [uvOf(poly[a]), uvOf(poly[b]), uvOf(poly[c])], UP.clone().negate());
  }
  if (!sides) return;
  let s = 0;
  poly.forEach((a, i) => {
    const b = poly[(i + 1) % poly.length];
    const l = Math.hypot(b.x - a.x, b.y - a.y);
    m.quad(w3(a, lo), w3(b, lo), w3(b, hi), w3(a, hi), [[s, lo], [s + l, lo], [s + l, hi], [s, hi]], outward(poly, a, b));
    s += l;
  });
};

/** Points along each edge of a closed outline, no more than `step` ft apart (corners included). */
const alongEdges = (poly: P[], step: number) => {
  const out: P[] = [];
  poly.forEach((a, i) => {
    const b = poly[(i + 1) % poly.length];
    const k = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / step));
    for (let j = 0; j < k; j++) out.push({ x: a.x + ((b.x - a.x) * j) / k, y: a.y + ((b.y - a.y) * j) / k });
  });
  return out;
};

const post = (m: Mesher, p: P, y0: number, y1: number, size: number, angle = 0) =>
  m.box(w3(p, (y0 + y1) / 2), new V3(Math.cos(angle), 0, Math.sin(angle)), UP, new V3(-Math.sin(angle), 0, Math.cos(angle)), size / 2, (y1 - y0) / 2, size / 2);

/** A point `off` ft to the side of a path sample (the same side as `sweep`'s positive offset). */
const aside = (p: { x: number; y: number; angle: number }, off: number): P => ({ x: p.x - Math.sin(p.angle) * off, y: p.y + Math.cos(p.angle) * off });

/** Railings along a deck: posts every 6 ft or so, a top rail and a middle rail, on both sides. */
const railings = (timber: Mesher, deck: { x: number; y: number; s: number; angle: number; top: number }[], half: number) => {
  const pts = deck.map(d => ({ x: d.x, y: d.y }));
  const L = deck[deck.length - 1].s;
  const posts = Math.max(2, Math.round(L / 6) + 1);
  for (const side of [-1, 1]) {
    for (let k = 0; k < posts; k++) {
      const s = Math.min(L - 0.25, Math.max(0.25, (k * L) / (posts - 1)));
      const d = deck.reduce((best, x) => (Math.abs(x.s - s) < Math.abs(best.s - s) ? x : best), deck[0]);
      post(timber, aside(d, side * (half - 0.2)), d.top - 0.7, d.top + 3.45, 0.36, d.angle);
    }
    sweep(timber, pts, deck.map(d => d.top + 3.15), deck.map(d => d.top + 3.47), side * (half - 0.2), 0.2);
    sweep(timber, pts, deck.map(d => d.top + 1.55), deck.map(d => d.top + 1.8), side * (half - 0.2), 0.08);
  }
};

// ------------------------------------------------------------------ the models

type Parts = Partial<Record<MatKey, Mesher>>;

const bridge = (st: StructureItem, g: Ground, parts: Parts) => {
  const deck = bridgeDeck(structurePath(st), g, structureHeight(st), 1);
  if (deck.length < 2) return;
  const w = structureWidth(st), half = w / 2;
  const pts = deck.map(d => ({ x: d.x, y: d.y }));
  const top = deck.map(d => d.top);
  const deckM = (parts.deck ??= new Mesher()), timber = (parts.timber ??= new Mesher()), stone = (parts.stone ??= new Mesher());
  sweep(deckM, pts, top.map(t => t - 0.22), top, 0, half);
  // Two beams under the deck, and boards along its edges
  for (const side of [-1, 1]) {
    sweep(timber, pts, top.map(t => t - 1.15), top.map(t => t - 0.22), side * (half - 0.8), 0.25);
    sweep(timber, pts, top.map(t => t - 0.75), top.map(t => t + 0.06), side * (half + 0.08), 0.08);
  }
  railings(timber, deck, half);
  // Stone abutments on the banks, under each end
  for (const [d, nb] of [[deck[0], deck[1]], [deck[deck.length - 1], deck[deck.length - 2]]] as const) {
    const t = new V3(d.x - nb.x, 0, d.y - nb.y).normalize();
    const c = new V3(d.x, 0, d.y).addScaledVector(t, 0.4);
    const bottom = Math.min(d.ground, g(c.x, c.z)) - 1.8;
    const y1 = d.top - 0.22;
    stone.box(new V3(c.x, (bottom + y1) / 2, c.z), t, UP, new V3(-t.z, 0, t.x), 1.25, (y1 - bottom) / 2, half + 0.45);
  }
  // Piers where the deck stands well clear of the ground (over a creek, say)
  const L = deck[deck.length - 1].s;
  const spans = Math.max(1, Math.round(L / 14));
  for (let k = 1; k < spans; k++) {
    const s = (k * L) / spans;
    const d = deck.reduce((best, x) => (Math.abs(x.s - s) < Math.abs(best.s - s) ? x : best), deck[0]);
    if (d.top - d.ground < 2.2) continue;
    for (const side of [-1, 1]) post(timber, aside(d, side * (half - 0.8)), d.ground - 1, d.top - 1.15, 0.6, d.angle);
    const c = aside(d, 0);
    timber.box(w3(c, d.top - 1.45), new V3(-Math.sin(d.angle), 0, Math.cos(d.angle)), UP, new V3(Math.cos(d.angle), 0, Math.sin(d.angle)), half + 0.2, 0.3, 0.32);
  }
};

const boardwalk = (st: StructureItem, g: Ground, parts: Parts) => {
  const H = structureHeight(st);
  const deck = boardwalkDeck(structurePath(st), g, H, 1);
  if (deck.length < 2) return;
  const half = structureWidth(st) / 2;
  const pts = deck.map(d => ({ x: d.x, y: d.y }));
  const top = deck.map(d => d.top);
  const deckM = (parts.deck ??= new Mesher()), timber = (parts.timber ??= new Mesher());
  sweep(deckM, pts, top.map(t => t - 0.2), top, 0, half);
  for (const side of [-1, 1]) {
    // Rim boards down the sides, and a low curb along the edge
    sweep(timber, pts, top.map((t, i) => Math.max(deck[i].ground - 0.2, t - 0.75)), top.map(t => t - 0.2), side * (half - 0.08), 0.08);
    if (H <= 2.5) sweep(timber, pts, top, top.map(t => t + 0.3), side * (half - 0.16), 0.16);
  }
  if (H > 2.5) railings(timber, deck, half);
  // Posts every 8 ft or so
  const L = deck[deck.length - 1].s;
  const n = Math.max(2, Math.round(L / 8) + 1);
  for (let k = 0; k < n; k++) {
    const s = (k * L) / (n - 1);
    const d = deck.reduce((best, x) => (Math.abs(x.s - s) < Math.abs(best.s - s) ? x : best), deck[0]);
    if (d.top - d.ground < 0.45) continue;
    for (const side of [-1, 1]) post(timber, aside(d, side * (half - 0.25)), d.ground - 1, d.top - 0.2, 0.42, d.angle);
  }
};

/** Landscape steps: level treads of packed stone, each with a timber across its front (the riser)
 * and timbers along both sides. */
const stairs = (st: StructureItem, g: Ground, parts: Parts) => {
  const half = structureWidth(st) / 2;
  const steps = stairSteps(structurePath(st), g);
  if (!steps.length) return;
  const tread = (parts.concrete ??= new Mesher()), timber = (parts.timber ??= new Mesher());
  // The front of each step faces down the slope
  const up = steps[steps.length - 1].top >= steps[0].top;
  for (const step of steps) {
    const ex = new V3(Math.cos(step.angle), 0, Math.sin(step.angle)), ez = new V3(-ex.z, 0, ex.x);
    const lo = step.low - 0.6;
    const len = step.s1 - step.s0;
    tread.box(w3(step.at, (lo + step.top - 0.04) / 2), ex, UP, ez, len / 2 + 0.02, (step.top - 0.04 - lo) / 2, half - 0.3);
    const front = new V3(step.at.x, 0, step.at.y).addScaledVector(ex, (up ? -1 : 1) * (len / 2 - 0.25));
    timber.box(new V3(front.x, (lo + step.top + 0.05) / 2, front.z), ex, UP, ez, 0.25, (step.top + 0.05 - lo) / 2, half);
    for (const side of [-1, 1]) {
      const c = new V3(step.at.x, 0, step.at.y).addScaledVector(ez, side * (half - 0.15));
      timber.box(new V3(c.x, (lo + step.top + 0.1) / 2, c.z), ex, UP, ez, len / 2 + 0.02, (step.top + 0.1 - lo) / 2, 0.15);
    }
  }
};

const wall = (st: StructureItem, g: Ground, parts: Parts) => {
  const samples = samplePath(st.points, 2);
  if (samples.length < 2) return;
  const H = structureHeight(st), half = structureWidth(st) / 2;
  const ground = samples.map(p => g(p.x, p.y));
  const stone = (parts.stone ??= new Mesher());
  sweep(stone, samples, ground.map(y => y - 0.8), ground.map(y => y + H), 0, half);
  // Capstones, a little wider
  sweep(stone, samples, ground.map(y => y + H), ground.map(y => y + H + 0.3), 0, half + 0.14);
};

/** The roof over an outline: its faces at `eave + pitch × run`, and a fascia board round the eaves. */
const roofFaces = (roof: Roof, eave: number, cover: Mesher, fascia: Mesher) => {
  const y = (p: P) => eave + roof.pitch * roof.run(p);
  const slopeK = Math.sqrt(1 + roof.pitch * roof.pitch);
  for (const f of roof.facets) {
    const along = { x: -f.out.y, y: f.out.x };
    const uvOf = (p: P): [number, number] => [p.x * along.x + p.y * along.y, -(p.x * f.out.x + p.y * f.out.y) * slopeK];
    const tris = THREE.ShapeUtils.triangulateShape(f.poly.map(p => new THREE.Vector2(p.x, p.y)), []);
    for (const [a, b, c] of tris) cover.tri(w3(f.poly[a], y(f.poly[a])), w3(f.poly[b], y(f.poly[b])), w3(f.poly[c], y(f.poly[c])), [uvOf(f.poly[a]), uvOf(f.poly[b]), uvOf(f.poly[c])], UP);
  }
  roof.eaves.forEach((a, i) => {
    const b = roof.eaves[(i + 1) % roof.eaves.length];
    const out = outward(roof.eaves, a, b);
    const pts = roofBreaks(a, b, roof);
    let s = 0;
    for (let k = 1; k < pts.length; k++) {
      const p = pts[k - 1], q = pts[k], l = Math.hypot(q.x - p.x, q.y - p.y);
      fascia.quad(w3(p, y(p) - 0.45), w3(q, y(q) - 0.45), w3(q, y(q) + 0.02), w3(p, y(p) + 0.02), [[s, 0], [s + l, 0], [s + l, 0.47], [s, 0.47]], out);
      s += l;
    }
  });
};

/** Under the eaves: the overhang's underside (a soffit), from the eaves in to the walls. */
const soffit = (roof: Roof, walls: P[], eave: number, overhang: number, m: Mesher) => {
  const y = eave - roof.pitch * overhang - 0.45;
  const ring = [...roof.eaves, roof.eaves[0]];
  const inner = [...walls, walls[0]];
  if (ring.length !== inner.length) return;
  for (let i = 0; i + 1 < ring.length; i++) {
    m.quad(w3(ring[i], y), w3(ring[i + 1], y), w3(inner[i + 1], y), w3(inner[i], y), [[ring[i].x, ring[i].y], [ring[i + 1].x, ring[i + 1].y], [inner[i + 1].x, inner[i + 1].y], [inner[i].x, inner[i].y]], UP.clone().negate());
  }
};

const outlineOf = (st: StructureItem) => {
  const pts = st.points.filter((p, i) => i === 0 || Math.hypot(p.x - st.points[i - 1].x, p.y - st.points[i - 1].y) > 1e-3);
  if (pts.length > 3 && Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].y - pts[pts.length - 1].y) < 1e-3) pts.pop();
  return pts;
};

const building = (st: StructureItem, g: Ground, parts: Parts) => {
  const outline = outlineOf(st);
  if (outline.length < 3) return;
  const H = Math.max(6, structureHeight(st));
  const gs = [...alongEdges(outline, 6), orientedBox(outline).c].map(p => g(p.x, p.y));
  const gMin = Math.min(...gs), gMax = Math.max(...gs);
  const floor = gMax + 0.6, eave = floor + H;
  const roof = roofOf(outline, structureRoof(st), 1.5);
  const roofY = (p: P) => eave + roof.pitch * roof.run(p);
  const siding = (parts.siding ??= new Mesher()), stone = (parts.stone ??= new Mesher()), trim = (parts.trim ??= new Mesher());
  const glass = (parts.glass ??= new Mesher()), door = (parts.door ??= new Mesher());
  // A stone foundation, a little proud of the walls
  prism(stone, offsetPolygon(outline, 0.18), gMin - 0.6, floor + 0.15, p => [p.x, p.y]);
  // Walls up to the roof (a gable end's triangle included)
  let s = 0;
  const edges = outline.map((a, i) => ({ a, b: outline[(i + 1) % outline.length] }));
  const longest = edges.reduce((best, e) => (Math.hypot(e.b.x - e.a.x, e.b.y - e.a.y) > Math.hypot(best.b.x - best.a.x, best.b.y - best.a.y) ? e : best), edges[0]);
  for (const e of edges) {
    const out = outward(outline, e.a, e.b);
    const pts = roofBreaks(e.a, e.b, roof);
    for (let k = 1; k < pts.length; k++) {
      const p = pts[k - 1], q = pts[k], l = Math.hypot(q.x - p.x, q.y - p.y);
      siding.quad(w3(p, floor), w3(q, floor), w3(q, roofY(q)), w3(p, roofY(p)), [[s, floor], [s + l, floor], [s + l, roofY(q)], [s, roofY(p)]], out);
      s += l;
    }
    // Windows (and the door, on the longest wall)
    const len = Math.hypot(e.b.x - e.a.x, e.b.y - e.a.y);
    if (len < 7 || H < 7.5) continue;
    const dir = new V3((e.b.x - e.a.x) / len, 0, (e.b.y - e.a.y) / len);
    const count = Math.max(1, Math.floor((len - 2) / 9));
    for (let k = 0; k < count; k++) {
      const t = (k + 0.5) / count;
      const at = { x: e.a.x + (e.b.x - e.a.x) * t, y: e.a.y + (e.b.y - e.a.y) * t };
      const isDoor = e === longest && k === Math.floor(count / 2) && H >= 8;
      const wHalf = isDoor ? 1.6 : 1.5, y0 = isDoor ? floor : floor + 3, y1 = isDoor ? floor + 7 : floor + 6.5;
      const c = (o: number, y: number) => new V3(at.x, y, at.y).addScaledVector(out, o);
      trim.box(c(0.06, (y0 + y1) / 2 + (isDoor ? 0.15 : 0)), dir, UP, out, wHalf + 0.3, (y1 - y0) / 2 + (isDoor ? 0.15 : 0.3), 0.08);
      if (isDoor) door.box(c(0.12, (y0 + y1) / 2), dir, UP, out, wHalf, (y1 - y0) / 2, 0.08);
      else {
        glass.box(c(0.1, (y0 + y1) / 2), dir, UP, out, wHalf, (y1 - y0) / 2, 0.06);
        // Muntins
        trim.box(c(0.16, (y0 + y1) / 2), dir, UP, out, 0.06, (y1 - y0) / 2, 0.03);
        trim.box(c(0.16, (y0 + y1) / 2), dir, UP, out, wHalf, 0.06, 0.03);
      }
    }
  }
  roofFaces(roof, eave, (parts.shingle ??= new Mesher()), trim);
  soffit(roof, outline, eave, 1.5, trim);
};

const shelter = (st: StructureItem, g: Ground, parts: Parts) => {
  const outline = outlineOf(st);
  if (outline.length < 3) return;
  const H = Math.max(6.5, structureHeight(st));
  const gs = [...alongEdges(outline, 6), orientedBox(outline).c].map(p => g(p.x, p.y));
  const gMin = Math.min(...gs), gMax = Math.max(...gs);
  const floor = gMax + 0.35, eave = floor + H;
  const concrete = (parts.concrete ??= new Mesher()), timber = (parts.timber ??= new Mesher());
  // A concrete pad, posts round the edge and a beam on them, and the roof
  prism(concrete, offsetPolygon(outline, 0.6), gMin - 0.5, floor, p => [p.x, p.y]);
  const inset = offsetPolygon(outline, -0.6);
  for (const p of alongEdges(inset, 10)) post(timber, p, floor, eave, 0.6);
  sweep(timber, inset, inset.map(() => eave - 1.05), inset.map(() => eave), 0, 0.3, true);
  const roof = roofOf(outline, structureRoof(st), 2, 0.42);
  roofFaces(roof, eave + 0.2, (parts.metal ??= new Mesher()), timber);
  // Picnic tables under it
  const box = orientedBox(outline);
  if (box.a >= 5 && box.b >= 4) {
    const rows = box.b >= 9 ? [-box.b / 2, box.b / 2] : [0];
    const per = Math.max(1, Math.floor((2 * box.a - 2) / 9));
    for (const t of rows) for (let k = 0; k < per; k++) {
      const s = -box.a + (2 * box.a * (k + 0.5)) / per;
      const c = { x: box.c.x + box.u.x * s + box.v.x * t, y: box.c.y + box.u.y * s + box.v.y * t };
      if (!pointInPolygon(c, outline)) continue;
      const ex = new V3(box.u.x, 0, box.u.y), ez = new V3(box.v.x, 0, box.v.y);
      const at = (along: number, across: number, y: number) => new V3(c.x + box.u.x * along + box.v.x * across, y, c.y + box.u.y * along + box.v.y * across);
      timber.box(at(0, 0, floor + 2.45), ex, UP, ez, 3, 0.09, 1.3);
      for (const side of [-1, 1]) {
        timber.box(at(0, side * 1.95, floor + 1.45), ex, UP, ez, 3, 0.08, 0.45);
        timber.box(at(side * 2.2, 0, floor + 1.2), ex, UP, ez, 0.15, 1.2, 1.1);
        timber.box(at(side * 2.2, 0, floor + 1.3), ex, UP, ez, 0.16, 0.09, 2.3);
      }
    }
  }
};

const deckModel = (st: StructureItem, g: Ground, parts: Parts) => {
  const outline = outlineOf(st);
  if (outline.length < 3) return;
  const H = Math.max(0.3, structureHeight(st));
  const box = orientedBox(outline);
  const gs = [...alongEdges(outline, 6), box.c].map(p => g(p.x, p.y));
  const top = Math.max(...gs) + H;
  const deckM = (parts.deck ??= new Mesher()), timber = (parts.timber ??= new Mesher());
  // Boards along the deck's long side
  prism(deckM, outline, top - 0.2, top, p => [p.x * box.v.x + p.y * box.v.y, p.x * box.u.x + p.y * box.u.y], false, true);
  prism(timber, offsetPolygon(outline, 0.06), top - 0.85, top - 0.02, p => [p.x, p.y], true);
  for (const p of alongEdges(offsetPolygon(outline, -0.4), 6)) post(timber, p, g(p.x, p.y) - 1, top - 0.2, 0.5);
  if (H > 2) {
    const ring = offsetPolygon(outline, -0.2);
    for (const p of alongEdges(ring, 6)) post(timber, p, top, top + 3.4, 0.34);
    sweep(timber, ring, ring.map(() => top + 3.1), ring.map(() => top + 3.42), 0, 0.18, true);
    sweep(timber, ring, ring.map(() => top + 1.55), ring.map(() => top + 1.78), 0, 0.07, true);
  }
};

/**
 * A built thing as a 3D model on the ground (`groundAt` gives the ground's height). The group is
 * named "structure:<id>"; its meshes cast and catch shadows.
 */
export const createStructure = (st: StructureItem, groundAt: Ground) => {
  const group = new THREE.Group();
  group.name = `structure:${st.id}`;
  group.userData.structure = st.kind;
  if (st.points.length < (isLineKind(st.kind) ? 2 : 3)) return group;
  const parts: Parts = {};
  ({ bridge, boardwalk, stairs, wall, building, shelter, deck: deckModel })[st.kind](st, groundAt, parts);
  for (const [key, m] of Object.entries(parts) as [MatKey, Mesher][]) {
    if (m.empty) continue;
    const mesh = new THREE.Mesh(m.geometry(), material(key));
    mesh.name = key;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  return group;
};
