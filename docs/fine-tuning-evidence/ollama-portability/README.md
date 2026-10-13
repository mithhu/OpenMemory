# Porting the actual MLX adapter to Ollama

The same reviewed730 LoRA matrices were exported as a 2,557,184-byte F32 GGUF adapter and loaded by Ollama 0.32.11. The export reuses the installed Qwen3.5:9b Q4_K_M base, without downloading or merging another base model. Model weights and original note wording are not included here.

| Existing development cases | Category | Supported intent | Valid outputs |
| --- | --- | --- | --- |
| Ollama base | 188/208 (90.38%) | 131/195 (67.18%) | 204/208 |
| Ollama + converted adapter | 197/208 (94.71%) | 167/195 (85.64%) | 207/208 |
| Historical native MLX adapter | 196/208 (94.23%) | 176/195 (90.26%) | 207/208 |

The Ollama adapter gained 4.33 percentage points in category and 18.46 in intent over the same Ollama base. Native MLX remains stronger on intent. The base quantization and runtime differ, so this export is not prediction-identical to native MLX. Invalid predictions count as failures. These are reused, AI-labeled development cases, not independent final-test results.

## How the conversion works

The adapter has 14 F32 arrays: rank-8 A/B pairs for seven projections in full-attention layer 31. Export transposes the arrays into GGUF layout. MLX uses a direct multiplier of 20; GGUF uses alpha/rank, so alpha is 160 (160/8=20). Every exported tensor round-tripped exactly, and all seven low-rank updates passed numerical checks on seeded random inputs. The base GGUF target names and dimensions were verified.

The imported model is `openmemory-classifier:reviewed730`, final digest `235b080b2654c6784f979b3e61d63f84bf7a0e7261e0788d140ed5abd273928c`. The evaluation used the preceding manifest with explicit overrides; the final manifest merely stores the same zero presence penalty. Adapter/base weights and effective evaluation settings are unchanged. See `imported-model.json`. Four final checks passed using stored defaults, including the structured chat interface.

The private research archive retains the converter, pinned official GGUF writer/reader and license, exact Modelfiles, full local execution records and fictional smoke inputs. This folder provides the arithmetic and artifact identities without distributing model weights or third-party text.

## Verify scores without a model

```sh
python3 docs/fine-tuning-evidence/ollama-portability/verify.py
```

The verifier checks the exported paired-row hash, row count, scoring denominators and both Ollama totals. This verifies the published arithmetic; it does not independently judge semantic labels or prove generalization.
