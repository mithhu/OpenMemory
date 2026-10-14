import { z } from "zod";

export const reminderSchema = z.object({
  at: z.string().datetime(),
  timezone: z
    .string()
    .min(1)
    .max(100)
    .refine((zone) => {
      try {
        new Intl.DateTimeFormat("en", { timeZone: zone });
        return true;
      } catch {
        return false;
      }
    }, "Choose a valid timezone."),
  status: z.enum(["scheduled", "done", "dismissed"]),
});
export type Reminder = z.infer<typeof reminderSchema>;

export function localReminder(value: string, now = new Date()): Reminder {
  const date = new Date(value);
  if (!value || !Number.isFinite(date.getTime()) || date <= now)
    throw new Error("Choose a reminder time in the future.");
  // Reject invalid calendar dates and times skipped by a daylight-saving change.
  if (localDateTime(date) !== value)
    throw new Error("That local time does not exist. Choose another time.");
  return {
    at: date.toISOString(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    status: "scheduled",
  };
}

export function localDateTime(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function nextSaturday(now = new Date()): string {
  const next = new Date(now);
  next.setHours(18, 0, 0, 0);
  next.setDate(next.getDate() + ((6 - next.getDay() + 7) % 7));
  if (next <= now) next.setDate(next.getDate() + 7);
  return localDateTime(next);
}
