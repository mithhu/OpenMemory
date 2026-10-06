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
import { captureMemory, connectMemories, getAstraStatus } from "@/lib/astra";
import {
  applyCapture,
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
  saveMemories,
  saveSynthesis,
  today,
  type CaptureResult,
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
          "A memory companion that notices what matters. Capture a thought, find the hidden threads, and turn remembering into understanding. Powered by Astra.",
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
type View = "constellation" | "journal" | "ask";
type Task = "capture" | "connect" | "ask" | null;
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
  const [view, setView] = useState<View>("constellation");
  const [draft, setDraft] = useState("");
  const [question, setQuestion] = useState("");
  const [askedQuestion, setAskedQuestion] = useState("");
  const [synthesis, setSynthesis] = useState<SavedSynthesis | null>(null);
  const [answer, setAnswer] = useState<SavedSynthesis | null>(null);
  const [task, setTask] = useState<Task>(null);
  const requestLock = useRef(false);
  const [elapsed, setElapsed] = useState(0);
  const [pending, setPending] = useState<{ text: string; result: CaptureResult } | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [highlightedIds, setHighlightedIds] = useState<string[]>([]);
  const [category, setCategory] = useState<Category | "ALL">("ALL");
  const [search, setSearch] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [doneActions, setDoneActions] = useState<string[]>([]);
  const importRef = useRef<HTMLInputElement>(null);
  const busy = task !== null;
  const {
    graph,
    mapping,
    stale: mapStale,
    error: mapError,
    retry: retryMap,
  } = useMemoryGraph(memories, {
    loaded,
    enabled: configured === true && !storageError,
    paused: busy || Boolean(pending),
  });

  useEffect(() => {
    try {
      const saved = loadMemories();
      memoryRef.current = saved;
      setMemories(saved);
      setSynthesis(
        loadSynthesis() ??
          (saved.some((m) => m.id === "demo-morning") ? exampleSynthesis(saved) : null),
      );
      const done = JSON.parse(localStorage.getItem("openmemory.actions.v1") || "[]") as unknown;
      const legacyDone = Array.isArray(done)
        ? done.filter((item): item is string => typeof item === "string")
        : [];
      const reopened = saved
        .filter((m) => m.completionStatus === "reopened")
        .map((m) => m.completionFor);
      setDoneActions(
        [
          ...new Set([
            ...legacyDone,
            ...saved
              .filter((m) => m.completionStatus === "completed")
              .map((m) => m.completionFor)
              .filter((title): title is string => Boolean(title)),
          ]),
        ].filter((title) => !reopened.includes(title)),
      );
    } catch (error) {
      setStorageError(error instanceof Error ? error.message : "Browser storage is unavailable.");
    }
    setLoaded(true);
    void getAstraStatus()
      .then((status) => setConfigured(status.configured))
      .catch(() => setConfigured(false));
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

  const persist = (next: Memory[]) => {
    try {
      saveMemories(next);
      memoryRef.current = next;
      setMemories(next);
      return true;
    } catch {
      toast.error(
        "Couldn't save to this browser. Export a backup or free up storage and try again.",
      );
      return false;
    }
  };
  const showError = (error: unknown) =>
    toast.error(
      error instanceof Error ? error.message : "Something went wrong. Please try again.",
      { duration: 8000 },
    );
  const ensureReady = () => {
    if (storageError) {
      toast.error("Resolve the saved-memory issue before making changes.");
      return false;
    }
    if (configured === false) {
      toast.error("Add OPEN_AI_KEY to .env, then restart the dev server.");
      return false;
    }
    return loaded && !requestLock.current;
  };
  const capture = async (text: string, forcedId?: string) => {
    if (!ensureReady() || !text.trim()) return;
    if (memoryRef.current.length >= 200 && !forcedId) {
      toast.error("This demo supports 200 memories. Export a backup before making room.");
      return;
    }
    requestLock.current = true;
    setTask("capture");
    try {
      const result = await captureMemory({
        data: {
          text,
          today: today(),
          memories: memoryRef.current,
          ...(forcedId ? { forcedId } : {}),
        },
      });
      if (result.action === "clarify") {
        setPending({ text, result });
        return;
      }
      if (persist(applyCapture(memoryRef.current, result, text))) {
        setDraft("");
        setPending(null);
        toast.success(
          result.action === "update"
            ? `Connected to “${result.title}”`
            : "A little moment, remembered.",
        );
      }
    } catch (error) {
      showError(error);
    } finally {
      requestLock.current = false;
      setTask(null);
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
      const result = await connectMemories({
        data: { memories: snapshot, today: today(), question: query },
      });
      const saved: SavedSynthesis = {
        result,
        fingerprint: fingerprint(snapshot),
        generatedAt: new Date().toISOString(),
        mode: "live",
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
  const deleteMemory = (id: string) => {
    if (persist(memoryRef.current.filter((m) => m.id !== id))) {
      setSelectedId(null);
      toast.success("Memory removed.");
    }
  };
  const completeWishlist = (id: string) => {
    updateMemory(id, (m) => ({
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
  const toggleAction = (action: SuggestedAction) => {
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
    if (!persist(recordAction(memoryRef.current, action, completed))) return;
    setDoneActions(next);
    try {
      localStorage.setItem("openmemory.actions.v1", JSON.stringify(next));
    } catch {
      /* Completion is also stored in its memory, so it survives reloads. */
    }
    toast.success(
      completed
        ? "A next step became a memory. Astra can learn from it."
        : "Step reopened. Your memory reflects the change.",
    );
  };
  const addDemo = () => {
    if (!loaded || busy || storageError) return;
    const existing = memoryRef.current;
    const additions = demoMemories().filter((m) => !existing.some((item) => item.id === m.id));
    if (existing.length + additions.length > 200) {
      toast.error("There's no room for the ten demo memories. Export a backup first.");
      return;
    }
    const next = [...additions, ...existing];
    if (persist(next)) {
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
          : "You're exploring the demo story. Find the threads to hear from Astra.",
      );
    }
  };
  const exportMemories = () => {
    const raw = storageError
      ? localStorage.getItem("echo.memories.v1") || "[]"
      : JSON.stringify(
          { version: 1, exportedAt: new Date().toISOString(), memories: memoryRef.current },
          null,
          2,
        );
    const url = URL.createObjectURL(new Blob([raw], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `openmemory-${today()}.json`;
    link.click();
    URL.revokeObjectURL(url);
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
        const raw = Array.isArray(data)
          ? data
          : data && typeof data === "object" && "memories" in data
            ? data.memories
            : null;
        if (!Array.isArray(raw))
          throw new Error("Choose an OpenMemory export containing a memories array.");
        const imported = raw.map((m: unknown) => memorySchema.parse(m));
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
        if (persist(unique))
          toast.success(`${addedCount} memories imported. Existing memories kept.`);
      } else {
        if (text.length > 16000) throw new Error("Keep each text import under 16,000 characters.");
        setDraft(text.trim());
        setView("constellation");
        toast.success("Text added to the composer. Review it, then remember it.");
      }
    } catch (error) {
      showError(error);
    }
  };
  const navigate = (next: View) => {
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
  const statusText =
    task === "capture"
      ? "Finding a place for your thought…"
      : elapsed < 5
        ? "Reading across your memories…"
        : elapsed < 15
          ? "Looking for the threads between them…"
          : "Giving the bigger picture a little thought…";

  return (
    <div className="app-shell">
      <aside
        className={`sidebar ${menuOpen ? "mobile-open" : ""}`}
        inert={Boolean(selectedId) || (isMobile && !menuOpen)}
      >
        <button
          className="brand"
          onClick={() => navigate("constellation")}
          aria-label="OpenMemory home"
        >
          <span className="brand-mark">
            <Orbit size={23} strokeWidth={1.5} />
          </span>
          <span>
            OpenMemory
            <i />
          </span>
        </button>
        <div className="sidebar-label">A LITTLE SPACE FOR YOU</div>
        <nav className="main-nav" aria-label="Main navigation">
          <button
            className={view === "constellation" ? "active" : ""}
            onClick={() => navigate("constellation")}
          >
            <Orbit size={18} />
            Constellation
            <span className="nav-dot" />
          </button>
          <button
            className={view === "journal" ? "active" : ""}
            onClick={() => navigate("journal")}
          >
            <NotebookPen size={18} />
            Your memories<span className="nav-count">{memories.length}</span>
          </button>
          <button className={view === "ask" ? "active" : ""} onClick={() => navigate("ask")}>
            <MessageCircle size={18} />
            Ask your memory
            <ArrowUpRight size={13} className="nav-arrow" />
          </button>
        </nav>
        <div className="sidebar-divider" />
        <div className="sidebar-label">THE LITTLE THINGS</div>
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
          <div className="demo-invite">
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
          <div
            className="local-note"
            title="Saved on this device. Your notes are sent to OpenAI when you capture, update connections automatically, or ask Astra."
          >
            <LockKeyhole size={12} />
            Your memories stay in this browser.
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
              {view === "constellation"
                ? "Constellation"
                : view === "journal"
                  ? "Your memories"
                  : "Ask your memory"}
            </span>
          </div>
          <div className="topbar-right">
            <span className={`astra-status ${configured === false ? "unconfigured" : ""}`}>
              <i />
              {configured === null ? "Connecting…" : configured ? "Astra enabled" : "Set up Astra"}
            </span>
            <span className="profile-orb">You</span>
          </div>
        </header>
        <main className="workspace">
          {storageError && (
            <div className="setup-banner" role="alert">
              <ShieldCheck size={17} />
              <span>{storageError}</span>
              <button onClick={exportMemories}>Export backup</button>
            </div>
          )}
          {configured === false && (
            <div className="setup-banner">
              <ShieldCheck size={17} />
              <span>
                To connect Astra, add <code>OPEN_AI_KEY</code> to <code>.env</code> and restart the
                dev server. You can explore the example story now.
              </span>
            </div>
          )}
          {view === "constellation" && (
            <>
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
                  <br className="desktop-break" /> Remember them. Then see what they mean together.
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
              <form
                className="capture-composer"
                onSubmit={(e) => {
                  e.preventDefault();
                  void capture(draft.trim());
                }}
              >
                <span className="composer-icon">
                  <Plus size={21} strokeWidth={1.5} />
                </span>
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="A thought, a moment, something you don't want to lose…"
                  aria-label="A new memory"
                  rows={draft.includes("\n") || draft.length > 100 ? 3 : 1}
                  maxLength={16000}
                  disabled={busy || Boolean(pending) || Boolean(storageError)}
                  onKeyDown={(e) => {
                    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                      e.preventDefault();
                      void capture(draft.trim());
                    }
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
                  <span>Remember</span>
                  <ArrowUpRight size={15} />
                </button>
              </form>
              <div className="composer-caption">
                <span>
                  {busy ? statusText : "Write naturally. Astra will find a place for it."}
                </span>
                <span>⌘ / Ctrl + Enter</span>
              </div>
              {pending && (
                <div className="clarify-panel" role="status">
                  <h3>{pending.result.clarificationQuestion || "Which memory did you mean?"}</h3>
                  <div>
                    {pending.result.candidateMemoryIds.map((id) => {
                      const m = memories.find((item) => item.id === id);
                      return m ? (
                        <button
                          key={id}
                          disabled={busy}
                          onClick={() => void capture(pending.text, id)}
                        >
                          {m.title}
                          <ArrowUpRight size={13} />
                        </button>
                      ) : null;
                    })}
                    <button disabled={busy} onClick={() => setPending(null)}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}
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
                      <span>{task === "connect" ? "Connecting…" : "Find the hidden threads"}</span>
                    </button>
                  </div>
                  <MemoryMap
                    memories={memories}
                    connections={connections}
                    selectedId={selectedId}
                    highlightedIds={highlightedIds}
                    onSelect={setSelectedId}
                    busy={mapping}
                  />
                  <CategoryLegend categories={categories} />
                  <div className="map-footer">
                    <span>
                      <GitBranch size={12} />
                      {connections.length}{" "}
                      {!graph && synthesis?.mode === "example"
                        ? "example connections"
                        : "connections from Astra"}
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
                        <span className={`result-badge ${synthesis.mode === "live" ? "live" : ""}`}>
                          {synthesis.mode === "live" ? "ASTRA" : "EXAMPLE"}
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
                  Astra thinks across your memories. Every insight comes back to something you've
                  actually lived.
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
                  <span>Ask Astra</span>
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
                    <span className="result-badge live">ASTRA · YOUR MEMORIES</span>
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
              Made with Astra <span className="little-star">✦</span>
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
          onEdit={(title, summary) => {
            if (
              updateMemory(selected.id, (m) => ({
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
      {busy && view !== "ask" && (
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
