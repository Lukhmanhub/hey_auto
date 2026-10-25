import * as THREE from 'three';
import { gsap } from 'gsap';
import iCamera from 'lucide-static/icons/camera.svg?raw';
import iRupee from 'lucide-static/icons/indian-rupee.svg?raw';
import iWarn from 'lucide-static/icons/triangle-alert.svg?raw';
import iAuto from 'lucide-static/icons/car-taxi-front.svg?raw';
import iSun from 'lucide-static/icons/sun.svg?raw';
import iMoon from 'lucide-static/icons/moon.svg?raw';
import iCloud from 'lucide-static/icons/cloud.svg?raw';
import iRain from 'lucide-static/icons/cloud-rain.svg?raw';
import { formatClock } from './daycycle.js';
import { N, B, HALF, BOUND, KERB as ROAD_HALF, ROAD_NAMES, METRO_LINE, CANAL_ROW, LANDMARKS, ONE_WAY_ROWS, ONE_WAY_COLS, SPEED_LIMIT, gx, blockKind } from './config.js';

const $ = (id) => document.getElementById(id);
const PX = 1.2;                 // static minimap pixels per metre
const ZOOM = 0.62;              // on-screen px per metre
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const stars = (r) => '★★★★★'.slice(0, Math.round(r)) + '☆☆☆☆☆'.slice(0, 5 - Math.round(r));

const ICON = { camera: iCamera, rupee: iRupee, warn: iWarn, auto: iAuto };
const NAMES = { f: ['Anitha', 'Lakshmi', 'Mariamma', 'Fathima', 'Sreeja', 'Ammini', 'Deepa', 'Shyni', 'Rasiya', 'Leela'], m: ['Suresh', 'Abdul', 'Joseph', 'Rajan', 'Biju', 'Shaji', 'Unnikrishnan', 'Varghese', 'Ashraf', 'Gopi'] };
export const passengerName = (female) => { const l = NAMES[female ? 'f' : 'm']; return l[Math.floor(Math.random() * l.length)]; };

// Fare-meter digits use the DSEG7 font (public/fonts), drawn twice: faint "8"s for the unlit segments, then the value.
function dseg(x, str, ghost, right, base, size, on, off, glow) {
  x.font = `${size}px "DSEG7"`; x.textAlign = 'right'; x.textBaseline = 'alphabetic';
  x.shadowBlur = 0; x.fillStyle = off; x.fillText(ghost, right, base);
  x.shadowColor = glow || 'transparent'; x.shadowBlur = glow ? 9 : 0; x.fillStyle = on; x.fillText(str, right, base);
  x.shadowBlur = 0;
}

export class Hud {
  constructor(world, camera) {
    this.world = world;
    this.camera = camera;
    this.map = $('minimap').getContext('2d');
    this.static = this.buildStatic();
    this.gauge = this.hiDpi($('gauge'));
    this.meter = this.hiDpi($('meter'));
    this.needle = 0;
    this.overGlow = 0;
    this.bubbles = [];
    this.lastRide = '';
    this.lastRadio = '';
    this.v = new THREE.Vector3();
  }

  hiDpi(c) {
    const r = Math.min(2, window.devicePixelRatio || 1);
    const w = c.width, h = c.height;
    c.width = w * r; c.height = h * r; c.style.width = `${w}px`; c.style.height = `${h}px`;
    const x = c.getContext('2d'); x.scale(r, r);
    return { x, w, h };
  }

  // ---------------- Minimap ----------------
  buildStatic() {
    const S = Math.ceil(BOUND * 2 * PX);
    const c = document.createElement('canvas'); c.width = c.height = S;
    const x = c.getContext('2d');
    const P = (v) => (v + BOUND) * PX;
    x.fillStyle = '#2f4d2a'; x.fillRect(0, 0, S, S);
    const [zc0, zc1] = this.world.canal;
    x.fillStyle = '#2b6a86'; x.fillRect(0, P(zc0 - 1), S, (zc1 - zc0 + 2) * PX);
    const rr = (X, Y, W, H, r) => { x.beginPath(); x.roundRect(X, Y, W, H, r); x.fill(); };
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      const k = blockKind(i, j);
      if (j === CANAL_ROW) continue;
      x.fillStyle = k === 'paddy' ? '#6f9a37' : k === 'town' ? '#d9ccab' : '#ecc07e';
      rr(P(gx(i) + ROAD_HALF + 1), P(gx(j) + ROAD_HALF + 1), (B - ROAD_HALF * 2 - 2) * PX, (B - ROAD_HALF * 2 - 2) * PX, 6);
      if (this.world.alleys.has(`${i},${j}`)) {
        x.fillStyle = '#9a6a48';
        x.fillRect(P(gx(i) + B / 2 - 2.2), P(gx(j) + ROAD_HALF), 4.4 * PX, (B - ROAD_HALF * 2) * PX);
      }
    }
    x.fillStyle = '#3c3f45';
    for (let k = 0; k <= N; k++) {
      x.fillRect(P(gx(k) - ROAD_HALF), P(-BOUND + 20), ROAD_HALF * 2 * PX, (BOUND * 2 - 40) * PX);
      x.fillRect(P(-BOUND + 20), P(gx(k) - ROAD_HALF), (BOUND * 2 - 40) * PX, ROAD_HALF * 2 * PX);
    }
    x.fillStyle = '#9fc4ff';
    const chev = (cx, cy, dx, dy) => {
      x.save(); x.translate(cx, cy); x.rotate(Math.atan2(dy, dx));
      x.beginPath(); x.moveTo(5, 0); x.lineTo(-3, -4); x.lineTo(-3, 4); x.closePath(); x.fill(); x.restore();
    };
    for (const k in ONE_WAY_ROWS) for (let m = 0; m < N; m++) chev(P(gx(m) + B / 2), P(gx(+k)), ONE_WAY_ROWS[k], 0);
    for (const k in ONE_WAY_COLS) for (let m = 0; m < N; m++) chev(P(gx(+k)), P(gx(m) + B / 2), 0, ONE_WAY_COLS[k]);
    // Kochi Metro: a teal line along MG Road with the two stations
    const mx = P(gx(METRO_LINE) - 4.6);
    x.strokeStyle = '#13a3a8'; x.lineWidth = 3.2; x.setLineDash([]);
    x.beginPath(); x.moveTo(mx, P(-BOUND + 20)); x.lineTo(mx, P(BOUND - 20)); x.stroke();
    x.fillStyle = '#ffffff'; x.strokeStyle = '#13a3a8'; x.lineWidth = 2.4;
    for (const z of [gx(1) + 30, gx(6) + 30]) { x.beginPath(); x.arc(mx, P(z), 4.2, 0, Math.PI * 2); x.fill(); x.stroke(); }
    return c;
  }

  drawMap(player, missions, traffic, t) {
    const x = this.map, W = 220, C = W / 2, R = 100;
    const CX = C, CY = C + 34;                       // player sits low: more road ahead, less behind
    const px = player.pos.x, pz = player.pos.z;
    const phi = player.heading - Math.PI;
    const cs = Math.cos(phi), sn = Math.sin(phi);
    const toScreen = (wx, wz) => {
      const dx = (wx - px) * ZOOM, dz = (wz - pz) * ZOOM;
      return [CX + dx * cs - dz * sn, CY + dx * sn + dz * cs];
    };
    const inside = (sx, sy, pad = 0) => Math.hypot(sx - C, sy - C) < R - pad;
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.clearRect(0, 0, W, W);
    x.save();
    x.beginPath(); x.arc(C, C, R, 0, Math.PI * 2); x.clip();
    x.fillStyle = '#2f4d2a'; x.fillRect(0, 0, W, W);
    x.translate(CX, CY); x.rotate(phi); x.scale(ZOOM / PX, ZOOM / PX);
    x.translate(-(px + BOUND) * PX, -(pz + BOUND) * PX);
    x.drawImage(this.static, 0, 0);
    x.restore();

    const riding = missions.state === 'riding';
    const col = riding ? '#3ee07a' : '#ffd23f';
    x.save();
    x.beginPath(); x.arc(C, C, R, 0, Math.PI * 2); x.clip();
    if (missions.route && missions.state !== 'cooldown') {
      x.lineJoin = 'round'; x.lineCap = 'round';
      const path = () => { x.beginPath(); missions.route.forEach((p, k) => { const [sx, sy] = toScreen(p.x, p.z); k ? x.lineTo(sx, sy) : x.moveTo(sx, sy); }); };
      x.strokeStyle = 'rgba(0,0,0,.55)'; x.lineWidth = 10; path(); x.stroke();
      x.strokeStyle = col; x.lineWidth = 6; path(); x.stroke();
    }
    for (const s of this.world.signals) {
      const [sx, sy] = toScreen(s.x, s.z);
      const st = s.state(Math.abs(Math.sin(player.heading)) > 0.7 ? 'x' : 'z', t);
      x.fillStyle = st === 'R' ? '#ff4a3a' : st === 'Y' ? '#ffc23a' : '#3ee07a';
      x.beginPath(); x.arc(sx, sy, 3, 0, Math.PI * 2); x.fill();
    }
    x.fillStyle = 'rgba(255,255,255,.85)';
    for (const c of traffic.cars) {
      const [sx, sy] = toScreen(c.pos.x, c.pos.z);
      if (inside(sx, sy)) { x.beginPath(); x.arc(sx, sy, 1.8, 0, Math.PI * 2); x.fill(); }
    }
    // friends on the stand: coloured arrows, pinned to the rim when they're off the map
    for (const o of this.others ?? []) {
      let [sx, sy] = toScreen(o.x, o.z);
      const dx = sx - C, dy = sy - C, dd = Math.hypot(dx, dy), rim = R - 9;
      if (dd > rim) { sx = C + (dx / dd) * rim; sy = C + (dy / dd) * rim; }
      x.save(); x.translate(sx, sy); x.rotate(phi - o.h + Math.PI);
      x.fillStyle = o.color; x.strokeStyle = '#111'; x.lineWidth = 2;
      x.globalAlpha = o.away ? 0.45 : 1;
      x.beginPath(); x.moveTo(0, -8); x.lineTo(6, 6); x.lineTo(0, 3); x.lineTo(-6, 6); x.closePath(); x.fill(); x.stroke();
      x.restore();
      // their name, kept inside the dial
      if (o.name) {
        x.save();
        x.font = '800 11px "Baloo Chettan 2", sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
        const w = x.measureText(o.name).width / 2 + 5;
        const ly = sy + (sy > C + R - 30 ? -15 : 15), lx = Math.max(C - R + w + 6, Math.min(C + R - w - 6, sx));
        x.globalAlpha = o.away ? 0.5 : 1;
        x.fillStyle = 'rgba(10,11,9,.82)'; x.beginPath(); x.roundRect(lx - w, ly - 7.5, w * 2, 15, 7.5); x.fill();
        x.fillStyle = o.color; x.fillText(o.name, lx, ly + 1);
        x.restore();
      }
    }
    // landmark labels: only when the whole label fits inside the circle
    x.font = '700 12px "Baloo Chettan 2", sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    for (const key in LANDMARKS) {
      const [i, j] = key.split(',').map(Number);
      const [sx, sy] = toScreen(gx(i) + B / 2, gx(j) + B / 2);
      const half = x.measureText(LANDMARKS[key].short).width / 2 + 4;
      if (!inside(sx - half, sy, 8) || !inside(sx + half, sy, 8)) continue;
      x.fillStyle = 'rgba(0,0,0,.7)'; x.fillText(LANDMARKS[key].short, sx + 1, sy + 1);
      x.fillStyle = '#fff'; x.fillText(LANDMARKS[key].short, sx, sy);
    }
    x.restore();

    // compass bezel: a ring band with ticks that turns with the map
    x.save();
    x.lineWidth = 12; x.strokeStyle = 'rgba(12,13,11,.82)';
    x.beginPath(); x.arc(C, C, R + 3, 0, Math.PI * 2); x.stroke();
    const bearing = (ox, oz) => { const [nx, ny] = toScreen(px + ox * 1e4, pz + oz * 1e4); return Math.atan2(ny - CY, nx - CX); };
    const north = bearing(0, -1);
    for (let k = 0; k < 24; k++) {
      const a = north + (k / 24) * Math.PI * 2, major = k % 6 === 0;
      if (major) continue;
      x.strokeStyle = 'rgba(255,255,255,.35)'; x.lineWidth = 1.5;
      x.beginPath(); x.moveTo(C + Math.cos(a) * (R - 1), C + Math.sin(a) * (R - 1)); x.lineTo(C + Math.cos(a) * (R + 5), C + Math.sin(a) * (R + 5)); x.stroke();
    }
    x.font = '800 12px "Baloo Chettan 2", sans-serif';
    ['N', 'E', 'S', 'W'].forEach((lbl, k) => {
      const a = north + (k * Math.PI) / 2;
      const mx = C + Math.cos(a) * (R + 3), my = C + Math.sin(a) * (R + 3);
      if (lbl === 'N') { x.fillStyle = '#e53935'; x.beginPath(); x.arc(mx, my, 8, 0, Math.PI * 2); x.fill(); }
      x.fillStyle = lbl === 'N' ? '#fff' : 'rgba(255,255,255,.8)';
      x.fillText(lbl, mx, my + 1);
    });
    x.restore();

    // target: pin when on the map, arrow on the rim when it's off
    const target = riding ? missions.dest : missions.state === 'pickup' ? missions.spot : null;
    if (target) {
      const [sx, sy] = toScreen(target.x, target.z);
      x.fillStyle = col; x.strokeStyle = '#111'; x.lineWidth = 2.5;
      if (inside(sx, sy, 10)) {
        x.beginPath(); x.arc(sx, sy, 8, 0, Math.PI * 2); x.fill(); x.stroke();
        x.fillStyle = '#111'; x.beginPath(); x.arc(sx, sy, 2.8, 0, Math.PI * 2); x.fill();
      } else {
        const a = Math.atan2(sy - CY, sx - CX);
        // point on the rim along the ray from the player
        const dx = Math.cos(a), dy = Math.sin(a), ox = CX - C, oy = CY - C;
        const b = ox * dx + oy * dy, cc = ox * ox + oy * oy - (R - 12) ** 2;
        const tR = -b + Math.sqrt(b * b - cc);
        const mx = CX + dx * tR, my = CY + dy * tR;
        x.save(); x.translate(mx, my); x.rotate(a);
        x.beginPath(); x.moveTo(10, 0); x.lineTo(-7, -8); x.lineTo(-3, 0); x.lineTo(-7, 8); x.closePath(); x.fill(); x.stroke();
        x.restore();
      }
    }
    x.fillStyle = '#f7c600'; x.strokeStyle = '#111'; x.lineWidth = 2;
    x.beginPath(); x.moveTo(CX, CY - 10); x.lineTo(CX + 7, CY + 7.5); x.lineTo(CX, CY + 3.5); x.lineTo(CX - 7, CY + 7.5); x.closePath(); x.fill(); x.stroke();
  }

  // ---------------- Analog speedometer ----------------
  drawGauge(player, rules, raining, dt) {
    const { x, w } = this.gauge, C = w / 2, R = w / 2 - 4;
    const kmh = player.kmh;
    const over = kmh > SPEED_LIMIT + 3 && player.zone === 'road';
    this.needle += (kmh - this.needle) * Math.min(1, dt * 8);
    this.overGlow += ((over ? 1 : 0) - this.overGlow) * Math.min(1, dt * 6);
    const MAX = 60, A0 = Math.PI * 0.75, SWEEP = Math.PI * 1.5;
    const ang = (v) => A0 + (Math.min(MAX + 2, v) / MAX) * SWEEP;
    x.clearRect(0, 0, w, w);
    let g = x.createLinearGradient(0, 0, w, w);
    g.addColorStop(0, '#d9d9d6'); g.addColorStop(0.35, '#6d6d6a'); g.addColorStop(0.6, '#f2f2ee'); g.addColorStop(1, '#3a3a38');
    x.fillStyle = g; x.beginPath(); x.arc(C, C, R, 0, Math.PI * 2); x.fill();
    g = x.createRadialGradient(C, C - 30, 10, C, C, R - 8);
    g.addColorStop(0, `rgb(${43 + 50 * this.overGlow},${43 - 10 * this.overGlow},${39 - 10 * this.overGlow})`); g.addColorStop(1, '#0d0d0b');
    x.fillStyle = g; x.beginPath(); x.arc(C, C, R - 8, 0, Math.PI * 2); x.fill();
    x.strokeStyle = `rgba(229,57,53,${0.75 + 0.25 * this.overGlow})`; x.lineWidth = 7 + 3 * this.overGlow;
    x.beginPath(); x.arc(C, C, R - 20, ang(SPEED_LIMIT), ang(MAX)); x.stroke();
    x.lineCap = 'round';
    for (let v = 0; v <= MAX; v += 2.5) {
      const a = ang(v), major = v % 10 === 0, mid = v % 5 === 0;
      const r1 = R - 14, r0 = major ? R - 28 : mid ? R - 23 : R - 19;
      x.strokeStyle = v > SPEED_LIMIT ? '#ff8a80' : '#efe6cf';
      x.lineWidth = major ? 3 : mid ? 2 : 1;
      x.beginPath(); x.moveTo(C + Math.cos(a) * r0, C + Math.sin(a) * r0); x.lineTo(C + Math.cos(a) * r1, C + Math.sin(a) * r1); x.stroke();
      if (major) {
        x.fillStyle = '#efe6cf'; x.font = '700 16px "Baloo Chettan 2", sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
        x.fillText(v, C + Math.cos(a) * (R - 42), C + Math.sin(a) * (R - 42) + 1);
      }
    }
    // digital speed + unit
    x.fillStyle = over ? '#ff6b5a' : '#f6f3ea'; x.font = '800 26px "Baloo Chettan 2", sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(Math.round(kmh), C, C + 44);
    x.fillStyle = 'rgba(239,230,207,.75)'; x.font = '600 12px "Baloo Chettan 2", sans-serif';
    x.fillText('km/h', C, C + 63);
    // tell-tale lamps (brighter, bigger)
    const lamp = (cx, on, col, draw) => { x.save(); x.translate(cx, C + 20); x.globalAlpha = on ? 1 : 0.32; x.strokeStyle = x.fillStyle = on ? col : '#cfcfcf'; x.lineWidth = 1.8; x.scale(1.15, 1.15); draw(); x.restore(); };
    lamp(C - 26, raining, '#3ee07a', () => { x.beginPath(); x.arc(-2, 0, 5, -Math.PI / 2, Math.PI / 2); x.closePath(); x.stroke(); for (let k = -1; k <= 1; k++) { x.beginPath(); x.moveTo(4, k * 3.5); x.lineTo(9, k * 3.5); x.stroke(); } });
    lamp(C + 26, rules.status?.wrongSide || rules.status?.wrongWay, '#ff5252', () => { x.beginPath(); x.moveTo(0, -6); x.lineTo(6.5, 5); x.lineTo(-6.5, 5); x.closePath(); x.stroke(); x.fillRect(-0.8, -2, 1.6, 4); });
    // needle: tints red over the limit
    const a = ang(this.needle);
    x.save(); x.translate(C, C); x.rotate(a);
    x.shadowColor = over ? 'rgba(255,40,30,.95)' : 'rgba(255,90,40,.7)'; x.shadowBlur = over ? 14 : 8;
    x.fillStyle = over ? '#ff2a1a' : '#ff7a28';
    x.beginPath(); x.moveTo(-14, -3.5); x.lineTo(R - 22, -1); x.lineTo(R - 22, 1); x.lineTo(-14, 3.5); x.closePath(); x.fill();
    x.restore();
    g = x.createRadialGradient(C - 3, C - 3, 1, C, C, 11);
    g.addColorStop(0, '#f5f5f2'); g.addColorStop(1, '#4a4a46');
    x.fillStyle = g; x.beginPath(); x.arc(C, C, 10, 0, Math.PI * 2); x.fill();
    g = x.createLinearGradient(0, 0, 0, w);
    g.addColorStop(0, 'rgba(255,255,255,.12)'); g.addColorStop(0.45, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.beginPath(); x.arc(C, C, R - 8, 0, Math.PI * 2); x.fill();
    $('cluster').classList.toggle('over', over);
    if (over && !this.pulse) this.pulse = gsap.to($('limit'), { scale: 1.16, boxShadow: '0 0 0 9px rgba(229,57,53,.38), 0 6px 18px rgba(0,0,0,.35)', duration: 0.32, repeat: -1, yoyo: true, ease: 'sine.inOut' });
    if (!over && this.pulse) { this.pulse.kill(); this.pulse = null; gsap.to($('limit'), { scale: 1, boxShadow: '0 6px 18px rgba(0,0,0,.35)', duration: 0.2 }); }
  }

  // ---------------- Fare meter ----------------
  // Returns true when the fare just ticked up.
  drawMeter(missions) {
    const { x, w, h } = this.meter;
    const riding = missions.state === 'riding';
    x.clearRect(0, 0, w, h);
    let g = x.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#2a2a28'); g.addColorStop(0.08, '#141413'); g.addColorStop(1, '#080807');
    x.fillStyle = g; x.beginPath(); x.roundRect(0, 0, w, h, 12); x.fill();
    x.strokeStyle = 'rgba(255,255,255,.08)'; x.lineWidth = 1; x.stroke();
    x.fillStyle = '#0a0202'; x.beginPath(); x.roundRect(10, 24, w - 20, h - 32, 6); x.fill();
    x.fillStyle = 'rgba(255,255,255,.7)'; x.font = '800 12px "Baloo Chettan 2", sans-serif'; x.textBaseline = 'middle'; x.textAlign = 'left';
    x.fillText('FARE ₹', 14, 14);
    x.textAlign = 'right'; x.fillText('KM', w - 96, 14); x.fillText('TIME', w - 16, 14);
    const ON = '#ff3b2f', OFF = 'rgba(255,59,47,.09)', AMB = '#ffb547', AOFF = 'rgba(255,181,71,.09)';
    const waiting = missions.state === 'pickup' || missions.state === 'boarding';
    const fare = riding ? String(missions.fare).padStart(4, '!') : waiting ? '!!30' : '----';     // '!' = blank digit in DSEG
    dseg(x, fare, '8888', 150, 74, 38, riding ? ON : 'rgba(255,59,47,.45)', OFF, riding && 'rgba(255,59,47,.85)');
    const km = riding ? missions.meterKm.toFixed(1).padStart(4, '0') : '00.0';
    dseg(x, km, '88.8', w - 98, 66, 21, riding ? AMB : 'rgba(255,181,71,.35)', AOFF, riding && 'rgba(255,181,71,.7)');
    const tleft = Math.max(0, Math.ceil(missions.timeLeft ?? 0));
    const tl = riding ? `${String(Math.floor(tleft / 60)).padStart(2, '!')}:${String(tleft % 60).padStart(2, '0')}` : '!0:00';
    dseg(x, tl, '88:88', w - 16, 66, 21, riding && missions.timeLeft < 0 ? ON : riding ? AMB : 'rgba(255,181,71,.35)', AOFF, riding && 'rgba(255,181,71,.7)');
    $('flag').classList.toggle('down', riding);
    const ticked = riding && this.lastFare !== undefined && missions.fare > this.lastFare;
    this.lastFare = riding ? missions.fare : undefined;
    if (ticked) {
      const u = $('meterunit');
      u.classList.remove('tick'); void u.offsetWidth; u.classList.add('tick');
    }
    return ticked;
  }

  // ---------------- Road alert: signal ahead, one-way ahead, wrong way ----------------
  roadAlert(st) {
    const el = $('alert');
    let kind = null, title = '', sub = '', count = '', light = '';
    if (st?.wrongWay) {
      kind = 'wrongway'; title = 'Wrong way — this is a one-way!';
      sub = st.wrongWayLeft > 0 ? 'Turn back now · AI camera fine coming' : 'AI camera caught you';
      count = st.wrongWayLeft > 0 ? `${Math.ceil(st.wrongWayLeft)}` : '';
    } else if (st?.noEntryAhead) {
      kind = 'noentry'; title = 'No entry — one-way ahead'; sub = 'വൺ വേ · take another road';
    } else if (st?.signal) {
      const s = st.signal;
      kind = 'signal'; light = s.state; count = `${s.left}`;
      title = s.state === 'R' ? 'Red signal ahead' : s.state === 'Y' ? 'Signal turning red' : 'Green signal';
      sub = s.state === 'R' ? 'നിർത്തുക · stop at the white line' : s.state === 'Y' ? 'പതുക്കെ · slow down' : 'പോകാം · go ahead';
    }
    if (!kind) { if (!el.hidden) el.hidden = true; return; }
    el.hidden = false;
    if (el.dataset.kind !== kind) el.dataset.kind = kind;
    if (el.dataset.light !== light) {
      el.dataset.light = light;
      el.querySelectorAll('.ra-light i').forEach((i) => i.classList.toggle('on', i.dataset.c === light));
    }
    if ($('alert-t').textContent !== title) $('alert-t').textContent = title;
    if ($('alert-s').textContent !== sub) $('alert-s').textContent = sub;
    if ($('alert-n').textContent !== count) $('alert-n').textContent = count;
  }

  // ---------------- Panels ----------------
  update(player, missions, rules, radio, goal) {
    const m = missions;
    const state = m.state === 'riding' ? 'trip' : m.state === 'pickup' || m.state === 'boarding' ? 'request' : 'cruise';
    $('hud').dataset.state = state;

    // which street are we on? (sticks to the last one through junctions)
    {
      const i = Math.round((player.pos.x + HALF) / B), j = Math.round((player.pos.z + HALF) / B);
      const dx = Math.abs(player.pos.x - (i * B - HALF)), dz = Math.abs(player.pos.z - (j * B - HALF));
      const onV = dx < ROAD_HALF && i >= 0 && i <= N, onH = dz < ROAD_HALF && j >= 0 && j <= N;
      if (onV && !onH) this.road = ROAD_NAMES.v[i]; else if (onH && !onV) this.road = ROAD_NAMES.h[j];
      else if (!onV && !onH) this.road = null;
      const rn = this.road ?? '';
      if ($('roadname').textContent !== rn) $('roadname').textContent = rn;
    }
    $('zone').textContent = rules.status?.wrongWay ? 'One-way — wrong way!' : rules.status?.wrongSide ? 'Keep left!' :
      ({ road: this.road ?? 'On road', footpath: 'On the footpath!', alley: 'Idavazhi · alley', yard: 'Compound', paddy: 'Paddy field · mud', grass: 'Off-road' }[player.zone] ?? '');
    $('zone').classList.toggle('bad', !!(rules.status?.wrongSide || rules.status?.wrongWay || player.zone === 'footpath'));
    this.roadAlert(rules.status);

    // earnings vs daily goal
    const net = m.cash;
    $('cash').textContent = `${net < 0 ? '−' : ''}₹${Math.abs(net)}`;
    $('cash').classList.toggle('neg', net < 0);
    $('goal').textContent = `₹${goal}`;
    const span = goal + m.rent;
    const frac = Math.max(0, Math.min(1, (net + m.rent) / span));
    $('goalbar').style.width = `${frac * 100}%`;
    $('goalbar').classList.toggle('done', net >= goal);
    $('goalzero').style.left = `${(m.rent / span) * 100}%`;
    const fines = m.fines ? ` · Fines −₹${m.fines}` : '';
    $('earnsub').innerHTML = `Auto rent −₹${m.rent} · Fares <b>₹${m.fares}</b>${fines} · ${m.trips} trips · ${m.rating.toFixed(1)}★`;

    // the phone on the dash
    let html = '', key = state;
    const p = m.paxInfo;
    if (state === 'request') {
      key += p.name;
      html = `<div class="rc-head"><span class="app">${ICON.auto}</span><span>Hey Auto · Ride request</span><span class="chip pick">${m.state === 'boarding' ? 'Boarding' : 'Pickup'}</span></div>
        <div class="rc-pax"><span class="av" style="background:${p.color}">${p.name[0]}</span><div><b>${esc(p.name)}</b><small>${p.stars.toFixed(1)} ★ · Cash</small></div>
          <div class="big-dist"><b>${Math.round(m.distLeft ?? 0)}</b><small>m away</small></div></div>
        <div class="rc-dest"><i class="y"></i><div><b>Waiting at the roadside</b><small>Follow the yellow beam and stop beside them</small></div></div>`;
    } else if (state === 'trip') {
      key += m.dest.name;
      // the ring is the passenger's mood, not the timer (the meter shows time)
      const mood = Math.max(0, Math.min(1, (m.tripRating - 1) / 4));
      const face = mood > 0.8 ? '😊' : mood > 0.5 ? '🙂' : mood > 0.25 ? '😐' : '😠';
      const ringCol = mood > 0.6 ? 'var(--green)' : mood > 0.3 ? '#ffb300' : '#e53935';
      const nervous = player.kmh > SPEED_LIMIT + 3 && player.zone === 'road';
      html = `<div class="rc-head"><span class="app">${ICON.auto}</span><span>Hey Auto · On trip</span><span class="chip drop">Drop</span></div>
        <div class="rc-pax"><span class="av" style="background:${p.color}">${p.name[0]}</span><div><b>${esc(p.name)}</b><small>${m.late ? 'Running late' : 'On board'}</small></div>
          <div class="mood"><small>Mood</small><span class="ring" style="--p:${mood.toFixed(2)};--c:${ringCol}"><span>${face}</span></span></div></div>
        <div class="rc-dest"><i class="g"></i><div><b>${esc(m.dest.name)}</b><small>${esc(m.dest.ml)} · ${Math.round(m.distLeft ?? 0)} m</small></div></div>
        ${nervous ? '<div class="nervous">Passenger is nervous 😬 slow down</div>' : ''}`;
    } else {
      const now = formatClock(this.hour ?? 7.5);
      html = `<div class="rc-head"><span class="app">${ICON.auto}</span><span>Hey Auto · Online</span><span class="chip">Free</span></div>
        <div class="lock-time">${now.text}<small style="font-size:16px;margin-left:4px">${now.ap}</small></div>
        <div class="rc-wait"><span class="pulse"></span>Looking for a fare nearby…</div>`;
    }
    if (html !== this.lastRide) {
      $('ride').innerHTML = html;
      if (key !== this.lastKey) {
        // slide new screens in; buzz the phone for a new request
        gsap.fromTo($('ride'), { yPercent: -105, opacity: 0 }, { yPercent: 0, opacity: 1, duration: 0.55, ease: 'back.out(1.3)' });
        if (state === 'request' && !this.lastKey?.startsWith('request')) {
          // two short buzzes, the way a phone rattles on a dash mount
          gsap.timeline()
            .to($('phone'), { '--bz': '-2.5deg', '--bx': '-2px', duration: 0.04, repeat: 7, yoyo: true, ease: 'none' })
            .to($('phone'), { '--bz': '0deg', '--bx': '0px', duration: 0.04 })
            .to($('phone'), { '--bz': '2.5deg', '--bx': '2px', duration: 0.04, repeat: 7, yoyo: true, ease: 'none' }, '+=0.18')
            .to($('phone'), { '--bz': '0deg', '--bx': '0px', duration: 0.06 });
        }
        this.lastKey = key;
      }
      this.lastRide = html;
    }

    // radio chip
    const info = radio?.info;
    const playing = !!info && (!info.live || info.status === 'Live');
    $('r-freq').textContent = info ? info.freq : 'OFF';
    $('r-short').textContent = info ? info.name : 'Radio · press Q';
    $('radio').classList.toggle('on', playing);
    $('radio').classList.toggle('is-live', !!info?.live);
    const panel = info
      ? `<div class="big">${info.live ? 'LIVE ' : 'FM '}${info.freq}</div><b>${esc(info.name)}</b><span>${esc(info.ml)}</span><span>${esc(info.live && info.status !== 'Live' ? info.status || 'Tuning…' : info.genre)}</span><div class="keys"><kbd>Q</kbd> next · <kbd>⇧</kbd><kbd>Q</kbd> back · <kbd>[</kbd><kbd>]</kbd> volume · <kbd>X</kbd> off</div>`
      : `<div class="big">FM ----</div><b>Radio off</b><div class="keys"><kbd>X</kbd> back on · <kbd>Q</kbd> to tune in</div>`;
    if (panel !== this.lastRadio) { $('r-panel').innerHTML = panel; this.lastRadio = panel; }
  }

  setClock(hour, wx) {
    this.hour = hour;
    const c = formatClock(hour), key = c.text + c.ap + wx;
    if (key === this.lastClock) return;
    this.lastClock = key;
    $('clock-t').textContent = c.text; $('clock-ap').textContent = c.ap;
    if (wx !== this.lastWx) { $('clock-wx').innerHTML = { sun: iSun, moon: iMoon, cloud: iCloud, rain: iRain }[wx]; $('clock-wx').style.color = wx === 'moon' ? '#c9d6ff' : wx === 'sun' ? '#ffd36b' : '#cfd6dc'; this.lastWx = wx; }
  }

  openRadio() {
    const r = $('radio');
    r.classList.add('open');
    clearTimeout(this.radioT);
    this.radioT = setTimeout(() => r.classList.remove('open'), 3500);
  }

  toast(kind, title, detail = '', amount = '') {
    const el = document.createElement('div');
    el.className = `note ${kind}`;
    const icon = { camera: ICON.camera, cash: ICON.rupee, warn: ICON.warn, info: ICON.auto }[kind] ?? ICON.auto;
    const app = { camera: 'Traffic e-Challan · AI camera', cash: 'UPI · Payment received', warn: 'Driving alert', info: 'Hey Auto' }[kind];
    el.innerHTML = `<span class="ic">${icon}</span><div class="nb"><small>${app}</small><b>${esc(title)}</b>${detail ? `<span>${esc(detail)}</span>` : ''}</div>${amount ? `<span class="amt">${esc(amount)}</span>` : ''}`;
    $('toasts').prepend(el);
    while ($('toasts').children.length > 3) $('toasts').lastChild.remove();
    setTimeout(() => el.classList.add('out'), 4000);
    setTimeout(() => el.remove(), 4500);
  }

  say(line, who) {
    const s = $('speech');
    s.querySelector('.who').textContent = who;
    s.querySelector('.ml').textContent = line.ml;
    s.querySelector('.mg').textContent = line.mg;
    s.querySelector('.en').textContent = line.en;
    s.hidden = false;
    gsap.killTweensOf(s);
    gsap.set(s, { xPercent: -50, x: 0 });
    gsap.timeline()
      .fromTo(s, { opacity: 0, y: -10, scale: 0.94 }, { opacity: 1, y: 0, scale: 1, duration: 0.35, ease: 'back.out(2)' })
      .to(s, { opacity: 0, y: -6, duration: 0.45, delay: 3.6, onComplete: () => { s.hidden = true; } });
  }

  // Trip complete: count the fare up, light the stars one by one, then the tip and the passenger's line.
  tripEnd(e, tick) {
    const el = $('tripend');
    clearTimeout(this.teT);
    el.classList.remove('out');
    el.innerHTML = `<div class="te-k">Trip complete</div><div class="te-dest">${esc(e.dest)}</div>
      <div class="te-fare">₹<span id="te-n">0</span></div><div class="te-tip" id="te-tip"></div>
      <div class="te-stars">${'<i>★</i>'.repeat(5)}</div>
      <div class="te-line"><div class="ml">${esc(e.line.ml)}</div><div class="mg">${esc(e.line.mg)}</div><div class="en">${esc(e.line.en)}</div></div>`;
    el.hidden = false;
    gsap.killTweensOf(el);
    gsap.set(el, { xPercent: -50, x: 0 });
    const n = $('te-n'), counter = { v: 0 };
    let shown = -1;
    const stars = [...el.querySelectorAll('.te-stars i')].slice(0, Math.round(e.rating));
    const tl = gsap.timeline();
    tl.fromTo(el, { opacity: 0, scale: 0.9, y: 10 }, { opacity: 1, scale: 1, y: 0, duration: 0.4, ease: 'back.out(1.6)' })
      .to(counter, { v: e.fare, duration: 1.0, ease: 'power2.out', onUpdate: () => {
        const v = Math.round(counter.v); n.textContent = v;
        if (v !== shown && v % 2 === 0) { shown = v; tick?.(v / e.fare); }
      } })
      .fromTo(n.parentElement, { scale: 1 }, { scale: 1.08, duration: 0.12, yoyo: true, repeat: 1 })
      .add(() => stars.forEach((s) => s.classList.add('on')))
      .fromTo(stars, { scale: 0.2, rotate: -30 }, { scale: 1, rotate: 0, duration: 0.35, stagger: 0.13, ease: 'back.out(3)' });
    if (e.tip) tl.add(() => { $('te-tip').textContent = `+ ₹${e.tip} tip`; tick?.(1.4); }).fromTo('#te-tip', { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.3 });
    tl.to(el, { opacity: 0, y: -12, duration: 0.45, delay: 2.2, onComplete: () => { el.hidden = true; } });
  }

  // Speech bubble that floats above someone in the world
  bubble(line, who, target, height = 2.1, kind = 'street', life = 4) {
    const old = this.bubbles.find((b) => b.target === target);
    if (old) this.removeBubble(old);
    if (this.bubbles.length >= 4) this.removeBubble(this.bubbles[0]);
    const el = document.createElement('div');
    el.className = `bub ${kind}`;
    el.innerHTML = `<small>${esc(who)}</small><b>${esc(line.ml)}</b><span class="mg">${esc(line.mg)}</span><span class="en">${esc(line.en)}</span>`;
    $('bubbles').appendChild(el);
    this.bubbles.push({ el, target, height, t: life });
  }
  removeBubble(b) { b.el.remove(); this.bubbles.splice(this.bubbles.indexOf(b), 1); }

  updateBubbles(dt) {
    const W = window.innerWidth, H = window.innerHeight;
    for (const b of [...this.bubbles]) {
      b.t -= dt;
      if (b.t <= 0) { this.removeBubble(b); continue; }
      const p = typeof b.target === 'function' ? b.target() : b.target;
      const v = this.v.set(p.x, p.y + b.height, p.z);
      const dist = v.distanceTo(this.camera.position);
      v.project(this.camera);
      const visible = v.z < 1 && dist < 70;
      b.el.style.opacity = visible ? Math.min(1, b.t * 2) : 0;
      if (!visible) continue;
      const sx = Math.max(140, Math.min(W - 140, (v.x + 1) / 2 * W));
      const sy = Math.max(110, Math.min(H - 40, (1 - v.y) / 2 * H));
      const sc = Math.max(0.78, Math.min(1, 14 / dist + 0.6));
      b.el.style.transform = `translate(${sx}px, ${sy}px) translate(-50%, -100%) scale(${sc})`;
    }
  }
}
