// Read side for the analytics dashboard (analytics.html). If ANALYTICS_KEY is set on Vercel, the
// dashboard must send it (it asks once and remembers it); without it the numbers are open to anyone.
import { pipeline, dayKey, json, configured } from './_store.js';

const toObj = (arr) => { const o = {}; for (let i = 0; i < (arr?.length ?? 0); i += 2) o[arr[i]] = +arr[i + 1] || 0; return o; };
const merge = (into, h) => { for (const k in h) into[k] = (into[k] || 0) + h[k]; return into; };

export async function GET(request) {
  const url = new URL(request.url);
  const KEY = process.env.ANALYTICS_KEY;
  if (KEY && (request.headers.get('x-key') || url.searchParams.get('key')) !== KEY) return json({ error: 'locked' }, 401);

  const range = url.searchParams.get('range') || '7';
  const now = Date.now();
  const span = range === 'all' ? 30 : Math.max(1, Math.min(90, +range || 7));   // the daily chart shows at most 90 days
  const days = Array.from({ length: span }, (_, i) => dayKey(now - (span - 1 - i) * 86400e3));

  try {
    const cmds = [];
    for (const d of days) cmds.push(['HGETALL', `h:${d}`], ['PFCOUNT', `u:${d}`], ['PFCOUNT', `p:${d}`]);
    const uKeys = range === 'all' ? ['u:all'] : days.map((d) => `u:${d}`);
    const pKeys = range === 'all' ? ['p:all'] : days.map((d) => `p:${d}`);
    cmds.push(['PFCOUNT', ...uKeys], ['PFCOUNT', ...pKeys], ['HGETALL', 'h:all'],
      ['ZCOUNT', 'live', now - 45000, '+inf'], ['ZREVRANGE', 'recent', 0, 299]);
    const res = await pipeline(cmds);

    const series = days.map((d, i) => {
      const h = toObj(res[i * 3]);
      return { d, visitors: res[i * 3 + 1] || 0, players: res[i * 3 + 2] || 0, visits: h['c:visit'] || 0, rides: h['c:ride'] || 0, playSec: h.playSec || 0, h };
    });
    const base = days.length * 3;
    const totals = range === 'all' ? toObj(res[base + 2]) : series.reduce((t, s) => merge(t, s.h), {});
    const sids = res[base + 4] || [];

    // the most recent sessions (inside the range) for the table and the play-time spread
    const sres = await pipeline(sids.map((s) => ['HGETALL', `s:${s}`]));
    const since = range === 'all' ? 0 : now - span * 86400e3;
    const sessions = [];
    for (let i = 0; i < sids.length; i++) {
      const arr = sres[i] || []; const s = {};
      for (let j = 0; j < arr.length; j += 2) s[arr[j]] = arr[j + 1];
      if (!s.ts || +s.ts < since) continue;
      for (const k of ['ts', 'last', 'dur', 'rides', 'net', 'fines', 'load', 'fps', 'started', 'goal', 'ret']) if (k in s) s[k] = +s[k];
      sessions.push(s);
    }

    return json({
      configured, range, generated: now,
      live: res[base + 3] || 0,
      visitors: res[base] || 0,
      players: res[base + 1] || 0,
      totals,
      series: series.map(({ h, ...s }) => s),
      sessions,
    });
  } catch (err) {
    return json({ error: String(err.message) }, 500);
  }
}
