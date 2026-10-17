# Local consumer-flow check — 16 October 2026

## Scope and evidence limits

Ran the real app in Chrome at a separate origin, `http://127.0.0.1:3101/`. The user's localhost:3001 and deployed vaults were not changed. The test origin automatically seeded ten demo memories. All additional notes were fictional. No cloud provider was selected, no weights were trained or promoted, and no deployment was made.

The capture path used the installed reviewed730 MLX classifier (adapter SHA256 `8724245782e5c709bf7ccd7b3631a944472bfb071d6cc659a9bcc5cb51143f01`) and local Qwen3.5:9b extraction. The app pins both identities. This was functional consumer testing with authored examples, **not an independent model accuracy benchmark**.

There were **14 completed live model captures across 12 distinct notes**, plus one deliberately cancelled model capture with manual recovery. Two completed requests repeated failing baseline notes after instruction changes. Additional manual review, reminder, reload and history checks covered the twenty checkpoints below. They are not twenty independent model examples.

## Observations and recovery

| Checkpoint | Observed result |
|---|---|
| Named film intention | Arrival classified Film/wishlist; reviewed as Movie, no completion. |
| Optional reminder | “this weekend” retained; opt-in exposed an empty date/time; explicitly chose Saturday at 6 PM, Europe/London. |
| Save/reload | Arrival and its reminder survived reload; count increased once. |
| Missing film title | Asked which film; displayed a checklist and disabled Save. |
| Answer missing title | Editing title to Moonrise Kingdom cleared the question and enabled saving without another model call. |
| Travel month/week | Baseline classified correctly but dropped plannedTiming; summary retained December. Fixed instructions; same note then retained `December's last week`, today as recorded date, no invented departure/reminder. |
| Ordinary diary event | River walk became a separate Life note in the mixed capture. |
| Unquantified reading | Baseline proposed unsupported 1 page; classifier uncertainty blocked saving. After fix, same source had unknown quantity/action review. No 1-page default. |
| Course lesson numbers | CS229 retained lessons 2 and 3, unknown total, no course completion. |
| Ambiguous reference | “I finished it” classifier stayed uncertain, but extractor guessed The Hobbit. **Initial extraction failed.** Identity/title/classification/completion review gates blocked saving. |
| Explicit reference recovery | Reviewer selected The Hobbit and independently confirmed completion and classification; updated the same item. |
| Mixed capture | Arrival reaction plus river walk became two entries; coverage confirmation required. |
| Negation/reaction | “did not watch it today” remained a reaction, no viewing or completion recorded. |
| Typo | `wacth Interstelar` classified Film/wishlist. Extractor proposed Interstellar but title evidence could not verify; explicit confirmation required. **Automatic correction remains limited.** |
| Incremental update | The Hobbit 15 pages followed by 10 more became 25, one book, previous history retained. |
| Completion review | Completion required an explicit whole-work acknowledgment before saving. |
| Manual correction | Manual Life entry could be changed to Book; action and unknown-amount choices remained visible. Cancelled this temporary review without adding data. |
| Cancellation recovery | Switched to manual while inference ran; edited Tea in the garden remained intact after waiting; saved once. |
| Return without saving | Cancelling travel and failed reading reviews preserved exact original words and counts. |
| Persistence/history | Final reload retained 20 memories including 10 initial demo memories, 7 tracked items; Piranesi had two original notes and two history updates. |

## Changes made after baseline

1. Extraction instructions now require an exact source span for plannedTiming and remove the conflicting instruction to preserve timing only in summary. Exact-source validation remains in place.
2. Explicitly prohibit default page/minute/lesson counts for unquantified work. No title list, regex classification rule, or new model was added.
3. Store optional `progressKnown` metadata for new activity updates. Confirmed unknown progress displays “Amount not recorded” instead of zero and does not invent a next page or percentage. Explicit zero remains zero. Known positions survive unknown updates.
4. Keep Save disabled while unknown-amount confirmation is pending. Edited course ranges participate in this decision; their syntax is still validated on submit. An initial simple disable condition broke five existing course tests, which caught the uncontrolled lesson-field mismatch. Added course draft state, then reran the full suite successfully.

## Live checks after changes

- Bangladesh source retained `December's last week`; save succeeded without scheduling anything automatically.
- Original unquantified reading source stopped proposing 1 page; reviewer could explicitly confirm partial progress with an unknown amount.
- Different wording, `I read some of Piranesi today.`, also kept the amount unknown. On save the dashboard displayed “Amount not recorded” and “Add your current position when you know it.”
- `I'm on page 42 of Piranesi now.` matched the same book, used 42 absolute, and updated the dashboard to 42 pages / Continue from page 43. Both exact original notes survived reload.
- Manual review verified Save stayed disabled after selecting progress with no amount and enabled only after the unknown-amount checkbox.

## Remaining limitations

- Unnamed references can still receive guessed extractor suggestions; review gates are essential. This run does not establish reliable autonomous reference resolution.
- Typo correction evidence can fail even when the proposed correction looks plausible; confirmation remains necessary.
- Local inference is noticeably slow, with multiple sequential stages. This check did not collect a controlled latency benchmark.
- Older saved activities without `progressKnown` preserve their existing numeric interpretation; no historic values were guessed or migrated. One baseline test record saved before the display fix therefore still shows zero.
- Speech, hosted pairing, offline startup and mobile layout were not exercised in this check.

## Verification

- Final Vitest: **511 tests passed across 43 files**.
- TypeScript, changed-file ESLint and production build passed.
- Added regressions cover exact month phrase grounding and original-source saving, unknown versus explicit-zero display, known-position preservation, serialization, and no fabricated next page/percentage.
- Existing course range parsing and invalid range rejection tests pass with the Save gating change.

Detailed chronological working log: `.research-workspace/docs/evaluations/2026-10-16-consumer/RESULTS.md` (local research workspace, ignored by Git).
