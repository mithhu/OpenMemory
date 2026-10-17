import { z } from "zod";
import { CATEGORIES } from "./memory";
import adviceContract from "../../scripts/app-mlx/classification_advice_v4.json";
import { capturePlanSchema, type CapturePlan } from "./capture-plan";
import { legacyClassificationAdviceSchema } from "./classification-contract-v3";
export {
  CLASSIFICATION_CATEGORIES,
  classificationInstructions,
  classificationJson,
  classificationPolicyInstructions,
} from "./classification-contract-v3";

// App advice v4 is distinct from the frozen v3 model/wire contract. No weights
// or evaluated prompts are silently migrated by changing this version.
export const classificationContractVersion = 4 as const;
// Development prompt for qualification, not a replacement for the pinned
// adapters' v3 prompt. Runtime callers continue to import classificationInstructions.
export const classificationAdviceJson = adviceContract.schema;
export const classificationAdviceInstructions = `${adviceContract.instructions}\nJSON schema: ${JSON.stringify(classificationAdviceJson)}`;
export const CLASSIFICATION_INTENTS = [
  "none",
  "wishlist",
  "start",
  "progress",
  "complete",
  "listen",
  "reaction",
  "mixed",
] as const;
export const CLARIFICATION_REASONS = [
  "missing_identity",
  "missing_action",
  "unresolved_reference",
  "legacy_uncertainty",
] as const;
export const clarificationReasonLabels = {
  missing_identity: "Which work or subject did you mean?",
  missing_action: "What happened, or what do you want to do?",
  unresolved_reference: "What does the reference in your note refer to?",
  legacy_uncertainty:
    "The classifier is unsure which detail is missing. Check the original words and the extracted entry.",
} as const;

export const APP_CLASSIFICATION_CATEGORIES = [...CATEGORIES, "MIXED"] as const;
export const classificationAdviceSchema = z
  .object({
    category: z.enum(APP_CLASSIFICATION_CATEGORIES),
    intent: z.enum(CLASSIFICATION_INTENTS).nullable(),
    clarificationReasons: z.array(z.enum(CLARIFICATION_REASONS)).max(4),
  })
  .strict()
  .superRefine((value, ctx) => {
    if ((value.category === "MIXED") !== (value.intent === "mixed"))
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Mixed category and intent must agree",
      });
    if (new Set(value.clarificationReasons).size !== value.clarificationReasons.length)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Clarification reasons must be unique",
      });
    if (value.intent === null && value.clarificationReasons.length === 0)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "An unknown action needs a clarification reason",
      });
    if (value.clarificationReasons.includes("missing_action") && value.intent !== null)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A missing action cannot also be known",
      });
  });
export type ClassificationAdvice = z.infer<typeof classificationAdviceSchema>;

// Explicit, loss-aware compatibility: v3 clarify does not tell us whether a
// title, action or reference is missing. Never infer that from keywords or an ID.
export function normalizeClassificationAdvice(raw: unknown): ClassificationAdvice {
  const current = classificationAdviceSchema.safeParse(raw);
  if (current.success) return current.data;
  const legacy = legacyClassificationAdviceSchema.parse(raw);
  return classificationAdviceSchema.parse({
    category: legacy.category,
    intent: legacy.intent === "clarify" ? null : legacy.intent,
    clarificationReasons: legacy.intent === "clarify" ? ["legacy_uncertainty"] : [],
  });
}
export type ClassificationMetadata = Readonly<{
  contractVersion: 4;
  source: string;
  advice: Readonly<ClassificationAdvice>;
}>;
export function associateClassification(source: string, raw: unknown): ClassificationMetadata {
  if (!source.trim() || source.length > 16000) throw new Error("Invalid classification source");
  const advice = normalizeClassificationAdvice(raw);
  Object.freeze(advice.clarificationReasons);
  return Object.freeze({
    contractVersion: classificationContractVersion,
    source,
    advice: Object.freeze(advice),
  });
}
export type ClassificationConflict = Readonly<{
  kind: "type" | "intent" | "clarify" | "mixed-coverage";
  message: string;
}>;
// This only assesses a whole-source plan. It never applies advice to entries,
// changes extraction, resolves a conflict, or grants permission to persist.
export function assessClassification(
  plan: CapturePlan,
  metadata: ClassificationMetadata,
  source: string,
): { conflicts: ClassificationConflict[]; reviewRequired: true } {
  if (metadata.contractVersion !== classificationContractVersion || metadata.source !== source)
    throw new Error("Classification advice belongs to a different source or contract");
  const advice = classificationAdviceSchema.parse(metadata.advice);
  const conflicts: ClassificationConflict[] = [];
  if (advice.category === "MIXED") {
    conflicts.push({
      kind: "mixed-coverage",
      message:
        plan.entries.length < 2
          ? "Your note may contain separate events. Add or review the missing events before confirming coverage."
          : "Check that every independent event in your original words is represented. Entry count alone cannot confirm coverage.",
    });
  } else if (plan.entries.length === 1) {
    const entry = plan.entries[0]!;
    if (entry.category !== advice.category)
      conflicts.push({
        kind: "type",
        message:
          entry.category === "SERIES"
            ? "The installed fine-tuned classifier predates TV series support. Review the series type from your original words; its older label is not authoritative."
            : "The suggested type differs from the extracted entry. Choose the type deliberately.",
      });
    // An unknown action has no ActivityCommand equivalent. Missing identity
    // does not erase a known action or substitute a title/catalog match.
    // Non-media wishes encode their future intent in the WISHLIST category;
    // they deliberately have no media ActivityCommand.
    const extractedIntent =
      entry.activity?.intent ?? (entry.category === "WISHLIST" ? "wishlist" : undefined);
    if (advice.intent !== null && advice.intent !== "none" && extractedIntent !== advice.intent)
      conflicts.push({
        kind: "intent",
        message:
          "The suggested action differs from the extracted entry. Check whether this was planned, started, progress, completed, or an opinion.",
      });
    if (advice.intent === "none" && entry.activity)
      conflicts.push({
        kind: "intent",
        message:
          "Classification suggests an ordinary fact while extraction proposes a tracked activity. Review the action without transferring its quantities.",
      });
  }
  if (advice.clarificationReasons.length > 0)
    conflicts.push({
      kind: "clarify",
      message: advice.clarificationReasons
        .map((reason) => clarificationReasonLabels[reason])
        .join(" "),
    });
  return { conflicts, reviewRequired: true };
}

export type ClassificationReviewDecision = Readonly<{
  source: string;
  metadata: ClassificationMetadata;
  reviewedPlan: CapturePlan;
  conflictsAcknowledged: boolean;
}>;

function freezeReviewValue<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) freezeReviewValue(child);
    Object.freeze(value);
  }
  return value;
}

// Capture the exact proposal the user reviewed, excluding editor-only keys.
// This is evidence of review, not permission to alter identity or arithmetic.
export function recordClassificationReview(
  plan: CapturePlan,
  source: string,
  metadata: ClassificationMetadata,
  conflictsAcknowledged: boolean,
): ClassificationReviewDecision {
  const decision = {
    source,
    metadata: associateClassification(source, metadata.advice),
    reviewedPlan: freezeReviewValue(capturePlanSchema.parse(plan)),
    conflictsAcknowledged,
  };
  assertClassificationReview(plan, source, metadata, decision);
  return Object.freeze(decision);
}

export function assertClassificationReview(
  plan: CapturePlan,
  source: string,
  metadata?: ClassificationMetadata,
  decision?: ClassificationReviewDecision,
): void {
  if (!metadata) {
    if (decision) throw new Error("Classification review has no corresponding advice.");
    return;
  }
  const assessment = assessClassification(plan, metadata, source);
  if (
    !decision ||
    decision.source !== source ||
    decision.metadata.source !== source ||
    decision.metadata.contractVersion !== metadata.contractVersion ||
    JSON.stringify(classificationAdviceSchema.parse(decision.metadata.advice)) !==
      JSON.stringify(classificationAdviceSchema.parse(metadata.advice)) ||
    JSON.stringify(capturePlanSchema.parse(decision.reviewedPlan)) !==
      JSON.stringify(capturePlanSchema.parse(plan))
  )
    throw new Error("Classification review belongs to a different source, advice or proposal.");
  if (assessment.conflicts.length > 0 && decision.conflictsAcknowledged !== true)
    throw new Error("Review the classification differences before saving.");
}
