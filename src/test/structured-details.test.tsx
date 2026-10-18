import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CaptureReview } from "../components/CaptureReview";
import { applyCapturePlan, validatePlan, type CaptureEntry } from "../lib/capture-plan";
import { associateClassification, assessClassification } from "../lib/classification";
const entry = (overrides: Partial<CaptureEntry> = {}): CaptureEntry => ({
  title: "Unnamed film",
  category: "MOVIE",
  summary: "That movie was great.",
  date: "2026-10-17",
  matchedMemoryId: null,
  candidateMemoryIds: [],
  clarificationQuestion: "Which film?",
  clarificationReasons: ["missing_identity"],
  tags: [],
  activity: {
    kind: "movie",
    intent: "reaction",
    progress: null,
    progressMode: "absolute",
    total: null,
    lessonNumbers: [],
    sentiment: "loved",
    creator: null,
  },
  ...overrides,
});
afterEach(cleanup);
it("lets a user confirm a source-present series title without retyping it or discarding episode counts", async () => {
  const text = "I watched six episodes of Ted Lasso Season 4";
  const proposal = entry({
    title: "Ted Lasso",
    category: "SERIES",
    summary: text,
    titleReviewRequired: true,
    activity: {
      kind: "series",
      intent: "progress",
      progress: 6,
      progressMode: "increment",
      total: 10,
      season: 4,
      episode: null,
      seasonCompleted: false,
      lessonNumbers: [],
      sentiment: null,
      creator: null,
    },
  });
  const save = vi.fn().mockResolvedValue(true);
  render(
    <CaptureReview
      plan={{ entries: [proposal] }}
      text={text}
      memories={[]}
      onSave={save}
      onCancel={vi.fn()}
    />,
  );
  expect(screen.getByRole("button", { name: "Save 1 entry" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Confirm “Ted Lasso”" }));
  fireEvent.click(screen.getByRole("button", { name: "Save 1 entry" }));
  await waitFor(() => expect(save).toHaveBeenCalledOnce());
  const plan = save.mock.calls[0]![0];
  expect(plan.entries[0]).toMatchObject({
    title: "Ted Lasso",
    clarificationReasons: [],
    titleReviewRequired: false,
  });
  expect(applyCapturePlan([], plan, text)[0]?.activity).toMatchObject({
    kind: "series",
    status: "in-progress",
    season: 4,
    episode: null,
    progress: 6,
    total: 10,
  });
});
it("confirming a source-present title keeps a separate unknown-action decision", () => {
  render(
    <CaptureReview
      plan={{
        entries: [
          entry({
            title: "Ted Lasso",
            category: "SERIES",
            activity: null,
            titleReviewRequired: false,
            clarificationReasons: ["missing_identity", "missing_action"],
          }),
        ],
      }}
      text="Ted Lasso"
      memories={[]}
      onSave={vi.fn()}
      onCancel={vi.fn()}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Confirm “Ted Lasso”" }));
  expect(screen.getByRole("button", { name: "Save 1 entry" })).toBeDisabled();
  expect(
    screen.getByRole("button", { name: /Entry 1: What happened: planned/ }),
  ).toBeInTheDocument();
});
it("retains the known reaction while requiring a title, without allowing a placeholder confirmation", async () => {
  const save = vi.fn().mockResolvedValue(true);
  render(
    <CaptureReview
      plan={{ entries: [entry()] }}
      text="That movie was great."
      memories={[]}
      onSave={save}
      onCancel={vi.fn()}
    />,
  );
  expect(screen.getByLabelText("This was")).toHaveValue("reaction");
  expect(screen.getByRole("button", { name: "Save 1 entry" })).toBeDisabled();
  expect(screen.queryByRole("button", { name: "Confirm “Unnamed film”" })).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Entry 1 title"), { target: { value: "Arrival" } });
  expect(screen.getByLabelText("This was")).toHaveValue("reaction");
  fireEvent.click(screen.getByRole("button", { name: "Save 1 entry" }));
  await waitFor(() => expect(save).toHaveBeenCalledOnce());
  expect(save.mock.calls[0]![0].entries[0]).toMatchObject({
    title: "Arrival",
    clarificationReasons: [],
    activity: { intent: "reaction" },
  });
});
it("resolving identity does not resolve an unknown action", async () => {
  const save = vi.fn().mockResolvedValue(true);
  const proposal = entry({
    activity: null,
    clarificationReasons: ["missing_identity", "missing_action"],
  });
  render(
    <CaptureReview
      plan={{ entries: [proposal] }}
      text="Watch a movie."
      memories={[]}
      onSave={save}
      onCancel={vi.fn()}
    />,
  );
  fireEvent.change(screen.getByLabelText("Entry 1 title"), { target: { value: "Arrival" } });
  expect(screen.getByRole("button", { name: "Save 1 entry" })).toBeDisabled();
  expect(screen.getByLabelText("This was")).toHaveValue("");
  fireEvent.change(screen.getByLabelText("This was"), { target: { value: "wishlist" } });
  fireEvent.click(screen.getByRole("button", { name: "Save 1 entry" }));
  await waitFor(() => expect(save).toHaveBeenCalledOnce());
  expect(save.mock.calls[0]![0].entries[0]).toMatchObject({
    clarificationReasons: [],
    activity: { intent: "wishlist" },
  });
});
it("resolving an action does not resolve a missing identity", () => {
  render(
    <CaptureReview
      plan={{
        entries: [
          entry({ activity: null, clarificationReasons: ["missing_identity", "missing_action"] }),
        ],
      }}
      text="Watch a movie."
      memories={[]}
      onSave={vi.fn()}
      onCancel={vi.fn()}
    />,
  );
  fireEvent.change(screen.getByLabelText("This was"), { target: { value: "reaction" } });
  expect(screen.getByRole("button", { name: "Save 1 entry" })).toBeDisabled();
  expect(screen.getByLabelText("Entry 1 understood action and missing details")).toHaveTextContent(
    "Which work or subject",
  );
});
it("known-title unknown action asks only for action", () => {
  const plan = validatePlan(
    {
      entries: [
        entry({
          title: "Arrival",
          activity: null,
          clarificationReasons: ["missing_action"],
          clarificationQuestion: null,
        }),
      ],
    },
    [],
    true,
    "Watched Arrival.",
  );
  render(
    <CaptureReview
      plan={plan}
      text="Watched Arrival."
      memories={[]}
      onSave={vi.fn()}
      onCancel={vi.fn()}
    />,
  );
  expect(screen.queryByText("Check this title before saving.")).not.toBeInTheDocument();
  expect(screen.getByLabelText("This was")).toHaveValue("");
});
it("persistence cannot bypass unresolved typed details by clearing flags", () => {
  expect(() =>
    applyCapturePlan(
      [],
      { entries: [entry({ titleReviewRequired: false, intentReviewRequired: false })] },
      "That movie was great.",
    ),
  ).toThrow("Resolve the missing");
});
it("rejects extraction that fabricates a known action while claiming action is unknown", () => {
  expect(() =>
    validatePlan(
      { entries: [entry({ clarificationReasons: ["missing_action"] })] },
      [],
      true,
      "Watch a film.",
    ),
  ).toThrow("unknown action");
});
it("allows structured TV advice without modifying the frozen legacy model contract", () => {
  const advice = associateClassification("Want to watch a TV series", {
    category: "SERIES",
    intent: "wishlist",
    clarificationReasons: ["missing_identity"],
  });
  expect(advice.advice.category).toBe("SERIES");
  expect(() =>
    associateClassification("note", { category: "SERIES", intent: "wishlist" }),
  ).toThrow();
});
it("does not invent a reaction when adapting a legacy clarify output", () => {
  const legacy = associateClassification("That movie was great.", {
    category: "MOVIE",
    intent: "clarify",
  });
  expect(legacy.advice).toMatchObject({
    intent: null,
    clarificationReasons: ["legacy_uncertainty"],
  });
  const structured = associateClassification("That movie was great.", {
    category: "MOVIE",
    intent: "reaction",
    clarificationReasons: ["missing_identity"],
  });
  expect(
    assessClassification({ entries: [entry()] }, structured, "That movie was great.").conflicts.map(
      (c) => c.kind,
    ),
  ).toEqual(["clarify"]);
});

it("accepts all explicitly versioned v5 development labels without rewriting old benchmark files", async () => {
  const { default: rows } = await import("../../research/structured-advice-v5/development.json");
  for (const row of rows)
    expect(() => associateClassification(row.note, row.expected)).not.toThrow();
});

it("keeps explicit completion but still requires the existing whole-work confirmation", () => {
  const complete = entry();
  complete.activity = { ...complete.activity!, intent: "complete" };
  render(
    <CaptureReview
      plan={{ entries: [complete] }}
      text="I finished that film."
      memories={[]}
      onSave={vi.fn()}
      onCancel={vi.fn()}
    />,
  );
  expect(screen.getByLabelText("This was")).toHaveValue("complete");
  fireEvent.change(screen.getByLabelText("Entry 1 title"), { target: { value: "Arrival" } });
  expect(screen.getByRole("button", { name: "Save 1 entry" })).toBeDisabled();
  fireEvent.click(screen.getByRole("checkbox", { name: "Entry 1: I finished Arrival in full" }));
  expect(screen.getByRole("button", { name: "Save 1 entry" })).toBeEnabled();
});

it("does not erase a proposed partial-progress action merely because its amount is unknown", () => {
  const partial = entry();
  partial.activity = { ...partial.activity!, intent: "progress" };
  render(
    <CaptureReview
      plan={{ entries: [partial] }}
      text="Read some of that book."
      memories={[]}
      onSave={vi.fn()}
      onCancel={vi.fn()}
    />,
  );
  expect(screen.getByLabelText("Entry 1 understood action and missing details")).toHaveTextContent(
    "Made progress — confirm below",
  );
  expect(screen.getByRole("button", { name: "Save 1 entry" })).toBeDisabled();
});

it("choosing an ordinary note does not leave an invisible media-action requirement", () => {
  render(
    <CaptureReview
      plan={{
        entries: [
          entry({
            title: "Watch something",
            activity: null,
            clarificationReasons: ["missing_action"],
          }),
        ],
      }}
      text="Watch something"
      memories={[]}
      onSave={vi.fn()}
      onCancel={vi.fn()}
    />,
  );
  fireEvent.change(screen.getByLabelText("Entry 1 type"), { target: { value: "NOTE" } });
  expect(screen.queryByLabelText("This was")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Save 1 entry" })).toBeEnabled();
});

it("automatic spelling suggestions cannot erase an unresolved identity", async () => {
  const { attachTitleCorrections } = await import("../lib/title-interpretation");
  const result = attachTitleCorrections(
    { corrections: [{ entryIndex: 0, sourceTitle: "Arrivl", suggestedTitle: "Arrival" }] },
    { entries: [entry({ title: "Arrivl" })] },
    "Arrivl was good.",
    [],
  );
  expect(result.entries[0]).toMatchObject({
    titleReviewRequired: true,
    clarificationReasons: ["missing_identity"],
    activity: { intent: "reaction" },
  });
  expect(result.entries[0]!.clarificationQuestion).toContain("Which work");
});
