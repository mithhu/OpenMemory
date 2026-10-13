import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const api = vi.hoisted(() => ({ models: vi.fn() }));
vi.mock("../lib/ai-client", () => ({ getLocalModels: api.models }));
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
  expect(await screen.findByRole("status")).toHaveTextContent("Connected to Ollama");
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
