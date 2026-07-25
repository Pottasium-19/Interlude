// flowerState.js
// Single responsibility: track the petals (video IDs) on one flower,
// in memory only. No persistence, no DOM, no Firestore, no other
// module dependencies.

const MAX_PETALS = 30;

let petals = [];

/**
 * Adds `videoId` as a petal. No-op if it's already present or the
 * flower is already at capacity.
 */
export function addPetal(videoId) {
  if (typeof videoId !== "string" || !videoId) return;
  if (petals.includes(videoId)) return;
  if (petals.length >= MAX_PETALS) return;

  petals.push(videoId);
}

/** Removes `videoId` if present. No-op otherwise. */
export function removePetal(videoId) {
  petals = petals.filter((id) => id !== videoId);
}

/** Returns true if `videoId` is currently a petal on this flower. */
export function hasPetal(videoId) {
  return petals.includes(videoId);
}

/** Returns a copy of every petal, in the order they were added. */
export function getPetals() {
  return [...petals];
}

/** Removes all petals. */
export function clearPetals() {
  petals = [];
}

/** Returns true if the flower has reached its maximum capacity. */
export function isFull() {
  return petals.length >= MAX_PETALS;
}

export function petalCount() {
  return petals.length;
}
