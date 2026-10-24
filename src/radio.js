// The auto's FM radio. Live Kerala stations (Akashvani, community FM, Malayalam
// net radio) streamed from the internet, plus three generative "studio" stations
// built from synthesised Kerala instruments. Everything plays through a tinny
// dashboard-speaker filter.
import Hls from 'hls.js';

const SA = 261.63;                               // tonic (C4)
const hz = (semi) => SA * Math.pow(2, semi / 12);
const MOHANAM = [0, 2, 4, 7, 9];                 // pentatonic, the classic film-melody raga
const MAYAMALAVAGOWLA = [0, 1, 4, 5, 7, 8, 11];  // the first raga every Carnatic student learns
const rnd = (a, b) => a + Math.random() * (b - a);
const chance = (p) => Math.random() < p;

// Wanders around a raga, phrases resolve to Sa or Pa.
class Melody {
  constructor(scale, lo = -1, hi = 1) {
    this.notes = [];
    for (let o = lo; o <= hi; o++) for (const s of scale) this.notes.push(s + o * 12);
    this.home = this.notes.indexOf(0);
    this.i = this.home;
    this.left = 0;
  }
  next() {
    if (this.left <= 0) this.left = 5 + Math.floor(rnd(0, 6));
    this.left--;
    if (this.left === 0) {
      const pa = this.notes.indexOf(7);
      this.i = chance(0.6) ? this.home : pa >= 0 ? pa : this.home;
      return { semi: this.notes[this.i], long: true };
    }
    const step = pickW([[-2, 1], [-1, 4], [1, 4], [2, 1.5], [0, 0.8]]);
    const pull = this.i > this.home + 6 ? -1 : this.i < this.home - 3 ? 1 : 0;
    this.i = Math.max(0, Math.min(this.notes.length - 1, this.i + step + pull));
    return { semi: this.notes[this.i], long: false };
  }
}
function pickW(pairs) {
  let t = pairs.reduce((a, p) => a + p[1], 0) * Math.random();
  for (const [v, w] of pairs) { t -= w; if (t <= 0) return v; }
  return pairs[0][0];
}

export class Radio {
  constructor(ctx, out, noise) {
    this.ctx = ctx; this.noise = noise;
    // dashboard speaker: band-limited, a bit of grit
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 170;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 5200;
    const peak = ctx.createBiquadFilter(); peak.type = 'peaking'; peak.frequency.value = 1900; peak.gain.value = 4;
    const shaper = ctx.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) { const x = i / 512 - 1; curve[i] = Math.tanh(x * 1.6) / Math.tanh(1.6); }
    shaper.curve = curve;
    this.vol = ctx.createGain(); this.vol.gain.value = 0;
    this.bus = ctx.createGain(); this.bus.gain.value = 0.9;
    this.bus.connect(hp); hp.connect(peak); peak.connect(lp); lp.connect(shaper); shaper.connect(this.vol); this.vol.connect(out);

    const st = ctx.createBufferSource(); st.buffer = noise; st.loop = true;
    const sbp = ctx.createBiquadFilter(); sbp.type = 'bandpass'; sbp.frequency.value = 3000; sbp.Q.value = 0.3;
    this.staticGain = ctx.createGain(); this.staticGain.gain.value = 0;
    st.connect(sbp); sbp.connect(this.staticGain); this.staticGain.connect(this.vol);
    st.start();

    this.level = 0.42;
    this.status = '';
    this.onStatus = () => {};
    this.stations = [...LIVE.map((l) => ({ ...l, live: true })), ...STATIONS];
    this.idx = -1;            // -1 = off
    this.station = null;
    this.timer = setInterval(() => this.schedule(), 40);
  }

  get info() {
    const s = this.idx >= 0 ? this.stations[this.idx] : null;
    return s ? { name: s.name, ml: s.ml, freq: s.freq, genre: s.genre, live: !!s.live, status: this.status } : null;
  }

  // Add trending Malayalam stations from the Radio Browser directory (free, no key).
  async discover() {
    const hosts = ['de1.api.radio-browser.info', 'fi1.api.radio-browser.info', 'nl1.api.radio-browser.info'];
    for (const h of hosts) {
      try {
        const r = await fetch(`https://${h}/json/stations/search?language=malayalam&order=clickcount&reverse=true&limit=40&hidebroken=true`, { signal: AbortSignal.timeout(6000) });
        if (!r.ok) continue;
        const list = await r.json();
        const known = new Set(this.stations.filter((s) => s.live).map((s) => s.url));
        const extra = list
          .filter((s) => s.url_resolved?.startsWith('https://') && !known.has(s.url_resolved) && s.lastcheckok === 1)
          .slice(0, 8)
          .map((s) => ({ live: true, uuid: s.stationuuid, host: h, url: s.url_resolved, hls: !!s.hls || /\.m3u8/.test(s.url_resolved), name: s.name.trim().slice(0, 28), ml: 'മലയാളം', freq: 'NET', genre: `Trending · ${s.votes} votes` }));
        const firstSynth = this.stations.findIndex((s) => !s.live);
        this.stations.splice(firstSynth, 0, ...extra);
        if (this.idx >= firstSynth) this.idx += extra.length;
        return extra.length;
      } catch { /* try next mirror */ }
    }
    return 0;
  }

  setStatus(st) { this.status = st; this.onStatus(st, this.info); }

  stopLive() {
    const l = this.liveNodes;
    if (!l) return;
    clearTimeout(l.timeout);
    l.hls?.destroy();
    l.el.pause(); l.el.removeAttribute('src'); l.el.load();
    l.src?.disconnect();
    this.liveNodes = null;
  }

  startLive(st, idx, cors = true) {
    const el = new Audio();
    if (cors) el.crossOrigin = 'anonymous';
    el.preload = 'none';
    const nodes = { el };
    this.liveNodes = nodes;
    this.setStatus('Connecting…');
    const fail = () => {
      if (this.liveNodes !== nodes || this.idx !== idx) return;
      this.stopLive();
      // some streams refuse CORS: retry once played straight to the speakers
      if (cors && !st.hls) return this.startLive(st, idx, false);
      this.setStatus('Offline');
      setTimeout(() => { if (this.idx === idx) this.next(); }, 1600);
    };
    el.addEventListener('playing', () => { if (this.liveNodes === nodes) { clearTimeout(nodes.timeout); this.setStatus('Live'); } });
    el.addEventListener('error', fail);
    nodes.timeout = setTimeout(fail, 14000);
    if (cors) {
      nodes.src = this.ctx.createMediaElementSource(el);
      nodes.src.connect(this.bus);
    } else {
      el.volume = Math.min(1, this.level / 0.9);
      el.muted = !!this.muted;
    }
    // hls.js first: some browsers' native HLS chokes on these CDN playlists
    if (st.hls && Hls.isSupported()) {
      nodes.hls = new Hls({ enableWorker: true, lowLatencyMode: false });
      nodes.hls.on(Hls.Events.ERROR, (_, d) => { if (d.fatal) fail(); });
      nodes.hls.loadSource(st.url);
      nodes.hls.attachMedia(el);
      nodes.hls.on(Hls.Events.MANIFEST_PARSED, () => el.play().catch(fail));
    } else {
      el.src = st.url;
      el.play().catch(fail);
    }
    // count the play in the directory, as Radio Browser asks clients to
    if (st.uuid) fetch(`https://${st.host}/json/url/${st.uuid}`).catch(() => {});
  }

  setMuted(m) { this.muted = m; if (this.liveNodes && !this.liveNodes.src) this.liveNodes.el.muted = m; }
  suspend(p) { const el = this.liveNodes?.el; if (el) p ? el.pause() : el.play().catch(() => {}); }

  tune(idx) {
    const ctx = this.ctx, t = ctx.currentTime;
    this.station?.stop?.(this);
    this.station = null;
    this.stopLive();
    this.idx = idx;
    this.setStatus('');
    // static sweep between stations
    this.staticGain.gain.cancelScheduledValues(t);
    this.staticGain.gain.setValueAtTime(0.0, t);
    this.staticGain.gain.linearRampToValueAtTime(0.12, t + 0.05);
    this.staticGain.gain.linearRampToValueAtTime(0.0, t + 0.55);
    this.vol.gain.setTargetAtTime(this.level, t, 0.05);
    if (idx < 0) { this.vol.gain.setTargetAtTime(0, t + 0.5, 0.08); return; }
    const st = this.stations[idx];
    if (st.live) { setTimeout(() => { if (this.idx === idx) this.startLive(st, idx); }, 300); return; }
    setTimeout(() => {
      if (this.idx !== idx) return;
      this.station = st;
      this.state = {};
      this.step = 0;
      this.nextT = this.ctx.currentTime + 0.05;
      this.station.start?.(this, this.nextT);
    }, 420);
  }
  next() { this.tune(this.idx + 1 >= this.stations.length ? -1 : this.idx + 1); }
  updateMix() {}
  duck() {}
  prev() { this.tune(this.idx <= -1 ? this.stations.length - 1 : this.idx - 1); }
  setLevel(v) {
    this.level = v;
    if (this.idx >= 0) this.vol.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
    if (this.liveNodes && !this.liveNodes.src) this.liveNodes.el.volume = Math.min(1, v / 0.9);
  }

  schedule() {
    const s = this.station;
    if (!s || this.ctx.state !== 'running') return;
    const ahead = this.ctx.currentTime + 0.25;
    if (this.nextT < this.ctx.currentTime - 0.5) this.nextT = this.ctx.currentTime + 0.05;
    while (this.nextT < ahead) {
      s.tick(this, this.nextT, this.step);
      this.nextT += s.dur(this, this.step);
      this.step++;
    }
  }

  // ---------- instruments ----------
  env(t, a, peak, d, node) {
    const g = this.ctx.createGain();
    peak = Math.max(peak, 0.0002);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
    if (node) node.connect(g);
    g.connect(this.bus);
    return g;
  }
  osc(type, f, t, stop) { const o = this.ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t); o.start(t); o.stop(stop); return o; }
  noiseSrc(t, dur, type, freq, q = 1) {
    const s = this.ctx.createBufferSource(); s.buffer = this.noise;
    s.playbackRate.value = rnd(0.9, 1.1);
    const f = this.ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    s.connect(f); s.start(t, rnd(0, 1.5)); s.stop(t + dur + 0.05);
    return f;
  }

  chenda(t, v = 1) {                       // stick on the tight top skin: sharp crack
    if (v <= 0) return;
    this.env(t, 0.002, 0.75 * v, 0.07, this.noiseSrc(t, 0.1, 'bandpass', rnd(950, 1250), 1.4));
    const o = this.osc('sine', 300, t, t + 0.1); o.frequency.exponentialRampToValueAtTime(170, t + 0.05);
    this.env(t, 0.002, 0.35 * v, 0.06, o);
  }
  valamthala(t, v = 1) {                   // bass chenda
    const o = this.osc('sine', 120, t, t + 0.3); o.frequency.exponentialRampToValueAtTime(68, t + 0.18);
    this.env(t, 0.003, 0.5 * v, 0.22, o);
    this.env(t, 0.002, 0.15 * v, 0.05, this.noiseSrc(t, 0.06, 'lowpass', 600));
  }
  ilathalam(t, v = 1) {                    // pair of brass cymbals
    this.env(t, 0.002, 0.12 * v, 0.22, this.noiseSrc(t, 0.3, 'highpass', 6000, 0.7));
    for (const f of [3150, 4470, 5880]) this.env(t, 0.002, 0.02 * v, 0.35, this.osc('square', f, t, t + 0.4));
  }
  kombu(t, dur = 1.6) {                    // C-shaped horn: brassy bend and swell
    const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(600, t); lp.frequency.linearRampToValueAtTime(2200, t + dur * 0.6);
    for (const [f0, f1] of [[hz(-12), hz(-5)], [hz(-5), hz(0)]]) {
      const o = this.osc('sawtooth', f0, t, t + dur + 0.1); o.frequency.exponentialRampToValueAtTime(f1, t + dur * 0.35);
      o.connect(lp);
    }
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.12, t + dur * 0.4); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    lp.connect(g); g.connect(this.bus);
  }
  reed(t, semi, dur, from, v = 1) {        // nadaswaram / kuzhal: double reed with gamaka slides
    const f = hz(semi);
    const o = this.osc('sawtooth', from ? hz(from) : f, t, t + dur + 0.05);
    if (from !== undefined && from !== semi) o.frequency.exponentialRampToValueAtTime(f, t + Math.min(0.12, dur * 0.4));
    const vib = this.osc('sine', 5.6, t, t + dur + 0.05);
    const vg = this.ctx.createGain(); vg.gain.value = f * 0.006; vib.connect(vg); vg.connect(o.frequency);
    const bp = this.ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1250; bp.Q.value = 1.1;
    const pk = this.ctx.createBiquadFilter(); pk.type = 'peaking'; pk.frequency.value = 2600; pk.gain.value = 6;
    o.connect(bp); bp.connect(pk);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.16 * v, t + 0.03);
    g.gain.setValueAtTime(0.14 * v, t + dur * 0.8); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    pk.connect(g); g.connect(this.bus);
  }
  flute(t, semi, dur, from) {              // bansuri: soft tone + breath
    const f = hz(semi + 12);
    const o = this.osc('sine', from !== undefined ? hz(from + 12) : f, t, t + dur + 0.05);
    if (from !== undefined && from !== semi) o.frequency.exponentialRampToValueAtTime(f, t + Math.min(0.1, dur * 0.3));
    const vib = this.osc('sine', 5, t, t + dur + 0.05);
    const vg = this.ctx.createGain(); vg.gain.setValueAtTime(0, t); vg.gain.linearRampToValueAtTime(f * 0.008, t + dur * 0.7);
    vib.connect(vg); vg.connect(o.frequency);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.2, t + 0.05);
    g.gain.setValueAtTime(0.17, t + dur * 0.75); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.bus);
    this.env(t, 0.03, 0.025, dur * 0.6, this.noiseSrc(t, dur, 'bandpass', f * 2, 3));
  }
  tabla(t, bol, v = 1) {
    if (bol === 'ge' || bol === 'dha') {      // bayan: bass with the palm glide
      const o = this.osc('sine', 85, t, t + 0.5); o.frequency.linearRampToValueAtTime(118, t + 0.2);
      this.env(t, 0.004, 0.42 * v, 0.38, o);
    }
    if (bol === 'na' || bol === 'dha' || bol === 'tin') {   // dayan: ringing treble
      const f = bol === 'tin' ? hz(12) : hz(7);
      this.env(t, 0.002, (bol === 'tin' ? 0.12 : 0.18) * v, 0.16, this.osc('triangle', f, t, t + 0.25));
      this.env(t, 0.002, 0.06 * v, 0.1, this.osc('sine', f * 2.01, t, t + 0.15));
      this.env(t, 0.001, 0.08 * v, 0.02, this.noiseSrc(t, 0.03, 'highpass', 3000));
    }
    if (bol === 'ke') this.env(t, 0.002, 0.15 * v, 0.04, this.noiseSrc(t, 0.05, 'bandpass', 700, 2));
  }
  thavil(t, v = 1) {
    const o = this.osc('sine', 190, t, t + 0.25); o.frequency.exponentialRampToValueAtTime(95, t + 0.1);
    this.env(t, 0.002, 0.45 * v, 0.14, o);
    this.env(t, 0.001, 0.25 * v, 0.03, this.noiseSrc(t, 0.05, 'bandpass', 2400, 1));
  }
  talam(t, v = 1) { this.env(t, 0.002, 0.05 * v, 0.6, this.osc('sine', 2093, t, t + 0.7)); this.env(t, 0.002, 0.03 * v, 0.4, this.osc('sine', 3290, t, t + 0.5)); }
  tanpura(t, semi, dur = 2.4) {
    const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1500;
    for (const d of [-3, 3]) { const o = this.osc('sawtooth', hz(semi), t, t + dur); o.detune.value = d; o.connect(lp); }
    const g = this.env(t, 0.02, 0.045, dur, null);
    lp.connect(g);
  }
  drone(t, semis, level = 0.035) {          // continuous sruti box
    const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
    const g = this.ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(level, t + 0.8);
    const os = semis.map((s) => { const o = this.osc('sawtooth', hz(s), t, t + 3600); o.connect(lp); return o; });
    lp.connect(g); g.connect(this.bus);
    return { stop: () => { const n = this.ctx.currentTime; g.gain.setTargetAtTime(0.0001, n, 0.1); os.forEach((o) => o.stop(n + 0.6)); } };
  }
}

// ---------- Live stations ----------
// Akashvani (All India Radio) Kerala stations, Kerala community radio, and Malayalam net radio.
// Streams verified Oct 2026; dead ones are skipped automatically. Commercial FM (Radio Mango,
// Club FM, Red FM) don't offer public streams, so they can't be played here.
const LIVE = [
  { name: 'Akashvani Ananthapuri FM', ml: 'ആകാശവാണി അനന്തപുരി', freq: '101.9', genre: 'AIR · Thiruvananthapuram', url: 'https://air.pc.cdn.bitgravity.com/air/live/pbaudio229/playlist.m3u8', hls: true },
  { name: 'Akashvani Real FM', ml: 'ആകാശവാണി റിയൽ എഫ്.എം', freq: '103.6', genre: 'AIR · Kozhikode', url: 'https://air.pc.cdn.bitgravity.com/air/live/pbaudio083/playlist.m3u8', hls: true },
  { name: 'Akashvani Kochi FM', ml: 'ആകാശവാണി കൊച്ചി', freq: '102.3', genre: 'AIR · Kochi', url: 'https://radio.wavespb.com/live/70400e7510e87cdf/70400e7510e87cdf.m3u8', hls: true },
  { name: 'Akashvani Malayalam', ml: 'ആകാശവാണി മലയാളം', freq: 'AIR', genre: 'AIR · Alappuzha', url: 'https://air.pc.cdn.bitgravity.com/air/live/pbaudio230/playlist.m3u8', hls: true },
  { name: 'Radio Suno 91.7', ml: 'റേഡിയോ സുനോ', freq: '91.7', genre: 'Malayalam hits', url: 'https://playerservices.streamtheworld.com/api/livestream-redirect/SUNO917_SC' },
  { name: 'Radio Macfast 90.4', ml: 'റേഡിയോ മാക്ഫാസ്റ്റ്', freq: '90.4', genre: 'Community · Tiruvalla', url: 'https://icecast.octosignals.com/radiomacfast' },
  { name: 'Radio Kochi', ml: 'റേഡിയോ കൊച്ചി', freq: 'NET', genre: 'Community · Kochi', url: 'https://d3caeelfr0kslf.cloudfront.net/radiokochi.m3u8', hls: true },
  { name: 'Radio Digital Malayali', ml: 'ഡിജിറ്റൽ മലയാളി', freq: 'NET', genre: 'Malayalam net radio', url: 'https://radio.digitalmalayali.in/listen/stream/radio.mp3' },
  { name: 'Ahalia FM', ml: 'അഹല്യ എഫ്.എം', freq: 'NET', genre: 'Community · Palakkad', url: 'https://cast1.my-control-panel.com/proxy/ahaliafm/stream' },
  { name: 'Aural Radio Kerala', ml: 'ഓറൽ റേഡിയോ', freq: 'NET', genre: 'Malayalam net radio', url: 'https://live.auralradiokerala.in/auralradio/mp3' },
];

// ---------- Studio stations (generated) ----------
const STATIONS = [
  {
    name: 'Chenda FM', ml: 'ചെണ്ട എഫ്.എം', freq: '91.1', genre: 'Panchari melam',
    start(r) { r.state.speed = 0.13; r.state.cycle = 0; },
    dur(r) { return r.state.speed; },
    tick(r, t, i) {
      const s = r.state, k = i % 8;
      // melam starts slow and speeds up through the kaalams, then resets with the horns
      if (i % 64 === 0) {
        s.speed = s.cycle % 4 === 0 ? 0.13 : Math.max(0.072, s.speed * 0.86);
        if (s.cycle % 4 === 0) r.kombu(t, 1.8);
        s.cycle++;
      }
      const accent = k === 0 || k === 3 || k === 6;
      r.chenda(t, accent ? 1 : chance(0.85) ? 0.45 : 0);
      if (k === 0 || k === 4) r.valamthala(t, k === 0 ? 1 : 0.7);
      if (k === 0 || k === 4) r.ilathalam(t, k === 0 ? 1 : 0.6);
      if (s.speed < 0.085 && k % 2 === 1) r.chenda(t + s.speed / 2, 0.35);  // rolls at the fastest kaalam
    },
  },
  {
    name: 'Melody 94.3', ml: 'മെലഡി 94.3', freq: '94.3', genre: 'Mohanam · flute & tabla',
    start(r) { r.state.mel = new Melody(MOHANAM, 0, 1); r.state.hold = 0; r.state.prev = 0; },
    dur() { return 0.17; },
    tick(r, t, i) {
      const s = r.state, k = i % 16, d = 0.17;
      const theka = { 0: 'dha', 2: 'ge', 3: 'na', 4: 'tin', 6: 'na', 7: 'ke', 8: 'dha', 10: 'ge', 11: 'na', 12: 'tin', 14: 'na', 15: 'ke' };
      if (theka[k]) r.tabla(t, theka[k], k % 8 === 0 ? 1 : 0.7);
      if (i % 12 === 0) { const c = [7, 12, 12, 0]; r.tanpura(t, c[(i / 12) % 4] - 12, 2.2); }
      if (s.hold > 0) { s.hold--; return; }
      if (i % 64 >= 56 && chance(0.7)) return;               // breathe between lines
      const n = s.mel.next();
      const len = n.long ? 4 + Math.floor(rnd(0, 3)) : pickW([[1, 3], [2, 4], [3, 1]]);
      r.flute(t, n.semi, len * d * 0.98, chance(0.35) ? s.prev : undefined);
      s.prev = n.semi; s.hold = len - 1;
    },
  },
  {
    name: 'Kshetram 98.6', ml: 'ക്ഷേത്രം 98.6', freq: '98.6', genre: 'Nadaswaram & thavil',
    start(r, t) { r.state.mel = new Melody(MAYAMALAVAGOWLA, 0, 1); r.state.hold = 0; r.state.prev = 0; r.state.drone = r.drone(t, [0, 7, -12]); },
    stop(r) { r.state.drone?.stop(); },
    dur() { return 0.15; },
    tick(r, t, i) {
      const s = r.state, k = i % 8, d = 0.15;
      if (k === 0 || k === 3 || k === 5 || (k === 6 && chance(0.6)) || (k === 7 && chance(0.25))) r.thavil(t, k === 0 ? 1 : 0.6);
      if (k === 0 || k === 4) r.talam(t, k === 0 ? 1 : 0.6);
      if (s.hold > 0) { s.hold--; return; }
      const n = s.mel.next();
      const len = n.long ? 5 + Math.floor(rnd(0, 4)) : pickW([[1, 2], [2, 4], [3, 2]]);
      r.reed(t, n.semi, len * d, chance(0.5) ? s.prev : undefined);
      s.prev = n.semi; s.hold = len - 1;
    },
  },
];
