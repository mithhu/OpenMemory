# One bounded v6 training experiment

Warm-start the previous rejected v5 research adapter on the audited 211-row v6 mixture. Qualification comprises 48 fresh AI-authored notes (16 SERIES, 32 retention) and 24 original public queries (19 scored, five predeclared ambiguous/unscored).

See LABEL_REVIEW.md, LEARNING_LOG.md, recipe.json and results.json when present. Public provenance/license: ../../structured-advice-v5/experiment-02/SOURCES.md and SNIPS-LICENSE.txt. Local source-cache inputs are pinned by full-file hash in the nomination records. SNIPS source family was used earlier; exact wording exclusion is not global source/pretraining independence.

All four checkpoints receive identical v6 prompts. The installed reviewed730 checkpoint's result is a transfer probe to an output contract it was not trained for; do not call it the current product's benchmark or compare these scores to published v1 scores. The prior research adapter is rejected v5 experiment-02. Both comparisons matter for interpreting a v6 candidate.

Run CPU checks and freeze before GPU work:

```sh
python3 -m unittest discover -s research/structured-advice-v6/experiment-01 -p 'test_experiment.py'
.local-runtime/venv/bin/python research/structured-advice-v6/experiment-01/freeze.py
HF_HUB_OFFLINE=1 TRANSFORMERS_OFFLINE=1 .local-runtime/venv/bin/python research/structured-advice-v6/experiment-01/run.py preflight
.local-runtime/venv/bin/python research/structured-advice-v6/experiment-01/supervise.py
```

One candidate only. Strict outputs are not repaired. All unscored public outputs still count toward contract-invalid totals. No production path changes unless subsequent compatibility checks pass; no automatic installation or Hugging Face update.
