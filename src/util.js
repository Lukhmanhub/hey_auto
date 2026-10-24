import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();

export function paint(g, color) {
  _c.set(color);
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = _c.r; arr[i * 3 + 1] = _c.g; arr[i * 3 + 2] = _c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

// Collects coloured geometry pieces and merges them into one draw call.
export class Bucket {
  constructor() { this.geos = []; }
  add(geo, color, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1, order = 'XYZ') {
    const g = geo.clone();
    // polyhedra (icosahedron etc.) come without an index; give them a trivial one so everything merges
    if (!g.index) g.setIndex([...Array(g.attributes.position.count).keys()]);
    _m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz, order)), _s.set(sx, sy, sz));
    g.applyMatrix4(_m);
    paint(g, color);
    this.geos.push(g);
    return g;
  }
  box(w, h, d, color, x, y, z, rx = 0, ry = 0, rz = 0) {
    return this.add(new THREE.BoxGeometry(w, h, d), color, x, y, z, rx, ry, rz);
  }
  get empty() { return this.geos.length === 0; }
  merge() {
    const g = mergeGeometries(this.geos, false);
    for (const x of this.geos) x.dispose();
    this.geos = [];
    return g;
  }
  mesh(material, { cast = true, receive = true } = {}) {
    const m = new THREE.Mesh(this.merge(), material);
    m.castShadow = cast; m.receiveShadow = receive;
    return m;
  }
}

// Box whose side-face UVs repeat a window tile per ~3.4m width and per floor.
// Top/bottom faces sample a plain wall pixel.
export function wallBox(w, h, d, floorH = 3.2) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  const faces = [[d, h], [d, h], null, null, [w, h], [w, h]]; // +x -x +y -y +z -z
  for (let f = 0; f < 6; f++) {
    for (let k = 0; k < 4; k++) {
      const idx = f * 4 + k;
      if (!faces[f]) { uv.setXY(idx, 0.03, 0.97); continue; }
      const [len, hh] = faces[f];
      uv.setXY(idx, uv.getX(idx) * Math.max(1, Math.round(len / 3.4)), uv.getY(idx) * Math.max(1, Math.round(hh / floorH)));
    }
  }
  return g;
}

export function windowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d');
  x.fillStyle = '#ffffff'; x.fillRect(0, 0, 64, 64);
  x.fillStyle = '#e6e2da'; x.fillRect(0, 54, 64, 10);          // floor band
  x.fillStyle = '#6b4a2e'; x.fillRect(19, 13, 26, 30);          // wooden frame
  x.fillStyle = '#26323c'; x.fillRect(22, 16, 9, 24); x.fillRect(33, 16, 9, 24);
  x.fillStyle = '#d8d2c6'; x.fillRect(16, 43, 32, 3);           // sill
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export function noiseTexture(size, base, spread, { repeat = 1, dots = 4000, alpha = 1 } = {}) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const x = c.getContext('2d');
  x.fillStyle = base; x.fillRect(0, 0, size, size);
  for (let i = 0; i < dots; i++) {
    const v = (Math.random() - 0.5) * spread;
    x.fillStyle = v > 0 ? `rgba(255,255,255,${v * alpha})` : `rgba(0,0,0,${-v * alpha})`;
    const r = Math.random() * 2 + 0.5;
    x.fillRect(Math.random() * size, Math.random() * size, r, r);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export const FONT_ML = '"Anek Malayalam", "Manjari", "Baloo Chettan 2", "Noto Sans Malayalam", "Malayalam Sangam MN", sans-serif';
export const FONT_PAINT = FONT_ML;   // Anek Malayalam reads far better than a handwriting face

// Shop / landmark signboard: Malayalam on top, English below.
export function signTexture(ml, en, bg = '#c62828', fg = '#ffffff', w = 512, h = 160, font = FONT_ML) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const x = c.getContext('2d');
  x.fillStyle = bg; x.fillRect(0, 0, w, h);
  x.strokeStyle = fg; x.globalAlpha = 0.5; x.lineWidth = 6; x.strokeRect(8, 8, w - 16, h - 16); x.globalAlpha = 1;
  x.fillStyle = fg; x.textAlign = 'center'; x.textBaseline = 'middle';
  if (ml) {
    x.font = `700 ${Math.round(h * 0.36)}px ${font}`;
    x.fillText(ml, w / 2, h * (en ? 0.38 : 0.52), w - 40);
  }
  if (en) {
    x.font = `800 ${Math.round(h * (ml ? 0.2 : 0.42))}px "Baloo Chettan 2", system-ui, sans-serif`;
    x.fillText(en.toUpperCase(), w / 2, h * (ml ? 0.76 : 0.54), w - 40);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// Static axis-aligned boxes in a spatial hash; the player is a circle.
export class Colliders {
  constructor(cell = 16) { this.cell = cell; this.map = new Map(); this.boxes = []; this.stamp = 0; }
  add(minX, minZ, maxX, maxZ, tag = 'wall') {
    const b = { minX, minZ, maxX, maxZ, tag, s: 0 };
    this.boxes.push(b);
    const c = this.cell;
    for (let i = Math.floor(minX / c); i <= Math.floor(maxX / c); i++)
      for (let j = Math.floor(minZ / c); j <= Math.floor(maxZ / c); j++) {
        const k = i * 100003 + j;
        let l = this.map.get(k);
        if (!l) this.map.set(k, (l = []));
        l.push(b);
      }
    return b;
  }
  addCentered(x, z, w, d, tag) { return this.add(x - w / 2, z - d / 2, x + w / 2, z + d / 2, tag); }
  // Is (x, z) inside a box whose tag is in `tags`? Used to keep the camera out of buildings.
  inside(x, z, tags) {
    const l = this.map.get(Math.floor(x / this.cell) * 100003 + Math.floor(z / this.cell));
    return !!l && l.some((b) => tags.has(b.tag) && x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ);
  }
  // Pushes pos (Vector3, uses x/z) out of any boxes. Returns push normal or null.
  resolve(pos, r) {
    const c = this.cell; this.stamp++;
    let hit = null;
    for (let i = Math.floor((pos.x - r) / c); i <= Math.floor((pos.x + r) / c); i++)
      for (let j = Math.floor((pos.z - r) / c); j <= Math.floor((pos.z + r) / c); j++) {
        const l = this.map.get(i * 100003 + j);
        if (!l) continue;
        for (const b of l) {
          if (b.s === this.stamp) continue;
          b.s = this.stamp;
          const cx = Math.max(b.minX, Math.min(pos.x, b.maxX));
          const cz = Math.max(b.minZ, Math.min(pos.z, b.maxZ));
          let dx = pos.x - cx, dz = pos.z - cz;
          const d2 = dx * dx + dz * dz;
          if (d2 >= r * r) continue;
          if (d2 > 1e-8) {
            const d = Math.sqrt(d2);
            dx /= d; dz /= d;
            pos.x += dx * (r - d); pos.z += dz * (r - d);
          } else {
            // centre inside box: leave via the shallowest side
            const opts = [[pos.x - b.minX, -1, 0], [b.maxX - pos.x, 1, 0], [pos.z - b.minZ, 0, -1], [b.maxZ - pos.z, 0, 1]];
            opts.sort((a, bb) => a[0] - bb[0]);
            const [pen, nx, nz] = opts[0];
            pos.x += nx * (pen + r); pos.z += nz * (pen + r);
            dx = nx; dz = nz;
          }
          hit = { nx: dx, nz: dz, tag: b.tag };
        }
      }
    return hit;
  }
}
