# V6 integration review — no runtime changes

The candidate must pass frozen qualification before integration work. This review records the existing boundaries rather than silently changing them during a training experiment.

1. `scripts/app-mlx/classify.py` pins reviewed730's adapter/config, v3 contract, decoder, output wrapper, runtime and model-manifest hashes. It generates the legacy two-field response. A v6 checkpoint cannot safely replace only the weights at this path.
2. `src/lib/local-mlx.server.ts` validates the legacy two-field response and a literal reviewed730 SHA. Companion readiness/profiles and Ollama classifier artifacts have their own pins. All providers need explicit, versioned migration and artifact qualification before activation.
3. `src/lib/classification.ts` accepts structured advice at the app layer, including SERIES and known intent plus a missing identity. However it rejects known MIXED/mixed with component missing_action, which v6 intentionally permits. It also imports a v4 schema, so accepting most v6-shaped objects is not proof of v6 semantic validation.
4. Existing series conflict messaging says the installed model predates series support. That message must become profile-specific for a future qualified series-capable model; it must not be changed just to hide a failed classification.
5. Generic media wishlist notes need a safe non-catalog representation or explicit review. A new model's empty identity-reason list must not authorize creating a fabricated titled work. A specific unresolved work still needs identity review for linkage/status changes.
6. The classifier remains advice. The extractor supplies titles/counts/dates and must not transfer a classification action to the wrong entry. Season/episode progress and partial course lessons must retain user confirmation and never mark an entire series/course complete.

If qualification passes: add an explicit v6 profile, full strict v6 validation across native/companion/app paths, tests for mixed missing details and generic wishes, pinned artifact identity and updated capability messaging. Then test native capture end-to-end and separately export/qualify the matching Ollama artifact before selecting it in the deployed site. Existing reviewed730 remains available for rollback. No automatic release or Hugging Face replacement follows from one research score.

If qualification fails: retain existing app/model pins and report the actual failures. Do not treat a constrained decoder or a UI adjustment as evidence that semantic mistakes were fixed by fine-tuning.
