import { describe, expect, it } from 'vitest';
import {
  FOCUS_PHASES as P,
  FOCUS_STATUS as S,
  MINUTE_MS,
  createPhase,
  describeClock,
  filledDots,
  formatClock,
  isDue,
  newSessionId,
  nextPhaseAfter,
  pausePhase,
  phaseMinutes,
  progressAt,
  remainingAt,
  sanitizeFocusState,
  startPhase,
  timerActions,
  timerView,
  withCompletedSession,
} from '../src/shared/focus.js';

const settings = {
  focusMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  longBreakEvery: 4,
};
const T0 = 1_700_000_000_000;
const focus25 = () => createPhase({ phase: P.FOCUS, durationMs: 25 * MINUTE_MS, sessionId: 'abc' });

describe('phases', () => {
  it('creates a phase that is ready but not started', () => {
    expect(focus25()).toEqual({
      phase: 'focus',
      status: 'ready',
      durationMs: 25 * MINUTE_MS,
      remainingMs: 25 * MINUTE_MS,
      startedAt: null,
      endsAt: null,
      cycle: 0,
      sessionId: 'abc',
    });
  });

  it('reads the planned length from the settings', () => {
    expect(phaseMinutes(P.FOCUS, settings)).toBe(25);
    expect(phaseMinutes(P.SHORT_BREAK, settings)).toBe(5);
    expect(phaseMinutes(P.LONG_BREAK, settings)).toBe(15);
  });

  it('gives each new session its own short id', () => {
    const ids = new Set(Array.from({ length: 50 }, newSessionId));
    expect(ids.size).toBe(50);
    for (const id of ids) expect(id).toMatch(/^[0-9a-z]{1,10}$/);
  });
});

describe('running, pausing and resuming', () => {
  it('counts down from the moment it starts', () => {
    const running = startPhase(focus25(), T0);
    expect(running).toMatchObject({
      status: S.RUNNING,
      startedAt: T0,
      endsAt: T0 + 25 * MINUTE_MS,
    });
    expect(remainingAt(running, T0)).toBe(25 * MINUTE_MS);
    expect(remainingAt(running, T0 + 10 * MINUTE_MS)).toBe(15 * MINUTE_MS);
    expect(progressAt(running, T0 + 10 * MINUTE_MS)).toBeCloseTo(0.4);
  });

  it('is due exactly at its end, not before', () => {
    const running = startPhase(focus25(), T0);
    expect(isDue(running, T0 + 25 * MINUTE_MS - 1)).toBe(false);
    expect(isDue(running, T0 + 25 * MINUTE_MS)).toBe(true);
    expect(isDue(running, T0 + 3 * 3_600_000)).toBe(true); // asleep for hours
  });

  it('never goes below zero', () => {
    const running = startPhase(focus25(), T0);
    expect(remainingAt(running, T0 + 99 * MINUTE_MS)).toBe(0);
    expect(progressAt(running, T0 + 99 * MINUTE_MS)).toBe(1);
  });

  it('never shows more than the planned time when the clock moves backwards', () => {
    const running = startPhase(focus25(), T0);
    expect(remainingAt(running, T0 - 2 * 3_600_000)).toBe(25 * MINUTE_MS);
    expect(isDue(running, T0 - 2 * 3_600_000)).toBe(false);
  });

  it('keeps the time left when paused, and does not run down while paused', () => {
    const paused = pausePhase(startPhase(focus25(), T0), T0 + 10 * MINUTE_MS);
    expect(paused).toMatchObject({ status: S.PAUSED, remainingMs: 15 * MINUTE_MS, endsAt: null });
    expect(remainingAt(paused, T0 + 5 * 3_600_000)).toBe(15 * MINUTE_MS);
    expect(isDue(paused, T0 + 5 * 3_600_000)).toBe(false);
  });

  it('resumes with exactly the time that was left', () => {
    const paused = pausePhase(startPhase(focus25(), T0), T0 + 10 * MINUTE_MS);
    const resumedAt = T0 + 2 * 3_600_000;
    const resumed = startPhase(paused, resumedAt);
    expect(resumed.endsAt).toBe(resumedAt + 15 * MINUTE_MS);
    expect(remainingAt(resumed, resumedAt)).toBe(15 * MINUTE_MS);
  });

  it('survives several pauses without losing or gaining time', () => {
    let state = startPhase(focus25(), T0);
    state = pausePhase(state, T0 + 5 * MINUTE_MS); // 20 left
    state = startPhase(state, T0 + 60 * MINUTE_MS);
    state = pausePhase(state, T0 + 65 * MINUTE_MS); // 15 left
    expect(state.remainingMs).toBe(15 * MINUTE_MS);
  });

  it('ignores pausing something that is not running, and starting something already running', () => {
    const ready = focus25();
    expect(pausePhase(ready, T0)).toBe(ready);
    const running = startPhase(ready, T0);
    expect(startPhase(running, T0 + 5 * MINUTE_MS)).toBe(running);
  });
});

describe('the cycle', () => {
  it('follows a focus session with a short break, and every fourth with a long one', () => {
    let state = { ...focus25(), cycle: 0 };
    const seen = [];
    for (let i = 0; i < 8; i += 1) {
      const afterFocus = nextPhaseAfter(state, settings);
      seen.push(afterFocus.phase);
      const afterBreak = nextPhaseAfter({ ...afterFocus }, settings);
      seen.push(afterBreak.phase);
      state = { ...afterBreak };
    }
    expect(seen).toEqual([
      'shortBreak',
      'focus',
      'shortBreak',
      'focus',
      'shortBreak',
      'focus',
      'longBreak',
      'focus',
      'shortBreak',
      'focus',
      'shortBreak',
      'focus',
      'shortBreak',
      'focus',
      'longBreak',
      'focus',
    ]);
  });

  it('uses the break lengths from the settings', () => {
    expect(nextPhaseAfter({ phase: P.FOCUS, cycle: 0 }, settings)).toEqual({
      phase: 'shortBreak',
      durationMs: 5 * MINUTE_MS,
      cycle: 1,
    });
    expect(nextPhaseAfter({ phase: P.FOCUS, cycle: 3 }, settings)).toEqual({
      phase: 'longBreak',
      durationMs: 15 * MINUTE_MS,
      cycle: 4,
    });
  });

  it('starts the count again after a long break, and keeps it after a short one', () => {
    expect(nextPhaseAfter({ phase: P.LONG_BREAK, cycle: 4 }, settings)).toMatchObject({
      phase: 'focus',
      cycle: 0,
    });
    expect(nextPhaseAfter({ phase: P.SHORT_BREAK, cycle: 2 }, settings)).toMatchObject({
      phase: 'focus',
      cycle: 2,
    });
  });

  it('honours a different long-break interval', () => {
    const everyTwo = { ...settings, longBreakEvery: 2 };
    expect(nextPhaseAfter({ phase: P.FOCUS, cycle: 1 }, everyTwo).phase).toBe('longBreak');
  });

  it.each([
    [0, 0],
    [1, 1],
    [3, 3],
    [4, 4],
    [5, 1],
  ])('shows %i completed sessions as %i filled dots of 4', (cycle, filled) => {
    expect(filledDots(cycle, 4)).toBe(filled);
  });
});

describe('sanitizeFocusState', () => {
  const running = startPhase(focus25(), T0);
  const paused = pausePhase(running, T0 + 5 * MINUTE_MS);

  it('accepts valid ready, running and paused states unchanged', () => {
    expect(sanitizeFocusState(focus25())).toEqual(focus25());
    expect(sanitizeFocusState(running)).toEqual(running);
    expect(sanitizeFocusState(paused)).toEqual(paused);
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['a string', 'running'],
    ['a number', 7],
    ['an empty object', {}],
    ['an unknown phase', { ...running, phase: 'nap' }],
    ['an unknown status', { ...running, status: 'sleeping' }],
    ['a duration that is too short', { ...running, durationMs: 1000 }],
    ['a duration that is too long', { ...running, durationMs: 9 * 3_600_000 }],
    ['a duration that is not a number', { ...running, durationMs: '1500000' }],
    ['an infinite duration', { ...running, durationMs: Infinity }],
    ['a running phase without an end', { ...running, endsAt: null }],
    ['a running phase with a NaN end', { ...running, endsAt: NaN }],
    ['a paused phase with negative time left', { ...paused, remainingMs: -1 }],
    [
      'a paused phase with more time than planned',
      { ...paused, remainingMs: paused.durationMs + 1 },
    ],
    ['a fractional cycle', { ...running, cycle: 1.5 }],
    ['a negative cycle', { ...running, cycle: -1 }],
    ['an absurd cycle', { ...running, cycle: 500 }],
    ['an empty session id', { ...running, sessionId: '' }],
    ['a very long session id', { ...running, sessionId: 'x'.repeat(41) }],
    ['a session id that is not text', { ...running, sessionId: 12 }],
  ])('treats %s as no timer', (_name, raw) => {
    expect(sanitizeFocusState(raw)).toBeNull();
  });

  it('drops unexpected fields', () => {
    expect(sanitizeFocusState({ ...running, extra: '<script>', __proto__: { x: 1 } })).toEqual(
      running,
    );
  });

  it('keeps a running phase usable when only the informational remaining time is bad', () => {
    expect(sanitizeFocusState({ ...running, remainingMs: 'oops' })).toMatchObject({
      status: 'running',
      remainingMs: running.durationMs,
    });
  });
});

describe('withCompletedSession', () => {
  it('adds a session, its time, and tracks the longest', () => {
    const day = {
      date: '2026-11-07',
      sessions: 2,
      focusMs: 50 * MINUTE_MS,
      longestMs: 25 * MINUTE_MS,
    };
    expect(withCompletedSession(day, 45 * MINUTE_MS)).toEqual({
      date: '2026-11-07',
      sessions: 3,
      focusMs: 95 * MINUTE_MS,
      longestMs: 45 * MINUTE_MS,
    });
    expect(withCompletedSession(day, 10 * MINUTE_MS).longestMs).toBe(25 * MINUTE_MS);
  });

  it('does not change the record it was given', () => {
    const day = { date: '2026-11-07', sessions: 0, focusMs: 0, longestMs: 0 };
    withCompletedSession(day, MINUTE_MS);
    expect(day.sessions).toBe(0);
  });
});

describe('clock text', () => {
  it.each([
    [25 * MINUTE_MS, '25:00'],
    [24 * MINUTE_MS + 31_000, '24:31'],
    [61_000, '1:01'],
    [999, '0:01'], // rounds up, so 0:00 only appears when it is really over
    [1, '0:01'],
    [0, '0:00'],
    [-5000, '0:00'],
    [120 * MINUTE_MS, '120:00'],
  ])('formats %i ms as %s', (ms, text) => {
    expect(formatClock(ms)).toBe(text);
  });

  it.each([
    [25 * MINUTE_MS, '25 minutes'],
    [60_000, '1 minute'],
    [61_000, '1 minute 1 second'],
    [45_000, '45 seconds'],
    [1000, '1 second'],
    [0, '0 seconds'],
  ])('describes %i ms as "%s" for screen readers', (ms, text) => {
    expect(describeClock(ms)).toBe(text);
  });
});

describe('timerView', () => {
  const running = startPhase(focus25(), T0);

  it('offers the next focus session as ready when there is no timer', () => {
    expect(timerView(null, 45, T0)).toEqual({
      timeMs: 45 * MINUTE_MS,
      fraction: 0,
      phaseText: 'Ready',
      noteText: '45-minute focus session',
      tone: 'idle',
    });
  });

  it('shows a running focus session counting down', () => {
    expect(timerView(running, 25, T0 + 10 * MINUTE_MS)).toMatchObject({
      timeMs: 15 * MINUTE_MS,
      phaseText: 'Focus',
      noteText: '25-minute session',
      tone: 'focus',
    });
    expect(timerView(running, 25, T0 + 10 * MINUTE_MS).fraction).toBeCloseTo(0.4);
  });

  it('marks a break differently from a focus session, in words as well as tone', () => {
    const shortBreak = startPhase(
      createPhase({ phase: P.SHORT_BREAK, durationMs: 5 * MINUTE_MS }),
      T0,
    );
    expect(timerView(shortBreak, 25, T0)).toMatchObject({
      phaseText: 'Short break',
      noteText: '5-minute break',
      tone: 'break',
    });
    const longBreak = startPhase(
      createPhase({ phase: P.LONG_BREAK, durationMs: 15 * MINUTE_MS }),
      T0,
    );
    expect(timerView(longBreak, 25, T0).phaseText).toBe('Long break');
  });

  it('shows a paused phase frozen', () => {
    const paused = pausePhase(running, T0 + 10 * MINUTE_MS);
    expect(timerView(paused, 25, T0 + 5 * 3_600_000)).toMatchObject({
      timeMs: 15 * MINUTE_MS,
      phaseText: 'Focus paused',
      tone: 'paused',
    });
  });

  it('shows a phase that is waiting to start with its full length and no progress', () => {
    const ready = createPhase({ phase: P.SHORT_BREAK, durationMs: 5 * MINUTE_MS });
    expect(timerView(ready, 25, T0)).toMatchObject({
      timeMs: 5 * MINUTE_MS,
      fraction: 0,
      phaseText: 'Short break ready',
      noteText: 'Ready when you are',
      tone: 'idle',
    });
  });
});

describe('timerActions', () => {
  const labels = (state) => timerActions(state).map((item) => item.label);
  const running = startPhase(focus25(), T0);

  it('offers Start focus when there is no timer', () => {
    expect(timerActions(null)).toEqual([
      { action: 'start', label: 'Start focus', icon: 'play', primary: true },
    ]);
  });

  it('offers Pause and Stop while a focus session runs, and Resume and Stop when paused', () => {
    expect(labels(running)).toEqual(['Pause', 'Stop']);
    expect(labels(pausePhase(running, T0 + MINUTE_MS))).toEqual(['Resume', 'Stop']);
  });

  it('adds Skip break only during breaks', () => {
    const breakRunning = startPhase(
      createPhase({ phase: P.SHORT_BREAK, durationMs: 5 * MINUTE_MS }),
      T0,
    );
    expect(labels(breakRunning)).toEqual(['Pause', 'Skip break', 'Stop']);
    expect(labels(running)).not.toContain('Skip break');
  });

  it('names the break that is ready to start', () => {
    expect(labels(createPhase({ phase: P.SHORT_BREAK, durationMs: 5 * MINUTE_MS }))).toEqual([
      'Start break',
      'Skip break',
      'Stop',
    ]);
    expect(labels(createPhase({ phase: P.LONG_BREAK, durationMs: 15 * MINUTE_MS }))).toEqual([
      'Start long break',
      'Skip break',
      'Stop',
    ]);
    expect(labels(focus25())).toEqual(['Start focus', 'Stop']);
  });

  it('always makes the first action the primary one, and every action a real command', () => {
    for (const state of [null, focus25(), running, pausePhase(running, T0)]) {
      const actions = timerActions(state);
      expect(actions[0].primary).toBe(true);
      for (const item of actions)
        expect(['start', 'pause', 'resume', 'stop', 'skip']).toContain(item.action);
    }
  });
});
