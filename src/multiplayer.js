// Auto stands: up to five drivers share one Kochi day. The first driver hosts it and keeps the day (day
// type, clock, rain); everyone sees the same town at the same hour, finds their own fares, sees each other
// on the road and the map, and holds a key to talk to the drivers close by (walkie-talkie style).
//
// Every driver keeps one WebSocket to the stand's room on Cloudflare (stand-server/, a Durable Object).
// No peer-to-peer: it works on any network, the stand stays open while the host switches apps to share
// the link, a driver who loses signal gets their spot back, and if the host leaves the next driver hosts.
// Voice goes through the room too: 12 kHz μ-law chunks, sent only to the drivers in earshot.
import * as THREE from 'three';
import { autoGeometry, vcMat, makePerson, poseSeated } from './models.js';
import { vehicleLights } from './traffic.js';

export const MAX = 5;
export const HEAR = 60;                         // metres: how far voice and chat carry
const SERVER = new URLSearchParams(location.search).has('localstand') ? 'ws://localhost:8787' : 'wss://hey-auto-stand.stand-server.workers.dev';
const ALPHA = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';   // no 0/O, 1/I/L
const newCode = () => Array.from({ length: 5 }, () => ALPHA[Math.floor(Math.random() * ALPHA.length)]).join('');
export const cleanCode = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
export const codeFromUrl = () => cleanCode(new URLSearchParams(location.search).get('stand'));
const cleanName = (s) => String(s || '').replace(/[<>]/g, '').trim().slice(0, 14) || 'Driver';
const ERRORS = {
  nostand: 'No stand is open with that code. Ask your friend to send it again.',
  full: `That stand is full: ${MAX} drivers already.`,
  taken: 'That code is busy, try again.',
  bad: 'Something went wrong. Try again.',
};

// ---------- walkie-talkie audio: 12 kHz, 8-bit μ-law (telephone quality, ~12 KB/s while talking) ----------
const RATE = 12000, CHUNK = 1200;               // 100 ms per message
function mulaw(s) {
  let x = Math.round(Math.max(-1, Math.min(1, s)) * 32635);
  const sign = x < 0 ? 0x80 : 0;
  if (sign) x = -x;
  x += 0x84;
  let exp = 7;
  for (let m = 0x4000; (x & m) === 0 && exp > 0; m >>= 1) exp--;
  return ~(sign | (exp << 4) | ((x >> (exp + 3)) & 0x0f)) & 0xff;
}
function unmulaw(u) {
  u = ~u & 0xff;
  const x = ((((u & 0x0f) << 3) + 0x84) << ((u >> 4) & 7)) - 0x84;
  return (u & 0x80 ? -x : x) / 32768;
}
const toB64 = (bytes) => { let s = ''; for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]); return btoa(s); };
const fromB64 = (b64) => { const s = atob(b64), out = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i); return out; };

export class Multiplayer {
  constructor(scene) {
    this.scene = scene;
    this.ws = null; this.code = ''; this.active = false; this.started = false; this.status = 'offline';
    this.me = { id: '', name: '', color: '#f7c600' };
    this.roster = [];                 // [{ id, name, color, host, away }]
    this.remotes = new Map();         // id → the other drivers' autos
    this.handlers = {};
    this.sendT = 0;
    this.mic = null; this.talkHeld = false; this.talking = false;
    this.voices = new Map();          // id → playback chain for their voice
    this.tags = document.getElementById('mp-tags');
    this._v = new THREE.Vector3();
    window.addEventListener('pagehide', () => this.leave(true));
    // phones: a backgrounded tab can lose its socket; come straight back when it's visible again
    document.addEventListener('visibilitychange', () => { if (!document.hidden && this.wanted && this.ws?.readyState !== 1) this.reconnect(true); });
  }

  on(type, fn) { (this.handlers[type] ??= []).push(fn); return this; }
  emit(type, ...a) { for (const fn of this.handlers[type] ?? []) fn(...a); }
  member(id) { return this.roster.find((m) => m.id === id); }
  get host() { return this.active && this.roster.find((m) => m.host)?.id === this.me.id; }
  get hostName() { return this.roster.find((m) => m.host)?.name ?? ''; }
  get others() { return this.roster.filter((m) => m.id !== this.me.id); }
  get link() { return `${location.origin}${location.pathname}?stand=${this.code}`; }

  // who's at a stand, before joining it (for the shared link)
  static async peek(code) {
    try {
      const r = await fetch(`${SERVER.replace(/^ws/, 'http')}/stand/${cleanCode(code)}/peek`);
      return r.ok ? await r.json() : null;
    } catch { return null; }
  }

  // ---------- making and joining a stand ----------
  async create(name) {
    for (let k = 0; k < 5; k++) {
      try { return await this.connect(newCode(), name, true); } catch (e) { if (e.code !== 'taken') throw e; }
    }
    throw new Error(ERRORS.taken);
  }
  join(code, name) { return this.connect(cleanCode(code), name, false); }

  connect(code, name, create) {
    this.leave(true);
    this.code = code; this.me.name = cleanName(name);
    let id = '';
    try { id = sessionStorage.getItem(`heyauto-stand-${code}`) || ''; } catch { /* private mode */ }
    this.me.id = id || Math.random().toString(36).slice(2, 12);
    try { sessionStorage.setItem(`heyauto-stand-${code}`, this.me.id); } catch { /* private mode */ }
    return new Promise((resolve, reject) => {
      let settled = false;
      const fail = (e) => {
        if (settled) return;
        settled = true; clearTimeout(timer); this.leave(true);
        reject(Object.assign(new Error(ERRORS[e.code] ?? 'Couldn’t reach the stand. Check your internet and try again.'), { code: e.code }));
      };
      const timer = setTimeout(() => fail({ code: 'net' }), 12000);
      this.open(create, (m) => {
        if (settled) return;
        settled = true; clearTimeout(timer);
        resolve(m);
      }, fail);
    });
  }

  open(create, onWelcome, onFail) {
    const q = new URLSearchParams({ id: this.me.id, name: this.me.name });
    if (create) q.set('create', '1');
    const ws = new WebSocket(`${SERVER}/stand/${this.code}?${q}`);
    this.ws = ws;
    ws.onmessage = (e) => {
      let m;
      try { m = JSON.parse(e.data); } catch { return; }
      if (m.t === 'err') {
        this.wanted = false;
        if (onFail) onFail(m); else { this.emit('closed', m.code); this.leave(true); }
        return;
      }
      if (m.t === 'welcome') {
        this.active = true; this.wanted = true; this.tries = 0;
        this.me.color = m.you.color; this.started = m.started;
        this.setStatus('online');
        this.setRoster(m.roster);
        if (m.started && m.env) this.emit('env', m.env);
        onWelcome?.(m);
        return;
      }
      this.onData(m);
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      if (!this.wanted) { onFail?.({ code: 'net' }); return; }
      this.reconnect();
    };
    // keep the socket warm through mobile carriers' idle timeouts
    clearInterval(this.pinger);
    this.pinger = setInterval(() => this.raw({ t: 'ping' }), 20000);
  }

  // lost the socket mid-game: keep trying for about a minute, then give up and drive solo
  reconnect(now) {
    if (!this.wanted || (this.ws && this.ws.readyState <= 1)) return;
    clearTimeout(this.retryT);
    this.setStatus('reconnecting');
    this.tries = (this.tries ?? 0) + 1;
    if (this.tries > 25) { this.emit('closed', 'net'); this.leave(true); return; }
    this.retryT = setTimeout(() => this.open(false), now ? 0 : Math.min(4000, 600 * this.tries));
  }
  setStatus(s) { if (s !== this.status) { this.status = s; this.emit('status', s); } }

  raw(msg) { if (this.ws?.readyState === 1) this.ws.send(JSON.stringify(msg)); }
  send(msg) { if (this.active) this.raw(msg); }

  onData(m) {
    const who = this.member(m.from);
    switch (m.t) {
      case 'roster': this.started = m.started ?? this.started; return this.setRoster(m.roster);
      case 's': return this.remote(m.from)?.push(m);
      case 'chat': return this.emit('chat', who, String(m.text || '').slice(0, 80), this.distTo(m.from));
      case 'start': this.started = true; return this.emit('start', m.env ?? {});
      case 'env': return this.emit('env', m.env ?? {});
      case 'req': if (this.host) this.emit('req', m.k, who); return;
      case 'v': return this.hear(m);
      case 'left': return this.emit('left', { id: m.id, name: m.name });
    }
  }

  setRoster(list) {
    const before = new Map(this.roster.map((r) => [r.id, r]));
    const wasHost = this.host;
    this.roster = list;
    const now = new Set(list.map((r) => r.id));
    for (const [id] of before) if (!now.has(id) && id !== this.me.id) this.removeRemote(id);
    for (const r of list) if (!before.has(r.id) && r.id !== this.me.id && before.size) this.emit('joined', r);
    if (!wasHost && this.host && before.size) this.emit('host');
    this.emit('roster', list);
  }

  // host shares the day; everyone already there (and anyone joining later) drives it
  startShift(env) { this.started = true; this.send({ t: 'start', env }); }

  leave(quiet) {
    this.wanted = false;
    clearTimeout(this.retryT); clearInterval(this.pinger);
    if (this.ws) { try { if (this.ws.readyState === 1) this.ws.send(JSON.stringify({ t: 'bye' })); this.ws.close(); } catch { /* gone */ } }
    this.ws = null;
    const was = this.active;
    this.active = false; this.started = false;
    for (const id of [...this.remotes.keys()]) this.removeRemote(id);
    this.mic?.getTracks().forEach((t) => t.stop());
    this.mic = null; this.talking = false; this.talkHeld = false;
    try { this.proc?.disconnect(); this.micSrc?.disconnect(); } catch { /* gone */ }
    this.proc = this.micSrc = null;
    this.roster = [];
    this.setStatus('offline');
    if (was && !quiet) this.emit('roster', []);
  }

  // ---------- the other autos ----------
  remote(id) {
    const m = this.member(id);
    if (!m || id === this.me.id) return null;
    let r = this.remotes.get(id);
    if (r) return r;
    const root = new THREE.Group();
    const body = new THREE.Mesh(autoGeometry('#f4c20d', '#151515'), vcMat);
    body.castShadow = true;
    body.add(vehicleLights({ type: 'auto', halfLen: 1.46 }, { pool: false }));
    root.add(body);
    // a roof flag in the driver's colour, so friends stand out from the town's autos
    const flag = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.06, 0.5), new THREE.MeshStandardMaterial({ color: m.color, emissive: m.color, emissiveIntensity: 0.35, roughness: 0.5 }));
    flag.position.set(0, 2.06, 0.35);
    root.add(flag);
    const pax = makePerson(Math.random);
    poseSeated(pax); pax.group.position.set(0.22, pax.anim ? 0.62 : 0.2, -0.66); pax.group.visible = false;
    root.add(pax.group);
    root.visible = false;
    this.scene.add(root);
    const tag = document.createElement('div');
    tag.className = 'mp-tag';
    tag.innerHTML = '<i></i><b></b><span class="mic"></span><small></small>';
    tag.querySelector('i').style.background = m.color;
    tag.querySelector('b').textContent = m.name;
    this.tags?.appendChild(tag);
    r = { id, root, body, pax, tag, pos: new THREE.Vector3(), target: new THREE.Vector3(), vel: 0, heading: 0, targetH: 0, last: 0, seen: false, s: {}, voiceUntil: 0 };
    this.remotes.set(id, r);
    r.push = (s) => {
      r.s = s; r.target.set(s.x, 0, s.z); r.targetH = s.h; r.vel = s.v; r.last = performance.now();
      if (!r.seen) { r.pos.copy(r.target); r.heading = s.h; r.seen = true; root.visible = true; }
    };
    return r;
  }

  removeRemote(id) {
    const r = this.remotes.get(id);
    if (!r) return;
    this.scene.remove(r.root);
    r.tag.remove();
    this.remotes.delete(id);
    this.voices.delete(id);
  }

  distTo(id) {
    const r = this.remotes.get(id);
    return r?.seen && this.player ? Math.hypot(r.pos.x - this.player.pos.x, r.pos.z - this.player.pos.z) : Infinity;
  }
  fresh(r) { return r.seen && performance.now() - r.last < 8000 && !this.member(r.id)?.away; }
  nearby(d = HEAR) { return [...this.remotes.values()].filter((r) => this.fresh(r) && this.distTo(r.id) < d); }
  nearest() {
    let best = null, bd = Infinity;
    for (const r of this.remotes.values()) { const d = this.distTo(r.id); if (this.fresh(r) && d < bd) { bd = d; best = r; } }
    return best ? { r: best, d: bd, m: this.member(best.id) } : null;
  }

  // every frame while a shift is running. Returns a bump if we drove into a friend.
  update(dt, player, camera, stats, live) {
    this.player = player;
    if (!this.active) return null;
    this.sendT -= dt;
    if (this.sendT <= 0 && this.started) {
      this.sendT = 1 / 8;
      const r2 = (v) => Math.round(v * 100) / 100;
      this.send({ t: 's', x: r2(player.pos.x), z: r2(player.pos.z), h: r2(player.heading), v: r2(player.speed), p: stats.riding ? 1 : 0, n: stats.net, r: stats.rides, k: this.talking ? 1 : 0 });
    }
    const now = performance.now();
    let bump = null;
    const W = window.innerWidth, H = window.innerHeight;
    for (const r of this.remotes.values()) {
      if (!r.seen) continue;
      // dead-reckon a little past the last update, then ease towards it
      const ahead = Math.min(0.3, (now - r.last) / 1000);
      const tx = r.target.x + Math.sin(r.targetH) * r.vel * ahead, tz = r.target.z + Math.cos(r.targetH) * r.vel * ahead;
      const k = 1 - Math.exp(-dt * 9);
      if (Math.hypot(tx - r.pos.x, tz - r.pos.z) > 25) r.pos.set(tx, 0, tz); else { r.pos.x += (tx - r.pos.x) * k; r.pos.z += (tz - r.pos.z) * k; }
      r.heading += Math.atan2(Math.sin(r.targetH - r.heading), Math.cos(r.targetH - r.heading)) * k;
      r.root.position.copy(r.pos); r.root.rotation.y = r.heading;
      r.pax.group.visible = !!r.s.p;
      const away = !!this.member(r.id)?.away, stale = !this.fresh(r);

      // solid to us: push apart, bleed speed
      const dx = player.pos.x - r.pos.x, dz = player.pos.z - r.pos.z, d = Math.hypot(dx, dz);
      if (live && !stale && d < 2.1 && d > 0.001) {
        const push = 2.1 - d;
        player.pos.x += (dx / d) * push; player.pos.z += (dz / d) * push;
        const impact = Math.abs(player.speed - r.vel);
        player.speed *= 0.5;
        if (impact > 2.5 && (!bump || impact > bump.impact)) bump = { impact, who: this.member(r.id) };
      }

      // name tag over the auto
      const v = this._v.set(r.pos.x, 2.75, r.pos.z);
      const dist = v.distanceTo(camera.position);
      v.project(camera);
      const show = v.z < 1 && dist < 260;
      r.tag.style.opacity = show ? (stale ? 0.5 : 1) : 0;
      if (show) {
        const sc = Math.max(0.7, Math.min(1, 18 / dist + 0.55));
        r.tag.style.transform = `translate(${((v.x + 1) / 2) * W}px, ${((1 - v.y) / 2) * H}px) translate(-50%, -100%) scale(${sc})`;
        r.tag.querySelector('small').textContent = away ? 'lost signal…' : d > 30 ? `${Math.round(d)} m` : '';
        r.tag.classList.toggle('talk', now < r.voiceUntil || !!r.s.k);
        r.tag.classList.toggle('far', !!r.s.k && d > HEAR);
      }
      // their voice: full up close, fading out towards HEAR, panned to where they are
      const vo = this.voices.get(r.id);
      if (vo) {
        const g = d < HEAR * 0.4 ? 1 : Math.max(0, 1 - (d - HEAR * 0.4) / (HEAR * 0.6));
        const rx = Math.cos(player.heading), rz = -Math.sin(player.heading);   // the auto's right-hand side
        const pan = d > 0.5 ? Math.max(-1, Math.min(1, (-(dx * rx + dz * rz) / d) * 0.7)) : 0;
        vo.gain.gain.setTargetAtTime(g * 1.3, vo.ctx.currentTime, dt ? 0.08 : 0.001);
        vo.pan.pan.setTargetAtTime(pan, vo.ctx.currentTime, dt ? 0.08 : 0.001);
      }
    }
    return bump;
  }

  // ---------- push-to-talk ----------
  audio() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      // iOS suspends audio when the app goes to the background; any tap brings it back
      document.addEventListener('pointerdown', () => { if (this.ctx.state !== 'running') this.ctx.resume().catch(() => {}); });
    }
    if (this.ctx.state !== 'running') this.ctx.resume().catch(() => {});
    return this.ctx;
  }

  // a short radio chirp when a transmission starts or ends
  chirp(up, gain = 0.08) {
    const ctx = this.audio(), t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'square';
    o.frequency.setValueAtTime(up ? 1250 : 1600, t); o.frequency.setValueAtTime(up ? 1600 : 1250, t + 0.05);
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.11);
    o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + 0.12);
  }

  async talk(on) {
    if (on === this.talkHeld) return;
    this.talkHeld = on;
    if (!this.active) return;
    const ctx = this.audio();
    if (on && !this.mic) {
      try {
        this.mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } });
      } catch (e) {
        this.talkHeld = false;
        this.emit('mic', 'denied', e);
        return;
      }
      this.micSrc = ctx.createMediaStreamSource(this.mic);
      this.proc = ctx.createScriptProcessor(2048, 1, 1);
      const mute = ctx.createGain(); mute.gain.value = 0;
      this.micSrc.connect(this.proc).connect(mute).connect(ctx.destination);
      this.buf = new Uint8Array(CHUNK); this.fill = 0; this.phase = 0; this.seq = 0;
      this.proc.onaudioprocess = (e) => this.capture(e.inputBuffer.getChannelData(0), ctx.sampleRate);
      this.emit('mic', 'ready');
    }
    const was = this.talking;
    this.talking = !!this.mic && this.talkHeld;
    if (this.talking !== was) {
      this.chirp(this.talking, 0.05);
      if (!this.talking) this.flush(true);
    }
    this.emit('talk', this.talking);
  }

  capture(input, sr) {
    if (!this.talking) return;
    const step = sr / RATE;
    // downsample by averaging each output sample's slice of input
    for (; this.phase < input.length; this.phase += step) {
      const a = Math.floor(this.phase), b = Math.min(input.length, Math.floor(this.phase + step));
      let s = 0; for (let i = a; i < b; i++) s += input[i];
      this.buf[this.fill++] = mulaw(s / Math.max(1, b - a));
      if (this.fill === CHUNK) this.flush(false);
    }
    this.phase -= input.length;
  }

  flush(end) {
    const to = this.nearby(HEAR * 1.15).map((r) => r.id);
    if (to.length && (this.fill || end)) this.send({ t: 'v', to, d: toB64(this.buf.subarray(0, this.fill)), n: this.seq++, e: end ? 1 : 0 });
    this.fill = 0;
  }

  hear(m) {
    const ctx = this.audio();
    let vo = this.voices.get(m.from);
    if (!vo) {
      const gain = ctx.createGain(); gain.gain.value = 0;
      const pan = ctx.createStereoPanner();
      // a touch of radio: cut the boom and the hiss
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 220;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 4200;
      hp.connect(lp).connect(gain).connect(pan).connect(ctx.destination);
      vo = { ctx, gain, pan, input: hp, next: 0, live: false };
      this.voices.set(m.from, vo);
    }
    const r = this.remotes.get(m.from);
    if (r) r.voiceUntil = performance.now() + 400;
    if (!vo.live) { vo.live = true; this.chirp(true, 0.03); }
    if (m.e) { vo.live = false; setTimeout(() => this.chirp(false, 0.03), Math.max(0, (vo.next - ctx.currentTime) * 1000)); }
    const bytes = fromB64(m.d || '');
    if (!bytes.length) return;
    const buf = ctx.createBuffer(1, bytes.length, RATE), ch = buf.getChannelData(0);
    for (let i = 0; i < bytes.length; i++) ch[i] = unmulaw(bytes[i]);
    const src = ctx.createBufferSource();
    src.buffer = buf; src.connect(vo.input);
    // a small jitter buffer: start 150 ms behind, then play chunks back to back
    const t = Math.max(ctx.currentTime + 0.15, vo.next > ctx.currentTime + 0.6 ? ctx.currentTime + 0.15 : vo.next);
    src.start(t);
    vo.next = t + buf.duration;
  }

  // ---------- chat ----------
  chat(text) {
    text = String(text || '').trim().slice(0, 80);
    if (!text) return null;
    this.send({ t: 'chat', text });
    return text;
  }
}
