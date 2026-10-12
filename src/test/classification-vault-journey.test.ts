import { webcrypto } from "node:crypto";
import { TextDecoder, TextEncoder } from "node:util";
import { IDBFactory } from "fake-indexeddb";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { applyCapturePlan, type CapturePlan } from "@/lib/capture-plan";
import { memorySchema } from "@/lib/memory";
import {
  assertClassificationReview,
  associateClassification,
  recordClassificationReview,
} from "@/lib/classification";
import {
  encryptVault,
  lockVault,
  openEnvelope,
  readVault,
  saveVault,
  setVaultSession,
} from "@/lib/vault";

const source = "  Read 17 more pages of Glass Orchard.\n";
const password = "fictional classification test password";
const proposal = (): CapturePlan => ({
  entries: [
    {
      title: "Glass Orchard",
      summary: source,
      category: "BOOK",
      date: "2026-10-10",
      matchedMemoryId: null,
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

describe("Classification review through encrypted persistence", () => {
  it("blocks unreviewed disagreement, then retains exact progress and source through reload", async () => {
    const initial = proposal();
    initial.entries[0]!.activity!.progress = 50;
    const saved = applyCapturePlan([], initial, "Read 50 pages of Glass Orchard.");
    await encryptVault(saved, password);
    const before = await readVault();
    const plan = proposal();
    plan.entries[0]!.matchedMemoryId = saved[0]!.id;
    const metadata = associateClassification(source, { category: "MUSIC", intent: "wishlist" });
    expect(() => assertClassificationReview(plan, source, metadata)).toThrow();
    expect(await readVault()).toEqual(before);
    expect(saved[0]!.activity!.progress).toBe(50);

    const review = recordClassificationReview(plan, source, metadata, true);
    assertClassificationReview(plan, source, metadata, review);
    await saveVault(applyCapturePlan(saved, plan, source));
    lockVault();
    const envelope = await readVault();
    expect(envelope?.encrypted).toBe(true);
    expect(JSON.stringify(envelope)).not.toContain(source);
    const reopened = memorySchema.array().parse((await openEnvelope(envelope, password)).data);
    expect(reopened).toHaveLength(1);
    expect(reopened[0]!.id).toBe(saved[0]!.id);
    expect(reopened[0]!.category).toBe("BOOK");
    expect(reopened[0]!.activity!.kind).toBe("book");
    expect(reopened[0]!.activity!.progress).toBe(67);
    expect(reopened[0]!.activity!.total).toBe(240);
    expect(reopened[0]!.transcripts.at(-1)).toBe(source);
  });

  it("cannot reuse a receipt to apply a different ID or quantity and leaves the vault untouched", async () => {
    const saved = applyCapturePlan([], proposal(), source);
    await encryptVault(saved, password);
    const before = await readVault();
    const plan = proposal();
    plan.entries[0]!.matchedMemoryId = saved[0]!.id;
    const metadata = associateClassification(source, { category: "BOOK", intent: "progress" });
    const review = recordClassificationReview(plan, source, metadata, false);
    plan.entries[0]!.matchedMemoryId = "another-fictional-book";
    plan.entries[0]!.activity!.progress = 900;
    expect(() => assertClassificationReview(plan, source, metadata, review)).toThrow("proposal");
    expect(await readVault()).toEqual(before);
    lockVault();
    expect((await openEnvelope(await readVault(), password)).data).toEqual(saved);
  });

  it("a classification acknowledgment does not clear extraction's unresolved title/action flags", () => {
    const plan = proposal();
    plan.entries[0]!.intentReviewRequired = true;
    const metadata = associateClassification(source, { category: "BOOK", intent: "clarify" });
    const review = recordClassificationReview(plan, source, metadata, true);
    assertClassificationReview(plan, source, metadata, review);
    expect(() => applyCapturePlan([], plan, source)).toThrow("Choose whether");
    expect(plan.entries[0]!.intentReviewRequired).toBe(true);
  });
});
