// flowerState.js
// Single responsibility: track the petals (video IDs) on the current
// user's own private flower, organized into three layers — outer (30),
// middle (20),
// inner (10) — each with its own capacity. A song can be on at most
// one layer at a time.
//
// In-memory reads/writes (addPetal/removePetal/movePetal/etc.) stay
// synchronous and Firestore-free, exactly as before, for simple local
// use and testing. The *Remote functions below them are the
// Firestore-backed versions the app actually calls: they validate and
// write against that user's own document at flowers/{userId} —
// — inside a transaction (so two simultaneous edits from both users
// can't both slip past a capacity/duplicate check), then rely on the
// live listenToFlower() subscription to reflect the confirmed result
// back into local state, the same read-after-write-via-listener pattern
// library.js uses for the personal library.
//
// No DOM. Doesn't know about library.js or any other module — the
// personal library and the flower are kept as separate data models on
// purpose; main.js is what connects a library song to a flower layer.

import { db } from "./firebase.js";
import {
  doc,
  getDoc,
  setDoc,
  onSnapshot,
  runTransaction
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import { getUserId } from "./room.js";

export const LAYERS = ["outer", "middle", "inner"];

export const LAYER_CAPACITY = {
  outer: 30,
  middle: 20,
  inner: 10
};

// Backward-compatible total, for anything still expecting a single
// flower-wide cap.
export const MAX_PETALS = LAYER_CAPACITY.outer + LAYER_CAPACITY.middle + LAYER_CAPACITY.inner;

let layers = { outer: [], middle: [], inner: [] };

function petalsDocRef() {
  return doc(db, "flowers", getUserId());
}
let unsubscribe = null;

function isValidLayer(layer) {
  return LAYERS.includes(layer);
}

function normalizeLayers(data) {
  return {
    outer: Array.isArray(data?.outer) ? [...data.outer] : [],
    middle: Array.isArray(data?.middle) ? [...data.middle] : [],
    inner: Array.isArray(data?.inner) ? [...data.inner] : []
  };
}

// ---------------------------------------------------------------------
// Synchronous, in-memory API (unchanged shape from before, now layer-aware)
// ---------------------------------------------------------------------

/** Returns which layer `videoId` is currently on, or null if it's on none. */
export function getPetalLayer(videoId) {
  return LAYERS.find((layer) => layers[layer].includes(videoId)) || null;
}

/**
 * Adds `videoId` to `layer` in memory. No-op (returns false) if it's
 * already on any layer, `layer` is invalid, or that layer is at
 * capacity. Defaults to "outer" so the original single-argument call
 * shape still works.
 */
export function addPetal(videoId, layer = "outer") {
  if (typeof videoId !== "string" || !videoId) return false;
  if (!isValidLayer(layer)) return false;
  if (getPetalLayer(videoId) !== null) return false;
  if (layers[layer].length >= LAYER_CAPACITY[layer]) return false;

  layers[layer].push(videoId);
  return true;
}

/** Removes `videoId` from whichever layer it's on. No-op if it's on none. */
export function removePetal(videoId) {
  const layer = getPetalLayer(videoId);
  if (!layer) return false;
  layers[layer] = layers[layer].filter((id) => id !== videoId);
  return true;
}

/**
 * Moves `videoId` to `toLayer`. No-op (returns false) if it's on no
 * layer, already on `toLayer`, `toLayer` is invalid, or `toLayer` is
 * at capacity.
 */
export function movePetal(videoId, toLayer) {
  if (!isValidLayer(toLayer)) return false;
  const fromLayer = getPetalLayer(videoId);
  if (!fromLayer || fromLayer === toLayer) return false;
  if (layers[toLayer].length >= LAYER_CAPACITY[toLayer]) return false;

  layers[fromLayer] = layers[fromLayer].filter((id) => id !== videoId);
  layers[toLayer].push(videoId);
  return true;
}

/** Returns true if `videoId` is on any layer. */
export function hasPetal(videoId) {
  return getPetalLayer(videoId) !== null;
}

/** Returns a copy of one layer's petals, in order. */
export function getLayer(layer) {
  return isValidLayer(layer) ? [...layers[layer]] : [];
}

/** Returns every petal across all layers, in order (outer, middle, inner). */
export function getPetals() {
  return LAYERS.flatMap((layer) => layers[layer]);
}

/** Returns a copy of the full layered structure: { outer, middle, inner }. */
export function getAllLayers() {
  return normalizeLayers(layers);
}

/** Removes all petals from every layer (in memory only). */
export function clearPetals() {
  layers = { outer: [], middle: [], inner: [] };
}

/** True if `layer` is at capacity. With no argument, true only if every layer is full. */
export function isFull(layer) {
  if (layer) return isValidLayer(layer) ? layers[layer].length >= LAYER_CAPACITY[layer] : false;
  return LAYERS.every((l) => layers[l].length >= LAYER_CAPACITY[l]);
}

/** Petal count of `layer`, or the total across all layers with no argument. */
export function petalCount(layer) {
  if (layer) return isValidLayer(layer) ? layers[layer].length : 0;
  return LAYERS.reduce((sum, l) => sum + layers[l].length, 0);
}

// ---------------------------------------------------------------------
// Firestore persistence — the shared petals document
// ---------------------------------------------------------------------

function applySnapshot(data) {
  layers = normalizeLayers(data);
}

/**
 * One-time fetch to hydrate in-memory state immediately, without
 * waiting on a listener. Safe to call multiple times.
 */
export async function restoreFlower() {
  try {
    const snap = await getDoc(petalsDocRef());
    applySnapshot(snap.exists() ? snap.data() : null);
  } catch (error) {
    console.error("flowerState.js: failed to restore flower:", error);
  }
  return getAllLayers();
}

/**
 * One-off read of any user's flower by userId — including someone
 * else's. Used only for the temporary playback merge; never
 * subscribed to live, never written through, and never touches this
 * module's own in-memory `layers` (which always reflects the caller's
 * own flower only).
 */
export async function getFlowerSnapshot(userId) {
  if (typeof userId !== "string" || !userId) return { outer: [], middle: [], inner: [] };
  try {
    const snap = await getDoc(doc(db, "flowers", userId));
    return normalizeLayers(snap.exists() ? snap.data() : null);
  } catch (error) {
    console.error("flowerState.js: failed to read flower for merge:", error);
    return { outer: [], middle: [], inner: [] };
  }
}

/**
 * Starts listening to the shared petals document. `onChange` is called
 * with { outer, middle, inner } immediately on first load, and again
 * on every subsequent change — this tab, the other user, or a
 * reconnect. This is what makes the flower restore automatically on
 * page load and stay live afterward. Safe to call once; calling again
 * replaces the previous listener rather than stacking a second one.
 * Returns a stop function (also available as stopFlowerListening()).
 */
export function listenToFlower(onChange) {
  if (unsubscribe) unsubscribe();

  unsubscribe = onSnapshot(
    petalsDocRef(),
    (snap) => {
      applySnapshot(snap.exists() ? snap.data() : null);
      onChange(getAllLayers());
    },
    (error) => console.error("flowerState.js: listener error:", error)
  );

  return unsubscribe;
}

/** Stops the live listener started by listenToFlower(). No-op if not listening. */
export function stopFlowerListening() {
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
}

async function transactionalMutate(mutateFn) {
  return runTransaction(db, async (transaction) => {
    const snap = await transaction.get(petalsDocRef());
    const current = normalizeLayers(snap.exists() ? snap.data() : null);
    const applied = mutateFn(current);
    if (applied) transaction.set(petalsDocRef(), current, { merge: true });
    return applied;
  });
}

/**
 * Firestore-backed add: validates against the live document (not the
 * local cache) inside a transaction, so two users adding at the same
 * moment can't both slip past a capacity or duplicate check. Resolves
 * true if the petal was added, false if it was rejected (duplicate or
 * full). The confirmed change reaches local state via listenToFlower's
 * next snapshot, not by mutating `layers` here directly.
 */
export async function addPetalRemote(videoId, layer = "outer") {
  if (typeof videoId !== "string" || !videoId) return false;
  if (!isValidLayer(layer)) return false;
  try {
    return await transactionalMutate((current) => {
      const onAnyLayer = LAYERS.some((l) => current[l].includes(videoId));
      if (onAnyLayer) return false;
      if (current[layer].length >= LAYER_CAPACITY[layer]) return false;
      current[layer].push(videoId);
      return true;
    });
  } catch (error) {
    console.error("flowerState.js: failed to add petal:", error);
    return false;
  }
}

/** Firestore-backed remove. Resolves true if a petal was removed, false if it wasn't found on any layer. */
export async function removePetalRemote(videoId) {
  if (typeof videoId !== "string" || !videoId) return false;
  try {
    return await transactionalMutate((current) => {
      const layer = LAYERS.find((l) => current[l].includes(videoId));
      if (!layer) return false;
      current[layer] = current[layer].filter((id) => id !== videoId);
      return true;
    });
  } catch (error) {
    console.error("flowerState.js: failed to remove petal:", error);
    return false;
  }
}

/** Firestore-backed move. Resolves true if moved, false if rejected (not found, same layer, or target full). */
export async function movePetalRemote(videoId, toLayer) {
  if (typeof videoId !== "string" || !videoId) return false;
  if (!isValidLayer(toLayer)) return false;
  try {
    return await transactionalMutate((current) => {
      const fromLayer = LAYERS.find((l) => current[l].includes(videoId));
      if (!fromLayer || fromLayer === toLayer) return false;
      if (current[toLayer].length >= LAYER_CAPACITY[toLayer]) return false;
      current[fromLayer] = current[fromLayer].filter((id) => id !== videoId);
      current[toLayer].push(videoId);
      return true;
    });
  } catch (error) {
    console.error("flowerState.js: failed to move petal:", error);
    return false;
  }
}
