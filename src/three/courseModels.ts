// 3D models of the course's furniture at real size (feet): tee pads, baskets, mando and drop
// zone signs, benches, cans, kiosks and so on. Built from simple shapes; materials are shared.
import * as THREE from "three";
import { AMENITY_KINDS, TEE_LEVELS, TEE_SURFACES } from "../constants";
import type { AmenityKind, TeeItem } from "../types";

const mats = new Map<string, THREE.Material>();
const mat = (key: string, make: () => THREE.Material) => {
  let m = mats.get(key);
  if (!m) {
    m = make();
    m.userData.shared = true;
    mats.set(key, m);
  }
  return m;
};
const std = (color: string | number, roughness = 0.8, metalness = 0) =>
  mat(`std:${color}:${roughness}:${metalness}`, () => new THREE.MeshStandardMaterial({ color, roughness, metalness }));

const box = (w: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0) => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
};
const cyl = (r0: number, r1: number, h: number, m: THREE.Material, x = 0, y = 0, z = 0, seg = 16, open = false) => {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, h, seg, 1, open), m);
  mesh.position.set(x, y + h / 2, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
};

/** A sign face with text, as a texture (for tee signs, mando arrows, DZ plates). */
const signTexture = (key: string, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void, w = 256, h = 128) => {
  if (typeof document === "undefined") return null;
  const k = `tex:${key}`;
  const cached = mats.get(k) as THREE.MeshStandardMaterial | undefined;
  if (cached) return cached;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d");
  if (!g) return null;
  draw(g, w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.userData.shared = true;
  const m = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 });
  m.userData.shared = true;
  mats.set(k, m);
  return m;
};

/**
 * A tee pad: a slab facing +x (its length along x), the tee color painted at its front edge, and
 * the tee sign on a post behind it.
 */
export const createTeePad = (tee: TeeItem, holeNumber: number | string) => {
  const g = new THREE.Group();
  const L = tee.padLength, W = tee.padWidth;
  const thick = tee.surface === "natural" ? 0.05 : 0.35;
  // (the pad and what is painted on it, tilted with the ground: see fitTeePad)
  const deck = new THREE.Group();
  deck.name = "tee-deck";
  g.add(deck);
  const slab = box(L, thick, W, std(TEE_SURFACES[tee.surface].color, tee.surface === "rubber" ? 0.95 : 0.9), 0, thick / 2 - 0.05, 0);
  slab.name = "tee-pad";
  deck.add(slab);
  // Painted tee color: a band across the front, plus the hole number on the pad
  const lvl = TEE_LEVELS[tee.level];
  const band = box(0.8, 0.02, W * 0.96, std(lvl.color, 0.7), L / 2 - 0.6, thick - 0.04, 0);
  deck.add(band);
  const onTop: THREE.Object3D[] = [band];
  const plate = signTexture(`pad:${holeNumber}:${tee.level}`, (c, w, h) => {
    c.fillStyle = lvl.color;
    c.fillRect(0, 0, w, h);
    c.fillStyle = lvl.ink;
    c.font = `bold ${h * 0.8}px Oswald, Inter, sans-serif`;
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText(String(holeNumber), w / 2, h / 2 + 4);
  }, 128, 128);
  if (plate) {
    const num = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(2, W * 0.5), Math.min(2, W * 0.5)), plate);
    num.rotation.set(-Math.PI / 2, 0, -Math.PI / 2);
    num.position.set(-L / 2 + 1.4, thick - 0.03, 0);
    deck.add(num);
    onTop.push(num);
  }
  // The tee sign: behind the pad, a little to the side, facing the player (toward -x): a board on
  // two posts behind it
  const sign = new THREE.Group();
  const wood = std("#5b4636", 0.9);
  for (const z of [-0.7, 0.7]) sign.add(cyl(0.12, 0.12, 4.15, wood, 0.19, 0, z, 8));
  const face = signTexture(`tee-sign:${holeNumber}`, (c, w, h) => {
    c.fillStyle = "#14532d";
    c.fillRect(0, 0, w, h);
    c.strokeStyle = "#fefce8";
    c.lineWidth = 6;
    c.strokeRect(6, 6, w - 12, h - 12);
    c.fillStyle = "#fefce8";
    c.font = `bold ${h * 0.55}px Oswald, Inter, sans-serif`;
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText(`HOLE ${holeNumber}`, w / 2, h / 2 + 4);
  });
  const board = box(0.12, 1.2, 1.8, face ?? std("#14532d"), 0, 3.6, 0);
  sign.add(board);
  sign.position.set(-L / 2 - 2.5, 0, W / 2 + 1.5);
  g.add(sign);
  for (const o of onTop) o.userData.y0 = o.position.y;
  g.userData.pad = { deck, slab, onTop, sign, thick };
  return g;
};

/** How steep a tee pad can lie with the ground (about 8°); steeper ground is built up under it. */
const PAD_TILT = Math.tan((8 * Math.PI) / 180);

/**
 * A tee pad on sloping ground (placed at its middle's ground height, facing `aim` degrees): tilted
 * with the ground as far as a pad can be, raised just clear of the highest ground under it and
 * built down into the lowest, so the ground never cuts through it; the sign's posts on their own
 * ground.
 */
export const fitTeePad = (obj: THREE.Object3D, tee: Pick<TeeItem, "x" | "y" | "padLength" | "padWidth">, aim: number, ground: (x: number, y: number) => number) => {
  const pad = obj.userData.pad as { deck: THREE.Object3D; slab: THREE.Object3D; onTop: THREE.Object3D[]; sign: THREE.Object3D; thick: number } | undefined;
  if (!pad) return;
  const a = (aim * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  const L = tee.padLength, W = tee.padWidth;
  const at = (lx: number, lz: number) => ground(tee.x + lx * c - lz * s, tee.y + lx * s + lz * c);
  const g0 = ground(tee.x, tee.y);
  // The ground under it, every couple of feet (along its length x and across it z)
  const nx = Math.max(2, Math.ceil(L / 2)), nz = Math.max(2, Math.ceil(W / 2));
  const pts: { x: number; z: number; d: number }[] = [];
  for (let i = 0; i <= nx; i++) for (let j = 0; j <= nz; j++) {
    const x = (i / nx - 0.5) * L, z = (j / nz - 0.5) * W;
    pts.push({ x, z, d: at(x, z) - g0 });
  }
  // Its slope each way (the ground's, as far as a pad can lie)
  const fit = (k: "x" | "z") => pts.reduce((t, p) => t + p[k] * p.d, 0) / (pts.reduce((t, p) => t + p[k] * p[k], 0) || 1);
  const tx = Math.max(-PAD_TILT, Math.min(PAD_TILT, fit("x"))), tz = Math.max(-PAD_TILT, Math.min(PAD_TILT, fit("z")));
  pad.deck.rotation.set(-Math.atan(tz), 0, Math.atan(tx), "XYZ");
  // What is left above and below that slope
  let hi = 0, lo = 0;
  for (const p of pts) {
    const r = p.d - (p.x * tx + p.z * tz);
    hi = Math.max(hi, r);
    lo = Math.min(lo, r);
  }
  const top0 = pad.thick - 0.05;
  const top = hi + top0, bottom = lo - 0.2;
  pad.slab.scale.y = (top - bottom) / pad.thick;
  pad.slab.position.y = (top + bottom) / 2;
  for (const o of pad.onTop) o.position.y = (o.userData.y0 as number) + hi;
  pad.sign.position.y = at(pad.sign.position.x, pad.sign.position.z) - g0;
};

/** A basket at real size (about 4.5 ft tall): pole, tray, chains and a colored top band. */
export const createBasket = (bandColor: string) => {
  const g = new THREE.Group();
  const steel = std("#b8bec4", 0.35, 0.8);
  const zinc = std("#9aa1a8", 0.45, 0.7);
  g.add(cyl(0.085, 0.085, 4.6, steel, 0, 0, 0, 10));
  // Tray: a shallow open cylinder with a bottom, rim about 2.7 ft up
  const tray = cyl(1.0, 1.12, 0.75, zinc, 0, 1.95, 0, 24, true);
  (tray.material as THREE.Material).side = THREE.DoubleSide;
  g.add(tray);
  const bottom = new THREE.Mesh(new THREE.CircleGeometry(1.0, 24), zinc);
  bottom.rotation.x = -Math.PI / 2;
  bottom.position.y = 1.96;
  g.add(bottom);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(1.12, 0.05, 6, 32), steel);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 2.7;
  g.add(rim);
  // Chains: from the top band down and in to the pole above the tray
  const chainPts: number[] = [];
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const outer = i % 2 === 0;
    const r = outer ? 0.98 : 0.6;
    chainPts.push(Math.cos(a) * r, 4.25, Math.sin(a) * r, Math.cos(a) * 0.12, 2.75, Math.sin(a) * 0.12);
  }
  const chainGeo = new THREE.BufferGeometry();
  chainGeo.setAttribute("position", new THREE.Float32BufferAttribute(chainPts, 3));
  g.add(new THREE.LineSegments(chainGeo, mat("chains", () => new THREE.LineBasicMaterial({ color: 0xd4d8dc }))));
  // Faint "curtain" so the chains read from far away and cast a shadow
  const curtain = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 0.15, 1.5, 24, 1, true), mat("curtain", () => new THREE.MeshStandardMaterial({ color: 0xc9ced3, metalness: 0.6, roughness: 0.4, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false })));
  curtain.position.y = 3.5;
  curtain.castShadow = true;
  g.add(curtain);
  const band = cyl(1.02, 1.02, 0.35, std(bandColor, 0.5), 0, 4.2, 0, 24, true);
  (band.material as THREE.Material).side = THREE.DoubleSide;
  g.add(band);
  g.add(cyl(0.2, 0.2, 0.15, std(bandColor, 0.5), 0, 4.55, 0, 12));
  return g;
};

/** A mando: a post with an orange arrow pointing to the side the disc must pass. Faces +x (play direction). */
export const createMando = (side: "left" | "right") => {
  const g = new THREE.Group();
  g.add(box(0.33, 6, 0.33, std("#7c5a3c", 0.95), 0, 3, 0));
  const face = signTexture(`mando:${side}`, (c, w, h) => {
    c.fillStyle = "#f97316";
    c.fillRect(0, 0, w, h);
    c.fillStyle = "#ffffff";
    c.beginPath();
    // Arrow toward the pass side (as seen by a player throwing along +x)
    const dir = side === "right" ? 1 : -1;
    const cx = w / 2;
    c.moveTo(cx - dir * w * 0.35, h * 0.38);
    c.lineTo(cx + dir * w * 0.05, h * 0.38);
    c.lineTo(cx + dir * w * 0.05, h * 0.18);
    c.lineTo(cx + dir * w * 0.38, h * 0.5);
    c.lineTo(cx + dir * w * 0.05, h * 0.82);
    c.lineTo(cx + dir * w * 0.05, h * 0.62);
    c.lineTo(cx - dir * w * 0.35, h * 0.62);
    c.closePath();
    c.fill();
  });
  // The board faces back down the hole (-x), toward the player
  const board = box(0.1, 1.0, 2.0, face ?? std("#f97316"), -0.22, 5.3, 0);
  g.add(board);
  return g;
};

/** A drop zone: a small orange "DZ" sign and a disc-sized orange mark. */
export const createDropZone = () => {
  const g = new THREE.Group();
  g.add(cyl(0.08, 0.08, 2.6, std("#4b5563", 0.6, 0.4), 0, 0, 0, 8));
  const face = signTexture("dz", (c, w, h) => {
    c.fillStyle = "#f97316";
    c.fillRect(0, 0, w, h);
    c.fillStyle = "#ffffff";
    c.font = `bold ${h * 0.7}px Oswald, Inter, sans-serif`;
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText("DZ", w / 2, h / 2 + 4);
  }, 128, 96);
  g.add(box(0.08, 0.75, 1.0, face ?? std("#f97316"), 0, 2.6, 0));
  const ring = new THREE.Mesh(new THREE.RingGeometry(2.2, 2.7, 32), mat("dz-ring", () => new THREE.MeshBasicMaterial({ color: 0xf97316, transparent: true, opacity: 0.85, depthWrite: false })));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.12;
  g.add(ring);
  return g;
};

export const createAmenity = (kind: AmenityKind) => {
  const g = new THREE.Group();
  const wood = std("#8b6a4a", 0.9);
  const dark = std("#3f3f46", 0.7, 0.3);
  switch (kind) {
    case "bench":
      g.add(box(5, 0.15, 1.4, wood, 0, 1.5, 0));
      g.add(box(5, 1, 0.12, wood, 0, 2.3, -0.65));
      [-2, 2].forEach(x => g.add(box(0.2, 1.5, 1.2, dark, x, 0.75, 0)));
      break;
    case "trash":
      g.add(cyl(1.0, 1.05, 3, std("#14532d", 0.6, 0.2), 0, 0, 0, 16));
      g.add(cyl(1.1, 1.1, 0.2, dark, 0, 3, 0, 16));
      break;
    case "sign":
    case "kiosk": {
      const wide = kind === "kiosk";
      const w = wide ? 6 : 2.5;
      [-w / 2 + 0.2, w / 2 - 0.2].forEach(x => g.add(box(0.33, wide ? 7 : 5, 0.33, wood, x, wide ? 3.5 : 2.5, 0)));
      g.add(box(w, wide ? 3.5 : 1.8, 0.15, std(wide ? "#0e7490" : "#14532d", 0.6), 0, wide ? 4.6 : 3.8, 0));
      if (wide) g.add(box(w + 1.5, 0.2, 2, std("#7c2d12", 0.9), 0, 7.1, 0));
      break;
    }
    case "restroom":
      g.add(box(8, 8, 6, std("#d6d3d1", 0.9), 0, 4, 0));
      g.add(box(9, 0.5, 7, std("#57534e", 0.9), 0, 8.25, 0));
      break;
    case "shelter":
      [[-7, -5], [7, -5], [-7, 5], [7, 5]].forEach(([x, z]) => g.add(box(0.5, 8, 0.5, wood, x, 4, z)));
      g.add(box(17, 0.6, 13, std("#7c2d12", 0.9), 0, 8.3, 0));
      g.add(box(8, 0.2, 3, wood, 0, 2.5, 0));
      break;
    case "parking":
    case "water":
    case "practice": {
      if (kind === "practice") return createBasket("#f97316");
      if (kind === "water") {
        g.add(cyl(0.6, 0.5, 3, std("#64748b", 0.5, 0.5), 0, 0, 0, 12));
        g.add(cyl(0.9, 0.9, 0.3, std("#94a3b8", 0.4, 0.6), 0, 3, 0, 16));
        break;
      }
      g.add(cyl(0.1, 0.1, 7, std("#9ca3af", 0.4, 0.6), 0, 0, 0, 8));
      const face = signTexture("parking", (c, w, h) => {
        c.fillStyle = "#1d4ed8";
        c.fillRect(0, 0, w, h);
        c.fillStyle = "#ffffff";
        c.font = `bold ${h * 0.75}px Inter, sans-serif`;
        c.textAlign = "center";
        c.textBaseline = "middle";
        c.fillText("P", w / 2, h / 2 + 4);
      }, 128, 128);
      g.add(box(0.1, 1.6, 1.6, face ?? std("#1d4ed8"), 0, 6.3, 0));
      break;
    }
    case "bridge":
      g.add(box(16, 0.6, 5, wood, 0, 0.8, 0));
      [-2.4, 2.4].forEach(z => g.add(box(16, 0.2, 0.2, wood, 0, 3.4, z)));
      [-7.5, 0, 7.5].forEach(x => [-2.4, 2.4].forEach(z => g.add(box(0.3, 2.6, 0.3, wood, x, 2.1, z))));
      break;
  }
  g.userData.kind = AMENITY_KINDS[kind].label;
  return g;
};
