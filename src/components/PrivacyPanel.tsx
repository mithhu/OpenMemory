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
            disabled={busy || working || hosted}
            className={
              settings.provider === "ollama" && settings.captureEngine !== "ollama"
                ? "selected"
                : ""
            }
            onClick={() =>
              onSettings({ provider: "ollama", model: "qwen3.5:9b", captureEngine: "mlx" })
            }
          >
            <HardDrive size={19} />
            <strong>{hosted ? "Local MLX · Mac app" : "Local MLX · Default"}</strong>
            <span>
              {hosted
                ? "Run OpenMemory locally on your Mac to use the fine-tuned model. This website cannot run native MLX."
                : "Fine-tuned classification on your Mac, with local Ollama extraction. No cloud fallback."}
            </span>
          </button>
          <button
            disabled={busy || working || !model.trim()}
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
                ? "Advanced: requires Ollama installed on your computer and permission for this website."
                : "Requests go directly to this computer. No cloud fallback."}
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
        {hosted && onDisableAI && (
          <button className="text-button" disabled={busy || working} onClick={onDisableAI}>
            Use manual review only
          </button>
        )}
        <label className="privacy-label">
          Downloaded local model
          <input
            value={model === "astra" ? "" : model}
            placeholder="Your model name from ollama list"
            onChange={(e) => setModel(e.target.value)}
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
              try {
                const names = await getLocalModels();
                setModels(names);
                if (names[0]) setModel(names[0]);
                toast.success(
                  names.length
                    ? `${names.length} local models found.`
                    : "No local models downloaded yet.",
                );
              } catch {
                toast.error("Start Ollama and allow this site's origin, then try again.");
              } finally {
                setWorking(false);
              }
            }}
          >
            <RefreshCw size={14} /> Find my local models
          </button>
          {settings.provider === "ollama" && settings.captureEngine === "ollama" && (
            <button
              className="text-button"
              disabled={!model.trim() || busy || working}
              onClick={() => onSettings({ provider: "ollama", model, captureEngine: "ollama" })}
            >
              Use this model
            </button>
          )}
        </div>
        <p>
          Speech transcription uses ElevenLabs only when you choose Transcribe. Audio is sent to
          ElevenLabs; the resulting text uses your selected AI provider. Online title lookup is
          optional and sends only the searched title to Open Library or Wikidata.
        </p>
        <details className="local-setup">
          <summary>Local model setup</summary>
          <p>
            Use a downloaded model with structured JSON support. Disable Ollama cloud features and
            allow only this site’s origin before starting Ollama.
          </p>
          <pre>
            OLLAMA_NO_CLOUD=1 OLLAMA_ORIGINS=
            {typeof window !== "undefined" ? window.location.origin : "http://localhost:3000"}{" "}
            ollama serve
          </pre>
          <p>
            Ollama listens at 127.0.0.1:11434. Your browser connects directly; browser permissions
            may be needed on a hosted HTTPS site.
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
