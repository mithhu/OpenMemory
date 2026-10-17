# Hugging Face readiness decision — 17 October 2026

**Ready to publish only as an experimental legacy-v3 research adapter. Hold any claim of TV-series support, structured-v5 training or consumer qualification. No upload was performed.**

This bounded audit is complete. It did not train another model, replace the app model, change old benchmark labels or modify the original GitHub release. Actual publication is a separate user-authorized step with a chosen Hugging Face account/repository and login; no configured Hub login was found.

## What the evidence supports

The reviewed730 adapter is a real local MLX LoRA artifact: 14 arrays containing 638,976 adapter values, backed by a recorded 730-update training trace and ordered data. The adapter SHA-256 is `8724245782e5c709bf7ccd7b3631a944472bfb071d6cc659a9bcc5cb51143f01`. The base is `mlx-community/Qwen3.5-9B-4bit`, pinned at `8b2b98c00a6b4d291155e4890773ca8f769aee53`.

On the existing frozen 200-note test, joint category/intent accuracy was 134/200 (67.0%) for the base and 153/200 (76.5%) for the adapter. A constant NOTE/none predictor scored 162/200 (81.0%). Thus we can claim an improvement over the same base on this test, but cannot claim a strong general classifier from that aggregate result. The test uses original public expressions with AI-assigned labels, not independent human gold, and has limited class coverage. Earlier broad qualification gates also failed. Installation/selection in the app is separate from passing those gates.

The recorded training material comprises 415 ConvAI2, 78 CCPE-M, 43 SNIPS and 194 fictional AI-assisted project notes. Archived tokenization was verified for all 730 rows, and a two-update trainer reconstruction smoke check exists. A fresh bit-identical full training reproduction has not been established. There is no controlled frontier-model, latency or cost superiority result.

## Release boundaries

- The original adapter outputs legacy two-field category/intent JSON; it has **no SERIES label**. Its `clarify` intent combines several kinds of uncertainty.
- TV v1 trained for 190 updates but regressed on the old replay set (39/64 to 24/64 joint). TV v2 trained for 200 updates but failed all four registered gates, including legacy retention (38/48 to 36/48). Both remain experimental and are excluded.
- Structured-advice v5 has development policy/data, not a trained released model. New app review/extraction behavior does not imply those capabilities were learned by the old adapter.
- This release is an MLX adapter requiring its separate base and Apple-silicon runtime. It is not a standalone model, GGUF/Ollama package, browser/WebGPU model or hosted endpoint.

## Package verification performed

1. Original release verifier: 47 package files, 730 training rows, 200 final rows per model, adapter checks and metric recomputation passed; six original unit tests passed.
2. Prepared a 16-file adapter-only bundle, retaining LICENSE/NOTICE, data attribution, frozen evaluation, exact prompt, pinned base manifest/downloader, recipe and runtime requirements. Added a root-directory inference runner and explicit release limitations. No base weights, raw corpus, app vaults, recordings, environment files or rejected candidates are included.
3. Four new CPU tests passed: accept Hub `.gitattributes` metadata, reject tampered adapter, reject wrong base and reject unexpected payload files. Model-card frontmatter parsed locally with the Hub SDK; no remote Hub validation occurred.
4. The actual runner loaded the unchanged adapter on this Mac and returned `BOOK/wishlist` for “I want to read Sapiens.” This is a known fictional repeatability smoke, **not fresh independent accuracy evidence**.
5. Archived only the 16 allowlisted payload files, excluding Python caches. Extracted the ZIP to a new directory and verified every bundle hash and pinned base file successfully. Archive identity and inventory are in `audit.json`.

## Provenance and license evidence

The locally pinned converted-base README declares Apache-2.0 and links to the upstream Qwen license. Its recorded README hash was checked through the base manifest. The exact converted revision's remote README was not fetched successfully during this audit. The [upstream Qwen license](https://huggingface.co/Qwen/Qwen3.5-9B/raw/main/LICENSE) is Apache-2.0 with Alibaba Cloud attribution. The package retains its original license and attribution notice.

The primary source descriptions identify [ConvAI2 as CC BY 4.0](https://raw.githubusercontent.com/facebookresearch/ParlAI/main/parlai/tasks/convai2/README.md), [CCPE as CC BY 4.0](https://raw.githubusercontent.com/google-research-datasets/ccpe/master/README.md), and [SNIPS as CC0](https://raw.githubusercontent.com/sonos/nlu-benchmark/master/LICENSE). Dataset terms remain separate from code/adapter licensing. Evaluation wording with unestablished/restricted redistribution terms remains omitted. This records provenance and distribution scope, rather than blanket legal clearance for every downstream use.

## Next action, without further training

For an experimental research publication: select the user-owned Hub repository, log in outside chat, then authorize upload of the verified allowlist. Publish the model card with all limitations intact. The README links to the existing research repository for data, trace and evaluation. This does not require another unbounded training cycle.

For a release advertised as the updated TV-aware app classifier: hold publication under that description. A compatible trained contract, fresh evaluation with meaningful class coverage, retention checks and actual app qualification are still required. Neither failed TV candidate should replace the existing model.

## Learning log

Release preparation is distinct from model training. We first verified the old artifact and recomputed its evidence, then checked what the model actually learned, checked source attribution, repaired the staging runner's folder assumptions, included the exact prompt and NOTICE, tested tamper rejection, ran one native inference, and verified a clean extracted archive. The key lesson is that a genuine fine-tuning result can be publishable research while still being unsuitable for broad product claims. Preserve failed experiments and limitations instead of silently renaming the older model.

Rebuild with `python3 research/hf-release-readiness-20261017/build_bundle.py --output /path/to/new-empty-directory`. The builder requires the verified original local distribution and never uploads. Actual binary staging and ZIP remain ignored by app Git; the tracked card, scope, runner, tests, hashes and report preserve the release preparation.
