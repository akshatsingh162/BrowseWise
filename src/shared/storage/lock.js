/**
 * Serialises storage read-modify-write operations.
 *
 * Preferred: the Web Locks API, which is shared by every context of this
 * extension (service worker, popup, dashboard tabs).
 * Fallback: an in-memory promise queue (used where navigator.locks is missing,
 * e.g. unit tests running in Node). It only protects a single context.
 *
 * IMPORTANT: Web Locks are not re-entrant. Never call a function that uses
 * withStorageLock from inside a task that is already holding the lock, or it
 * will deadlock. Only the public repository functions take the lock.
 */

const LOCK_NAME = 'browsewise-storage-write';

let fallbackTail = Promise.resolve();

/**
 * @template T
 * @param {() => Promise<T>} task
 * @returns {Promise<T>}
 */
export function withStorageLock(task) {
  const locks = globalThis.navigator?.locks;
  if (locks?.request) {
    return locks.request(LOCK_NAME, task);
  }

  const run = fallbackTail.then(task);
  // Keep the chain alive even if this task fails, so one error never blocks later writes.
  fallbackTail = run.catch(() => {});
  return run;
}
