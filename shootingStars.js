// shootingStars.js
// Single responsibility: occasionally spawn a very brief, silent shooting-
// star streak across the night sky. Night-only, extremely rare — rarer
// than wind gusts — and mutually exclusive with wind gusts / the magical
// visitor via ambientEvents.js's shared rare-event lock. Pure DOM effect;
// the streak element is created, animated via CSS, and removed by JS once
// its animation finishes (same spawn/cleanup shape as pollenTrails.js).

import { acquireRareEvent, releaseRareEvent } from "./ambientEvents.js";

const CHECK_INTERVAL_MS = 20 * 1000;
const SPAWN_CHANCE = 0.25; // rolled every check, only at night, only if the lock is free — tuned to feel "extremely rare" (~10 min average gap)
const STREAK_DURATION_MS = 1000;

function isNight() {
  return document.body.classList.contains("is-night");
}

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function spawnStreak() {
  const mount = document.getElementById("shooting-star-layer");
  if (!mount) return;

  // Start point: upper sky band, in viewport percent (not tied to any
  // fixed artwork coordinate, per the "no hardcoded pixel positions" rule).
  const startXVw = randomBetween(5, 90);
  const startYVh = randomBetween(4, 36);

  // Travel vector: random-ish diagonal, always drifting downward. dx sign
  // is randomized so the streak can head down-left or down-right.
  const dxVw = randomBetween(18, 34) * (Math.random() < 0.5 ? -1 : 1);
  const dyVh = randomBetween(10, 22);
  const angleDeg = Math.atan2(dyVh, dxVw) * (180 / Math.PI);

  const star = document.createElement("span");
  star.className = "shooting-star";
  star.style.left = `${startXVw}vw`;
  star.style.top = `${startYVh}vh`;
  star.style.width = `${randomBetween(60, 105)}px`;
  star.style.setProperty("--tx", `${dxVw}vw`);
  star.style.setProperty("--ty", `${dyVh}vh`);
  star.style.setProperty("--angle", `${angleDeg}deg`);
  mount.appendChild(star);

  setTimeout(() => star.remove(), STREAK_DURATION_MS + 100);
}

function tick() {
  if (isNight() && Math.random() < SPAWN_CHANCE) {
    if (acquireRareEvent("shooting-star")) {
      spawnStreak();
      setTimeout(() => releaseRareEvent("shooting-star"), STREAK_DURATION_MS);
    }
  }
  setTimeout(tick, CHECK_INTERVAL_MS);
}

/** Call once at startup to begin the recurring shooting-star check loop. */
export function scheduleShootingStars() {
  tick();
}
