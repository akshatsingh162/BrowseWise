import { MESSAGE_TYPES } from './messages.js';
import { sanitizeFocusState } from './focus.js';

/** The actions the timer accepts. The service worker validates against the same list. */
export const FOCUS_ACTIONS = Object.freeze(['start', 'pause', 'resume', 'stop', 'skip', 'sync']);

/**
 * Sends one command to the service worker, which is the only place timer state is changed
 * (so two popups and a dashboard can never disagree). Resolves with the new state, or null
 * when no timer is running. Rejects with a message fit to show to the user.
 *
 * @param {'start'|'pause'|'resume'|'stop'|'skip'|'sync'} action
 * @param {{send?: (message: object) => Promise<any>}} [options] injectable for tests
 */
export async function sendFocusCommand(
  action,
  { send = (message) => chrome.runtime.sendMessage(message) } = {},
) {
  if (!FOCUS_ACTIONS.includes(action)) throw new RangeError(`Unknown focus action: ${action}`);

  let response;
  try {
    response = await send({ type: MESSAGE_TYPES.FOCUS_COMMAND, action });
  } catch (error) {
    console.debug('[BrowseWise] could not reach the worker for a focus command', error);
    throw new Error('BrowseWise could not reach its background service. Please try again.', {
      cause: error,
    });
  }

  if (response?.ok === true) return sanitizeFocusState(response.state);
  throw new Error(response?.error || 'BrowseWise could not do that. Please try again.');
}
