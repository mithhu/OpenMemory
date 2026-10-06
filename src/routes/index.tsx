import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { KeyRound, Loader2, SendHorizontal } from "lucide-react";
import {
  type Memory, type AstraResult, loadMemories, saveMemories, loadKey, saveKey,
  askAstra, applyResult, convertWishlist,
} from "@/lib/echo";
import { MemoryCard } from "@/components/MemoryCard";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "OpenMemory — Memories that ask the right question" },
      { name: "description", content: "Jot down something you want to remember. OpenMemory turns it into a memory card and asks one smart follow-up." },
      { property: "og:title", content: "OpenMemory — Memories" },
      { property: "og:description", content: "Write naturally. OpenMemory remembers, and never asks what it already knows." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

type Phase = "idle" | "thinking" | "saving" | "clarify";

function Index() {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [apiKey, setApiKey] = useState("");
  const [keyDraft, setKeyDraft] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState<{ text: string; result: AstraResult } | null>(null);

  useEffect(() => {
    setMemories(loadMemories());
    setApiKey(loadKey());
  }, []);

  const persist = (next: Memory[]) => { setMemories(next); saveMemories(next); };

  const think = async (text: string, forcedId?: string) => {
    try {
      setPhase("thinking");
      const current = loadMemories();
      const result = await askAstra(text, current, apiKey, forcedId);
      if (result.action === "clarify" && !forcedId) {
        const cands = result.candidateMemoryIds.filter((id) => current.some((m) => m.id === id));
        if (cands.length > 1) {
          setPending({ text, result: { ...result, candidateMemoryIds: cands } });
          setPhase("clarify");
          return;
        }
        if (cands.length === 1) return think(text, cands[0]);
        throw new Error("Clarification without candidates");
      }
      setPhase("saving");
      persist(applyResult(current, result, text));
      toast.success(result.action === "update" ? `Updated “${result.title}”` : "Memory saved");
    } catch (e) {
      console.error("Astra failed:", e instanceof Error ? e.message : e);
      toast.error("Couldn't understand this memory. Please try again.");
    }
    setPending(null);
    setPhase("idle");
  };

  const submit = () => {
    const text = draft.trim();
    if (!text) return;
    if (!apiKey) { toast.error("Add your OpenAI API key to log a memory."); return; }
    setDraft("");
    void think(text);
  };

  const busy = phase === "thinking" || phase === "saving";
  const statusText: Record<Phase, string> = {
    idle: apiKey ? "Type a memory and press Remember" : "Add your OpenAI API key to remember something.",
    thinking: "OpenMemory is thinking...",
    saving: "Saving memory...",
    clarify: pending?.result.clarificationQuestion || "Which one do you mean?",
  };

  const update = (id: string, fn: (m: Memory) => Memory) =>
    persist(memories.map((m) => (m.id === id ? fn(m) : m)));

  return (
    <div className="mx-auto min-h-screen max-w-xl px-5 pb-24">
      <header className="flex items-start justify-between gap-4 pt-6">
        <h1 className="font-display text-4xl leading-none">OpenMemory</h1>
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

      <section className="flex flex-col items-center pt-10 pb-12">
        <div className="mb-5 text-center">
          <h2 className="font-display text-3xl leading-none">OpenMemory</h2>
          <p className="mt-2 text-sm text-muted-foreground">Remember more. Write less.</p>
        </div>
        <form
          onSubmit={(e) => { e.preventDefault(); submit(); }}
          className="w-full rounded-2xl border bg-card p-3 shadow-record"
        >
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }}
            placeholder="What do you want to remember?"
            rows={3}
            disabled={busy || phase === "clarify"}
            className="w-full resize-none bg-transparent px-2 py-1 text-[15px] leading-relaxed outline-none placeholder:text-muted-foreground disabled:opacity-50"
          />
          <div className="flex items-center justify-between gap-3 pt-1">
            <p className="px-2 text-xs text-muted-foreground">{statusText[phase]}</p>
            <button
              type="submit"
              disabled={busy || phase === "clarify" || !draft.trim()}
              className="flex min-h-11 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-medium text-primary-foreground transition active:scale-95 disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <SendHorizontal className="h-4 w-4" />}
              Remember →
            </button>
          </div>
        </form>

        {phase === "clarify" && pending && (
          <div className="mt-5 w-full animate-in fade-in rounded-2xl border bg-card p-4">
            <div className="grid gap-2">
              {pending.result.candidateMemoryIds.map((id) => {
                const m = memories.find((x) => x.id === id);
                return m ? (
                  <button key={id} onClick={() => think(pending.text, id)} className="min-h-12 rounded-xl bg-secondary px-4 text-left text-sm hover:bg-accent">
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
          <p className="rounded-3xl border border-dashed p-8 text-center text-sm text-muted-foreground">Nothing yet. Log your first memory.</p>
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
                  ...(x.answerLabel.toLowerCase() === "title" ? { title: value } : {}),
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
