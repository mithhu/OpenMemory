import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkLocalOllamaSetup } from "../lib/local-ollama-readiness";
import { classifierDigest, classifierDigests, classifierName } from "../lib/local-ollama";
const extractor = "qwen3.5:9b";
const local = { details: { format: "gguf" } };
const fetchMock = vi.fn();
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const inventory = (digest = classifierDigest) => ({
  models: [
    { name: classifierName, digest },
    { name: extractor, digest: "extractor" },
  ],
});
beforeEach(() => vi.stubGlobal("fetch", fetchMock.mockReset()));
afterEach(() => vi.unstubAllGlobals());
describe("explicit local Ollama readiness", () => {
  it("reports failed browser permission without claiming a precise network cause", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    const result = await checkLocalOllamaSetup(extractor);
    expect(result.ready).toBe(false);
    expect(result.connection.state).toBe("blocked");
    expect(result.connection.message).toContain("browser local network access");
    expect(result.classifier.state).toBe("unverified");
    expect(fetchMock).toHaveBeenCalledOnce();
  });
  it("distinguishes an origin rejection from an unreachable service", async () => {
    fetchMock.mockResolvedValue(reply({}, 403));
    expect((await checkLocalOllamaSetup(extractor)).connection.message).toContain("OLLAMA_ORIGINS");
  });
  it("guides a fresh user to install the missing trained classifier", async () => {
    fetchMock
      .mockResolvedValueOnce(reply({ models: [{ name: extractor, digest: "extractor" }] }))
      .mockResolvedValueOnce(reply(local));
    const result = await checkLocalOllamaSetup(extractor);
    expect(result.classifier.state).toBe("missing");
    expect(result.classifier.message).toContain("setup guide");
    expect(result.extractor.state).toBe("ready");
    expect(result.ready).toBe(false);
  });
  it("rejects the right classifier name with a different digest", async () => {
    fetchMock
      .mockResolvedValueOnce(reply(inventory("f".repeat(64))))
      .mockResolvedValueOnce(reply(local));
    const result = await checkLocalOllamaSetup(extractor);
    expect(result.classifier.state).toBe("changed");
    expect(result.ready).toBe(false);
    expect(
      fetchMock.mock.calls.some(
        ([, options]) => options.body === JSON.stringify({ model: classifierName }),
      ),
    ).toBe(false);
  });
  it("reports the missing selected extractor independently", async () => {
    fetchMock
      .mockResolvedValueOnce(
        reply({ models: [{ name: classifierName, digest: classifierDigest }] }),
      )
      .mockResolvedValueOnce(reply(local));
    const result = await checkLocalOllamaSetup(extractor);
    expect(result.classifier.state).toBe("ready");
    expect(result.extractor.state).toBe("missing");
    expect(result.ready).toBe(false);
  });
  it("never treats the classifier as a general extraction model", async () => {
    fetchMock.mockResolvedValueOnce(reply(inventory())).mockResolvedValueOnce(reply(local));
    const result = await checkLocalOllamaSetup(classifierName);
    expect(result.extractor.message).toContain("different from the trained classifier");
    expect(result.ready).toBe(false);
  });
  it("rejects cloud metadata even when a model appears in the installed list", async () => {
    fetchMock
      .mockResolvedValueOnce(reply(inventory()))
      .mockResolvedValueOnce(reply(local))
      .mockResolvedValueOnce(reply({ ...local, remote_host: "example.invalid" }));
    expect((await checkLocalOllamaSetup(extractor)).extractor.state).toBe("blocked");
  });
  it.each(classifierDigests)(
    "is ready with each exact evaluated classifier profile and two verified local models: %s",
    async (digest) => {
      fetchMock
        .mockResolvedValueOnce(reply(inventory(digest)))
        .mockResolvedValueOnce(reply(local))
        .mockResolvedValueOnce(reply(local));
      const result = await checkLocalOllamaSetup(extractor);
      expect(result.ready).toBe(true);
      expect(result.models).toEqual([extractor]);
      expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
        "http://127.0.0.1:11434/api/tags",
        "http://127.0.0.1:11434/api/show",
        "http://127.0.0.1:11434/api/show",
      ]);
      for (const [, options] of fetchMock.mock.calls) {
        expect(options).toMatchObject({
          credentials: "omit",
          redirect: "error",
          referrerPolicy: "no-referrer",
        });
        expect(options.signal).toBeInstanceOf(AbortSignal);
        if (options.body) expect(Object.keys(JSON.parse(options.body))).toEqual(["model"]);
      }
    },
  );
});
