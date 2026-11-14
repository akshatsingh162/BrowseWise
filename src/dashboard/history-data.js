import { dateKeysBetween, dayTotals } from '../shared/analytics.js';
import { mergeDays } from '../shared/aggregate.js';
import { shiftDateKey } from '../shared/dates.js';
import { groupByWeek, siteSeries, summarizeSeries } from '../shared/history.js';
import { rankDomains } from '../shared/stats.js';
import { getUsageForRange, listUsageDateKeys } from '../shared/storage/usage-repo.js';
import { toLocalDateKey } from '../shared/time.js';

/** Websites offered as suggestions in the "One website" form. */
export const SUGGESTION_COUNT = 50;

/** Ranges for a single website. The longest one also bounds what is read. */
export const SITE_RANGES = Object.freeze([
  Object.freeze({ id: '30d', label: '30 days', days: 30 }),
  Object.freeze({ id: '90d', label: '90 days', days: 90 }),
  Object.freeze({ id: '1y', label: '1 year', days: 365 }),
]);

export const DEFAULT_SITE_RANGE_ID = '30d';

const LONGEST_RANGE_DAYS = Math.max(...SITE_RANGES.map((range) => range.days));

/**
 * Every recorded day with time on it (newest first), and the same days grouped
 * into weeks.
 *
 * @param {number} now epoch ms
 */
export async function loadHistoryOverview(now) {
  const keys = await listUsageDateKeys();
  const days = await getUsageForRange(keys);
  const totals = dayTotals(days);

  const entries = days
    .map((day, index) => {
      const ranked = rankDomains(day);
      return {
        dateKey: day.date,
        totalMs: totals[index].totalMs,
        siteCount: ranked.length,
        topSite: ranked[0] ? { domain: ranked[0].domain, ms: ranked[0].ms } : null,
      };
    })
    .filter((entry) => entry.totalMs > 0)
    .sort((a, b) => (a.dateKey < b.dateKey ? 1 : -1));

  return {
    todayKey: toLocalDateKey(now),
    days: entries,
    weeks: groupByWeek(totals),
  };
}

/**
 * Time on one website, day by day, for the chosen range. Also returns the most-used
 * websites of the last year for the suggestion list. Without a domain, only the
 * suggestions are returned.
 *
 * @param {string|null} domain already normalised (see normalizeLimitDomain)
 * @param {string} rangeId one of SITE_RANGES
 * @param {number} now epoch ms
 */
export async function loadSiteHistory(domain, rangeId, now) {
  const range =
    SITE_RANGES.find((candidate) => candidate.id === rangeId) ??
    SITE_RANGES.find((candidate) => candidate.id === DEFAULT_SITE_RANGE_ID);
  const todayKey = toLocalDateKey(now);
  const keys = dateKeysBetween(shiftDateKey(todayKey, -(LONGEST_RANGE_DAYS - 1)), todayKey);
  const days = await getUsageForRange(keys);

  const merged = mergeDays(days);
  const suggestions = rankDomains(merged)
    .slice(0, SUGGESTION_COUNT)
    .map((site) => site.domain);

  if (domain === null) return { domain: null, rangeId: range.id, suggestions };

  const series = siteSeries(days.slice(-range.days), domain);
  return {
    domain,
    rangeId: range.id,
    suggestions,
    series,
    summary: summarizeSeries(series),
    // Whether the website appears anywhere in the last year, so the page can tell
    // "never visited" apart from "not visited in this range".
    visitedInLastYear: hasDomain(merged, domain),
  };
}

function hasDomain(merged, domain) {
  return Object.hasOwn(merged.domainMs, domain) && merged.domainMs[domain] > 0;
}
