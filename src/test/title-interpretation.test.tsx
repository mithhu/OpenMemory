import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { CaptureReview } from "../components/CaptureReview";
import { applyCapturePlan, validatePlan, type CaptureEntry } from "../lib/capture-plan";
import { planWithProvider } from "../lib/ai-client";
import { type Memory } from "../lib/memory";
import {
  titleInterpretationJson,
  attachTitleCorrections,
  interpretCaptureTitles,
} from "../lib/title-interpretation";
import { localStructuredSchema } from "./support/local-schema";

vi.mock("../lib/astra", () => ({
  planCapture: vi.fn(),
  connectMemories: vi.fn(),
  mapMemories: vi.fn(),
  discoverLibrary: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

const note = "I red 20 more pgaes of Sapens.";
function proposal(): CaptureEntry {
  return {
    title: "Sapiens",
    summary: "Read 20 more pages of Sapiens.",
    category: "BOOK",
    date: "2026-10-09",
    matchedMemoryId: null,
    candidateMemoryIds: [],
    clarificationQuestion: null,
    tags: [],
    activity: {
      kind: "book",
      intent: "progress",
      progress: 20,
      progressMode: "increment",
      total: null,
      lessonNumbers: [],
      sentiment: null,
      creator: null,
    },
    titleSuggestion: {
      sourceTitle: "Sapens",
      suggestedTitle: "Sapiens",
      basis: "model",
      catalogMemoryId: null,
      decision: "pending",
    },
  };
}
function existing(): Memory {
  const p = proposal();
  p.titleSuggestion = null;
  return applyCapturePlan([], { entries: [p] }, "Read 20 pages of Sapiens.")[0]!;
}
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("Language-model title suggestions require source evidence and user choice", () => {
  it("preserves nullable activity requirements without mutating the provider schema", () => {
    const original = {
      anyOf: [
        {
          type: "object",
          properties: { kind: { enum: ["book"] } },
          required: ["kind"],
          additionalProperties: false,
        },
        { type: "null" },
      ],
    };
    const copy = structuredClone(original);
    expect(localStructuredSchema(original)).toEqual({
      type: ["object", "null"],
      properties: { kind: { enum: ["book"] } },
      required: ["kind"],
      additionalProperties: false,
    });
    expect(original).toEqual(copy);
    const union = { anyOf: [{ type: "string" }, { type: "number" }] };
    expect(localStructuredSchema(union)).toEqual(union);
  });
  it("requires the suggestion field in the model contract", () => {
    expect(titleInterpretationJson.required).toContain("titles");
  });
  it("retains the pending media correction when its ordinary neighbor's null row is omitted", async () => {
    const media: CaptureEntry = {
      ...proposal(),
      title: "Spirited Away",
      category: "MOVIE",
      activity: { ...proposal().activity!, kind: "movie", intent: "wishlist", progress: null },
      titleSuggestion: null,
    };
    const person: CaptureEntry = {
      ...proposal(),
      title: "Neravi",
      category: "PERSON",
      activity: null,
      titleSuggestion: null,
    };
    const text = "Neravi is my friend. I want to watch Spiritted Away.";
    const result = await interpretCaptureTitles(
      { entries: [person, media] },
      text,
      [],
      async () => ({
        titles: [{ entryIndex: 1, sourceTitle: "Spiritted Away", suggestedTitle: "Spirited Away" }],
      }),
    );
    expect(result.entries[0]).toEqual(person);
    expect(result.entries[1]!.titleSuggestion).toMatchObject({
      sourceTitle: "Spiritted Away",
      suggestedTitle: "Spirited Away",
      decision: "pending",
    });
    expect(result.entries[1]!.activity).toEqual(media.activity);
    expect(() => applyCapturePlan([], result, text)).toThrow("Confirm the suggested title");
  });
  it("requires review when the extracted title ends inside an original misspelled word", () => {
    const entry = { ...proposal(), title: "The Hobbit", titleSuggestion: null };
    const plan = validatePlan({ entries: [entry] }, [], true, "I finished The Hobbitt.");
    expect(plan.entries[0]!.titleReviewRequired).toBe(true);
    expect(() => applyCapturePlan([], plan, "I finished The Hobbitt.")).toThrow(
      "Check the media title",
    );
    expect(() =>
      attachTitleCorrections(
        {
          corrections: [
            { entryIndex: 0, sourceTitle: "The Hobbit", suggestedTitle: "The Hobbitt" },
          ],
        },
        { entries: [entry] },
        "I finished The Hobbitt.",
        [],
      ),
    ).toThrow("grounded");
  });
  it("retains validated extraction for explicit review when title evidence invents a source", async () => {
    const memory = existing();
    const original = proposal();
    original.titleSuggestion = null;
    original.matchedMemoryId = memory.id;
    const plan = { entries: [original] };
    const result = await interpretCaptureTitles(plan, note, [memory], async () => ({
      titles: [{ entryIndex: 0, sourceTitle: "Sapiens", suggestedTitle: "Sapiens" }],
    }));
    expect(result.entries[0]).toMatchObject({
      title: "Sapiens",
      titleSuggestion: null,
      titleReviewRequired: true,
      matchedMemoryId: null,
      candidateMemoryIds: [],
    });
    expect(result.entries[0]!.activity).toEqual(original.activity);
    expect(original.matchedMemoryId).toBe(memory.id);
    expect(original.titleReviewRequired).toBeUndefined();
    expect(() => applyCapturePlan([memory], result, note)).toThrow("Check the media title");
    const save = vi.fn().mockResolvedValue(true);
    render(
      <CaptureReview
        plan={result}
        text={note}
        memories={[memory]}
        onSave={save}
        onCancel={() => {}}
      />,
    );
    expect(screen.getByRole("button", { name: "Save 1 entry" })).toBeDisabled();
    expect(
      within(screen.getByRole("group", { name: "Entry 1 question" })).getByText(
        /AI title check couldn't verify/,
      ),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Confirm “Sapiens”" }));
    fireEvent.click(screen.getByRole("button", { name: "Save 1 entry" }));
    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    const saved = applyCapturePlan([memory], save.mock.calls[0]![0], note);
    expect(saved).toHaveLength(2);
    expect(saved.find((m) => m.id === memory.id)!.activity!.progress).toBe(20);
    expect(saved.find((m) => m.id !== memory.id)!.transcripts).toContain(note);
  });
  it.each([new Error("Local request failed"), new DOMException("Stopped", "AbortError")])(
    "propagates title request failure without inventing a review",
    async (error) => {
      const entry = { ...proposal(), titleSuggestion: null };
      await expect(
        interpretCaptureTitles({ entries: [entry] }, note, [], async () => {
          throw error;
        }),
      ).rejects.toBe(error);
      expect(entry.titleSuggestion).toBeNull();
    },
  );
  it.each([
    null,
    { titles: [] },
    { titles: [{ entryIndex: 4, sourceTitle: "Sapens", suggestedTitle: "Sapiens" }] },
  ])(
    "recovers malformed evidence as title review while preserving ordinary entries",
    async (raw) => {
      const media = { ...proposal(), titleSuggestion: null };
      const person: CaptureEntry = {
        ...proposal(),
        title: "Neravi",
        category: "PERSON",
        activity: null,
        titleSuggestion: null,
      };
      const result = await interpretCaptureTitles(
        { entries: [media, person] },
        `${note} Neravi is my friend.`,
        [],
        async () => raw,
      );
      expect(result.entries[0]!.titleReviewRequired).toBe(true);
      expect(result.entries[0]!.titleSuggestion).toBeNull();
      expect(result.entries[1]).toEqual(person);
      expect(() => applyCapturePlan([], result, note)).toThrow("Check the media title");
    },
  );
  it("requires title confirmation when evidence is missing even if a generic title appears in the note", async () => {
    const text = "I want to read a book.";
    const entry = { ...proposal(), title: "Book", titleSuggestion: null };
    const plan = validatePlan({ entries: [entry] }, [], true, text);
    expect(plan.entries[0]!.titleReviewRequired).toBe(false);
    const result = await interpretCaptureTitles(plan, text, [], async () => ({
      titles: [{ entryIndex: 0, sourceTitle: null, suggestedTitle: null }],
    }));
    expect(result.entries[0]!.titleReviewRequired).toBe(true);
    expect(result.entries[0]!.activity).toEqual(plan.entries[0]!.activity);
    expect(() => applyCapturePlan([], result, text)).toThrow("Check the media title");
    expect(plan.entries[0]!.titleReviewRequired).toBe(false);
  });
  it("keeps both catalog choices when an ambiguous reference gets invented title evidence", async () => {
    const text = "I finished it.";
    const memories = [
      { ...existing(), id: "book-a", title: "Copper Orchard" },
      { ...existing(), id: "book-b", title: "Silver Meadow" },
    ];
    const entry = {
      ...proposal(),
      title: "Copper Orchard",
      titleSuggestion: null,
      matchedMemoryId: "book-a",
      activity: { ...proposal().activity!, intent: "complete" as const, progress: null },
    };
    const plan = validatePlan({ entries: [entry] }, memories, true, text);
    expect(plan.entries[0]!.candidateMemoryIds).toEqual(["book-a", "book-b"]);
    const result = await interpretCaptureTitles(plan, text, memories, async () => ({
      titles: [{ entryIndex: 0, sourceTitle: "Copper Orchard", suggestedTitle: "Copper Orchard" }],
    }));
    expect(result.entries[0]!.candidateMemoryIds).toEqual(["book-a", "book-b"]);
    expect(result.entries[0]!.matchedMemoryId).toBeNull();
    expect(result.entries[0]!.titleReviewRequired).toBe(true);
    expect(() => applyCapturePlan(memories, result, text)).toThrow();
    expect(memories.map((memory) => memory.activity!.status)).toEqual([
      "in-progress",
      "in-progress",
    ]);
  });
  it("does not treat another unchanged title as evidence for this entry in a mixed note", async () => {
    const text = "I read Sapiens and Animal Farm.";
    const entries = ["Sapiens", "Animal Farm"].map((title) => ({
      ...proposal(),
      title,
      titleSuggestion: null,
    }));
    const plan = validatePlan({ entries }, [], true, text);
    const result = await interpretCaptureTitles(plan, text, [], async () => ({
      titles: [
        { entryIndex: 0, sourceTitle: "Animal Farm", suggestedTitle: "Animal Farm" },
        { entryIndex: 1, sourceTitle: "Animal Farm", suggestedTitle: "Animal Farm" },
      ],
    }));
    expect(result.entries[0]!.titleReviewRequired).toBe(true);
    expect(result.entries[1]!.titleReviewRequired).toBe(false);
    expect(result.entries.map((entry) => entry.title)).toEqual(["Sapiens", "Animal Farm"]);
    expect(() => applyCapturePlan([], result, text)).toThrow("Check the media title");
  });
  it("preserves unfamiliar explicit titles without an unnecessary correction or confirmation", async () => {
    const text = "I read Zavreth.";
    const plan = validatePlan(
      { entries: [{ ...proposal(), title: "Zavreth", titleSuggestion: null }] },
      [],
      true,
      text,
    );
    const result = await interpretCaptureTitles(plan, text, [], async () => ({
      titles: [{ entryIndex: 0, sourceTitle: "Zavreth", suggestedTitle: "Zavreth" }],
    }));
    expect(result.entries[0]!.titleReviewRequired).toBe(false);
    expect(result.entries[0]!.titleSuggestion).toBeNull();
    expect(result.entries[0]!.title).toBe("Zavreth");
    expect(() => applyCapturePlan([], result, text)).not.toThrow();
  });
  it("title interpretation changes no quantity, intent or original event details", () => {
    const original = proposal();
    original.title = "Sapens";
    original.titleSuggestion = null;
    const result = attachTitleCorrections(
      { corrections: [{ entryIndex: 0, sourceTitle: "Sapens", suggestedTitle: "Sapiens" }] },
      { entries: [original] },
      note,
      [],
    );
    expect(result.entries[0]!.activity).toEqual(original.activity);
    expect(result.entries[0]!.summary).toEqual(original.summary);
    expect(original.title).toBe("Sapens");
    expect(result.entries[0]!.titleSuggestion!.decision).toBe("pending");
  });
  it("unreported title changes still require explicit review", async () => {
    const p = proposal();
    p.titleSuggestion = null;
    const plan = validatePlan({ entries: [p] }, [], true, note);
    expect(plan.entries[0]!.titleReviewRequired).toBe(true);
    expect(() => applyCapturePlan([], plan, note)).toThrow("Check the media title");
    const save = vi.fn().mockResolvedValue(true);
    render(
      <CaptureReview plan={plan} text={note} memories={[]} onSave={save} onCancel={() => {}} />,
    );
    expect(screen.getByRole("button", { name: "Save 1 entry" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Confirm “Sapiens”" }));
    fireEvent.click(screen.getByRole("button", { name: "Save 1 entry" }));
    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    expect(() => applyCapturePlan([], save.mock.calls[0]![0], note)).not.toThrow();
  });
  it("cannot attach another subject's correction just because its spelling occurs in a mixed note", () => {
    const first = proposal();
    first.title = "Sapens";
    first.titleSuggestion = null;
    const second = { ...proposal(), title: "Animall Farm", titleSuggestion: null };
    expect(() =>
      attachTitleCorrections(
        { corrections: [{ entryIndex: 1, sourceTitle: "Sapens", suggestedTitle: "Sapiens" }] },
        { entries: [first, second] },
        "I read Sapens and Animall Farm.",
        [],
      ),
    ).toThrow("didn't match this entry");
    expect(first.title).toBe("Sapens");
    expect(second.title).toBe("Animall Farm");
  });
  it("still compares original spelling when extraction has already normalized the title", () => {
    const entry = proposal();
    entry.titleSuggestion = null;
    const result = attachTitleCorrections(
      { corrections: [{ entryIndex: 0, sourceTitle: "Sapens", suggestedTitle: "Sapiens" }] },
      { entries: [entry] },
      note,
      [],
    );
    expect(result.entries[0]!.titleSuggestion).toMatchObject({
      sourceTitle: "Sapens",
      suggestedTitle: "Sapiens",
      decision: "pending",
    });
    expect(result.entries[0]!.activity).toEqual(entry.activity);
  });
  it("an implicit reference to a saved item still needs title confirmation", async () => {
    const memory = existing();
    const p = proposal();
    p.titleSuggestion = null;
    p.matchedMemoryId = memory.id;
    const plan = validatePlan({ entries: [p] }, [memory], true, "I read 20 more pages of it.");
    expect(plan.entries[0]!.titleReviewRequired).toBe(true);
    expect(() => applyCapturePlan([memory], plan, "I read 20 more pages of it.")).toThrow("Check");
    const save = vi.fn().mockResolvedValue(true);
    render(
      <CaptureReview
        plan={plan}
        text="I read 20 more pages of it."
        memories={[memory]}
        onSave={save}
        onCancel={() => {}}
      />,
    );
    fireEvent.change(screen.getByLabelText("Save to"), { target: { value: memory.id } });
    fireEvent.click(screen.getByRole("button", { name: "Save 1 entry" }));
    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    expect(() =>
      applyCapturePlan([memory], save.mock.calls[0]![0], "I read 20 more pages of it."),
    ).not.toThrow();
  });
  it("rejects repeated correction indices and invented source spans atomically", () => {
    const original = proposal();
    original.titleSuggestion = null;
    const correction = { entryIndex: 0, sourceTitle: "Sapens", suggestedTitle: "Sapiens" };
    expect(() =>
      attachTitleCorrections(
        { corrections: [correction, correction] },
        { entries: [original] },
        note,
        [],
      ),
    ).toThrow("invalid entry");
    expect(() =>
      attachTitleCorrections(
        { corrections: [{ ...correction, sourceTitle: "Sappho" }] },
        { entries: [original] },
        note,
        [],
      ),
    ).toThrow("grounded");
    expect(original.titleSuggestion).toBeNull();
  });
  it("changing a pending media proposal to a life note restores the original spelling", async () => {
    const save = vi.fn().mockResolvedValue(true);
    render(
      <CaptureReview
        plan={{ entries: [proposal()] }}
        text={note}
        memories={[]}
        onSave={save}
        onCancel={() => {}}
      />,
    );
    fireEvent.change(screen.getByLabelText("Entry 1 type"), { target: { value: "NOTE" } });
    fireEvent.click(screen.getByRole("button", { name: "Save 1 entry" }));
    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    expect(save.mock.calls[0]![0].entries[0]).toMatchObject({
      title: "Sapens",
      titleSuggestion: null,
      activity: null,
    });
  });
  it("accepting a title shared by two records still requires choosing the intended record", async () => {
    const a = existing();
    const b = { ...a, id: "other-edition" };
    const save = vi.fn().mockResolvedValue(true);
    render(
      <CaptureReview
        plan={{ entries: [proposal()] }}
        text={note}
        memories={[a, b]}
        onSave={save}
        onCancel={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Use “Sapiens”" }));
    expect(screen.getByRole("button", { name: "Save 1 entry" })).toBeDisabled();
    expect(screen.getByLabelText("Save to")).toHaveValue("__unresolved__");
    expect(save).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Save to"), { target: { value: a.id } });
    fireEvent.click(screen.getByRole("button", { name: "Save 1 entry" }));
    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    const next = applyCapturePlan([a, b], save.mock.calls[0]![0], note);
    expect(next.find((memory) => memory.id === a.id)?.activity?.progress).toBe(40);
    expect(next.find((memory) => memory.id === b.id)).toEqual(b);
  });
  it("makes a catalog-backed typo correction pending without updating history", () => {
    const memory = existing();
    const p = proposal();
    p.matchedMemoryId = memory.id;
    p.titleSuggestion = {
      ...p.titleSuggestion!,
      basis: "catalog",
      catalogMemoryId: memory.id,
      decision: "accepted",
    };
    const result = validatePlan({ entries: [p] }, [memory], true, note);
    expect(result.entries[0]).toMatchObject({
      matchedMemoryId: null,
      candidateMemoryIds: [],
      titleSuggestion: { decision: "pending" },
    });
    expect(() => applyCapturePlan([memory], result, note)).toThrow("Confirm the suggested title");
    expect(memory.activity!.progress).toBe(20);
  });
  it.each([
    { sourceTitle: "invented source" },
    { suggestedTitle: "another title" },
    { basis: "catalog", catalogMemoryId: "missing" },
    { catalogMemoryId: "invented" },
  ])("rejects ungrounded or inconsistent proposals %j", (change) => {
    const p = proposal();
    p.titleSuggestion = { ...p.titleSuggestion!, ...change } as CaptureEntry["titleSuggestion"];
    expect(() => validatePlan({ entries: [p] }, [], true, note)).toThrow();
  });
  it("rejects corrections for a person or an ordinary note", () => {
    const p = proposal();
    p.activity = null;
    p.category = "PERSON";
    expect(() => validatePlan({ entries: [p] }, [], true, note)).toThrow("grounded");
  });
  it("rejects catalog evidence for a different kind", () => {
    const memory = existing();
    const p = proposal();
    p.activity!.kind = "movie";
    p.category = "MOVIE";
    p.titleSuggestion = { ...p.titleSuggestion!, basis: "catalog", catalogMemoryId: memory.id };
    expect(() => validatePlan({ entries: [p] }, [memory], true, note)).toThrow("saved item");
  });
  it("acceptance updates exactly the intended item and retains original words and numbers", async () => {
    const memory = existing();
    const save = vi.fn().mockResolvedValue(true);
    render(
      <CaptureReview
        plan={{ entries: [proposal()] }}
        text={note}
        memories={[memory]}
        onSave={save}
        onCancel={() => {}}
      />,
    );
    expect(screen.getByRole("button", { name: "Save 1 entry" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Use “Sapiens”" }));
    fireEvent.click(screen.getByRole("button", { name: "Save 1 entry" }));
    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    const updated = applyCapturePlan([memory], save.mock.calls[0]![0], note);
    expect(updated).toHaveLength(1);
    expect(updated[0]!.id).toBe(memory.id);
    expect(updated[0]!.activity!.progress).toBe(40);
    expect(updated[0]!.transcripts.at(-1)).toBe(note);
  });
  it("keeping the original spelling creates a separate memory and leaves existing progress alone", async () => {
    const memory = existing();
    const save = vi.fn().mockResolvedValue(true);
    render(
      <CaptureReview
        plan={{ entries: [proposal()] }}
        text={note}
        memories={[memory]}
        onSave={save}
        onCancel={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Keep “Sapens”" }));
    fireEvent.click(screen.getByRole("button", { name: "Save 1 entry" }));
    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    const result = applyCapturePlan([memory], save.mock.calls[0]![0], note);
    expect(result).toHaveLength(2);
    expect(result.find((m) => m.id === memory.id)!.activity!.progress).toBe(20);
    expect(result.find((m) => m.id !== memory.id)).toMatchObject({
      title: "Sapens",
      summary: "Read 20 more pages of Sapens.",
    });
  });
  it("editing a suggested title clears the suggestion and the automatic match", async () => {
    const save = vi.fn().mockResolvedValue(true);
    render(
      <CaptureReview
        plan={{ entries: [proposal()] }}
        text={note}
        memories={[existing()]}
        onSave={save}
        onCancel={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Use “Sapiens”" }));
    fireEvent.change(screen.getByLabelText("Entry 1 title"), {
      target: { value: "My uncommon book" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save 1 entry" }));
    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    expect(save.mock.calls[0]![0].entries[0]).toMatchObject({
      title: "My uncommon book",
      titleSuggestion: null,
      matchedMemoryId: null,
    });
  });
  it("cannot save an accepted proposal after changing its title programmatically", () => {
    const p = proposal();
    p.titleSuggestion!.decision = "accepted";
    p.title = "Other work";
    expect(() => applyCapturePlan([], { entries: [p] }, note)).toThrow(
      "changed after confirmation",
    );
  });
  it("passes the same grounded correction contract through the local provider without cloud fallback", async () => {
    const requests: unknown[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, options: RequestInit) => {
        if (url.endsWith("/api/show"))
          return new Response(JSON.stringify({ details: { format: "gguf" } }));
        const request = JSON.parse(String(options.body));
        requests.push(request);
        if (request.format.properties.titles)
          return new Response(
            JSON.stringify({
              message: {
                content: JSON.stringify({
                  titles: [{ entryIndex: 0, sourceTitle: "Sapens", suggestedTitle: "Sapiens" }],
                }),
              },
            }),
          );
        return new Response(
          JSON.stringify({ message: { content: JSON.stringify({ entries: [proposal()] }) } }),
        );
      }),
    );
    const plan = await planWithProvider(
      { memories: [], today: "2026-10-09", text: note },
      { provider: "ollama", model: "fictional-local" },
    );
    expect(plan.entries[0]!.titleSuggestion!.decision).toBe("pending");
    expect(requests).toHaveLength(2);
    expect(() => applyCapturePlan([], plan, note)).toThrow("Confirm");
  });
});
