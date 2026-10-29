# Save to OpenMemory from iPhone — capture v1

## Install

Open the app's `/iphone` page on the phone and tap **Get the iPhone Shortcut**, then Get Shortcut on Apple's page. Inspect its actions and choose Add Shortcut. Direct installer: https://www.icloud.com/shortcuts/fe2c9cdd42fa4e4297129677e8278139 . A signed **Save-to-OpenMemory.shortcut** download is also provided as a fallback; open it from Downloads/Files. In Shortcuts Details, **Show in Share Sheet** must be enabled.

The signed file was exported with Apple's Shortcuts app, using **For: Anyone** (Apple validation, no contact-only distribution). The generated workflow accepts Text, URLs and Safari Web Pages. It contains only these native actions, created and inspected in the editor:

1. Get URLs from Shortcut Input.
2. Get First Item from URLs.
3. URL Encode the Item from List.
4. Text: `https://open-memory-ai.vercel.app/#save-url=` followed by the **URL Encoded Text** variable.
5. Open URLs using the Text output.

The Share Sheet action extracts the first URL if multiple URLs are supplied. If nothing usable is shared, share a link rather than a media file. It does not download video files or scrape post content. Your own note and the title can be added in OpenMemory's review form.

## Use

In YouTube, Safari, Facebook, X or another app that shares compatible links, choose Share, open the system Share menu if the app first shows its own menu, then choose Save to OpenMemory. Some apps require scrolling to the Shortcuts actions. Review the resulting link, add a title/note and tap Save link. Sharing opens the review only; it does not automatically save.

## Storage and privacy

This uses the library in whichever iPhone browser Open URLs opens. Use the same browser/profile consistently. The Mac can be off, but internet access is needed to load the website; no offline app/service-worker support is included in this release. Browser storage can be cleared by the user/browser, so export backups.

The Shortcut includes no API keys, credentials, pairing tokens, user memories or personal notes. It does not read the clipboard, contact a cloud AI, call localhost or grant access to the Mac database. Its URL contains only the source link in a fragment, not in server query parameters. Fragments may remain in browser history/session recovery until the review is saved/cancelled; they are not a secret-storage mechanism.

**QR pairing, phone-to-Mac transfers, live sync, native iOS share extensions and offline capture are not implemented here.** Phone captures remain in the phone browser library. Export/Import is the existing transfer option until device sync is delivered. The Mac SQLite mode is intended for browsers on that Mac, not for 127.0.0.1 connections from the phone.

## Reviewable source and rebuild

The five-action source above is the human-readable definition. The signed `.shortcut` file is `public/shortcuts/Save-to-OpenMemory.shortcut`, exported from the native Apple editor rather than assembled from guessed action identifiers. To rebuild, create the five actions, enable Show in Share Sheet with Text/URL/Safari Web Page inputs, then File → Export → Anyone. Signing submits the generated workflow to Apple for validation; no runtime user data is part of the export.

Apple guide: https://support.apple.com/en-gb/guide/shortcuts/apd163eb9f95/ios

## Verification scope

The Mac editor shows the expected variable chain and sharing settings, and Apple export succeeded. Unit/route tests verify URL handling, safety rejection, review-before-save, save/cancel fragment removal and real browser-vault persistence. A physical iPhone install/share walkthrough remains a user/device test; Mac export is not evidence that every iPhone app passes the same input or that mobile OS import was verified.
