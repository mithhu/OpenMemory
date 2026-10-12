import "@tanstack/react-start/server-only";
import { captureResultSchema, synthesisSchema, graphResultSchema, type Memory } from "./memory";

import {
  captureJson,
  synthesisJson,
  graphJson,
  grounding,
  memoryContext,
  validateConnections,
  validateReferences,
  graphInstructions,
  synthesisInstructions,
} from "./ai-protocol";
export { validateConnections, validateReferences } from "./ai-protocol";

const apiKey = () =>
  process.env["OPEN_AI_KEY"] || process.env["OPENAI_API_KEY"] || process.env["ASTRA_API_KEY"];
const cloudModel = () => process.env["OPENAI_MODEL"]?.trim() || "gpt-6-luna";
export function configuration() {
  return { configured: Boolean(apiKey()), model: cloudModel() };
}
export async function requestStructured(
  instructions: string,
  input: unknown,
  name: string,
  schema: Record<string, unknown>,
): Promise<unknown> {
  const key = apiKey();
  if (!key) throw new Error("Add OPEN_AI_KEY to your .env file, then restart the dev server.");
  const model = cloudModel();
  let response: Response;
  try {
    response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      signal: AbortSignal.timeout(120000),
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        reasoning: { effort: "low" },
        store: false,
        max_output_tokens: 7000,
        instructions,
        input: JSON.stringify(input),
        text: { format: { type: "json_schema", name, strict: true, schema } },
      }),
    });
  } catch {
    throw new Error(
      "OpenAI couldn't be reached in time. Your memories are safe; please try again.",
    );
  }
  if (!response.ok) {
    if (response.status === 401)
      throw new Error(
        "OpenAI rejected the API key. Check OPEN_AI_KEY in .env and restart the server.",
      );
    if (response.status === 429)
      throw new Error(
        "OpenAI is at its rate or credit limit. Wait a moment and check your API credits.",
      );
    if (response.status === 403 || response.status === 404)
      throw new Error(
        "This API key doesn't have access to the configured OpenAI model. Check OPENAI_MODEL and your model access.",
      );
    throw new Error(
      `OpenAI couldn't finish this request (HTTP ${response.status}). Please try again.`,
    );
  }
  const body = (await response.json()) as {
    status?: string;
    output_text?: string;
    output?: { content?: { type: string; text?: string }[] }[];
  };
  if (body.status === "incomplete")
    throw new Error("OpenAI's response was cut short. Try a more focused question.");
  const content = body.output?.flatMap((item) => item.content ?? []) ?? [];
  if (content.some((part) => part.type === "refusal"))
    throw new Error("OpenAI couldn't help with this request. Try a different note or question.");
  const output =
    body.output_text ||
    content
      .filter((part) => part.type === "output_text")
      .map((part) => part.text ?? "")
      .join("");
  try {
    return JSON.parse(output) as unknown;
  } catch {
    throw new Error("OpenAI returned an unreadable response. Please try again.");
  }
}

export async function capture(data: {
  memories: Memory[];
  today: string;
  text: string;
  forcedId?: string | undefined;
}) {
  const result = captureResultSchema.parse(
    await requestStructured(
      `${grounding}
Today is ${data.today}. Turn a new note into a faithful memory card.
If it clearly updates ONE existing memory, return action update and its ID, merging previous facts and preserving the original date unless the new note changes it.
Sharing a person, tag or theme is a relationship, not a reason to merge. A standalone fact about a person ("Alex is my best friend") and a movie experience with that person are separate memories unless the user explicitly adds that detail to the movie.
If ambiguous between several memories, return clarify with at least two actual candidate IDs and a brief clarificationQuestion. Do not guess.
If forcedId is supplied, update that memory only. Otherwise create when the note describes something new.
Categories: MOVIE for films experienced, LESSON for learning, NOTE for everyday life, WISHLIST for future experiences, IDEA for things to build, PERSON for something about a person, GOAL for an intention.
Give a short concrete title, a factual summary, 2-4 lowercase topic tags. Tags should reuse existing relevant tags to help connect memories.
Ask exactly one useful missing question, never something already known. Give two short optional answers, and a short answerLabel. If everything useful is known, followUpQuestion can be empty and suggestedAnswers empty.
Use YYYY-MM-DD dates. why and targetDate are only for a wishlist, otherwise null. Never infer a date from nothing; default to today.
Keep the user's actual wording and intent. No web search or invented entity resolution.`,
      {
        memories: memoryContext(data.memories),
        newNote: data.text,
        forcedId: data.forcedId ?? null,
      },
      "memory_capture",
      captureJson,
    ),
  );
  const ids = new Set(data.memories.map((m) => m.id));
  if (data.forcedId && (result.action !== "update" || result.matchedMemoryId !== data.forcedId))
    throw new Error("OpenAI didn't match the selected memory. Please try again.");
  if (result.action === "update" && (!result.matchedMemoryId || !ids.has(result.matchedMemoryId)))
    throw new Error("OpenAI referred to a memory that doesn't exist. Please try again.");
  if (result.action === "clarify") {
    result.candidateMemoryIds = [...new Set(result.candidateMemoryIds)].filter((id) => ids.has(id));
    if (result.candidateMemoryIds.length < 2)
      throw new Error("OpenAI couldn't narrow that down. Add the name or subject to your note.");
  }
  return result;
}
export async function mapMemoryGraph(data: { memories: Memory[]; today: string }) {
  if (data.memories.length < 2) return { connections: [] };
  const result = graphResultSchema.parse(
    await requestStructured(
      graphInstructions(data.today),
      { memories: memoryContext(data.memories) },
      "memory_relationships",
      graphJson,
    ),
  );
  return { connections: validateConnections(result.connections, data.memories) };
}
export async function synthesize(data: { memories: Memory[]; today: string; question: string }) {
  if (!data.memories.length)
    throw new Error("Add a few memories first so OpenAI has something to connect.");
  const result = synthesisSchema.parse(
    await requestStructured(
      synthesisInstructions(data.today),
      {
        memories: memoryContext(data.memories),
        question:
          data.question || "What am I missing? Find the hidden threads and a useful next step.",
      },
      "memory_constellation",
      synthesisJson,
    ),
  );
  return validateReferences(result, data.memories);
}
