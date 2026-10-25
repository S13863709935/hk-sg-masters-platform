# Core pilot data and screening acceptance — 25 October 2026

Internal implementation/maintenance evidence, not assessment submission prose.

## Completed scope

- Read the main official HTML source pages for all twenty original core programmes, focusing on critical academic/language/cohort/fee/date sections; also read SMU MITB's public apply page.
- Kept this as a scoped source observation, not a full refresh of every linked university policy/fee/PDF page. No confirmed production-data correction was established for the checked fragments. No source date or review grade was artificially advanced.
- Added a reusable read-only acceptance command: `node scripts/core-pilot-acceptance.mjs --as-of 2026-10-25`, with optional Markdown format.
- Seven explicitly synthetic profiles across twenty core programmes and seventy-one base/study-option/category variants: **497 comparisons**, **zero automated consistency violations**.
- Outcomes: 125 comparisons have a recorded public-criterion gap; 372 remain unresolved; zero claim that all recorded conditions are satisfied. The incomplete conditions are retained, not changed to pass for appearance.

See [source scope and remaining conditions](../research/core-pilot-source-checks-2026-10-25.md) and [repeatable acceptance results](../research/core-pilot-acceptance-2026-10-25.md).

## Verification

- Full Node 24.22.1 suite: **804 passed**, zero failures, skipped or cancelled; thirteen new acceptance tests.
- Real matching endpoint agrees with all 140 programme/base-profile combinations; fifty-one explicitly selected variants round-trip through detail and saved-choice restore.
- Waiver claims and missing grades do not become passes. No numeric GPA is invented, no original GPA scale is converted, and no local/non-local category is assumed.
- Selected category fees/dates, original source days and privacy-safe shortlist projection are checked. Saved timestamps use the app's canonical ISO format; client-side signature/format guards remain unchanged.
- Initial new-audit tests exposed missing full-record sensitivity in the acceptance fingerprint; added per-programme source fingerprints and per-synthetic-profile fingerprints. A malformed synthetic timestamp was fixed in the test rather than weakening production validation.
- Eight existing source layers remain equal to pre-batch HEAD; all twenty-nine programme objects, eighteen applicant contexts and twenty pilot IDs unchanged. Both older review snapshots preserved verbatim.
- Original workbook SHA-256 remains `5DF32B82A7A1DDDBF5672BF59AC46AC3EB046D95E1EE580DE49A5C840FB47A0B`.
- No live portal, real-student profile, user-study participant, human signature, independent review or fresh PDF visual inspection was claimed.
- Test databases isolated in memory/temporary locations. Daily database not opened. No new browser-layout acceptance claimed.

## Current handoff and release boundary

AI official-source checking and automated acceptance can continue without requiring the user to manually review each programme. This supersedes treating human review as a prerequisite for local development; it does not relabel AI work as human work or resolve unpublished facts/university discretion.

The local demo remains stable under these tests, with explicit gaps and cautions. Counts remain 873 catalogue / 870 default browsable / 29 partially checked programme records / 0 independent reviews / 0 complete requirement sets. No additional website function, main/checkpoint change, push, deployment or remote Git request.

Save this batch locally. Keep publication grouped by the agreed weekly plan, not triggered by every chat message. No push or deployment in this batch.
