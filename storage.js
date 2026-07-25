// storage.js
// Single responsibility: a thin, safe wrapper around localStorage with
// automatic JSON serialization. No DOM, no Firestore, no other module
// dependencies.

/**
 * Serializes `value` to JSON and stores it under `key`. Fails silently
 * (logs a warning) if localStorage is unavailable or the value can't be
 * serialized (e.g. circular references, BigInt) — a failed save should
 * never crash the caller.
 */
export function save(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    console.warn(`storage.js: failed to save "${key}":`, error);
    return false;
  }
}

/**
 * Reads `key` and JSON-parses it. Returns `defaultValue` if the key is
 * missing, localStorage is unavailable, or the stored value isn't
 * valid JSON (e.g. corrupted, or written by something else as a raw
 * string).
 */
export function load(key, defaultValue = null) {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return defaultValue;
    return JSON.parse(raw);
  } catch (error) {
    console.warn(`storage.js: failed to load "${key}":`, error);
    return defaultValue;
  }
}

/** Removes `key`. Fails silently if localStorage is unavailable. */
export function remove(key) {
  try {
    window.localStorage.removeItem(key);
    return true;
  } catch (error) {
    console.warn(`storage.js: failed to remove "${key}":`, error);
    return false;
  }
}

/** Clears all of localStorage. Fails silently if unavailable. */
export function clear() {
  try {
    window.localStorage.clear();
    return true;
  } catch (error) {
    console.warn("storage.js: failed to clear storage:", error);
    return false;
  }
}
