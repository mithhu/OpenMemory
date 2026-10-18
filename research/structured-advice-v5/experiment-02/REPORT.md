# Focused repair: authored gains, public-wording regression, no promotion

18 October 2026. One bounded run completed in **25 minutes 6 seconds**. The installed reviewed730 adapter and published Hugging Face model remain unchanged. This report records a rejected research candidate, not a new release.

## Method

Warm-started experiment-01's rejected v5 candidate, replayed its 132 training notes, and added 64 explicitly labeled repair examples. Trained one pass (196 updates), rank-eight last-layer LoRA, Adam learning rate 0.000005. Same fixed v5 policy as experiment-01; frozen base weights. No regex classification, cloud inference, private memories, output repair or model downloads.

Before training/predictions, froze 48 new authored qualification notes plus 24 public SNIPS queries. Kept source text unchanged. Sixteen public mappings had scored AI policy labels; eight medium/type-ambiguous cases were declared unscored beforehand, retained in generation and contract validation, and never replaced. No source intent or slot metadata reached the classifier. See LABEL_AUDIT.md and SOURCES.md.

All three models saw the identical prompt and notes. **Previous candidate** below means experiment-01, not the installed app adapter. Do not compare these percentages with experiment-01's differently worded test set as if they were the same benchmark.

## New authored qualification — 48 notes

| Measure | Unadapted base | Previous v5 candidate | Repair candidate |
| --- | ---: | ---: | ---: |
| Full correctness | 31/48 (64.6%) | 34/48 (70.8%) | **40/48 (83.3%)** |
| Category | 48/48 | 47/48 | **48/48** |
| Action | 35/48 | 41/48 | **40/48** |
| Reason set, contract-valid response | 35/48 | 35/48 | **42/48** |
| TV-series full correctness | 8/12 | 10/12 | **11/12** |
| Missing-detail subset | 10/16 | 6/16 | **10/16** |
| Contract-invalid responses | 3/48 | 5/48 | **1/48** |

Paired changes: repair gained nine and lost zero versus base; gained seven and lost one versus previous v5. Action accuracy itself did **not** improve over previous v5; the joint gain largely reflects better clarification reasons and consistency. Do not claim all aspects improved.

Wilson 95% intervals for full correctness: base 50.4–76.6%; previous 56.8–81.8%; repair 70.4–91.3%. These describe selected AI-authored cases, not representative human-population performance.

## Public wording diagnostic — reported separately

Source: original crowdsourced queries from the official [Sonos/SNIPS NLU benchmark](https://github.com/sonos/nlu-benchmark/tree/b86ac7f1577868c42158d0dec77db50956046696/2017-06-custom-intent-engines), CC0. Full upstream paper attribution and license retained in SOURCES.md and SNIPS-LICENSE.txt.

| Measure on the 16 scored notes | Base | Previous v5 | Repair |
| --- | ---: | ---: | ---: |
| Full correctness | 3/16 (18.8%) | **8/16 (50.0%)** | **6/16 (37.5%)** |
| Category | 12/16 | 15/16 | **15/16** |
| Action | 11/16 | 12/16 | **13/16** |
| Reason set, contract-valid response | 4/16 | 8/16 | **7/16** |
| Music full correctness | 3/3 | 3/3 | 3/3 |
| Book-rating full correctness | 0/5 | 0/5 | 1/5 |
| Restaurant-plan full correctness | 0/8 | 5/8 | **2/8** |

Repair gained one and lost three scored public cases versus previous v5, net −2. Public full-correctness Wilson intervals: base 6.6–43.0%; previous 28.0–72.0%; repair 18.5–61.4%. Small, domain-restricted samples do not establish a general population decline, but this fails the predeclared no-regression engineering gate.

The public result exposes a useful distinction: **category recognition was 15/16, but the complete advice was only 6/16 correct**. Missing-detail logic frequently requested a restaurant identity for a nonmedia booking plan that the policy allows without one. Book ratings also lost their known reaction intent or were confused with TV-series wording. Broader category accuracy must not conceal these failures.

All 24 public notes were generated and retained; eight predeclared ambiguous notes receive no accuracy credit or penalty. Contract-invalid counts across all 72 notes: base 5, previous 8, repair 4. None of the repair candidate's invalid responses were from the eight unscored public cases. Human-authored source wording is not independent human task labeling: all OpenMemory gold mappings were AI judgments. SNIPS was used in older project work; exact-expression screening does not make it a globally held-out source or rule out pretraining exposure.

## Decision: rejected

Four gates passed: authored joint correctness did not regress versus previous v5 and improved over base; series did not regress; uncertainty did not regress.

Three gates failed:

1. Public scored joint correctness fell from 8/16 to 6/16.
2. One of nine partial-course/series controls was wrongly called whole-work complete: “Lesson twelve is done in my Soil Ecology course.” The note describes a lesson, not finishing its course.
3. Four outputs violated the contract (one synthetic, three scored public), even though they were JSON: incompatible MIXED/wishlist or BOOK/mixed outputs and known wishlist actions coupled to missing_action.

Other errors remained: guessing actions from bare past watching/reading, treating unresolved references as ordinary facts, and missing course identity/action questions. **Do not install or publish this candidate.** No gate was relaxed, gold changed, output repaired or second run started after inspecting the results. These notes are now exposed development feedback, not reusable fresh final evidence.

## Actual training and artifact proof

196 updates completed in 650.17 seconds; peak training MLX memory 6.12 GB, evaluation about 6.26 GB. All 638,976 trainable adapter parameters changed. First-ten mean training loss 0.05610; last-ten mean 0.03327. Loss improvement is not generalization proof.

Rehashed base metadata/weights, previous adapter and installed reviewed730 after execution: all unchanged. Candidate hash:

`a352d4fd5800d986d600b0567196dce41ef67b12d9569330b311e911408bb383`

Weights remain in ignored `artifacts/fine-tuning/structured-advice-v5-experiment-02/`. Frozen recipe, code, source provenance, labels, raw responses (including unscored cases), per-step losses, model versions, hashes and decisions are retained here. Four new CPU tests and the four experiment-01 tests passed; preflight tokenized all 196 rows without truncation (maximum 1021 tokens). No app code changed or app UI test was claimed for this model experiment.

## What to do with this evidence

Pause additional small synthetic repair rounds. The available evidence does not support promotion, even though authored results improved. First audit the task policy and training coverage on varied human wording, particularly nonmedia requests versus media-only identity questions, ratings versus consumption, ambiguous past-tense actions, and lesson-versus-course completion. Build a balanced development curriculum from new eligible examples and reserve genuinely fresh evaluation before another attempt.

This experiment demonstrates how to train, freeze a comparison and reject a regression. It does not demonstrate a production-ready replacement, frontier-model superiority, or independent final generalization.

Train-majority baselines on authored/public scored notes respectively: category 12/48 and 0/16; action 8/48 and 0/16; empty reasons 32/48 and 9/16; full MIXED/mixed/empty-reasons label 4/48 and 0/16. These are constant labels learned from the training distribution, not source-aware baselines. Base/previous/repair warm authored-request medians were 4.05/3.58/3.53 seconds; first requests 4.72/4.28/4.15 seconds, excluding model load. Single sequential runs do not support a general speed claim.
