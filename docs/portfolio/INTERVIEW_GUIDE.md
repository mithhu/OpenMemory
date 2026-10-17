# OpenMemory interview learning guide

Use this to understand the work, not memorize claims. The [case study](CASE_STUDY.md) is the short public story; the [research repository](https://github.com/mithhu/openmemory-local-classifier-research) contains the detailed evidence and learning guide.

## A 45-second explanation

“I built a personal memory app that turns natural notes into reviewable records. I wanted to explore whether a local model could improve category and action classification. With substantial AI assistance, I ran MLX LoRA fine-tuning on a frozen 4-bit Qwen3.5-9B base using 730 examples, compared models with the same prompt, and integrated the adapter into a local-first review flow. On a 200-expression test it improved joint correctness from 67% to 76.5%, but a majority predictor scored 81%, so I published it as experimental. The most useful lessons were measuring regressions, separating classification from extraction and keeping the user in control.”

## Questions you should be able to answer

**What did you train?** Small low-rank adapter matrices attached to the final transformer layer's attention/MLP projections. The pretrained base weights remained frozen. There were 638,976 trainable adapter values in 14 arrays. This is not a newly trained 9B model.

**What is LoRA?** A projection can be adapted as W′ = W + sBA, where W stays frozen and A/B are smaller trainable matrices. Rank limits the update's size. Our recorded config has rank 8 and scale 20; verify implementation conventions before claiming that scale means a particular alpha/r formula.

**What does 4-bit mean?** The base weights are stored in a quantized representation to reduce memory. That does not mean every activation, optimizer value or adapter tensor is four bits. This release uses MLX on Apple silicon; it is not interchangeable with a browser model or arbitrary Ollama import.

**What is response-only loss?** Training loss is applied to the target answer tokens rather than treating all input prompt tokens as targets. Our historical recipe used a maximum 768-token training sequence and a 64-token answer projection window. Inference used at most 80 output tokens. Those are different limits.

**Where did the labels come from?** Public wording from ConvAI2, CCPE-M and SNIPS, plus fictional project notes, with AI-assisted supervision under app policy. The upstream datasets were not originally human-labeled for all of our app categories/intents. Never call those task labels independent human gold.

**Why compare to the base and a majority predictor?** The same-base comparison isolates the adapter's change under matched prompting/decoding. A majority predictor tests whether the score is mostly exploiting class frequency. Our adapter beat its base but lost to that simple baseline on the skewed 200-note set.

**Why not report the 90% development score as final accuracy?** Development examples were exposed during iteration and can guide selection. Their distributions and denominators also differ. The frozen 200-note report is separate and includes both labels jointly; do not combine cohorts or substitute an easier metric.

**Was the test independent?** It had zero exact/normalized training-note overlap and was frozen for the reported run. Labels were AI-assigned; semantic, author and upstream-pretraining independence were not established. “Unseen source expressions under our checks” is more accurate than “independent human gold.”

**What failed?** Some category slices regressed; reaction behavior was weak; later TV and action/clarification candidates failed gates. The extractor could also choose a wrong title or omit an amount. Failed candidates were retained as evidence, not installed because they looked better on one subset.

**What does JSON validation solve?** Shape, allowed labels and some contradictions. It cannot establish that an otherwise valid label or title is true. Our research comparison used raw generation; the app's bounded constrained retry is a different integration behavior.

**What runs locally versus in the cloud?** MLX mode classifies locally, then a local Ollama model extracts. Ollama mode uses the converted trained classifier, then a separate extractor. Explicitly selected OpenAI is cloud processing. Optional ElevenLabs transcription sends audio to that service. Browser storage and review are separate from each provider.

**What did you personally contribute?** Explain your product goals, choices, tests you understand and tradeoffs. Be candid that implementation, training orchestration, labeling/review and analysis were substantially AI-assisted. Read and explain one trainer, one evaluator and one integration boundary before claiming ownership of their technical details.

**Can someone reproduce it?** The package pins the adapter, prompt, base manifest and requirements. It includes inference and verification, and links to ordered data and the actual trace. Archived tokenization and a two-update trainer smoke were verified; a fresh bit-identical full run was not established.

## Practice before applying

1. Run the released inference example and explain the two output fields.
2. Read the model card and recompute a score from the paired predictions.
3. Trace one note through classifier, extractor, review and Save.
4. Explain why “finished it” needs identity clarification even if completion is known.
5. Explain why a movie plan must not invent a viewing event or reminder date.
6. Describe one rejected experiment and the gate it failed.

A defensible CV bullet: “Completed an AI-assisted MLX LoRA fine-tuning and evaluation project for a local-first memory app; published an experimental adapter, reproducible evidence and a reviewed capture flow, documenting both improvements and regressions.”

Avoid “beat frontier models,” “solved personal-memory classification,” “production-ready 94% accuracy,” or “trained a 9B model from scratch.” None is established by this work.
