import { describeClock, formatClock, isDue, timerActions, timerView } from '../shared/focus.js';
import { el } from '../ui/dom.js';
import { icon } from '../ui/icons.js';

const TICK_MS = 500;
const RETRY_SYNC_MS = 5000;

/**
 * A compact focus timer for the popup: the time, and the buttons for the current state.
 *
 * It is one long-lived element that the popup keeps in place when it redraws the rest, so
 * the countdown never resets. Like the dashboard, it only shows what the service worker
 * stores and sends it commands; closing the popup never stops the timer.
 *
 * @param {object} deps
 * @param {() => Promise<{state: object|null, focusMinutes: number}>} deps.loadSnapshot
 * @param {(action: string) => Promise<object|null>} deps.sendFocusCommand
 * @param {(cb: () => void) => () => void} deps.subscribe
 * @param {() => number} [deps.now]
 * @returns {{element: HTMLElement, start: () => Promise<void>, destroy: () => void}}
 */
export function createFocusWidget({ loadSnapshot, sendFocusCommand, subscribe, now = Date.now }) {
  let state = null;
  let focusMinutes = 25;
  let loaded = false;
  let pending = false;
  let nextSettleAt = 0;
  let intervalId;
  let unsubscribe = () => {};

  const label = el('span', { class: 'pp-focus-label' });
  const time = el('span', { class: 'pp-focus-time bw-num', role: 'timer' });
  const actions = el('div', { class: 'pp-focus-actions' });
  const error = el('p', { class: 'pp-focus-error', role: 'alert' });

  const element = el('section', { class: 'bw-card pp-focus', 'aria-label': 'Focus timer' }, [
    el('div', { class: 'pp-focus-main' }, [
      el('div', { class: 'pp-focus-info' }, [label, time]),
      actions,
    ]),
    error,
  ]);

  function renderActions() {
    actions.replaceChildren(
      ...timerActions(state).map((item, index) =>
        el(
          'button',
          {
            type: 'button',
            // The main action has a word; the others are icons with a name for assistive technology.
            class: index === 0 ? 'bw-btn bw-btn-primary pp-focus-primary' : 'bw-icon-btn',
            title: item.label,
            'aria-label': index === 0 ? null : item.label,
            disabled: !loaded || pending,
            onClick: () => void run(item.action),
          },
          index === 0
            ? [icon(item.icon, { size: 14 }), el('span', { text: item.label })]
            : [icon(item.icon, { size: 16 })],
        ),
      ),
    );
  }

  function tick() {
    const current = now();
    const view = timerView(state, focusMinutes, current);
    label.textContent = view.phaseText;
    time.textContent = formatClock(view.timeMs);
    time.setAttribute('aria-label', `${describeClock(view.timeMs)} left`);
    element.setAttribute('data-tone', view.tone);

    if (state && isDue(state, current) && current >= nextSettleAt) {
      nextSettleAt = current + RETRY_SYNC_MS;
      sendFocusCommand('sync')
        .then(apply)
        .catch((failure) => console.debug('[BrowseWise] could not settle the timer yet', failure));
    }
  }

  function apply(next) {
    state = next;
    renderActions();
    tick();
  }

  async function run(action) {
    if (pending) return;
    pending = true;
    error.textContent = '';
    renderActions();
    try {
      apply(await sendFocusCommand(action));
    } catch (failure) {
      error.textContent = failure.message;
    } finally {
      pending = false;
      renderActions();
    }
  }

  async function refresh() {
    try {
      const snapshot = await loadSnapshot();
      focusMinutes = snapshot.focusMinutes;
      loaded = true;
      apply(snapshot.state);
    } catch (failure) {
      console.error('[BrowseWise] could not read the focus timer', failure);
    }
  }

  renderActions();
  tick();

  return {
    element,
    async start() {
      await refresh();
      intervalId = setInterval(tick, TICK_MS);
      unsubscribe = subscribe(() => void refresh());
    },
    destroy() {
      clearInterval(intervalId);
      unsubscribe();
    },
  };
}
