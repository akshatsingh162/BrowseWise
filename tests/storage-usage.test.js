import { describe, expect, it, vi } from 'vitest';
import {
  STORAGE_QUOTA_BYTES,
  formatBytes,
  getStorageUsage,
  isStorageNearlyFull,
} from '../src/shared/storage-usage.js';

describe('getStorageUsage', () => {
  it('asks Chrome for the bytes in use across all keys', async () => {
    const area = { getBytesInUse: vi.fn(async () => 2048) };
    expect(await getStorageUsage(area)).toBe(2048);
    expect(area.getBytesInUse).toHaveBeenCalledWith(null);
  });

  it('returns null when Chrome fails, lacks the method, or answers nonsense', async () => {
    expect(
      await getStorageUsage({
        getBytesInUse: async () => {
          throw new Error('nope');
        },
      }),
    ).toBeNull();
    expect(await getStorageUsage({})).toBeNull();
    expect(await getStorageUsage({ getBytesInUse: async () => NaN })).toBeNull();
    expect(await getStorageUsage({ getBytesInUse: async () => -1 })).toBeNull();
  });

  it('returns null, not an error, when there is no chrome at all', async () => {
    expect(await getStorageUsage()).toBeNull();
  });
});

describe('formatBytes', () => {
  it.each([
    [0, '0 B'],
    [812, '812 B'],
    [1024, '1.0 KB'],
    [1536, '1.5 KB'],
    [14_540, '14 KB'],
    [1_048_576, '1.0 MB'],
    [1_363_149, '1.3 MB'],
    [52_428_800, '50 MB'],
  ])('formats %i as %s', (bytes, expected) => {
    expect(formatBytes(bytes)).toBe(expected);
  });

  it.each([null, undefined, NaN, -5, Infinity])('shows a dash for %s', (value) => {
    expect(formatBytes(value)).toBe('\u2014');
  });
});

describe('isStorageNearlyFull', () => {
  it("warns from 80% of Chrome's 10 MB limit", () => {
    expect(STORAGE_QUOTA_BYTES).toBe(10_485_760);
    expect(isStorageNearlyFull(0)).toBe(false);
    expect(isStorageNearlyFull(STORAGE_QUOTA_BYTES * 0.79)).toBe(false);
    expect(isStorageNearlyFull(STORAGE_QUOTA_BYTES * 0.8)).toBe(true);
    expect(isStorageNearlyFull(STORAGE_QUOTA_BYTES)).toBe(true);
  });

  it('does not warn when the size is unknown', () => {
    expect(isStorageNearlyFull(null)).toBe(false);
    expect(isStorageNearlyFull(undefined)).toBe(false);
    expect(isStorageNearlyFull(NaN)).toBe(false);
  });
});
