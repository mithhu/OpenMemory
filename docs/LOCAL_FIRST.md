# Local-first OpenMemory

The normal local app now starts in **Local MLX**. OpenAI credentials in `.env` do not enable cloud processing. An old cloud preference is ignored; the user must explicitly choose OpenAI under **Privacy & AI** for this policy. The new provider preference persists across reloads. Switching back to either local mode clears its cloud opt-in.

## Hosted consumer experience

On a hosted origin, visitors start with manual review and a clear **Enable AI review** choice. Enabling it selects server-side OpenAI; visitors do not need an API key or installation. No capture, mapping, reflection or discovery request runs before that choice. Privacy & AI also allows returning to manual-only review. Native MLX can be explicitly paired with the local companion service on an Apple Silicon Mac; local Ollama requires the imported trained classifier, a separately installed service and browser/origin permissions.

For an isolated local preview of this hosted flow, run `VITE_APP_MODE=hosted npm run dev -- --host 127.0.0.1 --port 3006 --strictPort`. Leave this setting unset for the usual local MLX app.

Memories remain in this browser's vault, with optional encryption and export. AI actions send the relevant memory context to the chosen provider. Voice sends audio to ElevenLabs only after **Transcribe**, then puts editable text into the composer; review and Save remain separate actions. Unavailable AI never prevents manual capture. Provider-side spending limits are managed by the project owner; this version does not enforce per-user quotas or require Redis.

New hosted libraries start empty. Example memories are added only through **Explore the demo**; existing saved libraries are preserved.

### Connecting the hosted site to Ollama on a Mac

The hosted site talks directly to the visitor's loopback Ollama service. Capture first uses the pinned `openmemory-classifier:reviewed730` trained classifier, then the selected general local model extracts details. The model picker selects the extractor; it does not replace the trained classifier. Two permissions are needed: Ollama must allow the exact website origin, and the browser must permit local-network access. Selecting Local Ollama does not grant either permission automatically.

For the Ollama macOS app, set the following in Terminal, then quit and reopen Ollama:

```sh
launchctl setenv OLLAMA_ORIGINS "https://open-memory-ai.vercel.app"
launchctl setenv OLLAMA_NO_CLOUD "1"
```

Preserve any other explicitly allowed origins in the comma-separated value. These `launchctl` environment settings apply to the current login session; apply them again after logging out or restarting macOS. Keep Ollama bound to loopback; do not use wildcard origins or expose it on the network. In Chrome, allow this site's Local network access permission if prompted, then retry **Find my local models**. In-app browsers may restrict these connections; use Chrome or the locally running app if needed.

### Pairing the hosted site with the fine-tuned MLX adapter

On this Mac, where the pinned model and adapter are already installed:

1. Keep Ollama running with the exact hosted origin allowed as above.
2. From the OpenMemory folder, run `npm run mlx:serve`. It binds only to `127.0.0.1:8765` and checks the pinned assets before accepting requests.
3. Open `http://127.0.0.1:8765/` and click **Reveal a new pairing code**. The code expires after five minutes and is single-use.
4. On the deployed site, open **Privacy & AI**, paste the code, and select **Pair local MLX**. Allow Chrome's local-network access prompt if shown.
5. Select the now-enabled **Local MLX** card. Classification runs in native MLX on your Mac; extraction then runs in local Ollama. Nothing falls back to cloud.

The token stays in this tab's session storage and expires after one hour. A service restart requires pairing again. **Check local MLX** verifies an existing pairing; **Disconnect MLX** removes it from this browser. The site does not automatically probe localhost, download weights, install Python, or start a native service. Other computers need the pinned runtime/base model/adapter assets, which are excluded from this product repository. In-app browsers may block local connections even when Chrome works.

The companion holds a capture reservation through classification and extraction. This coordinates OpenMemory workers; unrelated Ollama tabs or CLI commands do not obey this lock, so avoid starting other GPU jobs during a review. If a tab disappears or loses the connection before releasing its reservation, restart the service and pair again. This favors preventing overlapping GPU jobs over automatically retrying an uncertain request.

Vercel serves the website; it never loads the native MLX weights. The browser calls your paired loopback service directly. Browser vaults on the hosted and local origins remain separate.

### Installing the trained Ollama classifier

This Mac already has `openmemory-classifier:reviewed730` installed. Its adapter is the same reviewed730 training output, converted to a 2.6 MB F32 GGUF LoRA adapter. The app accepts the original evaluated artifact (`235b080b…`) and the reproducible package artifact (`36bbc695…`). Their base-weight and adapter layers are identical; import metadata differs. Every capture checks the full digest against this explicit allowlist. Classification failures or a missing/changed artifact stop AI capture; manual review remains available. No unadapted or cloud classifier is silently substituted.

A fresh clone does not include this adapter. Follow the [local model setup guide](LOCAL_MODEL_SETUP.md) with the separate package obtained from the maintainer; a public model release is still pending. The package downloads and verifies the exact reviewed base blob, creates `openmemory-base:reviewed730`, and imports the adapter without replacing an ordinary Qwen model. Privacy & AI has an explicit metadata-only setup check. Users without local assets can use manual review or explicitly select OpenAI.

The product retains [CPU-verifiable portability results](fine-tuning-evidence/ollama-portability/README.md), without publishing weights or original dataset text. Native MLX had better intent accuracy on the reused development set; the converted Ollama classifier remains experimental and review-required.

## Running on this Mac

```sh
npm run dev -- --host 127.0.0.1 --port 3001 --strictPort
```

Keep the downloaded local Ollama service available at 127.0.0.1:11434, with this app origin allowed and cloud models disabled. The MLX Python environment and exact base weights have been copied to `.local-runtime/venv` and `.local-runtime/model` on this Mac; this folder is ignored by Git. They no longer depend on `/tmp` surviving. The reviewed730 adapter remains in the ignored `artifacts/fine-tuning/classification-reviewed9b-v1` folder. A clone on another computer does not include these assets: install a compatible native runtime/model/adapter there, or explicitly choose an installed Local Ollama model. Missing local assets produce an error with manual review available, never a cloud fallback. Native MLX requires either the local app server or the paired companion service running on an Apple Silicon Mac; a remote hosted server cannot run MLX on the browser user's Mac.

## What runs where

| Feature | Default location |
| --- | --- |
| Category and intent classification | Fine-tuned reviewed730: native MLX in MLX mode, pinned GGUF adapter in Ollama mode |
| Titles, amounts, identity matching and capture plan | Pinned local Qwen3.5:9b in MLX mode; selected general Ollama model in Ollama mode, after classifier completion |
| Ask, mapping, recommendations | Downloaded local Ollama model |
| Saves, edits, progress, backups, optional encryption | Browser storage on this origin |
| Audio transcription | ElevenLabs, only after the user selects Transcribe |
| Online title lookup | Optional explicit search to Open Library or Wikidata; only searched title is sent |
| OpenAI processing | Only after explicitly selecting OpenAI in Privacy & AI |

Typed capture never falls back to cloud. Stopping classification prevents extraction and late review; the bounded worker may finish in the background. Source words, title confirmations, classification conflicts, completion checks and explicit Save still apply. Cloud selection does not upload the vault immediately; subsequent AI actions send their relevant context to OpenAI. ElevenLabs is used only for transcription, not classification or memory analysis.

Fonts are bundled under `public/fonts` with their OFL licenses, removing automatic Google font requests. Ordinary local mode does not write per-note classifier logs into the repository. The retained `OPENMEMORY_MLX_TEST=1` diagnostic flag enables metadata-only runtime logging in `.local-runtime/classification-runtime.jsonl`.

Native MLX preserves the first classification when it passes the existing JSON and label checks. A malformed result or contradictory `MIXED` category/intent triggers at most one constrained retry with the same local adapter and prompt. Runtime failures do not trigger this retry or a cloud request. The decoder enforces the existing output contract; it cannot establish that a valid interpretation is correct. Clarification, event coverage, extraction checks and explicit review still apply. This changes decoding only; the installed adapter and Ollama classifier weights are unchanged.

This change makes the current model the default; it does not claim new qualification accuracy or retrain it. Existing reaction-intent and extractor title/quantity weaknesses, and multi-stage inference latency, remain. Review suggestions before saving.

## Companion validation — 2026-10-13

- App suite: 443 tests across 37 files; TypeScript and production build passed.
- Companion: 19 CPU-only HTTP tests, including denied origins, expired/single-use pairing, wrong adapter metadata, duplicate capture IDs, cancellation and retained reservations.
- Actual browser integration used an isolated hosted-mode preview at `127.0.0.1:3006`, a separately running companion, and the real pinned MLX adapter plus Ollama extractor. No cloud provider was selected.
- “I want to watch Dune this weekend.”: MOVIE / wishlist, 10.801 seconds classification, 24.368 seconds extraction, 35.408 seconds total. Review and Save succeeded; reload retained the item and paired MLX preference.
- “I want to go to Bangladesh in December's last week.”: WISHLIST / wishlist, 9.510 seconds classification, 17.378 seconds extraction, 27.043 seconds total. Review succeeded without conflicting entry types; no precise travel date was invented.

These are integration checks, not an independent model accuracy benchmark. The deployed pairing controls were verified live after push. The hosted HTTPS-to-loopback check timed out in the Codex in-app browser, while the companion reported ready for the exact hosted origin. Chrome pairing remains a user-side check with local-network permission enabled. Connection checks are bounded to eight seconds and explain this browser restriction.

## Deployed user flow

1. First visit starts in manual review. OpenAI requires explicit **Enable AI review** or selection in Privacy & AI; no installation or visitor API key is required for that cloud route.
2. Local MLX requires the Mac's native runtime, trained adapter, companion service and Ollama. Pair the current browser tab, then select Local MLX. Local Ollama requires the imported trained classifier and a general extractor model, plus website/local-network permission; it does not require the MLX pairing service.
3. Type a note, or explicitly transcribe recorded speech through ElevenLabs. The editable transcript uses the selected processing option.
4. **Review memory** runs trained local classification first in either local mode, then base-model detail extraction. OpenAI uses the server-side cloud capture route. Models never save automatically.
5. Review category, action, title and other details; resolve any flagged ambiguity; choose **Save**. Memories stay in that browser's vault on the deployed origin.
6. Missing local services/models or rejected outputs offer retry/manual review, with no automatic cloud fallback.

## Trained Ollama capture validation — 2026-10-13

The production capture route now selects the pinned trained classifier before the separately selected Ollama extractor. The classifier request uses evaluated penalties and `keep_alive: 0`, allowing it to unload before detail extraction. Transport tests cover the exact pinned model identity, source, sequencing, mixed-note advice handling, cancellation and failure without fallback. The trained classifier is excluded from the extractor picker.

455 application tests across 38 files, TypeScript and the production build passed. Both public evidence verifiers passed. An actual isolated hosted-mode browser test selected Local Ollama, reviewed “I want to go to Bangladesh in December's last week.” as WISHLIST / wishlist, and saved it successfully in the fictional test vault. Personal vaults were not edited.

Classifier advice now separates the known action from clarification needs. The installed adapters retain their evaluated v3 model contract; the app explicitly migrates their output into v4 review advice. See [action and clarification advice](CLASSIFICATION_ADVICE.md) for compatibility behavior, local checks, and the unactivated development prompt.
