import { z } from "zod";
import { classifierDigests, classifierName } from "./local-ollama";

export type LocalSetupCheck = {
  state: "ready" | "missing" | "changed" | "blocked" | "unverified";
  message: string;
};
export type LocalOllamaReadiness = {
  ready: boolean;
  models: string[];
  connection: LocalSetupCheck;
  classifier: LocalSetupCheck;
  extractor: LocalSetupCheck;
};

const tagsSchema = z.object({
  models: z.array(z.object({ name: z.string(), digest: z.string() })),
});
const metadataSchema = z.object({
  remote_model: z.unknown().optional(),
  remote_host: z.unknown().optional(),
  details: z.object({ format: z.string() }),
});
const unchecked = (): LocalSetupCheck => ({
  state: "unverified",
  message: "Not checked. Connect to local Ollama, then retry.",
});

// Invoked only by an explicit user action. Sends model names, never note content.
export async function checkLocalOllamaSetup(extractorModel: string): Promise<LocalOllamaReadiness> {
  const overallSignal = AbortSignal.timeout(15000);
  const request = (path: "tags" | "show", model?: string) =>
    fetch(`http://127.0.0.1:11434/api/${path}`, {
      method: model ? "POST" : "GET",
      credentials: "omit",
      redirect: "error",
      referrerPolicy: "no-referrer",
      signal: AbortSignal.any([overallSignal, AbortSignal.timeout(5000)]),
      ...(model
        ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model }) }
        : {}),
    });
  const result: LocalOllamaReadiness = {
    ready: false,
    models: [],
    connection: unchecked(),
    classifier: unchecked(),
    extractor: unchecked(),
  };
  let tags: z.infer<typeof tagsSchema>;
  try {
    const response = await request("tags");
    if (response.status === 403) {
      result.connection = {
        state: "blocked",
        message:
          "Ollama rejected this website’s origin. Allow this site’s exact origin in OLLAMA_ORIGINS, restart Ollama, then retry.",
      };
      return result;
    }
    if (!response.ok) throw new Error("Unable to read model inventory");
    tags = tagsSchema.parse(await response.json());
    result.models = tags.models
      .map(({ name }) => name)
      .filter((name) => name !== classifierName && !/cloud|https?:|\/\//i.test(name));
    result.connection = { state: "ready", message: "Browser connected to local Ollama." };
  } catch {
    result.connection = {
      state: "blocked",
      message:
        "Your browser couldn't connect to Ollama on this computer. Start Ollama, allow this site's origin and browser local network access, then retry. In an in-app browser, try Chrome or OpenMemory locally. The browser cannot distinguish a stopped service from a blocked permission.",
    };
    return result;
  }

  async function localMetadata(model: string): Promise<LocalSetupCheck> {
    try {
      const response = await request("show", model);
      if (response.status === 403)
        return {
          state: "blocked",
          message: "Browser access was rejected. Allow this site’s origin and retry.",
        };
      if (response.status === 404)
        return {
          state: "missing",
          message: "Model is no longer installed. Install it and check again.",
        };
      if (!response.ok) throw new Error("Metadata unavailable");
      const metadata = metadataSchema.parse(await response.json());
      if (
        metadata.remote_model ||
        metadata.remote_host ||
        !["gguf", "safetensors"].includes(metadata.details.format)
      )
        return {
          state: "blocked",
          message:
            "Model metadata does not verify a local model. Use an installed local model with cloud features disabled.",
        };
      return { state: "ready", message: "Installed local model verified." };
    } catch {
      return {
        state: "unverified",
        message:
          "Could not verify model metadata. Check Ollama and browser permissions, then retry.",
      };
    }
  }

  const classifiers = tags.models.filter(({ name }) => name === classifierName);
  if (!classifiers.length) {
    result.classifier = {
      state: "missing",
      message: `Install ${classifierName} from the trained classifier package using its setup guide, then check again. A general Ollama model cannot replace this classifier.`,
    };
  } else if (
    classifiers.length !== 1 ||
    !classifierDigests.includes(classifiers[0]?.digest ?? "")
  ) {
    result.classifier = {
      state: "changed",
      message:
        "Classifier digest does not match the evaluated model. Reinstall the verified classifier package using its setup guide, then check again.",
    };
  } else {
    result.classifier = await localMetadata(classifierName);
    if (result.classifier.state === "ready")
      result.classifier.message =
        "Trained classifier installed; exact evaluated digest and local metadata verified.";
  }

  const selected = extractorModel.trim();
  if (!selected || selected === classifierName || /cloud|https?:|\/\//i.test(selected)) {
    result.extractor = {
      state: "missing",
      message:
        "Choose a downloaded general local model for extraction, different from the trained classifier.",
    };
  } else {
    const names = selected.includes(":") ? [selected] : [selected, `${selected}:latest`];
    const installed = tags.models.find(({ name }) => names.includes(name));
    result.extractor = installed
      ? await localMetadata(installed.name)
      : {
          state: "missing",
          message: `${selected} is not installed. Download a general local extraction model in Ollama, enter its name here, then check again.`,
        };
  }
  result.ready = [result.connection, result.classifier, result.extractor].every(
    ({ state }) => state === "ready",
  );
  return result;
}
