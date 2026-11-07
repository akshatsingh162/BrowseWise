/**
 * Minimal in-memory stand-in for chrome.storage.local.
 *
 * Values are cloned through JSON on every read and write, which mirrors how Chrome
 * really serialises storage and catches accidental shared-reference bugs.
 */
const clone = (value) => JSON.parse(JSON.stringify(value));

export function createChromeMock(initial = {}) {
  const data = clone(initial);

  const local = {
    async get(keys) {
      if (keys === null || keys === undefined) return clone(data);

      const isDefaultsObject = typeof keys === 'object' && !Array.isArray(keys);
      const list = typeof keys === 'string' ? [keys] : isDefaultsObject ? Object.keys(keys) : keys;

      const result = {};
      for (const key of list) {
        if (Object.hasOwn(data, key)) result[key] = clone(data[key]);
        else if (isDefaultsObject) result[key] = clone(keys[key]);
      }
      return result;
    },

    async set(items) {
      for (const [key, value] of Object.entries(items)) data[key] = clone(value);
    },

    async remove(keys) {
      for (const key of Array.isArray(keys) ? keys : [keys]) delete data[key];
    },

    async clear() {
      for (const key of Object.keys(data)) delete data[key];
    },
  };

  return { storage: { local } };
}
