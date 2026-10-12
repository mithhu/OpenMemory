import { z } from "zod";

// Dormant transport only: no route, settings, persistence or model fallback.
export const NATIVE_COMPANION_ORIGIN = "http://127.0.0.1:11435";
export const NATIVE_PROTOCOL_SHA256 =
  "35879732e0b6800da5a6ff56c20bb60eaf7a4ab3beb603a5e04c2f1144864119";
export const NATIVE_CLASSIFIER_PROFILE = "uniform-classification-v1";
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const identitySchema = z.object({ model_inventory: digest, adapter_inventory: digest }).strict();
export type NativeArtifactIdentity = z.infer<typeof identitySchema>;
const adviceSchema = z
  .object({
    category: z.enum([
      "NOTE",
      "PERSON",
      "GOAL",
      "WISHLIST",
      "IDEA",
      "MOVIE",
      "BOOK",
      "MUSIC",
      "LESSON",
      "MIXED",
    ]),
    intent: z.enum([
      "none",
      "wishlist",
      "start",
      "progress",
      "complete",
      "listen",
      "reaction",
      "clarify",
      "mixed",
    ]),
  })
  .strict()
  .refine((v) => (v.category === "MIXED") === (v.intent === "mixed"));
const profileSchema = z
  .object({
    profile: z.enum(["uniform-classification-v1", "qwen-full-capture-v1"]),
    purpose: z.enum(["classify", "extract", "interpret-titles"]),
    ready: z.boolean(),
    artifact_identity: identitySchema.nullable(),
    capture_ready: z.literal(false),
    save_authorized: z.literal(false),
  })
  .strict();
const readinessSchema = z
  .object({
    version: z.literal(1),
    protocol_sha256: z.literal(NATIVE_PROTOCOL_SHA256),
    profiles: z.array(profileSchema).length(3),
  })
  .strict();
const replySchema = z
  .object({
    version: z.literal(1),
    request_id: z.string(),
    purpose: z.literal("classify"),
    profile: z.literal(NATIVE_CLASSIFIER_PROFILE),
    source_sha256: digest,
    protocol_sha256: z.literal(NATIVE_PROTOCOL_SHA256),
    artifact_identity: identitySchema,
    advice: adviceSchema,
    capture_ready: z.literal(false),
    save_authorized: z.literal(false),
    reaped: z.literal(true),
  })
  .strict();
const cancellationSchema = z
  .object({
    version: z.literal(1),
    request_id: z.string(),
    cleanup_pending: z.boolean(),
    reaped: z.boolean(),
  })
  .strict()
  .refine((v) => v.cleanup_pending !== v.reaped);
const MAX_BYTES = 64 * 1024;

export class NativeCompanionError extends Error {
  constructor(
    public readonly code:
      | "unavailable"
      | "invalid-response"
      | "not-ready"
      | "busy"
      | "cancelled"
      | "deadline"
      | "unsupported",
    public readonly cleanupPending = false,
  ) {
    super(`Native companion: ${code}`);
    this.name = "NativeCompanionError";
  }
}

// JSON.parse alone accepts repeated keys. Walk the bounded JSON grammar first.
function strictJSON(text: string): unknown {
  let i = 0;
  const ws = () => {
    while (/\s/.test(text[i] ?? "") && i < text.length) i++;
  };
  const string = (): string => {
    const start = i++;
    let escape = false;
    while (i < text.length) {
      const c = text[i++]!;
      if (!escape && c === '"') return JSON.parse(text.slice(start, i)) as string;
      if (!escape && c === "\\") escape = true;
      else escape = false;
    }
    throw new Error("Invalid JSON");
  };
  const value = (depth: number): void => {
    if (depth > 32) throw new Error("Deep JSON");
    ws();
    const c = text[i];
    if (c === "{") {
      i++;
      ws();
      const keys = new Set<string>();
      if (text[i] === "}") {
        i++;
        return;
      }
      for (;;) {
        ws();
        if (text[i] !== '"') throw new Error("Invalid key");
        const key = string();
        if (keys.has(key)) throw new Error("Duplicate key");
        keys.add(key);
        ws();
        if (text[i++] !== ":") throw new Error("Invalid object");
        value(depth + 1);
        ws();
        const end = text[i++];
        if (end === "}") return;
        if (end !== ",") throw new Error("Invalid object");
      }
    }
    if (c === "[") {
      i++;
      ws();
      if (text[i] === "]") {
        i++;
        return;
      }
      for (;;) {
        value(depth + 1);
        ws();
        const end = text[i++];
        if (end === "]") return;
        if (end !== ",") throw new Error("Invalid array");
      }
    }
    if (c === '"') {
      string();
      return;
    }
    const token = /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(
      text.slice(i),
    );
    if (!token) throw new Error("Invalid primitive");
    i += token[0].length;
  };
  value(0);
  ws();
  if (i !== text.length) throw new Error("Trailing JSON");
  return JSON.parse(text) as unknown;
}

async function boundedJSON(response: Response): Promise<unknown> {
  if (
    !response.ok ||
    response.redirected ||
    response.headers.get("content-type")?.split(";")[0]?.trim() !== "application/json"
  )
    throw new NativeCompanionError("unavailable");
  if (!response.body) throw new NativeCompanionError("invalid-response");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) throw new Error("Oversize");
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    return strictJSON(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    await reader.cancel().catch(() => undefined);
    throw new NativeCompanionError("invalid-response");
  } finally {
    reader.releaseLock();
  }
}

function sameIdentity(a: NativeArtifactIdentity, b: NativeArtifactIdentity): boolean {
  return a.model_inventory === b.model_inventory && a.adapter_inventory === b.adapter_inventory;
}
async function sourceDigest(note: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(note));
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("");
}

export class NativeCompanionClient {
  #capability: string;
  #identity: NativeArtifactIdentity;
  #active: string | null = null;
  #controller: AbortController | null = null;
  #cancelling: { id: string; result: Promise<boolean> } | null = null;
  #fetch: typeof fetch;
  constructor(
    pairing: { capability: string; artifactIdentity: NativeArtifactIdentity },
    transport: typeof fetch = fetch,
  ) {
    if (!/^[a-f0-9]{64}$/.test(pairing.capability)) throw new NativeCompanionError("not-ready");
    this.#capability = pairing.capability;
    this.#identity = identitySchema.parse(pairing.artifactIdentity);
    this.#fetch = transport;
  }
  get cleanupPending(): boolean {
    return this.#active !== null;
  }
  clearPairing(): void {
    if (this.#active) throw new NativeCompanionError("busy", true);
    this.#capability = "";
  }
  async #call(
    path: string,
    method: "GET" | "POST" | "DELETE",
    body: unknown,
    signal: AbortSignal,
  ): Promise<unknown> {
    if (!this.#capability) throw new NativeCompanionError("not-ready");
    if (signal.aborted) throw new NativeCompanionError("cancelled", this.cleanupPending);
    const operation = (async () =>
      boundedJSON(
        await this.#fetch(NATIVE_COMPANION_ORIGIN + path, {
          method,
          headers: {
            "X-OpenMemory-Capability": this.#capability,
            ...(method === "POST" ? { "Content-Type": "application/json" } : {}),
          },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
          signal,
          redirect: "error",
          credentials: "omit",
          cache: "no-store",
          referrerPolicy: "no-referrer",
        }),
      ))();
    let remove = () => {};
    const abort = new Promise<never>((_, reject) => {
      const stop = () => reject(new NativeCompanionError("cancelled", this.cleanupPending));
      if (signal.aborted) stop();
      else {
        signal.addEventListener("abort", stop, { once: true });
        remove = () => signal.removeEventListener("abort", stop);
      }
    });
    try {
      return await Promise.race([operation, abort]);
    } finally {
      remove();
    }
  }
  async readiness(signal: AbortSignal): Promise<void> {
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (signal.aborted) controller.abort();
    else signal.addEventListener("abort", abort, { once: true });
    const timer = setTimeout(() => controller.abort(), 10000);
    let value: z.infer<typeof readinessSchema>;
    try {
      value = readinessSchema.parse(
        await this.#call("/v1/readiness", "GET", undefined, controller.signal),
      );
    } catch (error) {
      if (controller.signal.aborted && !signal.aborted) throw new NativeCompanionError("deadline");
      if (error instanceof NativeCompanionError) throw error;
      throw new NativeCompanionError("invalid-response");
    } finally {
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
    }
    const roles = new Set(value.profiles.map((p) => p.purpose));
    if (roles.size !== 3) throw new NativeCompanionError("invalid-response");
    for (const profile of value.profiles) {
      if (profile.purpose === "classify") {
        if (
          profile.profile !== NATIVE_CLASSIFIER_PROFILE ||
          !profile.ready ||
          !profile.artifact_identity ||
          !sameIdentity(profile.artifact_identity, this.#identity)
        )
          throw new NativeCompanionError("not-ready");
      } else if (
        profile.profile !== "qwen-full-capture-v1" ||
        profile.ready ||
        profile.artifact_identity !== null
      )
        throw new NativeCompanionError("not-ready");
    }
  }
  async cancelPending(): Promise<boolean> {
    const id = this.#active;
    if (!id) return true;
    // Stop publication immediately. Fetch abort is not proof of service cleanup.
    this.#controller?.abort();
    if (this.#cancelling?.id === id) return this.#cancelling.result;
    const result = (async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      try {
        const reply = cancellationSchema.parse(
          await this.#call(`/v1/requests/${id}`, "DELETE", undefined, controller.signal),
        );
        if (reply.request_id !== id) throw new Error("Wrong cancellation");
        if (reply.reaped && this.#active === id) {
          this.#active = null;
          this.#controller = null;
        }
        return reply.reaped;
      } catch {
        return false;
      } finally {
        clearTimeout(timer);
        if (this.#cancelling?.id === id) this.#cancelling = null;
      }
    })();
    this.#cancelling = { id, result };
    return result;
  }
  async classify(
    note: string,
    options: { signal?: AbortSignal } = {},
  ): Promise<z.infer<typeof adviceSchema>> {
    if (this.#active) throw new NativeCompanionError("busy", true);
    if (!note.trim() || new TextEncoder().encode(note).length > 16 * 1024)
      throw new NativeCompanionError("unsupported");
    if (options.signal?.aborted) throw new NativeCompanionError("cancelled");
    const id = crypto.randomUUID();
    this.#active = id;
    let submitted = false;
    let timedOut = false;
    const controller = new AbortController();
    this.#controller = controller;
    const abort = () => controller.abort();
    options.signal?.addEventListener("abort", abort, { once: true });
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 90000);
    try {
      await this.readiness(controller.signal);
      const hash = await sourceDigest(note);
      if (controller.signal.aborted || this.#active !== id)
        throw new NativeCompanionError("cancelled");
      submitted = true;
      const reply = replySchema.parse(
        await this.#call(
          "/v1/requests",
          "POST",
          {
            version: 1,
            request_id: id,
            purpose: "classify",
            profile: NATIVE_CLASSIFIER_PROFILE,
            input: { note },
          },
          controller.signal,
        ),
      );
      if (
        this.#active !== id ||
        reply.request_id !== id ||
        reply.source_sha256 !== hash ||
        !sameIdentity(reply.artifact_identity, this.#identity)
      )
        throw new NativeCompanionError("invalid-response", true);
      if (controller.signal.aborted) throw new NativeCompanionError("cancelled", true);
      this.#active = null;
      this.#controller = null;
      return reply.advice;
    } catch (error) {
      const wasAborted = controller.signal.aborted;
      if (this.#active === id) {
        if (!submitted) {
          this.#active = null;
          this.#controller = null;
        } else await this.cancelPending();
      }
      if (timedOut) throw new NativeCompanionError("deadline", this.cleanupPending);
      if (wasAborted) throw new NativeCompanionError("cancelled", this.cleanupPending);
      throw new NativeCompanionError(
        error instanceof NativeCompanionError ? error.code : "invalid-response",
        this.cleanupPending,
      );
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", abort);
    }
  }
  extract(): never {
    throw new NativeCompanionError("not-ready");
  }
  interpretTitles(): never {
    throw new NativeCompanionError("not-ready");
  }
}
