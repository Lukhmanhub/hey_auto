import * as THREE from 'three';
import { Bucket, paint, FONT_PAINT } from './util.js';
import { humansReady, createHuman } from './humans.js';

export const vcMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.72, metalness: 0.05 });
export const vcShiny = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.25 });
// showroom paint for the rich kids' cars: glossy, picks up the sky
export const vcPaint = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.24, metalness: 0.45, envMapIntensity: 1.25 });

const cache = new Map();
const cached = (key, fn) => { if (!cache.has(key)) cache.set(key, fn()); return cache.get(key); };

const Box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const Cyl = (rt, rb, h, s = 14) => new THREE.CylinderGeometry(rt, rb, h, s);

function wheel(b, x, y, z, r = 0.27, w = 0.18) {
  b.add(Cyl(r, r, w, 16), '#141414', x, y, z, 0, 0, Math.PI / 2);
  b.add(Cyl(r * 0.45, r * 0.45, w + 0.02, 10), '#9a9a9a', x, y, z, 0, 0, Math.PI / 2);
}

// ---------- Auto rickshaw (forward = +z) ----------
function autoBody(b, body, trim, withGlass) {
  b.box(1.2, 0.18, 2.3, '#202020', 0, 0.42, -0.1);                 // chassis
  b.box(1.32, 0.5, 1.25, body, 0, 0.8, -0.55);                     // rear tub
  b.box(1.34, 0.09, 1.27, trim, 0, 0.58, -0.55);                   // stripe
  b.box(0.95, 0.1, 0.95, body, 0, 0.56, 0.5);                      // footboard
  b.add(new THREE.CylinderGeometry(0.55, 0.5, 0.82, 18, 1, false, -Math.PI / 2, Math.PI), body, 0, 0.89, 0.95);
  b.box(1.1, 0.82, 0.06, body, 0, 0.89, 0.95);                     // dash
  b.box(1.12, 0.06, 0.58, trim, 0, 1.3, 1.2);                      // nose top trim
  b.add(Cyl(0.12, 0.12, 0.08, 14), '#fff6cf', 0, 1.08, 1.5, Math.PI / 2, 0, 0); // headlight
  b.box(0.1, 0.5, 0.1, '#333', 0, 0.55, 1.2);                      // fork
  b.box(0.36, 0.06, 0.5, '#222', 0, 0.6, 1.2);                     // mudguard
  b.box(0.55, 0.14, 0.45, '#3b2a22', 0, 1.0, 0.35);                // driver seat
  b.box(1.2, 0.18, 0.55, '#6d1f1f', 0, 1.1, -0.68);                // passenger bench
  b.box(1.2, 0.6, 0.12, '#6d1f1f', 0, 1.42, -1.02);                // backrest
  b.box(1.44, 0.07, 2.4, '#111', 0, 2.02, -0.12);                  // canopy
  b.box(1.44, 0.12, 0.26, '#111', 0, 1.95, 1.04);                   // visor
  b.box(1.44, 0.07, 2.42, trim === '#151515' ? '#f4c20d' : trim, 0, 2.06, -0.12); // roof edge trim
  b.box(1.44, 0.95, 0.05, '#151515', 0, 1.52, -1.3);               // rear canvas
  b.box(0.8, 0.26, 0.02, '#4a5a64', 0, 1.68, -1.33);               // rear window
  b.box(1.44, 0.08, 0.06, body, 0, 1.08, -1.3);                    // rear canvas hem
  for (const sx of [-0.71, 0.71]) {
    b.box(0.05, 0.42, 1.2, '#151515', sx, 1.78, -0.7);             // upper side canvas
    b.box(0.05, 1.0, 0.05, '#0d0d0d', sx * 0.88, 1.5, 0.95);       // front pillars
    b.box(0.05, 0.95, 0.05, '#0d0d0d', sx, 1.52, -0.1);            // mid pillars
  }
  b.box(0.8, 0.05, 0.05, '#111', 0, 1.36, 0.72);                   // handlebar
  b.box(0.06, 0.4, 0.06, '#111', 0, 1.18, 0.8);
  for (const sx of [-0.5, 0.5]) b.box(0.16, 0.1, 0.04, '#c4161c', sx, 0.88, -1.19);
  b.box(0.42, 0.16, 0.02, '#f2f2f2', 0, 0.76, -1.2);               // number plate
  b.box(0.08, 0.06, 0.25, '#555', 0.4, 0.4, -1.25);                // exhaust
  if (withGlass) b.box(1.0, 0.6, 0.03, '#8fb1c4', 0, 1.6, 1.0, -0.12, 0, 0);
}

export function autoGeometry(body = '#f4c20d', trim = '#151515') {
  return cached(`auto${body}${trim}`, () => {
    const b = new Bucket();
    autoBody(b, body, trim, true);
    wheel(b, 0, 0.27, 1.2); wheel(b, -0.62, 0.27, -0.72); wheel(b, 0.62, 0.27, -0.72);
    // seated driver
    seatedFigure(b, pickShirt(body), '#7a4a2c', 0, 0.98, 0.3);
    return b.merge();
  });
}

const SHIRTS = ['#f5f5f5', '#9ec5e8', '#e8d28e', '#b0473f', '#3e6fa8', '#7aa86b', '#e3a1b3', '#d7c4a3'];
function pickShirt(seed) { let h = 0; for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) | 0; return SHIRTS[Math.abs(h) % SHIRTS.length]; }

function seatedFigure(b, shirt, skin, x, seatY, z) {
  b.box(0.42, 0.58, 0.26, shirt, x, seatY + 0.42, z - 0.05);
  b.add(new THREE.SphereGeometry(0.13, 12, 10), skin, x, seatY + 0.86, z - 0.03);
  b.add(new THREE.SphereGeometry(0.135, 12, 8), '#141010', x, seatY + 0.92, z - 0.06, 0, 0, 0, 1, 0.6, 1);
  b.box(0.36, 0.14, 0.5, '#efeadf', x, seatY + 0.1, z + 0.2);       // mundu over thighs
  for (const sx of [-0.27, 0.27]) b.box(0.09, 0.45, 0.09, shirt, x + sx, seatY + 0.48, z + 0.18, -1.1, 0, 0);
}

// The name every Kerala auto wears on its back canopy, plus its KL number plate.
export const AUTO_NAMES = ['അമ്മ', 'ദൈവ സഹായം', 'ഗുരുവായൂരപ്പൻ', 'അപ്പു', 'മാതാവ്', 'ശ്രീ ഭദ്ര', 'കൂട്ടുകാരൻ', 'ബിസ്മില്ല', 'അച്ഛൻ', 'മോളൂട്ടി'];
const decalCache = new Map();
function decal(key, draw, w, h) {
  if (!decalCache.has(key)) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    decalCache.set(key, new THREE.MeshStandardMaterial({ map: t, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -2 }));
  }
  return decalCache.get(key);
}
export function autoBackDecals(name, plate) {
  const g = new THREE.Group();
  // a phrase with a comma is painted on two lines ("ചുംബിക്കല്ലേ മുത്തേ, / വാടകക്ക് ആണ്")
  const lines = name.split(/,\s*/);
  const two = lines.length > 1;
  const nameMat = decal(`n${name}`, (x, w, h) => {
    x.fillStyle = '#121212'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#ffd23f'; x.textAlign = 'center'; x.textBaseline = 'middle';
    if (two) {
      x.font = `700 ${h * 0.34}px ${FONT_PAINT}`;
      x.fillText(lines[0] + ',', w / 2, h * 0.3, w - 24);
      x.fillStyle = '#ffffff'; x.fillText(lines[1], w / 2, h * 0.7, w - 24);
    } else {
      x.font = `700 ${h * 0.62}px ${FONT_PAINT}`; x.fillText(name, w / 2, h * 0.55, w - 20);
    }
    x.strokeStyle = '#e53935'; x.lineWidth = 4; x.beginPath(); x.moveTo(20, h - 7); x.lineTo(w - 20, h - 7); x.stroke();
  }, 640, two ? 220 : 128);
  nameMat.userData.noDust = two;   // keep the driver's own slogan crisp and readable
  const plateMat = decal(`p${plate}`, (x, w, h) => {
    x.fillStyle = '#f4f4f0'; x.fillRect(0, 0, w, h);
    x.strokeStyle = '#111'; x.lineWidth = 5; x.strokeRect(4, 4, w - 8, h - 8);
    x.fillStyle = '#111'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.font = `800 ${h * 0.56}px "Baloo Chettan 2", sans-serif`; x.fillText(plate, w / 2, h * 0.56, w - 16);
  }, 256, 96);
  const n = new THREE.Mesh(new THREE.PlaneGeometry(two ? 1.18 : 0.95, two ? 0.4 : 0.24), nameMat);
  n.position.set(0, two ? 1.24 : 1.27, -1.33); n.rotation.y = Math.PI;
  const p = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.16), plateMat);
  p.position.set(0, 0.76, -1.215); p.rotation.y = Math.PI;
  g.add(n, p);
  return g;
}
// Private buses carry a painted name on both sides and the front board
export const BUS_NAMES = ['സെന്റ് ജോർജ്', 'ലക്ഷ്മി', 'ദേവമാതാ', 'കിങ്ങിണി', 'അൽ-അമീൻ', 'ശ്രീ മുരുകൻ', 'ജനത', 'മാളിയേക്കൽ'];
export function busDecals(name, cols, gov) {
  const g = new THREE.Group();
  const side = decal(`bs${name}${cols[0]}`, (x, w, h) => {
    x.fillStyle = cols[0]; x.fillRect(0, 0, w, h);
    x.fillStyle = cols[1]; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.font = `700 ${h * 0.7}px ${FONT_PAINT}`; x.lineJoin = 'round'; x.lineWidth = 8; x.strokeStyle = 'rgba(0,0,0,.55)';
    x.strokeText(name, w / 2, h * 0.55, w - 30); x.fillText(name, w / 2, h * 0.55, w - 30);
  }, 768, 128);
  for (const s of [-1, 1]) { const m = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 0.62), side); m.position.set(s * 1.265, 1.55, 0.6); m.rotation.y = s * Math.PI / 2; g.add(m); }
  const board = decal(`bf${name}${gov}`, (x, w, h) => {
    x.fillStyle = '#111'; x.fillRect(0, 0, w, h); x.fillStyle = gov ? '#ffcf3a' : '#ff6b3a'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.font = `700 ${h * 0.6}px "Anek Malayalam", sans-serif`; x.fillText(gov ? 'വൈറ്റില — ആലുവ' : 'കലൂർ · ഫോർട്ട് കൊച്ചി', w / 2, h * 0.55, w - 16);
  }, 512, 96);
  const fb = new THREE.Mesh(new THREE.PlaneGeometry(1.85, 0.3), board); fb.position.set(0, 2.88, 5.035); g.add(fb);
  return g;
}

export const randomPlate = (r = Math.random) => `KL ${String(1 + Math.floor(r() * 70)).padStart(2, '0')} ${String.fromCharCode(65 + Math.floor(r() * 26))}${String.fromCharCode(65 + Math.floor(r() * 26))} ${1000 + Math.floor(r() * 9000)}`;

// Player auto: separate meshes so we can spin wheels, steer, and see through the windscreen.
export function makePlayerAuto() {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const b = new Bucket();
  autoBody(b, '#f4c20d', '#151515', false);
  // nameplate "ഓട്ടം" painted on the visor would be nice; keep the geometry simple
  const bodyMesh = b.mesh(vcMat);
  body.add(bodyMesh);

  const glass = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.6, 0.02),
    new THREE.MeshStandardMaterial({ color: '#bcd6e6', transparent: true, opacity: 0.22, roughness: 0.05, metalness: 0.3, depthWrite: false }));
  glass.position.set(0, 1.6, 1.0); glass.rotation.x = -0.12;
  body.add(glass);

  const wb = new Bucket();
  wheel(wb, 0, 0, 0);
  const wGeo = wb.merge();
  const mkWheel = (x, z) => { const m = new THREE.Mesh(wGeo, vcMat); m.position.set(x, 0.27, z); m.castShadow = true; return m; };
  const frontPivot = new THREE.Group(); frontPivot.position.set(0, 0, 1.2);
  const fw = mkWheel(0, 0); frontPivot.add(fw);
  const rl = mkWheel(-0.62, -0.72), rr = mkWheel(0.62, -0.72);
  root.add(frontPivot, rl, rr);

  body.add(autoBackDecals('ചുംബിക്കല്ലേ മുത്തേ, വാടകക്ക് ആണ്', 'KL 07 AU 4321'));
  // the driver's own touches: dashboard deity, rosary from the mirror, rolled side curtains, stickers
  const extra = new Bucket();
  extra.add(Cyl(0.05, 0.06, 0.04, 10), '#c99a2e', 0.32, 1.33, 0.93);
  extra.add(new THREE.SphereGeometry(0.035, 8, 6), '#d4a017', 0.32, 1.42, 0.93);
  extra.box(0.06, 0.08, 0.04, '#e0a020', 0.32, 1.38, 0.93);
  extra.add(new THREE.SphereGeometry(0.02, 6, 4), '#ff6f00', 0.29, 1.47, 0.95);                       // marigold
  extra.box(0.2, 0.06, 0.03, '#222', -0.25, 1.88, 0.98);                                               // mirror
  for (let k = 0; k < 9; k++) extra.add(new THREE.SphereGeometry(0.012, 5, 4), '#7b3f00', -0.25 + Math.sin(k / 8 * Math.PI) * 0.05, 1.84 - k * 0.022, 0.97);
  extra.box(0.03, 0.05, 0.01, '#c99a2e', -0.25, 1.62, 0.97);
  for (const sx of [-0.71, 0.71]) {
    extra.add(Cyl(0.06, 0.06, 1.1, 8), '#b71c1c', sx, 1.94, 0.45, Math.PI / 2, 0, 0);                  // rolled-up curtain
    for (let k = 0; k < 5; k++) extra.box(0.005, 0.12, 0.1, k % 2 ? '#f4c20d' : '#1b5e20', sx * 1.006, 1.92, 0.05 + k * 0.2);
  }
  const extraMesh = extra.mesh(vcMat); body.add(extraMesh);
  const stickers = decal('stk', (x, w, h) => {
    x.fillStyle = '#f4c20d'; x.fillRect(0, 0, w, h); x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillStyle = '#c62828'; x.font = `700 ${h * 0.34}px ${FONT_PAINT}`; x.fillText('അമ്മയുടെ അനുഗ്രഹം', w / 2, h * 0.3, w - 10);
    x.fillStyle = '#111'; x.font = `800 ${h * 0.24}px "Baloo Chettan 2", sans-serif`; x.fillText('NO PARKING · ONLY HORN OK', w / 2, h * 0.72, w - 10);
  }, 512, 160);
  for (const s of [-1, 1]) { const st = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.28), stickers); st.position.set(s * 0.665, 0.82, -0.55); st.rotation.y = s * Math.PI / 2; body.add(st); }

  const db = new Bucket();
  seatedFigure(db, '#9ec5e8', '#7a4a2c', 0, 0.98, 0.3);
  const driver = db.mesh(vcMat);     // box driver: only used if the rigged characters fail to load
  body.add(driver);

  // amber indicators at the four corners (side: +1 = the auto's left, −1 = its right)
  const indicators = {};
  for (const side of [1, -1]) {
    const mat = new THREE.MeshStandardMaterial({ color: '#7a4a00', emissive: '#ffa000', emissiveIntensity: 0, roughness: 0.4 });
    indicators[side > 0 ? 'left' : 'right'] = mat;
    for (const [x, y, z, w, d] of [[side * 0.6, 0.78, -1.36, 0.12, 0.05], [side * 0.5, 1.02, 1.47, 0.1, 0.05]]) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.07, d), mat);
      m.position.set(x, y, z); body.add(m);
    }
  }

  // a single, slightly yellow halogen lamp: soft-edged cone, falls off over ~30 m
  const headlight = new THREE.SpotLight('#ffe2a8', 0, 32, 0.62, 0.85, 1.6);
  headlight.position.set(0, 1.08, 1.5);
  headlight.target.position.set(0, 0, 12);
  body.add(headlight, headlight.target);

  return { root, body, frontPivot, wheels: [fw, rl, rr], driver, glass, headlight, indicators, seat: new THREE.Vector3(0.22, 0.2, -0.66), seatY: 0.62 };
}

// ---------- Other vehicles ----------
export function carGeometry(color) {
  return cached(`car${color}`, () => {
    const b = new Bucket();
    b.box(1.72, 0.62, 3.9, color, 0, 0.62, 0);
    b.box(1.54, 0.58, 2.0, color, 0, 1.2, -0.25);
    b.box(1.42, 0.46, 0.06, '#24323d', 0, 1.2, 0.77, -0.35, 0, 0);
    b.box(1.42, 0.42, 0.06, '#24323d', 0, 1.2, -1.27, 0.35, 0, 0);
    for (const sx of [-0.78, 0.78]) b.box(0.03, 0.36, 1.7, '#24323d', sx, 1.22, -0.25);
    b.box(1.76, 0.18, 0.12, '#2b2b2b', 0, 0.42, 1.95);
    b.box(1.76, 0.18, 0.12, '#2b2b2b', 0, 0.42, -1.95);
    for (const sx of [-0.56, 0.56]) {
      b.box(0.34, 0.12, 0.05, '#fff7dc', sx, 0.74, 1.95);
      b.box(0.3, 0.12, 0.05, '#b3121a', sx, 0.78, -1.95);
    }
    for (const sx of [-0.8, 0.8]) for (const sz of [-1.25, 1.25]) wheel(b, sx, 0.32, sz, 0.32, 0.22);
    return b.merge();
  });
}

export function busGeometry(base = '#b71c1c', stripe = '#f2c200', ksrtc = true) {
  return cached(`bus${base}${stripe}`, () => {
    const b = new Bucket();
    b.box(2.5, 2.45, 10, base, 0, 1.75, 0);
    b.box(2.52, 0.32, 10.02, stripe, 0, 1.18, 0);
    b.box(2.53, 0.85, 8.6, '#22303a', 0, 2.25, -0.3);
    b.box(2.2, 1.0, 0.05, '#22303a', 0, 2.2, 5.0);
    b.box(1.9, 0.32, 0.05, ksrtc ? '#111' : '#f5f5f5', 0, 2.88, 5.02);
    b.box(2.45, 0.14, 9.8, '#d9d6cf', 0, 3.03, 0);
    b.box(2.0, 0.5, 2.4, '#b9b5ac', 0, 3.25, -2);
    for (const sx of [-0.85, 0.85]) b.box(0.4, 0.18, 0.05, '#fff7dc', sx, 0.9, 5.02);
    for (const sx of [-1.1, 1.1]) for (const sz of [-3.2, 3.4]) wheel(b, sx, 0.5, sz, 0.5, 0.3);
    return b.merge();
  });
}

export function scooterGeometry(color, shirt) {
  return cached(`sc${color}${shirt}`, () => {
    const b = new Bucket();
    b.box(0.36, 0.42, 1.35, color, 0, 0.55, 0);
    b.box(0.34, 0.12, 0.6, '#1d1d1d', 0, 0.86, -0.2);
    b.box(0.12, 0.7, 0.12, color, 0, 0.95, 0.55);
    b.box(0.62, 0.05, 0.05, '#1d1d1d', 0, 1.3, 0.55);
    wheel(b, 0, 0.24, 0.6, 0.24, 0.1); wheel(b, 0, 0.24, -0.55, 0.24, 0.1);
    b.box(0.42, 0.6, 0.27, shirt, 0, 1.25, -0.15, -0.15, 0, 0);
    b.add(new THREE.SphereGeometry(0.17, 12, 10), pickHelmet(color), 0, 1.72, -0.08);
    b.box(0.14, 0.14, 0.5, '#2c2c34', -0.13, 0.95, 0.05);
    b.box(0.14, 0.14, 0.5, '#2c2c34', 0.13, 0.95, 0.05);
    for (const sx of [-0.24, 0.24]) b.box(0.08, 0.08, 0.6, shirt, sx, 1.35, 0.25, 0.4, 0, 0);
    return b.merge();
  });
}
const pickHelmet = (c) => (c.charCodeAt(2) % 2 ? '#e8e8e8' : '#1b1b1b');

// ---------- People ----------
const SKIN = ['#8d5a3b', '#a8704a', '#6e4429', '#b98058', '#7d4e30'];
const SAREE = ['#e7c560', '#c2185b', '#2e7d32', '#6a1b9a', '#f5f0e1', '#e65100', '#1565c0', '#00897b'];
const PANTS = ['#2b2b33', '#3e4a5c', '#5a4a3a', '#1f2a3a'];

const legGeo = (color) => cached(`leg${color}`, () => paint(new THREE.BoxGeometry(0.13, 0.8, 0.14).translate(0, -0.4, 0), color));
const armGeo = (color) => cached(`arm${color}`, () => paint(new THREE.BoxGeometry(0.1, 0.62, 0.1).translate(0, -0.31, 0), color));

// kinds: '' (random townsfolk), 'kid', 'nun', 'fisherwoman', 'police', 'paperboy'
export function makePerson(r = Math.random, kind = '') {
  if (!kind) { const k = r(); kind = k < 0.1 ? 'kid' : k < 0.14 ? 'nun' : k < 0.19 ? 'fisherwoman' : k < 0.22 ? 'paperboy' : ''; }
  const g = new THREE.Group();
  const skin = SKIN[Math.floor(r() * SKIN.length)];
  const female = kind === 'nun' || kind === 'fisherwoman' || (kind === 'kid' ? r() < 0.5 : kind ? false : r() < 0.42);
  if (humansReady()) return humanAdapter(createHuman(r, kind, female));
  const b = new Bucket();
  let legColor = skin, sleeve = skin, outfit;
  if (kind === 'nun') {
    outfit = '#f4f4f0';
    b.add(Cyl(0.2, 0.3, 1.0, 12), outfit, 0, 0.5, 0); b.box(0.42, 0.62, 0.26, outfit, 0, 1.2, 0);
    b.add(new THREE.SphereGeometry(0.16, 12, 8), '#f4f4f0', 0, 1.65, -0.02, 0, 0, 0, 1, 1.05, 1);   // veil
    b.box(0.3, 0.5, 0.08, '#f4f4f0', 0, 1.42, -0.14);
    b.box(0.04, 0.12, 0.02, '#222', 0, 1.25, 0.14); b.box(0.08, 0.03, 0.02, '#222', 0, 1.28, 0.14);  // cross
    sleeve = outfit;
  } else if (kind === 'police') {
    outfit = '#b49a6a';                                                          // khaki
    b.box(0.46, 0.62, 0.27, outfit, 0, 1.2, 0); b.box(0.48, 0.06, 0.29, '#3a2a1a', 0, 0.9, 0);
    b.add(Cyl(0.15, 0.15, 0.1, 12), '#efe9dc', 0, 1.78, 0); b.box(0.32, 0.03, 0.2, '#1a1a1a', 0, 1.74, 0.1);   // cap
    b.box(0.42, 0.06, 0.02, '#e0e0e0', 0, 1.0, 0.14);
    legColor = outfit; sleeve = outfit;
  } else if (female) {
    const saree = (outfit = SAREE[Math.floor(r() * SAREE.length)]);
    const blouse = SAREE[Math.floor(r() * SAREE.length)];
    b.add(Cyl(0.21, 0.3, 0.95, 12), saree, 0, 0.5, 0);
    b.box(0.4, 0.58, 0.24, blouse, 0, 1.2, 0);
    b.box(0.46, 0.68, 0.05, saree, 0.02, 1.18, 0.12, 0, 0, 0.45);   // pallu
    b.add(new THREE.SphereGeometry(0.085, 10, 8), '#120c0c', 0, 1.62, -0.14); // bun
    b.box(0.26, 0.3, 0.06, '#120c0c', 0, 1.5, -0.11);
    legColor = skin;
  } else {
    const shirt = (outfit = kind === 'kid' ? '#f6f6f2' : SHIRTS[Math.floor(r() * SHIRTS.length)]);
    b.box(0.44, 0.6, 0.25, shirt, 0, 1.2, 0);
    if (kind === 'kid') { b.box(0.38, 0.28, 0.24, '#1f2f5a', 0, 0.82, 0); b.box(0.34, 0.42, 0.18, '#c62828', 0, 1.22, -0.2); legColor = skin; }
    else if (kind === 'paperboy') { b.box(0.36, 0.2, 0.24, PANTS[1], 0, 0.86, 0); b.box(0.3, 0.12, 0.42, '#efeae0', 0.3, 1.1, 0.05); legColor = PANTS[1]; }
    else if (r() < 0.6) {
      const lungi = r() < 0.45;   // checked lungi or white mundu
      b.add(Cyl(0.2, 0.25, 0.72, 12), lungi ? ['#2f6fb3', '#1b5e20', '#8e244d', '#5d4037'][Math.floor(r() * 4)] : r() < 0.7 ? '#f3efe4' : '#d9c79e', 0, 0.55, 0);
      legColor = skin;
    } else {
      b.box(0.36, 0.2, 0.24, PANTS[0], 0, 0.86, 0);
      legColor = PANTS[Math.floor(r() * PANTS.length)];
    }
    b.box(0.11, 0.025, 0.02, '#120c0c', 0, 1.575, 0.125);             // mustache
    sleeve = r() < 0.5 ? shirt : skin;
  }
  b.add(new THREE.SphereGeometry(0.13, 12, 10), skin, 0, 1.62, 0);
  b.add(new THREE.SphereGeometry(0.137, 12, 8), r() < 0.15 ? '#9a9a9a' : '#120c0c', 0, 1.68, -0.02, 0, 0, 0, 1, 0.62, 1);
  const body = b.mesh(vcMat);
  g.add(body);

  const legL = new THREE.Mesh(legGeo(legColor), vcMat); legL.position.set(-0.1, 0.88, 0);
  const legR = new THREE.Mesh(legGeo(legColor), vcMat); legR.position.set(0.1, 0.88, 0);
  const armL = new THREE.Mesh(armGeo(sleeve), vcMat); armL.position.set(-0.28, 1.47, 0);
  const armR = new THREE.Mesh(armGeo(sleeve), vcMat); armR.position.set(0.28, 1.47, 0);
  for (const m of [legL, legR, armL, armR]) { m.castShadow = true; g.add(m); }

  let b2;
  const umbrella = new THREE.Mesh(umbrellaGeo(), vcMat);
  umbrella.position.set(0.18, 0, 0.05);
  umbrella.visible = false;
  g.add(umbrella);
  if (kind === 'fisherwoman') { b2 = new Bucket(); b2.add(Cyl(0.32, 0.2, 0.22, 14), '#8b6a3e', 0, 1.88, 0); for (let k = 0; k < 6; k++) b2.box(0.18, 0.04, 0.06, '#b8c4cc', Math.cos(k) * 0.15, 2.0, Math.sin(k) * 0.15, 0, k, 0); g.add(b2.mesh(vcMat)); armR.rotation.x = -2.9; }
  if (kind === 'kid') g.scale.setScalar(0.72);
  return { group: g, legL, legR, armL, armR, umbrella, female, outfit, kind };
}

const umbrellaGeo = () => cached('umb', () => {
  const b = new Bucket();
  b.add(new THREE.ConeGeometry(0.6, 0.28, 10), '#141414', 0, 2.1, 0);
  b.add(Cyl(0.015, 0.015, 0.9, 5), '#3a2a1a', 0, 1.65, 0);
  return b.merge();
});

// Rigged human behind the old box-person interface: limb fields are inert stand-ins,
// animation goes through p.anim.
function humanAdapter(h) {
  const dummy = () => new THREE.Object3D();
  const umbrella = { get visible() { return h.umb.visible; }, set visible(v) { h.umbrella(v); } };
  return { group: h.group, anim: h, legL: dummy(), legR: dummy(), armL: dummy(), armR: dummy(), umbrella, female: h.female, outfit: h.o.shirt, kind: h.kind };
}

export function poseWalk(p, phase, amt = 1) {
  if (p.anim) { p.anim.walk(amt > 0 ? (p.speed ?? 1.25) : 0); return; }
  const s = Math.sin(phase) * 0.55 * amt;
  p.legL.rotation.x = s; p.legR.rotation.x = -s;
  p.armL.rotation.x = -s * 0.8; p.armR.rotation.x = p.kind === 'fisherwoman' ? -2.9 : p.umbrella.visible ? -0.9 : s * 0.8;
}
export function poseSeated(p) {
  if (p.anim) { p.anim.sit(); return; }
  p.legL.rotation.x = p.legR.rotation.x = -1.45;
  p.armL.rotation.x = p.armR.rotation.x = -0.4;
  p.umbrella.visible = false;
}

// ---------- Coconut palm ----------
export function palmGeometry(variant = 0) {
  return cached(`palm${variant}`, () => {
    const b = new Bucket();
    // variant 3 is the tall one: eight trunk segments bending into a long curve, tall enough to show over roofs
    const tall = variant === 3, segs = tall ? 8 : 6;
    const lean = tall ? 0.05 : 0.06 + variant * 0.05;
    let x = 0, y = 0;
    for (let k = 0; k < segs; k++) {
      const nx = x + lean * (k + 1) * (tall ? 0.45 + k * 0.08 : 0.6);
      const ny = y + 1.65;
      b.add(Cyl(0.15 - k * 0.008, 0.2 - k * 0.008, 1.72, 7), k % 2 ? '#7b6650' : '#6e5a46', (x + nx) / 2, (y + ny) / 2, 0, 0, 0, -Math.atan2(nx - x, 1.65));
      x = nx; y = ny;
    }
    const frond = new THREE.BoxGeometry(0.5, 0.04, 3.9).translate(0, 0, 1.95);
    const leaflet = new THREE.BoxGeometry(1.3, 0.02, 3.2).translate(0, 0, 2.1);
    for (let f = 0; f < 11; f++) {
      const a = (f / 11) * Math.PI * 2 + variant;
      const droop = 0.25 + (f % 3) * 0.18;
      const col = f % 2 ? '#3d7a2a' : '#4c8a30';
      b.add(frond, '#5b7a2a', x, y, 0, droop, a, 0, 1, 1, 1, 'YXZ');
      b.add(leaflet, col, x, y - 0.05, 0, droop + 0.12, a, 0, 1, 1, 1, 'YXZ');
    }
    for (let c = 0; c < 5; c++) {
      const a = (c / 5) * Math.PI * 2;
      b.add(new THREE.SphereGeometry(0.17, 8, 6), '#7a6a20', x + Math.cos(a) * 0.25, y - 0.35, Math.sin(a) * 0.25);
    }
    return b.merge();
  });
}

export function bananaGeometry() {
  return cached('banana', () => {
    const b = new Bucket();
    b.add(Cyl(0.12, 0.16, 2.2, 7), '#6f8a3a', 0, 1.1, 0);
    const leaf = new THREE.BoxGeometry(0.7, 0.02, 2.2).translate(0, 0, 1.1);
    for (let f = 0; f < 7; f++) b.add(leaf, f % 2 ? '#5e9e34' : '#6fb040', 0, 2.1, 0, 0.5 + (f % 2) * 0.3, (f / 7) * Math.PI * 2, 0, 1, 1, 1, 'YXZ');
    return b.merge();
  });
}

export function houseboatGeometry() {
  return cached('hb', () => {
    const b = new Bucket();
    b.box(3.4, 1.0, 14, '#4a2e1a', 0, 0.2, 0);
    for (const s of [-1, 1]) b.add(new THREE.ConeGeometry(1.7, 3.6, 4), '#4a2e1a', 0, 0.35, s * 8.6, s * Math.PI / 2, Math.PI / 4, 0, 1, 1, 0.45);
    b.add(new THREE.CylinderGeometry(1.75, 1.75, 11, 14, 1, true, -Math.PI / 2, Math.PI), '#c9a86a', 0, 0.75, 0, -Math.PI / 2, 0, 0);
    b.box(3.0, 0.6, 11, '#3a2414', 0, 1.0, 0);
    b.box(0.08, 0.08, 15, '#2a1a0c', 0, 0.75, 0);
    return b.merge();
  });
}

// ======================= more of Kerala =======================
const E = (rx, ry, rz) => new THREE.SphereGeometry(1, 14, 10).scale(rx, ry, rz);

// Caparisoned temple elephant with mahout, golden nettipattam and a muthukuda (parasol). Forward = +z.
export function elephantGeometry(parasol = '#d81b60') {
  return cached(`ele${parasol}`, () => {
    const b = new Bucket(), g = '#4a4644', gd = '#3c3836';
    b.add(E(1.05, 1.15, 1.75), g, 0, 2.15, -0.1);
    b.add(E(0.75, 0.85, 0.75), g, 0, 2.65, 1.55);                              // head
    for (const s of [-1, 1]) b.add(E(0.08, 0.7, 0.6), gd, s * 0.72, 2.5, 1.35, 0, s * 0.35, 0);   // ears
    for (let k = 0; k < 6; k++) b.add(Cyl(0.22 - k * 0.025, 0.24 - k * 0.025, 0.42, 10), g, 0, 2.2 - k * 0.32, 2.15 + Math.sin(k * 0.4) * 0.15, 0.15 * k, 0, 0); // trunk
    for (const s of [-1, 1]) b.add(Cyl(0.03, 0.07, 0.7, 8), '#f1ead8', s * 0.32, 1.95, 2.05, -1.1, 0, 0);                      // tusks
    for (const [sx, sz] of [[-0.55, 0.9], [0.55, 0.9], [-0.55, -0.95], [0.55, -0.95]]) b.add(Cyl(0.3, 0.32, 1.5, 10), g, sx, 0.75, sz);
    b.add(Cyl(0.04, 0.06, 0.9, 6), gd, 0, 1.9, -1.85, 0.6, 0, 0);
    // nettipattam: golden caparison down the forehead and trunk
    b.add(new THREE.ConeGeometry(0.62, 1.7, 4), '#d4a017', 0, 2.55, 2.12, -0.15 + Math.PI, Math.PI / 4, 0, 1, 1, 0.18);
    for (let k = 0; k < 9; k++) b.add(new THREE.SphereGeometry(0.06, 6, 5), k % 2 ? '#c62828' : '#f2c94c', (k % 3 - 1) * 0.25, 2.2 + Math.floor(k / 3) * 0.35, 2.28);
    b.box(1.5, 0.06, 1.6, '#b71c1c', 0, 3.27, -0.2);                           // red cloth
    b.box(1.55, 0.6, 0.06, '#d4a017', 0, 2.95, 0.6);
    // mahout + priest with the parasol
    b.box(0.4, 0.55, 0.26, '#f3efe4', 0, 3.6, 1.0); b.add(new THREE.SphereGeometry(0.13, 10, 8), '#7d4e30', 0, 4.0, 1.0);
    b.box(0.42, 0.6, 0.28, '#f3efe4', 0, 3.62, -0.35); b.add(new THREE.SphereGeometry(0.13, 10, 8), '#8d5a3b', 0, 4.04, -0.35);
    b.add(Cyl(0.025, 0.025, 1.6, 6), '#c99a2e', 0, 4.5, -0.35);
    b.add(new THREE.ConeGeometry(0.75, 0.4, 16), parasol, 0, 5.35, -0.35);
    for (let k = 0; k < 16; k++) { const a = (k / 16) * Math.PI * 2; b.add(new THREE.SphereGeometry(0.06, 5, 4), '#f2c94c', Math.cos(a) * 0.72, 5.1, -0.35 + Math.sin(a) * 0.72); }
    return b.merge();
  });
}

export function cowGeometry(color = '#e8e2d6') {
  return cached(`cow${color}`, () => {
    const b = new Bucket();
    b.add(E(0.45, 0.48, 0.95), color, 0, 1.0, 0);
    b.add(E(0.22, 0.25, 0.36), color, 0, 1.15, 1.05, -0.4, 0, 0);
    b.add(E(0.18, 0.22, 0.25), color, 0, 1.25, 0.25);                                     // hump
    for (const s of [-1, 1]) { b.add(Cyl(0.02, 0.04, 0.32, 6), '#d8cfbf', s * 0.12, 1.38, 1.0, 0, 0, s * 0.6); b.add(E(0.1, 0.04, 0.06), color, s * 0.24, 1.2, 0.96); }
    for (const [sx, sz] of [[-0.25, 0.55], [0.25, 0.55], [-0.25, -0.55], [0.25, -0.55]]) b.add(Cyl(0.07, 0.06, 0.75, 6), color, sx, 0.38, sz);
    b.add(Cyl(0.02, 0.02, 0.6, 5), color, 0, 0.85, -0.95, 0.3, 0, 0);
    return b.merge();
  });
}

export function dogGeometry(color = '#b08458') {
  return cached(`dog${color}`, () => {
    const b = new Bucket();
    b.add(E(0.16, 0.17, 0.38), color, 0, 0.45, 0);
    b.add(E(0.12, 0.12, 0.16), color, 0, 0.62, 0.38);
    b.add(E(0.05, 0.05, 0.1), '#2a1d14', 0, 0.6, 0.53);
    for (const s of [-1, 1]) b.add(new THREE.ConeGeometry(0.05, 0.12, 4), color, s * 0.07, 0.75, 0.36);
    for (const [sx, sz] of [[-0.09, 0.22], [0.09, 0.22], [-0.09, -0.22], [0.09, -0.22]]) b.add(Cyl(0.03, 0.03, 0.34, 5), color, sx, 0.17, sz);
    b.add(Cyl(0.02, 0.03, 0.3, 5), color, 0, 0.55, -0.42, -0.8, 0, 0);
    return b.merge();
  });
}

// Fish vendor on a bicycle with a blue fish box on the carrier
export function fishCycleGeometry() {
  return cached('fishcycle', () => {
    const b = new Bucket();
    for (const z of [0.55, -0.55]) { b.add(new THREE.TorusGeometry(0.33, 0.03, 6, 18), '#111', 0, 0.35, z, 0, Math.PI / 2, 0); }
    b.box(0.05, 0.05, 1.0, '#1b3a6b', 0, 0.7, 0, 0.1, 0, 0);
    b.box(0.05, 0.5, 0.05, '#1b3a6b', 0, 0.55, -0.15);
    b.box(0.5, 0.04, 0.04, '#222', 0, 1.0, 0.5);
    b.box(0.62, 0.4, 0.55, '#1e6fd9', 0, 0.95, -0.65);                        // fish box
    b.box(0.64, 0.05, 0.57, '#f2f2f2', 0, 1.17, -0.65);
    b.box(0.4, 0.55, 0.24, '#f3efe4', 0, 1.35, -0.05, -0.2, 0, 0);
    b.box(0.36, 0.18, 0.45, '#2f6fb3', 0, 0.98, 0.05);                        // checked lungi folded up
    b.add(new THREE.SphereGeometry(0.13, 10, 8), '#6e4429', 0, 1.78, 0.02);
    b.box(0.32, 0.05, 0.32, '#f2f2f2', 0, 1.9, 0.02);                         // towel on head
    for (const s of [-1, 1]) b.box(0.08, 0.08, 0.55, '#6e4429', s * 0.2, 1.3, 0.25, 0.5, 0, 0);
    b.add(new THREE.SphereGeometry(0.06, 8, 6), '#111', 0.25, 1.05, 0.55);     // bulb horn
    return b.merge();
  });
}

// Ambassador-style taxi: rounded bonnet and boot, black & yellow
export function ambassadorGeometry(body = '#f4f1e8') {
  return cached(`amb${body}`, () => {
    const b = new Bucket();
    b.add(E(0.85, 0.42, 2.1), body, 0, 0.72, 0);
    b.box(1.66, 0.5, 2.6, body, 0, 0.72, 0);
    b.add(E(0.78, 0.45, 1.05), body, 0, 1.15, -0.2);
    b.box(1.5, 0.42, 1.7, '#24323d', 0, 1.2, -0.2);
    b.box(1.56, 0.08, 1.74, body, 0, 1.43, -0.2);
    b.box(0.6, 0.2, 0.25, '#f2c200', 0, 1.6, -0.1);                            // TAXI roof light
    b.box(1.0, 0.2, 0.06, '#c0c0c0', 0, 0.55, 2.1);                           // chrome grille
    for (const sx of [-0.55, 0.55]) b.add(Cyl(0.13, 0.13, 0.06, 12), '#fff7dc', sx, 0.78, 2.07, Math.PI / 2, 0, 0);
    for (const sx of [-0.8, 0.8]) for (const sz of [-1.3, 1.3]) wheel(b, sx, 0.33, sz, 0.33, 0.22);
    return b.merge();
  });
}

// Small open tempo / goods carrier
export function tempoGeometry(cab = '#1565c0') {
  return cached(`tempo${cab}`, () => {
    const b = new Bucket();
    b.box(1.8, 1.4, 1.5, cab, 0, 1.25, 1.7);
    b.box(1.7, 0.55, 0.05, '#24323d', 0, 1.6, 2.46);
    b.box(1.9, 0.15, 3.3, '#3b3b3b', 0, 0.62, -0.7);
    for (const s of [-1, 1]) b.box(0.06, 0.55, 3.3, '#6d4c2f', s * 0.93, 0.95, -0.7);
    b.box(1.9, 0.55, 0.06, '#6d4c2f', 0, 0.95, -2.35);
    for (let k = 0; k < 6; k++) b.box(0.55, 0.4, 0.75, k % 2 ? '#d8c9a3' : '#cbb88d', (k % 2 ? 0.4 : -0.4), 0.95, -0.2 - Math.floor(k / 2) * 0.8);   // sacks
    for (const sx of [-0.85, 0.85]) for (const sz of [-1.6, 1.5]) wheel(b, sx, 0.36, sz, 0.36, 0.25);
    return b.merge();
  });
}

// Goods auto: auto front with a flat cargo tray at the back
export function goodsAutoGeometry() {
  return cached('goodsauto', () => {
    const b = new Bucket();
    b.box(1.2, 0.18, 2.6, '#202020', 0, 0.42, -0.3);
    b.add(new THREE.CylinderGeometry(0.55, 0.5, 0.82, 18, 1, false, -Math.PI / 2, Math.PI), '#f4c20d', 0, 0.89, 0.95);
    b.box(1.1, 0.82, 0.06, '#f4c20d', 0, 0.89, 0.95);
    b.box(1.3, 1.1, 0.9, '#f4c20d', 0, 1.15, 0.45);
    b.box(1.34, 0.07, 1.0, '#111', 0, 1.74, 0.45);
    b.box(1.0, 0.5, 0.03, '#8fb1c4', 0, 1.4, 0.95);
    b.box(1.45, 0.08, 1.7, '#5d4037', 0, 0.62, -1.0);
    for (const s of [-1, 1]) b.box(0.05, 0.4, 1.7, '#5d4037', s * 0.72, 0.82, -1.0);
    b.box(1.0, 0.45, 0.6, '#90caf9', 0, 0.9, -0.9);                            // gas cylinders / crates
    b.box(0.6, 0.35, 0.5, '#e0e0e0', 0.2, 1.3, -1.2);
    wheel(b, 0, 0.27, 1.2); wheel(b, -0.66, 0.27, -1.2); wheel(b, 0.66, 0.27, -1.2);
    seatedFigure(b, '#9ec5e8', '#7a4a2c', 0, 0.98, 0.45);
    return b.merge();
  });
}

export function schoolVanGeometry() {
  return cached('schoolvan', () => {
    const b = new Bucket();
    b.box(1.75, 1.6, 4.3, '#f2c200', 0, 1.15, 0);
    b.box(1.77, 0.55, 3.0, '#24323d', 0, 1.55, -0.4);
    b.box(1.6, 0.6, 0.05, '#24323d', 0, 1.5, 2.16, -0.2, 0, 0);
    b.box(1.78, 0.18, 4.32, '#6d4c2f', 0, 0.9, 0);
    b.box(1.2, 0.28, 0.05, '#ffffff', 0, 2.05, 2.16);
    for (const sx of [-0.8, 0.8]) for (const sz of [-1.4, 1.4]) wheel(b, sx, 0.34, sz, 0.34, 0.22);
    return b.merge();
  });
}

// Election announcement jeep: open jeep with loudspeaker horns and party flags
export function jeepGeometry(col = '#c8102e') {
  return cached(`jeep${col}`, () => {
    const b = new Bucket();
    b.box(1.65, 0.7, 3.6, '#e8e4d8', 0, 0.85, 0);
    b.box(1.55, 0.06, 1.4, '#e8e4d8', 0, 1.9, -0.6);
    for (const [sx, sz] of [[-0.75, 0.1], [0.75, 0.1], [-0.75, -1.3], [0.75, -1.3]]) b.box(0.06, 0.8, 0.06, '#333', sx, 1.5, sz);
    b.box(1.5, 0.5, 0.05, '#24323d', 0, 1.45, 0.75, -0.3, 0, 0);
    for (const s of [-1, 1]) b.add(new THREE.CylinderGeometry(0.28, 0.06, 0.6, 12, 1, true), '#d8d8d8', s * 0.3, 2.25, -0.6, Math.PI / 2 - 0.2, 0, 0);
    b.box(1.6, 0.5, 0.05, col, 0, 1.15, -1.82);                                // party banner on the back
    b.box(0.05, 0.5, 2.6, col, -0.84, 1.1, -0.4); b.box(0.05, 0.5, 2.6, col, 0.84, 1.1, -0.4);
    for (const s of [-1, 1]) { b.box(0.03, 1.4, 0.03, '#ccc', s * 0.78, 2.3, 1.2); b.box(0.02, 0.35, 0.5, col, s * 0.78, 2.8, 0.95); }
    for (const sx of [-0.78, 0.78]) for (const sz of [-1.15, 1.15]) wheel(b, sx, 0.38, sz, 0.38, 0.26);
    return b.merge();
  });
}

// Private bus "conductor hanging out of the door" (added to private bus meshes)
export function conductorGeometry() {
  return cached('conductor', () => {
    const b = new Bucket();
    b.box(0.4, 0.6, 0.26, '#6d8bb5', 0, 1.45, 0, 0, 0, -0.35);
    b.add(new THREE.SphereGeometry(0.13, 10, 8), '#7a4a2c', -0.2, 1.9, 0);
    b.box(0.3, 0.75, 0.22, '#2b2b33', 0.05, 0.85, 0);
    b.box(0.09, 0.6, 0.09, '#7a4a2c', 0.2, 1.75, 0, 0, 0, 0.4);                // arm holding the rail
    b.box(0.09, 0.55, 0.09, '#7a4a2c', -0.35, 1.45, 0.05, 0, 0, -1.1);         // other arm waving
    b.box(0.12, 0.2, 0.22, '#8b5e3c', -0.05, 1.15, 0.15);                      // leather cash bag
    return b.merge();
  });
}

// Shade trees: jackfruit (fruit on the trunk) and mango (dense dark dome)
export function shadeTreeGeometry(kind) {
  return cached(`tree${kind}`, () => {
    const b = new Bucket();
    const trunk = kind === 'jack' ? '#5b4636' : '#4d3b2c';
    b.add(Cyl(0.32, 0.45, 4, 9), trunk, 0, 2, 0);
    for (let k = 0; k < 4; k++) b.add(Cyl(0.08, 0.16, 2.2, 6), trunk, Math.cos(k * 1.6) * 0.7, 4.2, Math.sin(k * 1.6) * 0.7, Math.sin(k * 1.6) * 0.5, 0, -Math.cos(k * 1.6) * 0.5);
    const leaf = kind === 'jack' ? ['#2f5d23', '#3a6b2a'] : ['#1f4a1d', '#285824'];
    for (let k = 0; k < 9; k++) {
      const a = k * 2.3, r = k === 0 ? 0 : 1.6 + (k % 3) * 0.5;
      b.add(new THREE.IcosahedronGeometry(1, 1), leaf[k % 2], Math.cos(a) * r, 5.4 + (k % 3) * 0.6 + (k === 0 ? 1 : 0), Math.sin(a) * r, 0, 0, 0, 2.0, 1.5, 2.0);
    }
    if (kind === 'jack') for (let k = 0; k < 6; k++) b.add(E(0.22, 0.34, 0.22), '#7f9a2c', Math.cos(k * 2.1) * 0.42, 1.6 + k * 0.45, Math.sin(k * 2.1) * 0.42);
    else for (let k = 0; k < 10; k++) b.add(E(0.08, 0.11, 0.08), '#e0a81e', Math.cos(k * 1.9) * 2.1, 4.6 + (k % 3) * 0.3, Math.sin(k * 1.9) * 2.1);
    return b.merge();
  });
}

// Hibiscus / jasmine bush
export function bushGeometry(flower = '#d81b2c') {
  return cached(`bush${flower}`, () => {
    const b = new Bucket();
    for (let k = 0; k < 5; k++) b.add(new THREE.IcosahedronGeometry(0.55, 1), k % 2 ? '#2f6b26' : '#3b7a2e', Math.cos(k * 1.3) * 0.45, 0.55 + (k % 2) * 0.3, Math.sin(k * 1.3) * 0.45);
    for (let k = 0; k < 16; k++) { const a = k * 2.4; b.add(new THREE.SphereGeometry(0.08, 6, 5), flower, Math.cos(a) * 0.85, 0.5 + (k % 4) * 0.22, Math.sin(a) * 0.85); }
    return b.merge();
  });
}

// ---------- The two "daddy will save me" cars (forward = +z) ----------
function sportWheel(b, x, y, z, r, w, rim, caliper) {
  b.add(Cyl(r, r, w, 18), '#121212', x, y, z, 0, 0, Math.PI / 2);                 // tyre
  b.add(Cyl(r * 0.68, r * 0.68, w + 0.02, 14), rim, x, y, z, 0, 0, Math.PI / 2);  // rim face
  const out = Math.sign(x) * (w / 2 + 0.012);
  for (let k = 0; k < 5; k++) {                                                    // spokes
    const a = (k / 5) * Math.PI * 2;
    b.box(0.012, r * 1.18, 0.05, rim === '#1c1c1c' ? '#2a2a2a' : '#e2e5e8', x + out, y, z, a, 0, 0);
  }
  if (caliper) b.box(0.05, r * 0.42, r * 0.3, caliper, x + out * 0.4, y + r * 0.22, z - r * 0.25);
}

// A JCW-style Mini Countryman: gunmetal body, red roof and C-pillar flash, red mirror caps, blacked-out
// "floating roof" glass, round lamps, black cladding and black wheels with red calipers.
export function miniGeometry() {
  return cached('mini', () => {
    const b = new Bucket();
    const body = '#5a6067', red = '#e0242f', glass = '#1b2229', clad = '#161616';
    b.box(1.84, 0.6, 4.44, body, 0, 0.72, 0);                                       // body
    b.box(1.8, 0.14, 1.05, body, 0, 1.06, 1.66, 0.07, 0, 0);                      // bonnet, nose down a touch
    b.box(1.74, 0.52, 2.66, glass, 0, 1.32, -0.34);                                  // wrap-round glass
    b.box(1.6, 0.52, 0.06, glass, 0, 1.31, 1.04, -0.62, 0, 0);                       // windscreen
    b.box(1.5, 0.42, 0.06, glass, 0, 1.33, -1.74, 0.32, 0, 0);                      // tailgate glass
    b.box(1.78, 0.09, 2.74, red, 0, 1.6, -0.38);                                     // red roof
    for (const sx of [-0.62, 0.62]) b.box(0.05, 0.05, 2.2, '#0e0e0e', sx, 1.67, -0.36);  // roof rails
    for (const s of [-1, 1]) {
      b.box(0.04, 0.38, 0.5, red, s * 0.875, 1.33, -1.22);                          // red C-pillar flash
      b.box(0.16, 0.13, 0.2, red, s * 0.97, 1.16, 0.9);                             // red mirror caps
      b.box(0.05, 0.12, 2.3, clad, s * 0.92, 0.47, 0);                              // black sill
      for (const sz of [-1.35, 1.35]) b.box(0.06, 0.32, 1.0, clad, s * 0.925, 0.82, sz);   // wheel-arch cladding
      b.box(0.04, 0.03, 0.22, '#7c8288', s * 0.915, 0.98, 0.25);                    // door handles
      b.box(0.04, 0.03, 0.22, '#7c8288', s * 0.915, 0.98, -0.85);
      // round Mini lamps: a black ring and a bright lens
      b.add(Cyl(0.19, 0.19, 0.06, 18), '#111', s * 0.6, 0.97, 2.2, Math.PI / 2, 0, 0);
      b.add(Cyl(0.14, 0.14, 0.08, 18), '#fff6dc', s * 0.6, 0.97, 2.21, Math.PI / 2, 0, 0);
      b.box(0.05, 0.3, 0.06, red, s * 0.8, 0.6, 2.21);                              // JCW red bumper slats
      b.box(0.14, 0.4, 0.06, '#9c0f16', s * 0.7, 1.0, -2.22);                       // tall rear lamps
    }
    b.add(Cyl(0.32, 0.32, 0.06, 8), '#0d0d0d', 0, 0.68, 2.21, Math.PI / 2, Math.PI / 8, 0);   // octagonal grille
    b.box(0.5, 0.05, 0.07, red, 0, 0.74, 2.24);                                     // red grille bar
    b.box(1.86, 0.2, 0.12, clad, 0, 0.44, 2.2);                                    // front apron
    b.box(1.86, 0.22, 0.12, clad, 0, 0.46, -2.2);                                  // rear apron
    b.box(0.46, 0.13, 0.03, '#f2f2f2', 0, 0.62, -2.27);                              // plate
    for (const sx of [-0.87, 0.87]) for (const sz of [-1.346, 1.346]) sportWheel(b, sx, 0.37, sz, 0.37, 0.26, '#1c1c1c', red);
    return b.merge();
  });
}

// A black Mercedes E-Class saloon: long bonnet, chrome window line, star-studded grille with the
// ringed three-point star, slim angular headlamps and a wide tail-lamp band.
export function benzGeometry() {
  return cached('benz', () => {
    const b = new Bucket();
    const body = '#16181b', glass = '#1a2128', chrome = '#e4e7ea';
    b.box(1.88, 0.58, 4.94, body, 0, 0.68, 0);                                       // body
    b.box(1.8, 0.12, 1.65, body, 0, 0.99, 1.6, 0.05, 0, 0);                         // long bonnet
    b.box(1.76, 0.1, 0.95, body, 0, 1.0, -1.98, -0.04, 0, 0);                       // boot lid
    b.box(1.64, 0.4, 2.0, glass, 0, 1.16, -0.3);                                   // cabin glass, low and sleek
    b.box(1.56, 0.62, 0.06, glass, 0, 1.12, 1.0, -1.08, 0, 0);                      // steeply raked windscreen
    b.box(1.5, 0.56, 0.06, glass, 0, 1.12, -1.55, 1.05, 0, 0);                      // fastback rear window
    b.box(1.56, 0.07, 1.45, body, 0, 1.4, -0.3);                                    // roof (1.47 m tall)
    for (const s of [-1, 1]) {
      b.box(0.03, 0.03, 2.35, chrome, s * 0.84, 0.99, -0.3);                        // chrome window line
      b.box(0.03, 0.025, 1.6, chrome, s * 0.81, 1.37, -0.3);                        // roof-line chrome
      b.box(0.14, 0.12, 0.2, body, s * 0.97, 1.08, 0.75);                           // mirrors
      for (const sz of [0.35, -0.8]) b.box(0.04, 0.03, 0.2, chrome, s * 0.94, 0.9, sz);   // door handles
      b.box(0.44, 0.1, 0.06, '#eef3ff', s * 0.6, 0.86, 2.42, 0, s * -0.18, 0);      // slim headlamps
      b.box(0.5, 0.13, 0.06, '#9c0f16', s * 0.52, 0.9, -2.44);                      // tail-lamp band
      b.box(0.05, 0.05, 1.2, chrome, s * 0.93, 0.47, 0);                            // sill chrome
    }
    // grille: black panel, chrome frame, a field of little chrome stars, the emblem in the middle
    b.box(1.0, 0.36, 0.06, '#0a0a0a', 0, 0.72, 2.44);
    b.box(1.04, 0.03, 0.07, chrome, 0, 0.91, 2.45); b.box(1.04, 0.03, 0.07, chrome, 0, 0.53, 2.45);
    for (const sx of [-0.51, 0.51]) b.box(0.03, 0.4, 0.07, chrome, sx, 0.72, 2.45);
    for (let i = 0; i < 9; i++) for (let j = 0; j < 3; j++) {
      const x = -0.42 + i * 0.105, y = 0.62 + j * 0.1;
      if (Math.abs(x) < 0.16 && Math.abs(y - 0.72) < 0.14) continue;
      b.box(0.03, 0.03, 0.03, chrome, x, y, 2.48);
    }
    b.add(new THREE.TorusGeometry(0.11, 0.014, 6, 24), chrome, 0, 0.72, 2.49);
    for (let k = 0; k < 3; k++) b.box(0.016, 0.1, 0.02, chrome, 0, 0.72, 2.49, 0, 0, (k / 3) * Math.PI * 2).translate(Math.sin((k / 3) * Math.PI * 2) * -0.05, Math.cos((k / 3) * Math.PI * 2) * 0.05, 0);
    b.box(1.88, 0.2, 0.12, '#0a0a0a', 0, 0.45, 2.44);                               // front apron
    b.box(0.46, 0.13, 0.03, '#f2f2f2', 0, 0.6, -2.47);                              // plate
    for (const sx of [-0.88, 0.88]) for (const sz of [-1.48, 1.48]) sportWheel(b, sx, 0.35, sz, 0.35, 0.24, '#b8bcc0', null);
    return b.merge();
  });
}
