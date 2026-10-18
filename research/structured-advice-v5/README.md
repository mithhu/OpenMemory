# Known action and missing identity — structured advice v5 development

This folder began as a representation and app-flow correction. A subsequent bounded offline training attempt is documented in [experiment-01/REPORT.md](experiment-01/REPORT.md): 41/48 full correctness versus base 27/48, but the candidate failed its contract-validity gate and was not promoted. No new model release is qualified. The installed reviewed730 MLX/Ollama classifier, v3 prompt, decoder and v0.1.0 release stay unchanged. Rejected TV candidates and all their original gold/results stay unchanged.

A subsequent [focused repair (experiment-02)](experiment-02/REPORT.md) improved a new authored set to 40/48 but regressed on the separately scored public-wording diagnostic (6/16 vs previous 8/16), retained a lesson-completion mistake and failed contract validity. It was also rejected. Neither result is an independent human gold benchmark; the app/public adapter is unchanged.


## The distinction

| Original words                                     | Category | Known action | Still missing                |
| -------------------------------------------------- | -------- | ------------ | ---------------------------- |
| That movie was great.                              | MOVIE    | reaction     | identity                     |
| I finished that course.                            | LESSON   | complete     | identity                     |
| I want to watch a film.                            | MOVIE    | wishlist     | identity                     |
| I read the novel Piranesi.                         | BOOK     | null         | action: partial or finished? |
| Reading letters from my grandmother made me smile. | NOTE     | none         | nothing                      |
| Finished it.                                       | NOTE     | null         | unresolved reference         |

Old v3 `clarify` conflates missing identity, unknown action and unresolved reference. The app already had a v4 structured-advice prototype, but the evaluated classifier still emits v3 and cannot reconstruct those lost distinctions. `normalizeClassificationAdvice` continues to map its opaque output to null action plus `legacy_uncertainty`, **without guessing from keywords or borrowing the extractor's intent**.

V5 extends the development model contract to TV series and explicitly separates action from missing details for every media type. It is not wired into the pinned production classifier. The app review metadata shape remains v4 and can validate structured SERIES advice; the native worker's wire status remains v3. Different boundaries have different versions.

## What works in the app now

The local/cloud extractor's capture proposal carries optional, typed `clarificationReasons`, independent of classifier advice. New generation schemas request them; older proposals remain readable. Known reactions/plans are kept while asking for identity. Unknown action uses a null activity, not a fabricated progress/completion command.

Review shows the proposed action and missing detail separately. Editing/selecting a title clears identity/reference questions only. Choosing an action clears the action question only. Ordinary-note selection deliberately removes a media-only action requirement. Missing-identity placeholders cannot be confirmed as if a real work had been identified. Source-derived spelling suggestions do not silently erase unresolved details. Persistence rejects any remaining typed reason even if someone clears editor flags. Whole-work completion and unknown-amount progress keep their existing confirmation requirements. Classification/review receipts still bind to the exact source and edited proposal.

These typed reasons are review-only and never create titles, match IDs, amounts or reminders. No cloud fallback or new provider setting was added.

## Versioned labels, not rewritten history

`development.json` contains 32 AI-authored examples, often reused from known failures, with explicit v5 labels. `classification_advice_v5.json` and a CPU-only validator specify the future output contract. Known `reaction` plus `missing_identity` is a **new representation**, not an excuse to change old benchmark gold after seeing errors. None of these 32 cases can be called an independent final test. No bulk regex conversion of historical clarify labels was attempted. See experiment-01 for separately versioned training labels and newly held-out, AI-authored qualification notes; these are not independent human gold.

Before more training: audit labels and reason consistency under this contract, expand development coverage, reserve fresh evaluation and compare schema-qualified model outputs under the same policy. Report category, action and missing-detail scores separately and jointly. Never compare v3 two-field exact-match rates directly with v5 three-field rates.

## Verification

535 app tests and 37 Python tests passed; typecheck, changed-file lint and production build passed. The default suite skips two opt-in live tests. A separate actual local Qwen development handoff checked four notes with supplied legacy classifier fixtures. Initial trial preserved reaction/wishlist but wrongly guessed progress for bare reading. After strengthening general extraction instructions, all four checks passed, including ordinary letter reading with no false clarification.

This is prompt/schema/review development, not fine-tuned model accuracy. No new adapter was trained, no v5 classifier was activated, no memory was saved and no cloud AI was used in these probes. Full raw evidence, including the failure, is in `docs/fine-tuning-evidence/structured-details-20261017.json`. The live probe stops at extraction/validation; it is not a measured end-to-end classifier-plus-title-interpretation journey.
