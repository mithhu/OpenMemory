import { webcrypto } from "node:crypto";
import { TextDecoder, TextEncoder } from "node:util";
import { IDBFactory } from "fake-indexeddb";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import {
  applyCapturePlan,
  recordCompletionReview,
  validatePlan,
  type CaptureEntry,
} from "../lib/capture-plan";
import { type ActivityCommand } from "../lib/activity";
import { type Memory } from "../lib/memory";
import {
  encryptVault,
  lockVault,
  openEnvelope,
  readVault,
  saveVault,
  setVaultSession,
} from "../lib/vault";
const command = (overrides: Partial<ActivityCommand> = {}): ActivityCommand => ({
  kind: "book",
  intent: "progress",
  progress:
    (!overrides.intent || overrides.intent === "progress") && overrides.kind !== "music"
      ? 10
      : null,
  progressMode: "increment",
  total: null,
  lessonNumbers: [],
  sentiment: null,
  creator: null,
  ...overrides,
});
const entry = (
  title: string,
  activity: ActivityCommand | null,
  overrides: Partial<CaptureEntry> = {},
): CaptureEntry => ({
  title,
  summary: `Fictional event for ${title}`,
  category: activity
    ? ({ book: "BOOK", movie: "MOVIE", music: "MUSIC", course: "LESSON" } as const)[activity.kind]
    : "NOTE",
  date: "2026-10-09",
  matchedMemoryId: null,
  candidateMemoryIds: [],
  clarificationQuestion: null,
  tags: [],
  activity,
  ...overrides,
});
function capture(memories: Memory[], proposal: CaptureEntry, transcript: string) {
  return applyCapturePlan(memories, validatePlan({ entries: [proposal] }, memories), transcript);
}
beforeEach(() => {
  vi.stubGlobal("crypto", webcrypto);
  vi.stubGlobal("TextEncoder", TextEncoder);
  vi.stubGlobal("TextDecoder", TextDecoder);
  vi.stubGlobal("indexedDB", new IDBFactory());
  localStorage.clear();
  setVaultSession({ key: null, salt: null });
});
afterEach(() => {
  setVaultSession({ key: null, salt: null });
  vi.unstubAllGlobals();
});
describe("Capture through durable reload", () => {
  it.each([
    { category: "PERSON", kind: "music" },
    { category: "NOTE", kind: "book" },
    { category: "BOOK", kind: "movie" },
  ] as const)(
    "rejects contradictory type fields instead of silently reclassifying %j",
    ({ category, kind }) => {
      const proposal = entry("Fictional subject", command({ kind }), { category });
      expect(() => validatePlan({ entries: [proposal] }, [])).toThrow("conflicting entry types");
      expect(() => applyCapturePlan([], { entries: [proposal] }, "Fictional note")).toThrow(
        "conflicting entry types",
      );
      expect(proposal.category).toBe(category);
    },
  );
  it("asks instead of trusting a guessed film ID for a generic reference", () => {
    const a = capture(
      [],
      entry("Silver Kite", command({ kind: "movie", intent: "start" })),
      "Started Silver Kite",
    );
    const memories = capture(
      a,
      entry("Copper Bridge", command({ kind: "movie", intent: "start" })),
      "Started Copper Bridge",
    );
    const proposal = entry("Silver Kite", command({ kind: "movie", intent: "complete" }), {
      matchedMemoryId: a[0]!.id,
    });
    const plan = validatePlan({ entries: [proposal] }, memories, true, "Finished my movie.");
    expect(plan.entries[0]!.matchedMemoryId).toBeNull();
    expect(plan.entries[0]!.candidateMemoryIds).toHaveLength(2);
    expect(plan.entries[0]!.clarificationQuestion).toContain("Which item");
    expect(() =>
      applyCapturePlan(
        memories,
        plan,
        "Finished my movie.",
        undefined,
        recordCompletionReview(plan, "Finished my movie.", [0]),
      ),
    ).toThrow("Choose");
    const reviewed = structuredClone(plan);
    reviewed.entries[0]!.matchedMemoryId = a[0]!.id;
    // Selecting the actual item in review confirms its title.
    reviewed.entries[0]!.titleReviewRequired = false;
    expect(
      applyCapturePlan(
        memories,
        reviewed,
        "Finished my movie.",
        undefined,
        recordCompletionReview(reviewed, "Finished my movie.", [0]),
      ).find((m) => m.id === a[0]!.id)?.activity?.status,
    ).toBe("completed");
    expect(
      validatePlan({ entries: [proposal] }, memories, true, "Finished Silver Kite.").entries[0]!
        .matchedMemoryId,
    ).toBe(a[0]!.id);
  });

  it("does not let a guessed kind resolve a vague pronoun across different kinds", () => {
    const a = capture(
      [],
      entry("Silver Kite", command({ kind: "movie" })),
      "Watched some Silver Kite",
    );
    const memories = capture(a, entry("Copper Bridge", command()), "Read some Copper Bridge");
    const plan = validatePlan(
      {
        entries: [
          entry("Silver Kite", command({ kind: "movie", intent: "complete" }), {
            matchedMemoryId: a[0]!.id,
          }),
        ],
      },
      memories,
      true,
      "finished it",
    );
    expect(plan.entries[0]!.matchedMemoryId).toBeNull();
    expect(plan.entries[0]!.candidateMemoryIds).toHaveLength(2);
  });

  it("keeps a unique kind match but catches fabricated titles and missing context", () => {
    const memories = capture([], entry("The River", command()), "Read some The River");
    const proposal = entry("The River", command(), { matchedMemoryId: memories[0]!.id });
    expect(
      validatePlan({ entries: [proposal] }, memories, true, "More pages of my book").entries[0]!
        .matchedMemoryId,
    ).toBe(memories[0]!.id);
    const missing = validatePlan(
      { entries: [entry("Unknown Novel", command())] },
      [],
      true,
      "Finished my book",
    );
    expect(missing.entries[0]!.clarificationQuestion).toContain("Which title");
  });

  it("does not treat a title substring inside a word as evidence", () => {
    const a = capture([], entry("Up", command({ kind: "movie" })), "Watched some Up");
    const memories = capture(
      a,
      entry("The River", command({ kind: "movie" })),
      "Watched some The River",
    );
    const plan = validatePlan(
      { entries: [entry("Up", command({ kind: "movie" }), { matchedMemoryId: a[0]!.id })] },
      memories,
      true,
      "Updated my movie progress",
    );
    expect(plan.entries[0]!.matchedMemoryId).toBeNull();
  });

  it("does not equate a different named book or an explicitly excluded title with the only catalog item", () => {
    const memories = capture([], entry("The River", command()), "Read The River");
    const proposal = entry("The River", command(), { matchedMemoryId: memories[0]!.id });
    for (const text of [
      "Read the book Amber Orchard",
      "Read my novel Amber Orchard",
      "Read another book, not The River",
    ]) {
      expect(
        validatePlan({ entries: [proposal] }, memories, true, text).entries[0]!.matchedMemoryId,
      ).toBeNull();
    }
  });

  it("does not trust an AI-selected ID when two tracked subjects have the same title", () => {
    const first = capture([], entry("Sapiens", command({ progress: 10 })), "First edition");
    const state = applyCapturePlan(
      first,
      { entries: [entry("Sapiens", command({ progress: 80 }))] },
      "Second edition",
    );
    const plan = validatePlan(
      {
        entries: [
          entry("Reading more Sapiens", command({ progress: 5 }), {
            matchedMemoryId: first[0]!.id,
          }),
        ],
      },
      state,
    );
    expect(plan.entries[0]?.matchedMemoryId).toBeNull();
    expect(new Set(plan.entries[0]?.candidateMemoryIds)).toEqual(new Set(state.map((m) => m.id)));
    expect(plan.entries[0]?.clarificationQuestion).toContain("Which one");
    expect(() => applyCapturePlan(state, plan, "Read 5")).toThrow("Choose");
    const reviewed = structuredClone(plan);
    reviewed.entries[0]!.matchedMemoryId = first[0]!.id;
    reviewed.entries[0]!.title = first[0]!.title;
    reviewed.entries[0]!.titleReviewRequired = false;
    expect(
      applyCapturePlan(state, reviewed, "Read 5").find((m) => m.id === first[0]!.id)?.activity
        ?.progress,
    ).toBe(15);
  });

  it.each(["plain", "encrypted"] as const)(
    "retains four independent subjects, histories and corrections after a %s reload",
    async (mode) => {
      let state: Memory[] = [];
      for (const pages of [20, 30, 10])
        state = capture(
          state,
          entry("Sapiens", command({ progress: pages })),
          `Read ${pages} pages`,
        );
      state = capture(
        state,
        entry("Sapiens", command({ progress: 100, progressMode: "absolute" })),
        "Actually on page 100",
      );
      state = capture(state, entry("Sapiens", command({ progress: 5 })), "Read 5 more pages");
      for (const lessons of [
        [1, 2],
        [2, 3],
        [1, 3, 4],
      ])
        state = capture(
          state,
          entry("Practical AI", command({ kind: "course", lessonNumbers: lessons, total: 12 })),
          "Completed listed lessons",
        );
      for (let n = 0; n < 3; n++)
        state = capture(
          state,
          entry("Imagine", command({ kind: "music", intent: "listen", creator: "John Lennon" })),
          "Listened to Imagine",
        );
      state = capture(
        state,
        entry("Imagine", command({ kind: "music", intent: "progress", sentiment: "loved" })),
        "Loved Imagine",
      );
      for (const minutes of [10, 15])
        state = capture(
          state,
          entry("Dune", command({ kind: "movie", progress: minutes })),
          "Watched more Dune",
        );
      state = capture(
        state,
        entry("Dune", command({ kind: "movie", progress: 40, progressMode: "absolute" })),
        "Up to minute 40",
      );
      state = capture(
        state,
        entry("Dune", command({ kind: "movie", progress: 5 })),
        "Watched 5 more minutes",
      );
      expect(state).toHaveLength(4);
      expect(state.find((m) => m.title === "Sapiens")?.activity?.progress).toBe(105);
      expect(state.find((m) => m.title === "Practical AI")?.activity?.completedLessons).toEqual([
        1, 2, 3, 4,
      ]);
      expect(state.find((m) => m.title === "Imagine")?.activity).toMatchObject({
        progress: 3,
        sentiment: "loved",
        status: "completed",
      });
      expect(state.find((m) => m.title === "Dune")?.activity?.progress).toBe(45);
      expect(state.find((m) => m.title === "Sapiens")?.activity?.history).toHaveLength(5);
      expect(state.find((m) => m.title === "Sapiens")?.transcripts).toHaveLength(5);
      const passphrase = "fictional journey passphrase";
      if (mode === "encrypted") await encryptVault(state, passphrase);
      else await saveVault(state);
      const envelope = await readVault();
      lockVault();
      expect(
        (await openEnvelope(envelope, mode === "encrypted" ? passphrase : undefined)).data,
      ).toEqual(state);
      if (mode === "encrypted") expect(JSON.stringify(envelope)).not.toContain("Sapiens");
    },
  );
  it("requires review of an event headline before updating the stable tracked title", () => {
    const state = capture([], entry("Sapiens", command({ progress: 30 })), "Read 30");
    const plan = validatePlan(
      {
        entries: [
          entry("Reading more Sapiens", command({ progress: 10 }), {
            matchedMemoryId: state[0]!.id,
          }),
        ],
      },
      state,
    );
    expect(() => applyCapturePlan(state, plan, "Read 10")).toThrow("Choose the matching item");
    expect(state[0]?.activity?.progress).toBe(30);
    const reviewed = structuredClone(plan);
    Object.assign(reviewed.entries[0]!, {
      title: state[0]!.title,
      matchedMemoryId: state[0]!.id,
      candidateMemoryIds: [],
      clarificationQuestion: null,
      titleReviewRequired: false,
    });
    const next = applyCapturePlan(state, reviewed, "Read 10");
    expect(next).toHaveLength(1);
    expect(next[0]?.title).toBe("Sapiens");
    expect(next[0]?.activity?.progress).toBe(40);
  });
  it("creates a separate daily experience even if a model tries to merge it into a person", () => {
    const state = capture(
      [],
      entry("Mary is my best friend", null, { category: "PERSON" }),
      "Mary is my best friend",
    );
    const next = capture(
      state,
      entry("Coffee with Mary", null, { matchedMemoryId: state[0]!.id }),
      "Coffee with Mary",
    );
    expect(next).toHaveLength(2);
    expect(next.find((m) => m.category === "PERSON")?.summary).toBe(state[0]?.summary);
  });
  it("requires a choice for two identical book titles and preserves both until selection", () => {
    const first = capture([], entry("Sapiens", command({ progress: 10 })), "First edition");
    const second = applyCapturePlan(
      first,
      { entries: [entry("Sapiens", command({ progress: 80 }))] },
      "Second edition",
    );
    const plan = validatePlan({ entries: [entry("Sapiens", command({ progress: 5 }))] }, second);
    expect(plan.entries[0]?.candidateMemoryIds).toHaveLength(2);
    expect(() => applyCapturePlan(second, plan, "Read 5")).toThrow("Choose");
    const selected = structuredClone(plan);
    selected.entries[0]!.matchedMemoryId = first[0]!.id;
    const next = applyCapturePlan(second, selected, "Read 5");
    expect(next.find((m) => m.id === first[0]!.id)?.activity?.progress).toBe(15);
    expect(next.find((m) => m.id !== first[0]!.id)?.activity?.progress).toBe(80);
  });
  it("keeps the same title as a movie and a book independently", () => {
    let state = capture(
      [],
      entry("Dune", command({ kind: "movie", intent: "wishlist" })),
      "Want the film",
    );
    state = capture(state, entry("Dune", command({ kind: "book", progress: 50 })), "Read the book");
    state = capture(
      state,
      entry("Dune", command({ kind: "movie", progress: 20 })),
      "Watched 20 minutes",
    );
    expect(state).toHaveLength(2);
    expect(state.find((m) => m.activity?.kind === "book")?.activity?.progress).toBe(50);
    expect(state.find((m) => m.activity?.kind === "movie")?.activity?.progress).toBe(20);
  });
  it("applies repeated new-subject events in review order and retains their history after reload", async () => {
    const transcript = "Read 10 pages of Dune; then 20 more; actually on page 25; then 5 more.";
    const summaries = ["Read 10 pages", "Read 20 more", "Actually on page 25", "Read 5 more"];
    const plan = {
      entries: [
        entry("Dune", command({ progress: 10 }), { summary: summaries[0]! }),
        entry(" dune ", command({ progress: 20 }), { summary: summaries[1]! }),
        entry("Dune", command({ progress: 25, progressMode: "absolute" }), {
          summary: summaries[2]!,
        }),
        entry("Dune", command({ progress: 5 }), { summary: summaries[3]! }),
      ],
    };
    const original = JSON.stringify(plan);
    const next = applyCapturePlan([], plan, transcript);
    expect(next).toHaveLength(1);
    expect(next[0]?.title).toBe("Dune");
    expect(next[0]?.activity?.progress).toBe(30);
    expect(next[0]?.activity?.history.map((event) => event.text)).toEqual(summaries);
    expect(next[0]?.transcripts).toEqual([transcript]);
    expect(JSON.stringify(plan)).toBe(original);
    await saveVault(next);
    expect((await openEnvelope(await readVault())).data).toEqual(next);
  });
  it("never reconciles different kinds or ordinary memories with the same title", () => {
    const next = applyCapturePlan(
      [],
      {
        entries: [
          entry("Dune", command({ progress: 10 })),
          entry("Dune", command({ kind: "movie", progress: 20 })),
          entry("Dune", null),
          entry("Dune", null),
        ],
      },
      "Read Dune, watched Dune, and two ordinary memories.",
    );
    expect(next).toHaveLength(4);
    expect(next.filter((memory) => !memory.activity)).toHaveLength(2);
    expect(next.find((memory) => memory.activity?.kind === "book")?.activity?.progress).toBe(10);
    expect(next.find((memory) => memory.activity?.kind === "movie")?.activity?.progress).toBe(20);
  });
  it("reconciles only newly created records, preserving an explicit new-record choice", () => {
    const state = capture([], entry("Dune", command({ progress: 80 })), "First edition");
    const next = applyCapturePlan(
      state,
      {
        entries: [
          entry("Dune", command({ progress: 10 })),
          entry("Dune", command({ progress: 20 })),
        ],
      },
      "Read a different copy of Dune, then 20 more pages.",
    );
    expect(next).toHaveLength(2);
    expect(next.find((memory) => memory.id === state[0]!.id)?.activity?.progress).toBe(80);
    const created = next.find((memory) => memory.id !== state[0]!.id)!;
    expect(created.activity?.progress).toBe(30);
    expect(created.activity?.history).toHaveLength(2);
    expect(created.transcripts).toHaveLength(1);
  });
  it.each([{ titleReviewRequired: true }, { intentReviewRequired: true }])(
    "does not bypass unresolved review when a prior row created the subject: %j",
    (review) => {
      const state = capture([], entry("Other book", command({ progress: 80 })), "Existing record");
      const original = JSON.stringify(state);
      expect(() =>
        applyCapturePlan(
          state,
          {
            entries: [
              entry("Dune", command({ progress: 10 })),
              entry("Dune", command({ progress: 20 }), review),
            ],
          },
          "Unresolved repeated title",
        ),
      ).toThrow("before saving");
      expect(JSON.stringify(state)).toBe(original);
    },
  );
  it("asks for review instead of merging same-title works with conflicting explicit creators", () => {
    expect(() =>
      applyCapturePlan(
        [],
        {
          entries: [
            entry("The River", command({ creator: "Avery North", progress: 10 })),
            entry("The River", command({ creator: "Robin South", progress: 20 })),
          ],
        },
        "Two different books named The River",
      ),
    ).toThrow("different creators");
  });
  it("retains reducer validation and atomicity when a later reconciled event is contradictory", async () => {
    const state = capture([], entry("Other book", command({ progress: 80 })), "Existing record");
    await saveVault(state);
    const original = JSON.stringify(state);
    expect(() =>
      applyCapturePlan(
        state,
        {
          entries: [
            entry("Dune", command({ progress: 10 })),
            entry("Dune", command({ intent: "reaction", progress: 20 })),
          ],
        },
        "Invalid reaction with progress",
      ),
    ).toThrow("reaction cannot change progress");
    expect(JSON.stringify(state)).toBe(original);
    expect((await openEnvelope(await readVault())).data).toEqual(state);
  });
  it("does not mutate or partially save earlier entries when a later entry has an invalid lesson", async () => {
    const state = capture(
      [],
      entry("Practical AI", command({ kind: "course", total: 3, lessonNumbers: [1] })),
      "Lesson 1",
    );
    await saveVault(state);
    const original = JSON.stringify(state);
    expect(() =>
      applyCapturePlan(
        state,
        {
          entries: [
            entry("New book", command({ progress: 20 })),
            entry("Practical AI", command({ kind: "course", lessonNumbers: [4] }), {
              matchedMemoryId: state[0]!.id,
            }),
          ],
        },
        "Mixed input",
      ),
    ).toThrow("exceeds");
    expect(JSON.stringify(state)).toBe(original);
    expect((await openEnvelope(await readVault())).data).toEqual(state);
  });
  it.each([-1, 100001, NaN, Infinity])(
    "rejects invalid proposed progress %s before changing records",
    (progress) => {
      const state = capture([], entry("Sapiens", command({ progress: 30 })), "Initial");
      const copy = JSON.stringify(state);
      expect(() =>
        capture(state, entry("Sapiens", command({ progress })), "Bad progress"),
      ).toThrow();
      expect(JSON.stringify(state)).toBe(copy);
    },
  );
  it("blocks a plan at capacity without losing the existing 200 memories", () => {
    const one = capture([], entry("Daily moment", null), "A moment")[0]!;
    const state = Array.from({ length: 200 }, (_, i) => ({
      ...one,
      id: `memory-${i}`,
      title: `Moment ${i}`,
    }));
    expect(() => capture(state, entry("New daily moment", null), "Another moment")).toThrow(
      "200 memories",
    );
    expect(state).toHaveLength(200);
  });
  it("ignores duplicate candidates and filters hallucinated candidate IDs", () => {
    const state = capture([], entry("Sapiens", command({ progress: 30 })), "Initial");
    const plan = validatePlan(
      {
        entries: [
          entry("Sapiens", command({ progress: 5 }), {
            candidateMemoryIds: [state[0]!.id, state[0]!.id, "invented-id"],
          }),
        ],
      },
      state,
    );
    expect(plan.entries[0]?.candidateMemoryIds).toEqual([state[0]!.id]);
    expect(() => applyCapturePlan(state, plan, "More")).toThrow("Choose");
  });
  it("does not silently update another kind when the model matches a movie to a book", () => {
    const state = capture([], entry("Dune", command({ kind: "book", progress: 50 })), "Read book");
    const plan = validatePlan(
      {
        entries: [
          entry("Dune", command({ kind: "movie", intent: "complete" }), {
            matchedMemoryId: state[0]!.id,
          }),
        ],
      },
      state,
    );
    expect(plan.entries[0]?.matchedMemoryId).toBeNull();
    expect(plan.entries[0]?.clarificationQuestion).toContain("another type");
  });
  it("retains the completed status and play count when only a music preference changes", () => {
    let state = capture(
      [],
      entry("Imagine", command({ kind: "music", intent: "listen" })),
      "Played once",
    );
    state = capture(
      state,
      entry("Imagine", command({ kind: "music", sentiment: "disliked" })),
      "Did not enjoy it",
    );
    expect(state[0]?.activity).toMatchObject({
      progress: 1,
      status: "completed",
      sentiment: "disliked",
    });
  });
});
