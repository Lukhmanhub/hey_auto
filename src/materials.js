import * as THREE from 'three';
import { Bucket } from './util.js';

// CC0 surfaces from Poly Haven (public/tex). Geometry that uses them is box-projected in
// world space (TexBucket), so tiles stay the same size on every wall, roof and footpath.
const loader = new THREE.TextureLoader();
function tex(name, { srgb = true, repeat = 1 } = {}) {
  const t = loader.load(`${import.meta.env.BASE_URL}tex/${name}.jpg`);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function loadImage(src) { return new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; }); }

// Box projection: pick the dominant normal axis per vertex and use world coords as UVs.
export function projectUV(g, scale) {
  const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    if (ay >= ax && ay >= az) uv.setXY(i, x / scale, z / scale);
    else if (ax >= az) uv.setXY(i, z / scale, y / scale);
    else uv.setXY(i, x / scale, y / scale);
  }
}
export class TexBucket extends Bucket {
  constructor(scale) { super(); this.scale = scale; }
  add(...args) { const g = super.add(...args); projectUV(g, this.scale); return g; }
}

// Laterite: the porous red stone cut into blocks, Kerala's compound-wall material.
function lateriteTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 512;
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  const x = c.getContext('2d');
  x.fillStyle = '#9a4a2a'; x.fillRect(0, 0, 512, 512);
  loadImage(`${import.meta.env.BASE_URL}tex/red_laterite_soil_stones_diffuse.jpg`).then((img) => {
    if (img) { x.globalAlpha = 1; x.drawImage(img, 0, 0, 512, 512); }
    // blocks: 3 across × 6 rows per tile (≈ 40 × 20 cm), staggered courses, each a slightly different red
    let s = 7; const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
    const bw = 512 / 3, bh = 512 / 6;
    for (let r = 0; r < 6; r++) for (let k = -1; k < 4; k++) {
      const ox = k * bw + (r % 2 ? bw / 2 : 0);
      x.fillStyle = `hsla(${12 + rnd() * 14}, ${40 + rnd() * 25}%, ${30 + rnd() * 18}%, 0.32)`;
      x.fillRect(ox + 3, r * bh + 3, bw - 6, bh - 6);
      for (let p = 0; p < 22; p++) { x.fillStyle = `rgba(40,15,5,${0.25 + rnd() * 0.35})`; x.beginPath(); x.arc(ox + rnd() * bw, r * bh + rnd() * bh, 1 + rnd() * 3.5, 0, 7); x.fill(); }
    }
    x.strokeStyle = 'rgba(205,180,150,0.55)'; x.lineWidth = 4;
    for (let r = 0; r <= 6; r++) { x.beginPath(); x.moveTo(0, r * bh); x.lineTo(512, r * bh); x.stroke(); }
    for (let r = 0; r < 6; r++) for (let k = 0; k <= 3; k++) { const ox = k * bw + (r % 2 ? bw / 2 : 0); x.beginPath(); x.moveTo(ox, r * bh); x.lineTo(ox, r * bh + bh); x.stroke(); }
    t.needsUpdate = true;
  });
  return t;
}

// Building wall tile: aged plaster with a wooden-framed window, multiplied by each building's paint colour.
function plasterWindowTexture() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 256;
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  const x = c.getContext('2d');
  const draw = (img) => {
    x.fillStyle = '#f4f1ea'; x.fillRect(0, 0, 256, 256);
    if (img) { x.globalAlpha = 0.55; x.filter = 'grayscale(1) brightness(1.35) contrast(0.9)'; x.drawImage(img, 0, 0, 256, 256); x.filter = 'none'; x.globalAlpha = 1; }
    // monsoon grime at the base of each floor
    const g = x.createLinearGradient(0, 200, 0, 256); g.addColorStop(0, 'rgba(70,60,40,0)'); g.addColorStop(1, 'rgba(70,60,40,0.28)');
    x.fillStyle = g; x.fillRect(0, 200, 256, 56);
    x.fillStyle = 'rgba(255,255,255,0.35)'; x.fillRect(0, 214, 256, 6);                     // floor band
    x.fillStyle = '#5d3d22'; x.fillRect(74, 50, 108, 122);                                    // teak frame
    x.fillStyle = '#1f2830'; x.fillRect(84, 60, 40, 102); x.fillRect(132, 60, 40, 102);       // shutters/glass
    x.fillStyle = 'rgba(160,190,210,0.25)'; x.fillRect(86, 62, 14, 98); x.fillRect(134, 62, 14, 98);
    x.fillStyle = '#4a3019'; for (let k = 0; k < 4; k++) x.fillRect(74, 72 + k * 26, 108, 3);  // grille bars
    x.fillStyle = '#d6cfc0'; x.fillRect(64, 172, 128, 10);                                    // sill
    x.fillStyle = 'rgba(80,60,40,0.18)'; x.fillRect(70, 182, 116, 26);                        // rain stain below sill
    t.needsUpdate = true;
  };
  draw(null);
  loadImage(`${import.meta.env.BASE_URL}tex/painted_plaster_wall_diffuse.jpg`).then(draw);
  return t;
}

function windowLitTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d');
  x.fillStyle = '#000'; x.fillRect(0, 0, 256, 256);
  const g = x.createLinearGradient(0, 60, 0, 162); g.addColorStop(0, '#fff2c8'); g.addColorStop(1, '#ffb05a');
  x.fillStyle = g; x.fillRect(84, 60, 40, 102); x.fillRect(132, 60, 40, 102);
  x.fillStyle = '#000'; for (let k = 0; k < 4; k++) x.fillRect(74, 72 + k * 26, 108, 3);    // grille shadows
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function makeMaterials() {
  const asph = { map: tex('asphalt_02_diffuse'), normalMap: tex('asphalt_02_nor_gl', { srgb: false }), roughnessMap: tex('asphalt_02_rough', { srgb: false }) };
  for (const k in asph) asph[k].repeat.set(2, 2);
  const road = new THREE.MeshStandardMaterial({ ...asph, color: '#d8d6d2', roughness: 1, metalness: 0, normalScale: new THREE.Vector2(0.8, 0.8), envMapIntensity: 0.5 });

  const roof = new THREE.MeshStandardMaterial({
    vertexColors: true, map: tex('clay_roof_tiles_02_diffuse'), normalMap: tex('clay_roof_tiles_02_nor_gl', { srgb: false }),
    roughnessMap: tex('clay_roof_tiles_02_rough', { srgb: false }), roughness: 1, normalScale: new THREE.Vector2(1.2, 1.2), envMapIntensity: 0.4,
  });
  const laterite = new THREE.MeshStandardMaterial({ vertexColors: true, map: lateriteTexture(), normalMap: tex('red_laterite_soil_stones_nor_gl', { srgb: false }), roughness: 0.95, envMapIntensity: 0.35 });
  // monsoon moss creeping up the bottom of laterite walls (world-space height, so every wall gets it)
  laterite.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <map_fragment>', `#include <map_fragment>
        float n = fract(sin(dot(floor(vWPos.xz * 3.0 + vWPos.y * 2.0), vec2(12.9898, 78.233))) * 43758.5453);
        float moss = (1.0 - smoothstep(0.05, 0.75 + n * 0.35, vWPos.y)) * (0.55 + n * 0.45);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.16, 0.24, 0.09), moss * 0.75);
        float streak = smoothstep(0.85, 1.0, fract(vWPos.x * 1.7 + vWPos.z * 1.7)) * (1.0 - smoothstep(0.6, 1.8, vWPos.y));
        diffuseColor.rgb *= 1.0 - streak * 0.25;`);
  };
  const plaster = new THREE.MeshStandardMaterial({ vertexColors: true, map: tex('painted_plaster_wall_diffuse'), normalMap: tex('painted_plaster_wall_nor_gl', { srgb: false }), roughness: 0.92, envMapIntensity: 0.4 });
  const pave = new THREE.MeshStandardMaterial({ vertexColors: true, map: tex('herringbone_pavement_03_diffuse'), normalMap: tex('herringbone_pavement_03_nor_gl', { srgb: false }), roughness: 0.9, envMapIntensity: 0.4 });
  const walls = new THREE.MeshStandardMaterial({ vertexColors: true, map: plasterWindowTexture(), normalMap: tex('painted_plaster_wall_nor_gl', { srgb: false }), normalScale: new THREE.Vector2(0.6, 0.6), roughness: 0.9, envMapIntensity: 0.4 });
  // night: about half the windows light up warm, chosen per building and per window
  walls.emissiveMap = windowLitTexture(); walls.emissive = new THREE.Color('#ffc477'); walls.emissiveIntensity = 0;
  walls.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      {
        vec2 cellId = floor(vEmissiveMapUv) + vColor.rg * 97.0 + vColor.b * 13.0;
        float lit = step(0.48, fract(sin(dot(cellId, vec2(12.9898, 78.233))) * 43758.5453));
        float warm = fract(sin(dot(cellId, vec2(39.3, 11.7))) * 1234.5);
        totalEmissiveRadiance *= lit * mix(vec3(1.0), vec3(0.75, 0.9, 1.15), step(0.75, warm));   // a few cool tube-lights
      }`);
  };
  walls.customProgramCacheKey = () => 'wallsNight';
  const grassTex = tex('leafy_grass_diffuse', { repeat: 700 });
  const grass = new THREE.MeshStandardMaterial({ map: grassTex, color: '#a8c08a', roughness: 1, envMapIntensity: 0.3 });

  // the monsoon makes every hard surface darker and glossier
  const dry = new Map([road, roof, laterite, plaster, pave, walls].map((m) => [m, { color: m.color.clone(), roughness: m.roughness, env: m.envMapIntensity }]));
  function setWet(w) {
    for (const [m, d] of dry) {
      // wet surfaces absorb more light (darker albedo) and turn glossy, so the sky shows in them
      m.color.copy(d.color).multiplyScalar(1 - (m === road ? 0.68 : 0.35) * w);
      m.roughness = d.roughness * (1 - (m === road ? 0.8 : 0.4) * w);
      m.envMapIntensity = d.env * (1 + (m === road ? 0.45 : 0.3) * w);
    }
  }
  return { road, roof, laterite, plaster, pave, walls, grass, setWet, setNight: (n) => { walls.emissiveIntensity = n * 1.3; } };
}
