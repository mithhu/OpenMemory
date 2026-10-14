import { useState } from "react";
import { LockKeyhole, ShieldCheck, Loader2, HardDrive, Cloud, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getLocalModels, type AISettings } from "@/lib/ai-client";
import { checkLocalOllamaSetup, type LocalOllamaReadiness } from "@/lib/local-ollama-readiness";
import { classifierName } from "@/lib/local-ollama";
import {
  getMlxCompanionStatus,
  pairMlxCompanion,
  clearMlxCompanionPairing,
} from "@/lib/mlx-companion";

export function PrivacyPanel({
  open,
  onClose,
  settings,
  hosted = false,
  onDisableAI,
  onSettings,
  encrypted,
  onEncrypt,
  onLock,
  busy,
}: {
  open: boolean;
  onClose: () => void;
  settings: AISettings;
  hosted?: boolean;
  onDisableAI?: () => void;
  onSettings: (settings: AISettings) => void;
  encrypted: boolean;
  onEncrypt: (passphrase: string) => Promise<void>;
  onLock: () => void;
  busy: boolean;
}) {
  const [model, setModel] = useState(settings.provider === "astra" ? "qwen3.5:9b" : settings.model);
  const [models, setModels] = useState<string[]>([]);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [working, setWorking] = useState(false);
  const [companionReady, setCompanionReady] = useState(false);
  const [pairingCode, setPairingCode] = useState("");
  const [companionFeedback, setCompanionFeedback] = useState("");
  const [localSetup, setLocalSetup] = useState<LocalOllamaReadiness | null>(null);
  const [checkingSetup, setCheckingSetup] = useState(false);
  const [connectionFeedback, setConnectionFeedback] = useState<{
    kind: "checking" | "success" | "error";
    text: string;
  } | null>(null);
  const siteOrigin =
    typeof window !== "undefined" ? window.location.origin : "http://127.0.0.1:3001";
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!value && !working) {
          setPassword("");
          setConfirmation("");
          onClose();
        }
      }}
    >
      <DialogContent className="privacy-panel">
        <DialogHeader>
          <span className="eyebrow">
            <ShieldCheck size={15} /> YOUR SPACE, YOUR CHOICE
          </span>
          <DialogTitle>Privacy & AI</DialogTitle>
          <DialogDescription>
            Choose where your memories are processed and how they are saved.
          </DialogDescription>
        </DialogHeader>
        <div className="provider-options">
          <button
            disabled={busy || working || (hosted && !companionReady)}
            className={
              settings.provider === "ollama" && settings.captureEngine !== "ollama"
                ? "selected"
                : ""
            }
            onClick={async () => {
              if (hosted) {
                setWorking(true);
                try {
                  const status = await getMlxCompanionStatus();
                  if (!status.ready || !status.paired)
                    throw new Error("Pair the ready local MLX service before selecting it.");
                } catch (error) {
                  setCompanionReady(false);
                  setCompanionFeedback(
                    error instanceof Error ? error.message : "Could not verify local MLX.",
                  );
                  return;
                } finally {
                  setWorking(false);
                }
              }
              onSettings({ provider: "ollama", model: "qwen3.5:9b", captureEngine: "mlx" });
            }}
          >
            <HardDrive size={19} />
            <strong>{hosted ? "Local MLX · Mac app" : "Local MLX · Default"}</strong>
            <span>
              {hosted
                ? "Fine-tuned MLX on your Mac through the paired local service. Local Ollama handles extraction. No cloud fallback."
                : "Fine-tuned classification on your Mac, with local Ollama extraction. No cloud fallback."}
            </span>
          </button>
          <button
            disabled={busy || working || !model.trim() || model.trim() === classifierName}
            className={
              settings.provider === "ollama" && settings.captureEngine === "ollama"
                ? "selected"
                : ""
            }
            onClick={() => onSettings({ provider: "ollama", model, captureEngine: "ollama" })}
          >
            <HardDrive size={19} />
            <strong>Local Ollama</strong>
            <span>
              {hosted
                ? "Our trained classifier runs first, then your selected model extracts details. Requires the imported classifier, local Ollama and browser permission."
                : "Our trained classifier runs first; your selected model extracts details on this computer. No cloud fallback."}
            </span>
          </button>
          <button
            disabled={busy || working}
            className={settings.provider === "astra" ? "selected" : ""}
            onClick={() => onSettings({ provider: "astra", model: "astra" })}
          >
            <Cloud size={19} />
            <strong>OpenAI</strong>
            <span>
              Optional cloud AI. Select explicitly to send notes and relevant memories to OpenAI.
            </span>
          </button>
        </div>
        {hosted && (
          <section className="mlx-companion-setup" aria-label="Connect local MLX">
            <h3>Connect your Mac’s MLX model</h3>
            <p>
              Start the local service from your OpenMemory folder with{" "}
              <code>npm run mlx:serve</code>. It requires the installed MLX model, trained adapter
              and local Ollama.
            </p>
            <p>
              Open{" "}
              <a href="http://127.0.0.1:8765/" target="_blank" rel="noopener noreferrer">
                the local pairing page
              </a>
              , reveal its code, then paste it here. This pairs only this website for one hour.
              Allow browser local network access if prompted.
            </p>
            <label className="privacy-label">
              Local MLX pairing code
              <input
                type="password"
                autoComplete="off"
                value={pairingCode}
                onChange={(event) => setPairingCode(event.target.value)}
                disabled={busy || working}
              />
            </label>
            <div className="privacy-model-actions">
              <button
                className="text-button"
                disabled={busy || working || !pairingCode.trim()}
                onClick={async () => {
                  setWorking(true);
                  setCompanionReady(false);
                  setCompanionFeedback("Pairing with the model on this Mac…");
                  try {
                    await pairMlxCompanion(pairingCode.trim());
                    setPairingCode("");
                    const status = await getMlxCompanionStatus();
                    if (!status.ready || !status.paired)
                      throw new Error("The local MLX service is not paired and ready.");
                    setCompanionReady(true);
                    setCompanionFeedback(
                      "Verified trained adapter. Local MLX is ready; select its card above.",
                    );
                  } catch (error) {
                    setCompanionFeedback(
                      error instanceof Error ? error.message : "Could not pair local MLX.",
                    );
                  } finally {
                    setWorking(false);
                  }
                }}
              >
                Pair local MLX
              </button>
              <button
                className="text-button"
                disabled={busy || working}
                onClick={async () => {
                  setWorking(true);
                  setCompanionReady(false);
                  setCompanionFeedback("Checking the local MLX service…");
                  try {
                    const status = await getMlxCompanionStatus();
                    setCompanionReady(status.ready && status.paired);
                    setCompanionFeedback(
                      status.ready && status.paired
                        ? "Verified trained adapter. Local MLX is ready."
                        : status.ready
                          ? "Local service found. Pair with its code before enabling MLX."
                          : "Local MLX assets are unavailable. Restore the pinned runtime and restart the service.",
                    );
                  } catch (error) {
                    setCompanionFeedback(
                      error instanceof Error ? error.message : "Could not reach local MLX.",
                    );
                  } finally {
                    setWorking(false);
                  }
                }}
              >
                Check local MLX
              </button>
              <button
                className="text-button"
                disabled={busy || working}
                onClick={() => {
                  clearMlxCompanionPairing();
                  setCompanionReady(false);
                  setPairingCode("");
                  setCompanionFeedback("Local MLX disconnected.");
                  if (settings.provider === "ollama" && settings.captureEngine !== "ollama")
                    onDisableAI?.();
                }}
              >
                Disconnect MLX
              </button>
            </div>
            {companionFeedback && <p role="status">{companionFeedback}</p>}
            <p>
              You can also use the separately running{" "}
              <a
                className="text-button"
                href="http://127.0.0.1:3001/"
                target="_blank"
                rel="noopener noreferrer"
              >
                OpenMemory locally
              </a>{" "}
              app. Opening either link does not install or start a local service.
            </p>
          </section>
        )}
        {hosted && onDisableAI && (
          <button className="text-button" disabled={busy || working} onClick={onDisableAI}>
            Use manual review only
          </button>
        )}
        <label className="privacy-label">
          Downloaded local model for extraction
          <input
            value={model === "astra" ? "" : model}
            placeholder="Your model name from ollama list"
            onChange={(e) => {
              setModel(e.target.value);
              setLocalSetup(null);
            }}
            list="local-models"
            disabled={busy || working}
          />
          <datalist id="local-models">
            {models.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
        </label>
        <div className="privacy-model-actions">
          <button
            className="text-button"
            disabled={working || busy}
            onClick={async () => {
              setWorking(true);
              setConnectionFeedback({
                kind: "checking",
                text: "Connecting to Ollama on this computer… Allow browser local network access if prompted.",
              });
              try {
                const names = await getLocalModels();
                setModels(names.filter((name) => name !== classifierName));
                setConnectionFeedback({
                  kind: "success",
                  text: names.length
                    ? `Connected to Ollama. ${names.length} downloaded local models found. Choose a model, then select Local Ollama or Use this model.`
                    : "Connected to Ollama, but no local models are downloaded yet.",
                });
                toast.success(
                  names.length
                    ? `${names.length} local models found.`
                    : "No local models downloaded yet.",
                );
              } catch {
                const message =
                  "Your browser couldn't connect to Ollama on this computer. Check that Ollama is running, allow this site's origin and browser local network access, then retry. In an in-app browser, try opening this site in Chrome or running OpenMemory locally.";
                setConnectionFeedback({ kind: "error", text: message });
                toast.error("Couldn't connect to Ollama. See the connection guidance below.");
              } finally {
                setWorking(false);
              }
            }}
          >
            {connectionFeedback?.kind === "checking" ? (
              <Loader2 size={14} className="spin" />
            ) : (
              <RefreshCw size={14} />
            )}
            {connectionFeedback?.kind === "checking" ? "Checking Ollama…" : "Find my local models"}
          </button>
          {settings.provider === "ollama" && settings.captureEngine === "ollama" && (
            <button
              className="text-button"
              disabled={!model.trim() || model.trim() === classifierName || busy || working}
              onClick={() => onSettings({ provider: "ollama", model, captureEngine: "ollama" })}
            >
              Use this model
            </button>
          )}
        </div>
        {connectionFeedback && (
          <p role={connectionFeedback.kind === "error" ? "alert" : "status"}>
            {connectionFeedback.text}
          </p>
        )}
        <section className="local-ollama-readiness" aria-label="Local Ollama setup">
          <h3>Check Local Ollama setup</h3>
          <p>
            Check browser access, the exact trained classifier, and your chosen local extraction
            model. This reads model names and metadata only; no personal notes are sent. Checking
            does not select an AI provider or install anything.
          </p>
          <p>
            First time on this computer? Follow the{" "}
            <a
              href="https://github.com/mithhu/OpenMemory/blob/main/docs/LOCAL_MODEL_SETUP.md"
              target="_blank"
              rel="noopener noreferrer"
            >
              local model setup guide
            </a>
            . Obtain the trained classifier package from the project maintainer; a public model
            download is not available yet.
          </p>
          <button
            className="text-button"
            disabled={busy || working}
            onClick={async () => {
              setWorking(true);
              setCheckingSetup(true);
              setLocalSetup(null);
              try {
                const result = await checkLocalOllamaSetup(model);
                setLocalSetup(result);
                setModels(result.models);
              } finally {
                setCheckingSetup(false);
                setWorking(false);
              }
            }}
          >
            {checkingSetup && <Loader2 size={14} className="spin" />}
            {checkingSetup ? "Checking local setup…" : "Check local setup"}
          </button>
          {checkingSetup && (
            <p role="status">Checking Ollama… Allow browser local network access if prompted.</p>
          )}
          {localSetup && (
            <div role="status" aria-live="polite">
              <p>
                <strong>
                  {localSetup.ready
                    ? "Local Ollama is ready. Select Local Ollama above when you want to use it."
                    : "Local setup needs attention."}
                </strong>
              </p>
              <ul>
                <li>
                  <strong>Browser & service:</strong> {localSetup.connection.message}
                </li>
                <li>
                  <strong>Trained classifier:</strong> {localSetup.classifier.message}
                </li>
                <li>
                  <strong>Extraction model:</strong> {localSetup.extractor.message}
                </li>
              </ul>
              <p>Capture verifies these models again before processing each note.</p>
            </div>
          )}
        </section>
        <p>
          Speech transcription uses ElevenLabs only when you choose Transcribe. Audio is sent to
          ElevenLabs; the resulting text uses your selected AI provider. Online title lookup is
          optional and sends only the searched title to Open Library or Wikidata.
        </p>
        <details className="local-setup">
          <summary>Local model setup</summary>
          <p>
            Local Ollama requires the imported openmemory-classifier:reviewed730 model for
            classification, plus a downloaded general model for extraction. On a fresh computer,
            install the trained classifier package using its included setup guide, then use Check
            local setup above to verify it. Disable Ollama cloud features and allow only this site’s
            origin. For the Ollama macOS app, run these commands in Terminal:
          </p>
          <pre>
            {`launchctl setenv OLLAMA_NO_CLOUD '1'\nlaunchctl setenv OLLAMA_ORIGINS '${siteOrigin}'`}
          </pre>
          <p>Quit Ollama from its menu bar menu, then reopen Ollama to apply these settings.</p>
          <p>
            These settings apply to this login session. Apply them again after restarting your Mac.
          </p>
          <p>
            Keep Ollama listening at 127.0.0.1:11434. These commands allow this website without
            exposing Ollama to your network. Do not use a wildcard origin. If you already allow
            other sites, add this origin to your existing comma-separated list instead of replacing
            it.
          </p>
          <p>
            Your browser connects directly to Ollama. Allow local network access for this site if
            prompted. If you previously blocked it, change that permission in your browser’s site
            settings and retry. In-app browsers may block local connections; try Chrome or the local
            app.
          </p>
        </details>
        <div className="vault-settings">
          <h3>
            <LockKeyhole size={16} />{" "}
            {encrypted ? "Your vault is encrypted" : "Protect this browser’s vault"}
          </h3>
          <p>
            Memories live in a browser database. A passphrase encrypts the stored memories and
            exported backups. Keep it safe: it cannot be recovered.
          </p>
          {encrypted ? (
            <button className="primary-button" disabled={busy || working} onClick={onLock}>
              <LockKeyhole size={14} /> Lock now
            </button>
          ) : (
            <form
              onSubmit={async (event) => {
                event.preventDefault();
                if (password !== confirmation) {
                  toast.error("The passphrases don't match.");
                  return;
                }
                setWorking(true);
                try {
                  await onEncrypt(password);
                  setPassword("");
                  setConfirmation("");
                  toast.success("Vault encrypted. Old plaintext memory caches removed.");
                } catch (error) {
                  toast.error(
                    error instanceof Error ? error.message : "Couldn't encrypt the vault.",
                  );
                } finally {
                  setWorking(false);
                }
              }}
            >
              <label className="privacy-label">
                Passphrase
                <input
                  type="password"
                  autoComplete="new-password"
                  minLength={12}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={busy || working}
                />
              </label>
              <label className="privacy-label">
                Confirm passphrase
                <input
                  type="password"
                  autoComplete="new-password"
                  minLength={12}
                  required
                  value={confirmation}
                  onChange={(e) => setConfirmation(e.target.value)}
                  disabled={busy || working}
                />
              </label>
              <button className="primary-button" disabled={busy || working} type="submit">
                {working ? <Loader2 size={14} className="spin" /> : <LockKeyhole size={14} />}{" "}
                Encrypt my vault
              </button>
            </form>
          )}
          <p className="privacy-footnote">
            Encryption protects saved data while locked. While unlocked, the app can read it.
            Choosing OpenAI still sends request context to OpenAI. This is device storage; keep
            backups for recovery or moving devices.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function VaultUnlock({
  onUnlock,
  onExport,
  title = "Welcome back to your space.",
  description = "Your memories are encrypted. Unlock them with your passphrase.",
  onCancel,
}: {
  onUnlock: (passphrase: string) => Promise<void>;
  onExport?: () => void;
  title?: string;
  description?: string;
  onCancel?: () => void;
}) {
  const [password, setPassword] = useState("");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  return (
    <div className="vault-unlock">
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          setWorking(true);
          setError("");
          try {
            await onUnlock(password);
            setPassword("");
          } catch (e) {
            setError(e instanceof Error ? e.message : "Couldn't unlock the vault.");
          } finally {
            setWorking(false);
          }
        }}
      >
        <span className="vault-orb">
          <LockKeyhole size={30} strokeWidth={1.4} />
        </span>
        <span className="eyebrow">OPENMEMORY · PRIVATE VAULT</span>
        <h1>{title}</h1>
        <p>{description}</p>
        <label className="privacy-label">
          Passphrase
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
            required
            disabled={working}
          />
        </label>
        {error && (
          <p role="alert" className="review-question">
            {error}
          </p>
        )}
        <button type="submit" className="primary-button" disabled={working}>
          {working ? <Loader2 size={15} className="spin" /> : <LockKeyhole size={15} />} Unlock
        </button>
        {onExport && (
          <button type="button" className="text-button" onClick={onExport}>
            Export encrypted backup
          </button>
        )}
        {onCancel && (
          <button type="button" className="text-button" onClick={onCancel}>
            Cancel import
          </button>
        )}
      </form>
    </div>
  );
}
