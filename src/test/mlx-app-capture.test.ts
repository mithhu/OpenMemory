import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ classify: vi.fn(), plan: vi.fn() }));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({ validator: () => ({ handler: () => mocks.classify }) }),
}));
vi.mock("../lib/ai-client", () => ({ planWithProvider: mocks.plan }));
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
