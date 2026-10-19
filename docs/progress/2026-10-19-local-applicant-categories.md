# Local applicant-category fee/date contexts — 19 October 2026

Advanced local branch only; prepared with AI assistance for Song Shaoheng. No invented team contributions, independent reviews, participant results or backdated weekly work.

Added an explicit university-specific applicant category after intake/study-mode selection. Cards, detail, comparison, shortlist and candidate-export mapping share the same transient context. Changing route or intake clears the category; failed requests restore the previous context. No category is inferred from location, nationality or academic background, and none is persisted in browser storage or page history.

Real evidence coverage is deliberately limited to the EdUHK MPPM January 2027 example: two category-specific tuition/application-fee/deadline records read from the official programme and admissions pages on October 19. The application fee is separate, not added to displayed tuition. September/other schools are not generalized from this example. See the dated research note and applicant-category contract.

The read-only evidence sidecar is source-bound to the original offering fingerprint, does not overwrite manual data and fails closed after source changes. Missing category masks default prices/dates. A private server marker protects the exact-context date evidence from JSON forgery. Programme-level academic check dates and unknown conditions remain unchanged; the contextual source date is displayed separately. Category selection adds a manual classification warning, not eligibility or a recommendation tier.

Verification:

- 187 automated tests passed, zero skipped, including the existing optional Python parser check. The 23 new tests cover fees/dates, no default selection, stale/foreign/cross-intake choices, source binding, fingerprint order, JSON trust, validation, API bounds, matching and non-mutation.
- Browser checks on an isolated loopback origin/in-memory database: local/non-local changes, exact fees and separate application fee, local future-deadline uncertainty, non-local past-deadline display, intake-change reset, card/shortlist/compare synchronisation and reload reset. Category rows and source dates remain distinct from original academic dates. Candidate-export field wiring is covered by code assertions/API data; no new browser download was performed in this pass.
- English dialog text, 390-pixel detail layout and category switching passed without page/dialog horizontal overflow. Desktop comparison rows were read and matched the selected local category and application fee. No error-level browser console entries were observed. The viewport was reset; the temporary QA tab and server were closed.
- Normal preview remains on port 3102 with January selected but applicant category unassigned. Existing remembered background, shortlist and comparison storage on that origin were not edited.
- Source-data, syntax and whitespace checks passed. The original workbook hash remains `5DF32B82A7A1DDDBF5672BF59AC46AC3EB046D95E1EE580DE49A5C840FB47A0B`.

Unchanged catalogue totals: 551 parents, 548 default-browsable, 21 checked parent records, two separately checked route snapshots, zero independent reviews, zero complete requirement sets. The new sidecar is not counted as extra programmes or complete admissions checks. No push, PR, main merge, public deployment, assessment-file change or submission. Published Week 4 and Week 5 checkpoints remain unchanged.
