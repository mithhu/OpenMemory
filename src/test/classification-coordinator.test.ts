import { afterEach, describe, expect, it, vi } from "vitest";
import { captureWithProvider, planWithProvider } from "@/lib/ai-client";
import { associateClassification } from "@/lib/classification";
import * as cloud from "@/lib/astra";
vi.mock("@/lib/astra", () => ({
  planCapture: vi.fn(),
  connectMemories: vi.fn(),
  mapMemories: vi.fn(),
  discoverLibrary: vi.fn(),
}));
const model = "gemma4:12b-mlx";
const digest = "a".repeat(64);
const profile = { model, expectedModelDigest: digest };
const source = "  Had lunch beside the canal.\n";
const data = (text = source) => ({ text, today: "2026-10-10", memories: [] });
const settings = { provider: "ollama" as const, model };
const plan = {
  entries: [
    {
      title: "Canal lunch",
      summary: "Had lunch beside the canal.",
      category: "NOTE",
      date: "2026-10-10",
      matchedMemoryId: null,
      candidateMemoryIds: [],
      clarificationQuestion: null,
      tags: [],
      activity: null,
    },
  ],
};
const response = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
function fixture(onClassification?: () => unknown, modelDigest = digest) {
  const fetch = vi.fn(async (url: string, options?: RequestInit) => {
    if (url.endsWith("/show")) return response({ details: { format: "gguf" } });
    if (url.endsWith("/tags")) return response({ models: [{ name: model, digest: modelDigest }] });
    const body = JSON.parse(String(options?.body));
    const raw = body.format.properties.entries
      ? plan
      : onClassification
        ? await onClassification()
        : { category: "NOTE", intent: "none" };
    return response({ message: { content: JSON.stringify(raw) } });
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}
const chats = (fetch: ReturnType<typeof fixture>) =>
  fetch.mock.calls
    .filter(([url]) => url.endsWith("/chat"))
    .map(([, opts]) => JSON.parse(String(opts?.body)));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("Explicit classification coordinator", () => {
  it("classifies original whitespace once, then sends only category/intent advice as extraction data", async () => {
    const fetch = fixture();
    const result = await captureWithProvider(data(), settings, undefined, profile);
    expect(result.classification?.source).toBe(source);
    expect(result.plan).toMatchObject(plan);
    expect(chats(fetch)).toHaveLength(2);
    expect(JSON.parse(chats(fetch)[0].messages[1].content)).toEqual({ note: source });
    expect(JSON.parse(chats(fetch)[1].messages[1].content)).toEqual({
      note: source,
      catalog: [],
      classificationAdvice: { category: "NOTE", intent: "none", clarificationReasons: [] },
    });
    expect(chats(fetch)[1].messages[0].content).toContain("this advice may be wrong");
    expect(fetch.mock.calls.filter(([url]) => url.endsWith("/tags"))).toHaveLength(2);
    expect(cloud.planCapture).not.toHaveBeenCalled();
  });
  it("forwards migrated uncertainty as data without inventing an action", async () => {
    const fetch = fixture(() => ({ category: "MOVIE", intent: "clarify" }));
    const result = await captureWithProvider(data(), settings, undefined, profile);
    expect(result.classification?.advice).toEqual({
      category: "MOVIE",
      intent: null,
      clarificationReasons: ["legacy_uncertainty"],
    });
    expect(JSON.parse(chats(fetch)[1].messages[1].content).classificationAdvice).toEqual(
      result.classification?.advice,
    );
    expect(chats(fetch)[1].messages[0].content).toContain("Missing identity never erases a known");
    expect(result.plan).toMatchObject(plan);
    expect(cloud.planCapture).not.toHaveBeenCalled();
  });
  it("awaits classification before queuing extraction", async () => {
    let release!: (value: unknown) => void;
    const fetch = fixture(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const pending = captureWithProvider(data(), settings, undefined, profile);
    await vi.waitFor(() => expect(release).toBeTypeOf("function"));
    expect(chats(fetch)).toHaveLength(1);
    release({ category: "NOTE", intent: "none" });
    await pending;
    expect(chats(fetch)).toHaveLength(2);
  });
  it("cancellation during classification queues no extraction or cloud fallback", async () => {
    const controller = new AbortController();
    const fetch = fixture(() => {
      controller.abort();
      return { category: "NOTE", intent: "none" };
    });
    await expect(
      captureWithProvider(data(), settings, controller.signal, profile),
    ).rejects.toThrow();
    expect(chats(fetch)).toHaveLength(1);
    expect(cloud.planCapture).not.toHaveBeenCalled();
  });
  it("malformed advice stops instead of extracting a partial result", async () => {
    const fetch = fixture(() => ({ category: "NOTE", intent: "none", title: "Invented" }));
    await expect(captureWithProvider(data(), settings, undefined, profile)).rejects.toThrow();
    expect(chats(fetch)).toHaveLength(1);
    expect(cloud.planCapture).not.toHaveBeenCalled();
  });
  it("retains mixed advice separately without forcing entry types or inventing missing events", async () => {
    const fetch = fixture(() => ({ category: "MIXED", intent: "mixed" }));
    const result = await captureWithProvider(data(), settings, undefined, profile);
    expect(result.classification?.advice).toEqual({
      category: "MIXED",
      intent: "mixed",
      clarificationReasons: [],
    });
    expect(result.plan).toMatchObject(plan);
    expect(result.plan.entries).toHaveLength(1);
    expect(chats(fetch)[1].messages[0].content).toContain("Preserve all independent mixed events");
  });
  it("does not forward local advice when the selected extraction provider is cloud", async () => {
    const fetch = fixture();
    vi.mocked(cloud.planCapture).mockResolvedValueOnce(plan as never);
    const result = await captureWithProvider(
      data(),
      { provider: "astra", model: "astra" },
      undefined,
      profile,
    );
    expect(result.classification).toBeUndefined();
    expect(result.classificationSkipped).toContain("does not match");
    expect(cloud.planCapture).toHaveBeenCalledWith({ data: data() });
    expect(fetch).not.toHaveBeenCalled();
  });
  it("rejects stale source advice before any request", async () => {
    const fetch = fixture();
    await expect(
      planWithProvider(
        data(),
        settings,
        undefined,
        associateClassification(source.trim(), { category: "NOTE", intent: "none" }),
      ),
    ).rejects.toThrow("different original words");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("rejects whole-note advice across split chunks, while coordinator retains normal multi-event extraction", async () => {
    const fetch = fixture();
    const text = "Had lunch; then walked beside the canal";
    await expect(
      planWithProvider(
        data(text),
        settings,
        undefined,
        associateClassification(text, { category: "MIXED", intent: "mixed" }),
      ),
    ).rejects.toThrow("separate source chunks");
    expect(fetch).not.toHaveBeenCalled();
    const result = await captureWithProvider(data(text), settings, undefined, profile);
    expect(result.classification).toBeUndefined();
    expect(result.classificationSkipped).toContain("separate source chunks");
    expect(result.plan.entries).toHaveLength(2);
    expect(chats(fetch)).toHaveLength(2);
    expect(
      chats(fetch).every((body) => !JSON.parse(body.messages[1].content).classificationAdvice),
    ).toBe(true);
  });
  it("long notes bypass classification without truncating normal extraction", async () => {
    const fetch = fixture();
    const text = "Fictional everyday experience. ".repeat(50);
    const result = await captureWithProvider(data(text), settings, undefined, profile);
    expect(result.classificationSkipped).toContain("length");
    expect(chats(fetch)).toHaveLength(1);
    expect(JSON.parse(chats(fetch)[0].messages[1].content).note).toBe(text.trim());
  });
  it("no explicit profile leaves legacy extraction unchanged", async () => {
    const fetch = fixture();
    const result = await captureWithProvider(data(), settings);
    expect(result.plan).toMatchObject(plan);
    expect(Object.keys(result)).toEqual(["plan"]);
    expect(chats(fetch)).toHaveLength(1);
    expect(JSON.parse(chats(fetch)[0].messages[1].content)).toEqual({
      note: source.trim(),
      catalog: [],
    });
  });
  it("model mismatch uses normal extraction without advisory classification", async () => {
    const fetch = fixture();
    const result = await captureWithProvider(
      data(),
      { ...settings, model: "different-local-model" },
      undefined,
      profile,
    );
    expect(result.classificationSkipped).toContain("does not match");
    expect(chats(fetch)).toHaveLength(1);
  });
  it("changed model digest fails before sending any note", async () => {
    const fetch = fixture(undefined, "b".repeat(64));
    await expect(captureWithProvider(data(), settings, undefined, profile)).rejects.toThrow(
      "evaluated version",
    );
    expect(chats(fetch)).toHaveLength(0);
  });
  it.each([
    "Had lunch; then walked beside the canal",
    "Fictional everyday experience. ".repeat(50),
  ])("pins matching-profile extraction even when classification is skipped", async (text) => {
    const fetch = fixture(undefined, "b".repeat(64));
    await expect(captureWithProvider(data(text), settings, undefined, profile)).rejects.toThrow(
      "evaluated version",
    );
    expect(chats(fetch)).toHaveLength(0);
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([
      "http://127.0.0.1:11434/api/show",
      "http://127.0.0.1:11434/api/tags",
    ]);
  });
  it("profile requires a digest before touching transport", async () => {
    const fetch = fixture();
    await expect(
      captureWithProvider(data(), settings, undefined, { model } as never),
    ).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
});
