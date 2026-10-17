# First-visit introduction

The app now shows its narrated book-and-movie walkthrough in a first-visit welcome dialog after the workspace is available. Visitors can play with sound, skip, close, or read a transcript. The permanent **Watch demo** button in the top bar reopens it. Watching or dismissing the video does not select AI, send a note to a provider, or write a memory.

The video has burned-in English captions plus a WebVTT caption track. The popup uses the existing accessible Radix dialog for focus trapping, Escape and focus restoration. There is no automatic playback or audio. The video URL is assigned only after the Play gesture; closing pauses playback and unmounts the player. A playback failure offers controls/download without preventing entry to the app.

Dismissal is stored as `openmemory.demo-welcome.v1 = dismissed` in this browser/origin. It applies to Skip, Start, Close, Escape and backdrop dismissal. This is a non-sensitive preference, separate from the vault and AI consent. If browser preferences are blocked, the dialog remains dismissible but cannot remember across new visits. Existing visitors without this preference also receive the introduction once. Clearing site data resets it.

## Deployment assets

`public/demo/` contains the versioned 4.2 MB MP4, lightweight WebP poster, VTT and transcript. It contains the already-generated synthetic narration, not API credentials or a runtime ElevenLabs request. A Vercel deployment serves these as ordinary same-origin static assets. No third-party embed or new tracking service is introduced. The original video and its provenance remain in `artifacts/portfolio-female-book-movie-20261017/`.

The existing hosted privacy choice remains separate: the demonstrated MLX flow requires a configured Mac/runtime; first-time hosted visitors can enter manual mode or explicitly choose cloud AI. The video is an edited research/product demonstration and does not install a model.

## Verification — 17 October 2026

- Five focused tests cover first-visit readiness, no playback/download before a gesture, playback with sound, stop/dismissal, returning-visitor replay, blocked preference storage and playback rejection.
- Full app suite: 540 passed, two skipped. Existing capture/privacy route tests now explicitly represent returning visitors; first-visit behavior has dedicated coverage.
- TypeScript and changed-file ESLint passed; production build passed. Unscoped `npm run lint` finds unrelated existing errors in archived worktrees/research files and older files, so a clean global lint result is not claimed.
- Actual hosted-mode browser preview at `127.0.0.1:3108`: first popup, 91.25-second media loaded and played with `muted=false`; Escape/Skip and reload preserved dismissal; Watch demo reopened a fresh player. Manual AI mode stayed selected.
- Desktop 1280×720 and phone 390×844 inspected. A short-desktop layout fix keeps the footer reachable; phone layout stacks the primary action. Browser viewport override was reset afterward.
- Public MP4 hash matches its source; production output includes all four demo assets. No push or deployment was performed during this goal.
