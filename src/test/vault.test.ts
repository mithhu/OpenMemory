import { webcrypto } from "node:crypto";
import { TextEncoder, TextDecoder } from "node:util";
import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  encryptVault,
  encryptedEnvelope,
  lockVault,
  openEnvelope,
  readVault,
  saveVault,
  saveRestoredVault,
  setVaultSession,
} from "@/lib/vault";
import { demoMemories, loadGraph, saveGraph, saveSynthesis, exampleSynthesis } from "@/lib/memory";

const password = "fictional test passphrase";
beforeEach(() => {
  vi.stubGlobal("crypto", webcrypto);
  vi.stubGlobal("TextEncoder", TextEncoder);
  vi.stubGlobal("TextDecoder", TextDecoder);
  vi.stubGlobal("indexedDB", new IDBFactory());
  setVaultSession({ key: null, salt: null });
  localStorage.clear();
});
afterEach(() => {
  setVaultSession({ key: null, salt: null });
  vi.unstubAllGlobals();
});
describe("Durable browser vault", () => {
  it("saves an intentionally empty workspace without reseeding it", async () => {
    await saveVault([]);
    const envelope = await readVault();
    expect(envelope?.encrypted).toBe(false);
    expect((await openEnvelope(envelope)).data).toEqual([]);
  });
  it("serializes concurrent writes and retains the newest complete snapshot", async () => {
    await Promise.all([saveVault(["first"]), saveVault(["second"]), saveVault(["third"])]);
    expect((await openEnvelope(await readVault())).data).toEqual(["third"]);
  });
  it("doesn't leave readable memories or fingerprints in plaintext caches after encryption", async () => {
    const memories = demoMemories();
    localStorage.setItem("echo.memories.v1", JSON.stringify(memories));
    saveGraph({ connections: [], fingerprint: JSON.stringify(memories), mappedAt: "now" });
    await encryptVault(memories, password);
    const raw = await readVault();
    expect(raw?.encrypted).toBe(true);
    expect(JSON.stringify(raw)).not.toContain(memories[0]!.summary);
    expect(localStorage.getItem("echo.memories.v1")).toBeNull();
    expect(loadGraph()).toBeNull();
    saveGraph({ connections: [], fingerprint: JSON.stringify(memories), mappedAt: "now" });
    saveSynthesis(exampleSynthesis(memories));
    expect(localStorage.getItem("openmemory.graph.v1")).toBeNull();
    expect(localStorage.getItem("openmemory.constellation.v1")).toBeNull();
  });
  it("can restore encrypted backups with the right passphrase and refuses the wrong one without modifying data", async () => {
    const data = demoMemories();
    const { envelope } = await encryptedEnvelope(data, password);
    expect((await openEnvelope(envelope, password)).data).toEqual(data);
    const copy = JSON.stringify(envelope);
    await expect(openEnvelope(envelope, "wrong password")).rejects.toThrow("Couldn't unlock");
    expect(JSON.stringify(envelope)).toBe(copy);
  });
  it("uses a new IV per save and requires unlock before accepting edits", async () => {
    await encryptVault(["first"], password);
    const first = await readVault();
    await saveVault(["second"]);
    const second = await readVault();
    expect(first?.encrypted && second?.encrypted && first.iv !== second.iv).toBe(true);
    lockVault();
    await expect(saveVault(["overwrite"])).rejects.toThrow("Unlock");
    expect(await readVault()).toEqual(second);
    const session = await openEnvelope(second, password);
    setVaultSession(session);
    await saveVault(["after unlock"]);
    expect((await openEnvelope(await readVault(), password)).data).toEqual(["after unlock"]);
  });
  it("rejects malformed envelopes and short passphrases without creating replacement data", async () => {
    await expect(
      openEnvelope({ version: 1, encrypted: true, ciphertext: "broken" }, password),
    ).rejects.toThrow();
    await expect(encryptedEnvelope(["secret"], "short")).rejects.toThrow("12 characters");
    expect(await readVault()).toBeNull();
  });
  it("refuses to overwrite edits made from another tab's newer snapshot", async () => {
    await saveVault(["first"]);
    const oldSession = await openEnvelope(await readVault());
    await saveVault(["newer tab edit"]);
    setVaultSession(oldSession);
    await expect(saveVault(["stale overwrite"])).rejects.toThrow("changed in another tab");
    expect((await openEnvelope(await readVault())).data).toEqual(["newer tab edit"]);
  });
  it("never allows an old unencrypted tab to replace an encrypted vault", async () => {
    await saveVault(["private note"]);
    const oldSession = await openEnvelope(await readVault());
    await encryptVault(["private note"], password);
    setVaultSession(oldSession);
    await expect(saveVault(["plaintext overwrite"])).rejects.toThrow("encrypted in another tab");
    const envelope = await readVault();
    expect(envelope?.encrypted).toBe(true);
    expect((await openEnvelope(envelope, password)).data).toEqual(["private note"]);
  });
  it("keeps an encrypted restore encrypted, including when merging into a plaintext workspace", async () => {
    await saveVault(["existing"]);
    await saveRestoredVault(["existing", "restored secret"], password);
    const envelope = await readVault();
    expect(envelope?.encrypted).toBe(true);
    expect(JSON.stringify(envelope)).not.toContain("restored secret");
    expect((await openEnvelope(envelope, password)).data).toEqual(["existing", "restored secret"]);
    // A subsequent restore retains the current vault key, even if the imported backup used another passphrase.
    await saveRestoredVault(
      ["existing", "restored secret", "second import"],
      "another backup passphrase",
    );
    expect((await openEnvelope(await readVault(), password)).data).toHaveLength(3);
  });
});
