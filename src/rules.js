import { N, B, HALF, ROAD_HALF, SPEED_LIMIT, ONE_WAY_ROWS, ONE_WAY_COLS, gx } from './config.js';

// Each violation: fine (₹, always charged) and rating hit (only matters with a passenger).
// Passenger reactions live in dialogues.js.
export const VIOLATIONS = {
  red: { title: 'Jumped a red signal', fine: 100, hit: 1, camera: true },
  wrongway: { title: 'Wrong way on a one-way', fine: 100, hit: 1, camera: true },
  overspeed: { title: `Over the ${SPEED_LIMIT} km/h limit`, fine: 50, hit: 0.5, camera: true },
  wrongside: { title: 'Keep left — wrong side of the road', fine: 0, hit: 0.5 },
  footpath: { title: 'Driving on the footpath', fine: 0, hit: 0.5 },
  crash: { title: 'Hit a vehicle', fine: 0, hit: 1 },
  bump: { title: 'Bumped into something', fine: 0, hit: 0.5 },
  ped: { title: 'Hit a pedestrian', fine: 250, hit: 2, camera: true },
};

const WRONG_WAY_GRACE = 3;   // seconds on a one-way, the wrong way, before the AI camera fines you

export function roadInfo(x, z) {
  const i = Math.round((x + HALF) / B), j = Math.round((z + HALF) / B);
  const dx = x - gx(i), dz = z - gx(j);
  const inV = i >= 0 && i <= N && Math.abs(dx) < ROAD_HALF && Math.abs(z) < HALF + ROAD_HALF;
  const inH = j >= 0 && j <= N && Math.abs(dz) < ROAD_HALF && Math.abs(x) < HALF + ROAD_HALF;
  if (inV && inH) return { junction: true, i, j };
  if (inV) return { axis: 'z', line: i, lat: dx };
  if (inH) return { axis: 'x', line: j, lat: dz };
  return null;
}

export class Rules {
  constructor(world, emit) {
    this.world = world;
    this.emit = emit;
    this.cd = {};
    this.timers = { wrongside: 0, wrongway: 0, overspeed: 0, footpath: 0 };
    this.prevInside = new Set();
    this.prev = null;
  }

  fire(type, extra) {
    if ((this.cd[type] ?? 0) > 0) return;
    this.cd[type] = type === 'overspeed' ? 9 : type === 'wrongside' ? 8 : 5;
    this.emit({ type, ...VIOLATIONS[type], ...extra });
  }

  update(dt, player, t) {
    for (const k in this.cd) this.cd[k] -= dt;
    const { x, z } = player.pos;
    const f = player.forward();
    const v = player.speed;
    const moving = Math.abs(v) > 1.5;
    const info = roadInfo(x, z);

    // keep left on two-way roads, respect one-ways
    let wrongSide = false, wrongWay = false;
    if (info && !info.junction && moving) {
      const along = info.axis === 'z' ? f.z * v : f.x * v;
      const s = Math.sign(along);
      if (Math.abs(along) > 1.2) {
        const ow = info.axis === 'z' ? ONE_WAY_COLS[info.line] : ONE_WAY_ROWS[info.line];
        if (ow !== undefined) wrongWay = s !== ow;
        else wrongSide = info.axis === 'z' ? info.lat * s < -0.7 : info.lat * s > 0.7;
      }
    }
    this.timers.wrongside = wrongSide ? this.timers.wrongside + dt : 0;
    this.timers.wrongway = wrongWay ? this.timers.wrongway + dt : 0;
    if (this.timers.wrongside > 3) this.fire('wrongside');
    // a few seconds' grace to notice the warning and turn back before the camera fines you
    if (this.timers.wrongway > WRONG_WAY_GRACE) this.fire('wrongway');

    // look ahead along the direction of travel: about to enter a one-way the wrong way?
    let noEntryAhead = false;
    const sg = Math.sign(v) || 1, mx = f.x * sg, mz = f.z * sg;
    if (moving && !wrongWay) {
      for (const d of [8, 16, 26]) {
        const a = roadInfo(x + mx * d, z + mz * d);
        if (!a || a.junction) continue;
        const along = a.axis === 'z' ? mz : mx;
        if (Math.abs(along) < 0.6) continue;
        const ow = a.axis === 'z' ? ONE_WAY_COLS[a.line] : ONE_WAY_ROWS[a.line];
        if (ow !== undefined && Math.sign(along) !== ow) { noEntryAhead = true; break; }
      }
    }

    // the next signal straight ahead (for the HUD's signal light + countdown)
    let signal = null;
    if (moving && info && !info.junction && sg > 0) {
      const along = info.axis === 'z' ? mz : mx;
      if (Math.abs(along) > 0.6) {
        const pos = info.axis === 'z' ? z : x, dir = Math.sign(along);
        const k = dir > 0 ? Math.ceil((pos + HALF) / B) : Math.floor((pos + HALF) / B);
        const dist = Math.abs(gx(k) - pos) - ROAD_HALF;
        const si = info.axis === 'z' ? info.line : k, sj = info.axis === 'z' ? k : info.line;
        const sig = this.world.signals.find((q) => q.i === si && q.j === sj);
        if (sig && dist > 0 && dist < 55) signal = { state: sig.state(info.axis, t), left: Math.ceil(sig.timeLeft(info.axis, t)), dist };
      }
    }

    const over = player.kmh > SPEED_LIMIT + 3 && player.zone === 'road';
    this.timers.overspeed = over ? this.timers.overspeed + dt : 0;
    if (this.timers.overspeed > 1.5) this.fire('overspeed', { detail: `${Math.round(player.kmh)} km/h` });

    const onFoot = player.zone === 'footpath' && moving;
    this.timers.footpath = onFoot ? this.timers.footpath + dt : 0;
    if (this.timers.footpath > 0.8) this.fire('footpath');

    // red signals: detect the moment we enter a signalled junction box
    for (const s of this.world.signals) {
      const inside = Math.abs(x - s.x) < ROAD_HALF && Math.abs(z - s.z) < ROAD_HALF;
      const id = s.i * 100 + s.j;
      if (inside && !this.prevInside.has(id) && this.prev && moving) {
        const pdx = Math.abs(this.prev.x - s.x), pdz = Math.abs(this.prev.z - s.z);
        const axis = pdx > pdz ? 'x' : 'z';
        if (s.state(axis, t) === 'R') this.fire('red');
      }
      if (inside) this.prevInside.add(id); else this.prevInside.delete(id);
    }
    this.prev = { x, z };
    this.status = { wrongSide, wrongWay, over, noEntryAhead, signal, wrongWayLeft: wrongWay ? Math.max(0, WRONG_WAY_GRACE - this.timers.wrongway) : 0 };
  }
}
