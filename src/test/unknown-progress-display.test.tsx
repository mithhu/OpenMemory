import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import {
  applyActivity,
  activitySchema,
  progressLabel,
  type ActivityCommand,
} from "../lib/activity";
import { memorySchema } from "../lib/memory";
import { LifeDashboard } from "../components/LifeDashboard";

const command = (progress: number | null): ActivityCommand => ({
  kind: "book",
  intent: "progress",
  progress,
  progressMode: "absolute",
  total: 240,
  lessonNumbers: [],
  sentiment: null,
  creator: null,
});
const review = { allowUnquantifiedProgress: true } as const;
afterEach(cleanup);

it("keeps an unknown amount distinct from explicit zero, including after serialization", () => {
  const unknown = applyActivity(undefined, command(null), "2026-10-16", "Read some", review);
  expect(progressLabel(activitySchema.parse(JSON.parse(JSON.stringify(unknown))))).toBe(
    "Amount not recorded",
  );
  const zero = applyActivity(undefined, command(0), "2026-10-16", "At page zero");
  expect(progressLabel(zero)).toBe("0 / 240 pages");
});
it("preserves a known position on an unknown update and resolves unknown with explicit evidence", () => {
  const known = applyActivity(undefined, command(25), "2026-10-16", "At page 25");
  expect(
    progressLabel(applyActivity(known, command(null), "2026-10-16", "Read more", review)),
  ).toBe("25 / 240 pages");
  const unknown = applyActivity(undefined, command(null), "2026-10-16", "Read some", review);
  expect(progressLabel(applyActivity(unknown, command(30), "2026-10-16", "At page 30"))).toBe(
    "30 / 240 pages",
  );
});
it("does not display a fabricated starting page or percentage for unknown progress", () => {
  const activity = applyActivity(undefined, command(null), "2026-10-16", "Read some", review);
  const memory = memorySchema.parse({
    id: "qa-unknown",
    title: "Fictional book",
    category: "BOOK",
    date: "2026-10-16",
    summary: "Read some",
    tags: [],
    followUpQuestion: "",
    suggestedAnswers: [],
    answerLabel: "Reflection",
    answers: [],
    transcripts: [],
    createdAt: "2026-10-16",
    updatedAt: "2026-10-16",
    activity,
  });
  render(
    <LifeDashboard
      memories={[memory]}
      busy={false}
      onOpen={vi.fn()}
      onCapture={vi.fn()}
      onUpdate={vi.fn()}
    />,
  );
  expect(screen.getByText("Amount not recorded")).toBeInTheDocument();
  expect(screen.getByText("Add your current position when you know it.")).toBeInTheDocument();
  expect(screen.queryByText("Continue from page 1")).not.toBeInTheDocument();
  expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
});
