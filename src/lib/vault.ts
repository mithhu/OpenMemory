import { z } from "zod";

const envelopeSchema = z.discriminatedUnion("encrypted", [
  z.object({
    version: z.literal(1),
    encrypted: z.literal(false),
    data: z.unknown(),
    revision: z.number().int().nonnegative().optional(),
  }),
  z.object({
    version: z.literal(1),
    encrypted: z.literal(true),
    salt: z.string(),
    iv: z.string(),
    ciphertext: z.string(),
    revision: z.number().int().nonnegative().optional(),
  }),
]);
export type VaultEnvelope = z.infer<typeof envelopeSchema>;
let key: CryptoKey | null = null;
let salt: string | null = null;
let privateMode = false;
let revision = 0;
let writeQueue: Promise<unknown> = Promise.resolve();
export const privateStorageActive = () => privateMode;
const encode = (bytes: Uint8Array) =>
  btoa(Array.from(bytes, (v) => String.fromCharCode(v)).join(""));
const decode = (value: string) => Uint8Array.from(atob(value), (c) => c.charCodeAt(0));

async function derive(passphrase: string, saltValue: Uint8Array) {
  if (!globalThis.crypto?.subtle)
    throw new Error("Encryption needs a secure browser connection (HTTPS or localhost).");
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: saltValue as BufferSource, iterations: 310000, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}
export async function seal(
  data: unknown,
  encryptionKey: CryptoKey,
  saltValue: string,
): Promise<VaultEnvelope> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    encryptionKey,
    new TextEncoder().encode(JSON.stringify(data)),
  );
  return {
    version: 1,
    encrypted: true,
    salt: saltValue,
    iv: encode(iv),
    ciphertext: encode(new Uint8Array(encrypted)),
  };
}
export async function openEnvelope(
  raw: unknown,
  passphrase?: string,
): Promise<{ data: unknown; key: CryptoKey | null; salt: string | null; revision: number }> {
  const envelope = envelopeSchema.parse(raw);
  if (!envelope.encrypted)
    return { data: envelope.data, key: null, salt: null, revision: envelope.revision ?? 0 };
  if (!passphrase) throw new Error("VAULT_LOCKED");
  try {
    const nextKey = await derive(passphrase, decode(envelope.salt));
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: decode(envelope.iv) as BufferSource },
      nextKey,
      decode(envelope.ciphertext) as BufferSource,
    );
    return {
      data: JSON.parse(new TextDecoder().decode(decrypted)),
      key: nextKey,
      salt: envelope.salt,
      revision: envelope.revision ?? 0,
    };
  } catch {
    throw new Error(
      "Couldn't unlock the vault. Check your passphrase; the saved data has not changed.",
    );
  }
}
export async function encryptedEnvelope(data: unknown, passphrase: string) {
  if (passphrase.length < 12) throw new Error("Use a passphrase with at least 12 characters.");
  const nextSalt = encode(crypto.getRandomValues(new Uint8Array(16)));
  const nextKey = await derive(passphrase, decode(nextSalt));
  return { envelope: await seal(data, nextKey, nextSalt), key: nextKey, salt: nextSalt };
}
function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("openmemory-vault", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("workspace");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(
        new Error("The browser database is unavailable. Your existing data has not been replaced."),
      );
    request.onblocked = () => reject(new Error("Close other OpenMemory tabs and try again."));
  });
}
export async function readRawVault(): Promise<unknown> {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction("workspace", "readonly");
      const request = tx.objectStore("workspace").get("memories");
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}
export async function readVault(): Promise<VaultEnvelope | null> {
  const raw = await readRawVault();
  if (raw === null) return null;
  try {
    return envelopeSchema.parse(raw);
  } catch {
    throw new Error("The vault could not be read. Export a backup before replacing any data.");
  }
}
async function writeVault(envelope: VaultEnvelope) {
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("workspace", "readwrite");
      const store = tx.objectStore("workspace");
      let conflict: Error | null = null;
      let nextRevision = revision;
      const current = store.get("memories");
      current.onsuccess = () => {
        const parsed =
          current.result === undefined ? null : envelopeSchema.safeParse(current.result);
        if (parsed && !parsed.success) {
          conflict = new Error(
            "The saved vault changed and cannot be read. Export a recovery backup before making changes.",
          );
        } else {
          const saved = parsed?.data;
          if (saved?.encrypted && (!envelope.encrypted || saved.salt !== envelope.salt)) {
            conflict = new Error(
              "The vault was encrypted in another tab. Reload and unlock it before saving.",
            );
          } else if ((saved?.revision ?? 0) !== revision) {
            conflict = new Error(
              "Your vault changed in another tab. Reload to see the latest memories before saving this note.",
            );
          }
          nextRevision = (saved?.revision ?? 0) + 1;
        }
        if (conflict) tx.abort();
        else store.put({ ...envelope, revision: nextRevision }, "memories");
      };
      tx.oncomplete = () => {
        revision = nextRevision;
        resolve();
      };
      tx.onerror = () => reject(tx.error ?? new Error("Couldn't save to this browser."));
      tx.onabort = () => reject(conflict ?? tx.error ?? new Error("The save was cancelled."));
    });
  } finally {
    db.close();
  }
}
export function setVaultSession(session: {
  key: CryptoKey | null;
  salt: string | null;
  revision?: number;
}) {
  key = session.key;
  salt = session.salt;
  privateMode = Boolean(key);
  revision = session.revision ?? 0;
}
export function clearPrivateCaches() {
  for (const name of [
    "echo.memories.v1",
    "openmemory.graph.v1",
    "openmemory.constellation.v1",
    "openmemory.actions.v1",
  ])
    localStorage.removeItem(name);
}
export function saveVault(data: unknown): Promise<void> {
  const snapshot = structuredClone(data);
  const currentKey = key;
  const currentSalt = salt;
  const operation = writeQueue
    .catch(() => {})
    .then(async () => {
      if (privateMode && (!currentKey || !currentSalt))
        throw new Error("Unlock your vault before saving.");
      const envelope =
        currentKey && currentSalt
          ? await seal(snapshot, currentKey, currentSalt)
          : { version: 1 as const, encrypted: false as const, data: snapshot };
      await writeVault(envelope);
    });
  writeQueue = operation;
  return operation;
}
export async function encryptVault(data: unknown, passphrase: string) {
  await writeQueue.catch(() => {});
  const session = await encryptedEnvelope(data, passphrase);
  await writeVault(session.envelope);
  setVaultSession({ ...session, revision });
  clearPrivateCaches();
}
// An encrypted backup must not become a plaintext workspace during restore.
export async function saveRestoredVault(data: unknown, passphrase: string) {
  if (privateMode) await saveVault(data);
  else await encryptVault(data, passphrase);
}
export function lockVault() {
  key = null;
  salt = null;
  privateMode = true;
  clearPrivateCaches();
}
