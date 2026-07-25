// playlistSelector.js
// Single responsibility: pure array operations over playlists of video
// IDs — merging, deduplicating, and picking a random entry. No DOM, no
// Firestore, no other module dependencies.

function asArray(list) {
  return Array.isArray(list) ? list : [];
}

/** Returns a new array with duplicate entries removed, order preserved. */
export function removeDuplicates(list) {
  return [...new Set(asArray(list))];
}

/** Combines two playlists into one, with duplicates removed. */
export function mergePlaylists(listA, listB) {
  return removeDuplicates([...asArray(listA), ...asArray(listB)]);
}

/**
 * Picks one random video ID from the (deduplicated) combination of
 * `listA` and `listB`. Returns null if the combined list is empty.
 */
export function getRandomSong(listA, listB) {
  const combined = mergePlaylists(listA, listB);
  if (combined.length === 0) return null;
  const index = Math.floor(Math.random() * combined.length);
  return combined[index];
}
