# Interlude — Phase 1: Synchronization Engine

This is **only** the synchronization engine: two browsers joining one
shared room, a ready/countdown handshake, and a shared player *state*
(no actual media). Everything visual is intentionally bare — this is
the foundation, not the app.

## Folder structure

```
interlude/
├── index.html
├── firestore.rules
├── css/
│   └── style.css
└── js/
    ├── firebase.js   # Firebase init, exports `db`
    ├── clock.js       # local/server clock offset
    ├── room.js        # slot claiming, presence, reconnection
    ├── sync.js        # ready state, countdown, player state
    ├── ui.js           # DOM rendering only, no Firestore
    └── main.js         # wires everything together
```

## 1. Firebase setup

1. Go to the [Firebase console](https://console.firebase.google.com) and create a new project (or reuse one).
2. Enable **Firestore Database** (in *Native mode*, any region).
3. In **Project settings → General → Your apps**, add a **Web app** and copy the config object.
4. Paste those values into `js/firebase.js`, replacing the placeholders:

   ```js
   const firebaseConfig = {
     apiKey: "...",
     authDomain: "...",
     projectId: "...",
     storageBucket: "...",
     messagingSenderId: "...",
     appId: "..."
   };
   ```

5. In **Firestore → Rules**, paste the contents of `firestore.rules` and publish.

No Authentication product needs to be enabled — this phase intentionally has none.

## 2. Deploying to GitHub Pages

1. Push the `interlude/` folder to a GitHub repository (the contents of this folder should be at the repo root, or in `/docs` if you prefer that convention).
2. In the repo, go to **Settings → Pages**.
3. Under **Build and deployment**, set **Source** to "Deploy from a branch", choose your branch and the root (or `/docs`) folder.
4. Save. GitHub will publish the site at `https://<username>.github.io/<repo>/`.
5. Open that URL on two different devices/browsers (or one normal window + one incognito window) to test with two "users".

No build step is required — it's static HTML/CSS/JS loaded as ES modules directly from the CDN-hosted Firebase SDK.

## 3. Firestore structure

```
rooms/main-room                      (doc)
  user1Id, user2Id, createdAt

rooms/main-room/presence/user1       (doc)
rooms/main-room/presence/user2       (doc)
  userId, connected, lastSeen

rooms/main-room/state/ready          (doc)
  user1Ready, user2Ready

rooms/main-room/state/sync           (doc)
  countdownStartAt, countdownId, active

rooms/main-room/state/player         (doc)
  playbackState, lastAction, actionBy, actionAt

rooms/main-room/meta/clockSync       (doc)
  pingAt   (transient, used only to measure clock offset)
```

Each concern (membership, presence, readiness, countdown, player) lives in its own document, so listeners only fire for the data they actually care about — no cross-contamination, easy to extend later.

## 4. How the synchronization works

**Joining.** Each browser generates a random ID on first visit and stores it in `localStorage`. A Firestore transaction claims the first open slot (`user1` or `user2`) in the room doc. On refresh, the same browser reclaims its existing slot instead of taking a new one, which is what makes reconnection seamless.

**Presence.** Each user writes a heartbeat (`lastSeen`) to their own presence doc every 5 seconds. The other client watches that doc *and* independently re-checks every 5 seconds whether the last heartbeat is older than 15 seconds. This dual approach (listener + polling staleness check) means a disconnect is detected even if the losing tab never got to fire a cleanup event (e.g. lost wifi, force-closed app).

**Ready system.** Each user's ready flag is a boolean field on one shared doc. Both clients watch it, so both instantly see when the other becomes ready.

**Shared countdown — the reliability-critical part.** Two clients cannot just start a `setTimeout(3000)` locally at "the moment both are ready", because network latency means they won't receive that both-ready state at the same instant. Instead:

1. Both devices first sync their clock against Firestore's server clock (`clock.js`), producing a correction offset.
2. Once both are ready, exactly one client (`user1`, by convention, to avoid both writing slightly different timestamps) writes a **shared future timestamp** — "now" (server-corrected) + 3 seconds — plus a random `countdownId`.
3. Both clients receive that same timestamp via their listener and run a local `setInterval` that computes `remaining = sharedTimestamp - correctedNow()`.
4. Because both devices are working from the same corrected clock and the same target timestamp, "GO" fires at the same real-world moment on both screens, regardless of who has faster or slower internet.
5. The `countdownId` prevents a client from re-running a countdown it's already handled if the doc updates again for unrelated reasons.

**Shared player state.** Pressing Play/Pause/Previous/Next writes an action + resulting state to one shared doc. The other client's listener fires immediately and updates its display. There is no media player underneath yet — this only proves the state propagates correctly, which is what a future YouTube player will hook into.

**Reconnection.** On load, `claimSlot()` restores the same slot from `localStorage` and every listener re-attaches to the same documents, so a refreshed page picks the current ready/countdown/player state right back up. Firestore's SDK also automatically queues writes offline and flushes them on reconnect, so brief network drops don't lose actions.

## 5. Suggestions for scaling this later

- **Multiple rooms.** Replace the hardcoded `main-room` ID with a room code in the URL (e.g. `?room=abc123`) — the doc paths are already parameterized by `ROOM_ID`, so this is a small change.
- **Presence via Realtime Database.** Firestore has no native `onDisconnect`; if reliable presence becomes more important, consider pairing Firestore (data) with Realtime Database (presence only), which does support `onDisconnect()` server-side.
- **Cloud Functions for countdown authority.** Right now "user1 writes the countdown" is a convention, not an enforced rule. A Cloud Function triggered on the ready doc could own that responsibility server-side, removing any race-condition edge case entirely.
- **Rate limiting / abuse protection.** Since there's no auth, consider Firebase App Check to ensure only your deployed site can write, without requiring user accounts.
- **The YouTube layer.** When it's time, `sync.js`'s player state (`waiting` / `playing` / `paused` + `lastAction`) is exactly what a `YT.Player` instance should listen to and drive — this phase deliberately built that contract first.
