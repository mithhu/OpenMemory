import { useEffect, useRef, useState } from "react";
import { searchTitleCatalog, type CatalogTitle } from "@/lib/title-catalog";

export function TitleCatalog({
  kind,
  title,
  onChoose,
}: {
  kind: "book" | "movie";
  title: string;
  onChoose: (candidate: CatalogTitle) => void;
}) {
  const [query, setQuery] = useState(title);
  const [results, setResults] = useState<CatalogTitle[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const generation = useRef({ value: 0 });
  useEffect(() => {
    const epoch = generation.current;
    epoch.value++;
    setQuery(title);
    setResults(null);
    setBusy(false);
    setError("");
    return () => {
      epoch.value++;
    };
  }, [kind, title]);
  const search = async () => {
    if (busy || !query.trim()) return;
    const request = ++generation.current.value;
    setBusy(true);
    setError("");
    setResults(null);
    try {
      const candidates = await searchTitleCatalog({ data: { kind, title: query.trim() } });
      if (generation.current.value === request) setResults(candidates);
    } catch (failure) {
      if (generation.current.value === request)
        setError(failure instanceof Error ? failure.message : "Search unavailable. Try again.");
    } finally {
      if (generation.current.value === request) setBusy(false);
    }
  };
  return (
    <details className="review-more title-catalog">
      <summary>Check a real {kind === "book" ? "book" : "film"} title online</summary>
      <p>
        Only the search title goes to {kind === "book" ? "Open Library" : "Wikidata"}. Your note and
        memories stay here. Finding a title does not prove it’s the work you meant.
      </p>
      <label>
        Search title
        <input
          value={query}
          maxLength={300}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void search();
            }
          }}
          onChange={(event) => {
            generation.current.value++;
            setQuery(event.target.value);
            setResults(null);
            setError("");
            setBusy(false);
          }}
        />
      </label>
      <button
        type="button"
        className="text-button"
        disabled={busy || !query.trim()}
        onClick={search}
      >
        {busy ? "Searching…" : "Search online"}
      </button>
      {error && <p role="alert">{error}</p>}
      {results && (
        <div aria-live="polite">
          {!results.length && (
            <p>
              No matching catalog entries found. Try another spelling or keep your title. This
              catalog may not include the work.
            </p>
          )}
          {results.map((candidate) => (
            <div key={candidate.id} className="catalog-title-result">
              <strong>{candidate.title}</strong>
              <p>{candidate.detail}</p>
              <a href={candidate.url} target="_blank" rel="noopener noreferrer">
                View on {candidate.source}
              </a>{" "}
              <button type="button" className="text-button" onClick={() => onChoose(candidate)}>
                Use this title
              </button>
            </div>
          ))}
        </div>
      )}
    </details>
  );
}
