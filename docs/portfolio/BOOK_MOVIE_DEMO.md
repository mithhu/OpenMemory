# Book and movie demo — expressive female narration

[Watch/download the revised MP4](../../artifacts/portfolio-female-book-movie-20261017/openmemory-female-book-movie-demo.mp4) · [Voice preview](../../artifacts/portfolio-female-book-movie-20261017/female-voice-preview.mp3) · [Captions](../../artifacts/portfolio-female-book-movie-20261017/captions.srt) · [Script](../../artifacts/portfolio-female-book-movie-20261017/narration.txt)

This approximately 91-second edition uses ElevenLabs' standard Jessica voice with `eleven_v3` and soft, playful, confident delivery cues. It replaces the earlier neutral narrator at the project owner's request. The narrator is synthetic; no voice was cloned. Visuals retain the earlier design and book captures, with a new real movie flow and updated speech-timed captions. These are animated crops of actual app screenshots, not continuous screen recording. Processing waits are shortened and explicitly disclosed.

## The two examples

1. **Book:** “I want to read Sapiens.” The actual reviewed730 MLX adapter returned BOOK/wishlist. Local extraction prepared the title and review, and explicit Save added it to the wishlist. See the [book provenance](demo-provenance.json).
2. **Movie:** “I watched Arrival and loved it.” The actual adapter returned MOVIE/clarify. The extractor independently proposed Arrival, complete, loved. Review required checking the uncertain advice and explicitly confirming whole-film completion before Save. The movie was not silently treated as a confident complete classifier result. See [movie provenance](../../artifacts/portfolio-female-book-movie-20261017/movie-provenance.json).

Both items survived reload in the isolated `http://127.0.0.1:3107` workspace, separate from the owner's local and deployed vaults. No OpenAI provider, online title search or live microphone was used. The movie experiment exposes a classifier weakness rather than proving new model accuracy. It also demonstrates why the human review boundary exists. No model was retrained or replaced.

## Voice and timing

The same factual story is directed using short v3 audio tags. Only the public fictional narration was sent to ElevenLabs. Its character alignment is retained; delivery tags are removed from the caption/alignment track without changing spoken content. A separate speech-to-text check recovered the story, movie uncertainty and result numbers without speaking the direction tags. As in the earlier version, transcription interpreted “waits” as its homophone “weights”; the caption script retains “waits.”

The full narration is about 90 seconds, followed by a short end hold. It reports the 730-example training run and frozen 200-expression joint results (67.0% base, 76.5% adapter, 81.0% majority baseline) with experimental limits. The released adapter has no SERIES label. No frontier-superiority or representative consumer-accuracy claim is made.

The earlier [neutral narrator version](NARRATED_DEMO.md) remains available for comparison. This revision is saved separately so neither its audio nor its original timing is lost.

## Rebuild and checks

Sources live in `artifacts/portfolio-female-book-movie-20261017/`. `generate_voice.py` reads the local ElevenLabs key without logging it and refuses to regenerate existing narration. `render.py` reuses the generated speech, retained book UI captures and new movie UI captures; it makes no network requests. Dependencies are Pillow, NumPy, ffmpeg and the macOS Arial fonts.

`verification.json` records final media codecs, duration, decode check and hashes. Speech content was checked through ElevenLabs transcription, and encoded frames were inspected. No API key or private vault data is included. Narration is attributed to ElevenLabs on screen.

[Case study](CASE_STUDY.md) · [Interview guide](INTERVIEW_GUIDE.md) · [Published adapter](https://huggingface.co/mithhu333/openmemory-qwen3.5-9b-mlx-classifier-v1)
