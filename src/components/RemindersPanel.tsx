import { useEffect, useState } from "react";
import type { Memory } from "@/lib/memory";

export function RemindersPanel({
  memories,
  disabled,
  onOpen,
  onUpdate,
}: {
  memories: Memory[];
  disabled: boolean;
  onOpen: (id: string) => void;
  onUpdate: (id: string, action: "done" | "dismissed" | "snooze") => Promise<void>;
}) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const refresh = () => setNow(Date.now());
    const timer = setInterval(refresh, 30_000);
    window.addEventListener("focus", refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, []);
  const scheduled = memories
    .filter((m) => m.reminder?.status === "scheduled")
    .sort((a, b) => a.reminder!.at.localeCompare(b.reminder!.at));
  if (!scheduled.length) return null;
  return (
    <section className="reminders-panel" aria-label="Your reminders">
      <h2>Your reminders</h2>
      <p>Saved on this device. Due reminders stay here until you mark them done or dismiss them.</p>
      {scheduled.map((memory) => {
        const reminder = memory.reminder!;
        const due = new Date(reminder.at).getTime() <= now;
        return (
          <article key={memory.id} className={`reminder-item ${due ? "due" : ""}`}>
            <span className="reminder-badge">{due ? "Due now" : "Upcoming"}</span>
            <button className="text-button" onClick={() => onOpen(memory.id)}>
              {memory.title}
            </button>
            {memory.plannedTiming && <p>Plan: {memory.plannedTiming}</p>}
            <p>
              Remind at{" "}
              {new Date(reminder.at).toLocaleString(undefined, {
                dateStyle: "medium",
                timeStyle: "short",
                timeZone: reminder.timezone,
              })}{" "}
              ({reminder.timezone})
            </p>
            <div className="reminder-actions">
              <button
                className="text-button"
                disabled={disabled}
                onClick={() => void onUpdate(memory.id, "done")}
              >
                Mark reminder done
              </button>
              <button
                className="text-button"
                disabled={disabled || !due}
                onClick={() => void onUpdate(memory.id, "snooze")}
              >
                Snooze 1 hour
              </button>
              <button
                className="text-button"
                disabled={disabled}
                onClick={() => void onUpdate(memory.id, "dismissed")}
              >
                Dismiss reminder
              </button>
            </div>
          </article>
        );
      })}
    </section>
  );
}
