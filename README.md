# OpenMemory

[Live app](https://open-memory-ai.vercel.app/) · [Research and training evidence](https://github.com/mithhu/openmemory-local-classifier-research) · [Published MLX adapter](https://huggingface.co/mithhu333/openmemory-qwen3.5-9b-mlx-classifier-v1) · [Portfolio case study](docs/portfolio/CASE_STUDY.md) · [Interview learning guide](docs/portfolio/INTERVIEW_GUIDE.md)

**Remember what happened. Pick up where you left off. Understand what connects it.**

OpenMemory combines Recall's personal library and progress tracking with a memory constellation and evidence-linked reflection. OpenMemory is the application base; the separate `my-memory` project remains intact. Personal records are written to a browser database, never to `seed.js` or another source file.

## The experience

New visitors get a short [welcome video](docs/portfolio/WELCOME_VIDEO.md), with click-to-play sound, captions and Skip. **Watch demo** reopens it from the top bar; dismissal is remembered in this browser.

1. **Tell it naturally.** “I did lessons 2–3 of Practical AI, read 30 pages of Sapiens, watched Dune and loved it, and want to watch Arrival.”
2. **Review before saving.** The companion proposes separate course, book, movie, and wishlist entries. Change their type, title, intent, date, matching item, or progress; remove or add entries. Nothing is written before confirmation. “Watched the sunset” should remain a life note, rather than a film. Ambiguous requests ask for clarification.
3. **Return to Today.** See the last seven days, recent experiences, intentions, and what to continue. Reading 20 more pages adds to the current position; “on page 120” sets it. Two reviewed events about the same new book in one note stay in one history. Changing an event to a plan clears proposed completed progress, while keeping previously saved progress. The app calculates progress, deduplicates completed lessons, and retains original notes and dated activity history. Unknown totals stay empty.
4. **Explore your library.** Filter courses, books, movies, music, and wishes. Update progress without AI, complete a lesson, mark an item finished, or record a reaction. Imported Recall courses retain named lessons and links. A “Loved” reaction informs the shelf and optional discovery suggestions; suggestions cite the liked items behind them and only enter your wishlist when you add them.
5. **Connect and reflect.** Open Constellation to update relationships. Ask questions across your memories, follow supporting sources, and record suggested steps you actually complete. Dashed connections indicate inferences, rather than facts.

Capture uses semantic model reasoning, strict output schemas, source validation, and explicit review. Unique exact library titles are matched deterministically; duplicate titles need a choice. Daily life events remain separate entries. Small local models can still misclassify or choose a wrong match, so schema validity is never treated as proof of understanding. **Review manually** supports capture without an AI request. A separate model check reports original title spellings, including when extraction already normalized a typo, and proposes corrections for explicit confirmation. Missing or contradictory source evidence is rejected; names and ordinary notes do not receive title corrections. Invalid title-check output keeps the validated proposal available for manual title review, clears automatic matches, and blocks saving until confirmation; request failures and cancellation still stop capture. **Stop waiting** and **Review manually now** keep the draft when inference is slow. Capture failures remain visible beside the draft until editing, retrying or manual review.

## Run locally

**Local-first by default:** fine-tuned MLX classifies captures on your Mac, and local Ollama extracts details and handles other reasoning. OpenAI requires explicit selection in Privacy & AI; a server key alone does not enable it. ElevenLabs remains optional for speech transcription. See [local-first setup and architecture](docs/LOCAL_FIRST.md).

The custom adapter and native environment are not included in this repository. On another computer, install the separately required trained classifier and extractor before selecting **Local Ollama**, or use manual review. The [experimental native MLX adapter](https://huggingface.co/mithhu333/openmemory-qwen3.5-9b-mlx-classifier-v1) is published separately with a pinned base and local runner. It does not install the complete app runtime or provide the Ollama GGUF package.

```sh
npm install
cp .env.example .env
# Add your key to OPEN_AI_KEY in .env, if using OpenAI cloud processing.
npm run dev
```

Keep an existing `.env` file. The server also accepts `OPENAI_API_KEY` or `ASTRA_API_KEY`; restart after changing it. The OpenAI cloud provider defaults to `gpt-6-luna` (override with server-side `OPENAI_MODEL`) through the Responses API with `store: false`. API keys remain server-side and are never stored in browser storage. Only the provider, local model name, capture engine and explicit cloud opt-in are saved in browser AI settings; no keys are stored there. `OPENAI_MODEL` is server-side configuration, not a browser API key. Astra remains an explicitly selectable server model override for diagnostics; there is no automatic upgrade to it.

New browsers start with ten fictional demo memories. Existing OpenMemory browser records migrate to IndexedDB only after the database write succeeds. An intentionally empty collection stays empty. **Explore the demo** adds examples alongside existing records.

### Local Ollama

Install Ollama from its official distribution and download a model with structured JSON support. Start a local-only service with the app's exact origin; substitute the actual Vite URL:

```sh
OLLAMA_NO_CLOUD=1 OLLAMA_ORIGINS=http://127.0.0.1:3001 ollama serve
```

Open **Privacy & AI**, click **Find my local models**, select a downloaded model, then select **Local Ollama**. Requests go directly from the browser to `127.0.0.1:11434`. Model metadata is checked before notes are sent; remote models and cloud aliases are blocked. This implementation supports downloaded GGUF and Safetensors models, including Ollama MLX models. MLX remains experimental for full capture: [app and model case study](docs/FINE_TUNING_CASE_STUDY.md) found type and title-evidence errors. Entire JSON code fences are accepted; output fields and source evidence are still validated strictly. Capture, mapping, reflection, and discovery all use the selected provider. Local failures never retry through Astra.

Live checks used already-installed models: Astra separated a five-event note correctly; Qwen 3.5 9B classified a book/song/life note correctly, while its matching choices needed review. Smaller tested models made semantic mistakes. Choose a model your machine can run and check its proposals. Local inference speed depends on the model and hardware.

A hosted HTTPS page may need browser permission to reach loopback; browser policies can prevent it. Ollama needs to allow that hosted origin. See [Ollama's local/cloud and origin configuration](https://docs.ollama.com/faq) and [structured outputs](https://docs.ollama.com/capabilities/structured-outputs).

## Storage and privacy

Memories live in IndexedDB on this browser and origin. IndexedDB alone is **not encryption**. In **Privacy & AI**, set a passphrase to encrypt the vault with AES-GCM 256 using a PBKDF2-derived key and a fresh IV on each save. The passphrase is not saved; the non-extractable key exists only in memory. Reloading an encrypted workspace requires unlocking it. **Lock now** clears the active key and displayed workspace. Keep the passphrase: there is no reset or recovery service.

Enabling encryption removes legacy plaintext memory, graph, and briefing caches; graph/briefing persistence is disabled for encrypted workspaces. Encrypted vault exports remain encrypted even while the workspace is unlocked. Old backups you exported earlier are unaffected. Writes finish durably before the UI reports success. Revision checks refuse stale writes from another tab, including a plaintext tab trying to replace an encrypted vault.

Encryption protects saved data while locked. While unlocked, the application can read the records; it does not protect against malicious code executing in the page. Choosing cloud reasoning still shares the request's context:

| Operation                         | Context sent to the selected model                                                                                |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Capture                           | The new note and a catalog of existing IDs, titles, types, and categories                                         |
| Map / Ask / briefing              | Saved memory details, answers, and activity history                                                               |
| Discovery                         | Liked/disliked library titles and tags, known titles, and session skips; diary text and activity history excluded |
| Manual review / progress controls | No model request                                                                                                  |

## Bring your Recall data

Use **Export JSON** in Recall, then **Import** in OpenMemory. Courses, named lessons, completion state, movie minutes, book pages, music plays, reactions, tags, links, and dated logs are converted into the new model. JSON imports add records and preserve existing ones; repeated imports skip IDs already present. Imports are validated and fail without partially saving. The old project and its browser database are not changed.

OpenMemory JSON backups can also be imported. Encrypted backups ask for their passphrase before adding records. Restoring into an unencrypted workspace encrypts the merged workspace with the backup's passphrase; an already-encrypted workspace keeps its current passphrase. Text/Markdown imports go into the composer for review. If existing storage cannot be read, edits are blocked and **Export backup** preserves the raw data for recovery.

Browser storage is device/origin-specific, with no accounts or cross-device sync. Clearing site data can remove the vault; keep exported backups. The current workspace supports up to 200 memory/library records, with validated history limits. Voice capture uses server-side ElevenLabs transcription, then adds the transcript to the composer for review. Recall's lesson editing is not included in this version. Discovery uses model knowledge, without live catalog or availability lookup. Suggested actions do not execute external reminders, calendar changes, or messages.

## Architecture and validation

- `src/lib/capture-plan.ts` — multi-entry capture schemas, subject matching, atomic updates, Recall import.
- `src/lib/activity.ts` — deterministic progress and completion rules.
- `src/lib/vault.ts` — IndexedDB transactions, encryption, sessions, revision checks, recovery exports.
- `src/lib/ai-client.ts` — provider routing, local model preflight, no cloud fallback.
- `src/lib/astra.ts` / `astra.server.ts` — server functions, server-only secrets, Responses API.
- `src/lib/ai-protocol.ts` / `discovery.ts` — shared schemas, grounding, source checks, compact taste context.
- `src/components/CaptureReview.tsx`, `LifeDashboard.tsx`, `PrivacyPanel.tsx`, `DiscoverPanel.tsx` — capture, continuity, privacy, discovery.
- `src/hooks/use-memory-graph.ts` — debounced map updates while Constellation is open; discards outdated memory/provider responses and records provider provenance.

Structured results follow the [OpenAI Structured Outputs documentation](https://developers.openai.com/api/docs/guides/structured-outputs). Source IDs and data shape are validated; interpretations still need judgment.

```sh
npm test
npx tsc --noEmit
npm run build
```

Tests cover classification correction, review boundaries, mixed atomic updates, progress arithmetic, lesson deduplication, Recall conversion, privacy-limited discovery, local failures and cloud aliases, encryption/backup recovery, stale tab writes, outdated graph responses, provider switches, grounded source references, and action completion.

The [fine-tuning case study](docs/FINE_TUNING_CASE_STUDY.md) documents the current experimental MLX adapter, development results, rejected extension and app failure cases. Complete experiment scripts, data and learning logs are preserved in a separate local research archive rather than bundled with the product. The [portfolio guide](docs/PORTFOLIO.md) connects the published research repository, Hugging Face adapter, demo and interview material. Local base/adapter weights in `.local-runtime/` and `artifacts/fine-tuning/` are excluded from Git.

For the separate trained classifier package, see the [consumer setup guide](docs/LOCAL_MODEL_SETUP.md) and [speech-to-memory demo](docs/LOCAL_MODEL_DEMO.md). Model weights are kept outside this application repository; the native MLX research adapter is now public on Hugging Face. The app-specific Ollama installation package remains separate.

## Browser extension: Save to OpenMemory

Save pages, links, selected text and YouTube links to the same browser vault. The toolbar popup opens an editable review before anything is saved. See [installation, local development and privacy](extension/README.md). Requires the bookmark-enabled app version; the extension is loaded unpacked during development.

## Shared local SQLite storage

For one library across browsers on the same Mac, run `npm run storage:serve`, then connect in **Privacy & AI → Where your library lives**. The app previews a copy/switch before using the Mac database; existing browser data is retained. Storage is independent of MLX and cloud AI. See [setup, transfer, encryption and backups](scripts/local-store/README.md).

## Save links from iPhone

Open `/iphone` on the deployed app to install the Apple Shortcuts Share Sheet action. It opens a shared HTTP(S) link for review and saves through the phone browser's existing vault. See [capture behavior and verification limits](iphone/README.md). Phone-to-Mac QR sync is separate future work.
