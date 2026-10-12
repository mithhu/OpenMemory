# Voice capture

Select **Speak a memory**, then **Start recording** and allow microphone access.
Stop when finished, listen back if useful, and select **Transcribe**. The result
is appended to the editable draft. Review the transcript, then use the normal
**Review memory** and confirm/save flow. Nothing is saved automatically.

Audio is recorded in memory in the browser. The microphone stops on Stop,
discard, two-minute limit, errors, or component teardown. Audio is sent to
ElevenLabs only on explicit Transcribe, using Scribe v2 with automatic language
detection. This is cloud transcription even when memory reasoning uses Ollama;
the panel says so. The application does not persist the audio. Do not interpret
this as a provider zero-retention promise: ElevenLabs defaults to logging, and
its documented zero-retention option requires enterprise access.

The server reads `ELEVENLABS_API_KEY`. Keep it unprefixed by VITE_, set it as a
server secret on deployment, and restart local Vite when first adding it. No
key is sent to the client. Audio requests are limited to 6 MB, with supported
WebM/MP4/Ogg/WAV/MP3 MIME types and a 90-second upstream timeout. Recording is
limited to two minutes. Audio-file upload is an alternative to recording.
Microphone recording requires HTTPS or localhost and MediaRecorder support.

Failures retain the audio for retry or discard. Transcripts longer than the
remaining draft capacity are rejected rather than silently truncated. Recording
permission denial, missing configuration, unsupported browsers, and provider
credit/key errors have visible messages. Navigation is blocked while a voice
note is pending so it is not inadvertently discarded.

Validation: seven recording UI tests plus five server-boundary tests; 96 app
tests passed. A macOS-generated fictional WAV was transcribed successfully both
via the live API and through the app's actual server-function upload flow. The
result preserved movie Arrival, lesson three, and the remaining-course qualifier.
No user microphone recording was made during automated testing. Real accents,
background noise, and uncommon media titles still need human verification.

API documentation: https://elevenlabs.io/docs/api-reference/speech-to-text/convert.
