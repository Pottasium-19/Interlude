// sync.js
// Single responsibility: the actual synchronization primitives —
// ready state, the shared countdown, and the shared player state.
// This is the "heart" of the app; it knows nothing about UI or DOM.

import { db } from "./firebase.js";
import {
  doc,
  setDoc,
  getDoc,
  onSnapshot,
  runTransaction
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getCorrectedNow } from "./clock.js";

const ROOM_ID = "main-room";
const COUNTDOWN_LEAD_MS = 3000; // countdown starts 3s in the future

const readyDocRef = doc(db, "rooms", ROOM_ID, "state", "ready");
const syncDocRef = doc(db, "rooms", ROOM_ID, "state", "sync");
const playerDocRef = doc(db, "rooms", ROOM_ID, "state", "player");
const queueDocRef = doc(db, "rooms", ROOM_ID, "state", "queue");

// ---------------------------------------------------------------------
// Ready system
// ---------------------------------------------------------------------

export async function setReady(slot, isReady) {
  await setDoc(readyDocRef, { [`${slot}Ready`]: isReady }, { merge: true });
}

export function listenToReady(callback) {
  return onSnapshot(
    readyDocRef,
    (snap) =>
      callback(snap.exists() ? snap.data() : { user1Ready: false, user2Ready: false }),
    (error) => console.error("Ready listener error:", error)
  );
}

// ---------------------------------------------------------------------
// Shared countdown
// ---------------------------------------------------------------------

/**
 * Schedules a countdown to a shared future timestamp (corrected for
 * clock offset). Both clients read this same timestamp back and run
 * their own local countdown against it, so "GO" lands at the same
 * real-world instant regardless of network latency.
 *
 * Writing this again with a new countdownId is safe/idempotent — the
 * last write wins, and every client reacts only to the countdownId
 * they haven't already handled (see main.js).
 */
export async function scheduleCountdown() {
  const countdownId = crypto.randomUUID();
  const startAt = getCorrectedNow() + COUNTDOWN_LEAD_MS;
  await setDoc(
    syncDocRef,
    { countdownStartAt: startAt, countdownId, active: true },
    { merge: true }
  );
  return countdownId;
}

export function listenToSync(callback) {
  return onSnapshot(
    syncDocRef,
    (snap) => callback(snap.exists() ? snap.data() : null),
    (error) => console.error("Sync listener error:", error)
  );
}

/** Resets ready flags and marks the countdown inactive after it completes. */
export async function resetReadyAndCountdown() {
  await setDoc(readyDocRef, { user1Ready: false, user2Ready: false }, { merge: true });
  await setDoc(syncDocRef, { active: false }, { merge: true });
}

// ---------------------------------------------------------------------
// Shared player state (no media playback yet — state only)
// ---------------------------------------------------------------------

const ACTION_TO_STATE = { play: "playing", pause: "paused", previous: "playing", next: "playing" };

export async function setPlayerAction(action, slot, videoId) {
  const update = {
    lastAction: action,
    actionBy: slot,
    actionAt: getCorrectedNow(),
    actionId: crypto.randomUUID()
  };
  if (ACTION_TO_STATE[action]) {
    update.playbackState = ACTION_TO_STATE[action];
  }
  if (videoId) {
    update.videoId = videoId;
  }
  await setDoc(playerDocRef, update, { merge: true });
}

export function listenToPlayer(callback) {
  return onSnapshot(
    playerDocRef,
    (snap) => callback(snap.exists() ? snap.data() : { playbackState: "waiting" }),
    (error) => console.error("Player listener error:", error)
  );
}

export async function getInitialPlayerState() {
  const snap = await getDoc(playerDocRef);
  return snap.exists() ? snap.data() : { playbackState: "waiting" };
}

export async function setMyQueueSongs(slot, videoIds) {
  await setDoc(queueDocRef, { [`${slot}Songs`]: videoIds }, { merge: true });
}

export function listenToQueue(callback) {
  return onSnapshot(
    queueDocRef,
    (snap) => callback(snap.exists() ? snap.data() : { user1Songs: [], user2Songs: [] }),
    (error) => console.error("Queue listener error:", error)
  );
}

// ---------------------------------------------------------------------
// Queue regeneration (seed) — reached the end of the current queue
// ---------------------------------------------------------------------

/**
 * Transactional compare-and-swap on the sync doc's (queueSeed,
 * queueIndex): only writes the new seed if the doc still shows the
 * (currentSeed, currentIndex) the caller last observed. If another
 * client already advanced it first, this is a no-op that resolves
 * false — the race-condition guard that keeps the queue from
 * regenerating twice when both devices detect the last song ending
 * near-simultaneously.
 */
export async function advanceQueueIfAtEnd(currentSeed, currentIndex, newSeed) {
  try {
    return await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(syncDocRef);
      const data = snap.exists() ? snap.data() : {};
      const existingSeed = data.queueSeed ?? null;
      const existingIndex = data.queueIndex ?? null;
      const seedToMatch = currentSeed ?? null;
      const indexToMatch = currentIndex ?? null;
      if (existingSeed !== seedToMatch || existingIndex !== indexToMatch) {
        return false;
      }
      transaction.set(syncDocRef, { queueSeed: newSeed, queueIndex: 0 }, { merge: true });
      return true;
    });
  } catch (error) {
    console.error("Failed to advance queue seed:", error);
    return false;
  }
}

/** Persists the current position within the (already-agreed) queue, e.g. after Next/Previous. */
export async function setQueueIndex(index) {
  await setDoc(syncDocRef, { queueIndex: index }, { merge: true });
}

// ---------------------------------------------------------------------
// Playback drift correction
// ---------------------------------------------------------------------

/** Reports this device's current playback position, for the other client's drift check. */
export async function reportPlaybackPosition(slot, positionSeconds) {
  await setDoc(
    playerDocRef,
    { position: positionSeconds, positionAt: getCorrectedNow(), positionBy: slot },
    { merge: true }
  );
}

/**
 * Marks whether this device has actually started playing the real
 * video (as opposed to still buffering or on an ad). Both flags
 * together are what lets the app tell "one side is behind on an ad"
 * apart from "both sides are genuinely in sync."
 */
export async function setPlayingState(slot, isPlayingActualVideo) {
  await setDoc(playerDocRef, { [`${slot}Playing`]: isPlayingActualVideo }, { merge: true });
}
