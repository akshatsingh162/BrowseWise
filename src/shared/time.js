/**
 * Time helpers. All day/hour logic uses the user's LOCAL clock.
 *
 * Day keys are computed at record time and never rewritten, so changing the
 * system time zone later does not corrupt history.
 */

export const HOUR_MS = 60 * 60 * 1000;

/**
 * @param {number} timestamp epoch milliseconds
 * @returns {string} local date as YYYY-MM-DD
 */
export function toLocalDateKey(timestamp) {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Milliseconds from `timestamp` to the start of the next local clock hour (always >= 1). */
function msUntilNextLocalHour(timestamp) {
  const date = new Date(timestamp);
  const elapsedInHour =
    date.getMinutes() * 60_000 + date.getSeconds() * 1000 + date.getMilliseconds();
  return HOUR_MS - elapsedInHour;
}

/**
 * Splits [startTs, endTs) at every local hour boundary, so each slice belongs to
 * exactly one (date, hour) bucket. Local midnight is also an hour boundary, which
 * means a session crossing midnight is split between the two days automatically.
 *
 * Because boundaries are computed from the local minutes/seconds, this works in
 * time zones with 30/45-minute offsets. During a daylight-saving "fall back" the
 * repeated hour is merged into one bucket, which is an acceptable simplification.
 *
 * Invariant: the sum of returned `ms` values always equals endTs - startTs.
 *
 * @param {number} startTs epoch ms
 * @param {number} endTs epoch ms
 * @returns {{dateKey: string, hour: number, ms: number}[]}
 */
export function splitIntoSegments(startTs, endTs) {
  if (!Number.isFinite(startTs) || !Number.isFinite(endTs) || endTs <= startTs) return [];

  const segments = [];
  let cursor = startTs;

  while (cursor < endTs) {
    const boundary = Math.min(endTs, cursor + msUntilNextLocalHour(cursor));
    segments.push({
      dateKey: toLocalDateKey(cursor),
      hour: new Date(cursor).getHours(),
      ms: boundary - cursor,
    });
    cursor = boundary;
  }

  return segments;
}
