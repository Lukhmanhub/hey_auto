import * as THREE from 'three';
import {
  N, B, HALF, BOUND, ROAD_HALF, LANE, CANAL_ROW, SPEED_LIMIT, LANDMARKS, SIGNALS, ONE_WAY_ROWS, ONE_WAY_COLS,
  TOWN, TOWN_ML, gx, blockKind, hasFootpath, isWaterBlock, mulberry32, pick,
} from './config.js';
import { Bucket, wallBox, noiseTexture, signTexture, Colliders, FONT_ML, FONT_PAINT } from './util.js';
import { buildProps } from './props.js';
import { vcMat, palmGeometry, bananaGeometry, busGeometry, carGeometry, houseboatGeometry } from './models.js';
import { Posters, PosterPair } from './posters.js';
import { FILMS, POLITICAL, ADS, PARTIES, wallSlogan, paintedHotel } from './prints.js';
import { makeMaterials, TexBucket } from './materials.js';

const WALL_COLORS = ['#f2e6c9', '#e9d3a3', '#cfe3c0', '#f6c7b0', '#bfe0e8', '#f3e08a', '#e8b9c9', '#fbfaf5', '#d9e8a6', '#f5d0a0', '#c9d7f0'];
// tints over the Mangalore-tile texture: new, weathered, and moss-darkened tiles
const ROOF_COLORS = ['#ffffff', '#f2d9c8', '#e0bfa8', '#cfae98', '#c9b39a'];
const SHOP_SIGNS = [
  ['ചായക്കട', 'Tea Stall', '#1b5e20', '#ffffff'],
  ['ബേക്കറി', 'Bakery', '#e65100', '#ffffff'],
  ['മെഡിക്കൽസ്', 'Medicals', '#ffffff', '#0d47a1'],
  ['ടെക്സ്റ്റൈൽസ്', 'Textiles', '#6a1b9a', '#ffeb3b'],
  ['ഹോട്ടൽ', 'Hotel · Meals Ready', '#b71c1c', '#ffffff'],
  ['മൊബൈൽസ്', 'Mobiles', '#0d47a1', '#ffffff'],
  ['ജ്വല്ലറി', 'Jewellery', '#4a148c', '#ffd54f'],
  ['സ്റ്റോഴ്സ്', 'Stores', '#f9a825', '#212121'],
  ['ലോട്ടറി', 'Lottery Agency', '#ffeb3b', '#c62828'],
  ['ബാർബർ ഷോപ്പ്', 'Barber Shop', '#263238', '#ffffff'],
  ['ഫാൻസി', 'Fancy Store', '#ad1457', '#ffffff'],
  ['ഹാർഡ്‌വെയർ', 'Hardware', '#37474f', '#ffca28'],
  ['ബുക്ക് സ്റ്റാൾ', 'Book Stall', '#2e7d32', '#fffde7'],
  ['കൂൾബാർ', 'Cool Bar · Juice', '#00838f', '#ffffff'],
  ['റേഷൻ കട', 'Ration Shop · ARD 47', '#5d4037', '#fff8e1'],
  ['ഫോട്ടോസ്റ്റാറ്റ്', 'Photostat · DTP · Lamination', '#1a237e', '#ffffff'],
  ['ഇ-സേവ കേന്ദ്രം', 'e-Seva Centre · Certificates', '#00695c', '#ffffff'],
  ['ടെയ്‌ലേഴ്സ്', 'Tailors · Ladies & Gents', '#880e4f', '#ffffff'],
  ['ബേക്കറി & കൂൾബാർ', 'Bakery & Cool Bar', '#bf360c', '#fff3e0'],
];

// Hand-painted wall adverts (fictional businesses): Malayalam, English, small print, background, paint colour
const WALL_ADS = [
  ['അമ്പാടി സിൽക്സ്', 'AMBADI SILKS', 'Wedding sarees · Kasavu · Thekkumpuram', '#6a1b7a', '#ffd54f'],
  ['ശ്രീലക്ഷ്മി ജ്വല്ലേഴ്സ്', 'SREELAKSHMI JEWELLERS', '916 hallmark gold · Near KRTC', '#8e1b1b', '#ffe082'],
  ['പരിമളം അഗർബത്തി', 'PARIMALAM AGARBATHI', 'For every pooja room', '#1f5e2a', '#fff59d'],
  ['ഡോ. മേരീസ് ഡെന്റൽ ക്ലിനിക്', "DR. MARY'S DENTAL CLINIC", 'Ph 0484 2 345678 · Sunday closed', '#0d47a1', '#ffffff'],
  ['വിനായക ടൈൽസ്', 'VINAYAKA TILES & SANITARY', 'Mangalore tiles · Cement · Paint', '#c25400', '#ffffff'],
  ['കായൽ ഹോംസ്റ്റേ', 'KAYAL HOMESTAY', 'Backwater view · Kerala meals', '#00606a', '#e0f7fa'],
  ['ഭാഗ്യക്കുറി', 'LOTTERY · TODAY\'S DRAW', 'First prize ₹75 lakh', '#f2b600', '#9b1c1c'],
  ['അമ്മ ട്യൂഷൻ സെന്റർ', 'AMMA TUITION CENTRE', 'SSLC · Plus Two · Maths & Science', '#ffffff', '#1a3d6e'],
];
function paintedAdTexture(ml, en, sub, bg, fg) {
  const c = document.createElement('canvas'); c.width = 640; c.height = 330;
  const x = c.getContext('2d');
  let s = ml.length * 977; const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  x.fillStyle = bg; x.fillRect(0, 0, 640, 330);
  for (let i = 0; i < 2600; i++) { x.fillStyle = `rgba(255,255,255,${rnd() * 0.06})`; x.fillRect(rnd() * 640, rnd() * 330, 2 + rnd() * 8, 1 + rnd() * 2); }  // brush strokes
  x.strokeStyle = fg; x.lineWidth = 8; x.strokeRect(16, 16, 608, 298);
  x.fillStyle = fg; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.font = `700 86px ${FONT_PAINT}`; x.fillText(ml, 320, 112, 580);
  x.font = '800 40px "Baloo Chettan 2", sans-serif'; x.fillText(en, 320, 208, 580);
  x.font = '600 26px "Baloo Chettan 2", sans-serif'; x.globalAlpha = 0.85; x.fillText(sub, 320, 262, 560); x.globalAlpha = 1;
  // sun-bleaching and peeling paint
  x.fillStyle = 'rgba(240,232,215,0.22)'; x.fillRect(0, 0, 640, 330);
  for (let i = 0; i < 26; i++) { x.fillStyle = `rgba(235,228,214,${0.5 + rnd() * 0.4})`; x.beginPath(); x.ellipse(rnd() * 640, rnd() * 330, 4 + rnd() * 22, 2 + rnd() * 10, rnd() * 3, 0, 7); x.fill(); }
  const g = x.createLinearGradient(0, 200, 0, 330); g.addColorStop(0, 'rgba(60,50,30,0)'); g.addColorStop(1, 'rgba(60,50,30,0.3)');
  x.fillStyle = g; x.fillRect(0, 200, 640, 130);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

function canvasTex(draw, w, h) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

// unit hip roof: square base of side 1 on the axes, apex at +0.5
const hipRoof = new THREE.ConeGeometry(Math.SQRT1_2, 1, 4).rotateY(Math.PI / 4);

// Is (x, z) on (or within `margin` of) any road strip?
export function onRoad(x, z, margin = 0) {
  const lim = HALF + ROAD_HALF + margin;
  for (let k = 0; k <= N; k++) {
    if (Math.abs(x - gx(k)) < ROAD_HALF + margin && Math.abs(z) < lim) return true;
    if (Math.abs(z - gx(k)) < ROAD_HALF + margin && Math.abs(x) < lim) return true;
  }
  return false;
}

export function buildWorld(scene) {
  const rand = mulberry32(20261024);
  const prand = mulberry32(919);   // posters + compound walls get their own stream so the town layout stays put
  // every poster slot has a fictional print (default) and the player's real image (optional toggle)
  const posters = new PosterPair(new Posters({ sources: FILMS, cols: 4, cw: 320, ch: 448 }), new Posters());
  const politics = new PosterPair(new Posters({ sources: POLITICAL, cols: 3, cw: 384, ch: 480 }), new Posters({ dir: `${import.meta.env.BASE_URL}posters/political`, count: 7, cols: 4, cw: 384, ch: 480, fit: 'contain' }));
  const ads = new PosterPair(new Posters({ sources: ADS, cols: 5, cw: 384, ch: 480 }), new Posters({ dir: `${import.meta.env.BASE_URL}posters/real-ads`, count: 18, cols: 6, cw: 384, ch: 480, fit: 'contain' }));
  const bunting = new Bucket();
  const election = { bunting: new Bucket(), signs: new Map(), poles: new Bucket() };   // only shown in election season
  const shops = [];

  // Framed flex print standing proud of the wall (or on its own legs), so it reads clearly from the road.
  function flex(x, y, z, nx, nz, w, h, idx, legs = 0, set = prand() < 0.45 ? politics : ads) {
    const L = Math.hypot(nx, nz); nx /= L; nz /= L;
    const ry = Math.atan2(nx, nz);
    solid.add(new THREE.BoxGeometry(w + 0.18, h + 0.18, 0.08), '#1d1d1b', x + nx * 0.05, y, z + nz * 0.05, 0, ry, 0);
    set.add(x + nx * 0.1, y, z + nz * 0.1, nx, nz, w, h, idx ?? Math.floor(prand() * 997), false);
    if (legs) {
      const tx = -nz, tz = nx;
      for (const s of [-w * 0.36, w * 0.36]) {
        solid.add(new THREE.BoxGeometry(0.12, legs, 0.12), '#5b5b58', x + tx * s, legs / 2, z + tz * s, 0, ry, 0);
        col.addCentered(x + tx * s, z + tz * s, 0.25, 0.25, 'pole');
      }
    }
  }
  const col = new Colliders();
  const mats = makeMaterials();
  const roofs = new TexBucket(2.4);      // Mangalore tiles
  const lat = new TexBucket(1.2);        // laterite blocks
  const plas = new TexBucket(2.5);       // painted plaster
  const pave = new TexBucket(1.6);       // interlock footpath
  const walls = new Bucket();
  const solid = new Bucket();
  const flat = new Bucket();
  const marks = new Bucket();
  const palms = [];
  const bananas = [];
  const signGroups = new Map();
  const alleys = new Set();
  const lmSpots = {};
  const animated = [];

  const addSign = (key, make, w, h, x, y, z, nx, nz, groups = signGroups) => {
    let g = groups.get(key);
    if (!g) groups.set(key, (g = { tex: make(), bucket: new Bucket() }));
    g.bucket.add(new THREE.PlaneGeometry(w, h), '#fff', x, y, z, 0, Math.atan2(nx, nz), 0);
  };
  const roofHip = (cx, top, cz, w, d, h, color) => roofs.add(hipRoof, color, cx, top + h / 2, cz, 0, 0, 0, w, h, d);
  const gable = (cx, top, cz, w, len, alongZ, pitch, color) => {
    const half = (alongZ ? w : len) / 2;
    const slab = half / Math.cos(pitch) + 0.6;
    for (const s of [-1, 1]) {
      if (alongZ) roofs.box(slab, 0.18, len + 1, color, cx + s * half / 2, top + Math.tan(pitch) * half / 2, cz, 0, 0, -s * pitch);
      else roofs.box(len + 1, 0.18, slab, color, cx, top + Math.tan(pitch) * half / 2, cz + s * half / 2, s * pitch, 0, 0);
    }
  };
  const palm = (x, z, s = 0.8 + rand() * 0.45, collide = true) => {
    if (onRoad(x, z, 1.2)) return;          // never plant a tree on the carriageway
    palms.push({ x, z, s, ry: rand() * Math.PI * 2, v: Math.floor(rand() * 3) });
    if (collide) col.addCentered(x, z, 0.5, 0.5, 'tree');
  };
  const insideAny = (x, z, list) => list.some((b) => x > b[0] - 1 && x < b[2] + 1 && z > b[1] - 1 && z < b[3] + 1);

  // ---------------- Ground ----------------
  const zc0 = gx(CANAL_ROW) + 6, zc1 = gx(CANAL_ROW + 1) - 6;
  const grassMat = mats.grass;
  const far = 1600;
  for (const [z0, z1] of [[-far, zc0], [zc1, far]]) {
    const g = new THREE.Mesh(new THREE.PlaneGeometry(far * 2, z1 - z0), grassMat);
    g.rotation.x = -Math.PI / 2; g.position.set(0, 0, (z0 + z1) / 2); g.receiveShadow = true;
    scene.add(g);
  }

  // ---------------- Roads ----------------
  const roadMat = mats.road;
  const roadB = new Bucket();
  const L = HALF * 2 + ROAD_HALF * 2;
  for (let k = 0; k <= N; k++) {
    for (const vertical of [true, false]) {
      const g = new THREE.PlaneGeometry(ROAD_HALF * 2, L);
      const uv = g.attributes.uv;
      for (let n = 0; n < uv.count; n++) uv.setY(n, uv.getY(n) * (L / 10));
      roadB.add(g, '#ffffff', vertical ? gx(k) : 0, vertical ? 0.02 : 0.021, vertical ? 0 : gx(k), -Math.PI / 2, vertical ? 0 : Math.PI / 2, 0, 1, 1, 1, 'YXZ');
    }
  }
  const roads = new THREE.Mesh(roadB.merge(), roadMat);
  roads.receiveShadow = true;
  scene.add(roads);

  // lane paint
  const arrowShape = new THREE.Shape();
  arrowShape.moveTo(-0.18, -1.6); arrowShape.lineTo(0.18, -1.6); arrowShape.lineTo(0.18, 0.4); arrowShape.lineTo(0.55, 0.4);
  arrowShape.lineTo(0, 1.6); arrowShape.lineTo(-0.55, 0.4); arrowShape.lineTo(-0.18, 0.4); arrowShape.closePath();
  const arrowGeo = new THREE.ShapeGeometry(arrowShape);
  const isSignal = (i, j) => SIGNALS.some(([a, b]) => a === i && b === j);
  for (let k = 0; k <= N; k++) {
    for (let m = 0; m < N; m++) {
      for (const vertical of [true, false]) {
        const a = gx(m) + 7, bb = gx(m + 1) - 7;
        const P = (along, across, w, d) => vertical
          ? marks.box(w, 0.02, d, '#ecebe6', gx(k) + across, 0.035, along)
          : marks.box(d, 0.02, w, '#ecebe6', along, 0.035, gx(k) + across);
        for (let s = a; s + 3 <= bb; s += 6) P(s + 1.5, 0, 0.15, 3);
        P((a + bb) / 2, -4.65, 0.14, B - 10);
        P((a + bb) / 2, 4.65, 0.14, B - 10);
        const oneway = vertical ? ONE_WAY_COLS[k] : ONE_WAY_ROWS[k];
        if (oneway !== undefined) {
          for (const lane of [-LANE, LANE]) for (const t of [0.3, 0.7]) {
            const along = a + (bb - a) * t;
            // arrow points +y in shape space → after laying flat it points -z; rotate to travel dir
            const dir = vertical ? new THREE.Vector2(0, oneway) : new THREE.Vector2(oneway, 0);
            const ry = Math.atan2(-dir.x, -dir.y);
            marks.add(arrowGeo, '#ecebe6', vertical ? gx(k) + lane : along, 0.036, vertical ? along : gx(k) + lane, -Math.PI / 2, ry, 0, 1, 1, 1, 'YXZ');
          }
        }
      }
    }
  }
  // stop lines + zebra crossings at signals
  for (const [i, j] of SIGNALS) {
    const x = gx(i), z = gx(j);
    for (const [fx, fz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const lx = fz, lz = -fx;                            // left of travel
      const sx = x - fx * 8.9 + lx * LANE, sz = z - fz * 8.9 + lz * LANE;
      if (fx) marks.box(0.45, 0.02, 4.8, '#f4f4f0', sx, 0.037, sz); else marks.box(4.8, 0.02, 0.45, '#f4f4f0', sx, 0.037, sz);
      for (let c = -4; c <= 4; c += 1.25) {
        const zx = x - fx * 7.1 + lx * c, zz = z - fz * 7.1 + lz * c;
        if (fx) marks.box(2.2, 0.02, 0.6, '#f4f4f0', zx, 0.037, zz); else marks.box(0.6, 0.02, 2.2, '#f4f4f0', zx, 0.037, zz);
      }
    }
  }

  // ---------------- Footpaths / block ground ----------------
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    const ox = gx(i), oz = gx(j), c = ox + B / 2, cz = oz + B / 2;
    if (!hasFootpath(i, j)) continue;
    const fp = '#d6cec4';
    pave.box(B - 10, 0.16, 3, fp, c, 0.08, oz + 6.5);
    pave.box(B - 10, 0.16, 3, fp, c, 0.08, oz + B - 6.5);
    pave.box(3, 0.16, B - 16, fp, ox + 6.5, 0.08, cz);
    pave.box(3, 0.16, B - 16, fp, ox + B - 6.5, 0.08, cz);
    // painted kerb stones
    for (let s = 0; s < B - 10; s += 2) {
      const colr = (s / 2) % 2 ? '#f2c200' : '#1b1b1b';     // yellow-and-black painted kerbs
      flat.box(2, 0.2, 0.18, colr, ox + 5 + s + 1, 0.1, oz + 5.05);
      flat.box(2, 0.2, 0.18, colr, ox + 5 + s + 1, 0.1, oz + B - 5.05);
      flat.box(0.18, 0.2, 2, colr, ox + 5.05, 0.1, oz + 5 + s + 1);
      flat.box(0.18, 0.2, 2, colr, ox + B - 5.05, 0.1, oz + 5 + s + 1);
    }
    flat.box(B - 16, 0.03, B - 16, rand() < 0.5 ? '#9a8458' : '#86804f', c, 0.015, cz);
  }

  // ---------------- Town blocks ----------------
  const lot = (B - 16) / 3;
  const signCount = SHOP_SIGNS.length;
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    if (blockKind(i, j) !== 'town') continue;
    const ox = gx(i), oz = gx(j);
    const alley = rand() < 0.45;
    if (alley) alleys.add(`${i},${j}`);
    const built = [];
    for (let c = 0; c < 3; c++) for (let r = 0; r < 3; r++) {
      const lx0 = ox + 8 + c * lot, lz0 = oz + 8 + r * lot;
      if (alley && c === 1) continue;
      if (c === 1 && r === 1) { yard(lx0, lz0); continue; }
      let nx = 0, nz = 0;
      if (r === 0) nz = -1; else if (r === 2) nz = 1; else nx = c === 0 ? -1 : 1;
      built.push(building(lx0, lz0, nx, nz));
    }
    // back-of-lot palms where there is room
    for (let c = 0; c < 3; c++) for (let r = 0; r < 3; r++) {
      if (alley && c === 1) continue;
      const x = ox + 8 + c * lot + 1.5 + rand() * (lot - 3), z = oz + 8 + r * lot + 1.5 + rand() * (lot - 3);
      if (!insideAny(x, z, built) && rand() < 0.8) palm(x, z);
    }
    if (alley) {
      const ax = ox + B / 2;
      flat.box(4.6, 0.04, B - 16, '#9b6b4a', ax, 0.02, oz + B / 2);
      for (const s of [-1, 1]) {
        const wx = ax + s * 2.9;
        lat.box(0.35, 1.35, B - 16, '#ffffff', wx, 0.67, oz + B / 2);
        solid.box(0.45, 0.12, B - 16, '#ddd5c4', wx, 1.38, oz + B / 2);
        col.addCentered(wx, oz + B / 2, 0.35, B - 16);
        for (let z = oz + 11 + prand() * 4; z < oz + B - 11; z += 7 + prand() * 5) {
          if (prand() < 0.8) posters.cluster(wx - s * 0.18, 0.72, z, -s, 0, 2 + Math.floor(prand() * 3), 0.6, 0.9, prand);
        }
        for (let z = oz + 12; z < oz + B - 10; z += 9 + rand() * 6) if (rand() < 0.6) bananas.push({ x: wx + s * 1.2, z, s: 0.9 + rand() * 0.5, ry: rand() * 6 });
      }
    }
  }

  function yard(lx0, lz0) {
    const cx = lx0 + lot / 2, cz = lz0 + lot / 2;
    solid.add(new THREE.CylinderGeometry(1, 1.05, 0.9, 14), '#8f4a2a', cx, 0.45, cz);
    solid.add(new THREE.CylinderGeometry(0.85, 0.85, 0.92, 14), '#1c2a26', cx, 0.47, cz);
    solid.box(0.1, 1.6, 0.1, '#5a4030', cx - 0.9, 0.8, cz); solid.box(0.1, 1.6, 0.1, '#5a4030', cx + 0.9, 0.8, cz);
    solid.box(1.9, 0.1, 0.1, '#5a4030', cx, 1.6, cz);
    col.addCentered(cx, cz, 2.1, 2.1, 'wall');
    for (let k = 0; k < 3; k++) palm(cx + (rand() - 0.5) * 10, cz + (rand() - 0.5) * 10);
    for (let k = 0; k < 3; k++) bananas.push({ x: cx + (rand() - 0.5) * 11, z: cz + (rand() - 0.5) * 11, s: 0.8 + rand() * 0.5, ry: rand() * 6 });
  }

  // Kerala front compound wall along the street edge of a lot, with a gate opposite the door.
  function compoundWall(lx0, lz0, nx, nz, gateAt) {
    const painted = prand() < 0.5;
    const colr = painted ? '#efe6d2' : '#ffffff';
    const wallB = painted ? plas : lat;
    const along = (a, b) => {   // a..b along the street, returns nothing
      const L = b - a;
      if (L < 0.5) return;
      const m = (a + b) / 2;
      const [x, z] = nz ? [m, nz < 0 ? lz0 + 0.3 : lz0 + lot - 0.3] : [nx < 0 ? lx0 + 0.3 : lx0 + lot - 0.3, m];
      const [w, d] = nz ? [L, 0.3] : [0.3, L];
      wallB.box(w, 1.75, d, colr, x, 0.875, z);
      if (painted) solid.box(w + 0.02, 0.32, d + 0.02, '#5d5a52', x, 0.16, z);
      solid.box(w + 0.12, 0.1, d + 0.12, '#d9d0bf', x, 1.8, z);
      col.addCentered(x, z, w, d, 'wall');
      if (L > 2 && prand() < 0.85) {
        const n = Math.min(5, Math.max(1, Math.floor((L - 0.4) / 0.8)));
        const roll = prand();
        if (painted && roll < 0.3) {
          // party slogan painted straight onto the whitewashed wall
          const p = Math.floor(prand() * PARTIES.length), v = prand() < 0.5 ? 1 : 0, len = Math.min(L - 0.3, 4.2);
          addSign(`slogan${p}${v}`, () => canvasTex(wallSlogan(PARTIES[p], v), 640, 300), len, len * 0.42, x + nx * 0.16, 0.9, z + nz * 0.16, nx, nz);
        } else if (roll < 0.5) politics.cluster(x + nx * 0.16, 0.92, z + nz * 0.16, nx, nz, n, 0.84, 1.05, prand, 0.25);
        else if (roll < 0.65) ads.cluster(x + nx * 0.16, 0.92, z + nz * 0.16, nx, nz, Math.min(n, 2), 0.84, 1.05, prand, 0.3);
        else posters.cluster(x + nx * 0.16, 0.92, z + nz * 0.16, nx, nz, n, 0.8, 1.12, prand);
        // election season: every remaining bare stretch of wall gets painted
        if (!painted || roll >= 0.3) {
          const p = Math.floor(prand() * PARTIES.length), len = Math.min(L - 0.3, 4.2);
          if (L > 3) addSign(`eslogan${p}`, () => canvasTex(wallSlogan(PARTIES[p], 1), 640, 300), len * 0.6, len * 0.25, x + nx * 0.165, 1.55, z + nz * 0.165, nx, nz, election.signs);
        }
      }
    };
    const a = nz ? lx0 : lz0, b = a + lot;
    const g0 = Math.max(a, gateAt - 1.4), g1 = Math.min(b, gateAt + 1.4);
    along(a, g0); along(g1, b);
    for (const g of [g0, g1]) {
      const [x, z] = nz ? [g, nz < 0 ? lz0 + 0.3 : lz0 + lot - 0.3] : [nx < 0 ? lx0 + 0.3 : lx0 + lot - 0.3, g];
      wallB.box(0.55, 2.1, 0.55, colr, x, 1.05, z);
      solid.box(0.7, 0.12, 0.7, '#d9d0bf', x, 2.15, z);
    }
  }

  // Chaya kada: open-fronted tea stall with a tin roof, glass jars, a brass samovar and a hanging bunch of bananas.
  function teaStall(lx0, lz0, nx, nz) {
    const w = 6, d = 4.2, h = 2.7, set = 2.2;
    const tx = -nz, tz = nx;
    let cx = lx0 + lot / 2, cz = lz0 + lot / 2;
    if (nz < 0) cz = lz0 + set + d / 2; if (nz > 0) cz = lz0 + lot - set - d / 2;
    if (nx < 0) cx = lx0 + set + d / 2; if (nx > 0) cx = lx0 + lot - set - d / 2;
    const ry = Math.atan2(nx, nz);
    const P = (a, b) => [cx + tx * a + nx * b, cz + tz * a + nz * b];
    const put = (bucket, geo, color, a, b, y, rx = 0) => { const [x, z] = P(a, b); bucket.add(geo, color, x, y, z, rx, ry, 0, 1, 1, 1, 'YXZ'); };
    const B3 = (x, y, z) => new THREE.BoxGeometry(x, y, z);
    put(solid, B3(w + 0.3, 0.2, d + 0.3), '#a8a196', 0, 0, 0.1);
    put(plas, B3(w, h, 0.22), '#9fd0c4', 0, -d / 2, h / 2);
    put(plas, B3(0.22, h, d), '#9fd0c4', -w / 2, 0, h / 2);
    put(plas, B3(0.22, h, d), '#9fd0c4', w / 2, 0, h / 2);
    put(solid, B3(w + 1.1, 0.06, d + 1.8), '#8e979b', 0, 0.5, h + 0.2, 0.16);            // tin roof, sloping to the street
    put(solid, B3(w * 0.86, 1.0, 0.55), '#6b4a2e', 0, d / 2 - 0.35, 0.5);                // counter
    for (let k = 0; k < 6; k++) {                                                          // glass jars of snacks
      put(solid, new THREE.CylinderGeometry(0.12, 0.12, 0.3, 10), '#dcecef', -1.8 + k * 0.5, d / 2 - 0.35, 1.16);
      put(solid, new THREE.CylinderGeometry(0.1, 0.1, 0.16, 10), ['#d8902a', '#f2d35b', '#b5562a', '#e6c48a'][k % 4], -1.8 + k * 0.5, d / 2 - 0.35, 1.1);
    }
    put(solid, new THREE.CylinderGeometry(0.2, 0.24, 0.55, 14), '#c9a227', 1.9, d / 2 - 0.35, 1.28);   // samovar
    put(solid, new THREE.ConeGeometry(0.16, 0.2, 12), '#c9a227', 1.9, d / 2 - 0.35, 1.65);
    for (let k = 0; k < 6; k++) put(solid, new THREE.SphereGeometry(0.11, 8, 6), k % 2 ? '#e3bb2c' : '#d5ad22', -2.3 + (k % 2) * 0.12, d / 2 + 0.15, 2.35 - k * 0.12);
    put(solid, B3(0.02, 0.4, 0.02), '#5a4a3a', -2.25, d / 2 + 0.15, 2.6);
    put(solid, B3(2.6, 0.08, 0.45), '#7a5536', -0.8, d / 2 + 1.0, 0.46);                 // bench for the regulars
    for (const a of [-1.9, 0.3]) put(solid, B3(0.08, 0.44, 0.4), '#5a3d26', a, d / 2 + 1.0, 0.22);
    const [sx, sz] = P(0, d / 2 + 0.95);
    addSign('teastall', () => signTexture('ചായക്കട', 'Chaya · Pazhampori · Vada', '#1b5e20', '#fff8e1', 512, 160, FONT_PAINT), 3.4, 1.05, sx, h + 0.55, sz, nx, nz);
    // collide with the stall itself; the bench out front is low enough to be part of it
    const [ax, az] = P(-w / 2, -d / 2), [bx, bz] = P(w / 2, d / 2 + 1.3);
    const box = [Math.min(ax, bx), Math.min(az, bz), Math.max(ax, bx), Math.max(az, bz)];
    col.add(box[0], box[1], box[2], box[3], 'building');
    return box;
  }

  // Milk booth: the little blue co-operative kiosk on a junction corner.
  function milkBooth(x, z, nx, nz) {
    const L = Math.hypot(nx, nz); nx /= L; nz /= L;
    const ry = Math.atan2(nx, nz);
    solid.add(new THREE.BoxGeometry(1.9, 2.3, 1.7), '#1d5fa8', x, 1.15, z, 0, ry, 0);
    solid.add(new THREE.BoxGeometry(2.0, 0.3, 1.8), '#f4f4f0', x, 2.35, z, 0, ry, 0);
    solid.add(new THREE.BoxGeometry(2.3, 0.08, 2.1), '#1d5fa8', x, 2.55, z, 0, ry, 0);
    solid.add(new THREE.BoxGeometry(1.2, 0.8, 0.05), '#1a2228', x + nx * 0.86, 1.35, z + nz * 0.86, 0, ry, 0);
    addSign('milk', () => signTexture('പാൽ ബൂത്ത്', 'Milk · Curd · Ghee', '#f4f4f0', '#1d5fa8', 512, 160, FONT_ML), 1.9, 0.6, x + nx * 0.9, 2.35, z + nz * 0.9, nx, nz);
    col.addCentered(x, z, 2.1, 2.1, 'building');
  }

  function building(lx0, lz0, nx, nz) {
    const shop = rand() < 0.55;
    if (shop && prand() < 0.14) return teaStall(lx0, lz0, nx, nz);
    const w = 8.5 + rand() * 4.5, d = 8 + rand() * 4.5;
    const set = shop ? 0.3 : 1.2 + rand() * 1.8;
    let cx = lx0 + lot / 2 + (rand() - 0.5) * (lot - w) * 0.6;
    let cz = lz0 + lot / 2 + (rand() - 0.5) * (lot - d) * 0.6;
    if (nx < 0) cx = lx0 + set + w / 2; if (nx > 0) cx = lx0 + lot - set - w / 2;
    if (nz < 0) cz = lz0 + set + d / 2; if (nz > 0) cz = lz0 + lot - set - d / 2;
    const floors = shop ? 1 + Math.floor(rand() * 3) : 1 + (rand() < 0.4 ? 1 : 0);
    const h = floors * 3.2;
    walls.add(wallBox(w, h, d), pick(rand, WALL_COLORS), cx, h / 2, cz);
    col.addCentered(cx, cz, w, d, 'building');
    const len = nx ? d : w;
    const fx = cx + nx * (w / 2), fz = cz + nz * (d / 2);
    const faceBox = (lenF, hh, thick, color, y, out) => {
      if (nx) solid.box(thick, hh, lenF, color, fx + nx * out, y, cz);
      else solid.box(lenF, hh, thick, color, cx, y, fz + nz * out);
    };
    if (shop) {
      solid.box(w + 0.25, 0.5, d + 0.25, '#d6cfc2', cx, h + 0.25, cz);                     // parapet
      faceBox(len * 0.9, 2.5, 0.12, pick(rand, ['#4f5b66', '#3b3b3b', '#7b5d3a', '#6d7f8c']), 1.25, 0.05);
      const s = SHOP_SIGNS[Math.floor(rand() * signCount)];
      addSign(`shop${s[1]}`, () => signTexture(s[0], s[1], s[2], s[3], 512, 160, FONT_PAINT), len * 0.85, 0.85, fx + nx * 0.14, 3.15, fz + nz * 0.14, nx, nz);
      shops.push({ fx, fz, cx, cz, nx, nz, len, kind: s[1] });
      if (s[1].startsWith('Hotel') && prand() < 0.7) {
        // old hand-painted tin board on the corner of the facade, with its bulb
        const tx = -nz, tz = nx, o = len * 0.42;
        addSign('paintedHotel', () => canvasTex(paintedHotel, 300, 400), 0.9, 1.2, fx + tx * o + nx * 0.2, 2.0, fz + tz * o + nz * 0.2, nx, nz);
      }
      if (s[1].includes('Bakery') || s[1].includes('Cool')) {
        // glass display case on the shop step
        const [gx0, gz0] = [fx + nx * 0.6, fz + nz * 0.6];
        solid.box(nx ? 0.6 : len * 0.5, 0.75, nx ? len * 0.5 : 0.6, '#7b5d3a', gx0, 0.38, gz0);
        solid.box(nx ? 0.55 : len * 0.48, 0.45, nx ? len * 0.48 : 0.55, '#cfe6ee', gx0, 0.98, gz0);
        for (let k = 0; k < 6; k++) solid.box(0.14, 0.08, 0.14, ['#e6a23c', '#c8553d', '#f2d35b'][k % 3], gx0 + (nx ? 0 : (k - 2.5) * len * 0.07), 0.85, gz0 + (nx ? (k - 2.5) * len * 0.07 : 0));
      }
      const aw = pick(rand, ['#c62828', '#1565c0', '#2e7d32', '#f9a825', '#6a1b9a']);
      if (nx) solid.box(1.5, 0.08, len * 0.9, aw, fx + nx * 0.75, 2.6, cz, 0, 0, -nx * 0.28);
      else solid.box(len * 0.9, 0.08, 1.5, aw, cx, 2.6, fz + nz * 0.75, nz * 0.28, 0, 0);
    } else {
      const rh = 1.8 + Math.min(w, d) * 0.12;
      roofHip(cx, h, cz, w * 1.2, d * 1.2, rh, pick(rand, ROOF_COLORS));
      faceBox(1.1, 2.2, 0.1, '#5b3a22', 1.1, 0.04);                                         // door
      if (rand() < 0.6) {                                                                    // sit-out
        if (nx) { solid.box(2, 0.12, len * 0.7, '#a5462a', fx + nx * 1, 2.9, cz, 0, 0, -nx * 0.2); }
        else { solid.box(len * 0.7, 0.12, 2, '#a5462a', cx, 2.9, fz + nz * 1, nz * 0.2, 0, 0); }
      }
      if (prand() < 0.7) compoundWall(lx0, lz0, nx, nz, nx ? cz : cx);
    }
    if (prand() < 0.65) {
      const side = prand() < 0.5 ? -1 : 1, n = 1 + Math.floor(prand() * 3);
      if (nz) posters.cluster(cx + side * (w / 2), 1.7, cz + nz * (d / 2 - 2.2), side, 0, n, 0.9, 1.3, prand);
      else posters.cluster(cx + nx * (w / 2 - 2.2), 1.7, cz + side * (d / 2), 0, side, n, 0.9, 1.3, prand);
    }
    if (floors >= 2 && prand() < 0.6) {
      if (shop && prand() < 0.5) {
        // above the shop sign, slid to one side of the facade
        const off = (prand() - 0.5) * (len - 2.6);
        flex(fx + (nx ? 0 : off), 5.0, fz + (nz ? 0 : off), nx, nz, 2.0, 2.5);
      } else {
        const side = prand() < 0.5 ? -1 : 1, bh = 3.25, y = Math.max(3.4, h - 2.1);
        if (nz) flex(cx + side * (w / 2), y, cz + nz * (d / 2 - 2.4), side, 0, 2.6, bh);
        else flex(cx + nx * (w / 2 - 2.4), y, cz + side * (d / 2), 0, side, 2.6, bh);
      }
    } else if (prand() < 0.45) {
      // hand-painted advert straight onto the side wall
      const side = prand() < 0.5 ? -1 : 1, big = floors >= 2;
      const [aw, ah, ay] = big ? [4.4, 2.3, 3.0] : [3.2, 1.6, 1.85];
      const k = Math.floor(prand() * WALL_ADS.length), ad = WALL_ADS[k];
      const make = () => paintedAdTexture(...ad);
      if (nz) addSign(`ad${k}`, make, aw, ah, cx + side * (w / 2 + 0.03), ay, cz - nz * 1.2, side, 0);
      else addSign(`ad${k}`, make, aw, ah, cx - nx * 1.2, ay, cz + side * (d / 2 + 0.03), 0, side);
    }
    return [cx - w / 2, cz - d / 2, cx + w / 2, cz + d / 2];
  }

  // ---------------- Paddy fields ----------------
  const paddyTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const x = c.getContext('2d');
    x.fillStyle = '#5f8f2c'; x.fillRect(0, 0, 128, 128);
    for (let r = 0; r < 128; r += 4) { x.fillStyle = r % 8 ? '#7bab37' : '#8cbd40'; x.fillRect(0, r, 128, 2); }
    for (let k = 0; k < 800; k++) { x.fillStyle = `rgba(40,70,20,${Math.random() * 0.4})`; x.fillRect(Math.random() * 128, Math.random() * 128, 2, 2); }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(6, 6); t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  const paddyMat = new THREE.MeshStandardMaterial({ map: paddyTex, roughness: 0.9 });
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    if (blockKind(i, j) !== 'paddy') continue;
    const ox = gx(i), oz = gx(j), cx = ox + B / 2, cz = oz + B / 2;
    const p = new THREE.Mesh(new THREE.PlaneGeometry(B - 10, B - 10), paddyMat);
    p.rotation.x = -Math.PI / 2; p.position.set(cx, 0.025, cz); p.receiveShadow = true;
    scene.add(p);
    flat.box(1.2, 0.22, B - 10, '#7a5a3a', cx, 0.1, cz);
    flat.box(B - 10, 0.22, 1.2, '#7a5a3a', cx, 0.1, cz);
    for (const [px, pz] of [[ox + 7, oz + 7], [ox + B - 7, oz + B - 7], [ox + 7, oz + B - 7], [ox + B - 7, oz + 7]]) palm(px, pz);
    // a little thatched hut on one quadrant
    const hx = cx + 12, hz = cz - 12;
    solid.box(4, 2.2, 3.5, '#8a6a44', hx, 1.1, hz);
    roofHip(hx, 2.2, hz, 5.4, 4.8, 1.8, '#b59a55');
    col.addCentered(hx, hz, 4, 3.5, 'building');
    hoarding(ox + 15, oz + 8.5, 0, -1);
  }

  // Big flex hoarding on steel legs, facing the road
  function hoarding(x, z, nx, nz) {
    const tx = -nz, tz = nx;
    for (const s of [-1.3, 1.3]) {
      solid.box(0.22, 7.6, 0.22, '#6e6e6e', x + tx * s, 3.8, z + tz * s);
      col.addCentered(x + tx * s, z + tz * s, 0.3, 0.3, 'pole');
    }
    if (nz) solid.box(3.8, 5.1, 0.14, '#2a2a2a', x, 5.05, z);
    else solid.box(0.14, 5.1, 3.8, '#2a2a2a', x, 5.05, z);
    if (nz) solid.box(3.8, 0.1, 0.5, '#444', x, 7.65, z + nz * 0.2); else solid.box(0.5, 0.1, 3.8, '#444', x + nx * 0.2, 7.65, z);
    // two-sided flex, a different print on each face
    const roll = prand(), set = roll < 0.35 ? politics : roll < 0.7 ? ads : posters;
    const [pw, ph] = set === posters ? [3.5, 4.9] : [3.7, 4.6];
    const a = Math.floor(prand() * set.count);
    set.add(x + nx * 0.09, 5.05, z + nz * 0.09, nx, nz, pw, ph, a, false);
    set.add(x - nx * 0.09, 5.05, z - nz * 0.09, -nx, -nz, pw, ph, (a + 1 + Math.floor(prand() * (set.count - 1))) % set.count, false);
  }
  for (let k = 0; k < N; k += 2) {
    hoarding(gx(k) + 30, -HALF - 11, 0, 1);
    hoarding(gx(k + 1) + 30, HALF + 11, 0, -1);
  }
  for (let m = 1; m < N; m += 2) {
    if (m === CANAL_ROW) continue;
    hoarding(-HALF - 11, gx(m) + 30, 1, 0);
    hoarding(HALF + 11, gx(m) + 30, -1, 0);
  }

  // ---------------- Canal (backwaters) ----------------
  const waterTex = noiseTexture(256, '#808080', 1.2, { repeat: 40, dots: 14000, alpha: 0.7 });
  const waterMat = new THREE.MeshStandardMaterial({ color: '#2f6e66', roughness: 0.08, metalness: 0.2, bumpMap: waterTex, bumpScale: 0.6 });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(far * 2, zc1 - zc0 + 2), waterMat);
  water.rotation.x = -Math.PI / 2; water.position.set(0, -0.75, (zc0 + zc1) / 2); water.receiveShadow = true;
  scene.add(water);
  animated.push((t) => { waterTex.offset.set(t * 0.004, t * 0.002); });
  for (const z of [zc0, zc1]) {
    lat.box(far * 2, 1.1, 0.7, '#e8d0c0', 0, -0.45, z);
  }
  // bank strips (grass between road and water) are covered by ground planes. Colliders:
  for (let i = 0; i < N; i++) col.add(gx(i) + 5.6, zc0 - 0.4, gx(i + 1) - 5.6, zc1 + 0.4, 'water');
  col.add(-BOUND - 10, zc0 - 0.4, gx(0) - 5.6, zc1 + 0.4, 'water');
  col.add(gx(N) + 5.6, zc0 - 0.4, BOUND + 10, zc1 + 0.4, 'water');
  // bridges
  for (let k = 0; k <= N; k++) {
    const x = gx(k), zm = (zc0 + zc1) / 2, len = zc1 - zc0 + 2;
    solid.box(ROAD_HALF * 2 + 1.2, 0.7, len, '#9d9a92', x, -0.34, zm);
    for (const s of [-1, 1]) {
      solid.box(0.3, 0.12, len, '#f2f2ee', x + s * 5.45, 1.0, zm);
      for (let z = zc0; z <= zc1; z += 2.5) solid.box(0.22, 1.0, 0.22, (Math.round((z - zc0) / 2.5) % 2) ? '#f2f2ee' : '#222', x + s * 5.45, 0.5, z);
    }
    solid.box(3, 2.5, 3, '#8d8a83', x, -1.5, zm);
  }
  // houseboats drifting between bridges
  const hbGeo = houseboatGeometry();
  for (const [bi, lane] of [[1, -9], [3, 8], [5, -6], [6, 10]]) {
    const m = new THREE.Mesh(hbGeo, vcMat);
    m.castShadow = true;
    const x0 = gx(bi) + 16, x1 = gx(bi + 1) - 16;
    const st = { x: x0 + rand() * (x1 - x0), dir: rand() < 0.5 ? -1 : 1 };
    m.position.set(st.x, -0.75, (zc0 + zc1) / 2 + lane);
    m.rotation.y = Math.PI / 2;
    scene.add(m);
    animated.push((t, dt) => {
      st.x += st.dir * dt * 1.2;
      if (st.x > x1 || st.x < x0) st.dir *= -1;
      m.position.x = st.x;
      m.rotation.y = Math.PI / 2 * st.dir;
      m.position.y = -0.75 + Math.sin(t * 0.9 + bi) * 0.05;
      m.rotation.z = Math.sin(t * 0.7 + bi) * 0.015;
    });
  }
  // coconut palms leaning over the backwater
  for (let x = -BOUND; x < BOUND; x += 7 + rand() * 6) {
    for (const z of [zc0 - 1.1, zc1 + 1.1]) {
      const nearRoad = Array.from({ length: N + 1 }, (_, k) => Math.abs(x - gx(k)) < 8).some(Boolean);
      if (!nearRoad && rand() < 0.75) palm(x, z, 0.9 + rand() * 0.4, false);
    }
  }

  // ---------------- Landmarks ----------------
  const LB = {
    temple(ox, oz, cx, cz) {
      flat.box(B - 18, 0.03, B - 18, '#d8c39a', cx, 0.03, cz);
      const inset = 9, lo = ox + inset, hi = ox + B - inset, loz = oz + inset, hiz = oz + B - inset;
      const wall = (x0, z0, x1, z1) => {
        const w = Math.max(0.5, x1 - x0), d = Math.max(0.5, z1 - z0);
        lat.box(w, 1.6, d, '#ffffff', (x0 + x1) / 2, 0.8, (z0 + z1) / 2);
        solid.box(w + 0.1, 0.14, d + 0.1, '#e9e0cc', (x0 + x1) / 2, 1.65, (z0 + z1) / 2);
        col.add(x0 - 0.25, z0 - 0.25, x1 + 0.25, z1 + 0.25, 'wall');
      };
      wall(lo, hiz, hi, hiz); wall(lo, loz, lo, hiz); wall(hi, loz, hi, hiz);
      wall(lo, loz, cx - 5, loz); wall(cx + 5, loz, hi, loz);
      // gateway
      for (const s of [-1, 1]) { solid.box(1, 3.6, 1, '#efe6d2', cx + s * 4.6, 1.8, loz); col.addCentered(cx + s * 4.6, loz, 1, 1); }
      solid.box(10.6, 0.6, 3, '#efe6d2', cx, 3.9, loz);
      roofHip(cx, 4.2, loz, 12, 4.6, 2.2, '#ead0bd');
      addSign('temple', () => signTexture('ശ്രീകൃഷ്ണ ക്ഷേത്രം', 'Sree Krishna Temple', '#7a1f12', '#ffd54f'), 7.5, 1.4, cx, 3.0, loz - 1.55, 0, -1);
      // sreekovil
      const sz = cz + 5;
      solid.box(15, 0.9, 15, '#8e8b84', cx, 0.45, sz);
      solid.box(10.5, 3.6, 10.5, '#efe6d2', cx, 2.7, sz);
      for (let k = -4; k <= 4; k += 1) solid.box(0.12, 0.12, 0.1, '#d4a017', cx + k, 2.0, sz - 5.3);
      roofHip(cx, 4.5, sz, 15.5, 15.5, 3.2, '#5f8f78');
      solid.box(6.5, 1.8, 6.5, '#d9c9a0', cx, 7.3, sz);
      roofHip(cx, 8.2, sz, 9, 9, 2.6, '#5f8f78');
      solid.add(new THREE.CylinderGeometry(0.12, 0.25, 1.4, 10), '#d4a017', cx, 11.4, sz);
      col.addCentered(cx, sz, 15, 15, 'building');
      // kodimaram (flag mast) + deepasthambham (lamp tower)
      solid.box(1.8, 1, 1.8, '#8e8b84', cx, 0.5, cz - 7);
      solid.add(new THREE.CylinderGeometry(0.16, 0.28, 13, 12), '#d4a017', cx, 7.5, cz - 7);
      for (let y = 3; y < 14; y += 1.4) solid.add(new THREE.CylinderGeometry(0.34, 0.34, 0.12, 12), '#c99412', cx, y, cz - 7);
      col.addCentered(cx, cz - 7, 1.8, 1.8);
      const lx = cx + 6.5;
      solid.add(new THREE.CylinderGeometry(0.3, 0.6, 4.5, 12), '#b8860b', lx, 2.25, cz - 7);
      for (let y = 1; y < 4.6; y += 0.45) solid.add(new THREE.CylinderGeometry(0.9 - y * 0.12, 0.9 - y * 0.12, 0.07, 14), '#c99412', lx, y, cz - 7);
      col.addCentered(lx, cz - 7, 1.2, 1.2);
      // banyan (aal maram)
      const bx = ox + 15, bz = oz + B - 15;
      solid.add(new THREE.CylinderGeometry(1, 1.5, 5, 10), '#5c4632', bx, 2.5, bz);
      for (let k = 0; k < 6; k++) solid.add(new THREE.SphereGeometry(3.3, 10, 8), k % 2 ? '#3f6e2d' : '#4c7d34', bx + Math.cos(k) * 3, 6 + (k % 3), bz + Math.sin(k) * 3);
      col.addCentered(bx, bz, 2.6, 2.6, 'tree');
    },
    church(ox, oz, cx, cz) {
      flat.box(B - 18, 0.03, B - 18, '#cfc7b6', cx, 0.03, cz);
      solid.box(12, 8, 22, '#f7f4ec', cx, 4, cz + 5);
      gable(cx, 8, cz + 5, 12, 22, true, 0.6, '#ead0bd');
      const fz = cz - 6.5;
      solid.box(14, 13, 1.4, '#ffffff', cx, 6.5, fz);
      solid.box(7.1, 7.1, 1.4, '#ffffff', cx, 13, fz, 0, 0, Math.PI / 4);
      solid.box(0.45, 3.2, 0.45, '#f5d36b', cx, 19.6, fz);
      solid.box(2, 0.45, 0.45, '#f5d36b', cx, 20.2, fz);
      solid.box(3, 4.6, 0.2, '#4e3626', cx, 2.3, fz - 0.75);
      for (const s of [-1, 1]) solid.box(1.1, 3.2, 0.2, '#3b6ea5', cx + s * 4.2, 6.5, fz - 0.75);
      solid.add(new THREE.CircleGeometry(1.2, 20), '#3b6ea5', cx, 10.5, fz - 0.72, 0, Math.PI, 0);
      col.addCentered(cx, cz + 5, 12, 22, 'building'); col.addCentered(cx, fz, 14, 1.4, 'building');
      // kurishupally (roadside cross shrine)
      const kx = ox + 12, kz = oz + 11.5;
      solid.box(2.6, 3, 2.6, '#ffffff', kx, 1.5, kz);
      solid.box(2, 2, 0.1, '#5f86a8', kx, 1.4, kz - 1.32);
      roofHip(kx, 3, kz, 3.2, 3.2, 1, '#ead0bd');
      solid.box(0.2, 1.4, 0.2, '#f5d36b', kx, 4.4, kz); solid.box(0.8, 0.2, 0.2, '#f5d36b', kx, 4.7, kz);
      col.addCentered(kx, kz, 2.6, 2.6, 'building');
      addSign('church', () => signTexture('സെന്റ് മേരീസ് പള്ളി', "St. Mary's Church", '#ffffff', '#1a3d6e'), 6, 1.2, cx + 13, 2.2, oz + 9.2, 0, -1);
      for (const s of [-2.8, 2.8]) solid.box(0.15, 1.6, 0.15, '#444', cx + 13 + s, 0.8, oz + 9.3);
    },
    mosque(ox, oz, cx, cz) {
      flat.box(B - 18, 0.03, B - 18, '#d7d2c6', cx, 0.03, cz);
      solid.box(18, 7, 16, '#f6f6f2', cx, 3.5, cz + 3);
      solid.box(18.3, 0.55, 16.3, '#1f7a46', cx, 7.1, cz + 3);
      solid.add(new THREE.CylinderGeometry(4, 4, 2, 20), '#f6f6f2', cx, 8.4, cz + 3);
      solid.add(new THREE.SphereGeometry(4.3, 22, 12, 0, Math.PI * 2, 0, Math.PI / 2), '#1f8a4c', cx, 9.3, cz + 3);
      solid.add(new THREE.CylinderGeometry(0.06, 0.15, 1.6, 8), '#d4a017', cx, 14.3, cz + 3);
      for (const s of [-1, 1]) {
        const mx = cx + s * 8.6, mz = cz - 5.6;
        solid.add(new THREE.CylinderGeometry(0.85, 1, 16, 14), '#f6f6f2', mx, 8, mz);
        solid.add(new THREE.CylinderGeometry(1.35, 1.35, 0.4, 14), '#1f7a46', mx, 11.5, mz);
        solid.add(new THREE.CylinderGeometry(1.35, 1.35, 0.4, 14), '#1f7a46', mx, 15, mz);
        solid.add(new THREE.SphereGeometry(1, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), '#1f8a4c', mx, 16, mz);
        col.addCentered(mx, mz, 2, 2);
      }
      for (let k = -2; k <= 2; k++) solid.box(1.6, 3.6, 0.2, '#2c3e36', cx + k * 3.2, 1.8, cz - 5.05);
      col.addCentered(cx, cz + 3, 18, 16, 'building');
      addSign('mosque', () => signTexture('ജുമാ മസ്ജിദ്', 'Juma Masjid', '#1f7a46', '#ffffff'), 7, 1.3, cx, 5.6, cz - 5.1, 0, -1);
    },
    busstand(ox, oz, cx, cz) {
      flat.box(B - 16, 0.04, B - 16, '#8f8b84', cx, 0.03, cz);
      const sz = cz + 13;
      solid.box(36, 0.35, 8, '#c62828', cx, 4.7, sz);
      solid.box(36.4, 0.6, 8.4, '#f2c200', cx, 4.3, sz);
      for (let x = -16; x <= 16; x += 8) for (const dz of [-3.4, 3.4]) {
        solid.add(new THREE.CylinderGeometry(0.22, 0.22, 4.2, 10), '#d6d2c8', cx + x, 2.1, sz + dz);
        col.addCentered(cx + x, sz + dz, 0.5, 0.5);
      }
      for (let x = -12; x <= 12; x += 6) solid.box(4, 0.45, 0.8, '#5d6d7e', cx + x, 0.45, sz + 2.5);
      addSign('ksrtc', () => signTexture('കെ.ആർ.ടി.സി ബസ് സ്റ്റാൻഡ്', 'KRTC Bus Stand', '#b71c1c', '#ffffff', 768, 160), 14, 2.2, cx, 6.2, sz - 4.25, 0, -1);
      solid.box(14, 2.3, 0.15, '#b71c1c', cx, 6.2, sz - 4.15);
      const bg = busGeometry('#b71c1c', '#f2c200', true);
      for (const x of [-10, 0, 10]) {
        const m = new THREE.Mesh(bg, vcMat); m.position.set(cx + x, 0, cz - 2); m.castShadow = true; scene.add(m);
        col.addCentered(cx + x, cz - 2, 2.6, 10.2, 'vehicle');
      }
    },
    hospital(ox, oz, cx, cz) {
      flat.box(B - 16, 0.04, B - 16, '#9b978f', cx, 0.03, cz);
      walls.add(wallBox(36, 15, 15), '#efe7d6', cx, 7.5, cz + 7);
      solid.box(36.4, 0.6, 15.4, '#d6cfc2', cx, 15.3, cz + 7);
      walls.add(wallBox(12, 9, 10), '#efe7d6', cx - 12, 4.5, cz - 5.5);
      solid.box(12.4, 0.5, 10.4, '#d6cfc2', cx - 12, 9.2, cz - 5.5);
      col.addCentered(cx, cz + 7, 36, 15, 'building'); col.addCentered(cx - 12, cz - 5.5, 12, 10, 'building');
      addSign('hospital', () => signTexture('മെഡിക്കൽ കോളേജ്', 'Medical College Hospital', '#ffffff', '#c62828', 768, 160), 16, 3.2, cx + 2, 12.5, cz - 0.56, 0, -1);
      addSign('redcross', () => { const t = signTexture('', '', '#ffffff', '#fff', 128, 128); const c = t.image.getContext('2d'); c.fillStyle = '#d32f2f'; c.fillRect(48, 16, 32, 96); c.fillRect(16, 48, 96, 32); t.needsUpdate = true; return t; }, 2.6, 2.6, cx + 13, 12.5, cz - 0.56, 0, -1);
      const amb = new THREE.Mesh(carGeometry('#fafafa'), vcMat); amb.position.set(cx + 8, 0, cz - 8); amb.rotation.y = Math.PI / 2; amb.castShadow = true; scene.add(amb);
      col.addCentered(cx + 8, cz - 8, 4, 1.8, 'vehicle');
    },
    railway(ox, oz, cx, cz) {
      flat.box(B - 16, 0.04, B - 16, '#8b7e6a', cx, 0.03, cz);
      walls.add(wallBox(32, 5, 9), '#e8b86a', cx, 2.5, cz - 2);
      gable(cx, 5, cz - 2, 9, 32, false, 0.5, '#ead0bd');
      col.addCentered(cx, cz - 2, 32, 9, 'building');
      solid.box(44, 0.9, 6, '#8d8a83', cx, 0.45, cz + 7);
      solid.box(44, 0.92, 0.3, '#f2c200', cx, 0.46, cz + 9.9);
      col.addCentered(cx, cz + 7, 44, 6, 'wall');
      for (const tz of [cz + 14, cz + 19]) {
        for (const s of [-0.75, 0.75]) solid.box(B - 16, 0.15, 0.08, '#6e6e6e', cx, 0.2, tz + s);
        for (let x = -21; x <= 21; x += 0.8) flat.box(0.25, 0.1, 2.2, '#5a4636', cx + x, 0.06, tz);
      }
      // parked train: blue ICF coaches
      for (const x of [-11, 11]) {
        solid.box(21, 3.2, 3.1, '#2c4a7a', cx + x, 2.1, cz + 14);
        solid.box(21.05, 0.6, 3.15, '#e9e2d0', cx + x, 2.6, cz + 14);
        for (let w = -9; w <= 9; w += 1.5) solid.box(0.9, 0.55, 3.18, '#1d2630', cx + x + w, 2.6, cz + 14);
        solid.box(21, 0.3, 2.9, '#3b3b3b', cx + x, 3.8, cz + 14);
      }
      col.addCentered(cx, cz + 14, 44, 3.2, 'vehicle');
      const board = () => {
        const c = document.createElement('canvas'); c.width = 768; c.height = 300;
        const x = c.getContext('2d');
        x.fillStyle = '#f7d117'; x.fillRect(0, 0, 768, 300);
        x.strokeStyle = '#111'; x.lineWidth = 10; x.strokeRect(10, 10, 748, 280);
        x.fillStyle = '#111'; x.textAlign = 'center'; x.textBaseline = 'middle';
        x.font = '700 64px "Noto Sans Devanagari", sans-serif'; x.fillText('थेक्कुमपुरम', 384, 70);
        x.font = `700 64px ${FONT_ML}`; x.fillText(TOWN_ML, 384, 152);
        x.font = '800 66px "Baloo Chettan 2", sans-serif'; x.fillText(TOWN.toUpperCase(), 384, 236);
        const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
      };
      addSign('rlyboard', board, 5.6, 2.2, cx + 14, 2.6, oz + 9.6, 0, -1);
      for (const s of [-2.6, 2.6]) solid.box(0.15, 2.6, 0.15, '#222', cx + 14 + s, 1.3, oz + 9.7);
      addSign('rlyboard', board, 5.6, 2.2, cx - 10, 3, cz + 6.5, 0, -1);
    },
    jetty(ox, oz, cx) {
      solid.box(6, 0.3, 13, '#6b4a2e', cx, -0.05, zc0 + 6);
      for (let z = zc0 + 1; z <= zc0 + 12; z += 3) for (const s of [-2.8, 2.8]) solid.box(0.3, 1.6, 0.3, '#4a3020', cx + s, -0.5, z);
      roofHip(cx, 2.6, zc0 + 9, 7, 6, 1.4, '#ead0bd');
      for (const s of [-2.8, 2.8]) for (const z of [zc0 + 6.5, zc0 + 11.5]) solid.box(0.2, 2.6, 0.2, '#4a3020', cx + s, 1.3, z);
      // ferry
      solid.box(3, 1, 10, '#1d5fa8', cx + 6, -0.45, zc0 + 9);
      solid.box(2.6, 1.6, 7, '#f2f2ee', cx + 6, 0.8, zc0 + 9);
      solid.box(2.9, 0.15, 8, '#1d5fa8', cx + 6, 1.65, zc0 + 9);
      addSign('jetty', () => signTexture('ബോട്ട് ജെട്ടി', 'Boat Jetty · Ferry', '#0d47a1', '#ffffff'), 4.4, 1.2, cx, 2.1, zc0 - 0.2, 0, -1);
      for (const s of [-2, 2]) solid.box(0.15, 2.1, 0.15, '#333', cx + s, 1.05, zc0 - 0.15);
    },
    toddy(ox, oz, cx, cz) {
      flat.box(B - 16, 0.03, B - 16, '#9b8253', cx, 0.03, cz);
      const hx = cx - 6, hz = oz + 18;
      solid.box(10, 2.8, 7, '#7b4a2e', hx, 1.4, hz);
      roofHip(hx, 2.8, hz, 12.5, 9.5, 2.6, '#b59a55');
      col.addCentered(hx, hz, 10, 7, 'building');
      solid.box(2, 2.2, 0.1, '#2b1d14', hx, 1.1, hz - 3.52);
      addSign('toddy', () => signTexture('കള്ള് ഷാപ്പ്', 'Toddy Shop · Kappa & Meen Curry', '#fafafa', '#1b1b1b'), 6.5, 1.3, hx, 3.2, hz - 4.7, 0, -1);
      for (let k = 0; k < 5; k++) solid.box(1.8, 0.75, 0.9, '#6b4a2e', hx - 6 + k * 3, 0.38, hz - 7);
      for (let k = 0; k < 14; k++) palm(cx + (rand() - 0.2) * 34, cz + (rand() - 0.1) * 30, 1 + rand() * 0.3);
    },
    school(ox, oz, cx, cz) {
      flat.box(B - 16, 0.03, B - 16, '#b98a5c', cx, 0.03, cz);
      walls.add(wallBox(34, 7, 9), '#f3d36b', cx, 3.5, cz + 14);
      gable(cx, 7, cz + 14, 9, 34, false, 0.5, '#ead0bd');
      walls.add(wallBox(9, 7, 16), '#f3d36b', cx - 12.5, 3.5, cz + 1.5);
      gable(cx - 12.5, 7, cz + 1.5, 9, 16, true, 0.5, '#ead0bd');
      col.addCentered(cx, cz + 14, 34, 9, 'building'); col.addCentered(cx - 12.5, cz + 1.5, 9, 16, 'building');
      addSign('school', () => signTexture('ഗവ. എൽ.പി. സ്കൂൾ', 'Govt. L.P. School', '#1565c0', '#ffffff'), 9, 1.7, cx + 3, 5.3, cz + 9.45, 0, -1);
      solid.add(new THREE.CylinderGeometry(0.06, 0.08, 9, 8), '#ddd', cx + 8, 4.5, cz - 8);
      solid.box(1.8, 0.4, 0.02, '#ff9933', cx + 9, 8.5, cz - 8); solid.box(1.8, 0.4, 0.02, '#ffffff', cx + 9, 8.1, cz - 8); solid.box(1.8, 0.4, 0.02, '#138808', cx + 9, 7.7, cz - 8);
      col.addCentered(cx + 8, cz - 8, 0.4, 0.4);
      for (const s of [-1, 1]) { solid.box(0.12, 2.2, 0.12, '#fff', cx + 6 + s * 2.5, 1.1, cz + 4); }
      solid.box(5.1, 0.12, 0.12, '#fff', cx + 6, 2.2, cz + 4);
    },
    fishmarket(ox, oz, cx, cz) {
      flat.box(B - 16, 0.04, B - 16, '#8a8f8f', cx, 0.03, cz);
      for (const s of [-1, 1]) {
        const mz = cz + s * 9;
        solid.box(30, 0.15, 9, '#2f6fb3', cx, 3.6, mz, s * 0.08, 0, 0);
        for (let x = -14; x <= 14; x += 7) for (const dz of [-4, 4]) { solid.box(0.2, 3.6, 0.2, '#555', cx + x, 1.8, mz + dz); col.addCentered(cx + x, mz + dz, 0.4, 0.4); }
        for (let x = -12; x <= 12; x += 4) {
          solid.box(3, 0.9, 1.4, '#7a5a3a', cx + x, 0.45, mz);
          for (let f = 0; f < 5; f++) solid.box(0.55, 0.08, 0.16, '#b8c4cc', cx + x - 1 + f * 0.5, 0.95, mz + (f % 2 ? 0.3 : -0.3), 0, f, 0);
          col.addCentered(cx + x, mz, 3, 1.4);
        }
      }
      addSign('fish', () => signTexture('മീൻ ചന്ത', 'Fish Market', '#0277bd', '#ffffff'), 7, 1.3, cx, 4.6, cz - 13.6, 0, -1);
    },
  };

  for (const key in LANDMARKS) {
    const [i, j] = key.split(',').map(Number);
    const lm = LANDMARKS[key];
    const ox = gx(i), oz = gx(j);
    LB[lm.kind](ox, oz, ox + B / 2, oz + B / 2);
    // drop-off spot on the footpath nearest the landmark's front (south) road
    lmSpots[lm.kind] = lm.kind === 'jetty'
      ? { x: ox + B / 2 + 4, z: gx(CANAL_ROW) - 6.5, face: [0, 1], name: lm.name, ml: lm.ml, short: lm.short, shortMl: lm.shortMl }
      : { x: ox + B / 2 + 6, z: oz + 6.5, face: [0, -1], name: lm.name, ml: lm.ml, short: lm.short, shortMl: lm.shortMl };
  }

  // ---------------- Electric poles + wires ----------------
  const poleB = new Bucket();
  poleB.box(0.26, 8.6, 0.26, '#a9a59c', 0, 4.3, 0);
  poleB.box(1.8, 0.14, 0.14, '#6b6b6b', 0, 8.1, 0);
  for (const s of [-0.7, 0, 0.7]) poleB.add(new THREE.CylinderGeometry(0.05, 0.06, 0.2, 6), '#e8e8e8', s, 8.25, 0);
  const poleGeo = poleB.merge();
  const poles = [];
  const wirePts = [];
  for (let k = 0; k <= N; k++) {
    for (const vertical of [true, false]) {
      let off = k < N ? 7.3 : -7.3;
      if (!vertical && k === CANAL_ROW) off = -7.3;
      let prev = null;
      for (let m = 0; m < N; m++) for (const t of [10, 30, 50]) {
        const along = gx(m) + t;
        const x = vertical ? gx(k) + off : along, z = vertical ? along : gx(k) + off;
        const inCanal = z > gx(CANAL_ROW) && z < gx(CANAL_ROW + 1);
        if (inCanal) { prev = null; continue; }
        poles.push({ x, z, ry: vertical ? 0 : Math.PI / 2 });
        if (prand() < 0.3) {
          const sg = -Math.sign(off);
          if (vertical) posters.add(x + sg * 0.15, 2.2, z, sg, 0, 0.36, 0.52, Math.floor(prand() * posters.count), prand() < 0.6);
          else posters.add(x, 2.2, z + sg * 0.15, 0, sg, 0.36, 0.52, Math.floor(prand() * posters.count), prand() < 0.6);
        }
        col.addCentered(x, z, 0.35, 0.35, 'pole');
        if (prev) for (const s of [-0.7, 0, 0.7]) {
          const ax = vertical ? prev.x + s : prev.x, az = vertical ? prev.z : prev.z + s;
          const bx = vertical ? x + s : x, bz = vertical ? z : z + s;
          for (let q = 0; q < 8; q++) {
            const t0 = q / 8, t1 = (q + 1) / 8;
            const y0 = 8.3 - 0.7 * 4 * t0 * (1 - t0), y1 = 8.3 - 0.7 * 4 * t1 * (1 - t1);
            wirePts.push(ax + (bx - ax) * t0, y0, az + (bz - az) * t0, ax + (bx - ax) * t1, y1, az + (bz - az) * t1);
          }
        }
        prev = { x, z };
      }
    }
  }
  const poleMesh = new THREE.InstancedMesh(poleGeo, vcMat, poles.length);
  const tmp = new THREE.Object3D();
  poles.forEach((p, n) => { tmp.position.set(p.x, 0, p.z); tmp.rotation.set(0, p.ry, 0); tmp.scale.set(1, 1, 1); tmp.updateMatrix(); poleMesh.setMatrixAt(n, tmp.matrix); });
  poleMesh.castShadow = true;
  scene.add(poleMesh);

  // ---------------- Junction flex boards ----------------
  for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) {
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const bi = sx > 0 ? i : i - 1, bj = sz > 0 ? j : j - 1;
      if (bi < 0 || bj < 0 || bi >= N || bj >= N || !hasFootpath(bi, bj) || prand() > 0.4) continue;
      if (prand() < 0.18) milkBooth(gx(i) + sx * 7.1, gx(j) + sz * 7.1, -sx, -sz);
      else flex(gx(i) + sx * 7.3, 4.05, gx(j) + sz * 7.3, -sx, -sz, 2.8, 3.5, undefined, 5.8);
    }
  }

  // ---------------- Party flag bunting ----------------
  const electionWire = [];
  {
    const tri = new THREE.Shape(); tri.moveTo(-0.17, 0); tri.lineTo(0.17, 0); tri.lineTo(0, -0.34); tri.closePath();
    const triGeo = new THREE.ShapeGeometry(tri);
    // colour-coded to the fictional parties; election season strings them along almost every road
    const SCHEMES = PARTIES.map((p) => [p.col, p.col2 === '#ffffff' ? '#f6f6f2' : p.col2]);
    for (let k = 0; k <= N; k++) for (const vertical of [true, false]) {
      const forElection = prand() > 0.35;
      const target = forElection ? election.bunting : bunting;
      const scheme = SCHEMES[Math.floor(prand() * SCHEMES.length)];
      const off = (k < N ? 1 : -1) * 6.2;
      for (let m = 0; m < N; m++) {
        if (vertical && m === CANAL_ROW) continue;
        if (prand() > 0.6) continue;
        const a = gx(m) + 8, b = gx(m + 1) - 8;
        const P = (t) => vertical ? [gx(k) + off, a + (b - a) * t] : [a + (b - a) * t, gx(k) + off];
        const [x0, z0] = P(0), [x1, z1] = P(1);
        const ry = Math.atan2(-(z1 - z0), x1 - x0);
        let prevPt = null, c = 0;
        for (let t = 0; t <= 1.0001; t += 0.6 / (b - a)) {
          const [x, z] = P(t);
          const y = 5.6 - 0.9 * 4 * t * (1 - t);
          target.add(triGeo, scheme[c++ % scheme.length], x, y, z, 0, ry, 0);
          if (prevPt) (forElection ? electionWire : wirePts).push(...prevPt, x, y, z);
          prevPt = [x, y, z];
        }
      }
    }
  }

  const wireGeo = new THREE.BufferGeometry();
  wireGeo.setAttribute('position', new THREE.Float32BufferAttribute(wirePts, 3));
  scene.add(new THREE.LineSegments(wireGeo, new THREE.LineBasicMaterial({ color: '#1a1a1a', transparent: true, opacity: 0.7 })));

  // ---------------- Traffic signals ----------------
  const signals = [];
  const lampGeo = new THREE.SphereGeometry(0.13, 10, 8);
  for (const [i, j] of SIGNALS) {
    const x = gx(i), z = gx(j);
    const mk = (c) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0 });
    const mats = { x: { R: mk('#ff2a1a'), Y: mk('#ffb300'), G: mk('#18e05a') }, z: { R: mk('#ff2a1a'), Y: mk('#ffb300'), G: mk('#18e05a') } };
    for (const [fx, fz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const lx = fz, lz = -fx;
      const px = x - fx * 9.6 + lx * 6.4, pz = z - fz * 9.6 + lz * 6.4;
      solid.add(new THREE.CylinderGeometry(0.09, 0.11, 4.2, 8), '#3a3a3a', px, 2.1, pz);
      solid.box(0.42, 1.15, 0.36, '#151515', px, 4.0, pz);
      col.addCentered(px, pz, 0.4, 0.4, 'pole');
      const axis = fx ? 'x' : 'z';
      [['R', 4.36], ['Y', 4.0], ['G', 3.64]].forEach(([c, y]) => {
        const l = new THREE.Mesh(lampGeo, mats[axis][c]);
        l.position.set(px - fx * 0.19, y, pz - fz * 0.19);
        scene.add(l);
      });
    }
    signals.push({
      i, j, x, z, mats, offset: rand() * 20,
      state(axis, t) {
        const c = (t + this.offset) % 20;
        if (axis === 'x') return c < 8 ? 'G' : c < 10 ? 'Y' : 'R';
        return c < 10 ? 'R' : c < 18 ? 'G' : 'Y';
      },
    });
  }

  // ---------------- Road signs ----------------
  const roundSign = (txt, ring, bg = '#ffffff', fg = '#111') => () => {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const x = c.getContext('2d');
    x.fillStyle = ring; x.beginPath(); x.arc(128, 128, 126, 0, Math.PI * 2); x.fill();
    x.fillStyle = bg; x.beginPath(); x.arc(128, 128, 100, 0, Math.PI * 2); x.fill();
    x.fillStyle = fg; x.textAlign = 'center'; x.textBaseline = 'middle';
    if (txt === '—') { x.fillStyle = '#fff'; x.fillRect(48, 108, 160, 40); }
    else { x.font = '800 110px "Baloo Chettan 2", sans-serif'; x.fillText(txt, 128, 136); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  };
  const roadSign = (key, make, w, h, x, z, nx, nz) => {
    solid.box(0.1, 2.6, 0.1, '#555', x, 1.3, z);
    addSign(key, make, w, h, x + nx * 0.07, 2.6, z + nz * 0.07, nx, nz);
    col.addCentered(x, z, 0.3, 0.3, 'pole');
  };
  // speed limit 40 at each edge of the map entering town and a few inside
  for (let k = 1; k < N; k += 2) {
    roadSign('slimit', roundSign(String(SPEED_LIMIT), '#d32f2f'), 1, 1, gx(k) + 6.6, gx(0) + 12, 0, -1);
    roadSign('slimit', roundSign(String(SPEED_LIMIT), '#d32f2f'), 1, 1, gx(k) - 6.6, gx(N) - 12, 0, 1);
  }
  const owTex = () => {
    const c = document.createElement('canvas'); c.width = 256; c.height = 96;
    const x = c.getContext('2d');
    x.fillStyle = '#0d47a1'; x.fillRect(0, 0, 256, 96);
    x.fillStyle = '#fff'; x.font = '800 40px "Baloo Chettan 2", sans-serif'; x.textBaseline = 'middle';
    x.fillText('ONE WAY', 18, 50);
    x.beginPath(); x.moveTo(190, 30); x.lineTo(240, 48); x.lineTo(190, 66); x.fill(); x.fillRect(176, 42, 20, 12);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  };
  const noEntry = roundSign('—', '#d32f2f', '#d32f2f');
  for (const k in ONE_WAY_ROWS) {
    const z = gx(+k), dir = ONE_WAY_ROWS[k];
    for (let m = 0; m < N; m++) {
      const start = dir > 0 ? gx(m) : gx(m + 1), end = dir > 0 ? gx(m + 1) : gx(m);
      // ONE WAY on traffic's left (−z side for +x travel), facing oncoming traffic
      roadSign('oneway', owTex, 1.6, 0.6, start + dir * 10, z - dir * 6.6, -dir, 0);
      roadSign('noentry', noEntry, 0.9, 0.9, end - dir * 10, z + dir * 6.6, dir, 0);
    }
  }
  for (const k in ONE_WAY_COLS) {
    const x = gx(+k), dir = ONE_WAY_COLS[k];
    for (let m = 0; m < N; m++) {
      if (m === CANAL_ROW) continue;
      const start = dir > 0 ? gx(m) : gx(m + 1), end = dir > 0 ? gx(m + 1) : gx(m);
      roadSign('oneway', owTex, 1.6, 0.6, x + dir * 6.6, start + dir * 10, 0, -dir);
      roadSign('noentry', noEntry, 0.9, 0.9, x - dir * 6.6, end - dir * 10, 0, dir);
    }
  }

  // ---------------- Outskirts ----------------
  for (let n = 0; n < 220; n++) {
    const x = (rand() - 0.5) * 2 * (BOUND - 2), z = (rand() - 0.5) * 2 * (BOUND - 2);
    if (Math.abs(x) < HALF + 9 && Math.abs(z) < HALF + 9) continue;
    if (z > zc0 - 3 && z < zc1 + 3) continue;
    palm(x, z);
  }
  for (let n = 0; n < 700; n++) {
    const a = rand() * Math.PI * 2, r = BOUND + 8 + rand() * 260;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (z > zc0 - 3 && z < zc1 + 3) continue;
    palm(x, z, 0.9 + rand() * 0.5, false);
  }
  // boundary walls (invisible)
  col.add(-BOUND - 10, -BOUND - 10, BOUND + 10, -BOUND);
  col.add(-BOUND - 10, BOUND, BOUND + 10, BOUND + 10);
  col.add(-BOUND - 10, -BOUND, -BOUND, BOUND);
  col.add(BOUND, -BOUND, BOUND + 10, BOUND);
  // Western Ghats on the horizon
  const hillB = new Bucket();
  for (let n = 0; n < 46; n++) {
    const a = (n / 46) * Math.PI * 2 + rand() * 0.1, r = 700 + rand() * 260;
    const h = 60 + rand() * 120;
    hillB.add(new THREE.ConeGeometry(110 + rand() * 120, h, 7), rand() < 0.5 ? '#3f6b3a' : '#4d7a45', Math.cos(a) * r, h / 2 - 4, Math.sin(a) * r, 0, rand() * 3, 0);
  }
  const hills = new THREE.Mesh(hillB.merge(), new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 }));
  scene.add(hills);

  // ---------------- Street life & props ----------------
  const props = buildProps({ scene, solid, lat, col, addSign, canvasTex, prand, shops, lmSpots, signals, alleys, poles, zc0, zc1, roofHip });

  // ---------------- Commit meshes ----------------
  const posterMeshes = { fictional: [], real: [] };
  for (const set of [posters, politics, ads]) {
    const m = set.meshes();
    for (const k of ['fictional', 'real']) if (m[k]) { scene.add(m[k]); posterMeshes[k].push(m[k]); }
  }
  for (const m of posterMeshes.real) m.visible = false;
  // election-season layer
  const electionGroup = new THREE.Group();
  if (!election.bunting.empty) electionGroup.add(election.bunting.mesh(new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.8 }), { receive: false }));
  for (const [, g] of election.signs) electionGroup.add(new THREE.Mesh(g.bucket.merge(), new THREE.MeshStandardMaterial({ map: g.tex, roughness: 0.6 })));
  { const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.Float32BufferAttribute(electionWire, 3)); electionGroup.add(new THREE.LineSegments(wg, new THREE.LineBasicMaterial({ color: '#1a1a1a', transparent: true, opacity: 0.7 }))); }
  if (!election.poles.empty) electionGroup.add(election.poles.mesh(vcMat));
  electionGroup.visible = false;
  scene.add(electionGroup);
  if (!bunting.empty) scene.add(bunting.mesh(new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.8 }), { receive: false }));
  scene.add(walls.mesh(mats.walls));
  scene.add(roofs.mesh(mats.roof));
  scene.add(lat.mesh(mats.laterite));
  scene.add(plas.mesh(mats.plaster));
  scene.add(pave.mesh(mats.pave, { cast: false }));
  scene.add(solid.mesh(vcMat));
  scene.add(flat.mesh(vcMat, { cast: false }));
  const markMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2 });
  scene.add(marks.mesh(markMat, { cast: false }));
  const signMats = [];
  for (const [, g] of signGroups) {
    // signs glow faintly at night, as if lit by the shop's tube light
    const m = new THREE.Mesh(g.bucket.merge(), new THREE.MeshStandardMaterial({ map: g.tex, roughness: 0.55, emissiveMap: g.tex, emissive: '#ffffff', emissiveIntensity: 0 }));
    signMats.push(m.material);
    m.castShadow = true;
    scene.add(m);
  }
  // coconut palms and banana leaves sway in the breeze (much harder in a monsoon gust)
  const swayU = { uTime: { value: 0 }, uWind: { value: 0.35 } };
  const swayMat = (ref, amp) => {
    const m = vcMat.clone();
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = swayU.uTime; sh.uniforms.uWind = swayU.uWind;
      sh.vertexShader = 'uniform float uTime; uniform float uWind;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec3 ip = vec3(instanceMatrix[3][0], 0.0, instanceMatrix[3][2]);
        #else
          vec3 ip = vec3(0.0);
        #endif
        float ph = ip.x * 0.13 + ip.z * 0.07;
        float hk = pow(max(transformed.y, 0.0) / ${ref.toFixed(1)}, 2.0) * ${amp.toFixed(2)};
        float gust = sin(uTime * 0.7 + ph * 0.3) * 0.5 + 0.5;
        transformed.x += (sin(uTime * 1.3 + ph) * 0.45 + sin(uTime * 2.3 + ph * 1.7) * 0.18 + gust * 0.6 * uWind) * hk * uWind;
        transformed.z += cos(uTime * 1.05 + ph) * 0.3 * hk * uWind;`);
    };
    return m;
  };
  const palmMat = swayMat(10, 0.9), bananaMat = swayMat(2.4, 0.18);
  for (let v = 0; v < 3; v++) {
    const list = palms.filter((p) => p.v === v);
    const im = new THREE.InstancedMesh(palmGeometry(v), palmMat, list.length);
    list.forEach((p, n) => { tmp.position.set(p.x, 0, p.z); tmp.rotation.set(0, p.ry, 0); tmp.scale.setScalar(p.s); tmp.updateMatrix(); im.setMatrixAt(n, tmp.matrix); });
    im.castShadow = true;
    scene.add(im);
  }
  for (let i = bananas.length - 1; i >= 0; i--) if (onRoad(bananas[i].x, bananas[i].z, 1)) bananas.splice(i, 1);
  const bim = new THREE.InstancedMesh(bananaGeometry(), bananaMat, bananas.length);
  bananas.forEach((p, n) => { tmp.position.set(p.x, 0, p.z); tmp.rotation.set(0, p.ry, 0); tmp.scale.setScalar(p.s); tmp.updateMatrix(); bim.setMatrixAt(n, tmp.matrix); });
  bim.castShadow = true;
  scene.add(bim);

  // ---------------- Monsoon puddles (only show when it's wet) ----------------
  const pud = new Bucket();
  const disc = new THREE.CircleGeometry(1, 20);
  for (let n = 0; n < 170; n++) {
    const k = Math.floor(prand() * (N + 1)), along = -HALF + prand() * HALF * 2, lat = (prand() < 0.5 ? -1 : 1) * (1.4 + prand() * 3.2);
    const vertical = prand() < 0.5;
    const z0 = vertical ? along : gx(k) + lat;
    if (z0 > zc0 - 1 && z0 < zc1 + 1) continue;
    pud.add(disc, '#ffffff', vertical ? gx(k) + lat : along, 0.03, z0, -Math.PI / 2, 0, prand() * 3, 0.8 + prand() * 2.2, 0.5 + prand() * 1.1, 1);
  }
  const puddleMat = new THREE.MeshStandardMaterial({ color: '#23282b', roughness: 0.03, metalness: 0.15, transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, envMapIntensity: 1.6 });
  const puddles = pud.mesh(puddleMat, { cast: false });
  puddles.visible = false;
  scene.add(puddles);

  // ---------------- Queries ----------------
  function zoneAt(x, z) {
    if (Math.abs(x) > HALF + ROAD_HALF || Math.abs(z) > HALF + ROAD_HALF) return 'grass';
    const i = Math.min(N - 1, Math.max(0, Math.floor((x + HALF) / B)));
    const j = Math.min(N - 1, Math.max(0, Math.floor((z + HALF) / B)));
    const lx = x - gx(i), lz = z - gx(j);
    if (lx < ROAD_HALF || lx > B - ROAD_HALF || lz < ROAD_HALF || lz > B - ROAD_HALF) return 'road';
    if (isWaterBlock(i, j)) return 'grass';
    const kind = blockKind(i, j);
    if (kind === 'paddy') return 'paddy';
    const alley = alleys.has(`${i},${j}`) && Math.abs(lx - B / 2) < 2.6;
    if (lx < 8 || lx > B - 8 || lz < 8 || lz > B - 8) return alley ? 'alley' : 'footpath';
    return alley ? 'alley' : 'yard';
  }

  function setRain() { /* wetness is driven smoothly through setWet() */ }
  function setWet(w) { mats.setWet(w); puddleMat.opacity = 0.85 * w; puddles.visible = w > 0.02; }
  function setWind(w) { swayU.uWind.value = w; }
  function setNight(n) { mats.setNight(n); for (const m of signMats) m.emissiveIntensity = n * 0.4; props.setNight?.(n); }

  function update(t, dt) {
    for (const s of signals) for (const axis of ['x', 'z']) {
      const st = s.state(axis, t);
      for (const c of ['R', 'Y', 'G']) s.mats[axis][c].emissiveIntensity = st === c ? 3.2 : 0.02;
    }
    for (const a of animated) a(t, dt);
    swayU.uTime.value = t;
    props.update(t, dt);
  }

  return { setNight, props, shops, posterMeshes, electionGroup, setWind, setWet, mats, posterSpots: posters.spots, politicalSpots: politics.spots, colliders: col, zoneAt, alleys, signals, lmSpots, setRain, update, canal: [zc0, zc1] };
}
