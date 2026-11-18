// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFocusWidget } from '../src/popup/focus-widget.js';
import { MINUTE_MS, createPhase, pausePhase, startPhase } from '../src/shared/focus.js';

const T0 = 1_700_000_000_000;
const running = (endsInMs = 25 * MINUTE_MS) => ({
  ...startPhase(createPhase({ phase: 'focus', durationMs: 25 * MINUTE_MS, sessionId: 'abc' }), T0),
  endsAt: T0 + endsInMs,
});

let clock;
let unsubscribe;
let notify;
const mount = ({ state = null, focusMinutes = 25, sendFocusCommand } = {}) => {
  let snapshot = { state, focusMinutes };
  const widget = createFocusWidget({
    loadSnapshot: vi.fn(async () => snapshot),
    sendFocusCommand: sendFocusCommand ?? vi.fn(async () => snapshot.state),
    subscribe: vi.fn((callback) => {
      notify = callback;
      return unsubscribe;
    }),
    now: () => clock,
  });
  document.body.append(widget.element);
  return { widget, setSnapshot: (next) => (snapshot = next) };
};
const label = () => document.querySelector('.pp-focus-label').textContent;
const time = () => document.querySelector('.pp-focus-time').textContent;
const buttons = () => [...document.querySelectorAll('.pp-focus-actions button')];
const names = () => buttons().map((b) => b.getAttribute('aria-label') ?? b.textContent.trim());

beforeEach(() => {
  clock = T0;
  unsubscribe = vi.fn();
  document.body.replaceChildren();
  vi.spyOn(console, 'debug').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('popup focus widget', () => {
  it('is a labelled region with a timer', () => {
    mount();
    expect(document.querySelector('.pp-focus').getAttribute('aria-label')).toBe('Focus timer');
    expect(document.querySelector('.pp-focus-time').getAttribute('role')).toBe('timer');
  });

  it('shows the next session ready to start, with its length from the settings', async () => {
    const { widget } = mount({ focusMinutes: 45 });
    await widget.start();
    expect(label()).toBe('Ready');
    expect(time()).toBe('45:00');
    expect(names()).toEqual(['Start focus']);
    widget.destroy();
  });

  it('keeps its buttons disabled until the stored timer has been read', async () => {
    const { widget } = mount();
    expect(buttons().every((b) => b.disabled)).toBe(true);
    await widget.start();
    expect(buttons().every((b) => !b.disabled)).toBe(true);
    widget.destroy();
  });

  it('shows a running session with a worded main button and icon buttons that have names', async () => {
    const { widget } = mount({ state: running() });
    await widget.start();
    expect(label()).toBe('Focus');
    expect(time()).toBe('25:00');
    expect(names()).toEqual(['Pause', 'Stop']);
    expect(buttons()[0].textContent.trim()).toBe('Pause');
    expect(buttons()[1].getAttribute('aria-label')).toBe('Stop');
    expect(buttons()[1].getAttribute('title')).toBe('Stop');
    expect(document.querySelector('.pp-focus').dataset.tone).toBe('focus');
    widget.destroy();
  });

  it('counts down as the clock moves', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const { widget } = mount({ state: running() });
    await widget.start();
    clock = T0 + 90_000;
    vi.advanceTimersByTime(500);
    expect(time()).toBe('23:30');
    widget.destroy();
    vi.useRealTimers();
  });

  it('shows a paused session frozen, and offers Resume', async () => {
    const paused = pausePhase(running(), T0 + 10 * MINUTE_MS);
    const { widget } = mount({ state: paused });
    await widget.start();
    expect(label()).toBe('Focus paused');
    expect(time()).toBe('15:00');
    expect(names()).toEqual(['Resume', 'Stop']);
    expect(document.querySelector('.pp-focus').dataset.tone).toBe('paused');
    widget.destroy();
  });

  it('sends the command for a button, and shows the timer that comes back', async () => {
    const sendFocusCommand = vi.fn(async () => running());
    const { widget } = mount({ sendFocusCommand });
    await widget.start();
    buttons()[0].click();
    await vi.waitFor(() => expect(names()).toEqual(['Pause', 'Stop']));
    expect(sendFocusCommand).toHaveBeenCalledWith('start');
    widget.destroy();
  });

  it('ignores clicks while a command is in flight', async () => {
    let release;
    const sendFocusCommand = vi.fn(() => new Promise((resolve) => (release = resolve)));
    const { widget } = mount({ state: running(), sendFocusCommand });
    await widget.start();
    buttons()[0].click();
    expect(buttons().every((b) => b.disabled)).toBe(true);
    buttons()[1].click();
    release(null);
    await vi.waitFor(() => expect(names()).toEqual(['Start focus']));
    expect(sendFocusCommand).toHaveBeenCalledTimes(1);
    widget.destroy();
  });

  it('shows the reason when a command fails, and lets the user try again', async () => {
    const sendFocusCommand = vi.fn(async () => {
      throw new Error('BrowseWise could not reach its background service. Please try again.');
    });
    const { widget } = mount({ sendFocusCommand });
    await widget.start();
    buttons()[0].click();
    await vi.waitFor(() =>
      expect(document.querySelector('.pp-focus-error').textContent).toContain('could not reach'),
    );
    expect(buttons()[0].disabled).toBe(false);
    widget.destroy();
  });

  it('asks the worker to settle a phase that has ended, but only once every few seconds', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const due = running(60_000);
    const sendFocusCommand = vi.fn(async () => due); // stays due: the worker has not caught up
    const { widget } = mount({ state: due, sendFocusCommand });
    clock = T0 + 61_000;
    await widget.start();
    vi.advanceTimersByTime(500 * 4); // four more ticks within 5 seconds
    expect(sendFocusCommand.mock.calls.filter(([action]) => action === 'sync')).toHaveLength(1);

    clock += 6000;
    vi.advanceTimersByTime(500);
    expect(sendFocusCommand.mock.calls.filter(([action]) => action === 'sync')).toHaveLength(2);
    widget.destroy();
    vi.useRealTimers();
  });

  it('follows changes made elsewhere (the dashboard, or the timer ending)', async () => {
    const { widget, setSnapshot } = mount();
    await widget.start();
    expect(label()).toBe('Ready');

    setSnapshot({ state: running(), focusMinutes: 25 });
    notify();
    await vi.waitFor(() => expect(label()).toBe('Focus'));
    widget.destroy();
  });

  it('stops listening and ticking when destroyed', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const { widget } = mount({ state: running() });
    await widget.start();
    widget.destroy();
    expect(unsubscribe).toHaveBeenCalled();
    clock = T0 + 5 * MINUTE_MS;
    vi.advanceTimersByTime(2000);
    expect(time()).toBe('25:00'); // no longer updating
    vi.useRealTimers();
  });

  it('survives a storage read that fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const widget = createFocusWidget({
      loadSnapshot: async () => {
        throw new Error('storage down');
      },
      sendFocusCommand: vi.fn(),
      subscribe: () => () => {},
      now: () => clock,
    });
    document.body.append(widget.element);
    await expect(widget.start()).resolves.toBeUndefined();
    widget.destroy();
  });
});
