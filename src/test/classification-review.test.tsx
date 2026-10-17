import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CaptureReview } from "@/components/CaptureReview";
import {
  associateClassification,
  recordClassificationReview,
  type ClassificationMetadata,
} from "@/lib/classification";
import type { CaptureEntry } from "@/lib/capture-plan";

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));
const text = "Read 17 more pages of Glass Orchard, then listened to Signal Fern.";
const entry = (): CaptureEntry => ({
  title: "Glass Orchard",
  summary: "Read 17 more pages of Glass Orchard.",
  category: "BOOK",
  date: "2026-10-10",
  matchedMemoryId: "fictional-book-id",
  candidateMemoryIds: [],
  clarificationQuestion: null,
  tags: [],
  activity: {
    kind: "book",
    intent: "progress",
    progress: 17,
    progressMode: "increment",
    total: 240,
    lessonNumbers: [],
    sentiment: null,
    creator: null,
  },
});
function setup(classification?: ClassificationMetadata, count = 1) {
  const save = vi.fn().mockResolvedValue(true);
  const cancel = vi.fn();
  const props = {
    plan: { entries: Array.from({ length: count }, entry) },
    text,
    memories: [],
    onSave: save,
    onCancel: cancel,
  };
  const view = render(<CaptureReview {...props} {...(classification ? { classification } : {})} />);
  return { save, cancel, props, ...view };
}
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Optional classification review remains a deliberate decision", () => {
  it("requires acknowledgment without rewriting extraction or automatically saving", async () => {
    const metadata = associateClassification(text, { category: "MOVIE", intent: "wishlist" });
    const { save } = setup(metadata);
    const button = screen.getByRole("button", { name: "Save 1 entry" });
    expect(button).toBeDisabled();
    fireEvent.submit(screen.getByRole("form", { name: "Review memories before saving" }));
    expect(save).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("checkbox", { name: /checked the suggested type/ }));
    expect(save).not.toHaveBeenCalled();
    expect(button).toBeEnabled();
    fireEvent.click(button);
    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    expect(save.mock.calls[0]![0].entries[0]).toMatchObject(entry());
    expect(save.mock.calls[0]![1]).toEqual(
      recordClassificationReview({ entries: [entry()] }, text, metadata, true),
    );
    expect(save.mock.calls[0]![1].reviewedPlan.entries[0]).not.toHaveProperty("reviewKey");
  });
  it("requires an explicit ambiguity acknowledgment", () => {
    setup(associateClassification(text, { category: "BOOK", intent: "clarify" }));
    expect(screen.getByRole("button", { name: "Save 1 entry" })).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: /clarified the missing details/ }));
    expect(screen.getByRole("button", { name: "Save 1 entry" })).toBeEnabled();
  });
  it.each([1, 2])("requires mixed coverage review even with %i entries", (count) => {
    setup(associateClassification(text, { category: "MIXED", intent: "mixed" }), count);
    const button = screen.getByRole("button", {
      name: `Save ${count} ${count === 1 ? "entry" : "entries"}`,
    });
    expect(button).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: /reviewed every event/ }));
    expect(button).toBeEnabled();
    fireEvent.change(screen.getByLabelText("Entry 1 title"), {
      target: { value: "Glass Orchard revised" },
    });
    expect(button).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: /reviewed every event/ })).not.toBeChecked();
  });
  it("stale advice blocks click and direct submission and cannot reuse prior acknowledgment", () => {
    const metadata = associateClassification(text, { category: "MIXED", intent: "mixed" });
    const { save, props, rerender } = setup(metadata);
    fireEvent.click(screen.getByRole("checkbox", { name: /reviewed every event/ }));
    rerender(<CaptureReview {...props} text={`${text} `} classification={metadata} />);
    expect(screen.getByRole("alert")).toHaveTextContent("changed while this review was open");
    expect(screen.getByRole("button", { name: "Save 1 entry" })).toBeDisabled();
    fireEvent.submit(screen.getByRole("form", { name: "Review memories before saving" }));
    expect(save).not.toHaveBeenCalled();
  });
  it.each([true, false])(
    "blocks an incoming plan replacement with matching new advice (source replaced: %s)",
    (replaceSource) => {
      const metadata = associateClassification(text, { category: "MIXED", intent: "mixed" });
      const { save, props, rerender } = setup(metadata);
      fireEvent.click(screen.getByRole("checkbox", { name: /reviewed every event/ }));
      const newText = replaceSource ? "Read to page 90 of the novel Copper Compass." : text;
      const newEntry = {
        ...entry(),
        title: "Copper Compass",
        matchedMemoryId: "new-fictional-id",
        activity: { ...entry().activity!, progress: 90, progressMode: "absolute" as const },
      };
      rerender(
        <CaptureReview
          {...props}
          text={newText}
          plan={{ entries: [newEntry] }}
          classification={associateClassification(newText, {
            category: "BOOK",
            intent: "progress",
          })}
        />,
      );
      expect(screen.getByRole("alert")).toHaveTextContent("open a fresh review");
      expect(screen.getByRole("button", { name: "Save 1 entry" })).toBeDisabled();
      fireEvent.submit(screen.getByRole("form", { name: "Review memories before saving" }));
      expect(save).not.toHaveBeenCalled();
    },
  );
  it("shows the known action separately from the missing detail", () => {
    setup(
      associateClassification(text, {
        category: "BOOK",
        intent: "progress",
        clarificationReasons: ["missing_identity"],
      }),
    );
    const region = screen.getByRole("region", { name: "Classification review" });
    expect(region).toHaveTextContent("Action: Made progress");
    expect(region).toHaveTextContent("Which work or subject did you mean?");
    expect(region).toHaveTextContent("The suggested action is known");
    expect(screen.getByRole("button", { name: "Save 1 entry" })).toBeDisabled();
  });
  it("does not display legacy uncertainty as a known action", () => {
    setup(associateClassification(text, { category: "BOOK", intent: "clarify" }));
    const region = screen.getByRole("region", { name: "Classification review" });
    expect(region).toHaveTextContent("Action: Not determined by the classifier");
    expect(region).toHaveTextContent("The extracted action below is a separate suggestion");
  });
  it("shows readable type and action names", () => {
    setup(associateClassification(text, { category: "BOOK", intent: "progress" }));
    expect(screen.getByRole("region", { name: "Classification review" })).toHaveTextContent(
      "Suggested type: Book · Action: Made progress",
    );
  });
  it("cancel returns to original words without saving or acknowledgment", () => {
    const { save, cancel } = setup(
      associateClassification(text, { category: "MIXED", intent: "mixed" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Back to my words" }));
    expect(cancel).toHaveBeenCalledOnce();
    expect(save).not.toHaveBeenCalled();
  });
  it("keeps legacy behavior and callback shape when no advice is supplied", async () => {
    const { save } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Save 1 entry" }));
    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    expect(save.mock.calls[0]).toHaveLength(1);
  });
});
