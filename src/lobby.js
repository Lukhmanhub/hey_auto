// The auto stand lobby: make a stand (get a code + link) or join one, see who's in, start the shift.
import { MAX, HEAR, cleanCode, codeFromUrl } from './multiplayer.js';
import { TOUCH } from './touch.js';

const $ = (id) => document.getElementById(id);
const NAMES = ['Babu', 'Shaji', 'Rajan', 'Suni', 'Mani', 'Joby', 'Anu', 'Divya', 'Sabu', 'Reji', 'Lissy', 'Biju'];

export function initLobby({ mp, track, onShift, startEnv }) {
  const lobby = $('lobby'), title = $('title');
  const nameIn = $('lb-name'), codeIn = $('lb-code'), err = $('lb-err');
  const go = $('lb-go'), hint = $('lb-hint');
  let busy = false, envOnJoin = null;

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
    if (mp.active) { mp.leave(); room(false); return; }
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
    setBusy(true, $('lb-join'), '…');
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

  // keep the room view current
  const render = () => {
    if (!mp.active) return;
    $('lb-codeval').textContent = mp.code;
    const list = $('lb-list');
    list.textContent = '';
    for (let k = 0; k < MAX; k++) {
      const m = mp.roster[k];
      const li = document.createElement('li');
      if (m) {
        const dot = document.createElement('i'); dot.style.background = m.color;
        const em = document.createElement('em'); em.textContent = m.host ? 'Stand host' : m.id === mp.me.id ? 'You' : '';
        if (m.host && m.id === mp.me.id) em.textContent = 'You · host';
        li.append(dot, document.createTextNode(m.name), em);
      } else { li.className = 'empty'; li.textContent = 'Waiting for a driver…'; }
      list.appendChild(li);
    }
    const hostName = mp.roster.find((m) => m.host)?.name ?? 'the host';
    const voice = `Hold ${TOUCH ? 'TALK' : 'V'} to talk to drivers within ${HEAR} m.`;
    if (mp.host) {
      go.hidden = false; go.textContent = mp.roster.length > 1 ? `Start shift together · ${mp.roster.length} drivers` : 'Start shift (friends can join later)';
      hint.textContent = `Send the code or link to your friends. ${voice}`;
    } else {
      go.hidden = !mp.started;
      go.textContent = 'Drive now · the shift has started';
      hint.textContent = mp.started ? `${hostName}'s shift is already on, hop in. ${voice}` : `Waiting for ${hostName} to start the shift… ${voice}`;
    }
  };
  mp.on('roster', render);
  mp.on('start', (env) => { envOnJoin = env; render(); });
  mp.on('closed', () => {
    if (!lobby.hidden) { room(false); err.textContent = 'The stand closed: the host left.'; }
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
