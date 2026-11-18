import { el } from './dom.js';

/** Light, restrained colours: white, silver and a touch of the warm accent. */
const COLORS = ['#ffffff', '#d6d6de', '#b9b9c4', '#e8aa6e', '#f5c98a'];

/**
 * A short burst of confetti, for a moment worth a little celebration (a new badge).
 * It is decoration only: the pieces are hidden from assistive technology, and the
 * meaning is always also given as text by the caller.
 *
 * Returns false, and draws nothing, when the user prefers reduced motion.
 *
 * @param {object} [options]
 * @param {Element|null} [options.anchor] where the burst starts. It is kept inside the visible
 *        window, and starts near the top middle of it if omitted
 * @param {Document} [options.doc]
 * @param {Window} [options.win]
 * @param {number} [options.count]
 * @param {() => number} [options.random] injectable for tests
 * @param {(fn: () => void, ms: number) => unknown} [options.schedule] injectable for tests
 * @returns {boolean} whether anything was drawn
 */
export function celebrate({
  anchor = null,
  doc = document,
  win = window,
  count = 26,
  random = Math.random,
  schedule = setTimeout,
} = {}) {
  if (win.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) return false;

  const width = win.innerWidth || 800;
  const height = win.innerHeight || 600;
  const rect = anchor?.getBoundingClientRect?.();
  const hasBox = rect && rect.width > 0 && rect.height > 0;
  // The burst always starts inside the visible window, even if what it points at has
  // scrolled out of view (a badge further down the page).
  const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
  const x = clamp(hasBox ? rect.left + rect.width / 2 : width / 2, 24, width - 24);
  const y = clamp(hasBox ? rect.top + rect.height / 2 : height / 3, 40, height * 0.75);

  const between = (min, max) => min + random() * (max - min);
  const pieces = Array.from({ length: count }, (_, index) =>
    el('span', {
      class: 'bw-confetti-piece',
      style: [
        `--x:${x.toFixed(0)}px`,
        `--y:${y.toFixed(0)}px`,
        `--dx:${between(-190, 190).toFixed(0)}px`,
        `--dy:${between(-150, 170).toFixed(0)}px`,
        `--rot:${between(-540, 540).toFixed(0)}deg`,
        `--delay:${between(0, 140).toFixed(0)}ms`,
        `--size:${between(6, 11).toFixed(1)}px`,
        `--color:${COLORS[index % COLORS.length]}`,
      ].join(';'),
    }),
  );

  const layer = el('div', { class: 'bw-confetti', 'aria-hidden': 'true' }, pieces);
  doc.body.append(layer);
  schedule(() => layer.remove(), 1800);
  return true;
}
