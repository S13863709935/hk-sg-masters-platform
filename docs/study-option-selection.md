# Intake and study-mode selection

Local implementation contract, 16 October 2026. This is an engineering note, not a claim of additional admissions research.

## Meaning

A study option is one existing `offerings` record belonging to an exact programme and, where applicable, its explicitly selected route. Selection filters recorded tuition, fee basis, duration, intake/year and application-date comparisons. It does not establish applicant category, current portal availability, intake-specific admissions criteria or eligibility.

- No first-option default. An empty choice shows all recorded options separately.
- The current browser page session shares the choice across catalogue cards, details, background checks, comparisons, shortlist cards and candidate export.
- Only programme IDs persist in the shortlist/comparison list. Route and study-option choices are not saved or added to browser history; a page reload resets both. Export records the exact choices used at that time.
- Changing route clears its dependent study-option choice. Invalid selections fail rather than carrying fees/dates across routes. The UI preflights a new choice, restores both old choices and matching results on request failure, and disables both controls while applying the change.

## Server contract

- Detail: `GET /api/programmes/{id}?route={routeId}&offering={offeringId}`. Optional values must belong to that programme and effective route. An explicit empty offering query is rejected.
- Catalogue: `routes` and `offerings` query parameters contain JSON maps keyed by programme ID. Each encoded value is limited to 8,000 characters and validated before filtering or pagination. Malformed JSON returns 400, invalid selections 422 and oversized values 413.
- Matching: `selectedRoutes` and `selectedOfferings` are optional JSON maps. Choices are resolved before filtering and matching, including choices for programmes hidden by current filters.
- `offeringOptions` retains all choices for the effective route. A selected response contains one `offerings` item, a `selectedOffering` identity, an applicable display year and a disclosure. Unselected grouped entries do not expose selectable offerings until route evidence is resolved.
- A server-owned projection preserves the private route-trust marker only from an already resolved route. JSON cannot forge the marker. Original objects are evaluated before serialization.
- Selecting an option adds an unresolved, mandatory intake/mode-applicability check. Existing programme/route-level rules remain unchanged; selection cannot promote a record to complete, independently reviewed or recommendation-tier ready.
- Original date-coverage gates stay in force. A populated date with an unresolved category/cohort coverage flag remains unresolved.
- The database, raw export, source snapshots, original check dates and quality totals do not change. Candidate export includes selected route/option, exact offering facts, source URL, verification state, date-comparison context and selection-persistence warning, but no student background.

## Known limits

Update on 19 October 2026: a separate, source-bound applicant-category layer now supports the EdUHK January 2027 example. See [applicant-category-selection.md](applicant-category-selection.md). The original source snapshot and unresolved programme-level coverage flag remain unchanged. Only that layer's exact, newly source-checked category context can supply category-specific prices/dates; no other school's categories or opening dates are inferred. Application-round selection is not implemented.

If an authenticated source import removes an option during a session, stale requests fail closed; reloading resets temporary choices. Persisted route/option-specific shortlists and per-offering requirement evidence need separate design and verification.
