import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createChromeMock } from './helpers/chrome-mock.js';
import { DEFAULT_SETTINGS } from '../src/shared/storage/schema.js';
import {
  LATEST_SCHEMA_VERSION,
  MIGRATIONS,
  runMigrations,
} from '../src/shared/storage/migrations.js';

let chromeMock;

function useMock(initial = {}) {
  chromeMock = createChromeMock(initial);
  vi.stubGlobal('chrome', chromeMock);
}

const readAll = () => chromeMock.storage.local.get(null);

beforeEach(() => {
  useMock();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('runMigrations', () => {
  it('initialises a fresh install', async () => {
    const result = await runMigrations();
    const stored = await readAll();

    expect(result).toEqual({
      from: 0,
      to: LATEST_SCHEMA_VERSION,
      applied: MIGRATIONS.map((m) => m.version),
    });
    expect(stored.settings).toEqual(DEFAULT_SETTINGS);
    expect(stored.meta).toEqual({ schemaVersion: LATEST_SCHEMA_VERSION });
  });

  it('is idempotent: a second run applies nothing', async () => {
    await runMigrations();
    const result = await runMigrations();
    expect(result.applied).toEqual([]);
    expect(result.from).toBe(LATEST_SCHEMA_VERSION);
  });

  it('does not overwrite settings that already exist', async () => {
    useMock({ settings: { idleThresholdSeconds: 120 } });
    await runMigrations();
    const stored = await readAll();
    expect(stored.settings).toEqual({ idleThresholdSeconds: 120 });
  });

  it('leaves data from a newer schema untouched', async () => {
    useMock({ meta: { schemaVersion: 99 }, settings: { future: true } });
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await runMigrations();
    const stored = await readAll();

    expect(result.applied).toEqual([]);
    expect(stored.meta).toEqual({ schemaVersion: 99 });
    expect(stored.settings).toEqual({ future: true });
  });

  it('runs migrations in version order regardless of list order', async () => {
    const calls = [];
    const migrations = [
      { version: 2, description: 'second', up: async () => calls.push(2) },
      { version: 1, description: 'first', up: async () => calls.push(1) },
    ];
    const result = await runMigrations(migrations);
    expect(calls).toEqual([1, 2]);
    expect(result.applied).toEqual([1, 2]);
  });

  it('records progress after each success and resumes after a failure', async () => {
    const failing = [
      { version: 1, description: 'ok', up: async () => {} },
      {
        version: 2,
        description: 'breaks',
        up: async () => {
          throw new Error('boom');
        },
      },
    ];

    await expect(runMigrations(failing)).rejects.toThrow('boom');
    expect((await readAll()).meta).toEqual({ schemaVersion: 1 });

    const fixed = [
      { version: 1, description: 'ok', up: async () => {} },
      { version: 2, description: 'fixed', up: async () => {} },
    ];
    const result = await runMigrations(fixed);
    expect(result.applied).toEqual([2]);
    expect((await readAll()).meta).toEqual({ schemaVersion: 2 });
  });
});
