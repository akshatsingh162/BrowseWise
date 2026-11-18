// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SPOTLIGHT_SELECTOR, mountAmbient } from '../src/ui/ambient.js';

/** A window stand-in whose animation frames run only when the test says so. */
function fakeWindow({ reducedMotion = false, withMatchMedia = true } = {}) {
  let nextId = 1;
  const frames = new Map();
  const mediaListeners = new Set();
  const media = {
    matches: reducedMotion,
    addEventListener: (_type, fn) => mediaListeners.add(fn),
    removeEventListener: (_type, fn) => mediaListeners.delete(fn),
  };
  const win = {
    innerWidth: 1000,
    innerHeight: 500,
    Element: window.Element,
    matchMedia: withMatchMedia ? vi.fn(() => media) : undefined,
    requestAnimationFrame: vi.fn((callback) => {
      frames.set(nextId, callback);
      return nextId++;
    }),
    cancelAnimationFrame: vi.fn((id) => frames.delete(id)),
  };
  return {
    win,
    pendingFrames: () => frames.size,
    runFrame() {
      const callbacks = [...frames.values()];
      frames.clear();
      callbacks.forEach((callback) => callback(0));
    },
    setReducedMotion(value) {
      media.matches = value;
      mediaListeners.forEach((fn) => fn({ matches: value }));
    },
    mediaListenerCount: () => mediaListeners.size,
  };
}

function movePointer(target, x, y, pointerType = 'mouse') {
  const event = new MouseEvent('pointermove', { clientX: x, clientY: y, bubbles: true });
  Object.defineProperty(event, 'pointerType', { value: pointerType });
  target.dispatchEvent(event);
}

let mounted;
const mount = (options) => {
  const fake = fakeWindow(options);
  mounted = mountAmbient({ doc: document, win: fake.win });
  return { ...fake, ambient: mounted };
};
const vars = (node) => ({
  px: node.style.getPropertyValue('--px'),
  py: node.style.getPropertyValue('--py'),
});

beforeEach(() => {
  document.body.innerHTML = '<div id="app"><div class="bw-card" id="card">Card</div></div>';
});

afterEach(() => {
  mounted?.destroy();
  mounted = undefined;
});

describe('ambient background: structure', () => {
  it('adds one decorative container as the first child of the body', () => {
    const { ambient } = mount();
    expect(document.body.firstElementChild).toBe(ambient.element);
    expect(ambient.element.classList.contains('bw-ambient')).toBe(true);
    // Purely decorative: hidden from assistive technology.
    expect(ambient.element.getAttribute('aria-hidden')).toBe('true');
    expect(ambient.element.textContent).toBe('');
  });

  it('builds the layers back to front, then the vignette', () => {
    const { ambient } = mount();
    const layers = [...ambient.element.children].map((node) => node.className);
    expect(layers).toEqual([
      'bw-ambient-layer bw-glow bw-glow-silver',
      'bw-ambient-layer bw-glow bw-glow-ember',
      'bw-ambient-layer bw-ambient-beam',
      'bw-ambient-layer bw-ambient-grid',
      'bw-ambient-layer bw-ambient-grain',
      'bw-ambient-vignette',
    ]);
  });

  it('never stacks two backgrounds', () => {
    mountAmbient({ doc: document, win: fakeWindow().win });
    mount();
    expect(document.querySelectorAll('.bw-ambient')).toHaveLength(1);
  });

  it('works when the window has no matchMedia', () => {
    const { win, ambient } = mount({ withMatchMedia: false });
    movePointer(document.body, 500, 250);
    expect(win.requestAnimationFrame).toHaveBeenCalled();
    expect(ambient.element.isConnected).toBe(true);
  });
});

describe('ambient background: pointer parallax', () => {
  it('maps the pointer to -1..1 across the window, one update per frame', () => {
    const { ambient, runFrame } = mount();

    movePointer(document.body, 0, 0);
    runFrame();
    expect(vars(ambient.element)).toEqual({ px: '-1.000', py: '-1.000' });

    movePointer(document.body, 500, 250);
    runFrame();
    expect(vars(ambient.element)).toEqual({ px: '0.000', py: '0.000' });

    movePointer(document.body, 1000, 500);
    runFrame();
    expect(vars(ambient.element)).toEqual({ px: '1.000', py: '1.000' });
  });

  it('batches many moves into a single frame and uses the latest position', () => {
    const { ambient, win, pendingFrames, runFrame } = mount();

    movePointer(document.body, 100, 100);
    movePointer(document.body, 200, 200);
    movePointer(document.body, 750, 125);

    expect(pendingFrames()).toBe(1);
    expect(win.requestAnimationFrame).toHaveBeenCalledTimes(1);
    expect(vars(ambient.element).px).toBe(''); // nothing is written before the frame
    runFrame();
    expect(vars(ambient.element)).toEqual({ px: '0.500', py: '-0.500' });
  });

  it('ignores touch input', () => {
    const { ambient, pendingFrames } = mount();
    movePointer(document.body, 300, 300, 'touch');
    expect(pendingFrames()).toBe(0);
    expect(vars(ambient.element).px).toBe('');
  });

  it('eases back to the middle when the pointer leaves the window', () => {
    const { ambient, runFrame } = mount();
    movePointer(document.body, 900, 400);
    runFrame();
    expect(vars(ambient.element).px).not.toBe('0');

    document.documentElement.dispatchEvent(new Event('pointerleave'));
    expect(vars(ambient.element)).toEqual({ px: '0', py: '0' });
  });

  it('drops a move that was waiting when the pointer left', () => {
    const { ambient, runFrame } = mount();
    movePointer(document.body, 900, 400);
    document.documentElement.dispatchEvent(new Event('pointerleave'));
    runFrame();
    expect(vars(ambient.element)).toEqual({ px: '0', py: '0' });
  });

  it('copes with events that do not come from an element', () => {
    const { ambient, runFrame } = mount();
    expect(() => {
      movePointer(document, 500, 250);
      runFrame();
    }).not.toThrow();
    expect(vars(ambient.element).px).toBe('0.000');
  });
});

describe('ambient background: card spotlight', () => {
  const rect = { left: 100, top: 50, width: 200, height: 100, right: 300, bottom: 150 };

  it('tells the card under the pointer where the pointer is', () => {
    const { runFrame } = mount();
    const card = document.getElementById('card');
    card.getBoundingClientRect = () => rect;

    movePointer(card, 200, 100); // exactly the middle of the card
    runFrame();
    expect(card.style.getPropertyValue('--mx')).toBe('100.0px');
    expect(card.style.getPropertyValue('--my')).toBe('50.0px');
    expect(card.style.getPropertyValue('--cx')).toBe('0.000');
    expect(card.style.getPropertyValue('--cy')).toBe('0.000');

    movePointer(card, 300, 150); // bottom-right corner
    runFrame();
    expect(card.style.getPropertyValue('--cx')).toBe('1.000');
    expect(card.style.getPropertyValue('--cy')).toBe('1.000');
  });

  it('finds the card from a child element', () => {
    const { runFrame } = mount();
    const card = document.getElementById('card');
    card.getBoundingClientRect = () => rect;
    const child = document.createElement('span');
    card.append(child);

    movePointer(child, 150, 75);
    runFrame();
    expect(card.style.getPropertyValue('--mx')).toBe('50.0px');
  });

  it('leaves cards alone when the pointer is elsewhere', () => {
    const { runFrame } = mount();
    const card = document.getElementById('card');
    movePointer(document.getElementById('app'), 10, 10);
    runFrame();
    expect(card.style.getPropertyValue('--mx')).toBe('');
  });

  it('skips a card that has no size', () => {
    const { runFrame } = mount();
    const card = document.getElementById('card'); // jsdom reports zero-size boxes
    movePointer(card, 10, 10);
    runFrame();
    expect(card.style.getPropertyValue('--mx')).toBe('');
  });

  it('spotlights the card class the stylesheet uses', () => {
    expect(SPOTLIGHT_SELECTOR).toBe('.bw-card');
  });
});

describe('ambient background: reduced motion', () => {
  it('does not listen to the pointer at all', () => {
    const { ambient, pendingFrames } = mount({ reducedMotion: true });
    movePointer(document.body, 600, 300);
    expect(pendingFrames()).toBe(0);
    expect(vars(ambient.element).px).toBe('');
  });

  it('still builds the (static) background', () => {
    const { ambient } = mount({ reducedMotion: true });
    expect(ambient.element.children).toHaveLength(6);
  });

  it('stops when the preference is switched on while open, and clears the offsets', () => {
    const { ambient, runFrame, setReducedMotion, pendingFrames } = mount();
    movePointer(document.body, 900, 400);
    runFrame();
    expect(vars(ambient.element).px).toBe('0.800');

    movePointer(document.body, 100, 100); // a frame is now waiting
    setReducedMotion(true);
    expect(pendingFrames()).toBe(0);
    expect(vars(ambient.element)).toEqual({ px: '', py: '' });

    movePointer(document.body, 500, 250);
    expect(pendingFrames()).toBe(0);
  });

  it('starts again when the preference is switched off', () => {
    const { ambient, runFrame, setReducedMotion } = mount({ reducedMotion: true });
    setReducedMotion(false);
    movePointer(document.body, 1000, 0);
    runFrame();
    expect(vars(ambient.element)).toEqual({ px: '1.000', py: '-1.000' });
  });
});

describe('ambient background: cleanup', () => {
  it('removes the element, the listeners and any waiting frame', () => {
    const { ambient, pendingFrames, mediaListenerCount } = mount();
    movePointer(document.body, 100, 100);
    expect(pendingFrames()).toBe(1);

    ambient.destroy();
    expect(document.querySelector('.bw-ambient')).toBeNull();
    expect(pendingFrames()).toBe(0);
    expect(mediaListenerCount()).toBe(0);

    movePointer(document.body, 200, 200);
    expect(pendingFrames()).toBe(0);
  });

  it('can be destroyed twice without error', () => {
    const { ambient } = mount();
    ambient.destroy();
    expect(() => ambient.destroy()).not.toThrow();
  });
});
