import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import {
  classificationInstructions,
  classificationJson,
  legacyClassificationContractVersion,
} from "../lib/classification-contract-v3";
import {
  associateClassification,
  assessClassification,
  classificationAdviceSchema,
  recordClassificationReview,
  assertClassificationReview,
} from "../lib/classification";
import type { CapturePlan } from "../lib/capture-plan";

const source = "I want to watch a movie this weekend.";
const plan = (): CapturePlan => ({
  entries: [
    {
      category: "MOVIE",
      title: "A film to choose",
      summary: source,
      date: "2026-10-16",
      matchedMemoryId: null,
      candidateMemoryIds: [],
      tags: [],
      clarificationQuestion: "Which film?",
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
    },
  ],
});
const knownAction = {
  category: "MOVIE",
  intent: "wishlist",
  clarificationReasons: ["missing_identity"],
};

describe("v4 action and clarification handoff", () => {
  it("keeps the model prompt and schema identical to the pinned Python v3 contract", () => {
    const python = JSON.parse(
      execFileSync("python3", ["scripts/app-mlx/classification_contract.py"], { encoding: "utf8" }),
    );
    expect(python.version).toBe(legacyClassificationContractVersion);
    expect(python.instructions).toBe(classificationInstructions);
    expect(python.schema).toEqual(classificationJson);
  });
  it("retains a known planned action while asking only about identity", () => {
    const advice = associateClassification(source, knownAction);
    expect(advice.contractVersion).toBe(4);
    expect(advice.advice.intent).toBe("wishlist");
    const proposal = plan();
    const before = structuredClone(proposal);
    expect(assessClassification(proposal, advice, source).conflicts).toEqual([
      { kind: "clarify", message: "Which work or subject did you mean?" },
    ]);
    expect(proposal).toEqual(before);
    expect(proposal.entries[0]!.activity!.intent).toBe("wishlist");
    expect(proposal.entries[0]!.clarificationQuestion).toBe("Which film?");
  });
  it("still detects an action disagreement even when identity is missing", () => {
    const proposal = plan();
    proposal.entries[0]!.activity!.intent = "complete";
    expect(
      assessClassification(
        proposal,
        associateClassification(source, knownAction),
        source,
      ).conflicts.map((c) => c.kind),
    ).toEqual(["intent", "clarify"]);
  });
  it("migrates old clarify without pretending to know which detail is missing", () => {
    const advice = associateClassification(source, { category: "MOVIE", intent: "clarify" });
    expect(advice.advice).toEqual({
      category: "MOVIE",
      intent: null,
      clarificationReasons: ["legacy_uncertainty"],
    });
    const proposal = plan();
    expect(assessClassification(proposal, advice, source).conflicts.map((c) => c.kind)).toEqual([
      "clarify",
    ]);
    expect(advice.advice.intent).toBeNull(); // Extractor cannot silently backfill classifier advice.
    expect(proposal.entries[0]!.activity!.intent).toBe("wishlist");
  });
  it("migrates unambiguous v3 action labels losslessly", () => {
    expect(
      associateClassification(source, { category: "MOVIE", intent: "wishlist" }).advice,
    ).toEqual({ category: "MOVIE", intent: "wishlist", clarificationReasons: [] });
  });
  it.each([
    { category: "BOOK", intent: null, clarificationReasons: [] },
    { category: "BOOK", intent: "complete", clarificationReasons: ["missing_action"] },
    { category: "BOOK", intent: "clarify", clarificationReasons: ["missing_identity"] },
    { category: "MIXED", intent: null, clarificationReasons: ["missing_action"] },
    { category: "NOTE", intent: "mixed", clarificationReasons: [] },
    { ...knownAction, clarificationReasons: ["missing_identity", "missing_identity"] },
    { ...knownAction, clarificationReasons: ["guess_title"] },
    { ...knownAction, matchedMemoryId: "invented" },
    { ...knownAction, intent: null, clarificationReasons: "missing_action" },
  ])("rejects contradictory or authority-bearing advice: %j", (raw) => {
    expect(() => associateClassification(source, raw)).toThrow();
  });
  it("represents missing identity and missing action together without a persistence command", () => {
    const advice = classificationAdviceSchema.parse({
      category: "BOOK",
      intent: null,
      clarificationReasons: ["missing_identity", "missing_action"],
    });
    expect(advice.intent).toBeNull();
    expect(advice).not.toHaveProperty("activity");
  });
  it("binds review to the clarification reasons as well as the action", () => {
    const proposal = plan();
    const advice = associateClassification(source, knownAction);
    expect(Object.isFrozen(advice.advice.clarificationReasons)).toBe(true);
    expect(() => recordClassificationReview(proposal, source, advice, false)).toThrow(
      "differences",
    );
    const decision = recordClassificationReview(proposal, source, advice, true);
    expect(() => assertClassificationReview(proposal, source, advice, decision)).not.toThrow();
    const changed = associateClassification(source, {
      ...knownAction,
      clarificationReasons: ["unresolved_reference"],
    });
    expect(() => assertClassificationReview(proposal, source, changed, decision)).toThrow("advice");
  });
});
