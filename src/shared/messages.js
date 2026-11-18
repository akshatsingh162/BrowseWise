/**
 * Message types sent between extension contexts via chrome.runtime.sendMessage.
 * Keeping them in one place prevents typos and documents the extension's "API".
 */
export const MESSAGE_TYPES = Object.freeze({
  /** UI -> service worker: flush the in-progress interval to storage now. */
  GET_LIVE_SNAPSHOT: 'GET_LIVE_SNAPSHOT',
  /**
   * UI -> service worker: erase data. Carries `{ scope: 'history' | 'everything' }`.
   * The worker runs it inside its own task queue so tracking cannot write halfway.
   */
  ERASE_DATA: 'ERASE_DATA',
  /**
   * UI -> service worker: control the focus timer. Carries `{ action }`, one of start,
   * pause, resume, stop, skip or sync. The worker is the only writer of timer state.
   */
  FOCUS_COMMAND: 'FOCUS_COMMAND',
});
