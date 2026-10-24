// On-screen controls for phones and tablets. Each finger is tracked on its own, so you can hold
// GAS with one thumb and steer with the other, and slide a thumb from ◀ to ▶ (or BRAKE to GAS)
// without lifting it.
export const TOUCH = document.documentElement.classList.contains('touch');
export const touch = { up: false, down: false, left: false, right: false, brake: false };

const buzz = (ms = 8) => navigator.vibrate?.(ms);

export function initTouch(actions) {
  const root = document.getElementById('touch');
  if (!TOUCH || !root) return;
  const ptrs = new Map();   // pointerId → control key ('up', 'left', … or 'horn')
  const keyBtns = [...root.querySelectorAll('[data-k]')];
  const horn = root.querySelector('[data-act="horn"]');

  const sync = () => {
    for (const k in touch) touch[k] = false;
    for (const k of ptrs.values()) if (k in touch) touch[k] = true;
    for (const b of keyBtns) b.classList.toggle('on', touch[b.dataset.k]);
    horn?.classList.toggle('on', [...ptrs.values()].includes('horn'));
  };
  const keyAt = (x, y) => document.elementFromPoint(x, y)?.closest?.('#touch [data-k]')?.dataset.k;

  root.addEventListener('pointerdown', (e) => {
    const act = e.target.closest('[data-act]');
    if (act) {
      e.preventDefault(); buzz();
      if (act.dataset.act === 'horn') { ptrs.set(e.pointerId, 'horn'); actions.horn(true); sync(); }
      else actions[act.dataset.act]?.();
      return;
    }
    const k = e.target.closest('[data-k]')?.dataset.k;
    if (!k) return;
    e.preventDefault(); buzz();
    ptrs.set(e.pointerId, k); sync();
  });
  // sliding a thumb across to the neighbouring button switches to it; sliding off keeps the last one
  window.addEventListener('pointermove', (e) => {
    const cur = ptrs.get(e.pointerId);
    if (!cur || cur === 'horn') return;
    const k = keyAt(e.clientX, e.clientY);
    if (k && k !== cur) { ptrs.set(e.pointerId, k); buzz(5); sync(); }
  });
  const release = (e) => {
    const k = ptrs.get(e.pointerId);
    if (k === undefined) return;
    ptrs.delete(e.pointerId);
    if (k === 'horn') actions.horn(false);
    sync();
  };
  window.addEventListener('pointerup', release);
  window.addEventListener('pointercancel', release);
  // no scrolling, pinch zoom, long-press menus or text selection while driving
  root.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
  root.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('gesturestart', (e) => e.preventDefault());
}

export function releaseTouch(actions) {
  for (const k in touch) touch[k] = false;
  document.querySelectorAll('#touch .on').forEach((b) => b.classList.remove('on'));
  actions?.horn(false);
}

// Fullscreen + landscape lock where the browser allows it (Android Chrome; iOS just ignores it).
export function goFullscreen() {
  if (!TOUCH) return;
  const el = document.documentElement;
  const req = el.requestFullscreen || el.webkitRequestFullscreen;
  try {
    Promise.resolve(req?.call(el, { navigationUI: 'hide' }))
      .then(() => screen.orientation?.lock?.('landscape'))
      .catch(() => {});
  } catch { /* not allowed */ }
}
