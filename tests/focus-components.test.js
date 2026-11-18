// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { badgeCard } from '../src/dashboard/components/badge-card.js';
import { createTimerRing } from '../src/dashboard/components/timer-ring.js';
import { BADGES } from '../src/shared/achievements.js';
import { celebrate } from '../src/ui/celebrate.js';

const view = (patch = {}) => ({
  fraction: 0.25,
  timeText: '18:45',
  spokenTime: '18 minutes 45 seconds left',
  phaseText: 'Focus',
  noteText: '25-minute session',
  tone: 'focus',
  ...patch,
});

describe('timer ring', () => {
  it('is a timer for assistive technology, and hides its decorative drawing', () => {
    const { element } = createTimerRing();
    expect(element.getAttribute('role')).toBe('timer');
    expect(element.querySelector('svg').getAttribute('aria-hidden')).toBe('true');
  });

  it('shows the time, phase and note as text', () => {
    const ring = createTimerRing();
    ring.update(view());
    expect(ring.element.querySelector('.fo-ring-time').textContent).toBe('18:45');
    expect(ring.element.querySelector('.fo-ring-phase').textContent).toBe('Focus');
    expect(ring.element.querySelector('.fo-ring-note').textContent).toBe('25-minute session');
    expect(ring.element.getAttribute('aria-label')).toBe(
      'Focus: 18 minutes 45 seconds left (25-minute session)',
    );
  });

  it('draws progress as the part of the circle that is filled', () => {
    const ring = createTimerRing({ size: 200, stroke: 10 });
    const circle = ring.element.querySelector('.fo-ring-progress');
    const circumference = 2 * Math.PI * 95;
    expect(Number(circle.getAttribute('stroke-dasharray'))).toBeCloseTo(circumference);

    ring.update(view({ fraction: 0 }));
    expect(Number(circle.getAttribute('stroke-dashoffset'))).toBeCloseTo(circumference);
    ring.update(view({ fraction: 0.25 }));
    expect(Number(circle.getAttribute('stroke-dashoffset'))).toBeCloseTo(circumference * 0.75);
    ring.update(view({ fraction: 1 }));
    expect(Number(circle.getAttribute('stroke-dashoffset'))).toBeCloseTo(0);
  });

  it('never draws less than nothing or more than everything', () => {
    const ring = createTimerRing({ size: 200, stroke: 10 });
    const circle = ring.element.querySelector('.fo-ring-progress');
    const circumference = 2 * Math.PI * 95;
    ring.update(view({ fraction: -3 }));
    expect(Number(circle.getAttribute('stroke-dashoffset'))).toBeCloseTo(circumference);
    ring.update(view({ fraction: 7 }));
    expect(Number(circle.getAttribute('stroke-dashoffset'))).toBeCloseTo(0);
  });

  it('records the tone so the stylesheet can colour it', () => {
    const ring = createTimerRing();
    for (const tone of ['idle', 'focus', 'break', 'paused']) {
      ring.update(view({ tone }));
      expect(ring.element.dataset.tone).toBe(tone);
    }
  });

  it('leaves out the empty parentheses when there is no note', () => {
    const ring = createTimerRing();
    ring.update(view({ noteText: '' }));
    expect(ring.element.getAttribute('aria-label')).toBe('Focus: 18 minutes 45 seconds left');
  });
});

describe('badge card', () => {
  const badge = BADGES.find((candidate) => candidate.id === 'sessions-10');
  const progress = { current: 4, target: 10, fraction: 0.4 };

  beforeEach(() => document.body.replaceChildren());

  it('shows an earned badge with its date, and no progress bar', () => {
    const card = badgeCard({
      badge,
      earnedOn: '2026-11-04',
      progress: { current: 10, target: 10, fraction: 1 },
      locale: 'en-US',
    });
    expect(card.classList.contains('is-earned')).toBe(true);
    expect(card.querySelector('.fo-badge-title').textContent).toBe('Finding a rhythm');
    expect(card.querySelector('.fo-badge-desc').textContent).toBe('Complete 10 focus sessions.');
    expect(card.querySelector('.fo-badge-status').textContent).toBe('Earned Wed, Nov 4');
    expect(card.querySelector('.fo-badge-bar')).toBeNull();
    expect(card.querySelector('.fo-badge-lock')).toBeNull();
  });

  it('shows a locked badge as locked in words, with a lock and its progress', () => {
    const card = badgeCard({ badge, earnedOn: null, progress });
    expect(card.classList.contains('is-locked')).toBe(true);
    expect(card.querySelector('.fo-badge-status').textContent).toBe(
      'Locked \u00b7 4 of 10 sessions',
    );
    expect(card.querySelector('.fo-badge-lock')).not.toBeNull();
    expect(card.querySelector('.bw-bar-fill').style.width).toBe('40%');
    expect(card.querySelector('.fo-badge-bar').getAttribute('aria-hidden')).toBe('true');
  });

  it('names the tier as text, so it never depends on colour', () => {
    expect(
      badgeCard({ badge, earnedOn: null, progress }).querySelector('.fo-badge-tier').textContent,
    ).toBe('Bronze');
    const gold = BADGES.find((candidate) => candidate.tier === 'gold');
    expect(badgeCard({ badge: gold, earnedOn: null, progress }).dataset.tier).toBe('gold');
    expect(
      badgeCard({ badge: gold, earnedOn: null, progress }).querySelector('.fo-badge-tier')
        .textContent,
    ).toBe('Gold');
  });

  it('gives the whole card one clear spoken description', () => {
    expect(
      badgeCard({ badge, earnedOn: '2026-11-04', progress, locale: 'en-US' }).getAttribute(
        'aria-label',
      ),
    ).toBe('Finding a rhythm, Bronze badge, Earned Wed, Nov 4');
    expect(badgeCard({ badge, earnedOn: null, progress }).getAttribute('aria-label')).toBe(
      'Finding a rhythm, Bronze badge, locked, 4 of 10 sessions',
    );
  });

  it('shows hours with one decimal and whole numbers without', () => {
    const hours = BADGES.find((candidate) => candidate.id === 'hours-10');
    const card = badgeCard({
      badge: hours,
      earnedOn: null,
      progress: { current: 2.5, target: 10, fraction: 0.25 },
    });
    expect(card.querySelector('.fo-badge-status').textContent).toBe(
      'Locked \u00b7 2.5 of 10 hours',
    );
  });

  it('hides the decorative medal from assistive technology', () => {
    const card = badgeCard({ badge, earnedOn: null, progress });
    expect(card.querySelector('.fo-badge-medal').getAttribute('aria-hidden')).toBe('true');
  });

  it('puts text in as text, never as markup', () => {
    const hostile = { ...badge, title: '<img src=x onerror=alert(1)>', description: '<b>bold</b>' };
    const card = badgeCard({ badge: hostile, earnedOn: null, progress });
    document.body.append(card);
    expect(card.querySelector('img')).toBeNull();
    expect(card.querySelector('b')).toBeNull();
    expect(card.querySelector('.fo-badge-title').textContent).toBe('<img src=x onerror=alert(1)>');
  });
});

describe('celebrate', () => {
  const win = (reduced) => ({
    innerWidth: 1000,
    innerHeight: 600,
    matchMedia: () => ({ matches: reduced }),
  });

  beforeEach(() => document.body.replaceChildren());
  afterEach(() => vi.restoreAllMocks());

  it('draws nothing, and says so, when the user prefers reduced motion', () => {
    expect(celebrate({ win: win(true) })).toBe(false);
    expect(document.querySelector('.bw-confetti')).toBeNull();
  });

  it('draws a burst of decorative pieces otherwise', () => {
    const schedule = vi.fn();
    expect(celebrate({ win: win(false), schedule, count: 12 })).toBe(true);
    const layer = document.querySelector('.bw-confetti');
    expect(layer.getAttribute('aria-hidden')).toBe('true');
    expect(layer.querySelectorAll('.bw-confetti-piece')).toHaveLength(12);
  });

  it('starts from the middle of the anchor', () => {
    const anchor = document.createElement('div');
    anchor.getBoundingClientRect = () => ({ left: 100, top: 200, width: 200, height: 100 });
    celebrate({ win: win(false), anchor, schedule: vi.fn(), count: 1 });
    const style = document.querySelector('.bw-confetti-piece').getAttribute('style');
    expect(style).toContain('--x:200px');
    expect(style).toContain('--y:250px');
  });

  it('keeps the burst inside the visible window when the anchor has scrolled out of view', () => {
    const below = document.createElement('div');
    below.getBoundingClientRect = () => ({ left: 100, top: 1500, width: 200, height: 100 });
    celebrate({ win: win(false), anchor: below, schedule: vi.fn(), count: 1 });
    const style = document.querySelector('.bw-confetti-piece').getAttribute('style');
    expect(style).toContain('--y:450px'); // three quarters of the 600px window, not 1550px
    expect(style).toContain('--x:200px');
  });

  it('keeps the burst inside the window above and at the sides too', () => {
    document.body.replaceChildren();
    const above = document.createElement('div');
    above.getBoundingClientRect = () => ({ left: -500, top: -900, width: 100, height: 100 });
    celebrate({ win: win(false), anchor: above, schedule: vi.fn(), count: 1 });
    const style = document.querySelector('.bw-confetti-piece').getAttribute('style');
    expect(style).toContain('--y:40px');
    expect(style).toContain('--x:24px');

    document.body.replaceChildren();
    const right = document.createElement('div');
    right.getBoundingClientRect = () => ({ left: 4000, top: 100, width: 100, height: 100 });
    celebrate({ win: win(false), anchor: right, schedule: vi.fn(), count: 1 });
    expect(document.querySelector('.bw-confetti-piece').getAttribute('style')).toContain(
      '--x:976px',
    );
  });

  it('falls back to the top middle of the window when there is no usable anchor', () => {
    celebrate({
      win: win(false),
      anchor: { getBoundingClientRect: () => ({ width: 0, height: 0 }) },
      schedule: vi.fn(),
      count: 1,
    });
    const style = document.querySelector('.bw-confetti-piece').getAttribute('style');
    expect(style).toContain('--x:500px');
    expect(style).toContain('--y:200px');
  });

  it('is deterministic with an injected random source, and uses only the light palette', () => {
    celebrate({ win: win(false), random: () => 0.5, schedule: vi.fn(), count: 5 });
    const styles = [...document.querySelectorAll('.bw-confetti-piece')].map((piece) =>
      piece.getAttribute('style'),
    );
    expect(styles[0]).toContain('--dx:0px');
    for (const style of styles) expect(style).toMatch(/--color:#[0-9a-f]{6}/i);
  });

  it('removes itself after a moment', () => {
    const schedule = vi.fn();
    celebrate({ win: win(false), schedule });
    expect(document.querySelector('.bw-confetti')).not.toBeNull();
    const [cleanup, delay] = schedule.mock.calls[0];
    expect(delay).toBeGreaterThanOrEqual(1500);
    cleanup();
    expect(document.querySelector('.bw-confetti')).toBeNull();
  });

  it('works when matchMedia is not available', () => {
    expect(
      celebrate({ win: { innerWidth: 800, innerHeight: 600 }, schedule: vi.fn(), count: 3 }),
    ).toBe(true);
  });
});
