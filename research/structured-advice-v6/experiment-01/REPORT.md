# V6 experiment 01 — rejected candidate

Completed and verified 20 October 2026 (Europe/London). Inputs and the recipe were authored/frozen on 19 October. The single host-GPU run took 2,070.89 seconds (34m31s).

**Decision: do not install or publish this candidate.** Two frozen safety gates failed: a partial season was called the whole series complete, and three responses violated the strict contract. No app, Ollama, deployed or Hugging Face model was changed.

## Identical new-prompt comparison

| Checkpoint | Synthetic joint /48 | Series joint /16 | Public joint /19 | Invalid outputs /72 |
| --- | --- | --- | --- | --- |
| Base | 3 | 0 | 0 | 63 |
| Installed reviewed730, transfer probe | 2 | 0 | 0 | 65 |
| Previous rejected v5 experiment-02 | 3 | 0 | 0 | 66 |
| New v6 candidate | 32 | 10 | 12 | 3 |

Joint correctness requires category, intent and the exact set of clarification reasons. Five of 24 public nominations are predeclared unscored and excluded from accuracy, but their output validity is still checked. Synthetic and public accuracy are not pooled.

## Important interpretation limit

The older checkpoints largely failed the new output format: many emitted an `action` field instead of `intent` or prose explanations instead of enumerated clarification reasons. This makes the large joint-score gap substantially a format/prompt-adaptation result, not proof of a corresponding gain in semantic understanding. The installed checkpoint was trained for a different two-field contract; these numbers are not its production-pipeline accuracy. Do not compare them to published v1 benchmark results or advertise a general superiority claim.

The new prompt names the exact required fields but later calls the allowed combinations category/action. A future development-only baseline should remove that terminology ambiguity and show the JSON shape/reason enum explicitly before a new qualification experiment. Do not rewrite this frozen prompt or repair its predictions to improve these recorded scores.

## Concrete failures

- `v6-e1-qualification-014`: “I finished the fourth season of the anime series Blue Orchard.” Expected SERIES/progress; candidate returned SERIES/complete. This is a substantive completion-scope error, even though its JSON is valid.
- `v6-e1-qualification-003`: known progress plus missing_action, an inconsistent pair.
- `v6-e1-qualification-009`: unknown media action without the required missing_action reason.
- `v6-e1-qualification-040`: unresolved future reference classified as NOTE/wishlist but omitted unresolved_reference.

The failed gates were retained unchanged. No qualification-driven retraining was started.

## Fine-tuning evidence

- Completed 211 updates in 727.28 seconds, peak MLX memory 6.12 GB.
- 638,974 of 638,976 adapter parameters changed from the warm-start checkpoint.
- First/last ten mean training losses: 0.28700/0.05437. Lower training loss did not establish qualification safety.
- Candidate SHA-256: `0b9ed48cbecd0366a8514c1f1ee54ac2124dc0b79333a33e2226b8090d2a540f`.
- Base, previous research checkpoint and installed app adapter hashes verified unchanged.
- Frozen recipe/data/validator hashes, all 288 prediction records, output hashes and finite training steps verified. Training steps/tokenization/completion records copied into this reviewable experiment folder; weights remain in ignored artifacts.

## Data and review limits

196 migrated development rows plus 15 original public queries; nine ambiguous public development cases excluded. Label review was a same-session AI second pass, not independent human adjudication. Qualification: 48 fresh AI-authored notes, 24 exact-original crowdsourced SNIPS queries (19 scored, five ambiguous/unscored), with exact prior wording/ID screening. SNIPS was used earlier in the project; no globally source-heldout or pretraining-independence claim. Human wording does not make the OpenMemory labels independently human gold.

## Validation and follow-up

Four experiment tests and fourteen existing structured-advice tests passed; a decision-gate positive control also passed. The sandbox initially exposed no Metal device, failing before updates; identical frozen work then ran with host GPU access. Error logs are retained.

Keep the installed model. Fix the prospective prompt specification and establish a usable untuned/previous-adapter format baseline on development examples before investing in more training. Broaden human-worded course/series coverage separately from the final evaluation. Native, companion, app and Ollama contract changes remain gated; see COMPATIBILITY_NOTES.md. This round is useful reproducible failure evidence, not a successful series-support release.

The original LEARNING_LOG.md remains immutable because it is part of the frozen recipe. This report records the execution outcome without invalidating that snapshot.
