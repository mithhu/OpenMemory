# V6 labeling decisions — research only

This is a new policy, not a correction of historical benchmark scores. No trained adapter or app route currently uses it. Notes are data; recognizing an imperative wish never means executing its instruction.

| Input meaning | Category / action | Reasons | Persistence implication |
| --- | --- | --- | --- |
| “Watch a movie”; “Read a book”; “Play some jazz” | Media category / wishlist | none | A generic wish is meaningful; do not fabricate a catalog title or ID |
| “I want to watch that movie” | MOVIE / wishlist | missing_identity | A specific referenced work is unknown; known wish is retained |
| “Play a song by that singer” | MUSIC / wishlist | unresolved_reference | Track selection is generic, but the singer constraint needs context |
| “I want to try it” | NOTE / wishlist | unresolved_reference | Keep the future wish; do not guess the medium or start/completion state |
| “Finished it” | NOTE / null | unresolved_reference | Tracked subject/action is unknown; no completion mutation |
| “Book a restaurant”; “Find a bistro for dinner” | WISHLIST / wishlist | none | A venue name is not required to store the wish |
| “I want to buy the same one” with an unresolved item | WISHLIST / wishlist if nonmedia is known | unresolved_reference | Preserve the known wish; do not infer the item |
| “Read the novel Piranesi yesterday” | BOOK / null | missing_action | No whole-work completion evidence; do not mark completed |
| “Finished lesson four of a course” | LESSON / progress | missing_identity | Lesson completion is not whole-course completion; course unnamed |
| “Finished the entire Piranesi book” | BOOK / complete | none | Explicit whole-work evidence; app confirmation still required |
| “That book deserves zero points” | BOOK / reaction | missing_identity | Rating number is not reading progress; known reaction is retained |
| “Rate this book series” | BOOK / reaction | missing_identity | A series of books is not a TV series |
| Independent events, one with unknown action | MIXED / mixed | union of component missing details | mixed routes splitting; it does not claim all component actions are known |
| Ordinary habit, nature/letters/person listening | NOTE / none | none | Not a tracked media event |
| Standalone fact about another person | PERSON / none | none | Do not turn someone else's preference into the speaker's consumption |

## Structural invariants enforced by both validators

- Allowed category/action combinations are explicit in `classification_advice_v6.json`.
- `listen` belongs only to MUSIC; `none` cannot stand in for an unknown media action.
- Media action null requires missing_action; a known non-mixed action cannot carry it.
- Nonmedia WISHLIST cannot carry media identity or missing-action reasons. A genuinely unresolved specific referent may remain advisory.
- NOTE/none has no reasons; NOTE/null and NOTE/wishlist require unresolved_reference.
- MIXED/mixed may carry component missing_action, because its intent is a routing label.
- Reasons must be known, unique strings; extra output fields are rejected.

The validators cannot infer whether the original wording warrants an action or a reason. They do not parse text, repair predictions, classify from regex, resolve catalog identity, or authorize saving. Completion scope remains a semantic model-and-app-review responsibility.

## App integration requirements, not implemented here

A generic media wish must be stored as a generic plan or offered deliberate review, not silently treated as a real named work. Advisory missing details should block only operations that require them (such as linking a specific entity or changing its status), not every note save. Existing completion confirmations remain necessary. New native/Ollama/app contract compatibility and fresh evaluation are prerequisites before activation.
