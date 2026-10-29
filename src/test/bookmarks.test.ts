import { webcrypto } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildHandoff, destinationOrigin } from "../../extension/openmemory/protocol.js";
import { createBookmark, findBookmark, readBookmarkHandoff } from "../lib/bookmarks";
import { memorySchema } from "../lib/memory";

beforeEach(() => vi.stubGlobal("crypto", webcrypto));
afterEach(() => vi.unstubAllGlobals());
const link = {
  url: "https://www.youtube.com/watch?v=example&t=93",
  title: "A video & a thought 🎬",
  note: "Watch later. Why? It's useful!",
};
describe("extension to app handoff", () => {
  it("round-trips exact URL, timestamp and Unicode without server query data", () => {
    const target = new URL(buildHandoff("https://open-memory-ai.vercel.app", link));
    expect(target.search).toBe("");
    const data = readBookmarkHandoff(target.hash)!;
    expect(data).toMatchObject(link);
    const memory = createBookmark(data);
    expect(memorySchema.parse(JSON.parse(JSON.stringify(memory)))).toEqual(memory);
    expect(memory.bookmark).toEqual({ url: link.url, status: "saved" });
    expect(memory.transcripts).toEqual([link.note]);
    expect(findBookmark([memory], link.url)).toBe(memory);
    expect(findBookmark([memory], "https://www.youtube.com/watch?v=example&t=94")).toBeUndefined();
  });
  it("saves a link without AI or a title and preserves literal untrusted text", () => {
    const payload = readBookmarkHandoff(
      new URL(
        buildHandoff("http://localhost:3001", {
          url: "https://example.org/post",
          note: "<script>alert(1)</script>",
        }),
      ).hash,
    )!;
    const memory = createBookmark(payload);
    expect(memory.title).toBe("example.org");
    expect(memory.summary).toBe("<script>alert(1)</script>");
    expect(memory.activity).toBeUndefined();
  });
  it.each([
    "javascript:alert(1)",
    "data:text/html,test",
    "file:///tmp/note",
    "https://user:password@example.com",
    "chrome://settings",
  ])("rejects unsafe source %s", (url) => {
    expect(() => buildHandoff("https://open-memory-ai.vercel.app", { ...link, url })).toThrow();
  });
  it.each([
    "https://evil.example",
    "https://open-memory-ai.vercel.app.evil.example",
    "https://open-memory-ai.vercel.app/?redirect=evil",
    "https://user:secret@localhost:3001",
    "http://192.168.1.10:3001",
    "https://open-memory-ai.vercel.app/path",
  ])("rejects unexpected destination %s", (url) => {
    expect(() => destinationOrigin(url)).toThrow();
  });
  it("ignores unrelated fragments and rejects malformed or oversized handoffs", () => {
    expect(readBookmarkHandoff("#library")).toBeNull();
    for (const hash of ["#save-link=%broken", "#save-link={}", "#save-link=" + "x".repeat(32000)])
      expect(() => readBookmarkHandoff(hash)).toThrow();
  });
});

describe("iPhone Shortcut URL handoff", () => {
  it.each([
    "https://www.youtube.com/watch?v=xUSznTR2cwc&t=93",
    "https://youtu.be/example?t=12",
    "https://www.facebook.com/share/p/example/?mibextid=abc",
    "https://x.com/example/status/123?ref=a+b#part-2",
    "https://example.com/article?q=%E2%9C%93&name=one%20two",
  ])("preserves the shared URL exactly: %s", (url) => {
    const data = readBookmarkHandoff(`#save-url=${encodeURIComponent(url)}`)!;
    expect(data.url).toBe(url);
    expect(data.title).toBe("");
    expect(data.note).toBe("");
    expect(createBookmark(data).bookmark?.url).toBe(url);
  });
  it.each([
    "",
    "javascript:alert(1)",
    "data:text/html,test",
    "file:///private/note",
    "https://user:password@example.com",
    "https://example.com/one\nhttps://example.com/two",
    "https%3A%2F%2Fexample.com",
    "https://example.com/has a space",
  ])("rejects unsafe or ambiguous shared input: %s", (url) => {
    expect(() => readBookmarkHandoff(`#save-url=${encodeURIComponent(url)}`)).toThrow(
      "single HTTP or HTTPS",
    );
  });
  it("rejects malformed encoded input", () => {
    expect(() => readBookmarkHandoff("#save-url=%not-encoded")).toThrow();
  });
});
