import { DemoWelcome } from "@/components/DemoWelcome";
import { RemindersPanel } from "@/components/RemindersPanel";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronRight,
  Compass,
  FileUp,
  GitBranch,
  Loader2,
  Library,
  LayoutDashboard,
  Settings2,
  LockKeyhole,
  Menu,
  MessageCircle,
  NotebookPen,
  Orbit,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useIsMobile } from "@/hooks/use-mobile";
import { useMemoryGraph } from "@/hooks/use-memory-graph";
import { getAstraStatus } from "@/lib/astra";
import { captureWithLocalMlx } from "@/lib/local-mlx";
import { captureWithLocalOllama } from "@/lib/local-ollama";
import {
  planWithProvider,
  connectWithProvider,
  loadAISettings,
  hasHostedAIConsent,
  saveAISettings,
  defaultAISettings,
  type AISettings,
} from "@/lib/ai-client";
import {
  applyCapturePlan,
  importRecall,
  type CapturePlan,
  type UnquantifiedProgressReview,
  type CompletionReview,
} from "@/lib/capture-plan";
import {
  assertClassificationReview,
  type ClassificationMetadata,
  type ClassificationReviewDecision,
} from "@/lib/classification";
import { applyActivity, type ActivityCommand } from "@/lib/activity";
import {
  readVault,
  readRawVault,
  saveVault,
  openEnvelope,
  setVaultSession,
  encryptVault,
  saveRestoredVault,
  lockVault,
  clearPrivateCaches,
  type VaultEnvelope,
} from "@/lib/vault";
import { VoiceCapture } from "@/components/VoiceCapture";
import { CaptureReview } from "@/components/CaptureReview";
import { LifeDashboard, LifeHero } from "@/components/LifeDashboard";
import { PrivacyPanel, VaultUnlock } from "@/components/PrivacyPanel";
import { DiscoverPanel } from "@/components/DiscoverPanel";
import { isHostedApp } from "@/lib/app-environment";
import { activityCategories } from "@/lib/activity";
import { type Recommendation } from "@/lib/discovery";
import {
  categoryMeta,
  CATEGORIES,
  demoMemories,
  exampleSynthesis,
  fingerprint,
  loadMemories,
  loadSynthesis,
  logAnswer,
  recordAction,
  memorySchema,
  saveSynthesis,
  today,
  type Category,
  type Memory,
  type SavedSynthesis,
  type SuggestedAction,
} from "@/lib/memory";
import { MemoryMap, CategoryLegend } from "@/components/MemoryMap";
import { categoryIcons } from "@/components/memory-icons";
import { MemoryCard } from "@/components/MemoryCard";
import { ActionCard, InsightCard, InsightPanel, Sources } from "@/components/InsightPanel";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "OpenMemory — Connect the dots in your life" },
      {
        name: "description",
        content:
          "A memory companion that notices what matters. Capture a thought, find the hidden threads, and turn remembering into understanding. Powered by OpenAI.",
      },
      { property: "og:title", content: "OpenMemory — Everything is connected" },
      {
        property: "og:description",
        content: "Your memories are more than moments. See the bigger picture.",
      },
    ],
  }),
  component: OpenMemory,
});
type View = "today" | "library" | "constellation" | "journal" | "ask";
type Task = "capture" | "connect" | "ask" | "discover" | null;
const prompts = [
  "What am I missing?",
  "What should I make time for this week?",
  "What gives me energy?",
  "Where do my intentions and actions disagree?",
];

function OpenMemory() {
  const isMobile = useIsMobile();
  const [memories, setMemories] = useState<Memory[]>([]);
  const memoryRef = useRef<Memory[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [storageError, setStorageError] = useState("");
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [view, setView] = useState<View>("today");
  const [draft, setDraft] = useState("");
  const [captureError, setCaptureError] = useState("");
  const [captureReceipt, setCaptureReceipt] = useState<{ count: number; ids: string[] } | null>(
    null,
  );
  const captureStatusRef = useRef<HTMLElement>(null);
  const savedStatusRef = useRef<HTMLHeadingElement>(null);
  const [question, setQuestion] = useState("");
  const [askedQuestion, setAskedQuestion] = useState("");
  const [synthesis, setSynthesis] = useState<SavedSynthesis | null>(null);
  const [answer, setAnswer] = useState<SavedSynthesis | null>(null);
  const [task, setTask] = useState<Task>(null);
  const requestLock = useRef(false);
  const captureController = useRef<AbortController | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [pending, setPending] = useState<{
    text: string;
    plan: CapturePlan;
    classification?: ClassificationMetadata;
  } | null>(null);
  const [settings, setSettings] = useState<AISettings>(defaultAISettings);
  const [hosted, setHosted] = useState(false);
  const [consentRequired, setConsentRequired] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [encrypted, setEncrypted] = useState(false);
  const [locked, setLocked] = useState(false);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [encryptedImport, setEncryptedImport] = useState<VaultEnvelope | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [highlightedIds, setHighlightedIds] = useState<string[]>([]);
  const [category, setCategory] = useState<Category | "ALL">("ALL");
  const [search, setSearch] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [doneActions, setDoneActions] = useState<string[]>([]);
  const importRef = useRef<HTMLInputElement>(null);
  const [voiceActive, setVoiceActive] = useState(false);
  const busy = task !== null || saving || voiceActive;
  const {
    graph,
    mapping,
    stale: mapStale,
    error: mapError,
    retry: retryMap,
  } = useMemoryGraph(memories, {
    loaded,
    enabled:
      !consentRequired &&
      (settings.provider === "ollama" || configured === true) &&
      !storageError &&
      !locked,
    settings,
    paused: busy || Boolean(pending) || privacyOpen || view !== "constellation",
  });

  const installWorkspace = (saved: Memory[]) => {
    memoryRef.current = saved;
    setMemories(saved);
    setSynthesis(
      loadSynthesis() ??
        (saved.some((m) => m.id === "demo-morning") ? exampleSynthesis(saved) : null),
    );
    setDoneActions(
      saved
        .filter((m) => m.completionStatus === "completed" && m.completionFor)
        .map((m) => m.completionFor!),
    );
    setLoaded(true);
    setLocked(false);
  };
  useEffect(() => {
    let cancelled = false;
    setSettings(loadAISettings());
    setHosted(isHostedApp());
    setConsentRequired(isHostedApp() && !hasHostedAIConsent());
    void (async () => {
      try {
        const envelope = await readVault();
        if (cancelled) return;
        if (envelope?.encrypted) {
          lockVault();
          setEncrypted(true);
          setLocked(true);
          return;
        }
        const session = envelope ? await openEnvelope(envelope) : null;
        const saved = session
          ? memorySchema.array().max(200).parse(session.data)
          : loadMemories(!isHostedApp());
        if (cancelled) return;
        setVaultSession(session ?? { key: null, salt: null });
        if (!envelope) {
          await saveVault(saved);
          // Migration is durable before the legacy copy is removed.
          localStorage.removeItem("echo.memories.v1");
        }
        if (!cancelled) installWorkspace(saved);
      } catch (error) {
        if (!cancelled) {
          setStorageError(
            error instanceof Error ? error.message : "Browser storage is unavailable.",
          );
          setLoaded(true);
        }
      }
    })();
    void getAstraStatus()
      .then((status) => {
        if (!cancelled) setConfigured(status.configured);
      })
      .catch(() => {
        if (!cancelled) setConfigured(false);
      });
    return () => {
      cancelled = true;
      captureController.current?.abort();
      captureController.current = null;
    };
  }, []);
  useEffect(() => {
    if (!busy) {
      setElapsed(0);
      return;
    }
    const timer = window.setInterval(() => setElapsed((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [busy]);
  useEffect(() => {
    if (task !== "capture") return;
    const region = captureStatusRef.current;
    region?.focus({ preventScroll: true });
    region?.scrollIntoView?.({ block: "nearest", behavior: "auto" });
  }, [task]);
  useEffect(() => {
    if (!captureReceipt) return;
    savedStatusRef.current?.focus({ preventScroll: true });
    savedStatusRef.current?.scrollIntoView?.({ block: "nearest", behavior: "auto" });
  }, [captureReceipt]);
  useEffect(() => {
    if (draft.trim()) setCaptureReceipt(null);
  }, [draft]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelectedId(null);
        setMenuOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    if (selectedId || menuOpen) document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [selectedId, menuOpen]);

  const persist = async (next: Memory[]) => {
    if (savingRef.current || locked || storageError) return false;
    savingRef.current = true;
    setSaving(true);
    try {
      const validated = memorySchema.array().max(200).parse(next);
      await saveVault(validated);
      memoryRef.current = validated;
      setMemories(validated);
      return true;
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Couldn't save to this browser. Export a backup and try again.",
      );
      return false;
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };
  const showError = (error: unknown) =>
    toast.error(
      error instanceof Error ? error.message : "Something went wrong. Please try again.",
      { duration: 8000 },
    );
  const ensureReady = () => {
    if (consentRequired) {
      toast.error("Enable AI review first, or review your note manually.");
      return false;
    }
    if (storageError) {
      toast.error("Resolve the saved-memory issue before making changes.");
      return false;
    }
    if (configured === false && settings.provider === "astra") {
      toast.error(
        "AI review is unavailable right now. Your words are still here; review and save manually.",
      );
      return false;
    }
    return loaded && !locked && !savingRef.current && !requestLock.current;
  };
  const capture = async (text: string) => {
    if (consentRequired || (settings.provider === "astra" && configured === false)) {
      reviewManually();
      return;
    }
    if (!ensureReady() || !text.trim()) return;
    requestLock.current = true;
    const controller = new AbortController();
    captureController.current = controller;
    setCaptureError("");
    setCaptureReceipt(null);
    setTask("capture");
    try {
      const input = { text, today: today(), memories: memoryRef.current };
      const result =
        settings.provider === "ollama" && settings.captureEngine !== "ollama"
          ? await captureWithLocalMlx(input, controller.signal, hosted)
          : settings.provider === "ollama"
            ? await captureWithLocalOllama(input, settings, controller.signal)
            : { plan: await planWithProvider(input, settings, controller.signal) };
      if (controller.signal.aborted || captureController.current !== controller) return;
      setPending({ text, ...result });
    } catch (error) {
      if (!controller.signal.aborted && captureController.current === controller)
        setCaptureError(
          error instanceof Error && error.name !== "ZodError"
            ? error.message
            : "The model returned an incomplete review. Your words are still here. Review manually or try again.",
        );
    } finally {
      if (captureController.current === controller) {
        captureController.current = null;
        requestLock.current = false;
        setTask(null);
      }
    }
  };
  const stopCapture = () => {
    captureController.current?.abort();
    captureController.current = null;
    requestLock.current = false;
    setTask(null);
  };
  const reviewManually = () => {
    if (
      !loaded ||
      locked ||
      saving ||
      voiceActive ||
      (task !== null && task !== "capture") ||
      storageError ||
      !draft.trim()
    )
      return;
    if (task === "capture") stopCapture();
    setCaptureError("");
    setCaptureReceipt(null);
    setPending({
      text: draft,
      plan: {
        entries: [
          {
            title: draft.trim().slice(0, 100),
            summary: draft.trim().slice(0, 12000),
            category: "NOTE",
            date: today(),
            matchedMemoryId: null,
            candidateMemoryIds: [],
            clarificationQuestion:
              "Choose the type and title for this entry. You can save without an AI request.",
            tags: [],
            activity: null,
          },
        ],
      },
    });
  };
  const confirmCapture = async (
    plan: CapturePlan,
    classificationReview?: ClassificationReviewDecision,
    progressReview?: UnquantifiedProgressReview,
    completionReview?: CompletionReview,
  ) => {
    if (!pending) return false;
    try {
      assertClassificationReview(plan, pending.text, pending.classification, classificationReview);
      const previous = memoryRef.current;
      const next = applyCapturePlan(previous, plan, pending.text, progressReview, completionReview);
      const changedIds = next
        .filter((memory) => !previous.includes(memory))
        .map((memory) => memory.id);
      if (!(await persist(next))) return false;
      setDraft("");
      setPending(null);
      setCaptureReceipt({ count: plan.entries.length, ids: changedIds });
      toast.success(
        `${plan.entries.length} ${plan.entries.length === 1 ? "entry" : "entries"} remembered, just as you confirmed.`,
      );
      return true;
    } catch (error) {
      showError(error);
      return false;
    }
  };
  const generate = async (query = "", asking = false) => {
    if (!ensureReady()) return;
    if (!memoryRef.current.length) {
      toast.error("Add a few memories first, or explore the demo story.");
      return;
    }
    requestLock.current = true;
    setTask(asking ? "ask" : "connect");
    const snapshot = [...memoryRef.current];
    try {
      const result = await connectWithProvider(
        { memories: snapshot, today: today(), question: query },
        settings,
      );
      const saved: SavedSynthesis = {
        result,
        fingerprint: fingerprint(snapshot),
        generatedAt: new Date().toISOString(),
        mode: "live",
        provider: settings.provider,
      };
      if (asking) {
        setAnswer(saved);
        setAskedQuestion(query);
        setQuestion("");
      } else {
        setSynthesis(saved);
        try {
          saveSynthesis(saved);
        } catch {
          toast.warning("Your briefing is ready, but couldn't be saved to this browser.");
        }
      }
      toast.success(
        asking
          ? "An answer from your own life."
          : `${result.connections.length} connections. A new way to see things.`,
      );
    } catch (error) {
      showError(error);
    } finally {
      requestLock.current = false;
      setTask(null);
    }
  };
  const updateMemory = (id: string, update: (memory: Memory) => Memory) =>
    persist(memoryRef.current.map((m) => (m.id === id ? update(m) : m)));
  const deleteMemory = async (id: string) => {
    if (await persist(memoryRef.current.filter((m) => m.id !== id))) {
      setSelectedId(null);
      toast.success("Memory removed.");
    }
  };
  const completeWishlist = async (id: string) => {
    await updateMemory(id, (m) => ({
      ...m,
      category: /watch|film|movie/i.test(m.summary) ? "MOVIE" : "NOTE",
      date: today(),
      summary: `Completed: ${m.summary}`,
      followUpQuestion: "What do you want to remember about the experience?",
      answerLabel: "Reflection",
      suggestedAnswers: [],
      updatedAt: new Date().toISOString(),
    }));
    toast.success("From someday to a memory.");
  };
  const toggleAction = async (action: SuggestedAction) => {
    if (busy || storageError) return;
    const title = action.title;
    const completed = !doneActions.includes(title);
    if (
      memoryRef.current.length >= 200 &&
      !memoryRef.current.some((m) => m.completionFor === title)
    ) {
      toast.error("This demo supports 200 memories. Export a backup before making room.");
      return;
    }
    const next = doneActions.includes(title)
      ? doneActions.filter((s) => s !== title)
      : [...doneActions, title];
    if (!(await persist(recordAction(memoryRef.current, action, completed)))) return;
    setDoneActions(next);
    toast.success(
      completed
        ? "A next step became a memory. OpenAI can learn from it."
        : "Step reopened. Your memory reflects the change.",
    );
  };
  const addDemo = async () => {
    if (!loaded || busy || storageError) return;
    const existing = memoryRef.current;
    const additions = demoMemories().filter((m) => !existing.some((item) => item.id === m.id));
    if (existing.length + additions.length > 200) {
      toast.error("There's no room for the ten demo memories. Export a backup first.");
      return;
    }
    const next = [...additions, ...existing];
    if (await persist(next)) {
      const example = exampleSynthesis(next);
      setSynthesis(example);
      setView("constellation");
      setMenuOpen(false);
      try {
        saveSynthesis(example);
      } catch {
        /* The current preview remains available. */
      }
      toast.success(
        additions.length
          ? "Demo story added alongside your memories."
          : "You're exploring the demo story. Find the threads to hear from OpenAI.",
      );
    }
  };
  const exportMemories = async () => {
    if (savingRef.current) return;
    if (storageError) {
      try {
        const raw = await readRawVault();
        const legacy = localStorage.getItem("echo.memories.v1");
        if (raw === null && !legacy)
          throw new Error("The saved data is unavailable. No empty backup was generated.");
        downloadBackup(
          raw === null ? legacy! : JSON.stringify(raw),
          `openmemory-recovery-${today()}.json`,
        );
      } catch (error) {
        showError(error);
      }
      return;
    }
    if (encrypted || locked) {
      try {
        const envelope = await readVault();
        if (!envelope) throw new Error("No saved vault found.");
        downloadBackup(JSON.stringify(envelope), `openmemory-encrypted-${today()}.json`);
        toast.success("Encrypted backup exported. Keep your passphrase to restore it.");
      } catch (error) {
        showError(error);
      }
      return;
    }
    const raw = JSON.stringify(
      { version: 1, exportedAt: new Date().toISOString(), memories: memoryRef.current },
      null,
      2,
    );
    downloadBackup(raw, `openmemory-${today()}.json`);
    toast.success("Your memories, to keep.");
  };
  const importMemories = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || busy) return;
    if (file.size > 2000000) {
      toast.error("Choose a text or JSON file smaller than 2 MB.");
      return;
    }
    try {
      const text = await file.text();
      if (/\.json$/i.test(file.name)) {
        const data: unknown = JSON.parse(text);
        if (data && typeof data === "object" && "encrypted" in data && data.encrypted === true) {
          setEncryptedImport(data as VaultEnvelope);
          return;
        }
        const raw = Array.isArray(data)
          ? data
          : data && typeof data === "object" && "memories" in data
            ? data.memories
            : null;
        const isRecall =
          data &&
          typeof data === "object" &&
          ["courses", "movies", "books", "music", "logs"].some((key) => key in data);
        if (!Array.isArray(raw) && !isRecall)
          throw new Error("Choose an OpenMemory or Recall JSON export.");
        const imported = Array.isArray(raw)
          ? raw.map((m: unknown) => memorySchema.parse(m))
          : importRecall(data);
        const additions = imported.filter(
          (m) => !memoryRef.current.some((current) => current.id === m.id),
        );
        const unique = [
          ...new Map([...memoryRef.current, ...additions].map((m) => [m.id, m])).values(),
        ];
        const addedCount = unique.length - memoryRef.current.length;
        if (unique.length > 200) throw new Error("This demo supports up to 200 memories.");
        if (storageError)
          throw new Error(
            "Export your saved data first. This file can't overwrite unreadable memories.",
          );
        if (await persist(unique))
          toast.success(`${addedCount} memories imported. Existing memories kept.`);
      } else {
        if (text.length > 16000) throw new Error("Keep each text import under 16,000 characters.");
        setCaptureError("");
        setDraft(text.trim());
        setView("constellation");
        toast.success("Text added to the composer. Review it, then remember it.");
      }
    } catch (error) {
      showError(error);
    }
  };
  const updateActivity = async (id: string, command: ActivityCommand, text: string) => {
    try {
      const memory = memoryRef.current.find((m) => m.id === id);
      if (!memory?.activity) throw new Error("That item was removed. Please try again.");
      const next = {
        ...memory,
        // This callback receives a deliberately submitted manual activity form,
        // never a model extraction. Unknown amounts preserve existing counts.
        activity: applyActivity(memory.activity, command, today(), text, {
          allowUnquantifiedProgress: true,
        }),
        date: today(),
        updatedAt: new Date().toISOString(),
      };
      const saved = await updateMemory(id, () => next);
      if (saved) toast.success("Progress remembered.");
      return saved;
    } catch (error) {
      showError(error);
      return false;
    }
  };
  const saveRecommendation = async (suggestion: Recommendation) => {
    try {
      const entry = {
        title: suggestion.title,
        category: activityCategories[suggestion.kind],
        date: today(),
        summary: `Added ${suggestion.title} to my wishlist. Recommendation: ${suggestion.reason}`,
        tags: [],
        matchedMemoryId: null,
        candidateMemoryIds: [],
        clarificationQuestion: null,
        activity: {
          kind: suggestion.kind,
          intent: "wishlist" as const,
          progress: null,
          progressMode: "absolute" as const,
          total: null,
          lessonNumbers: [],
          sentiment: null,
          creator: suggestion.creator,
        },
      };
      const next = applyCapturePlan(
        memoryRef.current,
        { entries: [entry] },
        `I added ${suggestion.title} to my wishlist.`,
      );
      next[0]!.relatedMemoryIds = suggestion.memoryIds.filter((id) =>
        memoryRef.current.some((m) => m.id === id),
      );
      if (!(await persist(next))) return false;
      toast.success("Added to your wishlist.");
      return true;
    } catch (error) {
      showError(error);
      return false;
    }
  };
  const changeSettings = (next: AISettings) => {
    try {
      saveAISettings(next);
      setSettings({ ...next, model: next.model || "astra" });
      setConsentRequired(false);
      toast.success(
        next.provider === "ollama"
          ? "Local mode selected. No OpenAI fallback."
          : "OpenAI selected. Requests use cloud reasoning.",
      );
    } catch (error) {
      showError(error);
    }
  };
  const unlock = async (passphrase: string) => {
    const envelope = await readVault();
    if (!envelope) throw new Error("Your vault could not be found.");
    const session = await openEnvelope(envelope, passphrase);
    const saved = memorySchema.array().max(200).parse(session.data);
    setVaultSession(session);
    clearPrivateCaches();
    installWorkspace(saved);
  };
  const downloadBackup = (raw: string, name: string) => {
    const url = URL.createObjectURL(new Blob([raw], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    link.click();
    URL.revokeObjectURL(url);
  };
  const navigate = (next: View) => {
    if (voiceActive) {
      toast.message("Finish or discard your voice note before changing views.");
      return;
    }
    setView(next);
    setMenuOpen(false);
    setHighlightedIds([]);
  };
  const selected = memories.find((m) => m.id === selectedId);
  const currentFingerprint = fingerprint(memories);
  const stale = Boolean(synthesis && synthesis.fingerprint !== currentFingerprint);
  const connections = (graph?.connections ?? synthesis?.result.connections ?? []).filter(
    (c) => memories.some((m) => m.id === c.from) && memories.some((m) => m.id === c.to),
  );
  const categories = CATEGORIES.filter((cat) => memories.some((m) => m.category === cat));
  const filtered = memories.filter(
    (m) =>
      (category === "ALL" || m.category === category) &&
      `${m.title} ${m.summary} ${m.tags?.join(" ") || ""} ${m.answers.map((a) => a.value).join(" ")}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const statusText = voiceActive
    ? "Voice note in progress. Check the transcript before saving."
    : task === "capture"
      ? "Finding a place for your thought…"
      : task === "discover"
        ? "Finding something you might love…"
        : saving
          ? "Saving on this device…"
          : elapsed < 5
            ? "Reading across your memories…"
            : elapsed < 15
              ? "Looking for the threads between them…"
              : "Giving the bigger picture a little thought…";

  if (locked) return <VaultUnlock onUnlock={unlock} onExport={() => void exportMemories()} />;
  if (!loaded)
    return (
      <div className="vault-unlock">
        <Orbit size={36} />
        <h1>Opening your space…</h1>
      </div>
    );
  if (encryptedImport)
    return (
      <VaultUnlock
        title="Restore your encrypted backup."
        description={
          encrypted
            ? "Enter the backup’s passphrase. New memories will be added alongside your existing ones."
            : "Enter the backup’s passphrase. Your merged workspace will be encrypted with this passphrase; existing memories will be kept."
        }
        onCancel={() => setEncryptedImport(null)}
        onUnlock={async (passphrase) => {
          const session = await openEnvelope(encryptedImport, passphrase);
          const imported = memorySchema.array().max(200).parse(session.data);
          const next = [
            ...memoryRef.current,
            ...imported.filter((m) => !memoryRef.current.some((old) => old.id === m.id)),
          ];
          if (savingRef.current || storageError)
            throw new Error("Resolve the saved-memory issue before restoring this backup.");
          const validated = memorySchema.array().max(200).parse(next);
          savingRef.current = true;
          setSaving(true);
          try {
            await saveRestoredVault(validated, passphrase);
            memoryRef.current = validated;
            setMemories(validated);
            setEncrypted(true);
          } finally {
            savingRef.current = false;
            setSaving(false);
          }
          setEncryptedImport(null);
          toast.success("Backup restored. Existing memories kept.");
        }}
      />
    );
  return (
    <div className="app-shell">
      <aside
        className={`sidebar ${menuOpen ? "mobile-open" : ""}`}
        inert={Boolean(selectedId) || (isMobile && !menuOpen)}
      >
        <button className="brand" onClick={() => navigate("today")} aria-label="OpenMemory home">
          <span className="brand-mark">
            <Orbit size={23} strokeWidth={1.5} />
          </span>
          <span>
            OpenMemory
            <i />
          </span>
        </button>
        <div className="sidebar-label">YOUR SPACE</div>
        <nav className="main-nav" aria-label="Main navigation">
          <button
            aria-current={view === "today" ? "page" : undefined}
            className={view === "today" ? "active" : ""}
            onClick={() => navigate("today")}
          >
            <LayoutDashboard size={18} />
            Today
            <span className="nav-dot" />
          </button>
          <button
            aria-current={view === "library" ? "page" : undefined}
            className={view === "library" ? "active" : ""}
            onClick={() => navigate("library")}
          >
            <Library size={18} />
            Your library
            <span className="nav-count">{memories.filter((m) => m.activity).length}</span>
          </button>
          <button
            aria-current={view === "constellation" ? "page" : undefined}
            className={view === "constellation" ? "active" : ""}
            onClick={() => navigate("constellation")}
          >
            <Orbit size={18} />
            Constellation
            <span className="nav-dot" />
          </button>
          <button
            aria-current={view === "journal" ? "page" : undefined}
            className={view === "journal" ? "active" : ""}
            onClick={() => navigate("journal")}
          >
            <NotebookPen size={18} />
            Your memories<span className="nav-count">{memories.length}</span>
          </button>
          <button
            aria-current={view === "ask" ? "page" : undefined}
            className={view === "ask" ? "active" : ""}
            onClick={() => navigate("ask")}
          >
            <MessageCircle size={18} />
            Ask your memory
            <ArrowUpRight size={13} className="nav-arrow" />
          </button>
        </nav>
        <div className="sidebar-divider" />
        <div className="sidebar-label">COLLECTIONS</div>
        <div className="topic-list">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => {
                setCategory(cat);
                navigate("journal");
              }}
            >
              <span className="topic-dot" style={{ background: categoryMeta[cat].color }} />
              {categoryMeta[cat].label}
              <span>{memories.filter((m) => m.category === cat).length}</span>
            </button>
          ))}
        </div>
        <div className="sidebar-bottom">
          <div className="demo-invite" hidden={memories.length > 0}>
            <span className="demo-icon">
              <Compass size={19} strokeWidth={1.5} />
            </span>
            <h3>Start with a little story.</h3>
            <p>Explore ten moments. See what happens when they connect.</p>
            <button onClick={addDemo} disabled={busy || !loaded || Boolean(storageError)}>
              Explore the demo
              <ArrowRight size={13} />
            </button>
          </div>
          <div className="sidebar-tools">
            <button onClick={exportMemories} disabled={!loaded} title="Export memories">
              <ArrowDownToLine size={14} />
              Export
            </button>
            <button
              onClick={() => importRef.current?.click()}
              disabled={busy || !loaded}
              title="Import JSON, text, or Markdown"
            >
              <FileUp size={14} />
              Import
            </button>
          </div>
          <button className="privacy-nav" onClick={() => setPrivacyOpen(true)}>
            <Settings2 size={14} />
            Privacy & AI
          </button>
          <div
            className="local-note"
            title={
              settings.provider === "ollama"
                ? "AI requests go to local Ollama. No OpenAI fallback."
                : "Saved on this device. Relevant memories are sent to OpenAI for AI requests."
            }
          >
            <LockKeyhole size={12} />
            {encrypted ? "Encrypted in this browser." : "Saved on this device."}
          </div>
        </div>
      </aside>
      {menuOpen && (
        <button
          className="mobile-nav-backdrop"
          aria-label="Close menu"
          onClick={() => setMenuOpen(false)}
        />
      )}
      <div className="main-shell" inert={Boolean(selectedId) || (isMobile && menuOpen)}>
        <header className="topbar">
          <div className="topbar-location">
            <button
              className="mobile-menu-button"
              aria-label="Open navigation"
              onClick={() => setMenuOpen(true)}
            >
              <Menu size={20} />
            </button>
            <span>Your space</span>
            <ChevronRight size={12} />
            <span>
              {view === "today"
                ? "Today"
                : view === "library"
                  ? "Your library"
                  : view === "constellation"
                    ? "Constellation"
                    : view === "journal"
                      ? "Your memories"
                      : "Ask your memory"}
            </span>
          </div>
          <div className="topbar-right">
            <DemoWelcome
              ready={
                loaded &&
                !locked &&
                !storageError &&
                !busy &&
                !pending &&
                !privacyOpen &&
                !selectedId &&
                !menuOpen
              }
            />
            <span className={`astra-status ${configured === false ? "unconfigured" : ""}`}>
              <i />
              {consentRequired
                ? "Manual mode"
                : settings.provider === "ollama" && settings.captureEngine !== "ollama"
                  ? "Local MLX"
                  : settings.provider === "ollama"
                    ? "Local Ollama"
                    : configured === null
                      ? "Connecting…"
                      : configured
                        ? "OpenAI enabled"
                        : "AI unavailable"}
            </span>
            <button
              className="profile-orb"
              aria-label="Open privacy and AI settings"
              onClick={() => setPrivacyOpen(true)}
            >
              You
            </button>
          </div>
        </header>
        <main className="workspace">
          {loaded && !locked && consentRequired && (
            <section className="hosted-welcome" aria-label="Choose AI processing">
              <span className="eyebrow">YOUR MEMORIES, YOUR CHOICE</span>
              <h2>A little help making sense of your day.</h2>
              <p>
                Save memories in this browser. Enable OpenAI to turn your words into suggestions you
                can review. AI features send your note and relevant library context to OpenAI. No
                installation or API key needed.
              </p>
              <p>
                Voice is optional: audio goes to ElevenLabs only when you choose Transcribe. You can
                also review and save notes manually.
              </p>
              <button
                className="remember-button"
                disabled={busy || configured !== true}
                onClick={() => changeSettings({ provider: "astra", model: "astra" })}
              >
                Enable AI review
              </button>
              {configured === false && (
                <p role="status">
                  AI review is temporarily unavailable. You can still save manually.
                </p>
              )}
            </section>
          )}
          {settings.provider === "ollama" && settings.captureEngine !== "ollama" && (
            <div className="setup-banner" role="status">
              <ShieldCheck size={17} />
              <span>
                Local-first · fine-tuned MLX classification with local Qwen extraction. Review
                suggestions before saving.
              </span>
            </div>
          )}
          {storageError && (
            <div className="setup-banner" role="alert">
              <ShieldCheck size={17} />
              <span>{storageError}</span>
              <button onClick={exportMemories}>Export backup</button>
            </div>
          )}
          {configured === false && settings.provider === "astra" && (
            <div className="setup-banner">
              <ShieldCheck size={17} />
              <span>
                AI review is unavailable right now. You can still review and save your notes
                manually.
              </span>
              <button onClick={() => setPrivacyOpen(true)}>Choose AI</button>
            </div>
          )}
          {(view === "constellation" || view === "today" || view === "library") && (
            <>
              {view === "constellation" && (
                <section className="hero">
                  <div className="hero-eyebrow">
                    <span className="little-star">✦</span> EVERY MOMENT HAS A THREAD
                  </div>
                  <h1>
                    A little less scattered.
                    <br />A lot more <em>connected.</em>
                  </h1>
                  <p>
                    Your thoughts, experiences, and little things.
                    <br className="desktop-break" /> Remember them. Then see what they mean
                    together.
                  </p>
                  <div className="hero-flower" aria-hidden="true">
                    <svg viewBox="0 0 200 200">
                      {Array.from({ length: 7 }, (_, i) => (
                        <ellipse
                          key={i}
                          cx="100"
                          cy="67"
                          rx="26"
                          ry="53"
                          transform={`rotate(${i * (360 / 7)} 100 100)`}
                        />
                      ))}
                      <circle cx="100" cy="100" r="8" />
                    </svg>
                  </div>
                </section>
              )}
              {view !== "constellation" && (
                <LifeHero
                  library={view === "library"}
                  onCapture={(text) => {
                    setCaptureError("");
                    setDraft(text);
                    document
                      .querySelector<HTMLTextAreaElement>(".capture-composer textarea")
                      ?.focus();
                  }}
                />
              )}
              {view === "today" && (
                <RemindersPanel
                  memories={memories}
                  disabled={busy || saving || !loaded || Boolean(storageError)}
                  onOpen={setSelectedId}
                  onUpdate={async (id, action) => {
                    const updated = await persist(
                      memoryRef.current.map((memory) => {
                        if (memory.id !== id || !memory.reminder) return memory;
                        return {
                          ...memory,
                          updatedAt: new Date().toISOString(),
                          reminder: {
                            ...memory.reminder,
                            ...(action === "snooze"
                              ? {
                                  at: new Date(Date.now() + 3600000).toISOString(),
                                  status: "scheduled" as const,
                                }
                              : { status: action }),
                          },
                        };
                      }),
                    );
                    if (updated)
                      toast.success(
                        action === "snooze"
                          ? "Reminder snoozed for one hour."
                          : action === "done"
                            ? "Reminder marked done. Your memory is still saved."
                            : "Reminder dismissed. Your memory is still saved.",
                      );
                  }}
                />
              )}
              <form
                className="capture-composer"
                onSubmit={(e) => {
                  e.preventDefault();
                  void capture(draft);
                }}
              >
                <div className="composer-heading">
                  <span>
                    <NotebookPen size={16} /> A little space for your thoughts
                  </span>
                  <span className="composer-step">01 / CAPTURE</span>
                </div>
                <label className="composer-label" htmlFor="memory-draft">
                  What would you like to remember?
                </label>
                <textarea
                  id="memory-draft"
                  value={draft}
                  onChange={(e) => {
                    setCaptureError("");
                    setDraft(e.target.value);
                  }}
                  placeholder="What happened? What did you learn, read, watch, or want to do?"
                  aria-label="A new memory"
                  rows={3}
                  maxLength={16000}
                  disabled={task !== null || saving || Boolean(pending) || Boolean(storageError)}
                  onKeyDown={(e) => {
                    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                      e.preventDefault();
                      void capture(draft);
                    }
                  }}
                />
                <VoiceCapture
                  disabled={task !== null || saving || Boolean(pending) || Boolean(storageError)}
                  remaining={16000 - draft.length - (draft.trim() ? 1 : 0)}
                  onBusyChange={setVoiceActive}
                  onTranscript={(text) => {
                    setCaptureError("");
                    setDraft((old) => (old.trim() ? `${old}\n${text}` : text));
                  }}
                />
                <button
                  type="submit"
                  className="remember-button"
                  disabled={
                    busy || Boolean(pending) || !draft.trim() || !loaded || Boolean(storageError)
                  }
                >
                  {task === "capture" ? (
                    <Loader2 size={15} className="spin" />
                  ) : (
                    <Sparkles size={15} />
                  )}
                  <span>
                    {task === "capture"
                      ? "Understanding…"
                      : pending
                        ? "Review ready"
                        : consentRequired || (settings.provider === "astra" && configured === false)
                          ? "Review manually"
                          : "Review memory"}
                  </span>
                  <ArrowUpRight size={15} />
                </button>
              </form>
              <div className="composer-caption">
                <span>
                  {busy
                    ? statusText
                    : pending
                      ? "Your review is ready below. Check it before saving."
                      : "Nothing is saved until you review and confirm."}
                </span>
                {task === "capture" && (
                  <button type="button" className="text-button" onClick={stopCapture}>
                    Stop waiting
                  </button>
                )}
                {!consentRequired && !(settings.provider === "astra" && configured === false) && (
                  <button
                    className="text-button"
                    onClick={reviewManually}
                    disabled={
                      (busy && task !== "capture") ||
                      saving ||
                      voiceActive ||
                      Boolean(pending) ||
                      !draft.trim() ||
                      Boolean(storageError)
                    }
                  >
                    {task === "capture" ? "Review manually now" : "Review manually"}
                  </button>
                )}
              </div>
              {task === "capture" && (
                <section
                  className="capture-feedback processing"
                  ref={captureStatusRef}
                  tabIndex={-1}
                  aria-label="Preparing your review"
                >
                  <Loader2 size={22} className="spin" aria-hidden="true" />
                  <div>
                    <h2>Preparing your review</h2>
                    <p role="status">
                      AI is sorting your note and preparing suggestions. Nothing has been saved.
                    </p>
                    <p className="capture-feedback-detail" aria-hidden="true">
                      {elapsed}s elapsed · Local models can take a minute.
                    </p>
                    {elapsed >= 20 && (
                      <p>
                        Still working. You can stop waiting or review your words manually above.
                      </p>
                    )}
                  </div>
                </section>
              )}
              {captureReceipt && !pending && task !== "capture" && (
                <section className="capture-feedback saved" aria-label="Saved memory confirmation">
                  <Check size={22} aria-hidden="true" />
                  <div>
                    <h2 ref={savedStatusRef} tabIndex={-1}>
                      {captureReceipt.count === 1
                        ? "Your memory is saved"
                        : `${captureReceipt.count} entries are saved`}
                    </h2>
                    <p role="status">Saved on this device, just as you confirmed.</p>
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => {
                        if (captureReceipt.ids.length === 1) setSelectedId(captureReceipt.ids[0]!);
                        else {
                          setView("journal");
                          setHighlightedIds(captureReceipt.ids);
                        }
                      }}
                    >
                      {captureReceipt.ids.length === 1 ? "Open saved memory" : "See saved entries"}
                      <ArrowRight size={15} />
                    </button>
                  </div>
                </section>
              )}
              {captureError && (
                <p className="review-question" role="alert">
                  <span>Couldn't prepare your review</span>
                  {captureError}
                </p>
              )}
              {pending && (
                <CaptureReview
                  key={pending.text}
                  plan={pending.plan}
                  text={pending.text}
                  {...(pending.classification ? { classification: pending.classification } : {})}
                  memories={memories}
                  onSave={confirmCapture}
                  onCancel={() => setPending(null)}
                />
              )}
              {view !== "constellation" && (
                <LifeDashboard
                  memories={memories}
                  library={view === "library"}
                  busy={busy || Boolean(storageError) || !loaded}
                  onOpen={setSelectedId}
                  onCapture={(text) => {
                    setCaptureError("");
                    setDraft(text);
                    document
                      .querySelector<HTMLTextAreaElement>(".capture-composer textarea")
                      ?.focus();
                  }}
                  onUpdate={updateActivity}
                />
              )}
              {view === "library" && (
                <DiscoverPanel
                  memories={memories}
                  settings={settings}
                  busy={
                    busy ||
                    !loaded ||
                    consentRequired ||
                    (settings.provider === "astra" && configured !== true) ||
                    Boolean(storageError) ||
                    Boolean(pending)
                  }
                  onSave={saveRecommendation}
                  onOpen={setSelectedId}
                  onWorking={(working) => {
                    requestLock.current = working;
                    setTask(working ? "discover" : null);
                  }}
                />
              )}
              {view === "constellation" && (
                <>
                  <div className="constellation-grid">
                    <section className="constellation-panel">
                      <div className="section-heading">
                        <div>
                          <h2>
                            Your constellation<span className="count-pill">{memories.length}</span>
                          </h2>
                          <p>Small moments. A bigger picture.</p>
                        </div>
                        <button
                          className="connect-button"
                          disabled={busy || !loaded || !memories.length || Boolean(storageError)}
                          onClick={() => void generate()}
                        >
                          {task === "connect" ? (
                            <Loader2 size={14} className="spin" />
                          ) : (
                            <GitBranch size={14} />
                          )}
                          <span>
                            {task === "connect" ? "Connecting…" : "Find the hidden threads"}
                          </span>
                        </button>
                      </div>
                      <MemoryMap
                        memories={memories}
                        connections={connections}
                        selectedId={selectedId}
                        highlightedIds={highlightedIds}
                        onSelect={setSelectedId}
                        busy={mapping}
                        engineName={settings.provider === "ollama" ? "Your local model" : "OpenAI"}
                      />
                      <CategoryLegend categories={categories} />
                      <div className="map-footer">
                        <span>
                          <GitBranch size={12} />
                          {connections.length}{" "}
                          {!graph && synthesis?.mode === "example"
                            ? "example connections"
                            : (graph?.provider ?? synthesis?.provider) === "ollama"
                              ? "connections from your local model"
                              : "connections from OpenAI"}
                          {mapping
                            ? " · updating automatically…"
                            : mapStale
                              ? " · waiting to update"
                              : ""}
                        </span>
                        <span>
                          {!graph && synthesis?.mode === "example"
                            ? "Illustrative links while your map updates"
                            : "Dashed lines show possible connections."}
                        </span>
                      </div>
                      {mapError && (
                        <div className="map-error" role="status">
                          <span>Connections couldn't update. {mapError}</span>
                          <button onClick={retryMap}>Retry mapping</button>
                        </div>
                      )}
                      {synthesis && (
                        <div className="bigger-picture" key={synthesis.generatedAt}>
                          <div className="bigger-picture-eyebrow">
                            <Sparkles size={13} />
                            <span>THE BIGGER PICTURE</span>
                            <span
                              className={`result-badge ${synthesis.mode === "live" ? "live" : ""}`}
                            >
                              {synthesis.mode === "live"
                                ? synthesis.provider === "ollama"
                                  ? "LOCAL"
                                  : "ASTRA"
                                : "EXAMPLE"}
                            </span>
                          </div>
                          <h3>{synthesis.result.headline}</h3>
                          <p>{synthesis.result.answer}</p>
                          <button onClick={() => navigate("ask")}>
                            Follow your curiosity
                            <ArrowUpRight size={13} />
                          </button>
                        </div>
                      )}
                    </section>
                    <InsightPanel
                      synthesis={synthesis}
                      memories={memories}
                      stale={stale}
                      busy={busy}
                      onGenerate={() => void generate()}
                      onSelect={setSelectedId}
                      onHighlight={setHighlightedIds}
                    />
                  </div>
                  {synthesis && (
                    <section className="next-section">
                      <div className="section-heading">
                        <div>
                          <div className="section-eyebrow">FROM UNDERSTANDING TO DOING</div>
                          <h2>A small next step.</h2>
                        </div>
                        <span className="subtle-label">
                          Suggestions{" "}
                          {synthesis.mode === "example"
                            ? "from the demo story"
                            : "grounded in your memories"}
                        </span>
                      </div>
                      <div className="actions-grid">
                        {synthesis.result.actions.map((action, i) => (
                          <ActionCard
                            key={action.title}
                            action={action}
                            index={i}
                            memories={memories}
                            onSelect={setSelectedId}
                            done={doneActions.includes(action.title)}
                            disabled={busy || Boolean(storageError)}
                            onToggle={() => toggleAction(action)}
                          />
                        ))}
                      </div>
                    </section>
                  )}
                </>
              )}
            </>
          )}
          {view === "journal" && (
            <>
              <section className="page-intro">
                <div className="hero-eyebrow">
                  <NotebookPen size={14} /> THE THINGS YOU KEEP
                </div>
                <h1>
                  A life in little <em>moments.</em>
                </h1>
                <p>Not everything needs to be important to be worth remembering.</p>
              </section>
              <div className="journal-toolbar">
                <div className="journal-search">
                  <Search size={16} />
                  <input
                    placeholder="Find a person, a thought, a feeling…"
                    aria-label="Search memories"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                  {search && (
                    <button onClick={() => setSearch("")} aria-label="Clear search">
                      <X size={14} />
                    </button>
                  )}
                </div>
                <button
                  className="connect-button"
                  onClick={() => {
                    navigate("constellation");
                    window.setTimeout(
                      () =>
                        document
                          .querySelector<HTMLTextAreaElement>(".capture-composer textarea")
                          ?.focus(),
                      0,
                    );
                  }}
                >
                  <Plus size={14} />
                  New memory
                </button>
              </div>
              <div className="category-filters">
                <button
                  className={category === "ALL" ? "active" : ""}
                  onClick={() => setCategory("ALL")}
                >
                  Everything<span>{memories.length}</span>
                </button>
                {categories.map((cat) => (
                  <button
                    key={cat}
                    className={category === cat ? "active" : ""}
                    onClick={() => setCategory(cat)}
                  >
                    <i style={{ background: categoryMeta[cat].color }} />
                    {categoryMeta[cat].label}
                  </button>
                ))}
              </div>
              <div className="journal-grid">
                {filtered.map((m) => (
                  <MemoryCard
                    key={`${m.id}-${m.updatedAt}`}
                    memory={m}
                    onLog={(value) => updateMemory(m.id, (item) => logAnswer(item, value))}
                    onDelete={() => deleteMemory(m.id)}
                    onDone={() => completeWishlist(m.id)}
                    onExplore={() => setSelectedId(m.id)}
                    compact
                    disabled={busy || Boolean(storageError)}
                  />
                ))}
              </div>
              {!filtered.length && (
                <div className="empty-state">
                  <NotebookPen size={32} strokeWidth={1} />
                  <h3>
                    {search ? "Nothing here quite matches." : "Room for your first little moment."}
                  </h3>
                  <p>
                    {search
                      ? "Try another word, or look through all your memories."
                      : "Capture a thought or explore the demo story to begin."}
                  </p>
                </div>
              )}
            </>
          )}
          {view === "ask" && (
            <>
              <section className="page-intro ask-intro">
                <div className="hero-eyebrow">
                  <Sparkles size={14} /> THE ANSWER MIGHT ALREADY BE HERE
                </div>
                <h1>
                  Ask a question.
                  <br />
                  Find <em>your</em> answer.
                </h1>
                <p>
                  Your companion thinks across your memories. Every insight comes back to something
                  you've actually lived.
                </p>
              </section>
              <form
                className="ask-composer"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (question.trim()) void generate(question.trim(), true);
                }}
              >
                <MessageCircle size={21} strokeWidth={1.5} />
                <textarea
                  aria-label="Ask your memories a question"
                  placeholder="What should I make more room for in my life?"
                  value={question}
                  rows={2}
                  maxLength={3000}
                  disabled={busy}
                  onChange={(e) => setQuestion(e.target.value)}
                  onKeyDown={(e) => {
                    if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && question.trim()) {
                      e.preventDefault();
                      void generate(question.trim(), true);
                    }
                  }}
                />
                <button
                  className="remember-button"
                  disabled={busy || !question.trim() || !loaded || Boolean(storageError)}
                >
                  {task === "ask" ? (
                    <Loader2 size={16} className="spin" />
                  ) : (
                    <ArrowUpRight size={18} />
                  )}
                  <span>{settings.provider === "ollama" ? "Ask locally" : "Ask OpenAI"}</span>
                </button>
              </form>
              <div className="prompt-chips">
                {prompts.map((prompt) => (
                  <button key={prompt} disabled={busy} onClick={() => void generate(prompt, true)}>
                    {prompt}
                    <ArrowUpRight size={12} />
                  </button>
                ))}
              </div>
              {task === "ask" && (
                <div className="thinking-card" role="status">
                  <span className="thinking-orbit">
                    <Orbit size={24} />
                  </span>
                  <div>
                    <h3>{statusText}</h3>
                    <p>Good connections are worth a moment.</p>
                  </div>
                  <span>{elapsed}s</span>
                </div>
              )}
              {answer && (
                <section className="answer-result">
                  <div className="answer-result-heading">
                    <span className="result-badge live">
                      {answer.provider === "ollama" ? "LOCAL" : "ASTRA"} · YOUR MEMORIES
                    </span>
                    <span>
                      {answer.fingerprint !== currentFingerprint
                        ? "Memories changed since this answer"
                        : `${memories.length} memories considered`}
                    </span>
                  </div>
                  <div className="asked-question">{askedQuestion}</div>
                  <h2>{answer.result.headline}</h2>
                  <p className="answer-prose">{answer.result.answer}</p>
                  <div className="answer-insights">
                    {answer.result.insights.map((insight, i) => (
                      <InsightCard
                        key={`${answer.generatedAt}-${i}`}
                        insight={insight}
                        memories={memories}
                        onSelect={setSelectedId}
                        onHighlight={setHighlightedIds}
                      />
                    ))}
                  </div>
                  {!!answer.result.actions.length && (
                    <>
                      <h3 className="answer-actions-heading">A place to start</h3>
                      <div className="actions-grid">
                        {answer.result.actions.map((action, i) => (
                          <ActionCard
                            key={action.title}
                            action={action}
                            index={i}
                            memories={memories}
                            onSelect={setSelectedId}
                            done={doneActions.includes(action.title)}
                            disabled={busy || Boolean(storageError)}
                            onToggle={() => toggleAction(action)}
                          />
                        ))}
                      </div>
                    </>
                  )}
                  <div className="answer-open-question">
                    <Sparkles size={17} />
                    <span>{answer.result.openQuestion}</span>
                    <button
                      onClick={() => {
                        setDraft("");
                        navigate("constellation");
                        window.setTimeout(
                          () =>
                            document
                              .querySelector<HTMLTextAreaElement>(".capture-composer textarea")
                              ?.focus(),
                          0,
                        );
                      }}
                    >
                      Add a thought
                      <ArrowRight size={14} />
                    </button>
                  </div>
                </section>
              )}
              {!answer && task !== "ask" && (
                <div className="ask-empty">
                  <span className="ask-empty-symbol">✳</span>
                  <p>
                    You've been collecting the pieces.
                    <br />
                    Let's see what they say together.
                  </p>
                  <span>
                    Answers use your memories. Interpretations are possibilities to explore.
                  </span>
                </div>
              )}
            </>
          )}
          <footer className="workspace-footer">
            <span>
              <Orbit size={13} />
              OpenMemory
            </span>
            <span>A little remembering. A little understanding.</span>
            <span>
              {settings.provider === "ollama" ? "Thinking locally" : "Made with OpenAI"}{" "}
              <span className="little-star">✦</span>
            </span>
          </footer>
        </main>
      </div>
      <input
        type="file"
        ref={importRef}
        accept=".json,.txt,.md,text/plain,application/json"
        className="sr-only"
        aria-label="Import memories"
        onChange={(event) => void importMemories(event)}
      />
      <PrivacyPanel
        open={privacyOpen}
        onClose={() => setPrivacyOpen(false)}
        settings={settings}
        hosted={hosted}
        onDisableAI={() => {
          localStorage.removeItem("openmemory.ai.v2");
          setSettings({ provider: "astra", model: "astra" });
          setConsentRequired(true);
          toast.success("Manual review selected. OpenAI processing is off.");
        }}
        onSettings={changeSettings}
        encrypted={encrypted}
        busy={busy || mapping || !loaded}
        onEncrypt={async (passphrase) => {
          await encryptVault(memoryRef.current, passphrase);
          setEncrypted(true);
        }}
        onLock={() => {
          lockVault();
          memoryRef.current = [];
          setMemories([]);
          setSynthesis(null);
          setAnswer(null);
          setPending(null);
          setDraft("");
          setQuestion("");
          setSelectedId(null);
          setDoneActions([]);
          setLoaded(false);
          setLocked(true);
          setPrivacyOpen(false);
        }}
      />
      {selected && (
        <MemoryDialog
          key={selected.id + selected.updatedAt}
          memory={selected}
          memories={memories}
          connections={connections}
          busy={busy || Boolean(storageError)}
          onClose={() => setSelectedId(null)}
          onSelect={setSelectedId}
          onLog={(value) => updateMemory(selected.id, (m) => logAnswer(m, value))}
          onDelete={() => deleteMemory(selected.id)}
          onDone={() => completeWishlist(selected.id)}
          onEdit={async (title, summary) => {
            if (
              await updateMemory(selected.id, (m) => ({
                ...m,
                title,
                summary,
                updatedAt: new Date().toISOString(),
              }))
            )
              toast.success("Memory updated.");
          }}
        />
      )}
      {busy && task !== "capture" && !voiceActive && view !== "ask" && (
        <div className="activity-toast" role="status" aria-live="polite">
          <span className="processing-dot" />
          <span>{statusText}</span>
          <span>{elapsed}s</span>
        </div>
      )}
    </div>
  );
}
function MemoryDialog({
  memory,
  memories,
  connections,
  busy,
  onClose,
  onSelect,
  onLog,
  onDelete,
  onDone,
  onEdit,
}: {
  memory: Memory;
  memories: Memory[];
  connections: NonNullable<SavedSynthesis>["result"]["connections"];
  busy: boolean;
  onClose: () => void;
  onSelect: (id: string) => void;
  onLog: (value: string) => void;
  onDelete: () => void;
  onDone: () => void;
  onEdit: (title: string, summary: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(memory.title);
  const [summary, setSummary] = useState(memory.summary);
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    return () => previous?.focus();
  }, []);
  const related = connections.filter((c) => c.from === memory.id || c.to === memory.id);
  const Icon = categoryIcons[memory.category];
  return (
    <div className="memory-modal-backdrop" onClick={onClose}>
      <div
        className="memory-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="memory-dialog-title"
        ref={panelRef}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key !== "Tab") return;
          const focusable = panelRef.current?.querySelectorAll<HTMLElement>(
            'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), [tabindex="0"]',
          );
          const first = focusable?.[0];
          const last = focusable?.[focusable.length - 1];
          if (
            e.shiftKey &&
            (document.activeElement === first || document.activeElement === panelRef.current)
          ) {
            e.preventDefault();
            last?.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first?.focus();
          }
        }}
      >
        <div className="modal-top">
          <span>
            <Icon size={15} />A LITTLE MOMENT, UP CLOSE
          </span>
          <button aria-label="Close memory" onClick={onClose}>
            <X size={19} />
          </button>
        </div>
        <h2 id="memory-dialog-title" className="sr-only">
          {memory.title}
        </h2>
        {editing ? (
          <form
            className="edit-memory"
            onSubmit={(e) => {
              e.preventDefault();
              if (title.trim() && summary.trim()) {
                onEdit(title.trim(), summary.trim());
                setEditing(false);
              }
            }}
          >
            <label>
              Title
              <input
                value={title}
                maxLength={300}
                onChange={(e) => setTitle(e.target.value)}
                required
                autoFocus
              />
            </label>
            <label>
              Memory
              <textarea
                value={summary}
                maxLength={12000}
                rows={5}
                onChange={(e) => setSummary(e.target.value)}
                required
              />
            </label>
            <div>
              <button type="button" onClick={() => setEditing(false)}>
                Cancel
              </button>
              <button type="submit" disabled={busy || !title.trim() || !summary.trim()}>
                <Check size={14} />
                Save changes
              </button>
            </div>
          </form>
        ) : (
          <>
            <MemoryCard
              memory={memory}
              onLog={onLog}
              onDelete={onDelete}
              onDone={onDone}
              disabled={busy}
            />
            <button className="edit-memory-button" onClick={() => setEditing(true)} disabled={busy}>
              Edit this memory
              <NotebookPen size={12} />
            </button>
          </>
        )}
        {!!related.length && (
          <div className="related-memories">
            <h3>
              <GitBranch size={14} />
              The threads from here
            </h3>
            {related.map((c) => {
              const otherId = c.from === memory.id ? c.to : c.from;
              return (
                <div key={otherId}>
                  <h4>
                    {c.basis === "inferred" ? "Possible connection · " : ""}
                    {c.label}
                  </h4>
                  <p>{c.reason}</p>
                  <Sources ids={[otherId]} memories={memories} onSelect={onSelect} />
                </div>
              );
            })}
          </div>
        )}
        {!!memory.activity?.history.length && (
          <details className="original-notes">
            <summary>
              Activity history<span>{memory.activity.history.length} updates</span>
            </summary>
            {[...memory.activity.history].reverse().map((event, i) => (
              <p key={i}>
                <strong>{event.date}</strong>
                <br />
                {event.text}
              </p>
            ))}
          </details>
        )}
        {!!memory.transcripts.length && (
          <details className="original-notes">
            <summary>
              In your own words
              <span>
                {memory.transcripts.length} {memory.transcripts.length === 1 ? "note" : "notes"}
              </span>
            </summary>
            {memory.transcripts.map((text, i) => (
              <p key={i}>{text}</p>
            ))}
          </details>
        )}
      </div>
    </div>
  );
}
