import { webcrypto } from "node:crypto";
import { TextDecoder, TextEncoder } from "node:util";
import { IDBFactory } from "fake-indexeddb";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CaptureReview } from "../components/CaptureReview";
import {
  applyCapturePlan,
  recordUnquantifiedProgressReview,
  validatePlan,
  type CapturePlan,
  type UnquantifiedProgressReview,
} from "../lib/capture-plan";
import {
  assertClassificationReview,
  associateClassification,
  type ClassificationReviewDecision,
} from "../lib/classification";
import { memorySchema } from "../lib/memory";
import {
  encryptVault,
  lockVault,
  openEnvelope,
  readVault,
  saveVault,
  setVaultSession,
} from "../lib/vault";

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));
const source = "  Read some of Copper Orchard today.\n";
const proposal = (): CapturePlan => ({
  entries: [
    {
      title: "Copper Orchard",
      summary: source,
      category: "BOOK",
      date: "2026-10-10",
      matchedMemoryId: null,
      candidateMemoryIds: [],
      clarificationQuestion: null,
      tags: [],
      activity: {
        kind: "book",
        intent: "progress",
        progress: null,
        progressMode: "increment",
        total: null,
        lessonNumbers: [],
        sentiment: null,
        creator: null,
      },
    },
  ],
});
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
const acknowledge = () => {
  fireEvent.change(screen.getByLabelText("This was"), { target: { value: "progress" } });
  fireEvent.click(screen.getByRole("checkbox", { name: /I made partial progress/ }));
};

describe("Deliberate unknown-amount progress review", () => {
  it("passes actual review, classification receipt and encrypted reload without inventing quantity", async () => {
    const seed = proposal();
    seed.entries[0]!.activity!.progress = 50;
    seed.entries[0]!.activity!.total = 240;
    const memories = applyCapturePlan([], seed, "Read 50 pages of Copper Orchard.");
    await encryptVault(memories, "fictional review password");
    const raw = proposal();
    raw.entries[0]!.matchedMemoryId = memories[0]!.id;
    const plan = validatePlan(raw, memories, true, source);
    const classification = associateClassification(source, {
      category: "BOOK",
      intent: "progress",
    });
    const save = vi.fn(
      async (
        reviewed: CapturePlan,
        categoryReceipt?: ClassificationReviewDecision,
        progressReceipt?: UnquantifiedProgressReview,
      ) => {
        assertClassificationReview(reviewed, source, classification, categoryReceipt);
        await saveVault(applyCapturePlan(memories, reviewed, source, progressReceipt));
        return true;
      },
    );
    render(
      <CaptureReview
        plan={plan}
        text={source}
        memories={memories}
        classification={classification}
        onSave={save}
        onCancel={vi.fn()}
      />,
    );
    acknowledge();
    fireEvent.click(screen.getByRole("button", { name: "Save 1 entry" }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    await waitFor(async () => expect((await readVault())?.encrypted).toBe(true));
    // Wait for the asynchronous onSave transaction to finish before locking.
    await save.mock.results[0]!.value;
    lockVault();
    const envelope = await readVault();
    expect(JSON.stringify(envelope)).not.toContain(source);
    const reloaded = memorySchema
      .array()
      .parse((await openEnvelope(envelope, "fictional review password")).data);
    expect(reloaded[0]!.activity).toMatchObject({
      progress: 50,
      total: 240,
      status: "in-progress",
    });
    expect(reloaded[0]!.activity!.history).toHaveLength(memories[0]!.activity!.history.length + 1);
    expect(reloaded[0]!.transcripts.at(-1)).toBe(source);
  });

  it("does not save action selection alone, a model flag or an invented serialized receipt", async () => {
    const plan = proposal();
    plan.entries[0]!.intentReviewRequired = false;
    expect(() => applyCapturePlan([], plan, source)).toThrow();
    expect(() =>
      applyCapturePlan([], plan, source, {
        source,
        reviewedPlanJson: JSON.stringify(plan),
        acknowledgedEntries: [0],
      }),
    ).toThrow("different original words");
    const save = vi.fn().mockResolvedValue(true);
    render(
      <CaptureReview plan={plan} text={source} memories={[]} onSave={save} onCancel={vi.fn()} />,
    );
    fireEvent.change(screen.getByLabelText("This was"), { target: { value: "progress" } });
    fireEvent.click(screen.getByRole("button", { name: "Save 1 entry" }));
    await waitFor(() => expect(save).not.toHaveBeenCalled());
  });

  it("retains both independent acknowledgments when classification disagrees", async () => {
    const plan = proposal();
    const metadata = associateClassification(source, { category: "MUSIC", intent: "wishlist" });
    const save = vi.fn(
      async (
        reviewed: CapturePlan,
        categoryReceipt?: ClassificationReviewDecision,
        progressReceipt?: UnquantifiedProgressReview,
      ) => {
        assertClassificationReview(reviewed, source, metadata, categoryReceipt);
        expect(applyCapturePlan([], reviewed, source, progressReceipt)[0]!.activity?.progress).toBe(
          0,
        );
        return true;
      },
    );
    render(
      <CaptureReview
        plan={plan}
        text={source}
        memories={[]}
        classification={metadata}
        onSave={save}
        onCancel={vi.fn()}
      />,
    );
    acknowledge();
    fireEvent.click(screen.getByRole("checkbox", { name: /I checked the suggested type/ }));
    expect(screen.getByRole("checkbox", { name: /I made partial progress/ })).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Save 1 entry" }));
    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    await expect(save.mock.results[0]!.value).resolves.toBe(true);
  });

  it.each(["type", "action", "title", "match"])("rejects a receipt after %s changes", (field) => {
    const plan = proposal();
    plan.entries[0]!.intentReviewRequired = false;
    const receipt = recordUnquantifiedProgressReview(plan, source);
    const changed = structuredClone(plan);
    if (field === "type") {
      changed.entries[0]!.category = "MOVIE";
      changed.entries[0]!.activity!.kind = "movie";
    }
    if (field === "action") changed.entries[0]!.activity!.intent = "complete";
    if (field === "title") changed.entries[0]!.title = "Different work";
    if (field === "match") changed.entries[0]!.matchedMemoryId = "different-id";
    expect(() => applyCapturePlan([], changed, source, receipt)).toThrow(
      "different original words",
    );
    expect(() => applyCapturePlan([], plan, source.trim(), receipt)).toThrow(
      "different original words",
    );
  });

  it("form edits and a replaced source invalidate acknowledgment; cancel saves nothing", async () => {
    const plan = proposal();
    const save = vi.fn().mockResolvedValue(true);
    const cancel = vi.fn();
    const view = render(
      <CaptureReview plan={plan} text={source} memories={[]} onSave={save} onCancel={cancel} />,
    );
    acknowledge();
    fireEvent.change(screen.getByLabelText("Entry 1 title"), {
      target: { value: "Another title" },
    });
    expect(screen.getByRole("checkbox", { name: /I made partial progress/ })).not.toBeChecked();
    fireEvent.click(screen.getByRole("checkbox", { name: /I made partial progress/ }));
    view.rerender(
      <CaptureReview
        plan={plan}
        text={`${source} changed`}
        memories={[]}
        onSave={save}
        onCancel={cancel}
      />,
    );
    expect(screen.getByRole("checkbox", { name: /I made partial progress/ })).not.toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Save 1 entry" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel review" }));
    await waitFor(() => expect(cancel).toHaveBeenCalledOnce());
    expect(save).not.toHaveBeenCalled();
  });
});
