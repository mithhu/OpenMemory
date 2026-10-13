import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { CaptureReview } from "../components/CaptureReview";
import { applyCapturePlan, validatePlan, type CaptureEntry } from "../lib/capture-plan";
import { associateClassification, assessClassification } from "../lib/classification";
const trip: CaptureEntry = {
  title: "Visit Kyoto",
  summary: "I want to visit Kyoto in late December.",
  category: "WISHLIST",
  date: "2026-10-13",
  matchedMemoryId: null,
  candidateMemoryIds: [],
  clarificationQuestion: null,
  tags: ["travel"],
  activity: null,
};
afterEach(cleanup);
it.each([
  {
    category: "NOTE" as const,
    advice: { category: "WISHLIST" as const, intent: "wishlist" as const },
  },
  {
    category: "MOVIE" as const,
    advice: { category: "MOVIE" as const, intent: "wishlist" as const },
  },
])(
  "still requires review for a mismatched or unresolved $category entry",
  ({ category, advice }) => {
    const plan = { entries: [{ ...trip, category }] };
    const assessment = assessClassification(
      plan,
      associateClassification(trip.summary, advice),
      trip.summary,
    );
    expect(assessment.conflicts.some((conflict) => conflict.kind === "intent")).toBe(true);
  },
);
it("reviews and saves a non-media future experience without requiring a media action", async () => {
  const source = "I want to visit Kyoto in late December.";
  const plan = validatePlan({ entries: [trip] }, [], true, source);
  const classification = associateClassification(source, {
    category: "WISHLIST",
    intent: "wishlist",
  });
  expect(assessClassification(plan, classification, source).conflicts).toEqual([]);
  const save = vi.fn(async (reviewed) => {
    const saved = applyCapturePlan([], reviewed, source);
    expect(saved[0]).toMatchObject({
      category: "WISHLIST",
      summary: source,
      transcripts: [source],
    });
    expect(saved[0]?.activity).toBeUndefined();
    return true;
  });
  render(
    <CaptureReview
      plan={plan}
      text={source}
      memories={[]}
      onSave={save}
      onCancel={vi.fn()}
      classification={classification}
    />,
  );
  expect(screen.queryByLabelText("This was")).toBeNull();
  expect(screen.getByRole("button", { name: "Save 1 entry" })).toBeEnabled();
  expect(save).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Save 1 entry" }));
  await waitFor(() => expect(save).toHaveBeenCalledOnce());
});
it("continues rejecting contradictory travel/media output instead of silently coercing it", () => {
  expect(() =>
    validatePlan(
      {
        entries: [
          {
            ...trip,
            activity: {
              kind: "movie",
              intent: "wishlist",
              progress: null,
              progressMode: "increment",
              total: null,
              lessonNumbers: [],
              sentiment: null,
              creator: null,
            },
          },
        ],
      },
      [],
      true,
      trip.summary,
    ),
  ).toThrow("conflicting entry types");
});
