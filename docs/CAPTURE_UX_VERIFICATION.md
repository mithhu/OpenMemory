# Capture feedback verification — 14 October 2026

## Problem and changes

AI processing, completed reviews, and clarification questions were easy to miss below the capture composer. Saving could be disabled without a visible explanation.

- Processing has a persistent status card, elapsed time, and the existing stop/manual-review choices.
- A completed review receives focus and scrolls into view. The composer indicates that the review is ready.
- A readiness checklist explains outstanding decisions and moves focus to the relevant control.
- Clarification questions appear near the top of the review and in prominent entry cards. Advisory questions do not introduce new save requirements.
- Explicit saving produces a persistent confirmation with a shortcut to the saved memory or entries.
- Optional reflection questions are visible on compact memory cards and have an explicit answer action.

## Verification

- Full automated suite: **482 tests passed across 40 files**.
- TypeScript, scoped ESLint, production build, and Git whitespace checks passed.
- Browser check used an isolated localhost:3007 vault in hosted mode, with Local Ollama selected and a fictional note. It did not use cloud inference or the user's existing vault.
- Note: “I want to watch a movie this weekend.”
- Observed the processing status card and elapsed time while real local inference ran.
- Completion focused “Here’s what I understood.” The top status showed one outstanding title decision and the question “Which movie would you like to watch?”
- Clicking the question shortcut focused the entry's question card.
- Editing the title to “Arrival” cleared the outstanding title decision and enabled saving.
- Saving focused the persistent “Your memory is saved” confirmation. “Open saved memory” opened the Arrival detail view.

Local screenshots are retained under `.local-runtime/ux-check/` (ignored by Git). This verifies the local preview; it does not establish that a Vercel deployment has finished or independently benchmark model accuracy.
