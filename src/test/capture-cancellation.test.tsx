import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type ComponentType } from "react";
import { type CapturePlan } from "../lib/capture-plan";

const api = vi.hoisted(() => ({ plan: vi.fn(), save: vi.fn(), error: vi.fn() }));
vi.mock("../lib/ai-client", async (original) => ({
  ...(await original<typeof import("../lib/ai-client")>()),
  planWithProvider: api.plan,
}));
vi.mock("../lib/local-mlx", () => ({
  captureWithLocalMlx: async (input: unknown, signal: AbortSignal) => ({
    plan: await api.plan(input, { provider: "ollama", model: "qwen3.5:9b" }, signal),
  }),
}));
vi.mock("../lib/astra", async (original) => ({
  ...(await original<typeof import("../lib/astra")>()),
  getAstraStatus: () => Promise.resolve({ configured: true }),
}));
vi.mock("../lib/vault", async (original) => ({
  ...(await original<typeof import("../lib/vault")>()),
  readVault: () => Promise.resolve({ encrypted: false }),
  openEnvelope: () => Promise.resolve({ data: [], key: null, salt: null }),
  setVaultSession: vi.fn(),
  saveVault: api.save,
}));
vi.mock("../hooks/use-memory-graph", () => ({
  useMemoryGraph: () => ({
    graph: null,
    mapping: false,
    stale: false,
    error: null,
    retry: vi.fn(),
  }),
}));
vi.mock("sonner", () => ({ toast: { error: api.error, success: vi.fn() } }));
import { Route } from "../routes/index";
const Page = Route.options.component as ComponentType;
const plan = (title: string): CapturePlan => ({
  entries: [
    {
      title,
      summary: `Fictional ${title}`,
      category: "NOTE",
      date: "2026-10-09",
      matchedMemoryId: null,
      candidateMemoryIds: [],
      clarificationQuestion: null,
      tags: [],
      activity: null,
    },
  ],
});
const deferred = () => {
  let resolve!: (plan: CapturePlan) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<CapturePlan>((ok, fail) => {
    resolve = ok;
    reject = fail;
  });
  return { promise, resolve, reject };
};
async function start() {
  render(<Page />);
  await waitFor(() => expect(screen.getByLabelText("A new memory")).toBeEnabled());
  fireEvent.change(screen.getByLabelText("A new memory"), {
    target: { value: "A fictional walk with a friend" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Review memory" }));
  await waitFor(() => expect(api.plan).toHaveBeenCalledOnce());
}
beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  api.save.mockResolvedValue(undefined);
});
afterEach(cleanup);

describe("Cancelling capture preserves the user's work", () => {
  it.each([
    {
      error: new Error("The title suggestion did not match this entry."),
      message: "The title suggestion did not match this entry.",
    },
    {
      error: Object.assign(new Error("Internal schema detail"), { name: "ZodError" }),
      message: "The model returned an incomplete review.",
    },
  ])(
    "keeps a failed request visible and supports manual recovery: $message",
    async ({ error, message }) => {
      const request = deferred();
      api.plan.mockReturnValueOnce(request.promise);
      await start();
      await act(async () => request.reject(error));
      expect(screen.getByRole("alert")).toHaveTextContent(message);
      expect(screen.getByRole("alert")).not.toHaveTextContent("Internal schema detail");
      expect(screen.getByLabelText("A new memory")).toHaveValue("A fictional walk with a friend");
      expect(api.save).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole("button", { name: "Review manually" }));
      expect(screen.queryByRole("alert")).toBeNull();
      expect(screen.getByLabelText("Entry 1 details")).toHaveValue(
        "A fictional walk with a friend",
      );
      expect(api.save).not.toHaveBeenCalled();
    },
  );
  it("keeps the draft and ignores a late result after stopping", async () => {
    const first = deferred();
    api.plan.mockReturnValueOnce(first.promise);
    await start();
    const signal = api.plan.mock.calls[0]![2] as AbortSignal;
    fireEvent.click(screen.getByRole("button", { name: "Stop waiting" }));
    expect(signal.aborted).toBe(true);
    expect(screen.getByLabelText("A new memory")).toHaveValue("A fictional walk with a friend");
    expect(screen.getByRole("button", { name: "Review memory" })).toBeEnabled();
    await act(async () => first.resolve(plan("Late AI result")));
    expect(screen.queryByRole("form", { name: "Review memories before saving" })).toBeNull();
    expect(api.save).not.toHaveBeenCalled();
    expect(api.error).not.toHaveBeenCalled();
  });
  it("switches immediately to manual review and protects edits from late AI output", async () => {
    const first = deferred();
    api.plan.mockReturnValueOnce(first.promise);
    await start();
    fireEvent.click(screen.getByRole("button", { name: "Review manually now" }));
    expect((api.plan.mock.calls[0]![2] as AbortSignal).aborted).toBe(true);
    fireEvent.change(screen.getByLabelText("Entry 1 details"), {
      target: { value: "My reviewed words" },
    });
    await act(async () => first.resolve(plan("Late AI result")));
    expect(screen.getByLabelText("Entry 1 details")).toHaveValue("My reviewed words");
    expect(screen.getByLabelText("Entry 1 title")).toHaveValue("A fictional walk with a friend");
    expect(api.save).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Save 1 entry" }));
    await waitFor(() => expect(api.save).toHaveBeenCalledOnce());
    expect(api.save.mock.calls[0]![0][0].summary).toBe("My reviewed words");
  });
  it("does not let an older request unlock or replace a newer pending capture", async () => {
    const first = deferred();
    const second = deferred();
    api.plan.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    await start();
    fireEvent.click(screen.getByRole("button", { name: "Stop waiting" }));
    fireEvent.click(screen.getByRole("button", { name: "Review memory" }));
    await waitFor(() => expect(api.plan).toHaveBeenCalledTimes(2));
    await act(async () => first.resolve(plan("Late first result")));
    expect(screen.getByRole("button", { name: "Stop waiting" })).toBeInTheDocument();
    expect(screen.getByLabelText("A new memory")).toBeDisabled();
    await act(async () => second.resolve(plan("Current result")));
    expect(screen.getByLabelText("Entry 1 title")).toHaveValue("Current result");
  });
  it("aborts when the page unmounts and does not surface cancellation as an error", async () => {
    const first = deferred();
    api.plan.mockReturnValueOnce(first.promise);
    await start();
    const signal = api.plan.mock.calls[0]![2] as AbortSignal;
    cleanup();
    expect(signal.aborted).toBe(true);
    await act(async () => first.reject(new Error("An old provider rejection")));
    expect(api.error).not.toHaveBeenCalled();
    expect(api.save).not.toHaveBeenCalled();
  });
});
