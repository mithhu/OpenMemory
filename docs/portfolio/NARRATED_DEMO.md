# OpenMemory — original neutral-narrator demo

**New recommended version:** [book and movie demo with expressive female narration](BOOK_MOVIE_DEMO.md). This earlier edition is retained for comparison.

[Watch/download the narrated MP4](../../artifacts/portfolio-narrated-20261017/openmemory-narrated-demo.mp4) · [Captions](../../artifacts/portfolio-narrated-20261017/captions.srt) · [Narration script](../../artifacts/portfolio-narrated-20261017/narration.txt) · [Case study](CASE_STUDY.md)

An approximately 82-second motion walkthrough with synthetic ElevenLabs narration, speech-timed burned-in captions, moving close-ups of genuine application screenshots, short dissolves and a measured-results graphic. This replaces the earlier slow silent version as the recommended portfolio video. It is an edited screenshot-based walkthrough, not a continuous screen recording. Real processing waits are shortened; it must not be presented as a speed benchmark.

## What is real

The screenshots come from the actual local MLX capture/review/Save/library flow on 17 October 2026, using the fictional note “I want to read Sapiens.” The adapter hash and observed result BOOK/wishlist are recorded in [demo-provenance.json](demo-provenance.json). The item persisted after reload. Original app screenshots are retained alongside the earlier video; moving crops and added titles do not manufacture product states or change the underlying result.

The results graphic reports the frozen 200-expression comparison: base 67.0%, adapter 76.5%, majority NOTE/none baseline 81.0% joint accuracy. Training used 730 examples with AI-assisted labels. This is an experimental legacy-v3 adapter without a SERIES label. It is not evidence of frontier superiority or production qualification.

The original note's extraction had a minor planned-timing issue, documented in [the earlier demo notes](DEMO.md). The tight visual crop does not change the stored review or remove that limitation from the supporting evidence.

## Voice and privacy

Narration was generated with [ElevenLabs](https://elevenlabs.io/), using its standard voice ID `JBFqnCBsd6RMkjVDRZzb` and `eleven_multilingual_v2`. It is a synthetic narrator, not a clone or recording of the project owner's voice. On-screen attribution is included. Only the public fictional portfolio script was sent for synthesis. The generated narration was also transcribed through ElevenLabs for a speech-content check; no user memories, personal voice samples or credentials were uploaded. The API key remained in the local environment and is excluded from Git.

Text-to-speech was used only to produce this video. It does not change the app's voice capture architecture: its optional transcription still uses ElevenLabs, while this demonstrated typed capture used local classification/extraction.

## Build and verification

`artifacts/portfolio-narrated-20261017/` contains the story, narration, character alignment, captions, renderer, voice provenance and finished video. The synthesis script refuses to regenerate an existing audio file, avoiding accidental repeated requests. The renderer makes no network requests. Run `python3 artifacts/portfolio-narrated-20261017/render.py` to rebuild from the existing audio and screenshots with Pillow, NumPy, ffmpeg and the macOS Arial fonts.

The spoken script was verified against its full character alignment. A separate speech-to-text pass recovered the story and the training/test numbers; it rendered “waits” as the homophone “weights” and normalized some names/punctuation. That transcript is a diagnostic, not the authoritative caption track. Captions follow the synthesis alignment. Video/audio integrity, duration, loudness and visual samples are recorded in `verification.json` alongside the video. This is a portfolio presentation change, not new training or another classification evaluation.

Useful links: [app](https://open-memory-ai.vercel.app/), [research](https://github.com/mithhu/openmemory-local-classifier-research), [model](https://huggingface.co/mithhu333/openmemory-qwen3.5-9b-mlx-classifier-v1).
