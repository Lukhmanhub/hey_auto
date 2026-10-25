// The auto stand lobby: make a stand (get a code + link) or join one, see who's in, start the shift.
import { Multiplayer, MAX, HEAR, cleanCode, codeFromUrl } from './multiplayer.js';
import { TOUCH } from './touch.js';

const $ = (id) => document.getElementById(id);
const NAMES = ['Babu', 'Shaji', 'Rajan', 'Suni', 'Mani', 'Joby', 'Anu', 'Divya', 'Sabu', 'Reji', 'Lissy', 'Biju'];

export function initLobby({ mp, track, onShift, startEnv }) {
  const lobby = $('lobby'), title = $('title');
  const nameIn = $('lb-name'), codeIn = $('lb-code'), err = $('lb-err');
  const go = $('lb-go'), hint = $('lb-hint');
  let busy = false, envOnJoin = null, shown = new Set();

  try { nameIn.value = localStorage.getItem('heyauto-name') || ''; } catch { /* private mode */ }
  if (!nameIn.value) nameIn.value = NAMES[Math.floor(Math.random() * NAMES.length)];
  const name = () => {
    const n = nameIn.value.trim().slice(0, 14) || 'Driver';
    try { localStorage.setItem('heyauto-name', n); } catch { /* private mode */ }
    return n;
  };

  const show = (on) => { lobby.hidden = !on; title.hidden = on; };
  const room = (on) => { $('lb-choose').hidden = on; $('lb-room').hidden = !on; err.textContent = ''; };
  const setBusy = (b, btn, label) => {
    busy = b;
    for (const id of ['lb-create', 'lb-join']) $(id).disabled = b;
    if (btn) btn.textContent = label;
  };

  $('mp-open').addEventListener('click', () => { show(true); room(!!mp.active); });
  $('lb-back').addEventListener('click', () => {
    if (mp.active) { mp.leave(); shown = new Set(); room(false); return; }
    show(false);
  });
  codeIn.addEventListener('input', () => { codeIn.value = cleanCode(codeIn.value); });
  codeIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') $('lb-join').click(); });

  $('lb-create').addEventListener('click', async () => {
    if (busy) return;
    setBusy(true, $('lb-create'), 'Opening stand…');
    mp.audio();   // unlock audio for voice while we have the tap
    try {
      await mp.create(name());
      track('mp', { k: 'create' });
      room(true);
    } catch (e) {
      err.textContent = netError(e);
    }
    setBusy(false, $('lb-create'), 'Create stand');
  });

  $('lb-join').addEventListener('click', async () => {
    if (busy) return;
    const code = cleanCode(codeIn.value);
    if (code.length !== 5) { err.textContent = 'Stand codes have 5 letters and numbers.'; codeIn.focus(); return; }
    setBusy(true, $('lb-join'), 'Joining…');
    mp.audio();
    try {
      const w = await mp.join(code, name());
      track('mp', { k: 'join' });
      envOnJoin = w.env;
      room(true);
    } catch (e) {
      err.textContent = netError(e);
    }
    setBusy(false, $('lb-join'), 'Join');
  });

  $('lb-copy').addEventListener('click', () => copy($('lb-copy')));
  $('lb-sharebtn').addEventListener('click', async () => {
    const data = { title: 'Hey Auto · ഹേ ഓട്ടോ', text: `Drive with me in Hey Auto! Join my auto stand: ${mp.code}`, url: mp.link };
    if (navigator.share) { try { await navigator.share(data); return; } catch (e) { if (e.name === 'AbortError') return; } }
    copy($('lb-sharebtn'));
  });
  if (!navigator.share) $('lb-sharebtn').hidden = true;
  async function copy(btn) {
    const old = btn.textContent;
    try { await navigator.clipboard.writeText(mp.link); btn.textContent = 'Copied!'; } catch { prompt('Copy this link', mp.link); }
    setTimeout(() => { btn.textContent = old; }, 1600);
  }

  go.addEventListener('click', () => {
    if (mp.host) {
      const env = startEnv();
      mp.startShift(env);
      track('mp', { k: 'start', n: mp.roster.length });
      show(false); lobby.hidden = true; title.hidden = true;
      onShift(env);
    } else if (mp.started) {
      show(false); title.hidden = true;
      onShift(envOnJoin ?? {});
    }
  });

  // keep the room view current: new drivers slide in with a chime, the host's button counts them
  const render = () => {
    if (!mp.active || lobby.hidden) return;
    $('lb-codeval').textContent = mp.code;
    const list = $('lb-list');
    list.textContent = '';
    let arrived = false;
    for (let k = 0; k < MAX; k++) {
      const m = mp.roster[k];
      const li = document.createElement('li');
      if (m) {
        const dot = document.createElement('i'); dot.style.background = m.color;
        const em = document.createElement('em');
        const you = m.id === mp.me.id;
        em.textContent = m.away ? 'lost signal…' : m.host ? (you ? 'You · host' : 'Stand host') : you ? 'You' : 'Joined';
        li.append(dot, document.createTextNode(m.name), em);
        if (m.away) li.classList.add('away');
        if (!shown.has(m.id)) { shown.add(m.id); if (shown.size > 1 && !you) { li.classList.add('new'); arrived = true; } }
      } else { li.className = 'empty'; li.textContent = 'Waiting for a driver…'; }
      list.appendChild(li);
    }
    if (arrived) mp.chirp(true, 0.06);
    const n = mp.roster.length, voice = `Hold ${TOUCH ? 'TALK' : 'V'} to talk to drivers within ${HEAR} m.`;
    if (mp.host) {
      go.hidden = false;
      go.textContent = n > 1 ? `Start shift together · ${n} drivers` : 'Start shift alone (friends can join later)';
      hint.classList.remove('lb-wait');
      hint.textContent = n > 1 ? `${n} of ${MAX} drivers at the stand. Start when everyone's in. ${voice}` : `Send the code or link to your friends; you'll see them arrive here. ${voice}`;
    } else {
      go.hidden = !mp.started;
      go.textContent = 'Drive now · the shift has started';
      hint.classList.toggle('lb-wait', !mp.started);
      hint.textContent = mp.started ? `${mp.hostName}'s shift is on, hop in. ${voice}` : `Waiting for ${mp.hostName || 'the host'} to start the shift`;
    }
  };
  mp.on('roster', render);
  mp.on('start', (env) => { envOnJoin = env; render(); });
  mp.on('closed', () => {
    if (!lobby.hidden) { shown = new Set(); room(false); err.textContent = 'Lost the connection to the stand. Try joining again.'; }
  });

  // a shared link: open straight into the join box
  const linked = codeFromUrl();
  return {
    ready() {
      $('mp-open').disabled = false;
      if (!linked) return;
      codeIn.value = linked;
      show(true); room(false);
      err.textContent = '';
      hint.textContent = '';
      // say whose stand this is before they join
      const peek = $('lb-peek');
      peek.textContent = 'Looking up the stand…';
      Multiplayer.peek(linked).then((p) => {
        if (!p) { peek.textContent = ''; return; }
        if (!p.open) { peek.textContent = `Stand ${linked} isn’t open any more. Ask your friend for a new link, or start your own.`; return; }
        peek.textContent = `${p.host}’s stand · ${p.drivers} driver${p.drivers > 1 ? 's' : ''} in${p.started ? ' · shift already on' : ''}. Add your name and tap Join.`;
      });
      $('lb-join').focus();
    },
  };
}

function netError(e) {
  const t = e?.type;
  if (t === 'browser-incompatible') return 'This browser can’t do multiplayer. Try Chrome or Safari.';
  if (t === 'network' || t === 'server-error' || t === 'socket-error' || t === 'socket-closed') return 'Couldn’t reach the stand server. Check your internet and try again.';
  return e?.message || 'Something went wrong. Try again.';
}
