import { z } from "zod";

export const localStoreOrigin = "http://127.0.0.1:8766";
export const localStoreModeKey = "openmemory.storage.v1";
const pairingKey = "openmemory.storage.pairing.v1";
const grantSchema = z
  .object({ token: z.string().min(16).max(512), expiresAt: z.number().int().positive() })
  .strict();
export type VaultBackend = "browser" | "sqlite";
// Pin the backend for the lifetime of this page. Another tab changing a preference
// must never redirect an in-flight write into another library.
let backend: VaultBackend = "browser";
export function vaultBackend() {
  return backend;
}
export function initializeVaultBackend() {
  backend = localStorage.getItem(localStoreModeKey) === "sqlite" ? "sqlite" : "browser";
  return backend;
}
export function chooseVaultBackend(mode: VaultBackend) {
  localStorage.setItem(localStoreModeKey, mode);
  for (const key of ["openmemory.graph.v1", "openmemory.constellation.v1", "openmemory.actions.v1"])
    localStorage.removeItem(key);
  // Re-open the workspace on reload; do not mutate the active backend/session here.
}
export function resetVaultBackendForTests() {
  backend = "browser";
}
function grant() {
  let raw: unknown = null;
  try {
    raw = JSON.parse(localStorage.getItem(pairingKey) || "null");
  } catch {
    /* Invalid grant is not authorization. */
  }
  const parsed = grantSchema.safeParse(raw);
  if (!parsed.success || parsed.data.expiresAt * 1000 <= Date.now())
    throw new Error(
      "Pair this browser with the Mac storage service in Privacy & AI. Your library has not changed.",
    );
  return parsed.data;
}
async function request(
  path: "/status" | "/pair" | "/vault",
  method: "GET" | "POST" | "PUT",
  body?: unknown,
  auth = false,
) {
  const token = auth ? grant().token : null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(`${localStoreOrigin}${path}`, {
      method,
      credentials: "omit",
      redirect: "error",
      referrerPolicy: "no-referrer",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (response.status === 401 || response.status === 403) {
      if (token && localStorage.getItem(pairingKey)) {
        const current = grantSchema.safeParse(JSON.parse(localStorage.getItem(pairingKey)!));
        if (current.success && current.data.token === token) localStorage.removeItem(pairingKey);
      }
      throw new Error(
        "Storage pairing was rejected. Open Privacy & AI and pair this browser again. No browser fallback was used.",
      );
    }
    if (response.status === 409)
      throw new Error(
        "Your Mac library changed in another browser. Reload before saving; your draft has not been saved.",
      );
    if (!response.ok)
      throw new Error(
        "The Mac storage service could not complete this request. Your library has not been replaced.",
      );
    return (await response.json()) as unknown;
  } catch (error) {
    if (controller.signal.aborted || error instanceof TypeError)
      throw new Error(
        "Could not reach Mac storage. Run npm run storage:serve and allow this site's local network access. Your data has not been moved to browser storage.",
      );
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
export async function pairLocalStore(code: string) {
  const status = z
    .object({
      service: z.literal("openmemory-local-storage"),
      version: z.literal(1),
      ready: z.literal(true),
    })
    .parse(await request("/status", "GET"));
  if (!status.ready || !code.trim() || code.length > 128)
    throw new Error("Enter the code from your Mac's storage pairing page.");
  const value = grantSchema.parse(await request("/pair", "POST", { code: code.trim() }));
  if (value.expiresAt * 1000 <= Date.now())
    throw new Error("Storage pairing has expired. Reveal a new code and try again.");
  localStorage.setItem(pairingKey, JSON.stringify(value));
}
export async function readLocalVault() {
  const result = z
    .object({ envelope: z.unknown() })
    .parse(await request("/vault", "GET", undefined, true));
  if (!("envelope" in result) || result.envelope === undefined)
    throw new Error("The Mac storage response was invalid. No replacement library was created.");
  return result.envelope;
}
export async function writeLocalVault(envelope: unknown, expectedRevision: number) {
  const result = z
    .object({ envelope: z.object({ revision: z.number().int().positive() }).passthrough() })
    .parse(await request("/vault", "PUT", { envelope, expectedRevision }, true));
  if (result.envelope.revision !== expectedRevision + 1)
    throw new Error("The Mac storage revision was invalid. Reload to check the saved library.");
  return result.envelope.revision;
}
