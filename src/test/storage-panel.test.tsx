import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const api = vi.hoisted(() => ({
  pair: vi.fn(),
  read: vi.fn(),
  write: vi.fn(),
  browser: vi.fn(),
  choose: vi.fn(),
  backend: vi.fn(),
}));
vi.mock("../lib/local-store", () => ({
  pairLocalStore: api.pair,
  readLocalVault: api.read,
  writeLocalVault: api.write,
  chooseVaultBackend: api.choose,
  vaultBackend: api.backend,
}));
vi.mock("../lib/vault", async (original) => ({
  ...(await original<typeof import("../lib/vault")>()),
  readBrowserVault: api.browser,
}));
import { StoragePanel } from "../components/StoragePanel";
import { demoMemories } from "../lib/memory";
beforeEach(() => {
  vi.clearAllMocks();
  api.backend.mockReturnValue("browser");
  api.pair.mockResolvedValue(undefined);
  api.read.mockResolvedValue(null);
  api.browser.mockResolvedValue({ version: 1, encrypted: false, data: demoMemories() });
});
afterEach(cleanup);
async function connect() {
  fireEvent.change(screen.getByLabelText("Mac storage pairing code"), {
    target: { value: "fixture-code" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Connect Mac storage" }));
  await screen.findByRole("region", { name: "Review storage switch" });
}
it("requires an explicit review and preserves the draft when transfer loses a race", async () => {
  api.write.mockRejectedValue(new Error("Library changed in another browser"));
  render(<StoragePanel disabled={false} />);
  await connect();
  const transfer = screen.getByRole("button", { name: "Copy browser library to this Mac" });
  expect(transfer).toBeDisabled();
  expect(api.write).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(transfer);
  expect(await screen.findByRole("alert")).toHaveTextContent("changed in another browser");
  expect(api.choose).not.toHaveBeenCalled();
});
it("never offers to overwrite a populated Mac library with browser data", async () => {
  api.read.mockResolvedValue({ version: 1, encrypted: false, data: demoMemories(), revision: 4 });
  render(<StoragePanel disabled={false} />);
  await connect();
  expect(
    screen.queryByRole("button", { name: "Copy browser library to this Mac" }),
  ).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Use existing Mac library" })).toBeDisabled();
  expect(api.write).not.toHaveBeenCalled();
});
it("does not switch storage when connection fails", async () => {
  api.pair.mockRejectedValue(new Error("Service unavailable"));
  render(<StoragePanel disabled={false} />);
  fireEvent.change(screen.getByLabelText("Mac storage pairing code"), {
    target: { value: "fixture-code" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Connect Mac storage" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Service unavailable");
  expect(api.choose).not.toHaveBeenCalled();
  expect(api.read).not.toHaveBeenCalled();
});

it("refuses to transfer an outdated browser snapshot after review", async () => {
  render(<StoragePanel disabled={false} />);
  await connect();
  api.browser.mockResolvedValue({ version: 1, encrypted: false, data: [], revision: 99 });
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(screen.getByRole("button", { name: "Copy browser library to this Mac" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("changed during review");
  expect(api.write).not.toHaveBeenCalled();
  expect(api.choose).not.toHaveBeenCalled();
});
