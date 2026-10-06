// Prototype architecture: OpenAI is called directly from the browser with the user's own key.
export type Category = "MOVIE" | "LESSON" | "NOTE" | "WISHLIST";
export const CATEGORIES: Category[] = ["MOVIE", "LESSON", "NOTE", "WISHLIST"];

export interface LoggedAnswer {
  label: string;
  question: string;
  value: string;
  at: string;
}

export interface Memory {
  id: string;
  title: string;
  category: Category;
  date: string;
  summary: string;
  followUpQuestion: string;
  suggestedAnswers: string[];
  answerLabel: string;
  answers: LoggedAnswer[];
  transcripts: string[];
  why?: string | null;
  targetDate?: string | null;
  createdAt: string;
  updatedAt: string;
}

const MEM_KEY = "echo.memories.v1";
const KEY_KEY = "echo.openai_key";

export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const daysAgo = (n: number) => {
  const d = new Date(Date.now() - n * 864e5);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

function sampleMemories(): Memory[] {
  const now = Date.now();
  const iso = (o: number) => new Date(now - o).toISOString();
  return [
    {
      id: uid(), title: "Interstellar", category: "MOVIE", date: daysAgo(1),
      summary: "Watched with my wife. The ending — love transcending time — really hit me.",
      followUpQuestion: "What would you rate it?", suggestedAnswers: ["9/10", "10/10"], answerLabel: "Rating",
      answers: [{ label: "What hit hardest", question: "What hit you hardest?", value: "The docking scene and Murph's room", at: iso(5e6) }],
      transcripts: [], createdAt: iso(1e6), updatedAt: iso(1e6),
    },
    {
      id: uid(), title: "React Server Components", category: "LESSON", date: daysAgo(2),
      summary: "Workshop on how server components stream HTML and keep data fetching off the client.",
      followUpQuestion: "What was the hardest concept?", suggestedAnswers: ["The client/server boundary", "Streaming with Suspense"], answerLabel: "Hardest concept",
      answers: [], transcripts: [], createdAt: iso(2e6), updatedAt: iso(2e6),
    },
    {
      id: uid(), title: "Mum's birthday dinner", category: "NOTE", date: daysAgo(3),
      summary: "Booking a table at the Italian place on Elm Street for mum's birthday.",
      followUpQuestion: "When should OpenMemory remind you?", suggestedAnswers: ["A week before", "The day before"], answerLabel: "Reminder",
      answers: [{ label: "Remember", question: "What should you remember?", value: "She's vegetarian — check the menu", at: iso(3e6) }],
      transcripts: [], createdAt: iso(3e6), updatedAt: iso(3e6),
    },
    {
      id: uid(), title: "Parasite", category: "WISHLIST", date: daysAgo(4),
      summary: "Want to watch Bong Joon-ho's Parasite.", why: "Interested in its social commentary.", targetDate: null,
      followUpQuestion: "When would you like to watch it?", suggestedAnswers: ["This weekend", "Next Friday"], answerLabel: "Watch date",
      answers: [], transcripts: [], createdAt: iso(4e6), updatedAt: iso(4e6),
    },
  ];
}

export function loadMemories(): Memory[] {
  const raw = localStorage.getItem(MEM_KEY);
  if (raw === null) {
    const s = sampleMemories();
    saveMemories(s);
    return s;
  }
  try { return JSON.parse(raw) as Memory[]; } catch { return []; }
}
export const saveMemories = (m: Memory[]) => localStorage.setItem(MEM_KEY, JSON.stringify(m));
export const loadKey = () => localStorage.getItem(KEY_KEY) ?? "";
export const saveKey = (k: string) => (k ? localStorage.setItem(KEY_KEY, k) : localStorage.removeItem(KEY_KEY));

async function readError(res: Response) {
  try { const j = await res.json(); return j?.error?.message ?? res.statusText; } catch { return res.statusText; }
}

export interface AstraResult {
  action: "create" | "update" | "clarify";
  matchedMemoryId: string | null;
  candidateMemoryIds: string[];
  clarificationQuestion: string | null;
  title: string;
  category: Category;
  date: string;
  summary: string;
  followUpQuestion: string;
  suggestedAnswers: string[];
  answerLabel: string;
  why: string | null;
  targetDate: string | null;
}

const schema = {
  type: "object",
  additionalProperties: false,
  required: ["action", "matchedMemoryId", "candidateMemoryIds", "clarificationQuestion", "title", "category", "date", "summary", "followUpQuestion", "suggestedAnswers", "answerLabel", "why", "targetDate"],
  properties: {
    action: { type: "string", enum: ["create", "update", "clarify"] },
    matchedMemoryId: { type: ["string", "null"] },
    candidateMemoryIds: { type: "array", items: { type: "string" } },
    clarificationQuestion: { type: ["string", "null"] },
    title: { type: "string" },
    category: { type: "string", enum: CATEGORIES },
    date: { type: "string", description: "YYYY-MM-DD" },
    summary: { type: "string" },
    followUpQuestion: { type: "string" },
    suggestedAnswers: { type: "array", items: { type: "string" } },
    answerLabel: { type: "string", description: "Short label for the answer to the follow-up, e.g. 'Rating', 'Watched with', 'Reminder'." },
    why: { type: ["string", "null"] },
    targetDate: { type: ["string", "null"] },
  },
};

const RULES = `You are OpenMemory, a memory assistant. Today is {TODAY}.
Given a new note typed by the user and the user's existing memories, produce a structured memory.

Steps: understand the subject; extract facts; decide whether it refers to an existing memory; determine what is already known (from the note, existing memory summaries, AND logged answers); pick the single most useful missing piece; ask exactly one follow-up question with exactly two short plausible suggested answers.

FIDELITY RULE: Never invent, embellish, reinterpret, or strengthen what the user said. The summary (and "why") may contain ONLY information explicitly stated in the new note or explicitly present in an existing memory or its logged answers. Prefer the user's own wording (e.g. "I heard it's pretty exciting" -> "Heard it's pretty exciting", NOT "Likes its spirit"). No added adjectives, feelings, or interpretations.

ABSOLUTE RULE: Every logged answer is known information. NEVER ask for information that is already known from the note, existing memories, or logged answers.

Continuity:
- If the note clearly refers to ONE existing memory, action="update", matchedMemoryId=its id. Write a merged summary that preserves previous information and adds the new.
- If it is ambiguous and several existing memories could match (e.g. "that movie I told you about"), action="clarify", candidateMemoryIds=the matching ids, clarificationQuestion like "Which movie do you mean?". Do not guess. Other fields may be best-effort.
- Otherwise action="create", matchedMemoryId=null.
- If a FORCED_MATCH id is given, action must be "update" with that id.

Categories (exactly one): MOVIE, LESSON, NOTE, WISHLIST (things the user wants to watch/do/try in the future).
Preferred question progression (skip anything already known):
- MOVIE: what hit hardest? -> rating /10 -> who did you watch it with?
- LESSON: hardest concept? -> what do you want to remember? -> when should OpenMemory remind you?
- NOTE: what should you remember? -> when should OpenMemory remind you?
- WISHLIST: why do you want to watch/do/try this? -> when would you like to do it?
For WISHLIST set "why" and "targetDate" (YYYY-MM-DD) when known, else null. For other categories, null.
title: concise. date: the relevant date (YYYY-MM-DD), today if appropriate. summary: concise facts stated so far.

ENTITY RESOLUTION: If the note refers to a real-world entity indirectly (e.g. "the latest Spider-Man movie", "Nolan's new film"), use the web_search tool to find its exact current name, and use that resolved name as the title. Keep the user's original wording in summary/why. Only resolve when a reliable current source confirms it; never guess from memory alone. If the search is inconclusive, keep the user's literal phrase as the title. If there are several plausible matches, keep the literal phrase as the title and make the followUpQuestion "Which one do you mean?" with the two most likely exact names as suggestedAnswers (answerLabel "Title"). Do not search for notes that already name the entity exactly or have no real-world entity.
answerLabel: 1-3 word label naming what the answer represents (e.g. 'Watch date', 'Rating', 'Watched with'). suggestedAnswers: exactly 2 items. followUpQuestion: never empty.`;

export async function askAstra(transcript: string, memories: Memory[], apiKey: string, forcedMatchId?: string): Promise<AstraResult> {
  const context = memories.map((m) => ({
    id: m.id, title: m.title, category: m.category, date: m.date, summary: m.summary,
    why: m.why ?? null, targetDate: m.targetDate ?? null,
    loggedAnswers: m.answers.map((a) => ({ question: a.question, label: a.label, answer: a.value })),
  }));
  const input = `EXISTING_MEMORIES:\n${JSON.stringify(context)}\n\n${forcedMatchId ? `FORCED_MATCH: ${forcedMatchId}\n\n` : ""}NEW_TRANSCRIPT:\n${transcript}`;
  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-6-astra",
      reasoning: { effort: "low" },
      store: false,
      instructions: RULES.replace("{TODAY}", today()),
      input,
      tools: [{ type: "web_search" }],
      text: { format: { type: "json_schema", name: "echo_memory", strict: true, schema } },
    }),
  });
  if (!res.ok) throw new Error(await readError(res));
  const j = await res.json();
  let text: string = j.output_text ?? "";
  if (!text && Array.isArray(j.output)) {
    for (const item of j.output) for (const c of item.content ?? []) if (c.type === "output_text") text += c.text;
  }
  const r = JSON.parse(text) as AstraResult;
  if (r.action !== "clarify") {
    if (!r.title?.trim() || !r.followUpQuestion?.trim() || !CATEGORIES.includes(r.category)) throw new Error("Incomplete response");
    r.suggestedAnswers = (r.suggestedAnswers ?? []).filter(Boolean).slice(0, 2);
  }
  return r;
}

export function applyResult(memories: Memory[], r: AstraResult, transcript: string): Memory[] {
  const now = new Date().toISOString();
  const existing = r.matchedMemoryId ? memories.find((m) => m.id === r.matchedMemoryId) : undefined;
  const fields = {
    title: r.title.trim(), category: r.category, date: /^\d{4}-\d{2}-\d{2}$/.test(r.date) ? r.date : today(),
    summary: r.summary.trim(), followUpQuestion: r.followUpQuestion.trim(), suggestedAnswers: r.suggestedAnswers,
    answerLabel: r.answerLabel?.trim() || "Answer", why: r.why, targetDate: r.targetDate,
  };
  if (existing) {
    const updated: Memory = {
      ...existing, ...fields, why: r.why ?? existing.why ?? null,
      targetDate: r.targetDate ?? existing.targetDate ?? null,
      transcripts: [...existing.transcripts, transcript], updatedAt: now,
    };
    return [updated, ...memories.filter((m) => m.id !== existing.id)];
  }
  return [{ id: uid(), ...fields, answers: [], transcripts: [transcript], createdAt: now, updatedAt: now }, ...memories];
}

export function convertWishlist(m: Memory): Memory {
  const now = new Date().toISOString();
  const answers = m.why ? [{ label: "Why", question: "Why did you want to watch it?", value: m.why, at: now }, ...m.answers] : m.answers;
  return {
    ...m, category: "MOVIE", date: today(), answers,
    summary: m.summary.replace(/^Want(ed)? to watch/i, "Watched"),
    followUpQuestion: "What hit you hardest?", suggestedAnswers: ["The ending", "The performances"],
    answerLabel: "What hit hardest", updatedAt: now,
  };
}

export const formatDate = (d: string) => {
  const [y, mo = 1, da = 1] = d.split("-").map(Number);
  if (!y) return d;
  return new Date(y, mo - 1, da).toLocaleDateString("en-US", { month: "short", day: "numeric" }).toUpperCase();
};
