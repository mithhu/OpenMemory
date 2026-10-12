import { webcrypto } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyActivity, type ActivityCommand } from "../lib/activity";
import { applyCapturePlan, validatePlan, type CaptureEntry } from "../lib/capture-plan";

const command = (change: Partial<ActivityCommand> = {}): ActivityCommand => ({
  kind: "book",
  intent: "progress",
  progress: null,
  progressMode: "increment",
  total: null,
  lessonNumbers: [],
  sentiment: null,
  creator: null,
  ...change,
});
// Exact semantic fields returned by the completed fictional live diagnostic.
const original = "I read Copper Orchard today.";
const proposal: CaptureEntry = {
  title: "Copper Orchard",
  summary: original,
  category: "BOOK",
  date: "2026-10-09",
  matchedMemoryId: null,
  candidateMemoryIds: [],
  clarificationQuestion: null,
  tags: ["reading"],
  activity: command(),
  titleReviewRequired: false,
};
beforeEach(() => vi.stubGlobal("crypto", webcrypto));
afterEach(() => vi.unstubAllGlobals());

describe("Quantitative progress requires explicit evidence", () => {
  it("blocks the actual bare-read proposal before history or original source can change", () => {
    const existing = applyCapturePlan(
      [],
      { entries: [{ ...proposal, activity: command({ intent: "start", progress: 20 }) }] },
      "Started Copper Orchard at page 20.",
    );
    const before = structuredClone(existing);
    const raw = { entries: [{ ...proposal, matchedMemoryId: existing[0]!.id }] };
    const plan = validatePlan(raw, existing, true, original);
    expect(plan.entries[0]).toMatchObject({
      summary: original,
      matchedMemoryId: existing[0]!.id,
      intentReviewRequired: true,
      activity: { intent: "progress", progress: null, lessonNumbers: [] },
    });
    expect(plan.entries[0]!.clarificationQuestion).toContain("How much progress");
    expect(() => applyCapturePlan(existing, raw, original)).toThrow("Choose whether");
    expect(existing).toEqual(before);
    expect(() => applyActivity(existing[0]!.activity, command(), "2026-10-09", original)).toThrow(
      "Enter the progress amount",
    );
    expect(existing[0]!.transcripts).not.toContain(original);
    expect(raw.entries[0]!.clarificationQuestion).toBeNull();
  });

  it.each(["book", "movie", "course"] as const)(
    "requires evidence for %s even when the model clears its review flag",
    (kind) => {
      const activity = command({ kind });
      const entry = {
        ...proposal,
        category: ({ book: "BOOK", movie: "MOVIE", course: "LESSON" } as const)[kind],
        activity,
        intentReviewRequired: false,
      };
      expect(validatePlan({ entries: [entry] }, []).entries[0]!.intentReviewRequired).toBe(true);
      expect(() => applyCapturePlan([], { entries: [entry] }, original)).toThrow();
      expect(() => applyActivity(undefined, activity, "2026-10-09", original)).toThrow();
    },
  );

  it("does not treat book/movie lesson numbers or a known total as progress evidence", () => {
    for (const kind of ["book", "movie"] as const)
      expect(() =>
        applyActivity(
          undefined,
          command({ kind, lessonNumbers: [2], total: 100 }),
          "2026-10-09",
          original,
        ),
      ).toThrow("Enter the progress amount");
    expect(() =>
      applyActivity(undefined, command({ kind: "course", total: 10 }), "2026-10-09", original),
    ).toThrow("Enter the progress amount");
  });

  it("retains an existing clarification and accepts a deliberately supplied quantity", () => {
    const plan = validatePlan(
      { entries: [{ ...proposal, clarificationQuestion: "Which edition?" }] },
      [],
    );
    expect(plan.entries[0]!.clarificationQuestion).toBe("Which edition?");
    const reviewed = {
      entries: [
        { ...plan.entries[0]!, intentReviewRequired: false, activity: command({ progress: 17 }) },
      ],
    };
    const saved = applyCapturePlan([], reviewed, original);
    expect(saved[0]!.activity?.progress).toBe(17);
    expect(saved[0]!.transcripts).toEqual([original]);
  });

  it("keeps explicit zero meaningful for both increment and bookmark semantics", () => {
    const previous = applyActivity(
      undefined,
      command({ intent: "start", progress: 20 }),
      "2026-10-08",
      "Start",
    );
    expect(
      applyActivity(previous, command({ progress: 0 }), "2026-10-09", "No new pages").progress,
    ).toBe(20);
    expect(
      applyActivity(
        previous,
        command({ progress: 0, progressMode: "absolute" }),
        "2026-10-09",
        "At page zero",
      ).progress,
    ).toBe(0);
    expect(
      validatePlan({ entries: [{ ...proposal, activity: command({ progress: 0 }) }] }, [])
        .entries[0]!.intentReviewRequired,
    ).not.toBe(true);
  });

  it("accepts course lesson indices without a fabricated numeric amount", () => {
    const activity = command({ kind: "course", lessonNumbers: [2, 2, 4] });
    const plan = validatePlan({ entries: [{ ...proposal, category: "LESSON", activity }] }, []);
    expect(plan.entries[0]!.intentReviewRequired).not.toBe(true);
    const saved = applyCapturePlan([], plan, "Finished lessons 2 and 4 of this course.");
    expect(saved[0]!.activity).toMatchObject({ progress: 2, completedLessons: [2, 4] });
  });

  it("preserves music listen's one-play rule and explicit non-progress actions", () => {
    expect(
      applyActivity(
        undefined,
        command({ kind: "music", intent: "listen" }),
        "2026-10-09",
        "Played a song",
      ),
    ).toMatchObject({ progress: 1, status: "completed" });
    for (const intent of ["start", "complete", "wishlist", "reaction"] as const)
      expect(() =>
        applyActivity(undefined, command({ intent }), "2026-10-09", "Explicit reviewed action"),
      ).not.toThrow();
    expect(
      applyActivity(
        undefined,
        command({ kind: "movie", progress: 5 }),
        "2026-10-09",
        "Five minutes",
      ).progress,
    ).toBe(5);
  });
});
