import { useEffect, useRef, useState } from "react";
import { Play, ArrowRight } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export const demoDismissalKey = "openmemory.demo-welcome.v1";
const videoUrl = "/demo/openmemory-intro-v1.mp4";

export function DemoWelcome({ ready }: { ready: boolean }) {
  const [open, setOpen] = useState(false);
  const [started, setStarted] = useState(false);
  const [failed, setFailed] = useState(false);
  const checked = useRef(false);
  const player = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!ready || checked.current) return;
    checked.current = true;
    try {
      setOpen(localStorage.getItem(demoDismissalKey) !== "dismissed");
    } catch {
      // Still offer the introduction if preferences cannot be persisted.
      setOpen(true);
    }
  }, [ready]);

  useEffect(() => {
    if (!open) return;
    const video = player.current;
    return () => video?.pause();
  }, [open]);

  function changeOpen(value: boolean) {
    if (!value) {
      player.current?.pause();
      setStarted(false);
      setFailed(false);
      try {
        localStorage.setItem(demoDismissalKey, "dismissed");
      } catch {
        // A blocked preference must never prevent entering the app.
      }
    }
    setOpen(value);
  }

  function play() {
    const video = player.current;
    if (!video) return;
    setStarted(true);
    setFailed(false);
    video.src = videoUrl;
    video.muted = false;
    void video.play().catch(() => setFailed(true));
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger asChild>
        <button className="watch-demo-button" disabled={!ready}>
          <Play size={14} aria-hidden="true" />
          Watch demo
        </button>
      </DialogTrigger>
      <DialogContent className="demo-welcome">
        <div className="demo-welcome-heading">
          <span className="eyebrow">A LITTLE INTRODUCTION</span>
          <DialogTitle>One thought. A place to keep it.</DialogTitle>
          <DialogDescription>
            See a book you want to read and a film you loved become memories you can return to.
          </DialogDescription>
        </div>
        <div className="demo-video-wrap">
          <video
            ref={player}
            controls={started}
            aria-hidden={!started}
            preload="none"
            playsInline
            poster="/demo/openmemory-intro-v1.webp"
            aria-label="OpenMemory introduction: book and movie capture, review and saving"
            onError={() => setFailed(true)}
          >
            <track
              kind="captions"
              src="/demo/openmemory-intro-v1.vtt"
              srcLang="en"
              label="English"
            />
          </video>
          {!started && (
            <button className="demo-play-button" onClick={play}>
              <span className="demo-play-icon">
                <Play size={25} fill="currentColor" />
              </span>
              <span>
                Play with sound<small>91 seconds · captions available</small>
              </span>
            </button>
          )}
        </div>
        {failed && (
          <p className="demo-video-error" role="status">
            Having trouble playing? Try the player controls or{" "}
            <a href={videoUrl} download>
              download the video
            </a>
            .
          </p>
        )}
        <div className="demo-welcome-footer">
          <p>
            Real app captures, edited timing. Synthetic ElevenLabs narration.
            <a href="/demo/transcript.txt" target="_blank" rel="noreferrer">
              Read transcript
            </a>
          </p>
          <button className="demo-start-button" onClick={() => changeOpen(false)}>
            {started ? "Start using OpenMemory" : "Skip & start"}
            <ArrowRight size={16} />
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
