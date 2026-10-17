# TV series expansion — development only

Status: app support added; **no new adapter trained or promoted**. Published reviewed730/v3 weights and research v0.1.0 are unchanged. They cannot emit SERIES. Extraction has a new category; the review explicitly describes legacy classifier disagreements. This is not evidence of fine-tuning improvement.

## Policy

- SERIES for an identifiable TV show or explicit TV-series request. MOVIE remains films.
- Plans are wishlist; starting is start; episodes or season completion are progress.
- Complete requires explicit whole-series completion. A season finale, the latest season, or reaching today's episode count is not whole-series completion.
- Praise alone is reaction. “Best series I've watched” does not establish finishing every season.
- Episode position (season 2, episode 3) is separate from cumulative episodes watched. It does not imply watching three episodes, or all prior seasons.
- Missing identity or ambiguous film/show titles need clarification. Never use title lists or spelling rules to classify. Generic TV habits remain NOTE.
- Local MLX/Ollama classification still uses the pinned old contract. Review conflicts honestly; do not remap old labels to SERIES or claim the old model was trained on this category.

## Dataset and isolation

32 project-authored, fictional AI-assisted development examples and 24 separately authored holdout examples. The holdout uses different named works and note families. Gold labels are provisional policy labels, **not independent human annotation**. Includes negative controls, person preferences, mixed events, everyday TV habits, typo expressions and non-media intentions.

`freeze.json` pins both files before any new training or scoring. Original examples were authored together in this session; this is development isolation, not a blinded or independently sourced benchmark. Neither set has been scored on the installed classifier. No claim of unseen base pretraining is possible. These 56 examples are a seed corpus, not a sufficient basis for promoting a replacement.

Some cases deliberately use category NOTE with a future intent and clarification for an unresolved film/show type. The proposed expanded policy permits this uncertainty without inventing a subtype. Do not force those cases into the old v3 category/intent assumptions.

## Before the next training run

1. Audit labels, especially unclear action, negation and identity; document adjudication before freezing a training recipe.
2. Expand the development pool, including ordinary expressions, rewatches, animation, anime, miniseries, non-English titles and ambiguous works, without cloning holdout wording.
3. Version an expanded classifier contract that can emit SERIES. Convert older training labels explicitly and preserve old prompt/adapter artifacts.
4. Train a separate candidate; retain original classes and test regressions, not just TV gains.
5. Freeze a same-base comparison and score category/intent jointly plus clarification and macro/per-class results. Keep the old 200-case public-source report separate.
6. Promote only after acceptable series, non-series and full capture behavior. Publish a new release with its own model card and provenance; never overwrite v0.1.0.

## App checks

`src/test/series.test.tsx` covers episode/season arithmetic, wish/reaction separation, full-series completion, persistence, legacy classification review and editing. `src/test/series-live.test.ts` is opt-in (`OPENMEMORY_LIVE_SERIES=1`): it uses only localhost Ollama Qwen for four fictional extraction cases, never cloud or the user's vault. These are extraction checks, not held-out fine-tuning results.

Online film-title lookup intentionally remains book/film-only. A TV series cannot accidentally be replaced with a film catalog result. TV catalog enrichment remains future work.

## Recorded development trial

Actual local Qwen extraction initially passed 3/4 TV-specific checks: a series opinion was emitted as a film. After strengthening the general series-vs-film instructions, the same four development cases passed 4/4. Full outputs, including the failure, are in `docs/fine-tuning-evidence/tv-series-development-20261017.json`. This was prompt iteration, not adapter training or final evaluation.

A secondary finding remains: the wishlist trial copied historical recommendation context into `plannedTiming`. These four checks validate TV type/action/season fields, not all extraction fields. The user must review timing; do not advertise the trial as complete extraction accuracy.
