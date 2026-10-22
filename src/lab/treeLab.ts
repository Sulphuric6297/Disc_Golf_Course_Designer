// The tree lab (tree-lab.html, not part of the app): today's trees beside new candidates, each
// kind in a row, under the course's own light, to pick a look before it goes into the course.
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { treeMeshes, type TreeShape } from "../three/treeKit";
import { foliageTint } from "../three/trees";
import { LANDSCAPES, type LandscapeId } from "../lib/landscapes";
import { CANDIDATES } from "./treeCandidates";
import { ezReady } from "../three/ezShapes";

type Kind = { id: TreeShape; label: string; heights: [number, number]; widthOfHeight: [number, number]; pick?: number[] };
const KINDS: Kind[] = [
  { id: "broadleaf", label: "Leafy", heights: [32, 62], widthOfHeight: [0.55, 0.85] },
  { id: "conifer", label: "Pine", heights: [36, 72], widthOfHeight: [0.32, 0.45] },
  { id: "bush", label: "Bush", heights: [3.5, 8], widthOfHeight: [1.1, 1.6] },
  // (the underbrush's own: briars, weeds, a thicket shrub, briars again)
  { id: "bush", label: "Brush", heights: [3, 6], widthOfHeight: [1.2, 1.8], pick: [6, 8, 10, 9] }
];
/** A column: a way of making a tree of a kind (today's, or a candidate). */
export type Maker = (kind: TreeShape, variant: number, height: number, width: number, tint: THREE.Color, seed: number) => THREE.Object3D;
const COLUMNS: { name: string; make: Maker }[] = [
  { name: "Before", make: (kind, variant, height, width, tint) => treeMeshes(kind, variant % 2, height, width, tint, "near", true) },
  { name: "Now (ez-tree)", make: (kind, variant, height, width, tint) => treeMeshes(kind, variant, height, width, tint) },
  { name: "Middle", make: (kind, variant, height, width, tint) => treeMeshes(kind, variant, height, width, tint, "mid") },
  { name: "Far", make: (kind, variant, height, width, tint) => treeMeshes(kind, variant, height, width, tint, "far") },
  { name: "Farthest", make: (kind, variant, height, width, tint) => treeMeshes(kind, variant, height, width, tint, "brush") },
  ...CANDIDATES
];
const PER = 4;

const seeded = (seed: number) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

// ---- the scene: the course's renderer settings and light
const host = document.getElementById("view")!;
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
host.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color("#a9c7e3");
scene.fog = new THREE.Fog("#a9c7e3", 900, 2600);
const camera = new THREE.PerspectiveCamera(40, 1, 0.5, 6000);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI * 0.495;
const sun = new THREE.DirectionalLight(0xfff6e5, 2.4);
const hemi = new THREE.HemisphereLight(0xeef4ff, 0x6b6250, 0.9);
scene.add(sun, sun.target, hemi);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.6;

// The lawn: a soft, speckled grass
const lawnTex = (() => {
  const c = document.createElement("canvas"); c.width = c.height = 512;
  const g = c.getContext("2d")!; const rnd = seeded(9);
  g.fillStyle = "#5f7f45"; g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 9000; i++) { const l = 0.75 + rnd() * 0.5; g.fillStyle = `rgba(${Math.round(90 * l)},${Math.round(122 * l)},${Math.round(64 * l)},0.5)`; g.fillRect(rnd() * 512, rnd() * 512, 2 + rnd() * 3, 2 + rnd() * 3); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(60, 60); t.anisotropy = 8;
  return t;
})();
const lawn = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), new THREE.MeshStandardMaterial({ map: lawnTex, roughness: 1 }));
lawn.rotation.x = -Math.PI / 2;
lawn.receiveShadow = true;
scene.add(lawn);

// ---- the lineup
const labels = document.getElementById("labels")!;
const tags: { el: HTMLDivElement; at: THREE.Vector3 }[] = [];
const tag = (text: string, at: THREE.Vector3, col = false) => {
  const el = document.createElement("div"); el.className = col ? "label col" : "label"; el.textContent = text; labels.appendChild(el);
  tags.push({ el, at });
};
const trees = new THREE.Group();
scene.add(trees);
let landscape: LandscapeId = "woods";
let shown: string = "all";
const COL_GAP = 70, TREE_GAP = 62, ROW_GAP = 150, BUSH_GAP = 18;
const build = () => {
  trees.clear();
  tags.forEach(t => t.el.remove()); tags.length = 0;
  const land = LANDSCAPES[landscape];
  const kinds = KINDS.filter(k => shown === "all" || k.label === shown);
  const colW = (k: Kind) => (k.id === "bush" ? BUSH_GAP : TREE_GAP) * PER;
  const width = COLUMNS.length * TREE_GAP * PER + (COLUMNS.length - 1) * COL_GAP;
  kinds.forEach((kind, row) => {
    const z = (row - (kinds.length - 1) / 2) * ROW_GAP;
    tag(kind.label, new THREE.Vector3(-width / 2 - 40, 8, z));
    COLUMNS.forEach((col, ci) => {
      const x0 = -width / 2 + ci * (TREE_GAP * PER + COL_GAP) + (TREE_GAP * PER - colW(kind)) / 2;
      if (row === 0) tag(col.name, new THREE.Vector3(-width / 2 + ci * (TREE_GAP * PER + COL_GAP) + (TREE_GAP * PER) / 2, kinds.some(k => k.id !== "bush") ? 90 : 14, z - ROW_GAP * 0.35), true);
      for (let i = 0; i < PER; i++) {
        const rnd = seeded(1 + i * 101 + row * 13);
        const h = kind.heights[0] + rnd() * (kind.heights[1] - kind.heights[0]);
        const w = h * (kind.widthOfHeight[0] + rnd() * (kind.widthOfHeight[1] - kind.widthOfHeight[0]));
        const mix = land.mix?.length && kind.id !== "conifer" ? land.mix[Math.floor(rnd() * land.mix.length)] : land.colors.trees;
        const tint = foliageTint(mix, rnd);
        if (kind.id === "conifer") tint.offsetHSL(0.03, -0.06, -0.08);
        const t = col.make(kind.id, kind.pick?.[i] ?? i, h, w, tint, 7 + i * 31 + row * 977);
        t.position.set(x0 + (i + 0.5) * (kind.id === "bush" ? BUSH_GAP : TREE_GAP), 0, z + (rnd() - 0.5) * 10);
        // (a tree that shows a setting turns its lean toward the camera's side, and says which)
        t.rotation.y = t.userData.label ? -Math.PI / 2 : rnd() * Math.PI * 2;
        if (t.userData.label) tag(t.userData.label, t.position.clone().add(new THREE.Vector3(0, (t.userData.top ?? h) + 6, 0)));
        t.traverse(o => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.receiveShadow = true; } });
        trees.add(t);
      }
    });
  });
  // (the sun's shadow box over the lineup)
  const half = Math.max(width, ROW_GAP * kinds.length) * 0.65;
  Object.assign(sun.shadow.camera, { left: -half, right: half, top: half, bottom: -half, near: 10, far: 3000 });
  sun.shadow.camera.updateProjectionMatrix();
  renderer.shadowMap.needsUpdate = true;
};

// ---- the sun and the cameras
let sunAngle = 315, sunHeight = 38;
// The ez-tree demo's light (a strong sun, a flat ambient, Neutral tone mapping at twice the
// exposure, blue haze), or the course's
let demoLight = false;
const ambient = new THREE.AmbientLight(0xffffff, 0);
scene.add(ambient);
const setLight = (on: boolean) => {
  demoLight = on;
  const neutral = (THREE as unknown as { NeutralToneMapping?: THREE.ToneMapping }).NeutralToneMapping;
  renderer.toneMapping = on ? neutral ?? THREE.ACESFilmicToneMapping : THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = on ? (neutral ? 2 : 1.6) : 1.05;
  sun.intensity = on ? 5 : 2.4;
  hemi.intensity = on ? 0 : 0.9;
  ambient.intensity = on ? 0.4 : 0;
  scene.fog = on ? new THREE.FogExp2(0x94b9f8, 0.0015) : new THREE.Fog("#a9c7e3", 900, 2600);
  (scene.background as THREE.Color).set(on ? "#94b9f8" : "#a9c7e3");
  scene.traverse(o => { const m = (o as THREE.Mesh).material as THREE.Material | undefined; if (m) m.needsUpdate = true; });
};
const placeSun = () => {
  const a = (sunAngle * Math.PI) / 180, e = (sunHeight * Math.PI) / 180, d = 1500;
  sun.position.set(Math.sin(a) * Math.cos(e) * d, Math.sin(e) * d, -Math.cos(a) * Math.cos(e) * d);
  sun.target.position.set(0, 0, 0);
};
const CAMS: Record<string, () => void> = {
  "From a tee": () => { camera.position.set(-120, 6, 330); controls.target.set(-60, 22, 0); },
  "Close up": () => { const w = COLUMNS.length * TREE_GAP * PER + (COLUMNS.length - 1) * COL_GAP; camera.position.set(-w / 2 + TREE_GAP * 1.2, 30, 120); controls.target.set(-w / 2 + TREE_GAP * 1.2, 26, 0); },
  Tilted: () => { camera.position.set(0, 330, 560); controls.target.set(0, 10, 0); },
  Overhead: () => { camera.position.set(0, 1100, 1); controls.target.set(0, 0, 0); }
};

// ---- the bar
const buttons = (host: string, items: [string, () => void, boolean][]) => {
  const el = document.getElementById(host)!; el.innerHTML = "";
  for (const [label, fn, on] of items) {
    const b = document.createElement("button"); b.textContent = label; b.setAttribute("aria-pressed", String(on));
    b.onclick = () => { fn(); refreshBar(); }; el.appendChild(b);
  }
};
let cam = "Tilted";
const refreshBar = () => {
  buttons("kinds", [["All", () => { shown = "all"; build(); }, shown === "all"], ...KINDS.map(k => [k.label, () => { shown = k.label; build(); }, shown === k.label] as [string, () => void, boolean])]);
  buttons("cams", Object.keys(CAMS).map(k => [k, () => { cam = k; CAMS[k](); }, cam === k] as [string, () => void, boolean]));
  buttons("seasons", (["woods", "park", "pines", "autumn", "dry"] as LandscapeId[]).map(id => [LANDSCAPES[id].label ?? id, () => { landscape = id; build(); }, landscape === id] as [string, () => void, boolean]));
  buttons("light", [["Our light", () => setLight(false), !demoLight], ["Demo light", () => setLight(true), demoLight]]);
  buttons("extras", [["Sun: morning", () => { sunHeight = 18; sunAngle = 80; placeSun(); renderer.shadowMap.needsUpdate = true; }, sunHeight === 18], ["Sun: midday", () => { sunHeight = 62; sunAngle = 180; placeSun(); renderer.shadowMap.needsUpdate = true; }, sunHeight === 62], ["Sun: afternoon", () => { sunHeight = 38; sunAngle = 315; placeSun(); renderer.shadowMap.needsUpdate = true; }, sunHeight === 38]]);
};

const resize = () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
};
window.addEventListener("resize", resize);
resize();
placeSun();
await ezReady;
build();
CAMS[cam]();
refreshBar();
const v = new THREE.Vector3();
const tick = () => {
  controls.update();
  renderer.render(scene, camera);
  for (const t of tags) {
    v.copy(t.at).project(camera);
    const vis = v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1;
    t.el.style.display = vis ? "" : "none";
    if (vis) { t.el.style.left = `${((v.x + 1) / 2) * window.innerWidth}px`; t.el.style.top = `${((1 - v.y) / 2) * window.innerHeight}px`; }
  }
  requestAnimationFrame(tick);
};
tick();
// (for screenshots: a camera by name)
(window as unknown as { labCamera: (name: string) => void }).labCamera = (name: string) => { cam = name; CAMS[name]?.(); refreshBar(); };
// (and to look at any column: its index, from where)
(window as unknown as { labLook: (col: number, dist?: number, h?: number, dx?: number) => void }).labLook = (col, dist = 150, h = 24, dx = 0) => {
  const w = COLUMNS.length * TREE_GAP * PER + (COLUMNS.length - 1) * COL_GAP;
  const x = -w / 2 + col * (TREE_GAP * PER + COL_GAP) + (TREE_GAP * PER) / 2 + dx;
  const kinds = KINDS.filter(k => shown === "all" || k.label === shown);
  const z = kinds.length === 1 ? 0 : -ROW_GAP;
  camera.position.set(x, h, z + dist); controls.target.set(x, Math.max(4, h * 0.9), z);
};
