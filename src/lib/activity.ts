import { z } from "zod";

export const ACTIVITY_KINDS = ["movie", "book", "music", "course"] as const;
export const activityCommandSchema = z.object({
  kind: z.enum(ACTIVITY_KINDS),
  intent: z.enum(["wishlist", "start", "progress", "complete", "listen", "reaction"]),
  progress: z.number().min(0).max(100000).nullable(),
  progressMode: z.enum(["absolute", "increment"]),
  total: z.number().positive().max(100000).nullable(),
  lessonNumbers: z.array(z.number().int().positive().max(10000)).max(500),
  sentiment: z.enum(["loved", "neutral", "disliked"]).nullable(),
  creator: z.string().max(300).nullable(),
});
export type ActivityCommand = z.infer<typeof activityCommandSchema>;
export const activitySchema = z.object({
  kind: z.enum(ACTIVITY_KINDS),
  status: z.enum(["planned", "in-progress", "completed", "unrecorded"]),
  progress: z.number().min(0).max(100000),
  total: z.number().positive().max(100000).nullable(),
  completedLessons: z.array(z.number().int().positive()).max(10000),
  sentiment: z.enum(["loved", "neutral", "disliked"]).nullable(),
  creator: z.string().max(300).nullable(),
  link: z
    .string()
    .url()
    .refine((s) => /^https?:\/\//i.test(s))
    .optional(),
  lessons: z
    .array(
      z.object({
        n: z.number().int().positive(),
        title: z.string().max(300),
        url: z.string().optional(),
      }),
    )
    .max(10000)
    .optional(),
  history: z.array(z.object({ date: z.string(), text: z.string().max(16000) })).max(1000),
});
export type Activity = z.infer<typeof activitySchema>;
export const activityLabels = { movie: "Movie", book: "Book", music: "Music", course: "Course" };
export const activityUnits = { movie: "minutes", book: "pages", music: "plays", course: "lessons" };
export const activityCategories = {
  movie: "MOVIE",
  book: "BOOK",
  music: "MUSIC",
  course: "LESSON",
} as const;

// A progress label does not establish a quantity. Course lesson indices are
// evidence only for courses; music listen has its separate one-play rule.
export function needsProgressEvidence(command: ActivityCommand): boolean {
  return (
    command.intent === "progress" &&
    command.kind !== "music" &&
    command.progress === null &&
    (command.kind !== "course" || command.lessonNumbers.length === 0)
  );
}

// The model proposes an event; this reducer owns progress arithmetic.
export function applyActivity(
  previous: Activity | undefined,
  command: ActivityCommand,
  date: string,
  text: string,
  review?: { allowUnquantifiedProgress: true },
): Activity {
  if (previous && previous.kind !== command.kind)
    throw new Error("Choose a matching activity, or save this as a new entry.");
  if (needsProgressEvidence(command) && !review?.allowUnquantifiedProgress)
    throw new Error(
      "Enter the progress amount or course lesson numbers, or choose a different action before saving.",
    );
  if (command.intent === "wishlist" && (command.progress !== null || command.lessonNumbers.length))
    throw new Error("A plan cannot record completed progress. Choose a progress action instead.");
  const total = command.total ?? previous?.total ?? null;
  if (command.intent === "wishlist" && total && previous && total < previous.progress)
    throw new Error("The total cannot be less than your recorded progress.");
  if (command.intent === "reaction") {
    if (command.progress !== null || command.lessonNumbers.length)
      throw new Error("A reaction cannot change progress. Choose a progress action instead.");
    if (total && previous && total < previous.progress)
      throw new Error("The total cannot be less than your recorded progress.");
    if (total && previous?.completedLessons.some((lesson) => lesson > total))
      throw new Error("A lesson number exceeds the course total. Check the total.");
    return activitySchema.parse({
      ...previous,
      kind: command.kind,
      status: previous?.status ?? "unrecorded",
      progress: previous?.progress ?? 0,
      total,
      completedLessons: previous?.completedLessons ?? [],
      sentiment: command.sentiment ?? previous?.sentiment ?? null,
      creator: command.creator ?? previous?.creator ?? null,
      history: [...(previous?.history ?? []), { date, text }],
    });
  }
  const completedLessons = [
    ...new Set([...(previous?.completedLessons ?? []), ...command.lessonNumbers]),
  ].sort((a, b) => a - b);
  if (
    command.kind === "course" &&
    command.intent === "complete" &&
    total &&
    Number.isInteger(total) &&
    total <= 10000
  ) {
    completedLessons.splice(
      0,
      completedLessons.length,
      ...Array.from({ length: total }, (_, i) => i + 1),
    );
  }
  if (total && completedLessons.some((n) => n > total))
    throw new Error(
      "A lesson number exceeds the course total. Correct the total or lesson numbers.",
    );
  let progress = previous?.progress ?? 0;
  if (command.progress !== null)
    progress =
      command.progressMode === "increment" ? progress + command.progress : command.progress;
  if (command.kind === "course" && command.lessonNumbers.length) progress = completedLessons.length;
  if (command.kind === "music" && command.intent === "listen" && command.progress === null)
    progress += 1;
  if (command.intent === "complete" && total) progress = total;
  if (total) progress = Math.min(total, progress);
  let status: Activity["status"] = previous?.status ?? "planned";
  if (command.intent === "wishlist")
    status = previous?.status === "unrecorded" ? "planned" : (previous?.status ?? "planned");
  else if (command.intent === "complete" || (total && progress >= total)) status = "completed";
  else if (command.kind === "music" && command.intent === "listen") status = "completed";
  else if (
    command.intent === "progress" &&
    command.progress === null &&
    !command.lessonNumbers.length &&
    previous
  )
    status =
      previous.status === "planned" || previous.status === "unrecorded"
        ? "in-progress"
        : previous.status;
  else status = "in-progress";
  return activitySchema.parse({
    ...previous,
    kind: command.kind,
    status,
    progress,
    total,
    completedLessons,
    sentiment: command.sentiment ?? previous?.sentiment ?? null,
    creator: command.creator ?? previous?.creator ?? null,
    history: [...(previous?.history ?? []), { date, text }],
  });
}

export function progressLabel(activity: Activity) {
  if (activity.status === "unrecorded") return "Progress not recorded";
  if (activity.status === "planned") return "On your wishlist";
  if (activity.status === "completed" && !activity.total && activity.kind !== "music")
    return "Completed";
  return `${activity.progress}${activity.total ? ` / ${activity.total}` : ""} ${activityUnits[activity.kind]}`;
}
