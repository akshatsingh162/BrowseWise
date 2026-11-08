/**
 * Aggregations over stored day records ({ date, hourlyMs[24], domainMs{} }).
 * Pure functions so every number shown in the UI can be unit tested.
 */

/** @param {{domainMs: Record<string, number>}} day */
export function totalMs(day) {
  let total = 0;
  for (const value of Object.values(day.domainMs)) total += value;
  return total;
}

/**
 * Domains ordered from most to least used, with each one's share of the day.
 * Ties are broken alphabetically so the order is stable between renders.
 *
 * @returns {{domain: string, ms: number, share: number}[]}
 */
export function rankDomains(day) {
  const total = totalMs(day);
  return Object.entries(day.domainMs)
    .filter(([, ms]) => ms > 0)
    .map(([domain, ms]) => ({ domain, ms, share: total > 0 ? ms / total : 0 }))
    .sort((a, b) => b.ms - a.ms || a.domain.localeCompare(b.domain));
}

/**
 * Time recorded in a day up to a given local time of day. Whole hours before the
 * current hour count fully; the current hour counts in proportion to how much of
 * it has elapsed. Used to compare "today so far" against "yesterday by now".
 *
 * @param {{hourlyMs: number[]}} day
 * @param {number} now epoch ms; only its local time of day is used
 */
export function msUpToTimeOfDay(day, now) {
  const date = new Date(now);
  const hour = date.getHours();
  const fractionOfHour = (date.getMinutes() * 60 + date.getSeconds()) / 3600;

  let total = 0;
  for (let h = 0; h < hour; h += 1) total += day.hourlyMs[h];
  return total + day.hourlyMs[hour] * fractionOfHour;
}

/**
 * Everything the popup needs to render.
 *
 * @param {object} input
 * @param {object} input.today     day record for today
 * @param {object} input.yesterday day record for yesterday
 * @param {number} input.now       epoch ms
 */
export function buildOverview({ today, yesterday, now }) {
  const ranked = rankDomains(today);
  const total = totalMs(today);
  const yesterdayMs = msUpToTimeOfDay(yesterday, now);
  const deltaMs = total - yesterdayMs;

  return {
    totalMs: total,
    siteCount: ranked.length,
    topSite: ranked[0] ?? null,
    ranked,
    comparison: {
      yesterdayMs,
      deltaMs,
      deltaPct: yesterdayMs > 0 ? deltaMs / yesterdayMs : null,
    },
  };
}
