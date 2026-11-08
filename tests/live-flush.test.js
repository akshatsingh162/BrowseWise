import { afterEach, describe, expect, it, vi } from 'vitest';
import { requestLiveFlush } from '../src/shared/live-flush.js';
import { MESSAGE_TYPES } from '../src/shared/messages.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('requestLiveFlush', () => {
  it('sends the snapshot message and reports success', async () => {
    const send = vi.fn(async () => ({ ok: true }));
    expect(await requestLiveFlush({ send })).toBe(true);
    expect(send).toHaveBeenCalledWith({ type: MESSAGE_TYPES.GET_LIVE_SNAPSHOT });
  });

  it('never throws when the worker fails, and reports failure', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const send = vi.fn(async () => {
      throw new Error('Could not establish connection');
    });
    expect(await requestLiveFlush({ send })).toBe(false);
  });

  it('gives up after the timeout instead of hanging', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const send = vi.fn(() => new Promise(() => {})); // never answers
    const started = Date.now();
    expect(await requestLiveFlush({ send, timeoutMs: 30 })).toBe(false);
    expect(Date.now() - started).toBeLessThan(1000);
  });
});
