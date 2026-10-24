import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';

// Rigged, animated townsfolk built from Quaternius' CC0 "Universal Base Characters" +
// "Universal Animation Library" (public/chars). Kerala clothing is added at runtime:
//  · shirts, blouses, trousers, khaki uniforms and the saree pallu are painted onto the body
//    in the shader, using the bind-pose position so they stay put while the mesh is animated;
//  · mundu, lungi, saree skirts, nun's habits and school skirts are real cloth tubes,
//    skinned to the pelvis and legs so they swing when people walk.

let T = null;
const all = [];

const SKIN = [0.85, 1.0, 1.15, 1.3, 0.95, 1.2];   // brightness over the base (dark) skin texture
const SHIRTS = ['#f5f5f5', '#9ec5e8', '#e8d28e', '#b0473f', '#3e6fa8', '#7aa86b', '#e3a1b3', '#d7c4a3', '#ffffff', '#5c6bc0', '#26a69a'];
const SAREE = ['#e7c560', '#c2185b', '#2e7d32', '#6a1b9a', '#f5f0e1', '#e65100', '#1565c0', '#00897b', '#ad1457', '#f9a825'];
const PANTS = ['#2b2b33', '#3e4a5c', '#5a4a3a', '#1f2a3a', '#4e4e4e'];
const ARM_R = /^(clavicle_r|upperarm_r|lowerarm_r|hand_r|(index|middle|pinky|ring|thumb)_0\d(_leaf)?_r)\./;

export async function loadHumans() {
  const { MeshoptDecoder } = await import('three/examples/jsm/libs/meshopt_decoder.module.js');
  const l = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const [m, f, h, a] = await Promise.all(['body_m', 'body_f', 'hair', 'anims'].map((n) => l.loadAsync(`/chars/${n}.glb`)));
  T = { m: template(m.scene), f: template(f.scene), hair: {}, clips: {}, skirts: new Map() };
  // bake each hairstyle's node transform into its geometry (Hair_Buns ships at a different scale)
  h.scene.updateMatrixWorld(true);
  h.scene.traverse((o) => { if (o.isMesh) { const m = o.clone(); m.geometry = o.geometry.clone().applyMatrix4(o.matrixWorld); T.hair[o.name] = m; } });
  for (const c of a.animations) T.clips[c.name] = c;
  T.clips.ArmUp = new THREE.AnimationClip('ArmUp', -1, T.clips.Idle_Torch_Loop.tracks.filter((t) => ARM_R.test(t.name)));
  T.clips.WalkNoArm = new THREE.AnimationClip('WalkNoArm', -1, T.clips.Walk_Loop.tracks.filter((t) => !ARM_R.test(t.name)));
  T.clips.IdleNoArm = new THREE.AnimationClip('IdleNoArm', -1, T.clips.Idle_Loop.tracks.filter((t) => !ARM_R.test(t.name)));
  return T;
}
export const humansReady = () => !!T;

function template(scene) {
  scene.updateMatrixWorld(true);
  let body = null;
  scene.traverse((o) => { if (o.isSkinnedMesh && (!body || o.geometry.attributes.position.count > body.geometry.attributes.position.count)) body = o; });
  const sk = body.skeleton, rest = {};
  sk.bones.forEach((b, i) => { rest[b.name] = new THREE.Matrix4().copy(sk.boneInverses[i]).invert(); });
  const P = (n) => new THREE.Vector3().setFromMatrixPosition(rest[n]);
  const box = new THREE.Box3().setFromBufferAttribute(body.geometry.attributes.position);
  const bi = Object.fromEntries(sk.bones.map((b, i) => [b.name, i]));
  // hip girth at the waistband, measured from the mesh so skirts never clip through
  const pos = body.geometry.attributes.position, py = P('pelvis').y + 0.1, armX = P('upperarm_l').x;
  let hx = 0, hz0 = 0, hz1 = 0;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    if (Math.abs(y - py) < 0.12 && Math.abs(x) < armX) { hx = Math.max(hx, Math.abs(x)); hz0 = Math.min(hz0, z); hz1 = Math.max(hz1, z); }
  }
  return { scene, bodyName: body.name, rest, P, bi, height: box.max.y, front: box.max.z, hip: { x: hx + 0.045, z0: hz0 - 0.05, z1: hz1 + 0.05 } };
}

// ---------------- clothing ----------------
function clothMaterial(src, c, t) {
  const m = src.clone();
  const U = {
    uShirt: { value: new THREE.Color(c.shirt) }, uPat: { value: new THREE.Color(c.pat ?? c.shirt) }, uPattern: { value: c.pattern ?? 0 },
    uLower: { value: new THREE.Color(c.lower ?? '#000') }, uLowerOn: { value: c.lower ? 1 : 0 }, uHem: { value: c.hemY },
    uPallu: { value: c.pallu ? 1 : 0 }, uPalluCol: { value: new THREE.Color(c.pallu ?? '#000') },
    uSkin: { value: c.skin }, uMidriff: { value: c.midriff ? 1 : 0 }, uMust: { value: c.mustache ? 1 : 0 },
    uArmX: { value: t.P('upperarm_l').x - 0.005 }, uHeadZ: { value: t.P('Head').z }, uSleeve: { value: c.sleeve }, uTop: { value: t.P('neck_01').y + 0.025 },
    uWaist: { value: t.P('pelvis').y + (c.midriff ? 0.17 : 0.06) }, uHeadY: { value: t.P('Head').y }, uH: { value: t.height }, uFront: { value: t.front },
  };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vBind;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvBind = position;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      varying vec3 vBind;
      float clothMask = 0.0;
      uniform vec3 uShirt, uPat, uLower, uPalluCol; uniform float uSkin, uHeadZ, uPattern, uLowerOn, uHem, uPallu, uMidriff, uMust, uArmX, uSleeve, uTop, uWaist, uHeadY, uH, uFront;`)
      .replace('#include <map_fragment>', `#include <map_fragment>
      {
        vec3 p = vBind; float ax = abs(p.x);
        float isArm = step(uArmX, ax) * step(uTop - 0.32, p.y);
        float neckline = step(p.y, uTop) + step(0.07, ax) * step(p.y, uTop + 0.02);
        float torso = step(uWaist, p.y) * min(1.0, neckline) * (1.0 - isArm);
        torso *= 1.0 - uMidriff * step(p.y, uWaist + 0.16);          // saree blouse leaves the midriff bare
        float sleeve = isArm * step(ax, uSleeve);
        float shirt = max(torso, sleeve);
        float lower = uLowerOn * step(uHem, p.y) * step(p.y, uWaist + 0.012) * (1.0 - isArm);
        float pallu = uPallu * step(uWaist - 0.02, p.y) * step(p.y, uTop + 0.02) * (1.0 - isArm)
                    * step(abs(p.x * 0.85 + (p.y - uWaist) * 0.75 - 0.18), 0.11);   // drape over the left shoulder
        vec3 sc = uShirt;
        if (uPattern > 0.5 && uPattern < 1.5) sc = mix(uShirt, uPat, mod(floor(p.x * 18.0) + floor(p.y * 18.0), 2.0));   // checks
        if (uPattern > 1.5) sc = mix(uShirt, uPat, step(0.72, fract(p.x * 26.0)));                                       // stripes
        float lum = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
        float shade = 0.86 + 0.28 * lum;                                  // a hint of form, but cloth hides the muscles
        vec3 col = diffuseColor.rgb * uSkin;
        col = mix(col, sc * shade, shirt);
        col = mix(col, uLower * shade, lower);
        col = mix(col, uPalluCol * shade, pallu);
        // mustache: the Kerala essential
        float span = uH - uHeadY, my = uHeadY + span * 0.235;
        float must = uMust * step(abs(p.y - my), span * 0.05) * step(ax, 0.036 - (my - p.y) * 0.6) * step(uHeadZ + 0.05, p.z);
        col = mix(col, vec3(0.04, 0.03, 0.025), must * 0.92);
        col = mix(col, vec3(0.16, 0.1, 0.06), step(p.y, 0.025));       // chappals
        diffuseColor.rgb = col;
        clothMask = max(max(shirt, lower), pallu);
      }`)
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n normal = normalize(mix(normal, nonPerturbedNormal, clothMask * 0.9));')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n roughnessFactor = mix(roughnessFactor, 0.95, clothMask);');
  };
  m.customProgramCacheKey = () => 'cloth2';
  m.userData.U = U;
  return m;
}

function clothTex(kind, a, b) {
  const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d');
  x.fillStyle = a; x.fillRect(0, 0, 256, 256);
  if (kind === 'lungi') { x.fillStyle = b; for (let k = 0; k < 256; k += 32) { x.globalAlpha = 0.55; x.fillRect(k, 0, 12, 256); x.fillRect(0, k, 256, 12); } x.globalAlpha = 1; }
  if (kind === 'mundu') { x.fillStyle = '#d4a017'; x.fillRect(0, 226, 256, 10); x.fillRect(0, 242, 256, 4); }      // kasavu border at the hem
  if (kind === 'saree') { x.fillStyle = b; x.fillRect(0, 214, 256, 30); x.fillStyle = 'rgba(255,255,255,.25)'; for (let k = 0; k < 60; k++) x.fillRect((k * 53) % 256, (k * 97) % 200, 4, 4); }
  for (let k = 0; k < 1200; k++) { x.fillStyle = `rgba(0,0,0,${Math.random() * 0.04})`; x.fillRect(Math.random() * 256, Math.random() * 256, 2, 1); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; t.repeat.set(3, 1);
  return t;
}

// Skinned cloth tube from the waist down to `hemY` (mundu, lungi, saree, habit, school skirt)
function skirtGeometry(t, hemY, flare) {
  const key = `${t.height}_${hemY.toFixed(2)}_${flare}`;
  if (T.skirts.has(key)) return T.skirts.get(key);
  const top = t.P('pelvis').y + 0.13, len = top - hemY;
  const thighL = t.P('thigh_l'), calfY = t.P('calf_l').y;
  const rx = t.hip.x, rz = (t.hip.z1 - t.hip.z0) / 2, cz = (t.hip.z1 + t.hip.z0) / 2;
  const g = new THREE.CylinderGeometry(rx, rx + flare + 0.05, len, 28, 12, true);
  g.translate(0, top - len / 2, 0);
  const pos = g.attributes.position, n = pos.count;
  const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
  const side = Math.sign(thighL.x) || 1;
  for (let i = 0; i < n; i++) {
    const y = pos.getY(i), x = pos.getX(i), tt = (top - y) / len;
    const r = rx + flare * tt;
    pos.setZ(i, pos.getZ(i) * (rz / rx) * (1 - tt) + pos.getZ(i) * tt * 0.85 + cz);   // elliptical at the hips, rounder at the hem
    const left = THREE.MathUtils.smoothstep(x * side / r, -0.55, 0.55);
    const wP = 1 - THREE.MathUtils.smoothstep(tt, 0.0, 0.32);
    const knee = (top - calfY) / len;
    const wC = THREE.MathUtils.smoothstep(tt, knee - 0.05, knee + 0.35) * (1 - wP);
    const wLeg = 1 - wP - wC;
    si.set([t.bi.pelvis, t.bi.thigh_l, t.bi.thigh_r, left > 0.5 ? t.bi.calf_l : t.bi.calf_r], i * 4);
    sw.set([wP, wLeg * left, wLeg * (1 - left), wC], i * 4);
  }
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  g.computeVertexNormals();
  T.skirts.set(key, g);
  return g;
}

// ---------------- a person ----------------
const pick = (r, a) => a[Math.floor(r() * a.length)];
function outfit(r, kind, female) {
  const skin = pick(r, SKIN);
  const o = { skin, sleeve: 0.33, scale: female ? 0.9 : 0.93, hair: female ? pick(r, ['Hair_Long', 'Hair_Buns']) : pick(r, ['Hair_SimpleParted', 'Hair_Buzzed', 'Hair_SimpleParted']), hairCol: '#120d0b', mustache: !female && r() < 0.8 };
  if (kind === 'kid') Object.assign(o, { scale: 0.62, shirt: '#f4f4f0', sleeve: 0.3, mustache: false, backpack: pick(r, ['#c62828', '#1565c0', '#2e7d32']), hair: female ? 'Hair_Buns' : 'Hair_Buzzed', ...(female ? { skirt: { hem: 'knee', col: '#1f2f5a', tex: null, flare: 0.08 } } : { lower: '#1f2f5a', hem: 'knee' }) });
  else if (kind === 'nun') Object.assign(o, { shirt: '#f4f4f0', sleeve: 9, skirt: { hem: 'ankle', col: '#f4f4f0', flare: 0.12 }, veil: true, hair: null });
  else if (kind === 'driver') Object.assign(o, { shirt: '#b49a6a', sleeve: 0.34, mustache: true, hair: 'Hair_SimpleParted', skirt: { hem: 'ankle', col: '#f3efe4', tex: 'mundu', flare: 0.07 } });
  else if (kind === 'police') Object.assign(o, { shirt: '#b49a6a', sleeve: 0.33, lower: '#b49a6a', hem: 0.06, cap: true, mustache: true, hair: 'Hair_Buzzed' });
  else if (kind === 'fisherwoman') Object.assign(o, { shirt: pick(r, SAREE), midriff: true, pallu: pick(r, SAREE), skirt: { hem: 'ankle', col: pick(r, SAREE), tex: 'saree', flare: 0.1 }, basket: true });
  else if (kind === 'paperboy') Object.assign(o, { scale: 0.8, shirt: pick(r, SHIRTS), lower: '#3e4a5c', hem: 'knee', mustache: false, bundle: true });
  else if (female) {
    const s = pick(r, SAREE);
    if (r() < 0.6) Object.assign(o, { shirt: pick(r, SAREE), midriff: true, pallu: s, skirt: { hem: 'ankle', col: s, border: pick(r, ['#d4a017', '#b71c1c', '#1b5e20']), tex: 'saree', flare: 0.1 } });
    else Object.assign(o, { shirt: s, sleeve: 0.5, skirt: { hem: 'knee', col: s, flare: 0.06 }, lower: pick(r, ['#f5f0e1', '#1f1f1f', '#e8d28e']), hem: 0.06 });   // churidar
  } else {
    const old = r() < 0.15;
    Object.assign(o, { shirt: old ? '#f4f2ec' : pick(r, SHIRTS), pattern: r() < 0.3 ? (r() < 0.6 ? 1 : 2) : 0, pat: pick(r, SHIRTS), sleeve: r() < 0.55 ? 0.34 : 0.68 });
    if (old) Object.assign(o, { hairCol: '#c9c4bb', hair: 'Hair_Buzzed' });
    const lo = r();
    if (lo < 0.35 || old) o.skirt = { hem: 'ankle', col: r() < 0.8 ? '#f3efe4' : '#e3d6b5', tex: 'mundu', flare: 0.07 };
    else if (lo < 0.5) o.skirt = { hem: 'knee', col: '#f3efe4', tex: 'mundu', flare: 0.05 };                          // mundu folded up
    else if (lo < 0.68) o.skirt = { hem: 'ankle', col: pick(r, ['#2f6fb3', '#1b5e20', '#8e244d', '#5d4037']), border: '#f4f4f0', tex: 'lungi', flare: 0.07 };
    else Object.assign(o, { lower: pick(r, PANTS), hem: 0.06 });
    if (r() < 0.2) o.beard = true;
  }
  return o;
}

export function createHuman(r = Math.random, kind = '', female = r() < 0.45) {
  if (kind === 'nun' || kind === 'fisherwoman') female = true;
  if (kind === 'police' || kind === 'paperboy' || kind === 'driver') female = false;
  const t = female ? T.f : T.m;
  const o = outfit(r, kind, female);
  const root = SkeletonUtils.clone(t.scene);
  const group = new THREE.Group(); group.add(root);
  // the base bodies are athletic "superhero" builds; everyday Kerala folk are slimmer
  root.scale.set(o.scale * (female ? 0.92 : 0.86), o.scale, o.scale * (female ? 0.92 : 0.86));
  let body = null; const bones = {};
  root.traverse((n) => {
    if (n.isBone) bones[n.name] = n;
    if (n.isSkinnedMesh) { n.castShadow = true; n.frustumCulled = false; if (n.name === t.bodyName) body = n; }
  });
  const hemY = (h) => (h === 'knee' ? t.P('calf_l').y - 0.02 : h === 'ankle' ? 0.07 : h);
  o.hemY = hemY(o.hem ?? 0.06);
  body.material = clothMaterial(body.material, o, t);

  let skirtMesh = null;
  if (o.skirt) {
    const s = o.skirt;
    const tex = s.tex ? clothTex(s.tex, s.col, s.border ?? '#d4a017') : null;
    const sk = new THREE.SkinnedMesh(skirtGeometry(t, hemY(s.hem), s.flare), new THREE.MeshStandardMaterial({ color: tex ? '#ffffff' : s.col, map: tex, roughness: 0.92, side: THREE.DoubleSide }));
    sk.bind(body.skeleton, body.bindMatrix);
    sk.castShadow = true; sk.frustumCulled = false;
    body.parent.add(sk); skirtMesh = sk;
  }
  const head = bones.Head, headInv = new THREE.Matrix4().copy(t.rest.Head).invert();
  const attachHead = (mesh) => { mesh.matrixAutoUpdate = false; mesh.matrix.copy(headInv); head.add(mesh); return mesh; };
  const hairMat = (src, col) => { const m = src.material.clone(); m.color = new THREE.Color(col); return m; };
  const brows = T.hair[female ? 'Eyebrows_Female' : 'Eyebrows_Regular'];
  if (brows) attachHead(new THREE.Mesh(brows.geometry, hairMat(brows, o.hairCol)));
  if (o.hair && T.hair[o.hair]) { const h = attachHead(new THREE.Mesh(T.hair[o.hair].geometry, hairMat(T.hair[o.hair], o.hairCol))); h.castShadow = true; }
  if (o.beard && T.hair.Hair_Beard) attachHead(new THREE.Mesh(T.hair.Hair_Beard.geometry, hairMat(T.hair.Hair_Beard, o.hairCol)));
  const headTop = t.P('Head').y, span = t.height - headTop;
  const onHead = (mesh, x, y, z) => { mesh.matrixAutoUpdate = false; mesh.matrix.copy(headInv).multiply(new THREE.Matrix4().makeTranslation(x, y, z)); head.add(mesh); return mesh; };
  if (o.veil) {
    const vm = new THREE.MeshStandardMaterial({ color: '#f4f4f0', roughness: 0.9, side: THREE.DoubleSide });
    onHead(new THREE.Mesh(new THREE.SphereGeometry(span * 0.6, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.6), vm), 0, headTop + span * 0.5, -0.01);
    onHead(new THREE.Mesh(new THREE.BoxGeometry(span * 1.05, span * 1.5, 0.02), vm), 0, headTop + span * 0.05, -0.11);
  }
  if (o.cap) { const c = new THREE.Mesh(new THREE.CylinderGeometry(span * 0.5, span * 0.48, span * 0.28, 16), new THREE.MeshStandardMaterial({ color: '#efe9dc', roughness: 0.7 })); c.matrixAutoUpdate = false; c.matrix.copy(headInv).multiply(new THREE.Matrix4().makeTranslation(0, t.height - span * 0.05, 0)); head.add(c); const brim = new THREE.Mesh(new THREE.BoxGeometry(span * 0.7, 0.01, span * 0.35), new THREE.MeshStandardMaterial({ color: '#111' })); brim.matrixAutoUpdate = false; brim.matrix.copy(headInv).multiply(new THREE.Matrix4().makeTranslation(0, t.height - span * 0.18, span * 0.45)); head.add(brim); }
  if (o.basket) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.14, 0.16, 16), new THREE.MeshStandardMaterial({ color: '#8b6a3e', roughness: 1 })); b.matrixAutoUpdate = false; b.matrix.copy(headInv).multiply(new THREE.Matrix4().makeTranslation(0, t.height + 0.08, 0)); head.add(b); }
  const spine = bones.spine_03, spineInv = new THREE.Matrix4().copy(t.rest.spine_03).invert(), sp = t.P('spine_03');
  const attachSpine = (mesh, x, y, z) => { mesh.matrixAutoUpdate = false; mesh.matrix.copy(spineInv).multiply(new THREE.Matrix4().makeTranslation(sp.x + x, sp.y + y, sp.z + z)); spine.add(mesh); return mesh; };
  if (o.backpack) attachSpine(new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.32, 0.1), new THREE.MeshStandardMaterial({ color: o.backpack, roughness: 0.8 })), 0, -0.08, -0.15);
  if (o.bundle) attachSpine(new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.12, 0.4), new THREE.MeshStandardMaterial({ color: '#efeae0' })), 0.24, -0.25, 0.05);
  // umbrella over the right shoulder (shown in the rain with the arm raised)
  const umb = new THREE.Group();
  const canopy = new THREE.Mesh(new THREE.ConeGeometry(0.62, 0.3, 12, 1, true), new THREE.MeshStandardMaterial({ color: kind === 'kid' ? pick(r, ['#e53935', '#1e88e5', '#fdd835']) : '#141414', roughness: 0.6, side: THREE.DoubleSide }));
  canopy.position.y = 0.95; umb.add(canopy);
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.0, 5), new THREE.MeshStandardMaterial({ color: '#3a2a1a' })); stick.position.y = 0.45; umb.add(stick);
  attachSpine(umb, -0.2, 0.15, 0.12); umb.visible = false;

  const h = new Human(group, root, o, kind, female, umb);
  if (kind === 'kid') h.headScale = { bone: head, s: 1.28 };   // children's heads are big for their bodies
  h.skirt = skirtMesh; h.U = body.material.userData.U; h.hemSkirt = o.skirt ? hemY(o.skirt.hem) : 0;
  all.push(h);
  return h;
}

class Human {
  constructor(group, root, o, kind, female, umb) {
    Object.assign(this, { group, root, o, kind, female, umb });
    this.mixer = new THREE.AnimationMixer(root);
    this.actions = {};
    this.base = null; this.arm = false; this.speed = 0;
    this.play('Idle_Loop', 0);
    this.mixer.update(Math.random() * 2);
  }
  act(name) {
    if (!this.actions[name]) this.actions[name] = this.mixer.clipAction(T.clips[name]);
    return this.actions[name];
  }
  play(name, fade = 0.25, once = false) {
    if (this.base === name) return;
    const a = this.act(name);
    a.reset(); a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat); a.clampWhenFinished = once; a.enabled = true; a.setEffectiveWeight(1);
    a.fadeIn(fade).play();
    if (this.base) this.act(this.base).fadeOut(fade);
    this.base = name;
  }
  setArmUp(on) {
    if (this.arm === on) return;
    this.arm = on;
    const a = this.act('ArmUp');
    if (on) { a.reset().fadeIn(0.3).play(); } else a.fadeOut(0.3);
    if (this.base === 'Walk_Loop' || this.base === 'WalkNoArm') this.play(on ? 'WalkNoArm' : 'Walk_Loop', 0.2);
    if (this.base === 'Idle_Loop' || this.base === 'IdleNoArm') this.play(on ? 'IdleNoArm' : 'Idle_Loop', 0.2);
  }
  walk(speed) {
    this.speed = speed;
    if (this.skirt && !this.skirt.visible) this.seated(false);
    if (speed > 0.1) { this.play(this.arm ? 'WalkNoArm' : 'Walk_Loop'); this.act(this.base).timeScale = speed / 1.25; }
    else this.play(this.arm ? 'IdleNoArm' : 'Idle_Loop');
  }
  idle() { this.walk(0); }
  talk() { this.setArmUp(false); this.play('Idle_Talking_Loop'); }
  // a stiff tube can't fold onto a lap, so seated people get the mundu / saree painted on instead
  seated(on) {
    if (!this.skirt) return;
    this.skirt.visible = !on;
    if (on) { this.U.uLowerOn.value = 1; this.U.uLower.value.set(this.o.skirt.col); this.U.uHem.value = Math.min(this.hemSkirt, 0.3); }
    else { this.U.uLowerOn.value = this.o.lower ? 1 : 0; this.U.uLower.value.set(this.o.lower ?? '#000'); this.U.uHem.value = this.o.hemY; }
  }
  sit(talking) { this.setArmUp(false); this.seated(true); this.play(talking ? 'Sitting_Talking_Loop' : 'Sitting_Idle_Loop'); }
  drive() { this.seated(true); this.play('Driving_Loop'); }
  fall() { this.setArmUp(false); this.play('Death01', 0.1, true); }
  hail(on) { this.setArmUp(on); }
  umbrella(on) { this.umb.visible = on; this.setArmUp(on); }
}

// Advance every live human's animation. Far-away people update less often, and the
// very far ones aren't drawn at all (they're lost in the haze anyway).
let frame = 0;
export function updateHumans(dt, camera) {
  frame++;
  for (let i = all.length - 1; i >= 0; i--) {
    const h = all[i];
    if (!h.group.parent && !h.keep) { all.splice(i, 1); continue; }
    if (!h.group.visible) continue;
    h.group.getWorldPosition(_p);
    const d = _p.distanceTo(camera.position);
    h.root.visible = d < 85;                       // lost in the haze beyond this anyway
    if (!h.root.visible) continue;
    const shadow = d < shadowDist;                  // skinned shadows are costly: only the people right around you
    if (h.shadow !== shadow) { h.shadow = shadow; h.root.traverse((n) => { if (n.isMesh) n.castShadow = shadow; }); }
    const every = d < 35 ? 1 : d < 70 ? 2 : 4;
    h.acc = (h.acc ?? 0) + dt;
    if ((frame + i) % every === 0) { h.mixer.update(h.acc); h.acc = 0; if (h.headScale) h.headScale.bone.scale.setScalar(h.headScale.s); }
  }
}
const _p = new THREE.Vector3();
let shadowDist = 25;
export const setHumanShadowDistance = (d) => { shadowDist = d; };
