import { createServerFn } from "@tanstack/react-start";

export const MAX_AUDIO_BYTES = 6 * 1024 * 1024;
export const audioTypes = ["audio/webm", "audio/mp4", "audio/ogg", "audio/wav", "audio/mpeg"];

export function validateAudio(input: unknown) {
  if (!(input instanceof FormData)) throw new Error("Upload a recorded audio file.");
  const file = input.get("audio");
  if (!(file instanceof Blob) || file.size < 100 || file.size > MAX_AUDIO_BYTES)
    throw new Error("Record a short note, up to two minutes and 6 MB.");
  if (!audioTypes.includes(file.type.split(";")[0] ?? ""))
    throw new Error("Unsupported audio format.");
  return { file };
}
export const getVoiceStatus = createServerFn({ method: "GET" }).handler(async () => {
  const { voiceConfiguration } = await import("./voice.server");
  return voiceConfiguration();
});
export const transcribeVoice = createServerFn({ method: "POST" })
  .validator(validateAudio)
  .handler(async ({ data }) => {
    const { transcribe } = await import("./voice.server");
    return transcribe(data.file);
  });
