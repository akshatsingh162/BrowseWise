import { SETTINGS_LIMITS } from '../../shared/storage/schema.js';
import { el } from '../../ui/dom.js';
import { switchRow } from './switch-row.js';

/**
 * Validates a whole number typed by the user. A bad value is rejected with a message, never
 * quietly changed into a different one.
 *
 * @param {string} text
 * @param {{min: number, max: number}} limits
 * @param {string} unit for the message, for example "minutes"
 * @returns {{ok: true, value: number} | {ok: false, error: string}}
 */
export function parseWholeNumber(text, { min, max }, unit) {
  const error = `Enter a whole number of ${unit} from ${min} to ${max}.`;
  const trimmed = String(text ?? '').trim();
  if (!/^\d+$/.test(trimmed)) return { ok: false, error };
  const value = Number(trimmed);
  return value >= min && value <= max ? { ok: true, value } : { ok: false, error };
}

const FIELDS = [
  {
    key: 'focusMinutes',
    id: 'focus-minutes',
    label: 'Focus session (minutes)',
    unit: 'minutes',
    name: 'Focus session',
  },
  {
    key: 'shortBreakMinutes',
    id: 'short-break-minutes',
    label: 'Short break (minutes)',
    unit: 'minutes',
    name: 'Short break',
  },
  {
    key: 'longBreakMinutes',
    id: 'long-break-minutes',
    label: 'Long break (minutes)',
    unit: 'minutes',
    name: 'Long break',
  },
  {
    key: 'longBreakEvery',
    id: 'long-break-every',
    label: 'Long break after (sessions)',
    unit: 'sessions',
    name: 'Long break interval',
  },
];

/**
 * The "Focus timer" part of Settings: four lengths, and two switches. Built once and kept in
 * line with the stored values by sync(), so a background refresh never wipes what the user is
 * typing.
 *
 * @param {object} options
 * @param {(patch: object) => Promise<object>} options.updateSettings
 * @param {(text: string) => void} options.announce shows a short status message
 * @returns {{element: HTMLElement, sync: (settings: object) => void, resetDirty: () => void,
 *          setDisabled: (disabled: boolean) => void}}
 */
export function createFocusSettings({ updateSettings, announce }) {
  let dirty = false;

  const inputs = Object.fromEntries(
    FIELDS.map((field) => {
      const { min, max } = SETTINGS_LIMITS[field.key];
      const input = el('input', {
        id: field.id,
        type: 'number',
        class: 'bw-input bw-input-plain',
        min,
        max,
        step: 1,
        inputmode: 'numeric',
        autocomplete: 'off',
        'aria-describedby': 'focus-settings-error',
      });
      input.addEventListener('input', () => (dirty = true));
      return [field.key, input];
    }),
  );

  const error = el('p', { class: 'db-field-error', id: 'focus-settings-error', role: 'alert' });
  const save = el('button', { type: 'submit', class: 'bw-btn bw-btn-primary', text: 'Save' });

  const form = el(
    'form',
    {
      class: 'db-form fo-settings-form',
      novalidate: true,
      onSubmit: async (event) => {
        event.preventDefault();
        const patch = {};
        for (const field of FIELDS) {
          const parsed = parseWholeNumber(
            inputs[field.key].value,
            SETTINGS_LIMITS[field.key],
            field.unit,
          );
          if (!parsed.ok) {
            error.textContent = `${field.name}: ${parsed.error}`;
            for (const input of Object.values(inputs)) input.setAttribute('aria-invalid', 'false');
            inputs[field.key].setAttribute('aria-invalid', 'true');
            inputs[field.key].focus();
            return;
          }
          patch[field.key] = parsed.value;
        }

        error.textContent = '';
        for (const input of Object.values(inputs)) input.setAttribute('aria-invalid', 'false');
        try {
          await updateSettings(patch);
          dirty = false;
          announce('Focus timer settings saved. They apply from the next phase.');
        } catch (failure) {
          console.error('[BrowseWise] could not save the focus timer settings', failure);
          announce('Could not save the focus timer settings. Please try again.');
        }
      },
    },
    [
      el(
        'div',
        { class: 'fo-settings-grid' },
        FIELDS.map((field) =>
          el('div', { class: 'db-field' }, [
            el('label', { for: field.id, text: field.label }),
            inputs[field.key],
          ]),
        ),
      ),
      el('div', { class: 'db-form-row' }, [save]),
      error,
    ],
  );

  const autoStart = switchRow({
    id: 'setting-auto-start',
    label: 'Start the next phase automatically',
    description:
      'When a session or break ends, the next one begins by itself. Off by default, so a break is never missed by accident.',
  });
  const achievements = switchRow({
    id: 'setting-achievements',
    label: 'Show streaks and badges',
    description:
      'Streaks and badges on the Focus page, and badge notifications. Turn this off to hide them completely; nothing is deleted.',
  });

  const wire = ({ button }, key, label) =>
    button.addEventListener('click', async () => {
      const next = button.getAttribute('aria-checked') !== 'true';
      button.setAttribute('aria-checked', String(next));
      button.disabled = true;
      try {
        await updateSettings({ [key]: next });
        announce(`${label} turned ${next ? 'on' : 'off'}.`);
      } catch (failure) {
        console.error(`[BrowseWise] could not save ${key}`, failure);
        button.setAttribute('aria-checked', String(!next));
        announce(`Could not save the setting for \u201c${label}\u201d. Please try again.`);
      } finally {
        button.disabled = false;
      }
    });
  wire(autoStart, 'autoStartNext', 'Start the next phase automatically');
  wire(achievements, 'showAchievements', 'Show streaks and badges');

  const element = el('div', { class: 'fo-settings' }, [
    form,
    autoStart.element,
    achievements.element,
  ]);

  return {
    element,
    sync(settings) {
      if (!dirty && !form.contains(document.activeElement)) {
        for (const field of FIELDS) inputs[field.key].value = String(settings[field.key]);
      }
      autoStart.button.setAttribute('aria-checked', String(settings.autoStartNext));
      achievements.button.setAttribute('aria-checked', String(settings.showAchievements));
    },
    /** Forget unsaved typing, so the next sync shows the stored values (after a reset). */
    resetDirty() {
      dirty = false;
    },
    setDisabled(disabled) {
      for (const control of [
        ...Object.values(inputs),
        save,
        autoStart.button,
        achievements.button,
      ]) {
        control.disabled = disabled;
      }
    },
  };
}
