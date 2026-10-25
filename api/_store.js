// Tiny Redis layer for the analytics functions. It talks to Upstash Redis over REST: set
// KV_REST_API_URL / KV_REST_API_TOKEN (or UPSTASH_REDIS_REST_URL / _TOKEN) on the host, Cloudflare Pages
// (Settings → Variables and secrets) or Vercel. Without them (local `npm run dev`) it uses an in-memory store.
// Cloudflare hands variables to each request instead of process.env, so functions/ passes them in with setEnv.
let extra = {};
export const setEnv = (e) => { extra = e || {}; };
export const env = (k) => extra[k] ?? globalThis.process?.env?.[k];
const creds = () => ({ url: env('KV_REST_API_URL') || env('UPSTASH_REDIS_REST_URL'), token: env('KV_REST_API_TOKEN') || env('UPSTASH_REDIS_REST_TOKEN') });
export const isConfigured = () => { const c = creds(); return !!(c.url && c.token); };

// Run several commands in one round trip; returns each command's result.
export async function pipeline(cmds) {
  if (!cmds.length) return [];
  const { url, token } = creds();
  if (!url || !token) return cmds.map((c) => mem(c));
  const r = await fetch(`${url}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmds),
  });
  if (!r.ok) throw new Error(`redis ${r.status}`);
  return (await r.json()).map((x) => x.result);
}

// Days are counted in India time — that's where most drivers are.
export const dayKey = (ms = Date.now()) => new Date(ms + 5.5 * 3600e3).toISOString().slice(0, 10);

export const json = (data, status = 200, extra = {}) => new Response(JSON.stringify(data), {
  status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...extra },
});

// ---------- in-memory stand-in (dev only) ----------
const db = globalThis.__heyautoMem ??= new Map();
function mem([cmd, key, ...a]) {
  const get = (type) => { if (!db.has(key)) db.set(key, type()); return db.get(key); };
  switch (cmd.toUpperCase()) {
    case 'HINCRBY': case 'HINCRBYFLOAT': { const h = get(() => new Map()); const v = (+h.get(a[0]) || 0) + +a[1]; h.set(a[0], String(v)); return v; }
    case 'HSET': { const h = get(() => new Map()); for (let i = 0; i < a.length; i += 2) h.set(a[i], String(a[i + 1])); return a.length / 2; }
    case 'HGETALL': { const h = db.get(key); return h ? [...h].flat() : []; }
    case 'PFADD': { const s = get(() => new Set()); const n = s.size; a.forEach((x) => s.add(x)); return s.size > n ? 1 : 0; }
    case 'PFCOUNT': { const u = new Set(); for (const k of [key, ...a]) for (const x of db.get(k) ?? []) u.add(x); return u.size; }
    case 'ZADD': { const z = get(() => new Map()); z.set(a[1], +a[0]); return 1; }
    case 'ZCOUNT': { const z = db.get(key); if (!z) return 0; const lo = a[0] === '-inf' ? -Infinity : +a[0], hi = a[1] === '+inf' ? Infinity : +a[1]; return [...z.values()].filter((v) => v >= lo && v <= hi).length; }
    case 'ZREMRANGEBYSCORE': { const z = db.get(key); if (!z) return 0; const hi = +a[1]; let n = 0; for (const [m, v] of z) if (v <= hi) { z.delete(m); n++; } return n; }
    case 'ZREMRANGEBYRANK': { const z = db.get(key); if (!z) return 0; const sorted = [...z].sort((x, y) => x[1] - y[1]); const end = +a[1] < 0 ? sorted.length + +a[1] : +a[1]; sorted.slice(+a[0], end + 1).forEach(([m]) => z.delete(m)); return 0; }
    case 'ZREVRANGE': { const z = db.get(key); if (!z) return []; return [...z].sort((x, y) => y[1] - x[1]).slice(+a[0], +a[1] + 1).map(([m]) => m); }
    case 'EXPIRE': return 1;
    default: throw new Error(`mem: ${cmd} not supported`);
  }
}
