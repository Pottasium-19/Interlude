// room.js
// Single responsibility: manage membership in the one shared room —
// claiming a user slot, tracking presence (connected/disconnected),
// and supporting automatic reconnection after a refresh or dropped
// connection.

import {
  doc,
  runTransaction,
  setDoc,
  onSnapshot,
  serverTimestamp,
  deleteField
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import { db } from "./firebase.js";

const ROOM_ID = "main-room";
const HEARTBEAT_INTERVAL_MS = 5000;
const STALE_THRESHOLD_MS = 15000; // no heartbeat for this long = treat as disconnected

// Bumped whenever the sync protocol (doc shapes, field meanings) changes
// in a way that isn't backward compatible. Clients can compare their own
// version against the other user's (see presence doc) to warn on mismatch.
export const ENGINE_VERSION = "1.1.0";

const roomDocRef = doc(db, "rooms", ROOM_ID);

/** Gets (or creates) a stable anonymous ID for this browser. */
function getStoredUserId() {
  let id = localStorage.getItem("interlude_userId");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("interlude_userId", id);
  }
  return id;
}

function getStoredSlot() {
  return localStorage.getItem("interlude_slot");
}

function storeSlot(slot) {
  localStorage.setItem("interlude_slot", slot);
}

export function clearStoredSlot() {
  localStorage.removeItem("interlude_slot");
}

/**
 * Claims a slot ("user1" or "user2") in the shared room.
 *
 * On reconnect (refresh, dropped network), the same browser will reclaim
 * its previous slot instead of being treated as a new user, because the
 * slot + userId pair is persisted in localStorage and cross-checked
 * against what's stored in Firestore.
 *
 * Throws an Error with message "ROOM_FULL" if a third distinct browser
 * tries to join.
 */
export async function claimSlot() {
  const userId = getStoredUserId();
  const existingSlot = getStoredSlot();

  const slot = await runTransaction(db, async (tx) => {
    const snap = await tx.get(roomDocRef);
    const data = snap.exists() ? snap.data() : {};

    // Reconnect case: this browser already owns a slot in Firestore.
    if (existingSlot && data[`${existingSlot}Id`] === userId) {
      return existingSlot;
    }

    // Already claimed under a different key than expected (defensive check).
    if (data.user1Id === userId) return "user1";
    if (data.user2Id === userId) return "user2";

    // All tx reads must happen before any tx writes, so resolve presence
    // staleness for both slots up front.
    const user1PresenceSnap = data.user1Id
      ? await tx.get(doc(db, "rooms", ROOM_ID, "presence", "user1"))
      : null;
    const user2PresenceSnap = data.user2Id
      ? await tx.get(doc(db, "rooms", ROOM_ID, "presence", "user2"))
      : null;

    const user1Stale =
      !!data.user1Id &&
      (!user1PresenceSnap.exists() || isPresenceStale(user1PresenceSnap.data().lastSeen));
    const user2Stale =
      !!data.user2Id &&
      (!user2PresenceSnap.exists() || isPresenceStale(user2PresenceSnap.data().lastSeen));

    // Try to claim the first open (or abandoned) slot. The first user to
    // ever create the room also becomes the initial host (see
    // claimHostIfVacant for how that responsibility transfers later if
    // they disconnect).
    if (!data.user1Id || user1Stale) {
      tx.set(
        roomDocRef,
        {
          user1Id: userId,
          createdAt: data.createdAt || serverTimestamp(),
          hostId: user1Stale ? userId : data.hostId || userId
        },
        { merge: true }
      );
      return "user1";
    }

    if (!data.user2Id || user2Stale) {
      tx.set(roomDocRef, { user2Id: userId }, { merge: true });
      return "user2";
    }

    throw new Error("ROOM_FULL");
  });

  storeSlot(slot);
  return { userId, slot };
}

/**
 * Transfers host responsibility to `myUserId`, but only if the current
 * host is `currentHostId` — i.e. only if nothing has changed the host
 * since the caller last observed it. This prevents two clients racing
 * to both "rescue" the host role at once from stomping each other.
 *
 * The caller (main.js) is responsible for deciding *when* a takeover is
 * warranted (host's presence is stale) — this function only performs
 * the write safely.
 */
export async function claimHostIfVacant(myUserId, currentHostId) {
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(roomDocRef);
    const data = snap.exists() ? snap.data() : {};

    if (data.hostId === myUserId) return myUserId; // already host, nothing to do
    if (data.hostId !== currentHostId) return data.hostId; // stale info, someone already handled it

    tx.set(roomDocRef, { hostId: myUserId }, { merge: true });
    return myUserId;
  });
}

/**
 * Releases MY slot (Leave Room). Only releases if this browser's userId
 * still actually owns that slot — no-op otherwise, so a stale/duplicate
 * call can't clobber someone else. Reassigns host to the remaining user
 * if I was host.
 */
export async function releaseSlot(slot, userId) {
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(roomDocRef);
    if (!snap.exists()) return;
    const data = snap.data();
    if (data[`${slot}Id`] !== userId) return;

    const otherSlot = slot === "user1" ? "user2" : "user1";
    const update = { [`${slot}Id`]: deleteField() };
    if (data.hostId === userId) {
      update.hostId = data[`${otherSlot}Id`] || deleteField();
    }
    tx.set(roomDocRef, update, { merge: true });
  });
}

/**
 * Peer-side cleanup: if `slot`'s presence has gone stale (closed browser,
 * lost internet, crash — never called releaseSlot), free it. Re-checks
 * inside the transaction so it's safe to call from a timer.
 */
export async function releaseStaleSlot(slot) {
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(roomDocRef);
    if (!snap.exists()) return;
    const data = snap.data();
    if (!data[`${slot}Id`]) return;

    const presenceSnap = await tx.get(doc(db, "rooms", ROOM_ID, "presence", slot));
    const stale = !presenceSnap.exists() || isPresenceStale(presenceSnap.data().lastSeen);
    if (!stale) return;

    const otherSlot = slot === "user1" ? "user2" : "user1";
    const update = { [`${slot}Id`]: deleteField() };
    if (data.hostId === data[`${slot}Id`]) {
      update.hostId = data[`${otherSlot}Id`] || deleteField();
    }
    tx.set(roomDocRef, update, { merge: true });
  });
}

/** Listens to the top-level room document (which slots are claimed). */
export function listenToRoom(callback) {
  return onSnapshot(
    roomDocRef,
    (snap) => callback(snap.exists() ? snap.data() : null),
    (error) => console.error("Room listener error:", error)
  );
}

/** Listens to a specific user's presence doc. */
export function listenToPresence(slot, callback) {
  const presenceRef = doc(db, "rooms", ROOM_ID, "presence", slot);
  return onSnapshot(
    presenceRef,
    (snap) => callback(snap.exists() ? snap.data() : null),
    (error) => console.error("Presence listener error:", error)
  );
}

/**
 * Starts a periodic heartbeat that marks this user as connected.
 *
 * `sessionId` should be a fresh crypto.randomUUID() generated once per
 * page load (NOT persisted to localStorage). It's stamped on every
 * heartbeat so that if an old tab's timers somehow survive a reload
 * (bfcache, suspended background tab) their writes are identifiable as
 * belonging to a superseded session rather than silently look current.
 *
 * Returns a stop function that should be called on teardown.
 */
export function startHeartbeat(userId, slot, sessionId) {
  const presenceRef = doc(db, "rooms", ROOM_ID, "presence", slot);

  const beat = async () => {
    try {
      await setDoc(
        presenceRef,
        {
          userId,
          connected: true,
          lastSeen: serverTimestamp(),
          sessionId,
          engineVersion: ENGINE_VERSION
        },
        { merge: true }
      );
    } catch (error) {
      console.error("Heartbeat failed:", error);
    }
  };

  beat(); // immediate first beat so status updates without delay
  const intervalId = setInterval(beat, HEARTBEAT_INTERVAL_MS);

  // Best-effort: mark disconnected on tab close. Not guaranteed to fire,
  // which is exactly why the staleness check below exists as a fallback.
  const handleUnload = () => {
    setDoc(presenceRef, { connected: false }, { merge: true }).catch(() => {});
  };
  window.addEventListener("beforeunload", handleUnload);

  return () => {
    clearInterval(intervalId);
    window.removeEventListener("beforeunload", handleUnload);
  };
}

/**
 * A presence doc is considered stale (i.e., the user is effectively
 * disconnected) if its lastSeen timestamp is older than the threshold.
 * This covers silent disconnects where beforeunload never fires
 * (lost internet, app killed, laptop closed).
 */
export function isPresenceStale(lastSeenTimestamp) {
  if (!lastSeenTimestamp) return true;
  const lastSeenMillis = lastSeenTimestamp.toMillis
    ? lastSeenTimestamp.toMillis()
    : lastSeenTimestamp;
  return Date.now() - lastSeenMillis > STALE_THRESHOLD_MS;
}

export const ROOM_ID_EXPORT = ROOM_ID;
