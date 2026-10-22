// The new tree looks being tried in the tree lab (each a column beside today's trees).
import * as THREE from "three";
import { Tree } from "@dgreenheck/ez-tree";
import type { Maker } from "./treeLab";
import type { TreeShape } from "../three/treeKit";

/** ez-tree's presets for each kind (one per tree in the row). */
const PRESETS: Record<TreeShape, string[]> = {
  broadleaf: ["Oak Medium", "Ash Medium", "Aspen Medium", "Oak Large"],
  conifer: ["Pine Medium", "Pine Large", "Pine Small", "Pine Medium"],
  bush: ["Bush 1", "Bush 2", "Bush 3", "Bush 1"]
};

/** Triangles drawn by the candidates' trees, for the lab's readout. */
export const triangles: Record<string, number> = {};

export const CANDIDATES: { name: string; make: Maker }[] = [
  {
    name: "ez-tree",
    make: (kind, v, height, _width, _tint, seed) => {
      const t = new Tree();
      const preset = PRESETS[kind][v % 4];
      t.loadPreset(preset);
      t.options.seed = seed;
      t.generate();
      // (to the height asked, its own proportions)
      const box = new THREE.Box3().setFromObject(t);
      const s = height / Math.max(0.01, box.max.y - box.min.y);
      const g = new THREE.Group();
      t.scale.setScalar(s);
      t.position.y = -box.min.y * s;
      g.add(t);
      g.userData.label = `${preset} · ${(t.triangleCount / 1000).toFixed(1)}k tris`;
      g.userData.top = height;
      triangles[`${kind}:${v}`] = t.triangleCount;
      return g;
    }
  }
];
