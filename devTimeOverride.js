// devTimeOverride.js
// Single responsibility: a hidden testing aid — long-press anywhere on
// the garden (excluding real interactive elements) opens a small
// Day/Night/Auto picker that overrides environmentState.js's time-of-day
// detection for this tab only. The override lives purely in memory
// (environmentState.js's module state, no storage), so it applies for
// the current session and resets automatically on reload. Real
// clock-based detection is untouched and resumes whenever no override
// is set — this file only ever calls the same setTimeOfDay()/
// getTimePeriod() the real detection already uses.

import { setTimePeriodOverride, getTimePeriod, setRainOverride } from "./environmentState.js";
import { setTimeOfDay, setRain } from "./ui.js";

const LONG_PRESS_MS = 600;
const MOVE_TOLERANCE_PX = 12;

let pressTimer = null;
let pressStart = null;

function isInteractiveTarget(target) {
  return !!target.closest("button, a, input, textarea, select, #dev-time-picker");
}

function applyOverride(period) {
  setTimePeriodOverride(period); // "day" | "night" | null (null = back to real clock)
  setTimeOfDay(getTimePeriod());
}

function applyRainOverride(value) {
  setRainOverride(value); // true | false | null
  if (value !== null) setRain(value);
}

function closePicker() {
  const existing = document.getElementById("dev-time-picker");
  if (existing) existing.remove();
  document.removeEventListener("pointerdown", handleOutsideClick, true);
}

function handleOutsideClick(event) {
  const picker = document.getElementById("dev-time-picker");
  if (picker && !picker.contains(event.target)) closePicker();
}

function buildPicker() {
  const picker = document.createElement("div");
  picker.id = "dev-time-picker";
  picker.setAttribute("role", "dialog");
  picker.setAttribute("aria-label", "Test time of day");

  const heading = document.createElement("p");
  heading.className = "dev-time-picker__heading";
  heading.textContent = "Preview as:";
  picker.appendChild(heading);

  [
    { label: "Day", value: "day" },
    { label: "Night", value: "night" },
    { label: "Auto (real time)", value: null }
  ].forEach(({ label, value }) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "dev-time-picker__option";
    btn.textContent = label;
    btn.addEventListener("click", () => {
      applyOverride(value);
      closePicker();
    });
    picker.appendChild(btn);
  });

  const rainHeading = document.createElement("p");
  rainHeading.className = "dev-time-picker__heading";
  rainHeading.textContent = "Rain:";
  picker.appendChild(rainHeading);

  [
    { label: "Rain On", value: true },
    { label: "Rain Off", value: false },
    { label: "Rain Auto", value: null }
  ].forEach(({ label, value }) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "dev-time-picker__option";
    btn.textContent = label;
    btn.addEventListener("click", () => {
      applyRainOverride(value);
      closePicker();
    });
    picker.appendChild(btn);
  });
  
  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.className = "dev-time-picker__cancel";
  cancelBtn.textContent = "Cancel";
  cancelBtn.addEventListener("click", closePicker);
  picker.appendChild(cancelBtn);

  return picker;
}

function openPicker() {
  closePicker();
  document.body.appendChild(buildPicker());
  setTimeout(() => document.addEventListener("pointerdown", handleOutsideClick, true), 0);
}

function cancelPress() {
  if (pressTimer) clearTimeout(pressTimer);
  pressTimer = null;
  pressStart = null;
}

function handlePointerDown(event) {
  if (isInteractiveTarget(event.target)) return;
  pressStart = { x: event.clientX, y: event.clientY };
  pressTimer = setTimeout(() => {
    pressTimer = null;
    openPicker();
  }, LONG_PRESS_MS);
}

function handlePointerMove(event) {
  if (!pressStart) return;
  if (Math.hypot(event.clientX - pressStart.x, event.clientY - pressStart.y) > MOVE_TOLERANCE_PX) {
    cancelPress();
  }
}

/** Call once at startup to arm the long-press-anywhere test picker. */
export function bindDevTimeOverride() {
  document.addEventListener("pointerdown", handlePointerDown);
  document.addEventListener("pointermove", handlePointerMove);
  document.addEventListener("pointerup", cancelPress);
  document.addEventListener("pointercancel", cancelPress);
}
