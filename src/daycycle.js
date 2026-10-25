import * as THREE from 'three';

// GTA-style clock: one real second is one game minute, so a full day takes 24 real minutes.
export const MINUTES_PER_SECOND = 1;

// Sky and light keyframes through a clear Kerala day. Interpolated smoothly (and wrapped at midnight).
const K = [
  { h: 0, top: '#070d1c', horizon: '#141c2e', sunCol: '#9fb4ff', sun: 0.32, hemiSky: '#33456e', hemiGround: '#0b0d12', hemi: 0.32, exposure: 1.35, env: 0.07, fogFar: 300, night: 1 },
  { h: 4.9, top: '#0b1428', horizon: '#1d2740', sunCol: '#9fb4ff', sun: 0.3, hemiSky: '#33456e', hemiGround: '#0b0d12', hemi: 0.32, exposure: 1.35, env: 0.07, fogFar: 300, night: 1 },
  { h: 5.8, top: '#26385c', horizon: '#c98b6a', sunCol: '#ff9a5a', sun: 0.45, hemiSky: '#8a8fb0', hemiGround: '#2a2a22', hemi: 0.35, exposure: 1.2, env: 0.25, fogFar: 380, night: 0.5 },
  { h: 6.6, top: '#5a82b0', horizon: '#f2b07a', sunCol: '#ffa860', sun: 1.4, hemiSky: '#c9cfe0', hemiGround: '#5a5a3a', hemi: 0.42, exposure: 1.05, env: 0.55, fogFar: 460, night: 0 },
  { h: 8, top: '#78a0c4', horizon: '#e2cba6', sunCol: '#ffdcae', sun: 2.3, hemiSky: '#dcecff', hemiGround: '#6b7a45', hemi: 0.5, exposure: 1.0, env: 0.7, fogFar: 500, night: 0 },
  { h: 13, top: '#7fa6c6', horizon: '#d9c8a8', sunCol: '#fff0d6', sun: 2.9, hemiSky: '#dcecff', hemiGround: '#6b7a45', hemi: 0.5, exposure: 1.0, env: 0.75, fogFar: 520, night: 0 },
  { h: 16.3, top: '#7b9fc0', horizon: '#e4c896', sunCol: '#ffe0a8', sun: 2.6, hemiSky: '#e8e4d6', hemiGround: '#6b6a40', hemi: 0.5, exposure: 1.0, env: 0.7, fogFar: 500, night: 0 },
  // golden hour: low warm light, long shadows, a honey-coloured haze
  { h: 17.4, top: '#6f92b8', horizon: '#f2c27e', sunCol: '#ffbe6a', sun: 2.2, hemiSky: '#f0d8b0', hemiGround: '#6a5a38', hemi: 0.48, exposure: 1.02, env: 0.6, fogFar: 480, night: 0 },
  // sunset: the disc sits on the horizon, sky burns orange-pink on that side, blue-violet overhead
  { h: 18.25, top: '#4a6596', horizon: '#ff9a5c', sunCol: '#ff7a3a', sun: 1.25, hemiSky: '#e0a890', hemiGround: '#4a3226', hemi: 0.42, exposure: 1.08, env: 0.42, fogFar: 440, night: 0.05 },
  { h: 18.75, top: '#2c3c6a', horizon: '#e0705a', sunCol: '#ff5a3a', sun: 0.55, hemiSky: '#a88aa0', hemiGround: '#2a2020', hemi: 0.38, exposure: 1.15, env: 0.25, fogFar: 400, night: 0.3 },
  // dusk / twilight blue hour
  { h: 19.3, top: '#141f40', horizon: '#5a4466', sunCol: '#b89ad0', sun: 0.35, hemiSky: '#5a6090', hemiGround: '#14141a', hemi: 0.34, exposure: 1.25, env: 0.12, fogFar: 340, night: 0.75 },
  { h: 20, top: '#0a1124', horizon: '#1d2236', sunCol: '#9fb4ff', sun: 0.32, hemiSky: '#33456e', hemiGround: '#0b0d12', hemi: 0.32, exposure: 1.35, env: 0.07, fogFar: 300, night: 1 },
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
  const a = ((hour - 6.2) / 12.45) * Math.PI;
  return sd.set(Math.cos(a) * 0.9, Math.sin(a), 0.3).normalize();
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
