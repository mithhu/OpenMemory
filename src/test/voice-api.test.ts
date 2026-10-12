import { afterEach, describe, expect, it, vi } from "vitest";
import { validateAudio, MAX_AUDIO_BYTES } from "../lib/voice";
vi.mock("@tanstack/react-start/server-only", () => ({}));
import { transcribe, voiceConfiguration } from "../lib/voice.server";
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
function audio(type = "audio/webm", size = 500) {
  const form = new FormData();
  form.append("audio", new Blob(["a".repeat(size)], { type }), "test.webm");
  return form;
}
describe("Server-side voice boundary", () => {
  it("accepts supported audio and rejects wrong types, empty or oversized files", () => {
    expect(validateAudio(audio()).file.size).toBe(500);
    expect(() => validateAudio(audio("text/plain"))).toThrow("Unsupported");
    expect(() => validateAudio(audio("audio/webm", 1))).toThrow("short note");
    expect(() => validateAudio(audio("audio/webm", MAX_AUDIO_BYTES + 1))).toThrow("short note");
    expect(() => validateAudio({})).toThrow("Upload");
  });
  it("returns only configuration status, never the key", () => {
    vi.stubEnv("ELEVENLABS_API_KEY", "test-secret");
    expect(voiceConfiguration()).toEqual({ configured: true, model: "scribe_v2" });
  });
  it("keeps the key on the upstream request and returns only transcript text/language", async () => {
    vi.stubEnv("ELEVENLABS_API_KEY", "test-secret");
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ text: "Want to watch Arrival.", language_code: "eng", words: [] }),
    });
    vi.stubGlobal("fetch", fetcher);
    expect(await transcribe(new Blob(["fictional audio"], { type: "audio/webm" }))).toEqual({
      text: "Want to watch Arrival.",
      language: "eng",
    });
    const request = fetcher.mock.calls[0]![1];
    expect(request.headers["xi-api-key"]).toBe("test-secret");
    expect(request.body.get("model_id")).toBe("scribe_v2");
    expect(request.body.get("file")).toBeInstanceOf(Blob);
  });
  it("does not expose provider response bodies or credentials on errors", async () => {
    vi.stubEnv("ELEVENLABS_API_KEY", "test-secret");
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue({ ok: false, status: 401, text: async () => "private provider detail" }),
    );
    await expect(transcribe(new Blob(["audio"]))).rejects.toThrow("rejected the key");
  });
  it("rejects an empty transcript and reports network failures", async () => {
    vi.stubEnv("ELEVENLABS_API_KEY", "test-secret");
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ text: "  " }) });
    vi.stubGlobal("fetch", fetcher);
    await expect(transcribe(new Blob(["audio"]))).rejects.toThrow("No speech");
    fetcher.mockRejectedValue(new Error("network"));
    await expect(transcribe(new Blob(["audio"]))).rejects.toThrow("recording is still here");
  });
});
