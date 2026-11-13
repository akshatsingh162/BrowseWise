export const DASHBOARD_PATH = 'src/dashboard/dashboard.html';

/**
 * Opens the full dashboard in a browser tab, or focuses it if it is already open
 * (so repeated clicks never pile up tabs).
 *
 * @param {string} [page] a dashboard page to show, such as "goals". Without it an
 *        already-open dashboard is left on whatever page it is showing.
 */
export async function openDashboard(page) {
  const dashboardUrl = chrome.runtime.getURL(DASHBOARD_PATH);
  const target = page ? `${dashboardUrl}#${page}` : dashboardUrl;

  const tabs = await chrome.tabs.query({});
  const existing = tabs.find(
    (tab) => typeof tab.url === 'string' && tab.url.startsWith(dashboardUrl),
  );

  if (existing) {
    await chrome.tabs.update(existing.id, page ? { active: true, url: target } : { active: true });
    await chrome.windows.update(existing.windowId, { focused: true });
  } else {
    await chrome.tabs.create({ url: target });
  }
}
