// Grass in 3D: real blades, short on fairways and greens, longer between the holes, knee-high in
// the rough. Two patches of blades travel with the camera (a dense one close by, a thinner one of
// wider blades out to the middle distance), moved in whole tiles so the blades never swim. Each
// blade reads where it stands from textures: the ground's height, what grows there (the grass
// map: height and density) and its color (the course's colors, or the aerial photo's), so moving
// a patch costs nothing. Past the patches the ground alone carries on, in the same colors.
import * as THREE from "three";

/** What grows where, painted from the course (see grassMaps). Heights in feet. */
export const GRASS = {
  /** Mown fairways and greens. */
  fairway: 0.22,
  /** The rest of the ground, between holes. */
  lawn: 0.4,
  /** Rough / tall grass areas. */
  rough: 2.2,
  /** The tallest a blade can be (the map's red channel spans 0 to this). */
  max: 4
};

export type GrassQuality = 0 | 1 | 2 | 3;

/** Blades per square foot (inner patch, outer patch) and the patches' half-widths, per quality. */
const LEVELS: Record<Exclude<GrassQuality, 0>, { inner: number; outer: number; innerR: number; outerR: number }> = {
  1: { inner: 5, outer: 0.5, innerR: 28, outerR: 90 },
  2: { inner: 10, outer: 1, innerR: 36, outerR: 120 },
  3: { inner: 18, outer: 1.6, innerR: 44, outerR: 150 }
};
/** Size of the repeating pattern of blade spots, ft (the patches move by this much). */
const TILE = 8;

export type GrassMaps = {
  /** Red: blade height (0..GRASS.max ft), green: how many blades (0..1). */
  field: HTMLCanvasElement;
  /** The blades' color where they stand. */
  color: HTMLCanvasElement;
  /** Plan rectangle the two maps cover. */
  rect: { x: number; y: number; width: number; height: number };
};

/** The terrain as the ground mesh has it: heights at its vertices, cell by cell. */
export type GrassTerrain = { heights: Float32Array; cols: number; rows: number; x: number; y: number; width: number; height: number };

const VERT_HEAD = /* glsl */ `
attribute vec2 aSpot;
uniform vec2 uOrigin;
uniform sampler2D uField;
uniform sampler2D uTint;
uniform vec4 uRect;
uniform sampler2D uHeights;
uniform vec4 uTerrain;
uniform vec2 uCells;
uniform sampler2D uPhoto;
uniform vec4 uPhotoRect;
uniform float uPhotoMix;
uniform vec3 uEye;
uniform float uNear;
uniform float uFar;
uniform float uHole;
uniform float uWidth;
uniform float uDensity;
uniform float uTime;
uniform float uWind;
varying vec3 vGrass;
varying float vTip;
float gHash( vec2 p ) {
  vec3 p3 = fract( vec3( p.xyx ) * 0.1031 );
  p3 += dot( p3, p3.yzx + 33.33 );
  return fract( ( p3.x + p3.y ) * p3.z );
}
float gHeight( vec2 p ) {
  vec2 c = clamp( ( p - uTerrain.xy ) / uTerrain.zw, 0.0, 1.0 ) * uCells;
  vec2 i = min( floor( c ), uCells - 1.0 );
  vec2 t = c - i;
  ivec2 k = ivec2( i );
  float h00 = texelFetch( uHeights, k, 0 ).r;
  float h10 = texelFetch( uHeights, k + ivec2( 1, 0 ), 0 ).r;
  float h01 = texelFetch( uHeights, k + ivec2( 0, 1 ), 0 ).r;
  float h11 = texelFetch( uHeights, k + ivec2( 1, 1 ), 0 ).r;
  // The ground mesh's own triangles (split from bottom-left to top-right of each cell)
  if ( t.x + t.y <= 1.0 ) return h00 + ( h10 - h00 ) * t.x + ( h01 - h00 ) * t.y;
  return h11 + ( h01 - h11 ) * ( 1.0 - t.x ) + ( h10 - h11 ) * ( 1.0 - t.y );
}
`;

const VERT_BODY = /* glsl */ `
  vec2 wp = uOrigin + aSpot;
  vec2 j = vec2( gHash( wp * 0.917 + 1.3 ), gHash( wp * 1.731 + 7.1 ) );
  wp += ( j - 0.5 ) * 0.7;
  float r1 = gHash( wp * 1.37 + 0.5 ), r2 = gHash( wp * 2.71 + 3.1 ), r3 = gHash( wp * 0.73 + 7.7 ), r4 = gHash( wp * 3.3 + 1.9 );
  vec2 fuv = ( wp - uRect.xy ) / uRect.zw;
  float inside = step( 0.0, fuv.x ) * step( fuv.x, 1.0 ) * step( 0.0, fuv.y ) * step( fuv.y, 1.0 );
  vec4 fld = texture2D( uField, fuv );
  float d = distance( wp, uEye.xz );
  // Fewer blades farther away (and none inside the inner patch, for the outer one)
  float keep = fld.g * uDensity * ( 1.0 - smoothstep( uFar * 0.72, uFar, d ) ) * step( uHole, d + r4 * 6.0 );
  float alive = inside * step( r2, keep );
  float tall = fld.r * ${GRASS.max.toFixed(1)};
  float bh = tall * ( 0.6 + 0.8 * r1 ) * alive;
  float bw = uWidth * ( 0.75 + 0.5 * r3 ) * ( 1.0 + d / uNear ) * min( 1.0, 0.45 + tall * 0.5 ) * alive;
  float yaw = r3 * 6.2832;
  vec2 dir = vec2( cos( yaw ), sin( yaw ) );
  // Long grass bends over more; the wind leans it all one way, in waves
  float lean = ( 0.12 + 0.35 * r1 ) * ( 0.5 + min( 1.0, tall / 1.5 ) );
  vec2 gust = vec2( 0.8, 0.6 ) * uWind * ( 0.55 + 0.45 * sin( uTime * 1.7 + dot( wp, vec2( 0.13, 0.09 ) ) + r1 * 1.5 ) );
  float t = position.y;
  vec2 bend = ( dir * lean + gust ) * t * t;
  vec2 side = vec2( -dir.y, dir.x );
  float base = gHeight( wp );
  vec3 grassPos = vec3( wp.x + side.x * position.x * bw + bend.x * bh, base + bh * t * ( 1.0 - 0.25 * dot( bend, bend ) ) + 0.04, wp.y + side.y * position.x * bw + bend.y * bh );
  vec3 bladeN = normalize( vec3( dir.x, 0.0, dir.y ) );
  vec3 objectNormal = normalize( mix( bladeN, vec3( 0.0, 1.0, 0.0 ), 0.72 ) );
  // Color: the ground's grass color (or the photo's), darker at the root, lighter at the tip
  vec3 tint = texture2D( uTint, fuv ).rgb;
  vec2 puv = ( wp - uPhotoRect.xy ) / uPhotoRect.zw;
  if ( uPhotoMix > 0.0 && puv.x > 0.0 && puv.x < 1.0 && puv.y > 0.0 && puv.y < 1.0 ) {
    vec3 ph = texture2D( uPhoto, vec2( puv.x, 1.0 - puv.y ) ).rgb;
    tint = mix( tint, ph * 1.15, uPhotoMix );
  }
  float v = 0.82 + 0.36 * r4;
  vec3 straw = vec3( 0.62, 0.56, 0.34 );
  vGrass = tint * v;
  vGrass = mix( vGrass, straw * ( 0.7 + 0.3 * r1 ), smoothstep( 0.9, 2.6, tall ) * 0.35 * r3 );
  vTip = t;
`;

/** One blade: a tapered strip, base to tip (x across -0.5..0.5, y up 0..1). */
const bladeGeometry = () => {
  const pos: number[] = [];
  const seg = 3;
  for (let i = 0; i < seg; i++) {
    const t = i / seg, w = 1 - t * 0.75;
    pos.push(-0.5 * w, t, 0, 0.5 * w, t, 0);
  }
  pos.push(0, 1, 0);
  const index: number[] = [];
  for (let i = 0; i < seg - 1; i++) {
    const a = i * 2;
    index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  index.push((seg - 1) * 2, (seg - 1) * 2 + 1, seg * 2);
  return { pos, index };
};

/** Blade spots for a square patch `half` ft each way: the same jittered pattern in every tile. */
const patchGeometry = (half: number, perSqFt: number) => {
  const n = Math.max(1, Math.round(TILE * TILE * perSqFt));
  let seed = 9173;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  // A jittered grid inside one tile (even cover, no clumps or holes)
  const side = Math.ceil(Math.sqrt(n));
  const tile: number[] = [];
  for (let i = 0; i < n; i++) {
    const gx = i % side, gy = Math.floor(i / side);
    tile.push(((gx + rnd()) / side) * TILE, ((gy + rnd()) / side) * TILE);
  }
  const tiles = Math.ceil((half * 2) / TILE);
  const spots = new Float32Array(tiles * tiles * n * 2);
  let k = 0;
  for (let ty = 0; ty < tiles; ty++) {
    for (let tx = 0; tx < tiles; tx++) {
      for (let i = 0; i < n; i++) {
        spots[k++] = tx * TILE + tile[i * 2];
        spots[k++] = ty * TILE + tile[i * 2 + 1];
      }
    }
  }
  const blade = bladeGeometry();
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(blade.pos, 3));
  geo.setIndex(blade.index);
  geo.setAttribute("aSpot", new THREE.InstancedBufferAttribute(spots, 2));
  geo.instanceCount = tiles * tiles * n;
  return { geo, span: tiles * TILE, count: tiles * tiles * n };
};

type Patch = { mesh: THREE.Mesh; mat: THREE.MeshLambertMaterial; span: number; count: number; uniforms: Record<string, THREE.IUniform> };

export class Grass {
  readonly group = new THREE.Group();
  private patches: Patch[] = [];
  private quality: GrassQuality = 0;
  private field: THREE.CanvasTexture | null = null;
  private tint: THREE.CanvasTexture | null = null;
  private rect = new THREE.Vector4(0, 0, 1, 1);
  private heights: THREE.DataTexture | null = null;
  private terrain = new THREE.Vector4(0, 0, 1, 1);
  private cells = new THREE.Vector2(1, 1);
  private photo: THREE.Texture | null = null;
  private photoRect = new THREE.Vector4(0, 0, 1, 1);
  private photoMix = 0;
  /** Blades drawn in the last frame (both patches), for tests and the frame-rate guard. */
  blades = 0;

  constructor() {
    this.group.name = "grass";
  }

  setQuality(q: GrassQuality) {
    if (q === this.quality) return;
    this.quality = q;
    this.build();
  }

  getQuality() {
    return this.quality;
  }

  setMaps(maps: GrassMaps) {
    const make = (c: HTMLCanvasElement, srgb: boolean) => {
      const t = new THREE.CanvasTexture(c);
      t.flipY = false;
      t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      t.minFilter = THREE.LinearFilter;
      t.generateMipmaps = false;
      return t;
    };
    this.field?.dispose();
    this.tint?.dispose();
    this.field = make(maps.field, false);
    this.tint = make(maps.color, true);
    this.rect.set(maps.rect.x, maps.rect.y, maps.rect.width, maps.rect.height);
    for (const p of this.patches) {
      p.uniforms.uField.value = this.field;
      p.uniforms.uTint.value = this.tint;
    }
  }

  setTerrain(t: GrassTerrain) {
    this.heights?.dispose();
    const tex = new THREE.DataTexture(t.heights, t.cols, t.rows, THREE.RedFormat, THREE.FloatType);
    tex.minFilter = tex.magFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    tex.needsUpdate = true;
    this.heights = tex;
    this.terrain.set(t.x, t.y, t.width, t.height);
    this.cells.set(t.cols - 1, t.rows - 1);
    for (const p of this.patches) p.uniforms.uHeights.value = tex;
  }

  /** The aerial photo the blades take their color from (`mix` 0: the course's colors only). */
  setPhoto(photo: THREE.Texture | null, rect: { x: number; y: number; width: number; height: number }, mix: number) {
    this.photo = photo;
    this.photoRect.set(rect.x, rect.y, rect.width, rect.height);
    this.photoMix = photo ? mix : 0;
    for (const p of this.patches) {
      p.uniforms.uPhoto.value = photo;
      p.uniforms.uPhotoMix.value = this.photoMix;
    }
  }

  private build() {
    for (const p of this.patches) {
      p.mesh.geometry.dispose();
      p.mat.dispose();
      this.group.remove(p.mesh);
    }
    this.patches = [];
    if (!this.quality) return;
    const lv = LEVELS[this.quality];
    const add = (half: number, perSqFt: number, width: number, near: number, far: number, hole: number) => {
      const { geo, span, count } = patchGeometry(half, perSqFt);
      const uniforms: Record<string, THREE.IUniform> = {
        uOrigin: { value: new THREE.Vector2() },
        uField: { value: this.field },
        uTint: { value: this.tint },
        uRect: { value: this.rect },
        uHeights: { value: this.heights },
        uTerrain: { value: this.terrain },
        uCells: { value: this.cells },
        uPhoto: { value: this.photo },
        uPhotoRect: { value: this.photoRect },
        uPhotoMix: { value: this.photoMix },
        uEye: { value: new THREE.Vector3() },
        uNear: { value: near },
        uFar: { value: far },
        uHole: { value: hole },
        uWidth: { value: width },
        uDensity: { value: 1 },
        uTime: { value: 0 },
        uWind: { value: 0.12 }
      };
      const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide });
      mat.onBeforeCompile = shader => {
        Object.assign(shader.uniforms, uniforms);
        shader.vertexShader = shader.vertexShader
          .replace("#include <common>", `#include <common>\n${VERT_HEAD}`)
          .replace("#include <beginnormal_vertex>", VERT_BODY)
          .replace("#include <begin_vertex>", "vec3 transformed = grassPos;");
        shader.fragmentShader = shader.fragmentShader
          .replace("#include <common>", "#include <common>\nvarying vec3 vGrass;\nvarying float vTip;")
          .replace("#include <color_fragment>", "#include <color_fragment>\ndiffuseColor.rgb *= vGrass * mix( 0.42, 1.12, vTip );")
          // Lit like the ground under it from both sides (no dark backs)
          .replace("#include <normal_fragment_begin>", "float faceDirection = 1.0;\nvec3 normal = normalize( vNormal );\nvec3 nonPerturbedNormal = normal;");
      };
      mat.customProgramCacheKey = () => "dg-grass";
      const mesh = new THREE.Mesh(geo, mat);
      mesh.frustumCulled = false;
      mesh.receiveShadow = true;
      mesh.castShadow = false;
      mesh.name = "grass-patch";
      mesh.raycast = () => {};
      this.group.add(mesh);
      this.patches.push({ mesh, mat, span, count, uniforms });
    };
    add(lv.innerR, lv.inner, 0.07, 30, lv.innerR, 0);
    add(lv.outerR, lv.outer, 0.16, 18, lv.outerR, lv.innerR * 0.85);
  }

  /**
   * Moves the patches under the camera (in whole tiles) and shows them only when the ground is
   * close enough for blades to be seen. `time` sways them in the wind.
   */
  update(eye: THREE.Vector3, groundY: number, time: number, wind: number) {
    const above = eye.y - groundY;
    const show = this.quality > 0 && !!this.field && !!this.heights && above < 320;
    this.group.visible = show;
    this.blades = 0;
    if (!show) return;
    // The patches center a little ahead of nothing in particular: on the point under the eye
    for (const p of this.patches) {
      const half = p.span / 2;
      const ox = Math.floor((eye.x - half) / TILE) * TILE, oz = Math.floor((eye.z - half) / TILE) * TILE;
      (p.uniforms.uOrigin.value as THREE.Vector2).set(ox, oz);
      (p.uniforms.uEye.value as THREE.Vector3).copy(eye);
      p.uniforms.uTime.value = time;
      p.uniforms.uWind.value = wind;
      // Seen from higher up, fewer blades are needed
      p.uniforms.uDensity.value = above > 120 ? 0.5 : 1;
      this.blades += p.count;
    }
  }

  dispose() {
    for (const p of this.patches) {
      p.mesh.geometry.dispose();
      p.mat.dispose();
    }
    this.patches = [];
    this.field?.dispose();
    this.tint?.dispose();
    this.heights?.dispose();
  }
}
