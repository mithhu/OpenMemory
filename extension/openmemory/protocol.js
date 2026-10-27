export const DEFAULT_DESTINATION = "https://open-memory-ai.vercel.app";

export function destinationOrigin(value) {
  const url = new URL(value);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    !(url.origin === DEFAULT_DESTINATION || (local && ["http:", "https:"].includes(url.protocol)))
  ) {
    throw new Error("Use the hosted OpenMemory address or a localhost address without a path.");
  }
  return url.origin;
}

export function webUrl(value) {
  const url = new URL(value);
  if (
    !["https:", "http:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.href.length > 4096
  ) {
    throw new Error("Only HTTP or HTTPS links without embedded credentials can be saved.");
  }
  return url.href;
}

export function buildHandoff(destination, { url, title = "", note = "" }) {
  const payload = {
    version: 1,
    id: crypto.randomUUID(),
    url: webUrl(url),
    title: title.trim().slice(0, 300),
    note: note.trim().slice(0, 4000),
  };
  // Fragments stay in the browser: the note is not sent in the HTTP request to the host.
  const fragment = encodeURIComponent(JSON.stringify(payload));
  if (fragment.length + 11 > 32000)
    throw new Error(
      "This link and note are too long to share together. Shorten the note and try again.",
    );
  return `${destinationOrigin(destination)}/#save-link=${fragment}`;
}
