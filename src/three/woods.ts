// Woods in 3D: a drawn woods area filled with trees (one instanced trunk and crown shape for all
// of them, so thousands stay quick), each a little different in size, lean and color.
import * as THREE from "three";
import type { P } from "../types";
import { pointInPolygon } from "../lib/geom";

const MAX_TREES = 6000;

/** Trees about every `spacing` feet inside the outline, standing on the ground. */
export const createWoods = (outline: P[], groundAt: (x: number, y: number) => number, color: string, spacing = 22) => {
  const group = new THREE.Group();
  if (outline.length < 3) return group;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of outline) { minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y); }
  const area = (maxX - minX) * (maxY - minY);
  const step = Math.max(spacing, Math.sqrt(area / MAX_TREES));
  let seed = Math.round(Math.abs(minX * 13 + minY * 7)) % 2147483646 + 1;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const spots: { x: number; y: number; h: number; r: number; conifer: boolean }[] = [];
  for (let y = minY; y <= maxY; y += step * 0.87) {
    for (let x = minX + ((Math.round((y - minY) / step) % 2) * step) / 2; x <= maxX; x += step) {
      const p = { x: x + (rnd() - 0.5) * step * 0.6, y: y + (rnd() - 0.5) * step * 0.6 };
      if (!pointInPolygon(p, outline)) continue;
      const h = 35 + rnd() * 35;
      spots.push({ ...p, h, r: step * (0.55 + rnd() * 0.3), conifer: rnd() < 0.25 });
    }
  }
  if (!spots.length) return group;
  const trunkGeo = new THREE.CylinderGeometry(0.5, 0.9, 1, 6);
  trunkGeo.translate(0, 0.5, 0);
  const trunks = new THREE.InstancedMesh(trunkGeo, new THREE.MeshStandardMaterial({ color: 0x4f3d2e, roughness: 1 }), spots.length);
  const leafy = spots.filter(s => !s.conifer), pines = spots.filter(s => s.conifer);
  const crownGeo = new THREE.IcosahedronGeometry(1, 1);
  const pineGeo = new THREE.ConeGeometry(1, 1, 7);
  pineGeo.translate(0, 0.5, 0);
  const crowns = new THREE.InstancedMesh(crownGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, flatShading: true }), Math.max(1, leafy.length));
  const cones = new THREE.InstancedMesh(pineGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, flatShading: true }), Math.max(1, pines.length));
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), pos = new THREE.Vector3();
  const base = new THREE.Color(color);
  const c = new THREE.Color();
  spots.forEach((t, i) => {
    const g = groundAt(t.x, t.y);
    q.setFromEuler(new THREE.Euler((rnd() - 0.5) * 0.06, rnd() * Math.PI * 2, (rnd() - 0.5) * 0.06));
    m.compose(pos.set(t.x, g, t.y), q, s.set(1, t.h * 0.45, 1));
    trunks.setMatrixAt(i, m);
  });
  leafy.forEach((t, i) => {
    const g = groundAt(t.x, t.y);
    q.setFromEuler(new THREE.Euler(0, rnd() * Math.PI * 2, 0));
    m.compose(pos.set(t.x, g + t.h * 0.62, t.y), q, s.set(t.r, t.h * 0.36, t.r));
    crowns.setMatrixAt(i, m);
    crowns.setColorAt(i, c.copy(base).offsetHSL((rnd() - 0.5) * 0.05, (rnd() - 0.5) * 0.1, (rnd() - 0.5) * 0.1));
  });
  pines.forEach((t, i) => {
    const g = groundAt(t.x, t.y);
    m.compose(pos.set(t.x, g + t.h * 0.15, t.y), q.identity(), s.set(t.r * 0.75, t.h * 0.9, t.r * 0.75));
    cones.setMatrixAt(i, m);
    cones.setColorAt(i, c.copy(base).offsetHSL(0.02, -0.05, -0.08 + (rnd() - 0.5) * 0.08));
  });
  for (const mesh of [trunks, crowns, cones]) {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    group.add(mesh);
  }
  if (!pines.length) cones.visible = false;
  if (!leafy.length) crowns.visible = false;
  group.name = "woods";
  return group;
};
