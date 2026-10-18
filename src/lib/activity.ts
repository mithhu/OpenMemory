import { z } from "zod";

export const ACTIVITY_KINDS = ["movie", "series", "book", "music", "course"] as const;
const seriesPosition = {
  season: z.number().int().positive().max(10000).nullable().optional(),
  episode: z.number().int().positive().max(10000).nullable().optional(),
  seasonCompleted: z.boolean().optional(),
  totalSeasons: z.number().int().positive().max(10000).nullable().optional(),
};
export const activityCommandSchema = z.object({
  ...seriesPosition,
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
  ...seriesPosition,
  kind: z.enum(ACTIVITY_KINDS),
  status: z.enum(["planned", "in-progress", "completed", "unrecorded"]),
  progress: z.number().min(0).max(100000),
  progressKnown: z.boolean().optional(),
  total: z.number().positive().max(100000).nullable(),
  completedSeasons: z.array(z.number().int().positive()).max(10000).optional(),
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
export const activityLabels = {
  series: "TV series",
  movie: "Movie",
  book: "Book",
  music: "Music",
  course: "Course",
};
export const activityUnits = {
  series: "episodes",
  movie: "minutes",
  book: "pages",
  music: "plays",
  course: "lessons",
};
export const activityCategories = {
  movie: "MOVIE",
  series: "SERIES",
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
    !(command.kind === "series" && (command.episode || command.seasonCompleted)) &&
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
  if (
    command.kind !== "series" &&
    (command.season || command.episode || command.seasonCompleted || command.totalSeasons)
  )
    throw new Error("Season and episode details belong to TV series only.");
  if (command.kind === "series" && (command.episode || command.seasonCompleted) && !command.season)
    throw new Error("Choose the season for this episode or season completion.");
  if (
    (command.intent === "wishlist" || command.intent === "reaction") &&
    (command.season || command.episode || command.seasonCompleted)
  )
    throw new Error("A plan or reaction cannot record watched episodes or completed seasons.");
  if (
    command.kind === "series" &&
    (command.lessonNumbers.length ||
      (command.progress !== null && !Number.isInteger(command.progress)) ||
      (command.total !== null && !Number.isInteger(command.total)))
  )
    throw new Error(
      "TV series use whole episode counts, not course lessons or fractional episodes.",
    );
  const totalSeasons = command.totalSeasons ?? previous?.totalSeasons ?? null;
  const currentSeason = command.season ?? previous?.season;
  if (command.kind === "series" && totalSeasons && currentSeason && currentSeason > totalSeasons)
    throw new Error("Total seasons cannot be less than the current season.");
  const changedSeason =
    command.kind === "series" && Boolean(command.season && command.season !== previous?.season);
  const seriesState =
    command.kind === "series"
      ? {
          season: command.season ?? previous?.season ?? null,
          totalSeasons,
          // A new season never inherits the previous season's episode position.
          episode:
            command.episode ??
            (command.season && command.season !== previous?.season
              ? null
              : (previous?.episode ?? null)),
          seasonCompleted: command.seasonCompleted ?? false,
          completedSeasons: [
            ...new Set([
              ...(previous?.completedSeasons ?? []),
              ...(command.seasonCompleted && command.season ? [command.season] : []),
            ]),
          ].sort((a, b) => a - b),
        }
      : {};
  const total = command.total ?? (changedSeason ? null : previous?.total) ?? null;
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
      ...seriesState,
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
  let progress = changedSeason ? 0 : (previous?.progress ?? 0);
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
  else if (
    command.intent === "complete" ||
    (command.kind === "series" &&
      currentSeason &&
      totalSeasons === currentSeason &&
      (command.seasonCompleted || (command.progress !== null && total && progress >= total))) ||
    (command.kind !== "series" && total && progress >= total)
  )
    status = "completed";
  else if (command.kind === "music" && command.intent === "listen") status = "completed";
  else if (
    command.intent === "progress" &&
    command.progress === null &&
    !(command.kind === "series" && (command.episode || command.seasonCompleted)) &&
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
    ...seriesState,
    kind: command.kind,
    status,
    progress,
    progressKnown:
      command.progress !== null ||
      command.lessonNumbers.length > 0 ||
      (command.kind === "music" && command.intent === "listen") ||
      (command.intent === "complete" && total !== null)
        ? true
        : changedSeason
          ? false
          : (previous?.progressKnown ?? (previous ? true : false)),
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
  if (activity.kind === "series" && activity.status !== "completed" && activity.season) {
    const episodes =
      activity.progressKnown !== false && activity.progress > 0
        ? ` · ${activity.progress}${activity.total ? ` / ${activity.total}` : ""} episodes watched`
        : activity.episode
          ? ` · episode ${activity.episode}`
          : "";
    return `Season ${activity.season}${activity.totalSeasons ? ` of ${activity.totalSeasons}` : ""}${episodes}${activity.completedSeasons?.includes(activity.season) ? " · season finished" : ""}`;
  }
  if (activity.progressKnown === false) return "Amount not recorded";
  return `${activity.progress}${activity.total ? ` / ${activity.total}` : ""} ${activityUnits[activity.kind]}`;
}
