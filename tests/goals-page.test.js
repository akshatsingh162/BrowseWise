// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountGoalsPage } from '../src/dashboard/pages/goals.js';
import { computeLimitStatus } from '../src/shared/limits.js';

const MIN = 60_000;
const NOW = new Date(2026, 10, 7, 12, 0, 0).getTime();
const noGoals = { dailyGoalMs: null, siteLimits: {} };

function data({
  goals = noGoals,
  used = {},
  notifications = { enabled: false, granted: false },
  suggestions = [],
} = {}) {
  return { goals, status: computeLimitStatus(goals, used), notifications, suggestions };
}

let container;
let subscribeCallback;

function mount(initial = data(), overrides = {}) {
  const deps = {
    loadGoalsData: vi.fn(async () => initial),
    setDailyGoal: vi.fn(async () => ({})),
    setSiteLimit: vi.fn(async () => ({})),
    clearAllGoals: vi.fn(async () => {}),
    acknowledgeCurrentlyExceeded: vi.fn(async () => {}),
    updateSettings: vi.fn(async () => ({})),
    requestNotificationsPermission: vi.fn(async () => true),
    removeNotificationsPermission: vi.fn(async () => true),
    showTestNotification: vi.fn(async () => true),
    confirm: vi.fn(async () => true),
    requestLiveFlush: vi.fn(async () => true),
    subscribe: vi.fn((callback) => {
      subscribeCallback = callback;
      return () => {};
    }),
    now: () => NOW,
    ...overrides,
  };
  const page = mountGoalsPage(container, deps);
  return { page, deps };
}

const ready = () =>
  vi.waitFor(() => {
    expect(container.querySelector('.db-loading')).toBeNull();
    expect(container.querySelector('.db-results .db-panel')).not.toBeNull();
  });
const byId = (id) => container.querySelector(`#${id}`);
const type = (input, value) => {
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
};
const clickButton = (label) =>
  [...container.querySelectorAll('button')]
    .find((b) => b.textContent === label || b.getAttribute('aria-label') === label)
    .click();
const status = () => container.querySelector('.db-status').textContent;
const rows = () => [...container.querySelectorAll('.db-limit')];

beforeEach(() => {
  vi.stubGlobal('chrome', { runtime: { getURL: (path) => `chrome-extension://abc/${path}` } });
  document.body.innerHTML = '<div id="root"></div>';
  container = document.getElementById('root');
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('goals page: empty state', () => {
  it('invites the user to set a goal, and keeps destructive and test actions off', async () => {
    mount();
    await ready();
    expect(container.textContent).toContain('No goals or limits yet');
    expect(rows()).toHaveLength(0);
    expect(clickable('Remove all goals and limits').disabled).toBe(true);
    expect(clickable('Send a test notification').disabled).toBe(true);
    expect(byId('notify-switch').getAttribute('aria-checked')).toBe('false');
    expect(byId('notify-status').textContent).toBe('Off.');
  });

  it('promises not to block websites', async () => {
    mount();
    await ready();
    expect(container.querySelector('.db-page-desc').textContent).toContain(
      'never blocks a website',
    );
  });
});

function clickable(label) {
  return [...container.querySelectorAll('button')].find((b) => b.textContent === label);
}

describe('goals page: today\u2019s progress', () => {
  const goals = {
    dailyGoalMs: 120 * MIN,
    siteLimits: { 'youtube.com': 30 * MIN, 'reddit.com': 60 * MIN },
  };

  it('shows the goal and each limit with time used and left', async () => {
    mount(data({ goals, used: { 'youtube.com': 25 * MIN, 'github.com': 60 * MIN } }));
    await ready();

    expect(container.querySelector('.db-summary').textContent).toBe('1h 25m browsed today');
    expect(rows()).toHaveLength(3);
    expect(rows()[0].textContent).toContain('Daily goal');
    expect(rows()[0].querySelector('.db-limit-meta').textContent).toContain('1h 25m of 2h 00m');
    expect(rows()[0].querySelector('.db-limit-state').textContent).toBe('35m left');
    expect(rows()[1].querySelector('.db-site-name').textContent).toBe('youtube.com');
    expect(rows()[1].querySelector('.db-limit-state').textContent).toBe('5m left');
  });

  it('exposes each bar as a progressbar with a spoken summary', async () => {
    mount(data({ goals, used: { 'youtube.com': 25 * MIN } }));
    await ready();
    const bar = rows()[1].querySelector('[role="progressbar"]');
    expect(bar.getAttribute('aria-valuemax')).toBe('30');
    expect(bar.getAttribute('aria-valuenow')).toBe('25');
    expect(bar.getAttribute('aria-valuetext')).toBe('25m of 30m used. 5m left.');
    expect(bar.getAttribute('aria-label')).toBe('limit for youtube.com');
  });

  it('marks nearly-reached and exceeded limits, always in words as well as colour', async () => {
    mount(data({ goals, used: { 'youtube.com': 40 * MIN, 'reddit.com': 50 * MIN } }));
    await ready();
    const [, youtube, reddit] = rows();
    expect(youtube.classList.contains('db-limit-exceeded')).toBe(true);
    expect(youtube.querySelector('.bw-bar-fill').className).toContain('bw-bar-fill-danger');
    expect(youtube.querySelector('.db-limit-state').textContent).toBe('Over by 10m');
    expect(reddit.classList.contains('db-limit-warning')).toBe(true);
    expect(reddit.querySelector('.bw-bar-fill').className).toContain('bw-bar-fill-warning');
    expect(reddit.querySelector('.db-limit-state').textContent).toBe('10m left');
  });

  it('never draws a bar wider than its track', async () => {
    mount(data({ goals, used: { 'youtube.com': 300 * MIN } }));
    await ready();
    expect(rows()[1].querySelector('.bw-bar-fill').getAttribute('style')).toContain('width: 100%');
  });
});

describe('goals page: daily goal form', () => {
  it('saves a valid goal and says so', async () => {
    const { deps } = mount();
    await ready();
    type(byId('goal-hours'), '2');
    type(byId('goal-minutes'), '30');
    clickable('Save goal').click();

    await vi.waitFor(() => expect(deps.setDailyGoal).toHaveBeenCalledWith(150 * MIN, { now: NOW }));
    await vi.waitFor(() => expect(status()).toBe('Daily goal saved: 2h 30m.'));
  });

  it('shows a clear error and saves nothing for invalid input', async () => {
    const { deps } = mount();
    await ready();
    type(byId('goal-hours'), '0');
    type(byId('goal-minutes'), '2');
    clickable('Save goal').click();

    await vi.waitFor(() =>
      expect(container.querySelector('.db-field-error').textContent).toBe(
        'Choose at least 5 minutes.',
      ),
    );
    expect(byId('goal-hours').getAttribute('aria-invalid')).toBe('true');
    expect(deps.setDailyGoal).not.toHaveBeenCalled();
  });

  it('shows the saved goal in the form', async () => {
    mount(data({ goals: { dailyGoalMs: 150 * MIN, siteLimits: {} } }));
    await ready();
    expect(byId('goal-hours').value).toBe('2');
    expect(byId('goal-minutes').value).toBe('30');
  });

  it('Edit fills the form and moves focus to it', async () => {
    mount(data({ goals: { dailyGoalMs: 90 * MIN, siteLimits: {} } }));
    await ready();
    byId('goal-hours').value = '';
    clickButton('Edit daily goal');
    expect(byId('goal-hours').value).toBe('1');
    expect(byId('goal-minutes').value).toBe('30');
    expect(document.activeElement).toBe(byId('goal-hours'));
  });

  it('Remove deletes the goal', async () => {
    const { deps } = mount(data({ goals: { dailyGoalMs: 90 * MIN, siteLimits: {} } }));
    await ready();
    clickButton('Remove daily goal');
    await vi.waitFor(() => expect(deps.setDailyGoal).toHaveBeenCalledWith(null, { now: NOW }));
    await vi.waitFor(() => expect(status()).toBe('Daily goal removed.'));
  });

  it('reports a failure to save without losing what was typed', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { deps } = mount(data(), {
      setDailyGoal: vi.fn(async () => Promise.reject(new Error('disk'))),
    });
    await ready();
    type(byId('goal-hours'), '2');
    clickable('Save goal').click();
    await vi.waitFor(() => expect(status()).toBe('Could not save the goal.'));
    expect(byId('goal-hours').value).toBe('2');
    expect(deps.setDailyGoal).toHaveBeenCalled();
  });
});

describe('goals page: website limit form', () => {
  const fill = (site, hours, minutes) => {
    type(byId('limit-site'), site);
    type(byId('limit-hours'), hours);
    type(byId('limit-minutes'), minutes);
  };

  it('turns a pasted address into the tracked domain and saves the limit', async () => {
    const { deps } = mount();
    await ready();
    fill('https://www.YouTube.com/watch?v=1', '0', '30');
    clickable('Add limit').click();

    await vi.waitFor(() =>
      expect(deps.setSiteLimit).toHaveBeenCalledWith('youtube.com', 30 * MIN, { now: NOW }),
    );
    await vi.waitFor(() => expect(status()).toBe('Limit saved for youtube.com: 30m a day.'));
    expect(byId('limit-site').value).toBe('');
    expect(byId('limit-hours').value).toBe('');
  });

  it('rejects something that is not a website, and saves nothing', async () => {
    const { deps } = mount();
    await ready();
    fill('notawebsite', '0', '30');
    clickable('Add limit').click();
    await vi.waitFor(() =>
      expect(container.querySelectorAll('.db-field-error')[1].textContent).toBe(
        'That does not look like a website address.',
      ),
    );
    expect(deps.setSiteLimit).not.toHaveBeenCalled();
  });

  it('rejects an invalid duration', async () => {
    const { deps } = mount();
    await ready();
    fill('youtube.com', '25', '0');
    clickable('Add limit').click();
    await vi.waitFor(() =>
      expect(container.querySelectorAll('.db-field-error')[1].textContent).toBe(
        'Choose 24 hours or less.',
      ),
    );
    expect(deps.setSiteLimit).not.toHaveBeenCalled();
  });

  it('offers recently used websites as suggestions', async () => {
    mount(data({ suggestions: ['github.com', 'youtube.com'] }));
    await ready();
    expect(
      [...container.querySelectorAll('#limit-suggestions option')].map((o) => o.value),
    ).toEqual(['github.com', 'youtube.com']);
  });

  it('says "Update limit" when the website already has one', async () => {
    mount(data({ goals: { dailyGoalMs: null, siteLimits: { 'youtube.com': 30 * MIN } } }));
    await ready();
    expect(clickable('Add limit')).toBeDefined();
    type(byId('limit-site'), 'www.youtube.com');
    expect(clickable('Update limit')).toBeDefined();
  });

  it('Edit fills the form with that limit', async () => {
    mount(data({ goals: { dailyGoalMs: null, siteLimits: { 'youtube.com': 75 * MIN } } }));
    await ready();
    clickButton('Edit limit for youtube.com');
    expect(byId('limit-site').value).toBe('youtube.com');
    expect(byId('limit-hours').value).toBe('1');
    expect(byId('limit-minutes').value).toBe('15');
    expect(clickable('Update limit')).toBeDefined();
    expect(document.activeElement).toBe(byId('limit-hours'));
  });

  it('Remove deletes just that limit', async () => {
    const { deps } = mount(
      data({ goals: { dailyGoalMs: null, siteLimits: { 'youtube.com': 30 * MIN } } }),
    );
    await ready();
    clickButton('Remove limit for youtube.com');
    await vi.waitFor(() =>
      expect(deps.setSiteLimit).toHaveBeenCalledWith('youtube.com', null, { now: NOW }),
    );
    await vi.waitFor(() => expect(status()).toBe('Limit removed for youtube.com.'));
  });

  it('shows the reason when the limit cap is reached', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mount(data(), {
      setSiteLimit: vi.fn(async () =>
        Promise.reject(new RangeError('You can set up to 100 website limits.')),
      ),
    });
    await ready();
    fill('youtube.com', '0', '30');
    clickable('Add limit').click();
    await vi.waitFor(() => expect(status()).toBe('You can set up to 100 website limits.'));
  });

  it('never interprets typed text as HTML', async () => {
    mount();
    await ready();
    fill('<img src=x onerror=alert(1)>', '0', '30');
    clickable('Add limit').click();
    await vi.waitFor(() =>
      expect(container.querySelectorAll('.db-field-error')[1].textContent).not.toBe(''),
    );
    expect(container.querySelectorAll('img[onerror]')).toHaveLength(0);
  });
});

describe('goals page: notifications', () => {
  const sw = () => byId('notify-switch');

  it('turning on asks for the permission FIRST, then saves the setting', async () => {
    let grant;
    const requestNotificationsPermission = vi.fn(() => new Promise((resolve) => (grant = resolve)));
    const { deps } = mount(data(), { requestNotificationsPermission });
    await ready();

    sw().click();
    // Chrome only shows the permission prompt in direct response to the click.
    expect(requestNotificationsPermission).toHaveBeenCalledTimes(1);
    expect(deps.updateSettings).not.toHaveBeenCalled();

    grant(true);
    await vi.waitFor(() =>
      expect(deps.updateSettings).toHaveBeenCalledWith({ notificationsEnabled: true }),
    );
    await vi.waitFor(() =>
      expect(deps.acknowledgeCurrentlyExceeded).toHaveBeenCalledWith({ now: NOW }),
    );
    await vi.waitFor(() => expect(status()).toBe('Notifications are on.'));
  });

  it('stays off, and says why, when the user declines the permission', async () => {
    const { deps } = mount(data(), { requestNotificationsPermission: vi.fn(async () => false) });
    await ready();
    sw().click();
    await vi.waitFor(() =>
      expect(status()).toBe('Chrome did not grant the permission, so notifications stay off.'),
    );
    expect(deps.updateSettings).toHaveBeenCalledWith({ notificationsEnabled: false });
    expect(deps.acknowledgeCurrentlyExceeded).not.toHaveBeenCalled();
  });

  it('turning off saves the setting and gives the permission back', async () => {
    const { deps } = mount(data({ notifications: { enabled: true, granted: true } }));
    await ready();
    expect(sw().getAttribute('aria-checked')).toBe('true');

    sw().click();
    await vi.waitFor(() =>
      expect(deps.updateSettings).toHaveBeenCalledWith({ notificationsEnabled: false }),
    );
    await vi.waitFor(() => expect(deps.removeNotificationsPermission).toHaveBeenCalled());
    await vi.waitFor(() => expect(status()).toBe('Notifications are off.'));
    expect(deps.requestNotificationsPermission).not.toHaveBeenCalled();
  });

  it('shows "off" and explains when the permission was removed in Chrome', async () => {
    mount(data({ notifications: { enabled: true, granted: false } }));
    await ready();
    expect(sw().getAttribute('aria-checked')).toBe('false');
    expect(byId('notify-status').textContent).toContain('permission was removed in Chrome');
  });

  it('the test button works only while notifications are on', async () => {
    const { deps } = mount(data({ notifications: { enabled: true, granted: true } }));
    await ready();
    expect(clickable('Send a test notification').disabled).toBe(false);
    clickable('Send a test notification').click();
    await vi.waitFor(() => expect(deps.showTestNotification).toHaveBeenCalled());
    await vi.waitFor(() => expect(status()).toContain('Test notification sent'));
  });

  it('says so when a test notification could not be shown', async () => {
    mount(data({ notifications: { enabled: true, granted: true } }), {
      showTestNotification: vi.fn(async () => false),
    });
    await ready();
    clickable('Send a test notification').click();
    await vi.waitFor(() => expect(status()).toContain('Could not show a notification'));
  });

  it('is a proper switch, labelled and described', async () => {
    mount();
    await ready();
    expect(sw().getAttribute('role')).toBe('switch');
    expect(container.querySelector('label[for="notify-switch"]').textContent).toContain(
      'Notify me',
    );
    expect(sw().getAttribute('aria-describedby')).toBe('notify-status');
  });
});

describe('goals page: removing everything', () => {
  const withGoal = () => data({ goals: { dailyGoalMs: 90 * MIN, siteLimits: {} } });

  it('asks first, and does nothing if the user cancels', async () => {
    const { deps } = mount(withGoal(), { confirm: vi.fn(async () => false) });
    await ready();
    clickable('Remove all goals and limits').click();
    await vi.waitFor(() => expect(deps.confirm).toHaveBeenCalled());
    expect(deps.confirm.mock.calls[0][0]).toMatchObject({
      danger: true,
      confirmLabel: 'Remove all',
    });
    expect(deps.clearAllGoals).not.toHaveBeenCalled();
  });

  it('removes everything once confirmed', async () => {
    const { deps } = mount(withGoal());
    await ready();
    clickable('Remove all goals and limits').click();
    await vi.waitFor(() => expect(deps.clearAllGoals).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(status()).toBe('All goals and limits removed.'));
  });
});

describe('goals page: live updates', () => {
  it('refreshes progress without wiping what the user is typing', async () => {
    const goals = { dailyGoalMs: null, siteLimits: { 'youtube.com': 30 * MIN } };
    const loadGoalsData = vi.fn(async () => data({ goals, used: { 'youtube.com': 5 * MIN } }));
    const { deps } = mount(undefined, { loadGoalsData });
    await ready();
    await vi.waitFor(() => expect(deps.subscribe).toHaveBeenCalled());

    type(byId('limit-site'), 'reddit.co');
    type(byId('goal-hours'), '3');
    const siteInput = byId('limit-site');

    loadGoalsData.mockResolvedValue(data({ goals, used: { 'youtube.com': 20 * MIN } }));
    subscribeCallback();
    await vi.waitFor(() =>
      expect(rows()[0].querySelector('.db-limit-meta').textContent).toContain('20m of 30m'),
    );

    expect(byId('limit-site')).toBe(siteInput);
    expect(siteInput.value).toBe('reddit.co');
    expect(byId('goal-hours').value).toBe('3');
  });

  it('shows an error with a working retry', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const loadGoalsData = vi
      .fn()
      .mockRejectedValueOnce(new Error('storage down'))
      .mockResolvedValue(data());
    mount(undefined, { loadGoalsData });
    await vi.waitFor(() => expect(container.querySelector('[role="alert"] button')).not.toBeNull());
    container.querySelector('[role="alert"] button').click();
    await ready();
  });

  it('stops listening when the page is left', async () => {
    const unsubscribe = vi.fn();
    const { page, deps } = mount(data(), { subscribe: vi.fn(() => unsubscribe) });
    await ready();
    await vi.waitFor(() => expect(deps.subscribe).toHaveBeenCalled());
    page.unmount();
    expect(unsubscribe).toHaveBeenCalled();
  });
});
