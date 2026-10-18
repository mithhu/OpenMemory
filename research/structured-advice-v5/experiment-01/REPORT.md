# V5 candidate: measurable improvement, rejected for app promotion

18 October 2026. One local attempt, 16 minutes 57 seconds overall. **The app and public model still use reviewed730.** No cloud inference, private notes, deployment or Hugging Face replacement.

## What changed

Warm-started the existing Qwen3.5-9B 4-bit MLX LoRA adapter and trained its 638,976 adapter parameters on 132 labeled examples for one pass. V5 adds TV SERIES and separates known action from missing identity/action/reference details. The base model weights remained frozen. This is actual adapter training, not only prompt editing.

## Held-out qualification results

All three models saw the identical v5 prompt and the same 48 notes, using raw greedy output without repairs. Full correctness requires category, action and the entire reason set to match.

| Measure | Unadapted base | Current reviewed730 adapter | New candidate |
| --- | ---: | ---: | ---: |
| Full correctness | 27/48 (56.3%) | 28/48 (58.3%) | **41/48 (85.4%)** |
| Category | 45/48 | 41/48 | **47/48** |
| Action | 36/48 | 36/48 | **43/48** |
| Reason set, contract-valid output | 35/48 | 36/48 | **42/48** |
| TV-series full correctness | 7/16 | 9/16 | **15/16** |
| Other categories, full correctness | 20/32 | 19/32 | **26/32** |
| Missing-detail subset | 9/15 | 8/15 | **10/15** |
| Contract-invalid outputs | 2/48 | 3/48 | **3/48** |
| Warm median request latency | 4.00 s | 3.68 s | 3.50 s |

Candidate gained 15 paired cases and lost one versus the base (net +14); gained 14 and lost one versus the current adapter (net +13). Train-majority baselines on qualification: full label 3/48, category 16/48, action 10/48, empty reason set 33/48. Category/action partial scores can credit a correct field in an otherwise invalid response; joint/reason scores require a contract-valid response.

Descriptive Wilson 95% intervals for full correctness: base 42.3–69.3%; current adapter 44.3–71.2%; candidate 72.8–92.8%. Series candidate interval: 71.7–98.9%, only 16 cases. These are conditional binomial summaries, not a demonstration of representative population performance: the examples were hand-authored, not randomly sampled human notes.

First request times: base 4.72 s, parent 4.30 s, candidate 4.17 s. Warm p95: 4.33 s, 3.79 s, 3.60 s respectively. These are sequential same-machine runs, not repeated controlled performance benchmarks. Request latency excludes model loading; do not market this as a broad speed win.

## Why it was rejected

Five frozen gates passed: series improvement over parent; no aggregate retention loss; no uncertainty-subset loss; overall improvement over base; no false whole-series completion on the two season-only controls. The zero-invalid-output gate failed.

Three candidate outputs were syntactically valid JSON but violated the v5 contract:

- Unknown BOOK action returned an empty reason set.
- An unresolved reference returned MIXED with wishlist plus contradictory missing-action reasons.
- Independent travel and swimming plans returned MIXED with wishlist instead of mixed.

Other errors: bare past watching still guessed an action; an unspecified course request omitted missing_identity; and **lesson seven completed was confused with the entire course completed**. Course full correctness fell from 3/4 to 2/4, despite aggregate retention improving. Both the contract failures and this completion mistake argue against production promotion. No JSON repair, relaxed gate, label edits or additional training was used to conceal them.

The seven full-correctness failures are preserved verbatim in `candidate-predictions.jsonl`. These now count as exposed development feedback. A future repaired candidate needs a newly reserved qualification set; this run must not be repeatedly tuned and presented as an untouched final test.

## Strength and limits of the evidence

This supports a narrow claim: **one LoRA update improved the v5 task on this newly held-out authored qualification set**. It does not establish performance on independent human notes, superiority over cloud/frontier models, or production readiness.

All 48 notes and policy labels were AI-authored and reviewed by the same author. Qualification uses different titles from the 132-row training mixture and no exact note overlap with historical TV JSON collections; semantic patterns and pretraining knowledge may overlap. This is not the independent public/human final benchmark still needed for a release claim.

The parent was trained under v3, while these results use v5. Its 58.3% here is not a replacement for its historical v3 benchmark. Base-versus-candidate under identical v5 conditions is the clearest adaptation comparison.

## Artifact verification

- All 132 training updates completed in 436 seconds; peak training MLX memory about 6.09 GB, peak evaluation about 6.26 GB.
- 638,975 of 638,976 trainable adapter parameters changed; base weights and parent hashes verified unchanged afterward.
- First-ten mean training loss 0.11389; last-ten mean 0.03794. Training loss alone is not held-out accuracy.
- Candidate SHA256: `243dc736f8310359ed862b8c042d5f10e0e6b2b8913a346816aaeaa50b10dec1`.
- Current parent SHA256: `8724245782e5c709bf7ccd7b3631a944472bfb071d6cc659a9bcc5cb51143f01`.
- Candidate weights remain in ignored `artifacts/fine-tuning/structured-advice-v5-experiment-01/`.
- Frozen inputs, model pins, raw generations, per-step losses, timings and verification results are retained here. No private source or secret is required to inspect the report.

## Verification of tooling

Four experiment CPU tests passed. The existing 37 Python classifier/companion tests passed with localhost socket access. Their first sandboxed run failed on test-server binds; those errors were environmental, not waived assertions. Preflight tokenized all training examples without truncation (maximum 1020 tokens). Every frozen input and prediction hash was checked after execution. The app's TypeScript/UI source was not changed by this experiment.

## Next step

Do not release or install this candidate. Use the exposed failure families to design separate training material, especially action uncertainty, missing-course identity, mixed requests and lesson-versus-course completion. Reserve new evaluation before another attempt. Independent public/human wording remains necessary before calling the model broadly validated. Integration with the new native/Ollama advice contract is a later gate, not something this rejected candidate passed.
