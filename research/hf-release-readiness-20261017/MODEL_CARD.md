---
language:
- en
license: apache-2.0
base_model: mlx-community/Qwen3.5-9B-4bit
base_model_relation: adapter
library_name: mlx
tags:
- lora
- mlx
- text-classification
- personal-memory
- research
---

# OpenMemory reviewed730 MLX adapter

**Experimental legacy-v3 research adapter. Not the TV-series or structured-v5 model.**

The frozen 200-note holdout improved over the same unadapted base (67.0% → 76.5% joint), but stayed below the 81.0% NOTE/none majority baseline. Labels were AI-assigned, not independent human gold. Several classes are poorly tested, and older qualification gates were not passed. This is an artifact of documented local fine-tuning, not a production-ready classifier or a frontier-model comparison.

## Intended use

Experimental English category/intent advice for user-reviewed personal-note capture. It returns one category from NOTE, PERSON, GOAL, WISHLIST, IDEA, MOVIE, BOOK, MUSIC, LESSON, MIXED and one legacy intent from none, wishlist, start, progress, complete, listen, reaction, clarify, mixed. It is not a general assistant, extractor, autonomous memory writer, or high-stakes classifier.

## Model and training

Pinned 4-bit base: `mlx-community/Qwen3.5-9B-4bit`, revision `8b2b98c00a6b4d291155e4890773ca8f769aee53`. The original Qwen3.5 base is Apache 2.0; this package preserves its license. Only638,976 LoRA values in14 final-layer arrays train, with rank 8/scale 20/dropout 0. The selected adapter hash is `8724245782e5c709bf7ccd7b3631a944472bfb071d6cc659a9bcc5cb51143f01`.

The historical run used730 examples, one epoch, batch 1, Adam 1e-5, seed 20261011, at most 768 training tokens with a 64-token answer projection window, and response-only loss. Base weights remained frozen. The actual ordered loss log, tokenization fingerprints, saved config and paired development predictions are included. A separate two-update native trainer sanity check passed. The portable training script reconstructs the recipe and verifies all 730 archived tokenizations; it does not claim a newly reproduced bit-identical full training run.

Data:415 ConvAI2,78 CCPE-M,43 SNIPS and 194 fictional AI-assisted project examples. See `DATA_SOURCES.md` for terms, attribution and added annotations. This is mixed public dialogue/command wording and synthetic supervision, not a representative private diary corpus. No consumer vault or voice recording was used in this release.

## Evaluation

On208 exposed development examples, category correctness changed188→196 and supported intent correctness131→176 out of195. Invalid outputs changed2→1. Public intent regressed and reaction intent was0/4; the adapter failed the old multi-model qualification gates. A later 856-row extension regressed intent and was rejected.

On the frozen 200-expression source holdout, joint accuracy improved 134/200 (67.0%) to 153/200 (76.5%), category 154/200 to 165/200, and intent 161/200 to 174/200. The majority NOTE/none joint baseline is 162/200 (81.0%), above the adapter. There were31 paired gains and12 losses; the paired 95% interval is+3to+16points and exact McNemar p=.0054. PERSON and MOVIE categories regressed. Both models returned 0 invalid outputs. This supports a limited improvement over the base, not broad task readiness.

`FINAL_EVALUATION.md` reports the single frozen 200-expression comparison of this exact adapter against its exact unadapted base. Raw greedy decoding, prompt, tokenizer and case order match; no grammar repair is used for either model in that comparison. App-side bounded retry is a separate integration behavior. Labels are AI-assigned under project policy, not independently human-annotated app categories. Several categories/actions have no meaningful test support. Upstream pretraining exposure cannot be ruled out.

## Limitations and risks

- Missing references, mixed events, negation, unfamiliar titles and action ambiguity can be misclassified.
- The legacy clarify label conflates missing identity and missing action; it does not tell the app which question to ask.
- Valid JSON is not proof of correct meaning. Invalid responses must fail closed or be reviewed; output repair cannot fix valid semantic mistakes.
- Classifier accuracy does not validate extraction of titles, quantities, dates or catalog matches. The separate extractor can fail even when this classifier is right.
- Always preserve the original note and require review before saving. Do not infer whole-work completion or substitute a guessed identity merely from these labels.
- English-only evaluation, limited sources, small rare-class denominators, unknown pretraining exposure and AI-assisted labels restrict generalization claims.
- Local runtime needs Apple silicon, the downloaded base and compatible MLX dependencies. No controlled speed or cost advantage over frontier APIs was established.

## Authorship and scope

Mahamudul Hasan Mithhu directed the project and experiments. Data construction/review, implementation, training orchestration and analysis were substantially AI-assisted. The fine-tuning actually executed locally. This is not training a foundation model or a claim of independent expert authorship.

Use measured cohort-specific results in portfolio descriptions. No frontier-superiority, unique-unsolved-capability, or production-ready accuracy claim is made.

## Current release boundary

This bundle preserves the reviewed730 adapter bytes and exact v3 prompt. SERIES is not an output label; neither season/episode tracking nor three-field structured advice was learned in this adapter. Two later TV training candidates failed their own retention gates and are excluded. Structured advice v5 is development policy/data only, not a trained released model. The app can have newer extraction/review features without this artifact gaining those model capabilities.

Legacy clarify cannot distinguish missing identity from unknown action. Never convert it into a confident action or reason by guessing. Model labels do not authorize saving, identity resolution, title correction, quantities, dates or reminders.

## Run locally

Requires Apple silicon and the separately obtained pinned base, tested with Python 3.12.9 and `requirements-mlx.txt`. This is an MLX adapter, not a self-contained foundation model, GGUF/Ollama import, browser/WebGPU model, cloud API endpoint or Transformers pipeline. The small adapter file does not include the base model.

From this downloaded adapter folder:

```sh
python -m pip install -r requirements-mlx.txt
python download_base.py --output /absolute/path/to/base
python run_adapter.py --base /absolute/path/to/base --verify-only
python run_adapter.py --base /absolute/path/to/base --note "I want to read Sapiens."
```

The downloader retrieves the pinned base separately and checks its files. Inference performs no automatic downloads, uploads or persistence. Prediction may be null if raw generation is invalid; it still requires review. The default inference directory is this adapter folder, not a nonexistent adapter subfolder. Download every listed file and avoid mixing versions.

## Reproducibility and authorship

The public [research repository](https://github.com/mithhu/openmemory-local-classifier-research) contains all 730 ordered training rows, the recorded training trace, full paired evaluation outputs, recomputation/verification scripts, attribution and learning guide. A fresh full 730-update bit-identical reproduction has not been established: archived tokenization and a two-update trainer smoke check were verified. One local inference smoke check is not an accuracy evaluation.

Mahamudul Hasan Mithhu directed this substantially AI-assisted project. Describe it as local LoRA fine-tuning and honest evaluation; do not claim independent expert authorship, a unique capability no other model can solve, or superiority over frontier models. See RELEASE_SCOPE.md for the exact upload and exclusion boundary.
