// rainDrops.js
// Single responsibility: occasionally flag a garden flower with a
// raindrop-hit ripple while it's raining. Purely decorative.

const CHECK_INTERVAL_MS = 3800;
const HIT_CHANCE = 0.18;
const HIT_LIFETIME_MS = 1500;

function isRaining() {
  return document.body.classList.contains("is-rain");
}

function spawnRaindropHit() {
  const flowers = document.querySelectorAll(".garden-flower__graphic");
  if (!flowers.length) return;
  const flower = flowers[Math.floor(Math.random() * flowers.length)];
  flower.classList.add("garden-flower__graphic--raindrop");
  setTimeout(() => flower.classList.remove("garden-flower__graphic--raindrop"), HIT_LIFETIME_MS);
}

function tick() {
  if (isRaining() && Math.random() < HIT_CHANCE) spawnRaindropHit();
  setTimeout(tick, CHECK_INTERVAL_MS);
}

/** Call once at startup to begin the recurring raindrop-hit check loop. */
export function scheduleRaindropHits() {
  tick();
}
