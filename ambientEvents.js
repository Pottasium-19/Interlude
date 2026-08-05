// ambientEvents.js
// Single responsibility: schedule and gate the rare, decorative "living
// garden" moments introduced in Phase 5 (wind gusts, and later shooting
// stars / the magical visitor). Owns one shared lock so rare events never
// overlap, and owns the wind-gust timer loop. Pure DOM class-toggling only
// — no Firestore, no sync state, nothing here is shared between the two
// players' devices.

let activeRareEvent = null;

/** True if some rare event currently holds the lock. */
export function isRareEventActive() {
  return activeRareEvent !== null;
}

/**
 * Attempt to claim the shared rare-event lock for `name`. Returns true if
 * claimed, false if another rare event is already running (caller should
 * skip this occurrence, not queue it).
 */
export function acquireRareEvent(name) {
  if (activeRareEvent !== null) return false;
  activeRareEvent = name;
  return true;
}

/** Release the lock. Safe to call even if `name` doesn't hold it. */
export function releaseRareEvent(name) {
  if (activeRareEvent === name) activeRareEvent = null;
}

const GUST_MIN_INTERVAL_MS = 45 * 1000;
const GUST_MAX_INTERVAL_MS = 110 * 1000;
const GUST_DURATION_MS = 5 * 1000;

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function runGust() {
  if (!acquireRareEvent("wind-gust")) {
    scheduleNextGust();
    return;
  }
  document.body.classList.add("is-gusting");
  setTimeout(() => {
    document.body.classList.remove("is-gusting");
    releaseRareEvent("wind-gust");
    scheduleNextGust();
  }, GUST_DURATION_MS);
}

function scheduleNextGust() {
  setTimeout(runGust, randomBetween(GUST_MIN_INTERVAL_MS, GUST_MAX_INTERVAL_MS));
}

/** Call once at startup to begin the recurring wind-gust cycle. */
export function scheduleWindGusts() {
  scheduleNextGust();
}
