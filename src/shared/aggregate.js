import { HOURS_PER_DAY } from './storage/schema.js';
import { totalMs } from './stats.js';

/*
 * Domains are object keys, so a hostname like "__proto__" must be written with
 * defineProperty (see usage-repo.js for the same precaution).
 */
function addToDomain(target, domain, ms) {
  const current = Object.hasOwn(target, domain) ? target[domain] : 0;
  Object.defineProperty(target, domain, {
    value: current + ms,
    enumerable: true,
    writable: true,
    configurable: true,
  });
}

/**
 * Sums several day records into one: per-domain totals and per-hour totals.
 * @param {{hourlyMs: number[], domainMs: Record<string, number>}[]} days
 */
export function mergeDays(days) {
  const domainMs = {};
  const hourlyMs = new Array(HOURS_PER_DAY).fill(0);

  for (const day of days) {
    for (const [domain, ms] of Object.entries(day.domainMs)) addToDomain(domainMs, domain, ms);
    for (let hour = 0; hour < HOURS_PER_DAY; hour += 1) hourlyMs[hour] += day.hourlyMs[hour] ?? 0;
  }
  return { domainMs, hourlyMs };
}

/**
 * Mean daily usage over the days that actually have data. Days with nothing
 * recorded (browser not used, extension not yet installed) are not counted as
 * zero, because that would understate real usage.
 *
 * @returns {{averageMs: number, daysCounted: number}}
 */
export function averageDailyMs(days) {
  const totals = days.map(totalMs).filter((total) => total > 0);
  if (totals.length === 0) return { averageMs: 0, daysCounted: 0 };
  return {
    averageMs: totals.reduce((sum, total) => sum + total, 0) / totals.length,
    daysCounted: totals.length,
  };
}
