import { useState } from "react";
import { Bookmark, ArrowUpRight } from "lucide-react";
import { type Memory } from "@/lib/memory";

export function BookmarkLibrary({
  memories,
  disabled,
  onStatus,
  onOpen,
}: {
  memories: Memory[];
  disabled: boolean;
  onStatus: (id: string, status: NonNullable<Memory["bookmark"]>["status"]) => void;
  onOpen: (id: string) => void;
}) {
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const bookmarks = memories.filter((memory) => memory.bookmark);
  if (!bookmarks.length) return null;
  const shown = bookmarks.filter(
    (memory) =>
      (filter === "all" || memory.bookmark?.status === filter) &&
      `${memory.title} ${memory.summary} ${memory.bookmark?.url}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  return (
    <section className="bookmark-library" aria-labelledby="saved-links-heading">
      <span className="eyebrow">
        <Bookmark size={14} /> YOUR SAVED CORNER
      </span>
      <h2 id="saved-links-heading">For a quieter moment.</h2>
      <p>Posts, threads and videos you wanted to come back to.</p>
      <div className="bookmark-filters">
        <label className="sr-only" htmlFor="bookmark-search">
          Search saved links
        </label>
        <input
          id="bookmark-search"
          type="search"
          placeholder="Find a saved link…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <label className="sr-only" htmlFor="bookmark-filter">
          Filter saved links
        </label>
        <select
          id="bookmark-filter"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
        >
          <option value="all">All saved links ({bookmarks.length})</option>
          <option value="saved">Saved</option>
          <option value="in-progress">In progress</option>
          <option value="done">Done</option>
        </select>
      </div>
      <div className="bookmark-grid">
        {shown.map((memory) => (
          <article key={memory.id} className="bookmark-card">
            <span className="bookmark-source">
              {new URL(memory.bookmark!.url).hostname.replace(/^www\./, "")}
            </span>
            <h3>{memory.title}</h3>
            <p>{memory.summary}</p>
            <label htmlFor={`bookmark-status-${memory.id}`}>Status for {memory.title}</label>
            <select
              id={`bookmark-status-${memory.id}`}
              value={memory.bookmark!.status}
              disabled={disabled}
              onChange={(event) =>
                onStatus(memory.id, event.target.value as NonNullable<Memory["bookmark"]>["status"])
              }
            >
              <option value="saved">Saved</option>
              <option value="in-progress">In progress</option>
              <option value="done">Done</option>
            </select>
            <div className="bookmark-actions">
              <a
                className="text-button"
                href={memory.bookmark!.url}
                target="_blank"
                rel="noopener noreferrer"
                referrerPolicy="no-referrer"
              >
                Open link <ArrowUpRight size={14} />
              </a>
              <button className="text-button" onClick={() => onOpen(memory.id)}>
                Details
              </button>
            </div>
          </article>
        ))}
      </div>
      {!shown.length && <p role="status">No saved links match this search.</p>}
    </section>
  );
}
