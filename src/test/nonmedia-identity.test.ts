import { describe, expect, it } from "vitest";
import { applyCapturePlan, validatePlan, type CaptureEntry } from "@/lib/capture-plan";
import type { Category } from "@/lib/memory";

const entry = (
  category: Category,
  title: string,
  matchedMemoryId: string | null = null,
): CaptureEntry => ({
  title,
  category,
  matchedMemoryId,
  summary: `${title}: fictional original fact`,
  date: "2026-10-10",
  candidateMemoryIds: [],
  clarificationQuestion: null,
  tags: [],
  activity: null,
});
describe("Non-media model IDs require explicit identity review", () => {
  it.each([
    { category: "PERSON", original: "John is my best friend", source: "Mary is my best friend" },
    { category: "IDEA", original: "Idea for a tidal clock", source: "Idea for a roof garden lamp" },
    {
      category: "GOAL",
      original: "Qualify as a marine surveyor",
      source: "Save enough for a permanent home",
    },
    {
      category: "WISHLIST",
      original: "Visit the fern conservatory",
      source: "Buy a small telescope",
    },
  ] as const)(
    "does not trust a model-selected $category ID to rename and merge another subject",
    ({ category, original, source }) => {
      const saved = applyCapturePlan([], { entries: [entry(category, original)] }, original);
      const before = structuredClone(saved);
      const proposal = entry(category, source, saved[0]!.id);
      const plan = validatePlan({ entries: [proposal] }, saved, true, source);
      expect(plan.entries[0]!.matchedMemoryId).toBeNull();
      expect(plan.entries[0]!.candidateMemoryIds).toEqual([saved[0]!.id]);
      expect(plan.entries[0]!.clarificationQuestion).toContain("existing memory");
      expect(() => applyCapturePlan(saved, plan, source)).toThrow("Choose");
      expect(saved).toEqual(before);
      expect(plan.entries[0]!.title).toBe(source);
      expect(plan.entries[0]!.summary).toBe(proposal.summary);
    },
  );
  it("preserves known supplied candidates, filtering invented IDs, without substring identity guesses", () => {
    const saved = applyCapturePlan(
      [],
      {
        entries: [
          entry("PERSON", "John is my best friend"),
          entry("PERSON", "Mary from the garden club"),
        ],
      },
      "Fictional person notes",
    );
    const proposal = entry("PERSON", "Mary is my best friend", saved[0]!.id);
    proposal.candidateMemoryIds = [saved[1]!.id, "invented-id", saved[1]!.id];
    const plan = validatePlan({ entries: [proposal] }, saved, true, "Mary is my best friend");
    expect(new Set(plan.entries[0]!.candidateMemoryIds)).toEqual(new Set(saved.map((m) => m.id)));
    expect(plan.entries[0]!.matchedMemoryId).toBeNull();
  });
  it("requires review even with an identical descriptive non-media title", () => {
    const saved = applyCapturePlan(
      [],
      { entries: [entry("GOAL", "Move closer to family")] },
      "Fictional original goal",
    );
    const plan = validatePlan(
      { entries: [entry("GOAL", saved[0]!.title, saved[0]!.id)] },
      saved,
      true,
      "Move closer to family",
    );
    expect(plan.entries[0]!.matchedMemoryId).toBeNull();
    expect(plan.entries[0]!.candidateMemoryIds).toEqual([saved[0]!.id]);
  });
  it("allows deliberate reviewed updating and a deliberate new-memory choice", () => {
    const saved = applyCapturePlan(
      [],
      { entries: [entry("PERSON", "John is my best friend")] },
      "John is my best friend",
    );
    const source = "Mary is my best friend";
    const plan = validatePlan(
      { entries: [entry("PERSON", source, saved[0]!.id)] },
      saved,
      true,
      source,
    );
    const confirmed = structuredClone(plan);
    confirmed.entries[0]!.matchedMemoryId = saved[0]!.id;
    confirmed.entries[0]!.candidateMemoryIds = [];
    const updated = applyCapturePlan(saved, confirmed, source);
    expect(updated).toHaveLength(1);
    expect(updated[0]!.id).toBe(saved[0]!.id);
    expect(updated[0]!.title).toBe(source);
    expect(updated[0]!.transcripts).toEqual(["John is my best friend", source]);
    const fresh = structuredClone(plan);
    fresh.entries[0]!.candidateMemoryIds = [];
    const separate = applyCapturePlan(saved, fresh, source);
    expect(separate).toHaveLength(2);
    expect(separate.find((m) => m.id === saved[0]!.id)).toEqual(saved[0]);
  });
});
