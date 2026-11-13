import { formatDuration, formatPercent } from '../../shared/format.js';
import { describeRemaining, normalizeLimitDomain, parseDuration } from '../../shared/limits.js';
import { el } from '../../ui/dom.js';
import { createFavicon } from '../../ui/favicon-image.js';
import { icon } from '../../ui/icons.js';
import { confirmDialog } from '../components/confirm-dialog.js';
import { createDataView } from '../components/data-view.js';
import { pageHeader } from '../components/page-header.js';

const STATUS_MS = 4000;
const LEVEL_CLASS = { ok: '', warning: ' bw-bar-fill-warning', exceeded: ' bw-bar-fill-danger' };

/* ---------- small builders ---------- */

function numberField({ id, label, max }) {
  const input = el('input', {
    id,
    type: 'number',
    class: 'bw-input bw-input-plain',
    min: 0,
    max,
    step: 1,
    inputmode: 'numeric',
    placeholder: '0',
    autocomplete: 'off',
  });
  return {
    input,
    element: el('div', { class: 'db-field' }, [el('label', { for: id, text: label }), input]),
  };
}

function iconButton(iconName, label, onClick) {
  return el(
    'button',
    { type: 'button', class: 'bw-icon-btn', 'aria-label': label, title: label, onClick },
    [icon(iconName)],
  );
}

/** One goal or limit: name, progress bar, usage text, and edit/remove actions. */
function limitRow({ nameNode, label, entry, onEdit, onRemove }) {
  const used = formatDuration(entry.usedMs);
  const limit = formatDuration(entry.limitMs);
  const remaining = describeRemaining(entry);
  const spoken = `${used} of ${limit} used. ${remaining}.`;

  return el('li', { class: `db-limit db-limit-${entry.level}` }, [
    el('div', { class: 'db-limit-head' }, [
      el('div', { class: 'db-limit-name' }, [nameNode]),
      el('div', { class: 'db-limit-actions' }, [
        iconButton('pencil', `Edit ${label}`, onEdit),
        iconButton('trash', `Remove ${label}`, onRemove),
      ]),
    ]),
    el(
      'div',
      {
        class: 'bw-bar bw-bar-lg',
        role: 'progressbar',
        'aria-label': label,
        'aria-valuemin': 0,
        'aria-valuemax': Math.round(entry.limitMs / 60_000),
        'aria-valuenow': Math.min(
          Math.round(entry.usedMs / 60_000),
          Math.round(entry.limitMs / 60_000),
        ),
        'aria-valuetext': spoken,
      },
      [
        el('div', {
          class: `bw-bar-fill${LEVEL_CLASS[entry.level]}`,
          style: `width: ${Math.min(entry.share, 1) * 100}%`,
        }),
      ],
    ),
    el('div', { class: 'db-limit-meta' }, [
      el('span', {
        class: 'bw-num',
        text: `${used} of ${limit} \u00b7 ${formatPercent(Math.min(entry.share, 9.99))}`,
      }),
      el('span', { class: 'db-limit-state', text: remaining }),
    ]),
  ]);
}

/**
 * Mounts the Goals & limits page.
 *
 * The top card (today's progress) is a live data view. The forms live OUTSIDE it, so
 * a background refresh never wipes what the user is typing; "Edit" simply fills the
 * forms. Goals only measure and remind: BrowseWise never blocks a website.
 *
 * @param {HTMLElement} container
 * @param {object} deps
 * @returns {{unmount: () => void}}
 */
export function mountGoalsPage(
  container,
  {
    loadGoalsData,
    setDailyGoal,
    setSiteLimit,
    clearAllGoals,
    acknowledgeCurrentlyExceeded,
    updateSettings,
    requestNotificationsPermission,
    removeNotificationsPermission,
    showTestNotification,
    confirm = confirmDialog,
    requestLiveFlush,
    subscribe,
    now = Date.now,
  },
) {
  let latest = null;
  let goalDirty = false;
  let statusTimer;

  const announcer = el('p', { class: 'db-status', role: 'status' });
  const results = el('div', { class: 'db-results' });

  function announce(text) {
    clearTimeout(statusTimer);
    announcer.textContent = text;
    statusTimer = setTimeout(() => (announcer.textContent = ''), STATUS_MS);
  }

  const refresh = () => view.refresh({ silent: true });

  async function attempt(action, failureText) {
    try {
      await action();
      return true;
    } catch (error) {
      console.error('[BrowseWise] goals action failed', error);
      announce(error instanceof RangeError ? error.message : failureText);
      return false;
    }
  }

  /* ---------- daily goal form ---------- */

  const goalHours = numberField({ id: 'goal-hours', label: 'Hours', max: 24 });
  const goalMinutes = numberField({ id: 'goal-minutes', label: 'Minutes', max: 59 });
  const goalError = el('p', { class: 'db-field-error', role: 'alert' });

  function showError(target, inputs, message) {
    target.textContent = message;
    for (const input of inputs)
      input.setAttribute('aria-invalid', message === '' ? 'false' : 'true');
  }

  function setDuration(hoursInput, minutesInput, ms) {
    const totalMinutes = Math.round(ms / 60_000);
    hoursInput.value = String(Math.floor(totalMinutes / 60));
    minutesInput.value = String(totalMinutes % 60);
  }

  for (const field of [goalHours, goalMinutes]) {
    field.input.addEventListener('input', () => (goalDirty = true));
  }

  const goalForm = el(
    'form',
    {
      class: 'db-form',
      novalidate: true,
      onSubmit: async (event) => {
        event.preventDefault();
        const parsed = parseDuration({
          hours: goalHours.input.value,
          minutes: goalMinutes.input.value,
        });
        showError(goalError, [goalHours.input, goalMinutes.input], parsed.ok ? '' : parsed.error);
        if (!parsed.ok) return;

        if (
          await attempt(() => setDailyGoal(parsed.ms, { now: now() }), 'Could not save the goal.')
        ) {
          goalDirty = false;
          announce(`Daily goal saved: ${formatDuration(parsed.ms)}.`);
          void refresh();
        }
      },
    },
    [
      el('div', { class: 'db-form-row' }, [
        goalHours.element,
        goalMinutes.element,
        el('button', { type: 'submit', class: 'bw-btn bw-btn-primary', text: 'Save goal' }),
      ]),
      goalError,
    ],
  );

  /* ---------- website limit form ---------- */

  const suggestions = el('datalist', { id: 'limit-suggestions' });
  const siteInput = el('input', {
    id: 'limit-site',
    type: 'text',
    class: 'bw-input bw-input-plain',
    placeholder: 'youtube.com',
    list: 'limit-suggestions',
    autocomplete: 'off',
    spellcheck: 'false',
    'aria-label': 'Website',
  });
  const limitHours = numberField({ id: 'limit-hours', label: 'Hours', max: 24 });
  const limitMinutes = numberField({ id: 'limit-minutes', label: 'Minutes', max: 59 });
  const limitError = el('p', { class: 'db-field-error', role: 'alert' });
  const limitSubmit = el('button', {
    type: 'submit',
    class: 'bw-btn bw-btn-primary',
    text: 'Add limit',
  });

  function updateLimitButton() {
    const parsed = normalizeLimitDomain(siteInput.value);
    const exists =
      parsed.ok && latest !== null && Object.hasOwn(latest.goals.siteLimits, parsed.domain);
    limitSubmit.textContent = exists ? 'Update limit' : 'Add limit';
  }
  siteInput.addEventListener('input', updateLimitButton);

  const limitForm = el(
    'form',
    {
      class: 'db-form',
      novalidate: true,
      onSubmit: async (event) => {
        event.preventDefault();
        const site = normalizeLimitDomain(siteInput.value);
        const duration = parseDuration({
          hours: limitHours.input.value,
          minutes: limitMinutes.input.value,
        });
        const message = !site.ok ? site.error : !duration.ok ? duration.error : '';
        showError(limitError, [siteInput], site.ok ? '' : site.error);
        if (site.ok && !duration.ok)
          showError(limitError, [limitHours.input, limitMinutes.input], duration.error);
        if (message !== '') return;

        const saved = await attempt(
          () => setSiteLimit(site.domain, duration.ms, { now: now() }),
          'Could not save the limit.',
        );
        if (!saved) return;

        announce(`Limit saved for ${site.domain}: ${formatDuration(duration.ms)} a day.`);
        siteInput.value = '';
        limitHours.input.value = '';
        limitMinutes.input.value = '';
        showError(limitError, [siteInput, limitHours.input, limitMinutes.input], '');
        updateLimitButton();
        void refresh();
      },
    },
    [
      el('div', { class: 'db-form-row' }, [
        el('div', { class: 'db-field db-field-grow' }, [
          el('label', { for: 'limit-site', text: 'Website' }),
          siteInput,
          suggestions,
        ]),
        limitHours.element,
        limitMinutes.element,
        limitSubmit,
      ]),
      limitError,
    ],
  );

  /* ---------- editing and removing (called from the progress rows) ---------- */

  function focusForm(input, form) {
    form.scrollIntoView?.({ block: 'center' });
    input.focus();
  }

  function editGoal(entry) {
    setDuration(goalHours.input, goalMinutes.input, entry.limitMs);
    goalDirty = true;
    showError(goalError, [goalHours.input, goalMinutes.input], '');
    focusForm(goalHours.input, goalForm);
  }

  function editSite(entry) {
    siteInput.value = entry.domain;
    setDuration(limitHours.input, limitMinutes.input, entry.limitMs);
    showError(limitError, [siteInput, limitHours.input, limitMinutes.input], '');
    updateLimitButton();
    focusForm(limitHours.input, limitForm);
  }

  async function removeGoal() {
    if (await attempt(() => setDailyGoal(null, { now: now() }), 'Could not remove the goal.')) {
      goalHours.input.value = '';
      goalMinutes.input.value = '';
      goalDirty = false;
      announce('Daily goal removed.');
      void refresh();
    }
  }

  async function removeSite(entry) {
    if (
      await attempt(
        () => setSiteLimit(entry.domain, null, { now: now() }),
        'Could not remove the limit.',
      )
    ) {
      announce(`Limit removed for ${entry.domain}.`);
      updateLimitButton();
      void refresh();
    }
  }

  /* ---------- notifications ---------- */

  const notifySwitch = el('button', {
    type: 'button',
    class: 'bw-switch',
    role: 'switch',
    id: 'notify-switch',
    'aria-checked': 'false',
    'aria-describedby': 'notify-status',
  });
  const notifyStatus = el('p', { class: 'db-notify-status', id: 'notify-status' });
  const testButton = el('button', {
    type: 'button',
    class: 'bw-btn bw-btn-secondary',
    text: 'Send a test notification',
  });

  notifySwitch.addEventListener('click', async () => {
    const turningOn = notifySwitch.getAttribute('aria-checked') !== 'true';
    notifySwitch.disabled = true;
    try {
      if (turningOn) {
        // Must be the first thing that happens in the click: Chrome only shows the
        // permission prompt in direct response to a user gesture.
        const granted = await requestNotificationsPermission();
        if (!granted) {
          await updateSettings({ notificationsEnabled: false });
          announce('Chrome did not grant the permission, so notifications stay off.');
          return;
        }
        await updateSettings({ notificationsEnabled: true });
        await acknowledgeCurrentlyExceeded({ now: now() });
        announce('Notifications are on.');
      } else {
        await updateSettings({ notificationsEnabled: false });
        await removeNotificationsPermission();
        announce('Notifications are off.');
      }
    } catch (error) {
      console.error('[BrowseWise] could not change notifications', error);
      announce('Could not change the notification setting.');
    } finally {
      notifySwitch.disabled = false;
      void refresh();
    }
  });

  testButton.addEventListener('click', async () => {
    const shown = await showTestNotification();
    announce(
      shown
        ? 'Test notification sent. If you cannot see it, check your system notification settings.'
        : 'Could not show a notification. Check that notifications are on.',
    );
  });

  function syncNotifications({ enabled, granted }) {
    const effective = enabled && granted;
    notifySwitch.setAttribute('aria-checked', String(effective));
    testButton.disabled = !effective;
    notifyStatus.textContent = effective
      ? 'On. You get one notification the first time you reach each goal or limit in a day.'
      : enabled && !granted
        ? 'The notifications permission was removed in Chrome. Turn this on again to receive alerts.'
        : 'Off.';
  }

  /* ---------- reset everything ---------- */

  const resetButton = el('button', {
    type: 'button',
    class: 'bw-btn bw-btn-danger',
    text: 'Remove all goals and limits',
  });
  resetButton.addEventListener('click', async () => {
    const confirmed = await confirm({
      title: 'Remove all goals and limits?',
      message:
        'This deletes your daily goal and every website limit. Your browsing history is not affected.',
      confirmLabel: 'Remove all',
      danger: true,
    });
    if (!confirmed) return;
    if (await attempt(() => clearAllGoals(), 'Could not remove the goals.')) {
      goalHours.input.value = '';
      goalMinutes.input.value = '';
      goalDirty = false;
      announce('All goals and limits removed.');
      void refresh();
    }
  });

  /* ---------- today's progress (the live data view) ---------- */

  function renderStatus(data) {
    const { status } = data;
    const rows = [];

    if (status.goal) {
      rows.push(
        limitRow({
          nameNode: el('span', { class: 'db-limit-title' }, [
            icon('target', { size: 16 }),
            'Daily goal \u00b7 all websites',
          ]),
          label: 'daily goal',
          entry: status.goal,
          onEdit: () => editGoal(status.goal),
          onRemove: removeGoal,
        }),
      );
    }
    for (const site of status.sites) {
      rows.push(
        limitRow({
          nameNode: el('span', { class: 'db-limit-title' }, [
            createFavicon(site.domain, { size: 16 }),
            el('span', { class: 'db-site-name', text: site.domain, title: site.domain }),
          ]),
          label: `limit for ${site.domain}`,
          entry: site,
          onEdit: () => editSite(site),
          onRemove: () => removeSite(site),
        }),
      );
    }

    return el('section', { class: 'bw-card db-panel', 'aria-label': 'Today\u2019s progress' }, [
      el('div', { class: 'db-panel-head' }, [
        el('h2', { class: 'db-panel-title', text: 'Today\u2019s progress' }),
        el('p', { class: 'db-summary', text: `${formatDuration(status.usedToday)} browsed today` }),
      ]),
      rows.length > 0
        ? el('ul', { class: 'db-limits' }, rows)
        : el('p', {
            class: 'db-empty-note',
            text: 'No goals or limits yet. Set a daily goal or a website limit below.',
          }),
    ]);
  }

  /** Brings the controls outside the data region in line with the latest data. */
  function syncControls(data) {
    latest = data;

    const formHasFocus = goalForm.contains(document.activeElement);
    if (!goalDirty && !formHasFocus) {
      if (data.goals.dailyGoalMs === null) {
        goalHours.input.value = '';
        goalMinutes.input.value = '';
      } else {
        setDuration(goalHours.input, goalMinutes.input, data.goals.dailyGoalMs);
      }
    }

    suggestions.replaceChildren(
      ...data.suggestions.map((domain) => el('option', { value: domain })),
    );
    syncNotifications(data.notifications);
    resetButton.disabled =
      data.goals.dailyGoalMs === null && Object.keys(data.goals.siteLimits).length === 0;
    updateLimitButton();
  }

  const view = createDataView({
    container: results,
    load: () => loadGoalsData(now()),
    requestLiveFlush,
    subscribe,
    renderReady: (data) => {
      syncControls(data);
      return renderStatus(data);
    },
  });

  /* ---------- page layout ---------- */

  const section = (title, description, ...children) =>
    el('section', { class: 'bw-card db-config', 'aria-label': title }, [
      el('h2', { class: 'db-panel-title', text: title }),
      el('p', { class: 'db-config-desc', text: description }),
      ...children,
    ]);

  container.replaceChildren(
    pageHeader({
      title: 'Goals & limits',
      description:
        'Set a daily goal and per-website limits. BrowseWise only reminds you. It never blocks a website.',
    }),
    announcer,
    el('div', { class: 'db-stack' }, [
      results,
      section('Daily goal', 'A limit for your total active browsing time each day.', goalForm),
      section(
        'Website limits',
        'A daily limit for one website. Pick a suggestion or type an address.',
        limitForm,
      ),
      section(
        'Notifications',
        'Get a desktop notification the first time you reach a goal or limit each day.',
        el('div', { class: 'db-switch-row' }, [
          notifySwitch,
          el('label', { for: 'notify-switch', text: 'Notify me when a goal or limit is reached' }),
        ]),
        notifyStatus,
        el('div', { class: 'db-form-row' }, [testButton]),
      ),
      el('section', { class: 'db-danger-zone', 'aria-label': 'Reset' }, [
        el('p', {
          class: 'db-config-desc',
          text: 'Remove your goal and every website limit in one step.',
        }),
        resetButton,
      ]),
    ]),
  );

  void view.start();

  return {
    unmount: () => {
      clearTimeout(statusTimer);
      view.dispose();
    },
  };
}
