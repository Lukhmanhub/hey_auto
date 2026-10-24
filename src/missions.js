import * as THREE from 'three';
import { N, B, gx, hasFootpath, edgeAllowed } from './config.js';
import { makePerson, poseWalk, poseSeated } from './models.js';
import { ASK, THANKS, MEH, ANGRY, LATE, PAX_VIOLATION, pick } from './dialogues.js';
import { passengerName } from './hud.js';

const HOUSES = [
  ['Puthenveedu', 'പുത്തൻവീട്'], ['Kizhakkethil', 'കിഴക്കേതിൽ'], ['Vadakkedath', 'വടക്കേടത്ത്'], ['Panikkaveettil', 'പണിക്കവീട്ടിൽ'],
  ['Thekkedath', 'തെക്കേടത്ത്'], ['Mangalath', 'മംഗലത്ത്'], ['Kollamparambil', 'കൊല്ലംപറമ്പിൽ'], ['Chirayil', 'ചിറയിൽ'],
  ['Pallathu', 'പള്ളത്ത്'], ['Moozhikkal', 'മൂഴിക്കൽ'],
];

const nodePos = (i, j) => new THREE.Vector3(gx(i), 0, gx(j));
const nearestNode = (x, z) => [Math.max(0, Math.min(N, Math.round((x + N * B / 2) / B))), Math.max(0, Math.min(N, Math.round((z + N * B / 2) / B)))];

// Dijkstra over the junction grid (respects one-ways). Returns node list.
export function route(fromX, fromZ, toX, toZ) {
  const s = nearestNode(fromX, fromZ), g = nearestNode(toX, toZ);
  const K = (i, j) => i * (N + 1) + j;
  const dist = new Float64Array((N + 1) ** 2).fill(Infinity);
  const prev = new Int32Array((N + 1) ** 2).fill(-1);
  const done = new Uint8Array((N + 1) ** 2);
  dist[K(...s)] = 0;
  for (;;) {
    let u = -1, best = Infinity;
    for (let k = 0; k < dist.length; k++) if (!done[k] && dist[k] < best) { best = dist[k]; u = k; }
    if (u < 0) break;
    done[u] = 1;
    const ui = Math.floor(u / (N + 1)), uj = u % (N + 1);
    if (ui === g[0] && uj === g[1]) break;
    for (const [vi, vj] of [[ui + 1, uj], [ui - 1, uj], [ui, uj + 1], [ui, uj - 1]]) {
      if (vi < 0 || vj < 0 || vi > N || vj > N || !edgeAllowed(ui, uj, vi, vj)) continue;
      const v = K(vi, vj);
      if (dist[u] + B < dist[v]) { dist[v] = dist[u] + B; prev[v] = u; }
    }
  }
  const path = [];
  for (let k = K(...g); k >= 0; k = prev[k]) path.unshift(nodePos(Math.floor(k / (N + 1)), k % (N + 1)));
  if (!path.length) path.push(nodePos(...g));
  return path;
}

export class Missions {
  constructor(scene, world, player, rand = Math.random) {
    this.scene = scene; this.world = world; this.player = player; this.r = rand;
    this.state = 'cooldown'; this.timer = 1.5;
    // the day starts in the red: the auto's daily rent is paid up front
    this.rent = 250;
    this.cash = -this.rent; this.fares = 0; this.trips = 0; this.ratings = []; this.fines = 0;
    this.pax = null; this.spot = null; this.dest = null;
    this.events = [];
    this.lastLandmark = null;
    this.walkers = [];

    const beamGeo = new THREE.CylinderGeometry(1.6, 1.6, 60, 28, 1, true);
    this.beam = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: '#ffd23f', transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false }));
    this.beam.position.y = 30;
    this.ring = new THREE.Mesh(new THREE.RingGeometry(2.4, 3.1, 48), new THREE.MeshBasicMaterial({ color: '#ffd23f', transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide }));
    this.ring.rotation.x = -Math.PI / 2;
    this.marker = new THREE.Group();
    this.marker.add(this.beam, this.ring);
    this.marker.visible = false;
    scene.add(this.marker);
  }

  get rating() { return this.ratings.length ? this.ratings.reduce((a, b) => a + b, 0) / this.ratings.length : 5; }

  randomSpot(minD = 0, maxD = 1e9) {
    const p = this.player.pos;
    for (let tries = 0; tries < 200; tries++) {
      const i = Math.floor(this.r() * N), j = Math.floor(this.r() * N);
      if (!hasFootpath(i, j)) continue;
      const side = Math.floor(this.r() * 4);
      let t = 12 + this.r() * (B - 24);
      if (Math.abs(t - B / 2) < 4) t += 6;
      const ox = gx(i), oz = gx(j);
      const pts = [[ox + t, oz + 6.5, 0, -1], [ox + B - 6.5, oz + t, 1, 0], [ox + t, oz + B - 6.5, 0, 1], [ox + 6.5, oz + t, -1, 0]];
      const [x, z, fx, fz] = pts[side];
      const d = Math.hypot(x - p.x, z - p.z);
      if (d < minD || d > maxD) continue;
      return { x, z, face: [fx, fz] };
    }
    return { x: gx(1) + 20, z: gx(1) + 6.5, face: [0, -1] };
  }

  setMarker(spot, color) {
    this.marker.visible = !!spot;
    if (!spot) return;
    this.marker.position.set(spot.x, 0.2, spot.z);
    this.beam.material.color.set(color); this.ring.material.color.set(color);
  }

  newPickup() {
    this.spot = this.randomSpot(70, 230);
    const p = makePerson(this.r);
    p.group.position.set(this.spot.x, 0.16, this.spot.z);
    p.group.rotation.y = Math.atan2(this.spot.face[0], this.spot.face[1]);
    this.scene.add(p.group);
    this.pax = p;
    // dark outfits make a poor avatar background; fall back to a warm tone
    const c = new THREE.Color(p.outfit);
    const color = c.getHSL({}).l > 0.75 ? '#c58b4a' : p.outfit;
    this.paxInfo = { name: passengerName(p.female), color, stars: 4 + Math.round(this.r() * 9) / 10 };
    this.state = 'pickup';
    this.setMarker(this.spot, '#ffd23f');
    this.events.push({ type: 'pickup' });
    this.refreshRoute(this.spot);
  }

  chooseDestination() {
    const kinds = Object.keys(this.world.lmSpots).filter((k) => k !== this.lastLandmark);
    const p = this.player.pos;
    for (let tries = 0; tries < 30; tries++) {
      if (this.r() < 0.7) {
        const k = kinds[Math.floor(this.r() * kinds.length)];
        const s = this.world.lmSpots[k];
        if (Math.hypot(s.x - p.x, s.z - p.z) < 110) continue;
        this.lastLandmark = k;
        return { ...s };
      }
      const s = this.randomSpot(130, 400);
      const [h, hm] = HOUSES[Math.floor(this.r() * HOUSES.length)];
      const ml = h === 'Puthenveedu' ? hm : `${hm} വീട്`;
      return { ...s, name: `${h} House`, ml, short: h === 'Puthenveedu' ? h : `${h} veedu`, shortMl: ml };
    }
    const k = kinds[0];
    return { ...this.world.lmSpots[k] };
  }

  refreshRoute(target) {
    const p = this.player.pos;
    const nodes = route(p.x, p.z, target.x, target.z);
    const pts = [new THREE.Vector3(p.x, 0, p.z), ...nodes, new THREE.Vector3(target.x, 0, target.z)];
    let len = 0;
    for (let k = 1; k < pts.length; k++) len += pts[k].distanceTo(pts[k - 1]);
    this.route = pts;
    this.routeLen = len;
  }

  say(line) { this.events.push({ type: 'say', line }); }

  // called by main when a rule is broken
  onViolation(v) {
    this.cash -= v.fine;
    this.fines += v.fine;
    if (this.state === 'riding') {
      this.tripRating = Math.max(1, this.tripRating - v.hit);
      this.tripViolations++;
      if (this.r() < 0.85 && PAX_VIOLATION[v.type]) this.say(PAX_VIOLATION[v.type]);
    }
  }

  get fare() {
    // Meter shows "real" km (town is compressed 1:5): ₹30 minimum for 1.5 km, then ₹15/km
    const km = (this.meter * 5) / 1000;
    return Math.round((30 + Math.max(0, km - 1.5) * 15) * (this.fareMult ?? 1) * (this.nightMult ?? 1));   // hartal ×2, night charge ×1.5 after 10 pm
  }
  get meterKm() { return (this.meter * 5) / 1000; }

  update(dt, t) {
    const pl = this.player;
    const speed = Math.abs(pl.speed);
    this.ring.scale.setScalar(1 + Math.sin(t * 4) * 0.08);
    if (this.marker.visible) {
      // fade the beam out as you arrive so it doesn't wash over the camera
      const d = Math.hypot(pl.pos.x - this.marker.position.x, pl.pos.z - this.marker.position.z);
      this.beam.material.opacity = 0.22 * Math.min(1, Math.max(0, (d - 6) / 18));
    }
    this.routeT = (this.routeT ?? 0) - dt;

    for (let k = this.walkers.length - 1; k >= 0; k--) {
      const w = this.walkers[k];
      w.t -= dt;
      w.p.phase = (w.p.phase ?? 0) + dt * 6;
      w.p.group.position.x += w.fx * dt * 1.3; w.p.group.position.z += w.fz * dt * 1.3;
      poseWalk(w.p, w.p.phase);
      if (w.t <= 0) { this.scene.remove(w.p.group); this.walkers.splice(k, 1); }
    }

    if (this.state === 'cooldown') {
      this.timer -= dt;
      if (this.timer <= 0) this.newPickup();
      return;
    }

    if (this.state === 'pickup') {
      const d = Math.hypot(pl.pos.x - this.spot.x, pl.pos.z - this.spot.z);
      this.distLeft = d;
      // wave
      const p = this.pax;
      if (p.anim) p.anim.hail(true);
      else { p.armR.rotation.x = -2.6 + Math.sin(t * 7) * 0.35; p.armR.rotation.z = Math.sin(t * 7) * 0.2; }
      if (d < 25) p.group.rotation.y = Math.atan2(pl.pos.x - this.spot.x, pl.pos.z - this.spot.z);
      if (this.routeT <= 0) { this.refreshRoute(this.spot); this.routeT = 0.5; }
      if (d < 7 && speed < 1.4) {
        this.state = 'boarding'; this.timer = 1.1;
        this.boardFrom = p.group.position.clone();
      }
      return;
    }

    if (this.state === 'boarding') {
      this.timer -= dt;
      const p = this.pax;
      const side = new THREE.Vector3(Math.cos(pl.heading), 0, -Math.sin(pl.heading)).multiplyScalar(1.1);
      const target = pl.pos.clone().add(side);
      p.group.position.lerpVectors(this.boardFrom, target, Math.min(1, 1 - this.timer / 1.1));
      p.armR.rotation.set(0, 0, 0); p.anim?.hail(false);
      p.phase = (p.phase ?? 0) + dt * 7; poseWalk(p, p.phase);
      if (this.timer <= 0) {
        this.scene.remove(p.group);
        pl.m.body.add(p.group);
        p.group.position.copy(pl.m.seat);
        if (p.anim) { p.group.position.y = pl.m.seatY; p.anim.sit(Math.random() < 0.5); }
        p.group.rotation.set(0, 0, 0);
        poseSeated(p);
        this.dest = this.chooseDestination();
        this.state = 'riding';
        this.meter = 0; this.tripRating = 5; this.tripViolations = 0; this.late = false;
        this.refreshRoute(this.dest);
        this.timeLeft = this.timeTotal = Math.round(this.routeLen / 7 + 25);
        this.setMarker(this.dest, '#3ee07a');
        this.say(pick(ASK)(this.dest));
        this.events.push({ type: 'board' });
        this.lastPos = pl.pos.clone();
      }
      return;
    }

    if (this.state === 'riding') {
      this.meter += pl.pos.distanceTo(this.lastPos);
      this.lastPos.copy(pl.pos);
      this.timeLeft -= dt;
      if (this.timeLeft < 0 && !this.late) {
        this.late = true;
        this.tripRating = Math.max(1, this.tripRating - 1);
        this.say(LATE);
      }
      if (this.routeT <= 0) { this.refreshRoute(this.dest); this.routeT = 0.5; }
      const d = Math.hypot(pl.pos.x - this.dest.x, pl.pos.z - this.dest.z);
      this.distLeft = Math.min(d, this.routeLen);
      if (d < 8 && speed < 1.4) this.dropOff();
    }
  }

  dropOff() {
    const pl = this.player;
    const fare = this.fare;
    const rating = Math.round(this.tripRating * 2) / 2;
    let tip = 0;
    if (rating >= 4.5 && !this.late) tip = 10 + Math.round(this.r() * 4) * 5;
    this.cash += fare + tip;
    this.fares += fare + tip;
    this.trips++;
    this.ratings.push(rating);
    this.events.push({ type: 'paid', fare, tip, rating, dest: this.dest.name, line: pick(rating >= 4.5 ? THANKS : rating >= 3 ? MEH : ANGRY) });

    // passenger hops out and walks off
    const p = this.pax;
    pl.m.body.remove(p.group);
    const side = new THREE.Vector3(Math.cos(pl.heading), 0, -Math.sin(pl.heading));
    p.group.position.set(pl.pos.x + side.x * 1.3, 0.16, pl.pos.z + side.z * 1.3);
    const f = pl.forward();
    p.group.rotation.set(0, Math.atan2(f.x, f.z), 0);
    p.legL.rotation.x = p.legR.rotation.x = 0;
    this.scene.add(p.group);
    this.walkers.push({ p, t: 6, fx: f.x, fz: f.z });

    this.pax = null; this.dest = null; this.route = null;
    this.setMarker(null);
    this.state = 'cooldown'; this.timer = 2.5;
  }
}
