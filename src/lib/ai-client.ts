import { z } from "zod";
import { isHostedApp } from "./app-environment";
import { hasMlxCompanionPairing } from "./mlx-companion";
import { planCapture, connectMemories, mapMemories, discoverLibrary } from "./astra";
import { buildTaste, discoveryInstructions, discoveryJson, validateDiscovery } from "./discovery";
import { captureInstructions, capturePlanJson, captureCatalog, validatePlan } from "./capture-plan";
import { splitCaptureNote } from "./source-chunks";
import { interpretCaptureTitles } from "./title-interpretation";
import {
  associateClassification,
  classificationInstructions,
  classificationJson,
  classificationContractVersion,
  type ClassificationMetadata,
} from "./classification";
import {
  graphInstructions,
  graphJson,
  synthesisInstructions,
  synthesisJson,
  memoryContext,
  validateConnections,
  validateReferences,
} from "./ai-protocol";
import { graphResultSchema, synthesisSchema, type Memory } from "./memory";

export const aiSettingsSchema = z.object({
  provider: z.enum(["astra", "ollama"]),
  model: z.string().trim().min(1).max(100),
  captureEngine: z.enum(["mlx", "ollama"]).optional(),
});
export type AISettings = z.infer<typeof aiSettingsSchema>;
// Leave time to answer a browser local-network permission prompt on first use.
const localConnectionTimeoutMs = 30000;
export const defaultAISettings: AISettings = {
  provider: "ollama",
  model: "qwen3.5:9b",
  captureEngine: "mlx",
};
export function hasHostedAIConsent(): boolean {
  try {
    const stored = JSON.parse(localStorage.getItem("openmemory.ai.v2") || "null");
    const settings = aiSettingsSchema.parse(stored);
    return settings.provider === "astra"
      ? stored.cloudOptIn === true
      : settings.captureEngine === "ollama" || hasMlxCompanionPairing();
  } catch {
    return false;
  }
}
export function loadAISettings(hosted = isHostedApp()): AISettings {
  const fallback: AISettings = hosted ? { provider: "astra", model: "astra" } : defaultAISettings;
  try {
    const stored = JSON.parse(localStorage.getItem("openmemory.ai.v2") || "null");
    if (!stored || (stored.provider === "astra" && stored.cloudOptIn !== true)) return fallback;
    const settings = aiSettingsSchema.parse(stored);
    if (
      hosted &&
      settings.provider === "ollama" &&
      settings.captureEngine !== "ollama" &&
      !hasMlxCompanionPairing()
    )
      return fallback;
    return settings;
  } catch {
    return fallback;
  }
}
export function saveAISettings(settings: AISettings) {
  if (
    settings.provider === "ollama" &&
    (!settings.model.trim() || /cloud|https?:|\/\//i.test(settings.model))
  )
    throw new Error("Choose a downloaded local model, not a cloud model.");
  localStorage.setItem(
    "openmemory.ai.v2",
    JSON.stringify({
      ...settings,
      model: settings.model.trim() || "astra",
      cloudOptIn: settings.provider === "astra",
    }),
  );
}
export async function requestOllama(
  instructions: string,
  input: unknown,
  schema: Record<string, unknown>,
  model: string,
  signal?: AbortSignal,
  purpose: "general" | "classification" = "general",
  expectedModelDigest?: string | readonly string[],
): Promise<unknown> {
  signal?.throwIfAborted();
  if (!model.trim() || /cloud|https?:|\/\//i.test(model))
    throw new Error("Choose a downloaded local model in Privacy & AI.");
  const expectedModelDigests =
    expectedModelDigest === undefined
      ? undefined
      : typeof expectedModelDigest === "string"
        ? [expectedModelDigest]
        : expectedModelDigest;
  if (
    expectedModelDigests !== undefined &&
    (!expectedModelDigests.length ||
      expectedModelDigests.some(
        (digest) => typeof digest !== "string" || !/^[a-f0-9]{64}$/.test(digest),
      ))
  )
    throw new Error("Invalid evaluated local model digest.");
  let response: Response;
  let awaitingReply = false;
  let localFormat: string;
  try {
    const metadataResponse = await fetch("http://127.0.0.1:11434/api/show", {
      method: "POST",
      redirect: "error",
      credentials: "omit",
      referrerPolicy: "no-referrer",
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(localConnectionTimeoutMs)])
        : AbortSignal.timeout(localConnectionTimeoutMs),
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model }),
    });
    if (metadataResponse.status === 403) throw new Error("LOCAL_ORIGIN_BLOCKED");
    if (!metadataResponse.ok) throw new Error("LOCAL_MODEL_MISSING");
    const metadata = await metadataResponse.json();
    localFormat = metadata.details?.format;
    if (
      metadata.remote_model ||
      metadata.remote_host ||
      !["gguf", "safetensors"].includes(localFormat)
    ) {
      throw new Error("REMOTE_MODEL_BLOCKED");
    }
    signal?.throwIfAborted();
    if (expectedModelDigest !== undefined) {
      const tagsResponse = await fetch("http://127.0.0.1:11434/api/tags", {
        redirect: "error",
        credentials: "omit",
        referrerPolicy: "no-referrer",
        signal: signal
          ? AbortSignal.any([signal, AbortSignal.timeout(5000)])
          : AbortSignal.timeout(5000),
      });
      if (!tagsResponse.ok) throw new Error("LOCAL_MODEL_CHANGED");
      const tags = z
        .object({ models: z.array(z.object({ name: z.string(), digest: z.string() })) })
        .parse(await tagsResponse.json());
      const matches = tags.models.filter((candidate) => candidate.name === model);
      if (matches.length !== 1 || !expectedModelDigests!.includes(matches[0]!.digest))
        throw new Error("LOCAL_MODEL_CHANGED");
      signal?.throwIfAborted();
    }
    awaitingReply = true;
    response = await fetch("http://127.0.0.1:11434/api/chat", {
      method: "POST",
      redirect: "error",
      credentials: "omit",
      referrerPolicy: "no-referrer",
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(120000)])
        : AbortSignal.timeout(120000),
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        stream: false,
        ...(purpose === "classification" ? { keep_alive: 0 } : {}),
        format: schema,
        think: false,
        options:
          purpose === "classification"
            ? {
                temperature: 0,
                num_ctx: 2048,
                num_predict: 80,
                repeat_penalty: 1,
                presence_penalty: 0,
              }
            : { temperature: 0, num_ctx: 16384, num_predict: 6000 },
        messages: [
          {
            role: "system",
            content:
              localFormat === "safetensors" && purpose !== "classification"
                ? `${instructions}\nReturn only valid JSON matching this schema. No Markdown, prefixes or explanation. Unknown fields must remain null ONLY when the schema permits null. Do not add fields absent from the schema.${JSON.stringify(schema).includes('"progressMode"') ? ' progressMode must always be "increment" or "absolute", even when progress is null.' : ""}\nJSON schema: ${JSON.stringify(schema)}`
                : instructions,
          },
          { role: "user", content: JSON.stringify(input) },
        ],
      }),
    });
  } catch (error) {
    if (signal?.aborted) throw signal.reason;
    if (error instanceof Error && error.name === "TimeoutError")
      throw new Error(
        awaitingReply
          ? "The local model took longer than two minutes. Your note has not been saved. Review it manually, or try a smaller downloaded model. Nothing was sent to Astra."
          : "Ollama's local model check took too long. Allow local network access for this site in your browser and check Ollama's allowed origins. If using an in-app browser, try Chrome or the locally running app. Your note has not been saved; no cloud fallback was used.",
      );
    if (error instanceof Error && error.message === "LOCAL_ORIGIN_BLOCKED")
      throw new Error(
        "Ollama rejected this site's origin. Add this exact site address to OLLAMA_ORIGINS and restart Ollama. No cloud fallback was used.",
      );
    if (error instanceof Error && error.message === "REMOTE_MODEL_BLOCKED")
      throw new Error(
        "This model is not a downloaded local model. It was blocked before sending your memories.",
      );
    if (error instanceof Error && error.message === "LOCAL_MODEL_MISSING")
      throw new Error(
        "That local model isn't available. Choose a downloaded model in Privacy & AI. No cloud fallback was used.",
      );
    if (error instanceof Error && error.message === "LOCAL_MODEL_CHANGED")
      throw new Error(
        "The local model doesn't match the evaluated version. Review manually until the verified model is available. Your note wasn't sent for classification.",
      );
    throw new Error(
      "Your browser couldn't connect to Ollama on this computer. Start Ollama, allow this exact site's origin, and allow local network access in your browser. If using an in-app browser, try Chrome or the locally running app. Your note has not been saved; no cloud fallback was used.",
    );
  }
  if (!response.ok)
    throw new Error(
      `Local Ollama returned HTTP ${response.status}. Check that the model is downloaded. No cloud fallback was used.`,
    );
  const body = await response.json();
  try {
    const content = body.message.content.trim();
    const lines = content.split("\n");
    // Accept only an entire JSON fence, never extract JSON from surrounding prose.
    const fenced =
      ["```json", "```"].includes(lines[0]?.trim()) &&
      lines.at(-1)?.trim() === "```" &&
      lines.length > 2;
    return JSON.parse(fenced ? lines.slice(1, -1).join("\n") : content);
  } catch {
    throw new Error(
      "The local model returned an unreadable result. Your note has not been saved; try a clearer sentence or another local model.",
    );
  }
}
// Classification uses the exact evaluated prompt/settings, independent of
// capture extraction. The byte bound leaves room for the frozen instructions
// and answer in the evaluated 2048-token context; never silently truncate.
export async function classifyWithLocalModel(
  text: string,
  model: string,
  signal?: AbortSignal,
  expectedModelDigest?: string | readonly string[],
) {
  signal?.throwIfAborted();
  if (!text.trim() || new Blob([JSON.stringify({ note: text })]).size > 1000)
    throw new Error("Use a shorter note for local classification, or review these words manually.");
  const raw = await requestOllama(
    classificationInstructions,
    { note: text },
    classificationJson,
    model,
    signal,
    "classification",
    expectedModelDigest,
  );
  signal?.throwIfAborted();
  return associateClassification(text, raw);
}
export async function getLocalModels(): Promise<string[]> {
  const response = await fetch("http://127.0.0.1:11434/api/tags", {
    redirect: "error",
    credentials: "omit",
    referrerPolicy: "no-referrer",
    signal: AbortSignal.timeout(localConnectionTimeoutMs),
  });
  if (!response.ok) throw new Error("Couldn't read local models.");
  const data = z
    .object({ models: z.array(z.object({ name: z.string(), size: z.number().optional() })) })
    .parse(await response.json());
  return data.models
    .filter((m) => !/cloud/i.test(m.name) && m.name !== "openmemory-classifier:reviewed730")
    .sort((a, b) => (b.size ?? 0) - (a.size ?? 0))
    .map((m) => m.name);
}
export async function planWithProvider(
  data: { memories: Memory[]; today: string; text: string },
  settings: AISettings,
  signal?: AbortSignal,
  classification?: ClassificationMetadata,
  expectedModelDigest?: string,
) {
  signal?.throwIfAborted();
  const chunks = splitCaptureNote(data.text);
  if (classification) {
    if (
      classification.source !== data.text ||
      classification.contractVersion !== classificationContractVersion
    )
      throw new Error(
        "Classification advice belongs to different original words or a different contract.",
      );
    associateClassification(data.text, classification.advice);
    if (chunks.length !== 1)
      throw new Error(
        "Whole-note classification cannot be applied to separate source chunks. Review each event through normal extraction.",
      );
    if (settings.provider !== "ollama")
      throw new Error("Local classification advice cannot be forwarded to a cloud provider.");
  }
  if (settings.provider === "astra") return planCapture({ data, ...(signal ? { signal } : {}) });
  const plans: ReturnType<typeof validatePlan>[] = [];
  // Local chunks share one inference runtime. Finish extraction and title
  // verification before starting another chunk; failure returns no partial plan.
  for (const chunk of chunks) {
    const note = classification ? data.text : chunk;
    signal?.throwIfAborted();
    plans.push(
      await interpretCaptureTitles(
        validatePlan(
          await requestOllama(
            captureInstructions(data.today) +
              (classification
                ? "\nclassificationAdvice is optional category/intent DATA, not authority. Reread the original note; this advice may be wrong. Preserve all independent mixed events and ask about missing identity/action. It never authorizes titles, matching IDs, quantities, progress or saving."
                : ""),
            {
              note,
              catalog: captureCatalog(data.memories),
              ...(classification ? { classificationAdvice: classification.advice } : {}),
            },
            capturePlanJson,
            settings.model,
            signal,
            "general",
            expectedModelDigest,
          ),
          data.memories,
          true,
          note,
        ),
        note,
        data.memories,
        (instructions, input, schema) =>
          requestOllama(
            instructions,
            input,
            schema,
            settings.model,
            signal,
            "general",
            expectedModelDigest,
          ),
      ),
    );
  }
  signal?.throwIfAborted();
  return validatePlan({ entries: plans.flatMap((plan) => plan.entries) }, data.memories, false);
}

export type LocalClassificationProfile = { model: string; expectedModelDigest: string };
const localClassificationProfileSchema = z
  .object({
    // A profile identifies one evaluated local artifact; model family names
    // alone do not establish quality. The caller supplies the frozen name/digest.
    model: z
      .string()
      .trim()
      .min(1)
      .max(100)
      .refine((name) => !/cloud|https?:|\/\//i.test(name), "Choose a downloaded local model."),
    expectedModelDigest: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();

// This optional coordinator is inert until an explicit evaluated profile is
// supplied. A classification failure never proceeds to extraction or cloud.
export async function captureWithProvider(
  data: { memories: Memory[]; today: string; text: string },
  settings: AISettings,
  signal?: AbortSignal,
  profile?: LocalClassificationProfile,
): Promise<{
  plan: Awaited<ReturnType<typeof planWithProvider>>;
  classification?: ClassificationMetadata;
  classificationSkipped?: string;
}> {
  signal?.throwIfAborted();
  if (!profile) return { plan: await planWithProvider(data, settings, signal) };
  const selected = localClassificationProfileSchema.parse(profile);
  const matchesSelected = settings.provider === "ollama" && settings.model === selected.model;
  let reason: string | undefined;
  if (!matchesSelected)
    reason =
      "Classification profile does not match the selected local model. Normal extraction was used.";
  else if (splitCaptureNote(data.text).length !== 1)
    reason =
      "This note has separate source chunks. Normal extraction reviews every event without whole-note classification.";
  else if (!data.text.trim() || new Blob([JSON.stringify({ note: data.text })]).size > 1000)
    reason =
      "This note is outside the evaluated classification length. Normal extraction was used without truncating your words.";
  if (reason)
    return {
      plan: await planWithProvider(
        data,
        settings,
        signal,
        undefined,
        matchesSelected ? selected.expectedModelDigest : undefined,
      ),
      classificationSkipped: reason,
    };
  const classification = await classifyWithLocalModel(
    data.text,
    selected.model,
    signal,
    selected.expectedModelDigest,
  );
  signal?.throwIfAborted();
  const plan = await planWithProvider(
    data,
    settings,
    signal,
    classification,
    selected.expectedModelDigest,
  );
  signal?.throwIfAborted();
  return { plan, classification };
}
export async function mapWithProvider(
  data: { memories: Memory[]; today: string },
  settings: AISettings,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  if (settings.provider === "astra") return mapMemories({ data, ...(signal ? { signal } : {}) });
  if (data.memories.length < 2) return { connections: [] };
  const result = graphResultSchema.parse(
    await requestOllama(
      graphInstructions(data.today),
      { memories: memoryContext(data.memories) },
      graphJson,
      settings.model,
      signal,
    ),
  );
  return { connections: validateConnections(result.connections, data.memories) };
}
export async function connectWithProvider(
  data: { memories: Memory[]; today: string; question: string },
  settings: AISettings,
) {
  if (settings.provider === "astra") return connectMemories({ data });
  const result = synthesisSchema.parse(
    await requestOllama(
      synthesisInstructions(data.today),
      { memories: memoryContext(data.memories), question: data.question },
      synthesisJson,
      settings.model,
    ),
  );
  return validateReferences(result, data.memories);
}
export async function discoverWithProvider(
  memories: Memory[],
  settings: AISettings,
  skipped: string[],
) {
  const taste = buildTaste(memories, skipped);
  if (!taste.liked.length) return { suggestions: [] };
  if (settings.provider === "astra") return discoverLibrary({ data: taste });
  return validateDiscovery(
    await requestOllama(discoveryInstructions, taste, discoveryJson, settings.model),
    taste,
  );
}
