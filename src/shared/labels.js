/**
 * Locale-aware labels for dates and hours. The locale is injectable so tests are
 * deterministic; in the app it defaults to the user's browser locale.
 */

function dateFromKey(dateKey) {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(year, month - 1, day, 12);
}

/** "Mon" */
export function weekdayShort(dateKey, locale) {
  return dateFromKey(dateKey).toLocaleDateString(locale, { weekday: 'short' });
}

/** "Mon 3 Nov" (field order follows the locale) */
export function dayShort(dateKey, locale) {
  return dateFromKey(dateKey).toLocaleDateString(locale, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

/** "Monday, 3 November 2026" */
export function dayLong(dateKey, locale) {
  return dateFromKey(dateKey).toLocaleDateString(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/** "3 Nov" */
export function dayMonth(dateKey, locale) {
  return dateFromKey(dateKey).toLocaleDateString(locale, { day: 'numeric', month: 'short' });
}

/** "November 2026" from a YYYY-MM month key */
export function monthLong(monthKey, locale) {
  return dateFromKey(`${monthKey}-01`).toLocaleDateString(locale, {
    month: 'long',
    year: 'numeric',
  });
}

/** "Nov" from a YYYY-MM month key */
export function monthShort(monthKey, locale) {
  return dateFromKey(`${monthKey}-01`).toLocaleDateString(locale, { month: 'short' });
}

/** "2 PM" or "14" depending on the locale */
export function hourLabel(hour, locale) {
  return new Date(2000, 0, 1, hour).toLocaleTimeString(locale, { hour: 'numeric' });
}

/** "2 PM \u2013 3 PM" */
export function hourRange(hour, locale) {
  return `${hourLabel(hour, locale)} \u2013 ${hourLabel((hour + 1) % 24, locale)}`;
}
