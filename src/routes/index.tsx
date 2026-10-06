import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Mic, Square, KeyRound, Loader2 } from "lucide-react";
import {
  type Memory, type AstraResult, loadMemories, saveMemories, loadKey, saveKey,
  transcribe, askAstra, applyResult, convertWishlist,
} from "@/lib/echo";
import { MemoryCard } from "@/components/MemoryCard";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Echo — Voice memories that ask the right question" },
      { name: "description", content: "Speak about something you want to remember. Echo turns it into a memory card and asks one smart follow-up." },
      { property: "og:title", content: "Echo — Voice memories" },
      { property: "og:description", content: "Speak naturally. Echo remembers, and never asks what it already knows." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

type Phase = "idle" | "recording" | "transcribing" | "thinking" | "saving" | "clarify";

function Index() {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [apiKey, setApiKey] = useState("");
  const [keyDraft, setKeyDraft] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [seconds, setSeconds] = useState(0);
  const [levels, setLevels] = useState<number[]>(Array(24).fill(0.08));
  const [pending, setPending] = useState<{ transcript: string; result: AstraResult } | null>(null);

  const recRef = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);
  const timerRef = useRef<number>(0);
  const audioCtxRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    setMemories(loadMemories());
    setApiKey(loadKey());
  }, []);

  const persist = (next: Memory[]) => { setMemories(next); saveMemories(next); };

  const cleanup = () => {
    cancelAnimationFrame(rafRef.current);
    clearInterval(timerRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    setLevels(Array(24).fill(0.08));
  };
  useEffect(() => cleanup, []);

  const process = async (blob: Blob) => {
    let transcript = "";
    try {
      setPhase("transcribing");
      transcript = await transcribe(blob, apiKey);
    } catch (e) {
      console.error("Transcription failed:", e instanceof Error ? e.message : e);
      toast.error("Couldn't transcribe your recording. Please try again.");
      setPhase("idle");
      return;
    }
    await think(transcript);
  };

  const think = async (transcript: string, forcedId?: string) => {
    try {
      setPhase("thinking");
      const current = loadMemories();
      const result = await askAstra(transcript, current, apiKey, forcedId);
      if (result.action === "clarify" && !forcedId) {
        const cands = result.candidateMemoryIds.filter((id) => current.some((m) => m.id === id));
        if (cands.length > 1) {
          setPending({ transcript, result: { ...result, candidateMemoryIds: cands } });
          setPhase("clarify");
          return;
        }
        if (cands.length === 1) return think(transcript, cands[0]);
        throw new Error("Clarification without candidates");
      }
      setPhase("saving");
      persist(applyResult(current, result, transcript));
      toast.success(result.action === "update" ? `Updated “${result.title}”` : "Memory saved");
    } catch (e) {
      console.error("Astra failed:", e instanceof Error ? e.message : e);
      toast.error("Couldn't understand this memory. Please try again.");
    }
    setPending(null);
    setPhase("idle");
  };

  const start = async () => {
    if (!apiKey) { toast.error("Add your OpenAI API key to start recording."); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"].find((t) => MediaRecorder.isTypeSupported?.(t));
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunks.current = [];
      rec.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      rec.onstop = () => {
        const blob = new Blob(chunks.current, { type: rec.mimeType || mime || "audio/webm" });
        cleanup();
        if (blob.size < 1000) { toast.error("Recording was too short. Please try again."); setPhase("idle"); return; }
        void process(blob);
      };
      rec.start();
      recRef.current = rec;

      const ctx = new AudioContext();
      audioCtxRef.current = ctx;
      const an = ctx.createAnalyser();
      an.fftSize = 64;
      ctx.createMediaStreamSource(stream).connect(an);
      const data = new Uint8Array(an.frequencyBinCount);
      const tick = () => {
        an.getByteFrequencyData(data);
        setLevels(Array.from({ length: 24 }, (_, i) => Math.max(0.08, (data[i + 2] ?? 0) / 255)));
        rafRef.current = requestAnimationFrame(tick);
      };
      tick();

      setSeconds(0);
      timerRef.current = window.setInterval(() => setSeconds((s) => s + 1), 1000);
      setPhase("recording");
    } catch (e) {
      console.error("Microphone error:", e instanceof Error ? e.message : e);
      cleanup();
      toast.error("Microphone access is needed to record a memory.");
    }
  };

  const stop = () => recRef.current?.state === "recording" && recRef.current.stop();

  const busy = phase === "transcribing" || phase === "thinking" || phase === "saving";
  const statusText: Record<Phase, string> = {
    idle: apiKey ? "Tap to record a memory" : "Add your OpenAI API key to start recording.",
    recording: "Recording...",
    transcribing: "Transcribing your memory...",
    thinking: "Echo is thinking...",
    saving: "Saving memory...",
    clarify: pending?.result.clarificationQuestion || "Which one do you mean?",
  };
  const mmss = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

  const update = (id: string, fn: (m: Memory) => Memory) =>
    persist(memories.map((m) => (m.id === id ? fn(m) : m)));

  return (
    <div className="mx-auto min-h-screen max-w-xl px-5 pb-24">
      <header className="flex items-start justify-between gap-4 pt-6">
        <h1 className="font-display text-4xl leading-none">Echo</h1>
        <div className="w-48 sm:w-60">
          {apiKey ? (
            <div className="flex min-h-10 items-center justify-between gap-2 rounded-xl border bg-card px-3 text-sm">
              <span className="flex items-center gap-2 text-muted-foreground"><KeyRound className="h-3.5 w-3.5" /> ••••••••</span>
              <button onClick={() => { saveKey(""); setApiKey(""); }} className="text-xs text-muted-foreground hover:text-foreground">Remove</button>
            </div>
          ) : (
            <form onSubmit={(e) => { e.preventDefault(); const k = keyDraft.trim(); if (k) { saveKey(k); setApiKey(k); setKeyDraft(""); } }} className="relative">
              <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                type="password" autoComplete="off" value={keyDraft} onChange={(e) => setKeyDraft(e.target.value)}
                placeholder="OpenAI API key"
                className="min-h-10 w-full rounded-xl border bg-card pl-8 pr-3 text-sm outline-none placeholder:text-muted-foreground focus:border-ring"
              />
            </form>
          )}
          <p className="mt-1.5 text-right text-[11px] text-muted-foreground">Stored locally on this device</p>
        </div>
      </header>

      <p className="mt-4 rounded-xl border border-primary/20 bg-primary/5 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
        <span className="font-medium text-primary">Prototype:</span> your API key stays in this browser and is sent only to OpenAI. Browser-side keys are fine for this demo only — don't use a production key.
      </p>

      <section className="flex flex-col items-center pt-14 pb-12">
        <div className="relative grid place-items-center">
          {phase === "recording" && (
            <>
              <span className="absolute h-44 w-44 rounded-full bg-primary/40 animate-pulse-ring" />
              <span className="absolute h-44 w-44 rounded-full bg-primary/30 animate-pulse-ring [animation-delay:0.9s]" />
            </>
          )}
          <button
            onClick={phase === "recording" ? stop : start}
            disabled={busy || phase === "clarify"}
            aria-label={phase === "recording" ? "Stop recording" : "Record a memory"}
            className="relative grid h-44 w-44 place-items-center rounded-full bg-primary text-primary-foreground shadow-record transition active:scale-95 disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-10 w-10 animate-spin" /> : phase === "recording" ? (
              <span className="flex flex-col items-center gap-2"><Square className="h-9 w-9 fill-current" /><span className="text-sm font-medium">Stop</span></span>
            ) : (
              <span className="flex flex-col items-center gap-2"><Mic className="h-10 w-10" /><span className="text-sm font-medium">Record a memory</span></span>
            )}
          </button>
        </div>

        <div className="mt-8 flex h-10 items-center gap-[3px]" aria-hidden>
          {levels.map((l, i) => (
            <span key={i} className="w-[3px] rounded-full bg-primary transition-[height] duration-75" style={{ height: `${Math.round(l * 40)}px`, opacity: phase === "recording" ? 1 : 0.2 }} />
          ))}
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          {statusText[phase]} {phase === "recording" && <span className="ml-1 font-mono text-foreground">{mmss}</span>}
        </p>

        {phase === "clarify" && pending && (
          <div className="mt-5 w-full animate-in fade-in rounded-2xl border bg-card p-4">
            <div className="grid gap-2">
              {pending.result.candidateMemoryIds.map((id) => {
                const m = memories.find((x) => x.id === id);
                return m ? (
                  <button key={id} onClick={() => think(pending.transcript, id)} className="min-h-12 rounded-xl bg-secondary px-4 text-left text-sm hover:bg-accent">
                    {m.title}
                  </button>
                ) : null;
              })}
              <button onClick={() => { setPending(null); setPhase("idle"); }} className="min-h-10 text-xs text-muted-foreground">Cancel</button>
            </div>
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-4 text-xs uppercase tracking-[0.2em] text-muted-foreground">Your memories</h2>
        {memories.length === 0 ? (
          <p className="rounded-3xl border border-dashed p-8 text-center text-sm text-muted-foreground">Nothing yet. Record your first memory.</p>
        ) : (
          <div className="grid gap-4">
            {memories.map((m) => (
              <MemoryCard
                key={m.id + m.updatedAt}
                memory={m}
                onDelete={() => persist(memories.filter((x) => x.id !== m.id))}
                onDone={() => persist([convertWishlist(m), ...memories.filter((x) => x.id !== m.id)])}
                onLog={(value) => update(m.id, (x) => ({
                  ...x,
                  answers: [
                    ...x.answers.filter((a) => a.label.toLowerCase() !== x.answerLabel.toLowerCase()),
                    { label: x.answerLabel, question: x.followUpQuestion, value, at: new Date().toISOString() },
                  ],
                  followUpQuestion: "",
                  suggestedAnswers: [],
                  ...(x.category === "WISHLIST" && /why/i.test(x.followUpQuestion) && !x.why ? { why: value } : {}),
                  updatedAt: new Date().toISOString(),
                }))}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
