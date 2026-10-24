import * as THREE from 'three';

// Shared "everything is a bit dusty" layer. Injected into existing materials (chaining any
// onBeforeCompile they already have): red laterite dust builds up near the ground and on
// upward faces, grime is broken up by world-space noise, and printed things (signs,
// posters, flex) get sun-fade, speckle and a dirt film so the text never looks freshly printed.
export const dustU = { uDust: { value: 1 }, uWet: { value: 0 } };

const GLSL = `
  varying vec3 vDustW; varying vec3 vDustN;
  uniform float uDust, uWet;
  float dHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float dNoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(dHash(i), dHash(i + vec2(1, 0)), f.x), mix(dHash(i + vec2(0, 1)), dHash(i + vec2(1, 1)), f.x), f.y); }
`;

export function addDust(mat, { amount = 1, print = false, ground = 1, key = '' } = {}) {
  if (!mat || mat.userData.dusty) return mat;
  mat.userData.dusty = true;
  const prev = mat.onBeforeCompile;
  const prevKey = mat.customProgramCacheKey;
  mat.onBeforeCompile = (sh, r) => {
    prev?.call(mat, sh, r);
    sh.uniforms.uDust = dustU.uDust; sh.uniforms.uWet = dustU.uWet;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vDustW; varying vec3 vDustN;')
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
        {
          vec4 dw = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
            dw = instanceMatrix * dw;
          #endif
          vDustW = (modelMatrix * dw).xyz;
          vDustN = normalize(mat3(modelMatrix) * objectNormal);
        }`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + GLSL)
      .replace('#include <map_fragment>', `#include <map_fragment>
        {
          vec3 dustCol = vec3(0.66, 0.52, 0.40);                            // dry laterite dust
          float n = dNoise(vDustW.xz * 1.7 + vDustW.y * 0.9) * 0.6 + dNoise(vDustW.xy * 6.0 + vDustW.z * 3.0) * 0.4;
          float low = (1.0 - smoothstep(0.0, ${(1.4 * ground).toFixed(2)}, vDustW.y)) * ${(0.55 * ground).toFixed(2)} * (1.0 - smoothstep(0.6, 0.95, vDustN.y));   // splashed up onto walls & wheels
          float up = smoothstep(0.55, 0.95, vDustN.y) * step(0.4, vDustW.y) * 0.4;                                        // settles on ledges & roofs
          float d = clamp((low + up + n * 0.16) * ${amount.toFixed(2)} * uDust * (1.0 - uWet * 0.75), 0.0, 0.85);
          ${print ? `
          // printed surfaces: sun-faded, a speckled dust film, grime collecting toward the bottom edge
          float lum = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(lum), 0.22);                 // fade
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.82, 0.76, 0.66), 0.10);    // bleach
          float speck = step(0.86, dHash(floor(vDustW.xy * 140.0 + vDustW.z * 91.0)));
          d = clamp(d + 0.1 + speck * 0.12 + n * 0.1, 0.0, 0.5);` : ''}
          diffuseColor.rgb = mix(diffuseColor.rgb, dustCol * (0.85 + n * 0.3), d);
        }`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 1.0, 0.35 * uDust * (1.0 - uWet));');
  };
  mat.customProgramCacheKey = () => (prevKey ? prevKey.call(mat) : '') + `|dust${amount}${print}${ground}${key}`;
  mat.needsUpdate = true;
  return mat;
}

// Apply dust to everything in the scene that's a lit, standard material.
export function dustScene(scene, skip = new Set()) {
  scene.traverse((o) => {
    if (!o.isMesh || skip.has(o)) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      if (!m || !(m.isMeshStandardMaterial) || m.userData.dusty || m.userData.noDust || m.transparent && m.opacity < 0.5) continue;
      // signboards / posters / flex / decals: a single clamped print (tiling ground textures repeat)
      const print = !!m.map && !m.vertexColors && !m.normalMap && m.map.wrapS !== THREE.RepeatWrapping;
      addDust(m, { print, amount: print ? 1 : 0.9, ground: o.isSkinnedMesh ? 0.25 : 1 });
    }
  });
}

// Faint dusty margin along every kerb plus scattered dust drifts on the carriageway.
export function roadDust(N, gx, ROAD_HALF, HALF, zc0, zc1) {
  const c = document.createElement('canvas'); c.width = 64; c.height = 256; const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 64, 0);
  g.addColorStop(0, 'rgba(176,132,96,0.75)'); g.addColorStop(0.45, 'rgba(176,132,96,0.3)'); g.addColorStop(1, 'rgba(176,132,96,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 256);
  for (let i = 0; i < 400; i++) { x.fillStyle = `rgba(120,90,60,${Math.random() * 0.25})`; x.fillRect(Math.random() * 40, Math.random() * 256, 2, 2); }
  const tex = new THREE.CanvasTexture(c); tex.wrapT = THREE.RepeatWrapping; tex.colorSpace = THREE.SRGBColorSpace;
  const geos = [];
  const L = HALF * 2 + 10;
  for (let k = 0; k <= N; k++) for (const vertical of [true, false]) for (const side of [-1, 1]) {
    const p = new THREE.PlaneGeometry(1.4, L);
    const uv = p.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, side > 0 ? 1 - uv.getX(i) : uv.getX(i), uv.getY(i) * L / 12);
    p.rotateX(-Math.PI / 2);
    if (!vertical) p.rotateY(Math.PI / 2);
    const off = side * (ROAD_HALF - 0.7);
    p.translate(vertical ? gx(k) + off : 0, 0.028, vertical ? 0 : gx(k) + off);
    geos.push(p);
  }
  const m = new THREE.Mesh(mergeAll(geos), new THREE.MeshStandardMaterial({ map: tex, transparent: true, depthWrite: false, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2 }));
  m.material.userData.noDust = true;
  m.receiveShadow = true;
  m.renderOrder = 1;
  return m;
}
function mergeAll(geos) {
  let n = 0; for (const g of geos) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2), idx = [];
  let o = 0;
  for (const g of geos) {
    pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); uv.set(g.attributes.uv.array, o * 2);
    for (const i of g.index.array) idx.push(i + o);
    o += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setIndex(idx);
  return out;
}
