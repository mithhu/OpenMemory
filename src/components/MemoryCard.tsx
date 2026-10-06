import { useState } from "react";
import { X, Check } from "lucide-react";
import { type Memory, formatDate } from "@/lib/echo";
import { cn } from "@/lib/utils";

const catStyle: Record<string, string> = {
  MOVIE: "text-cat-movie border-cat-movie/30 bg-cat-movie/10",
  LESSON: "text-cat-lesson border-cat-lesson/30 bg-cat-lesson/10",
  NOTE: "text-cat-note border-cat-note/30 bg-cat-note/10",
  WISHLIST: "text-cat-wishlist border-cat-wishlist/30 bg-cat-wishlist/10",
};

interface Props {
  memory: Memory;
  onLog: (value: string) => void;
  onDelete: () => void;
  onDone: () => void;
}

export function MemoryCard({ memory: m, onLog, onDelete, onDone }: Props) {
  const [answer, setAnswer] = useState("");
  const isWish = m.category === "WISHLIST";
  const submit = () => {
    if (!answer.trim()) return;
    onLog(answer.trim());
    setAnswer("");
  };

  return (
    <article className="animate-in fade-in slide-in-from-bottom-2 duration-500 rounded-3xl border bg-card p-5 sm:p-6">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className={cn("rounded-full border px-2.5 py-1 font-mono text-[10px] font-medium tracking-widest", catStyle[m.category])}>
            {m.category}
          </span>
          <span className="rounded-full bg-muted px-2.5 py-1 font-mono text-[10px] tracking-widest text-muted-foreground">
            {formatDate(m.date)}
          </span>
        </div>
        <button onClick={onDelete} aria-label="Delete memory" className="-mr-2 grid h-9 w-9 place-items-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>

      <h3 className="mt-4 font-display text-3xl leading-tight">{m.title}</h3>
      <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">{m.summary}</p>

      {isWish && (m.why || m.targetDate) && (
        <dl className="mt-4 grid gap-3 rounded-2xl bg-muted/60 p-4 text-sm">
          {m.why && (
            <div>
              <dt className="text-xs text-muted-foreground">Why watch this?</dt>
              <dd className="mt-0.5">“{m.why}”</dd>
            </div>
          )}
          {m.targetDate && (
            <div>
              <dt className="text-xs text-muted-foreground">Target</dt>
              <dd className="mt-0.5">{new Date(m.targetDate + "T00:00").toLocaleDateString("en-US", { month: "long", day: "numeric" })}</dd>
            </div>
          )}
        </dl>
      )}

      {m.answers.length > 0 && (
        <dl className="mt-4 grid gap-3 border-t pt-4">
          {m.answers.map((a, i) => (
            <div key={i} className="animate-in fade-in slide-in-from-top-1 duration-500 flex items-baseline justify-between gap-4">
              <dt className="shrink-0 text-xs uppercase tracking-wider text-muted-foreground">{a.label}</dt>
              <dd className="text-right text-sm">{a.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {m.followUpQuestion && (
      <div className="mt-5 border-t pt-5">
        <p className="text-[15px] font-medium">{m.followUpQuestion}</p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {m.suggestedAnswers.map((s) => (
            <button
              key={s}
              onClick={() => setAnswer(s)}
              className={cn(
                "min-h-11 rounded-xl border px-3 py-2 text-sm transition",
                answer === s ? "border-primary bg-primary/10 text-foreground" : "bg-secondary text-secondary-foreground hover:bg-accent",
              )}
            >
              {s}
            </button>
          ))}
        </div>
        <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="mt-3 flex gap-2">
          <input
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder="Your answer..."
            className="min-h-11 min-w-0 flex-1 rounded-xl border bg-background px-3 text-sm outline-none placeholder:text-muted-foreground focus:border-ring"
          />
          <button type="submit" disabled={!answer.trim()} className="min-h-11 rounded-xl bg-foreground px-4 text-sm font-medium text-background transition disabled:opacity-30">
            Log
          </button>
        </form>
      </div>
      )}

      {isWish && (
        <button onClick={onDone} className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-cat-wishlist/30 text-sm text-cat-wishlist transition hover:bg-cat-wishlist/10">
          <Check className="h-4 w-4" /> Watched it
        </button>
      )}
    </article>
  );
}
