import { webcrypto } from "node:crypto";
import { TextEncoder, TextDecoder } from "node:util";
import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  chooseVaultBackend,
  initializeVaultBackend,
  localStoreModeKey,
  pairLocalStore,
  readLocalVault,
  resetVaultBackendForTests,
  vaultBackend,
  writeLocalVault,
} from "../lib/local-store";
import {
  encryptVault,
  openEnvelope,
  readBrowserVault,
  readVault,
  saveVault,
  setVaultSession,
} from "../lib/vault";
const token = "fictional-storage-grant-token";
const pairingKey = "openmemory.storage.pairing.v1";
const fetcher = vi.fn();
let disk: Record<string, unknown> | null = null;
const response = (data: unknown, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => data,
});
function paired() {
  localStorage.setItem(
    pairingKey,
    JSON.stringify({ token, expiresAt: Math.floor(Date.now() / 1000) + 3600 }),
  );
}
beforeEach(() => {
  vi.stubGlobal("crypto", webcrypto);
  vi.stubGlobal("TextEncoder", TextEncoder);
  vi.stubGlobal("TextDecoder", TextDecoder);
  vi.stubGlobal("indexedDB", new IDBFactory());
  localStorage.clear();
  resetVaultBackendForTests();
  setVaultSession({ key: null, salt: null });
  disk = null;
  vi.stubGlobal("fetch", fetcher);
  fetcher.mockReset();
  fetcher.mockImplementation(async (url: string, init: RequestInit) => {
    if (url.endsWith("/status"))
      return response({ service: "openmemory-local-storage", version: 1, ready: true });
    if (url.endsWith("/pair"))
      return response({ token, expiresAt: Math.floor(Date.now() / 1000) + 3600 });
    if (init.method === "GET") return response({ envelope: disk });
    const { envelope, expectedRevision } = JSON.parse(String(init.body));
    if (expectedRevision !== (disk?.["revision"] ?? 0)) return response({}, 409);
    if (disk?.["encrypted"] && (!envelope.encrypted || envelope.salt !== disk["salt"]))
      return response({}, 409);
    disk = { ...envelope, revision: expectedRevision + 1 };
    return response({ envelope: disk });
  });
});
afterEach(() => {
  resetVaultBackendForTests();
  setVaultSession({ key: null, salt: null });
  vi.unstubAllGlobals();
});
it("pins the current page's storage until workspace reload", () => {
  chooseVaultBackend("sqlite");
  expect(vaultBackend()).toBe("browser");
  initializeVaultBackend();
  expect(vaultBackend()).toBe("sqlite");
  chooseVaultBackend("browser");
  expect(vaultBackend()).toBe("sqlite");
});
it("does not contact a service or send memories before explicit pairing", async () => {
  await expect(writeLocalVault({ version: 1, encrypted: false, data: [] }, 0)).rejects.toThrow(
    "Pair this browser",
  );
  expect(fetcher).not.toHaveBeenCalled();
});
it("pairs only with the fixed storage service after verifying its identity", async () => {
  await pairLocalStore(" code ");
  expect(fetcher.mock.calls[0]?.[0]).toBe("http://127.0.0.1:8766/status");
  expect(fetcher.mock.calls[1]?.[1]).toMatchObject({
    body: JSON.stringify({ code: "code" }),
    credentials: "omit",
    redirect: "error",
    referrerPolicy: "no-referrer",
  });
  expect(JSON.parse(localStorage.getItem(pairingKey)!)).toMatchObject({ token });
});
it("rejects a wrong service before sending the pairing code", async () => {
  fetcher.mockResolvedValue(response({ service: "another-service", version: 1, ready: true }));
  await expect(pairLocalStore("code")).rejects.toThrow();
  expect(fetcher).toHaveBeenCalledOnce();
});
it("writes to the Mac backend without modifying the original browser library", async () => {
  await saveVault([{ id: "browser-note" }]);
  const original = await readBrowserVault();
  paired();
  chooseVaultBackend("sqlite");
  initializeVaultBackend();
  setVaultSession({ key: null, salt: null });
  expect(await readVault()).toBeNull();
  await saveVault([{ id: "mac-note" }]);
  expect((await openEnvelope(await readVault())).data).toEqual([{ id: "mac-note" }]);
  expect(await readBrowserVault()).toEqual(original);
  expect(
    fetcher.mock.calls.find(([url, init]) => url.endsWith("/vault") && init.method === "PUT")?.[1]
      .headers,
  ).toMatchObject({ Authorization: `Bearer ${token}` });
});
it("preserves a real encrypted vault when copying to SQLite and reopening with its passphrase", async () => {
  await encryptVault(
    [{ id: "private-note", summary: "Only decrypted in a browser" }],
    "fictional strong passphrase",
  );
  const original = await readBrowserVault();
  paired();
  await writeLocalVault(original, 0);
  chooseVaultBackend("sqlite");
  initializeVaultBackend();
  const reopened = await openEnvelope(await readVault(), "fictional strong passphrase");
  setVaultSession(reopened);
  await saveVault([{ id: "second-private-note" }]);
  expect(JSON.stringify(disk)).not.toContain("second-private-note");
  expect((await openEnvelope(await readVault(), "fictional strong passphrase")).data).toEqual([
    { id: "second-private-note" },
  ]);
  expect(await readBrowserVault()).toEqual(original);
});
it("refuses a stale snapshot instead of losing another browser's edit", async () => {
  paired();
  chooseVaultBackend("sqlite");
  initializeVaultBackend();
  setVaultSession({ key: null, salt: null });
  await saveVault([{ id: "first" }]);
  const stale = await openEnvelope(await readVault());
  await saveVault([{ id: "newer-browser-edit" }]);
  setVaultSession(stale);
  await expect(saveVault([{ id: "stale" }])).rejects.toThrow("changed in another browser");
  expect((await openEnvelope(await readVault())).data).toEqual([{ id: "newer-browser-edit" }]);
});
it("never falls back to the browser library when the Mac service is unavailable", async () => {
  await saveVault([{ id: "browser" }]);
  const original = await readBrowserVault();
  paired();
  localStorage.setItem(localStoreModeKey, "sqlite");
  initializeVaultBackend();
  fetcher.mockRejectedValue(new TypeError("Failed to fetch"));
  await expect(readVault()).rejects.toThrow("Could not reach Mac storage");
  await expect(saveVault([{ id: "unsaved-note" }])).rejects.toThrow("Could not reach Mac storage");
  expect(await readBrowserVault()).toEqual(original);
});
it("expires storage authorization without sending a request", async () => {
  localStorage.setItem(pairingKey, JSON.stringify({ token, expiresAt: 1 }));
  await expect(readLocalVault()).rejects.toThrow("Pair this browser");
  expect(fetcher).not.toHaveBeenCalled();
});
it("rejects invalid service responses without creating a replacement library", async () => {
  paired();
  fetcher.mockResolvedValue(response({}));
  await expect(readVault()).resolves.toBeNull(); // Browser backend remains the default.
  await expect(readLocalVault()).rejects.toThrow("invalid");
});

it("encrypting the Mac library leaves the separate legacy browser copy unchanged", async () => {
  localStorage.setItem("echo.memories.v1", "separate legacy browser snapshot");
  paired();
  chooseVaultBackend("sqlite");
  initializeVaultBackend();
  setVaultSession({ key: null, salt: null });
  await encryptVault([{ id: "mac-private-note" }], "fictional strong passphrase");
  expect(localStorage.getItem("echo.memories.v1")).toBe("separate legacy browser snapshot");
  expect(JSON.stringify(disk)).not.toContain("mac-private-note");
});
