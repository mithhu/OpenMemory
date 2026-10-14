import { useState } from "react";
import { localDateTime, nextSaturday, type Reminder } from "@/lib/reminders";

export function ReminderFields({
  index,
  timing,
  reminder,
}: {
  index: number;
  timing?: string | null | undefined;
  reminder?: Reminder | null | undefined;
}) {
  const [enabled, setEnabled] = useState(reminder?.status === "scheduled");
  const [time, setTime] = useState(reminder ? localDateTime(new Date(reminder.at)) : "");
  return (
    <section className="reminder-fields" aria-label={`Entry ${index + 1} timing and reminder`}>
      <h3>Plans & reminders</h3>
      <label>
        Planned timing — exact date can stay unknown
        <input
          name={`planned-timing-${index}`}
          defaultValue={timing ?? ""}
          maxLength={500}
          placeholder="For example, in November or this weekend"
        />
      </label>
      <p>This describes your plan. It does not schedule a reminder or set a travel date.</p>
      <label className="classification-confirm">
        <input
          type="checkbox"
          name={`reminder-enabled-${index}`}
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
        />
        Remind me
      </label>
      {enabled && (
        <>
          <label>
            Reminder date and time
            <input
              type="datetime-local"
              name={`reminder-time-${index}`}
              value={time}
              required
              onChange={(e) => setTime(e.target.value)}
            />
          </label>
          <button type="button" className="text-button" onClick={() => setTime(nextSaturday())}>
            Choose Saturday at 6 PM
          </button>
          <p>
            Timezone: {Intl.DateTimeFormat().resolvedOptions().timeZone}. Scheduled only when you
            save.
          </p>
        </>
      )}
      <p>
        Reminders appear on Today when you open this app. Notifications while the app is closed are
        not available yet.
      </p>
    </section>
  );
}
