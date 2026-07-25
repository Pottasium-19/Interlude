// ui.js
// Single responsibility: read from / write to the DOM. This module
// knows nothing about Firestore — it just renders values it's given
// and reports user interactions via callbacks.

const el = {
  connectionStatus: () => document.getElementById("connection-status"),
  readyBtn: () => document.getElementById("ready-btn"),
  readyStatus: () => document.getElementById("ready-status"),
  countdownDisplay: () => document.getElementById("countdown-display"),
  playerState: () => document.getElementById("player-state"),
  lastAction: () => document.getElementById("last-action"),
  playBtn: () => document.getElementById("play-btn"),
  pauseBtn: () => document.getElementById("pause-btn"),
  prevBtn: () => document.getElementById("prev-btn"),
  nextBtn: () => document.getElementById("next-btn"),
  leaveBtn: () => document.getElementById("leave-btn"),
  libraryInput: () => document.getElementById("library-input"),
  libraryAddBtn: () => document.getElementById("library-add-btn"),
  libraryList: () => document.getElementById("library-list"),
  libraryMessage: () => document.getElementById("library-message")
};

export function renderConnectionStatus(text) {
  el.connectionStatus().textContent = text;
}

export function renderReadyStatus({ user1Ready, user2Ready }, mySlot) {
  const myReady = mySlot === "user1" ? !!user1Ready : !!user2Ready;
  const otherReady = mySlot === "user1" ? !!user2Ready : !!user1Ready;
  el.readyStatus().textContent = `You: ${myReady ? "Ready" : "Not Ready"} | Other: ${
    otherReady ? "Ready" : "Not Ready"
  }`;
  el.readyBtn().textContent = myReady ? "Cancel Ready" : "Ready";
  return myReady;
}

export function renderCountdown(text) {
  el.countdownDisplay().textContent = text;
}

export function renderPlayerState(state) {
  el.playerState().textContent = `State: ${state}`;
}

export function renderLastAction(action, by) {
  el.lastAction().textContent = action ? `Last action: ${action} (by ${by})` : "";
}

export function bindReadyButton(handler) {
  el.readyBtn().addEventListener("click", handler);
}

export function bindLeaveButton(handler) {
  el.leaveBtn().addEventListener("click", handler);
}

export function bindPlayerControls(handlers) {
  el.playBtn().addEventListener("click", () => handlers.play());
  el.pauseBtn().addEventListener("click", () => handlers.pause());
  el.prevBtn().addEventListener("click", () => handlers.previous());
  el.nextBtn().addEventListener("click", () => handlers.next());
}

export function setControlsEnabled(enabled) {
  [el.playBtn(), el.pauseBtn(), el.prevBtn(), el.nextBtn(), el.readyBtn()].forEach((btn) => {
    btn.disabled = !enabled;
  });
}

/**
 * Renders the library list. `onRemove(videoId)` is called when the
 * remove button next to an entry is clicked.
 */
export function renderLibrary(songs, onRemove) {
  const list = el.libraryList();
  list.innerHTML = "";

  songs.forEach(({ videoId }) => {
    const item = document.createElement("li");

    const label = document.createElement("span");
    label.textContent = videoId;
    item.appendChild(label);

    const removeBtn = document.createElement("button");
    removeBtn.textContent = "Remove";
    removeBtn.addEventListener("click", () => onRemove(videoId));
    item.appendChild(removeBtn);

    list.appendChild(item);
  });
}

/** Shows a status/error message under the library form (empty string clears it). */
export function renderLibraryMessage(text) {
  el.libraryMessage().textContent = text;
}

/** Wires the Add button to `handler(inputValue)` and clears the input on click. */
export function bindLibraryAdd(handler) {
  el.libraryAddBtn().addEventListener("click", () => {
    const value = el.libraryInput().value;
    handler(value);
    el.libraryInput().value = "";
  });
}
