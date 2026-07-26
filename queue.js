// queue.js
// Single responsibility: an in-memory, ordered queue of video IDs with
// a current-position pointer. No persistence, no DOM, no Firestore, no
// other module dependencies — state lives only as long as the page.

let items = [];
let currentIndex = -1; // -1 means "no current item" (queue is empty)

/**
 * Appends `videoId` to the end of the queue. No-op if it's already
 * present (by value). If the queue was empty, the new item becomes
 * current.
 */
export function add(videoId) {
  if (typeof videoId !== "string" || !videoId) return;
  if (items.includes(videoId)) return;

  items.push(videoId);
  if (currentIndex === -1) currentIndex = 0;
}

/**
 * Removes `videoId` if present, keeping the current pointer aimed at
 * the same logical item (or the nearest valid one) after the shift.
 */
export function remove(videoId) {
  const index = items.indexOf(videoId);
  if (index === -1) return;

  items.splice(index, 1);

  if (items.length === 0) {
    currentIndex = -1;
  } else if (index < currentIndex) {
    // Everything after the removed slot shifted down by one.
    currentIndex -= 1;
  } else if (index === currentIndex) {
    // The current item itself was removed; clamp so we don't run past
    // the new end of the array.
    currentIndex = Math.min(currentIndex, items.length - 1);
  }
  // index > currentIndex: removal happened after current, no shift needed.
}

/** Advances to the next item and returns it, or null at the end (or if empty). */
export function next() {
  if (items.length === 0) return null;
  if (currentIndex >= items.length - 1) return null;
  currentIndex += 1;
  return items[currentIndex];
}

/** Moves to the previous item and returns it, or null at the start (or if empty). */
export function previous() {
  if (items.length === 0) return null;
  if (currentIndex <= 0) return null;
  currentIndex -= 1;
  return items[currentIndex];
}

/** Returns the current item, or null if the queue is empty. */
export function current() {
  if (currentIndex === -1 || items.length === 0) return null;
  return items[currentIndex];
}

/** Empties the queue entirely and resets the current pointer. */
export function clear() {
  items = [];
  currentIndex = -1;
}

/** Returns a shallow copy of the queue contents, in order. */
export function getAll() {
  return [...items];
}

export function size() {
  return items.length;
}

export function isEmpty() {
  return items.length === 0;
}

/**
 * Replaces the queue's contents with `videoIds` (the library's current
 * Firestore-confirmed list), keeping the current pointer on the same
 * video if it's still present. If the previously-current video was
 * removed, the pointer clamps to the nearest remaining item; if the
 * list is now empty, the pointer clears (current() returns null).
 */
export function syncWith(videoIds) {
  const previousCurrent = current();
  items = Array.isArray(videoIds) ? [...videoIds] : [];

  if (items.length === 0) {
    currentIndex = -1;
    return;
  }

  const preservedIndex = previousCurrent !== null ? items.indexOf(previousCurrent) : -1;
  currentIndex = preservedIndex !== -1
    ? preservedIndex
    : Math.min(Math.max(currentIndex, 0), items.length - 1);
}

/**
 * Interleaves two ordered video-id lists round-robin (a[0], b[0], a[1], b[1], ...),
 * skipping a duplicate so it only appears once, at its earliest position.
 */
export function mergeRoundRobin(listA = [], listB = []) {
  const merged = [];
  const seen = new Set();
  const max = Math.max(listA.length, listB.length);
  for (let i = 0; i < max; i++) {
    if (i < listA.length && !seen.has(listA[i])) {
      merged.push(listA[i]);
      seen.add(listA[i]);
    }
    if (i < listB.length && !seen.has(listB[i])) {
      merged.push(listB[i]);
      seen.add(listB[i]);
    }
  }
  return merged;
}
