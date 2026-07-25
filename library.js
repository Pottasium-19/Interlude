// library.js
// Single responsibility: a persistent, per-user personal library of
// saved YouTube video IDs, backed by Firestore at
// libraries/{userId}/songs/{videoId}. No DOM — state changes are
// reported through the listener passed to listen(); callers own the UI.

import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import { db } from "./firebase.js";
import { extractVideoId } from "./youtubeUtils.js";
import { getUserId } from "./room.js";

// Local cache of the last snapshot, kept in sync via onSnapshot. Lets
// has()/getAll() answer synchronously and lets add() reject duplicates
// without an extra round trip.
let cachedSongs = [];
let unsubscribe = null;

function songsCollectionRef() {
  return collection(db, "libraries", getUserId(), "songs");
}

/**
 * Starts listening to this user's library in Firestore. `onChange` is
 * called with the current array of songs (each `{ videoId, addedAt }`,
 * oldest first) immediately on first load, and again on every
 * subsequent change — whether it came from this tab, another tab, or
 * another device signed in as the same user.
 *
 * Safe to call once at page load. Calling it again replaces the
 * previous listener rather than stacking a second one. Returns a stop
 * function (also available as stopListening()).
 */
export function listen(onChange) {
  if (unsubscribe) unsubscribe();

  unsubscribe = onSnapshot(
    songsCollectionRef(),
    (snapshot) => {
      cachedSongs = snapshot.docs
        .map((docSnap) => ({
          videoId: docSnap.id,
          addedAt: docSnap.data().addedAt || null
        }))
        .sort((a, b) => toMillis(a.addedAt) - toMillis(b.addedAt));
      onChange(getAll());
    },
    (error) => console.error("library.js: listener error:", error)
  );

  return unsubscribe;
}

/** Stops the live listener started by listen(). No-op if not listening. */
export function stopListening() {
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
}

/**
 * Adds a song from a raw YouTube URL (or bare 11-char video ID) to the
 * library. Resolves to:
 *   - { ok: true, videoId }
 *   - { ok: false, reason: "invalid" }   — couldn't parse a video ID
 *   - { ok: false, reason: "duplicate" } — already in the library
 *   - { ok: false, reason: "error" }     — Firestore write failed
 *
 * The library listener (if running) will report the addition through
 * its own callback once Firestore confirms it — this function's
 * return value is just for immediate UI feedback (e.g. an error message).
 */
export async function add(rawInput) {
  const videoId = extractVideoId(rawInput);
  if (!videoId) return { ok: false, reason: "invalid" };
  if (has(videoId)) return { ok: false, reason: "duplicate" };

  try {
    // Deterministic doc ID (the video ID itself) means a duplicate add
    // — even one that slips past the cache check above, e.g. a race
    // with another tab — safely overwrites the same document rather
    // than creating a second entry.
    await setDoc(doc(songsCollectionRef(), videoId), {
      videoId,
      addedAt: serverTimestamp()
    });
    return { ok: true, videoId };
  } catch (error) {
    console.error("library.js: failed to add song:", error);
    return { ok: false, reason: "error" };
  }
}

export async function remove(videoId) {
  if (typeof videoId !== "string" || !videoId) return { ok: false, reason: "invalid" };
  try {
    await deleteDoc(doc(songsCollectionRef(), videoId));
    return { ok: true, videoId };
  } catch (error) {
    console.error("library.js: failed to remove song:", error);
    return { ok: false, reason: "error" };
  }
}

/** Returns true if `videoId` is in the (cached) library. */
export function has(videoId) {
  return cachedSongs.some((song) => song.videoId === videoId);
}

/** Returns a copy of the currently cached library songs. */
export function getAll() {
  return cachedSongs.slice();
}

function toMillis(timestamp) {
  if (!timestamp) return 0;
  return timestamp.toMillis ? timestamp.toMillis() : timestamp;
}
