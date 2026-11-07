import { DEFAULT_SETTINGS, STORAGE_KEYS } from './schema.js';
import { withStorageLock } from './lock.js';

/**
 * Ordered list of schema migrations.
 *
 * Rules:
 *  - Versions are consecutive integers, never edited once released.
 *  - Every `up` must be idempotent: if the worker dies after `up` but before the
 *    version is recorded, it will run again.
 *  - To change the schema, ADD a new entry at the end.
 */
export const MIGRATIONS = [
  {
    version: 1,
    description: 'Create default settings',
    async up(area) {
      const stored = await area.get(STORAGE_KEYS.SETTINGS);
      if (stored[STORAGE_KEYS.SETTINGS] === undefined) {
        await area.set({ [STORAGE_KEYS.SETTINGS]: { ...DEFAULT_SETTINGS } });
      }
    },
  },
];

export const LATEST_SCHEMA_VERSION = MIGRATIONS.at(-1).version;

/**
 * Applies every migration newer than the stored schema version.
 *
 * If the stored version is NEWER than this build understands (for example after a
 * downgrade), nothing is touched, so we never damage data written by a newer version.
 *
 * @param {typeof MIGRATIONS} [migrations] injectable for tests
 * @returns {Promise<{from: number, to: number, applied: number[]}>}
 */
export function runMigrations(migrations = MIGRATIONS) {
  return withStorageLock(async () => {
    const area = chrome.storage.local;
    const stored = await area.get(STORAGE_KEYS.META);
    const from = stored[STORAGE_KEYS.META]?.schemaVersion ?? 0;

    const ordered = [...migrations].sort((a, b) => a.version - b.version);
    const latest = ordered.at(-1)?.version ?? 0;

    if (from > latest) {
      console.warn(
        `[BrowseWise] Stored schema v${from} is newer than this build (v${latest}); leaving data untouched.`,
      );
      return { from, to: from, applied: [] };
    }

    const applied = [];
    for (const migration of ordered) {
      if (migration.version <= from) continue;
      await migration.up(area);
      // Record progress after EACH migration so a later failure doesn't redo earlier ones.
      await area.set({ [STORAGE_KEYS.META]: { schemaVersion: migration.version } });
      applied.push(migration.version);
    }

    return { from, to: applied.at(-1) ?? from, applied };
  });
}
