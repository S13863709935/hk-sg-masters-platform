# Local HKBU data maintenance — 23 October 2026

Actual AI-assisted engineering/data-maintenance log, not assessment text, independent review, user research or attribution of work to teammates.

## Completed

Kept the software feature freeze. Consulted the official registry, programme and general-policy sources for existing HKBU Communication and Business Management records. Added a dated observation file and an internal research note recording conflicts and withheld facts. This is a two-record refresh, not a university-wide check.

Using the existing category mechanism, added full-time local/non-local contexts: Communication retains its common programme price with different deadlines; Business Management has category-specific total tuition and a common window. Unselected context does not default to non-local facts. Communication part-time applicability and undated annual fees remain unresolved; no unsupported non-local part-time option was created. Academic/English policy differences, offer-date validity, test alternatives, documents and selection remain manual where needed.

## Verification

- All 654 automated tests passed; none failed, cancelled or skipped. The full run used the existing Node 24 runtime and Python/lxml research-parser environment. The 12 new HKBU-specific tests also passed independently.
- Targeted coverage includes source/review boundaries, exact study-option fingerprints, unselected masking, category fees/dates, window transitions, part-time restrictions, manual academic/English checks, stale contexts and invalid selections, real catalogue/detail/match/saved-option API responses, candidate exports and read-only quality invariants.
- Updated current contextual-count expectations from 8/16 to 10/20. The CityU invalid-date case now uses a date beyond the latest batch date, retaining its original boundary check; the production validator was not weakened. An unrelated old-date assertion now uses an untouched programme instead of a record refreshed in this round.
- Compared against the starting commit: only `HK-HKBU-P001` and `HK-HKBU-P007` change within the checked-programme array; all 19 other programme objects remain unchanged. The eight pre-existing applicant-context objects are identical; only two contexts are appended, with the batch's latest date advanced to the actual 23 October observation.
- In-memory data audit: 873 catalogue / 870 browsable / 21 programme-page checks / 0 independent human reviews / 0 complete requirement sets; no source-refresh conflicts. Contexts total 10 study options / 20 categories. Frozen workbook SHA-256 remains `5DF32B82A7A1DDDBF5672BF59AC46AC3EB046D95E1EE580DE49A5C840FB47A0B`.
- Application UI/server code, launcher, route snapshot and default runtime database were not modified. Integration tests use temporary in-memory services closed by test teardown. No additional browser, physical-device or production-host verification is claimed for this data-only round.
- Updated current documentation only; earlier progress logs retain their contemporaneous counts and evidence dates.

## Publication recommendation

Local commit only. No push, deployment or Git-remote access; preserve main, historical checkpoint branches and publication worktrees. Recommend consolidating this maintenance at the 25 October review, not publishing automatically. Programme-specific confirmation and real independent human review remain outstanding.
