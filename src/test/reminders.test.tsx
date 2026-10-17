import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CaptureReview } from "../components/CaptureReview";
import { RemindersPanel } from "../components/RemindersPanel";
import { applyCapturePlan, validatePlan, type CaptureEntry } from "../lib/capture-plan";
import { localDateTime, localReminder, nextSaturday } from "../lib/reminders";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
const trip: CaptureEntry = {
  title: "Trip to Paris",
  summary: "I will go to Paris in November.",
  category: "WISHLIST",
  date: "2026-10-14",
  matchedMemoryId: null,
  candidateMemoryIds: [],
  clarificationQuestion: null,
  tags: [],
  activity: null,
  plannedTiming: "in November",
};
const source = "I will go to Paris in November.";

describe("Confirmed local reminders", () => {
  it("preserves vague planned timing without inventing a date or scheduling", () => {
    const memory = applyCapturePlan([], { entries: [trip] }, source)[0]!;
    expect(memory.plannedTiming).toBe("in November");
    expect(memory.date).toBe("2026-10-14");
    expect(memory.reminder).toBeNull();
  });
  it("rejects model-supplied schedules and invented timing", () => {
    const plan = validatePlan(
      {
        entries: [
          {
            ...trip,
            plannedTiming: "November 1, 2026",
            reminder: {
              at: "2026-11-01T18:00:00.000Z",
              timezone: "Europe/London",
              status: "scheduled",
            },
          },
        ],
      },
      [],
      true,
      source,
    );
    expect(plan.entries[0]!.reminder).toBeUndefined();
    expect(plan.entries[0]!.plannedTiming).toBeNull();
  });
  it("keeps possessive month timing verbatim through validation and saving", () => {
    const words = "I want to go to Bangladesh in December's last week.";
    const phrase = "in December's last week";
    const plan = validatePlan(
      { entries: [{ ...trip, title: "Go to Bangladesh", plannedTiming: phrase }] },
      [],
      true,
      words,
    );
    const saved = applyCapturePlan([], plan, words)[0]!;
    expect(saved.plannedTiming).toBe(phrase);
    expect(saved.reminder).toBeNull();
    expect(saved.transcripts).toContain(words);
    const paraphrased = validatePlan(
      { entries: [{ ...trip, plannedTiming: "last week of December" }] },
      [],
      true,
      words,
    );
    expect(paraphrased.entries[0]!.plannedTiming).toBeNull();
  });
  it("round-trips local time and rejects past or invalid calendar times", () => {
    const date = new Date(2030, 10, 1, 18, 0);
    expect(localReminder(localDateTime(date), new Date(2030, 9, 1)).at).toBe(date.toISOString());
    expect(() => localReminder("2020-01-01T18:00")).toThrow("future");
    expect(() => localReminder("2030-02-30T18:00", new Date(2030, 0, 1))).toThrow("does not exist");
    expect(new Date(nextSaturday(new Date(2030, 9, 1))).getDay()).toBe(6);
  });
  it("requires explicit opt-in and saves a reminder independently of a month-only plan", async () => {
    const save = vi.fn().mockResolvedValue(true);
    render(
      <CaptureReview
        plan={{ entries: [trip] }}
        text={source}
        memories={[]}
        onSave={save}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.queryByLabelText("Reminder date and time")).not.toBeInTheDocument();
    expect(save).not.toHaveBeenCalled();
    fireEvent.click(screen.getByLabelText("Remind me"));
    fireEvent.change(screen.getByLabelText("Reminder date and time"), {
      target: { value: "2030-10-25T18:00" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save 1 entry" }));
    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    const saved = applyCapturePlan([], save.mock.calls[0]![0], source)[0]!;
    expect(saved.plannedTiming).toBe("in November");
    expect(saved.reminder?.at).toBe(new Date("2030-10-25T18:00").toISOString());
    expect(saved.reminder?.status).toBe("scheduled");
  });
  it("shows overdue reminders and exposes snooze, done, dismiss and opening", () => {
    const memory = applyCapturePlan([], { entries: [trip] }, source)[0]!;
    memory.reminder = {
      at: "2020-01-01T18:00:00.000Z",
      timezone: "Europe/London",
      status: "scheduled",
    };
    const open = vi.fn(),
      update = vi.fn().mockResolvedValue(undefined);
    render(<RemindersPanel memories={[memory]} disabled={false} onOpen={open} onUpdate={update} />);
    const panel = within(screen.getByRole("region", { name: "Your reminders" }));
    expect(panel.getByText("Due now")).toBeInTheDocument();
    fireEvent.click(panel.getByRole("button", { name: "Trip to Paris" }));
    expect(open).toHaveBeenCalledWith(memory.id);
    for (const [label, action] of [
      ["Snooze 1 hour", "snooze"],
      ["Mark reminder done", "done"],
      ["Dismiss reminder", "dismissed"],
    ] as const) {
      fireEvent.click(panel.getByRole("button", { name: label }));
      expect(update).toHaveBeenCalledWith(memory.id, action);
    }
  });
  it("preserves an existing reminder when a later capture does not replace it", () => {
    const base = applyCapturePlan([], { entries: [trip] }, source)[0]!;
    base.reminder = {
      at: "2030-11-01T18:00:00.000Z",
      timezone: "Europe/London",
      status: "scheduled",
    };
    const updated = applyCapturePlan(
      [base],
      { entries: [{ ...trip, matchedMemoryId: base.id }] },
      source,
    )[0]!;
    expect(updated.reminder).toEqual(base.reminder);
  });
});
