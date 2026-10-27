import { demoDismissalKey } from "../components/DemoWelcome";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type ComponentType } from "react";
import { type CapturePlan } from "../lib/capture-plan";

const api = vi.hoisted(() => ({
  plan: vi.fn(),
  save: vi.fn(),
  error: vi.fn(),
  graph: vi.fn(),
  status: vi.fn(),
  transcribe: vi.fn(),
}));
vi.mock("../lib/ai-client", async (original) => ({
  ...(await original<typeof import("../lib/ai-client")>()),
  planWithProvider: api.plan,
}));
vi.mock("../lib/local-mlx", () => ({
  captureWithLocalMlx: async (input: unknown, signal: AbortSignal) => ({
    plan: await api.plan(input, { provider: "ollama", model: "qwen3.5:9b" }, signal),
  }),
}));
vi.mock("../lib/astra", async (original) => ({
  ...(await original<typeof import("../lib/astra")>()),
  getAstraStatus: api.status,
}));
vi.mock("../lib/vault", async (original) => ({
  ...(await original<typeof import("../lib/vault")>()),
  readVault: () => Promise.resolve({ encrypted: false }),
  openEnvelope: () => Promise.resolve({ data: [], key: null, salt: null }),
  setVaultSession: vi.fn(),
  saveVault: api.save,
}));
vi.mock("../hooks/use-memory-graph", () => ({
  useMemoryGraph: (...args: unknown[]) => {
    api.graph(...args);
    return {
      graph: null,
      mapping: false,
      stale: false,
      error: null,
      retry: vi.fn(),
    };
  },
}));
vi.mock("sonner", () => ({ toast: { error: api.error, success: vi.fn() } }));
vi.mock("../lib/app-environment", () => ({ isHostedApp: () => true }));
vi.mock("../lib/voice", () => ({
  getVoiceStatus: () => Promise.resolve({ configured: true }),
  transcribeVoice: api.transcribe,
  MAX_AUDIO_BYTES: 6 * 1024 * 1024,
  audioTypes: ["audio/wav"],
}));
import { Route } from "../routes/index";
const Page = Route.options.component as ComponentType;
beforeEach(() => {
  localStorage.clear();
  // Exercise the app as a returning visitor; welcome behavior has its own coverage.
  localStorage.setItem(demoDismissalKey, "dismissed");
  vi.clearAllMocks();
  api.status.mockResolvedValue({ configured: true });
  api.save.mockResolvedValue(undefined);
  URL.createObjectURL = vi.fn().mockReturnValue("blob:fictional");
  URL.revokeObjectURL = vi.fn();
});
afterEach(cleanup);
async function start() {
  render(<Page />);
  await screen.findByRole("region", { name: "Choose AI processing" });
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Enable AI review" })).toBeEnabled(),
  );
}
it("keeps capture and graph local until consent, and saves manually", async () => {
  await start();
  expect(api.graph.mock.calls.at(-1)?.[1].enabled).toBe(false);
  fireEvent.change(screen.getByLabelText("A new memory"), {
    target: { value: "A fictional walk in the park" },
  });
  fireEvent.click(screen.getAllByRole("button", { name: "Review manually" })[0]!);
  expect(screen.getByLabelText("Entry 1 details")).toHaveValue("A fictional walk in the park");
  expect(api.plan).not.toHaveBeenCalled();
  expect(api.save).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Save 1 entry" }));
  await waitFor(() => expect(api.save).toHaveBeenCalledOnce());
});
it("transcribes only after an explicit action, lets the user edit, and uses cloud only after consent", async () => {
  api.transcribe.mockResolvedValue({ text: "I want to watch Arrival.", language: "en" });
  api.plan.mockImplementation(async ({ text }: { text: string }) => ({
    entries: [
      {
        title: "Arrival",
        summary: text,
        category: "NOTE",
        date: "2026-10-12",
        matchedMemoryId: null,
        candidateMemoryIds: [],
        clarificationQuestion: null,
        tags: [],
        activity: null,
      },
    ],
  }));
  await start();
  fireEvent.click(screen.getByRole("button", { name: "Speak a memory" }));
  const upload = await screen.findByLabelText("Upload recorded audio");
  fireEvent.change(upload, {
    target: { files: [new File(["x".repeat(500)], "fictional.wav", { type: "audio/wav" })] },
  });
  expect(api.transcribe).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Transcribe" }));
  await waitFor(() =>
    expect(screen.getByLabelText("A new memory")).toHaveValue("I want to watch Arrival."),
  );
  expect(api.plan).not.toHaveBeenCalled();
  expect(api.save).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("A new memory"), {
    target: { value: "I want to watch Arrival this weekend." },
  });
  fireEvent.click(screen.getByRole("button", { name: "Enable AI review" }));
  fireEvent.click(screen.getByRole("button", { name: "Review memory" }));
  await screen.findByLabelText("Entry 1 details");
  expect(api.plan.mock.calls[0]?.[0].text).toBe("I want to watch Arrival this weekend.");
  expect(api.plan.mock.calls[0]?.[1].provider).toBe("astra");
  expect(api.save).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Save 1 entry" }));
  await waitFor(() => expect(api.save).toHaveBeenCalledOnce());
});
it("lets a hosted visitor withdraw cloud consent", async () => {
  await start();
  fireEvent.click(screen.getByRole("button", { name: "Enable AI review" }));
  fireEvent.click(screen.getByRole("button", { name: "Open privacy and AI settings" }));
  expect(screen.getByRole("button", { name: /Local MLX/ })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Use manual review only" }));
  expect(localStorage.getItem("openmemory.ai.v2")).toBeNull();
  expect(api.graph.mock.calls.at(-1)?.[1].enabled).toBe(false);
});

it("preserves the draft when cloud requests fail and still saves through manual review", async () => {
  api.plan.mockRejectedValue(new Error("OpenAI is at its rate or credit limit."));
  await start();
  fireEvent.click(screen.getByRole("button", { name: "Enable AI review" }));
  fireEvent.change(screen.getByLabelText("A new memory"), {
    target: { value: "A fictional afternoon walk" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Review memory" }));
  await screen.findByRole("alert");
  expect(screen.getByLabelText("A new memory")).toHaveValue("A fictional afternoon walk");
  expect(api.save).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Review manually" }));
  fireEvent.click(screen.getByRole("button", { name: "Save 1 entry" }));
  await waitFor(() => expect(api.save).toHaveBeenCalledOnce());
});

it("keeps hosted capture usable when the server has no AI credentials", async () => {
  api.status.mockResolvedValue({ configured: false });
  render(<Page />);
  await screen.findByText("AI review is temporarily unavailable. You can still save manually.");
  expect(screen.getByRole("button", { name: "Enable AI review" })).toBeDisabled();
  fireEvent.change(screen.getByLabelText("A new memory"), {
    target: { value: "A fictional quiet evening" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Review manually" }));
  expect(screen.getByLabelText("Entry 1 details")).toHaveValue("A fictional quiet evening");
  expect(api.plan).not.toHaveBeenCalled();
});

it("restores an explicitly selected MLX choice in a new tab without tab-local credentials", async () => {
  sessionStorage.clear();
  localStorage.setItem(
    "openmemory.mlx.companion.v1",
    JSON.stringify({
      token: "fictional-shared-browser-token",
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
    }),
  );
  localStorage.setItem(
    "openmemory.ai.v2",
    JSON.stringify({
      provider: "ollama",
      model: "qwen3.5:9b",
      captureEngine: "mlx",
      cloudOptIn: false,
    }),
  );
  render(<Page />);
  await screen.findByText("Local MLX", { exact: true });
  expect(screen.queryByRole("region", { name: "Choose AI processing" })).not.toBeInTheDocument();
  expect(sessionStorage.getItem("openmemory.mlx.companion.v1")).toBeNull();
  expect(api.plan).not.toHaveBeenCalled();
});
it("updates an existing tab when local pairing and provider choice arrive from another tab", async () => {
  await start();
  act(() => {
    localStorage.setItem(
      "openmemory.mlx.companion.v1",
      JSON.stringify({
        token: "fictional-shared-browser-token",
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
      }),
    );
    localStorage.setItem(
      "openmemory.ai.v2",
      JSON.stringify({
        provider: "ollama",
        model: "qwen3.5:9b",
        captureEngine: "mlx",
        cloudOptIn: false,
      }),
    );
    window.dispatchEvent(
      new StorageEvent("storage", { key: "openmemory.ai.v2", storageArea: localStorage }),
    );
  });
  await screen.findByText("Local MLX", { exact: true });
  expect(screen.queryByRole("region", { name: "Choose AI processing" })).not.toBeInTheDocument();
  act(() => {
    localStorage.setItem("openmemory.mlx.companion.v1", "null");
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: "openmemory.mlx.companion.v1",
        storageArea: localStorage,
      }),
    );
  });
  await screen.findByRole("region", { name: "Choose AI processing" });
  expect(api.plan).not.toHaveBeenCalled();
});
it("reviews and saves a shared YouTube bookmark without AI consent or an MLX pairing", async () => {
  sessionStorage.clear();
  const payload = {
    version: 1,
    id: "f43a23ec-08dd-4ebf-ad76-6cc4f5541c38",
    url: "https://www.youtube.com/watch?v=xUSznTR2cwc",
    title: "Steven Strogatz on the Humanity of Math - YouTube",
    note: "Motivation and inspiration",
  };
  window.history.replaceState({}, "", `/#save-link=${encodeURIComponent(JSON.stringify(payload))}`);
  try {
    render(<Page />);
    await screen.findByLabelText("Saved link title");
    expect(screen.getByLabelText("Saved link title")).toHaveValue(payload.title);
    fireEvent.click(screen.getByRole("button", { name: "Save link" }));
    await waitFor(() => expect(api.save).toHaveBeenCalledOnce());
    expect(api.save.mock.calls[0]![0][0]).toMatchObject({
      title: payload.title,
      summary: payload.note,
      bookmark: { url: payload.url, status: "saved" },
    });
    expect(api.plan).not.toHaveBeenCalled();
    expect(window.location.hash).toBe("");
  } finally {
    window.history.replaceState({}, "", "/");
  }
});
