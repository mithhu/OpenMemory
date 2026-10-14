import { classifyWithLocalModel, planWithProvider, type AISettings } from "./ai-client";
import { splitCaptureNote } from "./source-chunks";

export const classifierName = "openmemory-classifier:reviewed730";
export const classifierDigest = "235b080b2654c6784f979b3e61d63f84bf7a0e7261e0788d140ed5abd273928c";
// Both profiles contain the same immutable evaluated GGUF and adapter weights.
// The portable install has reproducible packaging metadata; retain the legacy install.
export const classifierDigests: readonly string[] = [
  classifierDigest,
  "36bbc6957db688195c977022e113c7fb96be6dcbbf3a2a92cf73a3f46fff77e8",
];

export async function captureWithLocalOllama(
  data: Parameters<typeof planWithProvider>[0],
  settings: AISettings,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  if (settings.provider !== "ollama")
    throw new Error("Trained local classification requires an Ollama extractor.");
  if (settings.model === classifierName)
    throw new Error(
      "Choose a general local model for extraction; the trained classifier is selected separately.",
    );
  // Always classify the exact whole note first. Missing/changed classifiers,
  // invalid advice and sources outside the evaluated bound stop capture.
  const classification = await classifyWithLocalModel(
    data.text,
    classifierName,
    signal,
    classifierDigests,
  );
  signal?.throwIfAborted();
  const plan = await planWithProvider(
    data,
    settings,
    signal,
    splitCaptureNote(data.text).length === 1 ? classification : undefined,
  );
  signal?.throwIfAborted();
  return { plan, classification };
}
