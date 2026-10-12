import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useMemoryGraph } from "@/hooks/use-memory-graph";
import { mapMemories } from "@/lib/astra";
import { type AISettings } from "@/lib/ai-client";
import {
  demoMemories,
  fingerprint,
  loadGraph,
  saveGraph,
  type Connection,
  type Memory,
} from "@/lib/memory";

vi.mock("@/lib/astra", () => ({ mapMemories: vi.fn() }));
const options = { loaded: true, enabled: true, paused: false, settings: { provider: "astra", model: "astra" } as AISettings };
const tick = (ms = 900) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
  vi.mocked(mapMemories).mockReset().mockResolvedValue({ connections: [] });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Automatic relationship mapping", () => {
  it("cancels mapping for capture and prevents its late completion from clearing a newer request", async () => {
    const memories = demoMemories().slice(0, 2);
    const completions: Array<(value: { connections: Connection[] }) => void> = [];
    vi.mocked(mapMemories).mockImplementation(
      () => new Promise((resolve) => completions.push(resolve)),
    );
    const { result, rerender, unmount } = renderHook(
      ({ paused }) => useMemoryGraph(memories, { ...options, paused }),
      { initialProps: { paused: false } },
    );
    await tick();
    const oldSignal = vi.mocked(mapMemories).mock.calls[0]![0].signal!;
    expect(oldSignal.aborted).toBe(false);
    rerender({ paused: true });
    expect(oldSignal.aborted).toBe(true);
    expect(result.current.mapping).toBe(false);
    await tick(3000);
    expect(mapMemories).toHaveBeenCalledTimes(1);
    rerender({ paused: false });
    await tick();
    const newSignal = vi.mocked(mapMemories).mock.calls[1]![0].signal!;
    await act(async () => completions[0]!({ connections: [] }));
    expect(result.current.mapping).toBe(true);
    expect(result.current.graph).toBeNull();
    expect(result.current.error).toBeNull();
    expect(loadGraph()).toBeNull();
    unmount();
    expect(newSignal.aborted).toBe(true);
    await act(async () => completions[1]!({ connections: [] }));
    expect(loadGraph()).toBeNull();
  });

  it("aborts the local inference fetch when mapping is disabled without showing a failure", async () => {
    const memories = demoMemories().slice(0, 2);
    let inferenceSignal!: AbortSignal;
    const fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ details: { format: "gguf" } }),
      })
      .mockImplementationOnce((_url, init: RequestInit) => {
        inferenceSignal = init.signal as AbortSignal;
        return new Promise((_resolve, reject) => {
          inferenceSignal.addEventListener("abort", () => reject(inferenceSignal.reason));
        });
      });
    vi.stubGlobal("fetch", fetch);
    const settings: AISettings = { provider: "ollama", model: "local-test-model" };
    const { result, rerender } = renderHook(
      ({ enabled }) => useMemoryGraph(memories, { ...options, enabled, settings }),
      { initialProps: { enabled: true } },
    );
    await tick();
    expect(inferenceSignal.aborted).toBe(false);
    rerender({ enabled: false });
    await tick(0);
    expect(inferenceSignal.aborted).toBe(true);
    expect(result.current.mapping).toBe(false);
    expect(result.current.error).toBeNull();
    expect(loadGraph()).toBeNull();
    expect(mapMemories).not.toHaveBeenCalled();
  });

  it("discards a deleted friend's pending connection and maps the replacement friend", async () => {
    const template = demoMemories()[0]!;
    const film = { ...template, id: "film", title: "Endgame with my best friend" };
    const mary = { ...template, id: "mary", title: "Mary is my best friend" };
    const lewis = { ...template, id: "lewis", title: "Lewis is my best friend" };
    let finishOld!: (value: { connections: Connection[] }) => void;
    vi.mocked(mapMemories)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishOld = resolve;
          }),
      )
      .mockResolvedValueOnce({
        connections: [{ from: "film", to: "lewis", label: "Best friend", reason: "Current role" }],
      });
    const { result, rerender } = renderHook(({ memories }) => useMemoryGraph(memories, options), {
      initialProps: { memories: [film, mary] },
    });
    await tick();
    rerender({ memories: [film] });
    expect(vi.mocked(mapMemories).mock.calls[0]![0].signal?.aborted).toBe(true);
    rerender({ memories: [film, lewis] });
    await act(async () => {
      finishOld({
        connections: [{ from: "film", to: "mary", label: "Old friend", reason: "Old role" }],
      });
    });
    expect(result.current.graph).toBeNull();
    expect(loadGraph()).toBeNull();
    await tick();
    expect(mapMemories).toHaveBeenCalledTimes(2);
    expect(result.current.graph?.connections.map((connection) => connection.to)).toEqual(["lewis"]);
    expect(loadGraph()?.connections.map((connection) => connection.to)).toEqual(["lewis"]);
  });

  it("waits for the constellation to be enabled before sending changed memories", async () => {
    const memories = demoMemories().slice(0, 2);
    const { rerender } = renderHook(
      ({ enabled }) => useMemoryGraph(memories, { ...options, enabled }),
      { initialProps: { enabled: false } },
    );
    await tick(5000);
    expect(mapMemories).not.toHaveBeenCalled();
    rerender({ enabled: true });
    await tick();
    expect(mapMemories).toHaveBeenCalledTimes(1);
  });

  it("debounces changes and maps the latest memories without generating a briefing", async () => {
    const initial = demoMemories().slice(0, 2);
    const { rerender, result } = renderHook(({ memories }) => useMemoryGraph(memories, options), {
      initialProps: { memories: initial },
    });
    await tick(400);
    const next = [
      ...initial,
      { ...initial[0]!, id: "new-person", title: "Alex is my best friend" },
    ];
    rerender({ memories: next });
    await tick(899);
    expect(mapMemories).not.toHaveBeenCalled();
    await tick(1);
    expect(mapMemories).toHaveBeenCalledTimes(1);
    expect(vi.mocked(mapMemories).mock.calls[0]![0].data.memories).toEqual(next);
    expect(result.current.stale).toBe(false);
    expect(loadGraph()?.fingerprint).toBe(fingerprint(next));
  });

  it("discards an outdated response and then maps changes made during the request", async () => {
    const initial = demoMemories().slice(0, 2);
    let resolveOld!: (result: { connections: Connection[] }) => void;
    vi.mocked(mapMemories).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveOld = resolve;
        }),
    );
    const { rerender, result } = renderHook(({ memories }) => useMemoryGraph(memories, options), {
      initialProps: { memories: initial },
    });
    await tick();
    expect(result.current.mapping).toBe(true);
    const edited: Memory[] = initial.map((m, i) =>
      i ? { ...m, summary: "Alex is my best friend." } : m,
    );
    rerender({ memories: edited });
    await act(async () => {
      resolveOld({
        connections: [
          {
            from: initial[0]!.id,
            to: initial[1]!.id,
            label: "Old relationship",
            reason: "Old evidence",
          },
        ],
      });
    });
    expect(result.current.graph).toBeNull();
    expect(loadGraph()).toBeNull();
    await tick();
    expect(mapMemories).toHaveBeenCalledTimes(2);
    expect(vi.mocked(mapMemories).mock.calls[1]![0].data.memories).toEqual(edited);
    expect(result.current.graph?.fingerprint).toBe(fingerprint(edited));
  });

  it("reuses a matching persisted map without another API request", async () => {
    const memories = demoMemories().slice(0, 2);
    saveGraph({
      connections: [],
      fingerprint: fingerprint(memories),
      mappedAt: "2026-10-06T10:00:00Z",
    });
    const { result } = renderHook(() => useMemoryGraph(memories, options));
    await tick(3000);
    expect(result.current.stale).toBe(false);
    expect(mapMemories).not.toHaveBeenCalled();
  });

  it("keeps the cached graph on failure and only retries when requested", async () => {
    const memories = demoMemories().slice(0, 2);
    saveGraph({ connections: [], fingerprint: "old", mappedAt: "2026-10-06T10:00:00Z" });
    vi.mocked(mapMemories).mockRejectedValueOnce(new Error("Rate limit reached"));
    const { result } = renderHook(() => useMemoryGraph(memories, options));
    await tick();
    expect(result.current.error).toBe("Rate limit reached");
    expect(result.current.graph?.fingerprint).toBe("old");
    await tick(10000);
    expect(mapMemories).toHaveBeenCalledTimes(1);
    act(() => result.current.retry());
    await tick();
    expect(mapMemories).toHaveBeenCalledTimes(2);
    expect(result.current.error).toBeNull();
    expect(result.current.stale).toBe(false);
  });
  it("discards an old cloud response after switching to local reasoning", async () => {
    const memories = demoMemories().slice(0, 2);
    let resolveOld!: (result: { connections: Connection[] }) => void;
    vi.mocked(mapMemories).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveOld = resolve;
        }),
    );
    const fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ details: { format: "gguf" } }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ message: { content: '{"connections":[]}' } }),
      });
    vi.stubGlobal("fetch", fetch);
    const astra: AISettings = { provider: "astra", model: "astra" };
    const { rerender, result } = renderHook(
      ({ settings }) => useMemoryGraph(memories, { ...options, settings }),
      { initialProps: { settings: astra } },
    );
    await tick();
    rerender({ settings: { provider: "ollama", model: "local-test-model" } });
    expect(vi.mocked(mapMemories).mock.calls[0]![0].signal?.aborted).toBe(true);
    await act(async () => {
      resolveOld({ connections: [] });
    });
    expect(result.current.graph).toBeNull();
    await tick();
    expect(result.current.graph?.provider).toBe("ollama");
    expect(result.current.graph?.engine).toBe("ollama:local-test-model");
    expect(mapMemories).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
