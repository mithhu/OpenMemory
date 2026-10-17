# One-shot TV-series candidate training

Continues the installed reviewed730 MLX LoRA adapter for exactly 190 response-only updates: 158 historical replay examples plus 32 new development fixtures. Rank 8, last transformer layer only, 638,976 trainable parameters, Adam 1e-5, batch 1, seed 20261017. No full backbone training. Token preflight: all 190 examples fit, maximum 862 tokens including target; limit 1536.

This is a deliberately narrow two-field contract extension (v3 + SERIES), not an activation of the structured-advice-v4/v5 proposals. Null actions in new fixtures are projected to `clarify`; clarificationReasons are not trained. Known intent is retained with missing identity. `contract.json` contains the exact expanded prompt and schema. Neither old prompt nor adapter is overwritten.

The 24 new holdout notes and 64 retention probes are excluded from this update. The retention probes were in parent training: they are **not independently unseen data**. Both adapters use the exact expanded prompt, greedy raw generation, maximum 80 output tokens, no constrained decoder, repair or retries. Invalid outputs count as wrong. No causal speed comparison; evaluations run parent first. No automated candidate installation or publication. Any next experiment informed by these outcomes makes this set development data.

The new 32 fixtures are AI-assisted fictional project contributions offered under CC BY 4.0; this does not relicense inherited replay rows. Source/license/label provenance stays in every replay row. Replay source attribution and licenses: [published research data sources](https://github.com/mithhu/openmemory-local-classifier-research/blob/codex/reviewed730-release/DATA_SOURCES.md). Base and parent adapter use their existing Apache-2.0 terms. Training objective is adapted from that repository's Apache-2.0 `train.py`; retain its notices when redistributing.

Preflight: `.local-runtime/venv/bin/python research/tv-series-v1/training/run.py preflight`.
Execute once: `.local-runtime/venv/bin/python research/tv-series-v1/training/supervise.py`.

Supervisor owns the canonical GPU lease, retains it through child exit/reaping, and enforces a hard 20-minute total attempt (600s train, 300s per evaluation) and observed 8GB MLX allocation bound. Each phase runs in a separate process. Output candidate weights live in ignored `artifacts/fine-tuning/tv-series-experimental-v1/`; recipes, loss records and evaluation evidence are saved separately. Runtime MLX allocations are not a complete system RAM guarantee. A failed attempt is recorded, never reported as a trained model.

Installed app settings, native decoder contract and v0.1.0 distribution remain untouched. Passing this small trial only makes the candidate eligible for further qualification, not production-ready.
