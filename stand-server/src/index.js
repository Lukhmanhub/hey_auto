// Hey Auto multiplayer: one Durable Object per auto stand (room). Every driver keeps a WebSocket to it,
// so it works on any network (no peer-to-peer), and the stand stays open while the host switches apps
// to share the link. The room relays what drivers send, owns who's in it and who hosts, and remembers
// the shared day so late joiners drive the same one.
//
//   GET /stand/<CODE>?id=<driver id>&name=<name>&create=1   → WebSocket
//   GET /stand/<CODE>/peek                                  → { open, drivers, started, host }

const MAX = 5;
const COLORS = ['#f7c600', '#4fc3f7', '#ff7a59', '#8bdc65', '#d39cff'];
const AWAY_MS = 45000;          // a driver who lost signal keeps their spot this long
const CORS = { 'Access-Control-Allow-Origin': '*' };
const clean = (s, n) => String(s ?? '').replace(/[<>\u0000-\u001f]/g, '').trim().slice(0, n);

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const m = /^\/stand\/([A-Z0-9]{5})(\/peek)?$/.exec(url.pathname);
    if (!m) return new Response('Hey Auto stand server', { headers: CORS });
    const stub = env.STAND.get(env.STAND.idFromName(m[1]));
    return stub.fetch(request);
  },
};

export class Stand {
  constructor(state) {
    this.state = state;
    this.reset();
  }

  reset() {
    this.open = false;
    this.members = [];          // { id, name, color, ws, away, awayTimer, joined }
    this.hostId = null;
    this.started = false;
    this.env = null;
  }

  roster() {
    return this.members.map((m) => ({ id: m.id, name: m.name, color: m.color, host: m.id === this.hostId, away: !!m.away }));
  }
  send(m, msg) { if (m.ws && !m.away) try { m.ws.send(typeof msg === 'string' ? msg : JSON.stringify(msg)); } catch { /* closing */ } }
  broadcast(msg, exceptId) { const s = JSON.stringify(msg); for (const m of this.members) if (m.id !== exceptId) this.send(m, s); }
  pushRoster() { this.broadcast({ t: 'roster', roster: this.roster(), started: this.started }); }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname.endsWith('/peek')) {
      const host = this.members.find((m) => m.id === this.hostId);
      return Response.json({ open: this.open, drivers: this.members.length, started: this.started, host: host?.name ?? null }, { headers: CORS });
    }
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('Expected a WebSocket', { status: 426, headers: CORS });

    const id = clean(url.searchParams.get('id'), 24);
    const name = clean(url.searchParams.get('name'), 14) || 'Driver';
    const create = url.searchParams.get('create') === '1';
    const [client, server] = Object.values(new WebSocketPair());
    server.accept();
    const refuse = (code) => { server.send(JSON.stringify({ t: 'err', code })); server.close(4000, code); return new Response(null, { status: 101, webSocket: client }); };

    if (!id) return refuse('bad');
    let me = this.members.find((m) => m.id === id);
    if (me) {
      // the same driver coming back (lost signal, app switched): take over their spot
      clearTimeout(me.awayTimer);
      try { me.ws?.close(4001, 'replaced'); } catch { /* gone */ }
      me.ws = server; me.away = false; me.name = name || me.name;
    } else {
      if (create && this.open && this.members.length) return refuse('taken');
      if (!create && !this.open) return refuse('nostand');
      if (this.members.length >= MAX) return refuse('full');
      if (!this.open) { this.reset(); this.open = true; }
      const used = new Set(this.members.map((m) => m.color));
      me = { id, name, color: COLORS.find((c) => !used.has(c)) ?? COLORS[0], ws: server, away: false, joined: Date.now() };
      this.members.push(me);
      if (!this.hostId) this.hostId = id;
    }

    this.send(me, { t: 'welcome', you: { id: me.id, color: me.color }, roster: this.roster(), started: this.started, env: this.env });
    this.broadcast({ t: 'joined', id: me.id }, me.id);
    this.pushRoster();

    server.addEventListener('message', (e) => this.onMessage(me, server, e.data));
    const gone = () => this.onClose(me, server);
    server.addEventListener('close', gone);
    server.addEventListener('error', gone);
    return new Response(null, { status: 101, webSocket: client });
  }

  onMessage(me, ws, raw) {
    if (me.ws !== ws || typeof raw !== 'string' || raw.length > 12000) return;
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    const host = me.id === this.hostId;
    switch (m.t) {
      case 's': this.broadcast({ ...m, from: me.id }, me.id); break;
      case 'chat': this.broadcast({ t: 'chat', from: me.id, text: clean(m.text, 80) }, me.id); break;
      case 'v': {   // voice: only to the drivers the speaker says are close enough to hear
        const to = new Set(Array.isArray(m.to) ? m.to : []);
        const s = JSON.stringify({ t: 'v', from: me.id, d: String(m.d ?? ''), n: m.n | 0, e: m.e ? 1 : 0 });
        for (const o of this.members) if (to.has(o.id)) this.send(o, s);
        break;
      }
      case 'start': if (host) { this.started = true; this.env = m.env ?? null; this.broadcast({ t: 'start', env: this.env }, me.id); this.pushRoster(); } break;
      case 'env': if (host) { this.env = m.env ?? null; this.broadcast({ t: 'env', env: this.env }, me.id); } break;
      case 'req': { const h = this.members.find((o) => o.id === this.hostId); if (h && !host) this.send(h, { t: 'req', k: clean(m.k, 8), from: me.id }); break; }
      case 'bye': this.remove(me); try { ws.close(1000, 'bye'); } catch { /* gone */ } break;
      case 'ping': this.send(me, { t: 'pong' }); break;
    }
  }

  onClose(me, ws) {
    if (me.ws !== ws || !this.members.includes(me)) return;
    me.away = true; me.ws = null;
    this.pushRoster();
    me.awayTimer = setTimeout(() => this.remove(me), AWAY_MS);
  }

  remove(me) {
    clearTimeout(me.awayTimer);
    const i = this.members.indexOf(me);
    if (i < 0) return;
    this.members.splice(i, 1);
    if (!this.members.length) { this.reset(); return; }
    if (this.hostId === me.id) this.hostId = (this.members.find((m) => !m.away) ?? this.members[0]).id;   // the stand carries on
    this.broadcast({ t: 'left', id: me.id, name: me.name });
    this.pushRoster();
  }
}
