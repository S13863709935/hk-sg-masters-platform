# Local HKUST / SIT maintenance - 24 October 2026

Continues the frozen local demonstration. No remote Git operation, push, deployment, assessment/CV/desktop edit, fabricated teammate contribution or historical-date rewrite is authorised by this batch.

## Changes

- HKUST MSc DISC: directly checked 2027/28 sources, preserved mode IDs, separate fees/instalments, category-specific rounds and manual qualification/pathway exceptions.
- Added two exact-offering-bound applicant contexts / four options; did not infer category, opening date, cutoff time or part-time visa permission.
- SIT Civil Engineering: explicit old opening, retained past cutoff and duration/source-scope discrepancies; no default subsidy or international tuition. Text-only PDF findings remain manual pending visual and applicability verification.
- Older MEng transfer record, other programme/source observations, old applicant contexts and frozen workbook are preserved.

Source details and limits: [research note](../research/hkust-sit-refresh-2026-10-24.md). No live application portal, browser/device or production deployment acceptance is claimed.

## Verification

- Bundled Node 24.22.1 full suite: **703 passed**, zero failed/cancelled/skipped. Thirteen new regressions cover category bindings, source drift, round transitions, mode fees, old choices, archival transfer scope, SIT closure/manual gaps and API/export consistency. An initially incorrect new test expected an obsolete TOEFL/date pairing to reach matching; it was corrected to assert the existing input rejection, without weakening production validation.
- In-memory source audit: 873 catalogue / 870 browsable / 21 partial programme-page checks / 0 independent human reviews / 0 complete requirement sets; no source-refresh conflicts. Separate applicant evidence is 13 study options / 26 categories, route evidence still 2 groups / 5 routes.
- Object comparison against the preceding local commit confirms only HKUST DISC and SIT Civil Engineering changed. Other 19 programme objects and all 11 prior applicant contexts remain identical; the pilot ID list is unchanged.
- Frozen workbook SHA-256 remains `5DF32B82A7A1DDDBF5672BF59AC46AC3EB046D95E1EE580DE49A5C840FB47A0B`. Production software, directory inventories, route sources and assessment files were not edited. Git whitespace checks pass.

Tests use isolated temporary/in-memory stores, not the user's day-to-day local database. Main/checkpoint references are checked separately before/after the local save; no remote synchronisation is performed.

## Publication recommendation

Keep local-only. Consolidate at the planned 25 October review; a review date is not permission to push or deploy. The next data expansion should cover a small new programme batch, while independent review is still required for existing facts.
