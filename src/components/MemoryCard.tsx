import { useState, type CSSProperties } from "react";
import { ArrowUpRight, Check, MessageCircle, Trash2, X } from "lucide-react";
import { categoryMeta, formatDate, type Memory } from "@/lib/memory";
import { categoryIcons } from "./memory-icons";

interface Props {
  memory: Memory;
  onLog: (value: string) => void;
  onDelete: () => void;
  onDone: () => void;
  onExplore?: () => void;
  compact?: boolean;
  disabled?: boolean;
}
export function MemoryCard({
  memory: m,
  onLog,
  onDelete,
  onDone,
  onExplore,
  compact = false,
  disabled = false,
}: Props) {
  const [answer, setAnswer] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const Icon = categoryIcons[m.category];
  const submit = () => {
    if (answer.trim() && !disabled) {
      onLog(answer.trim());
      setAnswer("");
    }
  };
  return (
    <article
      className={`journal-card ${compact ? "compact" : ""}`}
      style={{ "--category-color": categoryMeta[m.category].color } as CSSProperties}
    >
      <div className="journal-card-top">
        <span className="category-label">
          <Icon size={13} />
          {categoryMeta[m.category].label}
        </span>
        <time>{formatDate(m.date)}</time>
      </div>
      <h3>{m.title}</h3>
      <p className="journal-summary">{m.summary}</p>
      {!!m.tags?.length && (
        <div className="memory-tags">
          {m.tags.map((tag) => (
            <span key={tag}>#{tag}</span>
          ))}
        </div>
      )}
      {!compact && (
        <>
          {m.why && (
            <div className="memory-fact">
              <span>WHY IT MATTERS</span>
              <p>{m.why}</p>
            </div>
          )}
          {m.targetDate && (
            <div className="memory-fact">
              <span>ON YOUR HORIZON</span>
              <p>{formatDate(m.targetDate)}</p>
            </div>
          )}
          {m.answers.map((a, i) => (
            <div className="memory-fact" key={`${a.label}-${i}`}>
              <span>{a.label}</span>
              <p>{a.value}</p>
            </div>
          ))}
          {m.followUpQuestion && (
            <div className="followup">
              <div className="followup-heading">
                <MessageCircle size={14} />
                <span>ONE LITTLE QUESTION</span>
              </div>
              <p>{m.followUpQuestion}</p>
              {!!m.suggestedAnswers.length && (
                <div className="answer-suggestions">
                  {m.suggestedAnswers.map((s) => (
                    <button
                      key={s}
                      disabled={disabled}
                      className={answer === s ? "selected" : ""}
                      onClick={() => setAnswer(s)}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  submit();
                }}
              >
                <input
                  aria-label="Answer the follow-up question"
                  placeholder="Your answer…"
                  value={answer}
                  disabled={disabled}
                  onChange={(e) => setAnswer(e.target.value)}
                />
                <button
                  type="submit"
                  className="answer-submit"
                  disabled={!answer.trim() || disabled}
                  aria-label="Save answer"
                >
                  <ArrowUpRight size={18} />
                </button>
              </form>
            </div>
          )}
          {m.category === "WISHLIST" && (
            <button className="wishlist-done" disabled={disabled} onClick={onDone}>
              <Check size={15} />I did this
            </button>
          )}
        </>
      )}
      <div className="journal-card-footer">
        {onExplore && (
          <button className="text-button" onClick={onExplore}>
            {compact ? "Open memory" : "Explore its connections"}
            <ArrowUpRight size={13} />
          </button>
        )}
        {confirmDelete ? (
          <div className="delete-confirm">
            <span>Delete?</span>
            <button disabled={disabled} onClick={onDelete}>
              Yes
            </button>
            <button onClick={() => setConfirmDelete(false)} aria-label="Cancel deletion">
              <X size={13} />
            </button>
          </div>
        ) : (
          <button
            disabled={disabled}
            className="delete-button"
            onClick={() => setConfirmDelete(true)}
            aria-label={`Delete ${m.title}`}
          >
            <Trash2 size={13} />
          </button>
        )}
      </div>
    </article>
  );
}
