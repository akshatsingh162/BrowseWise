import { afterEach, describe, expect, it, vi } from 'vitest';
import { requestLiveFlush } from '../src/shared/live-flush.js';
import { MESSAGE_TYPES } from '../src/shared/messages.js';

let debug;

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
    debug = vi.spyOn(console, 'debug').mockImplementation(() => {});
    const send = vi.fn(async () => {
      throw new Error('Could not establish connection');
    });
    expect(await requestLiveFlush({ send })).toBe(false);
  });

  it('logs failures at debug level only, never as a warning or error', async () => {
    debug = vi.spyOn(console, 'debug').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const send = vi.fn(async () => {
      throw new Error('worker asleep');
    });

    await requestLiveFlush({ send });

    expect(debug).toHaveBeenCalledTimes(1);
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it('gives up after the timeout instead of hanging', async () => {
    debug = vi.spyOn(console, 'debug').mockImplementation(() => {});
    const send = vi.fn(() => new Promise(() => {})); // never answers
    const started = Date.now();
    expect(await requestLiveFlush({ send, timeoutMs: 30 })).toBe(false);
    expect(Date.now() - started).toBeLessThan(1000);
  });
});
