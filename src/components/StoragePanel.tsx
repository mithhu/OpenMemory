import { useState } from "react";
import {
  chooseVaultBackend,
  pairLocalStore,
  readLocalVault,
  writeLocalVault,
  vaultBackend,
} from "@/lib/local-store";
import { readBrowserVault, openEnvelope, type VaultEnvelope } from "@/lib/vault";
import { memorySchema } from "@/lib/memory";

export function StoragePanel({
  disabled,
  onExport,
  onWorking,
}: {
  disabled: boolean;
  onExport?: (() => void) | undefined;
  onWorking?: ((working: boolean) => void) | undefined;
}) {
  const [code, setCode] = useState("");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [review, setReview] = useState<{
    mac: VaultEnvelope | null;
    browser: VaultEnvelope | null;
  } | null>(null);
  const [checked, setChecked] = useState(false);
  const macSelected = vaultBackend() === "sqlite";
  const run = async (work: () => Promise<void>) => {
    setWorking(true);
    onWorking?.(true);
    setError("");
    try {
      await work();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not connect to Mac storage.");
    } finally {
      setWorking(false);
      onWorking?.(false);
    }
  };
  const connect = async () =>
    run(async () => {
      await pairLocalStore(code);
      setCode("");
      const mac = await readLocalVault();
      const browser = await readBrowserVault();
      // Parse envelopes using the existing vault parser without exposing an
      // encrypted collection or needing its passphrase during connection review.
      const validate = async (raw: unknown): Promise<VaultEnvelope | null> => {
        if (raw === null) return null;
        if (typeof raw !== "object" || !raw || !("encrypted" in raw))
          throw new Error(
            "This library could not be read. Export a backup before changing storage.",
          );
        const { parseVaultEnvelope } = await import("@/lib/vault");
        const envelope = parseVaultEnvelope(raw);
        if (!envelope.encrypted)
          memorySchema
            .array()
            .max(200)
            .parse((await openEnvelope(envelope)).data);
        return envelope;
      };
      setReview({ mac: await validate(mac), browser: await validate(browser) });
      setChecked(false);
    });
  const switchTo = (mode: "browser" | "sqlite") => {
    chooseVaultBackend(mode);
    window.location.reload();
  };
  return (
    <section className="local-storage-panel" aria-label="Library storage">
      <h3>Where your library lives</h3>
      <p>
        {macSelected
          ? "Store on this Mac · shared SQLite library"
          : "This browser · separate browser library"}
      </p>
      <p>
        One library across Chrome and Brave on this Mac. Each browser connects separately. AI
        processing is independent of storage.
      </p>
      <p>
        Start <code>npm run storage:serve</code>, then open{" "}
        <a
          className="text-button"
          href="http://127.0.0.1:8766/"
          target="_blank"
          rel="noopener noreferrer"
        >
          the storage pairing page
        </a>
        . This is separate from MLX pairing.
      </p>
      <label className="privacy-label">
        Mac storage pairing code
        <input
          type="password"
          autoComplete="off"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          disabled={disabled || working}
        />
      </label>
      <button
        className="text-button"
        disabled={disabled || working || !code.trim()}
        onClick={() => void connect()}
      >
        {working ? "Connecting…" : "Connect Mac storage"}
      </button>
      {error && <p role="alert">{error}</p>}
      {review && (
        <div className="storage-review" role="region" aria-label="Review storage switch">
          <h4>Check before switching</h4>
          <p>
            {review.mac
              ? `Your Mac already has ${review.mac.encrypted ? "an encrypted library" : `${Array.isArray(review.mac.data) ? review.mac.data.length : 0} memories`}. Switching opens it; this browser’s library stays here.`
              : "Your Mac library is empty. You can copy this browser’s library or start an empty shared library."}
          </p>
          {review.browser && (
            <p>
              This browser has{" "}
              {review.browser.encrypted
                ? "an encrypted library. Its encryption is preserved when copied."
                : `${Array.isArray(review.browser.data) ? review.browser.data.length : 0} memories. A copy will be unencrypted until you protect it with a passphrase.`}
            </p>
          )}
          <label>
            <input
              type="checkbox"
              checked={checked}
              onChange={(event) => setChecked(event.target.checked)}
            />{" "}
            I understand which library will open. Nothing will be deleted or automatically merged.
          </label>
          <div className="bookmark-actions">
            {!review.mac && review.browser && (
              <button
                className="primary-button"
                disabled={disabled || working || !checked}
                onClick={() =>
                  void run(async () => {
                    const latest = await readBrowserVault();
                    if (JSON.stringify(latest) !== JSON.stringify(review.browser))
                      throw new Error(
                        "This browser’s library changed during review. Connect again to review its latest contents before copying.",
                      );
                    await writeLocalVault(latest, 0);
                    switchTo("sqlite");
                  })
                }
              >
                Copy browser library to this Mac
              </button>
            )}
            <button
              className="text-button"
              disabled={disabled || working || !checked}
              onClick={() => switchTo("sqlite")}
            >
              {review.mac ? "Use existing Mac library" : "Start an empty Mac library"}
            </button>
          </div>
          <p>
            If both browsers already have different memories, export each browser’s backup before
            switching. Import it into the Mac library to combine them; existing memory IDs are kept.
          </p>
        </div>
      )}
      {onExport && (
        <button className="text-button" disabled={disabled || working} onClick={onExport}>
          Export current library first
        </button>
      )}
      {macSelected && (
        <button
          className="text-button"
          disabled={disabled || working}
          onClick={() => switchTo("browser")}
        >
          Return to this browser’s library
        </button>
      )}
      <p>
        Storage pairing lasts one hour and needs renewing after a service restart. No automatic
        fallback or cloud sync. Keep the service running while using the Mac library.
      </p>
    </section>
  );
}
