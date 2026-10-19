// Real-scale ground texture over the aerial photo: grass blades on lawns, grain on concrete, stones
// in asphalt, pebbles and clods on soil and gravel. Where each goes comes from the photo itself (a
// cover mask, see lib/geo/landCover); the photo keeps its own colors, the texture only adds the
// small light and dark detail a 1 ft-per-pixel photo can't show. Far away the texture's mipmaps
// average out to nothing, so the photo looks exactly as it is; up close it reads as the real thing.
import * as THREE from "three";
import { classifyCover } from "../lib/geo/landCover";

/** Feet one copy of the detail pattern covers (it is sampled twice, at two scales, to hide repeats). */
const TILE_FT = 6;
/** Pixels across the pattern: about 85 per foot, a few millimetres each. */
const S = 512;
const PX_FT = S / TILE_FT;

/** A repeatable random number source (the same pattern every time). */
const random = (seed: number) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

/** Smooth noise that wraps around the tile: an n x n lattice of random values, eased between. */
const tileNoise = (n: number, rnd: () => number) => {
  const lat = Array.from({ length: n * n }, rnd);
  const ease = (t: number) => t * t * (3 - 2 * t);
  return (x: number, y: number) => {
    const fx = (x / S) * n, fy = (y / S) * n;
    const x0 = Math.floor(fx), y0 = Math.floor(fy);
    const tx = ease(fx - x0), ty = ease(fy - y0);
    const v = (i: number, j: number) => lat[(((j % n) + n) % n) * n + (((i % n) + n) % n)];
    const a = v(x0, y0) + (v(x0 + 1, y0) - v(x0, y0)) * tx;
    const b = v(x0, y0 + 1) + (v(x0 + 1, y0 + 1) - v(x0, y0 + 1)) * tx;
    return a + (b - a) * ty;
  };
};
/** Lattice cells for features about `ft` feet across. */
const cells = (ft: number) => Math.max(1, Math.round(TILE_FT / ft));

type Draw = (g: CanvasRenderingContext2D, wrap: (x: number, y: number, r: number, f: (x: number, y: number) => void) => void, rnd: () => number) => void;

/** Draws a pattern on a tile-sized canvas, each shape also across the edges so the tile repeats seamlessly. */
const tile = (base: (x: number, y: number) => number, draw: Draw, seed: number) => {
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const g = c.getContext("2d", { willReadFrequently: true })!;
  const img = g.createImageData(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = (y * S + x) * 4;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = base(x, y);
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const wrap = (x: number, y: number, r: number, f: (x: number, y: number) => void) => {
    for (const dx of [-S, 0, S]) for (const dy of [-S, 0, S]) {
      if (x + dx < -r || x + dx > S + r || y + dy < -r || y + dy > S + r) continue;
      f(x + dx, y + dy);
    }
  };
  draw(g, wrap, random(seed + 1));
  return g.getImageData(0, 0, S, S).data;
};

const grey = (v: number, a = 1) => `rgba(${v | 0},${v | 0},${v | 0},${a})`;
/** A thin crack: a wandering dark line. */
const crack = (g: CanvasRenderingContext2D, wrap: Parameters<Draw>[1], rnd: () => number, lengthFt: number, alpha: number) => {
  let x = rnd() * S, y = rnd() * S, a = rnd() * Math.PI * 2;
  const pts: [number, number][] = [[x, y]];
  for (let k = 0; k < lengthFt * 6; k++) { a += (rnd() - 0.5) * 0.9; x += Math.cos(a) * PX_FT / 6; y += Math.sin(a) * PX_FT / 6; pts.push([x, y]); }
  g.strokeStyle = grey(30, alpha);
  g.lineWidth = 1.2;
  wrap(pts[0][0], pts[0][1], lengthFt * PX_FT, (px, py) => {
    g.beginPath();
    pts.forEach(([qx, qy], i) => (i ? g.lineTo(qx - pts[0][0] + px, qy - pts[0][1] + py) : g.moveTo(px, py)));
    g.stroke();
  });
};

const grassTile = (seed: number) => {
  const r0 = random(seed);
  const patch = tileNoise(cells(1.5), r0), tuft = tileNoise(cells(0.25), r0), fine = tileNoise(cells(0.06), r0);
  return tile((x, y) => 118 + (patch(x, y) - 0.5) * 44 + (tuft(x, y) - 0.5) * 80 + (fine(x, y) - 0.5) * 36, (g, wrap, rnd) => {
    // Thousands of blades seen from above and at a slant, a few millimetres wide and an inch or two long
    g.lineCap = "round";
    for (let k = 0; k < 26000; k++) {
      const x = rnd() * S, y = rnd() * S;
      const len = 3 + rnd() * 9, a = rnd() * Math.PI * 2;
      const dx = Math.cos(a) * len, dy = Math.sin(a) * len;
      g.strokeStyle = grey(rnd() < 0.5 ? 40 + rnd() * 60 : 150 + rnd() * 100, 0.75);
      g.lineWidth = 0.8 + rnd() * 1.2;
      wrap(x, y, len, (px, py) => { g.beginPath(); g.moveTo(px, py); g.lineTo(px + dx, py + dy); g.stroke(); });
    }
  }, seed);
};

const concreteTile = (seed: number) => {
  const r0 = random(seed);
  const stain = tileNoise(cells(2), r0), blot = tileNoise(cells(0.5), r0), mid = tileNoise(cells(0.08), r0);
  return tile((x, y) => 128 + (stain(x, y) - 0.5) * 34 + (blot(x, y) - 0.5) * 22 + (mid(x, y) - 0.5) * 18 + (r0() - 0.5) * 30, (g, wrap, rnd) => {
    // Sand and small pits, a few hairline cracks
    for (let k = 0; k < 900; k++) {
      const x = rnd() * S, y = rnd() * S, r = 0.6 + rnd() * 1.4;
      g.fillStyle = grey(55 + rnd() * 50, 0.8);
      wrap(x, y, r, (px, py) => { g.beginPath(); g.arc(px, py, r, 0, Math.PI * 2); g.fill(); });
    }
    for (let k = 0; k < 3; k++) crack(g, wrap, rnd, 1 + rnd() * 2, 0.45);
  }, seed);
};

const asphaltTile = (seed: number) => {
  const r0 = random(seed);
  const wear = tileNoise(cells(2), r0), mottle = tileNoise(cells(0.4), r0);
  return tile((x, y) => 100 + (wear(x, y) - 0.5) * 30 + (mottle(x, y) - 0.5) * 30 + (r0() - 0.5) * 28, (g, wrap, rnd) => {
    // Stones of every shade, 2 to 10 millimetres, in the dark binder; the odd crack
    for (let k = 0; k < 30000; k++) {
      const x = rnd() * S, y = rnd() * S, r = 0.5 + Math.pow(rnd(), 2.4) * 2.4;
      const light = rnd() < 0.33;
      g.fillStyle = grey(light ? 150 + rnd() * 100 : 35 + rnd() * 60, 0.9);
      const e = 0.6 + rnd() * 0.4, rot = rnd() * Math.PI;
      wrap(x, y, r, (px, py) => { g.beginPath(); g.ellipse(px, py, r, r * e, rot, 0, Math.PI * 2); g.fill(); });
    }
    for (let k = 0; k < 2; k++) crack(g, wrap, rnd, 2 + rnd() * 3, 0.55);
  }, seed);
};

const soilTile = (seed: number) => {
  const r0 = random(seed);
  const patch = tileNoise(cells(1.5), r0), clod = tileNoise(cells(0.15), r0);
  return tile((x, y) => 96 + (patch(x, y) - 0.5) * 40 + (clod(x, y) - 0.5) * 40 + (r0() - 0.5) * 24, (g, wrap, rnd) => {
    // Gravel and rock mulch: rounded stones half an inch to two inches, lit from one side, dark gaps between
    for (let k = 0; k < 5200; k++) {
      const x = rnd() * S, y = rnd() * S, r = 2 + Math.pow(rnd(), 1.8) * 8;
      const v = 115 + rnd() * 120, rot = rnd() * Math.PI, e = 0.65 + rnd() * 0.35;
      wrap(x, y, r * 1.4, (px, py) => {
        g.fillStyle = grey(40, 0.5);
        g.beginPath(); g.ellipse(px + r * 0.25, py + r * 0.3, r, r * e, rot, 0, Math.PI * 2); g.fill();
        const grad = g.createRadialGradient(px - r * 0.3, py - r * 0.3, r * 0.1, px, py, r);
        grad.addColorStop(0, grey(Math.min(255, v + 30)));
        grad.addColorStop(1, grey(v - 40));
        g.fillStyle = grad;
        g.beginPath(); g.ellipse(px, py, r, r * e, rot, 0, Math.PI * 2); g.fill();
      });
    }
  }, seed);
};

let detail: Promise<THREE.DataTexture | null> | null = null;
/**
 * The four patterns in one texture (grass, concrete, asphalt, soil in red, green, blue, alpha),
 * each averaging mid-grey so it never changes the photo's overall color. Built once, a pattern at a
 * time with breaks between, so the app never stalls.
 */
export const groundDetailTexture = () => {
  if (detail) return detail;
  if (typeof document === "undefined") return Promise.resolve(null);
  detail = (async () => {
    const pause = () => new Promise(r => setTimeout(r, 0));
    const planes: Uint8ClampedArray[] = [];
    for (const [make, seed] of [[grassTile, 11], [concreteTile, 23], [asphaltTile, 37], [soilTile, 53]] as const) {
      await pause();
      planes.push(make(seed));
    }
    const data = new Uint8Array(S * S * 4);
    planes.forEach((p, k) => {
      let mean = 0;
      for (let i = 0; i < S * S; i++) mean += p[i * 4];
      mean /= S * S;
      for (let i = 0; i < S * S; i++) data[i * 4 + k] = Math.max(0, Math.min(255, Math.round(128 + (p[i * 4] - mean))));
    });
    const t = new THREE.DataTexture(data, S, S, THREE.RGBAFormat);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.magFilter = THREE.LinearFilter;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.generateMipmaps = true;
    t.anisotropy = 8;
    t.colorSpace = THREE.NoColorSpace;
    t.needsUpdate = true;
    t.userData.shared = true;
    return t;
  })();
  return detail;
};

let worker: Worker | null = null;
let jobs = 0;
const pending = new Map<number, (m: { data: Uint8ClampedArray; width: number; height: number } | null) => void>();
/** The cover mask, worked out in a background worker (or here, where there is none). */
const classify = (px: ImageData, pxPerFt: number): Promise<{ data: Uint8ClampedArray; width: number; height: number } | null> => {
  if (typeof Worker === "undefined") return Promise.resolve(classifyCover(px, { pxPerFt }));
  try {
    if (!worker) {
      worker = new Worker(new URL("./coverWorker.ts", import.meta.url), { type: "module" });
      worker.onmessage = e => { pending.get(e.data.id)?.(e.data); pending.delete(e.data.id); };
      worker.onerror = () => { pending.forEach(done => done(null)); pending.clear(); worker = null; };
    }
    const id = ++jobs;
    return new Promise(done => {
      pending.set(id, done);
      worker!.postMessage({ id, data: px.data, width: px.width, height: px.height, pxPerFt }, [px.data.buffer]);
    });
  } catch {
    return Promise.resolve(classifyCover(px, { pxPerFt }));
  }
};

/**
 * The cover mask of a loaded photo, as a texture lined up with it. Worked out on a copy at about
 * 2 pixels per foot at most (enough for a lawn's edge), in the background, so the view never waits.
 */
export const coverTexture = async (image: CanvasImageSource & { width: number; height: number }, widthFt: number): Promise<THREE.DataTexture | null> => {
  if (typeof document === "undefined" || !image.width || !image.height || !(widthFt > 0)) return null;
  const scale = Math.min(1, (2 * widthFt) / image.width, 1536 / Math.max(image.width, image.height));
  const w = Math.max(1, Math.round(image.width * scale)), h = Math.max(1, Math.round(image.height * scale));
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d", { willReadFrequently: true });
  if (!g) return null;
  g.drawImage(image, 0, 0, w, h);
  let px: ImageData;
  try { px = g.getImageData(0, 0, w, h); } catch { return null; }
  const mask = await classify(px, w / widthFt);
  if (!mask) return null;
  // Rows bottom-up, like the photo's own texture (which is flipped as it loads)
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) data.set(mask.data.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
  const t = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.NoColorSpace;
  t.needsUpdate = true;
  return t;
};

export type GroundDetailUniforms = {
  coverMap: { value: THREE.Texture | null };
  detailMap: { value: THREE.Texture | null };
  groundDetail: { value: number };
  groundFeet: { value: number };
  /** Painted ground (see lib/groundPaint): its color (premultiplied, alpha = painted) and which
   * texture pattern it takes, over `paintRect` (x, y, width, height in plan units). */
  paintColorMap: { value: THREE.Texture | null };
  paintCoverMap: { value: THREE.Texture | null };
  paintRect: { value: THREE.Vector4 };
  paintOn: { value: number };
};

export const groundDetailUniforms = (): GroundDetailUniforms => ({
  coverMap: { value: null },
  detailMap: { value: null },
  groundDetail: { value: 0 },
  groundFeet: { value: 1 },
  paintColorMap: { value: null },
  paintCoverMap: { value: null },
  paintRect: { value: new THREE.Vector4(0, 0, 1, 1) },
  paintOn: { value: 0 }
});

/**
 * Adds painted ground and the ground texture to a ground material: the photo's (a map material,
 * where the cover mask lines up with the photo) or the bare terrain's (painted ground only).
 */
export const addGroundDetail = (m: THREE.Material, u: GroundDetailUniforms) => {
  m.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, u);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec2 vGroundXZ;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvGroundXZ = (modelMatrix * vec4(transformed, 1.0)).xz;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec2 vGroundXZ;\nuniform sampler2D coverMap;\nuniform sampler2D detailMap;\nuniform float groundDetail;\nuniform float groundFeet;\nuniform sampler2D paintColorMap;\nuniform sampler2D paintCoverMap;\nuniform vec4 paintRect;\nuniform float paintOn;")
      .replace("#include <color_fragment>", `#include <color_fragment>
        {
          vec4 cover = vec4( 0.0 );
          vec2 f = vGroundXZ * groundFeet;
          #ifdef USE_MAP
          if ( groundDetail > 0.0 ) cover = texture2D( coverMap, vMapUv );
          #endif
          if ( paintOn > 0.0 ) {
            vec2 puv = ( vGroundXZ - paintRect.xy ) / paintRect.zw;
            if ( puv.x >= 0.0 && puv.x <= 1.0 && puv.y >= 0.0 && puv.y <= 1.0 ) {
              vec4 pc = texture2D( paintColorMap, puv );
              if ( pc.a > 0.003 ) {
                vec4 pcov = texture2D( paintCoverMap, puv ) / pc.a;
                float a = pc.a;
                // Along an edge, softened over the next squares too: round, not stepped
                if ( a < 0.999 ) {
                  vec2 ts = 0.75 / vec2( textureSize( paintColorMap, 0 ) );
                  a = ( a * 2.0 + texture2D( paintColorMap, puv + vec2( ts.x, ts.y ) ).a + texture2D( paintColorMap, puv + vec2( -ts.x, ts.y ) ).a
                    + texture2D( paintColorMap, puv + vec2( ts.x, -ts.y ) ).a + texture2D( paintColorMap, puv + vec2( -ts.x, -ts.y ) ).a ) / 6.0;
                }
                // Up close, a ragged edge (the material's own texture breaks it up) instead of
                // square feet
                if ( groundDetail > 0.0 && a < 0.999 ) {
                  float n = dot( texture2D( detailMap, f / 1.7 + vec2( 0.11, 0.53 ) ), pcov );
                  a = clamp( ( a - 0.5 ) * 2.6 + ( n - 0.5 ) * 1.4 + 0.5, 0.0, 1.0 );
                }
                diffuseColor.rgb = mix( diffuseColor.rgb, pc.rgb / pc.a, a * 0.92 );
                cover = cover * ( 1.0 - a ) + pcov * a;
              }
            }
          }
          if ( groundDetail > 0.0 && cover.r + cover.g + cover.b + cover.a > 0.004 ) {
            // Two samplings at unrelated scales and angles: no visible repeats
            vec4 a = texture2D( detailMap, f / ${TILE_FT.toFixed(1)} );
            vec4 b = texture2D( detailMap, mat2( 0.8, -0.6, 0.6, 0.8 ) * f / ${(TILE_FT * 1.63).toFixed(2)} + vec2( 0.37, 0.61 ) );
            vec4 d = ( a + b - 1.0 ) * 0.72;
            float k = dot( cover, d * vec4( 1.3, 0.55, 0.8, 1.15 ) );
            diffuseColor.rgb *= clamp( 1.0 + 1.6 * k, 0.25, 1.9 );
          }
        }`);
  };
  m.customProgramCacheKey = () => "scp-ground-detail";
};
