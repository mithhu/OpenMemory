Current native MLX portfolio walkthrough: [demo and provenance](portfolio/DEMO.md). The October 14 walkthrough below used the converted Ollama classifier and ElevenLabs, a different path from the native MLX release.

# OpenMemory local AI demo — historical voice walkthrough

The demo uses a synthesized fictional voice sample, not a recording of the project owner's voice. UI frames are captured from the actual application and edited into a short walkthrough; this is not a real-time latency benchmark.

## Script

1. Show Privacy & AI: run Check local setup, verify browser/service, trained classifier and extraction model, then choose Local Ollama.
2. Open Speak a memory. Load the sample: “I want to watch the movie Arrival from 2016 this weekend.”
3. Select Transcribe. ElevenLabs processes the sample audio; the editable transcript appears in the composer. It does not save a memory or automatically call a classifier.
4. Select Review memory. The pinned trained classifier returns MOVIE / wishlist; a separate local model extracts details.
5. Review the category, title and action. In this run the extractor proposed “Arrival from 2016” and an unnecessary clarification; the reviewer changed the title to “Arrival”, which cleared the title check. Then explicitly Save.
6. Show the resulting library item. Memories persist in the browser vault; cloud transcription and local reasoning are distinct steps.

The demo contains only fictional test data in an isolated local preview. No personal vault, credentials or API-key screens are included. Normal users can record their own voice; the demo uses file upload to avoid collecting microphone audio from anyone nearby.

Model installation is a separate, one-time step. The package is prepared locally; the native MLX adapter was subsequently published on [Hugging Face](https://huggingface.co/mithhu333/openmemory-qwen3.5-9b-mlx-classifier-v1). This does not publish the separate Ollama package. The setup guide is [LOCAL_MODEL_SETUP.md](LOCAL_MODEL_SETUP.md).

## Recorded validation (14 October 2026)

The full flow passed in an isolated hosted-mode preview on this Mac using the original evaluated Ollama classifier and local Qwen extraction. ElevenLabs returned the sample text correctly (omitting terminal punctuation). The saved library showed Arrival as Movie / Wishlist. The edited walkthrough skips processing waits and includes a manual title correction; it must not be presented as a speed benchmark or fully automatic extraction. The clean package installation is tested separately.
