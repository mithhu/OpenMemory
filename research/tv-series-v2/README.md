# TV series clarification-retention experiment v2

One bounded follow-up to the rejected v1 candidate. Installed reviewed730 model and published v0.1.0 remain unchanged. No automatic installation or publication.

## Development audit

V1 had 17 paired legacy losses and two gains. Many losses were clear opinions about unnamed works: for example “that movie was great” was labeled `clarify` by the frozen legacy contract, but the candidate emitted `reaction`. This is not necessarily failure to understand the opinion. The two-field contract uses `clarify` to represent missing identity, so known opinion and unresolved identity cannot both be represented. The structured-advice proposal addresses that limitation separately; this experiment preserves the current legacy policy instead of silently changing historical gold.

V2 adds an explicit priority instruction for unresolved movie/book/music/course identity, named-versus-unnamed contrasts, clarification-heavy replay, and a learning rate five times lower. These are a combined intervention; any improvement cannot be attributed to one factor alone.

## Frozen design

- Warm-start from the **qualified original adapter**, not rejected v1.
- 200 updates: 80 historical clarify rows, 48 other historical rows, 56 previous authored TV notes (including the now-used v1 holdout), and 16 contrast notes.
- Adam 2e-6, rank 8, only final transformer layer; frozen 4-bit Qwen3.5-9B backbone. Same response-only objective. Token preflight: maximum 976, limit 1536.
- Fresh 32-note series-focused holdout plus 48 newly authored legacy-policy probes. Includes ordinary short expressions, unnamed works, reactions, partial versus finished viewing, anime, miniseries and non-media controls.
- All 80 new notes are fictional AI-authored policy fixtures, **not independent human gold, not public-source real-user data, not proof of generalization across users**. Newly chosen named works differ from v1 development titles. Explicit series intent and future/progress exceptions follow the frozen expanded two-field policy.
- Normalized exact overlap is zero against current update, v1 train/evaluation notes, and all 730 original parent training rows. This does not establish semantic, author or base-pretraining independence. Familiar grammar and policy families are expected to overlap.
- Previous holdout outcomes are development feedback. No previous test is reused as a fresh final test; no historical gold is altered to improve reported scores.

Both adapters receive identical v2 prompts, case order, raw greedy generation, no constrained decoder/repair/retry and max 80 output tokens. Report category/intent/joint, invalid counts, paired changes, per-category scores and majority baselines. Ineligible if series joint does not improve, overall legacy loses more than one, legacy clarify joint decreases, or an older category with at least three cases loses more than one. Passing only permits further qualification; it does not make an 80-note authored test a production benchmark.

Canonical GPU lease, observed 8GB MLX allocation bound, one final checkpoint, 20-minute total hard deadline (660s training, 270s per comparison). No further hyperparameter attempts using these outcomes. Helpers and inputs are hashed before training. Native MLX runtime versions are recorded. Base weights, candidate weights and secrets stay out of Git; local candidate backup is created only after complete inference and integrity checks.

Source/license/label provenance is retained in each inherited row. Attribution: [research data sources](https://github.com/mithhu/openmemory-local-classifier-research/blob/codex/reviewed730-release/DATA_SOURCES.md). New fictional contributions: CC BY 4.0. Trainer response projection is adapted from the Apache-2.0 research `train.py`; the original notices/license accompany the local backup. Inherited licenses are not replaced by project licensing.

## Reproduce locally

From the app checkout with the pinned local base and qualified parent available:

1. Run `.local-runtime/venv/bin/python research/tv-series-v2/training/run.py preflight`.
2. Run `.local-runtime/venv/bin/python research/tv-series-v2/training/supervise.py` once. Existing artifacts are never silently overwritten.
3. Run `verify_run.py`, then `summarize.py`, using the same Python and directory.
4. Read the full results and learning log before considering qualification.

The original prepared data and recipe are immutable. Results are added separately after the one attempt.
