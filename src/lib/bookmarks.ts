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

export function readBookmarkHandoff(hash: string): BookmarkHandoff | null {
  if (!hash.startsWith("#save-link=")) return null;
  if (hash.length > 32000)
    throw new Error("This shared link is too large. Try saving a shorter note.");
  try {
    return bookmarkHandoffSchema.parse(JSON.parse(decodeURIComponent(hash.slice(11))));
  } catch {
    throw new Error("This shared link could not be read. Try saving it again from the extension.");
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
