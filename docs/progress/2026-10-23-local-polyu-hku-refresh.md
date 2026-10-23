# Local PolyU / HKU data maintenance — 23 October 2026

Actual AI-assisted engineering/data-maintenance log, not assessment text, independent review, user research or attribution of contributions to teammates.

## Completed

Kept the software feature freeze. Refreshed existing PolyU MSc Business Management and HKU MSc Urban Analytics pilot entries using official programme and general-policy HTML sources. Added a structured observation and source-decision note; no catalogue expansion or new applicant contexts were introduced.

PolyU now has its central dated opening and two date-only programme cutoffs, with the alumni-referral subsection's deadline wording preserved as a caveat. Programme tuition is distinguished from total degree credits, external summer expenses, optional fees and the separate application charge. HKU now has one-year duration and an exact-noon main cutoff without an invented opening/clearing round. Proposed tuition, unknown current application fee, qualitative academic alternatives, documentary evidence and cohort-anchored English validity stay qualified.

## Verification

- Added 12 targeted tests for source/review boundaries and stable IDs; PolyU opening/round transitions, credit arithmetic, fees, test versions, single sitting, document-code isolation and scholarship limits; HKU exact-noon transition versus date-only comparison, provisional tuition/unknown application fee, anchored language dates and component gaps, Arts-versus-Architecture policy scope and manual equivalence.
- All 12 targeted tests passed independently. All 678 automated tests passed in the complete suite, with none failed, cancelled or skipped, using existing Node 24 and the research Python/lxml environment.
- Updated two old inventory-test date assertions to compare with each programme's actual checked-source date instead of a fixed 6 October value. Their directory date remains 20 October, and deep checks that inventory evidence does not replace rules, offerings or sources remain intact. New tests separately pin this actual source observation to 23 October.
- Real catalogue/detail/matching/saved-choice and candidate-export paths were tested with an owned temporary in-memory service. Its controlled clock crossed HKU noon by one second; the server, not a query-string timestamp, determines comparison time. Reads do not restamp sources or alter academic results; candidate exports omit student background/match decisions.
- Compared against starting commit `c74aa0a`: only `HK-POLYU-P001` and `HK-HKU-P007` differ in the checked-programme array; the other 19 objects and all pilot IDs remain unchanged. Directory/scope evidence, route/applicant files and historical observations are not rewritten.
- In-memory audit remains 873 catalogue / 870 browsable / 21 programme-page checks / 0 independent human reviews / 0 complete requirement sets, without source-refresh conflicts. Separate context coverage remains 10 study options / 20 categories. Frozen workbook SHA-256 remains `5DF32B82A7A1DDDBF5672BF59AC46AC3EB046D95E1EE580DE49A5C840FB47A0B`.
- Application UI/server code, launcher and daily runtime database were not modified. Temporary services close through test teardown. No additional browser, physical-device or production-host test is claimed for this data-only round.

## Next work and publication

Continue source maintenance for the remaining older direct-entry pilot records, then expand detailed coverage beyond the pilot. Unknown policy/fee facts and real independent human review remain outstanding; test counts do not certify admissions data completeness.

Local commit only: no push, deployment, Git-remote access or changes to main/historical checkpoint branches and publication worktrees. Recommend consolidation at the 25 October review, not automatic publication.
