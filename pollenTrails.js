// pollenTrails.js
// Single responsibility: occasionally spawn a faint, self-dispersing
// pollen-trail dot near one of the day butterflies' current position.
// Purely decorative DOM effect, day-only. Deliberately intermittent —
// most butterfly flights leave no trail. Not gated by ambientEvents.js's
// rare-event lock: this is ambient texture, not a mutually-exclusive
// "moment" like wind gusts / shooting stars / the magical visitor.

const CHECK_INTERVAL_MS = 2600;
const SPAWN_CHANCE = 0.22; // rolled on each check, only while it's day
const TRAIL_LIFETIME_MS = 3200;

function isDaytime() {
  return document.body.classList.contains("is-day");
}

function isRaining() {
  return document.body.classList.contains("is-rain");
}

function spawnTrailDot() {
  const butterflies = document.querySelectorAll("#butterfly-layer .butterfly");
  const visible = Array.from(butterflies).filter((b) => b.offsetParent !== null);
  if (visible.length === 0) return;

  const butterfly = visible[Math.floor(Math.random() * visible.length)];
  const rect = butterfly.getBoundingClientRect();
  const mount = document.getElementById("pollen-layer");
  if (!mount) return;

  const dot = document.createElement("span");
  dot.className = "pollen-trail-dot";
  dot.style.left = `${rect.left + rect.width / 2}px`;
  dot.style.top = `${rect.top + rect.height / 2}px`;
  mount.appendChild(dot);

  setTimeout(() => dot.remove(), TRAIL_LIFETIME_MS);
}

function tick() {
  if (isDaytime() && !isRaining() && Math.random() < SPAWN_CHANCE) {
    spawnTrailDot();
  }
  setTimeout(tick, CHECK_INTERVAL_MS);
}

/** Call once at startup to begin the recurring pollen-trail check loop. */
export function schedulePollenTrails() {
  tick();
}
