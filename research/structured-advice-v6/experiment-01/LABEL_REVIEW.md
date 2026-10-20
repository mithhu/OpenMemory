# Pre-prediction label review — 19 October 2026

Reviewed the 196 migrated rows and all 24 public-development nominations against the prospective v6 decision table. This is a second AI review pass in the same session, not independent human adjudication or blind external review.

- Accept all 196 migrated rows under the explicit prospective policy. Retain the 23 previously documented v6 changes without rewriting historical v5 gold.
- Accept the 15 public-development labels: four explicit book/novel ratings and eleven nonmedia desired bookings/meals. Ratings are reaction, generic wishes need no selected title/venue, and booking constraints do not make separate events.
- Keep all nine quarantined development rows excluded. Essay is outside the explicit book/novel examples; named rated works without visible medium cannot be forced into BOOK from SNIPS intent; a third-party-only plan does not establish the speaker's wish. No new gold is inferred from catalog knowledge or hidden slots.
- The 211-row mixture remains small and narrow. Exact-phrase screening cannot establish broad semantic, source-family or pretraining independence. Existing SNIPS exposure is disclosed.
- Author a fresh 48-row synthetic qualification set and deterministically nominate 24 original public queries before model predictions. Retain every public nomination, including unscored ones; never replace ambiguous examples after inspecting predictions.
- Public qualification labels are explicit in label_public.py with visible-wording rationales. Albums are musical works; an unqualified “series”, “saga”, title or “Play + person name” has insufficient visible medium and stays unscored. A textbook explicitly establishes BOOK.

No inference result influenced these labels. This is a development qualification experiment, not a publishable independent final benchmark. No claim of unseen TV-series human data is made: the series slice is AI-authored.
