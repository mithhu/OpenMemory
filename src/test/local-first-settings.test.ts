import { beforeEach, expect, it } from "vitest";
import {
  defaultAISettings,
  loadAISettings,
  saveAISettings,
  hasHostedAIConsent,
} from "../lib/ai-client";
import { isHostedApp } from "../lib/app-environment";
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});
it("offers cloud on a hosted page without treating the default as consent", () => {
  expect(loadAISettings(true)).toEqual({ provider: "astra", model: "astra" });
  expect(hasHostedAIConsent()).toBe(false);
  saveAISettings({ provider: "astra", model: "astra" });
  expect(hasHostedAIConsent()).toBe(true);
  expect(loadAISettings(true).provider).toBe("astra");
});
it("does not try native MLX on the hosted page after importing a local preference", () => {
  saveAISettings(defaultAISettings);
  expect(loadAISettings(true).provider).toBe("astra");
  expect(hasHostedAIConsent()).toBe(false);
  expect(loadAISettings(false)).toEqual(defaultAISettings);
});
it("recognizes only loopback addresses as native app origins", () => {
  for (const host of ["localhost", "127.0.0.1", "[::1]"]) expect(isHostedApp(host)).toBe(false);
  for (const host of ["open-memory-ai.vercel.app", "localhost.example.com", "192.168.1.10"])
    expect(isHostedApp(host)).toBe(true);
});
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

it("restores hosted MLX only with an unexpired session pairing and explicit local choice", () => {
  sessionStorage.setItem(
    "openmemory.mlx.companion.v1",
    JSON.stringify({
      token: "fictional-session-token",
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
    }),
  );
  expect(hasHostedAIConsent()).toBe(false);
  saveAISettings(defaultAISettings);
  expect(loadAISettings(true)).toEqual(defaultAISettings);
  expect(hasHostedAIConsent()).toBe(true);
  sessionStorage.setItem(
    "openmemory.mlx.companion.v1",
    JSON.stringify({ token: "fictional-session-token", expiresAt: 1 }),
  );
  expect(loadAISettings(true).provider).toBe("astra");
  expect(hasHostedAIConsent()).toBe(false);
});
