import * as THREE from 'three';
import { gx, B as BLOCK, LANDMARKS, N, HALF, METRO_LINE, CANAL_ROW, ONE_WAY_ROWS, ONE_WAY_COLS } from './config.js';

// Eight big unipole hoardings, each with a classic Malayalam auto-stand joke and the UPI QR
// (public/billboards/upi.png). They stand the way real ones do: set back on open ground behind the
// footpath, past the power line, angled at oncoming traffic. Spots are picked once the town is built,
// so a board never cuts through a house, tree, wall or cable. The first one is just ahead of the spawn.

const ML = '"Anek Malayalam", "Manjari", sans-serif';
const UI = '"Baloo Chettan 2", system-ui, sans-serif';
const UPI_ID = 'lukhman4-1@okhdfcbank';

const BOARDS = [
  { ml: 'ഇതല്ല, ഇതിനപ്പുറം കുഴി ചാടിക്കടന്നവനാണ് ഈ ഓട്ടോക്കാരൻ!', en: 'Potholes? This driver has jumped bigger ones.', bg: '#ffd21f', ink: '#1b1b1b', band: '#1b1b1b', bandInk: '#ffd21f' },
  { ml: 'ചില്ലറ ഇല്ലേ? QR ഉണ്ട്. QR ഇല്ലേ? ഒരു ചിരി മതി!', en: 'No change? There\'s a QR. No QR? A smile will do.', bg: '#c8102e', ink: '#ffffff', band: '#ffd21f', bandInk: '#1b1b1b' },
  { ml: 'ചേട്ടാ, മീറ്റർ ഇട്ടോ? ഇട്ടു... പക്ഷേ മിനിമം ₹30 ആണ്!', en: 'The meter is on. The minimum is still ₹30.', bg: '#0b6e4f', ink: '#ffffff', band: '#ffffff', bandInk: '#0b6e4f' },
  { ml: 'ബഗ് കണ്ടാൽ ബഹളം വെക്കരുത്. ഡെവലപ്പർ ഉറങ്ങുവാ!', en: 'Found a bug? Shh. The developer is finally asleep.', bg: '#1f2a44', ink: '#ffe36e', band: '#ffe36e', bandInk: '#1f2a44' },
  { ml: 'AI ക്യാമറ കണ്ടാൽ മാത്രം ഡീസന്റ് ആവുന്നവരുടെ ശ്രദ്ധയ്ക്ക്: ഇവിടെയും ക്യാമറയുണ്ട്!', en: 'Behave. The AI camera works in this town too.', bg: '#ff6a1a', ink: '#1b1b1b', band: '#1b1b1b', bandInk: '#ffffff' },
  { ml: 'മഴ പെയ്താൽ റോഡ് പുഴ, പുഴ കണ്ടാൽ ഓട്ടോ ബോട്ട്!', en: 'Monsoon rule: roads turn into rivers, autos into boats.', bg: '#ffffff', ink: '#c8102e', band: '#c8102e', bandInk: '#ffffff' },
  { ml: 'ദുബായിൽ പോകാൻ വിസ വേണം. ഇവിടെ ഓട്ടോ ഓടിക്കാൻ ലൈസൻസ് പോലും വേണ്ട!', en: 'Dubai needs a visa. This auto doesn\'t even need a licence.', bg: '#5b2a86', ink: '#ffffff', band: '#ffd21f', bandInk: '#5b2a86' },
  { ml: 'വണ്ടി ഓടാൻ പെട്രോൾ, ഗെയിം ഓടാൻ ചായ!', en: 'Petrol runs the auto. Chai runs the developer.', bg: '#00a6b4', ink: '#ffffff', band: '#1b1b1b', bandInk: '#ffffff' },
];

const W = 7.2, H = 3.6, BASE = 4.6, ANGLE = 0.35;   // board size, underside height, toe-in toward the road (rad)
const SETBACKS = [11, 12.5, 14, 16];   // mast distance from road centre: behind the footpath, clear of the KSEB line at 5.55
const SPACING = 100;                   // no two boards closer than this
const MARGIN = { tree: 3, building: 1.4, wall: 1.2, pole: 1.6, vehicle: 1.5, water: 0.6 };
const CW = 1600, CH = 800;

// `start` = the auto's spawn {x, z, dx, dz}; the first board goes on that road, just ahead.
export function buildBillboards(scene, col, start) {
  const group = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial({ color: '#6f7275', roughness: 0.55, metalness: 0.6 });
  const back = new THREE.MeshStandardMaterial({ color: '#3a3c3e', roughness: 0.8, metalness: 0.3 });
  const lampMat = new THREE.MeshStandardMaterial({ color: '#222', emissive: '#fff2c8', emissiveIntensity: 0 });
  const concrete = new THREE.MeshStandardMaterial({ color: '#a19d94', roughness: 0.9 });
  // a unipole hoarding (local +z = face normal): the mast stands BEHIND the board and carries a
  // steel head frame; the printed face sits on its own frame, catwalk and floodlights in front
  const MH = BASE + H - 0.4;                                      // mast top, just under the board's top edge
  const mast = new THREE.CylinderGeometry(0.3, 0.38, MH, 14);
  const footing = new THREE.BoxGeometry(1.3, 0.35, 1.3);
  const frame = new THREE.BoxGeometry(W + 0.3, H + 0.3, 0.2);
  const face = new THREE.PlaneGeometry(W, H);
  const beam = new THREE.BoxGeometry(W, 0.24, 0.3);
  const stud = new THREE.BoxGeometry(0.14, H, 0.14);
  const sleeve = new THREE.BoxGeometry(0.9, H - 0.6, 0.9);
  const walk = new THREE.BoxGeometry(W, 0.06, 0.8);
  const bracket = new THREE.BoxGeometry(0.07, 0.07, 0.95);
  const arm = new THREE.BoxGeometry(0.05, 0.05, 0.75);
  const lamp = new THREE.BoxGeometry(0.4, 0.14, 0.26);

  const qr = new Image();
  qr.crossOrigin = 'anonymous';   // served from the game's host, the page may sit on the portfolio
  const faces = [];

  const spots = chooseSpots(col, start);
  spots.forEach((s, i) => {
    const b = BOARDS[i % BOARDS.length];
    const { x, z, nx, nz } = s;
    const canvas = document.createElement('canvas');
    canvas.width = CW; canvas.height = CH;
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    const mat = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: '#ffffff', emissiveIntensity: 0.12, roughness: 0.7 });
    faces.push({ canvas, tex, b, mat });
    draw(canvas.getContext('2d'), b, null);

    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = Math.atan2(nx, nz);
    const add = (geo, mat, px, py, pz, shadow = true) => { const o = new THREE.Mesh(geo, mat); o.position.set(px, py, pz); o.castShadow = shadow; o.receiveShadow = true; g.add(o); return o; };
    const cy = BASE + H / 2;
    add(footing, concrete, 0, 0.17, -0.8);
    add(mast, steel, 0, MH / 2, -0.8);
    add(sleeve, steel, 0, cy, -0.75);                                     // clamp where the mast meets the head frame
    for (const by of [BASE + 0.6, BASE + H - 0.6]) add(beam, steel, 0, by, -0.35);
    for (const sx of [-W / 2 + 0.3, -W / 6, W / 6, W / 2 - 0.3]) add(stud, steel, sx, cy, -0.27);
    add(frame, back, 0, cy, -0.1);                                        // front face of the frame at z = 0
    add(face, mat, 0, cy, 0.015, false);
    add(walk, steel, 0, BASE - 0.28, 0.35);
    for (const sx of [-W / 2 + 0.4, 0, W / 2 - 0.4]) add(bracket, steel, sx, BASE - 0.34, 0.35);
    for (const sx of [-2.4, 0, 2.4]) {
      add(arm, steel, sx, BASE - 0.28, 1.1);
      const l = add(lamp, lampMat, sx, BASE - 0.22, 1.5); l.rotation.x = 0.7;   // tipped up at the print
    }
    group.add(g);
    col.addCentered(x - nx * 0.8, z - nz * 0.8, 0.8, 0.8, 'pole');   // the mast
  });

  qr.onload = () => { for (const fc of faces) { draw(fc.canvas.getContext('2d'), fc.b, qr); fc.tex.needsUpdate = true; } };
  qr.src = `${import.meta.env.BASE_URL}billboards/upi.png`;
  scene.add(group);

  return {
    group,
    spots,
    setNight(n) {
      for (const fc of faces) fc.mat.emissiveIntensity = 0.12 + n * 0.45;   // printed flex pops a little even on grey days
      lampMat.emissiveIntensity = n * 2.5;
    },
  };
}

function chooseSpots(col, start) {
  const cands = [];
  for (let k = 0; k <= N; k++) for (const road of ['v', 'h']) {
    if (road === 'v' && k === METRO_LINE) continue;                    // viaduct overhead
    for (let m = 0; m < N; m++) {
      if (road === 'v' && m === CANAL_ROW) continue;                   // that span is a bridge
      for (const dir of [1, -1]) {
        if (road === 'h' && ONE_WAY_ROWS[k] !== undefined && ONE_WAY_ROWS[k] !== dir) continue;
        if (road === 'v' && ONE_WAY_COLS[k] !== undefined && ONE_WAY_COLS[k] !== dir) continue;
        const dx = road === 'h' ? dir : 0, dz = road === 'v' ? dir : 0;
        for (const side of [1, -1]) {                                    // 1 = driver's left (Kerala drives left)
          const px = dz * side, pz = -dx * side;
          for (let t = 16; t <= 44; t += 4) for (const S of SETBACKS) {
            const along = gx(m) + t;
            const rx = road === 'v' ? gx(k) : along, rz = road === 'v' ? along : gx(k);
            const x = rx + px * S, z = rz + pz * S;
            if (Math.abs(x) > HALF + 4 || Math.abs(z) > HALF + 4) continue;   // the outer ring already has its own hoardings
            const nx = -dx * Math.cos(ANGLE) - px * Math.sin(ANGLE), nz = -dz * Math.cos(ANGLE) - pz * Math.sin(ANGLE);
            if (!clear(col, x, z, nx, nz)) continue;
            // landmark plots (hub, mall, stadium, temple...) have big roofs and canopies that overhang their colliders
            const landmark = !!LANDMARKS[`${Math.floor((x + HALF) / BLOCK)},${Math.floor((z + HALF) / BLOCK)}`];
            cands.push({ x, z, nx, nz, road, line: k, dir, side, S, rx, rz, landmark });
            break;                                                       // nearest clear setback is the one
          }
        }
      }
    }
  }
  const spots = [];
  // 1: on the starting road, ahead of the auto, preferring the left verge ~25 m out
  const ahead = (c) => (c.x - start.x) * start.dx + (c.z - start.z) * start.dz;
  const first = cands
    .filter((c) => c.dir * (c.road === 'v' ? 1 : 0) === start.dz && c.dir * (c.road === 'h' ? 1 : 0) === start.dx && Math.abs((c.road === 'v' ? c.rx - start.x : c.rz - start.z)) < 3 && ahead(c) > 12 && ahead(c) < 55)
    .sort((a, b) => (Math.abs(ahead(a) - 25) + (a.side < 0 ? 12 : 0) + a.S) - (Math.abs(ahead(b) - 25) + (b.side < 0 ? 12 : 0) + b.S))[0];
  if (first) spots.push(first);
  // the rest: spread over the town (farthest-first), favouring the left verge and a short setback
  while (spots.length < 8) {
    let best = null, bestScore = -Infinity;
    for (const c of cands) {
      if (c.landmark) continue;
      let d = Infinity;
      for (const s of spots) d = Math.min(d, Math.hypot(c.x - s.x, c.z - s.z));
      if (d < SPACING) continue;
      const score = Math.min(d, 260) - (c.side < 0 ? 25 : 0) - c.S;
      if (score > bestScore) { bestScore = score; best = c; }
    }
    if (!best) break;
    spots.push(best);
  }
  return spots;
}

// Is the board's whole footprint (mast behind, 7 m face, catwalk + lamps in front) clear of everything solid?
function clear(col, x, z, nx, nz) {
  const tx = nz, tz = -nx;   // along the face
  const pts = [];
  for (let u = -W / 2 - 0.3; u <= W / 2 + 0.31; u += 0.6) for (const v of [-1.3, -0.4, 0.5, 1.6]) pts.push([x + tx * u + nx * v, z + tz * u + nz * v]);
  const c = col.cell, seen = new Set();
  const xs = pts.map((p) => p[0]), zs = pts.map((p) => p[1]);
  for (let i = Math.floor((Math.min(...xs) - 3) / c); i <= Math.floor((Math.max(...xs) + 3) / c); i++)
    for (let j = Math.floor((Math.min(...zs) - 3) / c); j <= Math.floor((Math.max(...zs) + 3) / c); j++) {
      for (const b of col.map.get(i * 100003 + j) ?? []) {
        if (seen.has(b)) continue; seen.add(b);
        const r = MARGIN[b.tag] ?? 1.2;
        for (const [px, pz] of pts) {
          const ex = Math.max(b.minX - px, 0, px - b.maxX), ez = Math.max(b.minZ - pz, 0, pz - b.maxZ);
          if (ex * ex + ez * ez < r * r) return false;
        }
      }
    }
  return true;
}

function draw(x, b, qr) {
  x.fillStyle = b.bg; x.fillRect(0, 0, CW, CH);
  // a loud halftone corner, like every flex printed in Kerala
  x.fillStyle = 'rgba(0,0,0,0.07)';
  for (let yy = 0; yy < CH; yy += 26) for (let xx = 0; xx < 520; xx += 26) {
    const r = Math.max(0, 9 - (xx + yy) / 70);
    if (r > 0.5) { x.beginPath(); x.arc(xx, yy, r, 0, Math.PI * 2); x.fill(); }
  }

  // QR panel on the right
  const qs = 440, qx = CW - qs - 100, qy = 100;
  x.fillStyle = '#ffffff';
  roundRect(x, qx - 34, qy - 34, qs + 68, qs + 150, 34); x.fill();
  if (qr) x.drawImage(qr, qx, qy, qs, qs);
  else { x.fillStyle = '#ddd'; x.fillRect(qx, qy, qs, qs); }
  x.fillStyle = '#222'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.font = `700 34px ${UI}`;
  x.fillText(UPI_ID, qx + qs / 2, qy + qs + 46);
  x.font = `700 30px ${ML}`;
  x.fillStyle = '#c8102e';
  x.fillText('ചായ ഫണ്ട് · ഏത് UPI-യും ഓക്കെ', qx + qs / 2, qy + qs + 88);

  // headline: biggest size that fits the left column
  const left = 80, colW = qx - 34 - left - 60;
  const lines = fit(x, b.ml, colW, 470, 132, 64);
  x.fillStyle = b.ink; x.textAlign = 'left'; x.textBaseline = 'alphabetic';
  x.font = `800 ${lines.size}px ${ML}`;
  const lh = lines.size * 1.28, top = 60 + (470 - lines.rows.length * lh) / 2 + lines.size * 0.95;
  lines.rows.forEach((r, k) => x.fillText(r, left, top + k * lh));

  x.font = `600 38px ${UI}`;
  x.globalAlpha = 0.85;
  x.fillText(b.en, left, 630);
  x.globalAlpha = 1;

  // bottom band
  x.fillStyle = b.band; x.fillRect(0, CH - 110, CW, 110);
  x.fillStyle = b.bandInk; x.textBaseline = 'middle';
  x.font = `800 46px ${ML}`;
  x.fillText('ടിപ്പ് തന്നില്ലെങ്കിലും ഹോൺ അടിക്കില്ല, സത്യം!', left, CH - 55);
  x.textAlign = 'right';
  x.font = `700 36px ${UI}`;
  x.fillText('Hey Auto · ഹേ ഓട്ടോ', CW - 70, CH - 55);
}

function fit(x, text, maxW, maxH, big, small) {
  for (let size = big; size >= small; size -= 4) {
    x.font = `800 ${size}px ${ML}`;
    const rows = wrap(x, text, maxW);
    if (rows.length * size * 1.28 <= maxH && rows.every((r) => x.measureText(r).width <= maxW)) return { size, rows };
  }
  x.font = `800 ${small}px ${ML}`;
  return { size: small, rows: wrap(x, text, maxW) };
}

function wrap(x, text, maxW) {
  const rows = []; let cur = '';
  for (const w of text.split(' ')) {
    const t = cur ? `${cur} ${w}` : w;
    if (cur && x.measureText(t).width > maxW) { rows.push(cur); cur = w; } else cur = t;
  }
  if (cur) rows.push(cur);
  return rows;
}

function roundRect(x, X, Y, w, h, r) {
  x.beginPath(); x.moveTo(X + r, Y); x.arcTo(X + w, Y, X + w, Y + h, r); x.arcTo(X + w, Y + h, X, Y + h, r);
  x.arcTo(X, Y + h, X, Y, r); x.arcTo(X, Y, X + w, Y, r); x.closePath();
}
