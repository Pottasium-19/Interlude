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
const STREAK_DURATION_MS = 2400;
const TRAIL_DOT_INTERVAL_MS = 90;
const TRAIL_DOT_LIFETIME_MS = 900;

function isNight() {
  return document.body.classList.contains("is-night");
}

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function spawnStreak() {
  const mount = document.getElementById("shooting-star-layer");
  if (!mount) return;

  // Full edge-to-edge flight across the top portion of the screen — starts
  // just off one side and travels to just off the other, rather than a
  // short diagonal streak. Direction (left->right vs right->left) is
  // randomized; a gentle downward drift is layered on for a natural arc.
  const fromLeft = Math.random() < 0.5;
  const startXVw = fromLeft ? -8 : 108;
  const startYVh = randomBetween(4, 28);
  const dxVw = (fromLeft ? 1 : -1) * randomBetween(112, 128);
  const dyVh = randomBetween(4, 14);
  const angleDeg = Math.atan2(dyVh, dxVw) * (180 / Math.PI);

  const star = document.createElement("span");
  star.className = "shooting-star";
  star.style.left = `${startXVw}vw`;
  star.style.top = `${startYVh}vh`;
  star.style.width = `${randomBetween(150, 220)}px`;
  star.style.setProperty("--tx", `${dxVw}vw`);
  star.style.setProperty("--ty", `${dyVh}vh`);
  star.style.setProperty("--angle", `${angleDeg}deg`);
  star.style.animationDuration = `${STREAK_DURATION_MS}ms`;
  mount.appendChild(star);

  // Flowing trail: a fading dot dropped at the star's current position on
  // an interval, so a trail visibly persists behind it until the flight
  // completes (same spawn/self-remove shape as pixie dust). Position is
  // interpolated linearly against elapsed time — a close approximation of
  // the ease-out motion, plenty accurate for a fading trail dot.
  const startTime = performance.now();
  const trailTimer = setInterval(() => {
    const t = Math.min((performance.now() - startTime) / STREAK_DURATION_MS, 1);
    const dot = document.createElement("span");
    dot.className = "shooting-star-trail-dot";
    dot.style.left = `${startXVw + dxVw * t}vw`;
    dot.style.top = `${startYVh + dyVh * t}vh`;
    mount.appendChild(dot);
    setTimeout(() => dot.remove(), TRAIL_DOT_LIFETIME_MS);
  }, TRAIL_DOT_INTERVAL_MS);

  setTimeout(() => {
    clearInterval(trailTimer);
    star.remove();
  }, STREAK_DURATION_MS + 100);
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
