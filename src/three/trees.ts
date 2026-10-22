// Trees: real-looking trees from the shared tree kit (three/treeKit: a branching skeleton and
// leaf-spray cards), and palms (a ringed trunk and drooping fronds). (From the Security Camera
// Planner.)
import * as THREE from "three";
import { presetFor, specOf, speciesOfPreset, type TreeSpec } from "./ezShapes";
import { clamp } from "../constants";
import type { TreeItem } from "../types";
import { treeMeshes, variantOf, type TreeShape, forestDetail, midOf } from "./treeKit";

export const getTreeSignature = (item: TreeItem) =>
  `${item.radius}|${item.height ?? 30}|${item.width ?? 1}|${item.treeType ?? 'deciduous'}|${item.color}|${item.variant ?? ""}|${item.leaf ?? ""}|` +
  JSON.stringify([item.species, item.seed, item.crownBase, item.lean, item.leanDir, item.limbs, item.trunk, item.fullness, item.rotation]);

/** What a tree item is grown from: its pool shape when untouched, else its own spec. */
export const itemSpec = (item: TreeItem, shape: TreeShape, variant: number, height: number): TreeSpec | undefined => {
  const own = item.species !== undefined || item.seed !== undefined || item.crownBase !== undefined || item.limbs !== undefined || item.trunk !== undefined || item.fullness !== undefined;
  if (!own) return undefined;
  const pool = specOf(shape, variant);
  // (its own preset until a species is picked: a setting changed doesn't grow it anew)
  const preset = item.species !== undefined && item.species !== speciesOfPreset(shape, pool.preset) ? presetFor(shape, item.species, height) : pool.preset;
  return { preset, seed: item.seed ?? pool.seed, crownBase: item.crownBase, limbs: item.limbs, trunk: item.trunk, fullness: item.fullness };
};

/** Leaf color for a tree from its (map) color: lifted to a real crown's lightness, varied a little. */
export const foliageTint = (color: string, rand: () => number) => {
  const c = new THREE.Color(color);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  return c.setHSL(hsl.h + (rand() - 0.5) * 0.04, clamp(hsl.s * (0.9 + rand() * 0.25), 0.22, 0.62), clamp(hsl.l * 1.3 + 0.07 + (rand() - 0.5) * 0.08, 0.2, 0.5));
};

/** The course's tree colors (its landscape's): the color, and the mix the woods vary through. A
 * tree placed by hand takes them like the woods and the measured trees do, each its own pick. */
export type TreeLook = { color: string; mix: string[] };

export const create3dTree = (item: TreeItem, look?: TreeLook): THREE.Group => {
  const treeHeight = item.height ?? 30;
  const widthMultiplier = item.width ?? 1;
  const treeType = item.treeType ?? "deciduous";
  // Deterministic per-tree variation
  const seed = item.id.split("").reduce((acc, ch) => (acc * 31 + ch.charCodeAt(0)) >>> 0, 7);
  const rand = (i: number) => {
    const x = Math.sin(seed * 0.0001 + i * 12.9898) * 43758.5453;
    return x - Math.floor(x);
  };
  let k = 70;
  const next = () => rand(k++);
  let group: THREE.Group;
  if (treeType !== "palm") {
    const shape: TreeShape = treeType === "conifer" ? "conifer" : treeType === "bush" ? "bush" : "broadleaf";
    const height = shape === "bush" ? Math.min(treeHeight, Math.max(3, item.radius * 1.2)) : treeHeight;
    // (the landscape's colors, one of its mix per tree as in the woods; a pine darker and bluer)
    let tint: THREE.Color;
    if (item.leaf) tint = new THREE.Color(item.leaf);
    else {
      const leaf = look ? (look.mix.length && shape !== "conifer" ? look.mix[Math.floor(next() * look.mix.length)] : look.color) : item.color;
      tint = foliageTint(leaf, next);
      if (shape === "conifer") tint.offsetHSL(0.03, -0.06, -0.08);
    }
    // (close, middle and far versions, as the woods have, by distance from the camera)
    const variant = item.variant ?? variantOf(item.id, shape), w = item.radius * 2 * widthMultiplier;
    const spec = itemSpec(item, shape, variant, height);
    const lod = new THREE.LOD();
    lod.addLevel(treeMeshes(shape, variant, height, w, tint, "near", false, spec), 0);
    lod.addLevel(treeMeshes(shape, variant, height, w, tint, "mid", false, spec), forestDetail.nearFt);
    lod.addLevel(treeMeshes(shape, variant, height, w, tint, "far", false, spec), midOf(forestDetail.nearFt));
    // Its lean: tilted over about its foot (the map's north is -z; the turn is undone so the lean
    // keeps its compass direction whichever way the tree is turned)
    const tilt = new THREE.Group();
    if (item.lean) {
      const dir = ((item.leanDir ?? 0) + (item.rotation ?? 0)) * (Math.PI / 180);
      tilt.rotation.set(-Math.cos(dir) * item.lean * (Math.PI / 180), 0, -Math.sin(dir) * item.lean * (Math.PI / 180), "XZY");
    }
    tilt.add(lod);
    group = new THREE.Group();
    group.add(tilt);
  } else {
    group = new THREE.Group();
    const base = foliageTint(look?.color ?? item.color, next);
    const add = (m: THREE.Object3D) => { group.add(m); return m; };
      // Palm: a tall, slightly leaning ringed trunk and drooping fronds.
      const trunkRadius = clamp(item.radius * 0.08, 0.35, 1.2);
      const trunkH = treeHeight * 0.88;
      const lean = new THREE.Vector3((rand(1) - 0.5) * 0.15 * trunkH, 0, (rand(2) - 0.5) * 0.15 * trunkH);
      const segments = 10;
      const bark = new THREE.MeshStandardMaterial({ color: "#8a7458", roughness: 1 });
      let prev = new THREE.Vector3();
      for (let i = 1; i <= segments; i++) {
        const t = i / segments;
        const p = new THREE.Vector3(lean.x * t * t, trunkH * t, lean.z * t * t);
        const len = prev.distanceTo(p);
        const geo = new THREE.CylinderGeometry(trunkRadius * (1 - t * 0.3), trunkRadius * (1 - (t - 1 / segments) * 0.3) * 1.06, len, 8);
        geo.translate(0, len / 2, 0);
        const seg = new THREE.Mesh(geo, bark);
        seg.position.copy(prev);
        seg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), p.clone().sub(prev).normalize());
        seg.castShadow = true;
        add(seg);
        prev = p;
      }
      const frondMat = new THREE.MeshStandardMaterial({ color: base, roughness: 0.8, side: THREE.DoubleSide });
      const frondLength = Math.max(item.radius * widthMultiplier, 4);
      for (let i = 0; i < 11; i++) {
        const angle = (i / 11) * Math.PI * 2 + rand(i) * 0.3;
        // A frond: a long tapered strip arching out and down
        const pts: number[] = [];
        const steps = 8;
        for (let k = 0; k < steps; k++) {
          const t0 = k / steps, t1 = (k + 1) / steps;
          const w0 = Math.sin(Math.PI * t0) * frondLength * 0.14 + 0.05, w1 = Math.sin(Math.PI * t1) * frondLength * 0.14 + 0.05;
          const y0 = Math.sin(t0 * Math.PI * 0.6) * frondLength * 0.25 - t0 * t0 * frondLength * 0.55;
          const y1 = Math.sin(t1 * Math.PI * 0.6) * frondLength * 0.25 - t1 * t1 * frondLength * 0.55;
          const x0 = t0 * frondLength, x1 = t1 * frondLength;
          pts.push(x0, y0, -w0, x1, y1, -w1, x1, y1, w1, x0, y0, -w0, x1, y1, w1, x0, y0, w0);
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
        geo.computeVertexNormals();
        const frond = new THREE.Mesh(geo, frondMat);
        frond.position.copy(prev);
        frond.rotation.y = angle;
        frond.castShadow = true;
        add(frond);
      }
  }
  group.position.set(item.x, 0, item.y);
  group.rotation.y = -THREE.MathUtils.degToRad(item.rotation);
  return group;
};
