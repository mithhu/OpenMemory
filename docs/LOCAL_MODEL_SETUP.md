# Set up local AI for OpenMemory

OpenMemory works with manual review or optional OpenAI without installing a local model. For local AI, the website uses models running on **your computer**. It cannot use the project owner's Mac.

## What you need

- Ollama installed and running locally. The tested version is 0.32.11; the installer verifies the resulting model identities.
- Python 3.9 or later for the small standalone installer; no MLX, PyTorch or training environment is required for the Ollama option.
- The separate `openmemory-classifier-reviewed730.zip` package from the project maintainer. It contains our trained adapter, installer, model card, checksums and evaluation evidence. A public Hugging Face download has not been published yet. The app repository does not contain the weights.
- About 22 GB free disk space during the initial 6.6 GB pinned-base download/import. After temporary-file cleanup, the model cache uses about 6.6 GB plus the small adapter. The tested machine is an 18 GB Apple Silicon Mac; other hardware has not been performance-qualified.

## Install the trained classifier

1. Unzip the separate model package and open Terminal in that folder. Keep Ollama running.
2. Verify the package, then install:

```sh
python3 verify-package.py
python3 install.py --download-base
```

The download is explicit and is only needed on a fresh installation. It retrieves an immutable base GGUF file from Ollama's official registry, checks its byte count and SHA-256, then imports it as `openmemory-base:reviewed730`. The classifier is imported as `openmemory-classifier:reviewed730`. Ordinary Qwen models are not replaced.

The current public `qwen3.5:9b` tag points to different weights, so the installer does **not** substitute a generic `ollama pull` for the reviewed base. Existing verified legacy OpenMemory installations are recognized without reinstalling their models. An unknown existing classifier is preserved and reported for manual resolution.

To verify an existing installation without downloads or model changes:

```sh
python3 install.py --check-only
```

## Allow the deployed website

For the Ollama Mac app, run:

```sh
launchctl setenv OLLAMA_ORIGINS "https://open-memory-ai.vercel.app"
launchctl setenv OLLAMA_NO_CLOUD "1"
```

Quit and reopen Ollama to apply these settings. These values apply to the current login session. Preserve any other exact allowed origins if needed; avoid wildcard origins. For Linux/Windows, apply the corresponding environment variables to the Ollama service before starting it. Keep its listener on loopback.

Open the deployed site in Chrome. Allow local-network access if prompted. Some in-app browsers block local connections.

## Connect and check

1. Open **Privacy & AI**.
2. Choose `openmemory-base:reviewed730` as the extraction model on a fresh installation. Existing users may keep their installed general extractor such as `qwen3.5:9b`. The classifier is chosen automatically; do not choose it as the extractor.
3. Click **Check local setup**. The app separately checks browser/service access, the verified trained classifier and the selected extractor. It sends model names and metadata, not notes.
4. When all checks pass, select **Local Ollama**. A successful check does not select it automatically.
5. Type a note, click **Review memory**, check the suggestions, then choose **Save**.

The order is trained classification → general-model extraction → your review → explicit Save. Missing/changed models never trigger an automatic cloud fallback. Manual review stays available.

## Local MLX

The package also preserves the original native MLX adapter under `mlx/`. It requires an Apple Silicon Mac, the exact matching native base/runtime and a separately running OpenMemory companion. It is an advanced path; the Ollama installer does not install MLX or the companion automatically. The [local-first guide](LOCAL_FIRST.md) documents pairing. Native MLX still has better intent accuracy on the existing development set.

## Voice and storage

Voice is optional. Audio goes to ElevenLabs only when you select **Transcribe**. You can edit the transcript; subsequent review uses your chosen processing option. Typed local capture needs no cloud API. Memories are saved in the browser's vault, not inside the model package, and do not sync automatically between devices or origins.

## If a check fails

- **Browser connection:** start Ollama, allow the exact website origin, restart it, then allow Chrome local-network access. Browser errors cannot reliably distinguish a stopped service from a permission block.
- **Classifier missing:** run the separate package installer. Installing a general chat model alone is insufficient.
- **Classifier version changed:** the app accepts only the reviewed legacy and portable identities. Preserve your existing model and ask the maintainer before replacing it.
- **Extractor missing:** select an installed general model; the pinned base installed with the package can serve this role.
- **Download interrupted/corrupt:** the installer removes its incomplete temporary base file and refuses to import unverified weights. Retry the explicit download.

## Verification on 14 October 2026

The standalone package installed successfully into an empty isolated Ollama cache using system Python 3.9.6 from outside the application checkout. The full official base download passed byte-count and SHA-256 verification; the imported base, classifier and adapter matched the pinned identities. The installer removed its temporary base download after import. The first attempt had failed during import because disk space fell; the revised installer checks space before both download and import, and the retry passed after storage was freed.

The app checks passed in an isolated hosted-mode preview; the speech-to-save walkthrough is documented in [LOCAL_MODEL_DEMO.md](LOCAL_MODEL_DEMO.md). These installation and runtime checks are separate from model accuracy evaluation. The published scores remain development evidence, not an independent final benchmark.
