// main.js
// Single responsibility: orchestrate the other modules. No Firestore
// calls and no direct DOM access happen here — this file just wires
// room.js + sync.js (data) to ui.js (presentation).

import { syncServerTimeOffset, getCorrectedNow } from "./clock.js";
import {
  claimSlot,
  listenToRoom,
  listenToPresence,
  startHeartbeat,
  isPresenceStale,
  claimHostIfVacant,
  releaseSlot,
  releaseStaleSlot,
  clearStoredSlot
} from "./room.js";
import {
  setReady,
  listenToReady,
  scheduleCountdown,
  listenToSync,
  resetReadyAndCountdown,
  setPlayerAction,
  listenToPlayer
} from "./sync.js";
import {
  renderConnectionStatus,
  renderReadyStatus,
  renderCountdown,
  renderPlayerState,
  renderLastAction,
bindReadyButton,
  bindPlayerControls,
  bindLeaveButton,
  bindJoinButton,
  setControlsEnabled,
  setJoinedState,
  setJoinButtonEnabled,
  renderLibrary,
  renderLibraryMessage,
  bindLibraryAdd
} from "./ui.js";
import { listen as listenToLibrary, add as addToLibrary, remove as removeFromLibrary } from "./library.js";

import { initPlayer, loadVideoById, play as playVideo, pause as pauseVideo } from "./youtube.js";
import {
  syncWith as queueSyncWith,
  current as queueCurrent,
  next as queueNext,
  previous as queuePrevious
} from "./queue.js";

let mySlot = null;
let myUserId = null;
let myCurrentlyReady = false;
let otherConnected = false;
let bothReadyHandled = false;
let lastHandledCountdownId = null;
let lastHandledActionId = null;
let countdownIntervalId = null;
let currentHostId = null;
let otherUserId = null;
let stopHeartbeat = null;
let stopPresenceListener = null;
let stopRoomListener = null;
let stopReadyListener = null;
let stopSyncListener = null;
let stopPlayerListener = null;
let staleCheckIntervalId = null;
let joining = false;
let playerReadyPromise = null;
let lastLoadedVideoId = null;

// Fresh per page load — never persisted — so a stale tab (bfcache,
// suspended background tab) can be told apart from the current one.
const mySessionId = crypto.randomUUID();

function init() {
  renderConnectionStatus("Not connected");

  // The personal library only needs this browser's stable anonymous
  // user id (see room.js:getUserId) — not a claimed room slot — so it
  // loads independently of joining the room, right on page load.
  initLibrary();

  // Static UI wiring — bound once here, not inside joinRoom(), since
  // joinRoom() can run again after Leave Room without a page refresh
  // and must not stack duplicate listeners on these buttons.
  bindJoinButton(joinRoom);
  bindLeaveButton(handleLeaveRoom);
  bindReadyButton(async () => {
    await setReady(mySlot, !myCurrentlyReady);
  });
  bindPlayerControls({
    play: () => setPlayerAction("play", mySlot),
    pause: () => setPlayerAction("pause", mySlot),
    previous: () => setPlayerAction("previous", mySlot),
    next: () => setPlayerAction("next", mySlot)
  });
}

/**
 * Connects this browser to the shared room: claims a slot, starts
 * presence/heartbeat, and attaches every Firestore listener that
 * drives sync. Runs only on Join Room click — never automatically on
 * page load. handleLeaveRoom() tears down everything started here, so
 * this can safely run again afterward without a refresh.
 */
async function joinRoom() {
  if (joining || mySlot) return;
  joining = true;
  setJoinButtonEnabled(false);
  renderConnectionStatus("Connecting...");

  // Align this device's clock with Firestore's before anything else,
  // since the countdown depends on it.
  await syncServerTimeOffset();

  try {
    const claimed = await claimSlot();
    myUserId = claimed.userId;
    mySlot = claimed.slot;
  } catch (error) {
    if (error.message === "ROOM_FULL") {
      renderConnectionStatus("Room is full — only two users are supported.");
    } else {
      console.error("Failed to join room:", error);
      renderConnectionStatus("Connection error. Please try again.");
    }
    joining = false;
    setJoinButtonEnabled(true);
    return;
  }

  const otherSlot = mySlot === "user1" ? "user2" : "user1";

  // Presence: heartbeat for this user, listener for the other user.
  stopHeartbeat = startHeartbeat(myUserId, mySlot, mySessionId);
  stopPresenceListener = listenToPresence(otherSlot, (presence) => {
    otherUserId = presence ? presence.userId : null;
    otherConnected = !!presence && presence.connected && !isPresenceStale(presence.lastSeen);
    refreshConnectionLabel();
    maybeTakeOverHost();
  });
  // Re-check staleness on a timer too, in case the other user's tab
  // died without ever writing a "disconnected" flag. This is also what
  // notices a stale host and triggers failover even with no new snapshot.
  staleCheckIntervalId = setInterval(() => {
    refreshConnectionLabel();
    maybeTakeOverHost();
    if (!otherConnected) {
      releaseStaleSlot(otherSlot).catch((error) =>
        console.error("Stale slot release failed:", error)
      );
    }
  }, 5000);

  stopRoomListener = listenToRoom((roomData) => {
    currentHostId = roomData ? roomData.hostId : null;
    if (!roomData || !roomData.user1Id || !roomData.user2Id) {
      renderConnectionStatus("Waiting for second user...");
    } else {
      refreshConnectionLabel();
    }
  });

  stopReadyListener = listenToReady((readyData) => {
    myCurrentlyReady = renderReadyStatus(readyData, mySlot);
    maybeScheduleCountdown(readyData);
  });

  stopSyncListener = listenToSync((syncData) => handleSyncUpdate(syncData));

  stopPlayerListener = listenToPlayer((playerData) => {
    renderPlayerState(playerData.playbackState || "waiting");
    renderLastAction(playerData.lastAction, playerData.actionBy);

    if (playerData.actionId && playerData.actionId !== lastHandledActionId) {
      lastHandledActionId = playerData.actionId;
      // Future: trigger the real playback side effect here.
    }
  });

  joining = false;
  setJoinedState(true);
}

const LIBRARY_MESSAGES = {
  invalid: "That doesn't look like a valid YouTube link.",
  duplicate: "That song is already in your library.",
  error: "Couldn't save that song — please try again."
};

function initLibrary() {
  listenToLibrary((songs) => {
    renderLibrary(songs, async (videoId) => {
      await removeFromLibrary(videoId);
    });
    queueSyncWith(songs.map((song) => song.videoId));
  });

  bindLibraryAdd(async (rawInput) => {
    if (!rawInput || !rawInput.trim()) return;
    const result = await addToLibrary(rawInput);
    renderLibraryMessage(result.ok ? "" : LIBRARY_MESSAGES[result.reason] || "");
  });
}

function refreshConnectionLabel() {
  renderConnectionStatus(otherConnected ? "Both connected" : "Waiting for second user...");
}

async function handleLeaveRoom() {
  if (stopHeartbeat) {
    stopHeartbeat();
    stopHeartbeat = null;
  }
  if (staleCheckIntervalId) {
    clearInterval(staleCheckIntervalId);
    staleCheckIntervalId = null;
  }
  if (countdownIntervalId) {
    clearInterval(countdownIntervalId);
    countdownIntervalId = null;
  }
  [stopPresenceListener, stopRoomListener, stopReadyListener, stopSyncListener, stopPlayerListener].forEach(
    (stop) => stop && stop()
  );
  stopPresenceListener = null;
  stopRoomListener = null;
  stopReadyListener = null;
  stopSyncListener = null;
  stopPlayerListener = null;

  try {
    if (mySlot && myUserId) {
      await releaseSlot(mySlot, myUserId);
    }
  } catch (error) {
    console.error("Leave room failed:", error);
  }
  clearStoredSlot();

  // Reset room-scoped state so joinRoom() can run again without a
  // page refresh.
  mySlot = null;
  myUserId = null;
  myCurrentlyReady = false;
  otherConnected = false;
  bothReadyHandled = false;
  lastHandledCountdownId = null;
  lastHandledActionId = null;
  currentHostId = null;
  otherUserId = null;

  renderConnectionStatus("Not connected");
  renderReadyStatus({ user1Ready: false, user2Ready: false }, "user1");
  renderCountdown("");
  setJoinedState(false);
  setJoinButtonEnabled(true);
}


/**
 * When both users are ready, exactly the current host writes the shared
 * countdown start time. This avoids both clients racing to write
 * slightly different timestamps. If the host is briefly offline, the
 * countdown simply won't start until either they reconnect or
 * maybeTakeOverHost() promotes the other user — the safer failure mode
 * either way.
 */
async function maybeScheduleCountdown(readyData) {
  const bothReady = !!readyData.user1Ready && !!readyData.user2Ready;
  if (bothReady && !bothReadyHandled) {
    bothReadyHandled = true;
    if (myUserId === currentHostId) {
      await scheduleCountdown();
    }
  } else if (!bothReady) {
    bothReadyHandled = false;
  }
}

/**
 * If the current host's presence has gone stale, the other (connected)
 * user promotes themselves to host. Safe to call repeatedly — it's a
 * no-op unless I'm not already host and the host I last observed is
 * the one that's gone stale.
 */
async function maybeTakeOverHost() {
  const iAmHost = currentHostId === myUserId;
  const hostIsTheOtherUser = currentHostId === otherUserId;
  if (iAmHost || !hostIsTheOtherUser) return;
  if (otherConnected) return; // host still alive, nothing to do

  try {
    currentHostId = await claimHostIfVacant(myUserId, currentHostId);
  } catch (error) {
    console.error("Host takeover failed:", error);
  }
}

function handleSyncUpdate(syncData) {
  if (!syncData || !syncData.active || !syncData.countdownStartAt) return;
  if (syncData.countdownId === lastHandledCountdownId) return; // already running this one
  lastHandledCountdownId = syncData.countdownId;
  runCountdown(syncData.countdownStartAt);
}

async function handlePlayerAction(playerData) {
  try {
    await playerReadyPromise;
    if (playerData.videoId && playerData.videoId !== lastLoadedVideoId) {
      lastLoadedVideoId = playerData.videoId;
      loadVideoById(playerData.videoId);
    }
    if (playerData.lastAction === "play") playVideo();
    else if (playerData.lastAction === "pause") pauseVideo();
    else if (playerData.lastAction === "previous" || playerData.lastAction === "next") playVideo();
  } catch (error) {
    console.error("Playback side effect failed:", error);
  }
}

function runCountdown(startAtMillis) {
  if (countdownIntervalId) clearInterval(countdownIntervalId);

  countdownIntervalId = setInterval(() => {
    const remainingMs = startAtMillis - getCorrectedNow();
    const secondsLeft = Math.ceil(remainingMs / 1000);

    if (remainingMs <= 0) {
      renderCountdown("GO");
      clearInterval(countdownIntervalId);
      countdownIntervalId = null;
      const currentVideoId = queueCurrent();
      if (currentVideoId) {
        setPlayerAction("play", mySlot, currentVideoId).catch((error) =>
          console.error("Failed to start playback:", error)
        );
      }
      setTimeout(async () => {
        renderCountdown("");
        await resetReadyAndCountdown();
        bothReadyHandled = false;
      }, 1000);
    } else if (secondsLeft <= 3) {
      renderCountdown(String(secondsLeft));
    }
  }, 100);
}

init();
