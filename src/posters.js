import * as THREE from 'three';
import { Bucket } from './util.js';

// Posters pasted around town. Each set (film posters in public/posters/NN.jpg,
// political posters in public/posters/political/NN.jpg) lives in one canvas
// atlas: row pairs hold a "fresh" and a "weathered" (faded, stained, torn) copy
// of each image, so every poster of a set is a single merged mesh / draw call.
export class Posters {
  constructor({ dir = '/posters', count = 10, cols = 5, cw = 256, ch = 384, fit = 'cover', sources = null } = {}) {
    if (sources) count = sources.length;
    Object.assign(this, { dir, cols, cw, ch, fit, sources });
    this.canvas = document.createElement('canvas');
    this.canvas.width = cols * cw;
    this.canvas.height = Math.ceil(count / cols) * 2 * ch;
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = 8;
    this.bucket = new Bucket();
    this.count = count;
    this.aspect = cw / ch;
    this.spots = [];          // where clusters went (handy for debugging / screenshots)
    this.load();
  }

  load() {
    const x = this.canvas.getContext('2d');
    if (this.sources) {
      // procedural prints: draw each into its own canvas, then weather it like a real paste-up
      this.sources.forEach((draw, i) => {
        const c = document.createElement('canvas'); c.width = this.cw; c.height = this.ch;
        draw(c.getContext('2d'), this.cw, this.ch);
        for (const worn of [false, true]) { const [cx, cy] = this.cell(i, worn); drawPoster(x, c, cx, cy, this.cw, this.ch, worn, i, this.fit); }
      });
      this.tex.needsUpdate = true;
      return;
    }
    for (let i = 0; i < this.count; i++) {
      const img = new Image();
      img.onload = () => {
        for (const worn of [false, true]) {
          const [cx, cy] = this.cell(i, worn);
          drawPoster(x, img, cx, cy, this.cw, this.ch, worn, i, this.fit);
        }
        this.tex.needsUpdate = true;
      };
      img.src = `${this.dir}/${String(i + 1).padStart(2, '0')}.jpg`;
    }
  }

  cell(i, worn) {
    const col = i % this.cols, row = Math.floor(i / this.cols) * 2 + (worn ? 1 : 0);
    return [col * this.cw, row * this.ch];
  }

  // Paste one poster. (x,y,z) = centre on the wall surface, (nx,nz) = wall normal.
  add(x, y, z, nx, nz, w, h, idx, worn, tilt = 0) {
    const [px, py] = this.cell(idx, worn);
    const W = this.canvas.width, H = this.canvas.height;
    const u0 = px / W, u1 = (px + this.cw) / W, v1 = 1 - py / H, v0 = 1 - (py + this.ch) / H;
    const g = new THREE.PlaneGeometry(w, h);
    const uv = g.attributes.uv;
    for (let k = 0; k < uv.count; k++) uv.setXY(k, u0 + uv.getX(k) * (u1 - u0), v0 + uv.getY(k) * (v1 - v0));
    this.bucket.add(g, '#ffffff', x, y, z, 0, Math.atan2(nx, nz), tilt, 1, 1, 1, 'YXZ');
  }

  // A row of posters the way they get pasted in Kerala: often the same film 2–4 times side by side.
  cluster(x, y, z, nx, nz, n, w, h, r, wornChance = 0.55, layered = true) {
    const tx = -nz, tz = nx;                         // along the wall
    this.spots.push({ x, y, z, nx, nz, n });
    // older bills underneath, half torn away, offset from the fresh row on top
    if (layered && r() < 0.6) {
      const shift = (r() - 0.5) * w, rise = (r() - 0.5) * 0.25;
      let old = Math.floor(r() * this.count);
      for (let k = 0; k < n; k++) {
        if (r() < 0.3) old = Math.floor(r() * this.count);
        const s = (k - (n - 1) / 2) * w * 1.02 + shift;
        this.add(x + tx * s + nx * 0.018, y + rise, z + tz * s + nz * 0.018, nx, nz, w * 1.02, h * 1.02, old, true, (r() - 0.5) * 0.1);
      }
    }
    const same = r() < 0.65;
    let idx = Math.floor(r() * this.count);
    const off = 0.03 + r() * 0.01;
    for (let k = 0; k < n; k++) {
      if (!same && k) idx = Math.floor(r() * this.count);
      const s = (k - (n - 1) / 2) * w * 1.04;
      this.add(x + tx * s + nx * (off + k * 0.002), y + (r() - 0.5) * 0.06, z + tz * s + nz * (off + k * 0.002), nx, nz, w, h, idx, r() < wornChance, (r() - 0.5) * 0.06);
    }
  }

  mesh() {
    if (this.bucket.empty) return null;
    const m = new THREE.Mesh(this.bucket.merge(), new THREE.MeshStandardMaterial({
      map: this.tex, roughness: 0.85, alphaTest: 0.5, side: THREE.DoubleSide,
      polygonOffset: true, polygonOffsetFactor: -1,
    }));
    m.receiveShadow = true;
    return m;
  }
}

// One placement, two prints: the fictional set (default) and the player's own real posters.
// Both get identical geometry; the game shows one mesh or the other.
export class PosterPair {
  constructor(fictional, real) { this.a = fictional; this.b = real; this.count = 997; this.spots = []; }
  add(x, y, z, nx, nz, w, h, idx, worn, tilt) {
    this.a.add(x, y, z, nx, nz, w, h, idx % this.a.count, worn, tilt);
    this.b.add(x, y, z, nx, nz, w, h, idx % this.b.count, worn, tilt);
  }
  cluster(...args) { return Posters.prototype.cluster.apply(this, args); }
  meshes() { return { fictional: this.a.mesh(), real: this.b.mesh() }; }
}

function drawPoster(x, img, cx, cy, CW, CH, worn, seed, fit) {
  let s = seed * 9301 + (worn ? 49297 : 7);
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  x.save();
  x.beginPath(); x.rect(cx, cy, CW, CH); x.clip();
  // cover-fit; 'contain' keeps the whole poster (no cropped slogans) over a blurred fill
  const k = Math.max(CW / img.width, CH / img.height);
  const dw = img.width * k, dh = img.height * k;
  if (fit === 'contain') {
    x.filter = 'blur(10px) brightness(0.75)';
    x.drawImage(img, cx + (CW - dw) / 2, cy + (CH - dh) / 2, dw, dh);
    x.filter = 'none';
    const c = Math.min(CW / img.width, CH / img.height);
    x.drawImage(img, cx + (CW - img.width * c) / 2, cy + (CH - img.height * c) / 2, img.width * c, img.height * c);
  } else x.drawImage(img, cx + (CW - dw) / 2, cy + (CH - dh) / 2, dw, dh);

  if (worn) {
    // sun-faded and yellowed paper
    x.globalCompositeOperation = 'multiply';
    x.fillStyle = 'rgba(236, 214, 170, 0.55)'; x.fillRect(cx, cy, CW, CH);
    x.globalCompositeOperation = 'screen';
    x.fillStyle = 'rgba(120, 110, 90, 0.28)'; x.fillRect(cx, cy, CW, CH);
    x.globalCompositeOperation = 'source-over';
    // monsoon water stains streaking down
    for (let i = 0; i < 6; i++) {
      const sx = cx + rnd() * CW, sy = cy + rnd() * CH * 0.5;
      const g = x.createLinearGradient(sx, sy, sx, sy + 120 + rnd() * 160);
      g.addColorStop(0, 'rgba(90, 70, 40, 0.28)'); g.addColorStop(1, 'rgba(90, 70, 40, 0)');
      x.fillStyle = g; x.fillRect(sx - 4 - rnd() * 8, sy, 8 + rnd() * 18, 300);
    }
  }
  // paste wrinkles
  x.strokeStyle = 'rgba(255,255,255,0.12)'; x.lineWidth = 1;
  for (let i = 0; i < (worn ? 7 : 3); i++) {
    x.beginPath(); x.moveTo(cx + rnd() * CW, cy); x.lineTo(cx + rnd() * CW, cy + CH); x.stroke();
  }
  // torn edges: bite jagged chunks out of the border
  x.globalCompositeOperation = 'destination-out';
  x.fillStyle = '#000';
  const tear = (ax, ay, bx, by, depth, n) => {
    x.beginPath(); x.moveTo(ax, ay);
    for (let i = 1; i < n; i++) {
      const t = i / n;
      const px = ax + (bx - ax) * t, py = ay + (by - ay) * t;
      const nx = by - ay, ny = -(bx - ax); const L = Math.hypot(nx, ny);
      const d = rnd() * depth;
      x.lineTo(px - (nx / L) * d, py - (ny / L) * d);
    }
    x.lineTo(bx, by); x.closePath(); x.fill();
  };
  const edge = worn ? 9 : fit === 'contain' ? 0.01 : 3;   // printed flex has clean edges
  tear(cx, cy, cx + CW, cy, edge, 40); tear(cx + CW, cy, cx + CW, cy + CH, edge, 50);
  tear(cx + CW, cy + CH, cx, cy + CH, edge, 40); tear(cx, cy + CH, cx, cy, edge, 50);
  if (worn) {
    // a big strip ripped off one corner
    const corner = Math.floor(rnd() * 4);
    const ox = corner % 2 ? cx + CW : cx, oy = corner > 1 ? cy + CH : cy;
    const sx = corner % 2 ? -1 : 1, sy = corner > 1 ? -1 : 1;
    x.beginPath(); x.moveTo(ox, oy);
    x.lineTo(ox + sx * (60 + rnd() * 80), oy);
    for (let i = 0; i < 8; i++) x.lineTo(ox + sx * (60 - i * 8 + rnd() * 20), oy + sy * (i * 14 + rnd() * 10));
    x.lineTo(ox, oy + sy * (90 + rnd() * 60)); x.closePath(); x.fill();
  }
  x.restore();
}
