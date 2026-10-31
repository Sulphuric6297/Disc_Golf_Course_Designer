// Soft shadows that every device draws the same: three's "soft" shadow filter (PCF soft) widened.
// Each point looks at 8 spots on a little spiral round it (shadow.radius texels across), turned a
// different way at each pixel, so there's no pattern; each spot blended smoothly between its four
// nearest texels, so there are no steps. A soft edge with no checkerboard, however coarse the
// shadow picture, and no float textures (VSM put a phone's whole ground in shade).
import * as THREE from "three";

const SOFT = /* glsl */ `#elif defined( SHADOWMAP_TYPE_PCF_SOFT )

			vec2 texelSize = vec2( 1.0 ) / shadowMapSize;
			// (a turn of its own at each pixel: interleaved gradient noise)
			float dgTurn = 6.2831853 * fract( 52.9829189 * fract( dot( gl_FragCoord.xy, vec2( 0.06711056, 0.00583715 ) ) ) );
			shadow = 0.0;
			for ( int i = 0; i < 8; i ++ ) {
				// (a Vogel spiral: 8 spots spread evenly over the disc)
				float r = sqrt( ( float( i ) + 0.5 ) / 8.0 ), t = float( i ) * 2.3999632 + dgTurn;
				vec2 uv = shadowCoord.xy + vec2( cos( t ), sin( t ) ) * r * shadowRadius * texelSize;
				vec2 f = fract( uv * shadowMapSize + 0.5 );
				uv -= f * texelSize;
				shadow += mix(
					mix( texture2DCompare( shadowMap, uv, shadowCoord.z ), texture2DCompare( shadowMap, uv + vec2( texelSize.x, 0.0 ), shadowCoord.z ), f.x ),
					mix( texture2DCompare( shadowMap, uv + vec2( 0.0, texelSize.y ), shadowCoord.z ), texture2DCompare( shadowMap, uv + texelSize, shadowCoord.z ), f.x ),
					f.y );
			}
			shadow /= 8.0;

		#elif defined( SHADOWMAP_TYPE_VSM )`;

let done = false;
/** Puts the wider soft filter in place of three's own (once, before any shadow is drawn). */
export const softenShadows = () => {
  if (done) return;
  done = true;
  const chunk = THREE.ShaderChunk.shadowmap_pars_fragment;
  // (the directional and spot lights' getShadow: the first PCF soft branch, up to its VSM one)
  const a = chunk.indexOf("#elif defined( SHADOWMAP_TYPE_PCF_SOFT )"), b = chunk.indexOf("#elif defined( SHADOWMAP_TYPE_VSM )", a);
  if (a < 0 || b < 0) return;
  (THREE.ShaderChunk as Record<string, string>).shadowmap_pars_fragment = chunk.slice(0, a) + SOFT + chunk.slice(b + "#elif defined( SHADOWMAP_TYPE_VSM )".length);
};
