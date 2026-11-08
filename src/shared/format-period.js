import { formatDuration } from './format.js';

const MINUTE = 60_000;

/**
 * Display text for comparing a period with the one before it. Neutral wording:
 * more or less screen time is not framed as good or bad.
 *
 * @param {{deltaMs: number, deltaPct: number|null}} comparison from comparePeriods()
 * @param {number} previousMs total of the earlier period
 * @param {string} periodName e.g. "previous 7 days"
 * @returns {{value: string, hint: string, direction: 'up'|'down'|'flat'|'none'}}
 */
export function describePeriodComparison({ deltaMs, deltaPct }, previousMs, periodName) {
  if (!(previousMs > 0) || deltaPct === null) {
    return { value: '\u2014', hint: `No data in the ${periodName}`, direction: 'none' };
  }

  const reference = `${formatDuration(previousMs)} in the ${periodName}`;
  if (Math.abs(deltaMs) < MINUTE) {
    return { value: '\u00b10m', hint: `About the same \u00b7 ${reference}`, direction: 'flat' };
  }

  const up = deltaMs > 0;
  const percent = Math.round(Math.abs(deltaPct) * 100);
  return {
    value: `${up ? '+' : '\u2212'}${formatDuration(Math.abs(deltaMs))}`,
    hint: `${percent}% ${up ? 'more' : 'less'} \u00b7 ${reference}`,
    direction: up ? 'up' : 'down',
  };
}
