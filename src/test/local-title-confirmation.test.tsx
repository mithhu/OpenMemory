// Replay recorded fictional MLX output through the real review and save boundary.
// No inference, browser storage or cloud access.
import { readFileSync } from "node:fs";
import { webcrypto } from "node:crypto";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { CaptureReview } from "../components/CaptureReview";
import { applyCapturePlan, capturePlanSchema, validatePlan } from "../lib/capture-plan";
import { memorySchema } from "../lib/memory";

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));
const report = JSON.parse(
  readFileSync("src/test/fixtures/title-existing/responses.json", "utf8"),
);
const cases = JSON.parse(
  readFileSync("src/test/fixtures/title-existing/cases.json", "utf8"),
);
function fixture(id: string) {
  const scenario = cases.find((item: { id: string }) => item.id === id);
  const row = report.rows.find((item: { id: string }) => item.id === id);
  return {
    note: scenario.note,
    memories: memorySchema.array().parse(scenario.memories),
    plan: capturePlanSchema.parse(row.plan),
  };
}
beforeEach(() => vi.stubGlobal("crypto", webcrypto));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Recorded local proposals can be confirmed without losing catalog identity", () => {
  it("accepts the recorded typo and updates the original book from 50 to 62", async () => {
    const { note, memories, plan } = fixture("existing-typo");
    const original = structuredClone(memories);
    expect(() => applyCapturePlan(memories, plan, note)).toThrow("Confirm the suggested title");
    const save = vi.fn().mockResolvedValue(true);
    render(
      <CaptureReview
        plan={plan}
        text={note}
        memories={memories}
        onSave={save}
        onCancel={() => {}}
      />,
    );
    expect(screen.getByRole("button", { name: "Save 1 entry" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Use “Luminous Paths”" }));
    fireEvent.click(screen.getByRole("button", { name: "Save 1 entry" }));
    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    const next = applyCapturePlan(memories, save.mock.calls[0]![0], note);
    expect(next).toHaveLength(1);
    expect(next[0]).toMatchObject({
      id: memories[0]!.id,
      title: "Luminous Paths",
      activity: { progress: 62 },
    });
    expect(next[0]!.activity!.history).toHaveLength(1);
    expect(next[0]!.transcripts).toEqual([...memories[0]!.transcripts, note]);
    expect(memories).toEqual(original);
  });
  it("requires explicit selection for the recorded unresolved reaction and preserves the bookmark", async () => {
    const { note, memories, plan } = fixture("existing-reaction");
    const checked = validatePlan(plan, memories, true, note);
    const save = vi.fn().mockResolvedValue(true);
    render(
      <CaptureReview
        plan={checked}
        text={note}
        memories={memories}
        onSave={save}
        onCancel={() => {}}
      />,
    );
    expect(screen.getByLabelText("Save to")).toHaveValue("__unresolved__");
    expect(screen.getByRole("button", { name: "Save 1 entry" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Save to"), { target: { value: memories[0]!.id } });
    fireEvent.click(screen.getByRole("button", { name: "Save 1 entry" }));
    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    const next = applyCapturePlan(memories, save.mock.calls[0]![0], note);
    expect(next).toHaveLength(1);
    expect(next[0]).toMatchObject({
      id: memories[0]!.id,
      activity: { progress: 50, status: "in-progress" },
    });
    expect(next[0]!.transcripts).toContain(note);
    expect(memories[0]!.activity!.progress).toBe(50);
  });
  it("lets the user explicitly choose a new record from unresolved matching", async () => {
    const { note, memories, plan } = fixture("existing-reaction");
    const save = vi.fn().mockResolvedValue(true);
    render(
      <CaptureReview
        plan={validatePlan(plan, memories, true, note)}
        text={note}
        memories={memories}
        onSave={save}
        onCancel={() => {}}
      />,
    );
    expect(screen.getByLabelText("Save to")).toHaveValue("__unresolved__");
    fireEvent.change(screen.getByLabelText("Save to"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Save 1 entry" }));
    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    const next = applyCapturePlan(memories, save.mock.calls[0]![0], note);
    expect(next).toHaveLength(2);
    expect(next.find((memory) => memory.id === memories[0]!.id)).toEqual(memories[0]);
  });
});
