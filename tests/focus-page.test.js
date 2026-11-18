// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountFocusPage } from '../src/dashboard/pages/focus.js';
import { BADGES, badgeProgress } from '../src/shared/achievements.js';
import { MINUTE_MS, createPhase, pausePhase, startPhase } from '../src/shared/focus.js';

const T0 = 1_700_000_000_000;
const plain = (text) => text.replace(/\u202f/g, ' ');

const running = (patch = {}, endsInMs = 25 * MINUTE_MS) => ({
  ...startPhase(
    createPhase({ phase: 'focus', durationMs: 25 * MINUTE_MS, sessionId: 'sess1' }),
    T0,
  ),
  endsAt: T0 + endsInMs,
  ...patch,
});
const breakReady = (phase = 'shortBreak', minutes = 5, cycle = 1) =>
  createPhase({ phase, durationMs: minutes * MINUTE_MS, cycle, sessionId: 'brk1' });

function data({
  state = null,
  earned = {},
  today = { sessions: 0, focusMs: 0 },
  showAchievements = true,
  streaks,
} = {}) {
  const stats = {
    totalSessions: 4,
    totalFocusHours: 1.5,
    bestDaySessions: 2,
    longestSessionMinutes: 25,
    bestFocusStreak: 2,
    bestGoalStreak: 0,
  };
  return {
    state,
    settings: {
      focusMinutes: 25,
      shortBreakMinutes: 5,
      longBreakMinutes: 15,
      longBreakEvery: 4,
      showAchievements,
    },
    todayKey: '2026-11-15',
    today,
    allTime: { sessions: 4, focusMs: 100 * 60_000 },
    streaks: streaks ?? { focus: { current: 2, best: 3 }, goal: { current: 0, best: 0 } },
    week: ['09', '10', '11', '12', '13', '14', '15'].map((d, i) => ({
      dateKey: `2026-11-${d}`,
      sessions: i % 3,
    })),
    badges: BADGES.map((badge) => ({
      badge,
      earnedOn: Object.hasOwn(earned, badge.id) ? earned[badge.id] : null,
      progress: badgeProgress(badge, stats),
    })),
  };
}

let container;
let clock;
let subscribeCallback;
const unsubscribe = vi.fn();
let loaded;
// Pages mounted by a test are always unmounted afterwards, as navigating away does in the app.
const mountedPages = [];

function mount({ initial = data(), sendFocusCommand, overrides = {} } = {}) {
  loaded = initial;
  const deps = {
    loadFocusData: vi.fn(async () => loaded),
    sendFocusCommand: sendFocusCommand ?? vi.fn(async () => loaded.state),
    updateSettings: vi.fn(async () => ({})),
    requestLiveFlush: vi.fn(async () => true),
    subscribe: vi.fn((callback) => {
      subscribeCallback = callback;
      return unsubscribe;
    }),
    celebrate: vi.fn(() => true),
    now: () => clock,
    locale: 'en-US',
    ...overrides,
  };
  const page = mountFocusPage(container, deps);
  mountedPages.push(page);
  return { page, deps };
}

const ready = () => vi.waitFor(() => expect(container.querySelector('.fo-data')).not.toBeNull());
const time = () => container.querySelector('.fo-ring-time').textContent;
const phase = () => container.querySelector('.fo-ring-phase').textContent;
const buttons = () => [...container.querySelectorAll('.fo-controls button')];
const labels = () => buttons().map((b) => b.textContent.trim());
const click = (label) =>
  buttons()
    .find((b) => b.textContent.trim() === label)
    .click();
const status = () => container.querySelector('.db-status').textContent;

beforeEach(() => {
  clock = T0;
  unsubscribe.mockClear();
  document.title = 'BrowseWise';
  document.body.innerHTML = '<div id="root"></div>';
  container = document.getElementById('root');
  vi.spyOn(console, 'debug').mockImplementation(() => {});
});
afterEach(() => {
  for (const page of mountedPages.splice(0)) page.unmount();
  vi.restoreAllMocks();
});

describe('focus page: the timer', () => {
  it('has a heading and a labelled timer region', async () => {
    mount();
    await ready();
    expect(container.querySelector('h1').textContent).toBe('Focus');
    expect(container.querySelector('section[aria-label="Focus timer"]')).not.toBeNull();
  });

  it('shows the next session ready to start when there is no timer', async () => {
    const { page } = mount();
    await ready();
    expect(time()).toBe('25:00');
    expect(phase()).toBe('Ready');
    expect(labels()).toEqual(['Start focus']);
    page.unmount();
  });

  it('shows one dot for each session before the long break, none filled at first', async () => {
    mount();
    await ready();
    expect(container.querySelectorAll('.fo-dot')).toHaveLength(4);
    expect(container.querySelectorAll('.fo-dot.is-filled')).toHaveLength(0);
    expect(container.querySelector('.fo-dots').getAttribute('aria-label')).toContain('0 of 4');
  });

  it('fills a dot for each completed session in the set', async () => {
    mount({ initial: data({ state: running({ cycle: 2 }) }) });
    await ready();
    expect(container.querySelectorAll('.fo-dot.is-filled')).toHaveLength(2);
    expect(container.querySelector('.fo-dots').getAttribute('aria-label')).toContain('2 of 4');
  });

  it('starts a session when Start focus is pressed, and shows the running timer', async () => {
    // The page also asks for a catch-up sync when it opens, which finds no timer.
    const sendFocusCommand = vi.fn(async (action) => (action === 'sync' ? null : running()));
    const { page } = mount({ sendFocusCommand });
    await ready();
    click('Start focus');

    await vi.waitFor(() => expect(labels()).toEqual(['Pause', 'Stop']));
    expect(sendFocusCommand).toHaveBeenCalledWith('start');
    expect(phase()).toBe('Focus');
    expect(container.querySelector('.fo-ring').dataset.tone).toBe('focus');
    page.unmount();
  });

  it('counts down from the clock, not from how often it has redrawn', async () => {
    const { page } = mount({ initial: data({ state: running() }) });
    await ready();
    expect(time()).toBe('25:00');
    clock = T0 + 10 * MINUTE_MS + 30_000;
    await vi.waitFor(() => expect(time()).toBe('14:30'));
    clock = T0 + 20 * MINUTE_MS;
    await vi.waitFor(() => expect(time()).toBe('5:00'));
    page.unmount();
  });

  it('shows the countdown in the browser tab while running, and restores the title otherwise', async () => {
    const { page } = mount({ initial: data({ state: running() }) });
    await ready();
    expect(document.title).toBe('25:00 \u00b7 Focus \u2013 BrowseWise');

    page.unmount();
    expect(document.title).toBe('BrowseWise');
  });

  it('leaves the title alone while paused or idle', async () => {
    const { page } = mount({ initial: data({ state: pausePhase(running(), T0 + MINUTE_MS) }) });
    await ready();
    expect(document.title).toBe('BrowseWise');
    expect(phase()).toBe('Focus paused');
    expect(labels()).toEqual(['Resume', 'Stop']);
    page.unmount();
  });

  it('keeps a paused timer frozen however long it is left', async () => {
    const { page } = mount({
      initial: data({ state: pausePhase(running(), T0 + 10 * MINUTE_MS) }),
    });
    await ready();
    clock = T0 + 5 * 3_600_000;
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(time()).toBe('15:00');
    page.unmount();
  });

  it('offers a break that is ready, with Skip break and Stop', async () => {
    mount({ initial: data({ state: breakReady() }) });
    await ready();
    expect(phase()).toBe('Short break ready');
    expect(time()).toBe('5:00');
    expect(labels()).toEqual(['Start break', 'Skip break', 'Stop']);
  });

  it('names a long break, and shows every dot filled', async () => {
    mount({ initial: data({ state: breakReady('longBreak', 15, 4) }) });
    await ready();
    expect(labels()[0]).toBe('Start long break');
    expect(container.querySelectorAll('.fo-dot.is-filled')).toHaveLength(4);
    expect(container.querySelector('.fo-ring').dataset.tone).toBe('idle');
  });

  it('colours a running break differently, and says it is a break in words', async () => {
    const state = startPhase(breakReady(), T0);
    const { page } = mount({ initial: data({ state }) });
    await ready();
    expect(phase()).toBe('Short break');
    expect(container.querySelector('.fo-ring').dataset.tone).toBe('break');
    expect(container.querySelector('.fo-ring-note').textContent).toBe('5-minute break');
    page.unmount();
  });

  it('sends each button as the command it names', async () => {
    const sendFocusCommand = vi.fn(async () => running());
    const { page } = mount({ initial: data({ state: running() }), sendFocusCommand });
    await ready();
    sendFocusCommand.mockClear();
    click('Pause');
    await vi.waitFor(() => expect(sendFocusCommand).toHaveBeenCalledWith('pause'));
    await vi.waitFor(() => expect(buttons().every((b) => !b.disabled)).toBe(true));
    click('Stop');
    await vi.waitFor(() => expect(sendFocusCommand).toHaveBeenCalledWith('stop'));
    page.unmount();
  });

  it('disables the buttons while a command is running, and ignores a second press', async () => {
    let release;
    const sendFocusCommand = vi.fn((action) =>
      action === 'sync' ? Promise.resolve(null) : new Promise((resolve) => (release = resolve)),
    );
    const { page } = mount({ sendFocusCommand });
    await ready();
    click('Start focus');
    expect(buttons().every((b) => b.disabled)).toBe(true);
    expect(container.querySelector('#focus-length').disabled).toBe(true);

    release(running());
    await vi.waitFor(() => expect(labels()).toEqual(['Pause', 'Stop']));
    expect(sendFocusCommand.mock.calls.filter(([action]) => action === 'start')).toHaveLength(1);
    page.unmount();
  });

  it("shows the worker's reason when a command is refused, and lets the user carry on", async () => {
    const sendFocusCommand = vi.fn(async (action) => {
      if (action === 'start')
        throw new Error('BrowseWise could not reach its background service. Please try again.');
      return null;
    });
    const { page } = mount({ sendFocusCommand });
    await ready();
    click('Start focus');
    await vi.waitFor(() =>
      expect(container.querySelector('.fo-error').textContent).toContain('could not reach'),
    );
    expect(buttons()[0].disabled).toBe(false);
    page.unmount();
  });

  it('speaks the time left for assistive technology', async () => {
    const { page } = mount({ initial: data({ state: running() }) });
    await ready();
    expect(container.querySelector('.fo-ring').getAttribute('aria-label')).toBe(
      'Focus: 25 minutes left (25-minute session)',
    );
    page.unmount();
  });
});

describe('focus page: the end of a phase', () => {
  it('asks the worker to settle a phase that has ended, and shows what comes next', async () => {
    const due = running({}, 60_000);
    const afterEnd = breakReady();
    const sendFocusCommand = vi.fn(async () => afterEnd);
    clock = T0 + 61_000;
    const { page } = mount({ initial: data({ state: due }), sendFocusCommand });

    await vi.waitFor(() => expect(phase()).toBe('Short break ready'));
    expect(sendFocusCommand).toHaveBeenCalledWith('sync');
    page.unmount();
  });

  it('does not ask again and again while it waits for the worker', async () => {
    const due = running({}, 60_000);
    const sendFocusCommand = vi.fn(async () => due); // the worker has not caught up
    clock = T0 + 61_000;
    const { page } = mount({ initial: data({ state: due }), sendFocusCommand });
    await ready();
    await new Promise((resolve) => setTimeout(resolve, 900)); // several ticks

    // Once when the page opened, and once because the phase is over.
    expect(sendFocusCommand.mock.calls.filter(([action]) => action === 'sync')).toHaveLength(2);
    page.unmount();
  });

  it('catches up on anything that finished while the dashboard was closed', async () => {
    const sendFocusCommand = vi.fn(async () => breakReady());
    const { page } = mount({ initial: data({ state: null }), sendFocusCommand });
    await vi.waitFor(() => expect(sendFocusCommand).toHaveBeenCalledWith('sync'));
    await vi.waitFor(() => expect(phase()).toBe('Short break ready'));
    page.unmount();
  });

  it('announces a finished session and gives the ring a pulse', async () => {
    const { page } = mount({ initial: data({ today: { sessions: 1, focusMs: 25 * 60_000 } }) });
    await ready();
    loaded = data({ today: { sessions: 2, focusMs: 50 * 60_000 } });
    subscribeCallback();
    await vi.waitFor(() => expect(status()).toBe('Focus session complete. Well done.'));
    expect(container.querySelector('.fo-ring').classList.contains('is-pulsing')).toBe(true);
    page.unmount();
  });

  it('does not announce anything the first time it loads', async () => {
    const { page } = mount({ initial: data({ today: { sessions: 3, focusMs: 75 * 60_000 } }) });
    await ready();
    expect(status()).toBe('');
    page.unmount();
  });
});

describe('focus page: the length of the next session', () => {
  it('offers the presets and the saved length, selecting the saved one', async () => {
    mount();
    await ready();
    const options = [...container.querySelectorAll('#focus-length option')].map((o) => o.value);
    expect(options).toEqual(['15', '20', '25', '30', '45', '50', '60', '90']);
    expect(container.querySelector('#focus-length').value).toBe('25');
  });

  it('adds a length that is not a preset', async () => {
    const custom = data();
    custom.settings.focusMinutes = 37;
    mount({ initial: custom });
    await ready();
    const select = container.querySelector('#focus-length');
    expect([...select.options].map((o) => o.value)).toContain('37');
    expect(select.value).toBe('37');
  });

  it('saves a new length and shows it on the timer', async () => {
    const { page, deps } = mount();
    await ready();
    const select = container.querySelector('#focus-length');
    select.value = '45';
    select.dispatchEvent(new Event('change', { bubbles: true }));

    await vi.waitFor(() => expect(deps.updateSettings).toHaveBeenCalledWith({ focusMinutes: 45 }));
    await vi.waitFor(() => expect(time()).toBe('45:00'));
    page.unmount();
  });

  it('puts the choice back and says so when saving fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { page } = mount({
      overrides: {
        updateSettings: vi.fn(async () => {
          throw new Error('quota');
        }),
      },
    });
    await ready();
    const select = container.querySelector('#focus-length');
    select.value = '45';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    await vi.waitFor(() => expect(status()).toContain('Could not save the focus length'));
    expect(select.value).toBe('25');
    page.unmount();
  });

  it('is only available when no timer is set up', async () => {
    const { page } = mount({ initial: data({ state: running() }) });
    await ready();
    expect(container.querySelector('#focus-length').disabled).toBe(true);
    page.unmount();
  });

  it('keeps the same selector through a background refresh', async () => {
    const { page } = mount();
    await ready();
    const select = container.querySelector('#focus-length');
    subscribeCallback();
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(container.querySelector('#focus-length')).toBe(select);
    page.unmount();
  });
});

describe('focus page: numbers, streaks and badges', () => {
  it("shows today's focus time, the all-time total, and both streaks", async () => {
    mount({ initial: data({ today: { sessions: 2, focusMs: 50 * 60_000 } }) });
    await ready();
    const stat = (label) => container.querySelector(`section[aria-label="${label}"]`);
    expect(plain(stat('Focus today').querySelector('.db-stat-value').textContent)).toBe('50m');
    expect(stat('Focus today').textContent).toContain('2 sessions');
    expect(stat('All time').textContent).toContain('4 sessions');
    expect(stat('Focus streak').querySelector('.db-stat-value').textContent).toBe('2 days');
    expect(stat('Focus streak').textContent).toContain('Best: 3 days');
    expect(stat('Within your goal')).not.toBeNull();
  });

  it('uses the singular for one session and one day', async () => {
    mount({
      initial: data({
        today: { sessions: 1, focusMs: 25 * 60_000 },
        streaks: { focus: { current: 1, best: 1 }, goal: { current: 0, best: 0 } },
      }),
    });
    await ready();
    expect(container.textContent).toContain('1 session');
    expect(
      container.querySelector('section[aria-label="Focus streak"] .db-stat-value').textContent,
    ).toBe('1 day');
  });

  it('shows a gentle prompt, not a loss, when there is no streak yet', async () => {
    mount({
      initial: data({ streaks: { focus: { current: 0, best: 0 }, goal: { current: 0, best: 0 } } }),
    });
    await ready();
    expect(container.querySelector('section[aria-label="Focus streak"]').textContent).toContain(
      'Finish a session to start one',
    );
    expect(container.textContent).not.toMatch(/lost|broke|failed|missed/i);
  });

  it('shows a neutral best when a streak has ended', async () => {
    mount({
      initial: data({ streaks: { focus: { current: 0, best: 9 }, goal: { current: 0, best: 0 } } }),
    });
    await ready();
    const card = container.querySelector('section[aria-label="Focus streak"]');
    expect(card.querySelector('.db-stat-value').textContent).toBe('0 days');
    expect(card.textContent).toContain('Best: 9 days');
  });

  it('draws seven days of sessions, each with a spoken count', async () => {
    mount();
    await ready();
    const days = container.querySelectorAll('.fo-week-day');
    expect(days).toHaveLength(7);
    expect(days[1].getAttribute('aria-label')).toBe('Tue, Nov 10: 1 session');
    expect(days[2].getAttribute('aria-label')).toBe('Wed, Nov 11: 2 sessions');
    expect(days[0].getAttribute('aria-label')).toBe('Mon, Nov 9: 0 sessions');
  });

  it('lists every badge, earned first and newest first, then locked ones', async () => {
    mount({
      initial: data({
        earned: {
          'first-session': '2026-11-01',
          'hours-1': '2026-11-09',
          'streak-3': '2026-11-05',
        },
      }),
    });
    await ready();
    const titles = [...container.querySelectorAll('.fo-badge-title')].map((n) => n.textContent);
    expect(titles).toHaveLength(BADGES.length);
    expect(titles.slice(0, 3)).toEqual(['First hour', 'Three in a row', 'First focus']);
    expect(container.querySelector('.fo-badges-count').textContent).toBe(
      `3 of ${BADGES.length} earned`,
    );
    expect(container.querySelectorAll('.fo-badge.is-earned')).toHaveLength(3);
    expect(container.querySelectorAll('.fo-badge.is-locked')).toHaveLength(BADGES.length - 3);
  });

  it('says plainly that badges are never about using the browser more or less', async () => {
    mount();
    await ready();
    expect(container.querySelector('.fo-badges').textContent).toContain(
      'never about using the browser more or less',
    );
  });

  it('hides streaks and badges completely when the user turned them off, and says how to bring them back', async () => {
    mount({ initial: data({ showAchievements: false }) });
    await ready();
    expect(container.querySelector('section[aria-label="Focus streak"]')).toBeNull();
    expect(container.querySelector('section[aria-label="Within your goal"]')).toBeNull();
    expect(container.querySelector('.fo-badges')).toBeNull();
    expect(container.querySelector('.fo-hidden-note a').getAttribute('href')).toBe('#settings');
    // The timer and the plain numbers are still there.
    expect(container.querySelector('section[aria-label="Focus today"]')).not.toBeNull();
  });
});

describe('focus page: celebrations', () => {
  it('celebrates and announces a badge that arrives while the page is open', async () => {
    const celebrate = vi.fn(() => true);
    const { page } = mount({ initial: data(), overrides: { celebrate } });
    await ready();
    expect(celebrate).not.toHaveBeenCalled(); // never on first load

    loaded = data({ earned: { 'first-session': '2026-11-15' } });
    subscribeCallback();
    await vi.waitFor(() => expect(celebrate).toHaveBeenCalledTimes(1));
    // It points at the newest badge, which is first in the list.
    expect(celebrate.mock.calls[0][0].anchor).toBe(container.querySelector('.fo-badge.is-earned'));
    expect(status()).toBe('New badge: First focus.');
    page.unmount();
  });

  it('names several badges at once', async () => {
    const { page } = mount();
    await ready();
    loaded = data({ earned: { 'first-session': '2026-11-15', 'hours-1': '2026-11-15' } });
    subscribeCallback();
    await vi.waitFor(() => expect(status()).toMatch(/^New badges: /));
    page.unmount();
  });

  it('does not celebrate badges that were already earned when the page opened', async () => {
    const celebrate = vi.fn();
    const earned = { 'first-session': '2026-11-01' };
    const { page } = mount({ initial: data({ earned }), overrides: { celebrate } });
    await ready();
    loaded = data({ earned, today: { sessions: 1, focusMs: 1 } });
    subscribeCallback();
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(celebrate).not.toHaveBeenCalled();
    page.unmount();
  });
});

describe('focus page: loading and cleaning up', () => {
  it('shows an error with a retry when the data cannot be loaded', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { page } = mount({
      overrides: {
        loadFocusData: vi.fn().mockRejectedValueOnce(new Error('down')).mockResolvedValue(data()),
      },
    });
    await vi.waitFor(() =>
      expect(container.querySelector('.db-state[role="alert"]')).not.toBeNull(),
    );
    // The timer's buttons stay unavailable until the stored state has been read.
    expect(buttons().every((b) => b.disabled)).toBe(true);

    container.querySelector('.db-state button').click();
    await ready();
    expect(buttons().every((b) => !b.disabled)).toBe(true);
    page.unmount();
  });

  it('stops ticking, restores the title and unsubscribes when unmounted', async () => {
    const { page } = mount({ initial: data({ state: running() }) });
    await ready();
    expect(document.title).toContain('Focus');
    page.unmount();
    expect(unsubscribe).toHaveBeenCalled();
    expect(document.title).toBe('BrowseWise');

    clock = T0 + 5 * MINUTE_MS;
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(document.title).toBe('BrowseWise'); // not updated again
  });
});
