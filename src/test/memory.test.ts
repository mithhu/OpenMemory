import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyCapture,
  demoMemories,
  fingerprint,
  loadMemories,
  logAnswer,
  recordAction,
  saveMemories,
  type CaptureResult,
} from "@/lib/memory";
import {
  capture,
  mapMemoryGraph,
  requestStructured,
  synthesize,
  validateReferences,
} from "@/lib/astra.server";

const result: CaptureResult = {
  action: "create",
  matchedMemoryId: null,
  candidateMemoryIds: [],
  clarificationQuestion: null,
  title: "A clear morning",
  category: "NOTE",
  date: "2026-10-06",
  summary: "Finished the prototype after a walk.",
  followUpQuestion: "What helped you focus?",
  suggestedAnswers: ["The walk", "A quiet desk"],
  answerLabel: "Focus",
  why: null,
  targetDate: null,
  tags: ["focus"],
};
const makeResponse = (value: unknown) =>
  new Response(
    JSON.stringify({
      status: "completed",
      output: [
        { type: "message", content: [{ type: "output_text", text: JSON.stringify(value) }] },
      ],
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );

beforeEach(() => {
  localStorage.clear();
  vi.stubEnv("OPEN_AI_KEY", "test-key-not-real");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("Memory continuity and storage", () => {
  it("turns an explicitly completed step into a memory without inventing its outcome", () => {
    const memories = demoMemories();
    const next = recordAction(
      memories,
      {
        title: "Call Dad",
        detail: "Call and arrange a river walk",
        memoryIds: [memories[0]!.id, "invented"],
      },
      true,
    );
    expect(next[0]?.completionStatus).toBe("completed");
    expect(next[0]?.summary).toContain("marked “Call Dad” as completed");
    expect(next[0]?.summary).not.toContain("arrange a river walk");
    expect(next[0]?.relatedMemoryIds).toEqual([memories[0]!.id]);
    const reopened = recordAction(next, { title: "Call Dad", detail: "", memoryIds: [] }, false);
    expect(reopened).toHaveLength(next.length);
    expect(reopened[0]?.id).toBe(next[0]?.id);
    expect(reopened[0]?.completionStatus).toBe("reopened");
    expect(reopened[0]?.transcripts).toHaveLength(2);
  });
  it("updates a memory without losing its answers, notes, or original creation date", () => {
    const initial = demoMemories();
    const memory = logAnswer(initial[0]!, "The walk helped");
    const updated = applyCapture(
      [memory, ...initial.slice(1)],
      { ...result, action: "update", matchedMemoryId: memory.id },
      "A new detail",
    );
    expect(updated).toHaveLength(initial.length);
    expect(updated[0]?.id).toBe(memory.id);
    expect(updated[0]?.createdAt).toBe(memory.createdAt);
    expect(updated[0]?.answers).toEqual(memory.answers);
    expect(updated[0]?.transcripts).toEqual([...memory.transcripts, "A new detail"]);
  });
  it("rejects updates to deleted memories instead of recreating them", () => {
    expect(() =>
      applyCapture([], { ...result, action: "update", matchedMemoryId: "removed" }, "new note"),
    ).toThrow("removed");
  });
  it("preserves unrelated edits made while capture was in flight", () => {
    const memories = demoMemories();
    const current = memories.map((m, i) =>
      i === 1 ? { ...m, title: "Edited while thinking" } : m,
    );
    const next = applyCapture(current, result, "new thought");
    expect(next.find((m) => m.id === memories[1]?.id)?.title).toBe("Edited while thinking");
  });
  it("keeps malformed stored data intact rather than silently resetting it", () => {
    localStorage.setItem("echo.memories.v1", '{"broken":true}');
    expect(() => loadMemories()).toThrow("could not be read");
    expect(localStorage.getItem("echo.memories.v1")).toBe('{"broken":true}');
  });
  it("doesn't reseed an intentionally empty journal", () => {
    saveMemories([]);
    expect(loadMemories()).toEqual([]);
  });
  it("records the answer as known information and changes the briefing fingerprint", () => {
    const memories = demoMemories();
    const next = logAnswer(memories[0]!, "A quiet park");
    expect(next.answers.at(-1)?.value).toBe("A quiet park");
    expect(next.followUpQuestion).toBe("");
    expect(fingerprint([next, ...memories.slice(1)])).not.toBe(fingerprint(memories));
  });
});

describe("Grounded Astra responses", () => {
  it("maps role references independently of briefings and preserves their inferred basis", async () => {
    const memories = demoMemories()
      .slice(0, 2)
      .map((m, i) => ({
        ...m,
        title: i ? "Alex is my best friend" : "Endgame with my best friend",
        summary: i ? "Alex is my best friend." : "I watched Endgame with my best friend.",
      }));
    const connection = {
      from: memories[0]!.id,
      to: memories[1]!.id,
      label: "Your best friend, Alex",
      reason: "Alex may be the friend named by the role in the movie note.",
      basis: "inferred",
    };
    const fetchMock = vi.fn().mockResolvedValue(
      makeResponse({
        connections: [
          connection,
          { ...connection, to: "invented" },
          { ...connection, from: connection.to, to: connection.from },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    expect(await mapMemoryGraph({ memories, today: "2026-10-06" })).toEqual({
      connections: [connection],
    });
    const payload = JSON.parse(fetchMock.mock.calls[0]![1].body);
    expect(payload.input).toContain("Alex is my best friend");
    expect(payload.instructions).toContain("ONLY person explicitly identified by that role");
    expect(payload.instructions).toContain("do NOT guess an identity link");
  });
  it("doesn't request relationship mapping for fewer than two memories", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(
      await mapMemoryGraph({ memories: demoMemories().slice(0, 1), today: "2026-10-06" }),
    ).toEqual({ connections: [] });
    expect(await mapMemoryGraph({ memories: [], today: "2026-10-06" })).toEqual({
      connections: [],
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("removes invented, duplicate, and self connections and unsupported insight sources", () => {
    const memories = demoMemories();
    const a = memories[0]!.id;
    const b = memories[1]!.id;
    const cleaned = validateReferences(
      {
        headline: "A pattern",
        answer: "An answer",
        openQuestion: "What next?",
        connections: [
          { from: a, to: b, label: "valid", reason: "evidence" },
          { from: b, to: a, label: "duplicate", reason: "evidence" },
          { from: a, to: a, label: "self", reason: "evidence" },
          { from: a, to: "invented", label: "wrong", reason: "no evidence" },
        ],
        insights: [{ kind: "pattern", title: "wrong", detail: "wrong", memoryIds: ["invented"] }],
        actions: [],
      },
      memories,
    );
    expect(cleaned.connections).toHaveLength(1);
    expect(cleaned.insights).toEqual([]);
  });
  it("sends known answers and uses the server key with non-stored structured output", async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeResponse(result));
    vi.stubGlobal("fetch", fetchMock);
    const memory = logAnswer(demoMemories()[0]!, "The river walk");
    await capture({ memories: [memory], text: "A clear morning", today: "2026-10-06" });
    const options = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const payload = JSON.parse(options.body as string);
    expect(payload.model).toBe("gpt-6-astra");
    expect(payload.store).toBe(false);
    expect(payload.text.format.strict).toBe(true);
    expect(payload.input).toContain("The river walk");
    expect(options.headers).toMatchObject({ Authorization: "Bearer test-key-not-real" });
  });
  it("requires forced updates to respect the selected memory", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(makeResponse(result)));
    const memories = demoMemories();
    await expect(
      capture({ memories, text: "new detail", today: "2026-10-06", forcedId: memories[0]!.id }),
    ).rejects.toThrow("selected memory");
  });
  it("rejects clarification that points to nonexistent candidates", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          makeResponse({ ...result, action: "clarify", candidateMemoryIds: ["wrong", "wrong2"] }),
        ),
    );
    await expect(
      capture({ memories: demoMemories(), text: "that thing", today: "2026-10-06" }),
    ).rejects.toThrow("narrow that down");
  });
  it("provides an actionable error for rejected credentials without exposing the key", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 401 })));
    await expect(requestStructured("test", {}, "test", {})).rejects.toThrow("rejected the API key");
  });
  it("detects incomplete model output before parsing or saving it", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(new Response(JSON.stringify({ status: "incomplete" }), { status: 200 })),
    );
    await expect(requestStructured("test", {}, "test", {})).rejects.toThrow("cut short");
  });
  it("doesn't make a paid API request without any memories", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      synthesize({ memories: [], question: "what next?", today: "2026-10-06" }),
    ).rejects.toThrow("Add a few memories");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
