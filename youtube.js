// youtube.js
// Single responsibility: wrap the YouTube IFrame Player API behind a
// small, promise-friendly surface. Knows nothing about Firestore, sync,
// or the DOM beyond the single container it's told to mount into.

let player = null;
let apiReadyPromise = null;
let pendingContainerId = null;
let resolveInit = null;

const callbacks = {
  onReady: null,
  onPlay: null,
  onPause: null,
  onEnd: null,
  onStateChange: null,
  onError: null
};

/**
 * Loads the YouTube IFrame API script exactly once, even if called from
 * multiple places or multiple times. Resolves once window.YT.Player is
 * usable (YouTube calls window.onYouTubeIframeAPIReady globally when
 * the script finishes loading — there's no per-script-tag callback).
 */
function loadYouTubeApi() {
  if (apiReadyPromise) return apiReadyPromise;

  apiReadyPromise = new Promise((resolve, reject) => {
    if (window.YT && window.YT.Player) {
      resolve();
      return;
    }

    const existingCallback = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (typeof existingCallback === "function") existingCallback();
      resolve();
    };

    if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
      const script = document.createElement("script");
      script.src = "https://www.youtube.com/iframe_api";
      script.onerror = () => reject(new Error("Failed to load YouTube IFrame API"));
      document.head.appendChild(script);
    }
  });

  return apiReadyPromise;
}

function handlePlayerReady(event) {
  if (typeof callbacks.onReady === "function") callbacks.onReady(event);
  if (typeof resolveInit === "function") {
    resolveInit(player);
    resolveInit = null;
  }
}

function handlePlayerStateChange(event) {
  if (typeof callbacks.onStateChange === "function") callbacks.onStateChange(event);

  switch (event.data) {
    case window.YT.PlayerState.PLAYING:
      if (typeof callbacks.onPlay === "function") callbacks.onPlay(event);
      break;
    case window.YT.PlayerState.PAUSED:
      if (typeof callbacks.onPause === "function") callbacks.onPause(event);
      break;
    case window.YT.PlayerState.ENDED:
      if (typeof callbacks.onEnd === "function") callbacks.onEnd(event);
      break;
  }
}

function handlePlayerError(event) {
  if (typeof callbacks.onError === "function") callbacks.onError(event);
}

/**
 * Creates the YouTube player inside the element with id `containerId`.
 * Safe to call once per page load. Returns a promise that resolves with
 * the underlying YT.Player instance once it's ready to receive commands.
 */
function createPlayerInstance(containerId) {
  pendingContainerId = containerId;
  return loadYouTubeApi().then(
    () =>
      new Promise((resolve) => {
        resolveInit = resolve;
        player = new window.YT.Player(pendingContainerId, {
          height: "100%",
          width: "100%",
          playerVars: {
            enablejsapi: 1,
            playsinline: 1
          },
          events: {
            onReady: handlePlayerReady,
            onStateChange: handlePlayerStateChange,
            onError: handlePlayerError
          }
        });
      })
  );
}

/**
 * Creates the YouTube player inside the element with id `containerId`.
 * Safe to call once per page load. Returns a promise that resolves with
 * the underlying YT.Player instance once it's ready to receive commands.
 */
export function initPlayer(containerId) {
  if (player) return Promise.resolve(player);
  return createPlayerInstance(containerId);
}

/**
 * Fully destroys the current YouTube player instance and creates a
 * brand-new one in its place — not a seekTo(0) or a reload on the same
 * instance. YT.Player replaces its container element with an iframe
 * and never gives the original element back, even after destroy(), so
 * the container has to be recreated before a new player can mount
 * into it. Used by the "Reload"/"Replay Together" button to recover
 * from desyncs, buffering, or glitches with a genuinely fresh player.
 */
export function recreatePlayer(containerId) {
  if (player) {
    try {
      player.destroy();
    } catch (error) {
      console.error("youtube.js: failed to destroy player:", error);
    }
    player = null;
  }

  const old = document.getElementById(containerId);
  const parent = old ? old.parentNode : null;
  if (old) old.remove();
  const fresh = document.createElement("div");
  fresh.id = containerId;
  if (parent) {
    parent.appendChild(fresh);
  } else {
    console.error(`youtube.js: couldn't find a parent to recreate #${containerId} in`);
  }

  return createPlayerInstance(containerId);
}

/** Registers callback handlers. Pass only the ones you want to (re)set. */
export function setCallbacks(handlers) {
  Object.assign(callbacks, handlers);
}

export function loadVideoById(videoId) {
  if (!player) throw new Error("youtube.js: initPlayer() must resolve before loadVideoById()");
  player.loadVideoById(videoId);
}

export function play() {
  if (!player) throw new Error("youtube.js: initPlayer() must resolve before play()");
  player.playVideo();
}

export function pause() {
  if (!player) throw new Error("youtube.js: initPlayer() must resolve before pause()");
  player.pauseVideo();
}

export function seekTo(seconds) {
  if (!player) throw new Error("youtube.js: initPlayer() must resolve before seekTo()");
  player.seekTo(seconds, true);
}

export function getCurrentTime() {
  if (!player) throw new Error("youtube.js: initPlayer() must resolve before getCurrentTime()");
  return player.getCurrentTime();
}

export function getDuration() {
  if (!player) throw new Error("youtube.js: initPlayer() must resolve before getDuration()");
  return player.getDuration();
}

export function getPlayerState() {
  if (!player) throw new Error("youtube.js: initPlayer() must resolve before getPlayerState()");
  return player.getPlayerState();
}

/**
 * True only if the player has actually started playing the real
 * video — not cued, buffering, or ended. This is the check drift
 * correction and the "restore sync once both sides are playing" logic
 * use to avoid seeking or comparing positions on a player that's
 * still on an ad or hasn't loaded yet.
 */
export function isPlayingActualVideo() {
  if (!player) return false;
  return player.getPlayerState() === window.YT.PlayerState.PLAYING;
}
