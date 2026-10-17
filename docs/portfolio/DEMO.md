# Native MLX portfolio demos

**Recommended:** [Watch the female-narrated book-and-movie version](../../artifacts/portfolio-female-book-movie-20261017/openmemory-female-book-movie-demo.mp4). It adds ElevenLabs synthetic narration, speech-timed captions, moving close-ups, transitions and a results graphic. See [book-and-movie demo notes](BOOK_MOVIE_DEMO.md).

## Earlier silent walkthrough

[Watch/download the two-minute MP4](../../artifacts/portfolio-demo-20261017/openmemory-mlx-portfolio-demo.mp4) · [Caption file](../../artifacts/portfolio-demo-20261017/captions.srt) · [Runtime provenance](demo-provenance.json) · [Case study](CASE_STUDY.md)

This is a silent, captioned walkthrough edited from actual application screenshots, not a continuous screen recording or a real-time latency benchmark. Every product state was reached through the actual UI. Processing waits are omitted. It uses the fictional note “I want to read Sapiens.” in an isolated localhost:3107 workspace; the user's existing local and deployed vaults were untouched. Ten fictional seed memories were present initially.

| Time | What is shown |
| --- | --- |
| 0–20s | Privacy & AI with native MLX selected; local extraction is a separate stage |
| 20–40s | Fictional natural-language capture |
| 40–60s | Actual preparing-review state; adapter identity described in captions |
| 60–80s | Real Book / Sapiens / Something I want to do review |
| 80–100s | Explicit Save followed by confirmation |
| 100–120s | Saved library wishlist and the experimental result's limitations |

The app's metadata-only diagnostic log recorded BOOK/wishlist, adapter SHA-256 `8724245782e5c709bf7ccd7b3631a944472bfb071d6cc659a9bcc5cb51143f01`, 6.732 seconds generation and 11.747 seconds total classifier worker time including its checks/loading. These are one-run classifier measurements, not full-flow timings or a comparative performance result. The reviewed item persisted after reloading the app. The separate local extractor supplied the title and review plan; the fine-tuned adapter did not generate every displayed field.

No OpenAI provider was selected. No ElevenLabs request, voice recording or online title lookup was used in this new typed demo. The earlier [voice walkthrough](../LOCAL_MODEL_DEMO.md) documents ElevenLabs plus the converted Ollama classifier and must not be confused with this native MLX run.

A minor extractor issue was visible: planned timing repeated the whole input despite no date being supplied. It did not invent a specific date or reminder, and the demo does not claim extraction is perfect. This was not changed during portfolio preparation. This known demo note is not an independent test case or evidence of new accuracy.

The native MLX release, [research code](https://github.com/mithhu/openmemory-local-classifier-research), and [hosted app](https://open-memory-ai.vercel.app/) have different roles. A hosted visitor needs a running, paired local service to use native MLX. The published adapter is not a one-click consumer installer.

## Rebuild and verify

Original UI captures, rendering script and captions are committed alongside the MP4. The script uses Pillow and the macOS Arial font; ffmpeg creates the captioned still-frame sequence. Run from the project root on this Mac:

```sh
python3 artifacts/portfolio-demo-20261017/build_video.py
ffmpeg -y -f concat -safe 0 -i artifacts/portfolio-demo-20261017/frames.txt -t 120 -vf fps=24 -c:v libx264 -preset veryfast -crf 22 -pix_fmt yuv420p -movflags +faststart artifacts/portfolio-demo-20261017/openmemory-mlx-portfolio-demo.mp4
```

Verification: H.264, 1600×1080, exactly 120 seconds; all six encoded scenes were extracted and visually inspected. Video hash, screenshot hashes and runtime evidence are recorded in this directory. No new training or application-code changes were needed.
