// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createFocusSettings,
  parseWholeNumber,
} from '../src/dashboard/components/focus-settings.js';
import { DEFAULT_SETTINGS } from '../src/shared/storage/schema.js';

describe('parseWholeNumber', () => {
  const limits = { min: 5, max: 120 };

  it.each([
    ['5', 5],
    ['25', 25],
    [' 120 ', 120],
  ])('accepts %j', (text, value) => {
    expect(parseWholeNumber(text, limits, 'minutes')).toEqual({ ok: true, value });
  });

  it.each(['4', '121', '0', '-5', '2.5', '', ' ', 'abc', '1e2', '25m', null, undefined])(
    'rejects %j with a message instead of changing it',
    (text) => {
      expect(parseWholeNumber(text, limits, 'minutes')).toEqual({
        ok: false,
        error: 'Enter a whole number of minutes from 5 to 120.',
      });
    },
  );

  it('says what the unit is', () => {
    expect(parseWholeNumber('x', { min: 2, max: 8 }, 'sessions').error).toBe(
      'Enter a whole number of sessions from 2 to 8.',
    );
  });
});

describe('focus timer settings', () => {
  let updateSettings;
  let announce;
  let component;
  const input = (id) => component.element.querySelector(`#${id}`);
  const form = () => component.element.querySelector('form');
  const type = (id, value) => {
    input(id).value = value;
    input(id).dispatchEvent(new Event('input', { bubbles: true }));
  };
  const submit = () => form().dispatchEvent(new Event('submit', { cancelable: true }));
  const error = () => component.element.querySelector('#focus-settings-error').textContent;

  beforeEach(() => {
    document.body.replaceChildren();
    updateSettings = vi.fn(async () => ({}));
    announce = vi.fn();
    component = createFocusSettings({ updateSettings, announce });
    document.body.append(component.element);
    component.sync({ ...DEFAULT_SETTINGS });
  });

  it('shows the stored lengths and the two switches', () => {
    expect(input('focus-minutes').value).toBe('25');
    expect(input('short-break-minutes').value).toBe('5');
    expect(input('long-break-minutes').value).toBe('15');
    expect(input('long-break-every').value).toBe('4');
    expect(input('setting-auto-start').getAttribute('aria-checked')).toBe('false');
    expect(input('setting-achievements').getAttribute('aria-checked')).toBe('true');
  });

  it('labels every field', () => {
    for (const id of [
      'focus-minutes',
      'short-break-minutes',
      'long-break-minutes',
      'long-break-every',
    ]) {
      expect(component.element.querySelector(`label[for="${id}"]`)).not.toBeNull();
    }
  });

  it('saves all four lengths together', async () => {
    type('focus-minutes', '50');
    type('short-break-minutes', '10');
    type('long-break-minutes', '30');
    type('long-break-every', '3');
    submit();

    await vi.waitFor(() =>
      expect(updateSettings).toHaveBeenCalledWith({
        focusMinutes: 50,
        shortBreakMinutes: 10,
        longBreakMinutes: 30,
        longBreakEvery: 3,
      }),
    );
    await vi.waitFor(() => expect(announce).toHaveBeenCalledWith(expect.stringContaining('saved')));
    expect(error()).toBe('');
  });

  it.each([
    ['focus-minutes', '4', 'Focus session: Enter a whole number of minutes from 5 to 120.'],
    ['focus-minutes', '121', 'Focus session: Enter a whole number of minutes from 5 to 120.'],
    ['short-break-minutes', '0', 'Short break: Enter a whole number of minutes from 1 to 30.'],
    ['long-break-minutes', '61', 'Long break: Enter a whole number of minutes from 1 to 60.'],
    ['long-break-every', '1', 'Long break interval: Enter a whole number of sessions from 2 to 8.'],
    ['focus-minutes', '', 'Focus session: Enter a whole number of minutes from 5 to 120.'],
  ])('rejects %s = %j inline and saves nothing', (id, value, message) => {
    type(id, value);
    submit();
    expect(error()).toBe(message);
    expect(input(id).getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe(input(id));
    expect(updateSettings).not.toHaveBeenCalled();
  });

  it('leaves what the user typed as it was when it rejects it', () => {
    type('focus-minutes', '3');
    submit();
    expect(input('focus-minutes').value).toBe('3');
  });

  it('marks only the field that is wrong', () => {
    type('long-break-minutes', '999');
    submit();
    expect(input('long-break-minutes').getAttribute('aria-invalid')).toBe('true');
    expect(input('focus-minutes').getAttribute('aria-invalid')).not.toBe('true');
  });

  it('clears the error after a good save', async () => {
    type('focus-minutes', '1');
    submit();
    type('focus-minutes', '30');
    submit();
    await vi.waitFor(() => expect(updateSettings).toHaveBeenCalledTimes(1));
    expect(error()).toBe('');
    expect(input('focus-minutes').getAttribute('aria-invalid')).toBe('false');
  });

  it('reports a failed save without losing the values', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    updateSettings.mockRejectedValue(new Error('quota'));
    type('focus-minutes', '40');
    submit();
    await vi.waitFor(() =>
      expect(announce).toHaveBeenCalledWith(expect.stringContaining('Could not save')),
    );
    expect(input('focus-minutes').value).toBe('40');
  });

  it('keeps what is being typed when stored values are re-synced', () => {
    type('focus-minutes', '3');
    component.sync({ ...DEFAULT_SETTINGS, focusMinutes: 60 });
    expect(input('focus-minutes').value).toBe('3');
  });

  it('picks up stored values again after a reset', () => {
    type('focus-minutes', '3');
    component.resetDirty();
    component.sync({ ...DEFAULT_SETTINGS, focusMinutes: 60 });
    expect(input('focus-minutes').value).toBe('60');
  });

  it('follows changes made elsewhere when the user is not editing', () => {
    component.sync({
      ...DEFAULT_SETTINGS,
      focusMinutes: 60,
      autoStartNext: true,
      showAchievements: false,
    });
    expect(input('focus-minutes').value).toBe('60');
    expect(input('setting-auto-start').getAttribute('aria-checked')).toBe('true');
    expect(input('setting-achievements').getAttribute('aria-checked')).toBe('false');
  });

  it.each([
    ['setting-auto-start', 'autoStartNext', 'Start the next phase automatically'],
    ['setting-achievements', 'showAchievements', 'Show streaks and badges'],
  ])('flips and saves the %s switch', async (id, key, label) => {
    const before = input(id).getAttribute('aria-checked') === 'true';
    input(id).click();
    expect(input(id).getAttribute('aria-checked')).toBe(String(!before));
    await vi.waitFor(() => expect(updateSettings).toHaveBeenCalledWith({ [key]: !before }));
    await vi.waitFor(() =>
      expect(announce).toHaveBeenCalledWith(`${label} turned ${before ? 'off' : 'on'}.`),
    );
  });

  it('puts a switch back when saving it fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    updateSettings.mockRejectedValue(new Error('quota'));
    input('setting-auto-start').click();
    await vi.waitFor(() =>
      expect(announce).toHaveBeenCalledWith(expect.stringContaining('Could not save')),
    );
    expect(input('setting-auto-start').getAttribute('aria-checked')).toBe('false');
    expect(input('setting-auto-start').disabled).toBe(false);
  });

  it('can be disabled until the stored values have loaded', () => {
    component.setDisabled(true);
    expect(input('focus-minutes').disabled).toBe(true);
    expect(input('setting-achievements').disabled).toBe(true);
    expect(component.element.querySelector('button[type="submit"]').disabled).toBe(true);
    component.setDisabled(false);
    expect(input('focus-minutes').disabled).toBe(false);
  });

  it('explains that automatic starting is off by default, and that hiding deletes nothing', () => {
    const text = component.element.textContent;
    expect(text).toContain('Off by default');
    expect(text).toContain('nothing is deleted');
  });
});
