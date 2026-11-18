import {
  GOAL_RESULTS,
  badgeStats,
  focusTotals,
  goalStreaks,
  newlyEarned,
  sanitizeAchievements,
} from '../shared/achievements.js';
import { shiftDateKey } from '../shared/dates.js';
import {
  FOCUS_PHASES,
  FOCUS_STATUS,
  createPhase,
  isDue,
  nextPhaseAfter,
  pausePhase,
  phaseMinutes,
  sanitizeFocusState,
  startPhase,
  withCompletedSession,
  MINUTE_MS,
} from '../shared/focus.js';
import { FOCUS_ACTIONS } from '../shared/focus-client.js';
import { sanitizeGoals } from '../shared/limits.js';
import { showBadgeNotification, showFocusNotification } from '../shared/notifier.js';
import { totalMs } from '../shared/stats.js';
import { withStorageLock } from '../shared/storage/lock.js';
import { STORAGE_KEYS } from '../shared/storage/schema.js';
import { getSettings } from '../shared/storage/settings-repo.js';
import { focusDayKey, focusDaysFrom, sanitizeFocusDay } from '../shared/storage/focus-repo.js';
import { toLocalDateKey } from '../shared/time.js';
import { reportFailure } from './errors.js';

/**
 * The focus timer in the service worker, which is the only place its state changes.
 *
 * Every command runs inside the worker's task queue and the storage lock. The important
 * rule: finishing a phase writes the new timer state AND the day's session count in one
 * storage call. If the worker were interrupted halfway, a session could otherwise be
 * counted twice on the next wake.
 *
 * Completion does not depend on one alarm being on time. Chrome limits alarms to once
 * per 30 seconds and may delay them, so three things all settle a finished phase: the
 * phase's own alarm, the 30-second heartbeat, and any command or `sync` from the UI.
 * Settling is idempotent: a phase that has already been settled is not due any more.
 */

export const FOCUS_ALARM = 'browsewise-focus';

/** A completion older than this is recorded but not announced with a notification. */
export const STALE_NOTIFICATION_MS = 5 * MINUTE_MS;

/** A command the user can reasonably send but that cannot be done now. Not a failure. */
export class FocusCommandError extends Error {
  expected = true;
}

/* ---------- state transitions ---------- */

/** What follows a phase that just finished (the next phase starts only if the user chose that). */
function settlePhase(state, settings, now) {
  const completion = {
    phase: state.phase,
    durationMs: state.durationMs,
    endedAt: state.endsAt,
    sessionId: state.sessionId,
  };
  const next = createPhase(nextPhaseAfter(state, settings));
  return { state: settings.autoStartNext ? startPhase(next, now) : next, completion };
}

const COMMANDS = {
  start(state, settings, now) {
    if (state === null) {
      const phase = createPhase({
        phase: FOCUS_PHASES.FOCUS,
        durationMs: phaseMinutes(FOCUS_PHASES.FOCUS, settings) * MINUTE_MS,
      });
      return startPhase(phase, now);
    }
    // Ready (for example a break) starts; running or paused is left as it is.
    return state.status === FOCUS_STATUS.READY ? startPhase(state, now) : state;
  },

  pause: (state, _settings, now) => (state ? pausePhase(state, now) : null),

  resume: (state, _settings, now) =>
    state?.status === FOCUS_STATUS.PAUSED ? startPhase(state, now) : state,

  stop: () => null,

  skip(state, settings, now) {
    if (state === null || state.phase === FOCUS_PHASES.FOCUS) {
      throw new FocusCommandError('Only a break can be skipped. Use Stop to end a focus session.');
    }
    const next = createPhase(nextPhaseAfter(state, settings));
    return settings.autoStartNext ? startPhase(next, now) : next;
  },

  sync: (state) => state,
};

/**
 * Runs one command: settles a phase that has finished, applies the command, and saves the
 * result (with the day's session count, if a focus session just finished) in one write.
 */
async function transact(now, action) {
  let outcome;

  await withStorageLock(async () => {
    const settings = await getSettings();
    let state = await readState();
    let completion = null;

    if (state && isDue(state, now)) ({ state, completion } = settlePhase(state, settings, now));
    const next = COMMANDS[action](state, settings, now);

    // null is stored as an explicit "no timer", so clearing it and recording a session
    // can still happen in a single call.
    const writes = { [STORAGE_KEYS.FOCUS_STATE]: next };
    if (completion?.phase === FOCUS_PHASES.FOCUS) {
      const dateKey = toLocalDateKey(completion.endedAt);
      const stored = await chrome.storage.local.get(focusDayKey(dateKey));
      const day = sanitizeFocusDay(stored[focusDayKey(dateKey)], dateKey);
      writes[focusDayKey(dateKey)] = withCompletedSession(day, completion.durationMs);
    }
    await chrome.storage.local.set(writes);

    outcome = { state: next, completion, settings };
  });

  return outcome;
}

async function readState() {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.FOCUS_STATE);
  return sanitizeFocusState(stored[STORAGE_KEYS.FOCUS_STATE]);
}

/* ---------- alarm ---------- */

/** One alarm, set for the end of a running phase and removed otherwise. */
export async function syncFocusAlarm(state) {
  try {
    if (state?.status === FOCUS_STATUS.RUNNING) {
      await chrome.alarms.create(FOCUS_ALARM, { when: state.endsAt });
    } else {
      await chrome.alarms.clear(FOCUS_ALARM);
    }
  } catch (error) {
    reportFailure('focus alarm', error);
  }
}

/** For worker start-up: make the alarm match what is stored. */
export async function restoreFocusAlarm() {
  await syncFocusAlarm(await readState());
}

/* ---------- public commands ---------- */

/**
 * @param {'start'|'pause'|'resume'|'stop'|'skip'|'sync'} action
 * @param {{now?: number}} [options]
 * @returns {Promise<{state: object|null}>} the timer after the command
 */
export async function runFocusCommand(action, { now = Date.now() } = {}) {
  if (!FOCUS_ACTIONS.includes(action)) throw new FocusCommandError('Unknown focus action.');

  const { state, completion, settings } = await transact(now, action);
  await syncFocusAlarm(state);
  if (completion) await afterCompletion({ completion, state, settings, now });
  return { state };
}

/**
 * Called on every heartbeat. Cheap when nothing is due: one small read. It settles a phase
 * whose alarm was late, and closes finished days once a day.
 */
export async function focusTick({ now = Date.now() } = {}) {
  const stored = await chrome.storage.local.get([
    STORAGE_KEYS.FOCUS_STATE,
    STORAGE_KEYS.ACHIEVEMENTS,
  ]);
  const state = sanitizeFocusState(stored[STORAGE_KEYS.FOCUS_STATE]);

  if (state && isDue(state, now)) {
    await runFocusCommand('sync', { now });
    return;
  }

  const yesterday = shiftDateKey(toLocalDateKey(now), -1);
  if (sanitizeAchievements(stored[STORAGE_KEYS.ACHIEVEMENTS]).lastClosed !== yesterday) {
    await refreshAchievements({ now });
  }
}

/* ---------- achievements ---------- */

/**
 * Brings the achievements up to date from what is stored: records the goal result of each
 * finished day, updates best streaks, and awards any badge whose target is now reached.
 * It only reads stored history, so running it again changes nothing.
 *
 * Days are checked against the goal as it is when they are closed, which is normally the
 * next day. A day closed late (after the browser was off for a while) uses the goal at that
 * later time.
 *
 * @returns {Promise<{newBadges: object[]}>}
 */
export async function refreshAchievements({ now = Date.now() } = {}) {
  let newBadges = [];

  await withStorageLock(async () => {
    const everything = await chrome.storage.local.get(null);
    const achievements = sanitizeAchievements(everything[STORAGE_KEYS.ACHIEVEMENTS]);
    const todayKey = toLocalDateKey(now);
    const yesterdayKey = shiftDateKey(todayKey, -1);
    const goalMs = sanitizeGoals(everything.goals).dailyGoalMs;

    // 1. Goal result of every finished day that has not been closed yet.
    const days = { ...achievements.days };
    for (const key of Object.keys(everything)) {
      if (!key.startsWith(STORAGE_KEYS.USAGE_PREFIX)) continue;
      const dateKey = key.slice(STORAGE_KEYS.USAGE_PREFIX.length);
      if (dateKey >= todayKey || (achievements.lastClosed && dateKey <= achievements.lastClosed)) {
        continue;
      }
      const used = totalMs(everything[key]);
      const result =
        goalMs === null || !(used > 0)
          ? GOAL_RESULTS.SKIPPED
          : used <= goalMs
            ? GOAL_RESULTS.MET
            : GOAL_RESULTS.OVER;
      Object.defineProperty(days, dateKey, {
        value: result,
        enumerable: true,
        writable: true,
        configurable: true,
      });
    }

    // 2. Streaks and badges.
    const totals = focusTotals(focusDaysFrom(everything), todayKey);
    const goal = goalStreaks(days, todayKey);
    const best = {
      focus: Math.max(achievements.best.focus, totals.bestFocusStreak),
      goal: Math.max(achievements.best.goal, goal.best),
    };
    const stats = badgeStats({ totals, goal, best });
    newBadges = newlyEarned(stats, achievements.earned);

    const earned = { ...achievements.earned };
    for (const badge of newBadges) {
      Object.defineProperty(earned, badge.id, {
        value: todayKey,
        enumerable: true,
        writable: true,
        configurable: true,
      });
    }

    const next = { earned, best, days, lastClosed: yesterdayKey };
    if (JSON.stringify(next) !== JSON.stringify(achievements)) {
      await chrome.storage.local.set({ [STORAGE_KEYS.ACHIEVEMENTS]: next });
    }
  });

  return { newBadges };
}

/** After a phase finishes: update achievements, then announce it if notifications are on. */
async function afterCompletion({ completion, state, settings, now }) {
  let newBadges = [];
  if (completion.phase === FOCUS_PHASES.FOCUS) {
    try {
      ({ newBadges } = await refreshAchievements({ now }));
    } catch (error) {
      reportFailure('achievements', error);
    }
  }

  if (!settings.notificationsEnabled) return;
  if (now - completion.endedAt > STALE_NOTIFICATION_MS) return;

  try {
    await showFocusNotification({ completion, next: state });
    if (settings.showAchievements) {
      for (const badge of newBadges) await showBadgeNotification(badge);
    }
  } catch (error) {
    reportFailure('focus notification', error);
  }
}
