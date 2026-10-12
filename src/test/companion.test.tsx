import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, cleanup, waitFor } from "@testing-library/react";
import { applyActivity, type ActivityCommand } from "@/lib/activity";
import {
  applyCapturePlan,
  recordCompletionReview,
  importRecall,
  validatePlan,
  type CaptureEntry,
} from "@/lib/capture-plan";
import { buildTaste, validateDiscovery } from "@/lib/discovery";
import { demoMemories } from "@/lib/memory";
import { CaptureReview } from "@/components/CaptureReview";
import {
  planWithProvider,
  connectWithProvider,
  mapWithProvider,
  discoverWithProvider,
} from "@/lib/ai-client";
import * as cloud from "@/lib/astra";

vi.mock("@/lib/astra", () => ({
  planCapture: vi.fn(),
  connectMemories: vi.fn(),
  mapMemories: vi.fn(),
  discoverLibrary: vi.fn(),
}));
const command = (overrides: Partial<ActivityCommand> = {}): ActivityCommand => ({
  kind: "book",
  intent: "progress",
  progress: 30,
  progressMode: "increment",
  total: null,
  lessonNumbers: [],
  sentiment: null,
  creator: null,
  ...overrides,
});
const entry = (overrides: Partial<CaptureEntry> = {}): CaptureEntry => ({
  title: "Sapiens",
  summary: "Read 30 pages of Sapiens.",
  date: "2026-10-08",
  category: "BOOK",
  matchedMemoryId: null,
  candidateMemoryIds: [],
  clarificationQuestion: null,
  tags: ["history"],
  activity: command(),
  ...overrides,
});
beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Progress belongs to explicit events", () => {
  it("wishlist updates preserve recorded progress and reject a smaller total", () => {
    const before = applyActivity(
      undefined,
      command({ progress: 80, total: 100 }),
      "2026-10-08",
      "Read 80 pages",
    );
    const wish = command({ intent: "wishlist", progress: null, total: 120 });
    const after = applyActivity(before, wish, "2026-10-09", "Want to keep reading");
    expect(after).toMatchObject({ progress: 80, total: 120, status: "in-progress" });
    expect(after.history).toHaveLength(2);
    expect(() =>
      applyActivity(before, { ...wish, total: 50 }, "2026-10-09", "Wrong total"),
    ).toThrow("less than your recorded progress");
    expect(before).toMatchObject({ progress: 80, total: 100 });
    expect(before.history).toHaveLength(1);
  });
  it("distinguishes pages read from the current page without losing history", () => {
    const first = applyActivity(undefined, command(), "2026-10-08", "read 30 pages");
    const second = applyActivity(
      first,
      command({ progress: 120, progressMode: "absolute" }),
      "2026-10-09",
      "on page 120",
    );
    const third = applyActivity(second, command({ progress: 20 }), "2026-10-10", "read 20 pages");
    expect(third.progress).toBe(140);
    expect(third.history).toHaveLength(3);
    expect(first.progress).toBe(30);
  });
  it("deduplicates lessons and refuses lesson numbers beyond the known total", () => {
    const first = applyActivity(
      undefined,
      command({ kind: "course", progress: null, total: 5, lessonNumbers: [1, 2] }),
      "2026-10-08",
      "did lessons 1-2",
    );
    const second = applyActivity(
      first,
      command({ kind: "course", progress: null, lessonNumbers: [2, 3] }),
      "2026-10-09",
      "did lessons 2-3",
    );
    expect(second.completedLessons).toEqual([1, 2, 3]);
    expect(second.progress).toBe(3);
    expect(() =>
      applyActivity(
        second,
        command({ kind: "course", progress: null, lessonNumbers: [6] }),
        "2026-10-10",
        "bad range",
      ),
    ).toThrow("exceeds");
  });
  it("keeps unknown totals empty and wishes separate from completed experiences", () => {
    const planned = applyActivity(
      undefined,
      command({ kind: "movie", intent: "wishlist", progress: null }),
      "2026-10-08",
      "want to watch Dune",
    );
    expect(planned.status).toBe("planned");
    expect(planned.total).toBeNull();
    const completed = applyActivity(
      planned,
      command({ kind: "movie", intent: "complete", progress: null }),
      "2026-10-09",
      "watched Dune",
    );
    expect(completed.status).toBe("completed");
    expect(completed.total).toBeNull();
    expect(completed.progress).toBe(0);
  });
  it("adds one listen, while a reaction never adds another play or reopens a finished item", () => {
    const first = applyActivity(
      undefined,
      command({ kind: "music", intent: "listen", progress: null }),
      "2026-10-08",
      "listened to Imagine",
    );
    const reaction = applyActivity(
      first,
      command({ kind: "music", intent: "progress", progress: null, sentiment: "loved" }),
      "2026-10-08",
      "loved it",
    );
    expect(reaction.progress).toBe(1);
    expect(reaction.status).toBe("completed");
    expect(reaction.sentiment).toBe("loved");
  });
  it("keeps a finished course's checklist consistent with its total", () => {
    const completed = applyActivity(
      undefined,
      command({ kind: "course", intent: "complete", progress: null, total: 4 }),
      "2026-10-08",
      "finished course",
    );
    expect(completed.progress).toBe(4);
    expect(completed.completedLessons).toEqual([1, 2, 3, 4]);
    expect(completed.status).toBe("completed");
  });
});
describe("Review and memory continuity", () => {
  it("does not save a proposal before the user confirms", async () => {
    const save = vi.fn().mockResolvedValue(true);
    render(
      <CaptureReview
        plan={{ entries: [entry()] }}
        text="read 30 pages"
        memories={[]}
        onSave={save}
        onCancel={() => {}}
      />,
    );
    expect(save).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Save 1 entry" }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
  });
  it("lets a user correct a diary classification to a movie before saving", async () => {
    const save = vi.fn().mockResolvedValue(true);
    render(
      <CaptureReview
        plan={{ entries: [entry({ title: "Dune", category: "NOTE", activity: null })] }}
        text="watched Dune"
        memories={[]}
        onSave={save}
        onCancel={() => {}}
      />,
    );
    fireEvent.change(screen.getByLabelText("Entry 1 type"), { target: { value: "movie" } });
    fireEvent.change(screen.getByLabelText("This was"), { target: { value: "complete" } });
    fireEvent.click(screen.getByRole("checkbox", { name: /Entry 1: I finished Dune in full/ }));
    fireEvent.click(screen.getByRole("button", { name: "Save 1 entry" }));
    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(save.mock.calls[0]![0].entries[0].activity.kind).toBe("movie");
    expect(save.mock.calls[0]![0].entries[0].category).toBe("MOVIE");
  });
  it("rejects conflicting model types while retaining ordinary notes without a blanket verb gate", () => {
    expect(() => validatePlan({ entries: [entry({ category: "NOTE" })] }, [])).toThrow(
      "conflicting entry types",
    );
    const sunset = validatePlan(
      { entries: [entry({ title: "Sunset", category: "NOTE", activity: null })] },
      [],
    );
    expect(sunset.entries[0]?.category).toBe("NOTE");
  });
  it("applies mixed events atomically and preserves prior answers and transcripts", () => {
    const first = applyCapturePlan([], { entries: [entry()] }, "Read 30 pages");
    const original = first[0]!;
    const reviewedPlan = {
      entries: [
        entry({
          matchedMemoryId: original.id,
          activity: command({ progress: 120, progressMode: "absolute" }),
        }),
        entry({
          title: "Dune",
          category: "MOVIE",
          activity: command({
            kind: "movie",
            intent: "complete",
            progress: null,
            sentiment: "loved",
          }),
        }),
      ],
    };
    // The manual reviewer explicitly confirms the film was watched in full.
    const next = applyCapturePlan(
      first,
      reviewedPlan,
      "On page 120; watched Dune",
      undefined,
      recordCompletionReview(reviewedPlan, "On page 120; watched Dune", [1]),
    );
    expect(next).toHaveLength(2);
    const book = next.find((m) => m.id === original.id)!;
    expect(book.activity?.progress).toBe(120);
    expect(book.createdAt).toBe(original.createdAt);
    expect(book.transcripts).toHaveLength(2);
    expect(book.activity?.history).toHaveLength(2);
  });
  it("rejects stale or ambiguous matches and never partially mutates the original array", () => {
    const memories = applyCapturePlan([], { entries: [entry()] }, "read 30 pages");
    expect(() =>
      applyCapturePlan(
        memories,
        { entries: [entry(), entry({ matchedMemoryId: "deleted" })] },
        "new",
      ),
    ).toThrow("missing");
    expect(memories).toHaveLength(1);
    expect(memories[0]?.activity?.progress).toBe(30);
    expect(() =>
      applyCapturePlan(
        memories,
        { entries: [entry({ candidateMemoryIds: [memories[0]!.id] })] },
        "new",
      ),
    ).toThrow("Choose");
  });
  it("keeps a library title stable and refuses a cross-type model match", () => {
    const memories = applyCapturePlan([], { entries: [entry()] }, "read 30 pages");
    const updated = applyCapturePlan(
      memories,
      {
        entries: [
          entry({
            title: "Read 20 more pages of Sapiens",
            matchedMemoryId: memories[0]!.id,
            activity: command({ progress: 20 }),
          }),
        ],
      },
      "read 20 more pages",
    );
    expect(updated[0]?.title).toBe("Sapiens");
    expect(updated[0]?.activity?.progress).toBe(50);
    const mismatched = validatePlan(
      {
        entries: [
          entry({
            category: "MOVIE",
            matchedMemoryId: memories[0]!.id,
            activity: command({ kind: "movie" }),
          }),
        ],
      },
      memories,
    );
    expect(mismatched.entries[0]?.matchedMemoryId).toBeNull();
    expect(mismatched.entries[0]?.clarificationQuestion).toContain("another type");
  });
  it("resolves only unique exact library titles and treats life events as separate memories", () => {
    const memories = applyCapturePlan([], { entries: [entry()] }, "read 30 pages");
    const plan = validatePlan({ entries: [entry({ title: " sapiens " })] }, memories);
    expect(plan.entries[0]?.matchedMemoryId).toBe(memories[0]?.id);
    // Explicitly choosing New memory in review can represent another edition.
    expect(
      applyCapturePlan(memories, { entries: [entry({ matchedMemoryId: null })] }, "new edition"),
    ).toHaveLength(2);
    const duplicate = { ...memories[0]!, id: "another-edition" };
    const ambiguous = validatePlan({ entries: [entry()] }, [...memories, duplicate]);
    expect(ambiguous.entries[0]?.matchedMemoryId).toBeNull();
    expect(ambiguous.entries[0]?.candidateMemoryIds).toHaveLength(2);
    const sunset = {
      ...demoMemories()[0]!,
      id: "sunset",
      category: "NOTE" as const,
      title: "Sunset",
    };
    const life = validatePlan(
      {
        entries: [
          entry({ title: "Sunset", category: "NOTE", activity: null, matchedMemoryId: "sunset" }),
        ],
      },
      [sunset],
    );
    expect(life.entries[0]?.matchedMemoryId).toBeNull();
  });
  it("retains the correct lesson inputs when an earlier proposed entry is removed", async () => {
    const save = vi.fn().mockResolvedValue(true);
    render(
      <CaptureReview
        plan={{
          entries: [
            entry({ title: "Course A", activity: command({ kind: "course", lessonNumbers: [1] }) }),
            entry({ title: "Course B", activity: command({ kind: "course", lessonNumbers: [5] }) }),
          ],
        }}
        text="two courses"
        memories={[]}
        onSave={save}
        onCancel={() => {}}
      />,
    );
    fireEvent.change(screen.getAllByLabelText("Lessons completed")[1]!, {
      target: { value: "5-6" },
    });
    fireEvent.click(screen.getAllByRole("button", { name: "Remove entry" })[0]!);
    fireEvent.click(screen.getByRole("button", { name: "Save 1 entry" }));
    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(save.mock.calls[0]![0].entries[0]).toMatchObject({
      title: "Course B",
      activity: { lessonNumbers: [5, 6] },
    });
  });
});
describe("Recall import and discovery", () => {
  it("imports lesson names, completed progress, preferences and original dated logs", () => {
    const imported = importRecall({
      courses: [
        {
          id: "cs229",
          title: "CS229",
          totalLessons: 17,
          completedLessons: [1, 2, 2],
          lessons: [{ n: 1, title: "Introduction", url: "https://example.com/lesson1" }],
          link: "https://example.com/course",
          sentiment: "up",
        },
      ],
      logs: [
        {
          id: "log1",
          category: "learning",
          date: "2026-09-06",
          title: "Did lessons 1-2",
          refId: "cs229",
        },
        { id: "note", category: "diary", date: "2026-09-07", title: "A quiet day" },
      ],
    });
    expect(imported).toHaveLength(2);
    expect(imported[0]?.activity).toMatchObject({
      progress: 2,
      total: 17,
      completedLessons: [1, 2],
      sentiment: "loved",
      lessons: [{ n: 1, title: "Introduction" }],
    });
    expect(imported[0]?.activity?.history[0]?.date).toBe("2026-09-06");
    expect(imported[1]?.category).toBe("NOTE");
  });
  it("keeps wishes and explicitly finished items separate during import", () => {
    const imported = importRecall({
      movies: [
        { id: "dune", title: "Dune", status: "to-watch" },
        { id: "arrival", title: "Arrival", status: "completed", watchedMinutes: null },
      ],
      books: [
        {
          id: "sapiens",
          title: "Sapiens",
          currentPage: 120,
          totalPages: 400,
          status: "reading",
          rating: 8,
        },
      ],
    });
    expect(imported.map((m) => m.activity?.status)).toEqual([
      "planned",
      "completed",
      "in-progress",
    ]);
    expect(imported[2]?.activity?.sentiment).toBe("loved");
  });
  it("sends only a compact taste profile to discovery, excluding diary text and progress history", () => {
    const memories = applyCapturePlan(
      demoMemories(),
      { entries: [entry({ activity: command({ sentiment: "loved" }) })] },
      "personal history should not be sent",
    );
    const taste = buildTaste(memories);
    expect(taste.liked[0]?.title).toBe("Sapiens");
    expect(JSON.stringify(taste)).not.toContain("personal history");
    expect(JSON.stringify(taste)).not.toContain("Maya");
    expect(taste.knownTitles).toContain("Interstellar, again");
  });
  it("rejects unsupported recommendations, known titles, skipped items and duplicates", () => {
    const taste = {
      liked: [{ id: "dune", title: "Dune", kind: "movie" as const, tags: ["science fiction"] }],
      disliked: [],
      knownTitles: ["Dune"],
      skipped: ["Alien"],
    };
    const suggestion = {
      title: "Arrival",
      kind: "movie",
      creator: null,
      reason: "Like Dune",
      memoryIds: ["dune"],
    };
    const cleaned = validateDiscovery(
      {
        suggestions: [
          suggestion,
          suggestion,
          { ...suggestion, title: "Dune" },
          { ...suggestion, title: "Alien" },
          { ...suggestion, title: "Unknown", memoryIds: ["invented"] },
        ],
      },
      taste,
    );
    expect(cleaned.suggestions).toHaveLength(1);
    expect(cleaned.suggestions[0]?.title).toBe("Arrival");
  });
});
describe("Local AI has no silent cloud fallback", () => {
  const settings = { provider: "ollama" as const, model: "local-test-model" };
  it.each(["capture", "map", "ask", "discovery"])(
    "keeps %s local even when Ollama is unavailable",
    async (operation) => {
      const fetch = vi.fn().mockRejectedValue(new Error("offline"));
      vi.stubGlobal("fetch", fetch);
      const memories = applyCapturePlan(
        demoMemories(),
        { entries: [entry({ activity: command({ sentiment: "loved" }) })] },
        "read",
      );
      const data = { memories, today: "2026-10-08" };
      const request =
        operation === "capture"
          ? planWithProvider({ ...data, text: "read 30 pages" }, settings)
          : operation === "map"
            ? mapWithProvider(data, settings)
            : operation === "ask"
              ? connectWithProvider({ ...data, question: "What next?" }, settings)
              : discoverWithProvider(memories, settings, []);
      await expect(request).rejects.toThrow("Nothing was sent to Astra");
      expect(fetch.mock.calls[0]![0]).toBe("http://127.0.0.1:11434/api/show");
      for (const fn of Object.values(cloud)) expect(fn).not.toHaveBeenCalled();
    },
  );
  it("blocks a cloud model hidden behind a local alias before sending the note", async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        remote_model: "remote-model",
        remote_host: "https://example.com",
        details: { format: "gguf" },
      }),
    });
    vi.stubGlobal("fetch", fetch);
    await expect(
      planWithProvider({ text: "private note", today: "2026-10-08", memories: [] }, settings),
    ).rejects.toThrow("blocked before sending");
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetch.mock.calls[0]![1].body)).toEqual({ model: "local-test-model" });
    expect(cloud.planCapture).not.toHaveBeenCalled();
  });
  it("sends only the current note and subject catalog to a downloaded local model", async () => {
    const memories = applyCapturePlan([], { entries: [entry()] }, "previous private transcript");
    const proposed = entry({
      matchedMemoryId: memories[0]!.id,
      activity: command({ progress: 20 }),
    });
    const fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ details: { format: "gguf" } }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ message: { content: JSON.stringify({ entries: [proposed] }) } }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ details: { format: "gguf" } }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          message: {
            content: JSON.stringify({
              titles: [{ entryIndex: 0, sourceTitle: null, suggestedTitle: null }],
            }),
          },
        }),
      });
    vi.stubGlobal("fetch", fetch);
    const plan = await planWithProvider(
      { text: "20 more pages", today: "2026-10-08", memories },
      settings,
    );
    const body = JSON.parse(fetch.mock.calls[1]![1].body);
    const context = JSON.parse(body.messages[1].content);
    expect(context.note).toBe("20 more pages");
    expect(context.catalog).toEqual([
      { id: memories[0]!.id, title: "Sapiens", category: "BOOK", kind: "book" },
    ]);
    expect(JSON.stringify(context)).not.toContain("private transcript");
    expect(plan.entries[0]?.activity?.progress).toBe(20);
    expect(fetch.mock.calls[1]![0]).toBe("http://127.0.0.1:11434/api/chat");
    expect(cloud.planCapture).not.toHaveBeenCalled();
  });
});
