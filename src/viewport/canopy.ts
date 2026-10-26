// Woods seen from above on the photo: a drawn canopy of treetops over their outline, so a wood
// reads as a wood at once (the painted map, when it's there, paints its own).
import * as THREE from "three";

/** How much ground one tile of treetops covers, ft. */
const TILE_FT = 140;
const mats = new Map<string, THREE.MeshLambertMaterial>();
let tile: THREE.CanvasTexture | null = null;

/** Treetops on a 512 px tile that repeats without a seam: round crowns, lit from the south-west,
 * in greys (the material's color tints them). */
const treetops = () => {
  if (tile) return tile;
  const N = 512, c = document.createElement("canvas");
  c.width = c.height = N;
  const g = c.getContext("2d")!;
  g.fillStyle = "#5b5b5b";
  g.fillRect(0, 0, N, N);
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const crowns: [number, number, number][] = [];
  for (let k = 0; k < 230; k++) crowns.push([rnd() * N, rnd() * N, 14 + rnd() * 22]);
  // (big crowns first, the small ones in the gaps over them; each drawn nine times for the wrap)
  crowns.sort((a, b) => b[2] - a[2]);
  for (const [x, y, r] of crowns) {
    const light = 150 + rnd() * 70;
    for (const dx of [-N, 0, N]) for (const dy of [-N, 0, N]) {
      const cx = x + dx, cy = y + dy;
      if (cx < -r || cx > N + r || cy < -r || cy > N + r) continue;
      // (its shadow to the north-east, then the crown, lit on its sun side)
      g.fillStyle = "rgba(0,0,0,0.35)";
      g.beginPath(); g.arc(cx + r * 0.28, cy - r * 0.22, r, 0, Math.PI * 2); g.fill();
      const grad = g.createRadialGradient(cx - r * 0.35, cy + r * 0.3, r * 0.1, cx, cy, r);
      grad.addColorStop(0, `rgb(${light},${light},${light})`);
      grad.addColorStop(1, `rgb(${light * 0.45},${light * 0.45},${light * 0.45})`);
      g.fillStyle = grad;
      g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
    }
  }
  tile = new THREE.CanvasTexture(c);
  tile.wrapS = tile.wrapT = THREE.RepeatWrapping;
  tile.colorSpace = THREE.SRGBColorSpace;
  tile.anisotropy = 4;
  return tile;
};

/** The treetops material for a woods color (shared, one per color). */
export const canopyMaterial = (color: string) => {
  let m = mats.get(color);
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color: new THREE.Color(color).multiplyScalar(1.9), map: treetops(), transparent: true, opacity: 0.92, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
    m.userData.shared = true;
    mats.set(color, m);
  }
  return m;
};

/** Gives a draped shape texture coordinates by where it lies (plan units per foot `upf`). */
export const planUv = (geo: THREE.BufferGeometry, upf: number) => {
  const pos = geo.getAttribute("position");
  const uv = new Float32Array(pos.count * 2);
  const s = 1 / (TILE_FT * (upf || 1));
  for (let i = 0; i < pos.count; i++) { uv[i * 2] = pos.getX(i) * s; uv[i * 2 + 1] = pos.getZ(i) * s; }
  geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  return geo;
};

let crownTex: THREE.CanvasTexture | null = null;
/** One treetop seen from above, in greys with a soft leafy edge (tinted per tree). */
const crownTile = () => {
  if (crownTex) return crownTex;
  const N = 128, c = document.createElement("canvas");
  c.width = c.height = N;
  const g = c.getContext("2d")!;
  let seed = 5;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  // (clumps of leaves round the middle, lit from the south-west)
  for (let k = 0; k < 26; k++) {
    const a = rnd() * Math.PI * 2, d = rnd() * N * 0.26, r = N * (0.1 + rnd() * 0.12);
    const x = N / 2 + Math.cos(a) * d, y = N / 2 + Math.sin(a) * d;
    const grad = g.createRadialGradient(x - r * 0.35, y + r * 0.3, r * 0.1, x, y, r);
    const l = 170 + rnd() * 60;
    grad.addColorStop(0, `rgba(${l},${l},${l},1)`);
    grad.addColorStop(0.8, `rgba(${l * 0.5},${l * 0.5},${l * 0.5},1)`);
    grad.addColorStop(1, `rgba(${l * 0.4},${l * 0.4},${l * 0.4},0)`);
    g.fillStyle = grad;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  crownTex = new THREE.CanvasTexture(c);
  crownTex.colorSpace = THREE.SRGBColorSpace;
  return crownTex;
};
let crownMat: THREE.MeshLambertMaterial | null = null;

/**
 * The measured trees' treetops, for looking straight down (in 2D the 3D trees are drawn at their
 * lightest and barely show): one flat crown per tree at its top, as wide as measured, all in one
 * draw. Shown only while the view looks straight down (`userData.topOnly`).
 */
export const createCrowns = (trees: { x: number; y: number; ground: number; height: number; radius: number; conifer: boolean }[], color: string) => {
  const geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  crownMat ??= Object.assign(new THREE.MeshLambertMaterial({ map: crownTile(), transparent: true, alphaTest: 0.2, depthWrite: false }), { userData: { shared: true } });
  const mesh = new THREE.InstancedMesh(geo, crownMat, Math.max(1, trees.length));
  mesh.count = trees.length;
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const base = new THREE.Color(color), tint = new THREE.Color();
  trees.forEach((t, i) => {
    q.setFromAxisAngle(up, (i * 2.399) % (Math.PI * 2));
    s.set(t.radius * 2.2, 1, t.radius * 2.2);
    p.set(t.x, t.ground + t.height * 0.92, t.y);
    mesh.setMatrixAt(i, m.compose(p, q, s));
    tint.copy(base).multiplyScalar(t.conifer ? 1.5 : 1.85 + ((i * 37) % 10) / 40);
    if (t.conifer) tint.offsetHSL(0.03, -0.05, -0.04);
    mesh.setColorAt(i, tint);
  });
  mesh.renderOrder = 3;
  mesh.userData.topOnly = true;
  mesh.name = "crowns";
  return mesh;
};
