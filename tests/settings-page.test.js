// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  RETENTION_PRESETS,
  mountSettingsPage,
  parseIdleSeconds,
  retentionLabel,
} from '../src/dashboard/pages/settings.js';
import { DEFAULT_SETTINGS } from '../src/shared/storage/schema.js';

const MIN = 60_000;
const NOW = new Date(2026, 10, 7, 12, 0, 0).getTime();
const plain = (text) => text.replace(/\u202f/g, ' ');

function data({ settings = {}, summary = {}, notifications } = {}) {
  const merged = { ...DEFAULT_SETTINGS, ...settings };
  return {
    settings: merged,
    summary: {
      dayCount: 12,
      firstKey: '2026-10-20',
      lastKey: '2026-11-07',
      bytesInUse: 14_540,
      ...summary,
    },
    notifications: notifications ?? { enabled: merged.notificationsEnabled, granted: false },
  };
}

const exportDays = [
  { date: '2026-11-06', hourlyMs: new Array(24).fill(0), domainMs: { 'github.com': 30 * MIN } },
  { date: '2026-11-07', hourlyMs: new Array(24).fill(0), domainMs: { 'youtube.com': 5 * MIN } },
];

let container;
let subscribeCallback;

function mount(initial = data(), overrides = {}) {
  const deps = {
    loadSettingsData: vi.fn(async () => initial),
    collectExportData: vi.fn(async () => ({
      days: exportDays,
      categoryOverrides: { 'youtube.com': 'education' },
      goals: { dailyGoalMs: null, siteLimits: {} },
      settings: { ...DEFAULT_SETTINGS },
    })),
    countDaysToDelete: vi.fn(async () => 0),
    updateSettings: vi.fn(async () => ({})),
    requestErase: vi.fn(async () => ({ via: 'worker' })),
    downloadTextFile: vi.fn(),
    removeNotificationsPermission: vi.fn(async () => true),
    confirm: vi.fn(async () => true),
    getAppVersion: () => '0.1.0',
    requestLiveFlush: vi.fn(async () => true),
    subscribe: vi.fn((callback) => {
      subscribeCallback = callback;
      return () => {};
    }),
    now: () => NOW,
    locale: 'en-US',
    ...overrides,
  };
  const page = mountSettingsPage(container, deps);
  return { page, deps };
}

const ready = () => vi.waitFor(() => expect(container.querySelector('.db-facts')).not.toBeNull());
const byId = (id) => container.querySelector(`#${id}`);
const status = () => container.querySelector('.db-status').textContent;
const button = (label) =>
  [...container.querySelectorAll('button')].find((b) => plain(b.textContent) === label);
const type = (input, value) => {
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
};
const submit = (form) => form.dispatchEvent(new Event('submit', { cancelable: true }));
const idleForm = () => byId('idle-seconds').closest('form');
const choose = (select, value) => {
  select.value = value;
  select.dispatchEvent(new Event('change', { bubbles: true }));
};

beforeEach(() => {
  vi.stubGlobal('chrome', { runtime: { getURL: (path) => `chrome-extension://abc/${path}` } });
  document.body.innerHTML = '<div id="root"></div>';
  container = document.getElementById('root');
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('parseIdleSeconds', () => {
  it.each([
    ['15', 15],
    ['60', 60],
    [' 300 ', 300],
    ['3600', 3600],
  ])('accepts %j', (text, seconds) => {
    expect(parseIdleSeconds(text)).toEqual({ ok: true, seconds });
  });

  it.each(['14', '3601', '0', '-60', '1.5', '', '  ', 'abc', '1e2', '60s', null, undefined])(
    'rejects %j with a message instead of changing it',
    (text) => {
      const result = parseIdleSeconds(text);
      expect(result.ok).toBe(false);
      expect(result.error).toBe('Enter a whole number of seconds from 15 to 3600.');
    },
  );
});

describe('retentionLabel', () => {
  it('uses plain words for presets and flags a custom value', () => {
    expect(RETENTION_PRESETS).toEqual([30, 90, 180, 365, 730, 1825, 3650]);
    expect(retentionLabel(30)).toBe('30 days');
    expect(retentionLabel(365)).toBe('1 year (default)');
    expect(retentionLabel(3650)).toBe('10 years');
    expect(retentionLabel(500)).toBe('500 days (custom)');
  });
});

describe('settings page: layout and loading', () => {
  it('has a heading, every section, a privacy summary and the version', async () => {
    mount();
    await ready();
    expect(container.querySelector('h1').textContent).toBe('Settings');
    const sections = [...container.querySelectorAll('section.db-config')].map((s) =>
      s.getAttribute('aria-label'),
    );
    expect(sections).toEqual([
      'Tracking',
      'Focus timer',
      'History',
      'Notifications',
      'Your data',
      'Privacy',
    ]);
    expect(container.querySelector('.db-version').textContent).toBe('BrowseWise 0.1.0');

    const privacy = container.querySelector('section[aria-label="Privacy"]').textContent;
    expect(privacy).toContain('Stored on this device');
    expect(privacy).toContain('Never stored');
    expect(privacy).toContain('How many focus sessions you completed each day');
    expect(privacy).toContain('No names or notes');
    expect(privacy).toContain('Full web addresses or page titles');
    expect(privacy).toContain('anything you type, including passwords');
    expect(privacy).toContain('private (Incognito) windows');
    expect(privacy).toContain('Nothing is sent anywhere');
  });

  it('keeps every control disabled until the stored values have loaded', async () => {
    const never = new Promise(() => {});
    mount(data(), { loadSettingsData: vi.fn(() => never) });
    expect(byId('idle-seconds').disabled).toBe(true);
    expect(byId('retention-days').disabled).toBe(true);
    expect(button('Export JSON').disabled).toBe(true);
    expect(button('Delete everything\u2026').disabled).toBe(true);
  });

  it('fills the controls from the stored settings', async () => {
    mount(
      data({
        settings: {
          idleThresholdSeconds: 300,
          countAudibleTabsAsActive: true,
          trackLocalHosts: false,
          retentionDays: 90,
        },
      }),
    );
    await ready();
    expect(byId('idle-seconds').value).toBe('300');
    expect(byId('setting-audible').getAttribute('aria-checked')).toBe('true');
    expect(byId('setting-local').getAttribute('aria-checked')).toBe('false');
    expect(byId('retention-days').value).toBe('90');
    expect(byId('idle-seconds').disabled).toBe(false);
  });

  it('summarises the stored history', async () => {
    mount();
    await ready();
    const facts = [...container.querySelectorAll('.db-fact')].map((f) => plain(f.textContent));
    expect(facts).toEqual([
      'Days recorded12',
      'PeriodTue, Oct 20 – Sat, Nov 7',
      'Storage used14 KB of about 10 MB',
    ]);
  });

  it('warns when storage is nearly full, and not otherwise', async () => {
    mount(data({ summary: { bytesInUse: 9 * 1024 * 1024 } }));
    await ready();
    const warning = container.querySelector('.db-storage-warning');
    expect(warning.textContent).toContain('Storage is nearly full');
    expect(warning.textContent).toContain('shorter history');
    expect(warning.getAttribute('role')).toBe('status');
  });

  it('shows no storage warning for ordinary use', async () => {
    mount();
    await ready();
    expect(container.querySelector('.db-storage-warning')).toBeNull();
  });

  it('copes with an empty history and an unknown storage size', async () => {
    mount(data({ summary: { dayCount: 0, firstKey: null, lastKey: null, bytesInUse: null } }));
    await ready();
    const facts = [...container.querySelectorAll('.db-fact')].map((f) => plain(f.textContent));
    expect(facts).toEqual(['Days recorded0', 'Period\u2014', 'Storage usedUnavailable']);
    expect(button('Clear history\u2026').disabled).toBe(true);
    expect(button('Delete everything\u2026').disabled).toBe(false);
  });

  it('shows an error state and leaves the controls disabled when loading fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mount(data(), {
      loadSettingsData: vi.fn(async () => {
        throw new Error('storage down');
      }),
    });
    await vi.waitFor(() =>
      expect(container.querySelector('.db-state[role="alert"]')).not.toBeNull(),
    );
    expect(byId('idle-seconds').disabled).toBe(true);
  });

  it('describes the notification state and links to the Goals page', async () => {
    mount(
      data({
        settings: { notificationsEnabled: true },
        notifications: { enabled: true, granted: true },
      }),
    );
    await ready();
    const section = container.querySelector('section[aria-label="Notifications"]');
    expect(section.textContent).toContain('On. You get one notification');
    expect(section.querySelector('a').getAttribute('href')).toBe('#goals');
    expect(section.querySelector('button')).toBeNull(); // the toggle stays on the Goals page
  });

  it.each([
    [{ enabled: false, granted: false }, 'Off.'],
    [{ enabled: true, granted: false }, 'permission was removed'],
  ])('describes notifications %j', async (notifications, expected) => {
    mount(data({ notifications }));
    await ready();
    expect(container.querySelector('.db-notify-status').textContent).toContain(expected);
  });
});

describe('settings page: tracking', () => {
  it('saves a valid idle threshold', async () => {
    const { deps } = mount();
    await ready();
    type(byId('idle-seconds'), '120');
    submit(idleForm());

    await vi.waitFor(() =>
      expect(deps.updateSettings).toHaveBeenCalledWith({ idleThresholdSeconds: 120 }),
    );
    await vi.waitFor(() => expect(status()).toBe('Idle threshold saved: 120 seconds.'));
    expect(byId('idle-error').textContent).toBe('');
  });

  it.each(['10', '3601', '1.5', '', 'x'])('rejects %j inline and saves nothing', async (value) => {
    const { deps } = mount();
    await ready();
    type(byId('idle-seconds'), value);
    submit(idleForm());

    expect(byId('idle-error').textContent).toBe('Enter a whole number of seconds from 15 to 3600.');
    expect(byId('idle-seconds').getAttribute('aria-invalid')).toBe('true');
    expect(deps.updateSettings).not.toHaveBeenCalled();
  });

  it('does not change what the user typed when it is rejected', async () => {
    mount();
    await ready();
    type(byId('idle-seconds'), '10');
    submit(idleForm());
    expect(byId('idle-seconds').value).toBe('10'); // not clamped to 15
  });

  it('clears the error once a valid value is saved', async () => {
    const { deps } = mount();
    await ready();
    type(byId('idle-seconds'), '5');
    submit(idleForm());
    type(byId('idle-seconds'), '45');
    submit(idleForm());

    await vi.waitFor(() => expect(deps.updateSettings).toHaveBeenCalledTimes(1));
    expect(byId('idle-error').textContent).toBe('');
    expect(byId('idle-seconds').getAttribute('aria-invalid')).toBe('false');
  });

  it('reports a failed save', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mount(data(), {
      updateSettings: vi.fn(async () => {
        throw new Error('quota');
      }),
    });
    await ready();
    type(byId('idle-seconds'), '90');
    submit(idleForm());
    await vi.waitFor(() => expect(status()).toContain('Could not save the idle threshold'));
  });

  it.each([
    ['setting-audible', 'countAudibleTabsAsActive', 'Count tabs playing sound as active'],
    ['setting-local', 'trackLocalHosts', 'Track local websites'],
  ])('flips and saves the %s switch', async (id, key, label) => {
    const { deps } = mount();
    await ready();
    const before = byId(id).getAttribute('aria-checked') === 'true';
    byId(id).click();

    expect(byId(id).getAttribute('aria-checked')).toBe(String(!before));
    await vi.waitFor(() => expect(deps.updateSettings).toHaveBeenCalledWith({ [key]: !before }));
    await vi.waitFor(() => expect(status()).toBe(`${label} turned ${before ? 'off' : 'on'}.`));
    expect(byId(id).disabled).toBe(false);
  });

  it('puts a switch back when saving fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mount(data(), {
      updateSettings: vi.fn(async () => {
        throw new Error('quota');
      }),
    });
    await ready();
    expect(byId('setting-audible').getAttribute('aria-checked')).toBe('false');
    byId('setting-audible').click();
    await vi.waitFor(() => expect(status()).toContain('Could not save the setting'));
    expect(byId('setting-audible').getAttribute('aria-checked')).toBe('false');
  });
});

describe('settings page: history length', () => {
  it('offers every preset, selecting the stored one', async () => {
    mount();
    await ready();
    const options = [...byId('retention-days').options];
    expect(options.map((o) => o.value)).toEqual(RETENTION_PRESETS.map(String));
    expect(options.find((o) => o.value === '365').textContent).toBe('1 year (default)');
    expect(byId('retention-days').value).toBe('365');
  });

  it('adds a custom entry when the stored value is not a preset', async () => {
    mount(data({ settings: { retentionDays: 500 } }));
    await ready();
    const options = [...byId('retention-days').options];
    expect(options.map((o) => o.value)).toEqual([
      '30',
      '90',
      '180',
      '365',
      '500',
      '730',
      '1825',
      '3650',
    ]);
    expect(options.find((o) => o.value === '500').textContent).toBe('500 days (custom)');
    expect(byId('retention-days').value).toBe('500');
  });

  it('saves a longer retention without asking', async () => {
    const { deps } = mount(data({ settings: { retentionDays: 90 } }));
    await ready();
    choose(byId('retention-days'), '365');

    await vi.waitFor(() =>
      expect(deps.updateSettings).toHaveBeenCalledWith({ retentionDays: 365 }),
    );
    expect(deps.confirm).not.toHaveBeenCalled();
    expect(deps.countDaysToDelete).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(status()).toBe('History is now kept for 1 year.'));
  });

  it('states exactly how many days will be deleted before saving a shorter retention', async () => {
    const { deps } = mount(data(), { countDaysToDelete: vi.fn(async () => 42) });
    await ready();
    choose(byId('retention-days'), '90');

    await vi.waitFor(() => expect(deps.confirm).toHaveBeenCalledTimes(1));
    expect(deps.countDaysToDelete).toHaveBeenCalledWith(90, NOW);
    const options = deps.confirm.mock.calls[0][0];
    expect(options.title).toBe('Keep only 90 days?');
    expect(options.message).toContain('permanently deletes 42 days');
    expect(options.confirmLabel).toBe('Delete 42 days');
    expect(options.danger).toBe(true);

    await vi.waitFor(() => expect(deps.updateSettings).toHaveBeenCalledWith({ retentionDays: 90 }));
  });

  it('uses the singular for one day', async () => {
    const { deps } = mount(data(), { countDaysToDelete: vi.fn(async () => 1) });
    await ready();
    choose(byId('retention-days'), '30');
    await vi.waitFor(() => expect(deps.confirm).toHaveBeenCalled());
    expect(deps.confirm.mock.calls[0][0].message).toContain('permanently deletes 1 day of history');
    expect(deps.confirm.mock.calls[0][0].message).toContain('that is older');
    expect(deps.confirm.mock.calls[0][0].confirmLabel).toBe('Delete 1 day');
  });

  it('puts the choice back and saves nothing when the user cancels', async () => {
    const { deps } = mount(data(), {
      countDaysToDelete: vi.fn(async () => 42),
      confirm: vi.fn(async () => false),
    });
    await ready();
    choose(byId('retention-days'), '30');

    await vi.waitFor(() => expect(deps.confirm).toHaveBeenCalled());
    await vi.waitFor(() => expect(byId('retention-days').value).toBe('365'));
    expect(deps.updateSettings).not.toHaveBeenCalled();
  });

  it('saves a shorter retention straight away when no day would be deleted', async () => {
    const { deps } = mount(data(), { countDaysToDelete: vi.fn(async () => 0) });
    await ready();
    choose(byId('retention-days'), '180');

    await vi.waitFor(() =>
      expect(deps.updateSettings).toHaveBeenCalledWith({ retentionDays: 180 }),
    );
    expect(deps.confirm).not.toHaveBeenCalled();
  });

  it('changes nothing when the days to delete cannot be counted', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { deps } = mount(data(), {
      countDaysToDelete: vi.fn(async () => {
        throw new Error('storage down');
      }),
    });
    await ready();
    choose(byId('retention-days'), '30');

    await vi.waitFor(() => expect(status()).toContain('Nothing was changed'));
    expect(byId('retention-days').value).toBe('365');
    expect(deps.updateSettings).not.toHaveBeenCalled();
    expect(deps.confirm).not.toHaveBeenCalled();
  });

  it('puts the choice back when saving fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mount(data(), {
      updateSettings: vi.fn(async () => {
        throw new Error('quota');
      }),
    });
    await ready();
    choose(byId('retention-days'), '730');
    await vi.waitFor(() => expect(status()).toContain('Could not save the setting'));
    expect(byId('retention-days').value).toBe('365');
  });

  it('asks before shortening from a custom value too', async () => {
    const { deps } = mount(data({ settings: { retentionDays: 500 } }), {
      countDaysToDelete: vi.fn(async () => 7),
    });
    await ready();
    choose(byId('retention-days'), '365');
    await vi.waitFor(() => expect(deps.confirm).toHaveBeenCalled());
    expect(deps.countDaysToDelete).toHaveBeenCalledWith(365, NOW);
  });
});

describe('settings page: export', () => {
  const lastDownload = (deps) => deps.downloadTextFile.mock.calls.at(-1);

  it('offers the four ranges', async () => {
    mount();
    await ready();
    expect([...byId('export-range').options].map((o) => o.textContent)).toEqual([
      'All time',
      'Last 30 days',
      'Last 90 days',
      'Last year',
    ]);
  });

  it('flushes first, then downloads a JSON file with everything in it', async () => {
    const { deps } = mount();
    await ready();
    deps.requestLiveFlush.mockClear();
    button('Export JSON').click();

    await vi.waitFor(() => expect(deps.downloadTextFile).toHaveBeenCalledTimes(1));
    expect(deps.requestLiveFlush).toHaveBeenCalledTimes(1);
    expect(deps.collectExportData).toHaveBeenCalledWith('all', NOW);

    const [filename, text, mime, options] = lastDownload(deps);
    expect(filename).toBe('browsewise-usage-2026-11-07.json');
    expect(mime).toBe('application/json');
    expect(options).toBeUndefined();
    const parsed = JSON.parse(text);
    expect(parsed).toMatchObject({
      app: 'BrowseWise',
      appVersion: '0.1.0',
      timeUnit: 'milliseconds',
    });
    expect(parsed.usage.map((u) => u.date)).toEqual(['2026-11-06', '2026-11-07']);
    expect(parsed.categoryOverrides).toEqual({ 'youtube.com': 'education' });
    await vi.waitFor(() => expect(status()).toBe('Exported 2 days as JSON.'));
  });

  it('downloads a CSV with a byte order mark and the right categories', async () => {
    const { deps } = mount();
    await ready();
    button('Export CSV').click();

    await vi.waitFor(() => expect(deps.downloadTextFile).toHaveBeenCalledTimes(1));
    const [filename, text, mime, options] = lastDownload(deps);
    expect(filename).toBe('browsewise-usage-2026-11-07.csv');
    expect(mime).toBe('text/csv');
    expect(options).toEqual({ bom: true });
    expect(text.split('\r\n')).toEqual([
      'date,domain,category,seconds',
      '2026-11-06,github.com,Development & Programming,1800',
      '2026-11-07,youtube.com,Education,300',
      '',
    ]);
    await vi.waitFor(() => expect(status()).toBe('Exported 2 days as CSV.'));
  });

  it('exports the chosen range', async () => {
    const { deps } = mount();
    await ready();
    choose(byId('export-range'), '90d');
    button('Export JSON').click();
    await vi.waitFor(() => expect(deps.collectExportData).toHaveBeenCalledWith('90d', NOW));
  });

  it('says there is nothing to export instead of saving an empty file', async () => {
    const { deps } = mount(data(), {
      collectExportData: vi.fn(async () => ({
        days: [{ date: '2026-11-07', hourlyMs: new Array(24).fill(0), domainMs: {} }],
        categoryOverrides: {},
        goals: { dailyGoalMs: null, siteLimits: {} },
        settings: { ...DEFAULT_SETTINGS },
      })),
    });
    await ready();
    button('Export CSV').click();
    await vi.waitFor(() =>
      expect(status()).toBe('There is no browsing data to export for this range.'),
    );
    expect(deps.downloadTextFile).not.toHaveBeenCalled();
    expect(button('Export CSV').disabled).toBe(false);
  });

  it('reports a failure and lets the user try again', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { deps } = mount(data(), {
      downloadTextFile: vi.fn(() => {
        throw new Error('blocked');
      }),
    });
    await ready();
    button('Export JSON').click();
    await vi.waitFor(() => expect(status()).toBe('Could not export your data. Please try again.'));
    expect(button('Export JSON').disabled).toBe(false);
    expect(deps.downloadTextFile).toHaveBeenCalledTimes(1);
  });

  it('ignores a second click while an export is running', async () => {
    let release;
    const { deps } = mount(data(), {
      requestLiveFlush: vi.fn(() => new Promise((resolve) => (release = resolve))),
    });
    await ready();
    deps.requestLiveFlush.mockClear();

    button('Export JSON').click();
    expect(button('Export JSON').disabled).toBe(true);
    button('Export JSON').click();
    release(true);

    await vi.waitFor(() => expect(deps.downloadTextFile).toHaveBeenCalledTimes(1));
    expect(deps.collectExportData).toHaveBeenCalledTimes(1);
  });
});

describe('settings page: deleting data', () => {
  it('asks before clearing history and says what is kept', async () => {
    const { deps } = mount();
    await ready();
    button('Clear history\u2026').click();

    await vi.waitFor(() => expect(deps.confirm).toHaveBeenCalledTimes(1));
    const options = deps.confirm.mock.calls[0][0];
    expect(options.title).toBe('Clear all history?');
    expect(options.message).toContain('12 days');
    expect(options.message).toContain('and your focus sessions, streaks and badges');
    expect(options.message).toContain('settings, goals, limits and category choices are kept');
    expect(options.danger).toBe(true);
    await vi.waitFor(() => expect(deps.requestErase).toHaveBeenCalledWith('history'));
    await vi.waitFor(() => expect(status()).toBe('History cleared.'));
  });

  it('does nothing when clearing history is cancelled', async () => {
    const { deps } = mount(data(), { confirm: vi.fn(async () => false) });
    await ready();
    button('Clear history\u2026').click();
    await vi.waitFor(() => expect(deps.confirm).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(deps.requestErase).not.toHaveBeenCalled();
    expect(status()).toBe('');
  });

  it('reports a failed clear and re-enables the buttons', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mount(data(), {
      requestErase: vi.fn(async () => {
        throw new Error('worker failed');
      }),
    });
    await ready();
    button('Clear history\u2026').click();
    await vi.waitFor(() => expect(status()).toBe('Could not clear the history. Please try again.'));
    expect(button('Clear history\u2026').disabled).toBe(false);
  });

  it('asks before deleting everything, then erases and releases the notifications permission', async () => {
    const { deps } = mount();
    await ready();
    button('Delete everything\u2026').click();

    await vi.waitFor(() => expect(deps.confirm).toHaveBeenCalledTimes(1));
    const options = deps.confirm.mock.calls[0][0];
    expect(options.title).toBe('Delete all BrowseWise data?');
    expect(options.message).toContain('focus sessions and badges');
    expect(options.message).toContain('goals and limits, category choices and settings');
    expect(options.confirmLabel).toBe('Delete everything');

    await vi.waitFor(() => expect(deps.requestErase).toHaveBeenCalledWith('everything'));
    await vi.waitFor(() => expect(deps.removeNotificationsPermission).toHaveBeenCalledTimes(1));
    await vi.waitFor(() =>
      expect(status()).toBe('Everything was deleted. Settings are back to their defaults.'),
    );
  });

  it('does nothing when deleting everything is cancelled', async () => {
    const { deps } = mount(data(), { confirm: vi.fn(async () => false) });
    await ready();
    button('Delete everything\u2026').click();
    await vi.waitFor(() => expect(deps.confirm).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(deps.requestErase).not.toHaveBeenCalled();
    expect(deps.removeNotificationsPermission).not.toHaveBeenCalled();
  });

  it('reports a failed delete and does not touch the notifications permission', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { deps } = mount(data(), {
      requestErase: vi.fn(async () => {
        throw new Error('worker failed');
      }),
    });
    await ready();
    button('Delete everything\u2026').click();
    await vi.waitFor(() => expect(status()).toBe('Could not delete everything. Please try again.'));
    expect(deps.removeNotificationsPermission).not.toHaveBeenCalled();
  });

  it('shows the defaults again after everything was deleted', async () => {
    const loadSettingsData = vi
      .fn()
      // The page loads twice on start: stored data first, then again after the live flush.
      .mockResolvedValueOnce(data({ settings: { idleThresholdSeconds: 300 } }))
      .mockResolvedValueOnce(data({ settings: { idleThresholdSeconds: 300 } }))
      .mockResolvedValue(data({ summary: { dayCount: 0, firstKey: null, lastKey: null } }));
    mount(data(), { loadSettingsData });
    await vi.waitFor(() => expect(byId('idle-seconds')?.value).toBe('300'));

    type(byId('idle-seconds'), '999'); // an unsaved edit
    button('Delete everything\u2026').click();
    await vi.waitFor(() => expect(byId('idle-seconds').value).toBe('60'));
    await vi.waitFor(() => expect(button('Clear history\u2026').disabled).toBe(true));
  });
});

describe('settings page: refreshing never wipes controls', () => {
  it('keeps the same controls and the text being typed through a refresh', async () => {
    const { deps } = mount();
    await ready();
    const idle = byId('idle-seconds');
    const retention = byId('retention-days');
    const audible = byId('setting-audible');

    type(idle, '1');
    const before = deps.loadSettingsData.mock.calls.length;
    subscribeCallback();
    await vi.waitFor(() => expect(deps.loadSettingsData.mock.calls.length).toBeGreaterThan(before));
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(byId('idle-seconds')).toBe(idle);
    expect(idle.value).toBe('1');
    expect(byId('retention-days')).toBe(retention);
    expect(byId('setting-audible')).toBe(audible);
  });

  it('picks up a change made elsewhere when the user is not editing', async () => {
    const loadSettingsData = vi
      .fn()
      .mockResolvedValueOnce(data())
      .mockResolvedValueOnce(data())
      .mockResolvedValue(data({ settings: { idleThresholdSeconds: 600, trackLocalHosts: false } }));
    mount(data(), { loadSettingsData });
    await vi.waitFor(() => expect(byId('idle-seconds')?.value).toBe('60'));

    subscribeCallback();
    await vi.waitFor(() => expect(byId('idle-seconds').value).toBe('600'));
    expect(byId('setting-local').getAttribute('aria-checked')).toBe('false');
  });

  it('unsubscribes when unmounted', async () => {
    const unsubscribe = vi.fn();
    const { page } = mount(data(), { subscribe: vi.fn(() => unsubscribe) });
    await ready();
    page.unmount();
    expect(unsubscribe).toHaveBeenCalled();
  });
});
