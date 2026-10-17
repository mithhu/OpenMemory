import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { applyActivity, progressLabel, type ActivityCommand } from "../lib/activity";
import { capturePlanSchema, validatePlan, type CaptureEntry } from "../lib/capture-plan";
import { memorySchema } from "../lib/memory";
import { assessClassification, associateClassification } from "../lib/classification";
import { CaptureReview } from "../components/CaptureReview";
const command = (change: Partial<ActivityCommand> = {}): ActivityCommand => ({
  kind: "series",
  intent: "progress",
  progress: null,
  progressMode: "increment",
  total: null,
  lessonNumbers: [],
  sentiment: null,
  creator: null,
  season: 2,
  episode: 3,
  seasonCompleted: false,
  ...change,
});
const entry = (change: Partial<ActivityCommand> = {}): CaptureEntry => ({
  title: "Breaking Bad",
  category: "SERIES",
  summary: "Watched season 2 episode 3 of Breaking Bad.",
  date: "2026-10-17",
  matchedMemoryId: null,
  candidateMemoryIds: [],
  clarificationQuestion: null,
  tags: [],
  activity: command(change),
});
afterEach(cleanup);
describe("TV series tracking", () => {
  it("stores an episode position without inventing a watched episode count", () => {
    const result = applyActivity(undefined, command(), "2026-10-17", "episode event");
    expect(result).toMatchObject({
      status: "in-progress",
      season: 2,
      episode: 3,
      progress: 0,
      progressKnown: false,
    });
    expect(progressLabel(result)).toBe("Season 2 · episode 3");
  });
  it("finishing a season never finishes the series", () => {
    const result = applyActivity(
      undefined,
      command({ episode: null, seasonCompleted: true }),
      "2026-10-17",
      "season event",
    );
    expect(result).toMatchObject({ status: "in-progress", completedSeasons: [2], progress: 0 });
    expect(progressLabel(result)).toBe("Season 2 · season finished");
  });
  it("resets episode position on changing seasons and retains season history", () => {
    const previous = applyActivity(
      undefined,
      command({ seasonCompleted: true }),
      "2026-10-17",
      "first",
    );
    const next = applyActivity(
      previous,
      command({ season: 3, episode: null, intent: "start" }),
      "2026-10-18",
      "next",
    );
    expect(next).toMatchObject({
      season: 3,
      episode: null,
      completedSeasons: [2],
      status: "in-progress",
    });
  });
  it("does not infer whole-series completion from a current episode total", () => {
    const result = applyActivity(
      undefined,
      command({ progress: 10, total: 10 }),
      "2026-10-17",
      "ten episodes",
    );
    expect(result.status).toBe("in-progress");
  });
  it("rejects fractional episode counts and course lesson evidence", () => {
    for (const change of [{ progress: 1.5 }, { total: 2.5 }, { lessonNumbers: [2] }])
      expect(() => applyActivity(undefined, command(change), "2026-10-17", "note")).toThrow(
        "whole episode counts",
      );
  });
  it("allows explicit whole-series completion", () => {
    const result = applyActivity(
      undefined,
      command({ intent: "complete", season: null, episode: null }),
      "2026-10-17",
      "finished the entire series",
    );
    expect(result.status).toBe("completed");
  });
  it("keeps wishes and reactions separate from completed progress", () => {
    for (const intent of ["wishlist", "reaction"] as const) {
      expect(() => applyActivity(undefined, command({ intent }), "2026-10-17", "note")).toThrow(
        "cannot record",
      );
      const result = applyActivity(
        undefined,
        command({ intent, season: null, episode: null, sentiment: "loved" }),
        "2026-10-17",
        "note",
      );
      expect(result.status).toBe(intent === "wishlist" ? "planned" : "unrecorded");
    }
  });
  it("requires a season for episode position and rejects season fields on films", () => {
    expect(() => applyActivity(undefined, command({ season: null }), "2026-10-17", "note")).toThrow(
      "Choose the season",
    );
    expect(() =>
      applyActivity(undefined, command({ kind: "movie", progress: 1 }), "2026-10-17", "note"),
    ).toThrow("TV series only");
  });
  it("validates series extraction and preserves it in local memory export/import", () => {
    const plan = validatePlan({ entries: [entry()] }, [], false);
    expect(capturePlanSchema.parse(plan).entries[0].category).toBe("SERIES");
    const activity = applyActivity(undefined, command(), "2026-10-17", "note");
    const saved = memorySchema.parse({
      id: "series-test",
      ...entry(),
      activity,
      followUpQuestion: "",
      suggestedAnswers: [],
      answerLabel: "",
      answers: [],
      transcripts: [],
      createdAt: "now",
      updatedAt: "now",
    });
    expect(memorySchema.parse(JSON.parse(JSON.stringify(saved))).activity).toEqual(activity);
  });
  it("honestly identifies the installed classifier's unsupported category", () => {
    const result = assessClassification(
      { entries: [entry()] },
      associateClassification("note", { category: "MOVIE", intent: "progress" }),
      "note",
    );
    expect(result.conflicts[0]?.message).toContain("predates TV series support");
  });
  it("provides season controls and clears watched evidence when switched to a plan", () => {
    render(
      <CaptureReview
        plan={{ entries: [entry()] }}
        text="Watched season 2 episode 3 of Breaking Bad."
        memories={[]}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByLabelText("Entry 1 type")).toHaveValue("series");
    expect(screen.getByLabelText("Season")).toHaveValue(2);
    expect(screen.getByLabelText("Episode position in this season")).toHaveValue(3);
    fireEvent.change(screen.getByLabelText("This was"), { target: { value: "wishlist" } });
    expect(screen.queryByLabelText("Season")).not.toBeInTheDocument();
  });
});
