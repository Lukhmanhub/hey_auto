import * as THREE from 'three';
import { N, B, HALF, BOUND, LANDMARKS, gx, blockKind, hasFootpath } from './config.js';
import { Bucket, signTexture, FONT_PAINT } from './util.js';
import { onRoad } from './world.js';
import { vcMat, makePerson, poseSeated, autoGeometry, autoBackDecals, AUTO_NAMES, randomPlate, shadeTreeGeometry, bushGeometry } from './models.js';
import { ADS } from './prints.js';

const Box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const Cyl = (a, b, h, s = 12) => new THREE.CylinderGeometry(a, b, h, s);

// Street furniture, small businesses, nature, religious details and the
// day-event layers (hartal shutters, festival decorations, Christmas stars).
export function buildProps(ctx) {
  const { scene, solid, lat, col, addSign, canvasTex, prand, shops, lmSpots, signals, alleys, poles, zc0, zc1, roofHip } = ctx;
  const updates = [];
  const people = [];
  const groups = { festival: new THREE.Group(), christmas: new THREE.Group(), hartal: new THREE.Group() };
  const fest = new Bucket();
  const blockOrigin = (key) => { const [i, j] = key.split(',').map(Number); return [gx(i), gx(j)]; };
  const lmKey = (kind) => Object.keys(LANDMARKS).find((k) => LANDMARKS[k].kind === kind);
  const standing = (x, z, ry, kind = '', pose) => {
    const p = makePerson(prand, kind);
    p.group.position.set(x, 0.16, z); p.group.rotation.y = ry;
    if (pose === 'sit') { poseSeated(p); p.group.position.y = p.anim ? 0.05 : -0.3; }
    if (pose === 'talk' && p.anim) p.anim.talk();
    if (pose === 'paper') { p.armL.rotation.x = p.armR.rotation.x = -1.3; const n = new THREE.Mesh(Box(0.55, 0.38, 0.01), new THREE.MeshStandardMaterial({ map: newspaperTex(), roughness: 0.9 })); n.position.set(0, 1.4, 0.42); n.rotation.x = -0.2; p.group.add(n); }
    scene.add(p.group); people.push(p);
    return p;
  };

  // ---------------- speed humps near schools, temples, hospitals ----------------
  const humps = [];
  for (const kind of ['school', 'temple', 'hospital', 'church', 'mosque', 'fishmarket', 'busstand']) {
    const [ox, oz] = blockOrigin(lmKey(kind));
    for (const x of [ox + 12, ox + B - 12]) {
      solid.box(0.9, 0.12, 9.6, '#3a3a3a', x, 0.06, oz);
      for (let k = 0; k < 8; k++) solid.box(0.92, 0.01, 0.6, k % 2 ? '#1b1b1b' : '#f2c200', x, 0.125, oz - 4.2 + k * 1.2);
      humps.push({ x0: x - 0.5, x1: x + 0.5, z0: oz - 5, z1: oz + 5 });
    }
  }

  // ---------------- post boxes, milestones ----------------
  for (let n = 0; n < 8; n++) {
    const i = 1 + Math.floor(prand() * (N - 2)), j = Math.floor(prand() * N);
    if (!hasFootpath(i, j)) continue;
    const x = gx(i) + 40, z = gx(j) + 6.9;
    solid.add(Cyl(0.27, 0.27, 1.0, 16), '#c4161c', x, 0.66, z);
    solid.add(new THREE.SphereGeometry(0.3, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), '#c4161c', x, 1.16, z);
    solid.box(0.24, 0.04, 0.05, '#111', x, 1.0, z - 0.26); solid.box(0.18, 0.12, 0.02, '#f4f4f0', x, 0.75, z - 0.27);
    col.addCentered(x, z, 0.6, 0.6, 'pole');
  }
  const milestone = (x, z, ry, ml, en) => {
    solid.box(0.42, 0.55, 0.16, '#f4f2ec', x, 0.28, z, 0, ry, 0);
    solid.add(new THREE.CylinderGeometry(0.21, 0.21, 0.165, 16, 1, false, -Math.PI / 2, Math.PI), '#f2c200', x, 0.55, z, Math.PI / 2, ry, Math.PI / 2, 1, 1, 1, 'YXZ');
    addSign(`ms${en}`, () => { const c = document.createElement('canvas'); c.width = 128; c.height = 160; const x2 = c.getContext('2d'); x2.fillStyle = '#f4f2ec'; x2.fillRect(0, 0, 128, 160); x2.fillStyle = '#111'; x2.textAlign = 'center'; x2.font = `700 30px ${FONT_PAINT}`; x2.fillText(ml, 64, 50, 120); x2.font = '800 22px "Baloo Chettan 2"'; x2.fillText(en, 64, 92, 120); x2.font = '800 40px "Baloo Chettan 2"'; x2.fillText(String(12 + (en.length * 7) % 40), 64, 138); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; }, 0.38, 0.46, x + Math.sin(ry) * 0.085, 0.3, z + Math.cos(ry) * 0.085, Math.sin(ry), Math.cos(ry));
    col.addCentered(x, z, 0.45, 0.45, 'pole');
  };
  milestone(gx(1) + 6.6, -HALF + 14, 0, 'കൊച്ചി', 'KOCHI');
  milestone(gx(5) - 6.6, HALF - 14, Math.PI, 'ആലപ്പുഴ', 'ALAPPUZHA');
  milestone(-HALF + 14, gx(3) - 6.6, -Math.PI / 2, 'തൃശ്ശൂർ', 'THRISSUR');
  milestone(HALF - 14, gx(6) + 6.6, Math.PI / 2, 'കോട്ടയം', 'KOTTAYAM');

  // ---------------- bus shelters (sponsor painted on the back wall) ----------------
  const SPONSORS = [
    ['സ്വർണ്ണമുദ്ര ജ്വല്ലേഴ്സ്', 'Sponsored by Swarnamudra Jewellers', '#8c1026', '#f2c94c'],
    ['തെക്കുംപുറം കുറീസ്', 'Chitty · Gold Loan — Sponsored', '#1a237e', '#ffffff'],
    ['മംഗല്യ സിൽക്സ്', 'Wedding Sarees — Sponsored', '#4a148c', '#ffe082'],
    ['ലയൺസ് ക്ലബ്ബ് തെക്കുംപുറം', 'Bus shelter donated 2019', '#0d47a1', '#ffd54f'],
  ];
  let shelters = 0;
  for (let i = 0; i < N && shelters < 6; i++) for (let j = 0; j < N && shelters < 6; j++) {
    if (blockKind(i, j) !== 'town' || prand() > 0.28) continue;
    const x = gx(i) + 21, z = gx(j) + 6.9, sp = SPONSORS[shelters % SPONSORS.length];
    solid.box(4.6, 0.12, 2.4, '#8e979b', x, 2.65, z + 0.2, -0.08, 0, 0);
    for (const dx of [-2.1, 2.1]) solid.box(0.12, 2.6, 0.12, '#5b5b58', x + dx, 1.3, z + 1.1);
    solid.box(4.6, 2.2, 0.12, sp[2], x, 1.2, z + 1.2);
    addSign(`shelter${shelters % SPONSORS.length}`, () => signTexture(sp[0], sp[1], sp[2], sp[3], 640, 220, FONT_PAINT), 4.3, 1.45, x, 1.55, z + 1.13, 0, -1);
    solid.box(3.6, 0.08, 0.45, '#8a6a44', x, 0.6, z + 0.8);
    col.add(x - 2.3, z + 1.05, x + 2.3, z + 1.3, 'wall');
    standing(x - 0.8, z + 0.3, Math.PI, '');
    if (prand() < 0.6) standing(x + 1.0, z + 0.4, Math.PI - 0.4, 'kid');
    shelters++;
  }

  // ---------------- drains with slab covers along some footpaths ----------------
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    if (!hasFootpath(i, j) || prand() > 0.35) continue;
    const z = gx(j) + 7.35, x0 = gx(i) + 6, x1 = gx(i) + B - 6;
    for (let x = x0; x < x1 - 1; x += 1.05) {
      if (prand() < 0.07) { solid.box(0.95, 0.02, 0.9, '#121614', x + 0.5, 0.165, z); continue; }   // a missing slab: watch your step
      solid.box(0.98, 0.04, 0.95, prand() < 0.5 ? '#9a958c' : '#8c877e', x + 0.5, 0.18, z);
    }
  }

  // ---------------- tangled cables + crows on the wires ----------------
  const cable = [];
  const crows = new Bucket();
  const crow = (x, y, z, ry) => {
    crows.add(new THREE.SphereGeometry(1, 8, 6), '#111', x, y + 0.1, z, 0, ry, 0, 0.09, 0.09, 0.17);
    crows.add(new THREE.SphereGeometry(0.06, 8, 6), '#1b1b1b', x + Math.sin(ry) * 0.14, y + 0.18, z + Math.cos(ry) * 0.14);
    crows.add(new THREE.ConeGeometry(0.02, 0.07, 5), '#555', x + Math.sin(ry) * 0.21, y + 0.17, z + Math.cos(ry) * 0.21, Math.PI / 2, ry, 0, 1, 1, 1, 'YXZ');
  };
  for (let k = 0; k + 1 < poles.length; k++) {
    const a = poles[k], b = poles[k + 1];
    const d = Math.hypot(a.x - b.x, a.z - b.z);
    if (d > 22) continue;
    // a couple of slack cable-TV / broadband lines with more sag than the power lines
    for (let w = 0; w < 2; w++) {
      if (prand() > 0.55) continue;
      const off = (prand() - 0.5) * 0.6, sag = 1.2 + prand() * 1.4, y0 = 6.6 + prand() * 0.8;
      for (let q = 0; q < 10; q++) {
        const t0 = q / 10, t1 = (q + 1) / 10;
        const P = (t) => [a.x + (b.x - a.x) * t + (a.ry ? 0 : off), y0 - sag * 4 * t * (1 - t), a.z + (b.z - a.z) * t + (a.ry ? off : 0)];
        cable.push(...P(t0), ...P(t1));
      }
    }
    if (prand() < 0.3) for (let n = 0; n < 1 + Math.floor(prand() * 3); n++) {
      const t = 0.2 + prand() * 0.6;
      crow(a.x + (b.x - a.x) * t, 8.3 - 0.7 * 4 * t * (1 - t) - 0.05, a.z + (b.z - a.z) * t + (prand() - 0.5) * 0.2, a.ry ? 0 : Math.PI / 2 + (prand() < 0.5 ? Math.PI : 0));
    }
  }
  for (const p of poles) {
    if (prand() > 0.3) continue;
    // a coil of spare cable lashed to the pole
    solid.add(new THREE.TorusGeometry(0.32, 0.03, 6, 18), '#141414', p.x, 6.2, p.z, Math.PI / 2 + 0.3, p.ry, 0, 1, 1, 1, 'YXZ');
    solid.add(new THREE.TorusGeometry(0.28, 0.03, 6, 18), '#141414', p.x, 6.25, p.z, Math.PI / 2 - 0.2, p.ry, 0, 1, 1, 1, 'YXZ');
    solid.box(0.3, 0.42, 0.18, '#d9d9d4', p.x, 5.2, p.z + 0.18);   // junction box
  }
  const cg = new THREE.BufferGeometry(); cg.setAttribute('position', new THREE.Float32BufferAttribute(cable, 3));
  scene.add(new THREE.LineSegments(cg, new THREE.LineBasicMaterial({ color: '#111', transparent: true, opacity: 0.6 })));
  if (!crows.empty) scene.add(crows.mesh(vcMat, { receive: false }));

  // ---------------- lottery sellers ----------------
  for (let n = 0; n < 7; n++) {
    const i = Math.floor(prand() * N), j = Math.floor(prand() * N);
    if (!hasFootpath(i, j)) continue;
    const x = gx(i) + 40, z = gx(j) + B - 6.9;
    solid.box(1.1, 0.06, 0.6, '#8a6a44', x, 0.85, z); for (const dx of [-0.48, 0.48]) solid.box(0.05, 0.7, 0.5, '#5b4636', x + dx, 0.5, z);
    for (let r = 0; r < 4; r++) solid.box(0.95, 0.01, 0.1, ['#ffeb3b', '#ff80ab', '#80deea', '#c5e1a5'][r], x, 0.885, z - 0.22 + r * 0.14);
    solid.add(Cyl(0.02, 0.02, 2.2, 6), '#ddd', x + 0.6, 1.2, z);
    for (let k = 0; k < 12; k++) solid.add(new THREE.ConeGeometry(1.2, 0.5, 1, 1, true, (k / 12) * Math.PI * 2, Math.PI * 2 / 12), k % 2 ? '#e53935' : '#f4f4f0', x + 0.6, 2.4, z);
    addSign('bumper', () => canvasTex((c, w, h) => ADS[14](c, w, h), 384, 480), 0.55, 0.7, x - 0.75, 1.0, z - 0.32, 0, -1);
    solid.box(0.04, 0.6, 0.04, '#333', x - 0.75, 0.3, z - 0.3);
    standing(x, z + 0.55, Math.PI, '', 'sit');
    col.addCentered(x, z, 1.3, 1.2, 'wall');
  }

  // ---------------- auto stands (bus stand and railway station) ----------------
  for (const kind of ['busstand', 'railway']) {
    const [ox, oz] = blockOrigin(lmKey(kind));
    const cx = ox + B / 2, z = oz + 11.5;
    for (let k = 0; k < 4; k++) {
      const x = cx - 20 + k * 2.2;
      const m = new THREE.Mesh(autoGeometry(k % 2 ? '#2e7d32' : '#f4c20d', k % 2 ? '#f4c20d' : '#151515'), vcMat);
      m.position.set(x, 0.03, z); m.rotation.y = Math.PI; m.castShadow = true;
      m.add(autoBackDecals(AUTO_NAMES[(k + 3) % AUTO_NAMES.length], randomPlate(prand)));
      scene.add(m); col.addCentered(x, z, 1.4, 2.6, 'vehicle');
    }
    addSign(`astand${kind}`, () => signTexture('ഓട്ടോ സ്റ്റാൻഡ്', 'Auto Stand · Prepaid', '#f2c200', '#111', 512, 160, FONT_PAINT), 2.4, 0.75, cx - 23.5, 2.1, z - 1.0, 0, -1);
    solid.box(0.08, 2.1, 0.08, '#333', cx - 23.5, 1.05, z - 0.95);
    standing(cx - 11.0, z - 0.3, -2.3, '', 'talk');
    standing(cx - 10.2, z - 1.0, 0.9, '', 'talk');
    standing(cx - 12.2, z + 0.4, Math.PI, '', 'paper');
  }

  // ---------------- traffic police in khaki on a junction platform ----------------
  const tp = signals[0];
  solid.add(Cyl(0.65, 0.75, 0.35, 18), '#f4f4f0', tp.x, 0.18, tp.z);
  for (let k = 0; k < 6; k++) solid.add(Cyl(0.66, 0.66, 0.05, 18), k % 2 ? '#1b1b1b' : '#f4f4f0', tp.x, 0.05 + k * 0.05, tp.z);
  solid.add(Cyl(0.03, 0.03, 2.4, 6), '#666', tp.x + 0.45, 1.4, tp.z);
  for (let k = 0; k < 8; k++) solid.add(new THREE.ConeGeometry(1.1, 0.45, 1, 1, true, (k / 8) * Math.PI * 2, Math.PI / 4), k % 2 ? '#c62828' : '#f4f4f0', tp.x + 0.45, 2.75, tp.z);
  col.addCentered(tp.x, tp.z, 1.3, 1.3, 'pole');
  const cop = standing(tp.x, tp.z, 0, 'police');
  cop.group.position.y = 0.35;
  updates.push((t) => {
    const ph = Math.floor(t / 4) % 2;            // faces each axis in turn, waving traffic through
    cop.group.rotation.y = ph ? Math.PI / 2 : 0;
    if (cop.anim) { cop.anim.hail(true); return; }
    cop.armR.rotation.z = -1.4; cop.armR.rotation.x = Math.sin(t * 3) * 0.6;
    cop.armL.rotation.x = 0; cop.legL.rotation.x = cop.legR.rotation.x = 0;
  });

  // ---------------- shade trees & flowering bushes ----------------
  const trees = { jack: [], mango: [] }, bushes = { hib: [], jas: [] };
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    if (blockKind(i, j) !== 'town') continue;
    const cx = gx(i) + B / 2, cz = gx(j) + B / 2;
    const alley = alleys.has(`${i},${j}`);
    if (!alley && prand() < 0.75) { const x = cx + 4.5, z = cz - 4; (prand() < 0.5 ? trees.jack : trees.mango).push([x, z, 0.8 + prand() * 0.35]); col.addCentered(x, z, 0.9, 0.9, 'tree'); }
    for (let k = 0; k < 3; k++) (prand() < 0.6 ? bushes.hib : bushes.jas).push([cx + (prand() - 0.5) * 8, cz + (prand() - 0.5) * 8, 0.7 + prand() * 0.5]);
  }
  for (let n = 0; n < 40; n++) {
    const a = prand() * Math.PI * 2, r = BOUND + 20 + prand() * 200, x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (z > zc0 - 4 && z < zc1 + 4) continue;
    (prand() < 0.5 ? trees.jack : trees.mango).push([x, z, 1 + prand() * 0.5]);
  }
  const tmp = new THREE.Object3D();
  for (const l of [trees.jack, trees.mango, bushes.hib, bushes.jas]) for (let i = l.length - 1; i >= 0; i--) if (onRoad(l[i][0], l[i][1], 2)) l.splice(i, 1);
  const inst = (geo, list) => { if (!list.length) return; const im = new THREE.InstancedMesh(geo, vcMat, list.length); list.forEach(([x, z, s], k) => { tmp.position.set(x, 0, z); tmp.rotation.set(0, k * 1.7, 0); tmp.scale.setScalar(s); tmp.updateMatrix(); im.setMatrixAt(k, tmp.matrix); }); im.castShadow = true; scene.add(im); };
  inst(shadeTreeGeometry('jack'), trees.jack); inst(shadeTreeGeometry('mango'), trees.mango);
  inst(bushGeometry('#d81b2c'), bushes.hib); inst(bushGeometry('#fbfbf2'), bushes.jas);

  // ---------------- temple: gopuram, pond, nilavilakku, pookalam ----------------
  {
    const [ox, oz] = blockOrigin(lmKey('temple')); const cx = ox + B / 2, cz = oz + B / 2, loz = oz + 9;
    solid.box(7.5, 2.0, 2.8, '#efe6d2', cx, 6.0, loz);                      // gopuram upper storey
    for (let k = -3; k <= 3; k++) solid.box(0.5, 0.9, 0.05, '#4a3020', cx + k * 0.95, 6.0, loz - 1.43);
    roofHip(cx, 7.0, loz, 9.5, 4.2, 2.4, '#ead0bd');
    solid.add(Cyl(0.1, 0.2, 0.9, 10), '#d4a017', cx, 9.9, loz);
    // temple pond (kulam) with laterite steps
    const px = ox + B - 15, pz = oz + B - 15;
    for (let k = 0; k < 4; k++) lat.box(10 - k * 1.4, 0.3, 10 - k * 1.4, '#ffffff', px, 0.05 - k * 0.3, pz);
    const water = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 5.2), new THREE.MeshStandardMaterial({ color: '#2f5f52', roughness: 0.08, metalness: 0.1 }));
    water.rotation.x = -Math.PI / 2; water.position.set(px, -0.75, pz); scene.add(water);
    col.addCentered(px, pz, 10, 10, 'water');
    // nilavilakku: tall brass lamps with real little flames (bloom makes them glow)
    const flameMat = new THREE.MeshBasicMaterial({ color: '#ffb347' });
    const flames = [];
    for (const dx of [-3.2, 3.2]) {
      const lx = cx + dx, lz = cz - 3.4;
      solid.add(Cyl(0.35, 0.45, 0.12, 14), '#b8860b', lx, 0.06, lz);
      solid.add(Cyl(0.05, 0.08, 1.3, 10), '#c99a2e', lx, 0.75, lz);
      solid.add(Cyl(0.32, 0.12, 0.12, 14), '#c99a2e', lx, 1.42, lz);
      solid.add(new THREE.ConeGeometry(0.08, 0.3, 8), '#c99a2e', lx, 1.62, lz);
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2, f = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.12, 6), flameMat);
        f.position.set(lx + Math.cos(a) * 0.28, 1.54, lz + Math.sin(a) * 0.28); scene.add(f); flames.push(f);
      }
      col.addCentered(lx, lz, 0.8, 0.8, 'pole');
    }
    updates.push((t) => flames.forEach((f, k) => { f.scale.y = 1 + Math.sin(t * 13 + k * 1.7) * 0.25 + Math.sin(t * 29 + k) * 0.1; }));
    // pookalam: flower carpet in front of the gopuram, festival day only
    const pk = new THREE.Mesh(new THREE.CircleGeometry(2.6, 48), new THREE.MeshStandardMaterial({ map: pookalamTex(), roughness: 0.95 }));
    pk.rotation.x = -Math.PI / 2; pk.position.set(cx, 0.05, loz + 4.5); groups.festival.add(pk);
    // marigold garlands strung across the temple road
    for (const dx of [-14, 0, 14]) for (let k = 0; k <= 24; k++) {
      const t = k / 24, y = 5.6 - 1.2 * 4 * t * (1 - t);
      fest.add(new THREE.SphereGeometry(0.11, 6, 5), k % 3 ? '#ff8f00' : '#ffd54f', cx + dx, y, oz - 6 + t * 12);
    }
  }

  // ---------------- church grotto, mosque minaret bands ----------------
  {
    const [ox, oz] = blockOrigin(lmKey('church')); const gx0 = ox + B - 13, gz0 = oz + 12.5;
    for (let k = 0; k < 9; k++) { const a = Math.PI * (k / 8); solid.add(new THREE.IcosahedronGeometry(0.75, 0), k % 2 ? '#6d6a63' : '#7d7a72', gx0 + Math.cos(a) * 1.6, 0.4 + Math.sin(a) * 2.0, gz0, k, k * 2, 0); }
    solid.add(Cyl(0.18, 0.28, 1.1, 10), '#f4f4f0', gx0, 0.9, gz0); solid.add(new THREE.SphereGeometry(0.14, 10, 8), '#f4f4f0', gx0, 1.58, gz0);
    solid.add(new THREE.ConeGeometry(0.3, 1.0, 10, 1, true), '#5d8fd0', gx0, 1.15, gz0 - 0.02);
    const cMat = new THREE.MeshBasicMaterial({ color: '#ffcf70' });
    for (let k = 0; k < 7; k++) { solid.add(Cyl(0.025, 0.025, 0.25, 6), '#f4f4f0', gx0 - 0.9 + k * 0.3, 0.32, gz0 - 0.9); const f = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 4), cMat); f.position.set(gx0 - 0.9 + k * 0.3, 0.48, gz0 - 0.9); scene.add(f); }
    col.addCentered(gx0, gz0, 4, 2, 'wall');
    // Christmas: star lanterns hang from the church and the shop fronts
    const star = new THREE.Shape();
    for (let k = 0; k < 10; k++) { const a = (k / 10) * Math.PI * 2 - Math.PI / 2, r = k % 2 ? 0.2 : 0.5; k ? star.lineTo(Math.cos(a) * r, Math.sin(a) * r) : star.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
    const starGeo = new THREE.ExtrudeGeometry(star, { depth: 0.15, bevelEnabled: false }).toNonIndexed();
    const starCols = ['#ff3d3d', '#ffd23f', '#4dd0ff', '#ff6ad5', '#7dff6a'];
    const stars = new THREE.Group();
    shops.forEach((s, k) => {
      if (k % 2) return;
      const m = new THREE.Mesh(starGeo, new THREE.MeshBasicMaterial({ color: starCols[k % starCols.length] }));
      m.position.set(s.fx + s.nx * 1.0, 3.9, s.fz + s.nz * 1.0); m.rotation.y = Math.atan2(s.nx, s.nz);
      stars.add(m);
    });
    groups.christmas.add(stars);
    updates.push((t) => { stars.children.forEach((m, k) => { m.rotation.y += 0.004; m.position.y = 3.9 + Math.sin(t * 1.5 + k) * 0.05; }); });

    const [mx, mz] = blockOrigin(lmKey('mosque')); const mcx = mx + B / 2, mcz = mz + B / 2;
    for (const s of [-1, 1]) for (const y of [4, 7, 13.2]) solid.add(Cyl(0.92, 0.92, 0.45, 14), '#1f7a46', mcx + s * 8.6, y, mcz - 5.6);
  }

  // ---------------- backwaters: canoe and Chinese fishing nets ----------------
  {
    const canoe = new Bucket();
    canoe.add(new THREE.SphereGeometry(1, 14, 8), '#4a2e1a', 0, 0, 0, 0, 0, 0, 0.45, 0.25, 2.6);
    canoe.box(0.36, 0.5, 0.24, '#f3efe4', 0, 0.45, -0.6); canoe.add(new THREE.SphereGeometry(0.12, 8, 6), '#6e4429', 0, 0.82, -0.6);
    canoe.add(Cyl(0.02, 0.02, 3.2, 5), '#8a6a44', 0.25, 0.9, -0.3, 0.5, 0, 0.3);
    const cm = canoe.mesh(vcMat); scene.add(cm);
    const zc = (zc0 + zc1) / 2 + 15, x0 = gx(4) + 12, x1 = gx(5) - 12;
    let cx = x0, dir = 1;
    updates.push((t, dt) => { cx += dir * dt * 0.8; if (cx > x1 || cx < x0) dir *= -1; cm.position.set(cx, -0.72 + Math.sin(t * 1.3) * 0.03, zc); cm.rotation.y = dir > 0 ? Math.PI / 2 : -Math.PI / 2; cm.rotation.z = Math.sin(t * 1.1) * 0.04; });

    const [jx] = blockOrigin(lmKey('jetty'));
    for (const nx0 of [jx + 14, jx + B - 14]) {
      const base = new Bucket();
      base.box(3, 0.4, 3, '#6b4a2e', 0, -0.3, 1.5);
      for (const s of [-1, 1]) base.box(0.2, 1.8, 0.2, '#5a3d26', s * 1.2, -0.9, 2.6);
      const bm = base.mesh(vcMat); bm.position.set(nx0, 0, zc0); scene.add(bm);
      const pivot = new THREE.Group(); pivot.position.set(nx0, 0.6, zc0 + 2.2); scene.add(pivot);
      const arm = new Bucket();
      arm.add(Cyl(0.1, 0.14, 11, 8), '#7a5a3a', 0, 0, 4.0, Math.PI / 2, 0, 0);
      for (const [ax, ay] of [[-1.6, 2.2], [1.6, 2.2], [-1.6, -0.2], [1.6, -0.2]]) arm.add(Cyl(0.04, 0.05, 3.3, 6), '#8a6a44', ax * 0.5, ay * 0.5 + 0.3, 9.2, Math.atan2(ay, 4) * 0.4, 0, ax * 0.12);
      for (let k = 0; k < 4; k++) arm.add(new THREE.SphereGeometry(0.22, 8, 6), '#777', 0, -0.9 - k * 0.15, -1.4 - k * 0.25);   // counterweight stones
      const am = arm.mesh(vcMat); pivot.add(am);
      const net = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 3.6, 8, 8), new THREE.MeshStandardMaterial({ color: '#3a3a36', wireframe: true }));
      net.rotation.x = -Math.PI / 2; net.position.set(0, -1.0, 9.6); pivot.add(net);
      const ph = nx0 * 0.1;
      updates.push((t) => { const c = (Math.sin(t * 0.35 + ph) + 1) / 2; pivot.rotation.x = -0.05 + c * 0.32; });
      col.add(nx0 - 1.6, zc0 - 0.5, nx0 + 1.6, zc0 + 3, 'wall');
    }
  }

  // ---------------- hartal: shutters down on every shop ----------------
  {
    const sh = new Bucket();
    for (const s of shops) {
      const w = s.len * 0.92;
      if (s.nx) sh.box(0.08, 2.55, w, '#ffffff', s.fx + s.nx * 0.14, 1.28, s.cz);
      else sh.box(w, 2.55, 0.08, '#ffffff', s.cx, 1.28, s.fz + s.nz * 0.14);
    }
    if (!sh.empty) groups.hartal.add(sh.mesh(new THREE.MeshStandardMaterial({ vertexColors: true, map: shutterTex(), roughness: 0.6, metalness: 0.35 })));
  }

  // ---------------- street lamps on every other pole, with a pool of sodium light on the road ----------------
  const lampMat = new THREE.MeshBasicMaterial({ color: '#000000' });
  const poolMat = new THREE.MeshBasicMaterial({ color: '#000000', map: poolTex(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -4 });
  const arms = new Bucket(), heads = new Bucket(), pools = new Bucket();
  poles.forEach((p, k) => {
    if (k % 2) return;
    // the arm reaches out over the road from the footpath
    const local = (v) => (((v + 240) % 60) + 60) % 60;
    const toRoad = p.ry ? [0, local(p.z) < 30 ? -1 : 1] : [local(p.x) < 30 ? -1 : 1, 0];
    const [dx, dz] = toRoad;
    arms.add(new THREE.BoxGeometry(Math.abs(dx) * 2.2 + 0.06, 0.06, Math.abs(dz) * 2.2 + 0.06), '#7a7a74', p.x + dx * 1.1, 7.2, p.z + dz * 1.1);
    heads.add(new THREE.BoxGeometry(0.5, 0.12, 0.28), '#ffffff', p.x + dx * 2.2, 7.12, p.z + dz * 2.2, 0, Math.atan2(dx, dz), 0);
    pools.add(new THREE.PlaneGeometry(9, 9), '#ffffff', p.x + dx * 3.2, 0.05, p.z + dz * 3.2, -Math.PI / 2, 0, 0);
  });
  scene.add(arms.mesh(vcMat, { receive: false }));
  scene.add(new THREE.Mesh(heads.merge(), lampMat));
  const poolMesh = new THREE.Mesh(pools.merge(), poolMat); poolMesh.renderOrder = 2; poolMesh.visible = false; scene.add(poolMesh);
  const setNight = (n) => {
    lampMat.color.setRGB(2.4 * n, 1.55 * n, 0.6 * n);
    poolMat.color.setRGB(0.55 * n, 0.36 * n, 0.14 * n);
    poolMesh.visible = n > 0.02;
  };

  if (!fest.empty) groups.festival.add(fest.mesh(vcMat, { receive: false }));
  for (const g of Object.values(groups)) { g.visible = false; scene.add(g); }

  return {
    humps, groups, people, setNight,
    update(t, dt) { for (const u of updates) u(t, dt); },
  };
}

// ---------------- small textures ----------------
function poolTex() {
  const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.5, 'rgba(255,255,255,.35)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}
function newspaperTex() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 180; const x = c.getContext('2d');
  x.fillStyle = '#efeae0'; x.fillRect(0, 0, 256, 180);
  x.fillStyle = '#111'; x.font = '700 30px "Anek Malayalam", sans-serif'; x.textAlign = 'center'; x.fillText('നാട്ടുവാർത്ത', 128, 34);
  x.fillStyle = '#b71c1c'; x.font = '700 18px "Anek Malayalam", sans-serif'; x.fillText('ഇന്ന് ഹർത്താൽ ഇല്ല!', 128, 60);
  x.fillStyle = '#555'; for (let k = 0; k < 9; k++) x.fillRect(12 + (k % 3) * 82, 72 + Math.floor(k / 3) * 34, 72, 4);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function shutterTex() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 128; const x = c.getContext('2d');
  x.fillStyle = '#8a9196'; x.fillRect(0, 0, 64, 128);
  for (let y = 0; y < 128; y += 6) { x.fillStyle = 'rgba(0,0,0,.25)'; x.fillRect(0, y, 64, 2); x.fillStyle = 'rgba(255,255,255,.18)'; x.fillRect(0, y + 2, 64, 1); }
  x.fillStyle = 'rgba(120,70,30,.25)'; for (let k = 0; k < 30; k++) x.fillRect(Math.random() * 64, 100 + Math.random() * 28, 3, 2);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}
function pookalamTex() {
  const c = document.createElement('canvas'); c.width = c.height = 512; const x = c.getContext('2d');
  const rings = ['#ffd600', '#ff6f00', '#d50000', '#fafafa', '#7b1fa2', '#ff8f00', '#2e7d32', '#ffeb3b'];
  for (let k = 0; k < rings.length; k++) { x.fillStyle = rings[k]; x.beginPath(); x.arc(256, 256, 250 - k * 30, 0, Math.PI * 2); x.fill(); }
  for (let k = 0; k < 16; k++) {   // petal pattern
    const a = (k / 16) * Math.PI * 2; x.fillStyle = k % 2 ? '#fafafa' : '#d50000';
    x.beginPath(); x.ellipse(256 + Math.cos(a) * 150, 256 + Math.sin(a) * 150, 34, 14, a, 0, Math.PI * 2); x.fill();
  }
  x.fillStyle = '#ffd600'; x.beginPath(); x.arc(256, 256, 34, 0, Math.PI * 2); x.fill();
  x.fillStyle = '#4e342e'; x.beginPath(); x.arc(256, 256, 10, 0, Math.PI * 2); x.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
