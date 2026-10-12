import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { applyActivity, progressLabel, type ActivityCommand } from "../lib/activity";
import { applyCapturePlan, validatePlan, type CaptureEntry } from "../lib/capture-plan";
import { memorySchema } from "../lib/memory";
import { CaptureReview } from "../components/CaptureReview";
import { LifeDashboard } from "../components/LifeDashboard";

const reaction = (overrides: Partial<ActivityCommand> = {}): ActivityCommand => ({
  kind: "music",
  intent: "reaction",
  progress: null,
  progressMode: "absolute",
  total: null,
  lessonNumbers: [],
  sentiment: "loved",
  creator: null,
  ...overrides,
});
const proposal = (activity = reaction()): CaptureEntry => ({
  title: "Velvet Roads",
  summary: "Love the song Velvet Roads, no new play today.",
  category: "MUSIC",
  date: "2026-10-09",
  matchedMemoryId: null,
  candidateMemoryIds: [],
  clarificationQuestion: null,
  tags: ["music"],
  activity,
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Opinions do not invent activity events", () => {
  it("records a later explicit wish or partial-work event after an opinion", () => {
    const opinion = applyActivity(
      undefined,
      reaction({ kind: "book" }),
      "2026-10-08",
      "An opinion",
    );
    const wish = applyActivity(
      opinion,
      reaction({ kind: "book", intent: "wishlist" }),
      "2026-10-09",
      "Want to read it",
    );
    const progress = applyActivity(
      wish,
      reaction({ kind: "book", intent: "progress" }),
      "2026-10-09",
      "Read some of it",
      { allowUnquantifiedProgress: true },
    );
    expect(wish.status).toBe("planned");
    expect(progress.status).toBe("in-progress");
    expect(progress.progress).toBe(0);
    expect(progress.total).toBeNull();
  });
  it("rejects a new total below an already recorded lesson number", () => {
    const before = applyActivity(
      undefined,
      reaction({ kind: "course", intent: "progress", lessonNumbers: [3] }),
      "2026-10-08",
      "Lesson 3 done",
    );
    expect(() =>
      applyActivity(before, reaction({ kind: "course", total: 2 }), "2026-10-09", "Set total"),
    ).toThrow("lesson number exceeds");
  });
  it.each(["movie", "book", "music", "course"] as const)(
    "remembers a new %s without claiming completion or planning",
    (kind) => {
      const activity = applyActivity(undefined, reaction({ kind }), "2026-10-09", "I like it");
      expect(activity).toMatchObject({
        status: "unrecorded",
        progress: 0,
        completedLessons: [],
        sentiment: "loved",
      });
      expect(progressLabel(activity)).toBe("Progress not recorded");
    },
  );
  it.each(["wishlist", "start", "complete"] as const)(
    "preserves existing %s status and progress when reacting",
    (intent) => {
      const before = applyActivity(
        undefined,
        reaction({ kind: "book", intent, total: 100 }),
        "2026-10-08",
        "An explicit action",
      );
      const after = applyActivity(before, reaction({ kind: "book" }), "2026-10-09", "My opinion");
      expect(after.status).toBe(before.status);
      expect(after.progress).toBe(before.progress);
      expect(after.completedLessons).toEqual(before.completedLessons);
      expect(after.history).toHaveLength(2);
    },
  );
  it("adds a play only when a later listen is explicitly recorded", () => {
    const opinion = applyActivity(undefined, reaction(), "2026-10-08", "Love it");
    const listened = applyActivity(
      opinion,
      reaction({ intent: "listen" }),
      "2026-10-09",
      "Played it",
    );
    const anotherOpinion = applyActivity(
      listened,
      reaction({ sentiment: "neutral" }),
      "2026-10-09",
      "Okay now",
    );
    expect(listened.progress).toBe(1);
    expect(anotherOpinion.progress).toBe(1);
    expect(anotherOpinion.status).toBe("completed");
  });
  it("refuses progress and lesson changes hidden in a reaction", () => {
    for (const command of [
      reaction({ progress: 1 }),
      reaction({ kind: "course", lessonNumbers: [2] }),
    ])
      expect(() => applyActivity(undefined, command, "2026-10-09", "Opinion")).toThrow(
        "reaction cannot change progress",
      );
  });
  it("can add a known total while keeping progress unrecorded", () => {
    const before = applyActivity(
      undefined,
      reaction({ kind: "book" }),
      "2026-10-08",
      "Liked the idea",
    );
    const after = applyActivity(
      before,
      reaction({ kind: "book", total: 300 }),
      "2026-10-09",
      "Set total",
    );
    expect(after).toMatchObject({ status: "unrecorded", progress: 0, total: 300 });
  });
  it("keeps the original words and opinion through validation and persistence", () => {
    const note = "Love the song Velvet Roads, no new play today.";
    const plan = validatePlan({ entries: [proposal()] }, [], true, note);
    const memories = applyCapturePlan([], plan, note);
    expect(memorySchema.parse(memories[0]).activity).toMatchObject({
      status: "unrecorded",
      progress: 0,
    });
    expect(memories[0]?.transcripts).toEqual([note]);
  });
  it("review lets the user correct a false listen into a reaction without retaining its count", async () => {
    const save = vi.fn().mockResolvedValue(true);
    render(
      <CaptureReview
        plan={{ entries: [proposal(reaction({ intent: "listen", progress: 3 }))] }}
        text="Love Velvet Roads"
        memories={[]}
        onSave={save}
        onCancel={() => {}}
      />,
    );
    fireEvent.change(screen.getByLabelText("This was"), { target: { value: "reaction" } });
    expect(screen.queryByLabelText("plays")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Save 1 entry" }));
    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    expect(save.mock.calls[0]![0].entries[0].activity).toMatchObject({
      intent: "reaction",
      progress: null,
      lessonNumbers: [],
    });
  });
  it("shows remembered status without a completion claim and uses reaction-only buttons", async () => {
    const memory = applyCapturePlan(
      [],
      {
        entries: [
          {
            ...proposal(reaction({ kind: "book", total: 300 })),
            title: "Paper Wings",
            category: "BOOK",
          },
        ],
      },
      "My opinion about Paper Wings",
    )[0]!;
    const update = vi.fn().mockResolvedValue(true);
    render(
      <LifeDashboard
        memories={[memory]}
        library
        busy={false}
        onOpen={() => {}}
        onCapture={() => {}}
        onUpdate={update}
      />,
    );
    expect(screen.getByText("Remembered")).toBeInTheDocument();
    expect(screen.getByText("Progress not recorded")).toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Loved" }));
    await waitFor(() => expect(update).toHaveBeenCalledOnce());
    expect(update.mock.calls[0]![1]).toMatchObject({ intent: "reaction", progress: null });
  });
});
