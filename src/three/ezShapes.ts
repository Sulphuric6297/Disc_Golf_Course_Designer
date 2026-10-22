// The course's tree shapes, grown by ez-tree (MIT, github.com/dgreenheck/ez-tree): oaks and
// ashes, pines and bushes from its presets, each seed its own tree, made once at unit height and
// shared (woods draw them instanced). Its photographed bark and leaves, lit like its demo.
//
// A far version keeps the very same branches: the small twigs go and the leaves thin out, each
// one left bigger, so a tree far off has the same outline at a fraction of the cost.
import * as THREE from "three";
import { Tree } from "@dgreenheck/ez-tree";
import type { Detail, TreeProto, TreeShape } from "./treeKit";

/** ez-tree's presets behind each kind's variants (the variant picks one, and its seed). */
const PRESETS: Record<TreeShape, string[]> = {
  broadleaf: ["Oak Medium", "Ash Medium", "Oak Large", "Ash Large", "Oak Small", "Ash Small"],
  conifer: ["Pine Medium", "Pine Large", "Pine Small", "Pine Large"],
  bush: ["Bush 1", "Bush 3", "Bush 1", "Bush 3"]
};
export const EZ_VARIANTS: Record<TreeShape, number> = { broadleaf: 6, conifer: 4, bush: 4 };

const mats = new Map<string, THREE.Material>();
/** One material per bark and leaf texture, shared; instancing-friendly (each tree's tint comes in
 * as its instance color, so it multiplies the photographed leaves gently). */
const materialFor = (kind: "bark" | "leaves", from: THREE.MeshPhongMaterial, key: string) => {
  let m = mats.get(`${kind}|${key}`);
  if (m) return m;
  m = kind === "leaves"
    ? new THREE.MeshPhongMaterial({ name: `ez-leaves-${key}`, map: from.map, side: THREE.DoubleSide, alphaTest: from.alphaTest || 0.5, dithering: true, shininess: 4 })
    : new THREE.MeshPhongMaterial({ name: `ez-bark-${key}`, map: from.map, normalMap: from.normalMap, aoMap: from.aoMap, shininess: 2 });
  if (kind === "leaves") (m as THREE.MeshPhongMaterial).alphaToCoverage = true;
  m.userData.shared = true;
  mats.set(`${kind}|${key}`, m);
  return m;
};

/** Grows the tree, noting which bark indices belong to which branch level (for the far version). */
const grow = (preset: string, seed: number) => {
  const t = new Tree();
  t.loadPreset(preset);
  t.options.seed = seed;
  // (aspen leaves are autumn-yellow: the green landscapes take ash leaves on those bushes)
  if (t.options.leaves.type === "aspen") t.options.leaves.type = "ash";
  const levels: { level: number; from: number; to: number }[] = [];
  const self = t as unknown as { generateBranch: (b: { level: number }) => void; branches: { indices: number[] } };
  const orig = self.generateBranch.bind(t);
  self.generateBranch = (b: { level: number }) => {
    const from = self.branches.indices.length;
    orig(b);
    levels.push({ level: b.level, from, to: self.branches.indices.length });
  };
  t.generate();
  return { t, levels };
};

/** The leaves thinned to one in `keep`, each one left `grow` times as big about its stem. */
const thinLeaves = (g: THREE.BufferGeometry, keep: number, growBy: number) => {
  const pos = g.getAttribute("position"), uv = g.getAttribute("uv"), idx = g.getIndex()!;
  // (a leaf is one or two quads of four corners, six indices each, in order)
  const quads = idx.count / 6, P: number[] = [], U: number[] = [], I: number[] = [];
  for (let q = 0; q < quads; q++) {
    // (both quads of a crossed leaf go together)
    if (Math.floor(q / 2) % keep !== 0) continue;
    const v0 = idx.getX(q * 6);
    // stem: the middle of the quad's bottom edge (its corners 1 and 2)
    const ox = (pos.getX(v0 + 1) + pos.getX(v0 + 2)) / 2, oy = (pos.getY(v0 + 1) + pos.getY(v0 + 2)) / 2, oz = (pos.getZ(v0 + 1) + pos.getZ(v0 + 2)) / 2;
    const base = P.length / 3;
    for (let c = 0; c < 4; c++) {
      P.push(ox + (pos.getX(v0 + c) - ox) * growBy, oy + (pos.getY(v0 + c) - oy) * growBy, oz + (pos.getZ(v0 + c) - oz) * growBy);
      U.push(uv.getX(v0 + c), uv.getY(v0 + c));
    }
    I.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.Float32BufferAttribute(P, 3));
  out.setAttribute("uv", new THREE.Float32BufferAttribute(U, 2));
  out.setIndex(I);
  out.computeVertexNormals();
  return out;
};

/** The bark of branch levels up to `maxLevel` only. */
const barkUpTo = (g: THREE.BufferGeometry, levels: { level: number; from: number; to: number }[], maxLevel: number) => {
  const idx = g.getIndex()!, I: number[] = [];
  for (const l of levels) if (l.level <= maxLevel) for (let i = l.from; i < l.to; i++) I.push(idx.getX(i));
  const out = g.clone();
  out.setIndex(I);
  return out;
};

/** A shape: grown at its preset's size, then set at height 1 standing on the origin. */
export const ezProto = (shape: TreeShape, variant: number, detail: Detail): TreeProto => {
  const list = PRESETS[shape];
  const preset = list[variant % list.length];
  const { t, levels } = grow(preset, 1000 + variant * 7919);
  let bark = t.branchesMesh.geometry as THREE.BufferGeometry, leaves = t.leavesMesh.geometry as THREE.BufferGeometry;
  const barkMat = materialFor("bark", t.branchesMesh.material as THREE.MeshPhongMaterial, t.options.bark.type);
  const leafMat = materialFor("leaves", t.leavesMesh.material as THREE.MeshPhongMaterial, t.options.leaves.type);
  // The middle distance: the small twigs gone, one leaf in six left, bigger. Far: trunk and main
  // limbs, and a few big leaf clusters where the leaves were (the outline is what shows)
  if (detail === "mid") {
    bark = barkUpTo(bark, levels, shape === "conifer" ? 1 : 1);
    leaves = thinLeaves(leaves, shape === "bush" ? 4 : 6, shape === "bush" ? 1.9 : 2.3);
  } else if (detail === "far") {
    bark = barkUpTo(bark, levels, shape === "conifer" ? 0 : 1);
    leaves = thinLeaves(leaves, shape === "bush" ? 12 : 26, shape === "bush" ? 3.2 : 4.6);
  }
  const box = new THREE.Box3().setFromObject(t);
  const h = Math.max(0.01, box.max.y - box.min.y), w = Math.max(box.max.x - box.min.x, box.max.z - box.min.z);
  for (const g of [bark, leaves]) {
    g.translate(0, -box.min.y, 0);
    g.scale(1 / h, 1 / h, 1 / h);
    g.computeBoundingSphere();
    g.computeBoundingBox();
    g.userData.shared = true;
  }
  return { bark, leaves, needles: shape === "conifer", barkMat, leafMat, natural: w / h };
};

/** A tree's tint, made gentle for photographed leaves: toward the landscape's color, never dark. */
export const ezTint = (tint: THREE.Color) => {
  const hsl = { h: 0, s: 0, l: 0 };
  tint.getHSL(hsl);
  const c = new THREE.Color().setHSL(hsl.h, Math.min(0.55, hsl.s * 0.8), 0.72);
  return new THREE.Color(1, 1, 1).lerp(c, 0.45);
};
