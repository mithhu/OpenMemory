import { afterEach, describe, expect, it, vi } from "vitest";
import { classifyWithLocalModel } from "@/lib/ai-client";
import { classificationInstructions, classificationJson } from "@/lib/classification";

const source = "  I wnt to read Glass Orchrd.\n";
const evaluatedDigest = "a".repeat(64);
const response = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
function localFixture(raw = '{"category":"BOOK","intent":"wishlist"}') {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(response({ details: { format: "safetensors" } }))
    .mockResolvedValueOnce(response({ message: { content: raw } }));
  vi.stubGlobal("fetch", fetch);
  return fetch;
}
afterEach(() => vi.unstubAllGlobals());

describe("Local classification transport matches evaluated settings", () => {
  it("pins an evaluated downloaded model digest before sending original words", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(response({ details: { format: "safetensors" } }))
      .mockResolvedValueOnce(
        response({ models: [{ name: "fictional-model", digest: evaluatedDigest }] }),
      )
      .mockResolvedValueOnce(
        response({ message: { content: '{"category":"BOOK","intent":"wishlist"}' } }),
      );
    vi.stubGlobal("fetch", fetch);
    const metadata = await classifyWithLocalModel(
      source,
      "fictional-model",
      undefined,
      evaluatedDigest,
    );
    expect(metadata.source).toBe(source);
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([
      "http://127.0.0.1:11434/api/show",
      "http://127.0.0.1:11434/api/tags",
      "http://127.0.0.1:11434/api/chat",
    ]);
    expect(JSON.parse(fetch.mock.calls[2]![1].body).messages[1].content).toBe(
      JSON.stringify({ note: source }),
    );
  });
  it.each(
    [
      [],
      [{ name: "fictional-model", digest: "b".repeat(64) }],
      [{ name: "other-model", digest: evaluatedDigest }],
      [
        { name: "fictional-model", digest: evaluatedDigest },
        { name: "fictional-model", digest: evaluatedDigest },
      ],
    ].map((models) => ({ models })),
  )(
    "a missing, changed or ambiguous model identity queues no note inference: %j",
    async ({ models }) => {
      const fetch = vi
        .fn()
        .mockResolvedValueOnce(response({ details: { format: "safetensors" } }))
        .mockResolvedValueOnce(response({ models }));
      vi.stubGlobal("fetch", fetch);
      await expect(
        classifyWithLocalModel(source, "fictional-model", undefined, evaluatedDigest),
      ).rejects.toThrow("evaluated version");
      expect(fetch.mock.calls.map(([url]) => url)).toEqual([
        "http://127.0.0.1:11434/api/show",
        "http://127.0.0.1:11434/api/tags",
      ]);
    },
  );
  it("invalid configured digests fail before inspecting or sending any note", async () => {
    const fetch = localFixture();
    await expect(
      classifyWithLocalModel(source, "fictional-model", undefined, "wrong"),
    ).rejects.toThrow("digest");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("preserves exact source and sends only the frozen small-label prompt to verified loopback", async () => {
    const fetch = localFixture();
    const metadata = await classifyWithLocalModel(source, "fictional-downloaded-model");
    expect(metadata.source).toBe(source);
    expect(metadata.advice).toEqual({ category: "BOOK", intent: "wishlist" });
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([
      "http://127.0.0.1:11434/api/show",
      "http://127.0.0.1:11434/api/chat",
    ]);
    const options = fetch.mock.calls[1]![1] as RequestInit;
    const body = JSON.parse(options.body as string);
    expect(body.options).toEqual({
      temperature: 0,
      num_ctx: 2048,
      num_predict: 80,
      repeat_penalty: 1,
      presence_penalty: 0,
    });
    expect(body.keep_alive).toBe(0);
    expect(body.think).toBe(false);
    expect(body.stream).toBe(false);
    expect(body.format).toEqual(classificationJson);
    expect(body.messages).toEqual([
      { role: "system", content: classificationInstructions },
      { role: "user", content: JSON.stringify({ note: source }) },
    ]);
    expect(options.redirect).toBe("error");
    expect(options.credentials).toBe("omit");
  });
  it.each(["cloud-example", "https://external.example/model"])(
    "blocks remote names without sending source: %s",
    async (model) => {
      const fetch = localFixture();
      await expect(classifyWithLocalModel(source, model)).rejects.toThrow("downloaded");
      expect(fetch).not.toHaveBeenCalled();
    },
  );
  it("rejects a remotely backed model at metadata inspection without sending the note", async () => {
    const fetch = vi.fn().mockResolvedValue(
      response({
        details: { format: "safetensors" },
        remote_host: "external.example",
      }),
    );
    vi.stubGlobal("fetch", fetch);
    await expect(classifyWithLocalModel(source, "fictional-model")).rejects.toThrow("blocked");
    expect(fetch).toHaveBeenCalledOnce();
    expect(JSON.stringify(fetch.mock.calls)).not.toContain(source);
  });
  it("does not accept IDs, amounts or titles as classification advice", async () => {
    localFixture('{"category":"BOOK","intent":"wishlist","matchedMemoryId":"wrong"}');
    await expect(classifyWithLocalModel(source, "fictional-model")).rejects.toThrow();
  });
  it("does not silently truncate long or escaped notes into the evaluated context", async () => {
    const fetch = localFixture();
    await expect(classifyWithLocalModel("a".repeat(1100), "fictional-model")).rejects.toThrow(
      "shorter",
    );
    await expect(classifyWithLocalModel("\u0000".repeat(200), "fictional-model")).rejects.toThrow(
      "shorter",
    );
    expect(fetch).not.toHaveBeenCalled();
  });
  it("an already cancelled capture makes no inference requests", async () => {
    const fetch = localFixture();
    const controller = new AbortController();
    controller.abort();
    await expect(
      classifyWithLocalModel(source, "fictional-model", controller.signal),
    ).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("a late response after cancellation cannot become usable advice", async () => {
    const controller = new AbortController();
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    fetch.mockImplementationOnce(() => Promise.resolve(response({ details: { format: "gguf" } })));
    fetch.mockImplementationOnce(() => {
      controller.abort();
      return Promise.resolve(
        response({ message: { content: '{"category":"BOOK","intent":"wishlist"}' } }),
      );
    });
    await expect(
      classifyWithLocalModel(source, "fictional-model", controller.signal),
    ).rejects.toThrow();
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("cancellation during model inspection never queues a note inference", async () => {
    const controller = new AbortController();
    const fetch = vi.fn().mockImplementationOnce(() => {
      controller.abort();
      return Promise.resolve(response({ details: { format: "safetensors" } }));
    });
    vi.stubGlobal("fetch", fetch);
    await expect(
      classifyWithLocalModel(source, "fictional-model", controller.signal),
    ).rejects.toThrow();
    expect(fetch).toHaveBeenCalledOnce();
  });
});
