# V6 experiment 01 — learning log

## Before training or inference

1. Re-read the v6 decision table and all 196 migrated training rows. Review all 24 development-source nominations separately from predictions; accept 15 and retain all nine quarantined rows excluded. Record this as a same-session AI review, not independent human labeling.
2. Preserve the prior v5 experiments, labels, predictions and rejection decisions. Copy the 211-row v6 development mixture into this experiment and deterministically shuffle with seed 2026101901. No new failure-directed training examples added in this round.
3. Author 48 fresh synthetic qualification notes, including 16 series notes, eight course cases, five movie and five book cases, plus music and nonmedia retention. Explicitly test partial lesson/season completion, generic wishes, ratings, unresolved references and mixed events.
4. Deterministically nominate 24 public queries (eight each RateBook, BookRestaurant, PlayMusic) after exact expression/ID exclusion against available prior artifacts. Preserve original source wording and encoding; source provenance and licenses are retained in the earlier SOURCES.md. No source metadata is supplied to the model.
5. Label 19 public queries and retain five ambiguous-medium queries as unscored before predictions. Public wording is crowdsourced; labels are AI task judgments. SNIPS was already used by this project. These are fresh exact expressions, not an independent final human benchmark or proof against pretraining leakage.
6. Use last-layer rank-eight LoRA with frozen quantized base weights, warm-starting from rejected v5 experiment-02. One epoch, 211 updates, batch size one, Adam learning rate 0.000005. The installed reviewed730 adapter is not overwritten.
7. Compare four checkpoints under the identical v6 prompt with raw greedy decoding and no output repairs: unadapted base, installed reviewed730 transfer probe, previous rejected v5 research adapter, new v6 adapter. The installed adapter expects a two-field contract; its new-prompt score is not a production-pipeline accuracy claim.
8. Freeze runners, labels, validators and the decision gates before inference. Use the canonical app GPU lease and offline local model files, no cloud inference or model downloads. Limit training to 1,200 seconds, each evaluation to 600 seconds, all GPU work to 3,600 seconds, and MLX active+cache allocations to 8 GB. Terminate and reap a timed-out child.
9. Passing qualification only permits native/Ollama/app compatibility checks; it does not automatically install, deploy or publish. If gates fail, report the evidence and retain the current app adapter. Do not launch another training attempt based on this qualification feedback in this experiment.

Execution and results will be appended after the frozen run completes.
