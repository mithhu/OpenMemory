import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const api = vi.hoisted(() => ({
  models: vi.fn(),
  status: vi.fn(),
  pair: vi.fn(),
  clear: vi.fn(),
  setup: vi.fn(),
}));
vi.mock("../lib/ai-client", () => ({ getLocalModels: api.models }));
vi.mock("../lib/local-ollama-readiness", () => ({ checkLocalOllamaSetup: api.setup }));
vi.mock("../lib/mlx-companion", () => ({
  getMlxCompanionStatus: api.status,
  pairMlxCompanion: api.pair,
  clearMlxCompanionPairing: api.clear,
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
import { PrivacyPanel } from "../components/PrivacyPanel";
beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);
function start(hosted = true) {
  const onSettings = vi.fn();
  render(
    <PrivacyPanel
      open
      onClose={vi.fn()}
      hosted={hosted}
      settings={{ provider: "ollama", model: "qwen3.5:9b", captureEngine: "ollama" }}
      onSettings={onSettings}
      encrypted={false}
      onEncrypt={vi.fn()}
      onLock={vi.fn()}
      busy={false}
    />,
  );
  return onSettings;
}
it("keeps model discovery progress and failure visible without changing provider", async () => {
  let reject!: (reason: Error) => void;
  api.models.mockReturnValue(
    new Promise((_, fail) => {
      reject = fail;
    }),
  );
  const onSettings = start();
  fireEvent.click(screen.getByRole("button", { name: "Find my local models" }));
  expect(screen.getByRole("status")).toHaveTextContent("Connecting to Ollama");
  expect(screen.getByRole("button", { name: "Checking Ollama…" })).toBeDisabled();
  await act(async () => reject(new Error("network denied")));
  expect(screen.getByRole("alert")).toHaveTextContent("browser local network access");
  expect(screen.getByRole("alert")).toHaveTextContent("in-app browser");
  expect(onSettings).not.toHaveBeenCalled();
});
it("shows discovery persistently and preserves the selected installed model until explicit selection", async () => {
  api.models.mockResolvedValue(["gemma4:12b-mlx", "qwen3.5:9b"]);
  const onSettings = start();
  fireEvent.click(screen.getByRole("button", { name: "Find my local models" }));
  await screen.findByText(/Connected to Ollama/);
  expect(screen.getByRole("status")).toHaveTextContent("Connected to Ollama");
  expect(onSettings).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Use this model" }));
  expect(onSettings).toHaveBeenCalledWith({
    provider: "ollama",
    model: "qwen3.5:9b",
    captureEngine: "ollama",
  });
});
it("links hosted visitors to the local app without enabling native MLX remotely", () => {
  const onSettings = start();
  expect(screen.getByRole("button", { name: /Local MLX · Mac app/ })).toBeDisabled();
  expect(screen.getByRole("link", { name: "OpenMemory locally" })).toHaveAttribute(
    "href",
    "http://127.0.0.1:3001/",
  );
  expect(screen.getByText(/launchctl setenv OLLAMA_NO_CLOUD/)).toHaveTextContent(
    `launchctl setenv OLLAMA_ORIGINS '${window.location.origin}'`,
  );
  expect(onSettings).not.toHaveBeenCalled();
});
it("keeps native MLX selectable in the locally running app", () => {
  const onSettings = start(false);
  fireEvent.click(screen.getByRole("button", { name: /Local MLX · Default/ }));
  expect(onSettings).toHaveBeenCalledWith({
    provider: "ollama",
    model: "qwen3.5:9b",
    captureEngine: "mlx",
  });
});

it("checks setup only on demand and requires explicit provider selection after readiness", async () => {
  const verified = { state: "ready", message: "Verified local model." };
  api.setup.mockResolvedValue({
    ready: true,
    models: ["qwen3.5:9b"],
    connection: { state: "ready", message: "Browser connected to local Ollama." },
    classifier: verified,
    extractor: verified,
  });
  const onSettings = start();
  expect(api.setup).not.toHaveBeenCalled();
  expect(api.models).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Check local setup" }));
  await screen.findByText(/Local Ollama is ready/);
  expect(screen.getByRole("status")).toHaveTextContent("Local Ollama is ready");
  expect(api.setup).toHaveBeenCalledWith("qwen3.5:9b");
  expect(onSettings).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("Downloaded local model for extraction"), {
    target: { value: "missing-model:latest" },
  });
  expect(screen.queryByText(/Local Ollama is ready/)).not.toBeInTheDocument();
  expect(api.setup).toHaveBeenCalledOnce();
});

it("shows missing classifier guidance separately from a verified extractor", async () => {
  api.setup.mockResolvedValue({
    ready: false,
    models: ["qwen3.5:9b"],
    connection: { state: "ready", message: "Browser connected to local Ollama." },
    classifier: {
      state: "missing",
      message: "Install the trained classifier package using its setup guide.",
    },
    extractor: { state: "ready", message: "Installed local model verified." },
  });
  const onSettings = start();
  fireEvent.click(screen.getByRole("button", { name: "Check local setup" }));
  await screen.findByText("Local setup needs attention.");
  const status = screen.getByRole("status");
  expect(status).toHaveTextContent("Local setup needs attention");
  expect(status).toHaveTextContent("Install the trained classifier package");
  expect(status).toHaveTextContent("Extraction model: Installed local model verified");
  expect(onSettings).not.toHaveBeenCalled();
});

it("enables hosted MLX only after explicit pairing and revalidates selection", async () => {
  api.pair.mockResolvedValue(undefined);
  api.status.mockResolvedValue({ ready: true, paired: true });
  const onSettings = start();
  const card = screen.getByRole("button", { name: /Local MLX · Mac app/ });
  expect(card).toBeDisabled();
  expect(api.status).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("Local MLX pairing code"), {
    target: { value: "fictional-code" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Pair local MLX" }));
  expect(await screen.findByRole("status")).toHaveTextContent("Verified trained adapter");
  expect(card).toBeEnabled();
  expect(onSettings).not.toHaveBeenCalled();
  api.status.mockResolvedValueOnce({ ready: true, paired: false });
  fireEvent.click(card);
  expect(
    await screen.findByText("Pair the ready local MLX service before selecting it."),
  ).toBeVisible();
  expect(card).toBeDisabled();
  expect(onSettings).not.toHaveBeenCalled();
});
it("keeps hosted MLX disabled when model assets cannot be verified", async () => {
  api.status.mockResolvedValue({ ready: false, paired: true });
  start();
  fireEvent.click(screen.getByRole("button", { name: "Check local MLX" }));
  expect(await screen.findByRole("status")).toHaveTextContent("assets are unavailable");
  expect(screen.getByRole("button", { name: /Local MLX · Mac app/ })).toBeDisabled();
});
