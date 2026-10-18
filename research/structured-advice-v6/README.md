# Structured advice v6 — policy and development data repair

**Research only: no v6 training, inference, model promotion, app behavior change or release.** Frozen v5 experiments and their scores remain unchanged.

The [decision table](DECISION_TABLE.md) resolves the audited imperative/generic-wish inconsistencies. The Python validator and JSON Schema now enforce the same category/action/reason combinations. Mixed routing can preserve missing component actions without erasing the mixed label.

## Versioned labels

`train-reviewed-v6.json` contains 196 explicit v6 versions of the earlier training rows. `label-migration.json` records every before/after label and rationale: **23 changes** (22 prospective policy revisions, one confirmed v5 authoring error). It does not migrate held-out gold or reinterpret earlier reported scores.

The confirmed defect is the missing course identity in “Done with lecture four in that course.” Generic unnamed wishes no longer demand a selected work; a clear imperative is treated consistently as wishlist; an explicit future wish retains wishlist when its referent is unresolved. “That singer” remains an unresolved constraint, distinct from choosing any generic song.

## Human-wording coverage

24 deterministic new development nominations from the official Sonos/SNIPS data were screened against available prior original expressions and IDs. **15 have provisional v6 labels: four book ratings and eleven booking requests. Nine remain quarantined**, with no forced labels from hidden source metadata. These are development examples, not a new independent evaluation set. Their OpenMemory labels were authored by the same AI, not independently human adjudicated.

`train-provisional-mixture-v6.json` contains the 196 migrated rows plus those 15 original public queries: **211 rows**, not yet a qualified training release. The source wording, whitespace and provenance are retained. Ratings now cover points, fractions, zero and book-series wording. Bookings include varied syntax, venue/group/time/location constraints and an original accented venue name. This is a narrow expansion, not broad coverage of human journals, speech, dialects or TV/course progress.

Word-boundary coverage searches (descriptive, not runtime classification) changed: rating cues 2→6; restaurant cues 1→7; literal booking/reservation cues 0→1; numeric rating fractions 0→1; literal book-series phrase 0→1. The eleven booking examples are manually classified by meaning; the narrow lexical search intentionally does not count every synonym. See coverage-comparison.json.

## Source and encoding

Dataset: https://github.com/sonos/nlu-benchmark/tree/b86ac7f1577868c42158d0dec77db50956046696/2017-06-custom-intent-engines

License: CC0 1.0. Citation requested by upstream: Coucke, Alice, et al. **Snips Voice Platform: an embedded Spoken Language Understanding system for private-by-design voice interfaces.** 2018. https://arxiv.org/abs/1805.10190

Full prior source/license provenance is retained at `../structured-advice-v5/experiment-02/SOURCES.md` and `SNIPS-LICENSE.txt`. New nominations preserve source file hashes, record indices and original segments. Source intent/slots are review provenance, never model input or automatic gold.

The two v6 source files (RateBook and BookRestaurant) are valid UTF-8; strict decoding avoids the Café→CafÃ© corruption introduced by treating UTF-8 as Latin-1. An auxiliary check initially assumed every earlier source was UTF-8 and failed on PlayMusic, whose file uses Latin-1. Verified the earlier 24 selected public texts against explicit per-file codecs: all unchanged. See source-encoding-verification.json. No source text was heuristically repaired.

SNIPS appeared in earlier project work. Exact expression/ID screening cannot establish global source-family, author or pretraining independence. Public command queries are not representative personal journals.

## Verification

- 10 focused v6 tests pass, including explicit label migration, category/action invariants, mixed unknowns, public-text retention and unchanged frozen v5 inputs.
- All 47 local classifier/companion Python tests pass.
- Independent JSON Schema engine (jsonschema 4.23.0) agrees with Python validation on **2,945 cases**, including the provisional mixture and legal/illegal type/action/reason combinations. This is validator agreement, not model accuracy.
- No classifier invocation, GPU use, training updates or accuracy evaluation.

The standard tests require no new app dependency. For the independent schema check, jsonschema 4.23.0 was installed in a temporary folder, leaving app and MLX environments unchanged:

```sh
python3 -m pip install --target /tmp/openmemory-v6-schema-check jsonschema==4.23.0
python3 -m unittest discover -s scripts/app-mlx -p 'structured_advice_v6_test.py'
python3 research/structured-advice-v6/verify_schema.py --jsonschema-path /tmp/openmemory-v6-schema-check
```

## Before another training run

Obtain separate label review of the migrated and public development data, including all nine quarantined cases; reserve fresh source-backed evaluation under v6; check the native/Ollama/app contract integration design; then freeze a bounded recipe. Do not reuse the already exposed v5 test rows as a new final benchmark. Nothing in this preparation qualifies an adapter or resolves the observed lesson-completion error in model weights.
