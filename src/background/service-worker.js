import { runMigrations } from '../shared/storage/migrations.js';

/**
 * Service worker entry point (skeleton).
 *
 * Phase 1: prepare storage on install/update/startup.
 * Phase 2 will register the tracking listeners here, at the top level, so Chrome
 * can wake this worker for tab, window, idle and alarm events.
 */

async function initialise(trigger) {
  try {
    const result = await runMigrations();
    console.info(`[BrowseWise] initialised (${trigger})`, result);
  } catch (error) {
    console.error('[BrowseWise] initialisation failed', error);
  }
}

// Listeners MUST be registered synchronously at the top level of the worker.
chrome.runtime.onInstalled.addListener((details) => {
  void initialise(`onInstalled:${details.reason}`);
});

chrome.runtime.onStartup.addListener(() => {
  void initialise('onStartup');
});
