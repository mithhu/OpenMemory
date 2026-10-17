# OpenMemory portfolio

Start with the [concise case study](portfolio/CASE_STUDY.md), then the [two-minute demo](portfolio/DEMO.md). Use the [interview learning guide](portfolio/INTERVIEW_GUIDE.md) to prepare a technically accurate explanation.

| Artifact | What it demonstrates |
| --- | --- |
| [Hosted application](https://open-memory-ai.vercel.app/) | Consumer capture, review and persistence; hosted manual/cloud flow and optional local pairing |
| [Application source](https://github.com/mithhu/OpenMemory) | Frontend, provider boundaries, browser storage, tests and product integration |
| [Research repository](https://github.com/mithhu/openmemory-local-classifier-research) | Actual local training, ordered data, paired evaluation, provenance and learning guide |
| [Hugging Face adapter](https://huggingface.co/mithhu333/openmemory-qwen3.5-9b-mlx-classifier-v1) | Downloadable experimental reviewed730 native MLX weights and exact inference package |

The model release is public. All 16 payload files were downloaded anonymously and checked against local hashes at immutable revision `1e57e27b6eccd97c7f568ffc59f902e34a9746a1`. The publication receipt is in `research/hf-release-readiness-20261017/PUBLICATION.json`.

Lead job applications with the user problem and working flow, then explain the measured training result and its limitations. The adapter improved over its base on the frozen 200-expression comparison (67.0% to 76.5% joint), but was below the 81.0% majority baseline. It is experimental and lacks TV-series support. Do not substitute development results for final-test accuracy or imply frontier superiority.

Model binaries, private vaults, environment files and full working archives stay out of this product repository. The public native MLX package does not include the app's Ollama GGUF installation package. Hosting the website does not install or run the native model on a visitor's device.

No job applications, public promotional posts or new model training are part of this portfolio preparation.
