// Real-scale ground up close, from photographed scans (public/ground: grass, concrete, asphalt,
// dirt, gravel, wood chips, leaf litter, pine needles, sand; CC0, see its SOURCES.md): their grain,
// light and dark, and bumps the sun lights. Where each goes comes from the ground itself: the
// photo's cover mask (lawn, paving, soil: see lib/geo/landCover), painted ground, the woods' floor
// (leaf litter under leafy trees, needles under conifers), or the thing it's on (a path's surface,
// a road, a fairway). The ground keeps its own colors (the site's photo, the painted map, a path's
// color) and takes only the scan's variation round its own average, so a blurry photo reads as
// grass, pavement and dirt up close and looks just as it is from afar. Each scan is laid three
// times over, shifted and turned at random on a grid of hexagons (Mikkelsen's hex tiling), so no
// repeat ever shows; and it fades out from about 110 ft away, where it can't be seen, for speed.
import * as THREE from "three";
import { classifyCover } from "../lib/geo/landCover";

/** The scans, in the order of their layers in the textures (scripts/ground-scans.py). */
export const LAYERS = ["grass", "concrete", "asphalt", "dirt", "gravel", "chips", "leaves", "needles", "sand"] as const;
export type SurfaceLayer = (typeof LAYERS)[number];
export const layerOf = (l: SurfaceLayer) => LAYERS.indexOf(l);
/** Feet each scan covers, by layer (as the real thing is: a few feet of lawn or gravel). */
const TILE_FT = [5, 8, 8, 7, 6, 6, 7, 7, 7];
/** How strongly each scan's light and dark shows (grass most: a lawn's grain is fine, and the
 * ground's colors are bright, where the picture's tone curve flattens it). */
const GRAIN = [2.2, 1.4, 1.5, 1.6, 1.5, 1.5, 1.5, 1.5, 1.4];
const S = 512;

let scans: Promise<{ color: THREE.DataArrayTexture; normal: THREE.DataArrayTexture } | null> | null = null;
/** The scans as two stacks of layers (their color variation, their bumps), loaded once. */
export const groundScans = () => {
  if (scans) return scans;
  if (typeof document === "undefined") return Promise.resolve(null);
  scans = (async () => {
    const strip = async (name: string) => {
      const img = new Image();
      img.src = `${import.meta.env.BASE_URL}ground/${name}.jpg`;
      await img.decode();
      const c = document.createElement("canvas");
      c.width = S;
      c.height = S * LAYERS.length;
      const g = c.getContext("2d", { willReadFrequently: true })!;
      g.drawImage(img, 0, 0, S, S * LAYERS.length);
      const t = new THREE.DataArrayTexture(new Uint8Array(g.getImageData(0, 0, S, S * LAYERS.length).data.buffer), S, S, LAYERS.length);
      t.format = THREE.RGBAFormat;
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.magFilter = THREE.LinearFilter;
      t.minFilter = THREE.LinearMipmapLinearFilter;
      t.generateMipmaps = true;
      t.anisotropy = 8;
      t.colorSpace = THREE.NoColorSpace;
      t.needsUpdate = true;
      t.userData.shared = true;
      return t;
    };
    try {
      const [color, normal] = await Promise.all([strip("color"), strip("normal")]);
      return { color, normal };
    } catch {
      return null;
    }
  })();
  return scans;
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
  /** The photo's cover mask (grass, concrete, asphalt, soil in red, green, blue, alpha), over
   * `coverRect` (x, y, width, height in plan units), on while `coverOn` is 1. */
  coverMap: { value: THREE.Texture | null };
  coverRect: { value: THREE.Vector4 };
  coverOn: { value: number };
  /** 1: what each spot is made of read from its own color instead (the painted map, whose colors
   * say it: green grass, grey paving, brown dirt; or no photo to read it from). */
  coverFromColor: { value: number };
  /** The scans: their color variation and their bumps, a layer each (see LAYERS). */
  detailMap: { value: THREE.DataArrayTexture | null };
  detailNormal: { value: THREE.DataArrayTexture | null };
  /** 1 while the view is close enough for the scans to show, and they've loaded. */
  groundDetail: { value: number };
  /** Feet in a plan unit. */
  groundFeet: { value: number };
  /** Painted ground (see lib/groundPaint): its color (premultiplied, alpha = painted) and which
   * texture pattern it takes, over `paintRect` (x, y, width, height in plan units). */
  paintColorMap: { value: THREE.Texture | null };
  paintCoverMap: { value: THREE.Texture | null };
  paintRect: { value: THREE.Vector4 };
  paintOn: { value: number };
  /** The woods' floor: leaf litter in red, pine needles in green, over `floorRect`. */
  floorMap: { value: THREE.Texture | null };
  floorRect: { value: THREE.Vector4 };
  floorOn: { value: number };
};

export const groundDetailUniforms = (): GroundDetailUniforms => ({
  coverMap: { value: null },
  coverRect: { value: new THREE.Vector4(0, 0, 1, 1) },
  coverOn: { value: 0 },
  coverFromColor: { value: 1 },
  detailMap: { value: null },
  detailNormal: { value: null },
  groundDetail: { value: 0 },
  groundFeet: { value: 1 },
  paintColorMap: { value: null },
  paintCoverMap: { value: null },
  paintRect: { value: new THREE.Vector4(0, 0, 1, 1) },
  paintOn: { value: 0 },
  floorMap: { value: null },
  floorRect: { value: new THREE.Vector4(0, 0, 1, 1) },
  floorOn: { value: 0 }
});

/** What the scans need in a shader: hex tiling and one layer's color and bumps. */
const SCAN_GLSL = /* glsl */ `
  uniform highp sampler2DArray detailMap;
  uniform highp sampler2DArray detailNormal;
  uniform float groundDetail;
  uniform float groundFeet;
  varying vec3 vGroundW;
  vec2 dgHash( vec2 p ) { return fract( sin( vec2( dot( p, vec2( 127.1, 311.7 ) ), dot( p, vec2( 269.5, 183.3 ) ) ) ) * 43758.5453 ); }
  // (a point's three nearest hexagons, each with its own shift and turn of the scan, and their weights)
  void dgHex( vec2 uv, out vec2 u1, out vec2 u2, out vec2 u3, out vec3 w ) {
    vec2 s = mat2( 1.0, 0.0, -0.57735027, 1.15470054 ) * ( uv * 3.4641016 );
    vec2 b = floor( s ); vec3 t = vec3( fract( s ), 0.0 ); t.z = 1.0 - t.x - t.y;
    float q = step( 0.0, -t.z ), q2 = 2.0 * q - 1.0;
    w = vec3( -t.z * q2, q - t.y * q2, q - t.x * q2 );
    vec2 v1 = b + vec2( q ), v2 = b + vec2( q, 1.0 - q ), v3 = b + vec2( 1.0 - q, q );
    float a1 = dgHash( v1 ).x * 6.2832, a2 = dgHash( v2 ).x * 6.2832, a3 = dgHash( v3 ).x * 6.2832;
    u1 = mat2( cos( a1 ), -sin( a1 ), sin( a1 ), cos( a1 ) ) * uv + dgHash( v1 + 7.0 );
    u2 = mat2( cos( a2 ), -sin( a2 ), sin( a2 ), cos( a2 ) ) * uv + dgHash( v2 + 7.0 );
    u3 = mat2( cos( a3 ), -sin( a3 ), sin( a3 ), cos( a3 ) ) * uv + dgHash( v3 + 7.0 );
    w = pow( w, vec3( 6.0 ) ); w /= w.x + w.y + w.z;
  }
  const float DG_TILE[9] = float[9]( ${TILE_FT.map(t => t.toFixed(1)).join(", ")} );
  const float DG_GRAIN[9] = float[9]( ${GRAIN.map(t => t.toFixed(2)).join(", ")} );
  // A layer's color variation (1: its average) and bumps, at feet f
  void dgScan( float layer, vec2 f, out vec3 col, out vec3 nrm ) {
    vec2 uv = f / DG_TILE[ int( layer ) ];
    vec2 u1, u2, u3; vec3 w; dgHex( uv, u1, u2, u3, w );
    vec2 dx = dFdx( uv ), dy = dFdy( uv );
    col = ( textureGrad( detailMap, vec3( u1, layer ), dx, dy ).rgb * w.x + textureGrad( detailMap, vec3( u2, layer ), dx, dy ).rgb * w.y + textureGrad( detailMap, vec3( u3, layer ), dx, dy ).rgb * w.z ) * 2.0;
    col = max( vec3( 0.15 ), 1.0 + ( col - 1.0 ) * DG_GRAIN[ int( layer ) ] );
    nrm = ( textureGrad( detailNormal, vec3( u1, layer ), dx, dy ).xyz * w.x + textureGrad( detailNormal, vec3( u2, layer ), dx, dy ).xyz * w.y + textureGrad( detailNormal, vec3( u3, layer ), dx, dy ).xyz * w.z ) * 2.0 - 1.0;
  }
  vec3 dgNrm = vec3( 0.0, 0.0, 1.0 );
  float dgFade = 0.0;
  // Two layers laid together (weights w1, w2), how much of them (amount): what the color is
  // multiplied by (the scans' variation), the bumps kept for the light
  vec3 dgLay( float l1, float w1, float l2, float w2, float amount ) {
    vec2 f = vGroundW.xz * groundFeet;
    float d = distance( cameraPosition, vGroundW ) * groundFeet;
    dgFade = groundDetail * ( 1.0 - smoothstep( 110.0, 260.0, d ) ) * amount;
    if ( dgFade < 0.002 || w1 + w2 < 0.004 ) { dgFade = 0.0; return vec3( 1.0 ); }
    vec3 c1, n1, c2 = vec3( 1.0 ), n2 = vec3( 0.0, 0.0, 1.0 );
    dgScan( l1, f, c1, n1 );
    if ( w2 > 0.004 ) dgScan( l2, f, c2, n2 );
    float sum = w1 + w2;
    vec3 col = ( c1 * w1 + c2 * w2 ) / sum, nrm = ( n1 * w1 + n2 * w2 ) / sum;
    dgFade *= clamp( sum, 0.0, 1.0 );
    dgNrm = normalize( mix( vec3( 0.0, 0.0, 1.0 ), nrm, dgFade ) );
    return mix( vec3( 1.0 ), col, dgFade );
  }
`;
/** The scan's bumps turning the surface for the light (it lies about level: its own plan axes). */
const BUMPS_GLSL = /* glsl */ `
  #include <normal_fragment_maps>
  if ( dgFade > 0.0 ) {
    vec3 dgT = normalize( ( viewMatrix * vec4( 1.0, 0.0, 0.0, 0.0 ) ).xyz ), dgB = normalize( ( viewMatrix * vec4( 0.0, 0.0, -1.0, 0.0 ) ).xyz );
    normal = normalize( normal + ( dgT * dgNrm.x + dgB * dgNrm.y ) * 1.1 );
  }
`;
const worldVertex = (vs: string) => vs
  .replace("#include <common>", "#include <common>\nvarying vec3 vGroundW;")
  .replace("#include <begin_vertex>", "#include <begin_vertex>\nvGroundW = (modelMatrix * vec4(transformed, 1.0)).xyz;");

/**
 * Painted ground and the scans on the ground's own material (the photo's or the painted map's, or
 * the bare terrain's): each spot's scans from the photo's cover, painted ground and the woods' floor.
 */
export const addGroundDetail = (m: THREE.Material, u: GroundDetailUniforms) => {
  m.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, u);
    shader.vertexShader = worldVertex(shader.vertexShader);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>
        ${SCAN_GLSL}
        uniform sampler2D coverMap; uniform vec4 coverRect; uniform float coverOn; uniform float coverFromColor;
        uniform sampler2D paintColorMap; uniform sampler2D paintCoverMap; uniform vec4 paintRect; uniform float paintOn;
        uniform sampler2D floorMap; uniform vec4 floorRect; uniform float floorOn;`)
      .replace("#include <color_fragment>", `#include <color_fragment>
        {
          vec4 cover = vec4( 0.0 );
          vec2 f = vGroundW.xz * groundFeet;
          if ( groundDetail > 0.0 && coverFromColor > 0.0 ) {
            // (by its color: green is grass; grey is paving, light concrete and dark asphalt; a
            // warm brown is dirt)
            vec3 c = diffuseColor.rgb;
            float mx = max( c.r, max( c.g, c.b ) ), mn = min( c.r, min( c.g, c.b ) ), sat = ( mx - mn ) / max( mx, 1e-3 );
            float lum = dot( c, vec3( 0.3, 0.59, 0.11 ) );
            float green = smoothstep( 0.0, 0.04, c.g - max( c.r, c.b ) );
            float grey = ( 1.0 - green ) * ( 1.0 - smoothstep( 0.1, 0.22, sat ) );
            float brown = ( 1.0 - green ) * ( 1.0 - grey ) * smoothstep( 0.0, 0.03, c.r - c.b );
            cover = vec4( max( green, 1.0 - grey - brown - green > 0.5 ? 1.0 : 0.0 ), grey * smoothstep( 0.06, 0.16, lum ), grey * ( 1.0 - smoothstep( 0.06, 0.16, lum ) ), brown );
          } else if ( groundDetail > 0.0 && coverOn > 0.0 ) {
            // (the photo's rows run bottom-up, as its texture's)
            vec2 cuv = vec2( ( vGroundW.x - coverRect.x ) / coverRect.z, 1.0 - ( vGroundW.z - coverRect.y ) / coverRect.w );
            if ( cuv.x >= 0.0 && cuv.x <= 1.0 && cuv.y >= 0.0 && cuv.y <= 1.0 ) cover = texture2D( coverMap, cuv );
          }
          if ( paintOn > 0.0 ) {
            vec2 puv = ( vGroundW.xz - paintRect.xy ) / paintRect.zw;
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
                // Up close, a ragged edge (noise) instead of square feet
                if ( groundDetail > 0.0 && a < 0.999 ) {
                  float n = dgHash( floor( f * 3.0 ) ).x;
                  a = clamp( ( a - 0.5 ) * 2.6 + ( n - 0.5 ) * 0.9 + 0.5, 0.0, 1.0 );
                }
                diffuseColor.rgb = mix( diffuseColor.rgb, pc.rgb / pc.a, a * 0.92 );
                cover = cover * ( 1.0 - a ) + pcov * a;
              }
            }
          }
          if ( groundDetail > 0.0 ) {
            // The woods' floor where the cover is green (under the trees, the photo shows their tops)
            vec2 fl = vec2( 0.0 );
            if ( floorOn > 0.0 ) {
              vec2 fuv = ( vGroundW.xz - floorRect.xy ) / floorRect.zw;
              if ( fuv.x >= 0.0 && fuv.x <= 1.0 && fuv.y >= 0.0 && fuv.y <= 1.0 ) fl = texture2D( floorMap, fuv ).rg;
            }
            float under = min( 1.0, fl.x + fl.y );
            // (the photo under the trees shows their tops, sunlit, not the floor: there, the floor's
            // own color, leaf litter's brown or needles' darker brown, its grain from the scan below;
            // the painted map keeps its colors)
            if ( coverFromColor < 0.5 && under > 0.0 ) {
              vec3 floorCol = mix( vec3( 0.16, 0.11, 0.055 ), vec3( 0.11, 0.075, 0.04 ), fl.y / max( under, 1e-3 ) );
              diffuseColor.rgb = mix( diffuseColor.rgb, floorCol, under * 0.8 * groundDetail );
            }
            // grass, concrete, asphalt, dirt; leaves, needles: the two that most cover this spot
            float w[6] = float[6]( cover.r * ( 1.0 - under ), cover.g, cover.b, cover.a, cover.r * fl.x, cover.r * fl.y );
            const float L[6] = float[6]( 0.0, 1.0, 2.0, 3.0, 6.0, 7.0 );
            int a1 = 0, a2 = -1;
            for ( int i = 1; i < 6; i++ ) if ( w[ i ] > w[ a1 ] ) a1 = i;
            for ( int i = 0; i < 6; i++ ) if ( i != a1 && ( a2 < 0 || w[ i ] > w[ a2 ] ) ) a2 = i;
            diffuseColor.rgb *= dgLay( L[ a1 ], w[ a1 ], L[ a2 ], w[ a2 ], 1.0 );
          }
        }`)
      .replace("#include <normal_fragment_maps>", BUMPS_GLSL);
  };
  m.customProgramCacheKey = () => "dg-ground-scans";
};

/** One scan over the whole of a thing on the ground (a path's surface, a road, a fairway), its own
 * color kept: `layer` (see LAYERS), `amount` how much of the scan (a fairway's mown grass less than
 * a gravel path's stones). */
export const addSurfaceDetail = (m: THREE.Material, u: GroundDetailUniforms, layer: number, amount = 1, mown = false) => {
  m.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, u, { dgLayer: { value: layer }, dgAmount: { value: amount }, dgMown: { value: mown ? 1 : 0 } });
    shader.vertexShader = worldVertex(shader.vertexShader);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\n${SCAN_GLSL}\nuniform float dgLayer; uniform float dgAmount; uniform float dgMown;`)
      .replace("#include <color_fragment>", `#include <color_fragment>
        if ( groundDetail > 0.0 ) {
          diffuseColor.rgb *= dgLay( dgLayer, 1.0, 0.0, 0.0, dgAmount );
          // (mown: light and dark bands as a mower leaves them, softened over a few inches)
          if ( dgMown > 0.0 ) { vec2 f = vGroundW.xz * groundFeet; diffuseColor.rgb *= 1.0 + 0.07 * dgFade * smoothstep( -0.15, 0.15, sin( ( f.y + f.x * 0.2 ) / 4.5 ) ) - 0.035 * dgFade; }
        }`)
      .replace("#include <normal_fragment_maps>", BUMPS_GLSL);
  };
  m.customProgramCacheKey = () => "dg-surface-scan";
};
