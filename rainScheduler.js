// rainScheduler.js
// Single responsibility: decide WHEN rain starts/stops, at random
// intervals, on days environmentState.js's shouldShowRain() flags as
// rainy. Manual override (devTimeOverride.js) always wins over the
// random schedule.

import { shouldShowRain, getRainOverride } from "./environmentState.js";
import { setRain } from "./ui.js";

const AUTO_RECHECK_MS = 4 * 60 * 1000;
const OVERRIDE_RECHECK_MS = 30 * 1000;
const SHOWER_START_CHANCE = 0.35;
const SHOWER_MIN_MS = 3 * 60 * 1000;
const SHOWER_MAX_MS = 9 * 60 * 1000;
const GAP_MIN_MS = 2 * 60 * 1000;
const GAP_MAX_MS = 6 * 60 * 1000;

let timer = null;

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function isCurrentlyRaining() {
  return document.body.classList.contains("is-rain");
}

function tick() {
  const override = getRainOverride();
  if (override !== null) {
    setRain(override);
    timer = setTimeout(tick, OVERRIDE_RECHECK_MS);
    return;
  }

  if (!shouldShowRain()) {
    setRain(false);
    timer = setTimeout(tick, AUTO_RECHECK_MS);
    return;
  }

  if (!isCurrentlyRaining() && Math.random() < SHOWER_START_CHANCE) {
    setRain(true);
    const showerMs = randomBetween(SHOWER_MIN_MS, SHOWER_MAX_MS);
    timer = setTimeout(() => {
      setRain(false);
      timer = setTimeout(tick, randomBetween(GAP_MIN_MS, GAP_MAX_MS));
    }, showerMs);
    return;
  }

  timer = setTimeout(tick, AUTO_RECHECK_MS);
}

/** Call once at startup to begin the random rain scheduler. */
export function scheduleRain() {
  tick();
}
