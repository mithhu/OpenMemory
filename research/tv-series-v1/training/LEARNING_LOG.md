# TV series fine-tuning learning log — 2026-10-17

## What we are trying to learn

The current classifier has no SERIES output label. The app can already extract and store series, but that is not proof its trained classifier learned the distinction. This experiment changes the classifier's allowed labels and continues training a separate copy of the old LoRA weights. It then tests whether those weight updates improve a fixed series sample while retaining older behavior.

## 1. Save the existing product first

Created app checkpoint `1aa12ba`: accumulated classification advice/review fixes, published research evidence, TV activity schemas and review/library support. App checks: 522 passed, one opt-in live test skipped; 33 companion Python tests passed with localhost permission. This commit does not include model weights, private vaults or environment keys.

## 2. Separate app support from model support

The app's new category does not change what the old fine-tuned adapter can emit. Native MLX and converted Ollama artifacts are pinned to the old v3 contract. We left those installed artifacts and decoders alone. This candidate uses an offline, expanded two-field prompt with SERIES; it is not yet compatible with those pinned app endpoints.

## 3. Define a modest, explicit experiment

Use the same local `mlx-community/Qwen3.5-9B-4bit` base and installed reviewed730 adapter as a warm start. The 4-bit backbone stays frozen. Only the last layer's existing rank-8 LoRA arrays train: 14 arrays, 638,976 values. Adam learning rate 0.00001, one pass, batch 1, seed 20261017. This is continued adapter training, not training a 9B model from scratch.

The target is only category and intent. Title correction, entity extraction, reminders and episode arithmetic are separate app tasks; a classification score does not measure them.

## 4. Prepare training and tests before running

32 new fictional AI-assisted development notes contain 17 SERIES cases and 15 controls: film, book, course, mixed, relationship, goal, ordinary TV habit and place wishes. Sample up to six historical rows from each category/intent pair to obtain 158 replay notes. Replay helps retain older categories. Shuffle the resulting 190 rows deterministically.

Keep all 24 separately authored series holdout notes out of this update. Also reserve 64 other historical rows for retention checks. Those 64 were in the old model's training: they measure remembering old behavior, not independent generalization. The new holdout is AI-authored with provisional labels, not independently human-annotated gold.

New null actions are projected to the old-style `clarify` intent. Clarification reasons are not trained in this narrow experiment. This is explicit information loss, not a hidden upgrade to structured advice. Source licenses and label provenance are preserved for inherited rows.

Pin dataset, prompt, runner, base metadata and parent adapter hashes in `recipe.json`. Freeze this before training or reading any predictions. Check no normalized exact text overlaps between update rows and either comparison set. Tokenize all 190 examples without truncation: longest is 862 tokens; allowed context is 1536. Prompt tokens contribute context; only answer-token positions contribute loss.

## 5. Execute one bounded run

Commit `867d7ca` saves the frozen recipe, data and runner. Unload the local extraction model to free memory. A supervisor takes the canonical GPU lease and retains it until child exit/reaping. Train once, then evaluate parent and candidate in fresh, separate processes. Hard deadline: 20 minutes total; training at most 600 seconds and each evaluation at most 300 seconds. Abort on non-finite loss/gradients or observed MLX allocation over 8 GB. No automatic retry, checkpoint search, app install or cloud calls.

Loss is an optimization diagnostic, not evaluation accuracy. The scorer was implemented after the training run started but before any evaluation output; this timing is recorded in `analysis-binding.json`. Its CPU tests check invalid-output denominators, incomplete/reordered pairs and the visibility of old-category regressions.

## 6. Compare fairly

Both parent and candidate receive the same expanded prompt, same note order, greedy generation and an 80-token output bound. Neither gets JSON repair, a constrained decoder or retry. Invalid responses remain in denominators. The comparison therefore measures the added weight updates under the expanded prompt; it does not mix a prompt improvement with a weight improvement.

Report new-holdout and retention scores separately, with category, intent, joint correctness, invalid outputs, per-category counts and paired gains/losses. Report the constant majority baseline too. No frontier-model superiority claim and no speed claim from parent-first timing.

The predeclared rule only makes a candidate eligible for further qualification if joint holdout accuracy improves and retention loses no more than two cases. Even a passing result is too small to justify automatic app promotion. If results guide a later experiment, this holdout has become development feedback and a fresh final test is needed.

## 7. Preserve the result

When finished, verify every finite loss record, exact update order, output receipts, candidate tensor shape/count/hash, and that the installed parent hash is unchanged. Commit recipes and evidence separately from a local adapter ZIP. Keep base weights and secrets out of Git. Publish no new public version or Hugging Face artifact without its actual result and limitations.

Outcome is appended below only after the bounded run and comparison have completed.

## Training completion

All 190 predetermined updates completed in 458.50 seconds. Peak MLX allocation: 6,004,247,020 bytes. Saved candidate SHA-256: `700c5d870ed43b7e219fa76759c8336aa12ae7593710b957f697d06e2a98c4b6`. Installed parent hash remained unchanged. This establishes that weights were updated and saved; it does not yet establish better classification. Loss trace and exact token hashes are preserved with the recipe. Comparison begins only after training has stopped.

## Completed comparison and decision

The whole supervised attempt completed in 944.89 seconds (about 15 minutes 45 seconds), below the 20-minute limit. All saved tensors are finite; all 638,976 trainable values across all 14 arrays changed relative to the parent. Installed parent remains byte-identical. This is actual continued fine-tuning, not relabeling or changing a prompt alone.

Under the same expanded prompt, new 24-note series-focused holdout joint correctness improved from 18/24 (75.0%) to 22/24 (91.7%): five gains and one loss. Among the 12 SERIES-labeled notes specifically, joint correctness improved from 8/12 to 11/12. Invalid outputs changed from one to zero. These are provisional AI-authored policy labels, not independent human gold.

Retention joint correctness fell from 39/64 (60.9%) to 24/64 (37.5%): two gains and seventeen losses. Category correctness actually rose from 48/64 to 50/64, but intent correctness fell from 47/64 to 32/64. The main observed failure is clarification: the candidate emits none or reaction on many legacy clarify cases. These 64 probes came from parent training, not an independent test distribution. The test does not establish a universal real-user accuracy percentage for either model.

The candidate FAILS the predeclared qualification rule. It is NOT installed, converted for Ollama, published or promoted. We preserved the original installed adapter. We did not tune again on these errors, relabel the holdout or hide the negative retention result. The changed weights and full traces are preserved for study.

Hypothesis for future work: a short adaptation run with limited replay did not adequately retain the uncertainty/clarification policy. That is a hypothesis, not a proved causal explanation. A later run needs a better development mixture and a fresh final holdout, because these outcomes are now known. TV-category accuracy by itself is not enough to justify promotion.
