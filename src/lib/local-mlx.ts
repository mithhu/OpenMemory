import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { associateClassification } from "./classification";
import { planWithProvider } from "./ai-client";
import { splitCaptureNote } from "./source-chunks";

export const localMlxSettings = { provider: "ollama", model: "qwen3.5:9b" } as const;
const extractorDigest = "6488c96fa5faab64bb65cbd30d4289e20e6130ef535a93ef9a49f42eda893ea7";
const classify = createServerFn({ method: "POST" })
  .validator(z.object({ text: z.string().min(1).max(1000) }).strict())
  .handler(async ({ data }) => {
    const { runLocalMlx } = await import("./local-mlx.server");
    return runLocalMlx(data.text);
  });

export async function captureWithLocalMlx(
  data: Parameters<typeof planWithProvider>[0],
  signal?: AbortSignal,
) {
  const started = performance.now();
  signal?.throwIfAborted();
  // Classify the exact whole source, including mixed notes. Never apply whole-note
  // advice to separate chunks; the review compares it to the full extracted plan.
  const result = await classify({ data: { text: data.text }, ...(signal ? { signal } : {}) });
  signal?.throwIfAborted();
  const classification = associateClassification(data.text, result.advice);
  const extractionStarted = performance.now();
  const plan = await planWithProvider(
    data,
    localMlxSettings,
    signal,
    splitCaptureNote(data.text).length === 1 ? classification : undefined,
    extractorDigest,
  );
  signal?.throwIfAborted();
  console.info(
    "MLX capture timings",
    JSON.stringify({
      classificationSeconds: result.totalSeconds,
      extractionSeconds: (performance.now() - extractionStarted) / 1000,
      totalSeconds: (performance.now() - started) / 1000,
      advice: classification.advice,
    }),
  );
  return { plan, classification };
}
