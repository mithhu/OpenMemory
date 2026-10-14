import { afterEach, describe, expect, it, vi } from "vitest";
import {
  captureWithLocalOllama,
  classifierName,
  classifierDigest,
  classifierDigests,
} from "../lib/local-ollama";
import * as cloud from "../lib/astra";

vi.mock("../lib/astra", () => ({
  planCapture: vi.fn(),
  connectMemories: vi.fn(),
  mapMemories: vi.fn(),
  discoverLibrary: vi.fn(),
}));
const settings = {
  provider: "ollama" as const,
  model: "qwen3.5:9b",
  captureEngine: "ollama" as const,
};
const source = "  Had lunch beside the canal.\n";
const data = (text = source) => ({ text, today: "2026-10-13", memories: [] });
const response = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
function fixture(
  options: { classify?: () => unknown; digest?: string; extract?: () => unknown } = {},
) {
  const fetch = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith("/show")) return response({ details: { format: "gguf" } });
    if (url.endsWith("/tags"))
      return response({
        models: [{ name: classifierName, digest: options.digest ?? classifierDigest }],
      });
    const body = JSON.parse(String(init?.body));
    if (body.model === classifierName)
      return response({
        message: {
          content: JSON.stringify(
            await (options.classify?.() ?? { category: "NOTE", intent: "none" }),
          ),
        },
      });
    if (options.extract) await options.extract();
    const { note } = JSON.parse(body.messages[1].content);
    return response({
      message: {
        content: JSON.stringify({
          entries: [
            {
              title: "Canal lunch",
              summary: note.trim(),
              category: "NOTE",
              date: "2026-10-13",
              matchedMemoryId: null,
              candidateMemoryIds: [],
              clarificationQuestion: null,
              tags: [],
              activity: null,
            },
          ],
        }),
      },
    });
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}
const chats = (fetch: ReturnType<typeof fixture>) =>
  fetch.mock.calls
    .filter(([url]) => url.endsWith("/chat"))
    .map(([, init]) => JSON.parse(String(init?.body)));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("Trained Ollama capture pipeline", () => {
  it.each(classifierDigests)(
    "accepts only the exact installed evaluated classifier profile: %s",
    async (digest) => {
      const fetch = fixture({ digest });
      const result = await captureWithLocalOllama(data(), settings);
      expect(result.classification.source).toBe(source);
      expect(chats(fetch).map((body) => body.model)).toEqual([classifierName, settings.model]);
      expect(cloud.planCapture).not.toHaveBeenCalled();
    },
  );
  it("pins the trained classifier independently of the selected extractor and binds exact source", async () => {
    const fetch = fixture();
    const result = await captureWithLocalOllama(data(), settings);
    expect(classifierName).toBe("openmemory-classifier:reviewed730");
    expect(classifierDigest).toBe(
      "235b080b2654c6784f979b3e61d63f84bf7a0e7261e0788d140ed5abd273928c",
    );
    expect(result.classification.source).toBe(source);
    expect(result.classification.advice).toEqual({ category: "NOTE", intent: "none" });
    expect(chats(fetch).map((body) => body.model)).toEqual([classifierName, settings.model]);
    expect(chats(fetch)[0].keep_alive).toBe(0);
    expect(chats(fetch)[0].options).toEqual({
      temperature: 0,
      num_ctx: 2048,
      num_predict: 80,
      repeat_penalty: 1,
      presence_penalty: 0,
    });
    expect(JSON.parse(chats(fetch)[0].messages[1].content)).toEqual({ note: source });
    expect(JSON.parse(chats(fetch)[1].messages[1].content)).toEqual({
      note: source,
      catalog: [],
      classificationAdvice: result.classification.advice,
    });
    expect(fetch.mock.calls.filter(([url]) => url.endsWith("/tags"))).toHaveLength(1);
    expect(fetch.mock.calls.every(([url]) => url.startsWith("http://127.0.0.1:11434/"))).toBe(true);
    expect(cloud.planCapture).not.toHaveBeenCalled();
  });
  it("waits for classification to finish before extraction", async () => {
    let release!: (value: unknown) => void;
    const fetch = fixture({
      classify: () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    });
    const pending = captureWithLocalOllama(data(), settings);
    await vi.waitFor(() => expect(release).toBeTypeOf("function"));
    expect(chats(fetch).map((body) => body.model)).toEqual([classifierName]);
    release({ category: "NOTE", intent: "none" });
    await pending;
    expect(chats(fetch).map((body) => body.model)).toEqual([classifierName, settings.model]);
  });
  it("retains whole-note mixed advice for review while extracting separate chunks without it", async () => {
    const text = "Had lunch beside the canal; then took a walk.";
    const fetch = fixture({ classify: () => ({ category: "MIXED", intent: "mixed" }) });
    const result = await captureWithLocalOllama(data(text), settings);
    expect(result.classification.source).toBe(text);
    expect(result.classification.advice.category).toBe("MIXED");
    expect(result.plan.entries).toHaveLength(2);
    expect(
      chats(fetch)
        .slice(1)
        .map((body) => JSON.parse(body.messages[1].content)),
    ).toEqual([
      { note: "Had lunch beside the canal", catalog: [] },
      { note: "took a walk.", catalog: [] },
    ]);
  });
  it("stops on a changed classifier identity before any note inference or cloud fallback", async () => {
    const fetch = fixture({ digest: "a".repeat(64) });
    await expect(captureWithLocalOllama(data(), settings)).rejects.toThrow("evaluated version");
    expect(chats(fetch)).toHaveLength(0);
    expect(cloud.planCapture).not.toHaveBeenCalled();
  });
  it("stops on invalid classifier advice instead of extracting", async () => {
    const fetch = fixture({ classify: () => ({ category: "MIXED", intent: "complete" }) });
    await expect(captureWithLocalOllama(data(), settings)).rejects.toThrow();
    expect(chats(fetch).map((body) => body.model)).toEqual([classifierName]);
    expect(cloud.planCapture).not.toHaveBeenCalled();
  });
  it.each(["a".repeat(1100), "\u0000".repeat(200)])(
    "never skips classification or truncates an oversized source",
    async (text) => {
      const fetch = fixture();
      await expect(captureWithLocalOllama(data(text), settings)).rejects.toThrow("shorter note");
      expect(fetch).not.toHaveBeenCalled();
    },
  );
  it("an already aborted capture makes no requests", async () => {
    const fetch = fixture();
    const controller = new AbortController();
    controller.abort();
    await expect(captureWithLocalOllama(data(), settings, controller.signal)).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("cancellation during classification cannot start extraction", async () => {
    const controller = new AbortController();
    const fetch = fixture({
      classify: () => {
        controller.abort();
        return { category: "NOTE", intent: "none" };
      },
    });
    await expect(captureWithLocalOllama(data(), settings, controller.signal)).rejects.toThrow();
    expect(chats(fetch).map((body) => body.model)).toEqual([classifierName]);
  });
  it("cancellation during extraction cannot return a usable plan", async () => {
    const controller = new AbortController();
    const fetch = fixture({
      extract: () => {
        controller.abort();
      },
    });
    await expect(captureWithLocalOllama(data(), settings, controller.signal)).rejects.toThrow();
    expect(chats(fetch)).toHaveLength(2);
    expect(cloud.planCapture).not.toHaveBeenCalled();
  });
  it("rejects cloud settings and the trained classifier as extractor before inference", async () => {
    const fetch = fixture();
    await expect(
      captureWithLocalOllama(data(), { provider: "astra", model: "astra" }),
    ).rejects.toThrow("Ollama extractor");
    await expect(
      captureWithLocalOllama(data(), { ...settings, model: classifierName }),
    ).rejects.toThrow("general local model");
    expect(fetch).not.toHaveBeenCalled();
    expect(cloud.planCapture).not.toHaveBeenCalled();
  });
});
