// sync.js
// Single responsibility: the actual synchronization primitives —
// ready state, the shared countdown, and the shared player state.
// This is the "heart" of the app; it knows nothing about UI or DOM.

import { db } from "./firebase.js";
import {
  doc,
  setDoc,
  getDoc,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getCorrectedNow } from "./clock.js";

const ROOM_ID = "main-room";
const COUNTDOWN_LEAD_MS = 3000; // countdown starts 3s in the future

const readyDocRef = doc(db, "rooms", ROOM_ID, "state", "ready");
const syncDocRef = doc(db, "rooms", ROOM_ID, "state", "sync");
const playerDocRef = doc(db, "rooms", ROOM_ID, "state", "player");

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

const ACTION_TO_STATE = { play: "playing", pause: "paused" };

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
