import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createChromeMock } from './helpers/chrome-mock.js';
import { splitIntoSegments } from '../src/shared/time.js';
import {
  addUsage,
  clearAllUsage,
  getUsageForDate,
  getUsageForRange,
  listUsageDateKeys,
  pruneUsageBefore,
} from '../src/shared/storage/usage-repo.js';

let chromeMock;

beforeEach(() => {
  chromeMock = createChromeMock();
  vi.stubGlobal('chrome', chromeMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const seg = (dateKey, hour, ms) => ({ dateKey, hour, ms });
const sum = (numbers) => numbers.reduce((a, b) => a + b, 0);

describe('addUsage', () => {
  it('records time against a domain and an hour', async () => {
    await addUsage('github.com', [seg('2026-11-07', 10, 5000)]);
    const day = await getUsageForDate('2026-11-07');

    expect(day.domainMs).toEqual({ 'github.com': 5000 });
    expect(day.hourlyMs[10]).toBe(5000);
    expect(sum(day.hourlyMs)).toBe(5000);
  });

  it('accumulates across calls and domains', async () => {
    await addUsage('github.com', [seg('2026-11-07', 10, 5000)]);
    await addUsage('github.com', [seg('2026-11-07', 10, 2000)]);
    await addUsage('youtube.com', [seg('2026-11-07', 11, 3000)]);
    const day = await getUsageForDate('2026-11-07');

    expect(day.domainMs).toEqual({ 'github.com': 7000, 'youtube.com': 3000 });
    expect(day.hourlyMs[10]).toBe(7000);
    expect(day.hourlyMs[11]).toBe(3000);
  });

  it('writes both days when a session crosses midnight', async () => {
    const start = new Date(2026, 10, 7, 23, 55).getTime();
    const end = new Date(2026, 10, 8, 0, 5).getTime();
    await addUsage('example.com', splitIntoSegments(start, end));

    const [first, second] = await getUsageForRange(['2026-11-07', '2026-11-08']);
    expect(first.hourlyMs[23]).toBe(300_000);
    expect(second.hourlyMs[0]).toBe(300_000);
  });

  it('does not lose updates when many writes run concurrently', async () => {
    await Promise.all(
      Array.from({ length: 25 }, () => addUsage('a.com', [seg('2026-11-07', 9, 1000)])),
    );
    const day = await getUsageForDate('2026-11-07');
    expect(day.domainMs['a.com']).toBe(25_000);
    expect(day.hourlyMs[9]).toBe(25_000);
  });

  it('safely stores a hostile hostname such as __proto__', async () => {
    await addUsage('__proto__', [seg('2026-11-07', 9, 1000)]);
    await addUsage('__proto__', [seg('2026-11-07', 9, 1000)]);
    const day = await getUsageForDate('2026-11-07');

    expect(Object.keys(day.domainMs)).toEqual(['__proto__']);
    expect(Object.getOwnPropertyDescriptor(day.domainMs, '__proto__').value).toBe(2000);
    expect(Object.getPrototypeOf(day.domainMs)).toBe(Object.prototype);
  });

  it('ignores invalid segments and empty domains', async () => {
    await addUsage('a.com', [
      seg('2026-11-07', 24, 1000),
      seg('2026-11-07', 5, -1),
      seg('2026-11-07', 5, NaN),
      seg('not-a-date', 5, 1000),
    ]);
    await addUsage('', [seg('2026-11-07', 5, 1000)]);

    expect(await listUsageDateKeys()).toEqual([]);
  });
});

describe('reading usage', () => {
  it('returns an empty day when nothing was recorded', async () => {
    const day = await getUsageForDate('2026-01-01');
    expect(day.date).toBe('2026-01-01');
    expect(day.hourlyMs).toHaveLength(24);
    expect(sum(day.hourlyMs)).toBe(0);
    expect(day.domainMs).toEqual({});
  });

  it('returns range results in the order requested', async () => {
    await addUsage('a.com', [seg('2026-11-06', 1, 100)]);
    await addUsage('a.com', [seg('2026-11-07', 1, 200)]);
    const days = await getUsageForRange(['2026-11-07', '2026-11-06']);
    expect(days.map((day) => day.date)).toEqual(['2026-11-07', '2026-11-06']);
    expect(days.map((day) => day.hourlyMs[1])).toEqual([200, 100]);
  });

  it('lists recorded date keys oldest first', async () => {
    await addUsage('a.com', [seg('2026-11-07', 1, 1)]);
    await addUsage('a.com', [seg('2026-11-05', 1, 1)]);
    await addUsage('a.com', [seg('2026-11-06', 1, 1)]);
    expect(await listUsageDateKeys()).toEqual(['2026-11-05', '2026-11-06', '2026-11-07']);
  });
});

describe('retention and deletion', () => {
  beforeEach(async () => {
    await chromeMock.storage.local.set({ settings: { keep: 'me' } });
    await addUsage('a.com', [seg('2026-11-05', 1, 1)]);
    await addUsage('a.com', [seg('2026-11-06', 1, 1)]);
    await addUsage('a.com', [seg('2026-11-07', 1, 1)]);
  });

  it('prunes only days before the cutoff', async () => {
    expect(await pruneUsageBefore('2026-11-06')).toBe(1);
    expect(await listUsageDateKeys()).toEqual(['2026-11-06', '2026-11-07']);
    expect((await chromeMock.storage.local.get('settings')).settings).toEqual({ keep: 'me' });
  });

  it('clears all usage but leaves settings alone', async () => {
    await clearAllUsage();
    expect(await listUsageDateKeys()).toEqual([]);
    expect((await chromeMock.storage.local.get('settings')).settings).toEqual({ keep: 'me' });
  });
});
