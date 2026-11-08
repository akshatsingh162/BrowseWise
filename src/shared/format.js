/** Display formatting. Pure functions, no DOM. */

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;

/**
 * Compact duration: "45s", "12m", "2h 05m". Values are floored, never rounded up,
 * so the display can never claim more time than was recorded.
 * @param {number} ms
 */
export function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return '0m';
  if (ms < MINUTE) return `${Math.max(1, Math.floor(ms / SECOND))}s`;

  const hours = Math.floor(ms / HOUR);
  const minutes = Math.floor((ms % HOUR) / MINUTE);
  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${String(minutes).padStart(2, '0')}m`;
}

/**
 * @param {number} share fraction between 0 and 1
 */
export function formatPercent(share) {
  if (!Number.isFinite(share) || share <= 0) return '0%';
  if (share < 0.005) return '<1%';
  return `${Math.round(share * 100)}%`;
}

/** Differences smaller than this are shown as "same". */
const FLAT_THRESHOLD_MS = MINUTE;

/**
 * Turns a today-vs-yesterday comparison into display text. Deliberately neutral:
 * more or less screen time is not framed as good or bad.
 *
 * @param {{yesterdayMs: number, deltaMs: number, deltaPct: number|null}} comparison
 * @returns {{direction: 'up'|'down'|'flat'|'none', label: string, tooltip: string}}
 */
export function describeComparison({ yesterdayMs, deltaMs, deltaPct }) {
  if (!(yesterdayMs > 0) || deltaPct === null) {
    return {
      direction: 'none',
      label: 'No data yesterday',
      tooltip:
        'Nothing was recorded yesterday up to this time of day, so there is nothing to compare.',
    };
  }

  const reference = `Yesterday, by this time: ${formatDuration(yesterdayMs)}.`;

  if (Math.abs(deltaMs) < FLAT_THRESHOLD_MS) {
    return {
      direction: 'flat',
      label: 'Same as yesterday',
      tooltip: `About the same as yesterday at this time. ${reference}`,
    };
  }

  const amount = formatDuration(Math.abs(deltaMs));
  const percent = Math.round(Math.abs(deltaPct) * 100);
  const up = deltaMs > 0;
  return {
    direction: up ? 'up' : 'down',
    label: `${up ? '+' : '\u2212'}${amount} vs yesterday`,
    tooltip: `${percent}% ${up ? 'more' : 'less'} than yesterday at this time. ${reference}`,
  };
}
