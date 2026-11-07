/**
 * URL → domain normalisation.
 *
 * Only http(s) pages are trackable. Everything else (chrome://, file://, about:,
 * extension pages, data:, ...) returns null so callers can safely ignore it.
 */

const TRACKABLE_PROTOCOLS = new Set(['http:', 'https:']);
const IPV4_PATTERN = /^\d{1,3}(\.\d{1,3}){3}$/;

/**
 * Lowercases, removes a trailing dot, and strips a leading "www." when something
 * other than a bare TLD would remain (so "www.com" is preserved).
 * @param {string} hostname
 * @returns {string|null}
 */
export function normalizeHostname(hostname) {
  let host = hostname.toLowerCase().replace(/\.$/, '');
  if (host.startsWith('www.') && host.slice(4).includes('.')) {
    host = host.slice(4);
  }
  return host === '' ? null : host;
}

/**
 * @param {unknown} rawUrl
 * @returns {string|null} normalised domain, or null if the URL must not be tracked
 */
export function getTrackableDomain(rawUrl) {
  if (typeof rawUrl !== 'string' || rawUrl === '') return null;

  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }

  if (!TRACKABLE_PROTOCOLS.has(url.protocol)) return null;
  return normalizeHostname(url.hostname);
}

/**
 * True for localhost, *.localhost, *.local, IPv4 and IPv6 literals.
 * The tracker uses this with the "trackLocalHosts" setting.
 * @param {string} domain a value returned by getTrackableDomain
 */
export function isLocalOrIpHost(domain) {
  return (
    domain === 'localhost' ||
    domain.endsWith('.localhost') ||
    domain.endsWith('.local') ||
    IPV4_PATTERN.test(domain) ||
    domain.startsWith('[')
  );
}
