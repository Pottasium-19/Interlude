// magicalVisitor.js
// Single responsibility: the rare, signature "magical visitor" moment —
// a glowing butterfly (day) or firefly (night) that travels from one
// identity flower to the other along a handcrafted, non-linear path,
// then arrives, greets the flower, and fades away. Dedicated module
// (flagged per the phase-5 prompt) given the choreography/path-template
// complexity — everything here is presentational DOM/CSS orchestration,
// no Firestore, no sync state. Reuses ambientEvents.js's shared
// rare-event lock so this never overlaps wind gusts or shooting stars,
// and is deliberately the rarest event in the app.

import { acquireRareEvent, releaseRareEvent } from "./ambientEvents.js";

const CHECK_INTERVAL_MS = 30 * 1000;
const SPAWN_CHANCE = 0.17; // ~1 in 50 checks — rarer than shooting stars, by design

const FLIGHT_DURATION_MS = 16000;
const CIRCLE_DURATION_MS = 2400;
const REST_DURATION_MS = 1300;
const FADE_DURATION_MS = 1800;
const PARTICLE_DURATION_MS = 4500;
const PIXIE_DUST_INTERVAL_MS = 550;
const FLOWER_WELCOME_DURATION_MS = 2600;

const DAY_PALETTE = ["#f2c14e", "#fbf6e9", "#f7cba4", "#cdb8e8", "#f4c2d7"]; // Warm Gold, Ivory, Pale Peach, Soft Lavender, Pale Pink
const NIGHT_PALETTE = ["#f5f7ff", "#a8c8f0", "#a9eaea", "#c3a9e8"]; // Moon White, Soft Blue, Pale Cyan, Gentle Violet

/**
 * Handcrafted path templates, authored as waypoints in normalized
 * "u = progress along the straight line between the two flowers (0..1),
 * v = perpendicular offset as a fraction of that line's length" space.
 * pointAt() below converts these into real screen points for whichever
 * two flowers are actually involved, so the same template mirrors and
 * reverses correctly no matter which flower is the start. Weight controls
 * selection odds; "heart" is deliberately rare.
 */
const PATH_TEMPLATES = [
  { name: "gentle-arc", weight: 5, waypoints: [
    { u: 0, v: 0 }, { u: 0.22, v: -0.50 }, { u: 0.45, v: -0.40 }, { u: 0.6, v: 0.05 },
    { u: 0.75, v: 0.35 }, { u: 0.9, v: 0.13 }, { u: 1, v: 0 }
  ] },
  { name: "s-curve", weight: 5, waypoints: [
    { u: 0, v: 0 }, { u: 0.2, v: -0.45 }, { u: 0.4, v: -0.12 }, { u: 0.55, v: 0.35 },
    { u: 0.72, v: 0.50 }, { u: 0.88, v: 0.15 }, { u: 1, v: 0 }
  ] },
  { name: "big-loop", weight: 4, waypoints: [
    { u: 0, v: 0 }, { u: 0.18, v: -0.35 }, { u: 0.32, v: -0.65 }, { u: 0.40, v: -0.25 },
    { u: 0.46, v: 0.25 }, { u: 0.38, v: 0.50 }, { u: 0.34, v: 0.15 },
    { u: 0.48, v: -0.15 }, { u: 0.65, v: 0.20 }, { u: 0.82, v: 0.38 }, { u: 1, v: 0 }
  ] },
  { name: "wandering-pause", weight: 4, waypoints: [
    { u: 0, v: 0 }, { u: 0.12, v: 0.40 }, { u: 0.26, v: 0.50 }, { u: 0.34, v: 0.25 }, { u: 0.34, v: 0.25 },
    { u: 0.46, v: -0.15 }, { u: 0.58, v: -0.45 }, { u: 0.68, v: -0.20 }, { u: 0.68, v: -0.20 },
    { u: 0.82, v: 0.25 }, { u: 0.94, v: 0.05 }, { u: 1, v: 0 }
  ] },
  // A loose heart trace, sized up along with the other templates but kept
  // proportionally recognizable — not meant to be an obvious symbol, just
  // noticeable enough that someone watching closely might catch it. Kept
  // rare via a low weight below.
  { name: "heart", weight: 1.2, waypoints: [
    { u: 0, v: 0 }, { u: 0.16, v: -0.20 }, { u: 0.26, v: -0.45 }, { u: 0.34, v: -0.55 }, { u: 0.42, v: -0.42 },
    { u: 0.46, v: -0.15 }, { u: 0.5, v: 0.15 }, { u: 0.54, v: -0.15 }, { u: 0.58, v: -0.42 },
    { u: 0.66, v: -0.55 }, { u: 0.74, v: -0.45 }, { u: 0.84, v: -0.20 }, { u: 1, v: 0 }
  ] }
];
function pickTemplate() {
  const total = PATH_TEMPLATES.reduce((sum, t) => sum + t.weight, 0);
  let roll = Math.random() * total;
  for (const t of PATH_TEMPLATES) {
    if (roll < t.weight) return t;
    roll -= t.weight;
  }
  return PATH_TEMPLATES[0];
}

function pointAt(start, angle, distance, u, v) {
  const alongX = Math.cos(angle) * distance * u;
  const alongY = Math.sin(angle) * distance * u;
  const perpX = -Math.sin(angle) * distance * v;
  const perpY = Math.cos(angle) * distance * v;
  return { x: start.x + alongX + perpX, y: start.y + alongY + perpY };
}

/** Smooths an ordered list of screen points into a cubic-bezier SVG path. */
function catmullRomToBezierPath(points) {
  const pts = [points[0], ...points, points[points.length - 1]];
  let d = `M ${points[0].x.toFixed(1)},${points[0].y.toFixed(1)} `;
  for (let i = 1; i < pts.length - 2; i++) {
    const p0 = pts[i - 1], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2];
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += `C ${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)} `;
  }
  return d.trim();
}

// Bigger loops can push a point past the visible viewport, so each
// computed point is pulled back inside a small margin — keeps the path
// dramatic without ever sending the visitor fully off-screen.
function clampToViewport(point) {
  const margin = 24;
  return {
    x: Math.min(Math.max(point.x, margin), window.innerWidth - margin),
    y: Math.min(Math.max(point.y, margin), window.innerHeight - margin)
  };
}

function buildFlightPath(template, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const distance = Math.hypot(dx, dy);
  const angle = Math.atan2(dy, dx);
  const points = template.waypoints
    .map(({ u, v }) => pointAt(start, angle, distance, u, v))
    .map(clampToViewport);
  return catmullRomToBezierPath(points);
}

function flowerCenter(flowerId) {
  const node = document.getElementById(`garden-flower-${flowerId}`);
  if (!node) return null;
  const graphic = node.querySelector(".garden-flower__graphic") || node;
  const rect = graphic.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

function pickColor(isDay) {
  const palette = isDay ? DAY_PALETTE : NIGHT_PALETTE;
  return palette[Math.floor(Math.random() * palette.length)];
}

function spawnPixieDust(mount, visitorEl, color) {
  const rect = visitorEl.getBoundingClientRect();
  const dot = document.createElement("span");
  dot.className = "pixie-dust-mote";
  dot.style.left = `${rect.left + rect.width / 2}px`;
  dot.style.top = `${rect.top + rect.height / 2}px`;
  dot.style.setProperty("--visitor-color", color);
  mount.appendChild(dot);
  setTimeout(() => dot.remove(), 2100);
}

function spawnFarewellParticle(mount, center, color) {
  const particle = document.createElement("span");
  particle.className = "magical-visitor-particle";
  particle.style.left = `${center.x}px`;
  particle.style.top = `${center.y}px`;
  particle.style.setProperty("--visitor-color", color);
  mount.appendChild(particle);
  setTimeout(() => particle.remove(), PARTICLE_DURATION_MS + 100);
}

function triggerFlowerWelcome(flowerId) {
  const node = document.getElementById(`garden-flower-${flowerId}`);
  if (!node) return;
  node.classList.add("garden-flower--visited");
  setTimeout(() => node.classList.remove("garden-flower--visited"), FLOWER_WELCOME_DURATION_MS);
}

function runVisit() {
  const isDay = document.body.classList.contains("is-day");
  const isNight = document.body.classList.contains("is-night");
  if (!isDay && !isNight) return; // dawn/sunset ambiguity — sit out, same as other effects' day/night checks

  const mount = document.getElementById("magical-visitor-layer");
  if (!mount) return;

  const startId = Math.random() < 0.5 ? "pink" : "lavender";
  const endId = startId === "pink" ? "lavender" : "pink";
  const start = flowerCenter(startId);
  const end = flowerCenter(endId);
  if (!start || !end) return;

  if (!acquireRareEvent("magical-visitor")) return;

  const template = pickTemplate();
  const pathD = buildFlightPath(template, start, end);
  const color = pickColor(isDay);

  const visitor = document.createElement("span");
  visitor.className = `magical-visitor ${isDay ? "magical-visitor--butterfly" : "magical-visitor--firefly"}`;
  visitor.style.setProperty("--visitor-color", color);
  visitor.style.offsetPath = `path('${pathD}')`;
  visitor.style.offsetRotate = "auto";
  visitor.style.offsetDistance = "0%";
  visitor.style.animation =
    `magical-visitor-pulse 3.4s ease-in-out infinite, magical-visitor-fly ${FLIGHT_DURATION_MS}ms ease-in-out forwards`;
  mount.appendChild(visitor);
  requestAnimationFrame(() => visitor.classList.add("magical-visitor--visible"));

  // Pixie-dust trail now applies to both variants (not day-only) — dots
  // fade individually a couple seconds after being dropped, so the trail
  // naturally lingers and fades out shortly after the flight completes.
  const dustTimer = setInterval(() => spawnPixieDust(mount, visitor, color), PIXIE_DUST_INTERVAL_MS);

  setTimeout(() => {
    if (dustTimer) clearInterval(dustTimer);

    // Pin the arrival position before swapping the animation list, since
    // removing the fly animation would otherwise also drop its frozen
    // (forwards) offset-distance value.
    visitor.style.offsetDistance = "100%";
    visitor.style.animation = `magical-visitor-pulse 3.4s ease-in-out infinite, magical-visitor-circle ${CIRCLE_DURATION_MS}ms ease-in-out 1`;
    triggerFlowerWelcome(endId);

    setTimeout(() => {
      // Rest briefly — back to just the idle pulse, no travel/circle motion.
      visitor.style.animation = "magical-visitor-pulse 3.4s ease-in-out infinite";

      setTimeout(() => {
        visitor.classList.remove("magical-visitor--visible"); // fade out

        setTimeout(() => {
          visitor.remove();
          spawnFarewellParticle(mount, end, color);
          releaseRareEvent("magical-visitor");
        }, FADE_DURATION_MS);
      }, REST_DURATION_MS);
    }, CIRCLE_DURATION_MS);
  }, FLIGHT_DURATION_MS);
}

function tick() {
  if (Math.random() < SPAWN_CHANCE) {
    runVisit();
  }
  setTimeout(tick, CHECK_INTERVAL_MS);
}

/** Call once at startup to begin the recurring magical-visitor check loop. */
export function scheduleMagicalVisitor() {
  tick();
}
