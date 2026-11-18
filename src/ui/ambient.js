import { el } from './dom.js';

/**
 * The ambient background and the pointer-driven depth effects (see ambient.css).
 *
 * Scroll parallax needs no JavaScript at all. This module adds only:
 *   1. the background layers (built once, marked aria-hidden),
 *   2. pointer parallax: --px / --py (-1 to 1) on the background, so its layers shift
 *      by their own depth as the pointer moves,
 *   3. a spotlight on cards: --mx / --my (where the pointer is on the card) and
 *      --cx / --cy (-1 to 1 from its centre), set on the card under the pointer only.
 *
 * Updates are batched into one animation frame, nothing is read from or written to
 * the page layout while the pointer is still, and nothing runs for people who prefer
 * reduced motion (the layers then stay static). It never touches storage or the network.
 */

const LAYERS = [
  'bw-glow bw-glow-silver',
  'bw-glow bw-glow-ember',
  'bw-ambient-beam',
  'bw-ambient-grid',
  'bw-ambient-grain',
];

/** Cards that get the spotlight. */
export const SPOTLIGHT_SELECTOR = '.bw-card';

/**
 * @param {object} [options]
 * @param {Document} [options.doc]
 * @param {Window} [options.win]
 * @returns {{element: HTMLElement, destroy: () => void}}
 */
export function mountAmbient({ doc = document, win = window } = {}) {
  const existing = doc.querySelector('.bw-ambient');
  if (existing) existing.remove(); // never stack two backgrounds

  const element = el('div', { class: 'bw-ambient', 'aria-hidden': 'true' }, [
    ...LAYERS.map((classes) => el('div', { class: `bw-ambient-layer ${classes}` })),
    el('div', { class: 'bw-ambient-vignette' }),
  ]);
  doc.body.prepend(element);

  const reducedMotion = win.matchMedia?.('(prefers-reduced-motion: reduce)') ?? null;

  let frame = 0;
  let pending = null; // the latest pointer position waiting for the next frame
  let listening = false;

  function applyFrame() {
    frame = 0;
    if (!pending) return;
    const { x, y, card } = pending;
    pending = null;

    // Pointer parallax for the background: -1 (left/top edge) to 1 (right/bottom edge).
    const width = win.innerWidth || 1;
    const height = win.innerHeight || 1;
    element.style.setProperty('--px', ((x / width) * 2 - 1).toFixed(3));
    element.style.setProperty('--py', ((y / height) * 2 - 1).toFixed(3));

    if (card) {
      const rect = card.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        card.style.setProperty('--mx', `${(x - rect.left).toFixed(1)}px`);
        card.style.setProperty('--my', `${(y - rect.top).toFixed(1)}px`);
        card.style.setProperty('--cx', (((x - rect.left) / rect.width) * 2 - 1).toFixed(3));
        card.style.setProperty('--cy', (((y - rect.top) / rect.height) * 2 - 1).toFixed(3));
      }
    }
  }

  function onPointerMove(event) {
    if (event.pointerType === 'touch') return;
    const target = event.target instanceof win.Element ? event.target : null;
    pending = {
      x: event.clientX,
      y: event.clientY,
      card: target?.closest(SPOTLIGHT_SELECTOR) ?? null,
    };
    if (!frame) frame = win.requestAnimationFrame(applyFrame);
  }

  /** When the pointer leaves the window the layers drift back to the middle. */
  function onPointerLeave() {
    pending = null;
    element.style.setProperty('--px', '0');
    element.style.setProperty('--py', '0');
  }

  function listen() {
    if (listening) return;
    listening = true;
    doc.addEventListener('pointermove', onPointerMove, { passive: true });
    doc.documentElement.addEventListener('pointerleave', onPointerLeave);
  }

  function stopListening() {
    if (!listening) return;
    listening = false;
    doc.removeEventListener('pointermove', onPointerMove);
    doc.documentElement.removeEventListener('pointerleave', onPointerLeave);
    if (frame) win.cancelAnimationFrame(frame);
    frame = 0;
    pending = null;
    element.style.removeProperty('--px');
    element.style.removeProperty('--py');
  }

  function sync() {
    if (reducedMotion?.matches) stopListening();
    else listen();
  }

  reducedMotion?.addEventListener?.('change', sync);
  sync();

  return {
    element,
    destroy() {
      reducedMotion?.removeEventListener?.('change', sync);
      stopListening();
      element.remove();
    },
  };
}
