import { webcrypto } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  captureWithNativeClassification,
  type NativeClassifiedCaptureProfile,
} from "../lib/native-classified-capture";
import {
  NativeCompanionClient,
  NATIVE_CLASSIFIER_PROFILE,
  NATIVE_COMPANION_ORIGIN,
  NATIVE_PROTOCOL_SHA256,
} from "../lib/native-companion";
import { applyCapturePlan } from "../lib/capture-plan";
import { assessClassification } from "../lib/classification";
import * as cloud from "../lib/astra";
vi.mock("../lib/astra", () => ({ planCapture: vi.fn() }));
const identity = { model_inventory: "a".repeat(64), adapter_inventory: "b".repeat(64) };
const model = "fictional-extractor:local",
  digest = "d".repeat(64);
const profile: NativeClassifiedCaptureProfile = {
  classifierProfile: NATIVE_CLASSIFIER_PROFILE,
  extractor: { model, expectedModelDigest: digest },
};
const settings = { provider: "ollama" as const, model };
const source = "  Went to the cafe with Mary.\n";
const data = (text = source) => ({ text, memories: [], today: "2026-10-10" });
const entry = {
  title: "Cafe with Mary",
  summary: "Went to the cafe with Mary.",
  category: "NOTE",
  date: "2026-10-10",
  matchedMemoryId: null,
  candidateMemoryIds: [],
  clarificationQuestion: null,
  tags: [],
  activity: null,
};
const json = (value: unknown) =>
  new Response(JSON.stringify(value), { headers: { "Content-Type": "application/json" } });
const hash = async (text: string) =>
  Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
function fixture(
  options: {
    advice?: unknown;
    alter?: (reply: Record<string, unknown>) => unknown;
    reaped?: boolean;
    beforeReply?: () => Promise<void> | void;
    extractorDigest?: string;
    extraction?: unknown;
  } = {},
) {
  const native = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    if (String(url).endsWith("readiness"))
      return json({
        version: 1,
        protocol_sha256: NATIVE_PROTOCOL_SHA256,
        profiles: [
          {
            profile: NATIVE_CLASSIFIER_PROFILE,
            purpose: "classify",
            ready: true,
            artifact_identity: identity,
            capture_ready: false,
            save_authorized: false,
          },
          ...["extract", "interpret-titles"].map((purpose) => ({
            purpose,
            profile: "qwen-full-capture-v1",
            ready: false,
            artifact_identity: null,
            capture_ready: false,
            save_authorized: false,
          })),
        ],
      });
    if (init?.method === "DELETE")
      return json({
        version: 1,
        request_id: String(url).split("/").pop(),
        cleanup_pending: options.reaped === false,
        reaped: options.reaped !== false,
      });
    const request = JSON.parse(String(init?.body));
    await options.beforeReply?.();
    const reply = {
      version: 1,
      request_id: request.request_id,
      purpose: "classify",
      profile: NATIVE_CLASSIFIER_PROFILE,
      source_sha256: await hash(request.input.note),
      protocol_sha256: NATIVE_PROTOCOL_SHA256,
      artifact_identity: identity,
      advice: options.advice ?? { category: "NOTE", intent: "none" },
      reaped: true,
      capture_ready: false,
      save_authorized: false,
    };
    return json(options.alter ? options.alter(reply) : reply);
  });
  const extractor = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    if (String(url).endsWith("show")) return json({ details: { format: "gguf" } });
    if (String(url).endsWith("tags"))
      return json({ models: [{ name: model, digest: options.extractorDigest ?? digest }] });
    const request = JSON.parse(String(init?.body));
    return json({
      message: {
        content: JSON.stringify(
          request.format.properties.titles
            ? { titles: [{ entryIndex: 0, sourceTitle: "Arrival", suggestedTitle: "Arrival" }] }
            : (options.extraction ?? { entries: [entry] }),
        ),
      },
    });
  });
  vi.stubGlobal("fetch", extractor);
  return {
    client: new NativeCompanionClient(
      { capability: "c".repeat(64), artifactIdentity: identity },
      native,
    ),
    native,
    extractor,
  };
}
beforeEach(() => vi.stubGlobal("crypto", webcrypto));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
const chats = (transport: ReturnType<typeof fixture>["extractor"]) =>
  transport.mock.calls
    .filter(([url]) => String(url).endsWith("chat"))
    .map(([, init]) => JSON.parse(String(init?.body)));
it("composes actual clients with separate identities and forwards exact source as nonauthoritative advice data", async () => {
  const f = fixture();
  const result = await captureWithNativeClassification(data(), settings, f.client, profile);
  const post = f.native.mock.calls.find(([, init]) => init?.method === "POST")!;
  expect(String(post[0])).toBe(NATIVE_COMPANION_ORIGIN + "/v1/requests");
  expect(JSON.parse(String(post[1]!.body)).input.note).toBe(source);
  expect(result.classification?.source).toBe(source);
  expect(JSON.parse(chats(f.extractor)[0].messages[1].content)).toEqual({
    note: source,
    catalog: [],
    classificationAdvice: { category: "NOTE", intent: "none", clarificationReasons: [] },
  });
  expect(chats(f.extractor)[0].model).toBe(model);
  expect(f.extractor.mock.calls.some(([url]) => String(url).endsWith("tags"))).toBe(true);
  expect(f.client.cleanupPending).toBe(false);
  expect(cloud.planCapture).not.toHaveBeenCalled();
});
it("rejects provider/profile/model/pin mismatches before any request", async () => {
  const f = fixture();
  for (const [selected, pinned] of [
    [{ provider: "astra", model }, profile],
    [settings, { ...profile, classifierProfile: "qwen-full-capture-v1" }],
    [settings, { ...profile, extractor: { ...profile.extractor, model: "other" } }],
    [settings, { ...profile, extractor: { ...profile.extractor, expectedModelDigest: "missing" } }],
  ] as const)
    await expect(
      captureWithNativeClassification(
        data(),
        selected as typeof settings,
        f.client,
        pinned as NativeClassifiedCaptureProfile,
      ),
    ).rejects.toThrow();
  expect(f.native).not.toHaveBeenCalled();
  expect(f.extractor).not.toHaveBeenCalled();
});
it("actual extractor inventory mismatch queues no extraction chat or cloud fallback", async () => {
  const f = fixture({ extractorDigest: "e".repeat(64) });
  await expect(
    captureWithNativeClassification(data(), settings, f.client, profile),
  ).rejects.toThrow(/evaluated version/);
  expect(chats(f.extractor)).toHaveLength(0);
  expect(cloud.planCapture).not.toHaveBeenCalled();
});
it.each(["stale-source", "wrong-identity", "invalid-advice", "wrong-profile"])(
  "%s reply never proceeds to extraction",
  async (variant) => {
    const f = fixture({
      alter: (reply) =>
        variant === "stale-source"
          ? { ...reply, source_sha256: "f".repeat(64) }
          : variant === "wrong-identity"
            ? { ...reply, artifact_identity: { ...identity, adapter_inventory: "f".repeat(64) } }
            : variant === "invalid-advice"
              ? {
                  ...reply,
                  advice: { category: "NOTE", intent: "none", matchedMemoryId: "invented" },
                }
              : { ...reply, profile: "wrong" },
    });
    await expect(
      captureWithNativeClassification(data(), settings, f.client, profile),
    ).rejects.toThrow();
    expect(f.extractor).not.toHaveBeenCalled();
    expect(f.native.mock.calls.some(([, init]) => init?.method === "DELETE")).toBe(true);
  },
);
it("cancellation during classification never queues extractor metadata or later work", async () => {
  const controller = new AbortController();
  const f = fixture({ beforeReply: () => controller.abort() });
  await expect(
    captureWithNativeClassification(data(), settings, f.client, profile, controller.signal),
  ).rejects.toThrow();
  expect(f.extractor).not.toHaveBeenCalled();
  expect(cloud.planCapture).not.toHaveBeenCalled();
});
it("pending shared cleanup blocks even a multi-chunk skip and cannot become fallback extraction", async () => {
  const f = fixture({ advice: { category: "NOTE", intent: "none", extra: true }, reaped: false });
  await expect(
    captureWithNativeClassification(data(), settings, f.client, profile),
  ).rejects.toThrow();
  expect(f.client.cleanupPending).toBe(true);
  const count = f.native.mock.calls.length;
  await expect(
    captureWithNativeClassification(
      data("  Had lunch; then walked in the park.\n"),
      settings,
      f.client,
      profile,
    ),
  ).rejects.toThrow(/busy/);
  expect(f.native.mock.calls).toHaveLength(count);
  expect(f.extractor).not.toHaveBeenCalled();
});
it("multi-chunk skip keeps original data and independently pinned actual extraction for every event", async () => {
  const f = fixture(),
    input = data("  Had lunch; then walked in the park.\n"),
    original = structuredClone(input);
  const result = await captureWithNativeClassification(input, settings, f.client, profile);
  expect(input).toEqual(original);
  expect(result.classificationSkipped).toContain("separate source chunks");
  expect(result.classification).toBeUndefined();
  expect(f.native).not.toHaveBeenCalled();
  expect(chats(f.extractor)).toHaveLength(2);
  expect(chats(f.extractor).map((body) => JSON.parse(body.messages[1].content).note)).toEqual([
    "Had lunch",
    "walked in the park.",
  ]);
  expect(
    chats(f.extractor).every(
      (body) => body.model === model && !JSON.parse(body.messages[1].content).classificationAdvice,
    ),
  ).toBe(true);
  expect(f.extractor.mock.calls.filter(([url]) => String(url).endsWith("tags"))).toHaveLength(2);
});
it("wrong but well-formed advice remains review data, never completion or save authorization", async () => {
  const f = fixture({ advice: { category: "MOVIE", intent: "complete" } });
  const result = await captureWithNativeClassification(data(), settings, f.client, profile);
  expect(result.plan.entries[0]!.category).toBe("NOTE");
  expect(
    assessClassification(result.plan, result.classification!, source).conflicts,
  ).not.toHaveLength(0);
  expect(applyCapturePlan([], result.plan, source)[0]!.activity).toBeUndefined();
  const complete = {
    ...entry,
    category: "MOVIE",
    title: "Arrival",
    activity: {
      kind: "movie",
      intent: "complete",
      progress: null,
      progressMode: "absolute",
      total: null,
      lessonNumbers: [],
      sentiment: null,
      creator: null,
    },
  };
  const film = fixture({
    advice: { category: "MOVIE", intent: "complete" },
    extraction: { entries: [complete] },
  });
  const capture = await captureWithNativeClassification(
    data("Watched Arrival."),
    settings,
    film.client,
    profile,
  );
  expect(() => applyCapturePlan([], capture.plan, "Watched Arrival.")).toThrow(/finished/);
});

it("binds source and extraction settings before awaited native work", async () => {
  const input = data(),
    selected = { ...settings };
  const f = fixture({
    beforeReply: () => {
      input.text = "Different later source";
      selected.model = "different-model";
    },
  });
  const result = await captureWithNativeClassification(input, selected, f.client, profile);
  expect(result.classification?.source).toBe(source);
  expect(JSON.parse(chats(f.extractor)[0].messages[1].content).note).toBe(source);
  expect(chats(f.extractor)[0].model).toBe(model);
});
