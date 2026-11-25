// View normals as a second colour attachment of the colour pass (medium tier and up), replacing
// the old separate normal pass (which drew the whole scene a second time with MeshNormalMaterial,
// and so updated and uploaded every skeleton twice a frame).
//
// In WebGL2 an attachment that the bound program does not write is undefined, so EVERY material
// that draws into the colour target must write location 1. Three only declares location 0, so:
//
// - Built-in materials (toon, basic, lambert, standard, points, sprites, lines): three's own
//   shader chunks are patched once at boot. `clipping_planes_pars_fragment` (in every built-in
//   fragment shader) declares the output; `common` declares a varying; `project_vertex` (every
//   built-in vertex shader) fills it with the unskinned view normal; `fog_fragment` (near the end of
//   every built-in fragment shader) writes it. This works whatever a material's own
//   onBeforeCompile does, because it lives in the chunks those hooks build on.
// - ShaderMaterials: ShaderMaterial.prototype.onBeforeCompile renames the material's `main` and
//   appends a wrapper that writes the output after it. No ShaderMaterial in the game sets its own
//   onBeforeCompile (prepareInkMaterials warns in dev if one ever does).
//
// What each material writes (the ink pass reads normal gradients, so this decides where crease
// lines can appear; the rules reproduce what the old normal pass saw):
// - opaque built-ins: the interpolated geometry normal (vNormal for lit materials, which includes
//   skinning and instancing; the varying above otherwise), flipped on back faces of double-sided
//   materials, exactly as MeshNormalMaterial did;
// - transparent, additive or custom-blended built-ins: vec4(0). Blending applies per attachment with
//   that output's own alpha, so alpha 0 leaves the normal underneath untouched: FX stay out of the
//   normal buffer as they did when the old pass skipped LAYER_FX. Hull outlines use this too (see
//   toon.js: a custom blend that is opaque in colour);
// - transparent normal-blended materials on layer 0 (glass): a real normal with alpha 1, since the
//   old pass drew them as solid (INK_NORMAL_REAL, set by prepareInkMaterials);
// - opaque ShaderMaterials on layer 0 (the water): a flat normal from screen derivatives of the
//   view position; on other layers (sky, skyline) or transparent: vec4(0).
//
// The normal buffer is cleared to 0, which decodes to (-1,-1,-1), the same as the old pass's black.
import * as THREE from 'three';

// The view's pixel rect inside its render target (x, y, w, h), for the ShaderMaterial flat-normal
// reconstruction. One shared uniform object; the ink pipeline sets it per view.
export const INK_VIEWPORT = { value: new THREE.Vector4(0, 0, 1, 1) };

let installed = false;
export function mrtNormalsInstalled() { return installed; }

const DECLARE = /* glsl */ `
#ifndef INK_NORMAL_OUT
#define INK_NORMAL_OUT
layout(location = 1) out highp vec4 gInkNormal;
#endif
`;

const WRITE_BUILTIN = /* glsl */ `
#ifdef INK_NORMAL_OUT
#if defined( INK_NORMAL_ZERO ) || ( !defined( OPAQUE ) && !defined( INK_NORMAL_REAL ) )
	gInkNormal = vec4( 0.0 );
#else
	{
	#if defined( INK_HAS_VNORMAL )
		vec3 inkN = vNormal;
	#elif defined( INK_VN )
		vec3 inkN = vInkN;
	#else
		vec3 inkN = vec3( 0.0 );
	#endif
		if ( dot( inkN, inkN ) > 0.0 ) {
			inkN = normalize( inkN );
	#ifdef DOUBLE_SIDED
			inkN *= gl_FrontFacing ? 1.0 : - 1.0;
	#endif
			gInkNormal = vec4( inkN * 0.5 + 0.5, 1.0 );
		} else {
			gInkNormal = vec4( 0.0 );
		}
	}
#endif
#endif
`;

export function installMrtNormals() {
  if (installed) return;
  installed = true;
  const C = THREE.ShaderChunk;
  const patch = (name, fn) => {
    const before = C[name];
    C[name] = fn(before);
    if (C[name] === before) console.warn(`[mrtNormals] chunk ${name} not patched`);
  };
  patch('clipping_planes_pars_fragment', (s) => DECLARE + s);
  patch('common', (s) => s + '\n#ifndef INK_VN\n#define INK_VN\nvarying vec3 vInkN;\n#endif\n');
  patch('normal_pars_fragment', (s) => s.replace('varying vec3 vNormal;', 'varying vec3 vNormal;\n\t#define INK_HAS_VNORMAL'));
  patch('project_vertex', (s) => s + `
#ifdef INK_VN
	vec3 inkObjN = normal;
	#ifdef USE_INSTANCING
		inkObjN = mat3( instanceMatrix ) * inkObjN;
	#endif
	vInkN = normalMatrix * inkObjN;
#endif
`);
  patch('fog_fragment', (s) => s + WRITE_BUILTIN);

  // ShaderMaterials: wrap main. RawShaderMaterials have no three prefix (and none draw into the
  // colour target), so they are left alone.
  const proto = THREE.ShaderMaterial.prototype;
  proto.onBeforeCompile = function inkShaderNormal(shader) {
    if (this.isRawShaderMaterial) return;
    const mode = shaderMode(this);
    if (mode === 'flat') shader.uniforms.inkViewport = INK_VIEWPORT;
    const body = shader.fragmentShader.replace(/void\s+main\s*\(\s*(void)?\s*\)/, 'void inkWrappedMain()');
    if (body === shader.fragmentShader) return;
    const write = mode === 'flat' ? /* glsl */ `
	vec2 inkNdc = ( gl_FragCoord.xy - inkViewport.xy ) / inkViewport.zw * 2.0 - 1.0;
	float inkW = 1.0 / gl_FragCoord.w;
	vec3 inkP = vec3( inkNdc.x * inkW / inkProj[ 0 ][ 0 ], inkNdc.y * inkW / inkProj[ 1 ][ 1 ], - inkW );
	gInkNormal = vec4( normalize( cross( dFdx( inkP ), dFdy( inkP ) ) ) * 0.5 + 0.5, 1.0 );` : '\n\tgInkNormal = vec4( 0.0 );';
    shader.fragmentShader = DECLARE
      + (mode === 'flat' ? 'uniform vec4 inkViewport;\nuniform mat4 projectionMatrix;\n#define inkProj projectionMatrix\n' : '')
      + body + `\nvoid main() {\n\tinkWrappedMain();${write}\n}\n`;
  };
  proto.customProgramCacheKey = function inkShaderKey() { return `ink-${shaderMode(this)}`; };
}

function shaderMode(m) {
  if (m.userData.inkNormal === 'zero') return 'zero';
  if (m.transparent || m.blending !== THREE.NormalBlending) return 'zero';
  return m.userData.inkNormal === 'flat' || m.userData.inkNormal === undefined ? 'flat' : 'zero';
}

// Per-material fix-ups that depend on which layers a material is drawn on (the shader cannot know):
// transparent normal-blended materials on layer 0 write a real normal (the old pass drew them
// solid); ShaderMaterials used only off layer 0 write nothing. Idempotent; run on boot, at the
// start of a run and whenever readyObjects runs. Anything it misses still writes a defined value.
const _seen = new WeakSet();
export function prepareInkMaterials(root) {
  if (!installed) return;
  const onLayer0 = new Map();
  root.traverse((o) => {
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    const l0 = (o.layers.mask & 1) !== 0;
    for (const m of mats) onLayer0.set(m, (onLayer0.get(m) ?? false) || l0);
  });
  for (const [m, l0] of onLayer0) {
    if (_seen.has(m)) continue;
    _seen.add(m);
    if (m.isShaderMaterial) {
      if (m.onBeforeCompile !== THREE.ShaderMaterial.prototype.onBeforeCompile && import.meta.env?.DEV) {
        console.warn('[mrtNormals] ShaderMaterial with its own onBeforeCompile: chain the ink normal hook', m);
      }
      if (!l0 && m.userData.inkNormal === undefined) { m.userData.inkNormal = 'zero'; m.needsUpdate = true; }
    } else if (l0 && m.transparent && m.blending === THREE.NormalBlending) {
      m.defines = { ...(m.defines ?? {}), INK_NORMAL_REAL: '' };
      m.needsUpdate = true;
    }
  }
}
