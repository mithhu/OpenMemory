import { webcrypto } from "node:crypto";
import { TextDecoder, TextEncoder } from "node:util";
import { IDBFactory } from "fake-indexeddb";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { CaptureReview } from "../components/CaptureReview";
import {
  applyCapturePlan,
  recordCompletionReview,
  recordUnquantifiedProgressReview,
  type CapturePlan,
  type CompletionReview,
  type UnquantifiedProgressReview,
} from "../lib/capture-plan";
import { type ClassificationReviewDecision } from "../lib/classification";
import { encryptVault, openEnvelope, readVault, saveVault, setVaultSession } from "../lib/vault";
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));
const source = "Read 12 pages of Piranesi, watched the movie Arrival, and had lunch with mum.";
const entry = (title = "Arrival"): CapturePlan["entries"][number] => ({
  title,
  summary: "Watched the movie",
  category: "MOVIE",
  date: "2026-10-09",
  matchedMemoryId: null,
  candidateMemoryIds: [],
  clarificationQuestion: null,
  tags: ["movie"],
  activity: {
    kind: "movie",
    intent: "complete",
    progress: null,
    progressMode: "absolute",
    total: null,
    lessonNumbers: [],
    sentiment: null,
    creator: null,
  },
});
const proposal = (): CapturePlan => ({ entries: [entry()] });
beforeEach(() => {
  vi.stubGlobal("crypto", webcrypto);
  vi.stubGlobal("TextEncoder", TextEncoder);
  vi.stubGlobal("TextDecoder", TextDecoder);
  vi.stubGlobal("indexedDB", new IDBFactory());
  localStorage.clear();
  setVaultSession({ key: null, salt: null });
});
afterEach(() => {
  cleanup();
  setVaultSession({ key: null, salt: null });
  vi.unstubAllGlobals();
});
it("blocks actual false Arrival completion and the entire mixed plan without issued acknowledgment", () => {
  const plan = proposal();
  plan.entries.unshift({
    ...entry("Piranesi"),
    category: "BOOK",
    summary: "Read 12 pages",
    activity: {
      ...entry().activity!,
      kind: "book",
      intent: "progress",
      progress: 12,
      progressMode: "increment",
    },
  });
  plan.entries.push({
    ...entry("Lunch with mum"),
    category: "NOTE",
    summary: "Had lunch with mum",
    activity: null,
  });
  expect(() => applyCapturePlan([], plan, source)).toThrow(/Confirm.*finished/);
  const forged = { source, reviewedPlanJson: JSON.stringify(plan), acknowledgedEntries: [1] };
  expect(() => applyCapturePlan([], plan, source, undefined, forged)).toThrow(/different original/);
  const receipt = recordCompletionReview(plan, source, [1]);
  const saved = applyCapturePlan([], plan, source, undefined, receipt);
  expect(saved.find((memory) => memory.title === "Arrival")!.activity!.status).toBe("completed");
  expect(saved.find((memory) => memory.title === "Piranesi")!.activity!.progress).toBe(12);
  expect(saved.every((memory) => memory.transcripts.includes(source))).toBe(true);
});
it("requires each complete entry and rejects every source/plan edit or cloned receipt", () => {
  const plan = { entries: [entry(), entry("Other Film")] };
  expect(() => recordCompletionReview(plan, source, [0])).toThrow(/every/);
  expect(() => recordCompletionReview(plan, source, [0, 0])).toThrow(/every/);
  const receipt = recordCompletionReview(plan, source, [0, 1]);
  expect(() => applyCapturePlan([], plan, source + " changed", undefined, receipt)).toThrow(
    /different/,
  );
  expect(() => applyCapturePlan([], plan, source, undefined, { ...receipt })).toThrow(/different/);
  for (const update of [
    { title: "Different" },
    { summary: "Different" },
    { date: "2026-10-10" },
    { tags: ["changed"] },
    { category: "BOOK" as const },
    { matchedMemoryId: "different" },
    { activity: { ...entry().activity!, intent: "start" as const } },
    { activity: { ...entry().activity!, progress: 5 } },
  ]) {
    const changed = structuredClone(plan);
    Object.assign(changed.entries[0]!, update);
    expect(() => applyCapturePlan([], changed, source, undefined, receipt)).toThrow(/different/);
  }
  expect(() =>
    applyCapturePlan([], { entries: [...plan.entries].reverse() }, source, undefined, receipt),
  ).toThrow(/different/);
});
it("acknowledgment cannot bypass pending typo or unknown-amount progress protection", () => {
  const plan = proposal();
  plan.entries[0]!.titleSuggestion = {
    sourceTitle: "Arival",
    suggestedTitle: "Arrival",
    basis: "model",
    catalogMemoryId: null,
    decision: "pending",
  };
  const receipt = recordCompletionReview(plan, source, [0]);
  expect(() => applyCapturePlan([], plan, source, undefined, receipt)).toThrow(/suggested title/);
  const mixed = proposal();
  mixed.entries.push({
    ...entry("Book"),
    category: "BOOK",
    activity: { ...entry().activity!, kind: "book", intent: "progress" },
  });
  const completion = recordCompletionReview(mixed, source, [0]);
  expect(() => applyCapturePlan([], mixed, source, undefined, completion)).toThrow(
    /planned.*progress/,
  );
  const progress = recordUnquantifiedProgressReview(mixed, source);
  expect(applyCapturePlan([], mixed, source, progress, completion)).toHaveLength(2);
});
it("actual review explicitly acknowledges completion before callback application and encrypted vault reload", async () => {
  const started = proposal();
  started.entries[0]!.activity = {
    ...started.entries[0]!.activity!,
    intent: "progress",
    progress: 10,
    total: 120,
  };
  const prior = applyCapturePlan([], started, "Watched 10 minutes of Arrival.");
  const reviewed = proposal();
  reviewed.entries[0]!.matchedMemoryId = prior[0]!.id;
  await encryptVault(prior, "fictional completion password");
  const save = vi.fn(
    async (
      plan: CapturePlan,
      _classification?: ClassificationReviewDecision,
      progress?: UnquantifiedProgressReview,
      completion?: CompletionReview,
    ) => {
      await saveVault(applyCapturePlan(prior, plan, source, progress, completion));
      return true;
    },
  );
  render(
    <CaptureReview
      plan={reviewed}
      text={source}
      memories={prior}
      onSave={save}
      onCancel={() => {}}
    />,
  );
  expect(screen.getByRole("button", { name: /Save 1 entry/ })).toBeDisabled();
  fireEvent.click(screen.getByRole("checkbox", { name: /Entry 1: I finished Arrival/ }));
  fireEvent.click(screen.getByRole("button", { name: /Save 1 entry/ }));
  await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
  await act(async () => {
    await save.mock.results[0]!.value;
  });
  const envelope = await readVault();
  const reloaded = (await openEnvelope(envelope, "fictional completion password"))
    .data as ReturnType<typeof applyCapturePlan>;
  expect(reloaded[0]!.id).toBe(prior[0]!.id);
  expect(reloaded[0]!.activity).toMatchObject({ status: "completed", progress: 120, total: 120 });
  expect(reloaded[0]!.activity!.history).toHaveLength(2);
  expect(reloaded[0]!.transcripts).toContain("Watched 10 minutes of Arrival.");
  expect(reloaded[0]!.transcripts).toContain(source);
});
it("editing an entry or changing away and back to completion clears acknowledgment", () => {
  render(
    <CaptureReview
      plan={proposal()}
      text={source}
      memories={[]}
      onSave={vi.fn()}
      onCancel={() => {}}
    />,
  );
  const checkbox = () => screen.getByRole("checkbox", { name: /Entry 1: I finished/ });
  fireEvent.click(checkbox());
  expect(checkbox()).toBeChecked();
  fireEvent.change(screen.getByLabelText("My reaction"), { target: { value: "loved" } });
  expect(checkbox()).not.toBeChecked();
  fireEvent.click(checkbox());
  fireEvent.change(screen.getByLabelText("This was"), { target: { value: "start" } });
  fireEvent.change(screen.getByLabelText("This was"), { target: { value: "complete" } });
  expect(checkbox()).not.toBeChecked();
});
it("course lesson form edits invalidate completion acknowledgment and unchanged explicit totals complete normally", () => {
  const plan = proposal();
  plan.entries[0] = {
    ...entry("Course"),
    category: "LESSON",
    activity: { ...entry().activity!, kind: "course", total: 4 },
  };
  render(
    <CaptureReview
      plan={plan}
      text="Finished the entire Course."
      memories={[]}
      onSave={vi.fn()}
      onCancel={() => {}}
    />,
  );
  const checkbox = screen.getByRole("checkbox", { name: /Entry 1: I finished Course/ });
  fireEvent.click(checkbox);
  fireEvent.change(screen.getByLabelText("Lessons completed"), { target: { value: "1" } });
  expect(checkbox).not.toBeChecked();
  const receipt = recordCompletionReview(plan, "Finished the entire Course.", [0]);
  const saved = applyCapturePlan([], plan, "Finished the entire Course.", undefined, receipt);
  expect(saved[0]!.activity).toMatchObject({
    status: "completed",
    progress: 4,
    completedLessons: [1, 2, 3, 4],
  });
});

it("two completion choices are independent and a source replacement cannot reuse them", () => {
  const plan = { entries: [entry(), entry("Other Film")] };
  const save = vi.fn();
  const view = render(
    <CaptureReview plan={plan} text={source} memories={[]} onSave={save} onCancel={() => {}} />,
  );
  fireEvent.click(screen.getByRole("checkbox", { name: /Entry 1:/ }));
  expect(screen.getByRole("button", { name: /Save 2 entries/ })).toBeDisabled();
  fireEvent.click(screen.getByRole("checkbox", { name: /Entry 2:/ }));
  expect(screen.getByRole("button", { name: /Save 2 entries/ })).not.toBeDisabled();
  view.rerender(
    <CaptureReview
      plan={plan}
      text={source + " Changed."}
      memories={[]}
      onSave={save}
      onCancel={() => {}}
    />,
  );
  expect(
    screen.getAllByRole("checkbox").every((checkbox) => !(checkbox as HTMLInputElement).checked),
  ).toBe(true);
  fireEvent.submit(screen.getByRole("form", { name: /Review memories/ }));
  expect(save).not.toHaveBeenCalled();
});
it("ordinary notes, wishlist, start, numeric progress and listened actions keep their normal save path", () => {
  const normal = proposal();
  normal.entries[0]!.activity!.intent = "wishlist";
  expect(applyCapturePlan([], normal, "Want to watch Arrival.")[0]!.activity!.status).toBe(
    "planned",
  );
  normal.entries[0]!.activity!.intent = "start";
  expect(applyCapturePlan([], normal, "Started Arrival.")[0]!.activity!.status).toBe("in-progress");
  normal.entries[0]!.activity!.intent = "progress";
  normal.entries[0]!.activity!.progress = 10;
  expect(
    applyCapturePlan([], normal, "Watched 10 minutes of Arrival.")[0]!.activity!.progress,
  ).toBe(10);
  normal.entries[0]!.category = "MUSIC";
  normal.entries[0]!.activity!.kind = "music";
  normal.entries[0]!.activity!.intent = "listen";
  normal.entries[0]!.activity!.progress = null;
  expect(applyCapturePlan([], normal, "Listened to Arrival.")[0]!.activity!.progress).toBe(1);
  normal.entries[0]!.category = "NOTE";
  normal.entries[0]!.activity = null;
  expect(applyCapturePlan([], normal, "Went for a walk.")[0]!.transcripts).toContain(
    "Went for a walk.",
  );
});

it("adding and removing an entry cannot revive a prior completion acknowledgment", () => {
  render(
    <CaptureReview
      plan={proposal()}
      text={source}
      memories={[]}
      onSave={vi.fn()}
      onCancel={() => {}}
    />,
  );
  const checkbox = () => screen.getByRole("checkbox", { name: /Entry 1: I finished Arrival/ });
  fireEvent.click(checkbox());
  expect(checkbox()).toBeChecked();
  fireEvent.click(screen.getByRole("button", { name: /Add another entry/ }));
  fireEvent.click(screen.getAllByRole("button", { name: "Remove entry" })[1]!);
  expect(checkbox()).not.toBeChecked();
  expect(screen.getByRole("button", { name: /Save 1 entry/ })).toBeDisabled();
  expect(screen.getByText(/Confirm completion for/)).toHaveTextContent(
    "Confirm completion for 1 entry to save.",
  );
});
