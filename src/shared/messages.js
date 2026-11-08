/**
 * Message types sent between extension contexts via chrome.runtime.sendMessage.
 * Keeping them in one place prevents typos and documents the extension's "API".
 */
export const MESSAGE_TYPES = Object.freeze({
  /** UI -> service worker: flush the in-progress interval to storage now. */
  GET_LIVE_SNAPSHOT: 'GET_LIVE_SNAPSHOT',
});
