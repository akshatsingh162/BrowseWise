import { requestLiveFlush } from '../shared/live-flush.js';
import {
  removeNotificationsPermission,
  requestNotificationsPermission,
} from '../shared/notifications-permission.js';
import { showTestNotification } from '../shared/notifier.js';
import { downloadTextFile } from '../shared/download.js';
import { requestErase } from '../shared/data-erase.js';
import { sendFocusCommand } from '../shared/focus-client.js';
import { subscribeToFocusChanges } from '../shared/storage/focus-repo.js';
import { setCategoryOverride } from '../shared/storage/category-repo.js';
import {
  acknowledgeCurrentlyExceeded,
  clearAllGoals,
  setDailyGoal,
  setSiteLimit,
} from '../shared/storage/goals-repo.js';
import { updateSettings } from '../shared/storage/settings-repo.js';
import { subscribeToUsageChanges } from '../shared/usage-events.js';
import { loadDailyAnalytics, loadMonthlyAnalytics, loadWeeklyAnalytics } from './analytics-data.js';
import { createChart } from './charts/chart-factory.js';
import { readChartTheme } from './charts/chart-theme.js';
import { loadGoalsData } from './goals-data.js';
import { loadOverviewData, loadWebsiteUsage } from './data.js';
import { loadFocusData } from './focus-data.js';
import { loadHistoryOverview, loadSiteHistory } from './history-data.js';
import { mountAnalyticsPage } from './pages/analytics.js';
import { mountFocusPage } from './pages/focus.js';
import { mountGoalsPage } from './pages/goals.js';
import { mountHistoryPage } from './pages/history.js';
import { mountOverviewPage } from './pages/overview.js';
import { mountSettingsPage } from './pages/settings.js';
import { mountWebsitesPage } from './pages/websites.js';
import { collectExportData, countDaysToDelete, loadSettingsData } from './settings-data.js';
import { ROUTES, createRouter } from './router.js';
import { createShell } from './shell.js';

const liveDeps = {
  requestLiveFlush: () => requestLiveFlush(),
  subscribe: subscribeToUsageChanges,
};

/**
 * Each page mounts itself into the container and returns { unmount }. `params` are the
 * values after the question mark in the address, for example { day: '2026-11-07' }.
 */
const PAGES = {
  overview: (container) => mountOverviewPage(container, { ...liveDeps, loadOverviewData }),
  websites: (container) =>
    mountWebsitesPage(container, { ...liveDeps, loadWebsiteUsage, setCategoryOverride }),
  analytics: (container, params) =>
    mountAnalyticsPage(container, {
      ...liveDeps,
      loadDailyAnalytics,
      loadWeeklyAnalytics,
      loadMonthlyAnalytics,
      createChart,
      readTheme: readChartTheme,
      initialDay: params.day,
    }),
  history: (container) =>
    mountHistoryPage(container, {
      ...liveDeps,
      loadHistoryOverview,
      loadSiteHistory,
      createChart,
      readTheme: readChartTheme,
    }),
  focus: (container) =>
    mountFocusPage(container, {
      ...liveDeps,
      loadFocusData,
      sendFocusCommand,
      updateSettings,
      // The page shows browsing-based numbers (goal streaks) and the timer, so it listens to both.
      subscribe: (callback) => {
        const stopUsage = liveDeps.subscribe(callback);
        const stopFocus = subscribeToFocusChanges(callback);
        return () => {
          stopUsage();
          stopFocus();
        };
      },
    }),
  goals: (container) =>
    mountGoalsPage(container, {
      ...liveDeps,
      loadGoalsData,
      setDailyGoal,
      setSiteLimit,
      clearAllGoals,
      acknowledgeCurrentlyExceeded,
      updateSettings,
      requestNotificationsPermission,
      removeNotificationsPermission,
      showTestNotification,
    }),
  settings: (container) =>
    mountSettingsPage(container, {
      ...liveDeps,
      loadSettingsData,
      collectExportData,
      countDaysToDelete,
      updateSettings,
      requestErase,
      downloadTextFile,
      removeNotificationsPermission,
    }),
};

/**
 * Starts the dashboard inside `root`: builds the shell, then mounts whichever page
 * the URL hash names, swapping pages as the hash changes.
 *
 * @param {HTMLElement} root
 * @returns {{stop: () => void}} stops routing and unmounts the current page
 */
export function startDashboard(root) {
  const shell = createShell(root);
  let currentPage = null;
  let isFirstNavigation = true;

  function navigate(routeId, params) {
    currentPage?.unmount();
    shell.setActive(routeId);
    document.title = `${ROUTES.find((route) => route.id === routeId).label} \u00b7 BrowseWise`;
    currentPage = PAGES[routeId](shell.main, params);

    // After a user-initiated navigation, move focus into the new page so keyboard and
    // screen-reader users land on the content. Skipped on first load.
    if (!isFirstNavigation) shell.main.focus({ preventScroll: true });
    isFirstNavigation = false;
  }

  const router = createRouter({ onNavigate: navigate });
  router.start();

  return {
    stop() {
      router.stop();
      currentPage?.unmount();
      currentPage = null;
    },
  };
}
