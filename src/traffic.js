import * as THREE from 'three';
import { N, B, LANE, gx, edgeAllowed, mulberry32 } from './config.js';
import {
  carGeometry, busGeometry, scooterGeometry, autoGeometry, vcMat, autoBackDecals, AUTO_NAMES, randomPlate,
  busDecals, BUS_NAMES, conductorGeometry, elephantGeometry, cowGeometry, fishCycleGeometry, ambassadorGeometry,
  tempoGeometry, goodsAutoGeometry, schoolVanGeometry, jeepGeometry,
} from './models.js';
import { PARTIES } from './prints.js';

const TURN_IN = 6;      // lanes stop this far from a junction centre; the turn curve fills the gap
const STOP_LINE = 8.9;

const TYPES = {
  car: { halfLen: 2.0, halfW: 0.9, max: 12, accel: 3.2 },
  auto: { halfLen: 1.4, halfW: 0.72, max: 9, accel: 2.4 },
  bus: { halfLen: 5.1, halfW: 1.3, max: 9.5, accel: 1.7 },
  scooter: { halfLen: 0.9, halfW: 0.45, max: 11.5, accel: 3.8 },
  taxi: { halfLen: 2.2, halfW: 0.88, max: 11, accel: 2.6 },
  tempo: { halfLen: 2.6, halfW: 1.0, max: 9, accel: 2.0 },
  goods: { halfLen: 1.6, halfW: 0.75, max: 8, accel: 2.0 },
  van: { halfLen: 2.2, halfW: 0.9, max: 10, accel: 2.6 },
  fish: { halfLen: 0.9, halfW: 0.4, max: 4.2, accel: 1.5 },
  cow: { halfLen: 1.2, halfW: 0.5, max: 0.6, accel: 0.5 },
  jeep: { halfLen: 1.9, halfW: 0.85, max: 5, accel: 1.8 },
  elephant: { halfLen: 2.4, halfW: 1.1, max: 0.9, accel: 0.4 },
};
// which day events each type appears on (default: every day except hartal thins traffic out)
const ONLY = { jeep: 'election', elephant: 'festival' };
const CAR_COLORS = ['#f5f5f5', '#c0c4c8', '#b71c1c', '#1e3a6e', '#232323', '#7a8b99', '#e0d6c2', '#f5f5f5'];
const AUTO_COLORS = [['#f4c20d', '#151515'], ['#2e7d32', '#f4c20d'], ['#f4c20d', '#2e7d32']];
const SCOOTER = [['#c62828', '#9ec5e8'], ['#1565c0', '#f5f5f5'], ['#f5f5f5', '#b0473f'], ['#212121', '#e8d28e'], ['#00897b', '#f5f5f5']];
const BUSES = [['#b71c1c', '#f2c200', true], ['#1e88e5', '#fdd835', false], ['#8e24aa', '#ffffff', false], ['#00897b', '#ffeb3b', false]];

// Headlights (with a faint beam cone on the road) and tail lights; brightened at night by setNight.
const HEAD = new THREE.MeshBasicMaterial({ color: '#2a2822' });
const TAIL = new THREE.MeshBasicMaterial({ color: '#400a08' });
const BEAM = new THREE.MeshBasicMaterial({ color: '#fff1cc', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
const lightGeo = new THREE.BoxGeometry(0.22, 0.12, 0.04);
const beamGeo = new THREE.ConeGeometry(2.2, 9, 16, 1, true).rotateX(-Math.PI / 2).translate(0, 0, 4.5);
function vehicleLights(c) {
  const g = new THREE.Group();
  const front = { car: [0.56, 0.74], taxi: [0.55, 0.78], van: [0.6, 0.85], bus: [0.85, 0.9], tempo: [0.6, 1.0], jeep: [0.6, 1.0], scooter: [0, 1.1], auto: [0, 1.08], goods: [0, 1.08] }[c.type] ?? [0.5, 0.8];
  const z = c.halfLen + 0.02, [sx, y] = front;
  for (const x of sx ? [-sx, sx] : [0]) {
    const h = new THREE.Mesh(lightGeo, HEAD); h.position.set(x, y, z); g.add(h);
    const t = new THREE.Mesh(lightGeo, TAIL); t.position.set(x || 0.5, Math.min(y, 0.9), -z); g.add(t);
  }
  const beam = new THREE.Mesh(beamGeo, BEAM); beam.position.set(0, y - 0.1, z); beam.rotation.x = 0.12; g.add(beam);
  return g;
}

const neighbors = (i, j) => [[i + 1, j], [i - 1, j], [i, j + 1], [i, j - 1]].filter(([a, b]) => a >= 0 && a <= N && b >= 0 && b <= N);
const key = (n) => `${n[0]},${n[1]}`;

export class Traffic {
  constructor(scene, world, avoid) {
    this.scene = scene;
    this.cars = [];
    this.occ = new Map();
    this.signalAt = new Map(world.signals.map((s) => [`${s.i},${s.j}`, s]));
    this.r = mulberry32(77);
    const mix = [...Array(11).fill('car'), ...Array(9).fill('auto'), ...Array(7).fill('scooter'), ...Array(5).fill('bus'),
      'taxi', 'taxi', 'tempo', 'tempo', 'goods', 'goods', 'van', 'fish', 'fish', 'cow', 'cow', 'cow', 'jeep', 'jeep'];
    for (const type of mix) this.spawn(type, avoid);
    // Pooram procession: elephants walk a fixed loop round the temple block, nose to tail
    const loop = [[2, 6], [3, 6], [3, 7], [2, 7]];
    ['#d81b60', '#1e88e5', '#f2c94c'].forEach((parasol, k) => this.spawn('elephant', null, { loop, k, parasol }));
    this.all = this.cars;
    this.setDay('normal');
  }

  setNight(n) {
    HEAD.color.setRGB(3 * n + 0.15, 2.8 * n + 0.14, 2.2 * n + 0.12);
    TAIL.color.setRGB(2.2 * n + 0.25, 0.08, 0.06);
    BEAM.opacity = 0.22 * n; BEAM.visible = n > 0.05;
  }

  // Day events change who's on the road
  setDay(kind) {
    this.day = kind;
    const r = mulberry32(kind.length * 131);
    for (const c of this.all) {
      let on = !ONLY[c.type] || ONLY[c.type] === kind;
      if (kind === 'hartal' && !['cow', 'fish'].includes(c.type)) on = r() < 0.12;        // shutters down, roads empty
      if (kind === 'monsoon' && c.type === 'fish') on = false;
      c.active = on; c.mesh.visible = on;
    }
    this.cars = this.all.filter((c) => c.active);
    this.occ.clear();
  }

  spawn(type, avoid, opts = {}) {
    const r = this.r;
    const c = { type, ...TYPES[type], speed: 0, wait: 0, honkCd: 0, blockedByPlayer: 0, pos: new THREE.Vector3(), heading: 0, timer: r() * 8 };
    for (let tries = 0; tries < 80; tries++) {
      if (opts.loop) {
        c.loop = opts.loop; c.li = 0;
        this.setLane(c, opts.loop[0], opts.loop[1]);
        c.s = c.laneLen - 6 - opts.k * 6.5;
      } else {
        const ai = Math.floor(r() * (N + 1)), aj = Math.floor(r() * (N + 1));
        const nb = neighbors(ai, aj).filter(([bi, bj]) => edgeAllowed(ai, aj, bi, bj));
        if (!nb.length) continue;
        const [bi, bj] = nb[Math.floor(r() * nb.length)];
        this.setLane(c, [ai, aj], [bi, bj]);
        c.s = 3 + r() * (c.laneLen - 14);
      }
      this.place(c);
      if (!opts.loop && avoid && c.pos.distanceTo(avoid) < 30) continue;
      if (!opts.loop && this.cars.some((o) => o.pos.distanceTo(c.pos) < 14)) continue;
      let geo;
      if (type === 'car') geo = carGeometry(CAR_COLORS[Math.floor(r() * CAR_COLORS.length)]);
      else if (type === 'auto') { const [a, b] = AUTO_COLORS[Math.floor(r() * AUTO_COLORS.length)]; geo = autoGeometry(a, b); }
      else if (type === 'scooter') { const [a, b] = SCOOTER[Math.floor(r() * SCOOTER.length)]; geo = scooterGeometry(a, b); }
      else if (type === 'taxi') geo = ambassadorGeometry(r() < 0.5 ? '#f4f1e8' : '#111111');
      else if (type === 'tempo') geo = tempoGeometry(r() < 0.5 ? '#1565c0' : '#c62828');
      else if (type === 'goods') geo = goodsAutoGeometry();
      else if (type === 'van') geo = schoolVanGeometry();
      else if (type === 'fish') geo = fishCycleGeometry();
      else if (type === 'cow') geo = cowGeometry(r() < 0.6 ? '#e8e2d6' : '#7a5232');
      else if (type === 'jeep') { c.party = PARTIES[Math.floor(r() * PARTIES.length)]; geo = jeepGeometry(c.party.col); }
      else if (type === 'elephant') geo = elephantGeometry(opts.parasol);
      else { const [a, b, k] = BUSES[Math.floor(r() * BUSES.length)]; geo = busGeometry(a, b, k); c.gov = k; c.cols = [a, b]; }
      c.mesh = new THREE.Mesh(geo, vcMat);
      c.mesh.castShadow = true;
      if (!['cow', 'elephant', 'fish'].includes(type)) c.mesh.add(vehicleLights(c));
      if (type === 'bus') {
        c.mesh.add(busDecals(c.gov ? 'കെ.ആർ.ടി.സി' : BUS_NAMES[Math.floor(r() * BUS_NAMES.length)], c.gov ? ['#f2c200', '#7a0a0a'] : [c.cols[1], c.cols[0]], c.gov));
        if (!c.gov) { const cd = new THREE.Mesh(conductorGeometry(), vcMat); cd.position.set(1.3, 0.2, 3.9); cd.rotation.y = Math.PI / 2; c.mesh.add(cd); }
      }
      if (type === 'auto') c.mesh.add(autoBackDecals(AUTO_NAMES[1 + Math.floor(r() * (AUTO_NAMES.length - 1))], randomPlate(r)));
      c.max *= 0.85 + r() * 0.3;
      this.scene.add(c.mesh);
      this.cars.push(c);
      this.sync(c);
      return;
    }
  }

  setLane(c, a, b) {
    c.a = a; c.b = b;
    const fx = Math.sign(b[0] - a[0]), fz = Math.sign(b[1] - a[1]);
    c.f = [fx, fz];
    const lx = fz, lz = -fx;                              // keep left
    c.start = [gx(a[0]) + fx * TURN_IN + lx * LANE, gx(a[1]) + fz * TURN_IN + lz * LANE];
    c.laneLen = B - 2 * TURN_IN;
    c.s = 0; c.state = 'lane'; c.next = null;
    c.heading = Math.atan2(fx, fz);
  }

  chooseNext(c) {
    if (c.loop) { c.li = (c.li + 1) % c.loop.length; c.next = c.loop[(c.li + 1) % c.loop.length]; return; }
    const [bi, bj] = c.b;
    let opts = neighbors(bi, bj).filter((n) => !(n[0] === c.a[0] && n[1] === c.a[1]) && edgeAllowed(bi, bj, n[0], n[1]));
    if (!opts.length) opts = [c.a];
    // prefer going straight a little more often
    const straight = opts.find((n) => Math.sign(n[0] - bi) === c.f[0] && Math.sign(n[1] - bj) === c.f[1]);
    c.next = straight && this.r() < 0.45 ? straight : opts[Math.floor(this.r() * opts.length)];
  }

  beginTurn(c) {
    const [bi, bj] = c.b, [ni, nj] = c.next;
    const f2x = Math.sign(ni - bi), f2z = Math.sign(nj - bj);
    const p0 = [c.start[0] + c.f[0] * c.laneLen, c.start[1] + c.f[1] * c.laneLen];
    const p2 = [gx(bi) + f2x * TURN_IN + f2z * LANE, gx(bj) + f2z * TURN_IN - f2x * LANE];
    let p1;
    if (f2x === -c.f[0] && f2z === -c.f[1]) p1 = [gx(bi) + c.f[0] * 4, gx(bj) + c.f[1] * 4];
    else p1 = c.f[0] ? [p2[0], p0[1]] : [p0[0], p2[1]];
    const d = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);
    c.turn = { p0, p1, p2, len: Math.max(1, (d(p0, p1) + d(p1, p2) + d(p0, p2)) / 2), t: 0, from: key(c.f) };
    c.state = 'turn';
    const k = key(c.b);
    if (!this.occ.has(k)) this.occ.set(k, new Set());
    this.occ.get(k).add(c);
  }

  endTurn(c) {
    this.occ.get(key(c.b))?.delete(c);
    this.setLane(c, c.b, c.next);
  }

  place(c) {
    if (c.state === 'lane') {
      c.pos.set(c.start[0] + c.f[0] * c.s, 0, c.start[1] + c.f[1] * c.s);
      c.heading = Math.atan2(c.f[0], c.f[1]);
    } else {
      const { p0, p1, p2, t } = c.turn, u = 1 - t;
      c.pos.set(u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0], 0, u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]);
      const dx = 2 * u * (p1[0] - p0[0]) + 2 * t * (p2[0] - p1[0]);
      const dz = 2 * u * (p1[1] - p0[1]) + 2 * t * (p2[1] - p1[1]);
      if (dx * dx + dz * dz > 1e-4) c.heading = Math.atan2(dx, dz);
    }
  }

  sync(c) {
    c.mesh.position.copy(c.pos);
    c.mesh.rotation.y = c.heading;
  }

  canEnter(c, sig) {
    if (sig) {
      const st = sig.state(c.f[0] ? 'x' : 'z', this.time);
      if (st === 'R') return false;
      if (st === 'Y' && c.speed < 4) return false;
    }
    const occ = this.occ.get(key(c.b));
    if (!occ || !occ.size || c.wait > 5) return true;
    const mine = key(c.f);
    for (const o of occ) {
      if (o.turn.from === mine) continue;
      if (sig && (o.f[0] !== 0) === (c.f[0] !== 0)) continue;   // same signal phase
      return false;
    }
    return true;
  }

  update(dt, t, player, events) {
    this.time = t;
    for (const c of this.cars) {
      // deadlock breaker: a car stuck for a long time drives through other AI cars briefly
      if (c.speed < 0.2) c.stuck = (c.stuck ?? 0) + dt; else c.stuck = 0;
      if (c.stuck > 7) { c.ghost = 2.5; c.stuck = 0; }
      if (c.ghost > 0) c.ghost -= dt;
      const fx = Math.sin(c.heading), fz = Math.cos(c.heading);
      let target = c.max;
      let gap = Infinity;
      // cows amble, then stop dead in the lane for a while; the fish vendor and the jeep make noise
      c.timer -= dt;
      if (c.type === 'cow') { if (c.timer < 0) { c.grazing = !c.grazing; c.timer = c.grazing ? 6 + this.r() * 12 : 4 + this.r() * 8; } if (c.grazing) target = 0; }
      if (c.type === 'fish' && c.timer < 0) { c.timer = 7 + this.r() * 6; events.push({ type: 'fishcall', car: c }); }
      if (c.type === 'jeep' && c.timer < 0) { c.timer = 10 + this.r() * 5; events.push({ type: 'announce', car: c }); }
      if (c.bumpCd > 0) c.bumpCd -= dt;
      for (const o of this.cars) {
        if (o === c) continue;
        const dx = o.pos.x - c.pos.x, dz = o.pos.z - c.pos.z;
        // two AI vehicles touching (usually after a deadlock break) → they stop and argue
        const touch = Math.min(c.halfLen, o.halfLen) + 0.5;
        if (dx * dx + dz * dz < touch * touch && c.speed + o.speed > 2.5 && !(c.bumpCd > 0) && !(o.bumpCd > 0)) {
          c.argue = o.argue = 5;
          c.bumpCd = o.bumpCd = 40;
          c.ghost = 8;
          events.push({ type: 'aibump', a: c, b: o });
        }
        if (c.ghost > 0) continue;
        const along = dx * fx + dz * fz;
        if (along <= 0 || along > 22) continue;
        const lat = Math.abs(dx * fz - dz * fx);
        if (lat > c.halfW + o.halfW + 0.4) continue;
        gap = Math.min(gap, along - c.halfLen - o.halfLen);
      }
      // the player
      let byPlayer = false;
      {
        const dx = player.pos.x - c.pos.x, dz = player.pos.z - c.pos.z;
        const along = dx * fx + dz * fz;
        const lat = Math.abs(dx * fz - dz * fx);
        if (along > 0 && along < 22 && lat < c.halfW + 1.1) {
          const g = along - c.halfLen - 1.4;
          if (g < gap) { gap = g; byPlayer = true; }
        }
      }
      if (gap < Infinity) target = Math.min(target, Math.max(0, (gap - 2) * 1.1));
      if (c.argue > 0) { c.argue -= dt; target = 0; }

      if (c.state === 'lane') {
        if (!c.next && c.s > c.laneLen - 20) this.chooseNext(c);
        const sig = this.signalAt.get(key(c.b));
        const gate = sig ? c.laneLen - (STOP_LINE - TURN_IN) - c.halfLen : c.laneLen - c.halfLen * 0.5;
        if (c.s < gate + 0.3 && c.s > gate - 25 && c.next) {
          if (!this.canEnter(c, sig)) {
            target = Math.min(target, Math.max(0, (gate - c.s) * 1.3));
            if (gate - c.s < 0.5) target = 0;
            if (c.speed < 0.3 && gate - c.s < 1.5) c.wait += dt;
          } else if (gate - c.s < 1.5) c.wait = 0;
        }
      }

      const dv = target - c.speed;
      c.speed += Math.max(-9 * dt, Math.min(c.accel * dt, dv));
      if (c.speed < 0) c.speed = 0;

      // honk if the player is blocking
      c.honkCd -= dt;
      if (byPlayer && c.speed < 0.5 && gap < 4) c.blockedByPlayer += dt; else c.blockedByPlayer = 0;
      if (c.blockedByPlayer > 2.2 && c.honkCd <= 0 && c.type !== 'cow' && c.type !== 'elephant') { events.push({ type: 'honk', car: c }); c.honkCd = 3 + this.r() * 3; }

      if (c.state === 'lane') {
        c.s += c.speed * dt;
        if (c.s >= c.laneLen) {
          if (!c.next) this.chooseNext(c);
          this.beginTurn(c);
        }
      } else {
        c.turn.t += (c.speed * dt) / c.turn.len;
        if (c.turn.t >= 1) this.endTurn(c);
      }
      this.place(c);
      this.sync(c);
    }
  }

  // Treat each vehicle as a capsule along its heading; push the player out.
  collidePlayer(player, events) {
    const pr = 1.0;
    const pf = player.forward();
    for (const c of this.cars) {
      const fx = Math.sin(c.heading), fz = Math.cos(c.heading);
      const seg = c.halfLen - c.halfW;
      const dx = player.pos.x - c.pos.x, dz = player.pos.z - c.pos.z;
      if (dx * dx + dz * dz > 100) continue;
      const along = Math.max(-seg, Math.min(seg, dx * fx + dz * fz));
      const qx = c.pos.x + fx * along, qz = c.pos.z + fz * along;
      let nx = player.pos.x - qx, nz = player.pos.z - qz;
      const d = Math.hypot(nx, nz);
      const min = c.halfW + pr;
      if (d >= min) continue;
      if (d < 1e-4) { nx = -fz; nz = fx; } else { nx /= d; nz /= d; }
      player.pos.x += nx * (min - d);
      player.pos.z += nz * (min - d);
      const rvx = pf.x * player.speed - fx * c.speed, rvz = pf.z * player.speed - fz * c.speed;
      const impact = Math.abs(rvx * nx + rvz * nz);
      const dot = pf.x * nx + pf.z * nz;
      if (player.speed * dot < 0) player.speed *= 0.35;
      c.speed *= 0.5;
      if (impact > 2.2 && (player.crashCd ?? 0) <= 0) {
        events.push({ type: 'crash', impact, car: c });
        player.crashCd = 1.2;
      }
    }
  }
}
