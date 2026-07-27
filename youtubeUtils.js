// youtubeUtils.js
// Single responsibility: parse a YouTube URL or raw ID string down to
// the 11-character video ID. No DOM, no Firestore, no other module
// dependencies.

const VIDEO_ID_PATTERN = /^[a-zA-Z0-9_-]{11}$/;

/**
 * Extracts an 11-character YouTube video ID from:
 *   - youtube.com/watch?v=VIDEOID (plus any extra query params)
 *   - youtu.be/VIDEOID
 *   - youtube.com/embed/VIDEOID
 *   - youtube.com/shorts/VIDEOID
 *   - a raw 11-character video ID with no URL at all
 *
 * Returns the video ID string if valid, otherwise null. Never throws —
 * malformed input (wrong type, empty string, unrelated URL) just
 * resolves to null.
 */
export function extractVideoId(input) {
  if (typeof input !== "string") return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Raw ID, no URL structure at all.
  if (VIDEO_ID_PATTERN.test(trimmed)) return trimmed;

  let url;
  try {
    // Support bare "youtube.com/..." input by assuming https if no
    // scheme was given.
    url = new URL(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }

  const host = url.hostname.replace(/^www\./, "").replace(/^m\./, "");
  let candidate = null;

  if (host === "youtu.be") {
    // youtu.be/VIDEOID
    candidate = url.pathname.split("/").filter(Boolean)[0] || null;
  } else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    const segments = url.pathname.split("/").filter(Boolean);

    if (url.pathname === "/watch") {
      candidate = url.searchParams.get("v");
    } else if (segments[0] === "embed" || segments[0] === "shorts" || segments[0] === "live") {
      candidate = segments[1] || null;
    }
  }

  // OLD (end of file):
  return candidate && VIDEO_ID_PATTERN.test(candidate) ? candidate : null;
}

// NEW (append after it):
  return candidate && VIDEO_ID_PATTERN.test(candidate) ? candidate : null;
}

/**
 * Fetches a video's display title via YouTube's public oEmbed endpoint —
 * no API key required. Returns the title string on success, or null on
 * any failure (network error, non-200 response, private/unembeddable
 * video, malformed response). Never throws — callers treat null as
 * "fall back to showing the video ID."
 */
export async function fetchVideoTitle(videoId) {
  if (typeof videoId !== "string" || !videoId) return null;
  try {
    const url = `https://www.youtube.com/oembed?url=${encodeURIComponent(
      `https://www.youtube.com/watch?v=${videoId}`
    )}&format=json`;
    const response = await fetch(url);
    if (!response.ok) return null;
    const data = await response.json();
    return typeof data.title === "string" && data.title ? data.title : null;
  } catch (error) {
    console.error("youtubeUtils.js: failed to fetch video title:", error);
    return null;
  }
}
