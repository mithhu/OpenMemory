# Fine-tuning a local memory classifier with MLX

OpenMemory needs to distinguish a film wishlist from a diary entry, partial book progress from completion, and an ordinary experience from a media action. This project explored adapting a local model for that specific category/intent task, then tested the adapter inside a reviewed capture flow.

The project was developed with substantial AI-assistant support. The project owner directed the requirements and experiments; coding, dataset construction/review, training orchestration and analysis were AI-assisted. The native fine-tuning runs actually executed on the owner's Mac. This is hands-on project experience with an existing pretrained model, not training a foundation model from scratch or a claim of independent expert authorship.

## Model and experiment

- Base: `mlx-community/Qwen3.5-9B-4bit`, pinned revision `8b2b98c00a6b4d291155e4890773ca8f769aee53`.
- Adaptation: native MLX LoRA on a 4-bit quantized base; rank 8, scale 20, dropout 0, final transformer layer attention and MLP projections. Base weights remain frozen.
- Selected experimental adapter: `classification-reviewed9b-v1` (reviewed730), SHA256 `8724245782e5c709bf7ccd7b3631a944472bfb071d6cc659a9bcc5cb51143f01`.
- Training: 730 reviewed examples, one epoch, learning rate 1e-5, batch size 1, response-only loss. Data combined public wording with agent-authored fictional supervision; reviews were AI-assisted, not independent human gold.
- Task: ten categories and nine intents, with strict JSON validation, negation/tense handling, missing-identity clarification and mixed-event coverage.
- Evaluation decoding: frozen v3 prompt, thinking disabled, greedy generation, at most 80 output tokens. Artifact hashes, source splits and runtime versions were recorded.

## Results and what they mean

| Experimental candidate | Category on development set | Intent on labeled development subset |
| --- | --- | --- |
| Reviewed730 adapter | 196/208 (94.23%) | 176/195 (90.26%) |
| Later 856-example extension | 195/208 (93.75%) | 169/195 (86.67%) |

These are development diagnostics, not independent final-test accuracy, evidence of universal generalization or a measured improvement over every base model. Both candidates failed the strict comparative qualification gates. The later extension was rejected because its intent result regressed. The earlier adapter was integrated as an explicitly experimental, review-required local classifier after the user accepted that practical scope. An invalid output remained in each development run. The final held-out release gate was not completed or claimed.

App trials identified useful behavior and concrete failures: movie wishlists, ordinary sunset descriptions, book progress, mixed events and unresolved 'finished it' references generally classified sensibly. A negated film opinion was incorrectly labeled clarify instead of reaction. The separate local extractor sometimes produced a bad book title or omitted 'twice' as a numeric play count. Classification alone cannot validate extracted identities or quantities. These authored smoke examples are not another representative accuracy benchmark.

## Integration and engineering lessons

The app runs native MLX classification, waits for that process to exit, then uses downloaded Ollama for title/action/quantity extraction. On the tested 18 GB Apple silicon Mac, sequencing avoids keeping both inference models resident at once. Classification took roughly 8–10 seconds including loading and checks; measured full reviews took approximately 25–41 seconds. A persistent GPU lock, bounded worker execution, pinned artifacts and source-bound classification prevent overlapping jobs or advice attached to the wrong note.

The model never saves automatically. Original words remain available; title edits, quantity checks, completion confirmation, classification conflicts and explicit review control persistence. The normal app is local-first, and cloud reasoning requires an explicit provider choice. ElevenLabs is used only for user-triggered audio transcription.

Experiments reinforced three lessons: more examples can regress a smaller task; valid JSON is not proof of correct meaning; and classifier scores do not substitute for testing the complete application. Full logs and experimental scripts are retained in a separate local research archive. They are not bundled with the product repo, and model weights are not distributed here.

## Portfolio wording

An accurate project bullet is: **“Completed an AI-assisted MLX LoRA fine-tuning and evaluation project for personal-note category/intent classification, compared candidate adapters, and integrated the experimental model into a local-first app with source validation and human review.”**

For interviews, be prepared to explain LoRA versus full fine-tuning, quantization, label provenance, leakage-safe splits, the development/final-test distinction, response-only loss, rejected experiments and observed failure cases. Use the private learning log to practice these explanations; do not claim production-ready accuracy or expert-level training experience from this project alone.

## App packaging validation

The product export passed 400 application tests, TypeScript and a production build without the research archive, local model files or credentials. This used the installed JavaScript dependencies in a clean staged-file export; it is not a fresh native-model qualification. Required regression fixtures contain authored fictional notes and recorded local responses.
