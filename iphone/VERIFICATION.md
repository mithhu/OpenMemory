# iPhone capture verification — 2026-10-29

## Delivered

- Native Apple Shortcut: **Save to OpenMemory**; five actions documented in README.md.
- Public Apple installer: https://www.icloud.com/shortcuts/fe2c9cdd42fa4e4297129677e8278139
- Signed export: `public/shortcuts/Save-to-OpenMemory.shortcut` (22,320 bytes).
- SHA-256: `851d9ebd23f30c922a1711a831e718fd4196871791e2a02ffd3259b02fe24aef`.
- Setup route `/iphone`, signed-file fallback and `#save-url=` review handoff.

## Verified

- Created and inspected the native five-action workflow and magic-variable chain in Apple Shortcuts on this Mac.
- Share Sheet enabled; accepts Text, URLs and Safari Web Pages.
- Exported with Apple's **Anyone** validation; export succeeded.
- Apple public installer visibly shows the expected name and Get Shortcut link.
- Actual browser route received a fictional `https://example.org/iphone-capture-check` link and opened review. Cancel removed the fragment; no test bookmark was saved to the owner's library.
- A first visitor's shared-link review is not covered by the welcome demo. Explicit Watch demo remains available.
- Automated tests exercise unchanged URL/timestamp/query preservation, malformed/unsafe input rejection, review-before-save, real IndexedDB save and cancel behavior, and setup links/storage disclosures.
- Full suite: **611 passed, 2 skipped** (existing skipped tests).
- TypeScript, focused ESLint, production build and git diff whitespace checks passed.

## Not verified / not included

- Physical iPhone installation and Share Sheet execution still require a device trial. Mac export and browser tests do not prove iOS runtime behavior or every source app's sharing format.
- No offline installation, native share extension, page scraping or video download.
- No QR sync or phone-to-Mac connection. Captures remain in the phone browser library; existing Export/Import is the manual transfer path.

## Device acceptance check

1. Open `/iphone` on the deployed site in the phone browser and install from the Apple link.
2. Share a YouTube video through the system Share menu → Save to OpenMemory.
3. Verify exact link/timestamp; add a title/note and Save link.
4. Reopen OpenMemory in the same phone browser and confirm persistence.
5. Repeat with a Safari article and a compatible social post; test Cancel.
6. Export a backup before clearing website data. Do not expect the Mac library to change automatically.
