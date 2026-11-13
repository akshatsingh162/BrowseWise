/**
 * Failure reporting for the service worker.
 *
 * Chrome stops and restarts an extension's service worker at will, and reloading the
 * extension while it is busy does the same. A task that was running at that moment
 * then fails with messages such as "No SW" (Chrome's own text) or "Extension context
 * invalidated". These interruptions are expected and harmless: tracking keeps its
 * progress in storage and picks up on the next event or heartbeat, losing at most
 * one short interval and never counting time twice (see tests/sync-recovery.test.js).
 *
 * Expected interruptions are logged quietly. Anything else is a real problem and is
 * logged as an error, with the reason in the same line so a copied entry is useful.
 */

const INTERRUPTION_PATTERNS = [/\bNo SW\b/i, /Extension context invalidated/i];

/** @param {unknown} error */
export function errorMessage(error) {
  // An error with no message is still identified by its type, for example "TypeError".
  if (error instanceof Error) return error.message || error.name || 'unknown error';
  const text = String(error ?? '').trim();
  return text === '' ? 'unknown error' : text;
}

/**
 * Whether `error` is Chrome interrupting the worker rather than a bug.
 * @param {unknown} error
 */
export function isWorkerInterruption(error) {
  const text = errorMessage(error);
  return INTERRUPTION_PATTERNS.some((pattern) => pattern.test(text));
}

/**
 * @param {string} label what was being done, for example "windows.onFocusChanged"
 * @param {unknown} error
 */
export function reportFailure(label, error) {
  const reason = errorMessage(error);
  if (isWorkerInterruption(error)) {
    console.debug(
      `[BrowseWise] ${label} interrupted (${reason}); tracking recovers on the next event`,
    );
  } else {
    console.error(`[BrowseWise] ${label} failed: ${reason}`, error);
  }
}
