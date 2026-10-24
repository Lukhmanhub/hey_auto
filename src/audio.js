import { Howl, Howler } from 'howler';
import { Radio } from './radio.js';

// Optional recorded clips (public/sounds/NAME.mp3 or .ogg). Any clip that exists replaces the
// synthesised version; anything missing falls back to the Web Audio synth. See public/sounds/README.md.
const CLIPS = {
  engine: { loop: true }, horn: { loop: true }, rain: { loop: true }, crow: {}, koel: {},
  temple_bell: {}, church_bell: {}, conductor_whistle: {}, coin: {}, meter_tick: {}, phone_buzz: {},
};
export class SoundBank {
  constructor() { this.clips = {}; }
  async probe() {
    await Promise.all(Object.entries(CLIPS).map(async ([name, opt]) => {
      for (const ext of ['mp3', 'ogg']) {
        try {
          const r = await fetch(`${import.meta.env.BASE_URL}sounds/${name}.${ext}`, { method: 'HEAD' });
          // the dev server answers unknown paths with index.html, so check it really is audio
          if (r.ok && (r.headers.get('content-type') || '').startsWith('audio')) {
            this.clips[name] = new Howl({ src: [`${import.meta.env.BASE_URL}sounds/${name}.${ext}`], loop: !!opt.loop, preload: true, html5: false });
            return;
          }
        } catch { /* offline: synth it */ }
      }
    }));
    return Object.keys(this.clips);
  }
  has(n) { return !!this.clips[n]; }
  play(n, { vol = 1, pan = 0, rate = 1 } = {}) {
    const h = this.clips[n]; if (!h) return false;
    const id = h.play(); h.volume(vol, id); h.stereo(Math.max(-1, Math.min(1, pan)), id); h.rate(rate, id);
    return id;
  }
}

// All sounds are synthesised with Web Audio — no asset files.
const rnd = (a, b) => a + Math.random() * (b - a);

export class Sound {
  constructor() { this.ctx = null; this.muted = false; this.bank = new SoundBank(); }

  start() {
    if (this.ctx) { this.ctx.resume(); return; }
    const ctx = (this.ctx = new (window.AudioContext || window.webkitAudioContext)());
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.8;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4;
    this.master.connect(comp); comp.connect(ctx.destination);

    // ---- engine: two-stroke putt-putt (saw + square, lowpassed, chopped by an LFO)
    this.o1 = ctx.createOscillator(); this.o1.type = 'sawtooth';
    this.o2 = ctx.createOscillator(); this.o2.type = 'square';
    const mix = ctx.createGain(); mix.gain.value = 0.5;
    this.o1.connect(mix); this.o2.connect(mix);
    this.lp = ctx.createBiquadFilter(); this.lp.type = 'lowpass'; this.lp.frequency.value = 520; this.lp.Q.value = 3;
    const chop = ctx.createGain(); chop.gain.value = 0.55;
    this.lfo = ctx.createOscillator(); this.lfo.type = 'sine';
    const lfoAmt = ctx.createGain(); lfoAmt.gain.value = 0.45;
    this.lfo.connect(lfoAmt); lfoAmt.connect(chop.gain);
    this.eng = ctx.createGain(); this.eng.gain.value = 0.12;
    mix.connect(this.lp); this.lp.connect(chop); chop.connect(this.eng); this.eng.connect(this.master);
    for (const o of [this.o1, this.o2, this.lfo]) o.start();

    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    // ---- loops: rain, tyre/road rumble, market chatter
    const loop = (type, freq, q) => {
      const s = ctx.createBufferSource(); s.buffer = this.noise; s.loop = true;
      const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
      const g = ctx.createGain(); g.gain.value = 0;
      s.connect(f); f.connect(g); g.connect(this.master); s.start();
      return { g, f };
    };
    this.rainL = loop('bandpass', 2400, 0.4);
    this.road = loop('lowpass', 260, 0.7);
    this.crowd = loop('bandpass', 900, 1.6);
    // chatter: wobble the crowd filter so it sounds like voices rather than hiss
    const wob = ctx.createOscillator(); wob.frequency.value = 3.3;
    const wobG = ctx.createGain(); wobG.gain.value = 350;
    wob.connect(wobG); wobG.connect(this.crowd.f.frequency); wob.start();

    this.radio = new Radio(ctx, this.master, this.noise);
    this.timers = { crow: 3, koel: 12, temple: 4, church: 10, frog: 2, whistle: 6 };
    this.bank.probe().then((found) => {
      this.clipsFound = found;
      if (this.bank.has('engine')) { this.eng.gain.value = 0; this.engineId = this.bank.play('engine', { vol: 0.5 }); }
      if (this.bank.has('rain')) { this.rainClipId = this.bank.play('rain', { vol: 0 }); }
    });
  }

  get ready() { return !!this.ctx; }

  // gain + stereo pan for a point in the world, relative to the player's ears
  spatial(x, z, player, ref = 30) {
    const dx = x - player.pos.x, dz = z - player.pos.z;
    const dist = Math.hypot(dx, dz);
    const rel = Math.atan2(dx, dz) - player.heading;
    // facing +z, +x is on the left
    const pan = -Math.sin(rel);
    return { gain: Math.min(1, ref / Math.max(ref, dist)), pan, dist };
  }
  out(pan = 0) {
    const p = this.ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan));
    p.connect(this.master);
    return p;
  }

  update(dt, player, world, raining) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const speed = Math.abs(player.speed), throttle = player.throttle;
    const f = 24 + speed * 3.3 + throttle * 7;
    this.o1.frequency.setTargetAtTime(f, t, 0.08);
    this.o2.frequency.setTargetAtTime(f * 0.5, t, 0.08);
    this.lfo.frequency.setTargetAtTime(f * 0.5, t, 0.08);
    this.lp.frequency.setTargetAtTime(380 + speed * 40 + throttle * 260, t, 0.1);
    if (this.engineId) {
      const h = this.bank.clips.engine;
      h.rate(0.75 + speed * 0.045 + throttle * 0.15, this.engineId); h.volume(0.35 + throttle * 0.3, this.engineId);
    } else this.eng.gain.setTargetAtTime(0.09 + throttle * 0.08 + Math.min(0.05, speed * 0.004), t, 0.1);
    const rough = player.zone === 'paddy' || player.zone === 'alley' || player.zone === 'grass' ? 2.2 : 1;
    this.road.g.gain.setTargetAtTime(Math.min(0.12, speed * 0.006 * rough) * (raining ? 1.6 : 1), t, 0.2);
    this.road.f.frequency.setTargetAtTime(raining ? 900 : 260, t, 0.5);

    const L = world.lmSpots;
    const market = Math.max(this.spatial(L.fishmarket.x, L.fishmarket.z, player, 25).gain, this.spatial(L.busstand.x, L.busstand.z, player, 25).gain * 0.7);
    this.crowd.g.gain.setTargetAtTime(market * 0.05, t, 0.4);

    const T = this.timers;
    for (const k in T) T[k] -= dt;
    if (T.crow <= 0) { const p = rnd(-0.9, 0.9), v = rnd(0.3, 1); if (!this.bank.play('crow', { vol: v * 0.6, pan: p, rate: rnd(0.9, 1.1) })) this.crow(p, v); T.crow = raining ? rnd(12, 25) : rnd(4, 11); }
    if (T.koel <= 0) { const p = rnd(-0.8, 0.8); if (!raining && !this.bank.play('koel', { vol: 0.5, pan: p })) { if (!raining) this.koel(p); } T.koel = rnd(18, 35); }
    if (T.whistle <= 0) {
      // KRTC conductor's double whistle: "right, poykko!" as a bus pulls out of the stand
      const s = this.spatial(L.busstand.x, L.busstand.z, player, 25);
      if (s.dist < 140 && !this.bank.play('conductor_whistle', { vol: s.gain, pan: s.pan })) this.whistle(s.gain * 0.5, s.pan);
      T.whistle = rnd(12, 22);
    }
    if (T.temple <= 0) {
      const s = this.spatial(L.temple.x, L.temple.z, player, 30);
      if (s.dist < 160 && !this.bank.play('temple_bell', { vol: s.gain * 0.8, pan: s.pan })) this.bell([1, 2.0, 2.76, 5.4, 8.9], 760, 2.6, s.gain * 0.18, s.pan);
      T.temple = rnd(5, 9);
    }
    if (T.church <= 0) {
      const s = this.spatial(L.church.x, L.church.z, player, 35);
      if (s.dist < 200 && !this.bank.play('church_bell', { vol: s.gain * 0.8, pan: s.pan })) for (let k = 0; k < 3; k++) setTimeout(() => this.bell([0.5, 1, 1.19, 1.5, 2, 2.66], 392, 3.5, s.gain * 0.2, s.pan), k * 1400);
      T.church = rnd(22, 34);
    }
    if (T.frog <= 0) { if (raining) this.frog(rnd(-1, 1)); T.frog = rnd(0.4, 1.6); }
    // festival: the procession's panchari melam carries across town
    if (this.melamAt) {
      this.melamT = (this.melamT ?? 0) - dt; this.melamStep = this.melamStep ?? 0;
      while (this.melamT <= 0) {
        const s = this.spatial(this.melamAt.x, this.melamAt.z, player, 20), k = this.melamStep++ % 8;
        if (s.dist < 220 && (k === 0 || k === 3 || k === 6 || Math.random() < 0.6)) this.drum(s.gain, s.pan, k === 0 || k === 4);
        this.melamT += 0.12;
      }
    }
  }

  beep(freqs, dur, vol, type = 'square', filter = 1400, pan = 0) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.015);
    g.gain.setValueAtTime(vol, t + dur - 0.03);
    g.gain.linearRampToValueAtTime(0, t + dur);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = filter; bp.Q.value = 0.8;
    g.connect(bp); bp.connect(this.out(pan));
    for (const f of freqs) { const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; o.connect(g); o.start(t); o.stop(t + dur + 0.02); }
  }

  // ---- Kerala soundscape ----
  crow(pan, vol) {                         // "kaa... kaa": a nasal saw through two formants
    const n = 2 + Math.floor(Math.random() * 2);
    for (let k = 0; k < n; k++) {
      const t = this.ctx.currentTime + k * rnd(0.32, 0.42);
      const o = this.ctx.createOscillator(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(rnd(560, 640), t); o.frequency.linearRampToValueAtTime(rnd(470, 520), t + 0.24);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.05 * vol, t + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.26);
      const out = this.out(pan);
      for (const [ff, q] of [[1350, 6], [2600, 8]]) { const bp = this.ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = ff; bp.Q.value = q; o.connect(bp); bp.connect(g); }
      g.connect(out);
      o.start(t); o.stop(t + 0.3);
    }
  }
  koel(pan) {                              // the Asian koel's rising "ku-oo", each call higher
    for (let k = 0; k < 4; k++) {
      const t = this.ctx.currentTime + k * 0.75, base = 620 + k * 70;
      const o = this.ctx.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(base, t); o.frequency.linearRampToValueAtTime(base * 1.45, t + 0.32);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.03 + k * 0.008, t + 0.08); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
      o.connect(g); g.connect(this.out(pan)); o.start(t); o.stop(t + 0.45);
    }
  }
  bell(partials, base, decay, vol, pan) {  // temple / church bell: inharmonic partials
    if (vol < 0.004) return;
    const t = this.ctx.currentTime, out = this.out(pan);
    partials.forEach((p, k) => {
      const o = this.ctx.createOscillator(); o.type = 'sine'; o.frequency.value = base * p;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol / (1 + k * 0.6), t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t + decay / (1 + k * 0.3));
      o.connect(g); g.connect(out); o.start(t); o.stop(t + decay);
    });
  }
  whistle(vol, pan) {                      // pea whistle: a shrill tone trilled by the pea
    for (const [ms, dur] of [[0, 0.16], [230, 0.5]]) setTimeout(() => {
      const t = this.ctx.currentTime;
      const o = this.ctx.createOscillator(); o.type = 'sine'; o.frequency.value = 2900;
      const am = this.ctx.createOscillator(); am.frequency.value = 38;
      const ag = this.ctx.createGain(); ag.gain.value = 0.5;
      const g = this.ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol * 0.12 + 0.001, t + 0.02); g.gain.setValueAtTime(vol * 0.12 + 0.001, t + dur - 0.04); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      const trem = this.ctx.createGain(); trem.gain.value = 0.5;
      am.connect(ag); ag.connect(trem.gain);
      o.connect(trem); trem.connect(g); g.connect(this.out(pan));
      o.start(t); am.start(t); o.stop(t + dur + 0.05); am.stop(t + dur + 0.05);
    }, ms);
  }
  // fish vendor's rubber bulb horn: "paam-paam"
  bulbHorn(vol, pan) {
    for (const ms of [0, 280]) setTimeout(() => {
      const t = this.ctx.currentTime, o = this.ctx.createOscillator(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(360, t); o.frequency.exponentialRampToValueAtTime(250, t + 0.22);
      const bp = this.ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 2;
      const g = this.ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol * 0.25 + 0.001, t + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.26);
      o.connect(bp); bp.connect(g); g.connect(this.out(pan)); o.start(t); o.stop(t + 0.3);
    }, ms);
  }
  // election jeep: a cheerful jingle, then a distorted loudspeaker voice
  megaphone(vol, pan) {
    const ctx = this.ctx, t0 = ctx.currentTime, out = this.out(pan);
    const shaper = ctx.createWaveShaper(); const curve = new Float32Array(256); for (let i = 0; i < 256; i++) { const x = i / 128 - 1; curve[i] = Math.tanh(x * 4); } shaper.curve = curve;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1500; bp.Q.value = 0.9;
    const g = ctx.createGain(); g.gain.value = vol * 0.18;
    shaper.connect(bp); bp.connect(g); g.connect(out);
    [523, 659, 784, 659, 880, 784].forEach((f, k) => { const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = f; const e = ctx.createGain(); e.gain.setValueAtTime(0.0001, t0 + k * 0.16); e.gain.exponentialRampToValueAtTime(0.5, t0 + k * 0.16 + 0.02); e.gain.exponentialRampToValueAtTime(0.0001, t0 + k * 0.16 + 0.15); o.connect(e); e.connect(shaper); o.start(t0 + k * 0.16); o.stop(t0 + k * 0.16 + 0.2); });
    // syllables: a voice-ish buzz through moving formants
    let t = t0 + 1.1;
    for (let k = 0; k < 16; k++) {
      const d = 0.09 + Math.random() * 0.12, o = ctx.createOscillator(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(150 + Math.random() * 60, t); o.frequency.linearRampToValueAtTime(130 + Math.random() * 70, t + d);
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 500 + Math.random() * 1800; f.Q.value = 4;
      const e = ctx.createGain(); e.gain.setValueAtTime(0.0001, t); e.gain.exponentialRampToValueAtTime(0.9, t + 0.02); e.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(f); f.connect(e); e.connect(shaper); o.start(t); o.stop(t + d + 0.02);
      t += d + (k % 4 === 3 ? 0.18 : 0.03);
    }
  }
  bark(vol, pan) {
    for (const ms of [0, 230]) setTimeout(() => {
      const t = this.ctx.currentTime, o = this.ctx.createOscillator(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(620, t); o.frequency.exponentialRampToValueAtTime(330, t + 0.11);
      const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1100; f.Q.value = 1.5;
      const g = this.ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol * 0.3 + 0.001, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
      o.connect(f); f.connect(g); g.connect(this.out(pan)); o.start(t); o.stop(t + 0.16);
    }, ms);
  }
  // a chenda stroke, used for the temple procession's melam (positional)
  drum(vol, pan, bass) {
    const ctx = this.ctx, t = ctx.currentTime, out = this.out(pan);
    const src = ctx.createBufferSource(); src.buffer = this.noise;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = bass ? 300 : 1100; f.Q.value = 1.3;
    const g = ctx.createGain(); g.gain.setValueAtTime(vol * (bass ? 0.4 : 0.32), t); g.gain.exponentialRampToValueAtTime(0.0001, t + (bass ? 0.2 : 0.07));
    src.connect(f); f.connect(g); g.connect(out); src.start(t, Math.random()); src.stop(t + 0.25);
    if (bass) { const o = ctx.createOscillator(); o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(65, t + 0.18); const e = ctx.createGain(); e.gain.setValueAtTime(vol * 0.5, t); e.gain.exponentialRampToValueAtTime(0.0001, t + 0.22); o.connect(e); e.connect(out); o.start(t); o.stop(t + 0.25); }
  }
  frog(pan) {
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(); o.type = 'square'; o.frequency.value = rnd(120, 170);
    const am = this.ctx.createOscillator(); am.frequency.value = rnd(28, 40);
    const g = this.ctx.createGain(); g.gain.value = 0;
    const ag = this.ctx.createGain(); ag.gain.value = 0.02;
    am.connect(ag); ag.connect(g.gain);
    const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700;
    o.connect(lp); lp.connect(g); g.connect(this.out(pan));
    o.start(t); am.start(t); o.stop(t + rnd(0.12, 0.25)); am.stop(t + 0.3);
  }

  // ---- vehicle sounds ----
  horn(on) {
    if (!this.ctx) return;
    if (this.bank.has('horn')) {
      if (on && !this.hornClip) this.hornClip = this.bank.play('horn', { vol: 0.8 });
      if (!on && this.hornClip) { this.bank.clips.horn.stop(this.hornClip); this.hornClip = null; }
      return;
    }
    const ctx = this.ctx, t = ctx.currentTime;
    if (on && !this.hornNodes) {
      const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.18, t + 0.02);
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1500; bp.Q.value = 1.2;
      g.connect(bp); bp.connect(this.master);
      const os = [455, 572].map((f) => { const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = f; o.connect(g); o.start(); return o; });
      this.hornNodes = { g, os };
    } else if (!on && this.hornNodes) {
      const { g, os } = this.hornNodes;
      g.gain.setTargetAtTime(0, t, 0.02);
      os.forEach((o) => o.stop(t + 0.1));
      this.hornNodes = null;
    }
  }
  honk(dist = 10, pan = 0, bus = false) {
    const vol = Math.min(0.14, 1.6 / Math.max(6, dist));
    const base = bus ? 220 : 330 + Math.random() * 260;
    // private-bus air horns go "paa-pa-paaaa"
    const pattern = bus ? [[0, 0.18], [230, 0.12], [400, 0.5]] : [[0, 0.22], [260, 0.3]];
    for (const [ms, dur] of pattern) setTimeout(() => this.beep([base, base * 1.26], dur, vol, 'square', 1400, pan), ms);
  }
  crash(intensity = 1) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = this.noise;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
    const g = ctx.createGain(); g.gain.setValueAtTime(Math.min(0.6, 0.15 + intensity * 0.05), t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
    src.connect(lp); lp.connect(g); g.connect(this.master);
    src.start(t); src.stop(t + 0.5);
    this.beep([70], 0.18, 0.3, 'sine', 120);
    // rattling tin body panels
    for (let k = 0; k < 4; k++) setTimeout(() => this.beep([rnd(700, 1400)], 0.04, 0.03 * Math.min(2, intensity / 3), 'square', 1800), 60 + k * rnd(40, 80));
  }

  // ---- UI ----
  cash() { if (this.bank.play('coin', { vol: 0.7 })) return; this.beep([1318], 0.09, 0.12, 'sine', 1300); setTimeout(() => this.beep([1760], 0.18, 0.12, 'sine', 1700), 90); }
  ding() { this.beep([880, 1108], 0.25, 0.08, 'sine', 1000); }
  pop() { this.beep([620], 0.06, 0.05, 'sine', 800); }
  // meter tick: a soft mechanical click with a little pitch that rises as the count-up goes
  tick(p = 0) { if (this.bank.play('meter_tick', { vol: 0.5, rate: 1 + p * 0.3 })) return; this.beep([1900 + p * 600], 0.035, 0.05, 'square', 2600); }
  // phone vibrating on the dashboard mount
  buzz() {
    if (!this.ctx) return;
    if (this.bank.play('phone_buzz', { vol: 0.8, pan: 0.4 })) return;
    for (const ms of [0, 260]) setTimeout(() => this.beep([140, 151], 0.2, 0.12, 'square', 220), ms);
  }
  camera() { this.beep([1950], 0.05, 0.08, 'square', 2000); setTimeout(() => this.beep([1950], 0.05, 0.08, 'square', 2000), 110); }

  setRain(on) {
    if (this.rainClipId) { this.bank.clips.rain.fade(on ? 0 : 0.6, on ? 0.6 : 0, 2000, this.rainClipId); return; }
    if (this.ctx) this.rainL.g.gain.setTargetAtTime(on ? 0.16 : 0, this.ctx.currentTime, 0.6);
  }
  setMuted(m) { this.muted = m; this.radio?.setMuted(m); Howler.mute(m); if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.8, this.ctx.currentTime, 0.05); }
}
