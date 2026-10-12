import { readFileSync } from "node:fs";
import { webcrypto } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { applyCapturePlan, validatePlan } from "../lib/capture-plan";
import { memorySchema } from "../lib/memory";
import { interpretCaptureTitles } from "../lib/title-interpretation";

// Replay frozen fictional responses against the final guards, without inference.
const directory = "src/test/fixtures/title-fresh";
const report = JSON.parse(readFileSync(`${directory}/responses.json`, "utf8"));
const cases = JSON.parse(readFileSync(`${directory}/cases.json`, "utf8")) as Array<{
  id: string;
  note: string;
  memories?: unknown[];
  expectedSavedProgress?: number;
}>;
const blocked = new Set([
  "quoted-punctuation",
  "catalog-typo",
  "duplicate-same-kind",
  "unknown-preserved",
]);
beforeEach(() => {
  vi.stubGlobal("crypto", webcrypto);
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("Offline replay cannot use the network");
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

it.each(cases)("final guards preserve the recorded outcome for $id", async (scenario) => {
  const row = report.rows.find((item: { id: string }) => item.id === scenario.id);
  const responses = row.calls
    .filter((call: { endpoint: string }) => call.endpoint.endsWith("/chat"))
    .map((call: { rawResponse: string }) =>
      JSON.parse(JSON.parse(call.rawResponse).message.content),
    );
  const memories = memorySchema.array().parse(scenario.memories ?? []);
  const original = structuredClone(memories);
  const extraction = validatePlan(responses[0], memories, true, scenario.note);
  const plan = await interpretCaptureTitles(extraction, scenario.note, memories, async () => {
    expect(responses).toHaveLength(2);
    return responses[1];
  });
  if (blocked.has(scenario.id)) {
    expect(() => applyCapturePlan(memories, plan, scenario.note)).toThrow();
    if (scenario.id === "quoted-punctuation") {
      expect(plan.entries[0]).toMatchObject({
        matchedMemoryId: null,
        candidateMemoryIds: ["fictional-existing-book"],
        titleReviewRequired: true,
      });
    }
    if (scenario.id === "catalog-typo") {
      expect(plan.entries[0]?.titleSuggestion).toMatchObject({
        sourceTitle: "Copper Orchrard",
        suggestedTitle: "Copper Orchard",
        decision: "pending",
      });
    }
  } else {
    const next = applyCapturePlan(memories, plan, scenario.note);
    if (scenario.expectedSavedProgress !== undefined) {
      expect(next).toHaveLength(memories.length);
      const target = next.find((memory) => memory.id === "fictional-existing-book")!;
      expect(target.activity?.progress).toBe(scenario.expectedSavedProgress);
      for (const memory of memories.filter((item) => item.id !== target.id))
        expect(next.find((item) => item.id === memory.id)).toEqual(memory);
      if (scenario.id === "repeated-new-wording") expect(target.activity?.history).toHaveLength(2);
    } else {
      expect(plan.entries).toHaveLength(1);
      expect(plan.entries[0]).toMatchObject({
        category: "NOTE",
        activity: null,
        matchedMemoryId: null,
      });
      expect(next).toHaveLength(memories.length + 1);
      for (const memory of memories)
        expect(next.find((item) => item.id === memory.id)).toEqual(memory);
    }
  }
  expect(memories).toEqual(original);
  expect(fetch).not.toHaveBeenCalled();
});
