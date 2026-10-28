# Save to OpenMemory — browser extension (v0.1)

A Manifest V3 extension for Chrome and Edge. It opens a review in your existing OpenMemory browser vault. No new account, API key, extension backend or cloud processing is required.

## Install locally

1. Deploy/run the OpenMemory app version containing bookmark support first. Older app versions do not understand the handoff.
2. Open `chrome://extensions` (Edge: `edge://extensions`) and enable **Developer mode**.
3. Choose **Load unpacked** and select this repository's `extension/openmemory` folder.
4. Pin **Save to OpenMemory** in the toolbar.
5. Open a normal web page, click the icon, optionally add a note, and choose **Review in OpenMemory**. Confirm **Save link** in the app.

For a local app, expand **Where to save** in the popup and enter `http://localhost:3001` (or your actual local port). Hosted default: `https://open-memory-ai.vercel.app`. By default each origin/browser profile has its own browser vault. With **Store on this Mac**, separately connected browsers/origins can use the same local SQLite library. Set the destination to the same origin you already use; localhost, 127.0.0.1, and the deployed site have separate libraries.

You can also right-click a page, hyperlink or selected text and choose **Save to OpenMemory**. Linked pages use the link as the source; selected text is kept as a draft note. A selected-text save uses the current page title. The popup lets you edit an unavailable title.

## What happens

- Popup gets the current tab's title/URL only after you click the extension.
- Right-click action shares only the chosen URL, page title (when appropriate), and selected text.
- A new OpenMemory tab receives a versioned payload in the URL **fragment**, not server query parameters. This is a browser-local draft until confirmed. Fragments can remain in browser history/session recovery until Save/Cancel removes them; do not use this as a secret transport. The app doesn't persist a separate plaintext draft.
- If the vault is locked, unlock it first; the draft is then shown. Bookmarks are written by the existing encrypted/unencrypted vault code, with its concurrency conflict checks. Failed writes keep the draft for retry.
- Saving an exact URL twice offers the existing item and preserves its note. Distinct timestamps/query strings are distinct links.
- Saved links appear in **Your library**, with search and Saved / In progress / Done status, and in memories. Export/import includes them. Open a link to visit its source; Delete is available in memory details.

## Scope and privacy

No host permissions, content scripts, scraping, browsing-history access, remote code, analytics or AI calls in the extension. Permissions: `activeTab`, `contextMenus`, and `storage` (destination preference only). No `tabs` permission: current-tab access is granted by the user's action. Destination is restricted to the fixed hosted OpenMemory origin or loopback development origins, without credentials, paths, queries or fragments. Source links allow HTTP(S) only and reject embedded credentials.

This saves **bookmarks**, not full posts, videos, transcripts or offline copies. Private/deleted posts may become unavailable. YouTube URLs, including manually shared timestamps, are preserved; automatic playback-timestamp capture and buttons injected into YouTube aren't in v0.1. Mobile share sheets, browser-store publication and cross-device sync are separate work. The extension follows the destination app’s selected storage mode. To share a library across browsers on the same Mac, enable **Store on this Mac** in each browser; browser-only mode stays isolated.

## Verification

Run `npm test -- src/test/bookmarks.test.ts src/test/bookmark-capture.test.tsx src/test/bookmark-route.test.tsx src/test/bookmark-extension.test.ts` and `npm run build` from the repository root. The integration tests cover actual vault save/reload, encryption and handoff parsing. See the development report in `extension/VERIFICATION.md` for verification limits.
