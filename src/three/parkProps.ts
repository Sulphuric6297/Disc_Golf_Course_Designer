// A park's fields in 3D at real size (feet): the field's ground painted into one texture (grass,
// dirt, court colors, white lines, water), draped on the terrain, and what stands on it (goals,
// uprights, nets, hoops, bases, backstops and fences, play structures, swings, ramps, raised beds),
// merged into one mesh per material with the colors in the vertices, so a park full of fields stays
// quick. Power lines (wooden poles, sagging wires) and hedges (a row of bushes) too.
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { P } from "../types";
import { paintField, type FieldInk, type FieldPlan } from "../lib/fieldPlan";
import { offsetPolygon, samplePath } from "../lib/structures";
import { drapedPolygon } from "./drape";
import { createFence } from "./structures";
import { Forest, VARIANTS, type TreeSpot } from "./treeKit";
import { foliageTint } from "./trees";

type Ground = (x: number, y: number) => number;
const V3 = THREE.Vector3;
const UP = new V3(0, 1, 0);

const shared = <T extends THREE.Material | THREE.BufferGeometry>(m: T) => { m.userData.shared = true; return m; };
let solidMat: THREE.Material | null = null, netMat: THREE.Material | null = null, wireMat: THREE.Material | null = null;
/** Painted metal, plastic and wood, colored per vertex. */
const solid = () => (solidMat ??= shared(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.08 })));
/** Nets: see-through mesh. */
const netting = () => (netMat ??= shared(new THREE.MeshStandardMaterial({ vertexColors: true, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false, roughness: 0.9 })));
const wires = () => (wireMat ??= shared(new THREE.LineBasicMaterial({ color: "#1e1e1c" })));

/** Parts in one color each, gathered for one merged mesh. */
class Kit {
  parts: THREE.BufferGeometry[] = [];
  /** A shape put in place by `m`, all of it `color`. */
  add(geo: THREE.BufferGeometry, color: string, m?: THREE.Matrix4) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    if (g !== geo) geo.dispose();
    for (const k of Object.keys(g.attributes)) if (k !== "position" && k !== "normal") g.deleteAttribute(k);
    if (m) g.applyMatrix4(m);
    const c = new THREE.Color(color).convertSRGBToLinear();
    const n = g.getAttribute("position").count, col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    this.parts.push(g);
  }
  /** A box `sx` × `sy` × `sz` (along, up, across) at `c`, turned to face `dir` (plan). */
  box(c: THREE.Vector3, sx: number, sy: number, sz: number, dir: P, color: string) {
    const m = new THREE.Matrix4().makeRotationY(-Math.atan2(dir.y, dir.x)).setPosition(c);
    this.add(new THREE.BoxGeometry(sx, sy, sz), color, m);
  }
  /** A round rod from `a` to `b`. */
  rod(a: THREE.Vector3, b: THREE.Vector3, r: number, color: string, seg = 8) {
    const d = new V3().subVectors(b, a), l = d.length();
    if (l < 1e-4) return;
    const m = new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), new THREE.Quaternion().setFromUnitVectors(UP, d.normalize()), new V3(1, 1, 1));
    this.add(new THREE.CylinderGeometry(r, r, l, seg, 1, false), color, m);
  }
  /** A flat board from `a` to `b` (its middle line), `w` wide (level across) and `t` thick. */
  slab(a: THREE.Vector3, b: THREE.Vector3, w: number, t: number, color: string) {
    const X = new V3().subVectors(b, a), l = X.length();
    if (l < 1e-4) return;
    X.normalize();
    const Z = new V3().crossVectors(X, UP).normalize(), Y = new V3().crossVectors(Z, X);
    const m = new THREE.Matrix4().makeBasis(X, Y, Z).setPosition(a.clone().add(b).multiplyScalar(0.5));
    this.add(new THREE.BoxGeometry(l, t, w), color, m);
  }
  /** Triangles a-b-c (and c-d-a for four corners), seen from both sides. */
  face(pts: THREE.Vector3[], color: string) {
    const pos: number[] = [];
    for (let k = 1; k + 1 < pts.length; k++) for (const p of [pts[0], pts[k], pts[k + 1]]) pos.push(p.x, p.y, p.z);
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    this.add(g, color);
  }
  mesh(mat: THREE.Material, shadow = true) {
    if (!this.parts.length) return null;
    const geo = mergeGeometries(this.parts);
    this.parts.forEach(p => p.dispose());
    this.parts = [];
    if (!geo) return null;
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    return mesh;
  }
}

const sideOf = (d: P): P => ({ x: -d.y, y: d.x });
const plus = (p: P, d: P, k: number): P => ({ x: p.x + d.x * k, y: p.y + d.y * k });

/**
 * A field's ground: its marks painted on a canvas (about 1024 pixels across, never coarser than a
 * pixel a foot) and draped over the terrain as one mesh. A pool's water catches the light.
 */
export const createFieldGround = (plan: FieldPlan, inks: Record<FieldInk, string>, groundAt: Ground, grid: number, lift: number) => {
  const poly = plan.reach > 0 ? offsetPolygon(plan.outline, plan.reach + 0.5) : plan.outline;
  const xs = poly.map(p => p.x), ys = poly.map(p => p.y);
  const x0 = Math.min(...xs), y0 = Math.min(...ys), w = Math.max(1, Math.max(...xs) - x0), h = Math.max(1, Math.max(...ys) - y0);
  const ppf = Math.max(1, Math.min(8, 1024 / Math.max(w, h)));
  const geo = drapedPolygon(poly, groundAt, grid, lift);
  // (texture coordinates: the canvas's top row is the plan's north edge)
  const pos = geo.getAttribute("position");
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) { uv[i * 2] = (pos.getX(i) - x0) / w; uv[i * 2 + 1] = 1 - (pos.getZ(i) - y0) / h; }
  geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  let map: THREE.Texture | null = null;
  if (typeof document !== "undefined") {
    const c = document.createElement("canvas");
    c.width = Math.max(2, Math.round(w * ppf));
    c.height = Math.max(2, Math.round(h * ppf));
    const g = c.getContext("2d");
    if (g) {
      g.setTransform(c.width / w, 0, 0, c.height / h, -x0 * (c.width / w), -y0 * (c.height / h));
      paintField(g, plan, inks, ppf, 1.1, true);
      // (a fine grain over it, so grass, dirt and paving don't look like flat paint up close)
      if (plan.kind !== "pool") {
        g.save();
        g.beginPath();
        plan.outline.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
        g.closePath();
        g.clip();
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.globalCompositeOperation = "soft-light";
        g.globalAlpha = 0.42;
        g.fillStyle = g.createPattern(grain(), "repeat") ?? "transparent";
        g.fillRect(0, 0, c.width, c.height);
        g.restore();
      }
      map = new THREE.CanvasTexture(c);
      map.colorSpace = THREE.SRGBColorSpace;
      map.anisotropy = 8;
    }
  }
  const water = plan.kind === "pool" || plan.kind === "splash";
  const common = { map, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8 };
  const mat = water ? new THREE.MeshStandardMaterial({ ...common, roughness: plan.kind === "pool" ? 0.12 : 0.5, metalness: 0 }) : new THREE.MeshLambertMaterial(common);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.name = "field-ground";
  return mesh;
};

let grainCanvas: HTMLCanvasElement | null = null;
/** Speckled grey noise, made once (soft-light over a color: lighter and darker flecks). */
const grain = () => {
  if (grainCanvas) return grainCanvas;
  const c = (grainCanvas = document.createElement("canvas"));
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const img = g.createImageData(128, 128);
  let s = 12345;
  for (let i = 0; i < 128 * 128; i++) {
    s = (s * 16807) % 2147483647;
    const v = 128 + ((s % 1000) / 1000 - 0.5) * 120;
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return c;
};

/** What stands on a field, at real size: one mesh of solid parts, one of netting, and its fences. */
export const createFieldProps = (plan: FieldPlan, groundAt: Ground) => {
  const group = new THREE.Group();
  group.name = "field-props";
  const kit = new Kit(), net = new Kit();
  const at = (p: P, y: number) => new V3(p.x, groundAt(p.x, p.y) + y, p.y);
  const WHITE = "#f2f2ee", METAL = "#5d656c";
  for (const pr of plan.props) {
    switch (pr.k) {
      case "base": kit.box(at(pr.at, pr.h / 2), pr.size, pr.h, pr.size, pr.dir, WHITE); break;
      case "goal": {
        // Posts and crossbar, and the net sloping back to the ground
        const s = sideOf(pr.dir), d = Math.min(6, pr.w * 0.28);
        const L = plus(pr.at, s, -pr.w / 2), R = plus(pr.at, s, pr.w / 2);
        const bL = plus(L, pr.dir, -d), bR = plus(R, pr.dir, -d);
        kit.rod(at(L, 0), at(L, pr.h), 0.2, WHITE);
        kit.rod(at(R, 0), at(R, pr.h), 0.2, WHITE);
        kit.rod(at(L, pr.h), at(R, pr.h), 0.2, WHITE);
        kit.rod(at(bL, 0.1), at(bR, 0.1), 0.08, WHITE);
        kit.rod(at(L, pr.h), at(bL, 0.1), 0.07, WHITE);
        kit.rod(at(R, pr.h), at(bR, 0.1), 0.07, WHITE);
        net.face([at(L, pr.h), at(R, pr.h), at(bR, 0.1), at(bL, 0.1)], WHITE);
        net.face([at(L, pr.h), at(bL, 0.1), at(L, 0)], WHITE);
        net.face([at(R, pr.h), at(bR, 0.1), at(R, 0)], WHITE);
        break;
      }
      case "uprights": {
        // A gooseneck post behind the end line, the crossbar over it at 10 ft, uprights 20 ft above
        const s = sideOf(pr.dir), Y = "#f2c318";
        const post = plus(pr.at, pr.dir, -6);
        kit.rod(at(post, 0), at(post, 8.5), 0.35, Y);
        kit.rod(at(post, 8.5), at(pr.at, 10), 0.3, Y);
        kit.rod(at(plus(pr.at, s, -pr.w / 2), 10), at(plus(pr.at, s, pr.w / 2), 10), 0.2, Y);
        for (const e of [-1, 1]) kit.rod(at(plus(pr.at, s, (e * pr.w) / 2), 10), at(plus(pr.at, s, (e * pr.w) / 2), 30), 0.13, Y);
        break;
      }
      case "net": {
        // Posts, and the net hanging between them, lower in the middle, its white band on top
        kit.rod(at(pr.a, 0), at(pr.a, pr.post), 0.13, "#2f3d34");
        kit.rod(at(pr.b, 0), at(pr.b, pr.post), 0.13, "#2f3d34");
        const N = 10, top = (u: number) => pr.top + (pr.mid - pr.top) * (1 - (2 * u - 1) ** 2);
        const P0 = (u: number): P => ({ x: pr.a.x + (pr.b.x - pr.a.x) * u, y: pr.a.y + (pr.b.y - pr.a.y) * u });
        for (let i = 0; i < N; i++) {
          const u0 = i / N, u1 = (i + 1) / N, p0 = P0(u0), p1 = P0(u1);
          net.face([at(p0, Math.max(0.05, top(u0) - pr.drop)), at(p1, Math.max(0.05, top(u1) - pr.drop)), at(p1, top(u1)), at(p0, top(u0))], "#1b1b1b");
          kit.rod(at(p0, top(u0)), at(p1, top(u1)), 0.09, WHITE, 5);
        }
        break;
      }
      case "hoop": {
        // The pole behind the baseline, its arm, the backboard, the rim (10 ft up) and its net
        const pole = plus(pr.at, pr.dir, -6), board = plus(pr.at, pr.dir, -1.25);
        kit.rod(at(pole, 0), at(pole, 11.2), 0.25, METAL);
        kit.rod(at(pole, 10.9), at(plus(board, pr.dir, -0.1), 10.9), 0.14, METAL);
        kit.box(at(board, 10.75), 0.15, 3.5, 6, pr.dir, WHITE);
        kit.box(at(plus(board, pr.dir, 0.08), 10.4), 0.02, 1.5, 2, pr.dir, "#c2410c");
        const rim = new THREE.TorusGeometry(0.75, 0.05, 6, 20).rotateX(Math.PI / 2);
        kit.add(rim, "#e0571e", new THREE.Matrix4().setPosition(at(pr.at, 10)));
        net.add(new THREE.CylinderGeometry(0.75, 0.48, 1.4, 14, 1, true), WHITE, new THREE.Matrix4().setPosition(at(pr.at, 9.3)));
        break;
      }
      case "fence": {
        const pts = pr.closed ? [...pr.pts, pr.pts[0]] : pr.pts;
        if (pts.length >= 2) group.add(createFence(pts, groundAt, pr.h, "chain"));
        break;
      }
      case "deck": {
        // A platform on four posts, a rail round it or a roof over it
        const s = sideOf(pr.u), hs = pr.size / 2;
        const corners = [plus(plus(pr.c, pr.u, -hs), s, -hs), plus(plus(pr.c, pr.u, hs), s, -hs), plus(plus(pr.c, pr.u, hs), s, hs), plus(plus(pr.c, pr.u, -hs), s, hs)];
        const postTop = pr.h + (pr.roof ? 4.2 : 3);
        for (const q of corners) kit.rod(at(q, 0), at(q, postTop), 0.2, "#2f7d4f", 8);
        kit.box(at(pr.c, pr.h), pr.size, 0.3, pr.size, pr.u, pr.color);
        if (pr.roof) {
          // (a four-sided cone, its corners over the posts)
          kit.add(new THREE.ConeGeometry(pr.size * 0.85, 2.4, 4, 1), pr.roof, new THREE.Matrix4().makeRotationY(Math.PI / 4 - Math.atan2(pr.u.y, pr.u.x)).setPosition(at(pr.c, postTop + 1.1)));
        } else for (let k = 0; k < 4; k++) kit.rod(at(corners[k], pr.h + 2.8), at(corners[(k + 1) % 4], pr.h + 2.8), 0.08, "#2f7d4f", 6);
        break;
      }
      case "bridge": {
        const d = { x: pr.b.x - pr.a.x, y: pr.b.y - pr.a.y }, l = Math.hypot(d.x, d.y) || 1, s = sideOf({ x: d.x / l, y: d.y / l });
        kit.slab(at(pr.a, pr.h), at(pr.b, pr.h), 2.4, 0.2, "#b88a58");
        for (const e of [-1, 1]) kit.rod(at(plus(pr.a, s, e * 1.2), pr.h + 2.6), at(plus(pr.b, s, e * 1.2), pr.h + 2.6), 0.07, "#2f7d4f", 6);
        break;
      }
      case "slide": {
        const a = at(pr.from, pr.top), b = at(pr.to, 1.2);
        kit.slab(a, b, 2, 0.2, pr.color);
        const d = { x: pr.to.x - pr.from.x, y: pr.to.y - pr.from.y }, l = Math.hypot(d.x, d.y) || 1, s = sideOf({ x: d.x / l, y: d.y / l });
        for (const e of [-1, 1]) kit.slab(at(plus(pr.from, s, e * 1.05), pr.top + 0.4), at(plus(pr.to, s, e * 1.05), 1.6), 0.12, 0.8, pr.color);
        kit.rod(at(pr.to, 0), at(pr.to, 1.2), 0.12, "#2f7d4f", 6);
        break;
      }
      case "swings": {
        // An A-frame at each end, the beam 8 ft up, the seats on their chains
        const s = sideOf(pr.u), H = 8, M = "#4f5964";
        const ends = [plus(pr.c, pr.u, -pr.len / 2), plus(pr.c, pr.u, pr.len / 2)];
        for (const e of ends) for (const k of [-1, 1]) kit.rod(at(plus(e, s, k * 3), 0), at(e, H), 0.13, M, 6);
        kit.rod(at(ends[0], H), at(ends[1], H), 0.16, M, 8);
        for (let i = 0; i < pr.seats; i++) {
          const p = plus(ends[0], pr.u, 1 + 2.25 + i * 4.5);
          kit.box(at(p, 1.8), 1.8, 0.12, 0.7, pr.u, "#1f1f1f");
          for (const k of [-0.8, 0.8]) kit.rod(at(plus(p, pr.u, k), H), at(plus(p, pr.u, k), 1.85), 0.03, "#8a8f94", 4);
        }
        break;
      }
      case "ramp": {
        // A quarter pipe rising toward `u`, a deck at its top
        const shape = new THREE.Shape();
        const L = pr.len, Hh = pr.h;
        shape.moveTo(-L / 2, 0);
        for (let i = 1; i <= 10; i++) { const t = i / 10; shape.lineTo(-L / 2 + L * t, Hh * (1 - Math.sqrt(Math.max(0, 1 - t * t)))); }
        shape.lineTo(L / 2 + 3, Hh);
        shape.lineTo(L / 2 + 3, 0);
        shape.closePath();
        const geo = new THREE.ExtrudeGeometry(shape, { depth: pr.w, bevelEnabled: false, curveSegments: 4 });
        const X = new V3(pr.u.x, 0, pr.u.y), Z = new V3().crossVectors(X, UP).normalize();
        const base = at(pr.c, 0).addScaledVector(Z, -pr.w / 2);
        kit.add(geo, "#b6b2a9", new THREE.Matrix4().makeBasis(X, UP, Z).setPosition(base));
        break;
      }
      case "rail": {
        kit.rod(at(pr.a, 0), at(pr.a, pr.h), 0.1, METAL, 6);
        kit.rod(at(pr.b, 0), at(pr.b, pr.h), 0.1, METAL, 6);
        kit.rod(at(pr.a, pr.h), at(pr.b, pr.h), 0.09, METAL, 8);
        break;
      }
      case "bars": {
        // Monkey bars: two rails on posts, rungs between them
        const d = { x: pr.b.x - pr.a.x, y: pr.b.y - pr.a.y }, l = Math.hypot(d.x, d.y) || 1, s = sideOf({ x: d.x / l, y: d.y / l });
        for (const e of [-0.8, 0.8]) {
          kit.rod(at(plus(pr.a, s, e), pr.h), at(plus(pr.b, s, e), pr.h), 0.08, "#2f7d4f", 6);
          kit.rod(at(plus(pr.b, s, e), 0), at(plus(pr.b, s, e), pr.h), 0.12, "#2f7d4f", 6);
        }
        for (let i = 0; i <= 6; i++) { const q = plus(pr.a, { x: d.x / l, y: d.y / l }, (i / 6) * l); kit.rod(at(plus(q, s, -0.8), pr.h), at(plus(q, s, 0.8), pr.h), 0.05, "#9ca3af", 5); }
        break;
      }
      case "spray": {
        kit.rod(at(pr.at, 0), at(pr.at, pr.h), 0.3, pr.color, 10);
        kit.add(new THREE.SphereGeometry(0.7, 10, 6), pr.color, new THREE.Matrix4().setPosition(at(pr.at, pr.h)));
        break;
      }
      case "bed": {
        // A raised bed: boards round soil a foot up
        const [a, b, , d] = pr.pts;
        const u = { x: b.x - a.x, y: b.y - a.y }, v = { x: d.x - a.x, y: d.y - a.y };
        const L = Math.hypot(u.x, u.y), W = Math.hypot(v.x, v.y), du = { x: u.x / L, y: u.y / L }, c = { x: a.x + (u.x + v.x) / 2, y: a.y + (u.y + v.y) / 2 };
        const gy = groundAt(c.x, c.y);
        const pos = (p: P, y: number) => new V3(p.x, gy + y, p.y);
        kit.box(pos(c, pr.h * 0.45), L - 0.3, pr.h * 0.9, W - 0.3, du, "#4a3322");
        const sd = sideOf(du);
        for (const e of [-1, 1]) {
          kit.box(pos(plus(c, sd, (e * W) / 2), pr.h / 2), L, pr.h, 0.17, du, "#9a7048");
          kit.box(pos(plus(c, du, (e * L) / 2), pr.h / 2), 0.17, pr.h, W, du, "#9a7048");
        }
        break;
      }
      case "plant": {
        const g = new THREE.IcosahedronGeometry(pr.r, 0).scale(1, 0.8, 1);
        kit.add(g, pr.color, new THREE.Matrix4().setPosition(at(pr.at, 1 + pr.r * 0.55)));
        break;
      }
    }
  }
  const m1 = kit.mesh(solid());
  if (m1) { m1.name = "field-parts"; group.add(m1); }
  const m2 = net.mesh(netting(), false);
  if (m2) { m2.name = "field-nets"; m2.renderOrder = 7; group.add(m2); }
  return group;
};

// ------------------------------------------------------------------ power lines and hedges

/**
 * A power line: wooden poles (at each corner of its line, and no more than 160 ft apart), each with
 * a crossarm and insulators, and three wires sagging between them, `height` ft up. Its poles seen
 * from above as dots on the map.
 */
export const createPowerLine = (points: P[], groundAt: Ground, height = 30) => {
  const group = new THREE.Group();
  group.name = "power-line";
  if (points.length < 2) return group;
  const H = Math.max(15, Math.min(80, height));
  // Where the poles stand, and which way their crossarms face (across the line)
  const poles: { p: P; across: P }[] = [];
  const dirAt = (i: number) => {
    const a = points[Math.max(0, i - 1)], b = points[Math.min(points.length - 1, i + 1)];
    const l = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    return { x: (b.x - a.x) / l, y: (b.y - a.y) / l };
  };
  for (let i = 0; i < points.length; i++) {
    poles.push({ p: points[i], across: sideOf(dirAt(i)) });
    const b = points[i + 1];
    if (!b) break;
    const a = points[i], span = Math.hypot(b.x - a.x, b.y - a.y), n = Math.ceil(span / 160);
    const d = { x: (b.x - a.x) / (span || 1), y: (b.y - a.y) / (span || 1) };
    for (let k = 1; k < n; k++) poles.push({ p: { x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n }, across: sideOf(d) });
  }
  const kit = new Kit();
  const WOOD = "#4f3b29";
  const at = (p: P, y: number) => new V3(p.x, groundAt(p.x, p.y) + y, p.y);
  const holds = (q: { p: P; across: P }) => [at(plus(q.p, q.across, -3.6), H + 0.8), at(q.p, H + 2.2), at(plus(q.p, q.across, 3.6), H + 0.8)];
  for (const q of poles) {
    kit.rod(at(q.p, 0), at(q.p, H + 2.4), 0.42, WOOD, 8);
    kit.box(at(q.p, H), 0.35, 0.35, 8, { x: -q.across.y, y: q.across.x }, "#5a4330");
    for (const e of [-3.6, 3.6]) kit.rod(at(plus(q.p, q.across, e), H + 0.15), at(plus(q.p, q.across, e), H + 0.8), 0.12, "#7e8b82", 6);
  }
  const posts = kit.mesh(solid());
  if (posts) { posts.name = "poles"; group.add(posts); }
  // The wires: each span a curve hanging lowest in its middle
  const seg: number[] = [];
  for (let i = 0; i + 1 < poles.length; i++) {
    const A = holds(poles[i]), B = holds(poles[i + 1]);
    const span = A[1].distanceTo(B[1]), sag = 0.5 + span * 0.025;
    for (let w = 0; w < 3; w++) {
      let prev: THREE.Vector3 | null = null;
      for (let k = 0; k <= 12; k++) {
        const t = k / 12, p = A[w].clone().lerp(B[w], t);
        p.y -= sag * 4 * t * (1 - t);
        if (prev) seg.push(prev.x, prev.y, prev.z, p.x, p.y, p.z);
        prev = p;
      }
    }
  }
  if (seg.length) {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(seg, 3));
    const lines = new THREE.LineSegments(g, wires());
    lines.name = "wires";
    group.add(lines);
  }
  // (each pole a dot on the map, seen from straight above)
  const dots = new Kit();
  for (const q of poles) dots.add(new THREE.CircleGeometry(2.2, 12).rotateX(-Math.PI / 2), "#2d2925", new THREE.Matrix4().setPosition(at(q.p, 0.5)));
  const marks = dots.mesh(dotMat(), false);
  if (marks) { marks.name = "pole-dots"; marks.receiveShadow = false; marks.renderOrder = 5; group.add(marks); }
  return group;
};
let dotMaterial: THREE.Material | null = null;
const dotMat = () => (dotMaterial ??= shared(new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8 })));

/** A hedge: the woods' own bushes (the same tree engine), packed close along its line so they grow
 * into one, `width` ft through and `height` ft tall, in a few greens like the woods'. The forest
 * group comes back (its close and far versions follow the camera like the woods'). */
export const createHedge = (points: P[], groundAt: Ground, width = 4, height = 5, seed = 1, color = "#3f6b35") => {
  const W = Math.max(1, width), H = Math.max(1, height);
  // (a bush every half its width, a little either side of the line, so the row has no gaps)
  const samples = samplePath(points, Math.max(0.8, W * 0.45));
  let s = seed >>> 0 || 1;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const spots: TreeSpot[] = samples.map((p, i) => {
    const q = samples[Math.min(samples.length - 1, i + 1)], o = samples[Math.max(0, i - 1)];
    const dx = q.x - o.x, dy = q.y - o.y, len = Math.hypot(dx, dy) || 1;
    const side = (rnd() - 0.5) * W * 0.18;
    const x = p.x - (dy / len) * side, y = p.y + (dx / len) * side;
    return {
      x, y,
      ground: groundAt(x, y),
      height: H * (0.92 + rnd() * 0.14),
      width: W * (1.05 + rnd() * 0.2),
      shape: "bush",
      variant: Math.floor(rnd() * VARIANTS.bush),
      tint: foliageTint(color, rnd),
      turn: rnd() * Math.PI * 2,
      lean: 0
    };
  });
  const forest = new Forest(spots);
  forest.group.name = "hedge";
  forest.group.userData.forest = forest;
  forest.group.userData.spots = spots;
  return forest.group;
};
