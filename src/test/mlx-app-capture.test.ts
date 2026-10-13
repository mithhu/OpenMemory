import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  classify: vi.fn(),
  plan: vi.fn(),
  companion: vi.fn(),
  release: vi.fn(),
}));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({ validator: () => ({ handler: () => mocks.classify }) }),
}));
vi.mock("../lib/ai-client", () => ({ planWithProvider: mocks.plan }));
vi.mock("../lib/mlx-companion", () => ({
  classifyWithMlxCompanion: mocks.companion,
  releaseMlxCompanionCapture: mocks.release,
}));
import { captureWithLocalMlx, localMlxSettings } from "../lib/local-mlx";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.plan.mockResolvedValue({ entries: [] });
});
const data = (text: string) => ({ text, today: "2026-10-12", memories: [] });
it("keeps exact source and binds classifier advice to the review", async () => {
  mocks.classify.mockResolvedValue({ advice: { category: "MOVIE", intent: "wishlist" } });
  const input = data("  I want to wacth Arrival.  ");
  const result = await captureWithLocalMlx(input);
  expect(result.classification.source).toBe(input.text);
  expect(mocks.plan.mock.calls[0]![1]).toEqual(localMlxSettings);
  expect(mocks.plan.mock.calls[0]![3]).toEqual(result.classification);
  expect(mocks.plan.mock.calls[0]![4]).toMatch(/^[a-f0-9]{64}$/);
});
it("retains whole-note mixed advice for review without passing it to separate chunks", async () => {
  mocks.classify.mockResolvedValue({ advice: { category: "MIXED", intent: "mixed" } });
  const result = await captureWithLocalMlx(
    data("I want to watch Arrival; then I read 5 pages of Sapiens."),
  );
  expect(result.classification.advice.category).toBe("MIXED");
  expect(mocks.plan.mock.calls[0]![3]).toBeUndefined();
});
it("never starts extraction after classifier failure", async () => {
  mocks.classify.mockRejectedValue(new Error("Adapter pin mismatch"));
  await expect(captureWithLocalMlx(data("Went for a walk."))).rejects.toThrow(
    "Adapter pin mismatch",
  );
  expect(mocks.plan).not.toHaveBeenCalled();
});
it("never starts extraction after cancellation during classification", async () => {
  const controller = new AbortController();
  mocks.classify.mockImplementation(async () => {
    controller.abort();
    return { advice: { category: "NOTE", intent: "none" } };
  });
  await expect(captureWithLocalMlx(data("Went for a walk."), controller.signal)).rejects.toThrow();
  expect(mocks.plan).not.toHaveBeenCalled();
});
it("rejects invalid advice before extraction", async () => {
  mocks.classify.mockResolvedValue({ advice: { category: "MIXED", intent: "complete" } });
  await expect(captureWithLocalMlx(data("Watched Arrival."))).rejects.toThrow();
  expect(mocks.plan).not.toHaveBeenCalled();
});

it("hosted MLX uses only the paired companion and pinned local extractor, then releases", async () => {
  mocks.companion.mockResolvedValue({
    captureId: "reservation-123",
    advice: { category: "WISHLIST", intent: "wishlist" },
  });
  await captureWithLocalMlx(data("I want to visit Bangladesh."), undefined, true);
  expect(mocks.classify).not.toHaveBeenCalled();
  expect(mocks.companion).toHaveBeenCalledWith("I want to visit Bangladesh.", undefined);
  expect(mocks.plan.mock.calls[0]![1]).toEqual(localMlxSettings);
  expect(localMlxSettings.provider).toBe("ollama");
  expect(mocks.release).toHaveBeenCalledWith("reservation-123");
  expect(mocks.release.mock.invocationCallOrder[0]).toBeGreaterThan(
    mocks.plan.mock.invocationCallOrder[0]!,
  );
});
it("releases hosted capture after extraction fails without cloud or native fallback", async () => {
  mocks.companion.mockResolvedValue({
    captureId: "reservation-123",
    advice: { category: "NOTE", intent: "none" },
  });
  mocks.plan.mockRejectedValue(new Error("Ollama unavailable"));
  await expect(captureWithLocalMlx(data("Went for a walk."), undefined, true)).rejects.toThrow(
    "Ollama unavailable",
  );
  expect(mocks.classify).not.toHaveBeenCalled();
  expect(mocks.release).toHaveBeenCalledWith("reservation-123");
});
it("releases hosted capture after cancellation using cleanup independent of capture signal", async () => {
  const controller = new AbortController();
  mocks.companion.mockImplementation(async () => {
    controller.abort();
    return { captureId: "reservation-123", advice: { category: "NOTE", intent: "none" } };
  });
  await expect(
    captureWithLocalMlx(data("Went for a walk."), controller.signal, true),
  ).rejects.toThrow();
  expect(mocks.plan).not.toHaveBeenCalled();
  expect(mocks.release).toHaveBeenCalledWith("reservation-123");
  expect(mocks.release.mock.calls[0]).toHaveLength(1);
});
it("never releases native captures through the hosted bridge", async () => {
  mocks.classify.mockResolvedValue({ advice: { category: "NOTE", intent: "none" } });
  await captureWithLocalMlx(data("Went for a walk."));
  expect(mocks.companion).not.toHaveBeenCalled();
  expect(mocks.release).not.toHaveBeenCalled();
});
