# Human-language coverage audit

18 October 2026. **No training, inference, app change, relabeling of historical gold, or rescoring of the failed experiments.** This is a post-result audit of the latest v5 mixtures, public cases, written policy and validator.

## Main finding

The evidence points to **thin language coverage, inconsistent supervision/policy, and an overbroad clarification objective**, not a demonstrated need for a larger model. Category recognition is already strong on these small tests: repair candidate 48/48 authored categories and 15/16 scored public categories. That does not make the complete advice reliable.

The latest 196-row v5 training mixture is entirely AI-authored fictional wording. This statement applies to the current adaptation mixture, **not all pretraining or earlier reviewed730 fine-tuning history**. The public queries were evaluation-only. There is no independent human adjudication of the new OpenMemory task labels.

## Measured coverage gaps

Counts below are reproducible, word-boundary lexical searches used to locate examples for review. They are **not semantic classifiers, runtime rules, or proof that every equivalent expression is absent**. For example, an unfamiliar synonym may not match. They search original note text, not outputs or hidden source labels.

| Surface family | Before repair, 132 notes | Repair addition, 64 notes | Final mixture, 196 notes | Public sample, 24 notes |
| --- | ---: | ---: | ---: | ---: |
| rate/rating/stars/points/deserves | 2 | 0 | **2** | 7 |
| restaurant/bistro/reservation/cuisine/pub | 1 | 0 | **1** | 5 |
| explicit book-a-table/spot or reservation | 0 | 0 | **0** | 5 |
| numeric rating fraction, e.g. 2 out of 6 | 0 | 0 | **0** | 2 |
| literal “book series” phrase | 0 | 0 | **0** | 1 |
| course subunit words | 3 | 12 | **15** | 0 |
| first-person “I” | 47 | 25 | **72** | 3 |

The repair concentrated on course and ambiguity cases while leaving restaurant requests and rating constructions almost unchanged. That is an observed coverage mismatch, not proof of which updates caused the regression. Both mixtures and test samples are small and deliberately selected.

Other language dimensions are not adequately audited by current evidence: conversational continuations, code switching, ordinary spoken disfluencies, ASR-corrupted titles, negation with self-correction, broad dialect/register differences and multi-turn references. The current public subset contains no course/TV progress notes and does not test these dimensions. Do not claim broad human-language coverage from it.

## What the public failures actually mean

All 24 original public notes received an individual audit in `public-case-audit.json`. Original labels/scoring status are retained.

| Public source family | Nominated | Scored | Category correct | Action correct | Fully correct |
| --- | ---: | ---: | ---: | ---: | ---: |
| Music requests | 8 | 3 | 3/3 | 3/3 | 3/3 |
| Book ratings | 8 | 5 | 4/5 | 2/5 | 1/5 |
| Restaurant/booking plans | 8 | 8 | **8/8** | **8/8** | **2/8** |

All six restaurant failures had the correct category and action. They failed on unnecessary identity questions or a missing-action reason inconsistent with the known wishlist action. That is a clarification-policy/supervision failure; saying the model failed to understand six restaurant intentions would be inaccurate.

Book errors span both coverage and meaning: numeric ratings versus consumption, awkward grammar (“deserves 1 points”), and **book series versus TV series**. One collection-of-books query was called SERIES. The repair did not include the literal book-series contrast. The existing two rating examples both used “four stars”; they did not cover points, zero ratings or “deserves.”

## Benchmark and label limitations

SNIPS is crowdsourced command/query language, often with unusual combinations of party size, cuisine, venue, location and time slots. It is not a sample of spontaneous personal journals. The 37.5% full score therefore must not be advertised as a representative real-world app accuracy. Conversely, the 83.3% authored score must not conceal poor transfer to this external wording.

Eight cases were marked unscored **before** predictions: five music queries and three rating/type queries. Scored coverage is therefore uneven: 3/8 music, 5/8 book ratings, 8/8 restaurant plans. The public headline is not a balanced three-domain estimate. All eight excluded mappings remain visible; none should be relabeled from hidden source slots or brought into the score after viewing outputs. Named music requests may be interpretable with world knowledge, so an independent label review may disagree with some conservative abstentions. This audit does not claim the original AI judgments are perfect.

Exact screening used available historical artifacts, but the public source appeared in older project work. It is not globally source-heldout, worker-heldout or proven pretraining-independent. Its new OpenMemory labels are AI-authored. See the original [source/provenance record](../experiment-02/SOURCES.md).

## A confirmed training-label error

`v5-r2-repair-023`: **“Done with lecture four in that course.”**

Frozen gold says LESSON/progress with no clarification. The course is unnamed; under the frozen v5 policy, this should include `missing_identity`, consistent with nearby training examples about “that course.” The mistake was mine when authoring the repair labels. `label-defect-ledger.json` records a prospective correction without modifying `experiment-02/train.json`, its recipe hash, or historical results. One defect is not proof of the cause of every failure, nor a claim that all remaining labels are correct.

The surviving lesson-completion failure was **not wholly uncovered**: training already contained “Lesson eight done in my Geology Fundamentals course” labeled progress, close to the failed “Lesson twelve is done in my Soil Ecology course.” Adding another almost identical synthetic sentence is not yet an evidence-based repair strategy. We need contrasts that vary scope and language systematically, plus a clean, consistent task contract.

## Written policy versus validator

The v5 instructions and supervision need a prospective review before any new training. Original policy and validation remain untouched.

1. **Imperatives are inconsistent.** The policy/examples label “Watch a movie” as unknown action, but “Play a song by that singer” and music requests as wishlist. Both are ordinary requests in the app's capture context. Decide a consistent request policy before creating more labels; do not silently reinterpret earlier gold.
2. **“Missing identity” needs a scope.** The policy reserves ordinary nonmedia wishes from proper-name requirements, but its general wording about unnamed requested works can encourage over-clarification. Distinguish unknown tracked work, ambiguous medium and a generic wish that does not require a title. A request to play some music is understandable even if no track is named; whether a follow-up must block saving is a product decision, not established by the benchmark.
3. **Schema validity is weaker than policy validity.** CPU probes show that the validator accepts LESSON/none and BOOK/listen despite the written action meanings. It also accepts NOTE/none with unresolved_reference, where the examples use null. Therefore “zero invalid output” would not establish semantic correctness. Probes are contract diagnostics, not new model predictions or a reason to rewrite old scores.
4. **MIXED has a representation limit.** A mixed note can combine a clear event and a separate unknown action. But MIXED must have intent mixed, while missing_action requires intent null. The current top-level schema cannot express both. Either keep such per-entry questions in the splitter/extractor/review layer or prospectively redesign the contract. Training alone cannot resolve a contradictory representation requirement.
5. **Past consumption and completion need separate treatment.** “Watched/read” alone does not prove whole-work completion. Yet saving a mention need not always require forcing the user to choose progress versus complete. Define when unknown completion blocks a status mutation and when it can remain unknown. Preserve explicit confirmation for unsafe whole-work completion; do not solve ambiguity by guessing.

`policy-probes.json` retains actual validator accept/reject results. Tightening the validator later could reject inconsistent outputs; it would not make the underlying model understand them or retrospectively improve its accuracy.

## Coverage matrix for the next development dataset

| Family | What needs contrast | Current evidence | Priority |
| --- | --- | --- | --- |
| Nonmedia plans | unnamed venue vs named venue; request vs past visit; trip/purchase/restaurant | Correct coarse intent but excess questions | First |
| Ratings/reactions | points, stars, zero, fractions, deserves, ordinary bad grammar; review vs reading count | Two narrow training ratings; weak public transfer | First |
| Work versus subunit | lesson/module/lecture done vs whole course; episode/season vs entire series | Covered partly, still unsafe error | First |
| Generic versus unresolved subject | generic music/movie wish vs “it/that” needing context | Policy currently conflates some cases | Resolve policy first |
| Medium modifiers | book series vs TV series; course video vs movie; letters vs books | Some controls, key book-series gap | Next |
| Requests across media | watch/read/play/start, consistent imperative treatment | Inconsistent gold examples | Resolve policy first |
| Human variation | contractions, non-native grammar, fragments, typos, ASR disfluencies | No representative qualification coverage | Next, source-backed |
| Context-dependent notes | “finished it,” “six more,” corrections after a prior note | Classifier currently sees only the note | Evaluate context-aware flow separately |

These are collection/review requirements, not a request to generate a Cartesian product of templates and call it human data. Find eligible public wording, preserve original text/provenance, and isolate source families for development and final evaluation. Where the desired medium/intent is genuinely absent, abstain or adjudicate openly rather than reconstructing it from hidden dataset metadata.

## Bounded next plan

**Do not start a third training run yet.**

1. Write a versioned decision table for imperative intent, generic wishes, identity scope, mixed-note routing and completion evidence. Keep earlier contracts/results intact. This audit proposes questions; it does not approve a new policy.
2. Review the confirmed defect and all same-family labels against that table. Require documented, separate review; same-author self-check is not independent gold. Do not “fix” qualification labels simply to match predictions.
3. Build a source-eligible development set covering the first-priority families with a meaningful range of human expressions. Keep synthetic contrasts as supplements. Track author/source/conversation/template families where available and retain awkward examples.
4. Reserve untouched external wording and labels before another training attempt. Report category, action, reasons, unnecessary-follow-up rate and unsafe-completion rate separately. Use both human-note/app tests and source-specific diagnostic scores; do not combine them into one marketing number.
5. Train only after the contract and labels are stable. Keep base, installed adapter and candidate comparisons under identical conditions; keep a one-attempt budget and no automatic promotion.

The completed experiments already provide honest evidence of LoRA training, reproducibility and regression detection. They do not yet provide a qualified TV-aware replacement or independent final generalization claim.
