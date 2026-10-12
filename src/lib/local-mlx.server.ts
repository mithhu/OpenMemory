import { platform } from "node:os";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { spawn } from "node:child_process";
import { getRequest } from "@tanstack/react-start/server";
import { classificationAdviceSchema } from "./classification";
import { z } from "zod";

let busy = false;
export async function runLocalMlx(text: string) {
  const request = getRequest();
  const origin = new URL(request.url).origin;
  if (
    !isLoopbackOrigin(origin) ||
    (request.headers.get("origin") && request.headers.get("origin") !== origin)
  )
    throw new Error("Local MLX requires a same-origin app running on localhost.");
  if (platform() !== "darwin")
    throw new Error(
      "MLX requires an Apple silicon Mac. Choose Local Ollama or review manually. No cloud fallback was used.",
    );
  if (!text.trim() || Buffer.byteLength(JSON.stringify({ note: text })) > 1000)
    throw new Error(
      "Use a shorter note for local MLX classification. Your words were not truncated.",
    );
  const python = resolve(process.cwd(), ".local-runtime/venv/bin/python");
  if (!existsSync(python))
    throw new Error(
      "Local MLX is not installed on this computer. Choose Local Ollama or review manually. No cloud fallback was used.",
    );
  if (busy) throw new Error("MLX is finishing the previous request. Try again shortly.");
  busy = true;
  try {
    return await new Promise<z.infer<typeof resultSchema>>((resolve, reject) => {
      const child = spawn(python, ["scripts/app-mlx/classify.py"], {
        cwd: process.cwd(),
        stdio: ["pipe", "pipe", "pipe"],
        env: { ...process.env, HF_HUB_OFFLINE: "1", TRANSFORMERS_OFFLINE: "1" },
      });
      let stdout = "",
        stderr = "";
      child.stdout.on("data", (chunk) => {
        stdout += chunk;
      });
      child.stderr.on("data", (chunk) => {
        stderr = (stderr + chunk).slice(-3000);
      });
      child.on("error", reject);
      child.on("close", (code) => {
        if (code !== 0)
          return reject(
            new Error(
              `Local MLX failed; no extraction or cloud fallback was used. ${stderr.slice(-1500)}`,
            ),
          );
        try {
          resolve(resultSchema.parse(JSON.parse(stdout)));
        } catch {
          reject(new Error("MLX returned an invalid classification; review manually."));
        }
      });
      child.stdin.end(JSON.stringify({ text }));
    });
  } finally {
    busy = false;
  }
}
const resultSchema = z
  .object({
    advice: classificationAdviceSchema,
    adapterSha256: z.literal("8724245782e5c709bf7ccd7b3631a944472bfb071d6cc659a9bcc5cb51143f01"),
    seconds: z.number(),
    totalSeconds: z.number(),
    peakBytes: z.number(),
  })
  .strict();

export function isLoopbackOrigin(origin: string) {
  const url = new URL(origin);
  return (
    ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) &&
    ["http:", "https:"].includes(url.protocol)
  );
}
