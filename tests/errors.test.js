import { afterEach, describe, expect, it, vi } from 'vitest';
import { errorMessage, isWorkerInterruption, reportFailure } from '../src/background/errors.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('errorMessage', () => {
  it('reads the message of an Error, or text of anything else', () => {
    expect(errorMessage(new Error('No SW'))).toBe('No SW');
    expect(errorMessage('plain text')).toBe('plain text');
    expect(errorMessage(42)).toBe('42');
  });

  it('never returns an empty string', () => {
    for (const odd of [undefined, null, '', '   ']) {
      expect(errorMessage(odd)).toBe('unknown error');
    }
  });

  it('names the type of an error that has no message', () => {
    expect(errorMessage(new Error(''))).toBe('Error');
    expect(errorMessage(new TypeError(''))).toBe('TypeError');
  });
});

describe('isWorkerInterruption', () => {
  it.each([
    new Error('No SW'),
    new Error('Error: No SW'),
    new Error('Extension context invalidated.'),
    'No SW',
  ])('recognises %s', (error) => {
    expect(isWorkerInterruption(error)).toBe(true);
  });

  it.each([
    new Error('QUOTA_BYTES quota exceeded'),
    new TypeError("Cannot read properties of undefined (reading 'x')"),
    new Error('No tab with id: 5'),
    new Error('Something about a service worker'),
    undefined,
  ])('treats %s as a real failure', (error) => {
    expect(isWorkerInterruption(error)).toBe(false);
  });
});

describe('reportFailure', () => {
  it('logs an expected interruption quietly, never as an error or warning', () => {
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    reportFailure('windows.onFocusChanged', new Error('No SW'));

    expect(debug).toHaveBeenCalledWith(
      '[BrowseWise] windows.onFocusChanged interrupted (No SW); tracking recovers on the next event',
    );
    expect(error).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  it('logs a real failure as an error with the reason in the same line', () => {
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const failure = new Error('quota exceeded');

    reportFailure('heartbeat', failure);

    expect(error).toHaveBeenCalledWith('[BrowseWise] heartbeat failed: quota exceeded', failure);
    expect(debug).not.toHaveBeenCalled();
  });
});
