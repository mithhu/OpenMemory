import { EventEmitter } from "node:events";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ spawn: vi.fn(), request: vi.fn(), exists: vi.fn() }));
vi.mock("node:child_process", () => ({ spawn: mocks.spawn, default: { spawn: mocks.spawn } }));
vi.mock("@tanstack/react-start/server", () => ({ getRequest: mocks.request }));
vi.mock("node:os", () => ({ platform: () => "darwin", default: { platform: () => "darwin" } }));
vi.mock("node:fs", () => ({ existsSync: mocks.exists, default: { existsSync: mocks.exists } }));
import { runLocalMlx } from "../lib/local-mlx.server";
afterEach(() => vi.unstubAllEnvs());
beforeEach(() => {
  vi.clearAllMocks();
  mocks.exists.mockReturnValue(true);
  vi.stubEnv("OPENMEMORY_MLX_TEST", "1");
  mocks.request.mockReturnValue(
    new Request("http://127.0.0.1:3005/_serverFn/test", {
      headers: { origin: "http://127.0.0.1:3005" },
    }),
  );
});
it("refuses a hosted workspace before any native process launches", async () => {
  mocks.request.mockReturnValue(new Request("https://example.com/_serverFn/test"));
  await expect(runLocalMlx("Went for a walk.")).rejects.toThrow("same-origin app");
  expect(mocks.spawn).not.toHaveBeenCalled();
});
it("refuses a different origin even on the enabled local server", async () => {
  mocks.request.mockReturnValue(
    new Request("http://127.0.0.1:3005/_serverFn/test", {
      headers: { origin: "https://example.com" },
    }),
  );
  await expect(runLocalMlx("Went for a walk.")).rejects.toThrow("same-origin app");
  expect(mocks.spawn).not.toHaveBeenCalled();
});
it("refuses oversized UTF-8 text before starting MLX", async () => {
  await expect(runLocalMlx("猫".repeat(400))).rejects.toThrow("shorter note");
  expect(mocks.spawn).not.toHaveBeenCalled();
});
function child() {
  return Object.assign(new EventEmitter(), {
    stdout: new EventEmitter(),
    stderr: new EventEmitter(),
    stdin: { end: vi.fn() },
  });
}
it("retains the server busy state until the parent process actually closes", async () => {
  const process = child();
  mocks.spawn.mockReturnValue(process);
  const pending = runLocalMlx("Went for a walk.");
  await expect(runLocalMlx("Read a book.")).rejects.toThrow("finishing the previous request");
  process.stderr.emit("data", "Pinned artifact mismatch");
  process.emit("close", 1);
  await expect(pending).rejects.toThrow("no extraction or cloud fallback");
  expect(mocks.spawn).toHaveBeenCalledTimes(1);
});
it("rejects output that identifies a different adapter", async () => {
  const process = child();
  mocks.spawn.mockReturnValue(process);
  const pending = runLocalMlx("Went for a walk.");
  process.stdout.emit(
    "data",
    JSON.stringify({
      advice: { category: "NOTE", intent: "none" },
      adapterSha256: "0".repeat(64),
      seconds: 1,
      totalSeconds: 2,
      peakBytes: 1,
    }),
  );
  process.emit("close", 0);
  await expect(pending).rejects.toThrow("invalid classification");
});

it("offers local/manual recovery when the native environment is not installed", async () => {
  mocks.exists.mockReturnValue(false);
  await expect(runLocalMlx("Went for a walk.")).rejects.toThrow("No cloud fallback");
  expect(mocks.spawn).not.toHaveBeenCalled();
});
