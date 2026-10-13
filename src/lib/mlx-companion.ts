import { z } from "zod";
import { classificationAdviceSchema, classificationContractVersion } from "./classification";

export const mlxCompanionOrigin = "http://127.0.0.1:8765";
export const mlxCompanionAdapterSha256 =
  "8724245782e5c709bf7ccd7b3631a944472bfb071d6cc659a9bcc5cb51143f01";
const pairingKey = "openmemory.mlx.companion.v1";
const pairingSchema = z
  .object({ token: z.string().min(16).max(512), expiresAt: z.number().int().positive() })
  .strict();
const statusSchema = z.object({
  ready: z.boolean(),
  paired: z.boolean(),
  adapterSha256: z.literal(mlxCompanionAdapterSha256),
  contractVersion: z.literal(classificationContractVersion),
  reason: z.string().max(2000).optional(),
});
const captureIdSchema = z.string().regex(/^[A-Za-z0-9_-]{24,128}$/);
const captureTokens = new Map<string, string>();
const resultSchema = z
  .object({
    captureId: captureIdSchema,
    advice: classificationAdviceSchema,
    adapterSha256: z.literal(mlxCompanionAdapterSha256),
    seconds: z.number().finite().nonnegative(),
    totalSeconds: z.number().finite().nonnegative(),
    peakBytes: z.number().finite().nonnegative(),
  })
  .strict();

export function clearMlxCompanionPairing() {
  try {
    sessionStorage.removeItem(pairingKey);
  } catch {
    /* Storage may be disabled. */
  }
}
function loadPairing() {
  try {
    const pairing = pairingSchema.parse(JSON.parse(sessionStorage.getItem(pairingKey) || "null"));
    if (pairing.expiresAt * 1000 > Date.now()) return pairing;
  } catch {
    /* Missing, invalid, or inaccessible pairing is not authorization. */
  }
  clearMlxCompanionPairing();
  return null;
}
export function hasMlxCompanionPairing() {
  return loadPairing() !== null;
}

async function request(
  path: "/status" | "/pair" | "/classify" | "/release",
  init: RequestInit,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  const controller = new AbortController();
  const abort = () => controller.abort(signal?.reason);
  signal?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(
    () => controller.abort(new DOMException("Local MLX timed out", "TimeoutError")),
    path === "/classify" ? 150_000 : path === "/release" ? 10_000 : 30_000,
  );
  try {
    const response = await fetch(`${mlxCompanionOrigin}${path}`, {
      ...init,
      credentials: "omit",
      redirect: "error",
      referrerPolicy: "no-referrer",
      signal: controller.signal,
    });
    if (response.status === 401 || response.status === 403) {
      clearMlxCompanionPairing();
      throw new Error(
        "Local MLX pairing was rejected. Pair this browser again with the code shown on your Mac.",
      );
    }
    if (!response.ok)
      throw new Error(
        "The local MLX service could not complete this request. Check the service on your Mac and try again. No cloud fallback was used.",
      );
    const value: unknown = await response.json();
    signal?.throwIfAborted();
    return value;
  } catch (error) {
    if (signal?.aborted) throw signal.reason ?? new DOMException("Cancelled", "AbortError");
    if (controller.signal.aborted)
      throw new Error(
        "Local MLX took too long. Your note was not saved; try again or review manually. No cloud fallback was used.",
      );
    if (error instanceof TypeError)
      throw new Error(
        "Couldn't reach the local MLX service. Start it on your Mac and allow this website's local network access in your browser. No cloud fallback was used.",
      );
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}

export async function getMlxCompanionStatus(signal?: AbortSignal) {
  const pairing = loadPairing();
  const parsed = statusSchema.safeParse(
    await request(
      "/status",
      {
        method: "GET",
        ...(pairing ? { headers: { Authorization: `Bearer ${pairing.token}` } } : {}),
      },
      signal,
    ),
  );
  if (!parsed.success) {
    clearMlxCompanionPairing();
    throw new Error(
      "The local MLX service does not match our verified adapter and classification contract. No note was sent.",
    );
  }
  if (!parsed.data.paired) clearMlxCompanionPairing();
  return { ...parsed.data, paired: parsed.data.paired && hasMlxCompanionPairing() };
}
export async function pairMlxCompanion(code: string, signal?: AbortSignal) {
  const status = await getMlxCompanionStatus(signal);
  if (!status.ready)
    throw new Error(
      "The local MLX service isn't ready. Check its setup on your Mac before pairing.",
    );
  if (!code.trim() || code.length > 128)
    throw new Error("Enter the pairing code shown by the local MLX service.");
  const parsed = pairingSchema.safeParse(
    await request(
      "/pair",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.trim() }),
      },
      signal,
    ),
  );
  if (!parsed.success || parsed.data.expiresAt * 1000 <= Date.now()) {
    clearMlxCompanionPairing();
    throw new Error(
      "The local MLX service returned an invalid or expired pairing. Try pairing again.",
    );
  }
  try {
    sessionStorage.setItem(pairingKey, JSON.stringify(parsed.data));
  } catch {
    throw new Error(
      "This browser cannot keep the local MLX pairing in session storage. Allow browser storage or use the local app.",
    );
  }
  return parsed.data;
}
export async function classifyWithMlxCompanion(text: string, signal?: AbortSignal) {
  signal?.throwIfAborted();
  if (!loadPairing())
    throw new Error("Pair this browser with your local MLX service before sending a note.");
  if (!text.trim() || new TextEncoder().encode(JSON.stringify({ note: text })).byteLength > 1000)
    throw new Error(
      "Use a shorter note for local MLX classification. Your words were not truncated.",
    );
  const status = await getMlxCompanionStatus(signal);
  if (!status.ready) throw new Error("The local MLX service isn't ready. Your note was not sent.");
  const pairing = loadPairing();
  if (!pairing)
    throw new Error("Local MLX pairing expired. Pair this browser again before sending a note.");
  const captureId = crypto.randomUUID();
  captureTokens.set(captureId, pairing.token);
  try {
    const result = resultSchema.safeParse(
      await request(
        "/classify",
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${pairing.token}` },
          body: JSON.stringify({ text, captureId }),
        },
        signal,
      ),
    );
    if (!result.success || result.data.captureId !== captureId)
      throw new Error(
        "Local MLX returned an invalid classification. Review manually; no cloud fallback was used.",
      );
    return result.data;
  } catch (error) {
    await releaseMlxCompanionCapture(captureId);
    throw error;
  }
}

// Keep the exact owner token only in memory through this capture. Cleanup must
// work after cancellation, session expiry, or the user disconnecting the service.
export async function releaseMlxCompanionCapture(captureId: string): Promise<void> {
  const token = captureTokens.get(captureId);
  if (!token) return;
  try {
    await request("/release", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ captureId }),
    });
  } catch {
    // Don't replace the capture result/error with a cleanup transport failure.
    // A service restart recovers an orphaned reservation without cloud fallback.
    console.warn(
      "Local MLX capture reservation could not be released. Restart the local service if it remains busy.",
    );
  } finally {
    captureTokens.delete(captureId);
  }
}
