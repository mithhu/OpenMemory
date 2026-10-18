import { useEffect, useRef, useState } from "react";
import { Check, Loader2, PencilLine, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { CATEGORIES, categoryMeta, today, type Memory, type Category } from "@/lib/memory";
import {
  ACTIVITY_KINDS,
  activityCategories,
  activityLabels,
  activityUnits,
  needsProgressEvidence,
  type ActivityCommand,
} from "@/lib/activity";
import {
  recordUnquantifiedProgressReview,
  recordCompletionReview,
  type CompletionReview,
  type UnquantifiedProgressReview,
  type CapturePlan,
  type CaptureEntry,
} from "@/lib/capture-plan";
import { TitleCatalog } from "./TitleCatalog";
import { ReminderFields } from "./ReminderFields";
import { localReminder } from "@/lib/reminders";
import type { CatalogTitle } from "@/lib/title-catalog";
import { hasOriginalTitleSpan } from "@/lib/title-evidence";
import {
  assessClassification,
  recordClassificationReview,
  type ClassificationMetadata,
  type ClassificationReviewDecision,
} from "@/lib/classification";

import {
  detailQuestions,
  hasIdentityQuestion,
  resolveDetails,
  type DetailReason,
} from "@/lib/clarification";

const emptyActivity = (kind: ActivityCommand["kind"]): ActivityCommand => ({
  kind,
  intent: "wishlist",
  progress: null,
  progressMode: "absolute",
  total: null,
  lessonNumbers: [],
  sentiment: null,
  creator: null,
});

const classificationTypeLabels = {
  MOVIE: "Film",
  SERIES: "TV series",
  BOOK: "Book",
  MUSIC: "Music",
  LESSON: "Course",
  NOTE: "Life note",
  PERSON: "Person",
  GOAL: "Goal",
  WISHLIST: "Wishlist",
  IDEA: "Idea",
  MIXED: "Separate events",
};
const classificationActionLabels = {
  none: "A fact or thought",
  wishlist: "Something to do",
  start: "Started",
  progress: "Made progress",
  complete: "Finished",
  listen: "Listened",
  reaction: "An opinion",
  mixed: "More than one event",
};

// A title choice may update literal title mentions, but must not change parts of
// other words (for example, choosing a replacement for “Up” inside “Updated”).
function replaceTitleMentions(details: string, source: string, chosen: string): string {
  if (!source || source === chosen) return details;
  const words = [...new Intl.Segmenter(undefined, { granularity: "word" }).segment(details)].filter(
    (word) => word.isWordLike,
  );
  let result = "";
  let cursor = 0;
  for (let start = details.indexOf(source); start !== -1; start = details.indexOf(source, cursor)) {
    const end = start + source.length;
    const insideWord = words.some(
      (word) =>
        (start > word.index && start < word.index + word.segment.length) ||
        (end > word.index && end < word.index + word.segment.length),
    );
    result += details.slice(cursor, start) + (insideWord ? source : chosen);
    cursor = end;
  }
  return result + details.slice(cursor);
}

export function CaptureReview({
  plan,
  text,
  memories,
  onSave,
  onCancel,
  classification,
}: {
  plan: CapturePlan;
  text: string;
  memories: Memory[];
  onSave: (
    plan: CapturePlan,
    classificationReview?: ClassificationReviewDecision,
    progressReview?: UnquantifiedProgressReview,
    completionReview?: CompletionReview,
  ) => Promise<boolean>;
  onCancel: () => void;
  classification?: ClassificationMetadata;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const moveTo = (target: HTMLElement | null) => {
    if (!target) return;
    target.focus({ preventScroll: true });
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    target.scrollIntoView?.({ behavior: reducedMotion ? "instant" : "smooth", block: "start" });
  };
  useEffect(() => {
    moveTo(headingRef.current);
  }, []);
  // The editor owns its initial proposal. A parent replacement must remount it;
  // matching new advice cannot legitimize entries left over from an old source.
  const [initialProposal] = useState(() => JSON.stringify([text, plan]));
  const proposalReplaced = initialProposal !== JSON.stringify([text, plan]);
  const [entries, setEntries] = useState(() =>
    plan.entries.map((entry) => {
      const kind = ACTIVITY_KINDS.find((kind) => activityCategories[kind] === entry.category);
      // A model may identify the subject type while leaving its activity unknown.
      // Show the right editor and require a decision instead of saving untracked media.
      return {
        ...entry,
        ...(hasIdentityQuestion(entry.clarificationReasons) ? { titleReviewRequired: true } : {}),
        ...(entry.clarificationReasons?.includes("missing_action")
          ? { intentReviewRequired: true }
          : {}),
        ...(!entry.activity && kind
          ? {
              activity: emptyActivity(kind),
              intentReviewRequired: true,
              titleReviewRequired:
                entry.titleReviewRequired ??
                (entry.clarificationReasons
                  ? hasIdentityQuestion(entry.clarificationReasons)
                  : true),
            }
          : {}),
        ...(entry.activity?.intent === "wishlist" &&
        (entry.activity.progress !== null ||
          entry.activity.lessonNumbers.length ||
          entry.activity.season ||
          entry.activity.episode ||
          entry.activity.seasonCompleted)
          ? { intentReviewRequired: true }
          : {}),
        ...(entry.activity && needsProgressEvidence(entry.activity)
          ? { intentReviewRequired: true }
          : {}),
        reviewKey: crypto.randomUUID(),
      };
    }),
  );
  const [saving, setSaving] = useState(false);
  const [progressAcknowledgment, setProgressAcknowledgment] = useState<string | null>(null);
  const [completionAcknowledgments, setCompletionAcknowledgments] = useState<
    Record<number, string>
  >({});
  const completionReviewKey = JSON.stringify([text, entries]);
  const completedIndices = entries.flatMap((entry, index) =>
    entry.activity?.intent === "complete" ? [index] : [],
  );
  const unconfirmedCompletionCount = completedIndices.filter(
    (index) => completionAcknowledgments[index] !== completionReviewKey,
  ).length;
  const completionsAcknowledged = unconfirmedCompletionCount === 0;
  const progressReviewKey = JSON.stringify([text, entries]);
  const progressAcknowledged = progressAcknowledgment === progressReviewKey;
  const [lessonDrafts, setLessonDrafts] = useState<Record<string, string>>({});
  const hasUnknownProgress = entries.some((entry) => {
    const activity = entry.activity;
    if (!activity) return false;
    const lessons = lessonDrafts[entry.reviewKey];
    // A nonempty edited course range is validated on submit. It must not be
    // blocked as "unknown" merely because the original model left lessons empty.
    if (activity.kind === "course" && lessons !== undefined)
      return needsProgressEvidence({ ...activity, lessonNumbers: [] }) && !lessons.trim();
    return needsProgressEvidence(activity);
  });
  const [classificationAcknowledgment, setClassificationAcknowledgment] = useState<string | null>(
    null,
  );
  let classificationError = "";
  let classificationConflicts: ReturnType<typeof assessClassification>["conflicts"] = [];
  if (classification) {
    try {
      if (proposalReplaced) throw new Error("Review proposal replaced");
      classificationConflicts = assessClassification({ entries }, classification, text).conflicts;
    } catch {
      classificationError = proposalReplaced
        ? "The original note or proposed entries changed while this review was open. Go back and open a fresh review before saving."
        : "This classification belongs to different words or is invalid. Go back and review your original note again.";
    }
  }
  const classificationKey = JSON.stringify([text, classification, entries]);
  const classificationAcknowledged = classificationAcknowledgment === classificationKey;
  const needsClassificationReview =
    Boolean(classificationError) ||
    (classificationConflicts.length > 0 && !classificationAcknowledged);
  const mutateEntries = (update: Parameters<typeof setEntries>[0]) => {
    // A reversible button edit must not revive an earlier completion decision.
    setCompletionAcknowledgments({});
    setEntries(update);
  };
  const patch = (index: number, change: Partial<CaptureEntry>, resolved: DetailReason[] = []) =>
    mutateEntries((items) =>
      items.map((entry, i) => {
        if (i !== index) return entry;
        const next = { ...entry, ...change };
        if (entry.clarificationReasons) {
          next.clarificationReasons = resolveDetails(entry.clarificationReasons, resolved)!;
          if (hasIdentityQuestion(next.clarificationReasons)) next.titleReviewRequired = true;
          if (next.clarificationReasons.includes("missing_action"))
            next.intentReviewRequired = true;
          if (next.clarificationReasons.length)
            next.clarificationQuestion = next.clarificationReasons
              .map((reason) => detailQuestions[reason])
              .join(" ");
          else if (resolved.length)
            next.clarificationQuestion = change.clarificationQuestion ?? null;
        }
        return next;
      }),
    );
  const changeKind = (index: number, value: string) => {
    const entry = entries[index]!;
    const originalTitle = entry.titleSuggestion?.sourceTitle ?? entry.title;
    const originalSummary = entry.titleSuggestion
      ? replaceTitleMentions(entry.summary, entry.titleSuggestion.suggestedTitle, originalTitle)
      : entry.summary;
    const kind = ACTIVITY_KINDS.find((k) => k === value);
    if (kind)
      patch(index, {
        title: originalTitle,
        summary: originalSummary,
        category: activityCategories[kind],
        matchedMemoryId: null,
        candidateMemoryIds: [],
        activity: emptyActivity(kind),
        titleSuggestion: null,
        titleReviewRequired: false,
        intentReviewRequired: true,
      });
    else
      patch(
        index,
        {
          title: originalTitle,
          summary: originalSummary,
          category: value as Category,
          activity: null,
          matchedMemoryId: entry.activity ? null : entry.matchedMemoryId,
          candidateMemoryIds: [],
          titleSuggestion: null,
          titleReviewRequired: false,
          intentReviewRequired: false,
        },
        ["missing_action"],
      );
  };
  const activityPatch = (index: number, change: Partial<ActivityCommand>) => {
    const activity = entries[index]?.activity;
    if (activity)
      patch(
        index,
        {
          activity: { ...activity, ...change },
          ...(change.intent ||
          (activity.intent === "progress" &&
            ((change.progress !== undefined && change.progress !== null) ||
              (activity.kind === "series" && (change.episode || change.seasonCompleted))))
            ? { intentReviewRequired: false }
            : {}),
        },
        change.intent ? ["missing_action"] : [],
      );
  };
  const chooseCatalogTitle = (index: number, candidate: CatalogTitle) => {
    const entry = entries[index]!;
    const matches = entry.activity
      ? memories.filter(
          (m) => m.activity?.kind === entry.activity!.kind && m.title === candidate.title,
        )
      : [];
    patch(
      index,
      {
        title: candidate.title,
        summary: replaceTitleMentions(entry.summary, entry.title, candidate.title),
        titleSuggestion: null,
        matchedMemoryId: matches.length === 1 ? matches[0]!.id : null,
        candidateMemoryIds: matches.length > 1 ? matches.map((m) => m.id) : [],
        clarificationQuestion: matches.length > 1 ? "Which saved item did you mean?" : null,
        titleReviewRequired: false,
      },
      ["missing_identity", "unresolved_reference"],
    );
  };
  const chooseTitle = (index: number, decision: "accepted" | "original") => {
    const entry = entries[index]!;
    const suggestion = entry.titleSuggestion;
    if (!suggestion) return;
    const title = decision === "accepted" ? suggestion.suggestedTitle : suggestion.sourceTitle;
    const matches =
      decision === "accepted"
        ? memories.filter((m) => m.activity?.kind === entry.activity?.kind && m.title === title)
        : [];
    patch(
      index,
      {
        title,
        titleSuggestion: { ...suggestion, decision },
        summary:
          decision === "original"
            ? replaceTitleMentions(entry.summary, suggestion.suggestedTitle, suggestion.sourceTitle)
            : replaceTitleMentions(
                entry.summary,
                suggestion.sourceTitle,
                suggestion.suggestedTitle,
              ),
        matchedMemoryId: matches.length === 1 ? matches[0]!.id : null,
        candidateMemoryIds: matches.length > 1 ? matches.map((m) => m.id) : [],
        clarificationQuestion: matches.length > 1 ? "Which saved item did you mean?" : null,
        titleReviewRequired: false,
      },
      decision === "accepted" ? ["missing_identity", "unresolved_reference"] : [],
    );
  };
  const needsTitleReview = entries.some(
    (entry) =>
      entry.titleSuggestion?.decision === "pending" ||
      entry.titleReviewRequired ||
      hasIdentityQuestion(entry.clarificationReasons),
  );
  const needsIntentReview = entries.some(
    (entry) => entry.intentReviewRequired || entry.clarificationReasons?.includes("missing_action"),
  );
  const needsMatchingReview = entries.some(
    (entry) => !entry.matchedMemoryId && entry.candidateMemoryIds.length > 0,
  );
  const decisions: { label: string; target: string }[] = [];
  if (needsClassificationReview)
    decisions.push({
      label: "Check the suggested type and action",
      target: "classification-review",
    });
  if (hasUnknownProgress && !progressAcknowledged)
    decisions.push({
      label: "Confirm progress without a known amount",
      target: "progress-confirmation",
    });
  entries.forEach((entry, index) => {
    const prefix = `Entry ${index + 1}: `;
    if (entry.titleSuggestion?.decision === "pending" || entry.titleReviewRequired)
      decisions.push({ label: `${prefix}check the title`, target: `capture-title-check-${index}` });
    if (entry.intentReviewRequired)
      decisions.push({ label: `${prefix}choose what happened`, target: `capture-intent-${index}` });
    if (!entry.matchedMemoryId && entry.candidateMemoryIds.length)
      decisions.push({ label: `${prefix}choose where to save`, target: `capture-match-${index}` });
    if (
      entry.activity?.intent === "complete" &&
      completionAcknowledgments[index] !== completionReviewKey
    )
      decisions.push({
        label: `${prefix}confirm whole-work completion`,
        target: `capture-completion-${index}`,
      });
    if (!entry.title.trim())
      decisions.push({ label: `${prefix}add a title`, target: `capture-title-${index}` });
    if (!entry.summary.trim())
      decisions.push({ label: `${prefix}add details`, target: `capture-details-${index}` });
  });
  return (
    <form
      ref={formRef}
      className="capture-review"
      aria-label="Review memories before saving"
      onChangeCapture={(event) => {
        // Review acknowledgments do not edit the proposal or invalidate one
        // another. Every actual form-field change still clears both receipts.
        if (event.target instanceof HTMLInputElement && event.target.dataset["reviewAck"]) return;
        setClassificationAcknowledgment(null);
        setProgressAcknowledgment(null);
        setCompletionAcknowledgments({});
      }}
      onSubmit={async (event) => {
        event.preventDefault();
        try {
          if (proposalReplaced)
            throw new Error(
              "The original note or proposed entries changed. Open a fresh review before saving.",
            );
          if (needsClassificationReview)
            throw new Error(
              classificationError || "Review the classification differences before saving.",
            );
          if (needsIntentReview)
            throw new Error("Choose what happened for each media entry before saving.");
          if (needsTitleReview)
            throw new Error(
              "Confirm the suggested title, keep your spelling, or edit it before saving.",
            );
          if (needsMatchingReview)
            throw new Error("Choose an existing item or New memory for each unresolved match.");
          const form = new FormData(event.currentTarget);
          const next = entries.map((original, index) => {
            const timing = String(form.get(`planned-timing-${index}`) || "").trim();
            const entry = {
              ...original,
              ...(timing || original.plannedTiming !== undefined
                ? { plannedTiming: timing || null }
                : {}),
              ...(form.get(`reminder-enabled-${index}`)
                ? { reminder: localReminder(String(form.get(`reminder-time-${index}`) || "")) }
                : original.reminder !== undefined
                  ? { reminder: null }
                  : {}),
            };
            if (entry.activity?.kind !== "course") return entry;
            const input = String(form.get(`lessons-${index}`) || "").trim();
            const numbers = new Set<number>();
            if (input)
              for (const part of input.split(",")) {
                const match = part.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/);
                if (!match) throw new Error("Use lesson numbers like 2, 3 or 2-4.");
                const start = Number(match[1]);
                const end = Number(match[2] || match[1]);
                if (start < 1 || end < start || end > 10000 || end - start > 499)
                  throw new Error("Check your lesson range (up to 500 lessons at once).");
                for (let n = start; n <= end; n++) numbers.add(n);
              }
            return { ...entry, activity: { ...entry.activity, lessonNumbers: [...numbers] } };
          });
          const needsUnknownProgressReview = next.some(
            (entry) => entry.activity && needsProgressEvidence(entry.activity),
          );
          if (needsUnknownProgressReview && !progressAcknowledged)
            throw new Error(
              "Confirm that you made partial progress with an unknown amount, or enter what you know.",
            );
          if (!completionsAcknowledged)
            throw new Error("Confirm that you finished each complete work before saving.");
          const completionReview = completedIndices.length
            ? recordCompletionReview({ entries: next }, text, completedIndices)
            : undefined;
          const progressReview = needsUnknownProgressReview
            ? recordUnquantifiedProgressReview({ entries: next }, text)
            : undefined;
          setSaving(true);
          const classificationReview = classification
            ? recordClassificationReview(
                { entries: next },
                text,
                classification,
                classificationAcknowledged,
              )
            : undefined;
          if (completionReview)
            await onSave({ entries: next }, classificationReview, progressReview, completionReview);
          else if (progressReview)
            await onSave({ entries: next }, classificationReview, progressReview);
          else if (classificationReview) await onSave({ entries: next }, classificationReview);
          else await onSave({ entries: next });
        } catch (error) {
          toast.error(error instanceof Error ? error.message : "Check the entries and try again.");
        } finally {
          setSaving(false);
        }
      }}
    >
      <div className="review-heading">
        <div>
          <span className="eyebrow">
            <PencilLine size={14} /> REVIEW & KEEP
          </span>
          <h2 ref={headingRef} tabIndex={-1}>
            Here’s what I understood.
          </h2>
          <p>A quick check before these become part of your story.</p>
        </div>
        <button
          type="button"
          className="icon-button"
          aria-label="Cancel review"
          onClick={onCancel}
          disabled={saving}
        >
          <X size={18} />
        </button>
      </div>
      <div className={`review-readiness ${decisions.length ? "needs-input" : "ready"}`}>
        <p role="status" aria-label="Review status" aria-live="polite" aria-atomic="true">
          <strong>{decisions.length ? "Needs your input" : "Review ready"}</strong>{" "}
          {decisions.length
            ? `— ${decisions.length} ${decisions.length === 1 ? "decision" : "decisions"} before saving.`
            : `— ${entries.length} ${entries.length === 1 ? "entry" : "entries"} to check.`}
        </p>
        {decisions.length ? (
          <ul aria-label="Decisions before saving">
            {decisions.map((decision) => (
              <li key={decision.target}>
                <button
                  type="button"
                  className="text-button"
                  onClick={() =>
                    moveTo(
                      formRef.current?.querySelector<HTMLElement>(`[id="${decision.target}"]`) ??
                        null,
                    )
                  }
                >
                  {decision.label}
                  <span aria-hidden="true"> →</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p>Check the details below, then choose Save. Nothing is saved yet.</p>
        )}
      </div>
      {entries.some((entry) => entry.clarificationQuestion) && (
        <section className="review-questions-summary" aria-label="Questions to check">
          <strong>Questions to check</strong>
          <p>Use the entry fields to clarify these details, or go back to add context.</p>
          <ul>
            {entries.map(
              (entry, index) =>
                entry.clarificationQuestion && (
                  <li key={entry.reviewKey}>
                    <button
                      type="button"
                      className="text-button"
                      onClick={() =>
                        moveTo(
                          formRef.current?.querySelector<HTMLElement>(
                            `[id="capture-question-${index}"]`,
                          ) ?? null,
                        )
                      }
                    >
                      Entry {index + 1}: {entry.clarificationQuestion}
                      <span aria-hidden="true"> →</span>
                    </button>
                  </li>
                ),
            )}
          </ul>
        </section>
      )}
      {classification && (
        <section
          id="classification-review"
          tabIndex={-1}
          className="review-entry classification-review"
          aria-label="Classification review"
        >
          <span className="eyebrow">A SECOND CHECK</span>
          {classificationError ? (
            <p role="alert">{classificationError}</p>
          ) : (
            <>
              <p>
                Suggested type:{" "}
                <strong>{classificationTypeLabels[classification.advice.category]}</strong> ·
                Action:{" "}
                {classification.advice.intent === null
                  ? "Not determined by the classifier"
                  : classificationActionLabels[classification.advice.intent]}
              </p>
              {classification.advice.clarificationReasons.length > 0 && (
                <p>
                  {classification.advice.intent === null
                    ? "The extracted action below is a separate suggestion. Check it against your original words."
                    : "The suggested action is known. Missing details are listed separately below."}
                </p>
              )}
              {classificationConflicts.length > 0 ? (
                <>
                  <ul>
                    {classificationConflicts.map((conflict) => (
                      <li key={conflict.kind}>{conflict.message}</li>
                    ))}
                  </ul>
                  <label className="classification-confirm">
                    <input
                      type="checkbox"
                      data-review-ack="true"
                      checked={classificationAcknowledged}
                      disabled={saving}
                      onChange={(event) =>
                        setClassificationAcknowledgment(
                          event.target.checked ? classificationKey : null,
                        )
                      }
                    />
                    {classification.advice.category === "MIXED"
                      ? "I reviewed every event in my original words and confirmed the entries I want to keep."
                      : classification.advice.clarificationReasons.length > 0
                        ? "I clarified the missing details and checked the type and action in these entries."
                        : "I checked the suggested type and action and confirm my choices below."}
                  </label>
                </>
              ) : (
                <p>No classification difference is flagged. Review each entry before saving.</p>
              )}
            </>
          )}
        </section>
      )}
      <div className="review-summary">
        <span>
          <Check size={15} /> {entries.length} {entries.length === 1 ? "memory" : "memories"} to
          review
        </span>
        <span>Not saved yet</span>
      </div>
      <details className="review-original">
        <summary>Your original words</summary>
        <blockquote>{text}</blockquote>
      </details>
      {hasUnknownProgress && (
        <label className="classification-confirm">
          <input
            id="progress-confirmation"
            type="checkbox"
            data-review-ack="true"
            disabled={saving}
            checked={progressAcknowledged}
            onChange={(event) =>
              setProgressAcknowledgment(event.target.checked ? progressReviewKey : null)
            }
          />
          I made partial progress, but don’t know the amount. Keep my recorded position unchanged.
        </label>
      )}
      <fieldset disabled={saving}>
        {entries.map((entry, index) => (
          <div className="review-entry" key={entry.reviewKey}>
            <div className="review-entry-top">
              <span className="entry-number">{index + 1}</span>
              <label className="sr-only" htmlFor={`capture-kind-${index}`}>
                Entry {index + 1} type
              </label>
              <select
                id={`capture-kind-${index}`}
                value={entry.activity?.kind || entry.category}
                onChange={(e) => changeKind(index, e.target.value)}
              >
                {ACTIVITY_KINDS.map((kind) => (
                  <option key={kind} value={kind}>
                    {activityLabels[kind]}
                  </option>
                ))}
                {CATEGORIES.filter(
                  (c) => !["MOVIE", "SERIES", "BOOK", "MUSIC", "LESSON"].includes(c),
                ).map((cat) => (
                  <option key={cat} value={cat}>
                    {categoryMeta[cat].label}
                  </option>
                ))}
              </select>
              <input
                id={`capture-title-${index}`}
                aria-label={`Entry ${index + 1} title`}
                value={entry.title}
                maxLength={300}
                required
                onChange={(e) =>
                  patch(
                    index,
                    {
                      title: e.target.value,
                      titleSuggestion: null,
                      titleReviewRequired: false,
                      matchedMemoryId: null,
                      candidateMemoryIds: [],
                      clarificationQuestion: null,
                    },
                    e.target.value.trim() ? ["missing_identity", "unresolved_reference"] : [],
                  )
                }
              />
            </div>
            {Boolean(entry.clarificationReasons?.length) && (
              <div
                className="review-question"
                role="status"
                aria-label={`Entry ${index + 1} understood action and missing details`}
              >
                <p>
                  <strong>Action:</strong>{" "}
                  {entry.clarificationReasons?.includes("missing_action") || !entry.activity
                    ? "Not yet determined"
                    : `${classificationActionLabels[entry.activity.intent]}${entry.intentReviewRequired ? " — confirm below" : ""}`}
                </p>
                <p>
                  <strong>Still needed:</strong>{" "}
                  {entry.clarificationReasons!.map((reason) => detailQuestions[reason]).join(" ")}
                </p>
              </div>
            )}
            {(entry.titleReviewRequired || hasIdentityQuestion(entry.clarificationReasons)) &&
              !entry.titleSuggestion && (
                <div
                  id={`capture-title-check-${index}`}
                  tabIndex={-1}
                  className="review-title-suggestion"
                >
                  <p>
                    <strong>Check this title before saving.</strong>
                  </p>
                  <p>
                    The proposed media title could not be matched to your words. Edit it above or
                    confirm that it is the work you mean.
                  </p>
                  {hasIdentityQuestion(entry.clarificationReasons) &&
                  !hasOriginalTitleSpan(text, entry.title) ? (
                    <p>
                      Enter the work or subject above, or choose an existing item. Your known action
                      is kept.
                    </p>
                  ) : (
                    <button
                      type="button"
                      className="text-button"
                      onClick={() =>
                        patch(index, { titleReviewRequired: false, clarificationQuestion: null }, [
                          "missing_identity",
                          "unresolved_reference",
                        ])
                      }
                    >
                      Confirm “{entry.title}”
                    </button>
                  )}
                </div>
              )}
            {entry.titleSuggestion && (
              <div
                id={`capture-title-check-${index}`}
                tabIndex={-1}
                className="review-title-suggestion"
                role="group"
                aria-label={`Entry ${index + 1} title suggestion`}
              >
                <p>
                  <strong>Did you mean “{entry.titleSuggestion.suggestedTitle}”?</strong>
                </p>
                <p>
                  You wrote “{entry.titleSuggestion.sourceTitle}”.{" "}
                  {entry.titleSuggestion.basis === "catalog"
                    ? "This matches a title in your memories."
                    : "This is an AI suggestion; check that it’s the right work."}
                </p>
                <div>
                  <button
                    type="button"
                    className="text-button"
                    aria-pressed={entry.titleSuggestion.decision === "accepted"}
                    onClick={() => chooseTitle(index, "accepted")}
                  >
                    Use “{entry.titleSuggestion.suggestedTitle}”
                  </button>
                  <button
                    type="button"
                    className="text-button"
                    aria-pressed={entry.titleSuggestion.decision === "original"}
                    onClick={() => chooseTitle(index, "original")}
                  >
                    Keep “{entry.titleSuggestion.sourceTitle}”
                  </button>
                </div>
                {entry.titleSuggestion.decision !== "pending" && (
                  <p role="status">
                    {entry.titleSuggestion.decision === "accepted"
                      ? "Suggested title selected."
                      : "Your spelling selected."}
                  </p>
                )}
              </div>
            )}
            <ReminderFields index={index} timing={entry.plannedTiming} reminder={entry.reminder} />
            {entry.clarificationQuestion && (
              <div
                id={`capture-question-${index}`}
                tabIndex={-1}
                className="review-question review-clarification"
                role="group"
                aria-label={`Entry ${index + 1} question`}
              >
                <span>
                  {entry.intentReviewRequired ||
                  entry.titleReviewRequired ||
                  entry.candidateMemoryIds.length
                    ? "A question before saving"
                    : "Check this detail"}
                </span>
                <p>{entry.clarificationQuestion}</p>
                <p className="review-question-guidance">
                  {entry.intentReviewRequired
                    ? "Choose what happened in ‘This was’ below."
                    : entry.candidateMemoryIds.length && !entry.matchedMemoryId
                      ? "Choose the right saved item, or New memory, in ‘Save to’ below."
                      : entry.titleReviewRequired
                        ? "Edit or confirm the title above."
                        : "Edit the title or details below if needed. To add more context, choose Back to my words."}
                </p>
              </div>
            )}
            {(entry.activity?.kind === "book" || entry.activity?.kind === "movie") && (
              <TitleCatalog
                kind={entry.activity.kind}
                title={entry.title}
                onChoose={(candidate) => chooseCatalogTitle(index, candidate)}
              />
            )}
            <textarea
              id={`capture-details-${index}`}
              aria-label={`Entry ${index + 1} details`}
              value={entry.summary}
              required
              maxLength={12000}
              rows={2}
              onChange={(e) => patch(index, { summary: e.target.value })}
            />
            <div className="review-fields">
              <label>
                Date
                <input
                  type="date"
                  value={entry.date}
                  required
                  onChange={(e) => patch(index, { date: e.target.value })}
                />
              </label>
              <label>
                Save to
                <select
                  id={`capture-match-${index}`}
                  value={
                    entry.matchedMemoryId ||
                    (entry.candidateMemoryIds.length ? "__unresolved__" : "")
                  }
                  onChange={(e) => {
                    const selected = memories.find((m) => m.id === e.target.value);
                    patch(
                      index,
                      {
                        matchedMemoryId: e.target.value || null,
                        candidateMemoryIds: [],
                        ...(selected
                          ? {
                              title: selected.title,
                              titleReviewRequired: false,
                              titleSuggestion: null,
                              clarificationQuestion: null,
                            }
                          : {}),
                      },
                      selected ? ["missing_identity", "unresolved_reference"] : [],
                    );
                  }}
                >
                  {!entry.matchedMemoryId && entry.candidateMemoryIds.length > 0 && (
                    <option value="__unresolved__" disabled>
                      Choose where to save
                    </option>
                  )}
                  <option value="">New memory</option>
                  {memories
                    .filter((m) =>
                      entry.activity ? m.activity?.kind === entry.activity.kind : !m.activity,
                    )
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.title}
                      </option>
                    ))}
                </select>
              </label>
              {entry.activity && (
                <>
                  <label>
                    This was
                    <select
                      id={`capture-intent-${index}`}
                      value={entry.intentReviewRequired ? "" : entry.activity.intent}
                      required
                      onChange={(e) =>
                        activityPatch(index, {
                          intent: e.target.value as ActivityCommand["intent"],
                          ...(e.target.value === "reaction" || e.target.value === "wishlist"
                            ? {
                                progress: null,
                                lessonNumbers: [],
                                season: null,
                                episode: null,
                                seasonCompleted: false,
                              }
                            : {}),
                        })
                      }
                    >
                      <option value="" disabled>
                        Choose what happened
                      </option>
                      <option value="wishlist">Something I want to do</option>
                      <option value="start">Started</option>
                      <option value="progress">Made progress</option>
                      <option value="complete">Finished the whole work</option>
                      {entry.activity.kind === "music" && <option value="listen">Listened</option>}
                      <option value="reaction">Only sharing my reaction</option>
                    </select>
                  </label>
                  {entry.activity.intent === "complete" && (
                    <div>
                      <label className="classification-confirm">
                        <input
                          type="checkbox"
                          data-review-ack="true"
                          disabled={saving}
                          id={`capture-completion-${index}`}
                          aria-label={`Entry ${index + 1}: I finished ${entry.title} in full`}
                          aria-describedby={`completion-help-${index}`}
                          checked={completionAcknowledgments[index] === completionReviewKey}
                          onChange={(event) =>
                            setCompletionAcknowledgments((previous) => ({
                              ...previous,
                              [index]: event.target.checked ? completionReviewKey : "",
                            }))
                          }
                        />
                        {entry.activity.kind === "movie"
                          ? "I watched the whole film"
                          : entry.activity.kind === "series"
                            ? "I finished the entire series, not just a season"
                            : entry.activity.kind === "book"
                              ? "I finished the whole book"
                              : entry.activity.kind === "course"
                                ? "I finished the entire course"
                                : "I finished the whole work"}{" "}
                        “{entry.title}”.
                      </label>
                      <p id={`completion-help-${index}`}>
                        {entry.activity.kind === "course"
                          ? "For individual lessons, choose Made progress."
                          : "For part of it, choose Made progress."}
                      </p>
                    </div>
                  )}
                  <label>
                    My reaction
                    <select
                      value={entry.activity.sentiment || ""}
                      onChange={(e) =>
                        activityPatch(index, {
                          sentiment: (e.target.value as ActivityCommand["sentiment"]) || null,
                        })
                      }
                    >
                      <option value="">Not mentioned</option>
                      <option value="loved">Loved it</option>
                      <option value="neutral">It was okay</option>
                      <option value="disliked">Not for me</option>
                    </select>
                  </label>
                </>
              )}
            </div>
            {entry.activity && entry.activity.intent !== "reaction" && (
              <details
                className="review-more"
                open={
                  entry.activity.kind === "series" ||
                  entry.activity.lessonNumbers.length > 0 ||
                  entry.activity.progress !== null
                }
              >
                <summary>
                  {entry.activity.intent === "wishlist" ? "Item details" : "Progress details"}{" "}
                  <span>Keep only what you know</span>
                </summary>
                <div className="review-fields">
                  {entry.activity.kind === "series" && entry.activity.intent !== "wishlist" && (
                    <>
                      <label>
                        Season
                        <input
                          type="number"
                          min={1}
                          max={10000}
                          value={entry.activity.season ?? ""}
                          onChange={(e) =>
                            activityPatch(index, {
                              season: e.target.value ? Number(e.target.value) : null,
                              episode: null,
                              seasonCompleted: false,
                            })
                          }
                        />
                      </label>
                      <label>
                        Episode position in this season
                        <input
                          type="number"
                          min={1}
                          max={10000}
                          value={entry.activity.episode ?? ""}
                          onChange={(e) =>
                            activityPatch(index, {
                              episode: e.target.value ? Number(e.target.value) : null,
                            })
                          }
                        />
                      </label>
                      <label>
                        <input
                          type="checkbox"
                          checked={entry.activity.seasonCompleted ?? false}
                          onChange={(e) =>
                            activityPatch(index, { seasonCompleted: e.target.checked })
                          }
                        />
                        Finished this season only
                      </label>
                      <p>
                        Episode position does not add watched episodes. Finishing a season does not
                        finish the series.
                      </p>
                    </>
                  )}
                  {entry.activity.intent !== "wishlist" &&
                    (entry.activity.kind === "course" ? (
                      <label>
                        Lessons completed
                        <input
                          name={`lessons-${index}`}
                          value={
                            lessonDrafts[entry.reviewKey] ?? entry.activity.lessonNumbers.join(", ")
                          }
                          placeholder="e.g. 2-4"
                          key={`lessons-${entry.reviewKey}-${entry.activity.kind}`}
                          // Entering lesson evidence is itself a deliberate
                          // progress decision. Parsing/validation happens on submit.
                          onChange={(event) => {
                            setLessonDrafts((drafts) => ({
                              ...drafts,
                              [entry.reviewKey]: event.target.value,
                            }));
                            if (entry.activity?.intent === "progress")
                              patch(index, { intentReviewRequired: false });
                          }}
                        />
                      </label>
                    ) : (
                      <>
                        <label>
                          {entry.activity.kind === "series"
                            ? "Episodes watched (count)"
                            : activityUnits[entry.activity.kind]}
                          <input
                            type="number"
                            min={0}
                            max={100000}
                            value={entry.activity.progress ?? ""}
                            placeholder="Unknown"
                            onChange={(e) =>
                              activityPatch(index, {
                                progress: e.target.value ? Number(e.target.value) : null,
                              })
                            }
                          />
                        </label>
                        <label>
                          Progress means
                          <select
                            value={entry.activity.progressMode}
                            onChange={(e) =>
                              activityPatch(index, {
                                progressMode: e.target.value as ActivityCommand["progressMode"],
                              })
                            }
                          >
                            <option value="absolute">
                              {entry.activity.kind === "series"
                                ? "Total watched count"
                                : "Current position / total count"}
                            </option>
                            <option value="increment">Add this amount</option>
                          </select>
                        </label>
                      </>
                    ))}
                  {entry.activity.kind !== "music" && (
                    <label>
                      Total {activityUnits[entry.activity.kind]}
                      <input
                        type="number"
                        min={1}
                        max={100000}
                        value={entry.activity.total ?? ""}
                        placeholder="Unknown — kept empty"
                        onChange={(e) =>
                          activityPatch(index, {
                            total: e.target.value ? Number(e.target.value) : null,
                          })
                        }
                      />
                    </label>
                  )}
                </div>
              </details>
            )}
            <div className="review-entry-footer">
              <span>
                {entry.matchedMemoryId
                  ? "Updates this item; previous history is kept."
                  : entry.candidateMemoryIds.length
                    ? "Choose an existing item or New memory above."
                    : entry.activity
                      ? "Starts a new item; repeated mentions stay together."
                      : "Creates a separate memory."}
              </span>
              {entries.length > 1 && (
                <button
                  type="button"
                  className="text-button"
                  onClick={() => mutateEntries((items) => items.filter((_, i) => i !== index))}
                >
                  Remove entry
                </button>
              )}
            </div>
          </div>
        ))}
        <button
          type="button"
          className="text-button"
          disabled={entries.length >= 8}
          onClick={() =>
            mutateEntries((items) => [
              ...items,
              {
                reviewKey: crypto.randomUUID(),
                title: "",
                summary: "",
                category: "NOTE",
                date: today(),
                matchedMemoryId: null,
                candidateMemoryIds: [],
                clarificationQuestion: null,
                tags: [],
                activity: null,
              },
            ])
          }
        >
          <Plus size={13} /> Add another entry
        </button>
      </fieldset>
      {!completionsAcknowledged && (
        <p role="status">
          Confirm completion for {unconfirmedCompletionCount}{" "}
          {unconfirmedCompletionCount === 1 ? "entry" : "entries"} to save.
        </p>
      )}
      {decisions.length > 0 && (
        <p className="review-save-help">
          Save is waiting for your choices. Use the checklist above to find what needs attention.
        </p>
      )}
      <div className="review-actions">
        <button
          className="primary-button"
          type="submit"
          disabled={
            !completionsAcknowledged ||
            saving ||
            needsTitleReview ||
            needsIntentReview ||
            needsMatchingReview ||
            (hasUnknownProgress && !progressAcknowledged) ||
            needsClassificationReview
          }
        >
          {saving ? <Loader2 size={15} className="spin" /> : <Check size={15} />} Save{" "}
          {entries.length} {entries.length === 1 ? "entry" : "entries"}
        </button>
        <button type="button" className="text-button" onClick={onCancel} disabled={saving}>
          Back to my words
        </button>
        <span>
          <Check size={12} /> You’re in control. Nothing is saved until you confirm.
        </span>
      </div>
    </form>
  );
}
