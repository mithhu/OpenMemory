# TV series continued fine-tuning — 2026-10-17

Decision: **candidate rejected for app promotion; installed reviewed730 adapter unchanged**.

A real native MLX warm-start run completed 190 uniform response-only updates of the existing last-layer rank-8 adapter: 158 historical replay notes plus 32 new AI-authored development notes. Same 4-bit Qwen3.5-9B backbone, frozen; 14 trainable arrays / 638,976 values. All trainable values changed and all saved tensors/losses are finite. Training took 458.50s; full train-and-compare attempt took 944.89s within the fixed 20-minute limit. No cloud calls, automatic retries, best-checkpoint search or app installation.

| Joint category + intent             | Current adapter | Candidate     |
| ----------------------------------- | --------------- | ------------- |
| New 24-note series-focused holdout  | 18/24 (75.0%)   | 22/24 (91.7%) |
| Historical 64-note retention probes | 39/64 (60.9%)   | 24/64 (37.5%) |

Both models used the same expanded prompt, greedy raw generation and output limit. Invalid outputs count as errors. On new holdout: five paired gains, one loss. On retention: two gains, seventeen losses. Retention category correctness improved slightly (48 to 50), but intent correctness fell (47 to 32), especially clarify versus none/reaction. This fails the predeclared rule allowing no more than two net retention losses. No further tuning was performed after seeing these results.

Limitations: the 24 labels are provisional, AI-authored and not independent human gold. Twelve notes are SERIES-labeled, with twelve controls; true SERIES joint scores were 8/12 and 11/12. The 64 retention notes were in the parent's historical training, not independent generalization data. This is an expanded-prompt parent-vs-candidate comparison, not the prior 200-case source evaluation, not a frontier-model comparison, and not an extraction or UI accuracy score. A later run informed by these results needs fresh final evaluation data.

Candidate SHA-256: `700c5d870ed43b7e219fa76759c8336aa12ae7593710b957f697d06e2a98c4b6`. Parent remains `8724245782e5c709bf7ccd7b3631a944472bfb071d6cc659a9bcc5cb51143f01`.

Recipes, data provenance, raw predictions, learning log, CPU scoring tests, integrity verifier and result JSON: `research/tv-series-v1/training/`. Binary candidate: ignored local `artifacts/fine-tuning/tv-series-experimental-v1/`; separate local ZIP backup is recorded in `training/backup.json`. Weights and base model are excluded from the product Git repository. No new Hugging Face upload or public model release was made.
