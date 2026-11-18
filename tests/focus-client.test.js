import { afterEach, describe, expect, it, vi } from 'vitest';
import { FOCUS_ACTIONS, sendFocusCommand } from '../src/shared/focus-client.js';
import { MESSAGE_TYPES } from '../src/shared/messages.js';
import { createPhase, startPhase } from '../src/shared/focus.js';

const state = startPhase(
  createPhase({ phase: 'focus', durationMs: 25 * 60_000, sessionId: 'abc' }),
  5000,
);

afterEach(() => vi.restoreAllMocks());

describe('sendFocusCommand', () => {
  it('lists exactly the actions the worker accepts', () => {
    expect([...FOCUS_ACTIONS]).toEqual(['start', 'pause', 'resume', 'stop', 'skip', 'sync']);
  });

  it('sends the command and resolves with the new timer', async () => {
    const send = vi.fn(async () => ({ ok: true, state }));
    expect(await sendFocusCommand('start', { send })).toEqual(state);
    expect(send).toHaveBeenCalledWith({ type: MESSAGE_TYPES.FOCUS_COMMAND, action: 'start' });
  });

  it('resolves with null when the worker says there is no timer', async () => {
    expect(
      await sendFocusCommand('stop', { send: async () => ({ ok: true, state: null }) }),
    ).toBeNull();
    expect(await sendFocusCommand('stop', { send: async () => ({ ok: true }) })).toBeNull();
  });

  it('does not trust a damaged answer', async () => {
    expect(
      await sendFocusCommand('sync', { send: async () => ({ ok: true, state: { phase: 'nap' } }) }),
    ).toBeNull();
  });

  it("rejects with the worker's own message when it refuses", async () => {
    await expect(
      sendFocusCommand('skip', {
        send: async () => ({ ok: false, error: 'Only a break can be skipped.' }),
      }),
    ).rejects.toThrow('Only a break can be skipped.');
  });

  it('rejects with a friendly message when nothing answers or the worker cannot be reached', async () => {
    vi.spyOn(console, 'debug').mockImplementation(() => {});
    await expect(sendFocusCommand('start', { send: async () => undefined })).rejects.toThrow(
      'could not do that',
    );
    await expect(
      sendFocusCommand('start', {
        send: async () => {
          throw new Error('Could not establish connection');
        },
      }),
    ).rejects.toThrow('could not reach its background service');
  });

  it('refuses an unknown action before sending anything', async () => {
    const send = vi.fn();
    await expect(sendFocusCommand('explode', { send })).rejects.toThrow(RangeError);
    expect(send).not.toHaveBeenCalled();
  });
});
