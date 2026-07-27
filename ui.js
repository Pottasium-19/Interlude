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
  joinBtn: () => document.getElementById("join-btn"),
  libraryInput: () => document.getElementById("library-input"),
  libraryAddBtn: () => document.getElementById("library-add-btn"),
  libraryList: () => document.getElementById("library-list"),
  libraryMessage: () => document.getElementById("library-message"),
  outerList: () => document.getElementById("outer-list"),
  middleList: () => document.getElementById("middle-list"),
  innerList: () => document.getElementById("inner-list"),
  outerCount: () => document.getElementById("outer-count"),
  middleCount: () => document.getElementById("middle-count"),
  innerCount: () => document.getElementById("inner-count"),
  queueCount: () => document.getElementById("queue-count"),
};

const LAYER_LIST_EL = { outer: el.outerList, middle: el.middleList, inner: el.innerList };
const LAYER_COUNT_EL = { outer: el.outerCount, middle: el.middleCount, inner: el.innerCount };
const OTHER_LAYERS = {
  outer: ["middle", "inner"],
  middle: ["outer", "inner"],
  inner: ["outer", "middle"]
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

export function setPlaybackControlsEnabled(enabled) {
  [el.playBtn(), el.pauseBtn(), el.prevBtn(), el.nextBtn()].forEach((btn) => {
    btn.disabled = !enabled;
  });
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

export function bindJoinButton(handler) {
  el.joinBtn().addEventListener("click", handler);
}

export function setJoinButtonEnabled(enabled) {
  el.joinBtn().disabled = !enabled;
}

export function setJoinedState(isJoined) {
  el.leaveBtn().disabled = !isJoined;
  setControlsEnabled(isJoined);
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
 * Renders the library list. `onRemove(videoId)` fires on the remove
 * button. `onAddToFlower(videoId, layer)` — optional — fires on the
 * "Add to Flower" button next to each entry, with whichever layer is
 * selected in that row's dropdown; omit it to render the list without
 * flower controls.
 */
export function renderLibrary(songs, onRemove, onAddToFlower) {
  const list = el.libraryList();
  list.innerHTML = "";

  songs.forEach(({ videoId, title }) => {
    const item = document.createElement("li");

    const label = document.createElement("span");
    label.textContent = title || videoId;
    item.appendChild(label);

    if (onAddToFlower) {
      const layerSelect = document.createElement("select");
      ["outer", "middle", "inner"].forEach((layer) => {
        const option = document.createElement("option");
        option.value = layer;
        option.textContent = layer;
        layerSelect.appendChild(option);
      });
      item.appendChild(layerSelect);

      const addToFlowerBtn = document.createElement("button");
      addToFlowerBtn.textContent = "Add to Flower";
      addToFlowerBtn.addEventListener("click", () => onAddToFlower(videoId, layerSelect.value));
      item.appendChild(addToFlowerBtn);
    }

    const removeBtn = document.createElement("button");
    removeBtn.textContent = "Remove";
    removeBtn.addEventListener("click", () => onRemove(videoId));
    item.appendChild(removeBtn);

    list.appendChild(item);
  });
}

export function renderLibraryMessage(text) {
  el.libraryMessage().textContent = text;
}

export function bindLibraryAdd(handler) {
  el.libraryAddBtn().addEventListener("click", () => {
    const value = el.libraryInput().value;
    handler(value);
    el.libraryInput().value = "";
  });
}

/**
 * Renders all three flower layers. `layers` is { outer, middle, inner }
 * (arrays of videoId). `onRemove(videoId)` fires on Remove.
 * `onMove(videoId, toLayer)` fires on Move, with whichever target layer
 * is selected in that row's dropdown.
 */
export function renderFlower(layers, onRemove, onMove, getTitle) {
  ["outer", "middle", "inner"].forEach((layer) => {
    const list = LAYER_LIST_EL[layer]();
    list.innerHTML = "";
    LAYER_COUNT_EL[layer]().textContent = layers[layer].length;

    layers[layer].forEach((videoId) => {
      const item = document.createElement("li");

      const label = document.createElement("span");
      label.textContent = (typeof getTitle === "function" && getTitle(videoId)) || videoId;
      item.appendChild(label);

      const moveSelect = document.createElement("select");
      OTHER_LAYERS[layer].forEach((target) => {
        const option = document.createElement("option");
        option.value = target;
        option.textContent = `Move to ${target}`;
        moveSelect.appendChild(option);
      });
      item.appendChild(moveSelect);

      const moveBtn = document.createElement("button");
      moveBtn.textContent = "Move";
      moveBtn.addEventListener("click", () => onMove(videoId, moveSelect.value));
      item.appendChild(moveBtn);

      const removeBtn = document.createElement("button");
      removeBtn.textContent = "Remove";
      removeBtn.addEventListener("click", () => onRemove(videoId));
      item.appendChild(removeBtn);

      list.appendChild(item);
    });
  });
}

export function renderQueueCount(count) {
  el.queueCount().textContent = count;
}
