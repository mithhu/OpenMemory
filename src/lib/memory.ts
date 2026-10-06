import { z } from "zod";

export const CATEGORIES = [
  "MOVIE",
  "LESSON",
  "NOTE",
  "WISHLIST",
  "IDEA",
  "PERSON",
  "GOAL",
] as const;
export type Category = (typeof CATEGORIES)[number];
export const categoryMeta: Record<Category, { label: string; color: string }> = {
  MOVIE: { label: "Culture", color: "#b79bfa" },
  LESSON: { label: "Learning", color: "#71c9d2" },
  NOTE: { label: "Life", color: "#d5b98a" },
  WISHLIST: { label: "Wishlist", color: "#ef9cc1" },
  IDEA: { label: "Ideas", color: "#aa9bff" },
  PERSON: { label: "People", color: "#89cfae" },
  GOAL: { label: "Goals", color: "#efa781" },
};

export const answerSchema = z.object({
  label: z.string().max(100),
  question: z.string().max(1000),
  value: z.string().max(8000),
  at: z.string(),
});
export const memorySchema = z.object({
  id: z.string().min(1).max(100),
  title: z.string().min(1).max(300),
  category: z.enum(CATEGORIES),
  date: z.string().max(30),
  summary: z.string().max(12000),
  followUpQuestion: z.string().max(1000),
  suggestedAnswers: z.array(z.string().max(500)).max(5),
  answerLabel: z.string().max(100),
  answers: z.array(answerSchema).max(100),
  transcripts: z.array(z.string().max(16000)).max(100),
  why: z.string().max(8000).nullable().optional(),
  targetDate: z.string().max(30).nullable().optional(),
  tags: z.array(z.string().max(60)).max(8).optional(),
  relatedMemoryIds: z.array(z.string().max(100)).max(10).optional(),
  completionFor: z.string().max(200).optional(),
  completionStatus: z.enum(["completed", "reopened"]).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Memory = z.infer<typeof memorySchema>;

export const connectionSchema = z.object({
  from: z.string(),
  to: z.string(),
  label: z.string().max(120),
  reason: z.string().max(1200),
  basis: z.enum(["explicit", "inferred"]).optional(),
});
export type Connection = z.infer<typeof connectionSchema>;
export const graphResultSchema = z.object({ connections: z.array(connectionSchema).max(120) });
const savedGraphSchema = graphResultSchema.extend({
  fingerprint: z.string(),
  mappedAt: z.string(),
});
export type SavedGraph = z.infer<typeof savedGraphSchema>;
export const insightSchema = z.object({
  kind: z.enum(["pattern", "opportunity", "tension"]),
  title: z.string().max(200),
  detail: z.string().max(2000),
  memoryIds: z.array(z.string()).max(10),
});
export type Insight = z.infer<typeof insightSchema>;
export const actionSchema = z.object({
  title: z.string().max(200),
  detail: z.string().max(1200),
  memoryIds: z.array(z.string()).max(10),
});
export type SuggestedAction = z.infer<typeof actionSchema>;
export const synthesisSchema = z.object({
  headline: z.string().max(300),
  answer: z.string().max(10000),
  connections: z.array(connectionSchema).max(30),
  insights: z.array(insightSchema).max(6),
  actions: z.array(actionSchema).max(5),
  openQuestion: z.string().max(1000),
});
export type Synthesis = z.infer<typeof synthesisSchema>;
export interface SavedSynthesis {
  result: Synthesis;
  fingerprint: string;
  generatedAt: string;
  mode: "live" | "example";
}
export const captureResultSchema = z.object({
  action: z.enum(["create", "update", "clarify"]),
  matchedMemoryId: z.string().nullable(),
  candidateMemoryIds: z.array(z.string()),
  clarificationQuestion: z.string().nullable(),
  title: z.string().max(300),
  category: z.enum(CATEGORIES),
  date: z.string(),
  summary: z.string().max(12000),
  followUpQuestion: z.string().max(1000),
  suggestedAnswers: z.array(z.string()).max(2),
  answerLabel: z.string(),
  why: z.string().nullable(),
  targetDate: z.string().nullable(),
  tags: z.array(z.string()).max(5),
});
export type CaptureResult = z.infer<typeof captureResultSchema>;

const MEM_KEY = "echo.memories.v1";
const SYNTHESIS_KEY = "openmemory.constellation.v1";
const GRAPH_KEY = "openmemory.graph.v1";
export function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function fingerprint(memories: Memory[]) {
  return JSON.stringify(
    memories.map((m) => [
      m.id,
      m.updatedAt,
      m.title,
      m.category,
      m.summary,
      m.answers,
      m.date,
      m.tags,
      m.why,
      m.targetDate,
      m.relatedMemoryIds,
      m.completionFor,
      m.completionStatus,
    ]),
  );
}
export function loadGraph(): SavedGraph | null {
  try {
    const raw = localStorage.getItem(GRAPH_KEY);
    return raw ? savedGraphSchema.parse(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}
export function saveGraph(graph: SavedGraph) {
  localStorage.setItem(GRAPH_KEY, JSON.stringify(graph));
}
export function loadMemories(): Memory[] {
  const raw = localStorage.getItem(MEM_KEY);
  if (raw === null) {
    const memories = demoMemories();
    saveMemories(memories);
    return memories;
  }
  try {
    const data: unknown = JSON.parse(raw);
    if (!Array.isArray(data)) throw new Error("The saved memory collection is not an array.");
    return data.map((item: unknown) => memorySchema.parse(item));
  } catch {
    throw new Error(
      "Your saved memories could not be read. Export a backup before importing a replacement.",
    );
  }
}
export function saveMemories(memories: Memory[]) {
  localStorage.setItem(MEM_KEY, JSON.stringify(memories));
}
export function saveSynthesis(value: SavedSynthesis) {
  localStorage.setItem(SYNTHESIS_KEY, JSON.stringify(value));
}
export function loadSynthesis(): SavedSynthesis | null {
  try {
    const raw = localStorage.getItem(SYNTHESIS_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as SavedSynthesis;
    return { ...value, result: synthesisSchema.parse(value.result) };
  } catch {
    return null;
  }
}
export function applyCapture(
  memories: Memory[],
  result: CaptureResult,
  transcript: string,
): Memory[] {
  if (result.action === "clarify") throw new Error("Choose a memory before saving.");
  const existing =
    result.action === "update" ? memories.find((m) => m.id === result.matchedMemoryId) : undefined;
  if (result.action === "update" && !existing)
    throw new Error("That memory was removed. Please try again.");
  const now = new Date().toISOString();
  const memory: Memory = {
    ...existing,
    category: result.category,
    followUpQuestion: result.followUpQuestion,
    suggestedAnswers: result.suggestedAnswers,
    answerLabel: result.answerLabel,
    tags: result.tags,
    id: existing?.id ?? crypto.randomUUID(),
    date: /^\d{4}-\d{2}-\d{2}$/.test(result.date) ? result.date : today(),
    title: result.title.trim(),
    summary: result.summary.trim(),
    answers: existing?.answers ?? [],
    transcripts: [...(existing?.transcripts ?? []), transcript],
    why: result.why ?? existing?.why ?? null,
    targetDate: result.targetDate ?? existing?.targetDate ?? null,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  if (!memory.title || !memory.summary)
    throw new Error("Astra returned an incomplete memory. Please try again.");
  return [memory, ...memories.filter((m) => m.id !== memory.id)];
}
export function logAnswer(memory: Memory, value: string): Memory {
  const now = new Date().toISOString();
  return {
    ...memory,
    answers: [
      ...memory.answers.filter((a) => a.label.toLowerCase() !== memory.answerLabel.toLowerCase()),
      { label: memory.answerLabel, question: memory.followUpQuestion, value, at: now },
    ],
    ...(memory.answerLabel.toLowerCase() === "title" ? { title: value } : {}),
    ...(memory.category === "WISHLIST" && /why/i.test(memory.followUpQuestion)
      ? { why: value }
      : {}),
    followUpQuestion: "",
    suggestedAnswers: [],
    updatedAt: now,
  };
}
export function recordAction(
  memories: Memory[],
  action: SuggestedAction,
  completed: boolean,
): Memory[] {
  const existing = memories.find((m) => m.completionFor === action.title);
  const now = new Date().toISOString();
  const statement = `I marked “${action.title}” as ${completed ? "completed" : "not completed yet"} in OpenMemory.`;
  const related = action.memoryIds.filter((id) => memories.some((m) => m.id === id));
  const tags = [
    ...new Set([
      "progress",
      ...memories.filter((m) => related.includes(m.id)).flatMap((m) => m.tags ?? []),
    ]),
  ].slice(0, 5);
  const memory: Memory = {
    ...existing,
    id: existing?.id ?? crypto.randomUUID(),
    title: `${completed ? "A step taken" : "Still on my horizon"}: ${action.title}`,
    category: "NOTE",
    date: today(),
    summary: statement,
    followUpQuestion: completed
      ? "What changed after taking this step?"
      : "What would make this step easier?",
    suggestedAnswers: [],
    answerLabel: "Reflection",
    answers: existing?.answers ?? [],
    transcripts: [...(existing?.transcripts ?? []), statement],
    tags,
    relatedMemoryIds: related,
    completionFor: action.title,
    completionStatus: completed ? "completed" : "reopened",
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  return [memory, ...memories.filter((m) => m.id !== memory.id)];
}
export function formatDate(value: string) {
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

const demoNotes: {
  id: string;
  title: string;
  category: Category;
  summary: string;
  tags: string[];
  question: string;
}[] = [
  {
    id: "demo-morning",
    title: "My best work happens early",
    category: "NOTE",
    summary:
      "Went to the park at 7am, then finished the prototype in two focused hours. I felt much clearer than during my late-night coding sessions.",
    tags: ["focus", "morning", "building"],
    question: "What helped you get into focus?",
  },
  {
    id: "demo-late",
    title: "The late-night loop",
    category: "NOTE",
    summary:
      "Stayed up until 2am polishing animations again. Slept through my alarm, felt foggy, and missed the morning I had planned for the main feature.",
    tags: ["focus", "sleep", "building"],
    question: "What kept you working so late?",
  },
  {
    id: "demo-advice",
    title: "Maya's very good advice",
    category: "PERSON",
    summary:
      "Maya said my best demos start with one real human problem. Her exact advice: stop adding features and show the moment someone's life gets easier.",
    tags: ["building", "simplicity", "friendship"],
    question: "Which human problem matters most to you?",
  },
  {
    id: "demo-journal",
    title: "A journal that joins the dots",
    category: "IDEA",
    summary:
      "I want to build a journal that connects the things I forget are related. A beautiful timeline isn't enough; it should help me notice patterns and actually change something.",
    tags: ["building", "reflection", "focus"],
    question: "What pattern would you want it to notice first?",
  },
  {
    id: "demo-film",
    title: "Interstellar, again",
    category: "MOVIE",
    summary:
      "Watched Interstellar with my daughter. She kept asking about black holes. My favourite part was seeing how curious she was, more than the film itself.",
    tags: ["family", "space", "curiosity"],
    question: "Which question stuck with you?",
  },
  {
    id: "demo-museum",
    title: "A little trip to the stars",
    category: "WISHLIST",
    summary:
      "Want to take my daughter to the science museum's space exhibit. She asked if we could see a real astronaut's suit after watching Interstellar.",
    tags: ["family", "space", "curiosity"],
    question: "When could you make time for this?",
  },
  {
    id: "demo-birthday",
    title: "Dad's birthday next week",
    category: "NOTE",
    summary:
      "Dad's birthday is next week. He said he doesn't need more things and misses our long walks together. I still haven't made a plan.",
    tags: ["family", "presence", "outdoors"],
    question: "What would make the day feel like him?",
  },
  {
    id: "demo-walk",
    title: "The walk I nearly skipped",
    category: "NOTE",
    summary:
      "Left my phone at home and walked by the river with Dad. We talked for an hour. I came back feeling more recharged than after scrolling all evening.",
    tags: ["family", "presence", "outdoors"],
    question: "What do you want to remember from the conversation?",
  },
  {
    id: "demo-learning",
    title: "Small systems beat big intentions",
    category: "LESSON",
    summary:
      "Read about habit design: reduce friction, attach a tiny action to an existing routine, and make the next step obvious. I want to try this with my morning creative work.",
    tags: ["focus", "morning", "habits"],
    question: "What's the smallest first step?",
  },
  {
    id: "demo-goal",
    title: "Make room for what matters",
    category: "GOAL",
    summary:
      "This month I want to ship one meaningful project and spend more intentional time with family. I keep saying yes to extra work and then squeezing both into the leftovers.",
    tags: ["family", "building", "presence"],
    question: "What could you say no to this week?",
  },
];
export function demoMemories(): Memory[] {
  return demoNotes.map((note, i) => {
    const date = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    return {
      id: note.id,
      title: note.title,
      category: note.category,
      summary: note.summary,
      tags: note.tags,
      date,
      followUpQuestion: note.question,
      suggestedAnswers: [],
      answerLabel: "Reflection",
      answers: [],
      transcripts: [note.summary],
      createdAt: `${date}T09:00:00.000Z`,
      updatedAt: `${date}T09:00:00.000Z`,
    };
  });
}
export function exampleSynthesis(memories: Memory[]): SavedSynthesis {
  const ids = new Set(memories.map((m) => m.id));
  const connections: Connection[] = [
    {
      from: "demo-morning",
      to: "demo-late",
      label: "Two sides of focus",
      reason: "Early work felt clear; late polishing cost you the next morning.",
    },
    {
      from: "demo-morning",
      to: "demo-learning",
      label: "A routine waiting to happen",
      reason:
        "Your successful morning is a concrete place to try the tiny habits you learned about.",
    },
    {
      from: "demo-advice",
      to: "demo-journal",
      label: "Build the human moment",
      reason:
        "Maya's advice points toward showing a useful connection, which is the purpose of your journal idea.",
    },
    {
      from: "demo-film",
      to: "demo-museum",
      label: "Curiosity becomes a day out",
      reason: "Your daughter's black-hole questions led to the idea of visiting a space exhibit.",
    },
    {
      from: "demo-birthday",
      to: "demo-walk",
      label: "The gift is already here",
      reason: "Dad asked for time together; your river walk is a memory of exactly that.",
    },
    {
      from: "demo-goal",
      to: "demo-late",
      label: "Time spent, time borrowed",
      reason: "Extra late work seems to compete with the intentional schedule you want.",
    },
    {
      from: "demo-goal",
      to: "demo-birthday",
      label: "Make presence concrete",
      reason: "Dad's upcoming birthday gives your family-time goal a specific next step.",
    },
    {
      from: "demo-journal",
      to: "demo-morning",
      label: "Your own first use case",
      reason:
        "Your different experiences of focus are the sort of pattern your journal could help surface.",
    },
  ].filter((c) => ids.has(c.from) && ids.has(c.to));
  return {
    mode: "example",
    fingerprint: fingerprint(memories),
    generatedAt: new Date().toISOString(),
    result: {
      headline: "You're looking for more space, not more things.",
      answer:
        "A few threads run through these example memories: mornings that make room for focused work, time with family that feels restorative, and a project about noticing what matters. The next opportunity may be to give those things a place in your week, before extra work fills it.",
      connections,
      insights: [
        {
          kind: "pattern",
          title: "Your mornings have a quiet advantage",
          detail:
            "Your park-and-prototype morning felt clear. Late-night polishing left you foggy and cost you the next morning. This suggests a possible rhythm to test, rather than a fixed rule about your productivity.",
          memoryIds: ["demo-morning", "demo-late", "demo-learning"],
        },
        {
          kind: "opportunity",
          title: "Dad already told you the perfect gift",
          detail:
            "He misses your long walks. You have a memory of how good that time felt, and his birthday is an opening to repeat it.",
          memoryIds: ["demo-birthday", "demo-walk"],
        },
        {
          kind: "tension",
          title: "Polish is borrowing from your priorities",
          detail:
            "You want one meaningful project and intentional family time. Extra work and late animation sessions appear to squeeze both.",
          memoryIds: ["demo-goal", "demo-late", "demo-advice"],
        },
      ].filter((insight) => insight.memoryIds.every((id) => ids.has(id))) as Insight[],
      actions: [
        {
          title: "Plan a birthday walk with Dad",
          detail:
            "Ask him which route he'd like. Put an hour together on the calendar before choosing a physical gift.",
          memoryIds: ["demo-birthday", "demo-walk"],
        },
        {
          title: "Protect one morning for the core demo",
          detail:
            "Try a short walk, then a two-hour session showing one useful connection. Decide the stopping time the evening before.",
          memoryIds: ["demo-morning", "demo-late", "demo-advice"],
        },
      ].filter((action) => action.memoryIds.every((id) => ids.has(id))),
      openQuestion:
        "What could you stop doing this week to make room for the time you keep saying matters?",
    },
  };
}
