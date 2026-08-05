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
  clearStoredSlot,
  hasStoredSlot
} from "./room.js";
import {
  setReady,
  listenToReady,
  scheduleCountdown,
  listenToSync,
  resetReadyAndCountdown,
  setPlayerAction,
  listenToPlayer,
  advanceQueueIfAtEnd,
  reportPlaybackPosition,
  setPlayingState,
  clearPlayerState,
  setManualPlayVideoId,
  cancelCountdown,
  setReloadRequested
  
} from "./sync.js";

import {
  renderConnectionStatus,
  renderReadyStatus,
  renderCountdown,
  renderPlayerState,
  renderLastAction,
  bindReadyButton,
  bindPlayerControls,
  bindReloadButton,
  bindLeaveButton,
  bindJoinButton,
  bindFlowerSelect,
  toggleLibraryPanel,
  closeLibraryPanel,
  bindLibraryClose,
  setControlsEnabled,
  setJoinedState,
  setJoinButtonEnabled,
  renderLibrary,
  renderLibraryMessage,
  bindLibraryAdd,
  renderFlower,
  renderQueueCount,
  setPlaybackControlsEnabled,
  renderGardenEntry,
  setGardenFlowerRoles,
  setGardenFlowerUnavailable,
  markGardenPicked,
  revealApp
} from "./ui.js";

import { notify } from "./notifications.js";

import { listen as listenToLibrary, add as addToLibrary, remove as removeFromLibrary } from "./library.js";

import {
  listenToFlower,
  addPetalRemote,
  removePetalRemote,
  movePetalRemote,
  getFlowerSnapshot,
  listenToFlowerById
} from "./gardenFlowers.js";


import {
  initPlayer,
  recreatePlayer,
  setCallbacks,
  loadVideoById,
  play as playVideo,
  pause as pauseVideo,
  seekTo,
  getCurrentTime,
  isPlayingActualVideo
} from "./youtube.js";

import {
  syncWith as queueSyncWith,
  clear as queueClear,
  current as queueCurrent,
  next as queueNext,
  previous as queuePrevious,
  jumpTo as queueJumpTo,
  buildSeededQueue
} from "./queue.js";

let myLibraryVideoIds = [];
let myLibraryTitles = {};
let currentFlowerLayers = null;
let stopQueueListener = null;
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
let currentQueueSeed = null;
let currentQueueIndex = null;
let pendingManualPlayVideoId = null;
let myFlowerVideoIds = [];
let otherFlowerVideoIds = [];
let stopOtherFlowerListener = null;
let stopMyFlowerListener = null;
let lastLoadedAt = 0;
let sessionActive = false;
let latestPlayerData = null;
let otherSlot = null;
let otherReady = false;
let latestOtherPresence = null;
let otherWasPresentInRoom = false;
let pendingReloadRequested = false;

// Fresh per page load — never persisted — so a stale tab (bfcache,
// suspended background tab) can be told apart from the current one.
const mySessionId = crypto.randomUUID();

/**
 * Flower assignment is tied to the room slot, not the browser or the
 * userId: user1 is always "pink", user2 is always "lavender". This is
 * what makes a reload reclaim the same flower (claimSlot() reclaims
 * the same slot) and why it doesn't matter which flower graphic was
 * clicked to trigger joinRoom().
 */
function myFlowerId() {
  if (mySlot === "user1") return "pink";
  if (mySlot === "user2") return "lavender";
  return null;
}

function otherFlowerId() {
  if (otherSlot === "user1") return "pink";
  if (otherSlot === "user2") return "lavender";
  return null;
}


function init() {
  renderGardenEntry();
  renderConnectionStatus("Not connected");
  initLibrary();
  playerReadyPromise = initPlayer("youtube-player");
  setCallbacks({ onEnd: handleAutoNext, onError: handleAutoNext });
  bindJoinButton(joinRoom);
  bindFlowerSelect(joinRoom, toggleLibraryPanel);
  bindLibraryClose(closeLibraryPanel);
  bindLeaveButton(handleLeaveRoom);
  bindReadyButton(async () => {
    await setReady(mySlot, !myCurrentlyReady);
  });
  bindPlayerControls({
    play: () => setPlayerAction("play", mySlot, queueCurrent()),
    pause: () => setPlayerAction("pause", mySlot),
    previous: handlePrevious,
    next: handleNext
  });
  bindReloadButton(handleReload);

    if (hasStoredSlot()) {
    joinRoom(); // refresh — silently rejoin instead of requiring another Join click
    }
}

function initFlower() {
  listenToFlower(myFlowerId(), (layers) => {
    currentFlowerLayers = layers;
    renderFlower(layers, handleFlowerRemove, handleFlowerMove, handleFlowerPlay, (videoId) => myLibraryTitles[videoId]);
    myFlowerVideoIds = [...layers.outer, ...layers.middle, ...layers.inner];
    updateQueueCount();
  });
}

function updateQueueCount() {
  const combined = new Set([...myFlowerVideoIds, ...otherFlowerVideoIds]);
  renderQueueCount(combined.size);
}

async function handleFlowerAdd(videoId, layer) {
  const applied = await addPetalRemote(myFlowerId(), videoId, layer);
  if (!applied) {
    renderLibraryMessage(`Couldn't add to ${layer} — it may be full or already on the flower.`);
  }
}

async function handleFlowerRemove(videoId) {
  await removePetalRemote(myFlowerId(), videoId);
}

async function handleFlowerMove(videoId, toLayer) {
  const applied = await movePetalRemote(myFlowerId(), videoId, toLayer);
  if (!applied) {
    renderLibraryMessage(`Couldn't move to ${toLayer} — it's probably full.`);
  }
}

/**
 * "Play This Song" — a manual override triggered from the Flower.
 * Reuses the existing countdown/sync flow exactly (setManualPlayVideoId
 * + scheduleCountdown): every client's regular listenToSync →
 * runCountdown → startFlowerBackedPlayback path picks it up the same
 * way it already handles Ready-triggered and queue-regeneration
 * countdowns — no second playback path. startFlowerBackedPlayback jumps
 * the freshly-rebuilt queue to this song once, then clears the
 * override, so Next/Previous continue normally from this song onward.
 */
async function handleFlowerPlay(videoId) {
  if (!mySlot) return;
  if (!isSessionValid()) {
    notify("warning", "You can only play once you're both here and Ready.");
    return;
  }
  try {
    await setManualPlayVideoId(videoId);
    await scheduleCountdown();
  } catch (error) {
    console.error("Failed to start manual play:", error);
    notify("error", "Couldn't start that song — please try again.");
  }
}

/**
 * "Reload" / "Replay Together" — destroys and recreates the YouTube
 * player on both devices, then restarts the current song via the
 * exact same synchronized countdown flow as everything else
 * (scheduleCountdown → listenToSync → runCountdown →
 * startFlowerBackedPlayback, which is where the actual player
 * recreation happens once pendingReloadRequested is seen). Not a
 * seekTo(0) — the player instance itself is thrown away and rebuilt.
 */
async function handleReload() {
  if (!isSessionValid()) {
    notify("warning", "You can only reload once you're both here and Ready.");
    return;
  }
  try {
    await setReloadRequested(true);
    await scheduleCountdown();
  } catch (error) {
    console.error("Failed to start reload:", error);
    notify("error", "Couldn't reload — please try again.");
  }
}

function handlePrevious() {
  const prevVideoId = queuePrevious();
  if (prevVideoId) {
    setPlayerAction("previous", mySlot, prevVideoId).catch((error) => {
      console.error("Failed to go to previous song:", error);
      notify("error", "Couldn't go to the previous song — please try again.");
    });
  }
}

/**
 * The single place "advance to the next song" happens — used by the
 * Next button AND by the player's onEnd/onError callbacks, so a
 * natural song end goes through exactly the same flow as a manual
 * click. If the local queue has nothing left, hands off to
 * regenerateQueueAndAdvance() instead of any separate end-of-song logic.
 */
function handleNext() {
  const nextVideoId = queueNext();
  if (nextVideoId) {
    setPlayerAction("next", mySlot, nextVideoId).catch((error) => {
      console.error("Failed to advance to next song:", error);
      notify("error", "Couldn't skip to the next song — please try again.");
    });
  } else {
    regenerateQueueAndAdvance();
  }
}

const MIN_PLAYBACK_BEFORE_AUTO_NEXT_MS = 3000;

function handleAutoNext() {
  if (myUserId !== currentHostId) return; // only host drives auto-advance
  if (getCorrectedNow() - lastLoadedAt < MIN_PLAYBACK_BEFORE_AUTO_NEXT_MS) return;
  handleNext();
}

/**
 * Called when the queue has run out. Proposes a brand-new queueSeed
 * via the same race-guarded compare-and-swap in sync.js; only the
 * device that wins actually writes it, so the queue advances exactly
 * once even if both devices hit the end near-simultaneously. Either
 * way — won or lost — the new queue reaches this device the same way
 * any other playback start does: through the existing synchronized
 * countdown (scheduleCountdown → listenToSync → runCountdown →
 * startFlowerBackedPlayback). No separate "how a new queue starts"
 * code path.
 */
async function regenerateQueueAndAdvance() {
  const newSeed = crypto.randomUUID();
  try {
    const won = await advanceQueueIfAtEnd(currentQueueSeed, currentQueueIndex, newSeed);
    if (won) {
      await scheduleCountdown();
    }
  } catch (error) {
    console.error("Failed to regenerate queue:", error);
    notify("error", "Couldn't refresh the queue — please try again.");
  }
}

/**
 * Connects this browser to the shared room: claims a slot, starts
 * presence/heartbeat, and attaches every Firestore listener that
 * drives sync. Runs only on Join Room click — never automatically on
 * page load. handleLeaveRoom() tears down everything started here, so
 * this can safely run again afterward without a refresh.
 */
async function joinRoom(preferredFlower) {
  if (joining || mySlot) return;
  joining = true;
  stopAllRoomListeners(); // guarantees no leftover listeners survive an incomplete previous join
  setJoinButtonEnabled(false);
  renderConnectionStatus("Connecting...");

  // Align this device's clock with Firestore's before anything else,
  // since the countdown depends on it.
  try {
    await syncServerTimeOffset();
    const claimed = await claimSlot(preferredFlower);
    myUserId = claimed.userId;
    mySlot = claimed.slot;
  } catch (error) {
    if (error.message === "SLOT_TAKEN") {
      renderConnectionStatus(`${preferredFlower === "pink" ? "Pink" : "Lavender"} is already taken.`);
      setGardenFlowerUnavailable(preferredFlower);
    } else if (error.message === "ROOM_FULL") {
      renderConnectionStatus("Room is full — only two users are supported.");
    } else {
      console.error("Failed to join room:", error);
      renderConnectionStatus("Connection error. Please try again.");
    }
    joining = false;
    setJoinButtonEnabled(true);
    return;
  }

  otherSlot = mySlot === "user1" ? "user2" : "user1";
  otherReady = false;
  latestOtherPresence = null;
  otherWasPresentInRoom = false;
  pendingManualPlayVideoId = null;
  pendingReloadRequested = false;

  // Flowers are tied to the room slot, not to whichever userId happens
  // to occupy it, so both listeners are set up once here, keyed off
  // mySlot/otherSlot — not re-subscribed every time presence reports
  // a different otherUserId.
 initFlower();
 otherFlowerVideoIds = [];
 stopOtherFlowerListener = listenToFlowerById(otherFlowerId(), (layers) => {
  otherFlowerVideoIds = [...layers.outer, ...layers.middle, ...layers.inner];
   updateQueueCount();
  });
  updateQueueCount();

  // Presence: heartbeat for this user, listener for the other user.
  stopHeartbeat = startHeartbeat(myUserId, mySlot, mySessionId);
  stopPresenceListener = listenToPresence(otherSlot, (presence) => {
    otherUserId = presence ? presence.userId : null;
    latestOtherPresence = presence;
    updateOtherConnected(!!presence && presence.connected && !isPresenceStale(presence.lastSeen));
    maybeTakeOverHost();

  });
  // Re-check staleness on a timer too, in case the other user's tab
  // died without ever writing a "disconnected" flag. This is also what
  // notices a stale host and triggers failover even with no new snapshot.
    staleCheckIntervalId = setInterval(() => {
    const stillConnected =
      !!latestOtherPresence &&
      latestOtherPresence.connected &&
      !isPresenceStale(latestOtherPresence.lastSeen);
    updateOtherConnected(stillConnected);
    maybeTakeOverHost();
    if (!otherConnected) {
      releaseStaleSlot(otherSlot).catch((error) =>
        console.error("Stale slot release failed:", error)
      );
    }
  }, 5000);

  stopRoomListener = listenToRoom((roomData) => {
    currentHostId = roomData ? roomData.hostId : null;

    const otherPresentNow = !!(roomData && roomData[`${otherSlot}Id`]);
    if (otherWasPresentInRoom && !otherPresentNow) {
      handlePartnerLeft();
    }
    otherWasPresentInRoom = otherPresentNow;

    if (!roomData || !roomData.user1Id || !roomData.user2Id) {
      renderConnectionStatus("Waiting for second user...");
    } else {
      refreshConnectionLabel();
    }
  });

  stopReadyListener = listenToReady((readyData) => {
    myCurrentlyReady = renderReadyStatus(readyData, mySlot);
    otherReady = mySlot === "user1" ? !!readyData.user2Ready : !!readyData.user1Ready;
    maybeScheduleCountdown(readyData);
    enforceSessionValidity();
  }); 

  stopSyncListener = listenToSync((syncData) => handleSyncUpdate(syncData));

  stopPlayerListener = listenToPlayer((playerData) => {
    renderPlayerState(playerData.playbackState || "waiting");
    renderLastAction(playerData.lastAction, playerData.actionBy);
    latestPlayerData = playerData;

    if (playerData.actionId && playerData.actionId !== lastHandledActionId) {
      lastHandledActionId = playerData.actionId;
      if (sessionActive) handlePlayerAction(playerData);
    }
  });

  joining = false;
  setJoinedState(true);
  setGardenFlowerRoles(myFlowerId(), true);
  markGardenPicked();
  setPlaybackControlsEnabled(false);
  sessionActive = false;
}

const LIBRARY_MESSAGES = {
  invalid: "That doesn't look like a valid YouTube link.",
  duplicate: "That song is already in your library.",
  error: "Couldn't save that song — please try again."
};

function initLibrary() {
  listenToLibrary((songs) => {
    renderLibrary(
      songs,
      async (videoId) => {
        const result = await removeFromLibrary(videoId);
        if (!result.ok) {
          renderLibraryMessage(LIBRARY_MESSAGES[result.reason] || "Couldn't remove that song — please try again.");
        }
        await removePetalRemote(myFlowerId(), videoId);;
      },
      handleFlowerAdd
    );
    myLibraryVideoIds = songs.map((song) => song.videoId);
    myLibraryTitles = Object.fromEntries(
      songs.filter((song) => !!song.title).map((song) => [song.videoId, song.title])
    );
        if (currentFlowerLayers) {
      renderFlower(currentFlowerLayers, handleFlowerRemove, handleFlowerMove, handleFlowerPlay, (videoId) => myLibraryTitles[videoId]);
    }
  });

  bindLibraryAdd(async (rawInput) => {
    if (!rawInput || !rawInput.trim()) return;
    const result = await addToLibrary(rawInput);
    renderLibraryMessage(result.ok ? "" : LIBRARY_MESSAGES[result.reason] || "");
    if (result.ok) {
      notify("success", "Added to your library.");
    } else {
      notify("warning", LIBRARY_MESSAGES[result.reason] || "Couldn't save that song.");
    }
  });
}

function refreshConnectionLabel() {
  renderConnectionStatus(otherConnected ? "Both connected" : "Waiting for second user...");
}

/** The one rule the rest of this file enforces: both present, both Ready. */
function isSessionValid() {
  return !!mySlot && otherConnected && myCurrentlyReady && otherReady;
}

/**
 * Locally stops playback and locks the controls the moment the shared
 * session becomes invalid — never writes to Firestore itself, so it's
 * always safe to call from any listener without risking a write race.
 * Resuming only ever happens through the existing synchronized
 * countdown flow once both users are present and Ready again.
 */
function suspendLocalSession() {
  if (sessionActive) {
    pauseVideo();
  }
  sessionActive = false;
  setPlaybackControlsEnabled(false);
  if (countdownIntervalId) {
    clearInterval(countdownIntervalId);
    countdownIntervalId = null;
    renderCountdown("");
  }
}

/**
 * Called after anything that could change presence or Ready state
 * (the presence listener, the ready listener, and the existing
 * staleness timer — no new listeners). If the session is no longer
 * valid, stops playback locally and cancels any countdown that can no
 * longer complete.
 */
function enforceSessionValidity() {
  if (isSessionValid()) return;
  const wasRunningOrActive = sessionActive || countdownIntervalId !== null;
  suspendLocalSession();
  if (wasRunningOrActive) {
    cancelCountdown().catch((error) =>
      console.error("Failed to cancel countdown:", error)
    );
  }
}

/**
 * Single place `otherConnected` ever changes. Detects the true→false
 * edge (partner's presence just went stale) and runs disconnect
 * cleanup exactly once per drop, instead of on every repeated 5s
 * re-check while they stay offline.
 */
function updateOtherConnected(connected) {
  const wasConnected = otherConnected;
  otherConnected = connected;
  refreshConnectionLabel();
  if (!wasConnected && connected) {
    revealApp();
  }
  if (wasConnected && !connected) {
    handlePartnerDisconnected();
  }
  enforceSessionValidity();
}

/**
 * Runs once, right when the partner's presence is detected stale
 * (crash, force-close, lost connection — never an explicit Leave
 * Room, which is handled by handlePartnerLeft instead). A crashed
 * client never got the chance to clean up after itself, so this does
 * it on their behalf: clears their stale Ready flag, cancels any
 * countdown that can't complete, and clears playback state.
 */
async function handlePartnerDisconnected() {
  notify("warning", "Your partner disconnected.");
  suspendLocalSession();
  try {
    if (otherSlot) await setReady(otherSlot, false);
    await cancelCountdown();
    await clearPlayerState();
  } catch (error) {
    console.error("Failed to clean up after partner disconnect:", error);
  }
}

/**
 * Runs when the partner's slot disappears from the room doc (they
 * pressed Leave Room). They've already cleaned up their own Ready/
 * player/countdown state as part of handleLeaveRoom, so this only
 * needs to react locally and notify.
 */
function handlePartnerLeft() {
  notify("warning", "Your partner left the room.");
  suspendLocalSession();
  otherConnected = false;
  otherUserId = null;
  refreshConnectionLabel();
}

function stopAllRoomListeners() {
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
  if (stopOtherFlowerListener) {
    stopOtherFlowerListener();
    stopOtherFlowerListener = null;
  }

  if (stopMyFlowerListener) {
   stopMyFlowerListener();
    stopMyFlowerListener = null;
 }
  
  otherFlowerVideoIds = [];
  [stopPresenceListener, stopRoomListener, stopReadyListener, stopSyncListener, stopPlayerListener, stopQueueListener].forEach(
    (stop) => stop && stop()
  );
  stopPresenceListener = null;
  stopRoomListener = null;
  stopReadyListener = null;
  stopSyncListener = null;
  stopPlayerListener = null;
  stopQueueListener = null;
}

async function handleLeaveRoom() {
  stopAllRoomListeners();
  updateQueueCount();

  try {
    if (mySlot && myUserId) {
      await releaseSlot(mySlot, myUserId);
    }
  } catch (error) {
    console.error("Leave room failed:", error);
    notify("warning", "Left the room, but cleanup on the server didn't fully complete.");
  }

  try {
    if (mySlot) await setReady(mySlot, false);
    await clearPlayerState();
    await resetReadyAndCountdown();
  } catch (error) {
    console.error("Failed to clear session state on leave:", error);
    notify("warning", "Left the room, but some session state may not have reset cleanly.");
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
  currentQueueSeed = null;
  sessionActive = false;
  setPlaybackControlsEnabled(false);
  currentQueueIndex = null;
  latestPlayerData = null;
  otherSlot = null;
  otherReady = false;
  latestOtherPresence = null;
  otherWasPresentInRoom = false;
  pendingManualPlayVideoId = null;
  pendingReloadRequested = false;

  renderConnectionStatus("Not connected");
  renderReadyStatus({ user1Ready: false, user2Ready: false }, "user1");
  renderCountdown("");
  setJoinedState(false);
  setGardenFlowerRoles(null, false);
  closeLibraryPanel();
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
      const newSeed = crypto.randomUUID();
      await advanceQueueIfAtEnd(currentQueueSeed, currentQueueIndex, newSeed);
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
  if (!syncData) return;
  if (syncData.queueSeed !== undefined) currentQueueSeed = syncData.queueSeed;
  if (syncData.queueIndex !== undefined) currentQueueIndex = syncData.queueIndex;
  if (syncData.manualPlayVideoId !== undefined) pendingManualPlayVideoId = syncData.manualPlayVideoId;
  if (syncData.reloadRequested !== undefined) pendingReloadRequested = syncData.reloadRequested;
  if (!syncData.active || !syncData.countdownStartAt) return;
  if (syncData.countdownId === lastHandledCountdownId) return; // already running this one
  lastHandledCountdownId = syncData.countdownId;

  const remainingMs = syncData.countdownStartAt - getCorrectedNow();
  if (remainingMs <= 0) {
    // The countdown already finished before we ever saw it — a
    // refresh or rejoin landing mid-session, not a fresh countdown.
    // Rebuild local state to match instead of restarting playback.
    resumeActiveSession();
  } else {
    runCountdown(syncData.countdownStartAt);
  }
}

/**
 * Rebuilds this device's local queue to match an already-in-progress
 * session (page refresh or rejoin landing after playback already
 * started). Unlike startFlowerBackedPlayback(), this never writes a
 * new "play" action — the existing listenToPlayer listener
 * independently delivers whatever's actually currently playing, and
 * handlePlayerAction() (replayed here from the latest snapshot) loads
 * it. This just makes sure the local queue — needed for Next/Previous
 * — reflects the right song order first, and jumpTo() (inside
 * handlePlayerAction) lands the pointer on the actual current song.
 */
async function resumeActiveSession() {
  try {
    const [myFlower, otherFlower] = await Promise.all([
      getFlowerSnapshot(myFlowerId()),
     getFlowerSnapshot(otherFlowerId())
    ]);
    const myPetals = [...myFlower.outer, ...myFlower.middle, ...myFlower.inner];
    const otherPetals = [...otherFlower.outer, ...otherFlower.middle, ...otherFlower.inner];
    const seededQueue = buildSeededQueue(myPetals, otherPetals, currentQueueSeed || "default-seed");

    queueClear();
    queueSyncWith(seededQueue);
    sessionActive = true;
    setPlaybackControlsEnabled(true);

     if (latestPlayerData && latestPlayerData.actionId) {
      lastHandledActionId = latestPlayerData.actionId;
      handlePlayerAction(latestPlayerData);
    }
  } catch (error) {
    console.error("Failed to resume active session:", error);
    notify("error", "Couldn't reconnect to the current session — try refreshing.");
  }
}

async function handlePlayerAction(playerData) {
  try {
    await playerReadyPromise;

    if (playerData.videoId) {
      queueJumpTo(playerData.videoId); // idempotent — keeps this device's local pointer aligned with whatever's actually playing
      if (playerData.videoId !== lastLoadedVideoId) {
  lastLoadedVideoId = playerData.videoId;
  lastLoadedAt = getCorrectedNow();
  loadVideoById(playerData.videoId);
}
    }
     if (playerData.lastAction === "play") playVideo();
    else if (playerData.lastAction === "pause") pauseVideo();
    else if (playerData.lastAction === "previous" || playerData.lastAction === "next") playVideo();
  } catch (error) {
    console.error("Playback side effect failed:", error);
    notify("error", "Playback ran into a problem — try Play/Pause again.");
  }
}

/**
 * Builds the shared playback queue the moment playback starts: reads
 * both users' private flowers, merges them round-robin into a
 * temporary in-memory playlist (duplicates collapsed to one entry),
 * feeds that into the existing queue engine, and plays whatever ends
 * up current. The merge itself is never persisted — both devices
 * independently recompute it from the same two flower documents, so
 * the resulting queue matches on both sides without ever writing a
 * shared flower to Firestore.
 */

/**
 * Builds the shared playback queue the moment playback starts (initial
 * Ready-triggered countdown, or a queue regeneration): reads both
 * users' private flowers, deterministically merges + shuffles them
 * using the current shared queueSeed (buildSeededQueue, in queue.js —
 * reuses the same merge/dedupe logic either way), and plays whatever
 * ends up current. Nothing here is persisted to Firestore beyond the
 * seed itself — every client rebuilds the same queue locally.
 */
async function startFlowerBackedPlayback() {
  try {
    if (pendingReloadRequested) {
      pendingReloadRequested = false;
      setReloadRequested(false).catch((error) =>
        console.error("Failed to clear reload flag:", error)
      );
      playerReadyPromise = recreatePlayer("youtube-player");
      await playerReadyPromise;
    }

    const [myFlower, otherFlower] = await Promise.all([
      getFlowerSnapshot(myFlowerId()),
     getFlowerSnapshot(otherFlowerId())
    ]);
    const myPetals = [...myFlower.outer, ...myFlower.middle, ...myFlower.inner];
    const otherPetals = [...otherFlower.outer, ...otherFlower.middle, ...otherFlower.inner];
    const seededQueue = buildSeededQueue(myPetals, otherPetals, currentQueueSeed || "default-seed");

    queueClear();
    queueSyncWith(seededQueue);

    if (pendingManualPlayVideoId && seededQueue.includes(pendingManualPlayVideoId)) {
      queueJumpTo(pendingManualPlayVideoId);
    }
    pendingManualPlayVideoId = null;
    setManualPlayVideoId(null).catch((error) =>
      console.error("Failed to clear manual play override:", error)
    );

    const currentVideoId = queueCurrent();

    if (currentVideoId) {
      sessionActive = true;
    setPlaybackControlsEnabled(true);
      // Always force a genuine reload rather than trusting the current
      // player already has this video loaded — required both for
      // Reload (fresh player instance) and for a rejoin landing back
      // on the same song that was playing before a disconnect, which
      // must restart fresh rather than resume from where it paused.
      lastLoadedVideoId = null;
      await setPlayerAction("play", mySlot, currentVideoId);
    } else {
      console.warn("Countdown finished but both flowers are empty — nothing will play.");
      notify("info", "Nothing to play yet — add some songs to a flower first.");
    }
  } catch (error) {
    console.error("Failed to build merged flower queue:", error);
    notify("error", "Couldn't start playback — please try again.");
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
      startFlowerBackedPlayback();
      setTimeout(() => {
        renderCountdown("");
      }, 1000);
    } else if (secondsLeft <= 3) {
      renderCountdown(String(secondsLeft));
    }
  }, 100);
}

init();
