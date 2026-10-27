import { webcrypto } from "node:crypto";
import { TextEncoder, TextDecoder } from "node:util";
import { IDBFactory } from "fake-indexeddb";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Route } from "../routes/index";
import { demoDismissalKey } from "../components/DemoWelcome";
import {
  readVault,
  saveVault,
  setVaultSession,
  encryptVault,
  lockVault,
  openEnvelope,
} from "../lib/vault";
import { memorySchema } from "../lib/memory";
import { buildHandoff } from "../../extension/openmemory/protocol.js";
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
const input = {
  url: "https://www.youtube.com/watch?v=example&t=93",
  title: "Fictional saved video",
  note: "Keep this explanation for later.",
};
beforeEach(async () => {
  vi.stubGlobal("crypto", webcrypto);
  vi.stubGlobal("TextEncoder", TextEncoder);
  vi.stubGlobal("TextDecoder", TextDecoder);
  vi.stubGlobal("indexedDB", new IDBFactory());
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem(demoDismissalKey, "dismissed");
  setVaultSession({ key: null, salt: null });
  await saveVault([]);
  window.history.replaceState({}, "", new URL(buildHandoff("http://localhost:3000", input)).hash);
});
afterEach(() => {
  cleanup();
  setVaultSession({ key: null, salt: null });
  window.history.replaceState({}, "", "/");
  vi.unstubAllGlobals();
});
async function saveShared() {
  const Component = Route.options.component!;
  render(<Component />);
  await screen.findByRole("heading", { name: "A little something worth keeping." });
  expect(screen.getByLabelText("Saved link title")).toHaveValue(input.title);
  expect((await readVault())?.encrypted).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "Save link" }));
  await screen.findByRole("heading", { name: input.title });
  await waitFor(() => expect(window.location.hash).toBe(""));
}
it("actual route reviews before saving and retains bookmark status after vault reload", async () => {
  await saveShared();
  let saved = memorySchema.array().parse((await openEnvelope(await readVault())).data);
  expect(saved).toHaveLength(1);
  expect(saved[0]?.bookmark?.url).toBe(input.url);
  fireEvent.change(screen.getByLabelText(`Status for ${input.title}`), {
    target: { value: "done" },
  });
  await waitFor(async () => {
    saved = memorySchema.array().parse((await openEnvelope(await readVault())).data);
    expect(saved[0]?.bookmark?.status).toBe("done");
  });
  cleanup();
  const Component = Route.options.component!;
  render(<Component />);
  fireEvent.click(await screen.findByRole("button", { name: /Your library/ }));
  expect(await screen.findByLabelText(`Status for ${input.title}`)).toHaveValue("done");
});
it("waits for vault unlock and saves the shared bookmark encrypted", async () => {
  const passphrase = "a fictional bookmark password";
  await encryptVault([], passphrase);
  lockVault();
  const Component = Route.options.component!;
  render(<Component />);
  expect(screen.queryByLabelText("Saved link title")).not.toBeInTheDocument();
  fireEvent.change(await screen.findByLabelText("Passphrase"), { target: { value: passphrase } });
  fireEvent.click(screen.getByRole("button", { name: /^Unlock$/ }));
  await screen.findByLabelText("Saved link title");
  fireEvent.click(screen.getByRole("button", { name: "Save link" }));
  await screen.findByRole("heading", { name: input.title });
  const raw = await readVault();
  expect(raw?.encrypted).toBe(true);
  expect(JSON.stringify(raw)).not.toContain(input.title);
  const saved = memorySchema.array().parse((await openEnvelope(raw, passphrase)).data);
  expect(saved[0]?.bookmark?.url).toBe(input.url);
});
