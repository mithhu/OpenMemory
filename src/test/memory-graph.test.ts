import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useMemoryGraph } from "@/hooks/use-memory-graph";
import { mapMemories } from "@/lib/astra";
import {
  demoMemories,
  fingerprint,
  loadGraph,
  saveGraph,
  type Connection,
  type Memory,
} from "@/lib/memory";

vi.mock("@/lib/astra", () => ({ mapMemories: vi.fn() }));
const options = { loaded: true, enabled: true, paused: false };
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
});

describe("Automatic relationship mapping", () => {
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
});
