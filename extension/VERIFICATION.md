# Browser extension development verification — 27 October 2026

## Delivered

- Installable unpacked Manifest V3 source in `extension/openmemory`.
- Toolbar popup with editable title, URL, optional note, remembered destination and visible failures.
- Right-click page/link/selected-text capture, dispatched by a service worker.
- Fixed production destination or explicitly configured loopback app only; no arbitrary destinations or embedded credentials.
- Versioned, bounded, validated fragment handoff into the existing app origin.
- Review-before-save, exact-URL duplicate protection, safe external links, link search and Saved / In progress / Done status.
- Additive optional `Memory.bookmark` schema: old records still load, new records pass the same export/import/vault validation.
- Shared links use the existing IndexedDB vault, including encryption, revision conflicts and save-failure handling. Source titles/notes are rendered as plain React text.

## Automated evidence

- Initial full suite: 49 files passed, 2 skipped; 566 tests passed, 2 skipped (included 18 initial bookmark tests).
- Added extension handler fixtures: 2 additional tests passed. These import the actual popup/service worker and use mocked Chrome APIs to inspect their emitted handoffs. They do **not** establish that Chrome itself loaded the package.
- After library placement/accessibility/id hardening: 6 affected route/component/extension tests passed; type checking passed.
- Final lint/build/check results are reported with the task handoff. Existing Vite paths-plugin and Node punycode warnings were observed, with no production build failure.
- Handoff tests preserve exact YouTube timestamps/Unicode, reject unsafe source protocols/credential URLs and unexpected destinations, reject malformed/oversized payloads, and retain explicit unknown data rather than scraping it.
- Route tests exercise real IndexedDB/encryption. Before confirmation there is no new saved memory; after confirmation the bookmark survives reopen and status changes. Encrypted drafts are withheld until unlock and their saved envelope contains no plaintext title. Failed saves retain reviewed text; duplicate capture does not overwrite the original note.

## Browser evidence

Used the running app at `http://127.0.0.1:3001` with a clearly named fictional test bookmark:

1. Opened the same versioned fragment produced by the extension and verified editable title, note and exact timestamped URL.
2. Clicked Save link: count incremented from 20 to 21, fragment cleared, saved-links shelf appeared.
3. Changed status to In progress and reloaded; the status remained In progress.
4. Reopened the same handoff: app displayed Already saved and offered the existing bookmark, preserving its original note.
5. Verified memory details expose the original link. The test bookmark remains clearly named “Extension check — Neural networks explained” in the local test library; existing records were preserved.

Screenshot captured at `/tmp/openmemory-saved-links.png` (temporary local artifact, not shipped).

## Remaining manual/install boundary

The available browser automation surface is the in-app browser, which does not expose extension installation. No extension was installed into the user's personal Chrome profile and no Chrome Web Store submission/deployment was made. A real Chrome/Edge Load unpacked smoke check remains: toolbar → review → save, and right-click → review → save. Use the local destination until this app change is deployed. The hosted site's existing version will not understand the new handoff until deployed.

Full-content extraction, automatic YouTube playback timestamp reading, offline article copies, mobile sharing, store publication and multi-device sync are outside v0.1. This version requires an app review/confirmation tab rather than a background one-click write, so encrypted-vault behavior and website storage remain consistent.

## Same-browser MLX pairing follow-up — 27 October 2026

The user-provided hosted YouTube handoff was inspected: production still showed the old Today screen, with no shared-link review, because this feature had not yet been pushed/deployed. The exact handoff displays its title, URL and note in the updated local app; no user bookmark was saved during this follow-up.

A separate bug stored the MLX grant in per-tab session storage. Updated the client to share the existing server-issued, exact-origin, one-hour grant using local storage, with migration from legacy tab grants and no expiry extension. Disconnect/expiry/rejection records a revocation tombstone so a stale tab cannot reintroduce an old session. A late status response for an older token cannot erase a newer pairing. Already-open app tabs refresh their selected provider/consent on same-origin storage changes and window focus, without probing localhost or sending a note.

Added regression coverage for new-tab restoration, existing-tab settings changes, disconnect, legacy migration, expiry, stale responses and saving the exact YouTube handoff without any AI consent. Full suite passed: 575 tests, 2 skipped; the subsequent migration-edge regression also passed in the 22-test companion client suite. Type check, affected-file lint and production build passed. Live real-token pairing across Chrome tabs still needs a check after deployment; no pairing grant or server policy was widened during automated testing.
