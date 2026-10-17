# Scope: reviewed730 experimental legacy-v3 adapter

This staging bundle contains the unchanged, previously documented reviewed730 MLX LoRA adapter, its exact two-field prompt, runner, pinned base manifest/downloader, recorded recipe, evaluation report, data attribution and license/NOTICE. It does not include the 9B base, raw training/evaluation text, private application vaults, voice recordings, credentials or local environment files. Raw training text and its attribution are available separately in the published research repository. Evaluation wording with unestablished/restricted redistribution terms is omitted.

It is reasonable to publish this artifact **as experimental research with the stated limitations**, not as a qualified consumer classifier. The original adapter failed earlier broad qualification gates despite measured aggregate gains. “Installed” or “selected” must not be interpreted as successful scientific qualification. The source-heavy final test has a majority baseline above the adapter, rare/unsupported classes and AI-assigned labels. No frontier-model cost/speed/accuracy comparison was established.

Explicit exclusions:

- No SERIES category, season/episode learning or structured-v5 output.
- No TV v1/v2 candidate: both failed their own tests; their binary weights remain local.
- No new training or hidden gold changes during release preparation.
- No automated memory writes, catalog identity claims, scheduling or title/quantity extraction.
- No inference repair or constrained decoder in the reported frozen base-vs-adapter test. App-side fallback behavior is separate.
- No claim of independently human-annotated test labels, consumer accuracy or a newly reproduced bit-identical full training run.

Training material's source terms remain separate from code/adapter licensing. See DATA_SOURCES.md and NOTICE. This audit records provenance and distribution contents; it is not a legal clearance of every possible downstream use.

Publishing a future TV/structured model is a different release and requires its own compatible contract, labels, fresh evaluation, retention and app integration qualification. Do not rename this old artifact to imply those capabilities.

This directory was prepared locally. No Hugging Face repository, upload, account change or public release was performed by the preparation scripts. A user-owned Hub login, exact repository name and upload authorization are separate final steps. Tokens belong only in the user's terminal, never in chat or Git.
