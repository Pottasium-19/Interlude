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
  libraryPanel: () => document.getElementById("library-panel"),
  libraryCloseBtn: () => document.getElementById("library-close-btn"),
  libraryOverlay: () => document.getElementById("library-hub-overlay"),
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
  flowerLayer: () => document.getElementById("flower-layer"),
  butterflyLayer: () => document.getElementById("butterfly-layer"),
  artModeToggle: () => document.getElementById("art-mode-toggle"),
};

const LAYER_LIST_EL = { outer: el.outerList, middle: el.middleList, inner: el.innerList };
const LAYER_COUNT_EL = { outer: el.outerCount, middle: el.middleCount, inner: el.innerCount };
const OTHER_LAYERS = {
  outer: ["middle", "inner"],
  middle: ["outer", "inner"],
  inner: ["outer", "middle"]
};

/**
 * Sets textContent and briefly flashes the element to full opacity via
 * the .status-flash class (removed then re-added to force the CSS
 * transition to restart even if the class is already present). Pairs
 * with the subtle-by-default status message styling in style.css.
 */
function setStatusText(node, text) {
  node.textContent = text;
  node.classList.remove("status-flash");
  void node.offsetWidth; // force reflow so re-adding the class retriggers the transition
  node.classList.add("status-flash");
}

export function renderConnectionStatus(text) {
  setStatusText(el.connectionStatus(), text);
}

/**
 * Presentation only — the ready/not-ready booleans below still drive
 * all real logic (return value, body classes elsewhere). This just
 * softens the wording of what gets shown in #ready-status.
 */
export function renderReadyStatus({ user1Ready, user2Ready }, mySlot) {
  const myReady = mySlot === "user1" ? !!user1Ready : !!user2Ready;
  const otherReady = mySlot === "user1" ? !!user2Ready : !!user1Ready;

  let readyText;
  if (myReady && otherReady) {
    readyText = "Both ready — the countdown begins.";
  } else if (myReady) {
    readyText = "You're ready. Waiting on them...";
  } else if (otherReady) {
    readyText = "They're ready. Whenever you are.";
  } else {
    readyText = "Not ready yet.";
  }
  setStatusText(el.readyStatus(), readyText);
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

const PLAYER_STATE_PHRASES = {
  waiting: "The music is resting.",
  playing: "Playing softly...",
  paused: "Paused, waiting for you.",
};

export function renderPlayerState(state) {
  setStatusText(el.playerState(), PLAYER_STATE_PHRASES[state] || "The music is resting.");
  document.body.classList.toggle("is-playing", state === "playing");
}

const LAST_ACTION_PHRASES = {
  play: "set the melody playing",
  pause: "paused the melody",
  previous: "drifted back a song",
  next: "moved on to the next song",
};

export function renderLastAction(action, by) {
  setStatusText(
    el.lastAction(),
    action ? `${by} ${LAST_ACTION_PHRASES[action] || "stirred the melody"}` : ""
  );
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
  document.body.classList.toggle("is-joined", isJoined);
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
  const mount = el.flowerLayer();
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
 * Pre-join, clicking either flower triggers onJoin(flowerId) — the
 * existing joinRoom() flow. Which flower was clicked doesn't matter
 * pre-join (assignment is by room slot, not by click target).
 *
 * Post-join (body.is-joined, set by setJoinedState), a click instead
 * calls onToggleLibrary(flowerId) — but only for the flower carrying
 * garden-flower--mine (set by setGardenFlowerRoles). The partner's
 * flower (garden-flower--partner) is not clickable this way; its
 * click is swallowed.
 *
 * Enter/Space mirrors click for the role="button" nodes above.
 */
export function bindFlowerSelect(onJoin, onToggleLibrary) {
  [
    [el.gardenFlowerPink(), "pink"],
    [el.gardenFlowerLavender(), "lavender"]
  ].forEach(([node, flowerId]) => {
    if (!node) return;
    const activate = () => {
      if (document.body.classList.contains("is-joined")) {
        if (node.classList.contains("garden-flower--mine")) {
          onToggleLibrary(flowerId);
        }
        return;
      }
      onJoin(flowerId);
    };
    node.addEventListener("click", activate);
    node.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        activate();
      }
    });
  });
}

let openLibraryFlowerId = null;

/**
 * Toggles the library-open state for `flowerId`'s own flower — only
 * one flower's panel can be open at a time, so opening one closes
 * the other. For now this just flips garden-flower--panel-open on
 * the flower node; #library-panel itself is still under the
 * display:none rule (point 3) and there's no slide/zoom CSS for the
 * class yet (point 4) — those hook into this class next.
 */
export function toggleLibraryPanel(flowerId) {
  const node = document.getElementById(`garden-flower-${flowerId}`);
  if (!node) return;

  const opening = openLibraryFlowerId !== flowerId;
  if (openLibraryFlowerId) {
    document.getElementById(`garden-flower-${openLibraryFlowerId}`)
      ?.classList.remove("garden-flower--panel-open");
  }
  openLibraryFlowerId = opening ? flowerId : null;
  if (opening) {
    setHubOrigin(node);
    node.classList.add("garden-flower--panel-open");
  }
  el.libraryPanel()?.classList.toggle("library-panel--open", opening);
}

/**
 * Points the hub's transform-origin at flowerNode's current screen
 * position, so style.css's scale(1) grows from that exact spot
 * instead of dead-center (its default). Called only when opening —
 * closeLibraryPanel() below leaves the last-set origin in place, so
 * the hub shrinks back toward the same spot it grew from.
 *
 * Deliberately avoids getBoundingClientRect() on the panel itself —
 * that would report its post-transform (still-shrunk) box. Since
 * #library-hub-overlay centers the panel via flexbox rather than a
 * translate() in the panel's own transform, the panel's untransformed
 * top-left corner is exactly derivable from viewport size minus its
 * own true size (offsetWidth/offsetHeight, which are transform-immune) —
 * no rendered-position measurement of the panel needed.
 */
function setHubOrigin(flowerNode) {
  const panel = el.libraryPanel();
  if (!panel) return;

  const flowerRect = flowerNode.getBoundingClientRect();
  const flowerCenterX = flowerRect.left + flowerRect.width / 2;
  const flowerCenterY = flowerRect.top + flowerRect.height / 2;

  const panelLeft = (window.innerWidth - panel.offsetWidth) / 2;
  const panelTop = (window.innerHeight - panel.offsetHeight) / 2;

  const originX = flowerCenterX - panelLeft;
  const originY = flowerCenterY - panelTop;
  panel.style.transformOrigin = `${originX}px ${originY}px`;
}

/**
 * Force-closes the library panel regardless of which flower has it
 * open, and clears the tracked state. Call on leave/room-reset — the
 * join/lavender-role reset in setGardenFlowerRoles(null, false)
 * doesn't touch garden-flower--panel-open or library-panel--open, so
 * without this a panel left open on leave stays visually open (and
 * openLibraryFlowerId stays stale) for the next join.
 */
export function closeLibraryPanel() {
  if (openLibraryFlowerId) {
    document.getElementById(`garden-flower-${openLibraryFlowerId}`)
      ?.classList.remove("garden-flower--panel-open");
  }
  openLibraryFlowerId = null;
  el.libraryPanel()?.classList.remove("library-panel--open");
}
/**
 * Call after joinRoom() resolves (and on leave/room-reset) to mark
 * which garden flower is mine (editable) vs the partner's
 * (view-only). Both stay visible either way — only state classes
 * change. Pass (null, false) to return both to the neutral pre-join
 * state.
 */
export function setGardenFlowerRoles(myFlowerId, isJoined) {
  ["pink", "lavender"].forEach((flowerId) => {
    const node = document.getElementById(`garden-flower-${flowerId}`);
    if (!node) return;

    node.classList.remove("garden-flower--mine", "garden-flower--partner", "garden-flower--joined");
    node.removeAttribute("aria-disabled");

    if (isJoined) {
      node.classList.add("garden-flower--joined");
      if (flowerId === myFlowerId) {
        node.classList.add("garden-flower--mine");
      } else {
        node.classList.add("garden-flower--partner");
        node.setAttribute("aria-disabled", "true");
      }
    }
  });
}

export function setGardenFlowerUnavailable(flowerId) {
  const node = document.getElementById(`garden-flower-${flowerId}`);
  if (node) node.classList.add("garden-flower--unavailable");
}

/** Fades "Choose Your Flower" out once this device has claimed a slot. */
export function markGardenPicked() {
  const mount = el.gardenScreen();
  if (mount) mount.classList.add("garden-screen--picked");
}

/**
 * Lifts the garden curtain for good once both players are connected:
 * fades #garden-screen out, then removes it from layout and restores
 * page scrolling. Safe to call more than once — no-ops after the
 * first time via the display check.
 */
export function revealApp() {
  const mount = el.gardenScreen();
  if (!mount || mount.style.display === "none") return;
  mount.classList.add("garden-screen--leaving");
  document.documentElement.style.overflow = "";
  document.body.style.overflow = "";
  setTimeout(() => {
    mount.style.display = "none";
  }, 800); // matches the opacity transition duration in style.css
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

export function bindLibraryClose(handler) {
  el.libraryCloseBtn()?.addEventListener("click", handler);
}

/**
 * Tapping the scrim outside the hub closes it the same way the ✕
 * button does — both call the same handler (closeLibraryPanel), so
 * it's the same close animation either way. Guarded so a click that
 * starts inside #library-panel and bubbles up doesn't also trigger
 * this: only fires when the overlay itself is the actual click
 * target, not just where the event bubbled through.
 */
export function bindLibraryOverlayClose(handler) {
  el.libraryOverlay()?.addEventListener("click", (e) => {
    if (e.target === el.libraryOverlay()) handler();
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

/* ==========================================================================
   Phase 4.1 — Day/Night, ambient life, Art Mode. Purely presentational:
   main.js decides *when* (via environmentState.js's getTimePeriod, on a
   timer), this module only ever flips classes/attributes in response.
   ========================================================================== */

/**
 * Applies a time-of-day period ("dawn" | "day" | "sunset" | "night", as
 * returned by environmentState.js's getTimePeriod) to <body> as classes:
 * is-night / is-day, which drive the night-art crossfade plus the
 * firefly/butterfly layer visibility in style.css, and is-dawn (Phase 5),
 * which independently gates the dawn-fog layer only. Per the owner's call,
 * dawn still reads visually as day (is-day stays true) and sunset still
 * reads visually as night, since we only have day + night art right now —
 * is-dawn is additive, not a replacement for that pairing. is-sunset
 * (Ambient Polish Pass) is additive the same way — it does not change
 * the is-night/is-day pairing above, it only gates a warm CSS overlay
 * in style.css that fades in while is-night is already quietly starting
 * its own fade, so the scene reads as "warming, then cooling into night"
 * instead of jumping straight to night art.
 */
export function setTimeOfDay(period) {
  const isNight = period === "night" || period === "sunset";
  document.body.classList.toggle("is-night", isNight);
  document.body.classList.toggle("is-day", !isNight);
  document.body.classList.toggle("is-dawn", period === "dawn");
  document.body.classList.toggle("is-sunset", period === "sunset");
}

/** Tiny deterministic hash — same shape as environmentState.js's private
 * seededFraction, kept local here since it's a presentation-only concern
 * (which/how-many butterflies render) rather than scene-state logic. */
function seededFraction(seedString) {
  let hash = 0;
  for (let i = 0; i < seedString.length; i++) {
    hash = (hash << 5) - hash + seedString.charCodeAt(i);
    hash |= 0;
  }
  return (hash >>> 0) / 4294967296;
}

/**
 * Shows 1-3 of the three .butterfly elements in #butterfly-layer, and
 * shuffles *which* ones, based on a daily seed — stable across
 * reloads/reconnects on the same day, varied day to day, so it isn't
 * always the same one or two butterflies (or always the ones that land)
 * showing up. Call once at startup; doesn't need to re-run on the
 * environment poll interval since it only needs to change once a day.
 */
export function applyDailyButterflyCount(date = new Date()) {
  const layer = el.butterflyLayer();
  if (!layer) return;
  const dayKey = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
  const count = 1 + Math.floor(seededFraction(`butterfly-count-${dayKey}`) * 3); // 1..3

  [...layer.children]
    .map((node, i) => ({ node, order: seededFraction(`butterfly-order-${dayKey}-${i}`) }))
    .sort((a, b) => a.order - b.order)
    .forEach((entry, rank) => {
      entry.node.style.display = rank < count ? "" : "none";
    });
}

/**
 * Art Mode — the minimal-UI toggle. Entirely self-contained here: no
 * state needs to travel back to main.js, since it's a local, per-device
 * presentation preference only (not synced between Pink and Lavender via
 * Firestore). Toggles body.art-mode, which style.css uses to fade out
 * every #app element except the background art and this button itself,
 * plus notifications and the library hub (while closed).
 */
export function bindArtModeToggle() {
  const btn = el.artModeToggle();
  if (!btn) return;
  btn.addEventListener("click", () => {
    const isArtMode = !document.body.classList.contains("art-mode");
    document.body.classList.toggle("art-mode", isArtMode);
    btn.setAttribute("aria-pressed", String(isArtMode));
  });
}
