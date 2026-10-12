import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CaptureReview } from "../components/CaptureReview";
import { applyCapturePlan, type CaptureEntry } from "../lib/capture-plan";
import { type Memory } from "../lib/memory";
import { toast } from "sonner";
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));
const entry = (title = "Sapiens", overrides: Partial<CaptureEntry> = {}): CaptureEntry => ({
  title,
  summary: `Fictional ${title} event`,
  category: "BOOK",
  date: "2026-10-09",
  matchedMemoryId: null,
  candidateMemoryIds: [],
  clarificationQuestion: null,
  tags: [],
  activity: {
    kind: "book",
    intent: "progress",
    progress: 20,
    progressMode: "increment",
    total: null,
    lessonNumbers: [],
    sentiment: null,
    creator: null,
  },
  ...overrides,
});
function review(entries = [entry()], memories: Memory[] = []) {
  const save = vi.fn().mockResolvedValue(true);
  const cancel = vi.fn();
  render(
    <CaptureReview
      plan={{ entries }}
      text="Fictional mixed note"
      memories={memories}
      onSave={save}
      onCancel={cancel}
    />,
  );
  return { save, cancel };
}
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
describe("User review protects capture decisions", () => {
  it("asks for intent confirmation when a model attaches completed progress to a plan", async () => {
    const { save } = review([
      entry("Fictional work", { activity: { ...entry().activity!, intent: "wishlist" } }),
    ]);
    const button = screen.getByRole("button", { name: "Save 1 entry" });
    expect(button).toBeDisabled();
    expect(screen.getByLabelText("This was")).toHaveValue("");
    fireEvent.change(screen.getByLabelText("This was"), { target: { value: "wishlist" } });
    fireEvent.click(button);
    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    expect(save.mock.calls[0]![0].entries[0].activity).toMatchObject({
      intent: "wishlist",
      progress: null,
      lessonNumbers: [],
    });
  });
  it.each(["book", "course"] as const)(
    "correcting %s progress to a plan clears completed amounts",
    async (kind) => {
      const { save } = review([
        entry("Fictional work", {
          category: kind === "book" ? "BOOK" : "LESSON",
          activity: {
            ...entry().activity!,
            kind,
            progress: 20,
            total: 100,
            lessonNumbers: kind === "course" ? [2, 3] : [],
          },
        }),
      ]);
      fireEvent.change(screen.getByLabelText("This was"), { target: { value: "wishlist" } });
      expect(
        screen.queryByLabelText(kind === "book" ? "pages" : "Lessons completed"),
      ).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Save 1 entry" }));
      await waitFor(() => expect(save).toHaveBeenCalledOnce());
      const confirmed = save.mock.calls[0]![0];
      expect(confirmed.entries[0].activity).toMatchObject({
        intent: "wishlist",
        progress: null,
        lessonNumbers: [],
        total: 100,
      });
      expect(applyCapturePlan([], confirmed, "I want to do this")[0]?.activity).toMatchObject({
        status: "planned",
        progress: 0,
        completedLessons: [],
        total: 100,
      });
    },
  );
  it("rejects completed quantities attached to a plan at the persistence boundary", () => {
    const proposal = entry("Fictional work", {
      activity: { ...entry().activity!, intent: "wishlist" },
    });
    expect(() => applyCapturePlan([], { entries: [proposal] }, "I want to read it")).toThrow(
      "A plan cannot record completed progress",
    );
  });
  it("accepting a title suggestion preserves ordinary words, punctuation and quantities", async () => {
    const details = "Updated my notes after ‘Up’. Up was uplifting; I watched 20 minutes.";
    const { save } = review([
      entry("Upstream", {
        summary: details,
        titleSuggestion: {
          sourceTitle: "Up",
          suggestedTitle: "Upstream",
          basis: "model",
          catalogMemoryId: null,
          decision: "pending",
        },
      }),
    ]);
    fireEvent.click(screen.getByRole("button", { name: "Use “Upstream”" }));
    expect(screen.getByLabelText("Entry 1 details")).toHaveValue(
      "Updated my notes after ‘Upstream’. Upstream was uplifting; I watched 20 minutes.",
    );
    fireEvent.click(screen.getByRole("button", { name: "Save 1 entry" }));
    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    expect(save.mock.calls[0]![0].entries[0].activity.progress).toBe(20);
  });
  it("keeping the original title preserves an unrelated longer word", () => {
    review([
      entry("Uptown", {
        summary: "An Uptowner recommended Uptown, and I read 20 pages.",
        titleSuggestion: {
          sourceTitle: "Up",
          suggestedTitle: "Uptown",
          basis: "model",
          catalogMemoryId: null,
          decision: "pending",
        },
      }),
    ]);
    fireEvent.click(screen.getByRole("button", { name: "Keep “Up”" }));
    expect(screen.getByLabelText("Entry 1 details")).toHaveValue(
      "An Uptowner recommended Up, and I read 20 pages.",
    );
  });
  it("changing type restores title mentions without changing words containing that title", () => {
    review([
      entry("Uptown", {
        summary: "An Uptowner recommended Uptown, and I read 20 pages.",
        titleSuggestion: {
          sourceTitle: "Up",
          suggestedTitle: "Uptown",
          basis: "model",
          catalogMemoryId: null,
          decision: "pending",
        },
      }),
    ]);
    fireEvent.change(screen.getByLabelText("Entry 1 type"), { target: { value: "NOTE" } });
    expect(screen.getByLabelText("Entry 1 title")).toHaveValue("Up");
    expect(screen.getByLabelText("Entry 1 details")).toHaveValue(
      "An Uptowner recommended Up, and I read 20 pages.",
    );
  });
  it("requires title and intent decisions when the model returns media without an activity", async () => {
    const proposal = entry("Which book?", {
      activity: null,
      clarificationQuestion: "Which book did you mean?",
    });
    const { save } = review([proposal]);
    expect(screen.getByLabelText("Entry 1 type")).toHaveValue("book");
    const button = screen.getByRole("button", { name: "Save 1 entry" });
    expect(button).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Entry 1 title"), { target: { value: "Sapiens" } });
    expect(button).toBeDisabled();
    fireEvent.change(screen.getByLabelText("This was"), { target: { value: "wishlist" } });
    fireEvent.click(button);
    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    const confirmed = save.mock.calls[0]![0];
    const saved = applyCapturePlan([], confirmed, "I want to read a book");
    expect(saved[0]?.activity).toMatchObject({ kind: "book", status: "planned", progress: 0 });
    expect(saved[0]?.transcripts).toEqual(["I want to read a book"]);
  });
  it("blocks unreviewed media without an activity at the persistence boundary", () => {
    expect(() =>
      applyCapturePlan([], { entries: [entry("Sapiens", { activity: null })] }, "Sapiens"),
    ).toThrow("Choose what happened");
  });
  it("cancels without sending any proposal to save", () => {
    const { save, cancel } = review();
    fireEvent.click(screen.getByRole("button", { name: "Back to my words" }));
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(save).not.toHaveBeenCalled();
  });
  it("submits corrected pages, progress mode and empty total", async () => {
    const { save } = review();
    fireEvent.change(screen.getByLabelText("pages"), { target: { value: "100" } });
    fireEvent.change(screen.getByLabelText("Progress means"), { target: { value: "absolute" } });
    fireEvent.click(screen.getByRole("button", { name: "Save 1 entry" }));
    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    expect(save.mock.calls[0]![0].entries[0].activity).toMatchObject({
      progress: 100,
      progressMode: "absolute",
      total: null,
    });
  });
  it("lets the user clear an invented total rather than turning it into zero", async () => {
    const { save } = review([entry("Sapiens", { activity: { ...entry().activity!, total: 100 } })]);
    fireEvent.change(screen.getByLabelText("Total pages"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Save 1 entry" }));
    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    expect(save.mock.calls[0]![0].entries[0].activity.total).toBeNull();
  });
  it("changing a book to a daily note clears progress and an existing-record match", async () => {
    const { save } = review([entry("Sunset", { matchedMemoryId: "book-sapiens" })]);
    fireEvent.change(screen.getByLabelText("Entry 1 type"), { target: { value: "NOTE" } });
    expect(screen.queryByLabelText("pages")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Save 1 entry" }));
    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    expect(save.mock.calls[0]![0].entries[0]).toMatchObject({
      category: "NOTE",
      activity: null,
      matchedMemoryId: null,
    });
  });
  it("removing one event preserves the edited values of the remaining event", async () => {
    const { save } = review([entry("First book"), entry("Second book")]);
    fireEvent.change(screen.getByLabelText("Entry 2 title"), {
      target: { value: "Corrected second book" },
    });
    const first = screen.getByLabelText("Entry 1 title").closest(".review-entry")!;
    fireEvent.click(within(first as HTMLElement).getByRole("button", { name: "Remove entry" }));
    fireEvent.click(screen.getByRole("button", { name: "Save 1 entry" }));
    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    expect(save.mock.calls[0]![0].entries[0].title).toBe("Corrected second book");
  });
  it("parses edited lesson ranges and deduplicates overlaps before saving", async () => {
    const { save } = review([
      entry("Practical AI", {
        category: "LESSON",
        activity: { ...entry().activity!, kind: "course", progress: null },
      }),
    ]);
    fireEvent.change(screen.getByLabelText("Lessons completed"), {
      target: { value: "2-4, 3, 6" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save 1 entry" }));
    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    expect(save.mock.calls[0]![0].entries[0].activity.lessonNumbers).toEqual([2, 3, 4, 6]);
  });
  it.each(["0", "4-2", "1-10000", "banana"])(
    "rejects invalid lesson input %s without saving",
    async (value) => {
      const { save } = review([
        entry("Practical AI", {
          category: "LESSON",
          activity: { ...entry().activity!, kind: "course", progress: null },
        }),
      ]);
      fireEvent.change(screen.getByLabelText("Lessons completed"), { target: { value } });
      fireEvent.click(screen.getByRole("button", { name: "Save 1 entry" }));
      await waitFor(() => expect(toast.error).toHaveBeenCalled());
      expect(save).not.toHaveBeenCalled();
    },
  );
  it("blocks duplicate save clicks and edits while persistence is pending", async () => {
    let finish!: (saved: boolean) => void;
    const save = vi.fn().mockImplementation(
      () =>
        new Promise<boolean>((resolve) => {
          finish = resolve;
        }),
    );
    render(
      <CaptureReview
        plan={{ entries: [entry()] }}
        text="Fictional note"
        memories={[]}
        onSave={save}
        onCancel={() => {}}
      />,
    );
    const button = screen.getByRole("button", { name: "Save 1 entry" });
    fireEvent.click(button);
    expect(button).toBeDisabled();
    expect(screen.getByLabelText("Entry 1 title")).toBeDisabled();
    fireEvent.click(button);
    expect(save).toHaveBeenCalledOnce();
    finish(true);
    await waitFor(() => expect(button).not.toBeDisabled());
  });
  it("allows retry after persistence returns false, preserving the edited note", async () => {
    const { save } = review();
    save.mockResolvedValueOnce(false);
    fireEvent.change(screen.getByLabelText("Entry 1 details"), {
      target: { value: "Corrected details" },
    });
    const button = screen.getByRole("button", { name: "Save 1 entry" });
    fireEvent.click(button);
    await waitFor(() => expect(button).not.toBeDisabled());
    fireEvent.click(button);
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    expect(save.mock.calls[1]![0].entries[0].summary).toBe("Corrected details");
  });
});
