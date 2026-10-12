import { useEffect, useRef, useState } from "react";
import { Mic, Square, X, Loader2, ArrowRight, RotateCcw } from "lucide-react";
import { getVoiceStatus, transcribeVoice, MAX_AUDIO_BYTES, audioTypes } from "@/lib/voice";

type Phase = "idle" | "starting" | "recording" | "ready" | "transcribing";
export function VoiceCapture({
  disabled,
  remaining,
  onTranscript,
  onBusyChange,
}: {
  disabled: boolean;
  remaining: number;
  onTranscript: (text: string) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [supported, setSupported] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [seconds, setSeconds] = useState(0);
  const [recording, setRecording] = useState<Blob | null>(null);
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const upload = useRef<HTMLInputElement>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const mounted = useRef(true);
  const discard = useRef(false);
  const inFlight = useRef(false);
  useEffect(() => {
    mounted.current = true;
    setSupported(
      typeof navigator.mediaDevices?.getUserMedia === "function" &&
        typeof window.MediaRecorder === "function",
    );
    void getVoiceStatus()
      .then((s) => {
        if (mounted.current) setConfigured(s.configured);
      })
      .catch(() => {
        if (mounted.current) setConfigured(false);
      });
    return () => {
      mounted.current = false;
      discard.current = true;
      if (recorder.current?.state === "recording") recorder.current.stop();
      stream.current?.getTracks().forEach((t) => t.stop());
      onBusyChange(false);
    };
  }, [onBusyChange]);
  useEffect(() => {
    onBusyChange(phase !== "idle");
  }, [phase, onBusyChange]);
  useEffect(() => {
    if (!recording) {
      setUrl("");
      return;
    }
    const next = URL.createObjectURL(recording);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [recording]);
  useEffect(() => {
    if (phase !== "recording") return;
    const timer = setInterval(
      () =>
        setSeconds((s) => {
          if (s >= 119) {
            recorder.current?.stop();
            stream.current?.getTracks().forEach((t) => t.stop());
            return 120;
          }
          return s + 1;
        }),
      1000,
    );
    return () => clearInterval(timer);
  }, [phase]);
  const stop = () => {
    if (recorder.current?.state === "recording") recorder.current.stop();
    stream.current?.getTracks().forEach((t) => t.stop());
  };
  const reset = () => {
    discard.current = true;
    stop();
    setRecording(null);
    setPhase("idle");
    setSeconds(0);
    setError("");
  };
  const start = async () => {
    if (inFlight.current || disabled || !configured || !supported) return;
    inFlight.current = true;
    setError("");
    setPhase("starting");
    discard.current = false;
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mounted.current || discard.current) {
        media.getTracks().forEach((t) => t.stop());
        return;
      }
      stream.current = media;
      const mime = ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus"].find((t) =>
        MediaRecorder.isTypeSupported(t),
      );
      const next = mime ? new MediaRecorder(media, { mimeType: mime }) : new MediaRecorder(media);
      recorder.current = next;
      const chunks: Blob[] = [];
      let size = 0;
      next.ondataavailable = (event) => {
        if (event.data.size) {
          chunks.push(event.data);
          size += event.data.size;
        }
        if (size > MAX_AUDIO_BYTES && next.state === "recording") next.stop();
      };
      next.onerror = () => {
        discard.current = true;
        stop();
        setPhase("idle");
        setError("Recording stopped unexpectedly. Please try again.");
      };
      next.onstop = () => {
        media.getTracks().forEach((t) => t.stop());
        if (!mounted.current || discard.current) return;
        const blob = new Blob(chunks, { type: next.mimeType });
        if (blob.size < 100 || blob.size > MAX_AUDIO_BYTES) {
          setPhase("idle");
          setError("Record a short note up to 6 MB, then try again.");
          return;
        }
        setRecording(blob);
        setPhase("ready");
      };
      setRecording(null);
      setSeconds(0);
      next.start(1000);
      setPhase("recording");
    } catch (reason) {
      if (mounted.current) {
        setPhase("idle");
        setError(
          reason instanceof DOMException && reason.name === "NotAllowedError"
            ? "Microphone access was denied. Allow it in your browser, or keep typing."
            : "Your microphone couldn't be opened. Check your browser and microphone.",
        );
      }
      stream.current?.getTracks().forEach((t) => t.stop());
    } finally {
      inFlight.current = false;
    }
  };
  const convert = async () => {
    if (!recording || inFlight.current) return;
    inFlight.current = true;
    setPhase("transcribing");
    setError("");
    try {
      const data = new FormData();
      data.append("audio", recording, "voice-note");
      const result = await transcribeVoice({ data });
      if (!mounted.current) return;
      if (result.text.length > remaining)
        throw new Error(
          "The transcript is longer than the space left in this note. Shorten your typed draft and retry.",
        );
      onTranscript(result.text);
      setRecording(null);
      setPhase("idle");
      setOpen(false);
    } catch (reason) {
      if (mounted.current) {
        setPhase("ready");
        setError(reason instanceof Error ? reason.message : "Transcription failed. Try again.");
      }
    } finally {
      inFlight.current = false;
    }
  };
  return (
    <div className="voice-capture">
      <button
        type="button"
        className="voice-toggle"
        aria-expanded={open}
        aria-controls="voice-controls"
        disabled={disabled || phase === "transcribing"}
        onClick={() => {
          if (open) {
            reset();
            setOpen(false);
          } else setOpen(true);
        }}
      >
        <Mic size={15} /> Speak a memory
      </button>
      {open && (
        <div id="voice-controls" className="voice-panel">
          <div className="voice-panel-heading">
            <strong>Say it in your own words.</strong>
            <button
              type="button"
              className="icon-button"
              aria-label="Close voice capture"
              disabled={phase === "transcribing"}
              onClick={() => {
                reset();
                setOpen(false);
              }}
            >
              <X size={16} />
            </button>
          </div>
          <p>
            Record up to 2 minutes. Audio goes to ElevenLabs only when you select Transcribe, even
            if your memory AI is local. Check the transcript before saving.
          </p>
          {!supported && (
            <p role="status">
              Voice recording needs a browser with microphone support, such as Chrome or Safari, on
              HTTPS or localhost.
            </p>
          )}
          {configured === false ? (
            <p role="status">
              Voice needs ELEVENLABS_API_KEY on the server. Restart the app after adding it.
            </p>
          ) : (
            <>
              {phase === "idle" && (
                <button
                  type="button"
                  className="primary-button"
                  disabled={!configured || disabled || !supported}
                  onClick={() => void start()}
                >
                  <Mic size={15} />
                  {configured === null ? "Checking voice…" : "Start recording"}
                </button>
              )}
              {phase === "idle" && (
                <>
                  <button
                    type="button"
                    className="text-button"
                    disabled={!configured || disabled}
                    onClick={() => upload.current?.click()}
                  >
                    Use an audio file
                  </button>
                  <input
                    ref={upload}
                    type="file"
                    accept="audio/webm,audio/mp4,audio/ogg,audio/wav,audio/mpeg"
                    aria-label="Upload recorded audio"
                    className="sr-only"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      event.target.value = "";
                      if (!file) return;
                      if (
                        file.size < 100 ||
                        file.size > MAX_AUDIO_BYTES ||
                        !audioTypes.includes(file.type.split(";")[0] ?? "")
                      ) {
                        setError("Choose a supported audio file up to 6 MB.");
                        return;
                      }
                      setError("");
                      setRecording(file);
                      setPhase("ready");
                    }}
                  />
                </>
              )}
              {phase === "starting" && <p role="status">Waiting for microphone permission…</p>}
              {phase === "recording" && (
                <div className="voice-actions">
                  <span role="status">
                    <i className="recording-dot" />
                    Recording · {seconds}s
                  </span>
                  <button type="button" className="primary-button" onClick={stop}>
                    <Square size={14} />
                    Stop recording
                  </button>
                </div>
              )}
              {(phase === "ready" || phase === "transcribing") && (
                <>
                  <audio controls src={url} aria-label="Your recorded note" />
                  <div className="voice-actions">
                    <button
                      type="button"
                      className="text-button"
                      disabled={phase === "transcribing"}
                      onClick={reset}
                    >
                      <RotateCcw size={14} />
                      Discard recording
                    </button>
                    <button
                      type="button"
                      className="primary-button"
                      disabled={phase === "transcribing"}
                      onClick={() => void convert()}
                    >
                      {phase === "transcribing" ? (
                        <Loader2 size={15} className="spin" />
                      ) : (
                        <ArrowRight size={15} />
                      )}
                      {phase === "transcribing" ? "Transcribing…" : "Transcribe"}
                    </button>
                  </div>
                </>
              )}
            </>
          )}
          {error && (
            <p className="voice-error" role="alert">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
