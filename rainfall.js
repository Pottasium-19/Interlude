// rainfall.js
// Single responsibility: a small fixed-size pool of individually
// animated raindrop elements inside #rain-layer. Each drop gets its
// own randomized position, length, angle, drift, speed, and opacity,
// and is recycled (not destroyed) when its fall finishes — so the
// DOM node count never grows, but no two drops read as a repeated
// row/column or a synchronized sheet.

const POOL_SIZE = 14;
const RECHECK_MS = 4000;
const INITIAL_STAGGER_MS = 7000;

function isRaining() {
  return document.body.classList.contains("is-rain");
}

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function configureDrop(drop) {
  drop.style.setProperty("--x", `${randomBetween(-5, 105)}%`);
  drop.style.setProperty("--len", `${randomBetween(9, 24)}px`);
  drop.style.setProperty("--dur", `${randomBetween(4, 8)}s`);
  drop.style.setProperty("--drift", `${randomBetween(10, 32)}px`);
  drop.style.setProperty("--angle", `${randomBetween(4, 11)}deg`);
  drop.style.setProperty("--op", randomBetween(0.16, 0.38));
}

function launchDrop(drop) {
  if (!isRaining()) {
    setTimeout(() => launchDrop(drop), RECHECK_MS);
    return;
  }
  configureDrop(drop);
  drop.classList.remove("is-falling");
  void drop.offsetWidth; // reflow so the animation restarts cleanly
  drop.classList.add("is-falling");
}

function buildPool(container) {
  for (let i = 0; i < POOL_SIZE; i++) {
    const drop = document.createElement("span");
    drop.className = "raindrop";
    container.appendChild(drop);
    drop.addEventListener("animationend", () => launchDrop(drop));
    setTimeout(() => launchDrop(drop), randomBetween(0, INITIAL_STAGGER_MS));
  }
}

/** Call once at startup to build and begin the raindrop pool. */
export function scheduleRainfall() {
  const container = document.getElementById("rain-layer");
  if (!container) return;
  buildPool(container);
}
