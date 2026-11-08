export const DASHBOARD_PATH = 'src/dashboard/dashboard.html';

/**
 * Opens the full dashboard in a browser tab, or focuses it if it is already open
 * (so repeated clicks never pile up tabs).
 */
export async function openDashboard() {
  const dashboardUrl = chrome.runtime.getURL(DASHBOARD_PATH);

  const tabs = await chrome.tabs.query({});
  const existing = tabs.find(
    (tab) => typeof tab.url === 'string' && tab.url.startsWith(dashboardUrl),
  );

  if (existing) {
    await chrome.tabs.update(existing.id, { active: true });
    await chrome.windows.update(existing.windowId, { focused: true });
  } else {
    await chrome.tabs.create({ url: dashboardUrl });
  }
}
