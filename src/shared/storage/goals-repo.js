import {
  MAX_SITE_LIMITS,
  computeLimitStatus,
  isValidLimitDomain,
  isValidLimitMs,
  sanitizeGoals,
  withSiteLimit,
} from '../limits.js';
import { toLocalDateKey } from '../time.js';
import { withStorageLock } from './lock.js';
import { getUsageForDate } from './usage-repo.js';

/**
 * Stores goals and limits, plus a small record of which limits already produced a
 * notification today (so each one notifies at most once per day).
 *
 *   goals         { dailyGoalMs: number|null, siteLimits: { [domain]: ms } }
 *   limitNotices  { dateKey, goal: boolean, domains: string[] }
 *
 * Both are optional keys with safe defaults, so no schema migration is needed.
 */

export const GOALS_KEY = 'goals';
export const NOTICES_KEY = 'limitNotices';

/* ---------- notices (internal helpers run inside the storage lock) ---------- */

function emptyNotices(dateKey) {
  return { dateKey, goal: false, domains: [] };
}

/** Notices belong to one day. Anything stored for another day counts as empty. */
function sanitizeNotices(raw, dateKey) {
  if (raw === null || typeof raw !== 'object' || raw.dateKey !== dateKey)
    return emptyNotices(dateKey);
  return {
    dateKey,
    goal: raw.goal === true,
    domains: Array.isArray(raw.domains) ? raw.domains.filter(isValidLimitDomain) : [],
  };
}

async function readNotices(dateKey) {
  const stored = await chrome.storage.local.get(NOTICES_KEY);
  return sanitizeNotices(stored[NOTICES_KEY], dateKey);
}

const writeNotices = (notices) => chrome.storage.local.set({ [NOTICES_KEY]: notices });

/** Sets whether one item counts as already notified. */
function withNotice(notices, item, notified) {
  if (item.type === 'goal') return { ...notices, goal: notified };
  const others = notices.domains.filter((domain) => domain !== item.domain);
  return { ...notices, domains: notified ? [...others, item.domain] : others };
}

/* ---------- goals ---------- */

/** Reads are lock-free and always return clean goals. */
export async function getGoals() {
  const stored = await chrome.storage.local.get(GOALS_KEY);
  return sanitizeGoals(stored[GOALS_KEY]);
}

/** @returns {Promise<{goal: boolean, domains: string[]}>} what was notified on `dateKey` */
export async function getNotices(dateKey) {
  return readNotices(dateKey);
}

/**
 * When a limit is created or changed, decide its notification state: if today's use
 * has ALREADY passed the new limit, the user knows, so no notification is sent for it
 * today. Otherwise it may notify when it is reached.
 */
async function resetNoticeFor(item, limitMs, now) {
  const dateKey = toLocalDateKey(now);
  const day = await getUsageForDate(dateKey);
  const used =
    item.type === 'goal'
      ? Object.values(day.domainMs).reduce((sum, ms) => sum + ms, 0)
      : Object.hasOwn(day.domainMs, item.domain)
        ? day.domainMs[item.domain]
        : 0;
  const alreadyPast = limitMs !== null && used >= limitMs;
  await writeNotices(withNotice(await readNotices(dateKey), item, alreadyPast));
}

/**
 * @param {number|null} ms the daily goal, or null to remove it
 * @param {{now?: number}} [options]
 */
export function setDailyGoal(ms, { now = Date.now() } = {}) {
  if (ms !== null && !isValidLimitMs(ms)) return Promise.reject(new TypeError('Invalid goal'));

  return withStorageLock(async () => {
    const goals = { ...(await getGoals()), dailyGoalMs: ms };
    await chrome.storage.local.set({ [GOALS_KEY]: goals });
    await resetNoticeFor({ type: 'goal' }, ms, now);
    return goals;
  });
}

/**
 * @param {string} domain
 * @param {number|null} ms the limit, or null to remove it
 * @param {{now?: number}} [options]
 */
export function setSiteLimit(domain, ms, { now = Date.now() } = {}) {
  if (!isValidLimitDomain(domain)) return Promise.reject(new TypeError('Invalid website'));
  if (ms !== null && !isValidLimitMs(ms)) return Promise.reject(new TypeError('Invalid limit'));

  return withStorageLock(async () => {
    const current = await getGoals();
    const isNew = !Object.hasOwn(current.siteLimits, domain);
    if (ms !== null && isNew && Object.keys(current.siteLimits).length >= MAX_SITE_LIMITS) {
      throw new RangeError(`You can set up to ${MAX_SITE_LIMITS} website limits.`);
    }
    const goals = { ...current, siteLimits: withSiteLimit(current.siteLimits, domain, ms) };
    await chrome.storage.local.set({ [GOALS_KEY]: goals });
    await resetNoticeFor({ type: 'site', domain }, ms, now);
    return goals;
  });
}

/** Removes the goal, every site limit, and the notification record. */
export function clearAllGoals() {
  return withStorageLock(() => chrome.storage.local.remove([GOALS_KEY, NOTICES_KEY]));
}

/** Records that `item` has been notified today. */
export function markNotified(dateKey, item) {
  return withStorageLock(async () => {
    await writeNotices(withNotice(await readNotices(dateKey), item, true));
  });
}

/**
 * Marks every limit that is ALREADY exceeded as notified, so turning notifications on
 * does not immediately announce things the user can already see.
 */
export function acknowledgeCurrentlyExceeded({ now = Date.now() } = {}) {
  return withStorageLock(async () => {
    const dateKey = toLocalDateKey(now);
    const [goals, day] = await Promise.all([getGoals(), getUsageForDate(dateKey)]);
    const status = computeLimitStatus(goals, day.domainMs);

    let notices = await readNotices(dateKey);
    if (status.goal?.level === 'exceeded') notices = withNotice(notices, { type: 'goal' }, true);
    for (const site of status.sites) {
      if (site.level === 'exceeded')
        notices = withNotice(notices, { type: 'site', domain: site.domain }, true);
    }
    await writeNotices(notices);
  });
}
