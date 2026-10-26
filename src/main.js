import * as THREE from 'three';
import { gx, lerp, clamp } from './config.js';
import { buildWorld } from './world.js';
import { Post, loadSkies } from './post.js';
import { VFX } from './vfx.js';
import { skyAt, lightDirAt, sunDirAt, formatClock, Weather, MINUTES_PER_SECOND } from './daycycle.js';
import { vehicleLights } from './traffic.js';
import { loadHumans, humansReady, createHuman, updateHumans, setHumanShadowDistance } from './humans.js';
import { dustScene, dustU } from './dust.js';
import { Player } from './player.js';
import { Traffic } from './traffic.js';
import { Pedestrians } from './pedestrians.js';
import { Missions } from './missions.js';
import { Rules } from './rules.js';
import { Sound } from './audio.js';
import { Hud } from './hud.js';
import { TOUCH, touch, initTouch, releaseTouch, goFullscreen } from './touch.js';
import * as stats from './analytics.js';
import { Multiplayer, HEAR, micHelp } from './multiplayer.js';
import { initLobby } from './lobby.js';
import { viewSize } from './view.js';
import { pick, RICH_VICTIM, DRIVER_HIT, HONK, PED_HIT, PED_HIT_FOOTPATH, BYSTANDER, NEAR_MISS, ARGUMENT, FISH_CALL, ANNOUNCE, HUMP, DAY_INTRO } from './dialogues.js';

const canvas = document.getElementById('game');
// AA comes from the composer's multisampling, so the default framebuffer stays lean
// phones get an opaque canvas: if a frame ever comes out transparent they see black, not the page's blue
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, stencil: false, powerPreference: 'high-performance', ...(TOUCH && { alpha: false }) });
stats.initAnalytics({ renderer, getStats: () => { try { return { rides: missions.trips, net: missions.cash, fines: missions.fines }; } catch { return {}; } } });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, TOUCH ? 1.25 : 1.5));   // phones: fewer pixels, steadier frames
// the canvas's on-screen size is CSS (always the full screen); only its pixel count follows viewSize,
// so a wrong size reading can never leave part of the screen uncovered
renderer.setSize(...viewSize(), false);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

// ---------- Phone graphics safety net ----------
// Some phone GPUs (Samsung's Exynos/Xclipse, older Mali) choke on the full effect chain and show a blank
// or blinking screen. Phones start on a safer level for those GPUs, step down by themselves when the first
// frames come out blank or the GPU context crashes, and remember the level for next time. ?gfx=0|1|2 forces one.
const gfx = { level: 0, checks: 0, blanks: 0, frame: 0 };
if (TOUCH) {
  let gpuName = '';
  try { const gl = renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info'); gpuName = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER); } catch { /* hidden */ }
  gfx.gpu = String(gpuName).slice(0, 40);
  let saved = null;
  try { saved = localStorage.getItem('heyauto-gfx'); } catch { /* private mode */ }
  const forced = new URLSearchParams(location.search).get('gfx');
  gfx.level = forced !== null ? clamp(+forced || 0, 0, 3) : saved !== null ? clamp(+saved || 0, 0, 3) : /Xclipse|Samsung|Mali-G(5|7)\d|PowerVR/i.test(gfx.gpu) ? 1 : 0;
  // the effect chain draws into half-float buffers; a GPU that can't render to them only ever shows garbage
  try { const gl = renderer.getContext(); if (forced === null && gfx.level < 2 && !gl.getExtension('EXT_color_buffer_half_float') && !gl.getExtension('EXT_color_buffer_float')) gfx.level = 2; } catch { /* keep level */ }
  renderer.debug.onShaderError = (gl, program, vs, fs) => {
    const log = (gl.getShaderInfoLog(fs) || gl.getShaderInfoLog(vs) || gl.getProgramInfoLog(program) || '').split('\n')[0];
    console.error('Shader error', log);
    stats.track('err', { m: `gfx shader error · ${gfx.gpu} · ${log}`.slice(0, 80) });
  };
}
function saveGfx(level, why) {
  gfx.level = level; gfx.checks = 0; gfx.blanks = 0;
  try { localStorage.setItem('heyauto-gfx', String(level)); } catch { /* private mode */ }
  stats.track('err', { m: `gfx ${why} → level ${level} · ${gfx.gpu}`.slice(0, 80) });
}
// Phones throw the GPU context away when the browser goes to the background or runs short of memory.
// The effect chain and the sky's lighting can't be rebuilt in place (that's the empty blue / blinking
// screen), so reload the page once the player is looking at it again. If it died while they were
// playing, it's probably memory: step the graphics down a level first.
if (TOUCH) {
  let lost = false;
  const reload = () => { if (lost && !document.hidden) location.reload(); };
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    lost = true;
    if (!document.hidden) saveGfx(Math.min(3, gfx.level + 1), 'context lost');
    else stats.track('err', { m: `gfx context lost in background · ${gfx.gpu}`.slice(0, 80) });
    setTimeout(reload, 1500);
  });
  canvas.addEventListener('webglcontextrestored', reload);
  document.addEventListener('visibilitychange', reload);
  window.addEventListener('pageshow', reload);
}
// A healthy frame has sky, road, walls and the auto in it; a broken one is (nearly) a single flat colour,
// sometimes with faint streaks or film grain on top. Sample a grid of small averaged patches and call the
// frame broken when almost all of them match the middle colour.
const _px = new Uint8Array(4 * 9);
function frameFlatness() {
  const gl = renderer.getContext();
  renderer.setRenderTarget(null);
  const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight, pts = [];
  for (let i = 1; i <= 8; i++) for (let j = 1; j <= 6; j++) {
    gl.readPixels(Math.floor((w * i) / 9) - 1, Math.floor((h * j) / 7) - 1, 3, 3, gl.RGBA, gl.UNSIGNED_BYTE, _px);
    const p = [0, 0, 0];
    for (let k = 0; k < 9; k++) for (let c = 0; c < 3; c++) p[c] += _px[k * 4 + c] / 9;
    pts.push(p);
  }
  const mid = [0, 1, 2].map((c) => pts.map((p) => p[c]).sort((a, b) => a - b)[pts.length >> 1]);
  return pts.filter((p) => Math.abs(p[0] - mid[0]) < 16 && Math.abs(p[1] - mid[1]) < 16 && Math.abs(p[2] - mid[2]) < 16).length / pts.length;
}
const frameIsBlank = () => frameFlatness() > 0.85;
// called after each rendered frame: checks a handful of frames after start-up (and after each step down)
function checkGfx() {
  if (!TOUCH || gfx.checks >= 12 || document.hidden) return;
  if (++gfx.frame % 20) return;
  gfx.checks++;
  if (frameIsBlank()) gfx.blanks++;
  if (gfx.blanks >= 2) {
    if (gfx.level >= 3) { gfx.checks = 99; stats.track('err', { m: `gfx still blank on safe mode · ${gfx.gpu}`.slice(0, 80) }); return; }
    saveGfx(gfx.level + 1, 'blank screen');
    post.setLevel(gfx.level);
  }
}

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, viewSize()[0] / viewSize()[1], 0.1, 3000);

// ---------- Sky, fog, light ----------
// warm, humid haze by day; grey-green murk in the monsoon
// dry season: a dusty, sun-bleached haze that softens everything past a few dozen metres
const CLEAR = { top: new THREE.Color('#7fa6c6'), horizon: new THREE.Color('#d9c8a8'), sun: 2.9, hemi: 0.5, fogNear: 12, fogFar: 520, exposure: 1.0, env: 0.75 };
const RAIN = { top: new THREE.Color('#5a6366'), horizon: new THREE.Color('#9aa39d'), sun: 0.45, hemi: 0.5, fogNear: 25, fogFar: 300, exposure: 0.92, env: 1.0 };
const skyU = { top: { value: CLEAR.top.clone() }, horizon: { value: CLEAR.horizon.clone() }, sunDir: { value: new THREE.Vector3(0.45, 0.62, 0.35).normalize() }, sunAmt: { value: 1 }, sunCol: { value: new THREE.Color('#ffe6bf') }, sunLow: { value: 0 }, uNight: { value: 0 }, moonDir: { value: new THREE.Vector3(-0.4, 0.7, -0.3).normalize() } };
const sky = new THREE.Mesh(
  new THREE.SphereGeometry(2400, 32, 16),
  new THREE.ShaderMaterial({
    uniforms: skyU, side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform vec3 top; uniform vec3 horizon; uniform vec3 sunDir; uniform vec3 moonDir; uniform vec3 sunCol; uniform float sunAmt; uniform float uNight; uniform float sunLow; varying vec3 vDir;
      float hash(vec3 p){ return fract(sin(dot(p, vec3(12.9898, 78.233, 45.164))) * 43758.5453); }
      void main(){ vec3 d = normalize(vDir); float h = clamp(d.y, 0.0, 1.0);
        vec3 c = mix(horizon, top, pow(smoothstep(0.0, 0.6, h), 0.75));
        float s = max(dot(d, sunDir), 0.0);
        // azimuth toward the sun, ignoring height: drives the warm side of the sky at golden hour
        vec2 dz = normalize(d.xz + 1e-5), sz = normalize(sunDir.xz + 1e-5);
        float az = dot(dz, sz) * 0.5 + 0.5;
        float band = pow(1.0 - h, 6.0);                                           // thin hot band right at the horizon
        float low = sunLow * step(-0.25, sunDir.y);
        c += low * sunCol * (pow(az, 3.0) * band * 1.1 + pow(az, 6.0) * pow(1.0 - h, 2.5) * 0.45);    // glow spreading along the horizon
        c = mix(c, c * vec3(0.78, 0.82, 1.0), low * (1.0 - az) * 0.5);                                  // cool, bluer anti-solar sky
        c += low * vec3(0.55, 0.28, 0.32) * pow(1.0 - az, 3.0) * smoothstep(0.0, 0.12, h) * (1.0 - smoothstep(0.12, 0.35, h)) * 0.55;   // belt of Venus
        float vis = step(-0.02, sunDir.y) * sunAmt;
        c += vis * sunCol * (pow(s, 1400.0) * 9.0 + pow(s, 220.0) * 1.2);                               // disc + bright corona
        c += sunAmt * sunCol * (pow(s, 8.0) * (0.18 + low * 0.55) + pow(s, 2.0) * low * 0.12);           // mie haze around the sun
        // stars and the moon at night
        vec3 cell = floor(d * 300.0); float st = step(0.9975, hash(cell)) * smoothstep(0.08, 0.35, d.y);
        c += uNight * st * vec3(0.9, 0.92, 1.0) * (0.6 + 0.4 * hash(cell + 7.0));
        float m = max(dot(d, moonDir), 0.0);
        c += uNight * (vec3(0.95, 0.95, 1.0) * smoothstep(0.9993, 0.9996, m) * 1.6 + vec3(0.35, 0.4, 0.6) * pow(m, 60.0) * 0.25);
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  }),
);
sky.frustumCulled = false;
scene.add(sky);
scene.fog = new THREE.Fog(CLEAR.horizon.clone(), CLEAR.fogNear, CLEAR.fogFar);

const hemi = new THREE.HemisphereLight('#dcecff', '#6b7a45', CLEAR.hemi);
scene.add(hemi);
const sun = new THREE.DirectionalLight('#ffe6bf', CLEAR.sun);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -70, right: 70, top: 70, bottom: -70, near: 1, far: 260 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.6;
scene.add(sun, sun.target);

// soft cumulus: piled-up puffs with bright tops and flat, greyer undersides
const cloudTex = (() => {
  const c = document.createElement('canvas'); c.width = 256; c.height = 128;
  const x = c.getContext('2d');
  for (let k = 0; k < 22; k++) {
    const cx = 40 + Math.random() * 176, cy = 52 + Math.random() * 34 - Math.max(0, 40 - Math.abs(cx - 128)) * 0.5, r = 18 + Math.random() * 26;
    const g = x.createRadialGradient(cx, cy - r * 0.3, 0, cx, cy, r);
    g.addColorStop(0, 'rgba(255,255,255,.95)'); g.addColorStop(0.6, 'rgba(236,240,242,.55)'); g.addColorStop(1, 'rgba(225,230,233,0)');
    x.fillStyle = g; x.fillRect(0, 0, 256, 128);
  }
  // shade the base and cut it flat
  x.globalCompositeOperation = 'source-atop';
  const shade = x.createLinearGradient(0, 40, 0, 100);
  shade.addColorStop(0, 'rgba(150,160,168,0)'); shade.addColorStop(1, 'rgba(150,160,168,.55)');
  x.fillStyle = shade; x.fillRect(0, 0, 256, 128);
  x.globalCompositeOperation = 'destination-out';
  const cut = x.createLinearGradient(0, 92, 0, 108);
  cut.addColorStop(0, 'rgba(0,0,0,0)'); cut.addColorStop(1, 'rgba(0,0,0,1)');
  x.fillStyle = cut; x.fillRect(0, 92, 256, 36);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
})();
const cloudMat = new THREE.SpriteMaterial({ map: cloudTex, fog: false, transparent: true, depthWrite: false, opacity: 0.9 });
const clouds = new THREE.Group();
// low, flat strato streaks near the horizon: these catch the sunset colour
for (let k = 0; k < 16; k++) {
  const s = new THREE.Sprite(cloudMat.clone());
  const a = Math.random() * Math.PI * 2, r = 900 + Math.random() * 700;
  s.position.set(Math.cos(a) * r, 60 + Math.random() * 70, Math.sin(a) * r);
  s.scale.set(700 + Math.random() * 500, 45 + Math.random() * 30, 1);
  clouds.add(s);
}
for (let k = 0; k < 46; k++) {
  const s = new THREE.Sprite(cloudMat.clone());
  const a = Math.random() * Math.PI * 2, r = 350 + Math.random() * 900;
  s.position.set(Math.cos(a) * r, 120 + Math.random() * 150, Math.sin(a) * r);
  const w = 280 + Math.random() * 320;
  s.scale.set(w, w * (0.42 + Math.random() * 0.12), 1);
  clouds.add(s);
}
scene.add(clouds);

// ---------- Build ----------
const startBtn = document.getElementById('start');
async function fontsReady() {
  try {
    await Promise.race([
      Promise.all([
        document.fonts.load('700 40px "Baloo Chettan 2"', 'ഓട്ടം'), document.fonts.load('700 40px "Manjari"', 'ഓട്ടം'), document.fonts.load('600 40px "Anek Malayalam"', 'ഓട്ടം'), document.fonts.load('800 40px "Anek Malayalam"', 'ഓട്ടം'),
        document.fonts.load('600 40px "Anek Malayalam"', 'ഓട്ടം'), document.fonts.load('800 40px "Anek Malayalam"', 'ഓട്ടം'), document.fonts.load('40px "DSEG7"', '88'),
        document.fonts.load('700 40px "Noto Sans Devanagari"', 'थे'),   // railway station board
      ]),
      new Promise((r) => setTimeout(r, 3000)),
    ]);
  } catch { /* fall back to system fonts */ }
}
await fontsReady();

// rigged CC0 townsfolk; if they fail to load the game falls back to the simple box people
try { await loadHumans(); } catch (e) { console.warn('Characters failed to load, using simple people', e); }
const world = buildWorld(scene);
const post = new Post(renderer, scene, camera, { mobile: TOUCH, level: gfx.level });
if (TOUCH) post.maxDpr = 1.25;
const vfx = new VFX(scene);
const skies = await loadSkies(renderer);
scene.environment = skies.clear;
scene.environmentIntensity = CLEAR.env;
const player = new Player(scene, gx(3) + 1.75, gx(2) + 22, 0);
// your driver: khaki shirt, mundu, hands on the handlebar
if (humansReady()) {
  const d = createHuman(Math.random, 'driver');
  d.group.position.set(0, 0.6, 0.3); d.drive(); d.keep = true;
  player.m.body.add(d.group);
  player.m.body.remove(player.m.driver);
  player.m.driver = d.group;
}
const traffic = new Traffic(scene, world, player.pos);
// your auto gets the same lamp halos and tail lights as the traffic (its road light is a real spotlight)
{ const l = vehicleLights({ type: 'auto', halfLen: 1.46 }, { pool: false }); l.position.z = -0.04; player.m.body.add(l); }
const peds = new Pedestrians(scene);
const missions = new Missions(scene, world, player);
// dust everywhere: on walls, wheels, signboards and posters (rain washes it down)
{
  const { gx: G } = await import('./config.js');
  const { N: NN, HALF: HH, ROAD_HALF: RH } = await import('./config.js');
  dustScene(scene);
}
const sound = new Sound();
const hud = new Hud(world, camera);
const mp = new Multiplayer(scene);
const GOAL = 800;   // daily net target, after the auto's rent
let goalHit = false;
const rules = new Rules(world, (v) => {
  missions.onViolation(v);
  stats.track('fine', { k: v.type, amt: v.fine });
  const pax = missions.state === 'riding' ? `−${v.hit}★ trip rating` : '';
  if (v.camera) {
    hud.toast('camera', v.title, [v.detail, pax].filter(Boolean).join(' · ') || 'Fine added to your account', `₹${v.fine}`);
    sound.camera();
  } else hud.toast('warn', v.title, pax);
});

// ---------- Feedback: camera shake, hit flash, controller rumble ----------
const flashEl = document.getElementById('flash');
let shake = 0, flash = 0;
function haptic(strength, ms = 180, red = 0) {
  shake = Math.min(0.6, shake + strength * 0.25);
  flash = Math.max(flash, red);
  const gp = navigator.getGamepads?.()[padIndex];
  gp?.vibrationActuator?.playEffect?.('dual-rumble', { duration: ms, strongMagnitude: Math.min(1, strength), weakMagnitude: Math.min(1, strength * 0.6) }).catch(() => {});
  navigator.vibrate?.(Math.round(ms * Math.min(1, strength)));
}

// ---------- Input (keyboard + gamepad) ----------
const input = { up: false, down: false, left: false, right: false, brake: false };
const KEYS = { KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down', KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right', Space: 'brake' };
let running = false, paused = false, camMode = 0, raining = false, muted = false, padIndex = 0;
const actions = {
  horn: (on) => sound.horn(on),
  camera: () => { camMode = (camMode + 1) % 3; },
  radio: (back) => { back ? sound.radio?.prev() : sound.radio?.next(); hud.openRadio(); },
  rain: () => toggleRain(),
  pause: () => setPaused(!paused),
};
window.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;   // typing a name, code or chat line
  if (KEYS[e.code]) { input[KEYS[e.code]] = true; e.preventDefault(); }
  if (!running || e.repeat) return;
  if (e.code === 'KeyH') actions.horn(true);
  if (e.code === 'KeyC') actions.camera();
  if (e.code === 'KeyQ') radioHold(e.shiftKey);
  if (e.code === 'BracketLeft' || e.code === 'BracketRight') {
    const r = sound.radio; if (!r) return;
    r.setLevel(clamp(r.level + (e.code === 'BracketRight' ? 0.08 : -0.08), 0, 0.9));
    hud.toast('info', `Radio volume ${Math.round((r.level / 0.9) * 10)}`);
  }
  if (e.code === 'KeyR') actions.rain();
  if (e.code === 'KeyT') skipHour();
  if (mp.active && e.code === 'KeyV') mp.talk(true);
  if (mp.active && (e.code === 'Enter' || e.code === 'NumpadEnter')) { e.preventDefault(); openChat(true); }
  if (e.code === 'KeyM') { muted = !muted; sound.setMuted(muted); hud.toast('info', muted ? 'Sound off' : 'Sound on'); }
  if (e.code === 'Slash' || e.code === 'F1') { e.preventDefault(); showHelp(document.getElementById('help').hidden); }
  if (e.code === 'KeyP' || e.code === 'Escape') {
    if (!document.getElementById('help').hidden) showHelp(false);
    else actions.pause();
  }
});
window.addEventListener('keyup', (e) => {
  if (KEYS[e.code]) input[KEYS[e.code]] = false;
  if (e.code === 'KeyH') actions.horn(false);
  if (e.code === 'KeyV') mp.talk(false);
  if (e.code === 'KeyQ') radioRelease(true);
});
// Q: tap for the next station; hold it while the chip fills up to switch the radio off (or back on)
const RADIO_HOLD = 800;
let qHold = null;
function radioHold(back) {
  if (qHold || !sound.radio) return;
  const el = document.getElementById('radio');
  el.dataset.hold = sound.radio.idx >= 0 ? 'off' : 'on';
  el.classList.add('holding');
  hud.openRadio();
  qHold = { back, t: setTimeout(() => {
    qHold.done = true;
    el.classList.remove('holding');
    sound.radio.power();
    hud.openRadio();
  }, RADIO_HOLD) };
}
function radioRelease(tap) {
  if (!qHold) return;
  clearTimeout(qHold.t);
  document.getElementById('radio').classList.remove('holding');
  if (tap && !qHold.done) actions.radio(qHold.back);
  qHold = null;
}
window.addEventListener('blur', () => { radioRelease(false); for (const k in input) input[k] = false; releaseTouch(); sound.horn(false); if (mp.talkHeld) mp.talk(false); });
initTouch(actions);
window.addEventListener('gamepadconnected', (e) => { padIndex = e.gamepad.index; if (running) hud.toast('info', 'Controller connected', 'RT drive · LT brake · A hand brake · B horn · X radio · Y camera'); });

// Xbox-layout gamepad. Returns the input for this frame (keyboard OR pad).
const prevPad = [];
function readInput() {
  const k = TOUCH ? { up: input.up || touch.up, down: input.down || touch.down, left: input.left || touch.left, right: input.right || touch.right, brake: input.brake || touch.brake } : input;
  const gp = navigator.getGamepads?.()[padIndex];
  if (!gp) return k;
  const btn = (i) => gp.buttons[i]?.value ?? 0;
  const edge = (i, fn) => { const on = btn(i) > 0.5; if (on && !prevPad[i]) fn(); prevPad[i] = on; };
  if (running) {
    edge(3, actions.camera); edge(2, actions.radio); edge(9, actions.pause); edge(8, actions.rain);
    const h = btn(1) > 0.5; if (h !== !!prevPad[1]) { actions.horn(h); prevPad[1] = h; }
  }
  const ax = gp.axes[0] ?? 0;
  const steer = Math.abs(ax) > 0.12 ? -ax : 0;
  return {
    up: k.up || btn(7) > 0.1, down: k.down || btn(6) > 0.1, brake: k.brake || btn(0) > 0.5,
    left: k.left, right: k.right, steer: k.left || k.right ? undefined : steer || undefined,
  };
}

// ---------- Settings (HUD size, dialogue languages) ----------
const hudEl = document.getElementById('hud');
// mobile / weak GPUs start on Medium; everything else on High
const defaultQuality = TOUCH || /Mobi|Android/i.test(navigator.userAgent) || renderer.capabilities.maxSamples < 4 ? 'medium' : 'high';
const settings = { scale: '1', lang: 'all', quality: defaultQuality, posters: 'real' };
let today = 'normal';
try { const saved = JSON.parse(localStorage.getItem('ottam-settings') || '{}'); if (!saved.v2) delete saved.posters; Object.assign(settings, saved, { v2: 1, posters: 'real' }); } catch { /* private mode */ }
function applySettings() {
  hudEl.style.setProperty('--s', settings.scale);
  hudEl.dataset.lang = settings.lang;
  post.setQuality(settings.quality, sun);
  setHumanShadowDistance(settings.quality === 'low' ? 0 : settings.quality === 'medium' ? 14 : 25);
  vfx.motesOn = settings.quality !== 'low';
  for (const k of ['fictional', 'real']) for (const m of world.posterMeshes[k]) m.visible = settings.posters === k;
  document.querySelectorAll('.seg[data-set]').forEach((seg) => seg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.v === (seg.dataset.set === 'day' ? today : settings[seg.dataset.set]))));
  try { localStorage.setItem('ottam-settings', JSON.stringify(settings)); } catch { /* ignore */ }
}
document.querySelectorAll('.seg[data-set] button').forEach((b) => b.addEventListener('click', () => {
  if (b.parentElement.dataset.set === 'day') { setDay(b.dataset.v, true); applySettings(); return; }
  settings[b.parentElement.dataset.set] = b.dataset.v; applySettings();
  stats.track('set', { k: b.parentElement.dataset.set, v: b.dataset.v });
}));
document.getElementById('resume').addEventListener('click', () => setPaused(false));
document.getElementById('pause-x').addEventListener('click', () => setPaused(false));
// a tap on the dimmed road around the card is "back to driving" too
document.getElementById('pause').addEventListener('click', (e) => { if (e.target.id === 'pause') setPaused(false); });
document.getElementById('showhelp').addEventListener('click', () => showHelp(true));
document.getElementById('help').addEventListener('click', () => showHelp(false));
applySettings();

// Help replaces whatever is on screen; closing it goes back to the pause menu or the road.
let helpFrom = null;
function showHelp(on) {
  if (!running) return;
  document.getElementById('help').hidden = !on;
  if (on) { helpFrom = paused ? 'pause' : 'road'; setPaused(true, false); }
  else { setPaused(helpFrom === 'pause', true); helpFrom = null; }
}

function setPaused(p, menu = true) {
  paused = p;
  stats.setPlaying(!p);
  if (p) { releaseTouch(actions); syncPauseExtras(); syncPauseStand(); }
  document.getElementById('pause').hidden = !(p && menu);
  if (sound.ctx) p ? sound.ctx.suspend() : sound.ctx.resume();
  sound.radio?.suspend(p);
}
let rainAmt = 0, wind = 0.35;
// how wet the roads are: soaks in fast when it rains, then takes about an hour of game time to dry
// ("Roads drying up"); Kochi never quite dries out, so a few damp patches always stay
const DAMP = 0.14;
let wetness = DAMP;

// Phones have no Q / [ ] / R / T / M keys, so the pause menu carries the radio and town controls.
function syncPauseExtras() {
  if (!TOUCH) return;
  const info = sound.radio?.info;
  document.getElementById('p-station').textContent = info ? `${info.freq} · ${info.name}` : 'Off';
  document.getElementById('p-vol').textContent = sound.radio ? Math.round((sound.radio.level / 0.9) * 10) : 5;
  document.getElementById('p-rain').classList.toggle('on', raining);
  document.getElementById('p-mute').textContent = muted ? 'Sound off' : 'Sound on';
  document.getElementById('p-mute').classList.toggle('on', !muted);
  document.querySelectorAll('#p-cam button').forEach((b) => b.classList.toggle('on', +b.dataset.cam === camMode));
}
document.querySelectorAll('#p-cam button').forEach((b) => b.addEventListener('click', () => { camMode = +b.dataset.cam; syncPauseExtras(); }));
document.querySelectorAll('[data-radio]').forEach((b) => b.addEventListener('click', () => {
  const r = sound.radio; if (!r) return;
  const v = b.dataset.radio;
  if (v === 'next') r.next(); else if (v === 'prev') r.prev(); else if (v === 'off') r.tune(-1);
  else r.setLevel(clamp(r.level + (v === 'up' ? 0.09 : -0.09), 0, 0.9));
  syncPauseExtras();
}));
document.querySelectorAll('[data-more]').forEach((b) => b.addEventListener('click', () => {
  const v = b.dataset.more;
  if (v === 'rain') toggleRain(true);
  if (v === 'hour') { skipHour(true); const c = formatClock(gameHour); b.textContent = `${c.text} ${c.ap}`; setTimeout(() => { b.textContent = '+1 hour'; }, 1200); }
  if (v === 'mute') { muted = !muted; sound.setMuted(muted); }
  syncPauseExtras();
}));
// tap the minimap to see more of the town
if (TOUCH) document.querySelector('#hud .map').addEventListener('click', (e) => e.currentTarget.classList.toggle('big'));

// ---------- Indicators ----------
// Steering at speed blinks an indicator, and keeps it going for a moment after the turn.
// By request it's wired opposite to the steer: turning right lights the LEFT indicator, and vice versa.
const blink = { side: null, hold: 0, t: 0, on: false };
function updateIndicators(dt) {
  const st = player.steer, moving = Math.abs(player.speed) > 0.8;
  if (moving && Math.abs(st) > 0.12) { blink.side = st < 0 ? 'left' : 'right'; blink.hold = 0.8; }   // steer < 0 is a right turn
  else blink.hold -= dt;
  if (blink.hold <= 0) blink.side = null;
  blink.t += dt;
  const on = !!blink.side && blink.t % 0.66 < 0.36;
  if (on !== blink.on && blink.side) sound.beep?.([on ? 1250 : 980], 0.018, 0.025, 'square', 2200);
  blink.on = on;
  for (const k of ['left', 'right']) player.m.indicators[k].emissiveIntensity = on && blink.side === k ? 4 : 0;
}

// ---------- Day events: the same streets on a different day ----------
const DAY_LABEL = { normal: 'Ordinary day', monsoon: 'Monsoon day', hartal: 'Hartal', election: 'Election season', festival: 'Temple festival', christmas: 'Christmas eve' };
const DAY_WEIGHTS = [['normal', 30], ['monsoon', 20], ['hartal', 10], ['election', 16], ['festival', 14], ['christmas', 10]];
function rollDay() { let r = Math.random() * 100; for (const [k, w] of DAY_WEIGHTS) { if ((r -= w) < 0) return k; } return 'normal'; }
function setDay(kind, announce) {
  today = kind;
  world.electionGroup.visible = kind === 'election';
  world.props.groups.festival.visible = kind === 'festival';
  world.props.groups.christmas.visible = kind === 'christmas';
  world.props.groups.hartal.visible = kind === 'hartal';
  traffic.setDay(kind === 'christmas' ? 'normal' : kind);
  missions.fareMult = kind === 'hartal' ? 2 : kind === 'festival' ? 1.2 : 1;
  if ((kind === 'monsoon') !== raining) setRain(kind === 'monsoon', true);
  peds.day = kind; peds.setDay(kind, raining);
  if (announce) {
    hud.say(DAY_INTRO[kind === 'christmas' ? 'normal' : kind], `Today · ${DAY_LABEL[kind]}`);
    if (kind === 'hartal') hud.toast('warn', 'Hartal today', 'Shops shut, roads empty — fares are double');
    if (kind === 'festival') hud.toast('info', 'Pooram at the temple', 'Elephant procession blocks the temple roads · fares +20%');
    if (kind === 'election') hud.toast('info', 'Election season', 'Announcement jeeps and party flags everywhere');
  }
}

function setRain(on, quiet) {
  raining = on;
  world.setRain(on);
  peds.setRain(on);
  sound.setRain(on);
  if (!quiet) hud.toast('info', on ? 'Monsoon is here' : 'Rain has stopped', on ? 'Roads are slick — brake early' : 'Roads drying up');
}

startBtn.disabled = false;
startBtn.textContent = 'Start shift';
stats.loaded();
startBtn.addEventListener('click', () => startShift());

// Starts the day. Solo: a random day. On a stand: the host's day, clock and weather, and a spot in the queue.
const SLOTS = [0, 8, -8, 16, -14];
function startShift(env = {}) {
  goFullscreen();
  document.getElementById('title').hidden = true;
  document.getElementById('lobby').hidden = true;
  document.getElementById('hud').hidden = false;
  running = true;
  sound.start();
  const radio = sound.radio;
  radio.onStatus = (st, info) => {
    if (st === 'Live') hud.toast('info', `${info.name} · live`, `${info.genre}`);
    if (st === 'Offline') hud.toast('warn', `${info.name} is off air`, 'Tuning to the next station…');
  };
  radio.tune(0);   // Akashvani Ananthapuri FM
  radio.discover().then((n) => { if (n) hud.toast('info', 'Radio stations updated', `${n} trending Malayalam stations added — ${TOUCH ? 'change stations from ⏸' : 'press Q'}`); });
  hud.toast('info', `Auto rent ₹${missions.rent} paid`, `Today's goal: ₹${GOAL} net.${TOUCH ? '' : ' Press / for controls'}`);
  if (env.hour !== undefined) gameHour = env.hour;
  if (env.cloud !== undefined) weather.cloud = env.cloud;
  setDay(env.day ?? rollDay(), true);
  if (env.rain !== undefined && env.rain !== raining) setRain(env.rain, true);
  applySettings();
  if (mp.active) {
    document.documentElement.classList.add('mp');
    player.pos.z += SLOTS[Math.max(0, mp.roster.findIndex((m) => m.id === mp.me.id)) % SLOTS.length];
    hud.toast('info', `Auto stand ${mp.code}`, TOUCH ? 'Hold TALK to speak to drivers near you' : 'Hold V to talk · Enter to chat with drivers near you');
  }
  stats.started(settings);
  gfx.checks = 0; gfx.blanks = 0;   // look at the first frames on the road too
  stats.track('day', { k: today }, true);
}

// ---------- Auto stand (multiplayer) ----------
const lobby = initLobby({ mp, track: stats.track, onShift: startShift, startEnv: () => ({ day: rollDay(), hour: gameHour, rain: false, cloud: 0 }) });
lobby.ready();
const envNow = () => ({ day: today, hour: Math.round(gameHour * 1000) / 1000, rain: raining, cloud: Math.round(weather.cloud * 100) / 100 });
const guest = () => mp.active && !mp.host;
function toggleRain(quiet) {
  if (guest()) { mp.send({ t: 'req', k: 'rain' }); hud.toast('info', 'Asked the stand host', 'Weather is shared, the host’s game changes it for everyone'); return; }
  setRain(!raining, quiet);
}
function skipHour(quiet) {
  if (guest()) { mp.send({ t: 'req', k: 'hour' }); hud.toast('info', 'Asked the stand host', 'The clock is shared, the host’s game moves it for everyone'); return; }
  gameHour = (gameHour + 1) % 24;
  if (!quiet) hud.toast('info', `Time skipped to ${formatClock(gameHour).text} ${formatClock(gameHour).ap}`);
}
mp.on('env', (m) => {
  if (!running || mp.host) return;
  if (m.day && m.day !== today) setDay(m.day, true);
  if (m.rain !== raining) setRain(m.rain);
  let d = m.hour - gameHour; d -= Math.round(d / 24) * 24;
  if (Math.abs(d) > 0.03) gameHour = m.hour;
  if (Math.abs(d) > 0.5) hud.toast('info', `Clock moved to ${formatClock(gameHour).text} ${formatClock(gameHour).ap}`, 'The stand shares one clock');
  weather.cloud = m.cloud ?? weather.cloud;
});
mp.on('req', (k, who) => {
  if (!running) return;
  if (k === 'rain') setRain(!raining);
  if (k === 'hour') { gameHour = (gameHour + 1) % 24; hud.toast('info', `${who?.name ?? 'A driver'} skipped an hour`, `${formatClock(gameHour).text} ${formatClock(gameHour).ap}`); }
});
mp.on('joined', (m) => { if (running) { hud.toast('info', `${m.name} joined the stand`, 'Find them on the map: the coloured arrow with their name'); sound.ding?.(); } });
mp.on('left', (m) => { if (running) hud.toast('warn', `${m.name} left the stand`); });
mp.on('closed', () => {
  document.documentElement.classList.remove('mp');
  if (running) hud.toast('warn', 'Lost the stand', 'No connection for a while, you’re driving solo now');
});
mp.on('host', () => { if (running) hud.toast('info', 'You’re the stand host now', 'The clock and the weather follow your game'); });
mp.on('status', (st) => {
  if (!running) return;
  if (st === 'reconnecting') hud.toast('warn', 'Signal lost', 'Reconnecting to the stand…');
  if (st === 'online' && mp.started) hud.toast('info', 'Back on the stand');
});
mp.on('mic', (st, who) => {
  if (st === 'denied') showMicHelp(who);
  if (st === 'silent') hud.toast('warn', 'Your mic is silent', 'Check it isn’t muted, or pick the right microphone in your browser');
  if (st === 'blocked') hud.toast('info', `${who?.name ?? 'A friend'} is talking`, TOUCH ? 'Tap the screen to hear them' : 'Click or press any key to hear them');
});
// the mic was refused: say how to turn it back on for this phone and browser, with a retry from a real tap
const micHelpEl = document.getElementById('mic-help');
function showMicHelp(reason) {
  document.getElementById('mic-help-t').textContent = micHelp(reason);
  micHelpEl.hidden = false;
  stats.track('mp', { k: `mic-${reason}` });
}
document.getElementById('mic-x').addEventListener('click', () => { micHelpEl.hidden = true; });
document.getElementById('mic-try').addEventListener('click', async () => {
  const r = await mp.askMic();
  if (r.ok) { micHelpEl.hidden = true; hud.toast('info', 'Microphone on', TOUCH ? 'Hold TALK to speak' : 'Hold V to speak'); }
  else document.getElementById('mic-help-t').textContent = micHelp(r.reason);
});
mp.on('chat', (m, text, dist) => {
  if (!running || !m || dist > HEAR * 1.4) return;   // only the drivers around you hear it
  sound.pop?.();
  chatBubble(text, m, () => mp.remotes.get(m.id)?.pos ?? player.pos);
});
function chatBubble(text, m, target) {
  hud.bubble({ ml: text, mg: '', en: '' }, m.name, target, 2.9, 'mp', 6);
  hud.bubbles.at(-1)?.el.style.setProperty('--c', m.color);
}
// chat: Enter (or the 💬 button on phones), type, Enter to send
const chatBox = document.getElementById('chatbox'), chatIn = document.getElementById('chat-in');
function openChat(on) {
  if (!running || !mp.active) return;
  chatBox.hidden = !on;
  if (on) { for (const k in input) input[k] = false; chatIn.value = ''; chatIn.focus(); } else chatIn.blur();
}
function sendChat() {
  const text = mp.chat(chatIn.value);
  openChat(false);
  if (!text) return;
  chatBubble(text, mp.me, () => player.pos);
  if (!mp.nearby(HEAR * 1.4).length) hud.toast('info', 'Nobody heard that', 'Drive up to a friend’s auto, they’re the coloured arrows on the map');
}
chatIn.addEventListener('keydown', (e) => {
  e.stopPropagation();
  if (e.key === 'Enter') sendChat();
  if (e.key === 'Escape') openChat(false);
});
document.getElementById('chat-send').addEventListener('click', sendChat);
chatIn.addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== chatIn) chatBox.hidden = true; }, 150));
// phones: hold TALK, tap 💬
{
  const talkBtn = document.querySelector('[data-mp="talk"]');
  const up = () => { talkBtn.classList.remove('on'); mp.talk(false); };
  talkBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); talkBtn.classList.add('on'); navigator.vibrate?.(10); mp.talk(true); });
  talkBtn.addEventListener('pointerup', up); talkBtn.addEventListener('pointercancel', up); talkBtn.addEventListener('pointerleave', up);
  document.querySelector('[data-mp="chat"]').addEventListener('pointerdown', (e) => { e.preventDefault(); openChat(chatBox.hidden); });
}
// ---------- the stand in the pause menu: who's in, invite more, leave ----------
// In a stand the day doesn't stop when you pause, so the menu says so, and leaving asks first.
const psEl = document.getElementById('p-stand'), psConfirm = document.getElementById('ps-confirm');
function syncPauseStand(keep) {
  if (!keep) confirmLeave(false);
  document.getElementById('pause-tag').textContent = mp.active ? 'Your friends keep driving. The stand’s clock doesn’t stop.' : 'Paused — the meter is waiting.';
  if (!mp.active) return;
  const n = mp.roster.length;
  document.getElementById('ps-code').textContent = mp.code;
  document.getElementById('ps-who').textContent = `${n} driver${n > 1 ? 's' : ''}${mp.host ? ' · you host' : mp.hostName ? ` · ${mp.hostName} hosts` : ''}`;
}
function confirmLeave(on) {
  psConfirm.hidden = !on;
  psEl.classList.toggle('confirming', on);
  if (!on) return;
  const others = mp.others.filter((m) => !m.away);
  const rest = !others.length ? 'The stand closes when you go.'
    : mp.host ? `${others[0].name} takes over as host for the others.` : `${others.map((m) => m.name).join(', ')} keep${others.length > 1 ? '' : 's'} driving.`;
  document.getElementById('ps-confirm-t').textContent = ` You keep today’s earnings and drive solo. ${rest}`;
}
document.getElementById('ps-leave').addEventListener('click', () => confirmLeave(true));
document.getElementById('ps-stay').addEventListener('click', () => confirmLeave(false));
document.getElementById('ps-go').addEventListener('click', () => {
  const code = mp.code;
  mp.leave();
  document.documentElement.classList.remove('mp');
  chatBox.hidden = true;
  nearEl.hidden = true;
  document.getElementById('mic-help').hidden = true;
  stats.track('mp', { k: 'leave' });
  setPaused(false);
  hud.toast('info', `You left stand ${code}`, 'Driving solo now. Your earnings are safe.');
});
document.getElementById('ps-invite').addEventListener('click', async (e) => {
  const btn = e.currentTarget;
  if (navigator.share) { try { await navigator.share({ title: 'Hey Auto · ഹേ ഓട്ടോ', text: `Drive with me in Hey Auto! Join my auto stand: ${mp.code}`, url: mp.link }); return; } catch (err) { if (err.name === 'AbortError') return; } }
  try { await navigator.clipboard.writeText(mp.link); btn.textContent = 'Link copied'; } catch { prompt('Copy this link', mp.link); }
  setTimeout(() => { btn.textContent = 'Invite'; }, 1600);
});
mp.on('roster', () => { if (paused && mp.active) syncPauseStand(true); });
mp.on('talk', () => drawStand());
// friends' earnings, best first
const standEl = document.getElementById('stand'), standList = document.getElementById('stand-list'), standHint = document.getElementById('stand-hint');
let standT = 0;
function drawStand() {
  standEl.hidden = !mp.active || !running;
  if (standEl.hidden) return;
  const rows = mp.roster.map((m) => {
    const me = m.id === mp.me.id, r = mp.remotes.get(m.id);
    return { m, me, net: me ? missions.cash : r?.s.n ?? -missions.rent, rides: me ? missions.trips : r?.s.r ?? 0, talk: me ? mp.talking : !!r?.s.k };
  }).sort((a, b) => b.net - a.net);
  standList.textContent = '';
  for (const r of rows) {
    const li = document.createElement('li');
    li.className = `${r.me ? 'me' : ''} ${r.talk ? 'talk' : ''}`;
    const dot = document.createElement('i'); dot.style.background = r.m.color;
    const nm = document.createElement('span'); nm.textContent = r.me ? `${r.m.name} (you)` : r.m.name;
    const net = document.createElement('b'); net.textContent = `${r.net < 0 ? '−' : ''}₹${Math.abs(r.net)}`; net.className = r.net < 0 ? 'neg' : '';
    const rides = document.createElement('small'); rides.textContent = `${r.rides} ride${r.rides === 1 ? '' : 's'}`;
    li.append(dot, nm, net, rides);
    standList.appendChild(li);
  }
  const near = mp.nearby().length;
  standHint.className = `stand-hint${mp.talking ? ' on' : ''}`;
  standHint.textContent = mp.talking ? (near ? `On air · ${near} driver${near > 1 ? 's' : ''} can hear you` : 'On air · nobody close enough to hear')
    : mp.roster.length < 2 ? `Code ${mp.code} · waiting for friends` : `Hold V to talk · Enter to chat · ${near} nearby`;
}
let envT = 0;
// the moment a friend is in earshot, say so, and how to talk to them
const nearEl = document.getElementById('near-hint');
let nearKey = '';
function nearHint() {
  const n = mp.nearest(), inRange = n && n.d < HEAR;
  const talkKey = TOUCH ? 'hold TALK' : 'hold V';
  let key = '', html = '';
  if (mp.talking) {
    const near = mp.nearby();
    key = `on${near.length}`;
    html = near.length ? `<i class="on"></i><b>On air</b> · ${near.map((r) => esc(mp.member(r.id)?.name ?? '')).join(', ')} can hear you` : '<i class="on"></i><b>On air</b> · nobody close enough to hear';
  } else if (inRange) {
    key = `near${n.r.id}`;
    html = `<i style="background:${n.m?.color}"></i><b>${esc(n.m?.name ?? 'A friend')}</b> is nearby · ${talkKey} to talk`;
  }
  if (key === nearKey) return;
  nearKey = key;
  nearEl.hidden = !key;
  nearEl.innerHTML = html;
  document.querySelector('[data-mp="talk"]')?.classList.toggle('ready', !!inRange && !mp.talking);
}
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
function updateStand(dt) {
  if (!mp.active) { if (!standEl.hidden) standEl.hidden = true; hud.others = null; return; }
  const bump = mp.update(dt, player, camera, { riding: missions.state === 'riding', net: missions.cash, rides: missions.trips }, !paused);
  if (bump) { sound.crash(bump.impact); haptic(Math.min(1, bump.impact / 8), 160); }
  hud.others = [...mp.remotes.values()].filter((r) => r.seen).map((r) => { const m = mp.member(r.id); return { x: r.pos.x, z: r.pos.z, h: r.heading, color: m?.color ?? '#fff', name: m?.name ?? '', away: !!m?.away }; });
  nearHint();
  if ((standT -= dt) <= 0) { standT = 0.5; drawStand(); }
  if (mp.host && (envT -= dt) <= 0) { envT = 1; mp.send({ t: 'env', env: envNow() }); }
}

// ---------- Smoke, dust and spray ----------
const _e = new THREE.Vector3(), _v = new THREE.Vector3();
function emitSmoke(dt) {
  const m = player.m.root, f = player.forward(), sp = Math.abs(player.speed);
  m.updateMatrixWorld();
  // two-stroke blue-grey exhaust: lazy puffs at idle, a stream under throttle
  vfx.emit('exhaust', 4 + player.throttle * 18 + sp * 0.6, dt, () => {
    _e.set(0.42, 0.42, -1.32); m.localToWorld(_e);
    vfx.puff(_e, _v.set(-f.x * 0.8 + (Math.random() - 0.5) * 0.5, 0.12, -f.z * 0.8 + (Math.random() - 0.5) * 0.5), 1.9, [0.36, 0.3], [0.42, 0.46, 0.53, 0.1 + player.throttle * 0.1]);
  });
  const rough = player.zone === 'paddy' || player.zone === 'alley' || player.zone === 'grass' || player.zone === 'yard';
  if (sp > 3 && (rough || (rainAmt > 0.4 && player.zone === 'road'))) {
    const wet = !rough;
    vfx.emit('wheels', sp * (wet ? 4 : 3), dt, () => {
      _e.set(Math.random() < 0.5 ? -0.62 : 0.62, 0.15, -0.8); m.localToWorld(_e);
      if (wet) vfx.puff(_e, _v.set(-f.x * 2 + (Math.random() - 0.5), 0.9, -f.z * 2 + (Math.random() - 0.5)), 0.6, [0.35, 0.1], [0.82, 0.86, 0.88, 0.28]);
      else vfx.puff(_e, _v.set(-f.x * 1.2 + (Math.random() - 0.5) * 0.8, 0.3, -f.z * 1.2 + (Math.random() - 0.5) * 0.8), 1.8, [0.55, 0.35], player.zone === 'paddy' ? [0.45, 0.4, 0.28, 0.3] : [0.66, 0.5, 0.36, 0.38]);
    });
  }
  // dry days: every vehicle drags a low, lazy plume of road dust behind it
  if (rainAmt < 0.3) for (const c of traffic.cars) {
    if (c.speed < 4 || c.type === 'cow' || c.type === 'elephant') continue;
    const dx = c.pos.x - player.pos.x, dz = c.pos.z - player.pos.z;
    if (dx * dx + dz * dz > 2500) continue;
    vfx.emit(`d${c.mesh.id}`, c.speed * 0.35 * (c.type === 'bus' ? 2 : 1), dt, () => {
      const bx = Math.sin(c.heading), bz = Math.cos(c.heading), side = (Math.random() - 0.5) * 2 * c.halfW;
      vfx.puff(_e.set(c.pos.x - bx * c.halfLen + bz * side, 0.25, c.pos.z - bz * c.halfLen - bx * side), _v.set(-bx * 0.6 + (Math.random() - 0.5) * 0.5, 0.12, -bz * 0.6 + (Math.random() - 0.5) * 0.5), 2.6, [0.7, 0.18], [0.72, 0.6, 0.47, 0.13]);
    });
  }
  // and the auto itself, a little, even on tarmac
  if (rainAmt < 0.3 && Math.abs(player.speed) > 5 && player.zone === 'road') vfx.emit('pdust', Math.abs(player.speed) * 0.4, dt, () => {
    _e.set((Math.random() - 0.5) * 1.2, 0.2, -1.3); player.m.root.localToWorld(_e);
    vfx.puff(_e, _v.set(-f.x * 0.5, 0.1, -f.z * 0.5), 2.2, [0.55, 0.15], [0.72, 0.6, 0.47, 0.11]);
  });
  // diesel buses belch black smoke when they pull away
  for (const c of traffic.cars) {
    if (c.type !== 'bus' || c.speed < 0.5) continue;
    const dx = c.pos.x - player.pos.x, dz = c.pos.z - player.pos.z;
    if (dx * dx + dz * dz > 3600) continue;
    vfx.emit(c, 3 + c.accel * (c.speed < 5 ? 3 : 0.5), dt, () => {
      const bx = Math.sin(c.heading), bz = Math.cos(c.heading);
      vfx.puff(_e.set(c.pos.x - bx * 5.2 + bz * 0.9, 0.55, c.pos.z - bz * 5.2 - bx * 0.9), _v.set(-bx * 0.5, 0.25, -bz * 0.5), 1.6, [0.45, 0.12], [0.16, 0.16, 0.17, 0.3]);
    });
  }
}

// ---------- Street reactions (Malayalam dialogue) ----------
let daddyCalled = false, newsAt = -99;
const VICTIM = { scooter: 'scooter', auto: 'auto', car: 'car', bus: 'bus', taxi: 'taxi', tempo: 'tempo', goods: 'goods auto', van: 'school van', fish: 'fish vendor’s cycle', cow: 'cow', jeep: 'party jeep' };
const WHO = { mini: 'Mini Cooper payyan', benz: 'Judge’s son', car: 'Car driver', bus: 'Bus driver', auto: 'Auto chettan', scooter: 'Scooter rider', taxi: 'Taxi driver', tempo: 'Tempo driver', goods: 'Goods auto', van: 'School van driver', fish: 'Fish vendor', jeep: 'Party worker', cow: 'Cow owner', elephant: 'Mahout' };
const carH = (c) => ({ bus: 3.7, elephant: 5.6, tempo: 2.8, jeep: 2.8, benz: 2.0 }[c.type] ?? 2.3);
const carTarget = (c) => () => c.pos;
const pedTarget = (p) => () => p.group.position;
const pedHeight = (p) => (p.fallen > 0 ? 0.9 : 2.1);
function bystanders(near, n) {
  return peds.list.filter((p) => p !== near && !p.fallen && p.group.position.distanceTo(near.group.position) < 28).slice(0, n);
}

// ---------- Loop ----------
const camPos = new THREE.Vector3();
const camLook = new THREE.Vector3();
let camHeading = player.heading;
const camCfg = { dist: 5.9, height: 2.6 };
const BLOCKING = new Set(['building', 'wall', 'vehicle']);
const tmpV = new THREE.Vector3();
let t = 0, hudT = 0, humpCd = 0;

function step(dt) {
  t += dt;
  const events = [];
  player.grip = raining ? 0.75 : 1;
  const bump = player.update(dt, readInput(), world, t);
  updateIndicators(dt);
  if (bump) {
    sound.crash(bump.impact);
    haptic(bump.impact / 8, 160, bump.impact > 6 ? 0.5 : 0);
    if (bump.impact > 4.5 && !(player.rammedCd > 0)) rules.fire('bump');   // not your fault when a Benz just threw you there
  }
  emitSmoke(dt);
  traffic.update(dt, t, player, events);
  traffic.collidePlayer(player, events, dt);
  // the rich kids announce themselves: a whoosh as one tears past you
  for (const c of traffic.cars) {
    if (!c.reckless || c.speed < 20 || t - (c.flyAt ?? -9) < 2.5) continue;
    const d = c.pos.distanceTo(player.pos);
    if (d > 16) continue;
    c.flyAt = t;
    const s = sound.spatial(c.pos.x, c.pos.z, player, 8);
    sound.flyby(s.gain * (c.speed / 41.7), s.pan, c.type === 'benz');
    haptic(0.25, 90);
  }
  peds.update(dt, player, events);
  rules.update(dt, player, t);
  missions.update(dt, t);
  world.update(t, dt);

  for (const e of events) {
    if (e.type === 'crash') {
      sound.crash(e.impact);
      haptic(Math.min(1, e.impact / 7), 260, 0.6);
      const c = e.car;
      // the rich kids never get a challan, and they let you know why
      if (c.reckless) {
        setTimeout(() => hud.bubble(pick(DRIVER_HIT[c.type]), WHO[c.type], carTarget(c), carH(c), 'driver', 4), 350);
        if (!daddyCalled) { daddyCalled = true; setTimeout(() => { hud.toast('info', 'No case filed', 'Daddy made one phone call'); daddyCalled = false; }, 4200); }
      } else {
        rules.fire('crash');
        setTimeout(() => hud.bubble(pick(DRIVER_HIT[c.type] ?? DRIVER_HIT.car), WHO[c.type] ?? 'Driver', carTarget(c), carH(c), 'driver'), 350);
      }
      setTimeout(() => sound.honk(c.pos.distanceTo(player.pos), 0, c.type === 'bus'), 150);
    }
    if (e.type === 'honk') {
      const c = e.car, s = sound.spatial ? sound.spatial(c.pos.x, c.pos.z, player) : { pan: 0 };
      sound.honk(c.pos.distanceTo(player.pos), s.pan, c.type === 'bus');
      if (Math.random() < 0.5) hud.bubble(pick(HONK), WHO[c.type] ?? 'Driver', carTarget(c), carH(c), 'driver', 3);
    }
    if (e.type === 'ped') {
      const p = e.person;
      sound.crash(3);
      haptic(1, 380, 0.9);
      rules.fire('ped');
      const line = e.footpath && Math.random() < 0.5 ? PED_HIT_FOOTPATH : pick(PED_HIT);
      hud.bubble(line, 'Pedestrian', pedTarget(p), 0.9, 'street', 4.5);
      bystanders(p, 2).forEach((b, k) => setTimeout(() => hud.bubble(pick(BYSTANDER), 'Bystander', pedTarget(b), 2.1, 'bystander', 4), 900 + k * 1100));
    }
    if (e.type === 'nearmiss') {
      haptic(0.15, 90);
      hud.bubble(pick(NEAR_MISS), 'Pedestrian', pedTarget(e.person), 2.1, 'street', 2.8);
    }
    if (e.type === 'fishcall') {
      const s = sound.spatial(e.car.pos.x, e.car.pos.z, player, 18);
      if (s.dist < 70) { sound.bulbHorn(s.gain, s.pan); if (s.dist < 45) hud.bubble(pick(FISH_CALL), 'Fish vendor', carTarget(e.car), 2.2, 'bystander', 3); }
    }
    if (e.type === 'announce') {
      const s = sound.spatial(e.car.pos.x, e.car.pos.z, player, 25);
      if (s.dist < 120) { sound.megaphone(s.gain, s.pan); if (s.dist < 60) setTimeout(() => hud.bubble(pick(ANNOUNCE(e.car.party)), `${e.car.party.en} · loudspeaker`, carTarget(e.car), 3.0, 'driver', 4.5), 1000); }
    }
    if (e.type === 'bark') {
      const s = sound.spatial(e.dog.group.position.x, e.dog.group.position.z, player, 12);
      sound.bark(s.gain, s.pan);
      if (e.hit) { haptic(0.3, 120); sound.crash(1); }
    }
    if (e.type === 'richhit' && e.victim.pos.distanceTo(player.pos) < 140) {
      const { rich, victim } = e, s = sound.spatial(victim.pos.x, victim.pos.z, player, 20);
      sound.crash(Math.min(9, e.impact / 4) * s.gain);
      if (s.dist < 25) haptic(0.5, 200);
      // the rich kid shouts it out of the window on the way past; the victim yells after them
      if (t - (rich.saidAt ?? -99) > 5) { rich.saidAt = t; setTimeout(() => hud.bubble(pick(DRIVER_HIT[rich.type]), WHO[rich.type], carTarget(rich), carH(rich), 'driver', 3.2), 200); }
      setTimeout(() => hud.bubble(pick(RICH_VICTIM), WHO[victim.type] ?? 'Driver', carTarget(victim), carH(victim), 'driver', 3.4), 1300);
      if (t - newsAt > 25) { newsAt = t; setTimeout(() => hud.toast('warn', `${rich.type === 'mini' ? 'Mini Cooper' : 'Benz'} hit a ${VICTIM[victim.type] ?? 'vehicle'}`, `${rich.type === 'mini' ? 'Marine Drive' : 'Park Avenue'} · didn’t even stop`), 900); }
    }
    if (e.type === 'aibump' && e.a.pos.distanceTo(player.pos) < 80) {
      const s = sound.spatial(e.a.pos.x, e.a.pos.z, player);
      sound.crash(1.2 * s.gain);
      const rich = e.a.reckless ? e.a : e.b.reckless ? e.b : null;
      if (rich) {
        // the rich kid rams someone and tells them off for it; they get a word in back
        const other = rich === e.a ? e.b : e.a;
        setTimeout(() => hud.bubble(pick(DRIVER_HIT[rich.type]), WHO[rich.type], carTarget(rich), carH(rich), 'driver', 3.4), 300);
        setTimeout(() => hud.bubble(pick(DRIVER_HIT[other.type] ?? DRIVER_HIT.car), WHO[other.type] ?? 'Driver', carTarget(other), carH(other), 'driver', 2.6), 2600);
      } else ARGUMENT.forEach((line, k) => {
        const c = k % 2 ? e.b : e.a;
        setTimeout(() => hud.bubble(line, WHO[c.type] ?? 'Driver', carTarget(c), carH(c), 'driver', 2.2), 300 + k * 1500);
      });
    }
  }
  for (const e of missions.events.splice(0)) {
    const name = missions.paxInfo?.name ?? '';
    if (e.type === 'pickup') { sound.buzz(); haptic(0.1, 120); stats.track('pickup', {}, true); }
    if (e.type === 'board') { sound.ding(); haptic(0.12, 80); stats.track('board', {}, true); }
    if (e.type === 'say') { sound.pop(); sound.radio?.duck(4); hud.say(e.line, `Passenger · ${name}`); }
    if (e.type === 'paid') {
      hud.tripEnd(e, (p) => sound.tick(p));
      stats.track('ride', { fare: e.fare, tip: e.tip, r: e.rating, d: e.dest, n: missions.trips });
      setTimeout(() => sound.cash(), 900);
      if (!goalHit && missions.cash >= GOAL) { goalHit = true; stats.track('goal', { rides: missions.trips }, true); setTimeout(() => hud.toast('cash', 'Daily goal reached!', 'Lakshyam ethi — anything more is bonus', `₹${missions.cash}`), 2500); }
    }
  }

  // speed humps: slow down or everyone in the auto feels it
  humpCd -= dt;
  for (const h of world.props.humps) {
    if (player.pos.x > h.x0 && player.pos.x < h.x1 && player.pos.z > h.z0 && player.pos.z < h.z1 && humpCd <= 0) {
      const kmh = player.kmh; humpCd = 1.2;
      shake = Math.max(shake, Math.min(0.5, kmh / 70)); haptic(Math.min(1, kmh / 40), 140);
      if (kmh > 14) sound.crash(kmh / 12);
      if (kmh > 25 && missions.state === 'riding') { missions.tripRating = Math.max(1, missions.tripRating - 0.5); hud.say(pick(HUMP), `Passenger · ${missions.paxInfo?.name ?? ''}`); }
    }
  }
  // the procession's drums follow the lead elephant
  const lead = today === 'festival' && traffic.cars.find((c) => c.type === 'elephant');
  sound.melamAt = lead ? lead.pos : null;

  // continuous rumble on rough ground
  if ((player.zone === 'paddy' || player.zone === 'alley' || player.zone === 'grass') && Math.abs(player.speed) > 2) shake = Math.max(shake, 0.03);

  sound.update(dt, player, world, raining, { wet: wetness, night: nightAmt });
  sound.radio?.updateMix(dt, camMode === 2, Math.abs(player.speed));
  hudT -= dt;
  if (hudT <= 0) {
    hud.update(player, missions, rules, sound.radio, GOAL);
    if (hud.drawMeter(missions)) sound.tick();
    hudT = 0.08;
  }
  hud.drawMap(player, missions, traffic, t);
  hud.drawGauge(player, rules, raining, dt);
  updateCamera(dt);
  hud.updateBubbles(dt);
}

function updateCamera(dt) {
  const m = player.m;
  if (window.__camOverride) { const c = window.__camOverride; camera.position.set(...c.pos); camera.lookAt(...c.look); camera.fov = c.fov ?? 40; camera.updateProjectionMatrix(); return; }   // dev/screenshot hook
  m.driver.visible = camMode !== 2;
  if (camMode === 2) {
    m.body.updateMatrixWorld(true);
    camera.position.copy(m.body.localToWorld(tmpV.set(0, 1.66, 0.28)));
    camera.lookAt(m.body.localToWorld(tmpV.set(0, 1.45, 12)));
    camera.fov = 72;
  } else {
    // lag the camera heading a little so turns feel weighty; swing round when reversing
    let target = player.heading + (player.speed < -1 ? Math.PI : 0);
    let d = target - camHeading;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    camHeading += d * Math.min(1, dt * 4.5);
    const far = camMode === 1;
    let dist = far ? 11 : camCfg.dist, h = far ? 5.2 : camCfg.height;
    // pull in if a building is between the auto and the camera
    for (let s = 1; s <= 6; s++) {
      const k = (dist * s) / 6;
      if (world.colliders.inside(player.pos.x - Math.sin(camHeading) * k, player.pos.z - Math.cos(camHeading) * k, BLOCKING)) { dist = Math.max(2.2, k - 1.2); break; }
    }
    const want = tmpV.set(player.pos.x - Math.sin(camHeading) * dist, player.y + h, player.pos.z - Math.cos(camHeading) * dist);
    camPos.lerp(want, 1 - Math.exp(-dt * 10));
    camera.position.copy(camPos);
    camLook.set(player.pos.x + Math.sin(camHeading) * 3, player.y + 1.3, player.pos.z + Math.cos(camHeading) * 3);
    camera.lookAt(camLook);
    camera.fov = lerp(62, 70, clamp(Math.abs(player.speed) / 16, 0, 1));
  }
  if (shake > 0.001) {
    camera.position.x += (Math.random() - 0.5) * shake;
    camera.position.y += (Math.random() - 0.5) * shake;
    camera.position.z += (Math.random() - 0.5) * shake;
    shake *= Math.exp(-dt * 7);
  }
  flash *= Math.exp(-dt * 3);
  flashEl.style.opacity = flash.toFixed(3);
  camera.updateProjectionMatrix();
}

// ---------- Time of day & weather (GTA style) ----------
let gameHour = 7.5;                 // shift starts 7:30 am
const weather = new Weather();
let lastHourInt = Math.floor(gameHour), nightAmt = 0;
const _grey = new THREE.Color(), _cc = new THREE.Color(), _warm = new THREE.Color(), _cool = new THREE.Color(), _cd = new THREE.Vector3();

function updateEnv(dt) {
  // the clock only runs while you're driving
  const dh = (dt * MINUTES_PER_SECOND) / 60;
  gameHour = (gameHour + dh) % 24;
  if (running && dh > 0 && !guest()) {
    const ch = weather.update(dh, today === 'monsoon');
    if (ch === 'rain' && !raining) setRain(true);
    if (ch === 'stop' && raining && today !== 'monsoon') setRain(false);
  }
  const hInt = Math.floor(gameHour);
  if (hInt !== lastHourInt) { lastHourInt = hInt; onHour(hInt); }

  rainAmt = clamp(rainAmt + (raining ? dt : -dt) / 3, 0, 1);
  wetness = raining ? Math.min(1, wetness + dt / 4) : Math.max(DAMP, wetness - dt / 70);
  const k = skyAt(gameHour);
  nightAmt = k.night;
  // clouds and rain grey the sky and dim the sun
  const overcast = clamp(Math.max(rainAmt, weather.cloud * 0.55), 0, 1);
  const grey = (src, out, dark) => { const l = src.r * 0.3 + src.g * 0.59 + src.b * 0.11; _grey.setRGB(l * dark, l * dark * 1.03, l * dark * 1.05); out.copy(src).lerp(_grey, overcast); };
  grey(k.top, skyU.top.value, 0.75); grey(k.horizon, skyU.horizon.value, 0.85);
  scene.fog.color.copy(skyU.horizon.value);
  world.setSkyline(skyU.horizon.value);
  scene.fog.near = lerp(CLEAR.fogNear, RAIN.fogNear, rainAmt);
  scene.fog.far = lerp(k.fogFar, RAIN.fogFar, rainAmt);
  skyU.sunAmt.value = (1 - overcast) * (1 - nightAmt);
  skyU.uNight.value = nightAmt * (1 - overcast);
  skyU.sunDir.value.copy(sunDirAt(gameHour));
  skyU.sunCol.value.copy(k.sunCol);
  // golden hour → sunset: strongest while the sun is within ~15° of the horizon
  const elev = skyU.sunDir.value.y;
  skyU.sunLow.value = (1 - THREE.MathUtils.smoothstep(elev, 0.05, 0.3)) * THREE.MathUtils.smoothstep(elev, -0.22, -0.02) * (1 - overcast * 0.8);
  skyU.moonDir.value.copy(lightDirAt(gameHour + 12));
  sun.color.copy(k.sunCol);
  sun.intensity = k.sun * (1 - overcast * 0.8);
  hemi.color.copy(k.hemiSky); hemi.groundColor.copy(k.hemiGround);
  hemi.intensity = lerp(k.hemi, k.hemi * 1.1, overcast);
  post.exposure = k.exposure * lerp(1, 0.94, rainAmt);
  scene.environment = overcast > 0.5 ? skies.overcast ?? skies.clear : skies.clear;
  scene.environmentIntensity = lerp(k.env, k.env * 1.3, rainAmt);
  world.setWet(wetness);
  world.setNight?.(nightAmt);
  traffic.setNight?.(nightAmt);
  dustU.uWet.value = wetness;
  dustU.uDust.value = 1 - nightAmt * 0.4;
  // clouds take the light: white at noon, gold/rose on the sun side at sunset, grey-violet away from it, near-black at night
  const sd = skyU.sunDir.value, low = skyU.sunLow.value;
  for (const c of clouds.children) {
    const dir = _cd.copy(c.position).normalize();
    const facing = clamp(dir.x * sd.x + dir.z * sd.z, -1, 1) * 0.5 + 0.5;
    _cc.setRGB(1, 1, 1).lerp(_warm.copy(k.sunCol).multiplyScalar(1.15), low * (0.35 + 0.65 * facing));
    _cc.lerp(_cool.setRGB(0.55, 0.5, 0.62), low * (1 - facing) * 0.6);
    _cc.multiplyScalar(lerp(1, 0.55, overcast) * lerp(1, 0.06, nightAmt) * (1 - low * 0.15));
    c.material.color.copy(_cc); c.material.opacity = lerp(0.9, 1, overcast);
  }
  player.m.headlight.intensity = Math.max(rainAmt * 10, nightAmt * 22);
  wind = 0.35 + rainAmt * 2.4;      // monsoon gusts bend the palms and slant the rain
  vfx.update(dt, camera, rainAmt, wind);
  world.setWind?.(wind);

  // keep sun (or moon) shadows centred on the action
  const p = running ? player.pos : camera.position;
  const ld = lightDirAt(gameHour);
  sun.position.set(p.x + ld.x * 120, ld.y * 120, p.z + ld.z * 120);
  sun.target.position.set(p.x, 0, p.z);
  sky.position.copy(camera.position);
  hud.setClock?.(gameHour, raining ? 'rain' : weather.cloud > 0.45 ? 'cloud' : nightAmt > 0.5 ? 'moon' : 'sun');
}

// once per game hour: fewer people out late, night fares, announcements
function onHour(h) {
  if (!running) return;
  peds.setDay(today, raining, nightAmt);
  const nightFare = h >= 22 || h < 5;
  missions.nightMult = nightFare ? 1.5 : 1;
  if (h === 22) hud.toast('info', 'Night charge on', 'After 10 pm the meter adds 50%');
  if (h === 5) hud.toast('info', 'Night charge off', 'Day fares again');
  if (h === 6) hud.toast('info', 'Good morning, Kochi', 'The day shift begins');
  if (h === 19) hud.toast('info', 'Evening', 'Headlights on — streets get busy at the chaya kadas');
}

let last = performance.now(), orbit = 0;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (running && paused) readInput();   // lets the controller's Start button unpause
  if (running && !paused) step(dt);
  if (running) updateStand(dt);
  else if (!running) {
    // title screen: slow drone shot over the town
    orbit += dt * 0.05;
    world.update(performance.now() / 1000, dt);
    camera.position.set(Math.cos(orbit) * 190, 85, Math.sin(orbit) * 190);
    camera.lookAt(0, 0, 0);
    camera.fov = 55; camera.updateProjectionMatrix();
  }
  updateEnv(running && (!paused || mp.active) ? dt : 0);   // a stand shares one clock: it doesn't stop for your chaya break
  if (!paused) updateHumans(dt, camera);
  if (++fitTick % 30 === 0) fitView();   // phones don't always fire resize (toolbars, zoom, rotation)
  post.render(dt);
  checkGfx();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

let sizeW = 0, sizeH = 0, fitTick = 0;
function fitView() {
  const [w, h] = viewSize();
  if (w === sizeW && h === sizeH) return;
  sizeW = w; sizeH = h;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
  post.setSize(w, h);
}
window.addEventListener('resize', fitView);
fitView();

// ---------- Dev tuning panel: open the game with ?dev ----------
if (new URLSearchParams(location.search).has('dev')) {
  import('tweakpane').then(({ Pane }) => {
    const pane = new Pane({ title: 'Hey Auto · dev tuning' });
    const atm = pane.addFolder({ title: 'Atmosphere' });
    atm.addBinding(CLEAR, 'fogNear', { min: 10, max: 300 });
    atm.addBinding(CLEAR, 'fogFar', { min: 150, max: 1500 });
    atm.addBinding(CLEAR, 'sun', { min: 0, max: 6 });
    atm.addBinding(CLEAR, 'env', { min: 0, max: 2, label: 'sky light' });
    atm.addBinding(CLEAR, 'exposure', { min: 0.5, max: 1.8 });
    const grade = { warmth: 1, lift: 0.45, greens: 1.3 };
    const g = pane.addFolder({ title: 'Colour grade' });
    for (const k of ['warmth', 'lift', 'greens']) g.addBinding(grade, k, { min: 0, max: 2.5 }).on('change', () => post.setGrade(grade));
    g.addBinding(post.sat, 'saturation', { min: -0.5, max: 0.8 });
    g.addBinding(post.bloom, 'intensity', { min: 0, max: 2, label: 'bloom' });
    g.addBinding(post.vignette, 'darkness', { min: 0, max: 1, label: 'vignette' });
    const ao = pane.addFolder({ title: 'Ambient occlusion' });
    ao.addBinding(post.ao, 'enabled');
    ao.addBinding(post.ao.configuration, 'intensity', { min: 0, max: 6 });
    ao.addBinding(post.ao.configuration, 'aoRadius', { min: 0.2, max: 8 });
    const cam = pane.addFolder({ title: 'Camera' });
    cam.addBinding(camCfg, 'dist', { min: 3, max: 14 });
    cam.addBinding(camCfg, 'height', { min: 1, max: 8 });
    const misc = pane.addFolder({ title: 'Game' });
    misc.addBinding(settings, 'scale', { options: { S: '0.85', M: '1', L: '1.15' }, label: 'HUD' }).on('change', applySettings);
    misc.addBinding(settings, 'quality', { options: { Low: 'low', Medium: 'medium', High: 'high' } }).on('change', applySettings);
    misc.addButton({ title: 'Toggle monsoon' }).on('click', () => setRain(!raining));
    misc.addButton({ title: 'Composer on/off' }).on('click', () => { post.bypass = !post.bypass; });
  });
}

// handy for debugging from the console
window.__ottam = { vfx, skies, post, player, traffic, peds, missions, world, rules, sound, hud, setRain, input, scene, camera };
window.__ottam.setHour = (h) => { gameHour = h; };
window.__ottam.weather = weather;
window.__ottam.gfx = gfx; window.__ottam.mp = mp; window.__ottam.frameFlatness = frameFlatness;
