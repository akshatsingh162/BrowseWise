import { MESSAGE_TYPES } from './messages.js';
import { withStorageLock } from './storage/lock.js';
import { runMigrations } from './storage/migrations.js';
import { clearAllUsage } from './storage/usage-repo.js';

/**
 * Erasing data.
 *
 *   history     deletes the recorded time only. Settings, goals, limits and category
 *               choices stay.
 *   everything  deletes all stored data, then writes the defaults again, so the
 *               extension is back in the state of a fresh install.
 */

export const ERASE_SCOPES = Object.freeze({ HISTORY: 'history', EVERYTHING: 'everything' });

/** @param {unknown} value */
export function isEraseScope(value) {
  return value === ERASE_SCOPES.HISTORY || value === ERASE_SCOPES.EVERYTHING;
}

function assertScope(scope) {
  if (!isEraseScope(scope)) throw new RangeError(`Unknown erase scope: ${String(scope)}`);
}

/**
 * Erases directly in this context. Callers outside the service worker should use
 * requestErase() so the worker's tracking does not write in the middle of it.
 * @param {'history'|'everything'} scope
 */
export async function eraseData(scope) {
  assertScope(scope);

  if (scope === ERASE_SCOPES.HISTORY) {
    await clearAllUsage();
    return;
  }

  await withStorageLock(() => chrome.storage.local.clear());
  // Not inside the lock above: migrations take the lock themselves (it is not re-entrant).
  await runMigrations();
}

/**
 * Asks the service worker to erase, and falls back to erasing directly when the
 * worker cannot be reached. The worker is preferred because it handles messages one
 * at a time between its tracking tasks, so a write from tracking can never land
 * between the erase and the defaults being restored.
 *
 * @param {'history'|'everything'} scope
 * @param {object} [options]
 * @param {(message: object) => Promise<any>} [options.send] injectable for tests
 * @param {(scope: string) => Promise<void>} [options.erase] injectable for tests
 * @returns {Promise<{via: 'worker'|'direct'}>}
 */
export async function requestErase(
  scope,
  { send = (message) => chrome.runtime.sendMessage(message), erase = eraseData } = {},
) {
  assertScope(scope);

  let response;
  try {
    response = await send({ type: MESSAGE_TYPES.ERASE_DATA, scope });
  } catch (error) {
    console.debug('[BrowseWise] worker not reachable for erase, erasing directly', error);
    await erase(scope);
    return { via: 'direct' };
  }

  if (response?.ok === true) return { via: 'worker' };
  if (response?.ok === false) {
    throw new Error(response.error || 'The service worker could not erase the data.');
  }

  // No answer at all (nothing was listening): do it here.
  await erase(scope);
  return { via: 'direct' };
}
