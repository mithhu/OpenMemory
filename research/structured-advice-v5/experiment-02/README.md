# Experiment 02 — one focused v5 repair

**Offline research; not installed or published.** Warm-start from experiment-01's rejected candidate and train one bounded repair attempt, preserving all historical evidence.

## Scope

- Training: 196 AI-authored fictional notes (132 replay + 64 targeted repairs).
- Fresh synthetic qualification: 48 notes covering all eleven categories, including nine partial-series/course completion controls.
- External wording diagnostic: 24 original crowdsourced SNIPS queries; 16 pre-inference scored labels and eight predeclared ambiguous/unscored cases. Human wording does not mean independently human-annotated OpenMemory gold.
- Three models: unadapted base, previous v5 candidate, repair candidate. The `parent` filenames mean the previous v5 candidate here, **not installed reviewed730**.
- Identical fixed v5 contract and raw greedy generation for all models. No JSON repair, hidden source slots or test-guided label edits.
- Source was used in earlier project research: exact-expression screening is not global source-heldout or pretraining independence. Synthetic and public accuracy must stay separate.

See `SOURCES.md`, `LABEL_AUDIT.md` and `LEARNING_LOG.md` for provenance, policy choices and limitations.

## Reproduction

Use the existing local MLX environment and base model pinned in `base-manifest.json`, plus experiment-01 adapter SHA256 `243dc736f8310359ed862b8c042d5f10e0e6b2b8913a346816aaeaa50b10dec1` at its recorded ignored artifact path. The installed app adapter is separately pinned and must remain unchanged.

```sh
python3 -m unittest discover -s research/structured-advice-v5/experiment-02 -p 'test_*.py'
.local-runtime/venv/bin/python research/structured-advice-v5/experiment-02/run.py preflight
.local-runtime/venv/bin/python research/structured-advice-v5/experiment-02/supervise.py
.local-runtime/venv/bin/python research/structured-advice-v5/experiment-02/verify_artifacts.py
```

Run only in a clean experiment copy. Exclusive-create output files refuse overwriting past runs. The supervisor holds the canonical app GPU lease, limits training to 900 seconds and each evaluation to 480 seconds, caps the complete run at 39 minutes, and reaps workers on failure. Do not bypass the GPU lease to run concurrent inference.

`recipe.json` binds all predictive/scoring inputs, code, data and contract dependencies before training. `results.json` will record the frozen gate decision. Passing gates permits later app compatibility checks; it never automatically installs or publishes weights. A failed test remains failure evidence and exposed development feedback, never a reusable independent final test.
