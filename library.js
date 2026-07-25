// library.js
// Single responsibility: a persistent set of saved video IDs ("the
// library"). Delegates all persistence to storage.js. No DOM, no
// Firestore, no other module dependencies.

import { save, load } from "./storage.js";

const STORAGE_KEY = "interlude_library";

function readAll() {
  const stored = load(STORAGE_KEY, []);
  return Array.isArray(stored) ? stored : [];
}

function writeAll(videoIds) {
  save(STORAGE_KEY, videoIds);
}

/** Adds `videoId` to the library. No-op if it's already present. */
export function add(videoId) {
  if (typeof videoId !== "string" || !videoId) return;

  const current = readAll();
  if (current.includes(videoId)) return;

  current.push(videoId);
  writeAll(current);
}

/** Removes `videoId` from the library. No-op if it isn't present. */
export function remove(videoId) {
  const current = readAll();
  const next = current.filter((id) => id !== videoId);
  if (next.length !== current.length) writeAll(next);
}

/** Returns true if `videoId` is in the library. */
export function has(videoId) {
  return readAll().includes(videoId);
}

/** Returns a copy of every video ID in the library. */
export function getAll() {
  return readAll();
}

/** Empties the library entirely. */
export function clear() {
  writeAll([]);
}
