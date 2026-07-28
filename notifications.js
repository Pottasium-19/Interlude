// notifications.js
// Single responsibility: a small, reusable in-app notification panel.
// No knowledge of playback/sync/room/flower/library logic — call
// notify(type, message) from anywhere in the app to surface a
// user-visible message instead of a silent console.error or a
// blocking browser alert().
//
// The panel container (#notification-panel, in index.html) and the
// "notification"/"notification-<type>" class names are the only
// contract this relies on — a future visual redesign (e.g. the
// floating "sky notification" look) only needs to restyle those in
// CSS, without this function or any of its call sites changing.

const CONTAINER_ID = "notification-panel";
const AUTO_DISMISS_MS = 4000;
const VALID_TYPES = ["success", "info", "warning", "error"];

/**
 * Shows a notification. `type` is one of "success" | "info" |
 * "warning" | "error" (falls back to "info" for anything else).
 * Auto-dismisses after a few seconds. Never throws, never blocks —
 * safe to call and forget from anywhere in the app.
 */
export function notify(type, message) {
  const safeType = VALID_TYPES.includes(type) ? type : "info";
  const container = document.getElementById(CONTAINER_ID);
  if (!container) {
    console.error("notifications.js: #notification-panel not found in DOM");
    return;
  }

  const item = document.createElement("div");
  item.className = `notification notification-${safeType}`;
  item.textContent = message;
  container.appendChild(item);

  setTimeout(() => {
    item.remove();
  }, AUTO_DISMISS_MS);
}
