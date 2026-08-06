// library.js
// Single responsibility: a persistent personal library of saved
// YouTube video IDs, backed by Firestore at
// libraries/{flowerId}/songs/{videoId}. Keyed by flowerId ("pink" |
// "lavender"), not by room/session identity — a library is reachable
// and editable independent of room join state. No DOM.

import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import { db } from "./firebase.js";
import { extractVideoId, fetchVideoTitle } from "./youtubeUtils.js";
// No room.js import — a flower's library must not depend on room/session identity.

const FLOWER_IDS = ["pink", "lavender"];

function isValidFlowerId(flowerId) {
  return FLOWER_IDS.includes(flowerId);
}

// Local cache of the last snapshot per flower, kept in sync via
// onSnapshot. Lets has()/getAll() answer synchronously and lets add()
// reject duplicates without an extra round trip.
let cachedSongs = { pink: [], lavender: [] };
let unsubscribes = { pink: null, lavender: null };

function songsCollectionRef(flowerId) {
  return collection(db, "libraries", flowerId, "songs");
}

/**
 * Starts listening to `flowerId`'s library in Firestore. `onChange` is
 * called with the current array of songs (each `{ videoId, addedAt,
 * title }`, oldest first) immediately on first load, and again on
 * every subsequent change.
 *
 * Safe to call once per flowerId. Calling it again for the same
 * flowerId replaces its previous listener rather than stacking a
 * second one. The pink and lavender listeners are independent.
 * Returns a stop function (also available as stopListening(flowerId)).
 */
export function listen(flowerId, onChange) {
  if (!isValidFlowerId(flowerId)) return () => {};
  if (unsubscribes[flowerId]) unsubscribes[flowerId]();

  unsubscribes[flowerId] = onSnapshot(
    songsCollectionRef(flowerId),
    (snapshot) => {
      cachedSongs[flowerId] = snapshot.docs
        .map((docSnap) => ({
          videoId: docSnap.id,
          addedAt: docSnap.data().addedAt || null,
          title: docSnap.data().title || null
        }))
        .sort((a, b) => toMillis(a.addedAt) - toMillis(b.addedAt));
      onChange(getAll(flowerId));
    },
    (error) => console.error(`library.js: listener error (${flowerId}):`, error)
  );

  return unsubscribes[flowerId];
}

/** Stops the live listener started by listen(flowerId). No-op if not listening. */
export function stopListening(flowerId) {
  if (!isValidFlowerId(flowerId)) return;
  if (unsubscribes[flowerId]) {
    unsubscribes[flowerId]();
    unsubscribes[flowerId] = null;
  }
}

/**
 * Adds a song from a raw YouTube URL (or bare 11-char video ID) to
 * `flowerId`'s library. Resolves to:
 *   - { ok: true, videoId }
 *   - { ok: false, reason: "invalid" }   — couldn't parse a video ID
 *   - { ok: false, reason: "duplicate" } — already in the library
 *   - { ok: false, reason: "error" }     — Firestore write failed
 *
 * The library listener (if running) reports the addition through its
 * own callback once Firestore confirms it — this return value is just
 * for immediate UI feedback.
 */
export async function add(flowerId, rawInput) {
  if (!isValidFlowerId(flowerId)) return { ok: false, reason: "invalid" };
  const videoId = extractVideoId(rawInput);
  if (!videoId) return { ok: false, reason: "invalid" };
  if (has(flowerId, videoId)) return { ok: false, reason: "duplicate" };

  // Best-effort title fetch — never blocks the add on failure; the song
  // is still fully usable by ID alone if this comes back null.
  const title = await fetchVideoTitle(videoId);

  try {
    // Deterministic doc ID (the video ID itself) means a duplicate add
    // — even one that slips past the cache check above, e.g. a race
    // with another tab — safely overwrites the same document rather
    // than creating a second entry.
    const payload = { videoId, addedAt: serverTimestamp() };
    if (title) payload.title = title;
    await setDoc(doc(songsCollectionRef(flowerId), videoId), payload);
    return { ok: true, videoId };
  } catch (error) {
    console.error(`library.js: failed to add song (${flowerId}):`, error);
    return { ok: false, reason: "error" };
  }
}

export async function remove(flowerId, videoId) {
  if (!isValidFlowerId(flowerId)) return { ok: false, reason: "invalid" };
  if (typeof videoId !== "string" || !videoId) return { ok: false, reason: "invalid" };
  try {
    await deleteDoc(doc(songsCollectionRef(flowerId), videoId));
    return { ok: true, videoId };
  } catch (error) {
    console.error(`library.js: failed to remove song (${flowerId}):`, error);
    return { ok: false, reason: "error" };
  }
}

/** Returns true if `videoId` is in `flowerId`'s (cached) library. */
export function has(flowerId, videoId) {
  if (!isValidFlowerId(flowerId)) return false;
  return cachedSongs[flowerId].some((song) => song.videoId === videoId);
}

/** Returns a copy of `flowerId`'s currently cached library songs. */
export function getAll(flowerId) {
  if (!isValidFlowerId(flowerId)) return [];
  return cachedSongs[flowerId].slice();
}

function toMillis(timestamp) {
  if (!timestamp) return 0;
  return timestamp.toMillis ? timestamp.toMillis() : timestamp;
}
