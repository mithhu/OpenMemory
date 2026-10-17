# Clarification-focused TV adapter learning log — 2026-10-17

## Why another experiment

The first TV adapter really trained, but was rejected: new 24-note joint accuracy rose from 18 to 22 while historical 64-note retention fell from 39 to 24. We retained the original installed model and saved the rejected adapter and evidence.

We examined the 17 legacy paired losses. Many were unnamed works with an otherwise known opinion: “that movie was great” or “rate this novel four stars.” The legacy two-field contract expects `clarify` when identity is missing; the candidate often returned `reaction`. This shows a limitation of that output representation: missing identity and known action cannot both be expressed. It does not prove the model failed to recognize the opinion. Structured advice is a separate future design; this experiment preserves the frozen legacy policy rather than relabeling old gold.

## Changes decided before seeing new test outputs

1. Restart from the qualified original adapter, never from rejected v1.
2. Lower Adam learning rate from 1e-5 to 2e-6. Keep frozen Qwen3.5-9B-4bit backbone, last transformer layer only, rank 8 and 638,976 trainable values.
3. Replay 80 historical clarify examples and 48 other historical examples. Stratify by category/intent so minority cases survive sampling. Use 56 earlier authored TV notes (the old test is now development feedback) and 16 additional contrasts. Exactly 200 shuffled updates, one pass, batch 1.
4. Make clarification priority explicit for unnamed movie/book/music/course identities. Preserve the SERIES-only known-future/progress exception. This is a narrow offline two-field contract; it is not the installed app decoder or a structured-advice migration.
5. Newly author 32 series-focused test notes and 48 legacy-policy test notes. Favor short ordinary expressions over explanatory “I have not said which title” clauses. Examples contain anime, miniseries, episode/season progress, explicit full completion, named/unnamed opinions, requests, non-media watching/reading, relationship facts, goals and mixed notes.

These changes are one combined intervention. A score gain cannot identify whether data mix, explicit policy or lower learning rate caused it.

## Test isolation and honest limits

The 80 test notes are newly AI-authored fictional policy fixtures. They are not independent human gold, not public-source naturalistic data and not evidence that every person's writing is handled. Reserved show/movie/book/song/course titles differ from v1 development titles. Normalized exact overlap is zero with current training, every v1 training/evaluation note, and all 730 original parent-training rows. This does not establish semantic, author or base-pretraining independence. The same policy families and grammar necessarily recur.

The old v1 holdout is now explicitly development data. Its results are not presented as a new final test. New historical replay rows retain their source licenses and label provenance. We do not alter previously published gold or scores.

## Freeze and execution

Commit `a1a6e6e` saves the recipe, data, prompt, scoring helper, CPU tests, integrity verifier and supervisor before training. All six CPU tests pass, including a new check that a clarification regression blocks qualification even when overall legacy accuracy ties.

Every training example was tokenized without truncation: max 976 tokens, configured limit 1536. Only answer tokens contribute to loss. The qualified adapter warm-start is hash checked; original base files are pinned. Runtime versions are recorded. One final checkpoint only, no checkpoint search.

Supervisor owns the canonical GPU lease until child exit/reaping. Hard total limit is 20 minutes: training at most 660 seconds, each comparison at most 270 seconds. Non-finite gradients/losses or observed MLX allocations over 8GB abort the run. The original installed adapter, native app contract and v0.1.0 release remain unchanged.

## Evaluation and decision rule

Parent and candidate receive the same expanded v2 prompt and case order. Raw greedy generation, max 80 tokens, no JSON repair, no constrained decoder and no retry. Invalid responses remain in denominators. Score new-series and new-legacy subsets separately, including category/intent/joint, per-category counts, majority baseline and paired gains/losses.

All gates must pass: series-focused joint strictly improves; legacy joint loses no more than one case; legacy clarify joint does not decrease; each older category with at least three cases loses no more than one. Passing means eligible for further qualification, not automatic app installation or a broad superiority claim. No second attempt will be tuned on these outcomes. If used for later tuning, this test also becomes development feedback.

Outcome is appended after complete inference and tensor/hash verification.

## Training completed

All 200 fixed updates completed in 563.05 seconds; supervised phase including loading/checks took 573.92 seconds. Peak observed MLX allocation 6,031,259,180 bytes. Candidate SHA-256 `36dd147259a3e2f22ed1d4e90fbc8dfc8d80909c2f35d5ca2ae6b548e228cdf1`. Installed parent remained unchanged. Full update trace and token hashes are saved separately. No test outcomes were used for checkpoint selection. The comparison starts after training exits.

## Complete result — rejected, no further run

The supervised attempt completed in 1057.76 seconds (17 minutes 38 seconds), below the fixed 20-minute deadline. All saved arrays and all losses are finite. All 14 LoRA arrays / 638,976 trainable values changed; the installed parent remains byte-identical. The candidate was not installed, converted for Ollama or published.

Paired classification under the same v2 prompt:

| Fresh authored subset | Original adapter | Candidate     |
| --------------------- | ---------------- | ------------- |
| Series-focused joint  | 27/32 (84.4%)    | 27/32 (84.4%) |
| Legacy-policy joint   | 38/48 (79.2%)    | 36/48 (75.0%) |
| Legacy clarify joint  | 10/14 (71.4%)    | 7/14 (50.0%)  |

Series category correctness was already 32/32 for the parent and remained 32/32. This trial provides no evidence that additional TV fine-tuning improved category recognition beyond the expanded prompt. Series-focused paired changes: one gain and one loss. Legacy paired changes: four gains and six losses. Each model had one invalid legacy output, counted as wrong. All four frozen gates failed, including the per-category gate. This is NOT eligible for app promotion.

Inspection after scoring: some failures return known reactions/actions but omit identity uncertainty, such as unnamed novels and films. Other errors are substantive: bare “I read the novel Piranesi” became complete without completion evidence, while ordinary reading of grandmother's letters became clarify. A better replay ratio and smaller learning rate did not establish a reliable improvement in this one combined experiment. We cannot infer that learning rate alone caused the result, nor that every future fine-tuning method must fail.

Do not compare these percentages directly with v1: these are different notes and a revised prompt. All 80 are AI-authored policy labels, not independent human or real-user evidence. They now become development feedback for any later work informed by their outcomes. No post-test relabeling, output repair, extra training attempt or relaxed qualification rule was used.

The practical conclusion is to keep the qualified installed model. Before another training run, resolve the representation of known intent versus missing identity (the separate structured-advice design), audit labels against that contract and obtain a genuinely separate final evaluation. Do not keep running a hyperparameter search against these 80 notes.
