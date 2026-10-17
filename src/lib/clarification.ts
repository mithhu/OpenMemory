import { z } from "zod";

// Extraction/review reasons, independent of the legacy classifier's opaque clarify label.
export const DETAIL_REASONS = [
  "missing_identity",
  "missing_action",
  "unresolved_reference",
] as const;
export type DetailReason = (typeof DETAIL_REASONS)[number];
export const detailReasonsSchema = z
  .array(z.enum(DETAIL_REASONS))
  .max(3)
  .refine((reasons) => new Set(reasons).size === reasons.length, "Missing details must be unique");
export const detailQuestions: Record<DetailReason, string> = {
  missing_identity: "Which work or subject did you mean?",
  missing_action:
    "What happened: planned, started, partial progress, finished, or only an opinion?",
  unresolved_reference: "What does the reference in your note refer to?",
};
export const hasIdentityQuestion = (reasons: readonly DetailReason[] = []) =>
  reasons.includes("missing_identity") || reasons.includes("unresolved_reference");

// Called only after a deliberate field edit, never to infer meaning from source words.
export function resolveDetails(
  reasons: readonly DetailReason[] | undefined,
  resolved: readonly DetailReason[],
) {
  return reasons?.filter((reason) => !resolved.includes(reason));
}
