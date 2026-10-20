// Trees in 3D that read as real trees: a branching skeleton (trunk, limbs, branches) of tapered
// bark tubes, and foliage of leaf-cluster cards (drawn leaves on transparent textures) gathered
// at the branch tips, lit as one soft crown (each card's light comes mostly from where it sits on
// the crown, so the crown shades like a real one: bright on the sunny side, dark inside and
// underneath). A few shapes of each kind are made once, at unit height, and shared by every tree:
// woods draw them instanced, a close version near the camera and a lighter one farther away.
import * as THREE from "three";

export type TreeShape = "broadleaf" | "conifer" | "bush";
export type Detail = "near" | "far";

/** Shapes made of each kind (trees pick one by their id, so each keeps its own). */
export const VARIANTS: Record<TreeShape, number> = { broadleaf: 4, conifer: 3, bush: 2 };

type V3 = THREE.Vector3;
const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const seeded = (seed: number) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

// ---------------------------------------------------------------- textures (drawn once)

let leafAtlas: THREE.Texture | null = null;
let needleAtlas: THREE.Texture | null = null;
let barkTex: THREE.Texture | null = null;

const canvas = (w: number, h: number) => {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return { c, g: c.getContext("2d")! };
};

const shareTexture = (c: HTMLCanvasElement, repeat = false) => {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.userData.shared = true;
  return t;
};

/**
 * Leaf clusters: four sprays of leaves on twigs (2 x 2 cells), light gray-green so each tree's
 * own color tints them, every leaf a little lighter or darker than the next, with a midrib.
 */
const getLeafAtlas = () => {
  if (leafAtlas || typeof document === "undefined") return leafAtlas;
  const S = 512;
  const { c, g } = canvas(S * 2, S * 2);
  for (let cell = 0; cell < 4; cell++) {
    const ox = (cell % 2) * S, oy = Math.floor(cell / 2) * S;
    const rnd = seeded(101 + cell * 977);
    g.save();
    g.beginPath();
    g.rect(ox, oy, S, S);
    g.clip();
    // Twigs fanning up and out from the bottom middle
    const twigs: { x: number; y: number; a: number; len: number }[] = [];
    const n = 5 + Math.floor(rnd() * 3);
    for (let i = 0; i < n; i++) twigs.push({ x: ox + S / 2 + (rnd() - 0.5) * 40, y: oy + S * 0.92, a: -Math.PI / 2 + (i / (n - 1) - 0.5) * 2.3 + (rnd() - 0.5) * 0.3, len: S * (0.32 + rnd() * 0.18) });
    g.strokeStyle = "rgb(92,78,60)";
    g.lineCap = "round";
    const leaves: { x: number; y: number; a: number; s: number }[] = [];
    for (const t of twigs) {
      g.lineWidth = 5;
      g.beginPath();
      g.moveTo(t.x, t.y);
      const ex = t.x + Math.cos(t.a) * t.len, ey = t.y + Math.sin(t.a) * t.len;
      g.quadraticCurveTo(t.x + Math.cos(t.a) * t.len * 0.5 + (rnd() - 0.5) * 30, t.y + Math.sin(t.a) * t.len * 0.5, ex, ey);
      g.stroke();
      // Leaves along the twig, alternating sides, and a bunch at the tip
      for (let k = 0.25; k <= 1.0001; k += 0.11 + rnd() * 0.05) {
        const px = t.x + (ex - t.x) * k, py = t.y + (ey - t.y) * k;
        for (const side of [-1, 1]) leaves.push({ x: px, y: py, a: t.a + side * (0.6 + rnd() * 0.5), s: 0.8 + rnd() * 0.5 });
      }
      for (let k = 0; k < 4; k++) leaves.push({ x: ex, y: ey, a: t.a + (rnd() - 0.5) * 1.6, s: 0.9 + rnd() * 0.4 });
    }
    // Back to front: leaves farther down drawn first
    leaves.sort((a, b) => b.y - a.y);
    for (const l of leaves) {
      const len = 62 * l.s, w = 24 * l.s;
      const lum = 0.62 + rnd() * 0.38;
      g.save();
      g.translate(l.x, l.y);
      g.rotate(l.a + Math.PI / 2);
      const grad = g.createLinearGradient(-w, 0, w, 0);
      const r = Math.round(196 * lum), gg = Math.round(222 * lum), b = Math.round(170 * lum);
      grad.addColorStop(0, `rgb(${Math.round(r * 0.72)},${Math.round(gg * 0.72)},${Math.round(b * 0.72)})`);
      grad.addColorStop(0.55, `rgb(${r},${gg},${b})`);
      grad.addColorStop(1, `rgb(${Math.round(r * 0.85)},${Math.round(gg * 0.85)},${Math.round(b * 0.85)})`);
      g.fillStyle = grad;
      g.beginPath();
      g.moveTo(0, 0);
      g.bezierCurveTo(w, -len * 0.25, w * 0.7, -len * 0.8, 0, -len);
      g.bezierCurveTo(-w * 0.7, -len * 0.8, -w, -len * 0.25, 0, 0);
      g.fill();
      g.strokeStyle = "rgba(30,40,20,0.35)";
      g.lineWidth = 1.5;
      g.stroke();
      g.strokeStyle = `rgba(255,255,235,${0.25 * lum})`;
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(0, -2);
      g.lineTo(0, -len * 0.85);
      g.stroke();
      g.restore();
    }
    g.restore();
  }
  return (leafAtlas = shareTexture(c));
};

/** Needle sprays: twigs thick with needles on both sides, drooping a little at the ends. */
const getNeedleAtlas = () => {
  if (needleAtlas || typeof document === "undefined") return needleAtlas;
  const S = 512;
  const { c, g } = canvas(S * 2, S * 2);
  for (let cell = 0; cell < 4; cell++) {
    const ox = (cell % 2) * S, oy = Math.floor(cell / 2) * S;
    const rnd = seeded(331 + cell * 613);
    g.save();
    g.beginPath();
    g.rect(ox, oy, S, S);
    g.clip();
    // One branchlet from the left middle to the right, with side twigs
    const stems: { x: number; y: number; a: number; len: number }[] = [{ x: ox + 20, y: oy + S / 2, a: (rnd() - 0.5) * 0.2, len: S * 0.9 }];
    for (let i = 0; i < 6; i++) {
      const k = 0.15 + i * 0.13;
      stems.push({ x: ox + 20 + S * 0.9 * k, y: oy + S / 2, a: (i % 2 ? 1 : -1) * (0.55 + rnd() * 0.3), len: S * (0.32 - k * 0.15) });
    }
    for (const st of stems) {
      const ex = st.x + Math.cos(st.a) * st.len, ey = st.y + Math.sin(st.a) * st.len;
      g.strokeStyle = "rgb(84,70,52)";
      g.lineWidth = 4;
      g.beginPath();
      g.moveTo(st.x, st.y);
      g.lineTo(ex, ey);
      g.stroke();
      for (let k = 0.03; k < 1; k += 0.015) {
        const px = st.x + (ex - st.x) * k, py = st.y + (ey - st.y) * k;
        for (const side of [-1, 1]) {
          const a = st.a + side * (0.75 + rnd() * 0.35);
          const len = (42 + rnd() * 26) * (1 - k * 0.35);
          const lum = 0.55 + rnd() * 0.45;
          g.strokeStyle = `rgb(${Math.round(176 * lum)},${Math.round(214 * lum)},${Math.round(178 * lum)})`;
          g.lineWidth = 3.4;
          g.beginPath();
          g.moveTo(px, py);
          g.lineTo(px + Math.cos(a) * len, py + Math.sin(a) * len + len * 0.12);
          g.stroke();
        }
      }
    }
    g.restore();
  }
  return (needleAtlas = shareTexture(c));
};

/** Bark: gray-brown with long dark furrows and lighter ridges (repeats around and along). */
const getBark = () => {
  if (barkTex || typeof document === "undefined") return barkTex;
  const { c, g } = canvas(256, 512);
  g.fillStyle = "rgb(104,92,80)";
  g.fillRect(0, 0, 256, 512);
  const rnd = seeded(77);
  for (let i = 0; i < 70; i++) {
    let x = rnd() * 256;
    const dark = rnd() < 0.6;
    g.strokeStyle = dark ? `rgba(40,32,26,${0.35 + rnd() * 0.4})` : `rgba(170,158,140,${0.2 + rnd() * 0.3})`;
    g.lineWidth = dark ? 2 + rnd() * 4 : 1 + rnd() * 2;
    g.beginPath();
    let y = rnd() * 512;
    g.moveTo(x, y);
    const len = 80 + rnd() * 300;
    for (let k = 0; k < len; k += 12) {
      x += (rnd() - 0.5) * 6;
      y += 12;
      g.lineTo(x, y);
    }
    g.stroke();
  }
  return (barkTex = shareTexture(c, true));
};

// ---------------------------------------------------------------- materials (shared)

const mats = new Map<string, THREE.Material>();

/** Leaf cards: alpha-cut, both sides lit the same (from where they sit on the crown). */
export const leafMaterial = (needles: boolean) => {
  const key = needles ? "needles" : "leaves";
  let m = mats.get(key) as THREE.MeshStandardMaterial | undefined;
  if (m) return m;
  m = new THREE.MeshStandardMaterial({
    map: needles ? getNeedleAtlas() : getLeafAtlas(),
    vertexColors: true,
    alphaTest: 0.42,
    side: THREE.DoubleSide,
    roughness: 0.82,
    metalness: 0
  });
  m.onBeforeCompile = shader => {
    // The crown's normal on both faces (no dark backs), and a little light through the leaves
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <normal_fragment_begin>", "float faceDirection = 1.0;\nvec3 normal = normalize( vNormal );\nvec3 nonPerturbedNormal = normal;")
      .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * 0.06;");
  };
  m.customProgramCacheKey = () => `dg-foliage-${key}`;
  m.userData.shared = true;
  mats.set(key, m);
  return m;
};

export const barkMaterial = () => {
  let m = mats.get("bark") as THREE.MeshStandardMaterial | undefined;
  if (m) return m;
  m = new THREE.MeshStandardMaterial({ map: getBark(), vertexColors: true, roughness: 0.95, metalness: 0 });
  m.userData.shared = true;
  mats.set("bark", m);
  return m;
};

// ---------------------------------------------------------------- geometry builders

class Builder {
  pos: number[] = [];
  nor: number[] = [];
  uv: number[] = [];
  col: number[] = [];
  idx: number[] = [];
  vert(p: V3, n: V3, u: number, v: number, c: number) {
    this.pos.push(p.x, p.y, p.z);
    this.nor.push(n.x, n.y, n.z);
    this.uv.push(u, v);
    this.col.push(c, c, c);
    return this.pos.length / 3 - 1;
  }
  geometry() {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    geo.setAttribute("normal", new THREE.Float32BufferAttribute(this.nor, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(this.uv, 2));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(this.col, 3));
    geo.setIndex(this.idx);
    geo.computeBoundingSphere();
    geo.computeBoundingBox();
    geo.userData.shared = true;
    return geo;
  }
}

/** A tapered tube from a to b (radius ra to rb), `sides` around. */
const tube = (b: Builder, a: V3, e: V3, ra: number, rb: number, sides: number, shadeA = 0.75, shadeB = 1) => {
  const dir = e.clone().sub(a);
  const len = dir.length();
  if (len < 1e-5) return;
  dir.normalize();
  const side = Math.abs(dir.y) < 0.95 ? v3(0, 1, 0).cross(dir).normalize() : v3(1, 0, 0).cross(dir).normalize();
  const up = dir.clone().cross(side).normalize();
  const base = b.pos.length / 3;
  for (let ring = 0; ring < 2; ring++) {
    const c = ring ? e : a, r = ring ? rb : ra;
    for (let i = 0; i <= sides; i++) {
      const t = (i / sides) * Math.PI * 2;
      const n = side.clone().multiplyScalar(Math.cos(t)).addScaledVector(up, Math.sin(t));
      b.vert(c.clone().addScaledVector(n, r), n, i / sides, ring ? len * 6 : 0, ring ? shadeB : shadeA);
    }
  }
  for (let i = 0; i < sides; i++) {
    const p = base + i, q = base + sides + 1 + i;
    b.idx.push(p, q, p + 1, p + 1, q, q + 1);
  }
};

/**
 * A leaf card at p, roughly facing `facing`, `size` across, lit with `normal` (the crown's),
 * shaded `shade` (darker inside the crown), one of the atlas's four sprays.
 */
const card = (b: Builder, p: V3, facing: V3, size: number, spin: number, normal: V3, shade: number, cell: number) => {
  const n = facing.clone().normalize();
  const t1 = (Math.abs(n.y) < 0.95 ? v3(0, 1, 0) : v3(1, 0, 0)).cross(n).normalize();
  const t2 = n.clone().cross(t1).normalize();
  const c = Math.cos(spin), s = Math.sin(spin);
  const ax = t1.clone().multiplyScalar(c).addScaledVector(t2, s).multiplyScalar(size / 2);
  const ay = t2.clone().multiplyScalar(c).addScaledVector(t1, -s).multiplyScalar(size / 2);
  const u0 = (cell % 2) * 0.5, v0 = Math.floor(cell / 2) * 0.5;
  const base = b.pos.length / 3;
  b.vert(p.clone().sub(ax).sub(ay), normal, u0, v0, shade * 0.9);
  b.vert(p.clone().add(ax).sub(ay), normal, u0 + 0.5, v0, shade * 0.9);
  b.vert(p.clone().add(ax).add(ay), normal, u0 + 0.5, v0 + 0.5, shade);
  b.vert(p.clone().sub(ax).add(ay), normal, u0, v0 + 0.5, shade);
  b.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
};

const smooth = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export type TreeProto = { bark: THREE.BufferGeometry; leaves: THREE.BufferGeometry; needles: boolean };

/**
 * A broadleaf tree (or a bush) of height 1: trunk, limbs forking toward the crown's edge, and
 * leaf sprays at the branch tips filling out an irregular crown.
 */
const broadleaf = (variant: number, detail: Detail, bush: boolean): TreeProto => {
  const rnd = seeded(1000 + variant * 7919 + (bush ? 31 : 0));
  const near = detail === "near";
  const bark = new Builder(), leaves = new Builder();
  const crown = bush
    ? { cx: 0, cy: 0.5, cz: 0, rx: 0.62 + rnd() * 0.1, ry: 0.48 }
    : { cx: (rnd() - 0.5) * 0.04, cy: 0.62 + rnd() * 0.06, cz: (rnd() - 0.5) * 0.04, rx: 0.3 + rnd() * 0.1, ry: 0.3 + rnd() * 0.05 };
  const center = v3(crown.cx, crown.cy, crown.cz);
  const sides = near ? 6 : 4;
  const r0 = bush ? 0.02 : 0.02 + rnd() * 0.006;
  const forkY = bush ? 0.12 : crown.cy - crown.ry * (0.55 + rnd() * 0.25);
  const fork = v3((rnd() - 0.5) * 0.03, forkY, (rnd() - 0.5) * 0.03);
  tube(bark, v3(0, -0.02, 0), fork, r0 * 1.25, r0 * 0.85, sides, 0.6, 0.85);
  const tips: V3[] = [];
  // Limbs out toward the crown's edge, each forking twice
  const limbs = (bush ? 6 : 4) + Math.floor(rnd() * 3);
  const grow = (from: V3, to: V3, r: number, depth: number) => {
    // A slight bend: through a point pushed up and out
    const mid = from.clone().lerp(to, 0.5).add(v3((rnd() - 0.5) * 0.04, 0.03 + rnd() * 0.03, (rnd() - 0.5) * 0.04));
    tube(bark, from, mid, r, r * 0.8, sides, 0.8, 0.9);
    tube(bark, mid, to, r * 0.8, r * 0.55, depth > 1 ? Math.max(3, sides - 2) : sides, 0.9, 1);
    if (depth >= (near ? 3 : 2)) {
      tips.push(to);
      return;
    }
    const kids = 2 + (rnd() < 0.4 ? 1 : 0);
    for (let k = 0; k < kids; k++) {
      const out = to.clone().sub(center);
      out.y *= 0.6;
      out.normalize();
      const jitter = v3(rnd() - 0.5, rnd() * 0.8 - 0.2, rnd() - 0.5).multiplyScalar(0.9);
      const dir = out.add(jitter).normalize();
      const len = (crown.rx * 0.42) / (depth * 0.8 + 0.6) * (0.75 + rnd() * 0.5);
      const end = to.clone().addScaledVector(dir, len);
      // Kept inside the crown (pulled back if past its edge)
      const q = v3((end.x - crown.cx) / crown.rx, (end.y - crown.cy) / crown.ry, (end.z - crown.cz) / crown.rx);
      if (q.length() > 0.95) end.copy(center).add(v3(q.x * crown.rx, q.y * crown.ry, q.z * crown.rx).multiplyScalar(0.95 / q.length()));
      grow(to, end, r * 0.55, depth + 1);
    }
  };
  for (let i = 0; i < limbs; i++) {
    const a = (i / limbs) * Math.PI * 2 + rnd() * 0.8;
    const reach = crown.rx * (0.45 + rnd() * 0.3);
    const to = v3(crown.cx + Math.cos(a) * reach, crown.cy + crown.ry * (rnd() * 0.5 - 0.15), crown.cz + Math.sin(a) * reach);
    grow(fork, to, r0 * 0.62, 1);
  }
  // A leader up the middle
  grow(fork, v3(crown.cx, crown.cy + crown.ry * 0.55, crown.cz), r0 * 0.6, near ? 2 : 1);

  // Leaves: sprays around each tip, and more over the crown's shell to fill its outline
  const shadeAt = (p: V3) => {
    const q = Math.sqrt(((p.x - crown.cx) / crown.rx) ** 2 + ((p.y - crown.cy) / crown.ry) ** 2 + ((p.z - crown.cz) / crown.rx) ** 2);
    const under = smooth(-0.9, 0.4, (p.y - crown.cy) / crown.ry);
    return Math.max(0.18, (0.32 + 0.68 * smooth(0.25, 1, q)) * (0.62 + 0.38 * under));
  };
  const normalAt = (p: V3, facing: V3) => {
    const radial = v3((p.x - crown.cx) / crown.rx, (p.y - crown.cy) / crown.ry, (p.z - crown.cz) / crown.rx).normalize();
    return radial.multiplyScalar(0.8).addScaledVector(facing, 0.2).normalize();
  };
  const size = (near ? 0.15 : 0.27) * (bush ? 1.3 : 1) * (crown.rx / 0.36);
  const place = (p: V3, s: number) => {
    const out = p.clone().sub(center).normalize();
    const facing = out.add(v3(rnd() - 0.5, rnd() - 0.3, rnd() - 0.5).multiplyScalar(1.1)).normalize();
    card(leaves, p, facing, s * (0.75 + rnd() * 0.5), rnd() * Math.PI * 2, normalAt(p, facing), shadeAt(p), Math.floor(rnd() * 4));
  };
  const perTip = near ? 7 : 2;
  for (const t of tips) {
    for (let k = 0; k < perTip; k++) place(t.clone().add(v3(rnd() - 0.5, rnd() - 0.4, rnd() - 0.5).multiplyScalar(crown.rx * 0.4)), size);
  }
  const shell = near ? 110 : 34;
  for (let k = 0; k < shell; k++) {
    const u = rnd() * 2 - 1, th = rnd() * Math.PI * 2, rr = Math.sqrt(1 - u * u);
    // Bumpy outline: lobes where the shell pushes out
    const lobe = 0.72 + 0.28 * Math.pow(Math.abs(Math.sin(th * 2.5 + variant) * Math.cos(u * 3 + variant)), 0.5) + rnd() * 0.1;
    const p = v3(crown.cx + Math.cos(th) * rr * crown.rx * lobe, crown.cy + Math.max(-0.75, u) * crown.ry * lobe, crown.cz + Math.sin(th) * rr * crown.rx * lobe);
    place(p, size * 1.1);
  }
  return { bark: bark.geometry(), leaves: leaves.geometry(), needles: false };
};

/** A conifer of height 1: a straight trunk and whorls of drooping branches, shorter toward the top. */
const conifer = (variant: number, detail: Detail): TreeProto => {
  const rnd = seeded(5000 + variant * 6151);
  const near = detail === "near";
  const bark = new Builder(), leaves = new Builder();
  const r0 = 0.018;
  tube(bark, v3(0, -0.02, 0), v3(0, 0.55, 0), r0, r0 * 0.6, near ? 6 : 4, 0.6, 0.85);
  tube(bark, v3(0, 0.55, 0), v3(0, 1, 0), r0 * 0.6, r0 * 0.08, near ? 5 : 3, 0.85, 1);
  const bare = 0.1 + rnd() * 0.08;
  const step = near ? 0.034 : 0.07;
  const width = 0.27 + rnd() * 0.07;
  for (let y = bare, w = 0; y < 0.97; y += step * (0.85 + rnd() * 0.3), w++) {
    const t = (y - bare) / (1 - bare);
    const L = width * Math.pow(1 - t, 0.85) + 0.025;
    const count = (near ? 6 : 5) + Math.floor(rnd() * 3);
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + w * 2.4 + rnd() * 0.5;
      const dir = v3(Math.cos(a), -0.18 - rnd() * 0.15 + t * 0.3, Math.sin(a)).normalize();
      const from = v3(0, y, 0);
      const to = from.clone().addScaledVector(dir, L);
      to.y -= L * 0.12;
      if (near) tube(bark, from, to, 0.005, 0.0015, 3, 0.7, 0.9);
      // Needle sprays along the branch, lying flat-ish and drooping at the tips
      const sprays = near ? 4 : 2;
      for (let k = 0; k < sprays; k++) {
        const f = 0.25 + (k / (sprays - 1)) * 0.75;
        const p = from.clone().lerp(to, f);
        const out = v3(p.x, 0, p.z).normalize();
        const facing = v3(0, 1, 0).addScaledVector(out, 0.35 + rnd() * 0.3).add(v3(rnd() - 0.5, 0, rnd() - 0.5).multiplyScalar(0.5)).normalize();
        const s = near ? Math.max(0.07, Math.min(0.19, L * 0.85)) : Math.max(0.1, Math.min(0.3, L * 1.5));
        const radial = v3(p.x / width, (p.y - 0.5) * 0.6, p.z / width);
        const normal = radial.lengthSq() > 1e-6 ? radial.normalize().multiplyScalar(0.6).add(v3(0, 0.55, 0)).normalize() : v3(0, 1, 0);
        const inner = smooth(0, 1, Math.hypot(p.x, p.z) / Math.max(0.03, L));
        const shade = Math.max(0.2, (0.35 + 0.65 * inner) * (0.7 + 0.3 * t));
        card(leaves, p, facing, s * (0.85 + rnd() * 0.3), Math.atan2(to.z - from.z, to.x - from.x) + (rnd() - 0.5) * 0.4, normal, shade, Math.floor(rnd() * 4));
      }
    }
  }
  return { bark: bark.geometry(), leaves: leaves.geometry(), needles: true };
};

const protos = new Map<string, TreeProto>();

/** A tree shape (made once, shared): unit height, standing on its base at the origin. */
export const treeProto = (shape: TreeShape, variant: number, detail: Detail): TreeProto => {
  const key = `${shape}|${variant}|${detail}`;
  let p = protos.get(key);
  if (!p) {
    p = shape === "conifer" ? conifer(variant, detail) : broadleaf(variant, detail, shape === "bush");
    protos.set(key, p);
  }
  return p;
};

/** Which shape a tree takes (the same one every time for the same tree). */
export const variantOf = (id: string, shape: TreeShape) => {
  let h = 7;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h % VARIANTS[shape];
};

/** One tree as meshes (shared shape and materials): `height` ft tall, `width` ft across the crown. */
export const treeMeshes = (shape: TreeShape, variant: number, height: number, width: number, tint: THREE.Color, detail: Detail = "near") => {
  const proto = treeProto(shape, variant, detail);
  const group = new THREE.Group();
  const natural = shape === "conifer" ? 0.62 : shape === "bush" ? 1.3 : 0.75;
  const sx = Math.max(0.2, width / height / natural);
  const leafMat = (leafMaterial(proto.needles) as THREE.MeshStandardMaterial);
  const bark = new THREE.Mesh(proto.bark, barkMaterial());
  const leaves = new THREE.Mesh(proto.leaves, tintedFoliage(leafMat, tint));
  for (const m of [bark, leaves]) {
    m.scale.set(height * sx, height, height * sx);
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
  }
  return group;
};

/** Foliage tinted for one tree: a light copy of the shared material (same shader and texture). */
const tintCache = new Map<string, THREE.Material>();
const tintedFoliage = (base: THREE.MeshStandardMaterial, tint: THREE.Color) => {
  const key = `${base.customProgramCacheKey()}|${tint.getHexString()}`;
  let m = tintCache.get(key);
  if (!m) {
    const c = base.clone();
    c.onBeforeCompile = base.onBeforeCompile;
    c.customProgramCacheKey = base.customProgramCacheKey;
    c.color.copy(tint);
    c.userData.shared = true;
    m = c;
    tintCache.set(key, m);
  }
  return m;
};

// ---------------------------------------------------------------- woods: instanced, two levels of detail

export type TreeSpot = { x: number; y: number; ground: number; height: number; width: number; shape: TreeShape; variant: number; tint: THREE.Color; turn: number; lean: number };

/** Trees nearer than this to the camera use the close shapes, ft (less without a graphics card). */
export const forestDetail = { nearFt: 260 };

/**
 * Many trees, drawn instanced by shape: close ones in full detail, the rest in a lighter
 * version. Call `update` with the camera's position when it moves.
 */
export class Forest {
  readonly group = new THREE.Group();
  private sets: { spots: TreeSpot[]; near: THREE.InstancedMesh[]; far: THREE.InstancedMesh[] }[] = [];
  private last = new THREE.Vector3(Infinity, 0, 0);
  private matrices: THREE.Matrix4[][] = [];

  constructor(spots: TreeSpot[]) {
    this.group.name = "forest";
    const byShape = new Map<string, TreeSpot[]>();
    for (const s of spots) {
      const key = `${s.shape}|${s.variant}`;
      if (!byShape.has(key)) byShape.set(key, []);
      byShape.get(key)!.push(s);
    }
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(), p = new THREE.Vector3();
    for (const [key, list] of byShape) {
      const [shape, variant] = key.split("|");
      const near = treeProto(shape as TreeShape, +variant, "near"), far = treeProto(shape as TreeShape, +variant, "far");
      const make = (proto: TreeProto) => {
        const leafMat = leafMaterial(proto.needles);
        return [new THREE.InstancedMesh(proto.bark, barkMaterial(), list.length), new THREE.InstancedMesh(proto.leaves, leafMat, list.length)];
      };
      const nearMeshes = make(near), farMeshes = make(far);
      const mats: THREE.Matrix4[] = [];
      list.forEach((s, i) => {
        const natural = s.shape === "conifer" ? 0.62 : s.shape === "bush" ? 1.3 : 0.75;
        const sx = Math.max(0.2, s.width / s.height / natural);
        e.set(s.lean * Math.cos(s.turn), s.turn, s.lean * Math.sin(s.turn));
        m.compose(p.set(s.x, s.ground, s.y), q.setFromEuler(e), sc.set(s.height * sx, s.height, s.height * sx));
        mats.push(m.clone());
        for (const mesh of [...nearMeshes, ...farMeshes]) mesh.setColorAt(i, s.tint);
      });
      for (const mesh of [...nearMeshes, ...farMeshes]) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.frustumCulled = false;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        this.group.add(mesh);
      }
      // Bark stays its own color (only the leaves take the tint)
      for (const mesh of [nearMeshes[0], farMeshes[0]]) {
        for (let i = 0; i < list.length; i++) mesh.setColorAt(i, new THREE.Color(1, 1, 1));
      }
      this.sets.push({ spots: list, near: nearMeshes, far: farMeshes });
      this.matrices.push(mats);
    }
    this.update(new THREE.Vector3(Infinity, 0, Infinity));
  }

  /** Close trees in full detail, the rest lighter (only redone when the camera moved a fair way). */
  update(eye: THREE.Vector3) {
    if (this.last.distanceToSquared(eye) < 30 * 30 && Number.isFinite(this.last.x)) return;
    this.last.copy(eye);
    const r2 = forestDetail.nearFt * forestDetail.nearFt;
    this.sets.forEach((set, si) => {
      let n = 0, f = 0;
      set.spots.forEach((s, i) => {
        const dx = s.x - eye.x, dz = s.y - eye.z, dy = s.ground + s.height * 0.5 - eye.y;
        const close = dx * dx + dz * dz + dy * dy < r2;
        const mat = this.matrices[si][i];
        if (close) {
          set.near[0].setMatrixAt(n, mat);
          set.near[1].setMatrixAt(n, mat);
          set.near[1].setColorAt(n, s.tint);
          n++;
        } else {
          set.far[0].setMatrixAt(f, mat);
          set.far[1].setMatrixAt(f, mat);
          set.far[1].setColorAt(f, s.tint);
          f++;
        }
      });
      for (const mesh of set.near) { mesh.count = n; mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true; mesh.visible = n > 0; }
      for (const mesh of set.far) { mesh.count = f; mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true; mesh.visible = f > 0; }
    });
  }

  /** Trees in all, and in full detail just now (for tests). */
  counts() {
    return {
      trees: this.sets.reduce((a, s) => a + s.spots.length, 0),
      near: this.sets.reduce((a, s) => a + s.near[1].count, 0),
      conifers: this.sets.reduce((a, s) => a + s.spots.filter(x => x.shape === "conifer").length, 0)
    };
  }
}
