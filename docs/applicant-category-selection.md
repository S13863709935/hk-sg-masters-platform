# University-specific applicant-category selection

Implementation contract, 19 October 2026. Current real coverage: two EdUHK categories for one January 2027 study option. Other universities and intakes are not generalized from this example.

## Source and trust boundary

`data/applicant-contexts.json` is a read-only sidecar loaded at startup, separate from the original programme/route snapshots and SQLite source records. Each record binds an exact programme, optional route and study option; year, intake and mode must match, along with a canonical SHA-256 fingerprint of every original offering field. Fee/date URLs must match the programme source host. Duplicate identities, malformed dates, negative/missing prices, false reviewer labels and reversed windows are rejected.

If a stored offering changes, its contextual evidence becomes stale: prices/dates are masked, selectable categories are removed and previous category choices fail with 422. Manual/reviewed data is not overwritten. A new source file must be reviewed and bound to the changed record. Removing a referenced offering requires reconciling the sidecar before restart.

The `WeakSet` date-evidence marker belongs to server-created offering objects. Neither imported JSON nor a serialized response can assert the marker. Only valid contextual evidence can supersede the older programme-level unresolved date-coverage flag for that exact offering. Scope, direct-admission, route, year, valid-date and live-portal disclaimers still apply. Masked/unselected context always returns `applicant_required`, never an open-window conclusion.

## API and UI

- Detail uses optional `applicant={categoryId}` alongside an explicitly selected offering; empty, foreign, stale, cross-route and cross-intake categories fail closed.
- Catalogue uses an optional `applicants` JSON map; malformed JSON returns 400, invalid selections 422, values over 8,000 characters 413.
- Matching uses `selectedApplicants`. Every choice is validated before filtering, even when the selected programme is hidden by filters.
- Cards, details, comparison, shortlist and candidate JSON use the same transient choice. It is not stored in browser storage or history. Changing route or intake clears dependent choices. Failed selection requests restore route, offering, category and previous matching results.
- No category is chosen by default or inferred from residence, nationality or academic background. Application fees remain separate from tuition, without an invented total price or payment action.
- Responses expose the limited `applicantEvidence` date and sources separately from the original academic `lastChecked` value. Candidate exports include context identity, fee/date evidence and comparison date, but no student background.
- Matching keeps academic-rule results and adds a manual category-classification check. Choosing a category cannot confer eligibility, complete requirements, independent review or a recommendation tier.
- Metadata reports contextual coverage separately; it does not inflate the 551 parent programmes or 21 checked parent records.

## Deliberate limits

This is not immigration/status advice or an applicant-classification tool. Category descriptions are university-specific; use the official sources and ask the university to confirm status. No rules are inferred for September 2027 or other schools. Contextual editing/import through the web admin, independent review of contextual facts and persisted category-specific candidate lists are not implemented. Restart after changing a sidecar; the source export remains the original catalogue, not these transient views.
