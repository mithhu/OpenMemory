import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DemoWelcome, demoDismissalKey } from "../components/DemoWelcome";

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("First-visit demo", () => {
  it("waits for the workspace, then offers a silent poster without loading or playing the movie", () => {
    const { rerender } = render(<DemoWelcome ready={false} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    rerender(<DemoWelcome ready />);
    expect(screen.getByRole("dialog")).toHaveAccessibleName("One thought. A place to keep it.");
    const video = screen.getByLabelText(/OpenMemory introduction/);
    expect(video).not.toHaveAttribute("src");
    expect(video).toHaveAttribute("preload", "none");
    expect(video.querySelector('track[kind="captions"]')).toHaveAttribute("srcLang", "en");
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
  });
  it("loads and plays only after a gesture, then pauses and remembers dismissal", async () => {
    render(<DemoWelcome ready />);
    fireEvent.click(screen.getByRole("button", { name: /Play with sound/ }));
    const video = screen.getByLabelText(/OpenMemory introduction/) as HTMLVideoElement;
    expect(video.src).toContain("/demo/openmemory-intro-v1.mp4");
    expect(video.muted).toBe(false);
    expect(video.controls).toBe(true);
    expect(video.play).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Start using OpenMemory" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(video.pause).toHaveBeenCalled();
    expect(localStorage.getItem(demoDismissalKey)).toBe("dismissed");
  });
  it("keeps the permanent entry point after a previous visit and can replay", () => {
    localStorage.setItem(demoDismissalKey, "dismissed");
    render(<DemoWelcome ready />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Watch demo" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByLabelText(/OpenMemory introduction/)).not.toHaveAttribute("src");
  });
  it("still lets people skip if browser preferences are blocked", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    render(<DemoWelcome ready />);
    fireEvent.click(screen.getByRole("button", { name: "Skip & start" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  it("provides a fallback if playback is rejected without trapping the visitor", async () => {
    vi.mocked(HTMLMediaElement.prototype.play).mockRejectedValue(new Error("blocked"));
    render(<DemoWelcome ready />);
    fireEvent.click(screen.getByRole("button", { name: /Play with sound/ }));
    expect(await screen.findByRole("status")).toHaveTextContent("download the video");
    expect(screen.getByRole("button", { name: "Start using OpenMemory" })).toBeEnabled();
  });
});
