import { describe, expect, it } from "vitest";
import { CATEGORIES } from "@/lib/memory";
import { capturePlanSchema, type CapturePlan } from "@/lib/capture-plan";
import {
  associateClassification,
  assessClassification,
  assertClassificationReview,
  recordClassificationReview,
} from "@/lib/classification";

const source = "  Read 17 more pages of the novel Glass Orchard.\n";
const makePlan = (): CapturePlan => ({
  entries: [
    {
      title: "Glass Orchard",
      summary: source,
      category: "BOOK",
      date: "2026-10-10",
      matchedMemoryId: "actual-book-id",
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
    },
  ],
});

describe("Classification is source-bound review advice", () => {
  it.each([
    { category: "BOOK", intent: "progress", title: "Invented" },
    { category: "BOOK", intent: "progress", matchedMemoryId: "wrong" },
    { category: "BOOK", intent: "progress", progress: 400 },
    { category: "MIXED", intent: "none" },
    { category: "BOOK", intent: "mixed" },
    { category: "unknown", intent: "none" },
  ])("rejects extra extraction fields and inconsistent labels: %j", (raw) => {
    expect(() => associateClassification(source, raw)).toThrow();
  });
  it("preserves original spacing and cannot reuse advice for edited source", () => {
    const metadata = associateClassification(source, { category: "BOOK", intent: "progress" });
    expect(metadata.source).toBe(source);
    expect(() => assessClassification(makePlan(), metadata, source.trim())).toThrow(
      "different source",
    );
    expect(() =>
      assessClassification(makePlan(), { ...metadata, contractVersion: 2 } as never, source),
    ).toThrow("contract");
  });
  it("assesses disagreements without changing title, IDs, quantity mode or source", () => {
    const plan = makePlan();
    const before = structuredClone(plan);
    const metadata = associateClassification(source, { category: "MUSIC", intent: "wishlist" });
    const result = assessClassification(plan, metadata, source);
    expect(result.conflicts.map((c) => c.kind)).toEqual(["type", "intent"]);
    expect(result.reviewRequired).toBe(true);
    expect(plan).toEqual(before);
    expect(metadata.source).toBe(source);
  });
  it("matching advice still grants no permission to save", () => {
    const metadata = associateClassification(source, { category: "BOOK", intent: "progress" });
    expect(assessClassification(makePlan(), metadata, source)).toEqual({
      conflicts: [],
      reviewRequired: true,
    });
  });
  it("keeps missing-identity clarification unresolved despite an extracted ID", () => {
    const metadata = associateClassification(source, { category: "BOOK", intent: "clarify" });
    expect(assessClassification(makePlan(), metadata, source).conflicts[0]?.kind).toBe("clarify");
    expect(makePlan().entries[0]?.matchedMemoryId).toBe("actual-book-id");
  });
  it("does not distribute whole-note categories across multiple extracted entries", () => {
    const plan = makePlan();
    plan.entries.push({ ...plan.entries[0]!, category: "PERSON", activity: null });
    const before = structuredClone(plan);
    const metadata = associateClassification(source, { category: "NOTE", intent: "none" });
    expect(assessClassification(plan, metadata, source).conflicts).toEqual([]);
    expect(plan).toEqual(before);
  });
  it.each([1, 2])(
    "requires deliberate mixed coverage review with %i extracted entries",
    (count) => {
      const plan = makePlan();
      if (count === 2) plan.entries.push({ ...plan.entries[0]! });
      const metadata = associateClassification(source, { category: "MIXED", intent: "mixed" });
      expect(assessClassification(plan, metadata, source).conflicts[0]?.kind).toBe(
        "mixed-coverage",
      );
      expect(CATEGORIES as readonly string[]).not.toContain("MIXED");
    },
  );
});

describe("Review evidence is checked again before applying a plan", () => {
  it("rejects absent review evidence even when advice agrees", () => {
    const metadata = associateClassification(source, { category: "BOOK", intent: "progress" });
    expect(() => assertClassificationReview(makePlan(), source, metadata)).toThrow("different");
  });
  it("requires deliberate conflict acknowledgment and snapshots exact reviewed quantities", () => {
    const plan = makePlan();
    const metadata = associateClassification(source, { category: "MUSIC", intent: "wishlist" });
    expect(() => recordClassificationReview(plan, source, metadata, false)).toThrow("differences");
    const decision = recordClassificationReview(plan, source, metadata, true);
    expect(() => assertClassificationReview(plan, source, metadata, decision)).not.toThrow();
    expect(decision.reviewedPlan).toEqual(capturePlanSchema.parse(plan));
    expect(decision.source).toBe(source);
    expect(plan.entries[0]!.summary).toBe(source);
    expect(Object.isFrozen(decision.reviewedPlan.entries[0]!.activity)).toBe(true);
    plan.entries[0]!.activity!.progress = 400;
    expect(decision.reviewedPlan.entries[0]!.activity!.progress).toBe(17);
    expect(() => assertClassificationReview(plan, source, metadata, decision)).toThrow("proposal");
  });
  it.each(["quantity", "identity", "type", "date"])(
    "does not reuse acknowledgment after a %s change",
    (change) => {
      const plan = makePlan();
      const metadata = associateClassification(source, { category: "BOOK", intent: "progress" });
      const decision = recordClassificationReview(plan, source, metadata, false);
      const entry = plan.entries[0]!;
      if (change === "quantity") entry.activity!.progressMode = "absolute";
      if (change === "identity") entry.matchedMemoryId = "different-book-id";
      if (change === "type") entry.category = "MOVIE";
      if (change === "date") entry.date = "2026-10-09";
      expect(() => assertClassificationReview(plan, source, metadata, decision)).toThrow(
        "proposal",
      );
    },
  );
  it("rejects reviewed evidence from a different source or advice", () => {
    const plan = makePlan();
    const metadata = associateClassification(source, { category: "BOOK", intent: "progress" });
    const decision = recordClassificationReview(plan, source, metadata, false);
    const changedSource = `${source} `;
    const newMetadata = associateClassification(changedSource, metadata.advice);
    expect(() => assertClassificationReview(plan, changedSource, newMetadata, decision)).toThrow();
    expect(() =>
      assertClassificationReview(
        plan,
        source,
        associateClassification(source, { category: "BOOK", intent: "clarify" }),
        decision,
      ),
    ).toThrow("advice");
  });
  it("retains the legacy flow while refusing unsolicited review evidence", () => {
    const plan = makePlan();
    expect(() => assertClassificationReview(plan, source)).not.toThrow();
    const metadata = associateClassification(source, { category: "BOOK", intent: "progress" });
    const decision = recordClassificationReview(plan, source, metadata, false);
    expect(() => assertClassificationReview(plan, source, undefined, decision)).toThrow(
      "corresponding",
    );
  });
});
