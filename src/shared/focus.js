/**
 * The focus timer, as pure functions: no storage, no Chrome, no clocks of their own.
 *
 * A "phase" is one stretch of the cycle: a focus session, a short break, or a long break.
 * Time is always computed from timestamps, never counted tick by tick, so the timer stays
 * correct when the popup closes, the service worker is suspended, or Chrome restarts.
 *
 *   ready    chosen but not started (for example the break that follows a session)
 *   running  counting down to `endsAt`
 *   paused   frozen with `remainingMs` left
 *
 * If the system clock is changed while a phase runs, the timer follows the clock: moving
 * it back never shows more than the planned duration, and moving it forward can finish a
 * phase early. The timer measures elapsed clock time, not attention.
 */

export const MINUTE_MS = 60_000;

export const FOCUS_PHASES = Object.freeze({
  FOCUS: 'focus',
  SHORT_BREAK: 'shortBreak',
  LONG_BREAK: 'longBreak',
});

export const FOCUS_STATUS = Object.freeze({
  READY: 'ready',
  RUNNING: 'running',
  PAUSED: 'paused',
});

/** Bounds for stored state: a corrupt value outside them is ignored, not trusted. */
const MIN_DURATION_MS = MINUTE_MS;
const MAX_DURATION_MS = 3 * 60 * MINUTE_MS;
const MAX_CYCLE = 99;

const isPhase = (value) => Object.values(FOCUS_PHASES).includes(value);
const isStatus = (value) => Object.values(FOCUS_STATUS).includes(value);
const isFiniteNumber = (value) => typeof value === 'number' && Number.isFinite(value);

export function newSessionId() {
  const random = globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
  return random.replaceAll('-', '').slice(0, 10);
}

/**
 * Planned minutes for a phase, from the settings.
 * @param {string} phase
 * @param {{focusMinutes: number, shortBreakMinutes: number, longBreakMinutes: number}} settings
 */
export function phaseMinutes(phase, settings) {
  if (phase === FOCUS_PHASES.SHORT_BREAK) return settings.shortBreakMinutes;
  if (phase === FOCUS_PHASES.LONG_BREAK) return settings.longBreakMinutes;
  return settings.focusMinutes;
}

/**
 * A phase that is chosen but not started.
 * @param {{phase: string, durationMs: number, cycle?: number, sessionId?: string}} input
 */
export function createPhase({ phase, durationMs, cycle = 0, sessionId = newSessionId() }) {
  return {
    phase,
    status: FOCUS_STATUS.READY,
    durationMs,
    remainingMs: durationMs,
    startedAt: null,
    endsAt: null,
    cycle,
    sessionId,
  };
}

/** Starts a ready phase, or resumes a paused one. Does nothing if it is already running. */
export function startPhase(state, now) {
  if (state.status === FOCUS_STATUS.RUNNING) return state;
  return {
    ...state,
    status: FOCUS_STATUS.RUNNING,
    startedAt: now,
    endsAt: now + state.remainingMs,
  };
}

/** Freezes a running phase with whatever time is left. */
export function pausePhase(state, now) {
  if (state.status !== FOCUS_STATUS.RUNNING) return state;
  return {
    ...state,
    status: FOCUS_STATUS.PAUSED,
    remainingMs: remainingAt(state, now),
    startedAt: null,
    endsAt: null,
  };
}

/**
 * Milliseconds left. Never negative, and never more than the planned duration even if the
 * clock moved backwards.
 */
export function remainingAt(state, now) {
  if (state.status !== FOCUS_STATUS.RUNNING) return state.remainingMs;
  return Math.min(state.durationMs, Math.max(0, state.endsAt - now));
}

/** How far through the phase, from 0 to 1. */
export function progressAt(state, now) {
  return 1 - remainingAt(state, now) / state.durationMs;
}

/** Whether a running phase has reached its end. */
export function isDue(state, now) {
  return state.status === FOCUS_STATUS.RUNNING && now >= state.endsAt;
}

/**
 * The phase that follows a finished one. After every `longBreakEvery`-th focus session the
 * break is a long one, and the count starts again after it.
 *
 * @param {{phase: string, cycle: number}} state the phase that just finished
 * @param {object} settings
 * @returns {{phase: string, durationMs: number, cycle: number}}
 */
export function nextPhaseAfter(state, settings) {
  if (state.phase === FOCUS_PHASES.FOCUS) {
    const cycle = state.cycle + 1;
    const phase =
      cycle % settings.longBreakEvery === 0 ? FOCUS_PHASES.LONG_BREAK : FOCUS_PHASES.SHORT_BREAK;
    return { phase, durationMs: phaseMinutes(phase, settings) * MINUTE_MS, cycle };
  }
  return {
    phase: FOCUS_PHASES.FOCUS,
    durationMs: settings.focusMinutes * MINUTE_MS,
    cycle: state.phase === FOCUS_PHASES.LONG_BREAK ? 0 : state.cycle,
  };
}

/** How many dots of the current set are filled (0 to `every`). */
export function filledDots(cycle, every) {
  return cycle <= 0 ? 0 : ((cycle - 1) % every) + 1;
}

/**
 * Validates state read from storage. Anything that does not make sense becomes null (no
 * timer) rather than a timer that behaves strangely.
 * @param {unknown} raw
 */
export function sanitizeFocusState(raw) {
  if (raw === null || typeof raw !== 'object') return null;
  const { phase, status, durationMs, remainingMs, startedAt, endsAt, cycle, sessionId } = raw;

  if (!isPhase(phase) || !isStatus(status)) return null;
  if (!isFiniteNumber(durationMs) || durationMs < MIN_DURATION_MS || durationMs > MAX_DURATION_MS) {
    return null;
  }
  if (!Number.isInteger(cycle) || cycle < 0 || cycle > MAX_CYCLE) return null;
  if (typeof sessionId !== 'string' || sessionId.length === 0 || sessionId.length > 40) return null;

  if (status === FOCUS_STATUS.RUNNING) {
    if (!isFiniteNumber(endsAt) || !isFiniteNumber(startedAt)) return null;
    return {
      phase,
      status,
      durationMs,
      remainingMs: isFiniteNumber(remainingMs)
        ? Math.min(durationMs, Math.max(0, remainingMs))
        : durationMs,
      startedAt,
      endsAt,
      cycle,
      sessionId,
    };
  }

  if (!isFiniteNumber(remainingMs) || remainingMs < 0 || remainingMs > durationMs) return null;
  return {
    phase,
    status,
    durationMs,
    remainingMs,
    startedAt: null,
    endsAt: null,
    cycle,
    sessionId,
  };
}

/**
 * A day's record with one more completed focus session.
 * @param {{date: string, sessions: number, focusMs: number, longestMs: number}} day
 * @param {number} durationMs
 */
export function withCompletedSession(day, durationMs) {
  return {
    date: day.date,
    sessions: day.sessions + 1,
    focusMs: day.focusMs + durationMs,
    longestMs: Math.max(day.longestMs, durationMs),
  };
}

/**
 * "24:31". Rounds up, so the clock shows 0:01 until the phase has truly finished.
 * @param {number} ms
 */
export function formatClock(ms) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
}

/** Spoken form for assistive technology: "24 minutes 31 seconds". */
export function describeClock(ms) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const part = (value, unit) => `${value} ${unit}${value === 1 ? '' : 's'}`;
  if (minutes === 0) return part(seconds, 'second');
  return seconds === 0
    ? part(minutes, 'minute')
    : `${part(minutes, 'minute')} ${part(seconds, 'second')}`;
}

/** Display names for the phases. */
export const PHASE_LABELS = Object.freeze({
  [FOCUS_PHASES.FOCUS]: 'Focus',
  [FOCUS_PHASES.SHORT_BREAK]: 'Short break',
  [FOCUS_PHASES.LONG_BREAK]: 'Long break',
});

/**
 * What to show for a timer state: used by the dashboard page and the popup so they always
 * agree. With no timer, it shows the next focus session as ready to start.
 *
 * @param {object|null} state
 * @param {number} focusMinutes the length of the next focus session
 * @param {number} now
 * @returns {{timeMs: number, fraction: number, phaseText: string, noteText: string,
 *            tone: 'idle'|'focus'|'break'|'paused'}}
 */
export function timerView(state, focusMinutes, now) {
  if (state === null) {
    return {
      timeMs: focusMinutes * MINUTE_MS,
      fraction: 0,
      phaseText: 'Ready',
      noteText: `${focusMinutes}-minute focus session`,
      tone: 'idle',
    };
  }

  const label = PHASE_LABELS[state.phase];
  const isFocus = state.phase === FOCUS_PHASES.FOCUS;
  const minutes = Math.round(state.durationMs / MINUTE_MS);

  if (state.status === FOCUS_STATUS.READY) {
    return {
      timeMs: state.remainingMs,
      fraction: 0,
      phaseText: `${label} ready`,
      noteText: 'Ready when you are',
      tone: 'idle',
    };
  }

  return {
    timeMs: remainingAt(state, now),
    fraction: progressAt(state, now),
    phaseText: state.status === FOCUS_STATUS.PAUSED ? `${label} paused` : label,
    noteText: `${minutes}-minute ${isFocus ? 'session' : 'break'}`,
    tone: state.status === FOCUS_STATUS.PAUSED ? 'paused' : isFocus ? 'focus' : 'break',
  };
}

/**
 * The buttons a timer state offers, in order. The first is the primary one.
 * @param {object|null} state
 * @returns {{action: string, label: string, icon: string, primary?: boolean}[]}
 */
export function timerActions(state) {
  if (state === null)
    return [{ action: 'start', label: 'Start focus', icon: 'play', primary: true }];

  const isBreak = state.phase !== FOCUS_PHASES.FOCUS;
  const stop = { action: 'stop', label: 'Stop', icon: 'square' };
  const skip = { action: 'skip', label: 'Skip break', icon: 'skip-forward' };

  if (state.status === FOCUS_STATUS.READY) {
    const label = !isBreak
      ? 'Start focus'
      : state.phase === FOCUS_PHASES.LONG_BREAK
        ? 'Start long break'
        : 'Start break';
    return [
      { action: 'start', label, icon: isBreak ? 'coffee' : 'play', primary: true },
      ...(isBreak ? [skip] : []),
      stop,
    ];
  }
  if (state.status === FOCUS_STATUS.PAUSED) {
    return [{ action: 'resume', label: 'Resume', icon: 'play', primary: true }, stop];
  }
  return [
    { action: 'pause', label: 'Pause', icon: 'pause', primary: true },
    ...(isBreak ? [skip] : []),
    stop,
  ];
}
