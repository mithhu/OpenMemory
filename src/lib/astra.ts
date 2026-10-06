import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { memorySchema } from "./memory";

const context = z.object({
  memories: z.array(memorySchema).max(200),
  today: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
export const getAstraStatus = createServerFn({ method: "GET" }).handler(async () => {
  const { configuration } = await import("./astra.server");
  return configuration();
});
export const captureMemory = createServerFn({ method: "POST" })
  .validator(
    context.extend({
      text: z.string().trim().min(1).max(16000),
      forcedId: z.string().max(100).optional(),
    }),
  )
  .handler(async ({ data }) => {
    const { capture } = await import("./astra.server");
    return capture(data);
  });
export const connectMemories = createServerFn({ method: "POST" })
  .validator(context.extend({ question: z.string().trim().max(3000) }))
  .handler(async ({ data }) => {
    const { synthesize } = await import("./astra.server");
    return synthesize(data);
  });
export const mapMemories = createServerFn({ method: "POST" })
  .validator(context)
  .handler(async ({ data }) => {
    const { mapMemoryGraph } = await import("./astra.server");
    return mapMemoryGraph(data);
  });
