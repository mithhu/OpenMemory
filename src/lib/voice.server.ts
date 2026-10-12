import "@tanstack/react-start/server-only";
import { z } from "zod";

export function voiceConfiguration() {
  return { configured: Boolean(process.env["ELEVENLABS_API_KEY"]), model: "scribe_v2" };
}
export async function transcribe(file: Blob) {
  const key = process.env["ELEVENLABS_API_KEY"];
  if (!key) throw new Error("Add ELEVENLABS_API_KEY on the server and restart it to enable voice.");
  const extension = file.type.includes("mp4")
    ? "m4a"
    : file.type.includes("ogg")
      ? "ogg"
      : file.type.includes("wav")
        ? "wav"
        : file.type.includes("mpeg")
          ? "mp3"
          : "webm";
  const body = new FormData();
  body.append("file", file, `voice-note.${extension}`);
  body.append("model_id", "scribe_v2");
  body.append("tag_audio_events", "false");
  body.append("diarize", "false");
  // No language_code: the service detects the spoken language.
  let response: Response;
  try {
    response = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
      method: "POST",
      headers: { "xi-api-key": key },
      body,
      signal: AbortSignal.timeout(90000),
    });
  } catch {
    throw new Error(
      "Transcription couldn't finish in time. Your recording is still here; try again.",
    );
  }
  if (!response.ok) {
    if (response.status === 401 || response.status === 403)
      throw new Error(
        "ElevenLabs rejected the key or speech-to-text access. Check the server key's permissions.",
      );
    if (response.status === 429)
      throw new Error(
        "ElevenLabs is at its credit or rate limit. Keep your recording and try again later.",
      );
    throw new Error(
      `Transcription failed (HTTP ${response.status}). You can retry your recording.`,
    );
  }
  const result = z
    .object({ text: z.string().trim().max(16000), language_code: z.string().optional() })
    .parse(await response.json());
  if (!result.text) throw new Error("No speech was detected. Try a clearer recording.");
  return { text: result.text, language: result.language_code ?? null };
}
