import * as THREE from 'three';

// GTA-style clock: one real second is one game minute, so a full day takes 24 real minutes.
export const MINUTES_PER_SECOND = 1;

// Sky and light keyframes through a clear Kerala day. Interpolated smoothly (and wrapped at midnight).
const K = [
  { h: 0, top: '#070d1c', horizon: '#141c2e', sunCol: '#9fb4ff', sun: 0.32, hemiSky: '#33456e', hemiGround: '#0b0d12', hemi: 0.32, exposure: 1.35, env: 0.07, fogFar: 300, night: 1 },
  { h: 4.8, top: '#0b1428', horizon: '#1d2740', sunCol: '#9fb4ff', sun: 0.3, hemiSky: '#33456e', hemiGround: '#0b0d12', hemi: 0.32, exposure: 1.35, env: 0.07, fogFar: 300, night: 1 },
  { h: 5.8, top: '#2a3d63', horizon: '#c98b6a', sunCol: '#ffb07a', sun: 0.5, hemiSky: '#8a8fb0', hemiGround: '#2a2a22', hemi: 0.35, exposure: 1.2, env: 0.25, fogFar: 380, night: 0.55 },
  { h: 6.6, top: '#5d86b5', horizon: '#f0b27a', sunCol: '#ffb070', sun: 1.5, hemiSky: '#c9cfe0', hemiGround: '#5a5a3a', hemi: 0.42, exposure: 1.05, env: 0.55, fogFar: 460, night: 0 },
  { h: 9, top: '#7fa6c6', horizon: '#d9c8a8', sunCol: '#ffe6bf', sun: 2.6, hemiSky: '#dcecff', hemiGround: '#6b7a45', hemi: 0.5, exposure: 1.0, env: 0.75, fogFar: 520, night: 0 },
  { h: 13, top: '#7fa6c6', horizon: '#d9c8a8', sunCol: '#fff0d6', sun: 2.9, hemiSky: '#dcecff', hemiGround: '#6b7a45', hemi: 0.5, exposure: 1.0, env: 0.75, fogFar: 520, night: 0 },
  { h: 16.5, top: '#7a9fbf', horizon: '#e6c391', sunCol: '#ffd59a', sun: 2.5, hemiSky: '#e8e4d6', hemiGround: '#6b6a40', hemi: 0.5, exposure: 1.0, env: 0.7, fogFar: 500, night: 0 },
  { h: 18.1, top: '#47648f', horizon: '#f08f58', sunCol: '#ff8a4a', sun: 1.3, hemiSky: '#d9a98a', hemiGround: '#4a3a2a', hemi: 0.42, exposure: 1.05, env: 0.45, fogFar: 440, night: 0.1 },
  { h: 18.9, top: '#1d2a4a', horizon: '#6a4258', sunCol: '#d07a6a', sun: 0.5, hemiSky: '#6a6a90', hemiGround: '#1a1814', hemi: 0.35, exposure: 1.2, env: 0.18, fogFar: 360, night: 0.6 },
  { h: 19.8, top: '#0a1124', horizon: '#1d2236', sunCol: '#9fb4ff', sun: 0.32, hemiSky: '#33456e', hemiGround: '#0b0d12', hemi: 0.32, exposure: 1.35, env: 0.07, fogFar: 300, night: 1 },
  { h: 24, top: '#070d1c', horizon: '#141c2e', sunCol: '#9fb4ff', sun: 0.32, hemiSky: '#33456e', hemiGround: '#0b0d12', hemi: 0.32, exposure: 1.35, env: 0.07, fogFar: 300, night: 1 },
].map((k) => ({ ...k, top: new THREE.Color(k.top), horizon: new THREE.Color(k.horizon), sunCol: new THREE.Color(k.sunCol), hemiSky: new THREE.Color(k.hemiSky), hemiGround: new THREE.Color(k.hemiGround) }));

const out = { top: new THREE.Color(), horizon: new THREE.Color(), sunCol: new THREE.Color(), hemiSky: new THREE.Color(), hemiGround: new THREE.Color() };
export function skyAt(hour) {
  const h = ((hour % 24) + 24) % 24;
  let i = 0; while (i < K.length - 2 && K[i + 1].h <= h) i++;
  const a = K[i], b = K[i + 1], t = THREE.MathUtils.smoothstep(h, a.h, b.h);
  for (const c of ['top', 'horizon', 'sunCol', 'hemiSky', 'hemiGround']) out[c].copy(a[c]).lerp(b[c], t);
  for (const n of ['sun', 'hemi', 'exposure', 'env', 'fogFar', 'night']) out[n] = a[n] + (b[n] - a[n]) * t;
  return out;
}

// Sun rises in the east (+x), sets in the west, leaning south. At night the light comes from the moon.
const sd = new THREE.Vector3(), md = new THREE.Vector3();
export function sunDirAt(hour) {
  const a = ((hour - 6) / 12) * Math.PI;
  return sd.set(Math.cos(a) * 0.85, Math.sin(a), 0.38).normalize();
}
export function lightDirAt(hour) {
  const s = sunDirAt(hour);
  if (s.y > 0.06) return s;
  const a = ((hour - 18) / 12) * Math.PI;                       // moon arcs the other way through the night
  return md.set(-Math.cos(a) * 0.6, Math.max(0.35, Math.sin(a)), -0.3).normalize();
}

export function formatClock(hour) {
  const h = Math.floor(((hour % 24) + 24) % 24), m = Math.floor((hour % 1) * 60);
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return { text: `${String(h12).padStart(2, '0')}:${String(m).padStart(2, '0')}`, ap: h < 12 ? 'AM' : 'PM', h, m };
}

// Simple weather machine: picks the next spell every few game hours.
export class Weather {
  constructor(rand = Math.random) { this.r = rand; this.state = 'clear'; this.cloud = 0.1; this.target = 0.1; this.next = 2 + rand() * 3; }
  // returns 'rain' / 'stop' when the rain should change, otherwise null
  update(gameHoursPassed, monsoonDay) {
    this.next -= gameHoursPassed;
    this.cloud += (this.target - this.cloud) * Math.min(1, gameHoursPassed * 1.5);
    if (this.next > 0) return null;
    this.next = 1.5 + this.r() * 3.5;
    const roll = this.r();
    const rainChance = monsoonDay ? 0.7 : 0.18, cloudyChance = monsoonDay ? 0.25 : 0.3;
    const prev = this.state;
    this.state = roll < rainChance ? 'rain' : roll < rainChance + cloudyChance ? 'cloudy' : 'clear';
    this.target = this.state === 'rain' ? 1 : this.state === 'cloudy' ? 0.6 : 0.1;
    if (this.state === 'rain' && prev !== 'rain') return 'rain';
    if (this.state !== 'rain' && prev === 'rain') return 'stop';
    return null;
  }
}
