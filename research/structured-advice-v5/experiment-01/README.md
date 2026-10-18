# V5 structured-advice experiment 01

One bounded attempt to teach the local classifier TV-series labels and independent known-action/missing-detail advice. **Not installed in OpenMemory.** The published reviewed730 adapter and historical results remain unchanged.

## Reproduce

Use the cached model and parent adapter pinned in `base-manifest.json` and `recipe.json`, plus the existing `.local-runtime/venv` MLX environment. No downloads are performed by these scripts.

```sh
python3 -m unittest discover -s research/structured-advice-v5/experiment-01 -p 'test_*.py'
.local-runtime/venv/bin/python research/structured-advice-v5/experiment-01/run.py preflight
.local-runtime/venv/bin/python research/structured-advice-v5/experiment-01/supervise.py
```

Run in a clean experiment copy with no existing outputs. Exclusive-create output files deliberately refuse overwriting previous outcomes. Paths are repo-relative; the candidate directory is `artifacts/fine-tuning/structured-advice-v5-experiment-01` (ignored from Git). The supervisor holds the shared local-model GPU lock for the experiment, enforces deadlines and reaps children on failure. Never launch concurrent app/model inference manually to bypass that lock.

## Data and interpretation

- 132 training notes: 100 new fictional notes and 32 reused v5 development notes.
- 48 qualification notes: 16 series and 32 retention; all eleven categories represented.
- Same-author AI labels, reviewed against a fixed policy before predictions. This is held-out engineering qualification, **not independent human evaluation**.
- No user memories, crawled social data or cloud inference.
- Raw greedy output only, no JSON repair or label correction from predictions.
- Base, current parent and candidate use the same v5 contract. The parent was trained on v3; its format failures cannot be marketed as regression on its original task.
- Success requires the frozen gates in `recipe.json`; any pass still needs app compatibility and end-to-end review checks before promotion.

Read `LEARNING_LOG.md` for the reasoning and `LABEL_AUDIT.md` for limitations. Recipe and output hashes make the attempt auditable; they do not establish label truth or independence.
