// The course's tree shapes, grown by ez-tree (MIT, github.com/dgreenheck/ez-tree): oaks and
// ashes, pines and bushes from its presets, each seed its own tree, made once at unit height and
// shared (woods draw them instanced). Its photographed bark and leaves, lit like its demo.
//
// A tree is grown once for what it is (its preset, seed and own settings) and gives three
// versions: the full tree close by; the same branches without the small twigs and one leaf in
// six, bigger, in the middle distance; trunk, main limbs and a few big leaf clusters far off.
import * as THREE from "three";
import type { Tree as EzTree } from "@dgreenheck/ez-tree";
import type { Detail, TreeProto, TreeShape } from "./treeKit";

// ez-tree, loaded in the browser before the app starts (it loads its textures as soon as it is
// imported: tests outside a browser, and anything else without a page, never load it)
let Tree: (new () => EzTree) | null = null;
export const ezReady: Promise<void> = typeof document === "undefined"
  ? Promise.resolve()
  : import("@dgreenheck/ez-tree").then(m => { Tree = m.Tree as unknown as new () => EzTree; });
/** Whether ez-tree is there to grow trees (else the hand-built shapes stand in). */
export const ezLoaded = () => Tree !== null;

/** ez-tree's presets behind each kind's variants (a variant picks one, and its seed). */
const PRESETS: Record<TreeShape, string[]> = {
  broadleaf: ["Oak Medium", "Ash Medium", "Oak Large", "Ash Large", "Oak Small", "Ash Small"],
  conifer: ["Pine Medium", "Pine Large", "Pine Small", "Pine Large"],
  // (the first six: bushes; then the underbrush's own: briars, weeds, thicket shrubs, two each)
  bush: ["Bush 1", "Bush 3", "Bush 1", "Bush 3", "Bush 2", "Bush 2", "Briars", "Briars", "Weeds", "Ferns", "Thicket", "Thicket"]
};
/** How many variants a kind picks from when nothing says which (bushes: not the underbrush's own). */
export const EZ_VARIANTS: Record<TreeShape, number> = { broadleaf: 6, conifer: 4, bush: 6 };
/** The underbrush's own bush variants: briars, weeds and thicket shrubs. */
export const BRUSH_VARIANTS = { briars: [6, 7], weeds: [8, 9], thicket: [10, 11] } as const;

type Options = {
  branch: Record<"angle" | "children" | "gnarliness" | "length" | "radius" | "sections" | "segments" | "start" | "taper" | "twist", Record<number, number>> & { levels: number; force: { direction: { x: number; y: number; z: number }; strength: number } };
  bark: { type: string; tint: number; textureScale: { x: number; y: number } };
  leaves: { type: string; count: number; size: number; sizeVariance: number; angle: number; start: number; billboard: string };
};
/** Growths of our own, each from one of ez-tree's bushes reshaped. */
/** A growth of our own: the ez-tree bush it starts from, how it's reshaped, and (for the light
 * ones) how its leaves thin with distance: one in how many kept, how much bigger, middle to farthest. */
type Custom = { base: string; shape: (o: Options) => void; thin?: [number, number][] };
const CUSTOM: Record<string, Custom> = {
  // Briars: blackberry, greenbrier, multiflora rose. A mound of long, thin canes from the ground,
  // arching up and out and back down, twiggy side shoots all along, small dark leaves; reddish canes
  Briars: {
    base: "Bush 2",
    shape: o => {
      const b = o.branch;
      b.levels = 2;
      Object.assign(b.length, { 0: 0.1, 1: 26, 2: 5 });
      Object.assign(b.radius, { 0: 0.4, 1: 0.75, 2: 0.6 });
      Object.assign(b.children, { 0: 24, 1: 10 });
      Object.assign(b.angle, { 1: 42, 2: 55 });
      Object.assign(b.start, { 1: 0, 2: 0.15 });
      Object.assign(b.sections, { 0: 2, 1: 8, 2: 3 });
      Object.assign(b.segments, { 0: 3, 1: 3, 2: 3 });
      Object.assign(b.gnarliness, { 0: 0, 1: 0.1, 2: 0.4 });
      Object.assign(b.taper, { 1: 0.85, 2: 0.7 });
      Object.assign(b.twist, { 0: 0.4, 1: 0.03, 2: 0 });
      b.force.strength = -0.055;
      o.bark.type = "willow";
      o.bark.tint = 0x9a6458;
      o.bark.textureScale = { x: 0.5, y: 4 };
      Object.assign(o.leaves, { type: "oak", count: 5, size: 2.6, sizeVariance: 0.5, angle: 40, start: 0.3, billboard: "double" });
    },
    thin: [[2, 1.4], [3, 1.7], [7, 2.6]]
  },
  // Weeds: goldenrod, ironweed, pokeweed, broomsedge. A clump of thin stalks standing up, leaves
  // up their length; tan-green stems
  Weeds: {
    base: "Bush 2",
    shape: o => {
      const b = o.branch;
      b.levels = 1;
      Object.assign(b.length, { 0: 0.1, 1: 20 });
      Object.assign(b.radius, { 0: 0.35, 1: 0.32 });
      Object.assign(b.children, { 0: 32 });
      Object.assign(b.angle, { 1: 16 });
      Object.assign(b.start, { 1: 0 });
      Object.assign(b.sections, { 0: 2, 1: 6 });
      Object.assign(b.segments, { 0: 3, 1: 3 });
      Object.assign(b.gnarliness, { 0: 0, 1: 0.06 });
      Object.assign(b.taper, { 1: 0.9 });
      Object.assign(b.twist, { 0: 0.5, 1: 0 });
      b.force.strength = 0.006;
      o.bark.type = "birch";
      o.bark.tint = 0xa8ad7a;
      o.bark.textureScale = { x: 0.3, y: 3 };
      Object.assign(o.leaves, { type: "ash", count: 7, size: 2.1, sizeVariance: 0.6, angle: 55, start: 0.3, billboard: "double" });
    },
    thin: [[1, 1], [2, 1.3], [3, 1.6]]
  },
  // Ferns: bracken and Christmas fern in the shade, a clump of fronds (ez-tree's needle sprays)
  Ferns: {
    base: "Bush 2",
    shape: o => {
      const b = o.branch;
      b.levels = 1;
      Object.assign(b.length, { 0: 0.1, 1: 18 });
      Object.assign(b.radius, { 0: 0.3, 1: 0.18 });
      Object.assign(b.children, { 0: 40 });
      Object.assign(b.angle, { 1: 24 });
      Object.assign(b.start, { 1: 0 });
      Object.assign(b.sections, { 0: 2, 1: 5 });
      Object.assign(b.segments, { 0: 3, 1: 3 });
      Object.assign(b.gnarliness, { 0: 0, 1: 0.1 });
      Object.assign(b.taper, { 1: 0.9 });
      Object.assign(b.twist, { 0: 0.5, 1: 0 });
      b.force.strength = -0.004;
      o.bark.type = "birch";
      o.bark.tint = 0xb3a77a;
      o.bark.textureScale = { x: 0.3, y: 3 };
      Object.assign(o.leaves, { type: "pine", count: 5, size: 2.5, sizeVariance: 0.5, angle: 20, start: 0.1, billboard: "double" });
    },
    thin: [[1, 1], [2, 1.25], [3, 1.45]]
  },
  // Thicket shrubs: mountain laurel, rhododendron, privet. Big, many-stemmed, leafy to the ground
  // and packed tight
  Thicket: {
    base: "Bush 1",
    shape: o => {
      const b = o.branch;
      Object.assign(b.children, { 0: 13, 1: 4, 2: 3 });
      Object.assign(b.angle, { 1: 34 });
      Object.assign(b.start, { 1: 0.2, 2: 0.2 });
      Object.assign(b.gnarliness, { 1: 0.16, 2: 0.12 });
      o.leaves.type = "oak";
      o.leaves.count = 14;
      o.leaves.size *= 1.05;
    }
  }
};
/** Loads a preset (ez-tree's, or one of ours) into a tree's options. */
const loadInto = (t: EzTree, preset: string) => {
  const own = CUSTOM[preset];
  t.loadPreset(own ? own.base : preset);
  if (own) own.shape(t.options as unknown as Options);
};

/** The species a tree can be, by kind (ez-tree's preset families). */
export const SPECIES: Record<TreeShape, { id: string; label: string; presets: [string, string, string] }[]> = {
  broadleaf: [
    { id: "oak", label: "Oak", presets: ["Oak Small", "Oak Medium", "Oak Large"] },
    { id: "ash", label: "Ash", presets: ["Ash Small", "Ash Medium", "Ash Large"] }
  ],
  conifer: [{ id: "pine", label: "Pine", presets: ["Pine Small", "Pine Medium", "Pine Large"] }],
  bush: [
    { id: "round", label: "Round", presets: ["Bush 1", "Bush 1", "Bush 1"] },
    { id: "dense", label: "Dense", presets: ["Bush 3", "Bush 3", "Bush 3"] },
    { id: "airy", label: "Airy", presets: ["Bush 2", "Bush 2", "Bush 2"] },
    { id: "briars", label: "Briars", presets: ["Briars", "Briars", "Briars"] },
    { id: "weeds", label: "Weeds", presets: ["Weeds", "Weeds", "Ferns"] },
    { id: "thicket", label: "Thicket", presets: ["Thicket", "Thicket", "Thicket"] }
  ]
};
/** A species' preset for a tree of this height (a young tree, a grown one, an old one). */
export const presetFor = (shape: TreeShape, species: string, height: number) => {
  const sp = SPECIES[shape].find(s => s.id === species) ?? SPECIES[shape][0];
  return sp.presets[shape === "bush" ? 0 : height < 30 ? 0 : height < 58 ? 1 : 2];
};
export const speciesOfPreset = (shape: TreeShape, preset: string) => (SPECIES[shape].find(s => s.presets.includes(preset)) ?? SPECIES[shape][0]).id;

/** What a tree is grown from: its preset and seed, and its own settings (unset: the preset's). */
export type TreeSpec = {
  preset: string;
  seed: number;
  /** Where the branches start, as a share of the trunk (ez-tree's branch.start[1]). */
  crownBase?: number;
  /** Main limbs off the trunk (a pine: its branches up the trunk). */
  limbs?: number;
  /** Trunk thickness, 1 = the preset's. */
  trunk?: number;
  /** Leaves, 1 = the preset's. */
  fullness?: number;
};

/** A pool variant's spec (what an untouched tree of the woods or the survey is). */
export const specOf = (shape: TreeShape, variant: number): TreeSpec => {
  const list = PRESETS[shape];
  return { preset: list[variant % list.length], seed: 1000 + variant * 7919 };
};
const keyOf = (s: TreeSpec) => JSON.stringify([s.preset, s.seed, s.crownBase ?? null, s.limbs ?? null, s.trunk ?? null, s.fullness ?? null]);

/** The preset's own values of the settings (what the sliders start at). */
export const presetDefaults = (preset: string) => {
  if (!Tree) return { crownBase: 0.3, limbs: 6 };
  const t = new Tree();
  loadInto(t, preset);
  return { crownBase: t.options.branch.start[1] as number, limbs: t.options.branch.children[0] as number };
};

const mats = new Map<string, THREE.Material>();
/** One material per bark and leaf texture, shared; instancing-friendly (each tree's tint comes in
 * as its instance color, so it multiplies the photographed leaves gently). */
const materialFor = (kind: "bark" | "leaves", from: THREE.MeshPhongMaterial, key: string, tint?: number) => {
  let m = mats.get(`${kind}|${key}`);
  if (m) return m;
  m = kind === "leaves"
    ? new THREE.MeshPhongMaterial({ name: `ez-leaves-${key}`, map: from.map, side: THREE.DoubleSide, alphaTest: from.alphaTest || 0.5, dithering: true, shininess: 4 })
    : new THREE.MeshPhongMaterial({ name: `ez-bark-${key}`, map: from.map, normalMap: from.normalMap, aoMap: from.aoMap, shininess: 2, color: tint ?? 0xffffff });
  if (kind === "leaves") (m as THREE.MeshPhongMaterial).alphaToCoverage = true;
  m.userData.shared = true;
  mats.set(`${kind}|${key}`, m);
  return m;
};

/** Grows the tree, noting which bark indices belong to which branch level (for the lighter versions). */
const grow = (spec: TreeSpec) => {
  const t = new Tree!();
  loadInto(t, spec.preset);
  const o = t.options;
  o.seed = spec.seed;
  // (aspen leaves are autumn-yellow: the green landscapes take ash leaves on those bushes)
  if (o.leaves.type === "aspen") o.leaves.type = "ash";
  if (spec.crownBase !== undefined) o.branch.start[1] = Math.min(0.95, Math.max(0, spec.crownBase));
  if (spec.limbs !== undefined) o.branch.children[0] = Math.max(1, Math.round(spec.limbs));
  if (spec.trunk !== undefined) o.branch.radius[0] *= Math.max(0.3, spec.trunk);
  if (spec.fullness !== undefined) {
    o.leaves.count = Math.max(1, Math.round(o.leaves.count * spec.fullness));
    o.leaves.size *= 0.85 + 0.15 * Math.min(1.6, spec.fullness);
  }
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

type Grown = Record<Detail, TreeProto>;
const grown = new Map<string, Grown>();

/** A tree's three versions, at height 1 standing on the origin (grown once per spec). */
export const ezTree = (shape: TreeShape, spec: TreeSpec, detail: Detail): TreeProto => {
  const key = keyOf(spec);
  let g = grown.get(key);
  if (!g) {
    const { t, levels } = grow(spec);
    const bark0 = t.branchesMesh.geometry as THREE.BufferGeometry, leaves0 = t.leavesMesh.geometry as THREE.BufferGeometry;
    // (bark keeps ez-tree's own colors on our growths only: its presets' tints are near white)
    const ownBark = CUSTOM[spec.preset] ? t.options.bark.tint : undefined;
    const barkMat = materialFor("bark", t.branchesMesh.material as THREE.MeshPhongMaterial, `${t.options.bark.type}${ownBark ?? ""}`, ownBark);
    const leafMat = materialFor("leaves", t.leavesMesh.material as THREE.MeshPhongMaterial, t.options.leaves.type);
    const box = new THREE.Box3().setFromObject(t);
    const h = Math.max(0.01, box.max.y - box.min.y), w = Math.max(box.max.x - box.min.x, box.max.z - box.min.z);
    const bush = shape === "bush", pine = shape === "conifer";
    const thin = CUSTOM[spec.preset]?.thin;
    const versions: [Detail, THREE.BufferGeometry, THREE.BufferGeometry][] = [
      ["near", bark0, leaves0],
      ["mid", barkUpTo(bark0, levels, 1), thinLeaves(leaves0, ...(thin?.[0] ?? (bush ? [4, 1.9] : [6, 2.3])))],
      ["far", barkUpTo(bark0, levels, pine ? 0 : 1), thinLeaves(leaves0, ...(thin?.[1] ?? (bush ? [12, 3.2] : [26, 4.6])))],
      // (underbrush past arm's reach: the main stems and a few big leaf clusters; our own thin
      // growths, their leaves alone)
      ["brush", barkUpTo(bark0, levels, bush && !thin ? 1 : 0), thinLeaves(leaves0, ...(thin?.[2] ?? (bush ? [30, 5] : [40, 5.6])))]
    ];
    g = {} as Grown;
    for (const [d, bark, leaves] of versions) {
      for (const geo of [bark, leaves]) {
        geo.translate(0, -box.min.y, 0);
        geo.scale(1 / h, 1 / h, 1 / h);
        geo.computeBoundingSphere();
        geo.computeBoundingBox();
        geo.userData.shared = true;
      }
      g[d] = { bark, leaves, needles: pine, barkMat, leafMat, natural: w / h };
    }
    grown.set(key, g);
    // (a tree's own shapes, set by hand, don't pile up: the oldest of those go)
    if (grown.size > 400) for (const k of grown.keys()) { if (grown.size <= 360) break; if (!POOL.has(k)) grown.delete(k); }
  }
  return g[detail];
};
const POOL = new Set<string>();

/** A pool variant's shape (what an untouched tree of the woods or the survey is). */
export const ezProto = (shape: TreeShape, variant: number, detail: Detail): TreeProto => {
  const spec = specOf(shape, variant);
  POOL.add(keyOf(spec));
  return ezTree(shape, spec, detail);
};

/** A tree's tint, made gentle for photographed leaves: toward the landscape's color, never dark. */
export const ezTint = (tint: THREE.Color) => {
  const hsl = { h: 0, s: 0, l: 0 };
  tint.getHSL(hsl);
  const c = new THREE.Color().setHSL(hsl.h, Math.min(0.55, hsl.s * 0.8), 0.72);
  return new THREE.Color(1, 1, 1).lerp(c, 0.45);
};
