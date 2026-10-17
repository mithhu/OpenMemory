# Action and clarification advice

The app's version 4 advice separates **the action** from **the missing detail**. A user can clearly want to watch a film without knowing which film. Missing identity should not erase that future intention or cause a redundant question about whether it is a plan.

```json
{
  "category": "MOVIE",
  "intent": "wishlist",
  "clarificationReasons": ["missing_identity"]
}
```

An unknown action is `intent: null`, with a clarification reason. This is classifier advice only. It is never copied into a persisted activity command. Extraction independently reads the original note, and the user reviews the resulting entries before saving.

## Current runtime

The installed fine-tuned MLX adapter and Ollama classifier still receive their **evaluated v3 prompt** and emit the v3 two-field format. The model prompt, output validator, decoder, model identities and weights are unchanged by this update. The companion's status contract remains version 3, while the app's source-bound review metadata uses version 4. These versions describe different boundaries.

`classification-contract-v3.ts` preserves the existing model contract. Its prompt and schema are tested for parity with the pinned Python contract. `classification.ts` provides the v4 advice validator and explicit compatibility conversion:

| Model output     | App advice                                              |
| ---------------- | ------------------------------------------------------- |
| `MOVIE/wishlist` | `MOVIE`, `wishlist`, no classifier clarification reason |
| `MOVIE/clarify`  | `MOVIE`, action unknown, `legacy_uncertainty`           |

The old `clarify` label does not identify whether the title, action or reference is missing. Conversion therefore never guesses which one it meant. It also never borrows an extracted action to silently rewrite the classifier's advice. An old `wishlist` answer does not imply the title is known: extraction still checks the original note independently.

The extraction prompt now explicitly preserves a known action while asking about an unidentified work. Review displays known action and clarification separately, and labels legacy uncertainty honestly. Missing identity does not suppress checks for a conflicting action. Review evidence is bound to the exact source, proposal, action and clarification reasons; edits invalidate prior acknowledgment. Advice grants no permission to save or infer identity, amounts or completion.

## Local verification on 16 October 2026

A proposed v4 model prompt lives in `scripts/app-mlx/classification_advice_v4.json`. It is a **development contract**, not the currently activated model prompt. It defines request-versus-preference and desired-experience-versus-achievement boundaries for the next qualification round. It does not change the labels of earlier benchmarks.

The installed adapter was tested with that prompt against 12 authored development contrasts whose expectations were recorded before inference. Eight matched exactly. The four failures were:

- “Watch a movie”: returned the string `"null"` instead of JSON `null`.
- “I read a book last night”: returned `none` instead of an unknown tracked action, and omitted `missing_action`.
- “Finished it”: returned `none` instead of an unresolved action/subject.
- “Help me book a flight to Lisbon”: added an unnecessary identity question.

Several examples appear directly in the prompt. These results are a development smoke check, **not independent generalization accuracy**. They do not justify activating the new prompt or claiming an improvement. No retraining occurred. A future model update needs targeted training or prompt/decoder qualification, retention checks, and a newly reserved final test.

Three actual local extraction handoff checks also passed using the pinned Qwen extractor. Classifier advice was supplied as a fixture in these checks; they are not end-to-end classifier accuracy measurements:

| Original note                          | Observed extraction                                                                  |
| -------------------------------------- | ------------------------------------------------------------------------------------ |
| I want to watch a movie this weekend.  | MOVIE/wishlist; asks only which movie; preserves “this weekend”                      |
| I want to watch the film Quiet Valley. | MOVIE/wishlist; no redundant question despite supplied legacy classifier uncertainty |
| I want to visit Kyoto next month.      | WISHLIST with no media activity; no redundant question; preserves the recorded date  |

All calls were local; no memories were saved. No cloud model was used. The GPU lease was held during each probe, and the local extractor was unloaded after the handoff checks.

Validation: 507 automated app tests, 29 Python regression tests, TypeScript checking, lint for changed TypeScript files, and the production build passed. The three handoff checks ran in an additional local-only smoke test. After the final extraction instruction adjustment, the 50 affected transport/coordinator tests were rerun and passed. Original evaluation inputs and pinned model artifacts were checked by hash and remain unchanged.

The [curated development evidence](fine-tuning-evidence/advice-v4-development-20261016.json) contains authored cases, raw classifier outputs, supplied advice, extraction outputs and the decision to keep the existing prompt. Full scripts, frozen prompt and learning notes remain under `.research-workspace/docs/fine-tuning/advice-v4-20261016/` locally.

Existing open reviews should be reopened after a reload rather than reusing v3 review metadata. This change does not deploy the app or publish a new adapter.

## 17 October 2026: typed extraction details and v5 development policy

The app now also carries `clarificationReasons` in each extraction proposal. This is independent of the classifier: old `clarify` stays explicitly uncertain, while extraction can propose `reaction` with `missing_identity`. Title/work selection and action selection resolve different questions; unresolved typed reasons block persistence, and a missing-identity placeholder cannot be confirmed as a real work. Completion and unknown-amount progress still require their existing confirmations. Automatic title corrections retain unresolved details.

The app's v4 metadata shape accepts structured SERIES advice, but the production classifier remains pinned to its v3 wire contract. `scripts/app-mlx/classification_advice_v5.json` is a new **development-only** model policy, with 32 explicitly revised labels under `research/structured-advice-v5/`. It is not a newly trained/activated classifier and does not relabel earlier benchmarks. See that folder's README and learning log for the representation, safeguards and limitations.

Validation: 535 app tests, 37 Python tests, TypeScript, changed-file lint and production build passed. Four actual local extraction development cases passed after one prompt correction; supplied classifier advice was a fixture, not measured model output. The [full evidence](fine-tuning-evidence/structured-details-20261017.json) preserves the initial bare-reading failure as well as the rerun. No new model weights, cloud calls, memory writes or deployment were involved.
