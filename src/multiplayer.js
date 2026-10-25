// Auto stands: up to five drivers share one Kochi day. Whoever makes the stand is its host and keeps the
// day (day type, clock, rain); everyone else sees the same town at the same hour. Drivers find their own
// fares, see each other's autos, chat with the drivers close by, and hold a key to talk (proximity voice).
//
// Networking is peer-to-peer WebRTC through PeerJS. Its free cloud server only introduces the players
// (and relays through its TURN servers when phones sit behind strict networks); game data goes straight
// between browsers. Data runs as a star through the host; voice is a direct call between each pair.
import { Peer } from 'peerjs';
import * as THREE from 'three';
import { autoGeometry, vcMat, makePerson, poseSeated } from './models.js';
import { vehicleLights } from './traffic.js';

export const MAX = 5;
export const COLORS = ['#f7c600', '#4fc3f7', '#ff7a59', '#8bdc65', '#d39cff'];
export const HEAR = 60;                         // metres: how far voice and chat carry
const PREFIX = 'heyauto-stand-';
const ALPHA = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';   // no 0/O, 1/I/L
const newCode = () => Array.from({ length: 5 }, () => ALPHA[Math.floor(Math.random() * ALPHA.length)]).join('');
export const cleanCode = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
export const codeFromUrl = () => cleanCode(new URLSearchParams(location.search).get('stand'));
const cleanName = (s) => String(s || '').replace(/[<>]/g, '').trim().slice(0, 14) || 'Driver';

function openPeer(id) {
  return new Promise((resolve, reject) => {
    const p = id ? new Peer(id, { debug: 0 }) : new Peer({ debug: 0 });
    const fail = (e) => { p.destroy(); reject(e); };
    const timer = setTimeout(() => fail(Object.assign(new Error('The stand server did not answer'), { type: 'network' })), 12000);
    p.once('open', () => { clearTimeout(timer); p.off('error', fail); resolve(p); });
    p.once('error', (e) => { clearTimeout(timer); fail(e); });
  });
}

export class Multiplayer {
  constructor(scene) {
    this.scene = scene;
    this.peer = null; this.code = ''; this.host = false; this.active = false; this.started = false;
    this.me = { id: '', name: '', color: COLORS[0] };
    this.roster = [];                 // [{ id, name, color, host }]
    this.conns = new Map();           // host: guest id → connection · guest: just the host
    this.remotes = new Map();         // id → the other drivers' autos
    this.handlers = {};
    this.sendT = 0;
    this.mic = null; this.talkHeld = false; this.talking = false;
    this.calls = new Map();           // outgoing voice calls by peer id
    this.voices = new Map();          // incoming voice by peer id
    this.tags = document.getElementById('mp-tags');
    this._v = new THREE.Vector3();
    window.addEventListener('pagehide', () => this.leave(true));
  }

  on(type, fn) { (this.handlers[type] ??= []).push(fn); return this; }
  emit(type, ...a) { for (const fn of this.handlers[type] ?? []) fn(...a); }
  member(id) { return this.roster.find((m) => m.id === id); }
  get others() { return this.roster.filter((m) => m.id !== this.me.id); }
  get link() { return `${location.origin}${location.pathname}?stand=${this.code}`; }

  // ---------- making and joining a stand ----------
  async create(name) {
    this.me.name = cleanName(name); this.host = true;
    for (let k = 0; k < 4 && !this.peer; k++) {
      const code = newCode();
      try { this.peer = await openPeer(PREFIX + code); this.code = code; } catch (e) { if (e.type !== 'unavailable-id') throw e; }
    }
    if (!this.peer) throw new Error('Could not open a stand, try again');
    this.me.id = this.peer.id;
    this.me.color = COLORS[0];
    this.peer.on('connection', (c) => this.accept(c));
    this.watchPeer();
    this.active = true;
    this.setRoster([{ ...this.me, host: true }]);
    return this.code;
  }

  async join(code, name) {
    this.me.name = cleanName(name); this.host = false; this.code = cleanCode(code);
    this.peer = await openPeer();
    this.me.id = this.peer.id;
    return new Promise((resolve, reject) => {
      const c = this.peer.connect(PREFIX + this.code, { reliable: true, serialization: 'json' });
      let done = false;
      const fail = (msg) => { if (done) return; done = true; clearTimeout(timer); this.leave(true); reject(new Error(msg)); };
      const timer = setTimeout(() => fail('No stand answered with that code. Check it with your friend.'), 15000);
      this.peer.on('error', (e) => { if (e.type === 'peer-unavailable') fail('No stand with that code. Check it with your friend.'); });
      c.on('open', () => c.send({ t: 'hello', name: this.me.name }));
      c.on('data', (m) => {
        if (m.t === 'full') return fail(`That stand is full: ${MAX} drivers already.`);
        if (m.t === 'welcome') {
          done = true; clearTimeout(timer);
          this.me.color = m.you; this.started = m.started; this.active = true;
          this.conns.set(c.peer, c);
          this.watchPeer();
          this.setRoster(m.roster);
          resolve(m);
          return;
        }
        this.onData(m.from ?? c.peer, m);
      });
      c.on('close', () => { if (this.active) { this.emit('closed'); this.leave(true); } });
    });
  }

  watchPeer() {
    // voice: answer every call (we only listen on it; our own voice goes out on our own calls)
    this.peer.on('call', (call) => {
      call.answer();
      call.on('stream', (s) => this.attachVoice(call.peer, s));
      call.on('close', () => this.dropVoice(call.peer));
    });
    this.peer.on('disconnected', () => { if (this.active && !this.peer.destroyed) this.peer.reconnect(); });
  }

  // host: a guest knocks
  accept(c) {
    c.on('data', (m) => {
      if (m.t === 'hello') {
        if (this.roster.length >= MAX) { c.send({ t: 'full' }); setTimeout(() => c.close(), 500); return; }
        const used = new Set(this.roster.map((r) => r.color));
        const member = { id: c.peer, name: cleanName(m.name), color: COLORS.find((k) => !used.has(k)) ?? COLORS[0] };
        this.conns.set(c.peer, c);
        this.setRoster([...this.roster, member]);
        c.send({ t: 'welcome', you: member.color, roster: this.roster, started: this.started, env: this.envNow?.() });
        this.broadcast({ t: 'roster', roster: this.roster }, c.peer);
        return;
      }
      if (!this.conns.has(c.peer)) return;
      const msg = { ...m, from: c.peer };
      if (m.t !== 'req') this.broadcast(msg, c.peer);
      this.onData(c.peer, msg);
    });
    const gone = () => {
      if (!this.conns.delete(c.peer)) return;
      this.setRoster(this.roster.filter((r) => r.id !== c.peer));
      this.broadcast({ t: 'roster', roster: this.roster });
    };
    c.on('close', gone);
    c.on('error', gone);
  }

  broadcast(msg, except) { for (const [id, c] of this.conns) if (id !== except && c.open) c.send(msg); }
  send(msg) { if (!this.active) return; this.host ? this.broadcast(msg) : [...this.conns.values()][0]?.send(msg); }

  onData(from, m) {
    if (m.t === 'roster') return this.setRoster(m.roster);
    if (m.t === 's') return this.remote(from)?.push(m);
    if (m.t === 'chat') return this.emit('chat', this.member(from), String(m.text || '').slice(0, 80), this.distTo(from));
    if (m.t === 'start') { this.started = true; return this.emit('start', m); }
    if (m.t === 'env') return this.emit('env', m);
    if (m.t === 'req' && this.host) return this.emit('req', m.k, this.member(from));
  }

  setRoster(list) {
    const before = new Map(this.roster.map((r) => [r.id, r]));
    this.roster = list;
    const now = new Set(list.map((r) => r.id));
    for (const [id, r] of before) if (!now.has(id) && id !== this.me.id) { this.removeRemote(id); this.emit('left', r); }
    for (const r of list) if (!before.has(r.id) && r.id !== this.me.id) { if (before.size) this.emit('joined', r); if (this.mic) this.callPeer(r.id); }
    this.emit('roster', list);
  }

  // host shares the day; everyone already there (and anyone joining later) drives it
  startShift(env) { this.started = true; this.send({ t: 'start', ...env }); }

  leave(quiet) {
    if (!this.peer) return;
    this.active = false; this.started = false;
    for (const c of this.conns.values()) try { c.close(); } catch { /* gone */ }
    this.conns.clear();
    for (const id of [...this.remotes.keys()]) this.removeRemote(id);
    for (const id of [...this.voices.keys()]) this.dropVoice(id);
    this.calls.clear();
    this.mic?.getTracks().forEach((t) => t.stop()); this.mic = null; this.talking = false;
    try { this.peer.destroy(); } catch { /* gone */ }
    this.peer = null; this.roster = []; this.code = '';
    if (!quiet) this.emit('roster', []);
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
    // a roof flag in the driver's colour, so friends are easy to tell from the town's autos
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
    r = { id, root, body, pax, tag, pos: new THREE.Vector3(), target: new THREE.Vector3(), vel: 0, heading: 0, targetH: 0, last: 0, seen: false, s: {} };
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
    this.dropVoice(id);
    this.calls.get(id)?.close(); this.calls.delete(id);
  }

  distTo(id) {
    const r = this.remotes.get(id);
    return r && this.player ? Math.hypot(r.pos.x - this.player.pos.x, r.pos.z - this.player.pos.z) : Infinity;
  }
  nearby(d = HEAR) { return [...this.remotes.values()].filter((r) => r.seen && this.distTo(r.id) < d); }

  // every frame while a shift is running. Returns a bump if we drove into a friend.
  update(dt, player, camera, stats, live) {
    this.player = player;
    if (!this.active) return null;
    this.sendT -= dt;
    if (this.sendT <= 0 && this.started) {
      this.sendT = 1 / 12;
      const r2 = (v) => Math.round(v * 100) / 100;
      this.send({ t: 's', x: r2(player.pos.x), z: r2(player.pos.z), h: r2(player.heading), v: r2(player.speed), p: stats.riding ? 1 : 0, n: stats.net, r: stats.rides, k: this.talking ? 1 : 0 });
    }
    const now = performance.now();
    let bump = null;
    const W = window.innerWidth, H = window.innerHeight;
    for (const r of this.remotes.values()) {
      if (!r.seen) continue;
      // dead-reckon a little past the last update, then ease towards it
      const ahead = Math.min(0.25, (now - r.last) / 1000);
      const tx = r.target.x + Math.sin(r.targetH) * r.vel * ahead, tz = r.target.z + Math.cos(r.targetH) * r.vel * ahead;
      const k = 1 - Math.exp(-dt * 10);
      if (Math.hypot(tx - r.pos.x, tz - r.pos.z) > 25) r.pos.set(tx, 0, tz); else { r.pos.x += (tx - r.pos.x) * k; r.pos.z += (tz - r.pos.z) * k; }
      r.heading += Math.atan2(Math.sin(r.targetH - r.heading), Math.cos(r.targetH - r.heading)) * k;
      r.root.position.copy(r.pos); r.root.rotation.y = r.heading;
      r.pax.group.visible = !!r.s.p;
      // stale for a while (tab in the background): grey them out
      const stale = now - r.last > 4000;
      r.root.visible = !stale || now - r.last < 60000;

      // solid to us: push apart, bleed speed
      const dx = player.pos.x - r.pos.x, dz = player.pos.z - r.pos.z, d = Math.hypot(dx, dz);
      if (live && d < 2.1 && d > 0.001) {
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
      const show = v.z < 1 && dist < 220 && r.root.visible;
      r.tag.style.opacity = show ? (stale ? 0.45 : 1) : 0;
      if (show) {
        const sc = Math.max(0.7, Math.min(1, 18 / dist + 0.55));
        r.tag.style.transform = `translate(${((v.x + 1) / 2) * W}px, ${((1 - v.y) / 2) * H}px) translate(-50%, -100%) scale(${sc})`;
        r.tag.querySelector('small').textContent = d > 30 ? `${Math.round(d)} m` : '';
        r.tag.classList.toggle('talk', !!r.s.k);
        r.tag.classList.toggle('far', !!r.s.k && d > HEAR);
      }
      // their voice: full up close, gone past HEAR, panned to where they are
      const vo = this.voices.get(r.id);
      if (vo) {
        const g = d < HEAR * 0.35 ? 1 : Math.max(0, 1 - (d - HEAR * 0.35) / (HEAR * 0.65));
        const rx = Math.cos(player.heading), rz = -Math.sin(player.heading);   // the auto's right-hand side
        const pan = d > 0.5 ? Math.max(-1, Math.min(1, (-(dx * rx + dz * rz) / d) * 0.8)) : 0;
        vo.gain.gain.setTargetAtTime(g * 1.4, vo.ctx.currentTime, 0.08);
        vo.pan.pan.setTargetAtTime(pan, vo.ctx.currentTime, 0.08);
      }
    }
    return bump;
  }

  // ---------- push-to-talk voice ----------
  audio() {
    if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    return this.ctx;
  }

  async talk(on) {
    this.talkHeld = on;
    if (!this.active) return;
    this.audio();
    if (on && !this.mic) {
      try {
        this.mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      } catch (e) {
        this.emit('mic', 'denied', e);
        return;
      }
      this.mic.getAudioTracks().forEach((t) => { t.enabled = false; });
      for (const m of this.others) this.callPeer(m.id);
      this.emit('mic', 'ready');
    }
    this.talking = !!this.mic && this.talkHeld;
    this.mic?.getAudioTracks().forEach((t) => { t.enabled = this.talking; });
    this.emit('talk', this.talking);
  }

  callPeer(id) {
    if (!this.mic || !this.peer || this.calls.has(id)) return;
    const call = this.peer.call(id, this.mic);
    if (!call) return;
    this.calls.set(id, call);
    const drop = () => { if (this.calls.get(id) === call) this.calls.delete(id); };
    call.on('close', drop); call.on('error', drop);
  }

  attachVoice(id, stream) {
    this.dropVoice(id);
    const ctx = this.audio();
    // Chrome only lets a WebRTC stream flow into Web Audio while a media element is playing it too
    const el = new Audio();
    el.muted = true; el.srcObject = stream; el.play().catch(() => {});
    const src = ctx.createMediaStreamSource(stream);
    const gain = ctx.createGain(); gain.gain.value = 0;
    const pan = ctx.createStereoPanner();
    src.connect(gain).connect(pan).connect(ctx.destination);
    this.voices.set(id, { ctx, el, src, gain, pan });
  }

  dropVoice(id) {
    const v = this.voices.get(id);
    if (!v) return;
    try { v.src.disconnect(); v.gain.disconnect(); v.pan.disconnect(); } catch { /* already gone */ }
    v.el.srcObject = null;
    this.voices.delete(id);
  }

  // ---------- chat ----------
  chat(text) {
    text = String(text || '').trim().slice(0, 80);
    if (!text) return null;
    this.send({ t: 'chat', text });
    return text;
  }
}
