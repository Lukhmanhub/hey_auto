import * as THREE from 'three';
import { makePlayerAuto } from './models.js';
import { clamp, lerp } from './config.js';

const WHEELBASE = 1.92;
const TOP = { road: 16.5, footpath: 9, alley: 10, yard: 8, paddy: 7, grass: 11 };

export class Player {
  constructor(scene, x, z, heading) {
    this.m = makePlayerAuto();
    scene.add(this.m.root);
    this.pos = new THREE.Vector3(x, 0, z);
    this.heading = heading;
    this.speed = 0;      // m/s along heading (negative = reverse)
    this.steer = 0;
    this.yawRate = 0;
    this.roll = 0;
    this.pitch = 0;
    this.y = 0;
    this.accel = 0;
    this.crashCd = 0;
    this.throttle = 0;
    this.odo = 0;
    this._f = new THREE.Vector3();
  }

  forward() { return this._f.set(Math.sin(this.heading), 0, Math.cos(this.heading)); }
  get kmh() { return Math.abs(this.speed) * 3.6; }

  update(dt, input, world, t) {
    const zone = world.zoneAt(this.pos.x, this.pos.z);
    this.zone = zone;
    const top = TOP[zone] ?? 16.5;
    let a = 0;
    this.throttle = input.up ? 1 : 0;
    if (input.up) a += this.speed < -0.3 ? 10 : 6 * (1 - Math.max(0, this.speed) / top);
    const grip = this.grip ?? 1;   // wet roads: weaker brakes, wider turns
    if (input.down) a += this.speed > 0.3 ? -11 * grip : -3.4 * (1 + this.speed / 4.5);
    a -= this.speed * 0.04 + Math.sign(this.speed) * 0.2;
    if (input.brake) a -= Math.sign(this.speed) * 14 * grip;
    if (this.speed > top) a -= (this.speed - top) * 2.5;
    if (zone === 'paddy') a -= this.speed * 0.4;
    this.speed += a * dt;
    if (!input.up && !input.down && Math.abs(this.speed) < 0.25) this.speed = 0;
    this.accel = a;

    const maxSteer = (0.62 / (1 + Math.abs(this.speed) * 0.085)) * (0.8 + 0.2 * grip);
    const want = input.steer ?? (input.left ? 1 : 0) - (input.right ? 1 : 0);   // analog stick or keys
    const rate = want ? 3.2 : 5;
    this.steer += clamp(want * maxSteer - this.steer, -rate * dt, rate * dt);
    this.yawRate = (this.speed * Math.tan(this.steer)) / WHEELBASE;
    this.heading += this.yawRate * dt;

    const f = this.forward();
    this.odo += Math.abs(this.speed * dt);
    this.pos.x += f.x * this.speed * dt;
    this.pos.z += f.z * this.speed * dt;

    // two circles (nose + tail) against static colliders
    let bump = null;
    for (const off of [0.62, -0.62]) {
      const c = new THREE.Vector3(this.pos.x + f.x * off, 0, this.pos.z + f.z * off);
      const ox = c.x, oz = c.z;
      const hit = world.colliders.resolve(c, 0.82);
      if (hit) {
        this.pos.x += c.x - ox; this.pos.z += c.z - oz;
        const dot = f.x * hit.nx + f.z * hit.nz;
        const impact = Math.abs(this.speed * dot);
        if (this.speed * dot < 0) this.speed *= 1 - 0.85 * Math.abs(dot);
        if (impact > 3.5 && (!bump || impact > bump.impact)) bump = { impact, tag: hit.tag };
      }
    }
    this.crashCd -= dt;

    // ride feel: kerb height, roll in corners, pitch on accel, bumps on rough ground
    const rough = zone === 'paddy' ? 0.05 : zone === 'alley' || zone === 'yard' || zone === 'grass' ? 0.025 : 0.006;
    const sp = Math.min(1, Math.abs(this.speed) / 8);
    this.y = lerp(this.y, zone === 'footpath' ? 0.16 : 0, Math.min(1, dt * 14));
    this.roll = lerp(this.roll, clamp(this.yawRate * this.speed * 0.028, -0.2, 0.2), Math.min(1, dt * 6));
    this.pitch = lerp(this.pitch, clamp(-a * 0.006, -0.05, 0.05), Math.min(1, dt * 5));

    const m = this.m;
    m.root.position.set(this.pos.x, this.y, this.pos.z);
    m.root.rotation.y = this.heading;
    m.body.rotation.z = this.roll + Math.sin(t * 31) * 0.004 * (0.4 + this.throttle);
    m.body.rotation.x = this.pitch + Math.sin(t * 13.7) * rough * sp;
    m.body.position.y = Math.abs(Math.sin(t * 9.1)) * rough * sp + Math.sin(t * 40) * 0.006;
    m.frontPivot.rotation.y = this.steer;
    for (const w of m.wheels) w.rotation.x += (this.speed * dt) / 0.27;
    return bump;
  }
}
