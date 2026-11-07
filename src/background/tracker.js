/**
 * Tracking engine core: a pure, side-effect-free state machine.
 *
 * It never calls Chrome APIs and never reads the clock. Callers pass in the
 * timestamp and the observed browser state, which makes every rule below
 * unit-testable without a browser.
 *
 * Accounting model
 * ----------------
 * Time is never counted by a timer. The state remembers `checkpointTs`, the last
 * moment already accounted for. On every call, `advance` does two things in a
 * fixed order:
 *
 *   1. FLUSH  - using the OLD state, decide whether the interval
 *               [checkpointTs, now) was countable, and if so credit it.
 *   2. MUTATE - apply the newly observed state and move checkpointTs to `now`.
 *
 * Flush-then-mutate is what prevents double counting: every millisecond is
 * credited at most once, to whatever state was true DURING it.
 */

import { getTrackableDomain, isLocalOrIpHost } from '../shared/domain.js';
import { splitIntoSegments } from '../shared/time.js';

/**
 * Longest interval we are willing to credit in one flush.
 *
 * The heartbeat alarm fires about every 30 s (Chrome's minimum), and Chrome may
 * delay alarms. A longer gap means the computer slept, Chrome was closed, or the
 * clock jumped, so the interval is discarded instead of being counted as activity.
 */
export const MAX_CREDIT_MS = 120_000;

export const IDLE_STATES = Object.freeze(['active', 'idle', 'locked']);

/** @typedef {'active'|'idle'|'locked'} IdleState */
/**
 * @typedef {object} TrackerState
 * @property {string|null} activeDomain  domain of the focused window's active tab, or null
 * @property {boolean} windowFocused     whether any Chrome window has OS focus
 * @property {IdleState} idleState
 * @property {boolean} audible           whether the active tab is playing audio
 * @property {number} checkpointTs       last timestamp already accounted for (epoch ms)
 */

/** @returns {TrackerState} */
export function createInitialState(now) {
  return {
    activeDomain: null,
    windowFocused: false,
    idleState: 'active',
    audible: false,
    checkpointTs: now,
  };
}

/**
 * Validates a state read back from storage. Returns null if it is unusable, in
 * which case the caller starts fresh.
 * @param {unknown} raw
 * @returns {TrackerState|null}
 */
export function sanitizeState(raw) {
  if (raw === null || typeof raw !== 'object') return null;
  if (!Number.isFinite(raw.checkpointTs)) return null;

  return {
    activeDomain:
      typeof raw.activeDomain === 'string' && raw.activeDomain !== '' ? raw.activeDomain : null,
    windowFocused: raw.windowFocused === true,
    idleState: IDLE_STATES.includes(raw.idleState) ? raw.idleState : 'active',
    audible: raw.audible === true,
    checkpointTs: raw.checkpointTs,
  };
}

/**
 * Maps a Chrome tab object to the domain we should track, or null.
 * Incognito tabs are never tracked, even if the user allows the extension there.
 *
 * @param {{url?: string, incognito?: boolean}|undefined|null} tab
 * @param {{trackLocalHosts: boolean}} settings
 * @returns {string|null}
 */
export function resolveTrackedDomain(tab, settings) {
  if (!tab || tab.incognito) return null;

  const domain = getTrackableDomain(tab.url);
  if (domain === null) return null;
  if (!settings.trackLocalHosts && isLocalOrIpHost(domain)) return null;
  return domain;
}

/**
 * Whether time is currently being earned, per the tracking rules:
 *   1. only the foreground tab of the focused window (activeDomain + windowFocused)
 *   2. not while the user is idle or the screen is locked
 *   3. optional exception: an audible tab may count while "idle" (never while locked)
 *
 * @param {TrackerState} state
 * @param {{countAudibleTabsAsActive: boolean}} options
 */
export function isCounting(state, options) {
  if (state.activeDomain === null || !state.windowFocused) return false;
  if (state.idleState === 'active') return true;
  return options.countAudibleTabsAsActive && state.audible && state.idleState === 'idle';
}

/** Copies only well-typed fields from an observation; anything else is ignored. */
function applyObservation(state, observed) {
  const next = { ...state };

  if (observed.activeDomain === null || typeof observed.activeDomain === 'string') {
    next.activeDomain = observed.activeDomain === '' ? null : observed.activeDomain;
  }
  if (typeof observed.windowFocused === 'boolean') next.windowFocused = observed.windowFocused;
  if (IDLE_STATES.includes(observed.idleState)) next.idleState = observed.idleState;
  if (typeof observed.audible === 'boolean') next.audible = observed.audible;

  return next;
}

/**
 * Flushes the interval since the last checkpoint, then applies new observations.
 *
 * @param {TrackerState} state state as of the last checkpoint
 * @param {number} now current time (epoch ms)
 * @param {Partial<Omit<TrackerState,'checkpointTs'>>} observed newly observed values;
 *        omitted fields keep their previous value (a heartbeat passes `{}`)
 * @param {{countAudibleTabsAsActive: boolean, maxCreditMs?: number}} options
 * @returns {{state: TrackerState, credit: {domain: string, segments: {dateKey: string, hour: number, ms: number}[]}|null}}
 */
export function advance(state, now, observed, options) {
  const maxCreditMs = options.maxCreditMs ?? MAX_CREDIT_MS;
  const elapsed = now - state.checkpointTs;

  let credit = null;
  // elapsed <= 0: the clock did not move forward, so there is nothing to credit.
  // elapsed > maxCreditMs: sleep / Chrome closed / clock jump, so the span is discarded.
  if (elapsed > 0 && elapsed <= maxCreditMs && isCounting(state, options)) {
    credit = {
      domain: state.activeDomain,
      segments: splitIntoSegments(state.checkpointTs, now),
    };
  }

  const next = applyObservation(state, observed);
  next.checkpointTs = now;
  return { state: next, credit };
}
