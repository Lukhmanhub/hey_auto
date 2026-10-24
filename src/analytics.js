// Anonymous play analytics: no cookies, no names, nothing typed. A random id in localStorage tells
// a returning visitor from a new one; everything else is counts (device, how far they got, rides, fines).
// Events are batched and sent with sendBeacon to the hey-auto Vercel function (api/t.js), which keeps
// daily totals. The dashboard lives at lukhmandesigns.com/heyauto/analytics.
const local = /^(localhost|127\.|192\.168\.|10\.)/.test(location.hostname);
const params = new URLSearchParams(location.search);
// Only plays on the portfolio (lukhmandesigns.com/heyauto) count — not the raw hey-auto.vercel.app
// address, local dev or automated browsers. Add ?track=1 to force it for testing.
const portfolio = /(^|\.)lukhmandesigns\.com$/.test(location.hostname);
const OFF = params.has('notrack') || (!params.has('track') && (!portfolio || navigator.webdriver));
// straight to the game's own Vercel project, so its edge sees the player's country (not the portfolio proxy's)
const ENDPOINT = local ? `${import.meta.env.BASE_URL}api/t` : 'https://hey-auto.vercel.app/api/t';

const rid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
let visitor = null, returning = false;
try {
  visitor = localStorage.getItem('heyauto-vid');
  returning = !!visitor;
  if (!visitor) { visitor = rid(); localStorage.setItem('heyauto-vid', visitor); }
} catch { visitor = rid(); }
const session = rid();

let queue = [];
const once = new Set();
function send(useBeacon) {
  if (OFF || !queue.length) return;
  const body = JSON.stringify({ v: visitor, s: session, e: queue.splice(0, 40) });
  if (useBeacon && navigator.sendBeacon?.(ENDPOINT, body)) return;
  fetch(ENDPOINT, { method: 'POST', body, keepalive: true }).catch(() => {});
}
export function track(type, data = {}, onlyOnce = false) {
  if (onlyOnce) { if (once.has(type)) return; once.add(type); }
  queue.push({ t: type, ...data });
  clearTimeout(track.timer);
  track.timer = setTimeout(send, type === 'visit' ? 0 : 3000);
}

function device() {
  const touch = document.documentElement.classList.contains('touch');
  if (!touch) return 'desktop';
  return /iPhone|iPod|Mobi/i.test(navigator.userAgent) || Math.min(innerWidth, innerHeight) < 500 ? 'phone' : 'tablet';
}
function os(ua) {
  if (/iPhone|iPod/.test(ua)) return 'iOS';
  if (/iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'iPadOS';
  if (/Android/.test(ua)) return 'Android';
  if (/Windows/.test(ua)) return 'Windows';
  if (/Mac OS X/.test(ua)) return 'macOS';
  if (/CrOS/.test(ua)) return 'ChromeOS';
  if (/Linux/.test(ua)) return 'Linux';
  return 'Other';
}
function browser(ua) {
  if (/Instagram/.test(ua)) return 'Instagram app';
  if (/FBAN|FBAV/.test(ua)) return 'Facebook app';
  if (/LinkedInApp/.test(ua)) return 'LinkedIn app';
  if (/SamsungBrowser/.test(ua)) return 'Samsung';
  if (/Edg\//.test(ua)) return 'Edge';
  if (/OPR\//.test(ua)) return 'Opera';
  if (/Firefox|FxiOS/.test(ua)) return 'Firefox';
  if (/CriOS|Chrome\//.test(ua)) return navigator.brave ? 'Brave' : 'Chrome';
  if (/Safari/.test(ua)) return 'Safari';
  return 'Other';
}
function source(ua) {
  const utm = params.get('utm_source') || params.get('ref');
  if (utm) return utm.toLowerCase().slice(0, 24);
  if (/Instagram/.test(ua)) return 'instagram';
  if (/LinkedInApp/.test(ua)) return 'linkedin';
  let host = '', path = '';
  try { const u = new URL(document.referrer); host = u.hostname.replace(/^www\./, ''); path = u.pathname; } catch { /* no referrer */ }
  if (!host) return 'direct';
  // a click on the portfolio's "Play Hey Auto" card arrives from the same site
  if (host === location.hostname.replace(/^www\./, '')) return path.startsWith('/heyauto') ? 'direct' : 'portfolio';
  if (/lukhmandesigns/.test(host)) return 'portfolio';
  for (const k of ['instagram', 'linkedin', 'google', 'whatsapp', 'facebook', 'twitter', 'x.com', 't.co', 'reddit', 'behance', 'dribbble', 'youtube', 'bing', 'duckduckgo']) {
    if (host.includes(k)) return k === 'x.com' || k === 't.co' ? 'twitter' : k;
  }
  return host.slice(0, 24);
}
function gpu(renderer) {
  try {
    const gl = renderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const s = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    const m = /Apple M\d( (Pro|Max|Ultra))?|Apple GPU|Adreno[^,)]*?\d+|Mali-[A-Z]?\d+|PowerVR|Intel[^,(]*?(Iris|UHD|HD)[^,(]*?\d*|NVIDIA GeForce [A-Z]+ ?\d+|GeForce [A-Z]+ ?\d+|Radeon[^,(]*|SwiftShader|llvmpipe/i.exec(s);
    return (m ? m[0] : s || 'unknown').replace(/\s+/g, ' ').trim().slice(0, 32);
  } catch { return 'unknown'; }
}

// ---------- session lifecycle ----------
const t0 = performance.now();
let playing = false, paused = false, playSec = 0, lastBeat = 0, stats = () => ({});
export function initAnalytics({ renderer, getStats }) {
  stats = getStats;
  const ua = navigator.userAgent;
  track('visit', {
    dev: device(), os: os(ua), br: browser(ua), src: source(ua), ret: returning ? 1 : 0,
    host: location.hostname.replace(/^www\./, '').slice(0, 32),
    tz: (Intl.DateTimeFormat().resolvedOptions().timeZone || '').slice(0, 32),
    lang: (navigator.language || '').slice(0, 8),
    scr: `${Math.round(Math.max(screen.width, screen.height) / 100) * 100}`,
    gpu: gpu(renderer),
  });
  if (document.documentElement.classList.contains('touch') && matchMedia('(orientation: portrait)').matches) track('rotate', {}, true);
  window.addEventListener('error', (e) => track('err', { m: String(e.message || 'error').slice(0, 80) }));
  window.addEventListener('unhandledrejection', (e) => track('err', { m: String(e.reason?.message || e.reason || 'rejection').slice(0, 80) }));
  // count play time in small slices, so a closed tab never loses more than a few seconds
  setInterval(beat, 15000);
  document.addEventListener('visibilitychange', () => { if (document.hidden) { beat(); send(true); } });
  window.addEventListener('pagehide', () => { beat(true); send(true); });
}
export const loaded = () => track('loaded', { ms: Math.round(performance.now() - t0) }, true);
export function started(settings) {
  playing = true; lastBeat = performance.now();
  track('start', { q: settings.quality, l: settings.lang, hud: String(settings.scale) }, true);
  measureFps();
}
export function setPlaying(on) { if (on === !paused) return; beat(); paused = !on; lastBeat = performance.now(); }
function beat(final) {
  if (!playing) return;
  const now = performance.now();
  const sec = paused || document.hidden ? 0 : Math.min(60, Math.round((now - lastBeat) / 1000));
  lastBeat = now;
  playSec += sec;
  if (sec > 0 || final) track('beat', { sec, tot: playSec, end: final ? 1 : 0, ...stats() });
}

// average frame rate over 8 seconds of real driving, once per session
function measureFps() {
  let n = 0; const start = performance.now() + 3000;
  const tick = (t) => {
    if (t < start) return requestAnimationFrame(tick);
    n++;
    if (t - start < 8000) return requestAnimationFrame(tick);
    track('fps', { fps: Math.round(n / ((t - start) / 1000)) }, true);
  };
  requestAnimationFrame(tick);
}
