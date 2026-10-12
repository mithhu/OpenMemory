import { useState } from "react";
import { ArrowUpRight, Check, Loader2, Plus, Sparkles } from "lucide-react";
import { type Memory } from "@/lib/memory";
import { activityLabels } from "@/lib/activity";
import { discoverWithProvider, type AISettings } from "@/lib/ai-client";
import { buildTaste, type Recommendation } from "@/lib/discovery";

export function DiscoverPanel({
  memories,
  settings,
  busy,
  onSave,
  onOpen,
  onWorking,
}: {
  memories: Memory[];
  settings: AISettings;
  busy: boolean;
  onSave: (suggestion: Recommendation) => Promise<boolean>;
  onOpen: (id: string) => void;
  onWorking: (working: boolean) => void;
}) {
  const [suggestions, setSuggestions] = useState<Recommendation[]>([]);
  const [skipped, setSkipped] = useState<string[]>([]);
  const [working, setWorking] = useState(false);
  const [added, setAdded] = useState<string[]>([]);
  const [error, setError] = useState("");
  const taste = buildTaste(memories, skipped);
  return (
    <section className="life-section discover-panel">
      <div className="section-heading">
        <div>
          <h2>A little discovery</h2>
          <p>New things to explore, connected to what you’ve loved.</p>
        </div>
        <button
          className="connect-button"
          disabled={busy || working || !taste.liked.length}
          onClick={async () => {
            setWorking(true);
            onWorking(true);
            setError("");
            try {
              setSuggestions((await discoverWithProvider(memories, settings, skipped)).suggestions);
            } catch (e) {
              setError(e instanceof Error ? e.message : "Couldn't discover new things.");
            } finally {
              setWorking(false);
              onWorking(false);
            }
          }}
        >
          {working ? <Loader2 size={14} className="spin" /> : <Sparkles size={14} />}
          {working ? "Reading your taste…" : "Discover for me"}
        </button>
      </div>
      {!taste.liked.length && (
        <p className="discovery-hint">
          Give a movie, book, song, or course a “Loved” reaction to start building your taste.
        </p>
      )}
      {error && (
        <p className="review-question" role="alert">
          {error}
        </p>
      )}
      {!!suggestions.length && (
        <div className="shelf-picks">
          {suggestions
            .filter((s) => !skipped.includes(s.title))
            .map((suggestion) => (
              <article key={suggestion.title} className="discovery-card">
                <span className="eyebrow">{activityLabels[suggestion.kind]} · SUGGESTED</span>
                <h3>{suggestion.title}</h3>
                {suggestion.creator && (
                  <span className="activity-creator">{suggestion.creator}</span>
                )}
                <p>{suggestion.reason}</p>
                <div className="discovery-sources">
                  {suggestion.memoryIds.map((id) => (
                    <button className="text-button" key={id} onClick={() => onOpen(id)}>
                      {memories.find((m) => m.id === id)?.title}
                      <ArrowUpRight size={11} />
                    </button>
                  ))}
                </div>
                <div className="discovery-actions">
                  <button
                    className="primary-button"
                    disabled={busy || added.includes(suggestion.title)}
                    onClick={async () => {
                      if (await onSave(suggestion)) setAdded((a) => [...a, suggestion.title]);
                    }}
                  >
                    {added.includes(suggestion.title) ? <Check size={13} /> : <Plus size={13} />}
                    {added.includes(suggestion.title) ? "On your wishlist" : "Add to wishlist"}
                  </button>
                  <button
                    className="text-button"
                    onClick={() => setSkipped((s) => [...s, suggestion.title])}
                  >
                    Skip
                  </button>
                </div>
              </article>
            ))}
        </div>
      )}
      <details className="discovery-context">
        <summary>What this request shares</summary>
        <p>
          {settings.provider === "ollama" ? "Your local model" : "OpenAI"} receives liked/disliked
          titles, their tags, existing library titles, and skipped suggestions. Diary text and
          activity history are excluded.
        </p>
      </details>
    </section>
  );
}
