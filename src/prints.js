// Fictional Kerala street print: film posters, fan flex, party posters, condolence notices,
// greeting flex, coaching / Gulf / jewellery / chitty ads. Every film, party, candidate,
// person and business here is made up. Spelling slips ("ENGLSH", "Avilable") are deliberate.

const ML = '"Anek Malayalam", "Manjari", sans-serif';
const PAINT = '"Anek Malayalam", "Manjari", sans-serif';
const MASS = '"Anek Malayalam", "Baloo Chettan 2", sans-serif';

// ---------------- fictional parties ----------------
export const PARTIES = [
  { ml: 'ജനകീയ മുന്നണി', en: 'JANAKEEYA MUNNANI', col: '#c8102e', col2: '#ffffff', sym: 'coconut', symMl: 'തെങ്ങ്', cand: 'അഡ്വ. ജോസ് പുന്നൂസ്', skin: '#9a6440' },
  { ml: 'കേരള സേവാ സംഘം', en: 'KERALA SEVA SANGHAM', col: '#0b6e4f', col2: '#f4d03f', sym: 'boat', symMl: 'വള്ളം', cand: 'പി. കെ. അബ്ദുൾ ഖാദർ', skin: '#8a5a3b' },
  { ml: 'നവ പ്രജാ പാർട്ടി', en: 'NAVA PRAJA PARTY', col: '#1f4fa3', col2: '#ffffff', sym: 'umbrella', symMl: 'കുട', cand: 'ഡോ. സുമ രാജീവ്', skin: '#b07850', female: true },
  { ml: 'ഗ്രാമ വികസന വേദി', en: 'GRAMA VIKASANA VEDI', col: '#e07b00', col2: '#2b1d00', sym: 'jackfruit', symMl: 'ചക്ക', cand: 'കെ. ആർ. ഗോപാലൻ മാഷ്', skin: '#7d4e30', old: true },
];

// ---------------- drawing helpers ----------------
function text(x, str, cx, cy, size, { font = ML, weight = 700, fill = '#fff', stroke, lw = 6, max, align = 'center', shadow } = {}) {
  x.save();
  x.font = `${weight} ${size}px ${font}`; x.textAlign = align; x.textBaseline = 'middle';
  if (shadow) { x.shadowColor = shadow; x.shadowBlur = size * 0.25; x.shadowOffsetY = size * 0.06; }
  if (stroke) { x.lineJoin = 'round'; x.strokeStyle = stroke; x.lineWidth = lw; x.strokeText(str, cx, cy, max); }
  x.shadowColor = 'transparent';
  x.fillStyle = fill; x.fillText(str, cx, cy, max);
  x.restore();
}
// big "mass" film title: extruded, outlined, gradient
function massTitle(x, str, cx, cy, size, max, c1, c2, edge = '#120a04') {
  x.save();
  x.font = `800 ${size}px ${MASS}`; x.textAlign = 'center'; x.textBaseline = 'middle';
  for (let d = 7; d > 0; d--) { x.fillStyle = edge; x.fillText(str, cx + d * 0.6, cy + d, max); }
  const g = x.createLinearGradient(0, cy - size / 2, 0, cy + size / 2); g.addColorStop(0, c1); g.addColorStop(1, c2);
  x.lineJoin = 'round'; x.strokeStyle = edge; x.lineWidth = size * 0.09; x.strokeText(str, cx, cy, max);
  x.fillStyle = g; x.fillText(str, cx, cy, max);
  x.restore();
}
function vgrad(x, w, h, stops) { const g = x.createLinearGradient(0, 0, 0, h); stops.forEach((c, i) => g.addColorStop(i / (stops.length - 1), c)); x.fillStyle = g; x.fillRect(0, 0, w, h); }
function rays(x, cx, cy, n, col, r = 2000) { x.save(); x.fillStyle = col; for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2, b = a + Math.PI / n; x.beginPath(); x.moveTo(cx, cy); x.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); x.lineTo(cx + Math.cos(b) * r, cy + Math.sin(b) * r); x.fill(); } x.restore(); }
function grain(x, w, h, a = 0.06, seed = 3) { let s = seed; const r = () => ((s = (s * 9301 + 49297) % 233280) / 233280); for (let i = 0; i < w * h / 60; i++) { x.fillStyle = r() < 0.5 ? `rgba(0,0,0,${a})` : `rgba(255,255,255,${a})`; x.fillRect(r() * w, r() * h, 1.5, 1.5); } }
const shade = (hex, k) => { const n = parseInt(hex.slice(1), 16); const f = (v) => Math.max(0, Math.min(255, Math.round(v * k))); return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`; };

// Painted bust portrait. s = head radius-ish scale.
export function portrait(x, cx, cy, s, o = {}) {
  const skin = o.skin || '#a8704a', hair = o.hair || (o.old ? '#d9d6d0' : '#151010'), shirt = o.shirt || '#f3f0e8';
  x.save();
  if (o.bw) x.filter = 'grayscale(1) contrast(1.1)';
  if (o.female) { x.fillStyle = hair; x.beginPath(); x.ellipse(cx, cy + 0.35 * s, 0.72 * s, 1.15 * s, 0, 0, 7); x.fill(); }
  // shoulders + shirt
  x.fillStyle = shirt;
  x.beginPath(); x.moveTo(cx - 1.5 * s, cy + 2.4 * s); x.bezierCurveTo(cx - 1.45 * s, cy + 1.0 * s, cx - 0.9 * s, cy + 0.8 * s, cx - 0.3 * s, cy + 0.72 * s);
  x.lineTo(cx + 0.3 * s, cy + 0.72 * s); x.bezierCurveTo(cx + 0.9 * s, cy + 0.8 * s, cx + 1.45 * s, cy + 1.0 * s, cx + 1.5 * s, cy + 2.4 * s); x.closePath(); x.fill();
  x.fillStyle = 'rgba(0,0,0,.12)'; x.beginPath(); x.moveTo(cx, cy + 0.95 * s); x.lineTo(cx - 0.05 * s, cy + 2.4 * s); x.lineTo(cx + 0.05 * s, cy + 2.4 * s); x.fill();
  if (o.shawl) { x.fillStyle = o.shawl; x.beginPath(); x.moveTo(cx - 0.55 * s, cy + 0.8 * s); x.lineTo(cx - 0.25 * s, cy + 2.4 * s); x.lineTo(cx - 0.6 * s, cy + 2.4 * s); x.lineTo(cx - 0.95 * s, cy + 0.9 * s); x.fill(); x.beginPath(); x.moveTo(cx + 0.55 * s, cy + 0.8 * s); x.lineTo(cx + 0.25 * s, cy + 2.4 * s); x.lineTo(cx + 0.6 * s, cy + 2.4 * s); x.lineTo(cx + 0.95 * s, cy + 0.9 * s); x.fill(); }
  // collar
  x.fillStyle = shade(shirt.startsWith('#') ? shirt : '#f3f0e8', 0.88);
  x.beginPath(); x.moveTo(cx - 0.32 * s, cy + 0.66 * s); x.lineTo(cx, cy + 1.05 * s); x.lineTo(cx - 0.5 * s, cy + 1.05 * s); x.fill();
  x.beginPath(); x.moveTo(cx + 0.32 * s, cy + 0.66 * s); x.lineTo(cx, cy + 1.05 * s); x.lineTo(cx + 0.5 * s, cy + 1.05 * s); x.fill();
  // neck, ears, head
  x.fillStyle = shade(skin, 0.85); x.fillRect(cx - 0.21 * s, cy + 0.3 * s, 0.42 * s, 0.5 * s);
  x.fillStyle = skin;
  x.beginPath(); x.ellipse(cx - 0.52 * s, cy + 0.05 * s, 0.1 * s, 0.17 * s, 0, 0, 7); x.ellipse(cx + 0.52 * s, cy + 0.05 * s, 0.1 * s, 0.17 * s, 0, 0, 7); x.fill();
  x.beginPath(); x.ellipse(cx, cy, 0.53 * s, 0.67 * s, 0, 0, 7); x.fill();
  const g = x.createRadialGradient(cx - 0.18 * s, cy - 0.2 * s, 0.05 * s, cx, cy, 0.75 * s);
  g.addColorStop(0, 'rgba(255,230,200,.25)'); g.addColorStop(1, 'rgba(60,30,10,.35)');
  x.fillStyle = g; x.beginPath(); x.ellipse(cx, cy, 0.53 * s, 0.67 * s, 0, 0, 7); x.fill();
  // hair
  x.fillStyle = hair;
  if (o.bald) { x.beginPath(); x.ellipse(cx - 0.46 * s, cy - 0.12 * s, 0.1 * s, 0.25 * s, 0.2, 0, 7); x.ellipse(cx + 0.46 * s, cy - 0.12 * s, 0.1 * s, 0.25 * s, -0.2, 0, 7); x.fill(); }
  else if (o.cap) { x.fillStyle = o.cap; x.beginPath(); x.ellipse(cx, cy - 0.5 * s, 0.5 * s, 0.24 * s, 0, Math.PI, 0); x.fill(); x.fillRect(cx - 0.5 * s, cy - 0.52 * s, 1.0 * s, 0.1 * s); }
  else { x.beginPath(); x.ellipse(cx, cy - 0.38 * s, 0.56 * s, 0.38 * s, 0, Math.PI * 0.95, Math.PI * 2.05); x.fill(); if (!o.female) { x.beginPath(); x.ellipse(cx + 0.1 * s, cy - 0.5 * s, 0.45 * s, 0.22 * s, -0.15, 0, 7); x.fill(); } else { x.beginPath(); x.ellipse(cx, cy - 0.45 * s, 0.55 * s, 0.3 * s, 0, 0, 7); x.fill(); x.fillStyle = 'rgba(255,255,255,.12)'; x.fillRect(cx - 0.02 * s, cy - 0.7 * s, 0.04 * s, 0.3 * s); } }
  // brows, eyes, nose, mouth
  const dark = '#1a0f0a';
  x.strokeStyle = o.old ? '#bdb6ad' : dark; x.lineWidth = 0.06 * s; x.lineCap = 'round';
  x.beginPath(); x.moveTo(cx - 0.33 * s, cy - 0.2 * s); x.quadraticCurveTo(cx - 0.2 * s, cy - 0.27 * s, cx - 0.08 * s, cy - 0.2 * s); x.moveTo(cx + 0.33 * s, cy - 0.2 * s); x.quadraticCurveTo(cx + 0.2 * s, cy - 0.27 * s, cx + 0.08 * s, cy - 0.2 * s); x.stroke();
  x.fillStyle = dark;
  x.beginPath(); x.ellipse(cx - 0.2 * s, cy - 0.07 * s, 0.065 * s, 0.04 * s, 0, 0, 7); x.ellipse(cx + 0.2 * s, cy - 0.07 * s, 0.065 * s, 0.04 * s, 0, 0, 7); x.fill();
  if (o.shades) { x.fillStyle = '#0b0b0b'; x.beginPath(); x.roundRect(cx - 0.42 * s, cy - 0.17 * s, 0.36 * s, 0.2 * s, 0.06 * s); x.roundRect(cx + 0.06 * s, cy - 0.17 * s, 0.36 * s, 0.2 * s, 0.06 * s); x.fill(); x.fillRect(cx - 0.08 * s, cy - 0.12 * s, 0.16 * s, 0.03 * s); x.fillStyle = 'rgba(255,255,255,.35)'; x.fillRect(cx - 0.36 * s, cy - 0.14 * s, 0.1 * s, 0.03 * s); }
  if (o.glasses) { x.strokeStyle = '#1b1b1b'; x.lineWidth = 0.035 * s; x.beginPath(); x.roundRect(cx - 0.36 * s, cy - 0.15 * s, 0.3 * s, 0.17 * s, 0.04 * s); x.roundRect(cx + 0.06 * s, cy - 0.15 * s, 0.3 * s, 0.17 * s, 0.04 * s); x.moveTo(cx - 0.06 * s, cy - 0.08 * s); x.lineTo(cx + 0.06 * s, cy - 0.08 * s); x.stroke(); }
  x.strokeStyle = shade(skin, 0.6); x.lineWidth = 0.035 * s;
  x.beginPath(); x.moveTo(cx - 0.02 * s, cy - 0.02 * s); x.lineTo(cx - 0.07 * s, cy + 0.15 * s); x.lineTo(cx + 0.05 * s, cy + 0.17 * s); x.stroke();
  if (!o.female && o.mustache !== false) { x.fillStyle = o.old ? '#cfc9c0' : dark; x.beginPath(); x.moveTo(cx - 0.24 * s, cy + 0.3 * s); x.quadraticCurveTo(cx, cy + 0.16 * s, cx + 0.24 * s, cy + 0.3 * s); x.quadraticCurveTo(cx, cy + 0.24 * s, cx - 0.24 * s, cy + 0.3 * s); x.fill(); }
  if (o.beard) { x.fillStyle = o.old ? 'rgba(220,215,205,.9)' : 'rgba(20,12,8,.85)'; x.beginPath(); x.ellipse(cx, cy + 0.42 * s, 0.38 * s, 0.26 * s, 0, 0, Math.PI); x.fill(); }
  x.strokeStyle = '#5a2a1e'; x.lineWidth = 0.045 * s;
  x.beginPath(); x.arc(cx, cy + (o.smile === false ? 0.48 : 0.28) * s, 0.16 * s, o.smile === false ? Math.PI * 1.15 : Math.PI * 0.15, o.smile === false ? Math.PI * 1.85 : Math.PI * 0.85); x.stroke();
  if (o.female) { x.fillStyle = '#b3121a'; x.beginPath(); x.arc(cx, cy - 0.3 * s, 0.035 * s, 0, 7); x.fill(); x.fillStyle = '#e0b030'; x.beginPath(); x.arc(cx - 0.53 * s, cy + 0.2 * s, 0.05 * s, 0, 7); x.arc(cx + 0.53 * s, cy + 0.2 * s, 0.05 * s, 0, 7); x.fill(); }
  if (o.tilak) { x.fillStyle = '#e0a020'; x.fillRect(cx - 0.02 * s, cy - 0.38 * s, 0.04 * s, 0.14 * s); }
  x.restore();
}

// party symbols
export function symbol(x, kind, cx, cy, s, col) {
  x.save(); x.fillStyle = col; x.strokeStyle = col; x.lineCap = 'round'; x.lineJoin = 'round';
  if (kind === 'coconut') {
    x.lineWidth = s * 0.12; x.beginPath(); x.moveTo(cx - s * 0.1, cy + s); x.quadraticCurveTo(cx + s * 0.15, cy + s * 0.2, cx, cy - s * 0.35); x.stroke();
    for (let i = 0; i < 7; i++) { const a = -Math.PI / 2 + (i - 3) * 0.48; x.lineWidth = s * 0.09; x.beginPath(); x.moveTo(cx, cy - s * 0.35); x.quadraticCurveTo(cx + Math.cos(a) * s * 0.55, cy - s * 0.35 + Math.sin(a) * s * 0.55 - s * 0.1, cx + Math.cos(a) * s * 0.85, cy - s * 0.35 + Math.sin(a) * s * 0.55 + s * 0.25); x.stroke(); }
    x.beginPath(); x.arc(cx - s * 0.1, cy - s * 0.25, s * 0.1, 0, 7); x.arc(cx + s * 0.1, cy - s * 0.25, s * 0.1, 0, 7); x.fill();
  } else if (kind === 'boat') {
    x.beginPath(); x.moveTo(cx - s, cy - s * 0.1); x.quadraticCurveTo(cx, cy + s * 0.7, cx + s, cy - s * 0.1); x.quadraticCurveTo(cx, cy + s * 0.25, cx - s, cy - s * 0.1); x.fill();
    x.lineWidth = s * 0.08; x.beginPath(); x.moveTo(cx + s * 0.2, cy + s * 0.2); x.lineTo(cx + s * 0.55, cy - s * 0.9); x.stroke();
    x.beginPath(); x.moveTo(cx - s * 1.1, cy + s * 0.6); x.quadraticCurveTo(cx - s * 0.5, cy + s * 0.45, cx, cy + s * 0.6); x.quadraticCurveTo(cx + s * 0.5, cy + s * 0.75, cx + s * 1.1, cy + s * 0.6); x.lineWidth = s * 0.06; x.stroke();
  } else if (kind === 'umbrella') {
    x.beginPath(); x.moveTo(cx - s, cy); x.quadraticCurveTo(cx, cy - s * 1.25, cx + s, cy);
    for (let i = 3; i >= -3; i -= 2) x.quadraticCurveTo(cx + (i + 1) * s * 0.25, cy - s * 0.18, cx + i * s * 0.25 + 0.0001, cy);
    x.fill(); x.lineWidth = s * 0.08; x.beginPath(); x.moveTo(cx, cy); x.lineTo(cx, cy + s * 0.8); x.arc(cx - s * 0.15, cy + s * 0.8, s * 0.15, 0, Math.PI); x.stroke();
  } else if (kind === 'jackfruit') {
    x.beginPath(); x.ellipse(cx, cy + s * 0.15, s * 0.6, s * 0.8, 0, 0, 7); x.fill();
    x.lineWidth = s * 0.1; x.beginPath(); x.moveTo(cx, cy - s * 0.62); x.lineTo(cx + s * 0.1, cy - s * 0.95); x.stroke();
    x.fillStyle = 'rgba(0,0,0,.25)'; for (let i = 0; i < 26; i++) { const a = i * 2.4, r = Math.sqrt(i / 26); x.beginPath(); x.arc(cx + Math.cos(a) * r * s * 0.5, cy + s * 0.15 + Math.sin(a) * r * s * 0.7, s * 0.05, 0, 7); x.fill(); }
  }
  x.restore();
}

// ---------------- films ----------------
function film({ title, en, tag, c1, c2, bg, hero, extra }) {
  return (x, w, h) => {
    vgrad(x, w, h, bg);
    rays(x, w / 2, h * 0.36, 18, 'rgba(255,255,255,.06)');
    extra?.(x, w, h);
    portrait(x, w * 0.5, h * 0.33, w * 0.24, hero);
    const g = x.createLinearGradient(0, h * 0.5, 0, h); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.5, bg.at(-1)); x.fillStyle = g; x.fillRect(0, h * 0.5, w, h * 0.5);
    massTitle(x, title, w / 2, h * 0.72, w * 0.16, w * 0.92, c1, c2);
    text(x, en, w / 2, h * 0.81, w * 0.055, { font: MASS, weight: 800, fill: c1, max: w * 0.9 });
    text(x, tag, w / 2, h * 0.88, w * 0.05, { fill: '#fff', max: w * 0.9 });
    text(x, 'കൊച്ചി രാജ്യ · ശ്രീ മുരുകൻ · കായൽ സിനിമാസ്', w / 2, h * 0.95, w * 0.032, { fill: 'rgba(255,255,255,.75)', max: w * 0.92 });
    grain(x, w, h, 0.05, title.length);
  };
}
export const FILMS = [
  film({ title: 'ഇടിവെട്ട് ഇട്ടിച്ചൻ', en: 'IDIVETTU ITTICHAN', tag: 'ഇന്നു മുതൽ!! · A Mass Entertainer', c1: '#ffe14d', c2: '#ff7a00', bg: ['#2a0000', '#7a0a0a', '#120000'], hero: { shades: true, shirt: '#111', skin: '#8a5634', beard: true } }),
  film({ title: 'തട്ടുകട തങ്കപ്പൻ', en: 'THATTUKADA THANKAPPAN', tag: 'ചിരിയുടെ പൂരം · Family Comedy', c1: '#fff7c2', c2: '#ffd000', bg: ['#f4a300', '#d35400', '#3b1700'], hero: { shirt: '#3a7bd5', skin: '#a26a42', bald: true } }),
  film({ title: 'മഴ നനഞ്ഞ മാലാഖ', en: 'MAZHA NANANJA MALAKHA', tag: 'ഒരു മഴക്കാല പ്രണയം', c1: '#e8f6ff', c2: '#9fd3ff', bg: ['#0e2a47', '#1d5e8c', '#081726'], hero: { female: true, shirt: '#d8436a', skin: '#b98058' },
    extra: (x, w, h) => { x.strokeStyle = 'rgba(200,230,255,.35)'; x.lineWidth = 1.5; for (let i = 0; i < 120; i++) { const a = (i * 97) % w, b = (i * 61) % h; x.beginPath(); x.moveTo(a, b); x.lineTo(a - 6, b + 22); x.stroke(); } } }),
  film({ title: 'സി.ഐ.ഡി. കുഞ്ഞാപ്പി', en: 'C.I.D. KUNJAPPI', tag: 'കേസ് ഇപ്പോ തെളിയും!', c1: '#f2f2f2', c2: '#c8c8c8', bg: ['#b5121b', '#7d0a10', '#160203'], hero: { shades: true, cap: '#151515', shirt: '#2b2b2b', skin: '#8a5634' } }),
  film({ title: 'കായലിലെ കള്ളൻ', en: 'KAYALILE KALLAN', tag: 'Thriller · Now Showing', c1: '#c8fff4', c2: '#3ad1b5', bg: ['#002b2b', '#035e5a', '#001414'], hero: { shirt: '#e8e2d0', skin: '#7d4e30', smile: false, beard: true } }),
  film({ title: 'പൂരപ്പറമ്പ്', en: 'POORAPARAMBU', tag: 'ഉത്സവപ്പിറ്റേന്ന് റിലീസ്', c1: '#fff1a8', c2: '#ff9d00', bg: ['#4a1400', '#b23a00', '#1c0700'], hero: { shirt: '#f3f0e8', shawl: '#c99a2e', skin: '#9a6440', tilak: true } }),
  // fan-association release-day flex
  (x, w, h) => {
    vgrad(x, w, h, ['#000', '#3d0000', '#000']); rays(x, w / 2, h * 0.4, 24, 'rgba(255,200,0,.10)');
    portrait(x, w * 0.5, h * 0.4, w * 0.25, { shades: true, shirt: '#111', skin: '#8a5634', beard: true });
    text(x, 'ഇട്ടിച്ചൻ ഫാൻസ് & വെൽഫെയർ അസോസിയേഷൻ', w / 2, h * 0.07, w * 0.042, { fill: '#ffd000', max: w * 0.94 });
    text(x, 'എറണാകുളം യൂണിറ്റ്', w / 2, h * 0.12, w * 0.04, { fill: '#fff' });
    massTitle(x, 'റിലീസ് ആശംസകൾ', w / 2, h * 0.74, w * 0.12, w * 0.92, '#ffffff', '#ffd000');
    text(x, 'ഇടിവെട്ട് ഇട്ടിച്ചൻ — ഇന്ന് രാവിലെ 6 മണിക്ക് ഫാൻസ് ഷോ', w / 2, h * 0.84, w * 0.04, { fill: '#fff', max: w * 0.92 });
    text(x, 'ഇട്ടിച്ചായാ, ഞങ്ങൾ കൂടെയുണ്ട്!!', w / 2, h * 0.91, w * 0.036, { font: PAINT, fill: '#ffd000', max: w * 0.92 });
  },
  // vintage black & white film poster (pasted under everything else)
  (x, w, h) => {
    vgrad(x, w, h, ['#e8e4dc', '#cfcac0']);
    for (let i = 0; i < 4; i++) portrait(x, w * (0.2 + i * 0.2), h * 0.43, w * 0.09, { bw: true, shirt: '#f3f0e8', skin: '#888', old: i === 1, bald: i === 1 });
    text(x, 'നവംബർ 14-ന് അച്ചായനും മക്കളും വരുന്നു!', w / 2, h * 0.12, w * 0.05, { fill: '#111', max: w * 0.9 });
    massTitle(x, 'അച്ചായൻ & മക്കൾ', w / 2, h * 0.75, w * 0.12, w * 0.9, '#1a1a1a', '#3a3a3a', '#000');
    text(x, 'ACHAYAN & MAKKAL', w / 2, h * 0.84, w * 0.05, { font: MASS, weight: 800, fill: '#555' });
    grain(x, w, h, 0.08, 9);
  },
];

// ---------------- political posters (fictional parties) ----------------
function candidate(p, i) {
  return (x, w, h) => {
    vgrad(x, w, h, [p.col, shade(p.col, 0.7)]);
    x.fillStyle = 'rgba(255,255,255,.08)'; for (let k = 0; k < 9; k++) x.fillRect(0, k * h / 9, w, h / 18);
    text(x, `${p.en}`, w / 2, h * 0.06, w * 0.045, { font: MASS, weight: 800, fill: p.col2 });
    portrait(x, w * 0.5, h * 0.36, w * 0.22, { female: p.female, skin: p.skin, old: p.old, glasses: p.old || i % 2, shirt: '#f6f4ee', shawl: p.col2 === '#ffffff' ? shade(p.col, 1.2) : p.col2 });
    x.fillStyle = 'rgba(0,0,0,.35)'; x.fillRect(0, h * 0.62, w, h * 0.38);
    text(x, p.cand, w / 2, h * 0.68, w * 0.085, { fill: '#fff', stroke: 'rgba(0,0,0,.5)', lw: 4, max: w * 0.92 });
    text(x, 'നെ വിജയിപ്പിക്കുക', w / 2, h * 0.76, w * 0.06, { fill: p.col2, max: w * 0.9 });
    x.fillStyle = '#fff'; x.beginPath(); x.roundRect(w * 0.08, h * 0.81, w * 0.84, h * 0.15, 14); x.fill();
    symbol(x, p.sym, w * 0.24, h * 0.885, w * 0.08, p.col);
    text(x, `${p.symMl} അടയാളത്തിൽ`, w * 0.6, h * 0.86, w * 0.055, { fill: p.col, max: w * 0.6 });
    text(x, 'വോട്ട് ചെയ്യുക', w * 0.6, h * 0.92, w * 0.05, { fill: '#111', max: w * 0.6 });
  };
}
export const POLITICAL = [
  ...PARTIES.map(candidate),
  (x, w, h) => {   // ideological slogan poster
    const p = PARTIES[0]; vgrad(x, w, h, ['#efe6d2', '#e2d6bc']);
    x.fillStyle = p.col; x.beginPath(); x.moveTo(0, 0); x.lineTo(w, 0); x.lineTo(w, h * 0.3); x.quadraticCurveTo(w * 0.5, h * 0.42, 0, h * 0.28); x.fill();
    symbol(x, p.sym, w * 0.5, h * 0.14, w * 0.12, '#fff');
    text(x, 'നാടിന്റെ നന്മയ്ക്ക്', w / 2, h * 0.5, w * 0.1, { font: PAINT, fill: p.col, max: w * 0.9 });
    text(x, 'ഞങ്ങൾ ജനങ്ങളിലേക്ക്', w / 2, h * 0.6, w * 0.08, { fill: '#222', max: w * 0.9 });
    for (let k = 0; k < 9; k++) { x.fillStyle = p.col; x.fillRect(w * (0.05 + k * 0.1), h * 0.72, w * 0.02, h * 0.2); x.beginPath(); x.moveTo(w * (0.07 + k * 0.1), h * 0.72); x.lineTo(w * (0.13 + k * 0.1), h * 0.75); x.lineTo(w * (0.07 + k * 0.1), h * 0.78); x.fill(); }
    text(x, p.ml, w / 2, h * 0.95, w * 0.06, { fill: p.col });
  },
  (x, w, h) => {   // "victory thanks" poster
    const p = PARTIES[1]; vgrad(x, w, h, [shade(p.col, 0.6), p.col]);
    rays(x, w / 2, h * 0.35, 20, 'rgba(244,208,63,.14)');
    symbol(x, p.sym, w * 0.5, h * 0.3, w * 0.22, p.col2);
    massTitle(x, 'നന്ദി!', w / 2, h * 0.6, w * 0.22, w * 0.8, '#ffffff', p.col2, '#062b1f');
    text(x, 'വോട്ട് നൽകി വിജയിപ്പിച്ച എല്ലാവർക്കും', w / 2, h * 0.74, w * 0.05, { fill: '#fff', max: w * 0.9 });
    text(x, `${p.ml} · വാർഡ് 7`, w / 2, h * 0.88, w * 0.05, { fill: p.col2 });
  },
];

// Painted straight onto a compound wall (wide format, ~2:1)
export function wallSlogan(p, variant) {
  return (x, w, h) => {
    x.fillStyle = variant ? '#f2efe6' : p.col; x.fillRect(0, 0, w, h);
    const fg = variant ? p.col : p.col2;
    symbol(x, p.sym, w * 0.15, h * 0.48, h * 0.3, fg);
    text(x, `${p.cand}നെ`, w * 0.6, h * 0.24, h * 0.17, { font: PAINT, fill: fg, max: w * 0.75 });
    text(x, `${p.symMl} അടയാളത്തിൽ വോട്ട് ചെയ്ത്`, w * 0.6, h * 0.5, h * 0.12, { fill: variant ? '#222' : '#fff', max: w * 0.75 });
    text(x, 'വിജയിപ്പിക്കുക', w * 0.6, h * 0.74, h * 0.16, { font: PAINT, fill: fg, max: w * 0.75 });
    text(x, p.ml, w * 0.6, h * 0.91, h * 0.08, { fill: variant ? '#555' : 'rgba(255,255,255,.8)', max: w * 0.75 });
    let s = p.cand.length * 31; const r = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
    for (let i = 0; i < 1200; i++) { x.fillStyle = `rgba(255,255,255,${r() * 0.08})`; x.fillRect(r() * w, r() * h, 3 + r() * 10, 1 + r() * 2); }
    for (let i = 0; i < 20; i++) { x.fillStyle = `rgba(230,222,205,${0.4 + r() * 0.5})`; x.beginPath(); x.ellipse(r() * w, r() * h, 3 + r() * 16, 2 + r() * 7, r() * 3, 0, 7); x.fill(); }
  };
}

// ---------------- local ads & notices ----------------
export const ADS = [
  (x, w, h) => {   // condolence
    x.fillStyle = '#111'; x.fillRect(0, 0, w, h); x.fillStyle = '#f4f2ee'; x.fillRect(w * 0.05, h * 0.04, w * 0.9, h * 0.92);
    text(x, 'ആദരാഞ്ജലികൾ', w / 2, h * 0.12, w * 0.11, { fill: '#111', max: w * 0.85 });
    x.fillStyle = '#ddd'; x.fillRect(w * 0.2, h * 0.2, w * 0.6, h * 0.42);
    portrait(x, w * 0.5, h * 0.37, w * 0.17, { bw: true, old: true, glasses: true, skin: '#999', shirt: '#f2f2f2', bald: true });
    x.strokeStyle = '#111'; x.lineWidth = 6; x.strokeRect(w * 0.2, h * 0.2, w * 0.6, h * 0.42);
    text(x, 'കെ. പി. വർഗീസ് (82)', w / 2, h * 0.7, w * 0.08, { fill: '#111', max: w * 0.85 });
    text(x, 'പുത്തൻപുരയ്ക്കൽ, കലൂർ', w / 2, h * 0.77, w * 0.05, { fill: '#333', max: w * 0.85 });
    text(x, 'സംസ്കാരം നാളെ 3 മണിക്ക് സെന്റ് മേരീസ് പള്ളിയിൽ', w / 2, h * 0.84, w * 0.04, { fill: '#333', max: w * 0.85 });
    text(x, 'ദുഃഖാർത്തരായ കുടുംബാംഗങ്ങൾ', w / 2, h * 0.91, w * 0.045, { fill: '#111', max: w * 0.85 });
  },
  (x, w, h) => {   // condolence, woman
    x.fillStyle = '#111'; x.fillRect(0, 0, w, h); x.fillStyle = '#efece6'; x.fillRect(w * 0.05, h * 0.04, w * 0.9, h * 0.92);
    portrait(x, w * 0.5, h * 0.3, w * 0.17, { bw: true, female: true, old: true, skin: '#999', shirt: '#f2f2f2' });
    text(x, 'ആദരാഞ്ജലികൾ', w / 2, h * 0.64, w * 0.1, { fill: '#111', max: w * 0.85 });
    text(x, 'മറിയാമ്മ ജോസഫ് (76)', w / 2, h * 0.74, w * 0.075, { fill: '#111', max: w * 0.85 });
    text(x, 'നിര്യാതയായി · വടക്കേടത്ത് വീട്', w / 2, h * 0.82, w * 0.045, { fill: '#333', max: w * 0.85 });
    text(x, 'വാർഡ് 7 റെസിഡന്റ്സ് അസോസിയേഷൻ', w / 2, h * 0.9, w * 0.042, { fill: '#333', max: w * 0.85 });
  },
  (x, w, h) => {   // birthday flex
    vgrad(x, w, h, ['#ff2d87', '#7b2ff7', '#1b0a4a']); rays(x, w / 2, h * 0.4, 22, 'rgba(255,255,255,.07)');
    for (let i = 0; i < 40; i++) { x.fillStyle = ['#ffd000', '#fff', '#4df'][i % 3]; x.beginPath(); x.arc((i * 137) % w, (i * 71) % (h * 0.6), 3 + (i % 4), 0, 7); x.fill(); }
    portrait(x, w * 0.5, h * 0.38, w * 0.2, { shirt: '#2d2d2d', skin: '#a26a42', shades: true });
    massTitle(x, 'ജന്മദിനാശംസകൾ', w / 2, h * 0.7, w * 0.11, w * 0.94, '#ffffff', '#ffd000', '#3a005a');
    text(x, 'ഞങ്ങളുടെ ചങ്ക് ബിജുമോന്', w / 2, h * 0.8, w * 0.065, { font: PAINT, fill: '#fff', max: w * 0.92 });
    text(x, '— കലൂർ ഫ്രണ്ട്സ് ക്ലബ്ബ് —', w / 2, h * 0.9, w * 0.045, { fill: '#ffd000', max: w * 0.92 });
  },
  (x, w, h) => {   // wedding greetings
    vgrad(x, w, h, ['#fff4e0', '#f7d9b0']); x.strokeStyle = '#c99a2e'; x.lineWidth = 10; x.strokeRect(14, 14, w - 28, h - 28);
    portrait(x, w * 0.33, h * 0.38, w * 0.15, { shirt: '#f6f4ee', skin: '#9a6440', shawl: '#c99a2e' });
    portrait(x, w * 0.67, h * 0.38, w * 0.15, { female: true, shirt: '#b3121a', skin: '#b98058' });
    text(x, 'വിവാഹ മംഗളാശംസകൾ', w / 2, h * 0.1, w * 0.085, { font: PAINT, fill: '#8a1020', max: w * 0.9 });
    text(x, 'ജിതിൻ ❤ അനു', w / 2, h * 0.75, w * 0.1, { fill: '#8a1020', max: w * 0.9 });
    text(x, 'ക്ലബ് 99 ആർട്സ് & സ്പോർട്സ്', w / 2, h * 0.88, w * 0.05, { fill: '#5a3a10', max: w * 0.9 });
  },
  (x, w, h) => {   // festival welcome
    vgrad(x, w, h, ['#ffb000', '#e04a00', '#5a1200']); rays(x, w / 2, h * 0.3, 30, 'rgba(255,255,255,.08)');
    for (let i = 0; i < 9; i++) { x.fillStyle = i % 2 ? '#fff3b0' : '#ff3d6e'; x.beginPath(); x.arc(w * (0.05 + i * 0.112), h * 0.05, w * 0.05, 0, Math.PI); x.fill(); }
    massTitle(x, 'സ്വാഗതം', w / 2, h * 0.3, w * 0.2, w * 0.9, '#fffbe0', '#ffd000', '#4a0d00');
    text(x, 'എറണാകുളത്തപ്പൻ ഉത്സവം 2026', w / 2, h * 0.5, w * 0.09, { fill: '#fff', max: w * 0.92 });
    text(x, 'ആനയെഴുന്നള്ളിപ്പ് · പഞ്ചാരിമേളം · വെടിക്കെട്ട്', w / 2, h * 0.62, w * 0.048, { fill: '#ffe9a8', max: w * 0.92 });
    text(x, 'ഏവർക്കും സ്വാഗതം — ഉത്സവ കമ്മിറ്റി', w / 2, h * 0.9, w * 0.045, { fill: '#fff', max: w * 0.92 });
  },
  (x, w, h) => {   // entrance coaching
    vgrad(x, w, h, ['#0b3d91', '#1565c0', '#e3f2fd']);
    text(x, 'NEET · KEAM', w / 2, h * 0.12, w * 0.13, { font: MASS, weight: 800, fill: '#ffd000', stroke: '#06224f', lw: 8 });
    text(x, 'എൻട്രൻസ് കോച്ചിംഗ്', w / 2, h * 0.23, w * 0.08, { fill: '#fff', max: w * 0.9 });
    portrait(x, w * 0.5, h * 0.48, w * 0.15, { female: true, shirt: '#ffffff', skin: '#b98058', glasses: true });
    x.fillStyle = '#ffd000'; x.beginPath(); x.arc(w * 0.8, h * 0.4, w * 0.13, 0, 7); x.fill();
    text(x, '98%', w * 0.8, h * 0.38, w * 0.09, { font: MASS, weight: 800, fill: '#0b3d91' }); text(x, 'RESULT!!', w * 0.8, h * 0.44, w * 0.04, { font: MASS, weight: 800, fill: '#0b3d91' });
    text(x, 'വിജയ എൻട്രൻസ് അക്കാദമി', w / 2, h * 0.8, w * 0.07, { fill: '#0b3d91', max: w * 0.92 });
    text(x, 'Crash batch starts June 1 · Hostel facilty', w / 2, h * 0.88, w * 0.04, { fill: '#0b3d91', max: w * 0.92 });
  },
  (x, w, h) => {   // spoken English (deliberately misspelt)
    vgrad(x, w, h, ['#fff', '#ffe082']);
    text(x, 'SPOKEN ENGLSH', w / 2, h * 0.14, w * 0.12, { font: MASS, weight: 800, fill: '#c62828', max: w * 0.92 });
    text(x, '30 ദിവസം കൊണ്ട്', w / 2, h * 0.28, w * 0.08, { fill: '#222' });
    text(x, 'ഇംഗ്ലീഷ് സംസാരിക്കാം!', w / 2, h * 0.37, w * 0.085, { font: PAINT, fill: '#1565c0', max: w * 0.92 });
    text(x, 'Grammer · Interview · Gulf jobs', w / 2, h * 0.5, w * 0.05, { fill: '#333', max: w * 0.9 });
    portrait(x, w * 0.5, h * 0.66, w * 0.11, { shirt: '#1565c0', skin: '#a26a42' });
    text(x, 'LINGUA ACADEMY · Ph 98470 xxxxx', w / 2, h * 0.93, w * 0.045, { fill: '#c62828', max: w * 0.92 });
  },
  (x, w, h) => {   // typing / DTP
    x.fillStyle = '#263238'; x.fillRect(0, 0, w, h);
    text(x, 'TYPEWRITTING', w / 2, h * 0.14, w * 0.1, { font: MASS, weight: 800, fill: '#ffeb3b', max: w * 0.9 });
    text(x, 'DTP · TALLY · MS OFFICE', w / 2, h * 0.25, w * 0.07, { font: MASS, weight: 800, fill: '#fff', max: w * 0.9 });
    x.fillStyle = '#90a4ae'; x.fillRect(w * 0.2, h * 0.36, w * 0.6, h * 0.24); x.fillStyle = '#37474f'; for (let r = 0; r < 4; r++) for (let c = 0; c < 10; c++) x.fillRect(w * (0.23 + c * 0.055), h * (0.4 + r * 0.045), w * 0.04, h * 0.03);
    text(x, 'അഡ്മിഷൻ ആരംഭിച്ചു', w / 2, h * 0.7, w * 0.08, { fill: '#ffeb3b', max: w * 0.9 });
    text(x, 'Admission Going On!!', w / 2, h * 0.79, w * 0.06, { fill: '#fff' });
    text(x, 'സരസ്വതി കമ്പ്യൂട്ടർ സെന്റർ', w / 2, h * 0.9, w * 0.055, { fill: '#80deea', max: w * 0.92 });
  },
  (x, w, h) => {   // Gulf jobs
    vgrad(x, w, h, ['#f5d38a', '#e09b3d', '#7a4310']);
    x.fillStyle = 'rgba(80,40,0,.5)'; [[0.1, 0.35, 0.06, 0.25], [0.2, 0.25, 0.05, 0.35], [0.3, 0.3, 0.07, 0.3], [0.75, 0.15, 0.04, 0.45], [0.82, 0.3, 0.07, 0.3]].forEach(([a, b, c, d]) => x.fillRect(w * a, h * b, w * c, h * d));
    x.fillStyle = '#fff'; x.beginPath(); x.moveTo(w * 0.55, h * 0.25); x.lineTo(w * 0.85, h * 0.2); x.lineTo(w * 0.6, h * 0.28); x.fill();
    massTitle(x, 'ദുബായ് ജോലി', w / 2, h * 0.47, w * 0.14, w * 0.92, '#ffffff', '#ffe0a0', '#4a2000');
    text(x, 'Dubai Jobs Avilable!!', w / 2, h * 0.58, w * 0.065, { font: MASS, weight: 800, fill: '#fff', stroke: '#4a2000', lw: 5 });
    text(x, 'Driver · Helper · Cook · Salesman', w / 2, h * 0.67, w * 0.05, { fill: '#2b1500', max: w * 0.9 });
    x.fillStyle = '#b71c1c'; x.fillRect(0, h * 0.75, w, h * 0.12); text(x, 'FREE VISA + AIR TICKET', w / 2, h * 0.81, w * 0.065, { font: MASS, weight: 800, fill: '#fff', max: w * 0.92 });
    text(x, 'AL NOOR TRAVELS & VISA SERVICES', w / 2, h * 0.93, w * 0.045, { font: MASS, weight: 800, fill: '#2b1500', max: w * 0.92 });
  },
  (x, w, h) => {   // travel agent
    vgrad(x, w, h, ['#e0f7fa', '#4dd0e1', '#006064']);
    text(x, 'AIR TICKETS', w / 2, h * 0.12, w * 0.1, { font: MASS, weight: 800, fill: '#006064' });
    text(x, 'ഏറ്റവും കുറഞ്ഞ നിരക്കിൽ', w / 2, h * 0.21, w * 0.06, { fill: '#00363a' });
    x.fillStyle = '#fff'; x.beginPath(); x.ellipse(w / 2, h * 0.42, w * 0.32, h * 0.04, -0.2, 0, 7); x.fill(); x.beginPath(); x.moveTo(w * 0.45, h * 0.42); x.lineTo(w * 0.3, h * 0.3); x.lineTo(w * 0.38, h * 0.3); x.lineTo(w * 0.6, h * 0.4); x.fill();
    text(x, 'Umrah Packages · Attestation', w / 2, h * 0.6, w * 0.055, { fill: '#fff', max: w * 0.9 });
    text(x, 'Dubai · Doha · Muscat · Riyadh', w / 2, h * 0.69, w * 0.05, { fill: '#e0f7fa', max: w * 0.9 });
    text(x, 'സഫാ ട്രാവൽസ്', w / 2, h * 0.85, w * 0.1, { font: PAINT, fill: '#fff', max: w * 0.9 });
  },
  (x, w, h) => {   // jewellery
    vgrad(x, w, h, ['#5a0010', '#8c1026', '#2a0008']);
    x.strokeStyle = '#e6b84a'; x.lineWidth = 6; x.beginPath(); x.ellipse(w / 2, h * 0.3, w * 0.3, h * 0.18, 0, 0.1, Math.PI - 0.1); x.stroke();
    for (let i = 0; i < 15; i++) { const a = 0.15 + (i / 14) * (Math.PI - 0.3); x.fillStyle = i % 3 ? '#f2c94c' : '#d81b60'; x.beginPath(); x.arc(w / 2 + Math.cos(a) * w * 0.3, h * 0.3 + Math.sin(a) * h * 0.18, w * (i % 3 ? 0.022 : 0.028), 0, 7); x.fill(); }
    text(x, 'സ്വർണ്ണമുദ്ര', w / 2, h * 0.6, w * 0.14, { font: PAINT, fill: '#f2c94c', max: w * 0.9 });
    text(x, 'JEWELLERS', w / 2, h * 0.69, w * 0.06, { font: MASS, weight: 800, fill: '#f2c94c' });
    text(x, 'വിവാഹ കളക്ഷൻ · 916 Hallmark', w / 2, h * 0.79, w * 0.05, { fill: '#fff', max: w * 0.9 });
    text(x, 'കുറഞ്ഞ പണിക്കൂലി!', w / 2, h * 0.88, w * 0.06, { fill: '#ffe082' });
  },
  (x, w, h) => {   // wedding silks
    vgrad(x, w, h, ['#4a148c', '#7b1fa2', '#e1bee7']);
    portrait(x, w * 0.5, h * 0.33, w * 0.17, { female: true, shirt: '#c62828', skin: '#b98058', shawl: '#e6b84a' });
    text(x, 'മംഗല്യ സിൽക്സ്', w / 2, h * 0.68, w * 0.11, { font: PAINT, fill: '#ffe082', max: w * 0.9 });
    text(x, 'കല്യാണ സാരികൾ ₹999 മുതൽ', w / 2, h * 0.78, w * 0.055, { fill: '#fff', max: w * 0.9 });
    text(x, 'Kasavu · Kanjeevaram · Bridal', w / 2, h * 0.87, w * 0.045, { fill: '#f3e5f5', max: w * 0.9 });
  },
  (x, w, h) => {   // mobile shop
    vgrad(x, w, h, ['#00c853', '#00796b']);
    x.fillStyle = '#111'; x.beginPath(); x.roundRect(w * 0.36, h * 0.12, w * 0.28, h * 0.4, 18); x.fill(); x.fillStyle = '#4fc3f7'; x.fillRect(w * 0.38, h * 0.15, w * 0.24, h * 0.33);
    text(x, 'FONE BAZAAR', w / 2, h * 0.62, w * 0.11, { font: MASS, weight: 800, fill: '#fff', stroke: '#004d40', lw: 6 });
    text(x, 'EMI 0% · All Brands · Recharge', w / 2, h * 0.72, w * 0.05, { fill: '#e0f2f1', max: w * 0.9 });
    text(x, 'പുതിയ ഫോൺ, പഴയ വിലയ്ക്ക്!', w / 2, h * 0.84, w * 0.06, { font: PAINT, fill: '#ffeb3b', max: w * 0.9 });
  },
  (x, w, h) => {   // chitty / gold loan
    vgrad(x, w, h, ['#fffde7', '#fff59d']); x.fillStyle = '#1a237e'; x.fillRect(0, 0, w, h * 0.22);
    text(x, 'കൊച്ചിൻ കുറീസ്', w / 2, h * 0.11, w * 0.09, { fill: '#fff', max: w * 0.9 });
    text(x, 'ചിട്ടി · സ്വർണ്ണപ്പണയം', w / 2, h * 0.35, w * 0.09, { fill: '#1a237e', max: w * 0.9 });
    text(x, 'Gold Loan @ 0.99% p.m.', w / 2, h * 0.47, w * 0.06, { font: MASS, weight: 800, fill: '#b71c1c' });
    for (let i = 0; i < 5; i++) { x.fillStyle = '#f2c94c'; x.beginPath(); x.ellipse(w * 0.5, h * (0.66 - i * 0.03), w * 0.14, h * 0.025, 0, 0, 7); x.fill(); x.strokeStyle = '#b8902a'; x.lineWidth = 2; x.stroke(); }
    text(x, 'Govt. Approved · Since 1987', w / 2, h * 0.84, w * 0.05, { fill: '#1a237e' });
  },
  (x, w, h) => {   // lottery bumper
    vgrad(x, w, h, ['#ffeb3b', '#ff9800']); rays(x, w / 2, h * 0.4, 26, 'rgba(255,255,255,.18)');
    massTitle(x, 'BUMPER', w / 2, h * 0.22, w * 0.2, w * 0.9, '#ffffff', '#ffd600', '#b71c1c');
    text(x, 'ഭാഗ്യക്കുറി', w / 2, h * 0.36, w * 0.09, { fill: '#b71c1c' });
    massTitle(x, '₹25 കോടി', w / 2, h * 0.55, w * 0.16, w * 0.9, '#b71c1c', '#7f0000', '#fff');
    text(x, 'നറുക്കെടുപ്പ് ഈ ഞായറാഴ്ച!', w / 2, h * 0.73, w * 0.06, { fill: '#3e2723', max: w * 0.9 });
    text(x, 'ഭാഗ്യലക്ഷ്മി ലോട്ടറി ഏജൻസി', w / 2, h * 0.88, w * 0.055, { fill: '#b71c1c', max: w * 0.9 });
  },
];

// Hand-painted two-colour hotel board (vertical), like the classic Kerala tin signs
export function paintedHotel(x, w, h) {
  x.fillStyle = '#d9541e'; x.fillRect(0, 0, w, h);
  x.fillStyle = '#f2c613'; x.fillRect(w * 0.06, h * 0.05, w * 0.44, h * 0.9);
  x.fillStyle = '#119e8c'; x.fillRect(w * 0.5, h * 0.05, w * 0.44, h * 0.9);
  const ml = ['ഹോ', 'ട്ട', 'ൽ'];
  ml.forEach((c, i) => text(x, c, w * 0.28, h * (0.2 + i * 0.28), w * 0.3, { font: PAINT, fill: '#111' }));
  'HOTEL'.split('').forEach((c, i) => text(x, c, w * 0.72, h * (0.14 + i * 0.175), w * 0.2, { font: MASS, weight: 800, fill: '#f4f4ee' }));
  x.fillStyle = 'rgba(255,255,255,.06)'; for (let i = 0; i < 700; i++) x.fillRect((i * 53) % w, (i * 97) % h, 6, 1);
}
