/**
 * Builds the URL of a site's favicon through Chrome's extension favicon API
 * (requires the "favicon" permission). Chrome serves the icon itself, so
 * BrowseWise never contacts the website and stores no icon data.
 *
 * @param {string} domain
 * @param {number} [size] pixel size (use 2x the displayed size for sharp icons)
 * @param {(path: string) => string} [getURL] injectable for tests
 */
export function faviconUrl(domain, size = 32, getURL = (path) => chrome.runtime.getURL(path)) {
  const url = new URL(getURL('/_favicon/'));
  url.searchParams.set('pageUrl', `https://${domain}/`);
  url.searchParams.set('size', String(size));
  return url.toString();
}
