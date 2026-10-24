import { N, B, gx, hasFootpath, mulberry32 } from './config.js';
import * as THREE from 'three';
import { makePerson, poseWalk, dogGeometry, vcMat } from './models.js';

const IN = 6.5;            // footpath centre line, from road centre
const S = B - 2 * IN;      // side length of the walking loop

export class Pedestrians {
  constructor(scene) {
    const r = mulberry32(4242);
    this.list = [];
    this.dogs = [];
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      if (!hasFootpath(i, j)) continue;
      const n = 1 + (r() < 0.45 ? 1 : 0);
      for (let k = 0; k < n; k++) {
        const p = makePerson(r);
        p.i = i; p.j = j;
        p.u = r() * S * 4;
        p.dir = r() < 0.5 ? 1 : -1;
        p.speed = 1.0 + r() * 0.5;
        p.phase = r() * 10;
        p.fallen = 0;
        p.umbrellaLikes = r() < 0.7;
        p.group.position.y = 0.16;
        scene.add(p.group);
        this.list.push(p);
        this.place(p);
      }
    }
    // stray dogs trotting the footpaths
    const DOGS = ['#b08458', '#2b2420', '#d9c7a6', '#8a5a33'];
    for (let k = 0; k < 10; k++) {
      let i, j; do { i = Math.floor(r() * N); j = Math.floor(r() * N); } while (!hasFootpath(i, j));
      const g = new THREE.Group(); g.add(new THREE.Mesh(dogGeometry(DOGS[k % 4]), vcMat)); g.children[0].castShadow = true;
      const d = { group: g, i, j, u: r() * S * 4, dir: r() < 0.5 ? 1 : -1, speed: 1.6 + r() * 0.8, phase: r() * 9, dog: true, rest: 0, barkCd: 0 };
      g.position.y = 0.16; scene.add(g); this.dogs.push(d); this.place(d);
    }
  }

  // Monsoon and hartal keep people indoors
  setDay(kind, raining, night = this.night ?? 0) {
    this.night = night;
    const share = (kind === 'hartal' ? 0.3 : raining ? 0.55 : 1) * (1 - night * 0.6);   // late night: only a few people about
    this.list.forEach((p, k) => { p.hidden = ((k * 37) % 100) / 100 >= share; p.group.visible = !p.hidden; });
  }

  place(p) {
    const x0 = gx(p.i) + IN, z0 = gx(p.j) + IN, x1 = x0 + S, z1 = z0 + S;
    const u = ((p.u % (S * 4)) + S * 4) % (S * 4);
    const side = Math.floor(u / S), t = u - side * S;
    let x, z, fx, fz;
    if (side === 0) { x = x0 + t; z = z0; fx = 1; fz = 0; }
    else if (side === 1) { x = x1; z = z0 + t; fx = 0; fz = 1; }
    else if (side === 2) { x = x1 - t; z = z1; fx = -1; fz = 0; }
    else { x = x0; z = z1 - t; fx = 0; fz = -1; }
    p.group.position.x = x; p.group.position.z = z;
    p.fx = fx * p.dir; p.fz = fz * p.dir;
    if (!p.fallen) p.group.rotation.y = Math.atan2(p.fx, p.fz);
  }

  setRain(on) { for (const p of this.list) p.umbrella.visible = on && (p.umbrellaLikes || p.kind === 'kid') && p.kind !== 'fisherwoman'; this.setDay(this.day ?? 'normal', on); this.raining = on; }

  update(dt, player, events) {
    const ps = Math.abs(player.speed);
    for (const d of this.dogs) {
      const dx = player.pos.x - d.group.position.x, dz = player.pos.z - d.group.position.z, d2 = dx * dx + dz * dz;
      d.barkCd -= dt;
      if (d2 < 60 && ps > 4 && d.barkCd <= 0) { d.barkCd = 6 + Math.random() * 6; events.push({ type: 'bark', dog: d }); }
      d.rest -= dt;
      if (d.rest < -12 + Math.random() * 0.05) d.rest = 2 + Math.random() * 6;     // stop to sniff now and then
      if (d.rest <= 0) { d.u += d.dir * d.speed * dt; d.phase += dt * 14; }
      this.place(d);
      d.group.position.y = 0.16 + (d.rest <= 0 ? Math.abs(Math.sin(d.phase)) * 0.04 : 0);
      if (d2 < 1.2 && ps > 2.5) { d.u += d.dir * 3; events.push({ type: 'bark', dog: d, hit: true }); d.barkCd = 3; }
    }
    for (const p of this.list) {
      if (p.hidden) continue;
      const g = p.group;
      const dx = player.pos.x - g.position.x, dz = player.pos.z - g.position.z;
      const d2 = dx * dx + dz * dz;
      if (p.fallen > 0) {
        p.fallen -= dt;
        if (p.fallen <= 0) { g.rotation.x = 0; p.fallen = 0; p.anim?.walk(p.speed); }
        continue;
      }
      if (d2 < 1.6 && ps > 2.2) {
        p.fallen = 4;
        if (p.anim) p.anim.fall(); else g.rotation.x = -Math.PI / 2;
        g.rotation.y = Math.atan2(-dx, -dz);
        events.push({ type: 'ped', person: p, footpath: player.zone === 'footpath' });
        continue;
      }
      // close shave: the auto whizzed past
      if (p.missCd > 0) p.missCd -= dt;
      else if (d2 < 7 && ps > 6) { p.missCd = 8; events.push({ type: 'nearmiss', person: p }); }
      // step aside / wait when an auto is nosing along the footpath
      const ahead = dx * p.fx + dz * p.fz;
      const waiting = d2 < 30 && ahead > 0 && ps > 0.3;
      if (!waiting) {
        p.u += p.dir * p.speed * dt;
        p.phase += dt * p.speed * 5.2;
      }
      this.place(p);
      poseWalk(p, p.phase, waiting ? 0 : 1);
      g.position.y = 0.16 + (waiting ? 0 : Math.abs(Math.sin(p.phase)) * 0.03);
    }
  }
}
