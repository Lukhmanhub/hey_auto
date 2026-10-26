// Hey Auto analytics dashboard. Reads /api/stats and draws everything with plain SVG/HTML.
// local dev reads the live numbers from Cloudflare (add ?local for the in-memory test store)
const LIVE = 'https://hey-auto.pages.dev/heyauto/';
const API = `${import.meta.env.DEV && !new URLSearchParams(location.search).has('local') ? LIVE : import.meta.env.BASE_URL}api/stats`;
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n) => (n >= 1e5 ? `${(n / 1e5).toFixed(n >= 1e6 ? 0 : 1)}L` : n >= 1e4 ? `${(n / 1e3).toFixed(1)}k` : Math.round(n).toLocaleString('en-IN'));
const rupee = (n) => `${n < 0 ? '−' : ''}₹${Math.abs(Math.round(n)).toLocaleString('en-IN')}`;
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
const dur = (sec) => { sec = Math.round(sec || 0); if (sec < 60) return `${sec}s`; const m = Math.floor(sec / 60); return m < 60 ? `${m}m ${sec % 60 ? `${sec % 60}s` : ''}`.trim() : `${Math.floor(m / 60)}h ${m % 60}m`; };
const ago = (ms) => { const s = (Date.now() - ms) / 1000; if (s < 60) return 'just now'; if (s < 3600) return `${Math.floor(s / 60)} min ago`; if (s < 86400) return `${Math.floor(s / 3600)} h ago`; return new Date(ms).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }); };
const flag = (cc) => (/^[A-Z]{2}$/.test(cc) ? String.fromCodePoint(...[...cc].map((c) => 0x1f1a5 + c.charCodeAt(0))) : '🌐');
const COUNTRY = (() => { try { return new Intl.DisplayNames(['en'], { type: 'region' }); } catch { return null; } })();
const countryName = (cc) => { try { return COUNTRY?.of(cc) || cc; } catch { return cc; } };

const LABEL = {
  viol: { red: 'Jumped a red signal', wrongway: 'Wrong way on a one-way', overspeed: 'Over 50 km/h', wrongside: 'Wrong side of the road', footpath: 'Drove on the footpath', crash: 'Hit a vehicle', bump: 'Bumped into things', ped: 'Hit a pedestrian' },
  day: { normal: 'Ordinary day', monsoon: 'Monsoon', hartal: 'Hartal', election: 'Election season', festival: 'Temple festival', christmas: 'Christmas eve' },
  lang: { ml: 'Malayalam only', mlmg: '+ Manglish', all: '+ English' },
  q: { low: 'Low', medium: 'Medium', high: 'High' },
  hud: { '0.85': 'Small', 1: 'Medium', '1.15': 'Large' },
  src: { direct: 'Direct / typed', portfolio: 'lukhmandesigns.com', instagram: 'Instagram', linkedin: 'LinkedIn', google: 'Google', whatsapp: 'WhatsApp', facebook: 'Facebook', twitter: 'X / Twitter' },
  dev: { desktop: 'Desktop', phone: 'Phone', tablet: 'Tablet' },
};
const DEV_ICON = { desktop: '🖥️', phone: '📱', tablet: '📲' };
const COLORS = ['#f7c600', '#4fc27a', '#6fb3ff', '#ff6b5b', '#c792ea', '#ffa94d', '#9a9d8f'];

// the counters for one family ("dev:phone" → { phone: n }), largest first
function group(t, prefix) {
  return Object.entries(t).filter(([k]) => k.startsWith(`${prefix}:`)).map(([k, v]) => [k.slice(prefix.length + 1), v]).sort((a, b) => b[1] - a[1]);
}

// ---------- state ----------
let range = '7';
try { range = localStorage.getItem('heyauto-dash-range') || '7'; } catch { /* ignore */ }
let key = '';
try { key = localStorage.getItem('heyauto-dash-key') || ''; } catch { /* ignore */ }
let timer = null;

document.querySelectorAll('#range button').forEach((b) => b.addEventListener('click', () => {
  range = b.dataset.r;
  try { localStorage.setItem('heyauto-dash-range', range); } catch { /* ignore */ }
  load();
}));

async function load() {
  document.querySelectorAll('#range button').forEach((b) => b.classList.toggle('on', b.dataset.r === range));
  clearTimeout(timer);
  timer = setTimeout(load, 30000);
  let data;
  try {
    const r = await fetch(`${API}?range=${range}`, { headers: key ? { 'x-key': key } : {} });
    if (r.status === 401) return locked();
    data = await r.json();
    if (data.error) throw new Error(data.error);
  } catch (err) {
    if (!$('#app .kpis')) $('#app').innerHTML = `<div class="state"><h2>The meter isn't running</h2>Couldn't reach the analytics API (${esc(err.message)}).</div>`;
    return;
  }
  render(data);
}

function locked() {
  clearTimeout(timer);
  $('#app').innerHTML = `<div class="state"><h2>🔒 Drivers only</h2>Enter the dashboard key (ANALYTICS_KEY on Vercel).<br>
    <form id="keyform"><input id="key" type="password" placeholder="Key" autocomplete="current-password" /><button>Open</button></form></div>`;
  $('#keyform').addEventListener('submit', (e) => {
    e.preventDefault(); key = $('#key').value.trim();
    try { localStorage.setItem('heyauto-dash-key', key); } catch { /* ignore */ }
    load();
  });
}

// ---------- render ----------
function render(d) {
  const t = d.totals;
  const c = (k) => t[`c:${k}`] || 0;
  const visits = c('visit'), starts = c('start'), rides = c('ride');
  const playSec = t.playSec || 0;
  const sessions = d.sessions || [];

  $('#live').classList.toggle('on', d.live > 0);
  $('#live-n').textContent = d.live;
  $('#updated').textContent = `Updated ${new Date(d.generated).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })} · refreshes every 30 s · days in IST`;

  const banner = d.configured ? '' : `<div class="banner"><span>⚠️</span><div>No database connected, so these numbers live in memory and reset. In Cloudflare → Workers &amp; Pages → <b>hey-auto</b> → Settings → Variables and Secrets, add <b>KV_REST_API_URL</b> and <b>KV_REST_API_TOKEN</b> (from Upstash, the same values Vercel had) and deploy again.</div></div>`;

  if (!visits && !sessions.length) {
    $('#app').innerHTML = `${banner}<div class="state"><h2>No riders yet ${range === '1' ? 'today' : 'in this range'}</h2>Share <b>lukhmandesigns.com/heyauto</b> and the first fares will show up here within seconds.</div>`;
    return;
  }

  const series = d.series || [];
  const spark = (k) => series.map((s) => s[k]);
  const player = d.players || 0;
  const goals = c('goal');

  $('#app').innerHTML = `
    ${banner}
    <div class="insights">${insights(d).map((i) => `<div class="insight"><span class="ic">${i[0]}</span><div>${i[1]}</div></div>`).join('')}</div>

    <div class="kpis">
      ${kpi('Visitors', fmt(d.visitors), `${fmt(visits)} visits · ${pct(t['ret:returning'] || 0, visits)}% returning`, spark('visitors'))}
      ${kpi('Players', fmt(player), `${pct(starts, visits)}% of visits start a shift`, spark('players'), true)}
      ${kpi('Avg. time on the road', dur(starts ? playSec / starts : 0), `${dur(playSec)} driven in total`, spark('playSec'))}
      ${kpi('Rides completed', fmt(rides), starts ? `${(rides / starts).toFixed(1)} per shift` : '—', spark('rides'))}
      ${kpi('Hit the ₹800 goal', `${pct(goals, starts)}%`, `${fmt(goals)} shift${goals === 1 ? '' : 's'}`)}
      ${kpi('Fares collected', rupee(t.fareSum || 0), `${rupee(t.fineSum || 0)} lost to fines`)}
    </div>

    <div class="section-title"><h2>Traffic & the funnel</h2><span>who shows up, and how far they drive</span></div>
    <div class="grid">
      <div class="card chart c7"><h3>Visitors and players per day</h3><p class="sub">Unique people · IST days</p>
        <div class="legend"><span><i style="background:#3a4033"></i>Visitors</span><span><i style="background:var(--yellow)"></i>Players</span></div>
        ${daily(series)}</div>
      <div class="card c5"><h3>From link to lakshyam</h3><p class="sub">Sessions that reached each step</p>${funnel(t)}</div>
    </div>

    <div class="section-title"><h2>Who's driving</h2><span>devices, places and where the link came from</span></div>
    <div class="grid">
      <div class="card c4"><h3>Device</h3><p class="sub">${fmt(c('rotate'))} phone visit${c('rotate') === 1 ? '' : 's'} started upright and saw “turn your phone”</p>${donut(group(t, 'dev').map(([k, v]) => [`${DEV_ICON[k] ?? ''} ${LABEL.dev[k] ?? k}`, v]), 'visits')}</div>
      <div class="card c4"><h3>Came from</h3><p class="sub">Referrer, app or ?utm_source</p>${bars(group(t, 'src').map(([k, v]) => [LABEL.src[k] ?? k, v]), 7)}</div>
      <div class="card c4"><h3>Country</h3><p class="sub">From Vercel's edge location</p>${bars(group(t, 'geo').filter(([k]) => k !== 'unknown').map(([k, v]) => [`${flag(k)} ${countryName(k)}`, v]), 7, '#6fb3ff')}</div>
      <div class="card c4"><h3>Operating system</h3>${bars(group(t, 'os'), 6, '#4fc27a')}</div>
      <div class="card c4"><h3>Browser</h3>${bars(group(t, 'br'), 6, '#4fc27a')}</div>
      <div class="card c4"><h3>New vs returning</h3>${donut([['New drivers', t['ret:new'] || 0], ['Came back', t['ret:returning'] || 0]], 'visits')}</div>
    </div>

    <div class="section-title"><h2>Does it run well?</h2><span>loading, frame rate and the hardware it runs on</span></div>
    <div class="grid">
      <div class="card c4"><h3>Time to load the town</h3><p class="sub">Average ${c('loaded') ? `${((t.loadSum || 0) / c('loaded') / 1000).toFixed(1)}s` : '—'} · ${fmt(visits - c('loaded'))} visit${visits - c('loaded') === 1 ? '' : 's'} left before it loaded</p>${hist(order(group(t, 'load')), '#6fb3ff')}</div>
      <div class="card c4"><h3>Frame rate while driving</h3><p class="sub">Average ${c('fps') ? `${Math.round((t.fpsSum || 0) / c('fps'))} fps` : '—'} · 8 s sample per shift</p>${hist(order(group(t, 'fps')), '#4fc27a')}</div>
      <div class="card c4"><h3>Graphics card</h3><p class="sub">${fmt(c('err'))} script error${c('err') === 1 ? '' : 's'} logged</p>${bars(group(t, 'gpu'), 6, '#c792ea')}</div>
      ${c('err') ? `<div class="card c12"><h3>Errors players hit</h3><p class="sub">Most common first</p>${bars(group(t, 'err'), 6, '#ff6b5b')}</div>` : ''}
    </div>

    <div class="section-title"><h2>On the road</h2><span>how people actually play</span></div>
    <div class="grid">
      <div class="card c4"><h3>Passenger ratings</h3>
        <div class="stat-row"><div><small>Average fare</small><b>${rides ? rupee((t.fareSum || 0) / rides) : '—'}</b></div><div><small>Tipped rides</small><b>${pct(c('tipped'), rides)}%</b></div><div><small>Tips</small><b>${rupee(t.tipSum || 0)}</b></div></div>
        ${hist(['1', '1.5', '2', '2.5', '3', '3.5', '4', '4.5', '5'].map((k) => [`${k}★`, t[`rate:${k}`] || 0]), '#f7c600')}</div>
      <div class="card c4"><h3>Traffic rules broken</h3><p class="sub">${fmt(c('viol'))} in total · ${starts ? (c('viol') / starts).toFixed(1) : 0} per shift</p>${bars(group(t, 'viol').map(([k, v]) => [LABEL.viol[k] ?? k, v]), 8, '#ff6b5b')}</div>
      <div class="card c4"><h3>Favourite destinations</h3><p class="sub">Where completed rides ended</p>${bars(group(t, 'dest'), 8)}</div>
      <div class="card c4"><h3>Kind of day</h3><p class="sub">Rolled at the start of each shift</p>${bars(group(t, 'day').map(([k, v]) => [LABEL.day[k] ?? k, v]), 6, '#6fb3ff')}</div>
      <div class="card c4"><h3>Time on the road</h3><p class="sub">Recent shifts${sessions.length >= 300 ? ' (last 300)' : ''}</p>${hist(durations(sessions), '#f7c600')}</div>
      <div class="card c4"><h3>Settings they pick</h3><p class="sub">At the start of a shift</p>
        ${donut(group(t, 'lang').map(([k, v]) => [LABEL.lang[k] ?? k, v]), 'shifts', 'Dialogue')}
        <div style="height:14px"></div>${bars(group(t, 'q').map(([k, v]) => [`Graphics · ${LABEL.q[k] ?? k}`, v]), 3, '#c792ea')}</div>
    </div>

    <div class="section-title"><h2>Recent drivers</h2><span>the latest sessions, anonymous</span></div>
    <div class="card c12">${table(sessions.slice(0, 40))}</div>
  `;
  bindChartTips(series);
}

function kpi(label, value, note, data, hero) {
  return `<div class="card kpi${hero ? ' hero' : ''}"><small>${label}</small><b>${value}</b><span class="note">${note || ''}</span>${data && data.length > 1 ? sparkline(data, hero ? '#f7c600' : '#6b6f62') : ''}</div>`;
}
function sparkline(vals, color) {
  const w = 160, h = 30, max = Math.max(1, ...vals);
  const pts = vals.map((v, i) => [(i / (vals.length - 1)) * w, h - 2 - (v / max) * (h - 4)]);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('');
  return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><path d="${line}L${w},${h}L0,${h}Z" fill="${color}" opacity=".12"/><path d="${line}" fill="none" stroke="${color}" stroke-width="1.6" vector-effect="non-scaling-stroke"/></svg>`;
}

function daily(series) {
  const W = 700, H = 230, L = 34, B = 24, T = 8;
  const max = Math.max(4, ...series.map((s) => s.visitors));
  const nice = Math.ceil(max / 4) * 4;
  const bw = (W - L) / series.length;
  const y = (v) => T + (H - T - B) * (1 - v / nice);
  let g = '';
  for (let i = 0; i <= 4; i++) { const v = (nice / 4) * i; g += `<line class="gridline" x1="${L}" x2="${W}" y1="${y(v)}" y2="${y(v)}"/><text class="axis" x="${L - 8}" y="${y(v) + 4}" text-anchor="end">${fmt(v)}</text>`; }
  const every = Math.ceil(series.length / 8);
  series.forEach((s, i) => {
    const x = L + i * bw, w = Math.max(2, bw * 0.62), off = (bw - w) / 2;
    g += `<rect x="${x + off}" y="${y(s.visitors)}" width="${w}" height="${y(0) - y(s.visitors)}" rx="3" fill="#3a4033"/>`;
    g += `<rect x="${x + off}" y="${y(s.players)}" width="${w}" height="${y(0) - y(s.players)}" rx="3" fill="#f7c600"/>`;
    g += `<rect class="hit" data-i="${i}" x="${x}" y="${T}" width="${bw}" height="${H - T - B}" fill="transparent"/>`;
    if (i % every === 0 || series.length === 1) {
      const dt = new Date(`${s.d}T00:00:00`);
      g += `<text class="axis" x="${x + bw / 2}" y="${H - 6}" text-anchor="middle">${series.length === 1 ? 'Today' : dt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</text>`;
    }
  });
  return `<svg id="daily" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">${g}</svg><div class="tip" id="tip" hidden></div>`;
}
function bindChartTips(series) {
  const tip = $('#tip');
  $('#daily')?.addEventListener('pointermove', (e) => {
    const i = e.target.dataset?.i; if (i === undefined) { tip.hidden = true; return; }
    const s = series[i];
    tip.innerHTML = `<b>${new Date(`${s.d}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}</b><br>${s.visitors} visitors · ${s.players} players<br>${s.rides} rides · ${dur(s.playSec)} driven`;
    tip.hidden = false;
    tip.style.left = `${Math.min(e.clientX + 14, innerWidth - tip.offsetWidth - 8)}px`;
    tip.style.top = `${e.clientY - 10 - tip.offsetHeight}px`;
  });
  $('#daily')?.addEventListener('pointerleave', () => { tip.hidden = true; });
}

const STEPS = [['visit', 'Opened the game'], ['loaded', 'Town finished loading'], ['start', 'Started a shift'], ['pickup', 'Accepted a ride'], ['board', 'Passenger boarded'], ['ride1', 'Collected a first fare'], ['goal', 'Reached the ₹800 goal']];
function funnelSteps(t) { return STEPS.map(([k, l]) => [l, t[`c:${k}`] || 0]); }
function funnel(t) {
  const steps = funnelSteps(t), top = steps[0][1] || 1;
  let worst = -1, worstDrop = 0;
  steps.forEach(([, v], i) => { if (i && steps[i - 1][1]) { const drop = 1 - v / steps[i - 1][1]; if (drop > worstDrop) { worstDrop = drop; worst = i; } } });
  return `<div class="funnel">${steps.map(([l, v], i) => {
    const w = Math.max(v ? 3 : 0, (v / top) * 100);
    const from = i ? (steps[i - 1][1] ? `${pct(v, steps[i - 1][1])}% ↓` : '—') : '100%';
    return `<div class="row${i === worst && worstDrop > 0.25 ? ' worst' : ''}"><span class="lbl">${l}</span><div class="bar"><i style="width:${w}%"></i><em class="${w < 18 ? 'out' : ''}" style="${w < 18 ? `left:calc(${w}% + 8px)` : ''}">${fmt(v)}</em></div><span class="pct">${from}</span></div>`;
  }).join('')}</div>`;
}

function bars(list, n = 6, color) {
  list = list.filter(([, v]) => v > 0);
  if (!list.length) return '<div class="empty">Nothing yet</div>';
  const shown = list.slice(0, n), rest = list.slice(n).reduce((a, [, v]) => a + v, 0);
  if (rest) shown.push([`${list.length - n} more`, rest]);
  const max = Math.max(...shown.map(([, v]) => v)), total = list.reduce((a, [, v]) => a + v, 0);
  return `<div class="bars">${shown.map(([l, v]) => `<div class="row"><span class="lbl" title="${esc(l)}">${esc(l)}</span><span class="val">${fmt(v)} · ${pct(v, total)}%</span><span class="track"><i style="width:${(v / max) * 100}%;${color ? `--c:${color}` : ''}"></i></span></div>`).join('')}</div>`;
}

function donut(list, unit, title) {
  list = list.filter(([, v]) => v > 0);
  if (!list.length) return '<div class="empty">Nothing yet</div>';
  const total = list.reduce((a, [, v]) => a + v, 0), R = 46, C = 2 * Math.PI * R;
  let off = 0;
  const arcs = list.map(([, v], i) => { const len = (v / total) * C; const s = `<circle r="${R}" cx="60" cy="60" fill="none" stroke="${COLORS[i % COLORS.length]}" stroke-width="16" stroke-dasharray="${len} ${C - len}" stroke-dashoffset="${-off}" transform="rotate(-90 60 60)"/>`; off += len; return s; }).join('');
  const lead = list[0];
  return `<div class="donut"><svg viewBox="0 0 120 120">${arcs}<text class="center" x="60" y="62" text-anchor="middle">${pct(lead[1], total)}%</text><text class="center2" x="60" y="77" text-anchor="middle">${esc(title || unit)}</text></svg>
    <ul>${list.map(([l, v], i) => `<li><i style="background:${COLORS[i % COLORS.length]}"></i>${esc(l)}<span>${fmt(v)}</span></li>`).join('')}</ul></div>`;
}

// buckets like "3–6s" come back unordered; sort by their lower bound
function order(list) { return list.map(([k, v]) => [k, v, parseFloat(k)]).sort((a, b) => a[2] - b[2]).map(([k, v]) => [k, v]); }
function hist(list, color) {
  if (!list.some(([, v]) => v)) return '<div class="empty">Nothing yet</div>';
  const max = Math.max(...list.map(([, v]) => v));
  return `<div class="hist">${list.map(([l, v]) => `<div class="col"><b>${v ? fmt(v) : ''}</b><i style="height:${(v / max) * 82}%;--c:${color}"></i><small>${esc(l)}</small></div>`).join('')}</div>`;
}
function durations(sessions) {
  const edges = [[60, '<1m'], [180, '1–3m'], [300, '3–5m'], [600, '5–10m'], [1200, '10–20m'], [Infinity, '20m+']];
  const counts = edges.map(([, l]) => [l, 0]);
  for (const s of sessions) { if (!s.started) continue; const i = edges.findIndex(([e]) => (s.dur || 0) < e); counts[i][1]++; }
  return counts;
}

function table(rows) {
  if (!rows.length) return '<div class="empty">No sessions yet</div>';
  return `<div class="table-wrap"><table><thead><tr><th>When</th><th>Device</th><th>Place</th><th>Came from</th><th class="n">Played</th><th class="n">Rides</th><th class="n">Net</th><th class="n">FPS</th><th>Status</th></tr></thead><tbody>
  ${rows.map((s) => {
    const status = s.goal ? '<span class="pill g">Goal ✓</span>' : s.started ? (Date.now() - (s.last || 0) < 45000 ? '<span class="pill y">Driving</span>' : '<span class="pill">Played</span>') : '<span class="pill">Left at title</span>';
    const place = s.geo && s.geo !== 'unknown' ? `${flag(s.geo)} ${s.city && s.city !== 'unknown' ? esc(s.city) : esc(countryName(s.geo))}` : '—';
    return `<tr><td>${ago(s.ts)}</td><td>${DEV_ICON[s.dev] ?? ''} ${esc(s.os)} · ${esc(s.br)}</td><td>${place}</td><td>${esc(LABEL.src[s.src] ?? s.src ?? '—')}</td>
      <td class="n">${s.started ? dur(s.dur) : '—'}</td><td class="n">${s.started ? s.rides ?? 0 : '—'}</td>
      <td class="n ${s.net < 0 ? 'neg' : s.net > 0 ? 'pos' : ''}">${s.started && s.net !== undefined ? rupee(s.net) : '—'}</td><td class="n">${s.fps ?? '—'}</td><td>${status}</td></tr>`;
  }).join('')}</tbody></table></div>`;
}

// a few plain-language takeaways, the way a PM would read the numbers
function insights(d) {
  const t = d.totals, c = (k) => t[`c:${k}`] || 0, out = [];
  const steps = funnelSteps(t);
  let worst = null;
  for (let i = 1; i < steps.length; i++) if (steps[i - 1][1] >= 5) { const drop = 1 - steps[i][1] / steps[i - 1][1]; if (!worst || drop > worst.drop) worst = { drop, from: steps[i - 1][0], to: steps[i][0] }; }
  if (worst && worst.drop > 0.2) out.push(['🚧', `Biggest drop-off: <b>${Math.round(worst.drop * 100)}%</b> don't get from “${worst.from.toLowerCase()}” to “${worst.to.toLowerCase()}”.`]);
  const devs = Object.fromEntries(group(t, 'dev'));
  const mob = (devs.phone || 0) + (devs.tablet || 0);
  if (c('visit') >= 5) out.push(['📱', `<b>${pct(mob, c('visit'))}%</b> of visits are on a phone or tablet.`]);
  const slow = group(t, 'load').filter(([k]) => parseFloat(k) >= 10).reduce((a, [, v]) => a + v, 0);
  if (c('loaded') >= 5 && slow / c('loaded') > 0.15) out.push(['🐢', `<b>${pct(slow, c('loaded'))}%</b> waited 10 s or more for the town to load.`]);
  const lowFps = group(t, 'fps').filter(([k]) => parseFloat(k) < 30).reduce((a, [, v]) => a + v, 0);
  if (c('fps') >= 5 && lowFps / c('fps') > 0.2) out.push(['🎞️', `<b>${pct(lowFps, c('fps'))}%</b> of shifts run under 30 fps — a lower default graphics level could help.`]);
  const topViol = group(t, 'viol')[0];
  if (topViol && c('start') >= 3) out.push(['📸', `Most common offence: <b>${LABEL.viol[topViol[0]] ?? topViol[0]}</b> (${fmt(topViol[1])} times).`]);
  const src = group(t, 'src')[0];
  if (src && c('visit') >= 5) out.push(['🔗', `Top source: <b>${esc(LABEL.src[src[0]] ?? src[0])}</b> brings ${pct(src[1], c('visit'))}% of visits.`]);
  if (!out.length) out.push(['🛺', `Collecting fares… insights appear once a few more people have played.`]);
  return out.slice(0, 4);
}

load();
