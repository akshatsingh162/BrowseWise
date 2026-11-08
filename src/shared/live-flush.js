import { MESSAGE_TYPES } from './messages.js';

/** Never let a slow or suspended worker block a screen. */
export const FLUSH_TIMEOUT_MS = 2_000;

/**
 * Asks the service worker to write the in-progress interval to storage, so what
 * a screen reads is current to the second. Never throws: if the worker does not
 * answer in time, the screen simply shows what is already stored.
 *
 * @param {object} [options]
 * @param {(message: object) => Promise<unknown>} [options.send] injectable for tests
 * @param {number} [options.timeoutMs]
 * @returns {Promise<boolean>} whether the worker answered
 */
export async function requestLiveFlush({
  send = (message) => chrome.runtime.sendMessage(message),
  timeoutMs = FLUSH_TIMEOUT_MS,
} = {}) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('live flush timed out')), timeoutMs);
  });

  try {
    await Promise.race([send({ type: MESSAGE_TYPES.GET_LIVE_SNAPSHOT }), timeout]);
    return true;
  } catch (error) {
    console.warn('[BrowseWise] live flush unavailable', error);
    return false;
  } finally {
    clearTimeout(timer);
  }
}
