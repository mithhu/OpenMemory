# Local reminders

Capture reviews let users keep an uncertain plan, such as “in November,” separate from a specific reminder. The recorded memory date still represents the note/event, not a guessed trip date.

The extraction model supplies an original future timing phrase when available. Generation cannot schedule reminders: model-supplied reminder fields are removed, and timing phrases not present in the original note are discarded. Users can edit planned timing in review.

To schedule, select **Remind me**, choose a future date and time, and save the reviewed entry. This confirmation stores a UTC timestamp, the device's IANA timezone, and scheduled status in the same local vault as the memory. Invalid calendar times and times skipped by daylight-saving changes are rejected. Existing memories remain compatible.

Today lists upcoming and overdue reminders. Users can open the memory, mark the reminder done, dismiss it, or snooze a due reminder for one hour. Marking a reminder done does not assert that the associated movie or trip was completed. Later captures preserve an existing reminder unless the user explicitly replaces it.

This version is an in-app reminder list, refreshed every 30 seconds and when the window regains focus. It does **not** send operating-system notifications or wake a closed browser. Due reminders remain available on the next visit. Reminders do not sync between devices; export/import includes them with the other memory data.

Verification includes opt-in before scheduling, month-only timing without a guessed date, removal of model-generated schedules, local-time conversion and invalid dates, preservation on subsequent capture, and due reminder actions. Browser verification uses fictional notes in an isolated preview vault.

Final verification on 14 October 2026: 488 tests across 41 files, TypeScript, scoped ESLint, production build and whitespace checks passed. A real local Ollama capture of “I will go to Paris in November” returned planned timing “in November” with no reminder. In the isolated preview, the reviewer chose 25 October 2026 at 18:00 Europe/London, explicitly saved, observed the upcoming reminder on Today, reloaded to verify persistence, and marked the reminder done while retaining the memory. Screenshots are in the ignored `.local-runtime/ux-check/` directory. Vercel deployment was not independently verified.
