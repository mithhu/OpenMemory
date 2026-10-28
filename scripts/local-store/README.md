# Shared SQLite library on this Mac

OpenMemory has an optional local SQLite storage service. It has no MLX, Ollama or cloud AI dependency. The existing browser vault remains the default until you explicitly switch.

## Start

```sh
cd /path/to/OpenMemory
npm run storage:serve
```

Requires Python 3.9+ with its standard-library sqlite3 module. No pip dependencies. Runs on loopback `127.0.0.1:8766`, separate from MLX on 8765. Only one service should use that port. A friendly startup error explains an occupied port.

Default macOS database:

```text
~/Library/Application Support/OpenMemory/openmemory.sqlite3
```

Other systems default to `~/.local/share/OpenMemory/openmemory.sqlite3`. A custom location can be set with `npm run storage:serve -- --database /absolute/path/openmemory.sqlite3`. Files are private to the local OS user (0600; service umask 077), but **plaintext libraries are not encrypted just because they use SQLite**. Use the app's passphrase protection to encrypt the active library.

## Connect and transfer

1. Run the updated OpenMemory app locally, or deploy this version before using the hosted site.
2. In **Privacy & AI → Where your library lives**, open the **storage pairing page**. Reveal a new single-use code and paste it into the app's **Mac storage pairing code** field.
3. Choose **Connect Mac storage**. This authorizes only the exact app website origin for one hour. Browser local-network permission may also be required. Pairing does not select SQLite yet and is separate from AI/model pairing.
4. Review which library will open. If SQLite is empty, you may copy this browser's complete saved vault or start empty. A copy preserves encryption, IDs and bookmarks; the browser copy stays intact. If SQLite already contains a library, the panel only offers to open it, never overwrite it with browser data.
5. Confirm the review checkbox and choose the action. The app reloads into the selected storage backend. An encrypted Mac library asks for its passphrase in each browser session.
6. In Brave/another Chrome profile, repeat connection and choose **Use existing Mac library**. Both clients now use the same local database. Existing open pages refresh their data when reloaded; this version is not a live collaborative editor. Stale saves fail with a reload message and retain the attempted capture draft.

The extension needs no new permissions: it still opens the destination app, which saves to its selected backend. Ensure the selected destination origin is paired with the storage service.

If another browser already has a different collection, **export its backup first**, then connect to the existing Mac library and use the app's normal Import flow to add non-duplicate IDs. Do not delete either source copy during transfer. Encryption of the destination does not retroactively encrypt an old plaintext browser copy or an old export.

You can return to the untouched original browser library using **Return to this browser’s library**. Switching libraries never copies SQLite back over browser data. Each browser/origin remembers its selected mode. An old tab notices a changed mode and blocks writes until reload rather than changing destinations under an in-flight save.

## Recovery and backups

The service must be running. If it is stopped, pairing expires, or browser network permission is denied, the app reports the issue and does not silently switch to a different or empty browser library. Reconnect in Privacy & AI and reopen the Mac library. A service restart invalidates pairing tokens but leaves the database intact.

Use the app's Export action for a portable JSON/encrypted backup. To make a consistent SQLite backup, including committed WAL data:

```sh
npm run storage:serve -- --backup /absolute/path/openmemory-backup.sqlite3
```

This reads the default database, requires a new destination file and exits; it does not start another server. For custom storage, pass the same `--database` too. Do not copy only the main SQLite file while the service is writing: WAL sidecars can hold committed data. SQLite is durable storage, not a backup by itself.

## Technical boundary

- One versioned vault envelope is stored transactionally in SQLite with a monotonically increasing revision. Existing app records and encrypted backup format are preserved; no lossy category/progress migration.
- Compare-and-swap writes use `BEGIN IMMEDIATE`; encryption cannot be downgraded or rekeyed by a stale client. Reads and commits use fresh database connections; WAL and FULL synchronization are enabled.
- Encryption is the app's existing AES-GCM/PBKDF2 envelope. Keys/passphrases stay in browser memory; only ciphertext and crypto parameters reach SQLite when enabled. The service never needs an ML model or a cloud API key.
- Exact allowed origins, Host validation, short-lived origin-bound bearer tokens, single-use five-minute pairing codes, bounded bodies, CORS/private-network preflight, and pairing throttling. No wildcard origins, cookie auth, note/token access logs or automatic internet exposure.
- Allowed origins default to the hosted app plus localhost/127.0.0.1 port 3001. To override, repeat `--allow-origin` with every exact intended origin; do not use paths or wildcards.
- App limits remain 200 saved memories and service writes are bounded to 8 MiB. This first version is a shared local vault, not normalized per-memory SQL search, cross-device sync, an auto-start daemon or a packaged Mac app.

## Tests

```sh
npm run storage:test
npm test -- src/test/local-store.test.ts src/test/storage-panel.test.tsx src/test/vault.test.ts
npm run build
```

Python tests use temporary databases and loopback HTTP servers, not your real library. They simulate independent browser tokens; they do not prove Chrome/Brave permission behavior. Frontend tests exercise actual encryption/IndexedDB and the backend adapter with a simulated service transport. Live browser switching/pairing should be checked by the owner before migrating their real collection.
