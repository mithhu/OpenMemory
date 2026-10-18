# Learning log — structured classification experiment 01

## 1. Define the problem before training

The installed reviewed730 adapter was trained on v3 category/intent output. It has no SERIES category and uses a single `clarify` action for different missing details. The app's extractor now understands TV series, but that is not evidence that our classifier weights learned it.

V5 uses three output fields: category, known intent (or null), and independent clarification reasons. A known opinion can remain `reaction` while its title needs clarification. Finishing a season is `progress`; completing an entire series is `complete`.

## 2. Review labels and establish the limits

Read the previous rejected TV experiments and the existing 32 v5 development labels. Did not rewrite historical test labels or release claims. Authored 100 more fictional training notes and 48 qualification notes. These are AI-written examples with same-author AI policy labels, not independent human annotations or public-source evidence. `LABEL_AUDIT.md` records ambiguous-policy choices and the limitations.

Qualification titles differ from this training mixture. An initial draft reused The Bear, which appeared in earlier TV experiments; replaced it before any training or predictions. Exact note checks cover both current splits and historical TV JSON note lists. This is not proof of semantic or pretraining independence. No private user notes are training data.

## 3. Freeze the experiment

`recipe.json` pins data, policy and runner hashes, parent adapter hash, exact base metadata/weight hashes, seed, LoRA architecture, learning rate and resource limits. Train once for one pass over 132 rows. Reserve all 48 qualification labels before predictions. No tuning against these outcomes during this attempt.

Base: cached mlx-community/Qwen3.5-9B-4bit. Warm-start: reviewed730 adapter. One adapted layer, rank 8, scale 20, no dropout. Adam learning rate 0.00001, batch size 1. Frozen base weights. Response-only loss projects the supervised answer tokens; user/system instruction tokens do not receive the objective. Target token window 128, sequence bound 3072, no truncation.

## 4. Test the machinery before spending GPU time

Four CPU tests passed: label schema, split uniqueness/category coverage, invalid-output scoring without losing valid partial category/intent scores, paired gain/loss behavior, reason-order equivalence and Wilson interval behavior. Preflight validated exact base and parent hashes and tokenized all 132 training rows. Maximum sequence length was 1020 tokens. No training occurred in preflight.

## 5. Execute one bounded local attempt

Use `.local-runtime/venv/bin/python research/structured-advice-v5/experiment-01/supervise.py`. Supervisor owns the same GPU lock used by the app. Child processes are reaped on errors/timeouts. Limits: training 900 seconds; each of base, parent and candidate evaluation 480 seconds; total 2340 seconds (39 minutes). Allocation guard: 8 GB observed MLX active+cache. Disk was approximately 53 GiB available before the run. No network/model downloads, cloud calls, release replacement or app installation.

Raw greedy generations use temperature zero with no output repair. All three models use exactly the same v5 prompt and qualification order. Parent v3 schema failures must be interpreted as format migration, not loss of its previously measured v3 ability. Base-versus-candidate is the meaningful adaptation comparison under this new task.

## 6. Decide from results

To be appended after execution. `results.json` will report full joint and component scores, raw schema-invalid counts, per-category and series/retention/uncertainty slices, Wilson 95% intervals, paired gains/losses and train-majority baseline. Latency includes first request and warm median/p95; model load/compilation and request latency are distinct. Small, authored qualification data cannot justify a claim of independent real-world superiority. Passing engineering gates is only permission to proceed to app compatibility testing, not automatic deployment.

## 7. Result and stopping decision

All phases completed in 1016.9 seconds (16m57s). Training: 436.0 seconds, 132 steps, peak MLX memory 6.09 GB. Base/parent/candidate evaluation request loops took 197.6/177.1/169.6 seconds respectively. Candidate full correctness was 41/48 versus base 27/48 and parent 28/48. Series improved to 15/16 versus parent 9/16. All original expected labels and raw outputs remain unchanged.

The candidate failed the zero-contract-invalid gate: three responses had semantic contract contradictions despite valid JSON syntax. A separate lesson-versus-course completion error and a per-course-category decline from 3/4 to 2/4 reinforce rejection. Did not relax the gate, repair generated labels, retrain on the qualification failures, install the candidate or replace the published release. See REPORT.md and results.json.

## 8. Verify actual weight changes and retain evidence

Rehashed frozen base metadata/weight files and original parent adapter after training/evaluation: unchanged. Loaded candidate/parent safetensors with CPU NumPy, confirmed identical architecture and finite values; 638,975 of 638,976 adapter parameters changed. Saved per-tensor changes and prediction hashes in verification.json. Copied every training step and tokenization record from ignored artifacts into this tracked research folder; adapter weights remain ignored.

Four experiment tests passed. Existing 37 Python tests initially hit sandbox socket-bind restrictions; rerun with localhost access passed all 37. No app source change or new app-test accuracy claim. Runtime versions are recorded separately. The original pretraining/public/human data limitations still apply; do not turn 85.4% on this AI-authored set into an independent benchmark claim.
