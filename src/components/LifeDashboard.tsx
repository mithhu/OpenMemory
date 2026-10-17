import { useMemo, useState } from "react";
import {
  ArrowUpRight,
  BookOpen,
  Check,
  Clapperboard,
  Library,
  Music,
  Plus,
  Sparkles,
} from "lucide-react";
import { type Memory, today, formatDate, categoryMeta } from "@/lib/memory";
import { activityLabels, activityUnits, progressLabel, type ActivityCommand } from "@/lib/activity";

const icons = {
  series: Clapperboard,
  movie: Clapperboard,
  book: Library,
  course: BookOpen,
  music: Music,
};
export function LifeHero({
  library,
  onCapture,
}: {
  library: boolean;
  onCapture: (text: string) => void;
}) {
  return (
    <section className="life-hero">
      <div className="life-hero-copy">
        <span className="eyebrow">
          <Sparkles size={14} /> {library ? "YOUR PERSONAL COLLECTION" : "A LITTLE SPACE FOR TODAY"}
        </span>
        <h1>
          {library ? (
            <>
              Keep what <em>moves you.</em>
            </>
          ) : (
            <>
              Life happens.
              <br />
              Keep the <em>little things.</em>
            </>
          )}
        </h1>
        <p>
          {library
            ? "The books, films, music, and learning that become part of your story."
            : "A thought, a good film, a new beginning. Give it a place to stay."}
        </p>
      </div>
      <div className="life-hero-art" aria-hidden="true">
        <svg viewBox="0 0 240 200" fill="none">
          <ellipse cx="120" cy="100" rx="100" ry="51" transform="rotate(-25 120 100)" />
          <ellipse cx="120" cy="100" rx="100" ry="51" transform="rotate(25 120 100)" />
          <ellipse cx="120" cy="100" rx="52" ry="85" />
          <circle cx="120" cy="100" r="7" className="hero-art-center" />
          <circle cx="45" cy="72" r="5" className="hero-art-point" />
          <circle cx="185" cy="137" r="4" className="hero-art-point" />
          <circle cx="145" cy="28" r="3" className="hero-art-point" />
        </svg>
        <span>Every little thing belongs.</span>
      </div>
      <div className="capture-shortcuts">
        {[
          "I did lessons 2-3 of CS229",
          "I watched Dune and loved it",
          "I want to read Sapiens",
        ].map((text) => (
          <button key={text} onClick={() => onCapture(text)} title="Use this as a starting point">
            <Plus size={12} />
            {text}
          </button>
        ))}
      </div>
    </section>
  );
}
export function LifeDashboard({
  memories,
  library = false,
  busy,
  onOpen,
  onCapture,
  onUpdate,
}: {
  memories: Memory[];
  library?: boolean;
  busy: boolean;
  onOpen: (id: string) => void;
  onCapture: (text: string) => void;
  onUpdate: (id: string, command: ActivityCommand, text: string) => Promise<boolean>;
}) {
  const [filter, setFilter] = useState("all");
  const tracked = memories.filter((m) => m.activity);
  const days = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const date = new Date(`${today()}T12:00:00`);
        date.setDate(date.getDate() - (6 - i));
        const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
        const count = memories.reduce(
          (n, m) =>
            n +
            (m.activity
              ? m.activity.history.filter((h) => h.date === key).length
              : m.date === key
                ? 1
                : 0),
          0,
        );
        return { key, label: date.toLocaleDateString(undefined, { weekday: "short" }), count };
      }),
    [memories],
  );
  const active = tracked.filter((m) => m.activity?.status === "in-progress");
  const planned = tracked.filter((m) => m.activity?.status === "planned");
  const loved = tracked.filter((m) => m.activity?.sentiment === "loved");
  const tagWeights = new Map<string, number>();
  const genericTags = new Set([
    "movie",
    "film",
    "book",
    "reading",
    "course",
    "learning",
    "music",
    "song",
    "wishlist",
  ]);
  for (const m of tracked)
    for (const tag of (m.tags || []).filter((t) => !genericTags.has(t.toLowerCase())))
      tagWeights.set(
        tag,
        (tagWeights.get(tag) || 0) +
          (m.activity?.sentiment === "loved" ? 1 : m.activity?.sentiment === "disliked" ? -1.5 : 0),
      );
  const shelf = planned
    .map((m) => ({
      memory: m,
      hits: (m.tags || []).filter((t) => (tagWeights.get(t) || 0) > 0),
      score: (m.tags || []).reduce((n, t) => n + (tagWeights.get(t) || 0), 0),
    }))
    .filter((m) => m.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
  const recent = memories
    .flatMap((m) =>
      m.activity
        ? m.activity.history.map((h, index) => ({
            id: `${m.id}:${index}`,
            memoryId: m.id,
            date: h.date,
            text: h.text,
            kind: activityLabels[m.activity!.kind],
          }))
        : [
            {
              id: m.id,
              memoryId: m.id,
              date: m.date,
              text: m.summary,
              kind: categoryMeta[m.category].label,
            },
          ],
    )
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 6);
  const visible = tracked.filter((m) =>
    filter === "all" || filter === "wishlist"
      ? filter !== "wishlist" || m.activity?.status === "planned"
      : m.activity?.kind === filter,
  );
  const renderCard = (m: Memory) => (
    <ActivityCard
      key={m.id}
      memory={m}
      onOpen={() => onOpen(m.id)}
      onUpdate={onUpdate}
      busy={busy}
    />
  );
  return (
    <>
      {!library && (
        <>
          <div className="life-pulse">
            <div>
              <span className="eyebrow">YOUR LAST SEVEN DAYS</span>
              <strong>{days.reduce((n, d) => n + d.count, 0)} moments, one unfolding story.</strong>
              <p>
                {active.length} in progress · {planned.length} on your horizon · {loved.length}{" "}
                loved
              </p>
            </div>
            <div className="week-dots">
              {days.map((day) => (
                <div key={day.key} title={`${day.key}: ${day.count} entries`}>
                  <span className={day.count ? "has-activity" : ""}>{day.count || "·"}</span>
                  <small>{day.label}</small>
                </div>
              ))}
            </div>
          </div>
          <section className="life-section">
            <div className="section-heading">
              <div>
                <span className="section-eyebrow">IN PROGRESS</span>
                <h2>Pick up where you left off</h2>
                <p>Your next step, remembered.</p>
              </div>
            </div>
            {active.length ? (
              <div className="activity-grid">{active.map(renderCard)}</div>
            ) : (
              <div className="life-empty">
                <BookOpen size={26} />
                <h3>Start something worth returning to.</h3>
                <p>Tell your memory what you’re learning, reading, or watching.</p>
                <button
                  className="text-button"
                  onClick={() => onCapture("I started a course called ")}
                >
                  Log a beginning <ArrowUpRight size={13} />
                </button>
              </div>
            )}
          </section>
          {shelf.length > 0 && (
            <section className="life-section">
              <div className="section-heading">
                <div>
                  <h2>From your own shelf</h2>
                  <p>Matches your likes, calculated on this device.</p>
                </div>
              </div>
              <div className="shelf-picks">
                {shelf.map(({ memory, hits }) => (
                  <button key={memory.id} onClick={() => onOpen(memory.id)}>
                    <span className="eyebrow">{activityLabels[memory.activity!.kind]}</span>
                    <h3>{memory.title}</h3>
                    <p>Because you’ve liked {hits.join(", ")}.</p>
                    <ArrowUpRight size={15} />
                  </button>
                ))}
              </div>
            </section>
          )}
          <div className="life-columns">
            <section className="life-section">
              <div className="section-heading">
                <div>
                  <span className="section-eyebrow">YOUR STORY, LATELY</span>
                  <h2>Recently in your life</h2>
                  <p>The little things add up.</p>
                </div>
              </div>
              <div className="life-timeline">
                {recent.map((event) => (
                  <button key={event.id} onClick={() => onOpen(event.memoryId)}>
                    <span className="timeline-point" />
                    <div>
                      <span className="eyebrow">
                        {event.kind} · {formatDate(event.date)}
                      </span>
                      <p>{event.text}</p>
                    </div>
                    <ArrowUpRight size={13} />
                  </button>
                ))}
                {!recent.length && <p>Your first entry will start the story.</p>}
              </div>
            </section>
            <section className="life-section">
              <div className="section-heading">
                <div>
                  <span className="section-eyebrow">SOMEDAY STARTS HERE</span>
                  <h2>On your horizon</h2>
                  <p>Things you want to get to.</p>
                </div>
              </div>
              <div className="horizon-list">
                {planned.slice(0, 5).map((m) => (
                  <button key={m.id} onClick={() => onOpen(m.id)}>
                    <span>{activityLabels[m.activity!.kind]}</span>
                    <strong>{m.title}</strong>
                    <ArrowUpRight size={13} />
                  </button>
                ))}
                {!planned.length && (
                  <p>Say “I want to watch…” or “I want to learn…” to save an intention.</p>
                )}
              </div>
              {loved.length > 0 && (
                <div className="taste-summary">
                  <span className="eyebrow">A LITTLE OF YOUR TASTE</span>
                  <p>
                    You’ve loved{" "}
                    {loved
                      .slice(0, 3)
                      .map((m) => m.title)
                      .join(", ")}
                    .
                  </p>
                  <span>These preferences inform your shelf and reflective questions.</span>
                </div>
              )}
            </section>
          </div>
        </>
      )}
      {library && (
        <>
          <div className="library-filters">
            {[
              ["all", "Everything"],
              ["course", "Learning"],
              ["movie", "Movies"],
              ["series", "TV series"],
              ["book", "Books"],
              ["music", "Music"],
              ["wishlist", "Wishlist"],
            ].map(([key, label]) => (
              <button
                className={filter === key ? "active" : ""}
                aria-pressed={filter === key}
                key={key}
                onClick={() => setFilter(key!)}
              >
                {label}
                <span>
                  {
                    tracked.filter(
                      (m) =>
                        key === "all" ||
                        (key === "wishlist"
                          ? m.activity?.status === "planned"
                          : m.activity?.kind === key),
                    ).length
                  }
                </span>
              </button>
            ))}
          </div>
          <div className="activity-grid">{visible.map(renderCard)}</div>
          {!visible.length && (
            <div className="life-empty">
              <Library size={28} />
              <h3>Your library begins with a sentence.</h3>
              <p>
                Log an experience above, or import your Recall JSON backup using Import in the
                sidebar.
              </p>
            </div>
          )}
        </>
      )}
    </>
  );
}
function ActivityCard({
  memory,
  onOpen,
  onUpdate,
  busy,
}: {
  memory: Memory;
  onOpen: () => void;
  onUpdate: (id: string, command: ActivityCommand, text: string) => Promise<boolean>;
  busy: boolean;
}) {
  const activity = memory.activity!;
  const Icon = icons[activity.kind];
  const [position, setPosition] = useState("");
  const [total, setTotal] = useState("");
  const [working, setWorking] = useState(false);
  const update = async (changes: Partial<ActivityCommand>, text: string) => {
    setWorking(true);
    try {
      const saved = await onUpdate(
        memory.id,
        {
          kind: activity.kind,
          intent: "progress",
          progress: null,
          progressMode: "absolute",
          total: null,
          lessonNumbers: [],
          sentiment: null,
          creator: null,
          ...changes,
        },
        text,
      );
      if (saved) {
        setPosition("");
        setTotal("");
      }
    } finally {
      setWorking(false);
    }
  };
  let nextLesson = 1;
  while (activity.completedLessons.includes(nextLesson)) nextLesson++;
  const nextNamedLesson = activity.lessons?.find((l) => !activity.completedLessons.includes(l.n));
  if (nextNamedLesson) nextLesson = nextNamedLesson.n;
  const disabled = busy || working;
  return (
    <article className={`activity-card activity-${activity.kind}`}>
      <div className="activity-card-top">
        <span>
          <Icon size={15} />
          {activityLabels[activity.kind]}
        </span>
        <span className={`activity-status status-${activity.status}`}>
          {activity.status === "planned"
            ? "Wishlist"
            : activity.status === "in-progress"
              ? "In progress"
              : activity.status === "unrecorded"
                ? "Remembered"
                : "Completed"}
        </span>
      </div>
      <button className="activity-title" onClick={onOpen}>
        <h3>{memory.title}</h3>
        <ArrowUpRight size={15} />
      </button>
      {activity.creator && <p className="activity-creator">{activity.creator}</p>}
      <div className="activity-progress-label">
        <span>{progressLabel(activity)}</span>
        {activity.total && activity.status !== "unrecorded" && activity.progressKnown !== false && (
          <span>{Math.round((activity.progress / activity.total) * 100)}%</span>
        )}
      </div>
      {activity.total && activity.status !== "unrecorded" && activity.progressKnown !== false && (
        <div
          className="activity-progress"
          role="progressbar"
          aria-label={`${memory.title} progress`}
          aria-valuemin={0}
          aria-valuemax={activity.total}
          aria-valuenow={Math.min(activity.progress, activity.total)}
        >
          <span
            style={{ width: `${Math.min(100, (activity.progress / activity.total) * 100)}%` }}
          />
        </div>
      )}
      {activity.status === "in-progress" && (
        <p className="activity-next">
          {activity.progressKnown === false
            ? "Add your current position when you know it."
            : activity.kind === "course"
              ? `Up next: lesson ${nextLesson}${nextNamedLesson ? ` · ${nextNamedLesson.title}` : ""}`
              : activity.kind === "book"
                ? `Continue from page ${activity.progress + 1}`
                : `Continue from minute ${activity.progress}`}
        </p>
      )}
      {!!memory.tags?.length && (
        <div className="memory-tags">
          {memory.tags.slice(0, 4).map((tag) => (
            <span key={tag}>#{tag}</span>
          ))}
        </div>
      )}
      <div className="activity-controls">
        {activity.status === "planned" ||
        (activity.status === "unrecorded" && activity.kind !== "music") ? (
          <button
            className="primary-button"
            disabled={disabled}
            onClick={() => void update({ intent: "start" }, `Started ${memory.title}.`)}
          >
            Start this <ArrowUpRight size={13} />
          </button>
        ) : activity.kind === "music" ? (
          <button
            className="primary-button"
            disabled={disabled}
            onClick={() => void update({ intent: "listen" }, `Listened to ${memory.title}.`)}
          >
            <Music size={13} />
            Listened +1
          </button>
        ) : (
          activity.status !== "completed" && (
            <>
              {activity.kind === "course" ? (
                <button
                  className="primary-button"
                  disabled={disabled || Boolean(activity.total && nextLesson > activity.total)}
                  onClick={() =>
                    void update(
                      { lessonNumbers: [nextLesson] },
                      `Completed lesson ${nextLesson} of ${memory.title}.`,
                    )
                  }
                >
                  <Check size={13} />
                  Lesson {nextLesson} done
                </button>
              ) : (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void update(
                      { progress: Number(position) },
                      `${activity.kind === "book" ? "Read to page" : "Watched to minute"} ${position} of ${memory.title}.`,
                    );
                  }}
                >
                  <input
                    type="number"
                    min={0}
                    max={activity.total || 100000}
                    value={position}
                    required
                    onChange={(e) => setPosition(e.target.value)}
                    placeholder={`Current ${activity.kind === "book" ? "page" : "minute"}`}
                    aria-label={`${memory.title} current position`}
                    disabled={disabled}
                  />
                  <button type="submit" className="primary-button" disabled={!position || disabled}>
                    Update
                  </button>
                </form>
              )}
              <button
                className="text-button"
                disabled={disabled}
                onClick={() => void update({ intent: "complete" }, `Finished ${memory.title}.`)}
              >
                Mark finished
              </button>
            </>
          )
        )}
      </div>
      {activity.kind === "course" && !!activity.lessons?.length && (
        <details className="course-lessons">
          <summary>
            Course lessons <span>{activity.completedLessons.length} completed</span>
          </summary>
          {activity.lessons.map((lesson) => (
            <div className="course-lesson" key={lesson.n}>
              <label>
                <input
                  type="checkbox"
                  checked={activity.completedLessons.includes(lesson.n)}
                  disabled={
                    disabled ||
                    activity.status === "completed" ||
                    activity.completedLessons.includes(lesson.n)
                  }
                  onChange={() =>
                    void update(
                      { lessonNumbers: [lesson.n] },
                      `Completed lesson ${lesson.n}: ${lesson.title}.`,
                    )
                  }
                />
                <span>
                  {lesson.n}. {lesson.title}
                </span>
              </label>
              {lesson.url && /^https?:\/\//i.test(lesson.url) && (
                <a
                  href={lesson.url}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`Open lesson ${lesson.n}`}
                >
                  <ArrowUpRight size={13} />
                </a>
              )}
            </div>
          ))}
        </details>
      )}
      {!activity.total && activity.kind !== "music" && (
        <details className="activity-total">
          <summary>Add total {activityUnits[activity.kind]}</summary>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void update(
                {
                  total: Number(total),
                  intent:
                    activity.status === "unrecorded"
                      ? "reaction"
                      : activity.status === "planned"
                        ? "wishlist"
                        : activity.status === "completed"
                          ? "complete"
                          : "progress",
                },
                `Set ${memory.title} total to ${total} ${activityUnits[activity.kind]}.`,
              );
            }}
          >
            <input
              aria-label={`${memory.title} total`}
              type="number"
              min={1}
              max={100000}
              required
              value={total}
              onChange={(e) => setTotal(e.target.value)}
              disabled={disabled}
            />
            <button className="text-button" disabled={disabled}>
              Save
            </button>
          </form>
        </details>
      )}
      <div className="activity-reactions">
        <span>Your reaction</span>
        {[
          ["loved", "Loved"],
          ["neutral", "Okay"],
          ["disliked", "Not for me"],
        ].map(([sentiment, label]) => (
          <button
            key={sentiment}
            className={activity.sentiment === sentiment ? "selected" : ""}
            disabled={disabled}
            onClick={() =>
              void update(
                {
                  intent: "reaction",
                  sentiment: sentiment as ActivityCommand["sentiment"],
                },
                `My reaction to ${memory.title}: ${label}.`,
              )
            }
          >
            {label}
          </button>
        ))}
      </div>
      {activity.link && (
        <a className="text-button" href={activity.link} target="_blank" rel="noreferrer">
          Open original link <ArrowUpRight size={13} />
        </a>
      )}
    </article>
  );
}
