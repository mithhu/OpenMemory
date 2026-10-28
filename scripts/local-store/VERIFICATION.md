# Shared local SQLite verification — 28 October 2026

## Result

Implemented optional Mac SQLite storage without changing the default browser backend or the MLX/Ollama/cloud providers. The service runs independently at `127.0.0.1:8766`. The app previews storage switching/copying and requires an explicit confirmation; no existing user collection was transferred during development.

## Evidence

- Python integration suite: **15 passed**. Temporary SQLite databases, real loopback HTTP requests, independent browser tokens, origin/Host/auth rejection, rate limits, single-use and expired codes/tokens, SQLite persistence, consistency backup, no backup overwrite, WAL/CAS concurrent writer conflicts, and encrypted-vault downgrade prevention.
- Complete frontend suite: **594 passed, 2 skipped** across 55 test files. New checks cover fixed-origin storage pairing, no writes before authorization, immutable per-page backend choice, actual IndexedDB preservation, real AES-GCM encrypted envelopes transferred through the storage adapter, missing-service/no-fallback behavior, stale revisions, reviewed transfers and a changing browser source.
- Actual route tests: chosen Mac collection loads rather than browser records; an empty Mac library stays empty rather than importing/seeding browser memories; outages preserve the separate browser collection. Legacy browser data is not cleared by encrypting the separate Mac library.
- TypeScript checking, affected-file ESLint, production build and Git whitespace checks passed. Existing Node punycode/Vite paths-plugin warnings remain non-blocking.
- Live in-app browser: verified Privacy & AI renders the storage controls, separate storage-pairing instructions, current browser mode and a disabled connection button without a code. Opened the running service’s root page and verified it identifies the default Mac SQLite database. Did not reveal a code, grant browser access or copy user memories.

## Runtime and limitations

The development service was started against the default macOS Application Support database. No automatic daemon/start-at-login was installed. Browser grant creation and the reviewed copy/switch remain the owner’s actions. The change is local and has not been pushed/deployed as part of this SQLite task.

Two-browser API behavior is verified using independent tokens in HTTP tests; a real Chrome-and-Brave permission/pairing and migration walkthrough is still needed. Existing open pages load another browser’s changes after refresh, with revision conflicts preventing silent overwrite. This is not real-time collaborative sync, cross-device sync, normalized per-memory SQL indexing or a packaged desktop app.

Model weights, classifier configuration, research datasets, unrelated untracked research and the existing MLX service on port 8765 were not modified.
