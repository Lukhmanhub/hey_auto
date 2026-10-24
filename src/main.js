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
import { pick, DRIVER_HIT, HONK, PED_HIT, PED_HIT_FOOTPATH, BYSTANDER, NEAR_MISS, ARGUMENT, FISH_CALL, ANNOUNCE, HUMP, DAY_INTRO } from './dialogues.js';

const canvas = document.getElementById('game');
// AA comes from the composer's multisampling, so the default framebuffer stays lean
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, stencil: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, TOUCH ? 1.25 : 1.5));   // phones: fewer pixels, steadier frames
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 3000);

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

// soft monsoon clouds
const cloudTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d');
  for (let k = 0; k < 9; k++) {
    const cx = 30 + Math.random() * 68, cy = 50 + Math.random() * 28, r = 22 + Math.random() * 20;
    const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, 'rgba(255,255,255,.9)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  }
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
for (let k = 0; k < 34; k++) {
  const s = new THREE.Sprite(cloudMat.clone());
  const a = Math.random() * Math.PI * 2, r = 350 + Math.random() * 900;
  s.position.set(Math.cos(a) * r, 140 + Math.random() * 160, Math.sin(a) * r);
  s.scale.set(260 + Math.random() * 260, 110 + Math.random() * 60, 1);
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
const post = new Post(renderer, scene, camera);
if (TOUCH) post.maxDpr = 1.25;
const vfx = new VFX(scene);
const skies = await loadSkies(renderer);
scene.environment = skies.clear;
scene.environmentIntensity = CLEAR.env;
const player = new Player(scene, gx(3) + 2.5, gx(2) + 22, 0);
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
const GOAL = 800;   // daily net target, after the auto's rent
let goalHit = false;
const rules = new Rules(world, (v) => {
  missions.onViolation(v);
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
  rain: () => setRain(!raining),
  pause: () => setPaused(!paused),
};
window.addEventListener('keydown', (e) => {
  if (KEYS[e.code]) { input[KEYS[e.code]] = true; e.preventDefault(); }
  if (!running || e.repeat) return;
  if (e.code === 'KeyH') actions.horn(true);
  if (e.code === 'KeyC') actions.camera();
  if (e.code === 'KeyQ') actions.radio(e.shiftKey);
  if (e.code === 'BracketLeft' || e.code === 'BracketRight') {
    const r = sound.radio; if (!r) return;
    r.setLevel(clamp(r.level + (e.code === 'BracketRight' ? 0.08 : -0.08), 0, 0.9));
    hud.toast('info', `Radio volume ${Math.round((r.level / 0.9) * 10)}`);
  }
  if (e.code === 'KeyR') actions.rain();
  if (e.code === 'KeyT') { gameHour = (gameHour + 1) % 24; hud.toast('info', `Time skipped to ${formatClock(gameHour).text} ${formatClock(gameHour).ap}`); }
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
});
window.addEventListener('blur', () => { for (const k in input) input[k] = false; releaseTouch(); sound.horn(false); });
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
}));
document.getElementById('resume').addEventListener('click', () => setPaused(false));
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
  if (p) { releaseTouch(actions); syncPauseExtras(); }
  document.getElementById('pause').hidden = !(p && menu);
  if (sound.ctx) p ? sound.ctx.suspend() : sound.ctx.resume();
  sound.radio?.suspend(p);
}
let rainAmt = 0, wind = 0.35;

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
  if (v === 'rain') setRain(!raining, true);
  if (v === 'hour') { gameHour = (gameHour + 1) % 24; const c = formatClock(gameHour); b.textContent = `${c.text} ${c.ap}`; setTimeout(() => { b.textContent = '+1 hour'; }, 1200); }
  if (v === 'mute') { muted = !muted; sound.setMuted(muted); }
  syncPauseExtras();
}));
// tap the minimap to see more of the town
if (TOUCH) document.querySelector('#hud .map').addEventListener('click', (e) => e.currentTarget.classList.toggle('big'));

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
startBtn.addEventListener('click', () => {
  goFullscreen();
  document.getElementById('title').hidden = true;
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
  setDay(rollDay(), true); applySettings();
});

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
const WHO = { car: 'Car driver', bus: 'Bus driver', auto: 'Auto chettan', scooter: 'Scooter rider', taxi: 'Taxi driver', tempo: 'Tempo driver', goods: 'Goods auto', van: 'School van driver', fish: 'Fish vendor', jeep: 'Party worker', cow: 'Cow owner', elephant: 'Mahout' };
const carH = (c) => ({ bus: 3.7, elephant: 5.6, tempo: 2.8, jeep: 2.8 }[c.type] ?? 2.3);
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
  if (bump) {
    sound.crash(bump.impact);
    haptic(bump.impact / 8, 160, bump.impact > 6 ? 0.5 : 0);
    if (bump.impact > 4.5) rules.fire('bump');
  }
  emitSmoke(dt);
  traffic.update(dt, t, player, events);
  traffic.collidePlayer(player, events);
  peds.update(dt, player, events);
  rules.update(dt, player, t);
  missions.update(dt, t);
  world.update(t, dt);

  for (const e of events) {
    if (e.type === 'crash') {
      sound.crash(e.impact);
      haptic(Math.min(1, e.impact / 7), 260, 0.6);
      rules.fire('crash');
      const c = e.car;
      setTimeout(() => hud.bubble(pick(DRIVER_HIT[c.type] ?? DRIVER_HIT.car), WHO[c.type] ?? 'Driver', carTarget(c), carH(c), 'driver'), 350);
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
    if (e.type === 'aibump' && e.a.pos.distanceTo(player.pos) < 80) {
      const s = sound.spatial(e.a.pos.x, e.a.pos.z, player);
      sound.crash(1.2 * s.gain);
      ARGUMENT.forEach((line, k) => {
        const c = k % 2 ? e.b : e.a;
        setTimeout(() => hud.bubble(line, WHO[c.type] ?? 'Driver', carTarget(c), carH(c), 'driver', 2.2), 300 + k * 1500);
      });
    }
  }
  for (const e of missions.events.splice(0)) {
    const name = missions.paxInfo?.name ?? '';
    if (e.type === 'pickup') { sound.buzz(); haptic(0.1, 120); }
    if (e.type === 'board') { sound.ding(); haptic(0.12, 80); }
    if (e.type === 'say') { sound.pop(); sound.radio?.duck(4); hud.say(e.line, `Passenger · ${name}`); }
    if (e.type === 'paid') {
      hud.tripEnd(e, (p) => sound.tick(p));
      setTimeout(() => sound.cash(), 900);
      if (!goalHit && missions.cash >= GOAL) { goalHit = true; setTimeout(() => hud.toast('cash', 'Daily goal reached!', 'Lakshyam ethi — anything more is bonus', `₹${missions.cash}`), 2500); }
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

  sound.update(dt, player, world, raining);
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
  if (running && dh > 0) {
    const ch = weather.update(dh, today === 'monsoon');
    if (ch === 'rain' && !raining) setRain(true);
    if (ch === 'stop' && raining && today !== 'monsoon') setRain(false);
  }
  const hInt = Math.floor(gameHour);
  if (hInt !== lastHourInt) { lastHourInt = hInt; onHour(hInt); }

  rainAmt = clamp(rainAmt + (raining ? dt : -dt) / 3, 0, 1);
  const k = skyAt(gameHour);
  nightAmt = k.night;
  // clouds and rain grey the sky and dim the sun
  const overcast = clamp(Math.max(rainAmt, weather.cloud * 0.55), 0, 1);
  const grey = (src, out, dark) => { const l = src.r * 0.3 + src.g * 0.59 + src.b * 0.11; _grey.setRGB(l * dark, l * dark * 1.03, l * dark * 1.05); out.copy(src).lerp(_grey, overcast); };
  grey(k.top, skyU.top.value, 0.75); grey(k.horizon, skyU.horizon.value, 0.85);
  scene.fog.color.copy(skyU.horizon.value);
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
  world.setWet(rainAmt);
  world.setNight?.(nightAmt);
  traffic.setNight?.(nightAmt);
  dustU.uWet.value = rainAmt;
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
  if (h === 6) hud.toast('info', 'Good morning, Thekkumpuram', 'The day shift begins');
  if (h === 19) hud.toast('info', 'Evening', 'Headlights on — streets get busy at the chaya kadas');
}

let last = performance.now(), orbit = 0;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (running && paused) readInput();   // lets the controller's Start button unpause
  if (running && !paused) step(dt);
  else if (!running) {
    // title screen: slow drone shot over the town
    orbit += dt * 0.05;
    world.update(performance.now() / 1000, dt);
    camera.position.set(Math.cos(orbit) * 190, 85, Math.sin(orbit) * 190);
    camera.lookAt(0, 0, 0);
    camera.fov = 55; camera.updateProjectionMatrix();
  }
  updateEnv(running && !paused ? dt : 0);
  if (!paused) updateHumans(dt, camera);
  post.render(dt);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  post.setSize(window.innerWidth, window.innerHeight);
});

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
window.__ottam = { vfx, skies, post, player, traffic, peds, missions, world, rules, sound, setRain, input, scene, camera };
window.__ottam.setHour = (h) => { gameHour = h; };
window.__ottam.weather = weather;
