import { readFileSync } from "node:fs";
import { webcrypto } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { readBookmarkHandoff } from "../lib/bookmarks";

beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal("crypto", webcrypto);
});
afterEach(() => {
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
it("toolbar popup sends reviewed title, URL and note to the configured library without storing content", async () => {
  const html = readFileSync(`${process.cwd()}/extension/openmemory/popup.html`, "utf8");
  document.documentElement.innerHTML = html;
  const set = vi.fn(async () => {});
  const create = vi.fn(async (_value: { url: string }) => {});
  const close = vi.spyOn(window, "close").mockImplementation(() => {});
  vi.stubGlobal("chrome", {
    storage: { local: { get: vi.fn(async () => ({ destination: "http://127.0.0.1:3001" })), set } },
    tabs: {
      query: vi.fn(async () => [{ url: "https://example.com/thread", title: "A thread" }]),
      create,
    },
  });
  await import("../../extension/openmemory/popup.js");
  expect((document.getElementById("title") as HTMLInputElement).value).toBe("A thread");
  (document.getElementById("note") as HTMLTextAreaElement).value = "Why I saved it";
  document
    .getElementById("capture")!
    .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  await vi.waitFor(() => expect(create).toHaveBeenCalledOnce());
  const target = new URL(create.mock.calls[0]![0]!.url);
  expect(target.origin).toBe("http://127.0.0.1:3001");
  expect(readBookmarkHandoff(target.hash)).toMatchObject({
    title: "A thread",
    url: "https://example.com/thread",
    note: "Why I saved it",
  });
  expect(set).toHaveBeenCalledWith({ destination: "http://127.0.0.1:3001" });
  expect(close).toHaveBeenCalled();
});
it("right-click handoff uses selected text and link URL, with no incorrect parent-page title", async () => {
  let click: ((info: Record<string, string>, tab: { title: string }) => Promise<void>) | undefined;
  let install: (() => void) | undefined;
  const create = vi.fn(async (_value: { url: string }) => {});
  const menu = vi.fn();
  vi.stubGlobal("chrome", {
    runtime: {
      onInstalled: {
        addListener: (fn: () => void) => {
          install = fn;
        },
      },
      getURL: () => "chrome-extension://test/popup.html",
    },
    contextMenus: {
      removeAll: (fn: () => void) => fn(),
      create: menu,
      onClicked: {
        addListener: (fn: typeof click) => {
          click = fn;
        },
      },
    },
    storage: { local: { get: vi.fn(async () => ({})) } },
    tabs: { create },
  });
  await import("../../extension/openmemory/background.js");
  install!();
  expect(menu).toHaveBeenCalledWith(
    expect.objectContaining({ contexts: ["page", "link", "selection"] }),
  );
  await click!(
    {
      menuItemId: "save-openmemory",
      linkUrl: "https://example.com/post",
      pageUrl: "https://example.org/feed",
      selectionText: "A passage worth keeping",
    },
    { title: "Feed title" },
  );
  const data = readBookmarkHandoff(new URL(create.mock.calls[0]![0].url).hash);
  expect(data).toMatchObject({
    url: "https://example.com/post",
    title: "",
    note: "A passage worth keeping",
  });
});
