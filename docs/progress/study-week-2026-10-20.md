# Study Week data checkpoint — 20 October 2026

Study Week is 19–25 October; this is an interim progress checkpoint, not Week 6 or a claim that the whole period is complete. Prepared by Song Shaoheng with AI assistance, using actual commit/read dates. Planned team owners are not reported as actual contributors.

## Selected publication

Starts at published Week 5 commit `9aeddfa`. The ongoing T2 programme-collection task permits a small source refresh now; the Week 5 limited runtime is retained. No merge from `feat/local-prototype` and no expanded catalogue, full comparison/shortlist, saved contexts, applicant-category engine or route engine are included.

- Refreshed only SMU MPA from two official sources; IDs, original seed/workbook and all other pilot records are preserved.
- Updated cohort/date/fee coverage and kept the three admissions phases and fee caveats visible.
- Added an explicit unresolved English-waiver/submission-validity check. No generic GPA threshold or admission tier is introduced.
- Updated runtime labels/metadata so an actual 20 October refresh is not misreported as Week 5 work or a full-pilot recheck.
- Retained 20 direct-entry pilot programmes plus one transfer reference, 14 target schools, zero independent reviews and zero complete requirement sets.

## Verification

Executed on 20 October for this selected branch:

- 45 automated tests passed, zero skipped. Nine JavaScript modules passed syntax checks and the pilot data check passed.
- A record-by-record comparison with `9aeddfa` found only `SG-SMU-P001` changed; all 20 other records, the pilot IDs, directory audit and original seed/workbook remain unchanged.
- Browser checks verified the new Study Week label, mixed source-date notice, filtered MPA result, both study modes, dated phase notes, separate charges, discretionary exemptions and unresolved waiver/validity conditions. No student background or saved preferences were entered.
- Fixed an observed narrow-column problem caused by the longer fee notes. The detail table now keeps readable columns and scrolls inside its container on a 390-pixel screen; page/dialog horizontal overflow checks passed. Desktop and narrow screenshots were saved outside Git. No browser warning/error logs were observed. The temporary viewport override was reset.
- The advanced local build separately passed 217 tests, including date-source, selected-option and no-academic-gap regressions. Those later features/tests are not included in this publication.

Final staged privacy/range checks and live remote SHA verification are performed during the push operation. No independent human review, participant study or current application-portal check is inferred from these engineering checks.

## Outstanding work

Real user/service research for the 25 October checkpoint, team acceptance, independent human review, most programme-level data and later development/testing remain outstanding. This data push does not complete those tasks. No user interviews, participant feedback or teammate contributions are invented.

Publish only `checkpoint/study-week` after checks. Keep `main`, Weeks 4/5 and the advanced local branch separate. No public website deployment, assessment editing or course submission is part of this operation.
