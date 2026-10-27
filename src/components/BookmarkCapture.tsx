import { useState } from "react";
import { BookmarkPlus, ArrowUpRight, X } from "lucide-react";
import { bookmarkHandoffSchema, findBookmark, type BookmarkHandoff } from "@/lib/bookmarks";
import { type Memory } from "@/lib/memory";

export function BookmarkCapture({
  input,
  memories,
  disabled,
  onSave,
  onCancel,
  onOpen,
}: {
  input: BookmarkHandoff;
  memories: Memory[];
  disabled: boolean;
  onSave: (value: BookmarkHandoff) => Promise<boolean>;
  onCancel: () => void;
  onOpen: (id: string) => void;
}) {
  const [title, setTitle] = useState(input.title);
  const [url, setUrl] = useState(input.url);
  const [note, setNote] = useState(input.note);
  const [error, setError] = useState("");
  const parsed = bookmarkHandoffSchema.safeParse({ ...input, title, url, note });
  const existing = parsed.success ? findBookmark(memories, parsed.data.url) : undefined;
  return (
    <section className="bookmark-capture" aria-labelledby="bookmark-heading">
      <div className="bookmark-heading">
        <span className="eyebrow">
          <BookmarkPlus size={15} /> SAVE FOR LATER
        </span>
        <button
          className="icon-button"
          aria-label="Dismiss shared link"
          disabled={disabled}
          onClick={onCancel}
        >
          <X size={18} />
        </button>
      </div>
      <h2 id="bookmark-heading">A little something worth keeping.</h2>
      <p>Check this link, then keep it in this browser’s library. No AI is needed.</p>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          setError("");
          if (!parsed.success) {
            setError("Enter a valid HTTP or HTTPS link without embedded credentials.");
            return;
          }
          if (existing) return;
          if (!(await onSave(parsed.data)))
            setError(
              "Could not save this link. Your draft is still here. Check the storage message and try again.",
            );
        }}
      >
        <label>
          Saved link title
          <input
            value={title}
            maxLength={300}
            onChange={(event) => setTitle(event.target.value)}
            disabled={disabled}
            placeholder="Give this link a name"
          />
        </label>
        <label>
          Saved link URL
          <input
            type="url"
            required
            value={url}
            maxLength={4096}
            onChange={(event) => setUrl(event.target.value)}
            disabled={disabled}
          />
        </label>
        <label>
          Why I’m saving this <span className="bookmark-optional">Optional</span>
          <textarea
            value={note}
            maxLength={4000}
            rows={3}
            onChange={(event) => setNote(event.target.value)}
            disabled={disabled}
            placeholder="What caught your attention?"
          />
        </label>
        {existing && (
          <p role="status">
            This exact link is already in your library.{" "}
            <button type="button" className="text-button" onClick={() => onOpen(existing.id)}>
              Open saved link <ArrowUpRight size={14} />
            </button>{" "}
            Your existing note will be kept.
          </p>
        )}
        {error && (
          <p role="alert" className="bookmark-error">
            {error}
          </p>
        )}
        <div className="bookmark-actions">
          <button className="primary-button" disabled={disabled || Boolean(existing)} type="submit">
            {disabled ? "Please wait…" : existing ? "Already saved" : "Save link"}
          </button>
          <button type="button" className="text-button" disabled={disabled} onClick={onCancel}>
            Cancel
          </button>
        </div>
        <p className="bookmark-privacy">
          Only the link, title and note are saved. The full post, video or thread has not been
          downloaded.
        </p>
      </form>
    </section>
  );
}
