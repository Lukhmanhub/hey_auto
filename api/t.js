// Collects the game's anonymous events (src/analytics.js) into daily counters.
//   h:<day> / h:all   hash of counters ("c:visit", "dev:phone", "fine:red", "fareSum" …)
//   u:<day> / u:all   unique visitors (HyperLogLog)    p:<day> / p:all   unique players
//   s:<session>       one session's summary            recent / live     sorted sets by time
import { pipeline, dayKey, json } from './_store.js';

const YEAR = 400 * 86400;
const str = (v, n = 40) => String(v ?? '').replace(/[\r\n:]+/g, ' ').trim().slice(0, n) || 'unknown';
const num = (v, max) => Math.max(0, Math.min(max, Math.round(+v || 0)));
const bucket = (v, edges, unit = '') => {
  for (let i = 0; i < edges.length; i++) if (v < edges[i]) return `${i ? edges[i - 1] : 0}–${edges[i]}${unit}`;
  return `${edges[edges.length - 1]}+${unit}`;
};
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' };

export function OPTIONS() { return new Response(null, { status: 204, headers: CORS }); }

export async function POST(request) {
  let body;
  try { body = JSON.parse(await request.text()); } catch { return json({ ok: false }, 400, CORS); }
  const vid = str(body?.v, 20), sid = str(body?.s, 20);
  const events = Array.isArray(body?.e) ? body.e.slice(0, 40) : [];
  if (vid === 'unknown' || sid === 'unknown' || !events.length) return json({ ok: false }, 400, CORS);

  const now = Date.now(), D = dayKey(now);
  const geo = str(request.headers.get('x-vercel-ip-country'), 4);
  let city = 'unknown';
  try { city = str(decodeURIComponent(request.headers.get('x-vercel-ip-city') || ''), 32); } catch { /* bad encoding */ }

  const cmds = [];
  const inc = (field, by = 1) => { if (!by) return; for (const h of [`h:${D}`, 'h:all']) cmds.push(['HINCRBY', h, field, Math.round(by)]); };
  const sess = (...kv) => cmds.push(['HSET', `s:${sid}`, ...kv.map(String)]);

  for (const e of events) {
    switch (e?.t) {
      case 'visit': {
        inc('c:visit');
        inc(e.ret ? 'ret:returning' : 'ret:new');
        for (const k of ['dev', 'os', 'br', 'src', 'host', 'tz', 'gpu', 'scr']) inc(`${k}:${str(e[k], 32)}`);
        inc(`geo:${geo}`);
        cmds.push(['PFADD', `u:${D}`, vid], ['PFADD', 'u:all', vid]);
        sess('ts', now, 'last', now, 'dev', str(e.dev), 'os', str(e.os), 'br', str(e.br), 'src', str(e.src), 'geo', geo, 'city', city, 'ret', e.ret ? 1 : 0, 'gpu', str(e.gpu, 32));
        cmds.push(['ZADD', 'recent', now, sid]);
        break;
      }
      case 'rotate': inc('c:rotate'); break;
      case 'loaded': { const ms = num(e.ms, 600000); inc('c:loaded'); inc('loadSum', ms); inc(`load:${bucket(ms / 1000, [3, 6, 10, 20, 40], 's')}`); sess('load', ms); break; }
      case 'start':
        inc('c:start');
        inc(`q:${str(e.q)}`); inc(`lang:${str(e.l)}`); inc(`hud:${str(e.hud)}`);
        cmds.push(['PFADD', `p:${D}`, vid], ['PFADD', 'p:all', vid]);
        sess('started', 1, 'q', str(e.q));
        break;
      case 'day': inc(`day:${str(e.k)}`); break;
      case 'pickup': inc('c:pickup'); break;
      case 'board': inc('c:board'); break;
      case 'ride': {
        const fare = num(e.fare, 5000), tip = num(e.tip, 500);
        inc('c:ride'); inc('fareSum', fare); inc('tipSum', tip); if (tip) inc('c:tipped');
        inc(`rate:${Math.min(5, Math.max(1, Math.round((+e.r || 0) * 2) / 2))}`);
        inc(`dest:${str(e.d, 32)}`);
        if (num(e.n, 999) === 1) inc('c:ride1');
        break;
      }
      case 'goal': inc('c:goal'); sess('goal', 1); break;
      case 'fine': inc('c:viol'); inc(`viol:${str(e.k, 16)}`); inc('fineSum', num(e.amt, 1000)); break;
      case 'set': inc(`set:${str(e.k, 12)}=${str(e.v, 12)}`); break;
      case 'fps': { const f = num(e.fps, 240); inc('c:fps'); inc('fpsSum', f); inc(`fps:${bucket(f, [20, 30, 45, 58], ' fps')}`); sess('fps', f); break; }
      case 'mp': inc(`mp:${str(e.k, 12)}`); break;
      case 'err': inc('c:err'); inc(`err:${str(e.m, 60)}`); break;
      case 'beat': {
        const sec = num(e.sec, 60);
        inc('playSec', sec);
        sess('last', now, 'dur', num(e.tot, 86400), 'rides', num(e.rides, 999), 'net', Math.round(Math.max(-99999, Math.min(99999, +e.net || 0))), 'fines', num(e.fines, 99999));
        if (!e.end) cmds.push(['ZADD', 'live', now, sid]);
        break;
      }
      default: break;
    }
  }
  cmds.push(
    ['EXPIRE', `h:${D}`, YEAR], ['EXPIRE', `u:${D}`, YEAR], ['EXPIRE', `p:${D}`, YEAR], ['EXPIRE', `s:${sid}`, 90 * 86400],
    ['ZREMRANGEBYSCORE', 'live', '-inf', now - 60000],
    ['ZREMRANGEBYRANK', 'recent', 0, -1001],   // keep the newest 1000 sessions
  );
  try { await pipeline(cmds); } catch (err) { return json({ ok: false, error: String(err.message) }, 500, CORS); }
  return json({ ok: true }, 200, CORS);
}
