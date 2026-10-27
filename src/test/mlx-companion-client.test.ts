import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  classifyWithMlxCompanion,
  clearMlxCompanionPairing,
  getMlxCompanionStatus,
  hasMlxCompanionPairing,
  mlxCompanionAdapterSha256,
  pairMlxCompanion,
  releaseMlxCompanionCapture,
} from "../lib/mlx-companion";

const key = "openmemory.mlx.companion.v1";
const token = "test-local-session-token-1234567890";
const status = {
  paired: true,
  ready: true,
  adapterSha256: mlxCompanionAdapterSha256,
  contractVersion: 3,
};
const result = {
  advice: { category: "WISHLIST", intent: "wishlist" },
  adapterSha256: mlxCompanionAdapterSha256,
  seconds: 1,
  totalSeconds: 2,
  peakBytes: 100,
};
const response = (data: unknown, code = 200) => ({
  ok: code >= 200 && code < 300,
  status: code,
  json: async () => data,
});
const paired = () =>
  sessionStorage.setItem(
    key,
    JSON.stringify({ token, expiresAt: Math.floor(Date.now() / 1000) + 3600 }),
  );
const captureId = "12345678-1234-1234-1234-123456789abc";
const fetchMock = vi.fn();
beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  vi.stubGlobal("crypto", { randomUUID: () => captureId });
  fetchMock.mockResolvedValue(response({ released: true }));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("MLX companion boundary", () => {
  it("does not send any request or note without an unexpired browser pairing", async () => {
    localStorage.setItem(key, JSON.stringify({ token, expiresAt: 1 }));
    await expect(classifyWithMlxCompanion("I want to visit Bangladesh")).rejects.toThrow(
      "Pair this browser",
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(hasMlxCompanionPairing()).toBe(false);
  });
  it("pairs only after verifying adapter identity and shares the same expiring grant across tabs", async () => {
    fetchMock
      .mockResolvedValueOnce(response(status))
      .mockResolvedValueOnce(response({ token, expiresAt: Math.floor(Date.now() / 1000) + 3600 }));
    await pairMlxCompanion(" 123456 ");
    expect(hasMlxCompanionPairing()).toBe(true);
    expect(JSON.parse(localStorage.getItem(key)!)).toMatchObject({ token });
    expect(sessionStorage.getItem(key)).toBeNull();
    sessionStorage.clear();
    expect(hasMlxCompanionPairing()).toBe(true);
    expect(fetchMock.mock.calls[1]![1].body).toBe(JSON.stringify({ code: "123456" }));
    expect(fetchMock.mock.calls[1]![1]).toMatchObject({
      credentials: "omit",
      redirect: "error",
      referrerPolicy: "no-referrer",
    });
    clearMlxCompanionPairing();
    expect(hasMlxCompanionPairing()).toBe(false);
  });
  it("rejects a hostile adapter before sending pairing code or source", async () => {
    paired();
    fetchMock.mockResolvedValue(response({ ...status, adapterSha256: "hostile" }));
    await expect(classifyWithMlxCompanion("private note")).rejects.toThrow("verified adapter");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]![1].body).toBeUndefined();
    expect(hasMlxCompanionPairing()).toBe(false);
    await expect(pairMlxCompanion("123456")).rejects.toThrow("verified adapter");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it("sends only the note to the verified fixed loopback classification endpoint", async () => {
    paired();
    fetchMock
      .mockResolvedValueOnce(response(status))
      .mockResolvedValueOnce(response({ ...result, captureId }));
    expect(await classifyWithMlxCompanion("I want to visit Bangladesh")).toEqual({
      ...result,
      advice: { ...result.advice, clarificationReasons: [] },
      captureId,
    });
    expect(fetchMock.mock.calls[1]![0]).toBe("http://127.0.0.1:8765/classify");
    expect(fetchMock.mock.calls[1]![1]).toMatchObject({
      body: JSON.stringify({ text: "I want to visit Bangladesh", captureId }),
      headers: { Authorization: `Bearer ${token}` },
      credentials: "omit",
      redirect: "error",
      referrerPolicy: "no-referrer",
    });
  });
  it("releases with the original owner token after session expiry or disconnect", async () => {
    paired();
    fetchMock
      .mockResolvedValueOnce(response(status))
      .mockResolvedValueOnce(response({ ...result, captureId }));
    await classifyWithMlxCompanion("note");
    clearMlxCompanionPairing();
    await releaseMlxCompanionCapture(captureId);
    expect(fetchMock.mock.calls[2]![0]).toContain("/release");
    expect(fetchMock.mock.calls[2]![1].headers.Authorization).toBe(`Bearer ${token}`);
    expect(fetchMock.mock.calls[2]![1].body).toBe(JSON.stringify({ captureId }));
    await releaseMlxCompanionCapture(captureId);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
  it("bounds release cleanup at ten seconds independently of capture cancellation", async () => {
    paired();
    fetchMock
      .mockResolvedValueOnce(response(status))
      .mockResolvedValueOnce(response({ ...result, captureId }));
    await classifyWithMlxCompanion("note");
    vi.useFakeTimers();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    fetchMock.mockImplementationOnce(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener("abort", () => reject(init.signal.reason));
        }),
    );
    const release = releaseMlxCompanionCapture(captureId);
    await vi.advanceTimersByTimeAsync(10_000);
    await expect(release).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[2]![1].signal.aborted).toBe(true);
    await releaseMlxCompanionCapture(captureId);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
  it("rejects a mismatched returned reservation and releases the requested one", async () => {
    paired();
    fetchMock
      .mockResolvedValueOnce(response(status))
      .mockResolvedValueOnce(
        response({ ...result, captureId: "other-capture-id-that-is-allowed" }),
      );
    await expect(classifyWithMlxCompanion("note")).rejects.toThrow("invalid classification");
    expect(fetchMock.mock.calls[2]![1].body).toBe(JSON.stringify({ captureId }));
  });
  it("rejects stale sessions locally with no fetch", async () => {
    sessionStorage.setItem(
      key,
      JSON.stringify({ token, expiresAt: Math.floor(Date.now() / 1000) - 1 }),
    );
    await expect(classifyWithMlxCompanion("note")).rejects.toThrow("Pair this browser");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(key)).toBeNull();
  });
  it("clears authorization after a service rejection", async () => {
    paired();
    fetchMock.mockResolvedValueOnce(response(status)).mockResolvedValueOnce(response({}, 401));
    await expect(classifyWithMlxCompanion("note")).rejects.toThrow("Pair this browser again");
    expect(hasMlxCompanionPairing()).toBe(false);
  });
  it("does not send source if service is not ready", async () => {
    paired();
    fetchMock.mockResolvedValue(response({ ...status, ready: false }));
    await expect(classifyWithMlxCompanion("note")).rejects.toThrow("not sent");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("propagates cancellation and never proceeds from cancelled status to source", async () => {
    paired();
    const controller = new AbortController();
    fetchMock.mockImplementationOnce(async () => {
      controller.abort();
      return response(status);
    });
    await expect(classifyWithMlxCompanion("note", controller.signal)).rejects.toMatchObject({
      name: "AbortError",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]![1].signal.aborted).toBe(true);
  });
  it("clears stale pairing detected after a service restart before sending source", async () => {
    paired();
    fetchMock.mockResolvedValue(response({ ...status, paired: false }));
    await expect(classifyWithMlxCompanion("note")).rejects.toThrow("Pair this browser again");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(hasMlxCompanionPairing()).toBe(false);
  });
  it("cancels an ongoing classification fetch", async () => {
    paired();
    const controller = new AbortController();
    fetchMock.mockResolvedValueOnce(response(status)).mockImplementationOnce(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener("abort", () => reject(init.signal.reason), { once: true });
          controller.abort();
        }),
    );
    await expect(classifyWithMlxCompanion("note", controller.signal)).rejects.toMatchObject({
      name: "AbortError",
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[2]![0]).toContain("/release");
    expect(fetchMock.mock.calls[2]![1].signal.aborted).toBe(false);
  });
  it("explains network permission failure without falling back", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(getMlxCompanionStatus()).rejects.toThrow("local network access");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("rejects malformed runtime output including unexpected fields", async () => {
    paired();
    fetchMock
      .mockResolvedValueOnce(response(status))
      .mockResolvedValueOnce(response({ ...result, captureId, privateData: "unexpected" }));
    await expect(classifyWithMlxCompanion("note")).rejects.toThrow("invalid classification");
  });
  it("does not truncate long notes or send them", async () => {
    paired();
    await expect(classifyWithMlxCompanion("a".repeat(1001))).rejects.toThrow("not truncated");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

it("bounds connection checks and explains browser permission failures without claiming inference ran", async () => {
  vi.useFakeTimers();
  fetchMock.mockImplementation(
    (_url, init: RequestInit) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
      }),
  );
  const check = expect(getMlxCompanionStatus()).rejects.toThrow("local network access in Chrome");
  await vi.advanceTimersByTimeAsync(8000);
  await check;
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(fetchMock.mock.calls[0]![0]).toMatch(/\/status$/);
});

it("migrates an existing tab grant without extending expiry and restores it with empty session storage", () => {
  paired();
  const legacy = sessionStorage.getItem(key);
  expect(hasMlxCompanionPairing()).toBe(true);
  expect(localStorage.getItem(key)).toBe(legacy);
  expect(sessionStorage.getItem(key)).toBeNull();
  // A separately opened tab has no sessionStorage, but sees the same-origin store.
  sessionStorage.clear();
  expect(hasMlxCompanionPairing()).toBe(true);
  expect(fetchMock).not.toHaveBeenCalled();
});
it("does not resurrect a disconnected grant from another tab's legacy session", () => {
  paired();
  const staleTab = sessionStorage.getItem(key)!;
  expect(hasMlxCompanionPairing()).toBe(true);
  clearMlxCompanionPairing();
  sessionStorage.setItem(key, staleTab);
  expect(hasMlxCompanionPairing()).toBe(false);
  expect(sessionStorage.getItem(key)).toBeNull();
});
it("keeps a new shared pairing when an old tab receives a late unpaired status", async () => {
  paired();
  const newGrant = {
    token: "different-new-browser-pairing-token",
    expiresAt: Math.floor(Date.now() / 1000) + 3600,
  };
  fetchMock.mockImplementationOnce(async () => {
    localStorage.setItem(key, JSON.stringify(newGrant));
    return response({ ...status, paired: false });
  });
  expect((await getMlxCompanionStatus()).paired).toBe(false);
  expect(JSON.parse(localStorage.getItem(key)!)).toEqual(newGrant);
  expect(hasMlxCompanionPairing()).toBe(true);
});
it("expires a shared grant before sending any note", async () => {
  localStorage.setItem(
    key,
    JSON.stringify({ token, expiresAt: Math.floor(Date.now() / 1000) - 1 }),
  );
  await expect(classifyWithMlxCompanion("private note")).rejects.toThrow("Pair this browser");
  expect(fetchMock).not.toHaveBeenCalled();
});

it("a new unpaired tab does not block migration from the previously paired tab", () => {
  expect(hasMlxCompanionPairing()).toBe(false);
  expect(localStorage.getItem(key)).toBeNull();
  paired();
  expect(hasMlxCompanionPairing()).toBe(true);
});
