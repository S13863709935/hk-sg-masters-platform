# University-specific applicant-category selection

Implementation contract introduced on 19 October 2026 with two EdUHK categories for one January 2027 study option. As of 24 October, explicit contexts cover 15 study options / 30 categories across EdUHK MPPM January and September 2027, CityU Applied Economics, HKU Computer Science, the full-time September 2027 HKBU Communication / Business Management options and FT/PT HKUST DISC and CIEM September 2027. HKUST has different local/non-local final cutoffs and no confirmed opening date; old mode-only choices require category selection, not an inferred default. CIEM February has a common cutoff and no September-context substitution; SMU month-only windows and incidental fees do not justify a fabricated category context. EdUHK September has its own central schedule and changed application fees, not copied January facts. Each combination requires its own evidence; rules are not generalized across universities, modes or intakes. HKBU Communication part-time applicability and SIT cohort pricing remain unresolved and have no invented contextual category records.

## Source and trust boundary

Identical published fees and cutoffs do not require invented differentiated contexts. The 24 October HKUST MSc AI check records the common FT/PT local/non-local dates directly, without adding a category selector; NTU MSAI likewise has no fabricated category net-price record. Existing 15-context / 30-option coverage and its actual source dates are unchanged by the AI batch. Applicant permission, waivers and concessions still need university confirmation.

`data/applicant-contexts.json` is a read-only sidecar loaded at startup, separate from the original programme/route snapshots and SQLite source records. Each record binds an exact programme, optional route and study option; year, intake and mode must match, along with a canonical SHA-256 fingerprint of every original offering field. Fee/date URLs must match the programme source host. Duplicate identities, malformed dates, negative/missing prices, false reviewer labels and reversed windows are rejected.

If a stored offering changes, its contextual evidence becomes stale: prices/dates are masked, selectable categories are removed and previous category choices fail with 422. Manual/reviewed data is not overwritten. A new source file must be reviewed and bound to the changed record. Removing a referenced offering requires reconciling the sidecar before restart.

The `WeakSet` date-evidence marker belongs to server-created offering objects. Neither imported JSON nor a serialized response can assert the marker. Only valid contextual evidence can supersede the older programme-level unresolved date-coverage flag for that exact offering. Scope, direct-admission, route, year, valid-date and live-portal disclaimers still apply. Masked/unselected context always returns `applicant_required`, never an open-window conclusion.

## API and UI

- Detail uses optional `applicant={categoryId}` alongside an explicitly selected offering; empty, foreign, stale, cross-route and cross-intake categories fail closed.
- Catalogue uses an optional `applicants` JSON map; malformed JSON returns 400, invalid selections 422, values over 8,000 characters 413.
- Matching uses `selectedApplicants`. Every choice is validated before filtering, even when the selected programme is hidden by filters.
- Cards, details, comparison, shortlist and candidate JSON use the same current choice. It is temporary by default and never added to history. A later October 19 update adds an explicit **Remember these choices** action; see [remembered-programme-options.md](remembered-programme-options.md). Changing route/intake clears dependent current choices but does not overwrite remembered ones without an explicit update. Failed selection requests restore route, offering, category and previous matching results.
- No category is chosen by default or inferred from residence, nationality or academic background. Application fees remain separate from tuition, without an invented total price or payment action.
- Responses expose the limited `applicantEvidence` date and sources separately from the original academic `lastChecked` value. Candidate exports include context identity, fee/date evidence and comparison date, but no student background.
- Matching keeps academic-rule results and adds a manual category-classification check. Choosing a category cannot confer eligibility, complete requirements, independent review or a recommendation tier.
- Metadata reports contextual coverage separately; it does not inflate the current 873 parent programmes or 21 checked parent records. Independent human reviews and complete requirement sets remain zero.

## Deliberate limits

This is not immigration/status advice or an applicant-classification tool. Category descriptions are university-specific; use the official sources and ask the university to confirm status. No rules are inferred for combinations without their own bound evidence. Contextual editing/import through the web admin, independent review of contextual facts, multi-variant candidate rows and cross-device choice synchronization are not implemented. Restart after changing a sidecar; the source export remains the original catalogue, not the selected views.
