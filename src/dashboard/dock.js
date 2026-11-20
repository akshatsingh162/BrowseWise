import { el } from '../ui/dom.js';
import { icon } from '../ui/icons.js';

/**
 * The navigation dock: a row of floating buttons at the bottom of the window, with no bar
 * behind them, so the page gets the whole window.
 *
 * - The current page is a light pill with its name; the others are icons with a tooltip.
 * - Buttons near the pointer swell slightly (not with reduced motion, not on touch).
 * - While scrolling down the dock slides away; it comes back when scrolling up, near the
 *   top or bottom of the page, when the pointer goes to the bottom edge, or when keyboard
 *   focus moves into it. It can be set to stay put.
 *
 * Every item is a plain link (#route) with a real text label, so it works with the keyboard,
 * the back button and screen readers. The tooltips are decoration.
 */

/** How far (px) the pointer's influence reaches along the dock. */
const MAGNIFY_RADIUS = 120;
const MAX_SCALE = 1.22;
const MAX_LIFT_PX = 7;

/** Scrolling: the dock only hides below this scroll position, and by at least this much. */
const HIDE_AFTER_PX = 80;
const SCROLL_STEP_PX = 6;
/** The pointer within this distance of the bottom edge brings a hidden dock back. */
const REVEAL_ZONE_PX = 96;

/**
 * @param {object} options
 * @param {{id: string, label: string, icon: string}[]} options.routes
 * @param {boolean} [options.autoHide]
 * @param {Document} [options.doc]
 * @param {Window} [options.win]
 * @returns {{element: HTMLElement, setActive: (id: string) => void,
 *            setAutoHide: (value: boolean) => void, destroy: () => void}}
 */
export function createDock({ routes, autoHide = true, doc = document, win = window }) {
  const items = new Map(
    routes.map((route, index) => [
      route.id,
      el('a', { class: 'dk-item', href: `#${route.id}` }, [
        icon(route.icon, { size: 20 }),
        // The real label: shown on the current page, and always what assistive technology reads.
        el('span', { class: 'dk-label', text: route.label }),
        el('span', { class: 'dk-tip', 'aria-hidden': 'true' }, [
          el('span', { text: route.label }),
          el('kbd', { text: String(index + 1) }),
        ]),
      ]),
    ]),
  );

  const nav = el(
    'nav',
    {
      class: 'dk',
      'aria-label': 'Main',
      'data-hidden': 'false',
      'data-autohide': String(autoHide),
    },
    [...items.values()],
  );
  const element = el('div', { class: 'dk-wrap' }, [nav]);

  let hidden = false;
  let hovering = false;
  let autoHideOn = autoHide;

  /* ---------- hiding ---------- */

  function setHidden(value) {
    if (hidden === value) return;
    hidden = value;
    nav.dataset.hidden = String(value);
  }

  let lastY = win.scrollY ?? 0;
  let scrollFrame = 0;

  function updateFromScroll() {
    scrollFrame = 0;
    const y = win.scrollY ?? 0;
    const delta = y - lastY;
    lastY = y;
    if (!autoHideOn) return;

    const atBottom = y + (win.innerHeight ?? 0) >= doc.documentElement.scrollHeight - 4;
    if (y < HIDE_AFTER_PX || delta < -SCROLL_STEP_PX || atBottom) {
      setHidden(false);
    } else if (delta > SCROLL_STEP_PX && !hovering && !nav.contains(doc.activeElement)) {
      setHidden(true);
    }
  }

  function onScroll() {
    if (!scrollFrame) scrollFrame = win.requestAnimationFrame(updateFromScroll);
  }

  function onDocumentPointerMove(event) {
    if (hidden && autoHideOn && event.clientY >= (win.innerHeight ?? 0) - REVEAL_ZONE_PX) {
      setHidden(false);
    }
  }

  const onFocusIn = () => setHidden(false);
  const onPointerOver = () => (hovering = true);
  const onPointerOut = (event) => {
    if (!event.relatedTarget || !nav.contains(event.relatedTarget)) hovering = false;
  };

  /* ---------- magnifying the buttons near the pointer ---------- */

  const reducedMotion = win.matchMedia?.('(prefers-reduced-motion: reduce)') ?? null;
  const finePointer = win.matchMedia?.('(hover: hover) and (pointer: fine)') ?? null;
  let magnifying = false;
  let magnifyFrame = 0;
  let pointerX = 0;

  function applyMagnify() {
    magnifyFrame = 0;
    for (const item of items.values()) {
      const rect = item.getBoundingClientRect();
      const distance = Math.abs(pointerX - (rect.left + rect.width / 2));
      const t = Math.max(0, 1 - distance / MAGNIFY_RADIUS);
      const eased = t * t * (3 - 2 * t); // smoothstep: no sudden edges
      item.style.setProperty('--s', (1 + (MAX_SCALE - 1) * eased).toFixed(3));
      item.style.setProperty('--lift', `${(-MAX_LIFT_PX * eased).toFixed(1)}px`);
    }
  }

  function resetMagnify() {
    if (magnifyFrame) win.cancelAnimationFrame(magnifyFrame);
    magnifyFrame = 0;
    for (const item of items.values()) {
      item.style.removeProperty('--s');
      item.style.removeProperty('--lift');
    }
  }

  function onNavPointerMove(event) {
    if (event.pointerType === 'touch') return;
    pointerX = event.clientX;
    if (!magnifyFrame) magnifyFrame = win.requestAnimationFrame(applyMagnify);
  }

  function syncMagnify() {
    const allowed = !reducedMotion?.matches && (finePointer ? finePointer.matches : true);
    if (allowed === magnifying) return;
    magnifying = allowed;
    if (allowed) {
      nav.addEventListener('pointermove', onNavPointerMove, { passive: true });
      nav.addEventListener('pointerleave', resetMagnify);
    } else {
      nav.removeEventListener('pointermove', onNavPointerMove);
      nav.removeEventListener('pointerleave', resetMagnify);
      resetMagnify();
    }
  }

  win.addEventListener('scroll', onScroll, { passive: true });
  doc.addEventListener('pointermove', onDocumentPointerMove, { passive: true });
  nav.addEventListener('focusin', onFocusIn);
  nav.addEventListener('pointerover', onPointerOver);
  nav.addEventListener('pointerout', onPointerOut);
  reducedMotion?.addEventListener?.('change', syncMagnify);
  finePointer?.addEventListener?.('change', syncMagnify);
  syncMagnify();

  return {
    element,

    /** Marks the current page (visually and for screen readers). */
    setActive(routeId) {
      for (const [id, link] of items) {
        if (id === routeId) link.setAttribute('aria-current', 'page');
        else link.removeAttribute('aria-current');
      }
    },

    /** Whether the dock slides away while scrolling down. Turning it off brings it back. */
    setAutoHide(value) {
      autoHideOn = Boolean(value);
      nav.dataset.autohide = String(autoHideOn);
      if (!autoHideOn) setHidden(false);
    },

    destroy() {
      win.removeEventListener('scroll', onScroll);
      doc.removeEventListener('pointermove', onDocumentPointerMove);
      nav.removeEventListener('focusin', onFocusIn);
      nav.removeEventListener('pointerover', onPointerOver);
      nav.removeEventListener('pointerout', onPointerOut);
      reducedMotion?.removeEventListener?.('change', syncMagnify);
      finePointer?.removeEventListener?.('change', syncMagnify);
      magnifying = false;
      nav.removeEventListener('pointermove', onNavPointerMove);
      nav.removeEventListener('pointerleave', resetMagnify);
      if (scrollFrame) win.cancelAnimationFrame(scrollFrame);
      if (magnifyFrame) win.cancelAnimationFrame(magnifyFrame);
      element.remove();
    },
  };
}
