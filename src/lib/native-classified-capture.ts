import { z } from "zod";
import { planWithProvider, type AISettings } from "./ai-client";
import { associateClassification } from "./classification";
import { splitCaptureNote } from "./source-chunks";
import {
  NativeCompanionClient,
  NativeCompanionError,
  NATIVE_CLASSIFIER_PROFILE,
} from "./native-companion";

// Inactive composition only. No route, settings, artifact qualification or save authority.
const profileSchema = z
  .object({
    classifierProfile: z.literal(NATIVE_CLASSIFIER_PROFILE),
    extractor: z
      .object({
        model: z
          .string()
          .min(1)
          .max(100)
          .refine(
            (name) => name === name.trim() && !/cloud|https?:|\/\//i.test(name),
            "Choose an explicit downloaded local extractor.",
          ),
        expectedModelDigest: z.string().regex(/^[a-f0-9]{64}$/),
      })
      .strict(),
  })
  .strict();
export type NativeClassifiedCaptureProfile = z.infer<typeof profileSchema>;

export async function captureWithNativeClassification(
  data: Parameters<typeof planWithProvider>[0],
  settings: AISettings,
  client: NativeCompanionClient,
  profile: NativeClassifiedCaptureProfile,
  signal?: AbortSignal,
) {
  const pinned = profileSchema.parse(profile);
  // Bind source and provider values before asynchronous classification.
  const input = { ...data };
  const extractionSettings = { ...settings };
  if (
    extractionSettings.provider !== "ollama" ||
    extractionSettings.model !== pinned.extractor.model
  )
    throw new Error(
      "Native classification requires the separately pinned local extraction provider/model.",
    );
  const readyForExtraction = () => {
    signal?.throwIfAborted();
    if (client.cleanupPending) throw new NativeCompanionError("busy", true);
  };
  readyForExtraction();
  if (splitCaptureNote(input.text).length !== 1) {
    readyForExtraction();
    const plan = await planWithProvider(
      input,
      extractionSettings,
      signal,
      undefined,
      pinned.extractor.expectedModelDigest,
    );
    readyForExtraction();
    return {
      plan,
      classificationSkipped:
        "This note has separate source chunks. Pinned local extraction reviews each event without whole-note classification advice.",
    };
  }
  const advice = await client.classify(input.text, signal ? { signal } : {});
  readyForExtraction();
  const classification = associateClassification(input.text, advice);
  const plan = await planWithProvider(
    input,
    extractionSettings,
    signal,
    classification,
    pinned.extractor.expectedModelDigest,
  );
  readyForExtraction();
  return { plan, classification };
}
