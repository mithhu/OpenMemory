import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VoiceCapture } from "../components/VoiceCapture";
const api = vi.hoisted(() => ({ status: vi.fn(), transcribe: vi.fn() }));
vi.mock("../lib/voice", () => ({
  getVoiceStatus: api.status,
  transcribeVoice: api.transcribe,
  MAX_AUDIO_BYTES: 6 * 1024 * 1024,
  audioTypes: ["audio/webm", "audio/mp4", "audio/ogg", "audio/wav", "audio/mpeg"],
}));
const stopTrack = vi.fn();
class FakeRecorder {
  static current: FakeRecorder;
  static isTypeSupported() {
    return true;
  }
  state = "inactive";
  mimeType = "audio/webm;codecs=opus";
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor() {
    FakeRecorder.current = this;
  }
  start() {
    this.state = "recording";
  }
  stop() {
    this.state = "inactive";
    this.ondataavailable?.({ data: new Blob(["a".repeat(500)], { type: this.mimeType }) });
    this.onstop?.();
  }
}
function setup(remaining = 16000) {
  const transcript = vi.fn();
  const busy = vi.fn();
  const view = render(
    <VoiceCapture
      disabled={false}
      remaining={remaining}
      onTranscript={transcript}
      onBusyChange={busy}
    />,
  );
  return { transcript, busy, ...view };
}
beforeEach(() => {
  api.status.mockResolvedValue({ configured: true });
  api.transcribe.mockResolvedValue({ text: "I want to watch Arrival.", language: "en" });
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop: stopTrack }] }) },
  });
  vi.stubGlobal("MediaRecorder", FakeRecorder);
  URL.createObjectURL = vi.fn().mockReturnValue("blob:test");
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
async function record() {
  fireEvent.click(screen.getByRole("button", { name: "Speak a memory" }));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Start recording" })).toBeEnabled(),
  );
  fireEvent.click(screen.getByRole("button", { name: "Start recording" }));
  await screen.findByRole("button", { name: "Stop recording" });
  fireEvent.click(screen.getByRole("button", { name: "Stop recording" }));
  await screen.findByRole("button", { name: "Transcribe" });
}
describe("Voice notes require explicit transcription and review", () => {
  it("keeps recording local until Transcribe, then sends text to the draft only", async () => {
    const { transcript } = setup();
    await record();
    expect(api.transcribe).not.toHaveBeenCalled();
    expect(stopTrack).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Transcribe" }));
    await waitFor(() => expect(transcript).toHaveBeenCalledWith("I want to watch Arrival."));
    expect(api.transcribe.mock.calls[0]![0].data).toBeInstanceOf(FormData);
  });
  it("discards without contacting ElevenLabs", async () => {
    setup();
    await record();
    fireEvent.click(screen.getByRole("button", { name: "Discard recording" }));
    expect(api.transcribe).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Start recording" })).toBeEnabled();
  });
  it("keeps the recording available for retry after an error", async () => {
    api.transcribe.mockRejectedValue(new Error("Rate limit"));
    setup();
    await record();
    fireEvent.click(screen.getByRole("button", { name: "Transcribe" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Rate limit");
    expect(screen.getByRole("button", { name: "Transcribe" })).toBeEnabled();
  });
  it("never silently truncates a transcript", async () => {
    const { transcript } = setup(5);
    await record();
    fireEvent.click(screen.getByRole("button", { name: "Transcribe" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("longer than");
    expect(transcript).not.toHaveBeenCalled();
  });
  it("stops the microphone when unmounted", async () => {
    const { unmount } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Speak a memory" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Start recording" })).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Start recording" }));
    await screen.findByRole("button", { name: "Stop recording" });
    unmount();
    expect(FakeRecorder.current.state).toBe("inactive");
    expect(stopTrack).toHaveBeenCalled();
    expect(api.transcribe).not.toHaveBeenCalled();
  });
  it("explains missing server configuration", async () => {
    api.status.mockResolvedValue({ configured: false });
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Speak a memory" }));
    expect(await screen.findByRole("status")).toHaveTextContent("ELEVENLABS_API_KEY");
  });
  it("handles denied microphone access without uploading", async () => {
    vi.mocked(navigator.mediaDevices.getUserMedia).mockRejectedValue(
      new DOMException("denied", "NotAllowedError"),
    );
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Speak a memory" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Start recording" })).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Start recording" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("denied");
    expect(api.transcribe).not.toHaveBeenCalled();
  });
});
