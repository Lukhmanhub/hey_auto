// The size of the game's screen. On phones window.innerWidth/innerHeight shrink while the page is
// zoomed (a quick double tap on a pedal can zoom iOS Safari for a moment); the root element's client
// size is the real screen and doesn't change with zoom.
export function viewSize() {
  const d = document.documentElement;
  return [d.clientWidth || window.innerWidth, d.clientHeight || window.innerHeight];
}
