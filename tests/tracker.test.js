import { describe, expect, it } from 'vitest';
import {
  MAX_CREDIT_MS,
  advance,
  createInitialState,
  isCounting,
  resolveTrackedDomain,
  sanitizeState,
} from '../src/background/tracker.js';

/** Local timestamp on 2026-11-07 (+ optional extra seconds). */
const T0 = new Date(2026, 10, 7, 10, 0, 0).getTime();
const sec = (n) => T0 + n * 1000;

const OPTIONS = { countAudibleTabsAsActive: false };
const AUDIBLE_OPTIONS = { countAudibleTabsAsActive: true };

const creditedMs = (credit) => credit?.segments.reduce((total, s) => total + s.ms, 0) ?? 0;

/** A state that is actively counting `github.com`, checkpointed at T0. */
const counting = (extra = {}) => ({
  ...createInitialState(T0),
  activeDomain: 'github.com',
  windowFocused: true,
  ...extra,
});

describe('isCounting', () => {
  it('counts only with a domain, a focused window, and an active user', () => {
    expect(isCounting(counting(), OPTIONS)).toBe(true);
    expect(isCounting(counting({ activeDomain: null }), OPTIONS)).toBe(false);
    expect(isCounting(counting({ windowFocused: false }), OPTIONS)).toBe(false);
    expect(isCounting(counting({ idleState: 'idle' }), OPTIONS)).toBe(false);
    expect(isCounting(counting({ idleState: 'locked' }), OPTIONS)).toBe(false);
  });

  it('lets an audible tab count while idle only when the setting is on', () => {
    const idleAudible = counting({ idleState: 'idle', audible: true });
    expect(isCounting(idleAudible, OPTIONS)).toBe(false);
    expect(isCounting(idleAudible, AUDIBLE_OPTIONS)).toBe(true);
  });

  it('never counts while locked, even with audio and the setting on', () => {
    expect(isCounting(counting({ idleState: 'locked', audible: true }), AUDIBLE_OPTIONS)).toBe(
      false,
    );
  });

  it('does not count a silent idle tab even with the setting on', () => {
    expect(isCounting(counting({ idleState: 'idle', audible: false }), AUDIBLE_OPTIONS)).toBe(
      false,
    );
  });
});

describe('advance: crediting', () => {
  it('credits the elapsed time to the active domain', () => {
    const { credit, state } = advance(counting(), sec(10), {}, OPTIONS);
    expect(credit.domain).toBe('github.com');
    expect(creditedMs(credit)).toBe(10_000);
    expect(state.checkpointTs).toBe(sec(10));
  });

  it('credits the OLD domain on a tab switch, then the new one afterwards', () => {
    const first = advance(counting(), sec(10), { activeDomain: 'youtube.com' }, OPTIONS);
    expect(first.credit.domain).toBe('github.com');
    expect(creditedMs(first.credit)).toBe(10_000);

    const second = advance(first.state, sec(15), {}, OPTIONS);
    expect(second.credit.domain).toBe('youtube.com');
    expect(creditedMs(second.credit)).toBe(5_000);
  });

  it('stops counting when the window loses focus and resumes when it returns', () => {
    const lost = advance(counting(), sec(10), { windowFocused: false }, OPTIONS);
    expect(creditedMs(lost.credit)).toBe(10_000);

    const away = advance(lost.state, sec(40), {}, OPTIONS);
    expect(away.credit).toBeNull();

    const back = advance(away.state, sec(45), { windowFocused: true }, OPTIONS);
    expect(back.credit).toBeNull();

    const after = advance(back.state, sec(50), {}, OPTIONS);
    expect(creditedMs(after.credit)).toBe(5_000);
  });

  it('stops while idle or locked and resumes when active again', () => {
    const idle = advance(counting(), sec(30), { idleState: 'idle' }, OPTIONS);
    expect(creditedMs(idle.credit)).toBe(30_000);

    const stillIdle = advance(idle.state, sec(60), {}, OPTIONS);
    expect(stillIdle.credit).toBeNull();

    const active = advance(stillIdle.state, sec(70), { idleState: 'active' }, OPTIONS);
    expect(active.credit).toBeNull(); // the idle span before this moment is not counted

    const next = advance(active.state, sec(75), {}, OPTIONS);
    expect(creditedMs(next.credit)).toBe(5_000);
  });

  it('credits nothing when there is no trackable domain', () => {
    const { credit } = advance(counting({ activeDomain: null }), sec(30), {}, OPTIONS);
    expect(credit).toBeNull();
  });

  it('splits a credit that crosses local midnight into two days', () => {
    const start = new Date(2026, 10, 7, 23, 59, 30).getTime();
    const end = new Date(2026, 10, 8, 0, 0, 30).getTime();
    const state = { ...counting(), checkpointTs: start };

    const { credit } = advance(state, end, {}, OPTIONS);
    expect(credit.segments).toEqual([
      { dateKey: '2026-11-07', hour: 23, ms: 30_000 },
      { dateKey: '2026-11-08', hour: 0, ms: 30_000 },
    ]);
  });
});

describe('advance: protection rules', () => {
  it('discards a gap longer than the maximum (sleep, Chrome closed) but moves the checkpoint', () => {
    const gap = MAX_CREDIT_MS + 1;
    const { credit, state } = advance(counting(), T0 + gap, {}, OPTIONS);
    expect(credit).toBeNull();
    expect(state.checkpointTs).toBe(T0 + gap);
  });

  it('credits a gap exactly at the maximum', () => {
    const { credit } = advance(counting(), T0 + MAX_CREDIT_MS, {}, OPTIONS);
    expect(creditedMs(credit)).toBe(MAX_CREDIT_MS);
  });

  it('credits nothing if the clock moved backwards, and resets the checkpoint', () => {
    const { credit, state } = advance(counting(), T0 - 5_000, {}, OPTIONS);
    expect(credit).toBeNull();
    expect(state.checkpointTs).toBe(T0 - 5_000);
  });

  it('does not credit twice for the same timestamp', () => {
    const first = advance(counting(), sec(10), {}, OPTIONS);
    const second = advance(first.state, sec(10), {}, OPTIONS);
    expect(creditedMs(first.credit)).toBe(10_000);
    expect(second.credit).toBeNull();
  });

  it('ignores badly typed observations', () => {
    const { state } = advance(
      counting(),
      sec(1),
      { activeDomain: 42, windowFocused: 'yes', idleState: 'sleeping', audible: 1 },
      OPTIONS,
    );
    expect(state.activeDomain).toBe('github.com');
    expect(state.windowFocused).toBe(true);
    expect(state.idleState).toBe('active');
    expect(state.audible).toBe(false);
  });

  it('does not mutate the previous state object', () => {
    const before = counting();
    const snapshot = { ...before };
    advance(before, sec(10), { activeDomain: 'a.com', windowFocused: false }, OPTIONS);
    expect(before).toEqual(snapshot);
  });
});

describe('advance: randomised comparison against an independent oracle', () => {
  // Deterministic PRNG (mulberry32) so failures are reproducible.
  function prng(seed) {
    let a = seed;
    return () => {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  it.each([1, 2, 3, 42, 2026])('never double counts or drops time (seed %i)', (seed) => {
    const random = prng(seed);
    const pick = (list) => list[Math.floor(random() * list.length)];

    // Start 20 minutes before midnight so the run crosses a day boundary.
    const start = new Date(2026, 10, 7, 23, 40, 0).getTime();
    const countAudible = seed % 2 === 0;
    const options = { countAudibleTabsAsActive: countAudible };

    let state = { ...createInitialState(start), activeDomain: 'a.com', windowFocused: true };
    let now = start;

    const oracle = {}; // independent bookkeeping, no calls into tracker code
    const credited = {};
    let hourlySum = 0;

    for (let i = 0; i < 400; i += 1) {
      const step = 1000 * (1 + Math.floor(random() * 90)); // 1-90 s, below the gap limit
      now += step;

      // Oracle: was the PREVIOUS state countable during this step?
      const counted =
        state.activeDomain !== null &&
        state.windowFocused &&
        (state.idleState === 'active' ||
          (countAudible && state.audible && state.idleState === 'idle'));
      if (counted) oracle[state.activeDomain] = (oracle[state.activeDomain] ?? 0) + step;

      const observed =
        random() < 0.3
          ? {}
          : {
              activeDomain: pick(['a.com', 'b.com', 'c.com', null]),
              windowFocused: random() > 0.25,
              idleState: pick(['active', 'active', 'idle', 'locked']),
              audible: random() > 0.5,
            };

      const result = advance(state, now, observed, options);
      if (result.credit) {
        const ms = creditedMs(result.credit);
        credited[result.credit.domain] = (credited[result.credit.domain] ?? 0) + ms;
        hourlySum += ms;
      }
      state = result.state;
    }

    expect(credited).toEqual(oracle);
    expect(hourlySum).toBe(Object.values(oracle).reduce((a, b) => a + b, 0));
  });
});

describe('resolveTrackedDomain', () => {
  const settings = { trackLocalHosts: true };

  it('returns the normalised domain of a normal tab', () => {
    expect(resolveTrackedDomain({ url: 'https://www.github.com/x' }, settings)).toBe('github.com');
  });

  it('returns null for missing tabs and unsupported pages', () => {
    expect(resolveTrackedDomain(undefined, settings)).toBeNull();
    expect(resolveTrackedDomain(null, settings)).toBeNull();
    expect(resolveTrackedDomain({}, settings)).toBeNull();
    expect(resolveTrackedDomain({ url: 'chrome://extensions' }, settings)).toBeNull();
    expect(resolveTrackedDomain({ url: 'file:///C:/a.txt' }, settings)).toBeNull();
  });

  it('never tracks incognito tabs', () => {
    expect(
      resolveTrackedDomain({ url: 'https://github.com/', incognito: true }, settings),
    ).toBeNull();
  });

  it('honours the trackLocalHosts setting', () => {
    const tab = { url: 'http://localhost:3000/' };
    expect(resolveTrackedDomain(tab, { trackLocalHosts: true })).toBe('localhost');
    expect(resolveTrackedDomain(tab, { trackLocalHosts: false })).toBeNull();
    expect(
      resolveTrackedDomain({ url: 'http://192.168.0.2/' }, { trackLocalHosts: false }),
    ).toBeNull();
    expect(resolveTrackedDomain({ url: 'https://github.com/' }, { trackLocalHosts: false })).toBe(
      'github.com',
    );
  });
});

describe('sanitizeState', () => {
  it('accepts a valid state', () => {
    const state = counting();
    expect(sanitizeState(JSON.parse(JSON.stringify(state)))).toEqual(state);
  });

  it('rejects unusable input', () => {
    expect(sanitizeState(null)).toBeNull();
    expect(sanitizeState('x')).toBeNull();
    expect(sanitizeState({})).toBeNull();
    expect(sanitizeState({ checkpointTs: 'now' })).toBeNull();
  });

  it('repairs bad fields while keeping a valid checkpoint', () => {
    expect(
      sanitizeState({ checkpointTs: 5, activeDomain: 7, idleState: 'x', windowFocused: 'y' }),
    ).toEqual({
      activeDomain: null,
      windowFocused: false,
      idleState: 'active',
      audible: false,
      checkpointTs: 5,
    });
  });
});
