import { webcrypto } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyCapturePlan,
  recordCompletionReview,
  validatePlan,
  type CaptureEntry,
} from "../lib/capture-plan";
import { interpretCaptureTitles } from "../lib/title-interpretation";
import type { ActivityCommand } from "../lib/activity";
import type { Memory } from "../lib/memory";

const command = (overrides: Partial<ActivityCommand> = {}): ActivityCommand => ({
  kind: "book",
  intent: "progress",
  progress: 12,
  progressMode: "increment",
  total: null,
  lessonNumbers: [],
  sentiment: null,
  creator: null,
  ...overrides,
});
const entry = (title: string, overrides: Partial<CaptureEntry> = {}): CaptureEntry => ({
  title,
  summary: "Fictional reading event",
  category: "BOOK",
  date: "2026-10-10",
  matchedMemoryId: null,
  candidateMemoryIds: [],
  clarificationQuestion: null,
  tags: [],
  activity: command(),
  titleSuggestion: null,
  ...overrides,
});
const record = (
  id: string,
  title: string,
  kind: "book" | "movie" = "book",
  progress = 50,
): Memory => ({
  id,
  title,
  category: kind === "book" ? "BOOK" : "MOVIE",
  date: "2026-10-09",
  summary: "Earlier fictional event",
  followUpQuestion: "",
  suggestedAnswers: [],
  answerLabel: "Reflection",
  answers: [],
  transcripts: ["Earlier original note"],
  tags: [],
  createdAt: "2026-10-09T10:00:00Z",
  updatedAt: "2026-10-09T10:00:00Z",
  activity: {
    kind,
    status: "in-progress",
    progress,
    total: 200,
    completedLessons: [],
    sentiment: null,
    creator: null,
    history: [{ date: "2026-10-09", text: "Earlier event" }],
  },
});
beforeEach(() => vi.stubGlobal("crypto", webcrypto));
afterEach(() => vi.unstubAllGlobals());

describe("Local capture work identity remains grounded before updating records", () => {
  it("requires target review when a supplied same-kind ID belongs to another title mentioned in the note", async () => {
    const memories = [
      record("book-a", "Seabright Roads", "book", 50),
      record("book-b", "Copper Meadow", "book", 80),
    ];
    const original = structuredClone(memories);
    const note = "Read 12 pages of Seabright Roads and liked Copper Meadow's cover.";
    const checked = await interpretCaptureTitles(
      validatePlan(
        { entries: [entry("Seabright Roads", { matchedMemoryId: "book-b" })] },
        memories,
        true,
        note,
      ),
      note,
      memories,
      async () => ({
        titles: [
          { entryIndex: 0, sourceTitle: "Seabright Roads", suggestedTitle: "Seabright Roads" },
        ],
      }),
    );
    expect(checked.entries[0]?.matchedMemoryId).toBeNull();
    expect(checked.entries[0]?.candidateMemoryIds).toEqual(
      expect.arrayContaining(["book-a", "book-b"]),
    );
    expect(checked.entries[0]?.clarificationQuestion).toEqual(expect.any(String));
    expect(() => applyCapturePlan(memories, checked, note)).toThrow("Choose the matching item");
    expect(memories).toEqual(original);
  });
  it("does not rename or initialize a mismatched legacy target lacking activity", async () => {
    const legacy = record("legacy-b", "Copper Meadow");
    delete legacy.activity;
    const memories = [record("book-a", "Seabright Roads"), legacy];
    const original = structuredClone(memories);
    const note = "Read 12 pages of Seabright Roads and liked Copper Meadow's cover.";
    const checked = await interpretCaptureTitles(
      validatePlan(
        { entries: [entry("Seabright Roads", { matchedMemoryId: "legacy-b" })] },
        memories,
        true,
        note,
      ),
      note,
      memories,
      async () => ({
        titles: [
          { entryIndex: 0, sourceTitle: "Seabright Roads", suggestedTitle: "Seabright Roads" },
        ],
      }),
    );
    expect(checked.entries[0]?.matchedMemoryId).toBeNull();
    expect(checked.entries[0]?.candidateMemoryIds).toEqual(
      expect.arrayContaining(["book-a", "legacy-b"]),
    );
    expect(() => applyCapturePlan(memories, checked, note)).toThrow("Choose the matching item");
    expect(memories).toEqual(original);
    expect(legacy).not.toHaveProperty("activity");
  });
  it("updates only the explicitly reviewed title target after a conflicting model ID is cleared", () => {
    const memories = [
      record("book-a", "Seabright Roads", "book", 50),
      record("book-b", "Copper Meadow", "book", 80),
    ];
    const note = "Read 12 pages of Seabright Roads and liked Copper Meadow's cover.";
    const plan = validatePlan(
      { entries: [entry("Seabright Roads", { matchedMemoryId: "book-b" })] },
      memories,
      true,
      note,
    );
    expect(plan.entries[0]?.matchedMemoryId).toBeNull();
    const reviewed = structuredClone(plan);
    reviewed.entries[0] = {
      ...reviewed.entries[0]!,
      title: "Seabright Roads",
      matchedMemoryId: "book-a",
      candidateMemoryIds: [],
      clarificationQuestion: null,
      titleReviewRequired: false,
    };
    const result = applyCapturePlan(memories, reviewed, note);
    expect(result).toHaveLength(2);
    const updated = result.find((item) => item.id === "book-a")!;
    expect(updated.title).toBe("Seabright Roads");
    expect(updated.activity?.progress).toBe(62);
    expect(updated.activity?.history).toHaveLength(2);
    expect(updated.transcripts).toEqual(["Earlier original note", note]);
    expect(result.find((item) => item.id === "book-b")).toEqual(memories[1]);
    expect(memories.map((item) => item.activity?.progress)).toEqual([50, 80]);
  });
  it("offers an exact-titled reaction as a review candidate when its clarification remains unresolved", async () => {
    const memories = [record("book-a", "Seabright Roads")];
    const original = structuredClone(memories);
    const note = "I like Seabright Roads, but didn't read any pages today.";
    const question = "Is this a new wishlist entry or a reaction to the existing book?";
    const checked = await interpretCaptureTitles(
      validatePlan(
        {
          entries: [
            entry("Seabright Roads", {
              activity: command({ intent: "reaction", progress: null }),
              clarificationQuestion: question,
            }),
          ],
        },
        memories,
        true,
        note,
      ),
      note,
      memories,
      async () => ({
        titles: [
          {
            entryIndex: 0,
            sourceTitle: "Seabright Roads",
            suggestedTitle: "Seabright Roads",
          },
        ],
      }),
    );
    expect(checked.entries[0]).toMatchObject({
      matchedMemoryId: null,
      candidateMemoryIds: ["book-a"],
      clarificationQuestion: question,
      titleReviewRequired: false,
      activity: { intent: "reaction", progress: null },
    });
    expect(() => applyCapturePlan(memories, checked, note)).toThrow("Choose the matching item");
    expect(memories).toEqual(original);
  });
  it("does not use a valid source-title row to silently repair an event headline and update its work", async () => {
    const memories = [record("book-a", "Seabright Roads")];
    const original = structuredClone(memories);
    const note = "I read 12 pages of Seabright Roads today.";
    const plan = validatePlan(
      {
        entries: [
          entry("Read 12 pages of Seabright Roads", {
            matchedMemoryId: memories[0]!.id,
          }),
        ],
      },
      memories,
      true,
      note,
    );
    const checked = await interpretCaptureTitles(plan, note, memories, async () => ({
      titles: [
        { entryIndex: 0, sourceTitle: "Seabright Roads", suggestedTitle: "Seabright Roads" },
      ],
    }));
    expect(checked.entries[0]).toMatchObject({
      title: "Read 12 pages of Seabright Roads",
      titleReviewRequired: true,
      titleSuggestion: null,
    });
    expect(() => applyCapturePlan(memories, checked, note)).toThrow("Choose the matching item");
    expect(memories).toEqual(original);
  });
  it("requires user confirmation before a grounded typo proposal can update the catalog work", async () => {
    const memories = [record("book-a", "Seabright Roads")];
    const note = "I read 12 pages of Seabrite Roads today.";
    const original = structuredClone(memories);
    const checked = await interpretCaptureTitles(
      validatePlan({ entries: [entry("Seabrite Roads")] }, memories, true, note),
      note,
      memories,
      async () => ({
        titles: [
          { entryIndex: 0, sourceTitle: "Seabrite Roads", suggestedTitle: "Seabright Roads" },
        ],
      }),
    );
    expect(checked.entries[0]).toMatchObject({
      title: "Seabright Roads",
      matchedMemoryId: null,
      candidateMemoryIds: [],
      titleSuggestion: {
        sourceTitle: "Seabrite Roads",
        suggestedTitle: "Seabright Roads",
        decision: "pending",
        basis: "catalog",
        catalogMemoryId: "book-a",
      },
    });
    expect(() => applyCapturePlan(memories, checked, note)).toThrow("Confirm the suggested title");
    expect(memories).toEqual(original);
  });
  it("matches exact titles by media kind and keeps independent progress and history", async () => {
    const memories = [
      record("book-a", "Echo Bridge", "book", 50),
      record("film-a", "Echo Bridge", "movie", 20),
    ];
    const note =
      "Read 12 pages of the book Echo Bridge and watched 5 minutes of the film Echo Bridge.";
    const checked = await interpretCaptureTitles(
      validatePlan(
        {
          entries: [
            entry("Echo Bridge"),
            entry("Echo Bridge", {
              category: "MOVIE",
              activity: command({ kind: "movie", progress: 5 }),
            }),
          ],
        },
        memories,
        true,
        note,
      ),
      note,
      memories,
      async () => ({
        titles: [
          { entryIndex: 0, sourceTitle: "Echo Bridge", suggestedTitle: "Echo Bridge" },
          { entryIndex: 1, sourceTitle: "Echo Bridge", suggestedTitle: "Echo Bridge" },
        ],
      }),
    );
    expect(checked.entries.map((item) => item.matchedMemoryId)).toEqual(["book-a", "film-a"]);
    const result = applyCapturePlan(memories, checked, note);
    expect(result).toHaveLength(2);
    expect(result.find((item) => item.id === "book-a")?.activity).toMatchObject({
      kind: "book",
      progress: 62,
    });
    expect(result.find((item) => item.id === "film-a")?.activity).toMatchObject({
      kind: "movie",
      progress: 25,
    });
    expect(result.every((item) => item.activity?.history.length === 2)).toBe(true);
    expect(memories.map((item) => item.activity?.progress)).toEqual([50, 20]);
  });
  it("requires choosing between duplicate same-kind titles even when the model supplied a valid ID", async () => {
    const memories = [
      record("edition-a", "Echo Bridge"),
      record("edition-b", "Echo Bridge", "book", 80),
    ];
    const note = "Read 12 pages of Echo Bridge.";
    const checked = await interpretCaptureTitles(
      validatePlan(
        {
          entries: [
            entry("Echo Bridge", {
              matchedMemoryId: "edition-a",
            }),
          ],
        },
        memories,
        true,
        note,
      ),
      note,
      memories,
      async () => ({
        titles: [{ entryIndex: 0, sourceTitle: "Echo Bridge", suggestedTitle: "Echo Bridge" }],
      }),
    );
    expect(checked.entries[0]?.matchedMemoryId).toBeNull();
    expect(checked.entries[0]?.candidateMemoryIds).toEqual(["edition-a", "edition-b"]);
    expect(() => applyCapturePlan(memories, checked, note)).toThrow("Choose the matching item");
    expect(memories.map((item) => item.activity?.progress)).toEqual([50, 80]);
  });
  it("does not treat an explicitly excluded title as authority to update that book", async () => {
    const memories = [record("book-a", "Echo Bridge"), record("book-b", "Copper Meadow")];
    const note = "Read 12 pages of another book, not Echo Bridge.";
    const checked = await interpretCaptureTitles(
      validatePlan(
        {
          entries: [
            entry("Echo Bridge", {
              matchedMemoryId: "book-a",
            }),
          ],
        },
        memories,
        true,
        note,
      ),
      note,
      memories,
      async () => ({
        titles: [{ entryIndex: 0, sourceTitle: "Echo Bridge", suggestedTitle: "Echo Bridge" }],
      }),
    );
    expect(checked.entries[0]?.matchedMemoryId).toBeNull();
    expect(checked.entries[0]?.candidateMemoryIds).toEqual(["book-a", "book-b"]);
    expect(() => applyCapturePlan(memories, checked, note)).toThrow("Choose the matching item");
    expect(memories.every((item) => item.activity?.progress === 50)).toBe(true);
  });
  it("does not trust a guessed catalog title for a pronoun when more than one book could match", async () => {
    const memories = [record("book-a", "Echo Bridge"), record("book-b", "Copper Meadow")];
    const note = "I finished it.";
    const checked = await interpretCaptureTitles(
      validatePlan(
        {
          entries: [
            entry("Echo Bridge", {
              matchedMemoryId: "book-a",
              activity: command({ intent: "complete", progress: null }),
            }),
          ],
        },
        memories,
        true,
        note,
      ),
      note,
      memories,
      async () => ({ titles: [{ entryIndex: 0, sourceTitle: null, suggestedTitle: null }] }),
    );
    expect(checked.entries[0]).toMatchObject({ matchedMemoryId: null, titleReviewRequired: true });
    expect(checked.entries[0]?.candidateMemoryIds).toEqual(["book-a", "book-b"]);
    expect(() =>
      applyCapturePlan(
        memories,
        checked,
        note,
        undefined,
        recordCompletionReview(checked, note, [0]),
      ),
    ).toThrow("Choose the matching item");
    expect(memories.every((item) => item.activity?.status === "in-progress")).toBe(true);
  });
});
