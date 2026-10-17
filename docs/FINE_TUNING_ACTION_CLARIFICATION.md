# Action and clarification fine-tuning experiment

This round trained a new LoRA adapter to classify a memory's action separately from information that needs clarification. For example, “I want to watch a movie” has a known future action and an unidentified film. A single `clarify` intent loses that distinction.

The candidate is experimental and **was not installed in the app**. It showed some gains but failed a predeclared output-validity requirement.

## Training

- Base: locally cached Qwen3.5-9B, MLX 4-bit.
- Starting point: installed reviewed730 adapter.
- Data: 198 rows, combining authored contrasts with stable replay from the earlier training bundle. Three ambiguous replay examples were excluded before training, with the original preparation preserved.
- Method: response-only LoRA continuation, rank 8, scale 20, dropout 0; 14 final-layer arrays, with the base model frozen.
- Schedule: one epoch, 198 updates, fresh Adam at 1e-5; no checkpoint search.
- Resources: about 9 minutes 42 seconds of training, 6.02 GB peak MLX memory. A four-step pilot passed first and was discarded before the full run.

All 14 LoRA arrays changed. The base parameter values, installed adapter and earlier benchmark inputs remained unchanged. The new adapter's SHA256 is `4d91781a9c0ed21d6ff38488b7183fa14a4afd6952f006bded131eb4e9503e6f`.

## Comparison

Both adapters received the identical new-format prompt, with greedy unconstrained generation and no repairs or semantic rewrites. Correctness requires valid output and matching category, action and clarification-reason set.

| Cohort | Installed | Candidate | Interpretation |
|---|---:|---:|---|
| 40 reserved authored notes | 22/40 | 26/40 | Prospectively held out from this training; same assistant authored labels |
| 42 known regression cases | 24/42 | 32/42 | Earlier training-source examples; not independent generalization |
| 12 exposed development cases | 8/12 | 9/12 | Development diagnostic only |

The authored holdout had seven paired gains and three losses, a net +10 percentage points. The paired exact p-value was 0.34375 and the descriptive paired bootstrap 95% interval was -5 to +25 points. This small sample does not establish a reliable generalization gain. These results also cannot be compared directly with earlier v3 scores, which use a different output task.

Candidate invalid outputs fell from 15/94 to 7/94, but the predeclared requirement was **zero**. The candidate therefore failed the overall gate, despite meeting the gain, retention and false-action checks. Four invalid candidate outputs involved mixed notes. Other errors included missing-title flags, contradictory action/clarification predictions and one unsupported completion inference. No invalid response was repaired into a correct score.

The main lessons are that output-schema migration needs training and qualification, category correctness alone hides important errors, and known regression improvements are not independent evidence. The data had limited mixed-note coverage, so the next investigation should address that gap and output consistency before another candidate. A new final evaluation must reserve new examples; this holdout is now exposed.

## Evidence and learning materials

The [machine-readable evidence](fine-tuning-evidence/action-clarification-v4-20261016.json) records the recipe, model identities, step count, data coverage, paired results and failed gates. The local research workspace contains the preparation and training scripts, frozen splits, every update, raw predictions, error ledger, verification and a step-by-step learning guide under `.research-workspace/docs/fine-tuning/action-clarification-v4-20261016/`.

This was a local experiment: no cloud training/inference, model upload or production promotion. The deployed app and installed model remain on their existing configuration.

## Follow-up: isolate the decoder effect

A separate controlled experiment reran both adapters on these same exposed 94 cases using the same v4 structural decoder. This was not a new final test or another training run. The decoder preserves the existing validator's full 455-output space and all permitted reason orderings; it adds no source-text heuristics or semantic label repairs.

| Cohort | Installed, unconstrained | Candidate, unconstrained | Installed, decoder | Candidate, decoder |
|---|---:|---:|---:|---:|
| 40 authored diagnostics | 22/40 | 26/40 | 22/40 | 27/40 |
| 42 known regression cases | 24/42 | 32/42 | 26/42 | 33/42 |
| 12 exposed development cases | 8/12 | 9/12 | 8/12 | 9/12 |

Both adapters had **0/94 invalid outputs** with the decoder. Most of the formerly invalid outputs nevertheless remained semantically wrong. The candidate chose the correct category on all 40 authored notes, but 13 action/clarification errors remained. That small-set category result is not an overall accuracy claim.

The authored paired comparison under identical decoding was eight gains and three losses: +12.5 percentage points, exact paired p=0.2265625, descriptive bootstrap 95% interval -2.5 to +27.5 points. The data is exposed and labeled by the same assistant, so it does not establish independent generalization improvement. Known regression cases came from the earlier training source.

The remaining audit found both unnecessary and missing identity questions, future-start versus actual-start confusion, media-style tracking applied to nonmedia notes, and an unsupported completion inference. A legacy mixed-note retention label also needs clarification-policy adjudication; it remains unchanged and counted as a failure. No previously valid parsed answers changed in this particular decoder run, although constrained generation can change such answers in general.

All 33 Python tests passed. The decoder is development-only, and the installed model, v3 runtime contract and deployed app remain unchanged. See the [four-way evidence](fine-tuning-evidence/structured-advice-v4-20261016.json); the local research directory `structured-advice-v4-20261016/` contains raw outputs, the error ledger, semantic audit and learning guide.

## Follow-up: clarification calibration 4.1

A further bounded experiment made mixed-branch uncertainty representable: whole-note intent stays `mixed`, while the reason set unions genuinely missing details across branches. A branch-level `missing_action` may coexist with `mixed`; nonmixed consistency remains unchanged. This research-only policy/decoder has 466 permitted outputs and has not been activated in the app.

One child adapter was trained from the previous experimental v4 candidate: 189 response-only LoRA updates, one epoch, Adam 1e-5, about 14m54s and 6.35 GB peak MLX memory. All 14 LoRA arrays changed. A pretraining review clarified three training and two reserved notes whose pronouns could refer to the same event; initial wording/preflight files are preserved, targets stayed unchanged, and active reviewed inputs have separate hashes. This occurred before training or new predictions.

Both variants then ran the same experimental 4.1 prompt/decoder on 48 freshly reserved authored notes, 40 known nonmixed regression notes and 12 exposed development notes. This compares the previous research candidate and child, **not the deployed v3 model**. Same-assistant-authored labels are not independent human/external gold.

| Cohort | Previous candidate | New child |
|---|---:|---:|
| Fresh authored full correctness | 29/48 | 31/48 |
| Known regression full correctness | 36/40 | 38/40 |
| Exposed development | 10/12 | 10/12 |
| Fresh mixed notes | 2/10 | 3/10 |

Fresh category correctness stayed 47/48 for both; action correctness changed from 43/48 to 44/48 and clarification-reason correctness from 32/48 to 34/48. The strict joint score is not the same as category accuracy. The fresh-set paired comparison had four gains and two losses (+4.17 points), exact p=0.6875, and descriptive bootstrap 95% interval -6.25 to +14.58 points. The gain is not statistically convincing. Both had zero invalid outputs and zero false actual-playback predictions, but each still made one unsupported completion prediction.

The child failed the declared minimum score, gain, paired-test and zero-false-completion screening gates, so it was not promoted. An audit also flagged a start-versus-progress labeling ambiguity without changing its original failed score. Before more training, task/label priorities need further review; the round does not justify another near-identical dataset-only run. Five policy/decoder tests passed, 189 updates and 200 raw generations were verified, and all prior models/evidence remain preserved.

The [recorded evidence](fine-tuning-evidence/clarification-calibration-v41-20261016.json) includes model lineage, recipe, coverage, paired results, failed checks and verification. Full learning materials and error audit remain in the local `clarification-calibration-v41-20261016/` research directory. No app activation, cloud inference, model upload, commit, push or deployment occurred.
