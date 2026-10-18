# Next TV-series classifier experiment — 18 October 2026

Status: this historical plan was executed once as experiment-01. Candidate rejected for app promotion; installed reviewed730 remains unchanged. Read [the outcome](experiment-01/REPORT.md). Remaining text records the pre-experiment plan.

## Problem to test

The deployed legacy classifier cannot emit SERIES and combines unresolved identity with unknown action. On the actual app probe, the old classifier called a movie watch-plus-opinion `reaction`, while extraction proposed complete; explicit review prevented a silent save. More iterations of the old two-field task cannot represent all of the information the review needs.

Use the existing development v5 contract: category (including SERIES), known intent or null, and independently represented clarification reasons. Do not rewrite old benchmark labels to make scores appear better.

## Preparation completed

Validated all 32 existing development labels with `structured_advice_v5.validate`. They cover all 11 categories, including six series and four missing-action cases. This checks schema/policy consistency only, not label correctness. They reuse known failures and are development material, never a fresh final benchmark. No new adapter was trained or installed.

## Before one bounded training attempt

1. Expand and review training labels under v5, with separate named/unnamed identity, known/unknown action, episode/season/whole-series completion, future intent, typos, negation, and ordinary nonmedia controls. Review historical examples individually; do not mechanically turn `clarify` into a guessed intent.
2. Reserve fresh evaluation before training or inspecting predictions. Use separate works, expressions and source groups; record source/license and whether labels were AI-authored. Exact deduplication is necessary but does not establish semantic or pretraining independence. Previously used v1/v2/v5 cases remain development feedback.
3. Freeze data hashes, contract, recipe and stopping conditions. Compare unadapted base, current adapter and candidate under the identical new prompt/output contract. Preserve original v3 benchmark results separately; v3 and v5 joint scores are different tasks.
4. Report category, intent, reason-set and full joint correctness; invalid-output rate; per-category and uncertainty slices; paired gains/losses; and appropriate majority baselines. Include cold/warm latency, memory, and actual app-review probes.
5. Candidate qualification requires a series improvement over the current adapter with no decline in aggregate supported-category joint correctness or uncertainty slice correctness, zero introduced whole-series completion errors on season-only cases, and no schema-invalid outputs in the reserved qualification set. These are engineering gates, not statistical proof or automatic production promotion. Confidence intervals and sample counts must accompany the results.
6. Stop after the frozen attempt. A failure becomes development feedback; do not tune repeatedly against the same final set. Promotion additionally requires MLX/Ollama compatibility, source-bound review and persistence tests, and a complete user-visible app check.

No weight download, cloud inference, training, release replacement or model promotion is performed by this plan.
