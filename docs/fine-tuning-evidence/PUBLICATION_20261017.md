# Published fine-tuning research —17 October2026

- [Research repository](https://github.com/mithhu/openmemory-local-classifier-research)
- [Experimental v0.1.0 release and download](https://github.com/mithhu/openmemory-local-classifier-research/releases/tag/v0.1.0)
- Selected native adapter: reviewed730, unchanged SHA256 `8724245782e5c709bf7ccd7b3631a944472bfb071d6cc659a9bcc5cb51143f01`.

The separate publication contains the actual adapter,730 attributed training examples,730 recorded losses, readable scripts, a learning guide, model/data documentation and complete paired evidence. It omits the pretrained base, original evaluation wording, user vaults, credentials and private research archive.

On200 previously reserved public expressions, both labels correct improved134/200 (67.0%) to153/200 (76.5%) against the exact same base. Category154→165 andintent161→174/200; both0invalid. Paired31gains/12losses,+9.5points,95%interval+3..+16points,exactMcNemar p=.0054.

**The constant NOTE/none baseline scores162/200 (81.0%) jointly, above the adapter.** Test labels are AI-assigned project-policy judgments, not independent human gold. Several action types are absent and PERSON/MOVIE categories regressed. This establishes a limited improvement over the base, not universal classification solved, production readiness or frontier superiority. Read the public FINAL_EVALUATION.md for complete caveats and source breakdowns.

All730 archived tokenizations matched; a separate two-update native trainer execution and standalone inference passed. No full bit-identical retraining is claimed. The exact48-file staged export and a fresh clone of the public repository passed hash/tensor/score verification and six research tests without the private archive. Native checks used the existing pinned MLX environment; a fresh full dependency installation was not exercised.

The downloadable2,601,146-byte ZIP has SHA256 `263cb17b2d37c5d68843d3d3f4f261647e814956ce1bac6a259ef6991fbf1694`.

Hugging Face upload is prepared locally but awaits the owner's Hub login; it has not been claimed as published there. The app's code and installed classifier were not changed by this publication task. Application working-tree changes from previous work remain uncommitted here.
