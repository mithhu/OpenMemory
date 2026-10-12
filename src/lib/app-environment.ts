/** Native MLX requires the app server to run on this computer. */
export function isHostedApp(
  hostname = typeof window === "undefined" ? "localhost" : window.location.hostname,
) {
  // Also supports previewing the hosted experience on a loopback test server.
  if (import.meta.env["VITE_APP_MODE"] === "hosted") return true;
  return !["localhost", "127.0.0.1", "[::1]", "::1"].includes(hostname);
}
