import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createChromeMock } from './helpers/chrome-mock.js';
import { DEFAULT_SETTINGS } from '../src/shared/storage/schema.js';
import {
  getSettings,
  resetSettings,
  sanitizeSettings,
  updateSettings,
} from '../src/shared/storage/settings-repo.js';

beforeEach(() => {
  vi.stubGlobal('chrome', createChromeMock());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('settings repository', () => {
  it('returns defaults when nothing is stored', async () => {
    expect(await getSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('merges a patch, persists it, and keeps other defaults', async () => {
    const saved = await updateSettings({ idleThresholdSeconds: 120, notificationsEnabled: true });
    expect(saved.idleThresholdSeconds).toBe(120);
    expect(saved.notificationsEnabled).toBe(true);
    expect(saved.retentionDays).toBe(DEFAULT_SETTINGS.retentionDays);
    expect(await getSettings()).toEqual(saved);
  });

  it('resets to defaults', async () => {
    await updateSettings({ idleThresholdSeconds: 300 });
    expect(await resetSettings()).toEqual(DEFAULT_SETTINGS);
    expect(await getSettings()).toEqual(DEFAULT_SETTINGS);
  });
});

describe('sanitizeSettings', () => {
  it('clamps the idle threshold to its allowed range', () => {
    expect(sanitizeSettings({ idleThresholdSeconds: 5 }).idleThresholdSeconds).toBe(15);
    expect(sanitizeSettings({ idleThresholdSeconds: 999_999 }).idleThresholdSeconds).toBe(3600);
    expect(sanitizeSettings({ idleThresholdSeconds: 90.6 }).idleThresholdSeconds).toBe(91);
  });

  it('clamps retention to its allowed range', () => {
    expect(sanitizeSettings({ retentionDays: 1 }).retentionDays).toBe(7);
  });

  it('falls back to defaults for wrong types', () => {
    expect(sanitizeSettings({ idleThresholdSeconds: 'abc' }).idleThresholdSeconds).toBe(60);
    expect(sanitizeSettings({ idleThresholdSeconds: NaN }).idleThresholdSeconds).toBe(60);
    expect(sanitizeSettings({ trackLocalHosts: 'yes' }).trackLocalHosts).toBe(true);
  });

  it('drops unknown keys', () => {
    expect(sanitizeSettings({ evil: true })).not.toHaveProperty('evil');
  });

  it('treats null and non-objects as empty input', () => {
    expect(sanitizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings('nope')).toEqual(DEFAULT_SETTINGS);
  });
});

describe('focus settings', () => {
  it('defaults to a 25 minute session, 5 and 15 minute breaks every 4 sessions', () => {
    expect(sanitizeSettings(null)).toMatchObject({
      focusMinutes: 25,
      shortBreakMinutes: 5,
      longBreakMinutes: 15,
      longBreakEvery: 4,
      autoStartNext: false,
      showAchievements: true,
    });
  });

  it('keeps valid values', () => {
    expect(
      sanitizeSettings({
        focusMinutes: 50,
        shortBreakMinutes: 10,
        longBreakMinutes: 30,
        longBreakEvery: 3,
      }),
    ).toMatchObject({
      focusMinutes: 50,
      shortBreakMinutes: 10,
      longBreakMinutes: 30,
      longBreakEvery: 3,
    });
  });

  it('clamps stored values into range, so a damaged setting cannot break the timer', () => {
    expect(sanitizeSettings({ focusMinutes: 1 }).focusMinutes).toBe(5);
    expect(sanitizeSettings({ focusMinutes: 500 }).focusMinutes).toBe(120);
    expect(sanitizeSettings({ shortBreakMinutes: 0 }).shortBreakMinutes).toBe(1);
    expect(sanitizeSettings({ longBreakEvery: 1 }).longBreakEvery).toBe(2);
    expect(sanitizeSettings({ longBreakEvery: 99 }).longBreakEvery).toBe(8);
  });

  it('falls back to defaults for wrong types', () => {
    expect(
      sanitizeSettings({ focusMinutes: '25', autoStartNext: 'yes', showAchievements: 0 }),
    ).toMatchObject({
      focusMinutes: 25,
      autoStartNext: false,
      showAchievements: true,
    });
  });

  it('accepts the two switches', () => {
    expect(sanitizeSettings({ autoStartNext: true, showAchievements: false })).toMatchObject({
      autoStartNext: true,
      showAchievements: false,
    });
  });

  it('fills the new settings in for an install that was made before they existed', () => {
    const old = {
      idleThresholdSeconds: 120,
      countAudibleTabsAsActive: true,
      trackLocalHosts: false,
      notificationsEnabled: false,
      retentionDays: 90,
    };
    expect(sanitizeSettings(old)).toMatchObject({
      idleThresholdSeconds: 120,
      retentionDays: 90,
      focusMinutes: 25,
    });
  });
});
