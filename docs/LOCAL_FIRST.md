# Local-first OpenMemory

The normal local app now starts in **Local MLX**. OpenAI credentials in `.env` do not enable cloud processing. An old cloud preference is ignored; the user must explicitly choose OpenAI under **Privacy & AI** for this policy. The new provider preference persists across reloads. Switching back to either local mode clears its cloud opt-in.

## Hosted consumer experience

On a hosted origin, visitors start with manual review and a clear **Enable AI review** choice. Enabling it selects server-side OpenAI; visitors do not need an API key or installation. No capture, mapping, reflection or discovery request runs before that choice. Privacy & AI also allows returning to manual-only review. Native MLX is unavailable on the hosted site; advanced local Ollama requires a separately installed service and browser/origin permissions.

For an isolated local preview of this hosted flow, run `VITE_APP_MODE=hosted npm run dev -- --host 127.0.0.1 --port 3006 --strictPort`. Leave this setting unset for the usual local MLX app.

Memories remain in this browser's vault, with optional encryption and export. AI actions send the relevant memory context to the chosen provider. Voice sends audio to ElevenLabs only after **Transcribe**, then puts editable text into the composer; review and Save remain separate actions. Unavailable AI never prevents manual capture. Provider-side spending limits are managed by the project owner; this version does not enforce per-user quotas or require Redis.

New hosted libraries start empty. Example memories are added only through **Explore the demo**; existing saved libraries are preserved.

## Running on this Mac

```sh
npm run dev -- --host 127.0.0.1 --port 3001 --strictPort
```

Keep the downloaded local Ollama service available at 127.0.0.1:11434, with this app origin allowed and cloud models disabled. The MLX Python environment and exact base weights have been copied to `.local-runtime/venv` and `.local-runtime/model` on this Mac; this folder is ignored by Git. They no longer depend on `/tmp` surviving. The reviewed730 adapter remains in the ignored `artifacts/fine-tuning/classification-reviewed9b-v1` folder. A clone on another computer does not include these assets: install a compatible native runtime/model/adapter there, or explicitly choose an installed Local Ollama model. Missing local assets produce an error with manual review available, never a cloud fallback. Native MLX requires the app server running locally on an Apple silicon Mac; a remote hosted server cannot run MLX on the browser user's Mac.

## What runs where

| Feature | Default location |
| --- | --- |
| Category and intent classification | Fine-tuned reviewed730 Qwen3.5-9B-4bit, native MLX on this Mac |
| Titles, amounts, identity matching and capture plan | Pinned downloaded local Ollama Qwen3.5:9b after MLX exits |
| Ask, mapping, recommendations | Downloaded local Ollama model |
| Saves, edits, progress, backups, optional encryption | Browser storage on this origin |
| Audio transcription | ElevenLabs, only after the user selects Transcribe |
| Online title lookup | Optional explicit search to Open Library or Wikidata; only searched title is sent |
| OpenAI processing | Only after explicitly selecting OpenAI in Privacy & AI |

Typed capture never falls back to cloud. Stopping classification prevents extraction and late review; the bounded worker may finish in the background. Source words, title confirmations, classification conflicts, completion checks and explicit Save still apply. Cloud selection does not upload the vault immediately; subsequent AI actions send their relevant context to OpenAI. ElevenLabs is used only for transcription, not classification or memory analysis.

Fonts are bundled under `public/fonts` with their OFL licenses, removing automatic Google font requests. Ordinary local mode does not write per-note classifier logs into the repository. The retained `OPENMEMORY_MLX_TEST=1` diagnostic flag enables metadata-only runtime logging in `.local-runtime/classification-runtime.jsonl`.

This change makes the current model the default; it does not claim new qualification accuracy or retrain it. Existing reaction-intent and extractor title/quantity weaknesses, and multi-stage inference latency, remain. Review suggestions before saving.
