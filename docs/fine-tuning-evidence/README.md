# Evidence: actual MLX LoRA fine-tuning

OpenMemory's category/intent classifier was trained locally, evaluated against its unadapted base, and integrated into the app. This folder contains a small CPU-verifiable evidence export. It includes both improvements and regressions, rather than presenting the selected adapter as production-qualified.

## What actually changed

| Same-base development comparison | Unadapted Qwen3.5-9B | Reviewed730 adapter | Change |
| --- | --- | --- | --- |
| Category accuracy | 188/208 · 90.38% | 196/208 · 94.23% | +3.85 percentage points |
| Supported intent accuracy | 131/195 · 67.18% | 176/195 · 90.26% | +23.08 percentage points |
| Invalid classification outputs | 2/208 | 1/208 | One fewer |

All 208 paired rows have matching original wording and expected labels in the source reports. Thirteen cases have no supported intent label, so intent uses 195 cases. Base and adapter share the pinned Qwen3.5-9B 4-bit weights, frozen v3 classification prompt, greedy decoding, thinking disabled and 80 output tokens. Historical wrappers differ in recorded runtime fields; this is not a controlled speed comparison.

These are **exposed development results**, used during experimentation, with AI-assisted labels. They are not an untouched final test. Public-cohort intent regressed from 59/60 to 57/60; reaction intent scored 0/4; strict retention/qualification gates failed. Aggregate improvement does not establish universal quality or superiority to a frontier model.

## Evidence that parameters were trained

- Base: `mlx-community/Qwen3.5-9B-4bit`, revision `8b2b98c00a6b4d291155e4890773ca8f769aee53`.
- Training records contain **730 ordered updates**, with finite response-only losses, on 730 reviewed examples.
- One epoch, batch 1, learning rate `1e-5`, rank 8, scale 20, dropout 0, max 768 tokens, seed 20261011.
- Updated **638,976 LoRA parameters** across 14 float32 arrays in the final layer's attention and MLP projections. All seven LoRA B matrices are nonzero.
- Recorded training process duration: approximately **25.6 minutes**. Reported peak MLX allocation: approximately **5.52 GiB**, not total system memory.
- Selected adapter SHA-256: `8724245782e5c709bf7ccd7b3631a944472bfb071d6cc659a9bcc5cb51143f01`.
- The app's [model manifest](../../scripts/app-mlx/model-manifest.json) binds this exact adapter to its native runtime.

The adapter is trained output, not a prompt file. Cryptographic hashes establish artifact identity; they do not independently certify data quality or authorship. Training execution, completion, tensor inspection and paired evaluation together support the project claim.

## Verify the exported evidence

Python's standard library is sufficient. No GPU, model download, paid API or package installation is needed:

```sh
python3 docs/fine-tuning-evidence/verify.py
```

This recomputes scores from all exported paired labels/predictions, validates export hashes, and checks the complete ordered training-loss sequence. To additionally check original report hashes and actual adapter tensors on the project owner's machine:

```sh
python3 docs/fine-tuning-evidence/verify.py \
  --source-root . \
  --adapter artifacts/fine-tuning/classification-reviewed9b-v1/adapters.safetensors
```

| File | Purpose |
| --- | --- |
| `evidence.json` | Base/adapter identity, actual recipe, source hashes, results and limitations |
| `paired-development.json` | All 208 expected labels and strictly parsed base/adapter predictions, with source/output fingerprints |
| `training-loss.csv` | 730 update numbers and observed losses; no training text or example IDs |
| `adapter_config.json` | Actual saved LoRA configuration |
| `verify.py` | Portable CPU-only arithmetic, integrity and optional tensor audit |

Raw note wording and third-party dataset text are omitted pending redistribution review. The public export lets reviewers verify the arithmetic; original private reports are needed to inspect wording and independently judge semantic labels. Adapter/base weights are not bundled. This is an evidence export, not yet a complete public training-reproduction package. The historical frozen recipe contains stale ancestry prose; the normalized recipe here reflects its actual 730-update settings and completed run.

## Understand the work

1. Start with a pretrained, quantized model; its backbone weights remain frozen.
2. Prepare category/intent examples and train only the small LoRA matrices. Response-only loss supervises the answer rather than the user's note.
3. Save the adapter, verify its identity and finite values, and retain the actual training logs.
4. Compare the base and adapter on the same cases. Report denominators, invalid outputs, and regressions alongside aggregate gains.
5. Load that adapter in the application. The separate extractor still owns titles/actions/quantities; the user reviews and saves explicitly.

A decreasing training-loss curve alone is not evidence of improved generalization: successive updates use different examples. The paired evaluation supplies the measured effect; a fresh held-out benchmark is still needed for a release-quality generalization claim.

## Accurate portfolio wording

> Fine-tuned Qwen3.5-9B using 4-bit MLX LoRA on 730 reviewed examples, training 638,976 adapter parameters locally. On a paired 208-note development benchmark, category accuracy improved from 90.38% to 94.23% and supported intent accuracy from 67.18% to 90.26%. Integrated the experimental adapter into a local-first app with explicit review and source validation.

This was substantially AI-assisted work. The owner directed requirements and experiments; data review, implementation, orchestration and analysis used AI assistance. Be prepared to explain the recipe, frozen weights, label provenance, development/test distinction and remaining failures. No independent-expert-authorship or frontier-superiority claim is implied.
