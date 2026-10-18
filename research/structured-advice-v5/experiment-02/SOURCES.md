# Public wording provenance

Source: Sonos/SNIPS `nlu-benchmark`, pinned revision **b86ac7f1577868c42158d0dec77db50956046696**.

- Dataset and method: https://github.com/sonos/nlu-benchmark/tree/b86ac7f1577868c42158d0dec77db50956046696/2017-06-custom-intent-engines
- License: https://github.com/sonos/nlu-benchmark/blob/b86ac7f1577868c42158d0dec77db50956046696/LICENSE
- Paper: Coucke, Alice, et al. **Snips Voice Platform: an embedded Spoken Language Understanding system for private-by-design voice interfaces.** 2018. https://arxiv.org/abs/1805.10190

The upstream method states that more than 2,000 queries per intent were generated using crowdsourcing. Repository license is CC0 1.0; original text is retained in SNIPS-LICENSE.txt. Upstream asks publications using these datasets to cite the paper above.

Selected original queries come from the upstream training partition. For **our** repair run, they are evaluation-only; no selected query enters train.json. This does not make the source globally held out: this project used SNIPS in older work, and the base model may have pretrained exposure. Exact original-expression screening against available historical artifacts cannot rule out semantic duplicates, unrecorded exposure or related source families.

The model receives only the original query in the normal note field. Source intent and slots are provenance fields, not model input. OpenMemory category/action/reason labels are AI policy judgments written before predictions. Eight ambiguous mappings are explicitly unscored; all 24 nominations and generated responses remain visible. This is a narrow external-wording diagnostic, not a representative naturalistic journal/TV-series benchmark or independent human task annotation.

Source file hashes and paths are in public-source-manifest.json; nominations preserve record indices, hashes, original segment text and exact joined wording. Sampling and exclusions are in collect_public.py and public-screening.json. Local source downloads are under /tmp/openmemory-v5-public-source; they are not needed to inspect the retained selected-query evidence.
