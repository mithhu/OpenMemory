# Clarification-focused TV adapter v2 — 2026-10-17

Decision: **rejected; installed reviewed730 adapter and public v0.1.0 unchanged**.

Reviewed the first candidate's failures before freezing this follow-up. Changed the combined intervention: 80 historical clarify replay rows, 48 other replay rows, 56 previous authored TV development notes, 16 contrasts; lower Adam LR 2e-6; explicit missing-identity priority in an offline expanded two-field contract. Warm-started the qualified original adapter. Exactly 200 response-only MLX updates, last-layer rank 8, frozen Qwen3.5-9B-4bit backbone. Max token preflight 976; no truncation.

Reserved newly AI-authored 32 series-focused and 48 legacy-policy notes. Normalized exact overlap is zero against current training, v1 train/evaluation notes and all 730 original parent-training notes. This is not independent human gold or naturalistic public-source data; semantic/author/pretraining independence is not established. The old holdout is explicitly development feedback.

| Joint category + intent    | Parent        | Candidate     |
| -------------------------- | ------------- | ------------- |
| Fresh series-focused notes | 27/32 (84.4%) | 27/32 (84.4%) |
| Fresh legacy-policy notes  | 38/48 (79.2%) | 36/48 (75.0%) |
| Clarify subset             | 10/14 (71.4%) | 7/14 (50.0%)  |

Same v2 prompt and ordering for both; raw greedy generation, no constrained decoder, repair or retry. Each had one invalid legacy output, counted as incorrect. Series category correctness was 32/32 for both. Series joint had one paired gain and one loss; legacy had four gains and six losses. Every predeclared gate failed: no series improvement, overall legacy loss greater than one, clarify regression and an older-category regression. No post-test relabeling or further run. No automatic promotion.

Some mistakes capture known opinion/action but omit identity uncertainty, reflecting the two-field contract's limitation. Others are genuine inference failures, including assuming whole-book completion from a bare reading verb and requesting clarification for ordinary reading of family letters. The next design question is representing identity uncertainty separately from intent, not blindly adding training iterations. This result does not prove no future fine-tuning approach can work.

Training: 563.05 seconds, peak MLX allocation 6,031,259,180 bytes. Full supervised attempt: 1057.76 seconds within 20-minute deadline. All 14 LoRA arrays and 638,976 values changed; saved values and losses finite. Candidate SHA-256 `36dd147259a3e2f22ed1d4e90fbc8dfc8d80909c2f35d5ca2ae6b548e228cdf1`. Parent remains `8724245782e5c709bf7ccd7b3631a944472bfb071d6cc659a9bcc5cb51143f01`.

Full recipes, source provenance, traces, raw predictions, six CPU tests, scorer and learning log: `research/tv-series-v2/training/`. Binary candidate remains under ignored `artifacts/fine-tuning/tv-series-experimental-v2/`; a local ZIP and checksum preserve the complete experiment without base weights. No model publication was performed.
