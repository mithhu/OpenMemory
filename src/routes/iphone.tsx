import { createFileRoute } from "@tanstack/react-router";
import { ArrowLeft, ArrowUpRight, Download, Share2, Smartphone } from "lucide-react";

export const Route = createFileRoute("/iphone")({
  head: () => ({
    meta: [
      { title: "Save to OpenMemory from iPhone" },
      {
        name: "description",
        content:
          "Save a shared YouTube link, post or article from your iPhone with an Apple Shortcut.",
      },
    ],
  }),
  component: IPhoneCapture,
});
function IPhoneCapture() {
  return (
    <main className="iphone-setup">
      <a className="text-button" href="/">
        <ArrowLeft size={15} /> Back to OpenMemory
      </a>
      <header>
        <span className="eyebrow">
          <Smartphone size={16} /> A LITTLE MEMORY, WHEREVER YOU ARE
        </span>
        <h1>
          Found something <em>worth keeping?</em>
        </h1>
        <p>
          Save a video, post or article from your iPhone. Share the link, add your own words, and
          keep it for later.
        </p>
      </header>
      <section aria-labelledby="iphone-install">
        <h2 id="iphone-install">Add “Save to OpenMemory”</h2>
        <p>
          Open this page on your iPhone. The Shortcut was created and exported with Apple’s
          Shortcuts app.
        </p>
        <a
          className="primary-button"
          href="https://www.icloud.com/shortcuts/fe2c9cdd42fa4e4297129677e8278139"
        >
          <Download size={17} /> Get the iPhone Shortcut
        </a>
        <p>
          Prefer a file?{" "}
          <a href="/shortcuts/Save-to-OpenMemory.shortcut">Download the signed Shortcut</a> and open
          it from Files.
        </p>
        <ol>
          <li>Tap the button above, then choose Get Shortcut on Apple’s page.</li>
          <li>
            Review its five actions in Shortcuts, then tap <strong>Add Shortcut</strong>.
          </li>
          <li>
            In YouTube, Safari or another app that shares links, tap <strong>Share</strong>. Choose{" "}
            <strong>Save to OpenMemory</strong> in the actions list. You may need to scroll or
            choose More in the source app to reach the iPhone Share menu.
          </li>
          <li>
            OpenMemory opens in your browser. Give the link a title or an optional note, then tap{" "}
            <strong>Save link</strong>.
          </li>
        </ol>
        <p className="iphone-callout">
          <Share2 size={18} /> Share → Save to OpenMemory → Review → Save link
        </p>
      </section>
      <section aria-labelledby="iphone-storage">
        <h2 id="iphone-storage">A place on your phone</h2>
        <p>
          This first version saves to OpenMemory’s local library in the browser opened by the
          Shortcut. Your Mac can be off. Use the same browser each time to keep one phone library,
          and export backups before clearing website data.
        </p>
        <p>
          <strong>Phone-to-Mac QR sync is not available yet.</strong> Your phone cannot reach the
          Mac service through 127.0.0.1. For now, Export and Import can transfer a backup between
          devices.
        </p>
        <p>
          Internet access is needed to open the website. This is not a native iPhone app or an
          offline installation.
        </p>
      </section>
      <details>
        <summary>What the Shortcut does</summary>
        <ol>
          <li>Get URLs from Shortcut Input.</li>
          <li>Choose the first URL when more than one was shared.</li>
          <li>URL-encode it.</li>
          <li>Build the OpenMemory address with the link in its URL fragment.</li>
          <li>Open that address for your review.</li>
        </ol>
        <p>
          No AI, clipboard reading, automatic saving, page scraping or connection to your Mac. Only
          HTTP(S) links are accepted. A shared link does not include a copy of the full post, thread
          or video. Notes are added in OpenMemory.
        </p>
        <p>
          The fragment is not sent in the website’s HTTP request, but it may remain in browser
          history/session recovery until you Save or Cancel.
        </p>
      </details>
      <details>
        <summary>If the Shortcut doesn’t appear</summary>
        <p>
          Open it in Shortcuts, open Details, and enable <strong>Show in Share Sheet</strong>. It
          accepts URLs, text and Safari web pages. The source app must share compatible content;
          private posts may share only a link, or no usable link.
        </p>
        <p>
          If importing the file fails, build it manually with the five actions above. In the Text
          action, type <code>https://open-memory-ai.vercel.app/#save-url=</code> and insert the{" "}
          <strong>URL Encoded Text</strong> variable immediately after the equals sign. Set Open
          URLs to use that Text output.
        </p>
        <a
          className="text-button"
          href="https://support.apple.com/en-gb/guide/shortcuts/apd163eb9f95/ios"
          target="_blank"
          rel="noopener noreferrer"
        >
          Apple’s Share Sheet guide <ArrowUpRight size={14} />
        </a>
      </details>
    </main>
  );
}
