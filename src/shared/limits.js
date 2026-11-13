import { getTrackableDomain, isLocalOrIpHost } from './domain.js';
import { formatDuration } from './format.js';

/**
 * Goals and limits: pure rules and calculations. No storage, no DOM.
 *
 * A "goal" is one daily limit for all browsing; a "site limit" is a daily limit for
 * one website. They only measure and remind: BrowseWise never blocks a website.
 */

const MINUTE = 60_000;
export const MIN_LIMIT_MS = 5 * MINUTE;
export const MAX_LIMIT_MS = 24 * 60 * MINUTE;
export const MAX_SITE_LIMITS = 100;

/** From this share of a limit onwards, a limit is shown as "nearly reached". */
export const WARNING_SHARE = 0.8;

export const DEFAULT_GOALS = Object.freeze({ dailyGoalMs: null, siteLimits: Object.freeze({}) });

/** Domains are object keys: write with defineProperty so "__proto__" is just a name. */
function setOwn(target, key, value) {
  Object.defineProperty(target, key, {
    value,
    enumerable: true,
    writable: true,
    configurable: true,
  });
}

export function isValidLimitMs(value) {
  return Number.isFinite(value) && value >= MIN_LIMIT_MS && value <= MAX_LIMIT_MS;
}

export function isValidLimitDomain(domain) {
  return (
    typeof domain === 'string' && domain.length > 0 && domain.length <= 253 && !/\s/.test(domain)
  );
}

/**
 * Builds clean goals from untrusted input (storage or UI). Invalid entries are
 * dropped rather than clamped, so stored data is never silently changed.
 * @param {unknown} raw
 * @returns {{dailyGoalMs: number|null, siteLimits: Record<string, number>}}
 */
export function sanitizeGoals(raw) {
  const input = raw !== null && typeof raw === 'object' ? raw : {};
  const siteLimits = {};
  let count = 0;

  if (input.siteLimits !== null && typeof input.siteLimits === 'object') {
    for (const [domain, ms] of Object.entries(input.siteLimits)) {
      if (count >= MAX_SITE_LIMITS) break;
      if (isValidLimitDomain(domain) && isValidLimitMs(ms)) {
        setOwn(siteLimits, domain, Math.round(ms / MINUTE) * MINUTE);
        count += 1;
      }
    }
  }

  return {
    dailyGoalMs: isValidLimitMs(input.dailyGoalMs)
      ? Math.round(input.dailyGoalMs / MINUTE) * MINUTE
      : null,
    siteLimits,
  };
}

/** A copy of `siteLimits` with one entry set, or removed when `ms` is null. */
export function withSiteLimit(siteLimits, domain, ms) {
  const next = {};
  for (const [key, value] of Object.entries(siteLimits)) {
    if (key !== domain) setOwn(next, key, value);
  }
  if (ms !== null) setOwn(next, domain, ms);
  return next;
}

/**
 * Turns the hours and minutes typed into a form into milliseconds.
 * @param {{hours: string|number, minutes: string|number}} input empty counts as 0
 * @returns {{ok: true, ms: number} | {ok: false, error: string}}
 */
export function parseDuration({ hours, minutes }) {
  const toNumber = (value) => (String(value ?? '').trim() === '' ? 0 : Number(value));
  const h = toNumber(hours);
  const m = toNumber(minutes);

  if (!Number.isInteger(h) || !Number.isInteger(m) || h < 0 || m < 0) {
    return { ok: false, error: 'Use whole numbers for hours and minutes.' };
  }
  if (m > 59) return { ok: false, error: 'Minutes must be between 0 and 59.' };

  const ms = (h * 60 + m) * MINUTE;
  if (ms < MIN_LIMIT_MS) return { ok: false, error: 'Choose at least 5 minutes.' };
  if (ms > MAX_LIMIT_MS) return { ok: false, error: 'Choose 24 hours or less.' };
  return { ok: true, ms };
}

/**
 * Turns what the user typed (a domain, or a pasted address) into the domain the
 * tracker uses, so "https://www.YouTube.com/watch?v=1" becomes "youtube.com".
 * @returns {{ok: true, domain: string} | {ok: false, error: string}}
 */
export function normalizeLimitDomain(input) {
  const text = String(input ?? '').trim();
  if (text === '') return { ok: false, error: 'Enter a website, for example youtube.com.' };

  const domain = getTrackableDomain(text.includes('://') ? text : `https://${text}`);
  if (domain === null || (!domain.includes('.') && !isLocalOrIpHost(domain))) {
    return { ok: false, error: 'That does not look like a website address.' };
  }
  return { ok: true, domain };
}

function entryFor(domain, limitMs, usedMs) {
  const share = usedMs / limitMs;
  return {
    domain,
    limitMs,
    usedMs,
    remainingMs: Math.max(0, limitMs - usedMs),
    overMs: Math.max(0, usedMs - limitMs),
    share,
    level: usedMs >= limitMs ? 'exceeded' : share >= WARNING_SHARE ? 'warning' : 'ok',
  };
}

/**
 * How today's usage compares with the goal and each site limit.
 * Site limits are sorted with the ones closest to (or past) their limit first.
 *
 * @param {{dailyGoalMs: number|null, siteLimits: Record<string, number>}} goals
 * @param {Record<string, number>} domainMs today's time per domain
 */
export function computeLimitStatus(goals, domainMs) {
  const usedToday = Object.values(domainMs).reduce((sum, ms) => sum + ms, 0);
  const own = (domain) => (Object.hasOwn(domainMs, domain) ? domainMs[domain] : 0);

  return {
    usedToday,
    goal: goals.dailyGoalMs === null ? null : entryFor(null, goals.dailyGoalMs, usedToday),
    sites: Object.entries(goals.siteLimits)
      .map(([domain, limitMs]) => entryFor(domain, limitMs, own(domain)))
      .sort((a, b) => b.share - a.share || a.domain.localeCompare(b.domain)),
  };
}

/** Short text for a limit's state: "40m left", "Limit reached", "Over by 25m". */
export function describeRemaining(entry) {
  if (entry.level !== 'exceeded') return `${formatDuration(entry.remainingMs)} left`;
  return entry.overMs >= MINUTE ? `Over by ${formatDuration(entry.overMs)}` : 'Limit reached';
}

/**
 * Which exceeded limits have not been notified yet today.
 * @param {ReturnType<typeof computeLimitStatus>} status
 * @param {{goal: boolean, domains: string[]}} notices what was already notified today
 */
export function findNewlyExceeded(status, notices) {
  const pending = [];
  if (status.goal?.level === 'exceeded' && !notices.goal)
    pending.push({ type: 'goal', ...status.goal });
  for (const site of status.sites) {
    if (site.level === 'exceeded' && !notices.domains.includes(site.domain)) {
      pending.push({ type: 'site', ...site });
    }
  }
  return pending;
}

/** Notification wording. Neutral: it informs, it does not scold. */
export function describeNotification(item) {
  const used = formatDuration(item.usedMs);
  const limit = formatDuration(item.limitMs);
  if (item.type === 'goal') {
    return {
      title: 'Daily goal reached',
      message: `You have spent ${used} browsing today. Your goal was ${limit}.`,
    };
  }
  return {
    title: `${item.domain} limit reached`,
    message: `You have spent ${used} on ${item.domain} today. Your limit was ${limit}.`,
  };
}
