// gardenFlowers.js
// Same layered-petal model as flowerState.js (layers, capacity,
// transactions, listeners), but for the two fixed "garden" flowers —
// pink and lavender — instead of a per-user flower. Storage lives at
// gardenFlowers/{flowerId} instead of flowers/{userId}.
//
// Every function takes an explicit flowerId ("pink" | "lavender") in
// place of the implicit getUserId() lookup flowerState.js uses, since
// there's no "current user" concept here — both garden flowers are
// always addressable side by side, so in-memory state is kept per
// flowerId rather than as a single shared `layers` object.
//
// No DOM. Doesn't know about flowerState.js, library.js, or any other
// module.

import { db } from "./firebase.js";
import {
  doc,
  getDoc,
  onSnapshot,
  runTransaction
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

export const LAYERS = ["outer", "middle", "inner"];

export const LAYER_CAPACITY = {
  outer: 30,
  middle: 20,
  inner: 10
};

// Backward-compatible total, for anything still expecting a single
// flower-wide cap.
export const MAX_PETALS = LAYER_CAPACITY.outer + LAYER_CAPACITY.middle + LAYER_CAPACITY.inner;

export const FLOWER_IDS = ["pink", "lavender"];

function isValidFlowerId(flowerId) {
  return FLOWER_IDS.includes(flowerId);
}

let layers = {
  pink: { outer: [], middle: [], inner: [] },
  lavender: { outer: [], middle: [], inner: [] }
};

function gardenFlowerDocRef(flowerId) {
  return doc(db, "gardenFlowers", flowerId);
}

let unsubscribes = { pink: null, lavender: null };

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
// Synchronous, in-memory API (same shape as flowerState.js, now keyed
// by flowerId since there are two garden flowers, not one per caller)
// ---------------------------------------------------------------------

/** Returns which layer `videoId` is currently on for `flowerId`, or null if none. */
export function getPetalLayer(flowerId, videoId) {
  if (!isValidFlowerId(flowerId)) return null;
  return LAYERS.find((layer) => layers[flowerId][layer].includes(videoId)) || null;
}

/**
 * Adds `videoId` to `layer` on `flowerId` in memory. No-op (returns
 * false) if flowerId is invalid, it's already on any layer, `layer`
 * is invalid, or that layer is at capacity.
 */
export function addPetal(flowerId, videoId, layer = "outer") {
  if (!isValidFlowerId(flowerId)) return false;
  if (typeof videoId !== "string" || !videoId) return false;
  if (!isValidLayer(layer)) return false;
  if (getPetalLayer(flowerId, videoId) !== null) return false;
  if (layers[flowerId][layer].length >= LAYER_CAPACITY[layer]) return false;

  layers[flowerId][layer].push(videoId);
  return true;
}

/** Removes `videoId` from whichever layer it's on for `flowerId`. No-op if on none. */
export function removePetal(flowerId, videoId) {
  if (!isValidFlowerId(flowerId)) return false;
  const layer = getPetalLayer(flowerId, videoId);
  if (!layer) return false;
  layers[flowerId][layer] = layers[flowerId][layer].filter((id) => id !== videoId);
  return true;
}

/**
 * Moves `videoId` to `toLayer` on `flowerId`. No-op (returns false) if
 * it's on no layer, already on `toLayer`, `toLayer` is invalid, or
 * `toLayer` is at capacity.
 */
export function movePetal(flowerId, videoId, toLayer) {
  if (!isValidFlowerId(flowerId)) return false;
  if (!isValidLayer(toLayer)) return false;
  const fromLayer = getPetalLayer(flowerId, videoId);
  if (!fromLayer || fromLayer === toLayer) return false;
  if (layers[flowerId][toLayer].length >= LAYER_CAPACITY[toLayer]) return false;

  layers[flowerId][fromLayer] = layers[flowerId][fromLayer].filter((id) => id !== videoId);
  layers[flowerId][toLayer].push(videoId);
  return true;
}

/** Returns true if `videoId` is on any layer of `flowerId`. */
export function hasPetal(flowerId, videoId) {
  return getPetalLayer(flowerId, videoId) !== null;
}

/** Returns a copy of one layer's petals for `flowerId`, in order. */
export function getLayer(flowerId, layer) {
  if (!isValidFlowerId(flowerId)) return [];
  return isValidLayer(layer) ? [...layers[flowerId][layer]] : [];
}

/** Returns every petal across all layers for `flowerId`, in order (outer, middle, inner). */
export function getPetals(flowerId) {
  if (!isValidFlowerId(flowerId)) return [];
  return LAYERS.flatMap((layer) => layers[flowerId][layer]);
}

/** Returns a copy of the full layered structure for `flowerId`: { outer, middle, inner }. */
export function getAllLayers(flowerId) {
  if (!isValidFlowerId(flowerId)) return { outer: [], middle: [], inner: [] };
  return normalizeLayers(layers[flowerId]);
}

/** Removes all petals from every layer of `flowerId` (in memory only). */
export function clearPetals(flowerId) {
  if (!isValidFlowerId(flowerId)) return;
  layers[flowerId] = { outer: [], middle: [], inner: [] };
}

/** True if `layer` on `flowerId` is at capacity. With no layer, true only if every layer is full. */
export function isFull(flowerId, layer) {
  if (!isValidFlowerId(flowerId)) return false;
  if (layer) return isValidLayer(layer) ? layers[flowerId][layer].length >= LAYER_CAPACITY[layer] : false;
  return LAYERS.every((l) => layers[flowerId][l].length >= LAYER_CAPACITY[l]);
}

/** Petal count of `layer` on `flowerId`, or the total across all layers with no layer given. */
export function petalCount(flowerId, layer) {
  if (!isValidFlowerId(flowerId)) return 0;
  if (layer) return isValidLayer(layer) ? layers[flowerId][layer].length : 0;
  return LAYERS.reduce((sum, l) => sum + layers[flowerId][l].length, 0);
}

// ---------------------------------------------------------------------
// Firestore persistence — the two garden flower documents
// ---------------------------------------------------------------------

function applySnapshot(flowerId, data) {
  layers[flowerId] = normalizeLayers(data);
}

/**
 * One-time fetch to hydrate in-memory state for `flowerId` immediately,
 * without waiting on a listener. Safe to call multiple times.
 */
export async function restoreFlower(flowerId) {
  if (!isValidFlowerId(flowerId)) return { outer: [], middle: [], inner: [] };
  try {
    const snap = await getDoc(gardenFlowerDocRef(flowerId));
    applySnapshot(flowerId, snap.exists() ? snap.data() : null);
  } catch (error) {
    console.error(`gardenFlowers.js: failed to restore ${flowerId} flower:`, error);
  }
  return getAllLayers(flowerId);
}

/**
 * One-off read of a garden flower's state by flowerId. Never
 * subscribed to live, never written through, and never touches this
 * module's own in-memory `layers` beyond the read it performs.
 */
export async function getFlowerSnapshot(flowerId) {
  if (!isValidFlowerId(flowerId)) return { outer: [], middle: [], inner: [] };
  try {
    const snap = await getDoc(gardenFlowerDocRef(flowerId));
    return normalizeLayers(snap.exists() ? snap.data() : null);
  } catch (error) {
    console.error(`gardenFlowers.js: failed to read ${flowerId} flower for merge:`, error);
    return { outer: [], middle: [], inner: [] };
  }
}

/**
 * Starts listening to `flowerId`'s document. `onChange` is called with
 * { outer, middle, inner } immediately on first load, and again on
 * every subsequent change. Safe to call once per flowerId; calling
 * again for the same flowerId replaces its previous listener rather
 * than stacking a second one. The pink and lavender listeners are
 * independent of each other. Returns a stop function (also available
 * as stopFlowerListening(flowerId)).
 */
export function listenToFlower(flowerId, onChange) {
  if (!isValidFlowerId(flowerId)) return () => {};
  if (unsubscribes[flowerId]) unsubscribes[flowerId]();

  unsubscribes[flowerId] = onSnapshot(
    gardenFlowerDocRef(flowerId),
    (snap) => {
      applySnapshot(flowerId, snap.exists() ? snap.data() : null);
      onChange(getAllLayers(flowerId));
    },
    (error) => console.error(`gardenFlowers.js: listener error (${flowerId}):`, error)
  );

  return unsubscribes[flowerId];
}

/**
 * Starts a live listener on `flowerId`'s document without touching
 * this module's own in-memory `layers`, and returns its own separate
 * stop function, so it can run alongside listenToFlower().
 */
export function listenToFlowerById(flowerId, onChange) {
  if (!isValidFlowerId(flowerId)) return () => {};
  return onSnapshot(
    gardenFlowerDocRef(flowerId),
    (snap) => onChange(normalizeLayers(snap.exists() ? snap.data() : null)),
    (error) => console.error(`gardenFlowers.js: listener error (other, ${flowerId}):`, error)
  );
}

/** Stops the live listener started by listenToFlower(flowerId). No-op if not listening. */
export function stopFlowerListening(flowerId) {
  if (!isValidFlowerId(flowerId)) return;
  if (unsubscribes[flowerId]) {
    unsubscribes[flowerId]();
    unsubscribes[flowerId] = null;
  }
}

async function transactionalMutate(flowerId, mutateFn) {
  const ref = gardenFlowerDocRef(flowerId);
  return runTransaction(db, async (transaction) => {
    const snap = await transaction.get(ref);
    const current = normalizeLayers(snap.exists() ? snap.data() : null);
    const applied = mutateFn(current);
    if (applied) transaction.set(ref, current, { merge: true });
    return applied;
  });
}

/**
 * Firestore-backed add: validates against the live document (not the
 * local cache) inside a transaction, so two simultaneous edits can't
 * both slip past a capacity or duplicate check. Resolves true if the
 * petal was added, false if rejected (duplicate or full). The
 * confirmed change reaches local state via listenToFlower's next
 * snapshot, not by mutating `layers` here directly.
 */
export async function addPetalRemote(flowerId, videoId, layer = "outer") {
  if (!isValidFlowerId(flowerId)) return false;
  if (typeof videoId !== "string" || !videoId) return false;
  if (!isValidLayer(layer)) return false;
  try {
    return await transactionalMutate(flowerId, (current) => {
      const onAnyLayer = LAYERS.some((l) => current[l].includes(videoId));
      if (onAnyLayer) return false;
      if (current[layer].length >= LAYER_CAPACITY[layer]) return false;
      current[layer].push(videoId);
      return true;
    });
  } catch (error) {
    console.error(`gardenFlowers.js: failed to add petal to ${flowerId}:`, error);
    return false;
  }
}

/** Firestore-backed remove. Resolves true if removed, false if not found on any layer. */
export async function removePetalRemote(flowerId, videoId) {
  if (!isValidFlowerId(flowerId)) return false;
  if (typeof videoId !== "string" || !videoId) return false;
  try {
    return await transactionalMutate(flowerId, (current) => {
      const layer = LAYERS.find((l) => current[l].includes(videoId));
      if (!layer) return false;
      current[layer] = current[layer].filter((id) => id !== videoId);
      return true;
    });
  } catch (error) {
    console.error(`gardenFlowers.js: failed to remove petal from ${flowerId}:`, error);
    return false;
  }
}

/** Firestore-backed move. Resolves true if moved, false if rejected (not found, same layer, or target full). */
export async function movePetalRemote(flowerId, videoId, toLayer) {
  if (!isValidFlowerId(flowerId)) return false;
  if (typeof videoId !== "string" || !videoId) return false;
  if (!isValidLayer(toLayer)) return false;
  try {
    return await transactionalMutate(flowerId, (current) => {
      const fromLayer = LAYERS.find((l) => current[l].includes(videoId));
      if (!fromLayer || fromLayer === toLayer) return false;
      if (current[toLayer].length >= LAYER_CAPACITY[toLayer]) return false;
      current[fromLayer] = current[fromLayer].filter((id) => id !== videoId);
      current[toLayer].push(videoId);
      return true;
    });
  } catch (error) {
    console.error(`gardenFlowers.js: failed to move petal in ${flowerId}:`, error);
    return false;
  }
}
