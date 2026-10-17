import { demoDismissalKey } from "../components/DemoWelcome";
import { webcrypto } from "node:crypto";
import { TextDecoder, TextEncoder } from "node:util";
import { IDBFactory } from "fake-indexeddb";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Route } from "../routes/index";
import { applyCapturePlan, validatePlan, type CapturePlan } from "../lib/capture-plan";
import {
  encryptVault,
  lockVault,
  openEnvelope,
  readVault,
  saveVault,
  setVaultSession,
} from "../lib/vault";
import { memorySchema, type Memory } from "../lib/memory";
import { saveAISettings } from "../lib/ai-client";
import { planCapture } from "../lib/astra";

// Only the model server transport/status and background graph are mocked. The route,
// review receipts, reducer, unlock, encryption, IndexedDB and settings remain real.
vi.mock("../lib/astra", () => ({
  getAstraStatus: vi.fn(async () => ({ configured: true })),
  planCapture: vi.fn(),
  connectMemories: vi.fn(),
  mapMemories: vi.fn(),
  discoverLibrary: vi.fn(),
}));
vi.mock("../hooks/use-memory-graph", () => ({
  useMemoryGraph: () => ({
    graph: null,
    mapping: false,
    stale: false,
    error: null,
    retry: () => {},
  }),
}));
const password = "fictional route vault password";
const command = (kind: "book" | "movie", progress: number, total: number) => ({
  kind,
  intent: "progress" as const,
  progress,
  total,
  progressMode: "absolute" as const,
  lessonNumbers: [],
  sentiment: null,
  creator: null,
});
const proposal = (
  title: string,
  kind: "book" | "movie",
  progress: number,
  total: number,
): CapturePlan => ({
  entries: [
    {
      title,
      summary: "Earlier partial progress",
      category: kind === "book" ? "BOOK" : "MOVIE",
      date: "2026-10-09",
      matchedMemoryId: null,
      candidateMemoryIds: [],
      clarificationQuestion: null,
      tags: [],
      activity: command(kind, progress, total),
    },
  ],
});
beforeEach(() => {
  vi.stubGlobal("crypto", webcrypto);
  vi.stubGlobal("TextEncoder", TextEncoder);
  vi.stubGlobal("TextDecoder", TextDecoder);
  vi.stubGlobal("indexedDB", new IDBFactory());
  localStorage.clear();
  // Exercise the app as a returning visitor; welcome behavior has its own coverage.
  localStorage.setItem(demoDismissalKey, "dismissed");
  saveAISettings({ provider: "astra", model: "astra" });
  sessionStorage.clear();
  setVaultSession({ key: null, salt: null });
  vi.mocked(planCapture).mockReset();
});
afterEach(() => {
  cleanup();
  lockVault();
  setVaultSession({ key: null, salt: null });
  localStorage.clear();
  sessionStorage.clear();
  vi.unstubAllGlobals();
});
async function installAndUnlock(prior: Memory[]) {
  await saveVault(prior);
  await encryptVault(prior, password);
  lockVault();
  const Component = Route.options.component!;
  render(<Component />);
  fireEvent.change(await screen.findByLabelText("Passphrase"), { target: { value: password } });
  fireEvent.click(screen.getByRole("button", { name: /^Unlock$/ }));
  await screen.findByRole("textbox", { name: "A new memory" });
}
async function reloaded() {
  const envelope = await readVault();
  expect(envelope?.encrypted).toBe(true);
  expect(envelope).not.toHaveProperty("data");
  return memorySchema.array().parse((await openEnvelope(envelope, password)).data);
}
async function submit(source: string, plan: CapturePlan, prior: Memory[]) {
  vi.mocked(planCapture).mockImplementationOnce(async ({ data }) => {
    expect(data.text).toBe(source);
    expect(data.memories).toEqual(prior);
    return validatePlan(plan, data.memories, true, data.text);
  });
  fireEvent.change(screen.getByRole("textbox", { name: "A new memory" }), {
    target: { value: source },
  });
  fireEvent.click(screen.getByRole("button", { name: "Review memory" }));
  await screen.findByRole("button", { name: /Save 1 entry/ });
}
it("actual route preserves exact words and reviewed matched-book increment through encrypted reload", async () => {
  const oldSource = "Reached page 50 of Copper Orchard.";
  const prior = applyCapturePlan([], proposal("Copper Orchard", "book", 50, 240), oldSource);
  const original = structuredClone(prior);
  await installAndUnlock(prior);
  const source = "  Read 17 more pages of Copper Orchard.\n";
  const plan = proposal("Copper Orchard", "book", 17, 240);
  plan.entries[0]!.matchedMemoryId = prior[0]!.id;
  plan.entries[0]!.activity!.progressMode = "increment";
  await submit(source, plan, prior);
  const details = screen.getByRole("textbox", { name: "Entry 1 details" });
  fireEvent.change(details, { target: { value: "Read another 17 pages after dinner." } });
  fireEvent.click(screen.getByRole("button", { name: /Save 1 entry/ }));
  await waitFor(
    () => expect(screen.getByRole("textbox", { name: "A new memory" })).toHaveValue(""),
    { timeout: 5000 },
  );
  const saved = await reloaded();
  expect(saved).toHaveLength(1);
  expect(saved[0]!.id).toBe(prior[0]!.id);
  expect(saved[0]!.activity).toMatchObject({
    kind: "book",
    status: "in-progress",
    progress: 67,
    total: 240,
  });
  expect(saved[0]!.activity!.history).toHaveLength(2);
  expect(saved[0]!.activity!.history[1]!.text).toBe("Read another 17 pages after dinner.");
  expect(saved[0]!.transcripts).toEqual([oldSource, source]);
  expect(vi.mocked(planCapture)).toHaveBeenCalledTimes(1);
  expect(prior).toEqual(original);
});
it("actual route blocks proposed movie completion until its explicit checkbox then persists the same ID and history", async () => {
  const oldSource = "Watched 10 minutes of Arrival.";
  const prior = applyCapturePlan([], proposal("Arrival", "movie", 10, 120), oldSource);
  await installAndUnlock(prior);
  const source = "  Watched Arrival.\n";
  const plan = proposal("Arrival", "movie", 0, 120);
  plan.entries[0]!.matchedMemoryId = prior[0]!.id;
  plan.entries[0]!.summary = "Watched Arrival.";
  plan.entries[0]!.activity!.intent = "complete";
  plan.entries[0]!.activity!.progress = null;
  await submit(source, plan, prior);
  const save = screen.getByRole("button", { name: /Save 1 entry/ });
  expect(save).toBeDisabled();
  expect(() => applyCapturePlan(prior, plan, source)).toThrow(/Confirm.*finished/);
  fireEvent.click(save);
  expect(await reloaded()).toEqual(prior);
  expect(screen.getByRole("textbox", { name: "A new memory" })).toHaveValue(source);
  fireEvent.click(screen.getByRole("checkbox", { name: /Entry 1: I finished Arrival/ }));
  expect(save).toBeEnabled();
  fireEvent.click(save);
  await waitFor(
    () => expect(screen.getByRole("textbox", { name: "A new memory" })).toHaveValue(""),
    { timeout: 5000 },
  );
  const saved = await reloaded();
  expect(saved).toHaveLength(1);
  expect(saved[0]!.id).toBe(prior[0]!.id);
  expect(saved[0]!.activity).toMatchObject({
    kind: "movie",
    status: "completed",
    progress: 120,
    total: 120,
  });
  expect(saved[0]!.activity!.history).toHaveLength(2);
  expect(saved[0]!.activity!.history[1]!.text).toBe("Watched Arrival.");
  expect(saved[0]!.transcripts).toEqual([oldSource, source]);
  expect(vi.mocked(planCapture)).toHaveBeenCalledTimes(1);
});
