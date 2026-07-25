// clock.js
// Single responsibility: estimate the offset between this device's clock
// and Firestore's server clock, so both users can compute the same
// "future" moment even if their local clocks are off.
//
// Without this, two phones with clocks 4 seconds apart would run the
// countdown at different real-world moments even though they agree on
// the same stored timestamp.

import { db } from "./firebase.js";
import {
  doc,
  setDoc,
  getDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const CLOCK_DOC_REF = doc(db, "rooms/main-room/meta/clockSync");

let cachedOffsetMs = 0;

/**
 * Measures (server time - local time) using a round-trip write/read.
 * Call this once on startup. Safe to call again later to re-sync.
 */
export async function syncServerTimeOffset() {
  try {
    const localBefore = Date.now();
    await setDoc(CLOCK_DOC_REF, { pingAt: serverTimestamp() });
    const snap = await getDoc(CLOCK_DOC_REF);
    const localAfter = Date.now();

    const data = snap.data();
    if (data && data.pingAt) {
      const serverMillis = data.pingAt.toMillis();
      const roundTripMs = localAfter - localBefore;
      // Assume the server timestamp was taken roughly halfway through the round trip.
      const estimatedLocalAtServerWrite = localBefore + roundTripMs / 2;
      cachedOffsetMs = serverMillis - estimatedLocalAtServerWrite;
    }
  } catch (error) {
    console.error("Clock sync failed, falling back to zero offset:", error);
    cachedOffsetMs = 0;
  }
  return cachedOffsetMs;
}

/** Returns "now" adjusted to align with Firestore's server clock. */
export function getCorrectedNow() {
  return Date.now() + cachedOffsetMs;
}
