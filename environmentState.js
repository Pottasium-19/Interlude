// environmentState.js
// Single responsibility: derive which ambient scene effects should be
// active, based purely on time. No DOM, no animation, no Firestore, no
// other module dependencies.
//
// Design note (no spec was given for what drives rain/aurora/rainbow,
// since there's no weather data source): rain and aurora are derived
// deterministically from the calendar day, via a simple seeded hash —
// so the scene feels naturally varied day to day, but is stable across
// reloads/reconnects on the same day rather than flickering randomly.
// Rainbow only appears on a rainy day, during daylight hours (dawn/
// day/sunset), never at night. Adjust the threshold constants below if
// you want these effects to appear more or less often.

const DAWN_START_HOUR = 5;
const DAY_START_HOUR = 8;
const SUNSET_START_HOUR = 18;
const NIGHT_START_HOUR = 20;

// Rough odds per calendar day. 0.2 = ~1 in 5 days.
const RAIN_CHANCE = 0.2;
const RAINBOW_CHANCE_GIVEN_RAIN = 0.5;
const AURORA_CHANCE = 0.1;

/** Tiny deterministic hash, so the same dayKey always yields the same float in [0, 1). */
function seededFraction(seedString) {
  let hash = 0;
  for (let i = 0; i < seedString.length; i++) {
    hash = (hash << 5) - hash + seedString.charCodeAt(i);
    hash |= 0; // keep it a 32-bit int
  }
  return (hash >>> 0) / 4294967296; // normalize to [0, 1)
}

function dayKey(date) {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

/**
 * Returns 'dawn', 'day', 'sunset', or 'night' for the given date's
 * local hour. Defaults to the current time if no date is passed.
 */
export function getTimePeriod(date = new Date()) {
  const hour = date.getHours();
  if (hour >= NIGHT_START_HOUR || hour < DAWN_START_HOUR) return "night";
  if (hour >= SUNSET_START_HOUR) return "sunset";
  if (hour >= DAY_START_HOUR) return "day";
  return "dawn";
}

/** Whether it's a "rainy" day, per the deterministic daily seed. */
export function shouldShowRain(date = new Date()) {
  return seededFraction(`rain-${dayKey(date)}`) < RAIN_CHANCE;
}

/** Rainbows only show on rainy days, and only in daylight (never at night). */
export function shouldShowRainbow(date = new Date()) {
  if (getTimePeriod(date) === "night") return false;
  if (!shouldShowRain(date)) return false;
  return seededFraction(`rainbow-${dayKey(date)}`) < RAINBOW_CHANCE_GIVEN_RAIN;
}

/** Auroras are a rare night-only effect, per the deterministic daily seed. */
export function shouldShowAurora(date = new Date()) {
  if (getTimePeriod(date) !== "night") return false;
  return seededFraction(`aurora-${dayKey(date)}`) < AURORA_CHANCE;
}

/** Fireflies show every night, unconditionally. */
export function shouldShowFireflies(date = new Date()) {
  return getTimePeriod(date) === "night";
}

/** Bundles all of the above into one simple state object for a given moment. */
export function getSceneState(date = new Date()) {
  return {
    timePeriod: getTimePeriod(date),
    showRain: shouldShowRain(date),
    showRainbow: shouldShowRainbow(date),
    showAurora: shouldShowAurora(date),
    showFireflies: shouldShowFireflies(date)
  };
}
