// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDock } from '../src/dashboard/dock.js';
import { ROUTES } from '../src/dashboard/router.js';

/** A window stand-in: animation frames run only when the test says so, and scroll is set by hand. */
function fakeWindow({ reducedMotion = false, finePointer = true, withMatchMedia = true } = {}) {
  const frames = new Map();
  let nextId = 1;
  const listeners = { scroll: new Set() };
  const media = (matches) => ({
    matches,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
  const win = {
    scrollY: 0,
    innerHeight: 800,
    matchMedia: withMatchMedia
      ? vi.fn((query) =>
          query.includes('reduced-motion') ? media(reducedMotion) : media(finePointer),
        )
      : undefined,
    addEventListener: vi.fn((type, fn) => listeners[type]?.add(fn)),
    removeEventListener: vi.fn((type, fn) => listeners[type]?.delete(fn)),
    requestAnimationFrame: vi.fn((fn) => {
      frames.set(nextId, fn);
      return nextId++;
    }),
    cancelAnimationFrame: vi.fn((id) => frames.delete(id)),
  };
  return {
    win,
    runFrames() {
      const callbacks = [...frames.values()];
      frames.clear();
      callbacks.forEach((fn) => fn(0));
    },
    pendingFrames: () => frames.size,
    scrollTo(y) {
      win.scrollY = y;
      listeners.scroll.forEach((fn) => fn());
    },
    scrollListeners: () => listeners.scroll.size,
  };
}

let dock;
let fake;
const make = (options = {}, windowOptions = {}) => {
  fake = fakeWindow(windowOptions);
  dock = createDock({ routes: ROUTES, win: fake.win, ...options });
  document.body.append(dock.element);
  return dock;
};
const nav = () => document.querySelector('.dk');
const items = () => [...document.querySelectorAll('.dk-item')];
const hidden = () => nav().dataset.hidden === 'true';
const pointer = (target, type, init = {}) => {
  const event = new MouseEvent(type, { bubbles: true, ...init });
  if (init.pointerType) Object.defineProperty(event, 'pointerType', { value: init.pointerType });
  target.dispatchEvent(event);
};
/** Scrolls and lets the frame that handles it run. */
const scrollTo = (y) => {
  fake.scrollTo(y);
  fake.runFrames();
};

beforeEach(() => {
  document.body.replaceChildren();
  Object.defineProperty(document.documentElement, 'scrollHeight', {
    configurable: true,
    value: 5000,
  });
});
afterEach(() => dock?.destroy());

describe('dock: structure', () => {
  it('is a labelled navigation with one link per page, in order', () => {
    make();
    expect(nav().tagName).toBe('NAV');
    expect(nav().getAttribute('aria-label')).toBe('Main');
    expect(items().map((a) => a.getAttribute('href'))).toEqual(ROUTES.map((r) => `#${r.id}`));
  });

  it('gives every link its name as real text, so assistive technology reads it', () => {
    make();
    expect(items().map((a) => a.querySelector('.dk-label').textContent)).toEqual(
      ROUTES.map((r) => r.label),
    );
  });

  it('keeps the tooltips (name and key) out of assistive technology', () => {
    make();
    for (const [index, link] of items().entries()) {
      const tip = link.querySelector('.dk-tip');
      expect(tip.getAttribute('aria-hidden')).toBe('true');
      expect(tip.querySelector('kbd').textContent).toBe(String(index + 1));
    }
  });

  it('draws an icon in every link', () => {
    make();
    for (const link of items()) expect(link.querySelector('svg')).not.toBeNull();
  });

  it('has no bar: only the buttons are drawn, the wrapper and row are inert', () => {
    make();
    expect(dock.element.classList.contains('dk-wrap')).toBe(true);
    expect(dock.element.children).toHaveLength(1);
    expect(dock.element.getAttribute('style')).toBeNull();
  });

  it('starts visible, with the auto-hide setting recorded', () => {
    make({ autoHide: false });
    expect(hidden()).toBe(false);
    expect(nav().dataset.autohide).toBe('false');
  });
});

describe('dock: the current page', () => {
  it('marks exactly one page, and moves the mark', () => {
    make();
    dock.setActive('websites');
    dock.setActive('goals');
    const current = document.querySelectorAll('[aria-current="page"]');
    expect(current).toHaveLength(1);
    expect(current[0].getAttribute('href')).toBe('#goals');
  });

  it('removes the mark from everything for an unknown page', () => {
    make();
    dock.setActive('goals');
    dock.setActive('nowhere');
    expect(document.querySelectorAll('[aria-current="page"]')).toHaveLength(0);
  });
});

describe('dock: swelling near the pointer', () => {
  const rectOf = (index) => ({ left: index * 60, width: 46, top: 0, height: 46 });
  beforeEach(() => {
    make();
    items().forEach((link, index) => (link.getBoundingClientRect = () => rectOf(index)));
  });
  const scale = (index) => Number(items()[index].style.getPropertyValue('--s'));

  it('makes the button under the pointer biggest, and falls off smoothly with distance', () => {
    pointer(items()[2], 'pointermove', { clientX: 2 * 60 + 23 });
    fake.runFrames();
    expect(scale(2)).toBeCloseTo(1.22, 2);
    expect(scale(1)).toBeGreaterThan(1);
    expect(scale(1)).toBeLessThan(scale(2));
    expect(scale(0)).toBeLessThanOrEqual(scale(1));
    expect(scale(6)).toBe(1); // too far to feel it
  });

  it('lifts the swollen buttons a little', () => {
    pointer(items()[2], 'pointermove', { clientX: 2 * 60 + 23 });
    fake.runFrames();
    expect(parseFloat(items()[2].style.getPropertyValue('--lift'))).toBeLessThan(0);
    expect(parseFloat(items()[6].style.getPropertyValue('--lift'))).toBeCloseTo(0, 5);
  });

  it('batches several moves into one frame', () => {
    pointer(items()[1], 'pointermove', { clientX: 70 });
    pointer(items()[1], 'pointermove', { clientX: 80 });
    pointer(items()[1], 'pointermove', { clientX: 90 });
    expect(fake.pendingFrames()).toBe(1);
  });

  it('settles back to normal when the pointer leaves', () => {
    pointer(items()[2], 'pointermove', { clientX: 143 });
    fake.runFrames();
    nav().dispatchEvent(new Event('pointerleave'));
    for (const link of items()) {
      expect(link.style.getPropertyValue('--s')).toBe('');
      expect(link.style.getPropertyValue('--lift')).toBe('');
    }
  });

  it('ignores touch', () => {
    pointer(items()[2], 'pointermove', { clientX: 143, pointerType: 'touch' });
    expect(fake.pendingFrames()).toBe(0);
  });
});

describe('dock: swelling is off when it should be', () => {
  it('does nothing for people who prefer reduced motion', () => {
    make({}, { reducedMotion: true });
    pointer(items()[2], 'pointermove', { clientX: 100 });
    expect(fake.pendingFrames()).toBe(0);
  });

  it('does nothing without a fine hover pointer (touch screens)', () => {
    make({}, { finePointer: false });
    pointer(items()[2], 'pointermove', { clientX: 100 });
    expect(fake.pendingFrames()).toBe(0);
  });

  it('works when matchMedia is not available', () => {
    make({}, { withMatchMedia: false });
    pointer(items()[2], 'pointermove', { clientX: 100 });
    expect(fake.pendingFrames()).toBe(1);
  });
});

describe('dock: hiding while scrolling down', () => {
  it('stays put near the top of the page', () => {
    make();
    scrollTo(60);
    expect(hidden()).toBe(false);
  });

  it('slides away when scrolling down past the top', () => {
    make();
    scrollTo(300);
    expect(hidden()).toBe(true);
  });

  it('ignores a tiny scroll', () => {
    make();
    scrollTo(300);
    scrollTo(100 + 100); // moves back up by 100: shows
    expect(hidden()).toBe(false);
    scrollTo(203); // only 3px down
    expect(hidden()).toBe(false);
  });

  it('comes back when scrolling up, and goes again on the next scroll down', () => {
    make();
    scrollTo(400);
    expect(hidden()).toBe(true);
    scrollTo(380);
    expect(hidden()).toBe(false);
    scrollTo(600);
    expect(hidden()).toBe(true);
  });

  it('comes back at the very top and at the very bottom of the page', () => {
    make();
    scrollTo(500);
    expect(hidden()).toBe(true);
    scrollTo(5000 - 800); // scrolled down to the very bottom (page 5000 tall, window 800)
    expect(hidden()).toBe(false);

    scrollTo(3000); // up: shown
    scrollTo(3300); // down again: hidden
    expect(hidden()).toBe(true);
    scrollTo(10); // back to the top
    expect(hidden()).toBe(false);
  });

  it('coalesces a burst of scroll events into one frame', () => {
    make();
    fake.scrollTo(200);
    fake.scrollTo(300);
    fake.scrollTo(400);
    expect(fake.pendingFrames()).toBe(1);
  });

  it('stays visible while the pointer is over it', () => {
    make();
    pointer(items()[0], 'pointerover');
    scrollTo(400);
    expect(hidden()).toBe(false);
    pointer(items()[0], 'pointerout', { relatedTarget: null });
    scrollTo(600);
    expect(hidden()).toBe(true);
  });

  it('is not shut out by moving between buttons', () => {
    make();
    pointer(items()[0], 'pointerover');
    pointer(items()[0], 'pointerout', { relatedTarget: items()[1] }); // still inside the dock
    scrollTo(400);
    expect(hidden()).toBe(false);
  });

  it('stays visible while keyboard focus is inside it', () => {
    make();
    items()[1].focus();
    scrollTo(400);
    expect(hidden()).toBe(false);
  });
});

describe('dock: coming back', () => {
  it('returns when the pointer goes to the bottom edge of the window', () => {
    make();
    scrollTo(400);
    expect(hidden()).toBe(true);
    pointer(document.body, 'pointermove', { clientY: 400 }); // middle of the window: no
    expect(hidden()).toBe(true);
    pointer(document.body, 'pointermove', { clientY: 790 }); // bottom edge
    expect(hidden()).toBe(false);
  });

  it('returns when keyboard focus moves into it, so it can always be reached with Tab', () => {
    make();
    scrollTo(400);
    expect(hidden()).toBe(true);
    items()[0].dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    expect(hidden()).toBe(false);
  });

  it('keeps the links in the page while hidden, so they stay reachable', () => {
    make();
    scrollTo(400);
    expect(hidden()).toBe(true);
    expect(items()).toHaveLength(ROUTES.length);
    expect(items().every((link) => link.getAttribute('tabindex') === null)).toBe(true);
  });
});

describe('dock: staying put', () => {
  it('never hides when auto-hide is off', () => {
    make({ autoHide: false });
    scrollTo(400);
    expect(hidden()).toBe(false);
  });

  it('shows again straight away when auto-hide is turned off', () => {
    make();
    scrollTo(400);
    expect(hidden()).toBe(true);
    dock.setAutoHide(false);
    expect(hidden()).toBe(false);
    expect(nav().dataset.autohide).toBe('false');
  });

  it('starts hiding when auto-hide is turned on', () => {
    make({ autoHide: false });
    dock.setAutoHide(true);
    scrollTo(400);
    expect(hidden()).toBe(true);
  });
});

describe('dock: cleaning up', () => {
  it('removes its element and listeners, and cancels waiting frames', () => {
    make();
    fake.scrollTo(300);
    pointer(items()[0], 'pointermove', { clientX: 10 });
    expect(fake.pendingFrames()).toBeGreaterThan(0);

    dock.destroy();
    expect(document.querySelector('.dk-wrap')).toBeNull();
    expect(fake.pendingFrames()).toBe(0);
    expect(fake.scrollListeners()).toBe(0);
  });

  it('can be destroyed twice', () => {
    make();
    dock.destroy();
    expect(() => dock.destroy()).not.toThrow();
  });
});
