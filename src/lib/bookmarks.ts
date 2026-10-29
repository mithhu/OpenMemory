import { z } from "zod";
import { memorySchema, today, type Memory } from "./memory";

export const bookmarkUrl = z
  .string()
  .max(4096)
  .url()
  .refine((value) => {
    try {
      const url = new URL(value);
      return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password;
    } catch {
      return false;
    }
  }, "Use an HTTP or HTTPS link without embedded credentials.");
export const bookmarkHandoffSchema = z.object({
  version: z.literal(1),
  id: z.string().uuid(),
  url: bookmarkUrl,
  title: z.string().max(300),
  note: z.string().max(4000),
});
export type BookmarkHandoff = z.infer<typeof bookmarkHandoffSchema>;

export function isBookmarkHandoff(hash: string) {
  return hash.startsWith("#save-link=") || hash.startsWith("#save-url=");
}
export function readBookmarkHandoff(hash: string): BookmarkHandoff | null {
  if (!isBookmarkHandoff(hash)) return null;
  if (hash.length > 32000)
    throw new Error("This shared link is too large. Try saving a shorter note.");
  try {
    if (hash.startsWith("#save-url=")) {
      const decoded = decodeURIComponent(hash.slice(10));
      // A Shortcut shares one encoded URL, never arbitrary text, HTML or a
      // nested redirect. Keep query parameters and timestamps unchanged.
      if (
        [...decoded].some(
          (character) => character.charCodeAt(0) <= 32 || character.charCodeAt(0) === 127,
        )
      )
        throw new Error("Share one web link at a time.");
      return bookmarkHandoffSchema.parse({
        version: 1,
        id: crypto.randomUUID(),
        url: bookmarkUrl.parse(decoded),
        title: "",
        note: "",
      });
    }
    return bookmarkHandoffSchema.parse(JSON.parse(decodeURIComponent(hash.slice(11))));
  } catch {
    throw new Error(
      "This shared link could not be read. Share a single HTTP or HTTPS link and try again.",
    );
  }
}
export function createBookmark(input: BookmarkHandoff, now = new Date().toISOString()): Memory {
  const data = bookmarkHandoffSchema.parse(input);
  const host = new URL(data.url).hostname.replace(/^www\./, "");
  return memorySchema.parse({
    id: `bookmark-${data.id}`,
    title: data.title.trim() || host,
    category: "NOTE",
    date: today(),
    summary: data.note.trim() || `Saved for later from ${host}.`,
    followUpQuestion: "",
    suggestedAnswers: [],
    answerLabel: "",
    answers: [],
    transcripts: data.note.trim() ? [data.note.trim()] : [],
    tags: ["bookmark"],
    bookmark: { url: data.url, status: "saved" },
    createdAt: now,
    updatedAt: now,
  });
}
export function findBookmark(memories: Memory[], url: string) {
  const normalized = new URL(url).href;
  return memories.find(
    (memory) => memory.bookmark && new URL(memory.bookmark.url).href === normalized,
  );
}
