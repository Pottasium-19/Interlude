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
  reloadBtn: () => document.getElementById("reload-btn"),
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
  gardenScreen: () => document.getElementById("garden-screen"),
  gardenFlowerPink: () => document.getElementById("garden-flower-pink"),
  gardenFlowerLavender: () => document.getElementById("garden-flower-lavender"),
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
  [el.playBtn(), el.pauseBtn(), el.prevBtn(), el.nextBtn(), el.reloadBtn()].forEach((btn) => {
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

/**
 * Garden entry screen — two flower graphics (pink left, lavender
 * right). The markup doesn't exist in the HTML yet, so this builds it
 * and injects it into #garden-screen. Idempotent (guarded by
 * dataset.built) so re-calling on re-init never tears down/rebuilds
 * the nodes — that matters once these get animated (swaying) later,
 * since a rebuild would reset any animation state.
 *
 * Structure is deliberately generic (.garden-flower,
 * .garden-flower__graphic, .garden-flower__label) so a later styling
 * pass can target it without another ui.js change.
 */
export function renderGardenEntry() {
  const mount = el.gardenScreen();
  if (!mount || mount.dataset.built === "true") return;

  mount.appendChild(buildGardenFlowerNode("pink", "Pink"));
  mount.appendChild(buildGardenFlowerNode("lavender", "Lavender"));
  mount.dataset.built = "true";
}

function buildGardenFlowerNode(flowerId, label) {
  const node = document.createElement("div");
  node.id = `garden-flower-${flowerId}`;
  node.className = `garden-flower garden-flower--${flowerId}`;
  node.dataset.flower = flowerId;
  node.setAttribute("role", "button");
  node.setAttribute("tabindex", "0");
  node.setAttribute("aria-label", `${label} flower`);

  const graphic = document.createElement("div");
  graphic.className = "garden-flower__graphic";
  node.appendChild(graphic);

  const labelEl = document.createElement("div");
  labelEl.className = "garden-flower__label";
  labelEl.textContent = label;
  node.appendChild(labelEl);

  return node;
}

/**
 * Clicking either flower triggers the existing joinRoom() flow — no
 * separate Join Room screen. Which flower was clicked doesn't matter
 * (assignment is by room slot, not by click target), so both nodes
 * get the same handler. Enter/Space mirrors click for the
 * role="button" nodes above.
 */
export function bindFlowerSelect(handler) {
  [el.gardenFlowerPink(), el.gardenFlowerLavender()].forEach((node) => {
    if (!node) return;
    node.addEventListener("click", () => handler(node.dataset.flower));
    node.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        handler(node.dataset.flower);
      }
    });
  });
}

/**
 * Call after joinRoom() resolves (and on leave/room-reset) to mark
 * which garden flower is mine (editable) vs the partner's
 * (view-only). Both stay visible either way — only state classes
 * change. Pass (null, false) to return both to the neutral pre-join
 * state.
 */
const GARDEN_FLOWER_NAMES = { pink: "Pink", lavender: "Lavender" };

export function setGardenFlowerRoles(myFlowerId, isJoined) {
  ["pink", "lavender"].forEach((flowerId) => {
    const node = document.getElementById(`garden-flower-${flowerId}`);
    if (!node) return;

    node.classList.remove(
      "garden-flower--mine",
      "garden-flower--partner",
      "garden-flower--joined",
      "garden-flower--unavailable"
    );
    node.removeAttribute("aria-disabled");

    const label = node.querySelector(".garden-flower__label");
    if (label) label.textContent = GARDEN_FLOWER_NAMES[flowerId];

    if (isJoined) {
      node.classList.add("garden-flower--joined");
      if (flowerId === myFlowerId) {
        node.classList.add("garden-flower--mine");
        if (label) label.textContent = `${GARDEN_FLOWER_NAMES[flowerId]} (You)`;
      } else {
        node.classList.add("garden-flower--partner");
        node.setAttribute("aria-disabled", "true");
      }
    }
  });
}

/**
 * Marks a single garden flower unavailable after a failed claim
 * (SLOT_TAKEN) — never touches the other flower, per spec: a taken
 * flower shows unavailable, it does not silently reassign to the
 * other one. Cleared automatically the next time setGardenFlowerRoles
 * runs (join success or leave/reset), since that strips every state
 * class before reapplying.
 */
export function setGardenFlowerUnavailable(flowerId) {
  const node = document.getElementById(`garden-flower-${flowerId}`);
  if (!node) return;
  node.classList.add("garden-flower--unavailable");
}

export function bindPlayerControls(handlers) {
  el.playBtn().addEventListener("click", () => handlers.play());
  el.pauseBtn().addEventListener("click", () => handlers.pause());
  el.prevBtn().addEventListener("click", () => handlers.previous());
  el.nextBtn().addEventListener("click", () => handlers.next());
}

export function bindReloadButton(handler) {
  el.reloadBtn().addEventListener("click", handler);
}

export function setControlsEnabled(enabled) {
  [el.playBtn(), el.pauseBtn(), el.prevBtn(), el.nextBtn(), el.reloadBtn(), el.readyBtn()].forEach((btn) => {
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
export function renderFlower(layers, onRemove, onMove, onPlay, getTitle) {
  ["outer", "middle", "inner"].forEach((layer) => {
    const list = LAYER_LIST_EL[layer]();
    list.innerHTML = "";
    LAYER_COUNT_EL[layer]().textContent = layers[layer].length;

    layers[layer].forEach((videoId) => {
      const item = document.createElement("li");

      const label = document.createElement("span");
      label.textContent = (typeof getTitle === "function" && getTitle(videoId)) || videoId;
      item.appendChild(label);

      const playBtn = document.createElement("button");
      playBtn.textContent = "Play";
      playBtn.addEventListener("click", () => onPlay(videoId));
      item.appendChild(playBtn);

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
