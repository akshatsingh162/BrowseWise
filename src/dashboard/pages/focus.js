import {
  FOCUS_STATUS,
  PHASE_LABELS,
  describeClock,
  filledDots,
  formatClock,
  isDue,
  timerActions,
  timerView,
} from '../../shared/focus.js';
import { formatDuration } from '../../shared/format.js';
import { dayShort } from '../../shared/labels.js';
import { SETTINGS_LIMITS } from '../../shared/storage/schema.js';
import { celebrate as defaultCelebrate } from '../../ui/celebrate.js';
import { el } from '../../ui/dom.js';
import { icon } from '../../ui/icons.js';
import { badgeCard } from '../components/badge-card.js';
import { createDataView } from '../components/data-view.js';
import { pageHeader } from '../components/page-header.js';
import { statCard } from '../components/stat-card.js';
import { createTimerRing } from '../components/timer-ring.js';

const TICK_MS = 250;
const STATUS_MS = 6000;
const RETRY_SYNC_MS = 5000;

/** Lengths offered in the quick selector. The saved value is always added if it is not here. */
const LENGTH_PRESETS = [15, 20, 25, 30, 45, 50, 60, 90];

const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`;

/**
 * Mounts the Focus page: a timer with breaks, today's numbers, streaks, and badges.
 *
 * The timer is drawn from timestamps (see shared/focus.js), so it stays right when the tab
 * is in the background. Only the service worker changes timer state: this page sends it
 * commands and shows what comes back, so two tabs and the popup always agree.
 *
 * The timer and its controls live outside the live-updating region, so a background
 * refresh never resets a button you are about to press.
 *
 * @param {HTMLElement} container
 * @param {object} deps
 * @param {(now: number) => Promise<object>} deps.loadFocusData
 * @param {(action: string) => Promise<object|null>} deps.sendFocusCommand
 * @param {(patch: object) => Promise<object>} deps.updateSettings
 * @param {() => Promise<unknown>} deps.requestLiveFlush
 * @param {(cb: () => void) => () => void} deps.subscribe
 * @param {(options?: object) => boolean} [deps.celebrate]
 * @param {() => number} [deps.now]
 * @param {string} [deps.locale]
 * @returns {{unmount: () => void}}
 */
export function mountFocusPage(
  container,
  {
    loadFocusData,
    sendFocusCommand,
    updateSettings,
    requestLiveFlush,
    subscribe,
    celebrate = defaultCelebrate,
    now = Date.now,
    locale,
  },
) {
  let state = null;
  let settings = {
    focusMinutes: 25,
    shortBreakMinutes: 5,
    longBreakMinutes: 15,
    longBreakEvery: 4,
  };
  let loaded = false;
  let pending = false;
  let knownBadges = null;
  let knownSessions = null;
  let statusTimer;
  const syncAttempts = new Map();
  const baseTitle = document.title;

  /* ---------- timer card ---------- */

  const ring = createTimerRing();
  const dots = el('div', { class: 'fo-dots', role: 'img' });
  const controls = el('div', { class: 'fo-controls' });
  const errorLine = el('p', { class: 'db-field-error fo-error', role: 'alert' });
  const status = el('p', { class: 'db-status', role: 'status' });

  const lengthSelect = el('select', {
    id: 'focus-length',
    class: 'bw-select',
    'aria-describedby': 'focus-length-help',
  });
  lengthSelect.addEventListener('change', async () => {
    const minutes = Number(lengthSelect.value);
    try {
      await updateSettings({ focusMinutes: minutes });
      settings = { ...settings, focusMinutes: minutes };
      tick();
      void view.refresh({ silent: true });
    } catch (error) {
      console.error('[BrowseWise] could not save the focus length', error);
      lengthSelect.value = String(settings.focusMinutes);
      announce('Could not save the focus length. Please try again.');
    }
  });

  function announce(text) {
    clearTimeout(statusTimer);
    status.textContent = text;
    statusTimer = setTimeout(() => (status.textContent = ''), STATUS_MS);
  }

  function syncLengthOptions() {
    const values = [...new Set([...LENGTH_PRESETS, settings.focusMinutes])]
      .filter(
        (value) =>
          value >= SETTINGS_LIMITS.focusMinutes.min && value <= SETTINGS_LIMITS.focusMinutes.max,
      )
      .sort((a, b) => a - b);
    const existing = [...lengthSelect.options].map((option) => Number(option.value));
    if (existing.length !== values.length || existing.some((value, i) => value !== values[i])) {
      lengthSelect.replaceChildren(
        ...values.map((value) => el('option', { value: String(value), text: `${value} minutes` })),
      );
    }
    if (document.activeElement !== lengthSelect) lengthSelect.value = String(settings.focusMinutes);
    // The length applies to the next session, so it is only offered when no timer is set up.
    lengthSelect.disabled = !loaded || pending || state !== null;
  }

  function renderControls() {
    controls.replaceChildren(
      ...timerActions(state).map((item) =>
        el(
          'button',
          {
            type: 'button',
            class: `bw-btn ${item.primary ? 'bw-btn-primary' : 'bw-btn-secondary'}`,
            disabled: pending || !loaded,
            onClick: () => void run(item.action),
          },
          [icon(item.icon, { size: 15 }), el('span', { text: item.label })],
        ),
      ),
    );
  }

  function renderDots() {
    const every = settings.longBreakEvery;
    const filled = filledDots(state?.cycle ?? 0, every);
    dots.replaceChildren(
      ...Array.from({ length: every }, (_, index) =>
        el('span', { class: `fo-dot${index < filled ? ' is-filled' : ''}` }),
      ),
    );
    dots.setAttribute(
      'aria-label',
      `${filled} of ${every} focus sessions completed before the next long break`,
    );
  }

  /** Redraws the ring and the page title from the current state and clock. */
  function tick() {
    const current = now();
    const view = timerView(state, settings.focusMinutes, current);

    ring.update({
      fraction: view.fraction,
      timeText: formatClock(view.timeMs),
      spokenTime: `${describeClock(view.timeMs)} left`,
      phaseText: view.phaseText,
      noteText: view.noteText,
      tone: view.tone,
    });

    // The countdown also shows in the browser tab while a phase is running.
    document.title =
      state?.status === FOCUS_STATUS.RUNNING
        ? `${formatClock(view.timeMs)} \u00b7 ${PHASE_LABELS[state.phase]} \u2013 BrowseWise`
        : baseTitle;

    if (state && isDue(state, current)) requestSettle(state, current);
  }

  /** The phase has reached its end: ask the worker to settle it (once, retrying if it fails). */
  function requestSettle(current, time) {
    const key = `${current.sessionId}:${current.endsAt}`;
    if ((syncAttempts.get(key) ?? 0) > time) return;
    syncAttempts.set(key, time + RETRY_SYNC_MS);

    sendFocusCommand('sync')
      .then((next) => {
        applyState(next);
        void view.refresh({ silent: true });
      })
      .catch((error) => console.debug('[BrowseWise] could not settle the timer yet', error));
  }

  function applyState(next) {
    state = next;
    renderControls();
    renderDots();
    syncLengthOptions();
    tick();
  }

  async function run(action) {
    if (pending) return;
    pending = true;
    errorLine.textContent = '';
    renderControls();
    syncLengthOptions();
    try {
      applyState(await sendFocusCommand(action));
      void view.refresh({ silent: true });
    } catch (error) {
      errorLine.textContent = error.message;
    } finally {
      pending = false;
      renderControls();
      syncLengthOptions();
    }
  }

  /* ---------- the live-updating region: numbers, streaks, badges ---------- */

  function renderWeek(week) {
    const highest = Math.max(1, ...week.map((entry) => entry.sessions));
    return el(
      'section',
      { class: 'bw-card fo-week', 'aria-label': 'Sessions in the last 7 days' },
      [
        el('h2', { class: 'db-panel-title', text: 'Last 7 days' }),
        el(
          'ol',
          { class: 'fo-week-bars' },
          week.map((entry) =>
            el(
              'li',
              {
                class: 'fo-week-day',
                'aria-label': `${dayShort(entry.dateKey, locale)}: ${plural(entry.sessions, 'session', 'sessions')}`,
              },
              [
                el('div', { class: 'fo-week-track', 'aria-hidden': 'true' }, [
                  el('div', {
                    class: `fo-week-bar${entry.sessions > 0 ? ' has-sessions' : ''}`,
                    style: `height: ${entry.sessions > 0 ? Math.max(10, (entry.sessions / highest) * 100) : 4}%`,
                  }),
                ]),
                el('span', { class: 'fo-week-count bw-num', text: String(entry.sessions) }),
                el('span', {
                  class: 'fo-week-label',
                  text: dayShort(entry.dateKey, locale).split(',')[0],
                  'aria-hidden': 'true',
                }),
              ],
            ),
          ),
        ),
      ],
    );
  }

  function streakCard({ label, iconName, streak, emptyHint, bestHint }) {
    return statCard({
      label,
      iconName,
      value: plural(streak.current, 'day', 'days'),
      hint:
        streak.current === 0 && streak.best === 0
          ? emptyHint
          : `Best: ${plural(streak.best, 'day', 'days')}`,
      hintTitle: bestHint,
    });
  }

  function renderReady(data) {
    // Keep the timer and its controls in line with what is stored.
    loaded = true;
    settings = { ...settings, ...data.settings };
    applyState(data.state);

    const earnedIds = data.badges
      .filter((item) => item.earnedOn !== null)
      .map((item) => item.badge.id);
    const newBadges =
      knownBadges === null
        ? []
        : data.badges.filter((item) => item.earnedOn !== null && !knownBadges.has(item.badge.id));
    knownBadges = new Set(earnedIds);

    const sessionFinished = knownSessions !== null && data.today.sessions > knownSessions;
    knownSessions = data.today.sessions;
    if (sessionFinished) {
      announce('Focus session complete. Well done.');
      ring.element.classList.remove('is-pulsing');
      void ring.element.offsetWidth; // restart the animation if it is already playing
      ring.element.classList.add('is-pulsing');
    }

    const side = [
      el('div', { class: 'db-stats fo-stats' }, [
        statCard({
          label: 'Focus today',
          iconName: 'timer',
          value: formatDuration(data.today.focusMs),
          hint: plural(data.today.sessions, 'session', 'sessions'),
        }),
        statCard({
          label: 'All time',
          iconName: 'clock',
          value: formatDuration(data.allTime.focusMs),
          hint: plural(data.allTime.sessions, 'session', 'sessions'),
        }),
        ...(data.settings.showAchievements
          ? [
              streakCard({
                label: 'Focus streak',
                iconName: 'flame',
                streak: data.streaks.focus,
                emptyHint: 'Finish a session to start one',
                bestHint: 'Days in a row with at least one completed focus session.',
              }),
              streakCard({
                label: 'Within your goal',
                iconName: 'target',
                streak: data.streaks.goal,
                emptyHint: 'Set a daily goal on the Goals page',
                bestHint:
                  'Days in a row within your daily goal. Days with no recorded time, or no goal set, are skipped.',
              }),
            ]
          : []),
      ]),
      renderWeek(data.week),
    ];

    const sections = [el('div', { class: 'fo-side' }, side)];

    if (data.settings.showAchievements) {
      const earned = data.badges
        .filter((item) => item.earnedOn !== null)
        .sort((a, b) => (a.earnedOn < b.earnedOn ? 1 : -1));
      const locked = data.badges.filter((item) => item.earnedOn === null);
      const ordered = [...earned, ...locked];

      sections.push(
        el('section', { class: 'fo-badges', 'aria-label': 'Badges' }, [
          el('div', { class: 'fo-badges-head' }, [
            el('h2', { class: 'db-panel-title', text: 'Badges' }),
            el('span', {
              class: 'fo-badges-count bw-num',
              text: `${earned.length} of ${data.badges.length} earned`,
            }),
          ]),
          el('p', {
            class: 'db-config-desc',
            text: 'Badges come from sessions you complete and goals you set yourself. They are never about using the browser more or less.',
          }),
          el(
            'ul',
            { class: 'fo-badge-grid' },
            ordered.map((item) => badgeCard({ ...item, locale })),
          ),
        ]),
      );
    } else {
      sections.push(
        el('p', { class: 'db-config-desc fo-hidden-note' }, [
          'Streaks and badges are hidden. ',
          el('a', { class: 'db-link', href: '#settings', text: 'Turn them on in Settings' }),
          '.',
        ]),
      );
    }

    const wrapper = el('div', { class: 'fo-data' }, sections);
    return {
      node: wrapper,
      mounted: () => {
        if (newBadges.length > 0) {
          const titles = newBadges.map((item) => item.badge.title).join(', ');
          announce(`New ${newBadges.length === 1 ? 'badge' : 'badges'}: ${titles}.`);
          celebrate({ anchor: wrapper.querySelector('.fo-badge.is-earned') });
        }
      },
    };
  }

  const results = el('div', { class: 'db-results fo-results' });
  const view = createDataView({
    container: results,
    load: () => loadFocusData(now()),
    renderReady,
    requestLiveFlush,
    subscribe,
  });

  /* ---------- layout ---------- */

  renderControls();
  renderDots();
  syncLengthOptions();
  tick();

  container.replaceChildren(
    pageHeader({
      title: 'Focus',
      description:
        'A simple timer for focused work and breaks. It counts clock time, nothing more.',
    }),
    el('div', { class: 'fo-layout' }, [
      el('section', { class: 'bw-card fo-timer-card', 'aria-label': 'Focus timer' }, [
        ring.element,
        dots,
        controls,
        errorLine,
        el('div', { class: 'fo-length' }, [
          el('label', { for: 'focus-length', text: 'Next focus session' }),
          lengthSelect,
        ]),
        el('p', {
          class: 'db-config-desc',
          id: 'focus-length-help',
          text: 'Breaks and the long-break rhythm are in Settings. The timer keeps running when this tab is closed.',
        }),
        status,
      ]),
      results,
    ]),
  );

  void view.start();
  // Catch up on anything that finished while the dashboard was closed.
  sendFocusCommand('sync')
    .then((next) => {
      if (JSON.stringify(next) !== JSON.stringify(state)) applyState(next);
    })
    .catch((error) => console.debug('[BrowseWise] focus sync on open failed', error));

  const tickId = setInterval(tick, TICK_MS);

  return {
    unmount: () => {
      clearInterval(tickId);
      clearTimeout(statusTimer);
      document.title = baseTitle;
      view.dispose();
    },
  };
}
