import { z } from "zod";
import {
  titleSpansJson,
  titleSpansInstructions,
  spanCorrections,
  validateTitleEvidence,
  hasOriginalTitleSpan,
} from "./title-evidence";
import type { Memory } from "./memory";
import type { CapturePlan } from "./capture-plan";

export const titleSuggestionSchema = z.object({
  sourceTitle: z.string().trim().min(1).max(300),
  suggestedTitle: z.string().trim().min(1).max(300),
  basis: z.enum(["catalog", "model"]),
  catalogMemoryId: z.string().nullable(),
  decision: z.enum(["pending", "accepted", "original"]).default("pending"),
});
export type TitleSuggestion = z.infer<typeof titleSuggestionSchema>;

export const titleInterpretationJson = titleSpansJson;
export const titleCorrectionsSchema = z.object({
  corrections: z
    .array(
      z.object({
        entryIndex: z.number().int().min(0).max(7),
        sourceTitle: z.string().trim().min(1).max(300),
        suggestedTitle: z.string().trim().min(1).max(300),
      }),
    )
    .max(8),
});
export const titleCorrectionInstructions = titleSpansInstructions;

export async function interpretCaptureTitles(
  plan: CapturePlan,
  note: string,
  memories: Memory[],
  request: (
    instructions: string,
    input: unknown,
    schema: Record<string, unknown>,
  ) => Promise<unknown>,
): Promise<CapturePlan> {
  if (!plan.entries.some((entry) => entry.activity)) return plan;
  const raw = await request(
    titleCorrectionInstructions,
    {
      note,
      entries: plan.entries.map((entry, entryIndex) => ({
        entryIndex,
        title: entry.title,
        kind: entry.activity?.kind ?? null,
      })),
      catalog: memories
        .filter((m) => m.activity)
        .map((m) => ({ title: m.title, kind: m.activity!.kind })),
    },
    titleInterpretationJson,
  );
  try {
    const next = attachTitleCorrections(
      spanCorrections(
        raw,
        plan.entries.map((_, index) => index),
        note,
        plan.entries.flatMap((entry, index) => (entry.activity ? [] : [index])),
      ),
      plan,
      note,
      memories,
    );
    const rows = validateTitleEvidence(
      raw,
      plan.entries.map((_, index) => index),
      note,
      plan.entries.flatMap((entry, index) => (entry.activity ? [] : [index])),
    );
    const identity = (title: string) => title.normalize("NFKC").trim().toLocaleLowerCase();
    for (const row of rows) {
      const entry = next.entries[row.entryIndex]!;
      if (!entry.activity || entry.titleSuggestion) continue;
      // A missing source or a different subject's unchanged title is not evidence
      // for this entry, even when its extracted title happens to occur in the note.
      if (row.sourceTitle === null || identity(row.sourceTitle) !== identity(entry.title))
        entry.titleReviewRequired = true;
    }
    return next;
  } catch {
    // Extraction already passed validation. Invalid title evidence must never
    // apply a correction or target a saved item, but can still be reviewed.
    // Request failures/cancellation occur above this block and propagate.
    return {
      entries: plan.entries.map((entry) =>
        entry.activity
          ? {
              ...entry,
              titleSuggestion: null,
              titleReviewRequired: true,
              matchedMemoryId: null,
              // Keep validated review choices when title evidence fails. They
              // remain suggestions, never an automatic update target.
              candidateMemoryIds: entry.candidateMemoryIds.filter((id) =>
                memories.some((memory) => memory.id === id && memory.activity),
              ),
              clarificationQuestion:
                entry.clarificationQuestion ??
                "The AI title check couldn't verify this title. Review it before saving.",
            }
          : { ...entry },
      ),
    };
  }
}

export function attachTitleCorrections(
  raw: unknown,
  plan: CapturePlan,
  note: string,
  memories: Memory[],
): CapturePlan {
  const result = titleCorrectionsSchema.parse(raw);
  const next: CapturePlan = { entries: plan.entries.map((entry) => ({ ...entry })) };
  const seen = new Set<number>();
  for (const correction of result.corrections) {
    const entry = next.entries[correction.entryIndex];
    if (!entry?.activity || seen.has(correction.entryIndex))
      throw new Error(
        "The model's title suggestion referred to an invalid entry. Please try again.",
      );
    // Bind the source span to this entry, not merely to somewhere in a mixed note.
    // Extraction may already have used the canonical title. This is exact identity
    // validation, not a spelling correction algorithm or fuzzy title match.
    const identity = (title: string) => title.normalize("NFKC").trim().toLocaleLowerCase();
    const extracted = identity(entry.title);
    if (
      extracted !== identity(correction.sourceTitle) &&
      extracted !== identity(correction.suggestedTitle)
    )
      throw new Error(
        "The title suggestion didn't match this entry. Review the titles manually or try again.",
      );
    seen.add(correction.entryIndex);
    const matches = memories.filter(
      (m) => m.activity?.kind === entry.activity!.kind && m.title === correction.suggestedTitle,
    );
    const suggestion: TitleSuggestion = {
      sourceTitle: correction.sourceTitle,
      suggestedTitle: correction.suggestedTitle,
      basis: matches.length === 1 ? "catalog" : "model",
      catalogMemoryId: matches.length === 1 ? matches[0]!.id : null,
      decision: "pending",
    };
    entry.titleSuggestion = validateTitleSuggestion(
      suggestion,
      correction.suggestedTitle,
      entry.activity.kind,
      note,
      memories,
    );
    entry.title = correction.suggestedTitle;
    entry.matchedMemoryId = null;
    entry.candidateMemoryIds = [];
    entry.clarificationQuestion = null;
    entry.titleReviewRequired = false;
  }
  return next;
}

// These are structural/source checks, not spelling rules or fuzzy matching.
export function validateTitleSuggestion(
  suggestion: TitleSuggestion,
  title: string,
  kind: string | undefined,
  note: string,
  memories: Memory[],
): TitleSuggestion {
  if (!kind || !hasOriginalTitleSpan(note, suggestion.sourceTitle))
    throw new Error(
      "The title suggestion wasn't grounded in your words. Try again or edit your note.",
    );
  if (suggestion.suggestedTitle !== title || suggestion.sourceTitle === suggestion.suggestedTitle)
    throw new Error("The proposed title correction was inconsistent. Please try again.");
  if (suggestion.basis === "catalog") {
    const memory = memories.find((m) => m.id === suggestion.catalogMemoryId);
    if (!memory || memory.activity?.kind !== kind || memory.title !== suggestion.suggestedTitle)
      throw new Error("The suggested title didn't match a saved item. Please try again.");
  } else if (suggestion.catalogMemoryId !== null) {
    throw new Error("An unverified title suggestion cannot claim a saved item.");
  }
  return { ...suggestion, decision: "pending" };
}
