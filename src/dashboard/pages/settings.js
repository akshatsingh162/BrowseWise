import { buildCsv, buildJsonExport, EXPORT_RANGES, exportFilename } from '../../shared/export.js';
import { dayShort } from '../../shared/labels.js';
import { totalMs } from '../../shared/stats.js';
import { formatBytes, isStorageNearlyFull } from '../../shared/storage-usage.js';
import { DEFAULT_SETTINGS, SETTINGS_LIMITS } from '../../shared/storage/schema.js';
import { el } from '../../ui/dom.js';
import { icon } from '../../ui/icons.js';
import { confirmDialog } from '../components/confirm-dialog.js';
import { createFocusSettings } from '../components/focus-settings.js';
import { switchRow } from '../components/switch-row.js';
import { createDataView } from '../components/data-view.js';
import { pageHeader } from '../components/page-header.js';

const STATUS_MS = 5000;

/** Retention choices, in days. A stored value that is not one of these gets its own entry. */
export const RETENTION_PRESETS = Object.freeze([30, 90, 180, 365, 730, 1825, 3650]);

const PRESET_LABELS = new Map([
  [365, '1 year (default)'],
  [730, '2 years'],
  [1825, '5 years'],
  [3650, '10 years'],
]);

/** @param {number} days */
export function retentionLabel(days) {
  if (PRESET_LABELS.has(days)) return PRESET_LABELS.get(days);
  return RETENTION_PRESETS.includes(days) ? `${days} days` : `${days} days (custom)`;
}

const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`;

/**
 * Validates the idle threshold. A bad value is rejected with a message, never
 * silently changed to something else.
 * @param {string} text what the user typed
 * @returns {{ok: true, seconds: number} | {ok: false, error: string}}
 */
export function parseIdleSeconds(text) {
  const { min, max } = SETTINGS_LIMITS.idleThresholdSeconds;
  const error = `Enter a whole number of seconds from ${min} to ${max}.`;
  const trimmed = String(text ?? '').trim();
  if (!/^\d+$/.test(trimmed)) return { ok: false, error };
  const seconds = Number(trimmed);
  return seconds >= min && seconds <= max ? { ok: true, seconds } : { ok: false, error };
}

/* ---------- small builders ---------- */

function section(title, description, ...children) {
  return el('section', { class: 'bw-card db-config', 'aria-label': title }, [
    el('h2', { class: 'db-panel-title', text: title }),
    description && el('p', { class: 'db-config-desc', text: description }),
    ...children,
  ]);
}

function privacyList(title, items) {
  return el('div', { class: 'db-privacy-col' }, [
    el('h3', { class: 'db-privacy-title', text: title }),
    el(
      'ul',
      { class: 'db-privacy-list' },
      items.map((text) => el('li', { text })),
    ),
  ]);
}

function fact(label, value) {
  return el('div', { class: 'db-fact' }, [
    el('dt', { text: label }),
    el('dd', { class: 'bw-num', text: value }),
  ]);
}

function dateRange(summary, locale) {
  if (summary.firstKey === null) return '\u2014';
  const first = dayShort(summary.firstKey, locale);
  return summary.firstKey === summary.lastKey
    ? first
    : `${first} \u2013 ${dayShort(summary.lastKey, locale)}`;
}

/**
 * Mounts the Settings page: tracking preferences, how long history is kept, export,
 * deletion, and a plain-language privacy summary.
 *
 * Every control is built once and then kept in line with the stored values, so a
 * background refresh never wipes what the user is typing. Only the small "stored
 * history" summary is redrawn by the data view. Anything that deletes data asks first.
 *
 * @param {HTMLElement} container
 * @param {object} deps
 * @param {() => Promise<object>} deps.loadSettingsData
 * @param {(rangeId: string, now: number) => Promise<object>} deps.collectExportData
 * @param {(retentionDays: number, now: number) => Promise<number>} deps.countDaysToDelete
 * @param {(patch: object) => Promise<object>} deps.updateSettings
 * @param {(scope: 'history'|'everything') => Promise<unknown>} deps.requestErase
 * @param {(filename: string, text: string, mime: string, options?: object) => void} deps.downloadTextFile
 * @param {() => Promise<unknown>} deps.removeNotificationsPermission
 * @param {typeof confirmDialog} [deps.confirm]
 * @param {() => string} [deps.getAppVersion]
 * @param {() => Promise<unknown>} deps.requestLiveFlush
 * @param {(cb: () => void) => () => void} deps.subscribe
 * @param {() => number} [deps.now]
 * @param {string} [deps.locale]
 * @returns {{unmount: () => void}}
 */
export function mountSettingsPage(
  container,
  {
    loadSettingsData,
    collectExportData,
    countDaysToDelete,
    updateSettings,
    requestErase,
    downloadTextFile,
    removeNotificationsPermission,
    confirm = confirmDialog,
    getAppVersion = () => chrome.runtime.getManifest().version,
    requestLiveFlush,
    subscribe,
    now = Date.now,
    locale,
  },
) {
  let latest = null;
  let currentRetention = DEFAULT_SETTINGS.retentionDays;
  let idleDirty = false;
  let busy = false;
  let statusTimer;

  const announcer = el('p', { class: 'db-status', role: 'status' });

  function announce(text) {
    clearTimeout(statusTimer);
    announcer.textContent = text;
    statusTimer = setTimeout(() => (announcer.textContent = ''), STATUS_MS);
  }

  const refresh = () => view.refresh({ silent: true });

  /* ---------- tracking ---------- */

  const { min: idleMin, max: idleMax } = SETTINGS_LIMITS.idleThresholdSeconds;
  const idleInput = el('input', {
    id: 'idle-seconds',
    type: 'number',
    class: 'bw-input bw-input-plain',
    min: idleMin,
    max: idleMax,
    step: 1,
    inputmode: 'numeric',
    autocomplete: 'off',
    'aria-describedby': 'idle-help idle-error',
  });
  const idleError = el('p', { class: 'db-field-error', id: 'idle-error', role: 'alert' });
  const idleSave = el('button', { type: 'submit', class: 'bw-btn bw-btn-primary', text: 'Save' });

  idleInput.addEventListener('input', () => (idleDirty = true));

  const idleForm = el(
    'form',
    {
      class: 'db-form',
      novalidate: true,
      onSubmit: async (event) => {
        event.preventDefault();
        const parsed = parseIdleSeconds(idleInput.value);
        idleError.textContent = parsed.ok ? '' : parsed.error;
        idleInput.setAttribute('aria-invalid', parsed.ok ? 'false' : 'true');
        if (!parsed.ok) return;

        try {
          await updateSettings({ idleThresholdSeconds: parsed.seconds });
          idleDirty = false;
          announce(`Idle threshold saved: ${plural(parsed.seconds, 'second', 'seconds')}.`);
          void refresh();
        } catch (error) {
          console.error('[BrowseWise] could not save the idle threshold', error);
          announce('Could not save the idle threshold. Please try again.');
        }
      },
    },
    [
      el('div', { class: 'db-form-row' }, [
        el('div', { class: 'db-field' }, [
          el('label', { for: 'idle-seconds', text: 'Idle threshold (seconds)' }),
          idleInput,
        ]),
        idleSave,
      ]),
      el('p', {
        class: 'db-config-desc',
        id: 'idle-help',
        text: `Time stops counting after this many seconds without keyboard or mouse use. From ${idleMin} to ${idleMax}. The default is ${DEFAULT_SETTINGS.idleThresholdSeconds}.`,
      }),
      idleError,
    ],
  );

  const audibleSwitch = switchRow({
    id: 'setting-audible',
    label: 'Count tabs playing sound as active',
    description:
      'Keep counting while you are idle if the tab in front is playing sound, for example a video you are watching.',
  });
  const localSwitch = switchRow({
    id: 'setting-local',
    label: 'Track local websites',
    description:
      'Include localhost, local network names and IP addresses, which are useful for developers.',
  });

  /** Flips a switch right away, saves, and puts it back if saving fails. */
  function wireSwitch({ button }, key, label) {
    button.addEventListener('click', async () => {
      const next = button.getAttribute('aria-checked') !== 'true';
      button.setAttribute('aria-checked', String(next));
      button.disabled = true;
      try {
        await updateSettings({ [key]: next });
        announce(`${label} turned ${next ? 'on' : 'off'}.`);
      } catch (error) {
        console.error(`[BrowseWise] could not save ${key}`, error);
        button.setAttribute('aria-checked', String(!next));
        announce(`Could not save the setting for \u201c${label}\u201d. Please try again.`);
      } finally {
        button.disabled = false;
        void refresh();
      }
    });
  }
  const dockSwitch = switchRow({
    id: 'setting-dock-autohide',
    label: 'Hide the navigation dock while scrolling down',
    description:
      'The dock slides away as you scroll down, to leave more room, and returns when you scroll up, move the mouse to the bottom edge, or press Tab. Turn this off to keep it always visible.',
  });

  const focusSettings = createFocusSettings({ updateSettings, announce });

  wireSwitch(audibleSwitch, 'countAudibleTabsAsActive', 'Count tabs playing sound as active');
  wireSwitch(localSwitch, 'trackLocalHosts', 'Track local websites');
  wireSwitch(dockSwitch, 'dockAutoHide', 'Hide the navigation dock while scrolling down');

  /* ---------- history length ---------- */

  const retentionSelect = el('select', {
    id: 'retention-days',
    class: 'bw-select',
    'aria-describedby': 'retention-help',
  });

  function syncRetentionOptions(days) {
    const values = RETENTION_PRESETS.includes(days)
      ? [...RETENTION_PRESETS]
      : [days, ...RETENTION_PRESETS];
    values.sort((a, b) => a - b);
    const existing = [...retentionSelect.options].map((option) => Number(option.value));
    if (existing.length !== values.length || existing.some((value, i) => value !== values[i])) {
      retentionSelect.replaceChildren(
        ...values.map((value) =>
          el('option', { value: String(value), text: retentionLabel(value) }),
        ),
      );
    }
    retentionSelect.value = String(days);
  }

  retentionSelect.addEventListener('change', async () => {
    const next = Number(retentionSelect.value);
    const previous = currentRetention;
    if (next === previous) return;
    const revert = () => (retentionSelect.value = String(previous));

    if (next < previous) {
      let expired;
      try {
        expired = await countDaysToDelete(next, now());
      } catch (error) {
        console.error('[BrowseWise] could not count the days to delete', error);
        revert();
        announce('Could not check which days would be deleted. Nothing was changed.');
        return;
      }

      if (expired > 0) {
        const confirmed = await confirm({
          title: `Keep only ${retentionLabel(next).replace(' (default)', '')}?`,
          message: `This permanently deletes ${plural(expired, 'day', 'days')} of history (browsing time and focus sessions) that ${expired === 1 ? 'is' : 'are'} older than that. It happens right away and cannot be undone. Export your data first if you want a copy.`,
          confirmLabel: `Delete ${plural(expired, 'day', 'days')}`,
          danger: true,
        });
        if (!confirmed) {
          revert();
          return;
        }
      }
    }

    try {
      await updateSettings({ retentionDays: next });
      currentRetention = next;
      announce(`History is now kept for ${retentionLabel(next).replace(' (default)', '')}.`);
    } catch (error) {
      console.error('[BrowseWise] could not save the retention setting', error);
      revert();
      announce('Could not save the setting. Please try again.');
    } finally {
      void refresh();
    }
  });

  /* ---------- notifications ---------- */

  const notifyText = el('p', { class: 'db-notify-status' });

  function syncNotifications({ enabled, granted }) {
    notifyText.textContent =
      enabled && granted
        ? 'On. You get one notification the first time you reach each goal or limit in a day.'
        : enabled && !granted
          ? 'Switched on, but Chrome\u2019s notifications permission was removed. Turn it on again on the Goals & limits page.'
          : 'Off.';
  }

  /* ---------- your data ---------- */

  const exportRange = el(
    'select',
    { id: 'export-range', class: 'bw-select', 'aria-label': 'Export range' },
    EXPORT_RANGES.map((range) => el('option', { value: range.id, text: range.label })),
  );

  const exportJsonButton = el('button', { type: 'button', class: 'bw-btn bw-btn-secondary' }, [
    icon('download', { size: 14 }),
    el('span', { text: 'Export JSON' }),
  ]);
  const exportCsvButton = el('button', { type: 'button', class: 'bw-btn bw-btn-secondary' }, [
    icon('download', { size: 14 }),
    el('span', { text: 'Export CSV' }),
  ]);
  const clearButton = el('button', {
    type: 'button',
    class: 'bw-btn bw-btn-danger',
    text: 'Clear history\u2026',
  });
  const deleteButton = el('button', {
    type: 'button',
    class: 'bw-btn bw-btn-danger',
    text: 'Delete everything\u2026',
  });

  const actionButtons = [exportJsonButton, exportCsvButton, clearButton, deleteButton];

  function setBusy(value) {
    busy = value;
    for (const button of actionButtons) button.disabled = value;
    if (!value) syncEraseButtons();
  }

  function syncEraseButtons() {
    clearButton.disabled = busy || (latest !== null && latest.summary.dayCount === 0);
  }

  async function exportData(format) {
    if (busy) return;
    setBusy(true);
    try {
      // Make the numbers current to the second before they are written to a file.
      await requestLiveFlush();
      const timestamp = now();
      const data = await collectExportData(exportRange.value, timestamp);

      if (!data.days.some((day) => totalMs(day) > 0)) {
        announce('There is no browsing data to export for this range.');
        return;
      }

      if (format === 'json') {
        const json = buildJsonExport({ ...data, appVersion: getAppVersion(), now: timestamp });
        downloadTextFile(
          exportFilename('json', timestamp),
          JSON.stringify(json, null, 2),
          'application/json',
        );
      } else {
        // The byte order mark makes Excel read accents and non-Latin names correctly.
        downloadTextFile(
          exportFilename('csv', timestamp),
          buildCsv(data.days, data.categoryOverrides),
          'text/csv',
          { bom: true },
        );
      }
      announce(`Exported ${plural(data.days.length, 'day', 'days')} as ${format.toUpperCase()}.`);
    } catch (error) {
      console.error('[BrowseWise] export failed', error);
      announce('Could not export your data. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  exportJsonButton.addEventListener('click', () => void exportData('json'));
  exportCsvButton.addEventListener('click', () => void exportData('csv'));

  clearButton.addEventListener('click', async () => {
    if (busy) return;
    const days = latest?.summary.dayCount ?? 0;
    const confirmed = await confirm({
      title: 'Clear all history?',
      message: `This permanently deletes the time recorded for every website (${plural(days, 'day', 'days')}), and your focus sessions, streaks and badges. Your settings, goals, limits and category choices are kept. It cannot be undone. Export your data first if you want a copy.`,
      confirmLabel: 'Clear history',
      danger: true,
    });
    if (!confirmed) return;

    setBusy(true);
    try {
      await requestErase('history');
      announce('History cleared.');
    } catch (error) {
      console.error('[BrowseWise] could not clear history', error);
      announce('Could not clear the history. Please try again.');
    } finally {
      setBusy(false);
      void refresh();
    }
  });

  deleteButton.addEventListener('click', async () => {
    if (busy) return;
    const confirmed = await confirm({
      title: 'Delete all BrowseWise data?',
      message:
        'This permanently deletes your browsing history, focus sessions and badges, goals and limits, category choices and settings, and puts BrowseWise back to how it was when you installed it. It cannot be undone. Export your data first if you want a copy.',
      confirmLabel: 'Delete everything',
      danger: true,
    });
    if (!confirmed) return;

    setBusy(true);
    try {
      await requestErase('everything');
      // Settings are back to their defaults, which have notifications off, so the
      // optional permission is released as well. A failure here is not fatal.
      await removeNotificationsPermission();
      idleDirty = false;
      focusSettings.resetDirty();
      announce('Everything was deleted. Settings are back to their defaults.');
    } catch (error) {
      console.error('[BrowseWise] could not delete all data', error);
      announce('Could not delete everything. Please try again.');
    } finally {
      setBusy(false);
      void refresh();
    }
  });

  /* ---------- keeping the controls in line with stored values ---------- */

  function setControlsDisabled(disabled) {
    for (const control of [
      idleInput,
      idleSave,
      audibleSwitch.button,
      localSwitch.button,
      dockSwitch.button,
      retentionSelect,
      exportRange,
    ]) {
      control.disabled = disabled;
    }
    focusSettings.setDisabled(disabled);
    for (const button of actionButtons) button.disabled = disabled;
  }

  function syncControls(data) {
    latest = data;
    const { settings } = data;

    setControlsDisabled(false);
    if (!idleDirty && !idleForm.contains(document.activeElement)) {
      idleInput.value = String(settings.idleThresholdSeconds);
    }
    focusSettings.sync(settings);
    audibleSwitch.button.setAttribute('aria-checked', String(settings.countAudibleTabsAsActive));
    localSwitch.button.setAttribute('aria-checked', String(settings.trackLocalHosts));
    dockSwitch.button.setAttribute('aria-checked', String(settings.dockAutoHide));

    currentRetention = settings.retentionDays;
    if (document.activeElement !== retentionSelect) syncRetentionOptions(currentRetention);

    syncNotifications(data.notifications);
    setBusy(busy); // re-applies the busy state, then the "nothing to clear" rule
  }

  /* ---------- the stored-history summary (the live data view) ---------- */

  const summaryRegion = el('div', { class: 'db-results' });

  const view = createDataView({
    container: summaryRegion,
    load: () => loadSettingsData(),
    requestLiveFlush,
    subscribe,
    renderLoading: () =>
      el('div', { class: 'db-loading', role: 'status', 'aria-label': 'Loading' }, [
        el('div', { class: 'bw-skeleton', style: 'height: 44px' }),
      ]),
    renderReady: (data) => {
      syncControls(data);
      const { summary } = data;
      return el('div', { class: 'db-summary-block' }, [
        el('dl', { class: 'db-facts' }, [
          fact('Days recorded', String(summary.dayCount)),
          fact('Period', dateRange(summary, locale)),
          fact(
            'Storage used',
            summary.bytesInUse === null
              ? 'Unavailable'
              : `${formatBytes(summary.bytesInUse)} of about 10 MB`,
          ),
        ]),
        isStorageNearlyFull(summary.bytesInUse) &&
          el('p', { class: 'db-storage-warning', role: 'status' }, [
            icon('triangle-alert', { size: 14 }),
            el('span', {
              text: 'Storage is nearly full, and new time may stop being saved. Choose a shorter history below, or export your data and clear it.',
            }),
          ]),
      ]);
    },
  });

  /* ---------- page layout ---------- */

  const stack = el('div', { class: 'db-stack' }, [
    section(
      'Tracking',
      'How BrowseWise decides what counts as active time. Changes apply to time recorded from now on.',
      idleForm,
      audibleSwitch.element,
      localSwitch.element,
    ),
    section(
      'Focus timer',
      'Lengths for the focus timer on the Focus page and in the popup.',
      focusSettings.element,
    ),
    section('Appearance', 'How the dashboard looks and moves.', dockSwitch.element),
    section(
      'History',
      'What is stored on this device, and how long it is kept.',
      summaryRegion,
      el('div', { class: 'db-form-row' }, [
        el('div', { class: 'db-field' }, [
          el('label', { for: 'retention-days', text: 'Keep history for' }),
          retentionSelect,
        ]),
      ]),
      el('p', {
        class: 'db-config-desc',
        id: 'retention-help',
        text: 'Days older than this are deleted automatically, once a day. Choosing a shorter time asks you first.',
      }),
    ),
    section(
      'Notifications',
      'Reminders when you reach a daily goal or a website limit.',
      notifyText,
      el('a', { class: 'db-link', href: '#goals' }, [
        el('span', { text: 'Manage notifications on Goals & limits' }),
        icon('chevron-right', { size: 14 }),
      ]),
    ),
    section(
      'Your data',
      'Export a copy, or delete what BrowseWise has stored. Exports are saved by your browser as a normal download. Nothing is uploaded.',
      el('div', { class: 'db-form-row' }, [
        el('div', { class: 'db-field' }, [
          el('label', { for: 'export-range', text: 'Export range' }),
          exportRange,
        ]),
        exportJsonButton,
        exportCsvButton,
      ]),
      el('p', {
        class: 'db-config-desc',
        text: 'JSON holds everything, including goals and settings. CSV has one row per website per day: date, domain, category, seconds.',
      }),
      el('div', { class: 'db-danger-zone', role: 'group', 'aria-label': 'Delete data' }, [
        el('p', {
          class: 'db-config-desc',
          text: 'Clearing history keeps your settings, goals and categories. Deleting everything resets BrowseWise completely.',
        }),
        el('div', { class: 'db-form-row' }, [clearButton, deleteButton]),
      ]),
    ),
    section(
      'Privacy',
      'BrowseWise keeps everything on this device. There is no account, no server, and no analytics.',
      el('div', { class: 'db-privacy' }, [
        privacyList('Stored on this device', [
          'The domain of each website you use (for example youtube.com) and the active seconds spent there, per day and per hour.',
          'Your settings, goals and limits, and any category you changed.',
          'How many focus sessions you completed each day and how long they lasted, and which badges you earned. No names or notes.',
          'A small note of what is being tracked right now, the focus timer, and which limit notifications were already sent today.',
        ]),
        privacyList('Never stored', [
          'Full web addresses or page titles.',
          'Page content, or anything you type, including passwords.',
          'Anything from private (Incognito) windows.',
          'Website icons. Chrome keeps those, BrowseWise only displays them.',
        ]),
      ]),
      el('p', {
        class: 'db-config-desc',
        text: 'Nothing is sent anywhere. Not to the developer, not to anyone else.',
      }),
    ),
    el('p', { class: 'db-version', text: `BrowseWise ${getAppVersion()}` }),
  ]);

  setControlsDisabled(true);

  container.replaceChildren(
    pageHeader({
      title: 'Settings',
      description: 'Tracking preferences, how long history is kept, and your data.',
    }),
    announcer,
    stack,
  );

  void view.start();

  return {
    unmount: () => {
      clearTimeout(statusTimer);
      view.dispose();
    },
  };
}
