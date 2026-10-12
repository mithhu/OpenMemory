import { afterEach, describe, expect, it, vi } from "vitest";
import { splitCaptureNote } from "../lib/source-chunks";
import { planWithProvider, requestOllama } from "../lib/ai-client";
import { planCapture } from "../lib/astra";

vi.mock("../lib/astra", () => ({
  planCapture: vi.fn(),
  connectMemories: vi.fn(),
  mapMemories: vi.fn(),
  discoverLibrary: vi.fn(),
}));
afterEach(() => vi.unstubAllGlobals());

const localMetadata = () => new Response(JSON.stringify({ details: { format: "gguf" } }));
const localReply = (result: unknown) =>
  new Response(JSON.stringify({ message: { content: JSON.stringify(result) } }));
const localEntry = (note: string, media = false) => ({
  title: media ? "Luminous Paths" : note,
  summary: note,
  category: media ? "BOOK" : "NOTE",
  date: "2026-10-09",
  matchedMemoryId: null,
  candidateMemoryIds: [],
  clarificationQuestion: null,
  tags: [],
  activity: media
    ? {
        kind: "book",
        intent: "progress",
        progress: 10,
        progressMode: "increment",
        total: null,
        lessonNumbers: [],
        sentiment: null,
        creator: null,
      }
    : null,
});

describe("Source sequencing and atomic capture planning", () => {
  it.each(['```json\n{"value":1}\n```', '```\n{"value":1}\n```'])(
    "accepts a whole JSON fence without changing its data: %s",
    async (content) => {
      const fetch = vi
        .fn()
        .mockResolvedValueOnce(localMetadata())
        .mockResolvedValueOnce(new Response(JSON.stringify({ message: { content } })));
      vi.stubGlobal("fetch", fetch);
      await expect(requestOllama("Classify", {}, {}, "local-model")).resolves.toEqual({ value: 1 });
    },
  );
  it.each([
    "Here is JSON:\n```json\n{}\n```",
    "```json\n{}\n```\nExplanation",
    "```json\ninvalid\n```",
  ])("rejects malformed or prose-wrapped output: %s", async (content) => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(localMetadata())
      .mockResolvedValueOnce(new Response(JSON.stringify({ message: { content } })));
    vi.stubGlobal("fetch", fetch);
    await expect(requestOllama("Classify", {}, {}, "local-model")).rejects.toThrow(
      "unreadable result",
    );
  });
  it("accepts downloaded MLX weights and supplies explicit JSON instructions", async () => {
    const schema = { type: "object", properties: { value: { type: "string" } } };
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ details: { format: "safetensors" } })))
      .mockResolvedValueOnce(localReply({ value: "fictional" }));
    vi.stubGlobal("fetch", fetch);
    await expect(
      requestOllama("Classify the note.", { note: "fictional" }, schema, "qwen3.5:4b-mlx"),
    ).resolves.toEqual({ value: "fictional" });
    const body = JSON.parse(fetch.mock.calls[1]![1].body);
    expect(body.format).toEqual(schema);
    expect(body.messages[0].content).toContain(JSON.stringify(schema));
    expect(body.messages[0].content).toContain("Return only valid JSON");
  });
  it.each([
    { details: { format: "safetensors" }, remote_host: "https://example.com" },
    { details: { format: "safetensors" }, remote_model: "hidden-cloud" },
    { details: { format: "unknown" } },
  ])("blocks remote or unknown formats before sending note: %j", async (metadata) => {
    const fetch = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify(metadata)));
    vi.stubGlobal("fetch", fetch);
    await expect(requestOllama("Classify", { note: "private" }, {}, "local-alias")).rejects.toThrow(
      "blocked before sending",
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("waits for a chunk's extraction and title check before launching the next local request", async () => {
    let finishExtraction!: (response: Response) => void;
    let finishTitles!: (response: Response) => void;
    const extraction = new Promise<Response>((resolve) => {
      finishExtraction = resolve;
    });
    const titles = new Promise<Response>((resolve) => {
      finishTitles = resolve;
    });
    const fetch = vi
      .fn()
      .mockImplementationOnce(localMetadata)
      .mockReturnValueOnce(extraction)
      .mockImplementationOnce(localMetadata)
      .mockReturnValueOnce(titles)
      .mockImplementationOnce(localMetadata)
      .mockResolvedValueOnce(localReply({ entries: [localEntry("Had tea")] }));
    vi.stubGlobal("fetch", fetch);
    const first = "Read 10 pages of Luminous Paths";
    const pending = planWithProvider(
      { text: `${first}; then Had tea`, today: "2026-10-09", memories: [] },
      { provider: "ollama", model: "local-model" },
    );
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(fetch.mock.calls.map(([url]) => String(url))).toEqual([
      "http://127.0.0.1:11434/api/show",
      "http://127.0.0.1:11434/api/chat",
    ]);
    finishExtraction(localReply({ entries: [localEntry(first, true)] }));
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(4));
    const titleInput = JSON.parse(String(fetch.mock.calls[3]![1].body));
    expect(JSON.parse(titleInput.messages[1].content).note).toBe(first);
    expect(titleInput.format.properties).toHaveProperty("titles");
    finishTitles(
      localReply({
        titles: [
          { entryIndex: 0, sourceTitle: "Luminous Paths", suggestedTitle: "Luminous Paths" },
        ],
      }),
    );
    const plan = await pending;
    expect(fetch).toHaveBeenCalledTimes(6);
    const secondInput = JSON.parse(String(fetch.mock.calls[5]![1].body));
    expect(JSON.parse(secondInput.messages[1].content).note).toBe("Had tea");
    expect(plan.entries.map((entry) => entry.summary)).toEqual([first, "Had tea"]);
  });
  it("does not launch later chunks when the first extraction fails", async () => {
    const fetch = vi
      .fn()
      .mockImplementationOnce(localMetadata)
      .mockResolvedValueOnce(new Response("", { status: 500 }));
    vi.stubGlobal("fetch", fetch);
    await expect(
      planWithProvider(
        { text: "Had tea; then Watched ducks", today: "2026-10-09", memories: [] },
        { provider: "ollama", model: "local-model" },
      ),
    ).rejects.toThrow("HTTP 500");
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("does not launch later chunks when the first title check is cancelled", async () => {
    const controller = new AbortController();
    const first = "Read 10 pages of Luminous Paths";
    const fetch = vi
      .fn()
      .mockImplementationOnce(localMetadata)
      .mockResolvedValueOnce(localReply({ entries: [localEntry(first, true)] }))
      .mockImplementationOnce(localMetadata)
      .mockImplementationOnce(
        (_url, options) =>
          new Promise((_resolve, reject) => {
            options.signal.addEventListener("abort", () => reject(options.signal.reason), {
              once: true,
            });
          }),
      );
    vi.stubGlobal("fetch", fetch);
    const pending = planWithProvider(
      { text: `${first}; then Had tea`, today: "2026-10-09", memories: [] },
      { provider: "ollama", model: "local-model" },
      controller.signal,
    );
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(4));
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(fetch).toHaveBeenCalledTimes(4);
  });
  it("passes the cancellation signal to the cloud transport without a local fallback", async () => {
    const controller = new AbortController();
    const data = { text: "A fictional walk", today: "2026-10-09", memories: [] };
    const plan = {
      entries: [
        {
          title: "A walk",
          summary: data.text,
          category: "NOTE" as const,
          date: data.today,
          matchedMemoryId: null,
          candidateMemoryIds: [],
          clarificationQuestion: null,
          tags: [],
          activity: null,
        },
      ],
    };
    vi.mocked(planCapture).mockResolvedValueOnce(plan);
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await expect(
      planWithProvider(data, { provider: "astra", model: "astra" }, controller.signal),
    ).resolves.toEqual(plan);
    expect(planCapture).toHaveBeenCalledWith({ data, signal: controller.signal });
    expect(fetch).not.toHaveBeenCalled();
  });
  it("does not contact a provider for an already cancelled capture", async () => {
    const controller = new AbortController();
    controller.abort();
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await expect(
      planWithProvider(
        { text: "Fictional note", today: "2026-10-09", memories: [] },
        { provider: "ollama", model: "qwen3.5:9b" },
        controller.signal,
      ),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(fetch).not.toHaveBeenCalled();
  });
  it("aborts a running local capture instead of launching another title request", async () => {
    const controller = new AbortController();
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ details: { format: "gguf" } })))
      .mockImplementationOnce(
        (_url, options) =>
          new Promise((_resolve, reject) => {
            options.signal.addEventListener("abort", () => reject(options.signal.reason), {
              once: true,
            });
          }),
      );
    vi.stubGlobal("fetch", fetch);
    const pending = planWithProvider(
      { text: "Fictional note", today: "2026-10-09", memories: [] },
      { provider: "ollama", model: "qwen3.5:9b" },
      controller.signal,
    );
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("explains a slow local reply without claiming Ollama is unreachable or falling back", async () => {
    const timeout = new Error("The operation timed out");
    timeout.name = "TimeoutError";
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ details: { format: "gguf" } })))
      .mockRejectedValueOnce(timeout);
    vi.stubGlobal("fetch", fetch);
    await expect(requestOllama("Fictional trial", {}, {}, "qwen3.5:9b")).rejects.toThrow(
      "local model took longer than two minutes",
    );
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(
      fetch.mock.calls.every(([url]) => String(url).startsWith("http://127.0.0.1:11434/")),
    ).toBe(true);
  });
  it("distinguishes timing out during model verification from a slow inference reply", async () => {
    const timeout = new Error("The operation timed out");
    timeout.name = "TimeoutError";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(timeout));
    await expect(requestOllama("Fictional trial", {}, {}, "qwen3.5:9b")).rejects.toThrow(
      "local model check took too long",
    );
  });
  it("splits strong sequencing while preserving exact source words", () => {
    expect(splitCaptureNote("Read 12 pages; then watched rain; and then called mum")).toEqual([
      "Read 12 pages",
      "watched rain",
      "called mum",
    ]);
  });
  it.each([
    'Watched "Wait; then Run" and liked it',
    "Read 'Wait; then Run' this morning",
    "Read ‘Wait; then Run’ this morning",
    "Read notes (chapter one; then chapter two)",
    "I watched a film; then loved the ending",
    "Read 10 pages; then actually corrected it to 12",
    "I finished a book and loved it",
    "I read the book North and South",
  ])("keeps protected titles, reactions and corrections together: %s", (note) => {
    expect(splitCaptureNote(note)).toEqual([note]);
  });
  it("avoids partial chunks on empty fragments and excessive events", () => {
    expect(splitCaptureNote("; then read a book")).toEqual(["; then read a book"]);
    const note = Array.from({ length: 9 }, (_, i) => `Event ${i}`).join("; then ");
    expect(splitCaptureNote(note)).toEqual([note]);
  });
  it("combines independently extracted chunks into one review plan", async () => {
    const notes: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, options: RequestInit) => {
        if (url.endsWith("/api/show"))
          return new Response(JSON.stringify({ details: { format: "gguf" } }));
        const request = JSON.parse(String(options.body));
        const note = JSON.parse(request.messages[1].content).note;
        notes.push(note);
        return new Response(
          JSON.stringify({
            message: {
              content: JSON.stringify({
                entries: [
                  {
                    title: note,
                    summary: note,
                    category: "NOTE",
                    date: "2026-10-09",
                    matchedMemoryId: null,
                    candidateMemoryIds: [],
                    clarificationQuestion: null,
                    tags: [],
                    activity: null,
                  },
                ],
              }),
            },
          }),
        );
      }),
    );
    const plan = await planWithProvider(
      { memories: [], today: "2026-10-09", text: "Had tea; then watched ducks" },
      { provider: "ollama", model: "local-model" },
    );
    expect(notes).toEqual(["Had tea", "watched ducks"]);
    expect(plan.entries.map((entry) => entry.summary)).toEqual(notes);
  });
  it("returns no partial plan if one chunk fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, options: RequestInit) => {
        if (url.endsWith("/api/show"))
          return new Response(JSON.stringify({ details: { format: "gguf" } }));
        const request = JSON.parse(String(options.body));
        const note = JSON.parse(request.messages[1].content).note;
        if (note === "watched ducks") return new Response("", { status: 500 });
        return new Response(
          JSON.stringify({
            message: {
              content: JSON.stringify({
                entries: [
                  {
                    title: note,
                    summary: note,
                    category: "NOTE",
                    date: "2026-10-09",
                    matchedMemoryId: null,
                    candidateMemoryIds: [],
                    clarificationQuestion: null,
                    tags: [],
                    activity: null,
                  },
                ],
              }),
            },
          }),
        );
      }),
    );
    await expect(
      planWithProvider(
        { memories: [], today: "2026-10-09", text: "Had tea; then watched ducks" },
        { provider: "ollama", model: "local-model" },
      ),
    ).rejects.toThrow("HTTP 500");
  });
});
