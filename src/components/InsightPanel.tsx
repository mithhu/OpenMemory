import { ArrowRight, ArrowUpRight, GitBranch, Lightbulb, Scale, Sparkles } from "lucide-react";
import { type Insight, type Memory, type SavedSynthesis, type SuggestedAction } from "@/lib/memory";

export function Sources({
  ids,
  memories,
  onSelect,
}: {
  ids: string[];
  memories: Memory[];
  onSelect: (id: string) => void;
}) {
  return (
    <div className="sources">
      {ids.map((id) => {
        const memory = memories.find((m) => m.id === id);
        return memory ? (
          <button key={id} onClick={() => onSelect(id)} title={`Source: ${memory.title}`}>
            <span className="source-dot" />
            {memory.title}
            <ArrowUpRight size={11} />
          </button>
        ) : null;
      })}
    </div>
  );
}
const kinds = {
  pattern: { label: "A pattern", Icon: GitBranch },
  opportunity: { label: "An opening", Icon: Lightbulb },
  tension: { label: "A little tension", Icon: Scale },
};
export function InsightCard({
  insight,
  memories,
  onSelect,
  onHighlight,
}: {
  insight: Insight;
  memories: Memory[];
  onSelect: (id: string) => void;
  onHighlight: (ids: string[]) => void;
}) {
  const { label, Icon } = kinds[insight.kind];
  return (
    <article
      className={`insight-card insight-${insight.kind}`}
      onMouseEnter={() => onHighlight(insight.memoryIds)}
      onMouseLeave={() => onHighlight([])}
    >
      <div className="insight-kind">
        <Icon size={13} />
        {label}
      </div>
      <h3>{insight.title}</h3>
      <p>{insight.detail}</p>
      <Sources ids={insight.memoryIds} memories={memories} onSelect={onSelect} />
    </article>
  );
}
export function ActionCard({
  action,
  index,
  memories,
  onSelect,
  done,
  onToggle,
  disabled = false,
}: {
  action: SuggestedAction;
  index: number;
  memories: Memory[];
  onSelect: (id: string) => void;
  done: boolean;
  onToggle: () => void;
  disabled?: boolean;
}) {
  return (
    <article className={`action-card ${done ? "is-done" : ""}`}>
      <button
        className="action-check"
        onClick={onToggle}
        disabled={disabled}
        aria-pressed={done}
        aria-label={done ? `Mark incomplete: ${action.title}` : `Mark complete: ${action.title}`}
      >
        {done ? "✓" : String(index + 1).padStart(2, "0")}
      </button>
      <div>
        <h3>{action.title}</h3>
        <p>{action.detail}</p>
        <Sources ids={action.memoryIds} memories={memories} onSelect={onSelect} />
      </div>
    </article>
  );
}
export function InsightPanel({
  synthesis,
  memories,
  stale,
  busy,
  onGenerate,
  onSelect,
  onHighlight,
}: {
  synthesis: SavedSynthesis | null;
  memories: Memory[];
  stale: boolean;
  busy: boolean;
  onGenerate: () => void;
  onSelect: (id: string) => void;
  onHighlight: (ids: string[]) => void;
}) {
  return (
    <aside className="insight-panel">
      <div className="panel-heading">
        <div>
          <Sparkles size={15} />
          <h2>Between the lines</h2>
        </div>
        <span className={`result-badge ${synthesis?.mode === "live" ? "live" : ""}`}>
          {synthesis?.mode === "live" ? "ASTRA" : "PREVIEW"}
        </span>
      </div>
      <p className="panel-subtitle">The things your notes don't say alone.</p>
      {stale && (
        <div className="stale-notice">
          Your memories have changed. Find the threads again for a fresh view.
        </div>
      )}
      {synthesis ? (
        <div className="insight-stack">
          {synthesis.result.insights.map((insight, i) => (
            <InsightCard
              key={`${synthesis.generatedAt}-${i}`}
              insight={insight}
              memories={memories}
              onSelect={onSelect}
              onHighlight={onHighlight}
            />
          ))}
          {!synthesis.result.insights.length && (
            <p className="empty-insights">
              There isn't enough evidence for a pattern yet. Add a few more moments.
            </p>
          )}
        </div>
      ) : (
        <div className="insight-empty">
          <div className="empty-spark">
            <Sparkles size={26} strokeWidth={1} />
          </div>
          <h3>Some things only make sense together.</h3>
          <p>Let Astra read across your memories and show you the threads you might have missed.</p>
          <button onClick={onGenerate} disabled={busy || !memories.length}>
            Find my hidden threads
            <ArrowRight size={15} />
          </button>
        </div>
      )}
      {synthesis && (
        <div className="question-card">
          <span>A QUESTION TO SIT WITH</span>
          <p>{synthesis.result.openQuestion}</p>
          <button onClick={onGenerate} disabled={busy}>
            Look a little deeper
            <ArrowUpRight size={14} />
          </button>
        </div>
      )}
    </aside>
  );
}
