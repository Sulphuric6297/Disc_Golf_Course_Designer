// Water in 3D: a surface that reflects the sky (the same sky the view shows, so a pond at sunset
// takes the sunset's colors), more mirror-like toward the horizon as real water is, rippled by two
// layers of small waves drifting in the wind, its own color showing through where you look down
// into it. Ponds lie level; creeks follow the ground downhill.
import * as THREE from "three";

let ripples: THREE.Texture | null = null;

/** Small waves as a normal map that repeats without a seam (drawn once, shared). */
const rippleTexture = () => {
  if (ripples || typeof document === "undefined") return ripples;
  const S = 256;
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const g = c.getContext("2d")!;
  const img = g.createImageData(S, S);
  // Heights: a few sine waves in different directions, wrapping exactly round the tile
  const waves: { kx: number; ky: number; a: number; p: number }[] = [];
  let seed = 4217;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 14; i++) {
    const kx = Math.round((rnd() - 0.5) * 16), ky = Math.round((rnd() - 0.5) * 16);
    if (!kx && !ky) continue;
    waves.push({ kx, ky, a: 1 / Math.hypot(kx, ky), p: rnd() * Math.PI * 2 });
  }
  const h = (x: number, y: number) => waves.reduce((s, w) => s + w.a * Math.sin(((w.kx * x + w.ky * y) / S) * Math.PI * 2 + w.p), 0);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const dx = h(x + 1, y) - h(x - 1, y), dy = h(x, y + 1) - h(x, y - 1);
      const n = new THREE.Vector3(-dx * 3, -dy * 3, 1).normalize();
      const k = (y * S + x) * 4;
      img.data[k] = (n.x * 0.5 + 0.5) * 255;
      img.data[k + 1] = (n.y * 0.5 + 0.5) * 255;
      img.data[k + 2] = (n.z * 0.5 + 0.5) * 255;
      img.data[k + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.NoColorSpace;
  t.userData.shared = true;
  return (ripples = t);
};

export type WaterUniforms = { uTime: { value: number }; uWind: { value: number } };
/** One clock and wind for all water (CourseView moves them along). */
export const waterUniforms: WaterUniforms = { uTime: { value: 0 }, uWind: { value: 1 } };

const materials = new Map<string, THREE.MeshStandardMaterial>();
let skyEnv: THREE.Texture | null = null;

/** The sky the water reflects (CourseView makes it from its sky whenever the sun moves). */
export const setWaterSky = (env: THREE.Texture | null) => {
  skyEnv = env;
  for (const m of materials.values()) {
    m.envMap = env;
    m.needsUpdate = true;
  }
};

/**
 * Water of a color (shared per kind of water). Round it, `shore` is what stands on the banks
 * (trees, or open grass) and `rise` how high it reaches as seen from the water (the sine of the
 * angle: about 0.3 for a pond in the woods, 0.05 in an open field): the water mirrors that band
 * dark and the sky above it.
 */
export const waterMaterial = (color: string, shore = "#2a3a24", rise = 0.08) => {
  const key = `${color}|${shore}|${rise.toFixed(2)}`;
  let m = materials.get(key);
  if (m) return m;
  m = new THREE.MeshStandardMaterial({
    color: new THREE.Color(color).multiplyScalar(0.55),
    roughness: 0.06,
    metalness: 0,
    envMap: skyEnv,
    // (the sky's reflection is added by hand below, with the Fresnel; not twice)
    envMapIntensity: 0,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -8
  });
  const tex = rippleTexture();
  m.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, waterUniforms, { uRipples: { value: tex }, uReflect: { value: 0.9 }, uShore: { value: new THREE.Color(shore).multiplyScalar(0.55) }, uRise: { value: rise } });
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec2 vWaterXZ;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvWaterXZ = (modelMatrix * vec4(transformed, 1.0)).xz;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec2 vWaterXZ;\nuniform sampler2D uRipples;\nuniform float uTime;\nuniform float uWind;\nuniform float uReflect;\nuniform vec3 uShore;\nuniform float uRise;")
      // Two layers of ripples at different sizes, drifting different ways, tilting the surface
      .replace("#include <normal_fragment_maps>", `
        {
          vec2 p = vWaterXZ;
          vec3 a = texture2D( uRipples, p / 37.0 + vec2( 0.021, 0.013 ) * uTime * uWind ).xyz * 2.0 - 1.0;
          vec3 b = texture2D( uRipples, mat2( 0.8, -0.6, 0.6, 0.8 ) * p / 13.0 - vec2( 0.017, 0.029 ) * uTime * uWind ).xyz * 2.0 - 1.0;
          vec2 tilt = ( a.xy * 0.6 + b.xy * 0.4 ) * 0.11;
          vec3 nW = normalize( vec3( tilt.x, 1.0, tilt.y ) );
          normal = normalize( ( viewMatrix * vec4( nW, 0.0 ) ).xyz );
        }`)
      // The sky in the mirror direction, taking over toward the horizon (Fresnel) as on real water;
      // the water's own color looking straight down into it
      .replace("#include <opaque_fragment>", `
        #ifdef USE_ENVMAP
        {
          vec3 V = normalize( vViewPosition );
          vec3 R = inverseTransformDirection( reflect( -V, normal ), viewMatrix );
          R.y = abs( R.y );
          vec3 sky = textureCubeUV( envMap, R, 0.03 ).rgb * uReflect;
          // The banks and the trees on them, mirrored low in the water
          sky = mix( sky, uShore, 1.0 - smoothstep( uRise * 0.55, uRise * 1.25, R.y ) );
          float cosV = clamp( dot( normal, V ), 0.0, 1.0 );
          float fres = 0.02 + 0.98 * pow( 1.0 - cosV, 5.0 );
          outgoingLight = mix( outgoingLight, sky, clamp( fres, 0.0, 0.85 ) );
        }
        #endif
        #include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => "dg-water";
  m.userData.shared = true;
  materials.set(key, m);
  return m;
};
