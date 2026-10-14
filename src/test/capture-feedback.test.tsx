import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CaptureReview } from "../components/CaptureReview";
import { MemoryCard } from "../components/MemoryCard";
import { type CaptureEntry } from "../lib/capture-plan";
import { memorySchema } from "../lib/memory";

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));
const entry = (extra: Partial<CaptureEntry> = {}): CaptureEntry => ({
  title: "Arrival",
  summary: "I want to watch Arrival this weekend.",
  category: "MOVIE",
  date: "2026-10-14",
  matchedMemoryId: null,
  candidateMemoryIds: [],
  clarificationQuestion: null,
  tags: [],
  activity: {
    kind: "movie",
    intent: "wishlist",
    progress: null,
    progressMode: "absolute",
    total: null,
    lessonNumbers: [],
    sentiment: null,
    creator: null,
  },
  ...extra,
});
function review(value: CaptureEntry) {
  const save = vi.fn().mockResolvedValue(true);
  render(
    <CaptureReview
      plan={{ entries: [value] }}
      text="Fictional note"
      memories={[]}
      onSave={save}
      onCancel={vi.fn()}
    />,
  );
  return save;
}
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Capture result feedback", () => {
  it("brings a completed review into focus and says it is ready without saving", () => {
    const scroll = vi.fn();
    const previous = HTMLElement.prototype.scrollIntoView;
    HTMLElement.prototype.scrollIntoView = scroll;
    const save = review(entry());
    expect(screen.getByRole("heading", { name: "Here’s what I understood." })).toHaveFocus();
    expect(screen.getByRole("status", { name: "Review status" })).toHaveTextContent(
      "Review ready — 1 entry to check.",
    );
    expect(scroll).toHaveBeenCalledOnce();
    expect(save).not.toHaveBeenCalled();
    HTMLElement.prototype.scrollIntoView = previous;
  });
  it("links missing action and title decisions to the controls and updates once resolved", () => {
    review(entry({ activity: null, clarificationQuestion: "Did you finish watching it?" }));
    expect(screen.getByRole("status", { name: "Review status" })).toHaveTextContent(
      "Needs your input — 2 decisions before saving.",
    );
    const questions = screen.getByRole("group", { name: "Entry 1 question" });
    expect(questions).toHaveTextContent("Did you finish watching it?");
    expect(questions).toHaveTextContent("Choose what happened");
    fireEvent.click(
      within(screen.getByRole("region", { name: "Questions to check" })).getByRole("button", {
        name: "Entry 1: Did you finish watching it?",
      }),
    );
    expect(questions).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: "Entry 1: choose what happened" }));
    expect(screen.getByLabelText("This was")).toHaveFocus();
    fireEvent.change(screen.getByLabelText("This was"), { target: { value: "wishlist" } });
    fireEvent.click(screen.getByRole("button", { name: "Entry 1: check the title" }));
    expect(
      screen.getByText("Check this title before saving.").parentElement?.parentElement,
    ).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: "Confirm “Arrival”" }));
    expect(screen.getByRole("status", { name: "Review status" })).toHaveTextContent("Review ready");
    expect(screen.getByRole("button", { name: "Save 1 entry" })).toBeEnabled();
  });
  it("makes an advisory question visible without introducing an unexplained save block", () => {
    review(entry({ clarificationQuestion: "Would you like to include who recommended this?" }));
    expect(screen.getByRole("group", { name: "Entry 1 question" })).toHaveTextContent(
      "Check this detail",
    );
    expect(screen.getByRole("status", { name: "Review status" })).toHaveTextContent("Review ready");
    expect(screen.getByRole("button", { name: "Save 1 entry" })).toBeEnabled();
  });
  it("keeps the completion guard and links directly to its required confirmation", () => {
    review(entry({ activity: { ...entry().activity!, intent: "complete" } }));
    fireEvent.click(screen.getByRole("button", { name: "Entry 1: confirm whole-work completion" }));
    const confirmation = screen.getByLabelText("Entry 1: I finished Arrival in full");
    expect(confirmation).toHaveFocus();
    expect(screen.getByRole("button", { name: "Save 1 entry" })).toBeDisabled();
    fireEvent.click(confirmation);
    expect(screen.getByRole("button", { name: "Save 1 entry" })).toBeEnabled();
  });
});

const memory = memorySchema.parse({
  id: "fictional",
  title: "A fictional walk",
  category: "NOTE",
  date: "2026-10-14",
  summary: "A fictional note",
  followUpQuestion: "What did you enjoy?",
  suggestedAnswers: [],
  answerLabel: "Reflection",
  answers: [],
  transcripts: [],
  createdAt: "2026-10-14",
  updatedAt: "2026-10-14",
});
describe("Optional saved-memory follow-ups", () => {
  it("shows the question on compact cards and opens it through an explicit action", () => {
    const explore = vi.fn();
    render(
      <MemoryCard
        memory={memory}
        compact
        onExplore={explore}
        onLog={vi.fn()}
        onDelete={vi.fn()}
        onDone={vi.fn()}
      />,
    );
    expect(screen.getByText("Optional follow-up")).toBeInTheDocument();
    expect(screen.getByText("What did you enjoy?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Answer question" }));
    expect(explore).toHaveBeenCalledOnce();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });
  it("labels the full answer action visibly and saves only the submitted answer", () => {
    const log = vi.fn();
    render(<MemoryCard memory={memory} onLog={log} onDelete={vi.fn()} onDone={vi.fn()} />);
    expect(screen.getByText("OPTIONAL FOLLOW-UP")).toBeInTheDocument();
    const submit = screen.getByRole("button", { name: "Save answer" });
    expect(within(submit).getByText("Save answer")).toBeInTheDocument();
    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Answer the follow-up question"), {
      target: { value: "The quiet" },
    });
    fireEvent.click(submit);
    expect(log).toHaveBeenCalledWith("The quiet");
  });
});
