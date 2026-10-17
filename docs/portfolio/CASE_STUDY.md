# From natural notes to reviewed memories: local LoRA fine-tuning

OpenMemory is a personal memory app where people can write naturally, review the interpretation and keep a useful history. The engineering challenge is to distinguish what a note is about from what happened: “I want to read Sapiens” is a book intention, while “I read 20 pages” is partial progress. A valid JSON response can still misunderstand either dimension.

[Try the hosted app](https://open-memory-ai.vercel.app/) · [Application source](https://github.com/mithhu/OpenMemory) · [Research, training data and learning guide](https://github.com/mithhu/openmemory-local-classifier-research) · [Download the experimental MLX adapter](https://huggingface.co/mithhu333/openmemory-qwen3.5-9b-mlx-classifier-v1)

## What I built

I directed an AI-assisted project spanning a React/TypeScript application, local model integration, MLX LoRA experiments and paired evaluation. Implementation, data construction/review and analysis were substantially AI-assisted. Fine-tuning actually ran on my Mac; this is adaptation of an existing model, rather than foundation-model training.

The selected model is Qwen3.5-9B, converted to a pinned 4-bit MLX base. Its base weights stay frozen. Training updates 638,976 LoRA values across 14 final-layer arrays, using rank 8, scale 20, one pass over 730 examples, batch size 1 and learning rate 1e-5. The training mix is 415 ConvAI2, 78 CCPE-M, 43 SNIPS and 194 fictional project examples, with AI-assisted category/intent supervision. Public source wording does not make our task labels independent human gold.

The result is a small category/intent adapter, not a general assistant. The released contract has ten categories and nine legacy intents. TV-series classification is not included in this version.

## What the final comparison showed

The same pinned base and adapter received the same frozen prompt and 200 source expressions, with raw greedy generation and no output repair. Both category and intent must match for joint correctness.

| Model | Joint correctness |
| --- | ---: |
| Unadapted base | 134/200 — 67.0% |
| Reviewed730 adapter | 153/200 — 76.5% |
| Constant NOTE/none baseline | 162/200 — 81.0% |

The adapter improved 9.5 percentage points over its own base, with 31 paired gains and 12 losses. It did **not** beat the majority baseline. The set is dominated by NOTE/none, labels are AI-assigned, and several actions lack meaningful coverage. PERSON and MOVIE category results regressed. This is evidence of a limited task-specific change, not proof of consumer readiness or frontier-model superiority.

Earlier development scores were higher, but those exposed examples are not independent final-test results. Later TV candidates and an action/clarification candidate failed their registered checks and were not promoted. Retaining those failures matters more than selecting the most flattering score.

## How it becomes a product

Typed note → fine-tuned local classifier → separate local extractor → validated review → explicit Save → browser vault.

In native MLX mode, classification runs on the Mac, exits, then Ollama extracts titles and activity details. Sequential execution reduces overlapping memory pressure. The model does not write to the vault. Source checks and review handle uncertain identity, unknown progress, conflicts and completion claims; they do not guarantee semantic correctness.

The hosted app offers manual capture and explicitly selected OpenAI. A Mac user can pair a running MLX companion, or configure local Ollama. Hosting on Vercel does not run native MLX in the visitor's browser. ElevenLabs is optional cloud transcription; its transcript still goes through review. The published MLX adapter is not the separate GGUF conversion used for the app's Ollama classifier.

## What a reviewer can inspect

- Hugging Face contains the actual adapter, pinned base manifest, exact prompt, runner, evaluation, license and attribution.
- The research repository contains ordered training examples, the actual training trace, paired predictions, verification scripts and a learning guide.
- The app repository contains product boundaries, tests and architecture documentation. Consumer memories and API keys are excluded.
- The [narrated demo](NARRATED_DEMO.md) uses actual UI captures and a real local classification. It is an edited walkthrough, not a latency benchmark or another accuracy test.

The release was downloaded anonymously and all 16 file hashes were checked against the prepared bundle. The original 730 archived tokenizations and a separate two-update training smoke were verified; a fresh bit-identical 730-update reproduction has not been established.

## What I learned and would improve

More training examples can regress an existing capability. Category and action require separate measurement. Constrained JSON generation helps validity, not meaning. Model quality and extractor quality require separate tests, and product review remains necessary even when a classifier score improves.

The next scientific improvement would be a compatible uncertainty contract and a class-balanced, carefully adjudicated untouched evaluation, followed by a bounded experiment. It is not justified to claim that this solves a problem no other model can solve. The portfolio contribution is the complete local adaptation, evaluation, failure analysis and reviewed product integration.
