import { beforeEach, expect, it } from "vitest";
import { defaultAISettings, loadAISettings, saveAISettings } from "../lib/ai-client";
beforeEach(() => localStorage.clear());
it("starts with MLX locally even when cloud credentials exist elsewhere", () => {
  expect(loadAISettings()).toEqual({
    provider: "ollama",
    model: "qwen3.5:9b",
    captureEngine: "mlx",
  });
});
it("does not reuse a legacy cloud preference as consent for the new policy", () => {
  localStorage.setItem("openmemory.ai.v1", JSON.stringify({ provider: "astra", model: "astra" }));
  expect(loadAISettings()).toEqual(defaultAISettings);
});
it("requires an explicit v2 cloud opt-in", () => {
  localStorage.setItem("openmemory.ai.v2", JSON.stringify({ provider: "astra", model: "astra" }));
  expect(loadAISettings()).toEqual(defaultAISettings);
  saveAISettings({ provider: "astra", model: "astra" });
  expect(loadAISettings().provider).toBe("astra");
});
it("switching back to MLX removes cloud opt-in", () => {
  saveAISettings({ provider: "astra", model: "astra" });
  saveAISettings(defaultAISettings);
  expect(JSON.parse(localStorage.getItem("openmemory.ai.v2")!).cloudOptIn).toBe(false);
  expect(loadAISettings()).toEqual(defaultAISettings);
});
it("persists the explicit alternative local Ollama model", () => {
  const choice = {
    provider: "ollama" as const,
    model: "qwen3.5:4b",
    captureEngine: "ollama" as const,
  };
  saveAISettings(choice);
  expect(loadAISettings()).toEqual(choice);
});
it("does not persist a remote model as local", () => {
  expect(() =>
    saveAISettings({ provider: "ollama", model: "cloud-model", captureEngine: "ollama" }),
  ).toThrow();
  expect(loadAISettings()).toEqual(defaultAISettings);
});
