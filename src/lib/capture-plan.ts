import { z } from "zod";
import { CATEGORIES, memorySchema, today, type Memory } from "./memory";
import {
  activityCommandSchema,
  activityCategories,
  applyActivity,
  needsProgressEvidence,
} from "./activity";
import { array, object, string, nullable, grounding } from "./ai-protocol";
import { titleSuggestionSchema, validateTitleSuggestion } from "./title-interpretation";
import { hasOriginalTitleSpan } from "./title-evidence";

export const captureEntrySchema = z.object({
  title: z.string().trim().min(1).max(300),
  summary: z.string().trim().min(1).max(12000),
  category: z.enum(CATEGORIES),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  matchedMemoryId: z.string().nullable(),
  candidateMemoryIds: z.array(z.string()).max(10),
  clarificationQuestion: z.string().max(1000).nullable(),
  tags: z.array(z.string().max(60)).max(5),
  activity: activityCommandSchema.nullable(),
  titleSuggestion: titleSuggestionSchema.nullable().optional(),
  titleReviewRequired: z.boolean().optional(),
  intentReviewRequired: z.boolean().optional(),
});
export const capturePlanSchema = z.object({ entries: z.array(captureEntrySchema).min(1).max(8) });
export type CaptureEntry = z.infer<typeof captureEntrySchema>;
export type CapturePlan = z.infer<typeof capturePlanSchema>;
export type UnquantifiedProgressReview = Readonly<{
  source: string;
  reviewedPlanJson: string;
  acknowledgedEntries: readonly number[];
}>;
const issuedProgressReviews = new WeakSet<UnquantifiedProgressReview>();
export function recordUnquantifiedProgressReview(
  plan: CapturePlan,
  source: string,
): UnquantifiedProgressReview {
  const parsed = capturePlanSchema.parse(plan);
  const indices = parsed.entries.flatMap((entry, index) =>
    entry.activity && needsProgressEvidence(entry.activity) ? [index] : [],
  );
  if (
    !source.trim() ||
    !indices.length ||
    indices.some((index) => parsed.entries[index]!.intentReviewRequired)
  )
    throw new Error("Choose and confirm the partial-work action before recording review.");
  const review = Object.freeze({
    source,
    reviewedPlanJson: JSON.stringify(parsed),
    acknowledgedEntries: Object.freeze(indices),
  });
  issuedProgressReviews.add(review);
  return review;
}
export function assertUnquantifiedProgressReview(
  plan: CapturePlan,
  source: string,
  review?: UnquantifiedProgressReview,
): void {
  if (!review) return;
  if (
    !issuedProgressReviews.has(review) ||
    review.source !== source ||
    review.reviewedPlanJson !== JSON.stringify(capturePlanSchema.parse(plan))
  )
    throw new Error(
      "Partial-work review belongs to different original words or entries. Confirm it again.",
    );
}
export type CompletionReview = Readonly<{
  source: string;
  reviewedPlanJson: string;
  acknowledgedEntries: readonly number[];
}>;
const issuedCompletionReviews = new WeakSet<CompletionReview>();
const completionIndices = (plan: CapturePlan) =>
  plan.entries.flatMap((entry, index) => (entry.activity?.intent === "complete" ? [index] : []));
export function recordCompletionReview(
  plan: CapturePlan,
  source: string,
  acknowledgedEntries: readonly number[],
): CompletionReview {
  const parsed = capturePlanSchema.parse(plan);
  const indices = completionIndices(parsed);
  if (
    !source.trim() ||
    !indices.length ||
    acknowledgedEntries.length !== indices.length ||
    indices.some(
      (index) =>
        !acknowledgedEntries.includes(index) || parsed.entries[index]!.intentReviewRequired,
    )
  )
    throw new Error("Explicitly confirm every completed work before recording review.");
  const review = Object.freeze({
    source,
    reviewedPlanJson: JSON.stringify(parsed),
    acknowledgedEntries: Object.freeze(indices),
  });
  issuedCompletionReviews.add(review);
  return review;
}
export function assertCompletionReview(
  plan: CapturePlan,
  source: string,
  review?: CompletionReview,
): void {
  const parsed = capturePlanSchema.parse(plan);
  const indices = completionIndices(parsed);
  if (
    review &&
    (!issuedCompletionReviews.has(review) ||
      review.source !== source ||
      review.reviewedPlanJson !== JSON.stringify(parsed) ||
      JSON.stringify(review.acknowledgedEntries) !== JSON.stringify(indices))
  )
    throw new Error(
      "Completion review belongs to different original words or entries. Confirm it again.",
    );
  if (indices.length && !review)
    throw new Error("Confirm that you finished each complete work before saving.");
}
const commandJson = object({
  kind: { type: "string", enum: ["movie", "book", "music", "course"] },
  intent: {
    type: "string",
    enum: ["wishlist", "start", "progress", "complete", "listen", "reaction"],
  },
  progress: { type: ["number", "null"] },
  progressMode: { type: "string", enum: ["absolute", "increment"] },
  total: { type: ["number", "null"] },
  lessonNumbers: array({ type: "integer" }),
  sentiment: { type: ["string", "null"], enum: ["loved", "neutral", "disliked", null] },
  creator: nullable,
});
const entryJsonFields = {
  title: string,
  summary: string,
  date: string,
  matchedMemoryId: nullable,
  candidateMemoryIds: array(string),
  clarificationQuestion: nullable,
  tags: array(string),
};
// Constrain category/activity together during generation. A trip or other
// ordinary wishlist cannot acquire a fabricated movie/book/course activity.
export const capturePlanJson = object({
  entries: array({
    anyOf: [
      object({
        ...entryJsonFields,
        category: { type: "string", enum: ["NOTE", "PERSON", "IDEA", "GOAL", "WISHLIST"] },
        activity: { type: "null" },
      }),
      ...Object.entries(activityCategories).map(([kind, category]) =>
        object({
          ...entryJsonFields,
          category: { type: "string", enum: [category] },
          activity: {
            anyOf: [
              object({ ...commandJson.properties, kind: { type: "string", enum: [kind] } }),
              { type: "null" },
            ],
          },
        }),
      ),
    ],
  }),
});
export const captureInstructions = (date: string) => `${grounding}
Interpret ordinary typing mistakes by meaning, preserving quantities, negation and intent. Keep original media/course title spellings in this extraction; a separate title interpretation step will propose corrections.
Today is ${date}. Extract 1 to 8 distinct events or intentions from the note. Never return an empty entries list for a meaningful note. Everyday experiences, including watching animals or nature, belong to NOTE with activity null; they are not discarded because they are not tracked media. One entry per distinct event, including separate repeated actions about the same subject; preserve all meaningful facts and names. Repeated actions stay in source order as separate entries, even when a later clause omits the verb. Never add their amounts together; the app accumulates them. Multiple descriptions or feelings about the same event remain one entry. The user reviews EVERY entry before saving.
IMPORTANT: Extract events ONLY from note. catalog is a read-only lookup table of existing subjects, NOT events to extract. Do not copy its previous progress, titles phrased as events, ratings or history into the new event. A note saying 20 more pages means progress 20 increment, regardless of the existing page. Partial reading is progress, never complete unless the note explicitly says finished.
Classify semantically, not by a verb alone. A named film watched or planned belongs to movie; a named book to book; a song/listen to music; a course/lecture to course. "Watched the sunset", "read the room", "finished my report" are everyday NOTE entries, not media. "Watch a movie" without a title needs a clarification question asking which film and whether watched or planned. Never silently put a clear media or course request in the diary.
Categories: MOVIE for films, BOOK for books, MUSIC for music, LESSON for courses, NOTE for everyday life, PERSON for a fact about a person, IDEA for a creation idea, GOAL for goals, WISHLIST for other future experiences. For tracked media/course wishlist entries use their media category AND activity.intent wishlist.
activity is null for NOTE, PERSON, IDEA, GOAL and WISHLIST entries. An expressed wish for a non-media experience, such as a trip, visiting a place or trying a restaurant, is WISHLIST with activity null, not a media activity and not a past NOTE. Preserve the desired timing in the summary; do not invent a specific date when only a week or month is given. Do not ask whether an explicit future desire is a future plan. For media/courses include kind, intent, progress, progressMode, total, lessonNumbers, sentiment and creator. Their category must match kind: MOVIE/movie, BOOK/book, MUSIC/music, LESSON/course. Future media desires keep their media category with activity.intent wishlist; WISHLIST is reserved for non-media desires.
Intent: wishlist for future desire (not completion); start for starting; progress for partial work; complete for explicitly finished film/book/course; listen for a song played; reaction for an opinion about a named work without a new viewing, reading or play event. "Love the song Northern Lights but haven't played it today" is reaction, not listen. A positive description, recommendation or "sounds good" without an explicit desire is reaction, not wishlist. "Haven't started" alone does not imply wanting to start. Choose wishlist only for an expressed future intention or desire; never infer a plan from praise or a negated past action. Reactions have progress null and lessonNumbers [] and do not establish completion or a wishlist. General preferences like "music helps me relax" are NOTE, not a named-work activity. "Watched Dune" or "read Glass Orchard" alone does not prove whole-work completion. When neither partial progress nor explicit whole-work completion is clear, retain the media category and original title, ask whether it was partial or finished, and leave activity null until the user reviews the action. Never infer completion from a past watching or reading verb alone. "Watched lecture 2" means course progress, not a movie. Never invent total pages, duration, lesson count, creator or progress. Use null only for fields whose schema permits null. When activity is an object, kind, intent and progressMode must be valid enum values; lessonNumbers must always be an array, using [] when no lesson numbers were stated, including for movies, books and music. If the action is unresolved, retain the media category and original title, return the entire activity as null and ask a clarification question. Never return an activity object with intent null.
"Read 30 pages" is progress 30 and progressMode increment. "I'm on page 120" is progress 120 absolute. "Watched 40 minutes" is increment 40; "up to minute 40" is absolute 40. "Did lessons 2-4" gives lessonNumbers [2,3,4], progress null. Do not do arithmetic; the app applies it. A song listen defaults progress null so the app adds one play. Parse explicit ratings: 7-10/10 loved, 5-6 neutral, 1-4 disliked, or direct loved/disliked/okay language. Sentiment null unless stated.
For every media/course entry, title is ONLY the name of the work/course as written in the note, never an event headline. Keep action, quantity, page position, date, companion and reaction in summary/activity, not title. Do not prefix a work title with "Read", "Reading", "Watched" or a page count. For an unfamiliar explicitly named work, preserve its full original title just as for a familiar work, including internal punctuation and apostrophe characters. Never rewrite a curly apostrophe as a straight apostrophe. An explicit unfamiliar title does not need a "which title" clarification. Do not copy a catalog's event-style title. For everyday non-media entries a descriptive headline is appropriate.
Examples of field separation (examples are not events to extract): "Read 7 pages of the novel Quiet Harbor" -> title "Quiet Harbor", activity.progress 7, progressMode increment; "I'm on page 41 of Quiet Harbor" -> title "Quiet Harbor", activity.progress 41, progressMode absolute; "I like Quiet Harbor, but didn't read today" -> title "Quiet Harbor", activity.intent reaction, progress null. "Read 7 pages of Quet Harbor" -> title "Quet Harbor"; leave spelling correction to the separate title check.
Use the meaningful title, keeping full names and original title spellings. The summary must preserve the event wording and details, including companions and feelings explicitly stated. If updating an existing subject, the app preserves its previous history. Match an existing tracked item only when the same kind and title clearly refer to it. An ordinary experience sharing a friend/theme should be a new memory, not an update to the person.
Liking or disliking an explicitly named work is reaction, even without reading/watching it today; it does not require a question about whether this is a wishlist or a reaction. Prior completion is not required to record an opinion.
When the note explicitly names a work and exactly one catalog item has that same title and kind, set matchedMemoryId to its supplied ID and candidateMemoryIds to [], including reaction-only notes. Do not leave a uniquely and explicitly identified work as an unresolved candidate. Similar spelling is not an exact match; preserve its original spelling for title review. If two saved items have the same title/kind, ask which one; never pick the first. An unnamed pronoun is not an explicit title.
matchedMemoryId is an actual ID only for an unambiguous update. If several subjects could match, leave it null, list actual candidateMemoryIds, ask a short clarification question. Never invent IDs. When title or intent is missing ask a short clarificationQuestion; otherwise null. Dates are YYYY-MM-DD, resolve yesterday relative to today, otherwise today. Tags are 2-4 useful lowercase topics supported by the note. No outside facts or web search.`;

export function captureCatalog(memories: Memory[]) {
  return memories.map((m) => ({
    id: m.id,
    title: m.title,
    category: m.category,
    kind: m.activity?.kind ?? null,
  }));
}

export function validatePlan(
  raw: unknown,
  memories: Memory[],
  resolveExact = true,
  sourceNote?: string,
): CapturePlan {
  const result = capturePlanSchema.parse(raw);
  const ids = new Set(memories.map((m) => m.id));
  for (const entry of result.entries) {
    if (entry.matchedMemoryId && !ids.has(entry.matchedMemoryId))
      throw new Error("The model matched a missing memory. Please try again.");
    entry.candidateMemoryIds = [...new Set(entry.candidateMemoryIds)].filter((id) => ids.has(id));
    if (entry.activity && entry.category !== activityCategories[entry.activity.kind])
      throw new Error(
        "The model returned conflicting entry types. Your note has not been saved. Review it manually or try again.",
      );
    if (entry.activity && needsProgressEvidence(entry.activity)) {
      entry.intentReviewRequired = true;
      entry.clarificationQuestion ??=
        "How much progress did you make? Enter an amount or completed course lessons, or choose what happened.";
    }
    if (resolveExact && sourceNote) entry.titleReviewRequired = false;
    if (resolveExact && sourceNote && entry.titleSuggestion) {
      entry.titleSuggestion = validateTitleSuggestion(
        entry.titleSuggestion,
        entry.title,
        entry.activity?.kind,
        sourceNote,
        memories,
      );
      // Even a catalog-backed suggestion is a proposal until the user confirms it.
      entry.matchedMemoryId = null;
      entry.candidateMemoryIds = [];
      continue;
    }
    // Exact subject identity is deterministic; matching daily experiences is not.
    if (!entry.activity && entry.category === "NOTE") entry.matchedMemoryId = null;
    // Non-media titles are descriptive headlines, not canonical identities.
    // A model's supplied ID cannot establish that this person/idea/goal/wish
    // replaces an existing subject. Keep real choices for deliberate review;
    // confirmed applyCapturePlan calls resolveExact=false and remain authoritative.
    if (resolveExact && sourceNote && !entry.activity && entry.matchedMemoryId) {
      entry.candidateMemoryIds = [
        ...new Set([entry.matchedMemoryId, ...entry.candidateMemoryIds]),
      ].slice(0, 10);
      entry.matchedMemoryId = null;
      entry.clarificationQuestion =
        "Did you mean to update this existing memory, or save a separate one? Choose before saving.";
    }
    if (
      resolveExact &&
      entry.activity &&
      !entry.matchedMemoryId &&
      !entry.candidateMemoryIds.length
    ) {
      const normalize = (title: string) =>
        title.normalize("NFKC").trim().toLocaleLowerCase().replace(/\s+/g, " ");
      const exact = memories.filter(
        (m) =>
          m.activity?.kind === entry.activity!.kind &&
          normalize(m.title) === normalize(entry.title),
      );
      if (exact.length === 1) {
        // An unresolved question may concern a new copy/edition or intent. Give
        // a real review choice rather than silently duplicating or merging it.
        if (entry.clarificationQuestion) entry.candidateMemoryIds = [exact[0]!.id];
        else entry.matchedMemoryId = exact[0]!.id;
      } else if (exact.length > 1) {
        entry.candidateMemoryIds = exact.map((m) => m.id).slice(0, 10);
        entry.clarificationQuestion = "More than one item has this title. Which one did you mean?";
      }
    }
    let matched = memories.find((m) => m.id === entry.matchedMemoryId);
    if (resolveExact && entry.activity && matched) {
      const identity = (title: string) =>
        title.normalize("NFKC").trim().toLocaleLowerCase().replace(/\s+/g, " ");
      if (identity(entry.title) !== identity(matched.title)) {
        // The note can name both works. Independently grounding the entry title
        // and the claimed target is insufficient to link this event to that ID.
        // Include real choices, including legacy records, but never auto-rebind.
        const claimedTitle = identity(matched.title);
        const candidates = memories.filter(
          (memory) =>
            (memory.activity
              ? memory.activity.kind === entry.activity!.kind
              : memory.category === entry.category) &&
            (identity(memory.title) === claimedTitle ||
              entry.candidateMemoryIds.includes(memory.id) ||
              identity(memory.title) === identity(entry.title)),
        );
        entry.matchedMemoryId = null;
        entry.candidateMemoryIds = candidates.map((memory) => memory.id).slice(0, 10);
        entry.titleReviewRequired = true;
        entry.clarificationQuestion ??=
          "The selected item has a different title. Which one did you mean?";
        matched = undefined;
      }
    }
    // A model-generated title/ID is not evidence that the user named that item.
    // Check the original note, never the model's paraphrased summary.
    if (
      resolveExact &&
      sourceNote &&
      entry.activity &&
      (matched?.activity ||
        /\b(it|that|(?:my|the) (?:book|novel|movie|film|course|song))\b/i.test(sourceNote))
    ) {
      const normalize = (value: string) =>
        value.normalize("NFKC").toLocaleLowerCase().replace(/\s+/g, " ").trim();
      const escaped = normalize(matched?.title ?? entry.title).replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&",
      );
      const negatedTitle = new RegExp(
        `\\b(?:not|rather than|instead of)\\s+${escaped}(?![\\p{L}\\p{N}])`,
        "u",
      ).test(normalize(sourceNote));
      const named =
        !negatedTitle &&
        !/^(?:(?:my|the)\s+)?(?:it|that|book|novel|movie|film|course|song)$/i.test(
          entry.title.trim(),
        ) &&
        new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, "u").test(
          normalize(sourceNote),
        );
      if (!named) {
        const kinds = (
          [
            ["book", /\b(book|novel|chapter|pages?)\b/i],
            ["movie", /\b(movie|film)\b/i],
            ["course", /\b(course|lesson|lecture)\b/i],
            ["music", /\b(song|track|album)\b/i],
          ] as const
        )
          .filter(([, pattern]) => pattern.test(sourceNote))
          .map(([kind]) => kind);
        const candidates = memories.filter(
          (memory) => memory.activity && (!kinds.length || kinds.includes(memory.activity.kind)),
        );
        const genericReference =
          /\b(?:my|the) (?:book|novel|movie|film|course|song)(?=\s*(?:$|[,.!?;:]|(?:is|on|again|now|today|yesterday)\b))|\b(?:it|that)(?=\s*(?:$|[,.!?;:]|(?:again|now|today|yesterday)\b))/i.test(
            sourceNote,
          );
        if (
          !genericReference ||
          negatedTitle ||
          candidates.length !== 1 ||
          candidates[0]?.id !== matched?.id
        ) {
          entry.matchedMemoryId = null;
          entry.candidateMemoryIds = candidates.map((memory) => memory.id).slice(0, 10);
          entry.clarificationQuestion = candidates.length
            ? "Which item did you mean? Choose one before saving."
            : "Which title did you mean?";
        }
      }
    }
    if (
      matched &&
      entry.activity &&
      (matched.activity
        ? matched.activity.kind !== entry.activity.kind
        : matched.category !== entry.category)
    ) {
      entry.matchedMemoryId = null;
      entry.clarificationQuestion =
        "This matched an item of another type. Check the type and title before saving a new entry.";
    }
    // A real ID does not establish which edition/record the user meant. The
    // AI catalog cannot distinguish identical titles; the review screen can.
    // Explicit review choices pass resolveExact=false and remain authoritative.
    if (
      resolveExact &&
      entry.activity &&
      entry.matchedMemoryId &&
      matched?.activity?.kind === entry.activity.kind
    ) {
      const normalize = (title: string) =>
        title.normalize("NFKC").trim().toLocaleLowerCase().replace(/\s+/g, " ");
      const candidates = memories.filter(
        (memory) =>
          memory.activity?.kind === entry.activity!.kind &&
          normalize(memory.title) === normalize(matched.title),
      );
      if (candidates.length > 1) {
        entry.matchedMemoryId = null;
        entry.candidateMemoryIds = candidates.map((memory) => memory.id).slice(0, 10);
        entry.clarificationQuestion = "More than one item has this title. Which one did you mean?";
      }
    }
    if (resolveExact && sourceNote && entry.activity && !entry.titleSuggestion) {
      const original = sourceNote.normalize("NFKC").toLocaleLowerCase();
      const title = entry.title.normalize("NFKC").toLocaleLowerCase();
      if (!hasOriginalTitleSpan(original, title)) entry.titleReviewRequired = true;
    }
  }
  return result;
}
export function applyCapturePlan(
  memories: Memory[],
  raw: CapturePlan,
  transcript: string,
  progressReview?: UnquantifiedProgressReview,
  completionReview?: CompletionReview,
): Memory[] {
  assertUnquantifiedProgressReview(raw, transcript, progressReview);
  assertCompletionReview(raw, transcript, completionReview);
  const plan = validatePlan(raw, memories, false);
  let next = [...memories];
  const now = new Date().toISOString();
  // Only reconcile subjects created by this confirmed capture. A “New memory”
  // choice must never implicitly target a record from the existing catalog.
  const createdSubjects = new Map<string, string>();
  const capturedIds = new Set<string>();
  const identity = (value: string) =>
    value.normalize("NFKC").trim().toLocaleLowerCase().replace(/\s+/g, " ");
  for (const [index, entry] of plan.entries.entries()) {
    const reviewedUnknownProgress = Boolean(progressReview?.acknowledgedEntries.includes(index));
    if (reviewedUnknownProgress) entry.intentReviewRequired = false;
    if (
      !entry.activity &&
      Object.values(activityCategories).some((category) => category === entry.category)
    )
      throw new Error("Choose what happened for this media entry before saving.");
    if (entry.intentReviewRequired)
      throw new Error(
        "Choose whether this was planned, started, progress or finished before saving.",
      );
    if (entry.titleSuggestion) {
      const suggestion = entry.titleSuggestion;
      if (suggestion.decision === "pending")
        throw new Error(
          "Confirm the suggested title, keep your spelling, or edit it before saving.",
        );
      const chosenTitle =
        suggestion.decision === "accepted" ? suggestion.suggestedTitle : suggestion.sourceTitle;
      if (entry.title !== chosenTitle)
        throw new Error("The title changed after confirmation. Review it again before saving.");
      if (suggestion.decision === "original" && entry.matchedMemoryId)
        throw new Error(
          "Keeping your spelling creates a new memory. Choose an existing item explicitly after editing the title.",
        );
      const target = memories.find((m) => m.id === entry.matchedMemoryId);
      if (target && target.title !== chosenTitle)
        throw new Error(
          "The selected memory has a different title. Edit the title before choosing that item.",
        );
    }
    if (entry.candidateMemoryIds.length && !entry.matchedMemoryId)
      throw new Error("Choose the matching item, or clear the matches to save a new entry.");
    if (entry.titleReviewRequired)
      throw new Error("Check the media title or edit it before saving.");
    const subject = entry.activity
      ? JSON.stringify([entry.activity.kind, identity(entry.title)])
      : null;
    const createdId = !entry.matchedMemoryId && subject ? createdSubjects.get(subject) : undefined;
    const existing = next.find((m) => m.id === (entry.matchedMemoryId ?? createdId));
    if (
      createdId &&
      existing?.activity?.creator &&
      entry.activity?.creator &&
      identity(existing.activity.creator) !== identity(entry.activity.creator)
    )
      throw new Error(
        "These entries have the same title but different creators. Check which work each event refers to before saving.",
      );
    const activity = entry.activity
      ? applyActivity(
          existing?.activity,
          entry.activity,
          entry.date,
          entry.summary,
          reviewedUnknownProgress ? { allowUnquantifiedProgress: true } : undefined,
        )
      : undefined;
    if (existing?.activity && !activity)
      throw new Error(
        "A tracked item needs an activity update. Save this life note as a new memory.",
      );
    const id = existing?.id ?? crypto.randomUUID();
    const memory = memorySchema.parse({
      ...existing,
      id,
      title: existing?.activity ? existing.title : entry.title,
      category: entry.category,
      date: entry.date,
      summary: existing && !activity ? `${existing.summary}\n${entry.summary}` : entry.summary,
      tags: [...new Set([...(existing?.tags ?? []), ...entry.tags])].slice(0, 8),
      followUpQuestion: "",
      suggestedAnswers: [],
      answerLabel: "Reflection",
      answers: existing?.answers ?? [],
      transcripts: capturedIds.has(id)
        ? existing!.transcripts
        : [...(existing?.transcripts ?? []), transcript],
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      ...(activity ? { activity } : {}),
    });
    next = [memory, ...next.filter((m) => m.id !== memory.id)];
    capturedIds.add(id);
    if (!existing && subject) createdSubjects.set(subject, id);
  }
  if (next.length > 200)
    throw new Error("This workspace supports 200 memories. Export a backup before making room.");
  return next;
}

const recallItem = z
  .object({ id: z.string().min(1).max(90), title: z.string().min(1).max(300) })
  .passthrough();
const recallSchema = z.object({
  courses: z.array(recallItem).default([]),
  movies: z.array(recallItem).default([]),
  books: z.array(recallItem).default([]),
  music: z.array(recallItem).default([]),
  logs: z
    .array(
      z.object({
        id: z.string(),
        date: z.string(),
        title: z.string(),
        details: z.string().optional(),
        category: z.string(),
        refId: z.string().optional(),
      }),
    )
    .default([]),
});
// Import user-owned Recall exports; seed.js is never used as a database.
export function importRecall(raw: unknown): Memory[] {
  const data = recallSchema.parse(raw);
  const now = new Date().toISOString();
  const entries: Memory[] = [];
  const number = (value: unknown) =>
    typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
  const positive = (value: unknown) => (number(value) > 0 ? number(value) : null);
  for (const [collection, kind] of [
    ["movies", "movie"],
    ["books", "book"],
    ["music", "music"],
    ["courses", "course"],
  ] as const) {
    for (const item of data[collection]) {
      const logs = data.logs.filter((l) => l.refId === item.id);
      const lessons = Array.isArray(item["completedLessons"])
        ? item["completedLessons"].filter(
            (n): n is number => typeof n === "number" && Number.isInteger(n) && n > 0,
          )
        : [];
      const completedLessons = [...new Set(lessons)];
      const progress =
        kind === "course"
          ? completedLessons.length
          : number(
              kind === "movie"
                ? item["watchedMinutes"]
                : kind === "book"
                  ? item["currentPage"]
                  : item["plays"],
            );
      const total = positive(
        kind === "course"
          ? item["totalLessons"]
          : kind === "movie"
            ? item["totalMinutes"]
            : kind === "book"
              ? item["totalPages"]
              : null,
      );
      const date =
        typeof item["date"] === "string"
          ? item["date"]
          : typeof item["createdAt"] === "string"
            ? item["createdAt"].slice(0, 10)
            : today();
      const sentiment =
        item["sentiment"] === "up"
          ? "loved"
          : item["sentiment"] === "down"
            ? "disliked"
            : item["sentiment"] === "meh"
              ? "neutral"
              : typeof item["rating"] === "number"
                ? item["rating"] >= 7
                  ? "loved"
                  : item["rating"] >= 5
                    ? "neutral"
                    : "disliked"
                : null;
      const completed =
        ["completed", "finished"].includes(String(item["status"])) ||
        (kind === "music" && progress > 0) ||
        Boolean(total && progress >= total);
      const rawTags = item["tags"];
      const importedTags = Array.isArray(rawTags)
        ? rawTags
        : rawTags && typeof rawTags === "object"
          ? Object.values(rawTags).flatMap((value) =>
              Array.isArray(value) ? value : typeof value === "string" ? [value] : [],
            )
          : [];
      entries.push(
        memorySchema.parse({
          id: `recall:${item.id}`,
          title: item.title,
          category: activityCategories[kind],
          date,
          summary:
            typeof item["about"] === "string" && item["about"]
              ? item["about"]
              : `${item.title} imported from Recall.`,
          tags: [
            ...new Set(
              importedTags
                .filter((t): t is string => typeof t === "string")
                .map((t) => t.slice(0, 60)),
            ),
          ].slice(0, 8),
          activity: {
            kind,
            status: completed
              ? "completed"
              : progress > 0 ||
                  ["reading", "watching", "in-progress"].includes(String(item["status"]))
                ? "in-progress"
                : "planned",
            progress,
            total,
            completedLessons,
            sentiment,
            creator:
              typeof item["author"] === "string"
                ? item["author"]
                : typeof item["artist"] === "string"
                  ? item["artist"]
                  : null,
            ...(typeof item["link"] === "string" && /^https?:\/\//i.test(item["link"])
              ? { link: item["link"] }
              : {}),
            ...(Array.isArray(item["lessons"]) ? { lessons: item["lessons"] } : {}),
            history: logs.map((l) => ({
              date: l.date,
              text: `${l.title}${l.details ? `. ${l.details}` : ""}`,
            })),
          },
          followUpQuestion: "",
          suggestedAnswers: [],
          answerLabel: "Reflection",
          answers: [],
          transcripts: logs.map((l) => l.title).slice(-100),
          createdAt: now,
          updatedAt: now,
        }),
      );
    }
  }
  for (const log of data.logs.filter(
    (l) => !l.refId || !entries.some((m) => m.id === `recall:${l.refId}`),
  )) {
    entries.push(
      memorySchema.parse({
        id: `recall-log:${log.id}`,
        title: log.title,
        date: log.date,
        category: "NOTE",
        summary: log.details || log.title,
        followUpQuestion: "",
        suggestedAnswers: [],
        answerLabel: "Reflection",
        answers: [],
        transcripts: [log.title],
        createdAt: now,
        updatedAt: now,
      }),
    );
  }
  return entries;
}
