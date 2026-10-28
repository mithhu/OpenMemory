import { webcrypto } from "node:crypto";
import { TextDecoder, TextEncoder } from "node:util";
import { IDBFactory } from "fake-indexeddb";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { demoDismissalKey } from "../components/DemoWelcome";
import { Route } from "../routes/index";
import { readBrowserVault, saveVault, setVaultSession } from "../lib/vault";
import { chooseVaultBackend, resetVaultBackendForTests } from "../lib/local-store";
import { createBookmark } from "../lib/bookmarks";
vi.mock("../lib/astra", () => ({
  getAstraStatus: vi.fn(async () => ({ configured: false })),
  planCapture: vi.fn(),
  connectMemories: vi.fn(),
  mapMemories: vi.fn(),
  discoverLibrary: vi.fn(),
}));
vi.mock("../hooks/use-memory-graph", () => ({
  useMemoryGraph: () => ({
    graph: null,
    mapping: false,
    stale: false,
    error: null,
    retry: () => {},
  }),
}));
const fetcher = vi.fn();
const browserNote = createBookmark({
  version: 1,
  id: "123e4567-e89b-42d3-a456-426614174000",
  title: "Browser-only collection",
  url: "https://example.com/browser",
  note: "Keep original",
});
const macNote = createBookmark({
  version: 1,
  id: "123e4567-e89b-42d3-a456-426614174001",
  title: "Shared Mac collection",
  url: "https://example.com/mac",
  note: "Shared note",
});
beforeEach(async () => {
  vi.stubGlobal("crypto", webcrypto);
  vi.stubGlobal("TextEncoder", TextEncoder);
  vi.stubGlobal("TextDecoder", TextDecoder);
  vi.stubGlobal("indexedDB", new IDBFactory());
  vi.stubGlobal("fetch", fetcher);
  localStorage.clear();
  sessionStorage.clear();
  resetVaultBackendForTests();
  setVaultSession({ key: null, salt: null });
  localStorage.setItem(demoDismissalKey, "dismissed");
  await saveVault([browserNote]);
  localStorage.setItem("echo.memories.v1", "legacy-browser-data-must-stay");
  localStorage.setItem(
    "openmemory.storage.pairing.v1",
    JSON.stringify({
      token: "fictional-storage-grant-token",
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
    }),
  );
  chooseVaultBackend("sqlite");
  fetcher.mockReset();
});
afterEach(() => {
  cleanup();
  resetVaultBackendForTests();
  setVaultSession({ key: null, salt: null });
  vi.unstubAllGlobals();
});
it("actual route opens the shared library and preserves the browser collection", async () => {
  const original = await readBrowserVault();
  fetcher.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({
      envelope: { version: 1, encrypted: false, data: [macNote], revision: 7 },
    }),
  });
  const Page = Route.options.component!;
  render(<Page />);
  await screen.findByText("Shared library on this Mac.");
  expect(screen.queryByText("Browser-only collection")).not.toBeInTheDocument();
  expect(await readBrowserVault()).toEqual(original);
  expect(localStorage.getItem("echo.memories.v1")).toBe("legacy-browser-data-must-stay");
  expect(fetcher.mock.calls[0]?.[0]).toBe("http://127.0.0.1:8766/vault");
});
it("an explicitly selected empty SQLite library stays empty and does not import or seed browser notes", async () => {
  fetcher.mockImplementation(async (_url: string, init: RequestInit) => ({
    ok: true,
    status: 200,
    json: async () => ({
      envelope:
        init.method === "PUT" ? { version: 1, encrypted: false, data: [], revision: 1 } : null,
    }),
  }));
  const Page = Route.options.component!;
  render(<Page />);
  await screen.findByText("Shared library on this Mac.");
  await waitFor(() =>
    expect(fetcher.mock.calls.some(([, init]) => init.method === "PUT")).toBe(true),
  );
  const put = fetcher.mock.calls.find(([, init]) => init.method === "PUT")!;
  expect(JSON.parse(put[1].body)).toMatchObject({ expectedRevision: 0, envelope: { data: [] } });
  expect(localStorage.getItem("echo.memories.v1")).toBe("legacy-browser-data-must-stay");
  expect(await readBrowserVault()).toMatchObject({ data: [browserNote] });
});
it("an unavailable selected SQLite service never loads or overwrites the other browser library", async () => {
  const original = await readBrowserVault();
  fetcher.mockRejectedValue(new TypeError("Failed to fetch"));
  const Page = Route.options.component!;
  render(<Page />);
  expect(await screen.findByRole("alert")).toHaveTextContent("Could not reach Mac storage");
  expect(screen.queryByText("Browser-only collection")).not.toBeInTheDocument();
  expect(await readBrowserVault()).toEqual(original);
});
