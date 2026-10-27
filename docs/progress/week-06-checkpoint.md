# Week 6 source consolidation — 27 October 2026

Actual publication preparation by Song Shaoheng with AI assistance. W6 is 26 October–1 November. The user explicitly requested this push after the weekly review; this is an early-week progress checkpoint, not evidence that all W6 tasks are finished. Commit dates are real, and original source observation dates are retained.

## Selected scope and why

Start from verified published Study Week commit `245141969aa5bd6039dd2d8f718b022db0bd753b`. Select eight existing core-pilot records whose updates can be represented by the limited runtime without importing the advanced catalogue, route/applicant, persistence or saved-choice engines. This fits ongoing T2 collection and a necessary T5 screening correction. It is not a merge of the advanced local branch.

| Record | Actual source observation | Selected result and remaining limit |
| --- | --- | --- |
| CityU Applied Economics | 20 October | Current cohort/fee basis and inclusive published language-test date floor; waiver/equivalence stays manual |
| CUHK Anthropology | 24 October | Staged deadlines and applicability notes; disputed PT tuition stays null |
| NUS MComp General Track | 22 October | August 2027 window and fee inclusions; GRE/GMAT source disagreement stays unresolved |
| NUS Finance | 22 October | Current fee/cutoffs and separate completion-document conditions; no old-TOEFL conversion |
| NTU Information Systems | 21 October | Current closing date and IELTS components; conflicting opening and current fees remain unknown |
| NTU Applied Economics | 22 October | Separate August/November cohorts; no automatic fee, GPA or exemption |
| SUTD Architecture | 23 October | 2027 window and preliminary-term pathway caveats; no old-cohort fee quote |
| SUTD Human-Centred AI | 23 October | Recorded closure notice; withdraw unsupported future cutoff/current price |

See [consulted sources and boundaries](../research/week-06-selected-sources.md). The eight selected programme objects are semantically identical to those in local source commit `fdb871f`; other thirteen objects remain identical to the published base, including the two earlier SMU updates. The original twenty pilot IDs, workbook and directory register are preserved. No additional programme or source-recheck date is invented.

## Runtime boundary

- Retain the English pilot search/details/background/check workflow. Comparison and candidate lists remain design previews.
- Add the existing local rule's published `testDateNotBefore` comparison to this limited checker: a missing date remains unknown, a date before the minimum is a recorded gap, and the minimum itself is accepted. This is separate from TOEFL score-version dates and is not an expiry measured from today.
- Display that published date minimum with the language rule. Update checkpoint labels/metadata and use loopback port 3110 to keep the advanced local server separate.
- No new framework, dependency, full round-status engine, applicant-category selector, route engine, expanded catalogue, persistence, administrative import, saved profile or shortlist export.

## Verification performed

- **68 automated tests passed**, zero failed, skipped, cancelled or pending; sixteen new tests cover this selected publication. The advanced local branch's earlier 804-test result is not presented as this checkpoint's result.
- Seven explicitly synthetic backgrounds exercise all twenty records through the real matching endpoint: **140 API comparisons** agree with the isolated rule checker. Gaps and unknowns retain explanations/source URLs; no real record returns a recommendation tier or complete-eligibility conclusion.
- Published date-floor boundaries, missing/waiver evidence, unsupported old TOEFL scores, differing GPA scales, component failures, current-fee gaps, closure notes and cohort identities are checked.
- The data audit pins all twenty-one full objects with canonical SHA-256 values, selected/retained observation dates, and the unchanged workbook/directory files. The historical transfer archive has no newer `sources` array; its original object is preserved rather than fabricated metadata being added.
- Existing SMU, filtering, request-size, origin, privacy and source-file immutability tests remain in the suite. Old assertions about the latest mixed-batch date were updated without advancing SMU's source dates; metadata comparison uses record/date membership instead of manifest grouping order.
- No production/live portal or real-user study was performed. No browser layout or clean-machine acceptance is newly claimed; the existing scrolling table and static UI safeguards remain tested. Daily databases, advanced local files, desktop documents and assessment submissions are untouched.

Final syntax, selected-diff, privacy and live remote-SHA checks are performed during publication. The publication manifest identifies the selected source commit and original baseline without claiming that the advanced branch was published.

## Remaining work and publication decision

Counts in this checkpoint remain fourteen universities / twenty direct-entry pilot programmes / one transfer reference / zero independent human reviews / zero complete requirement sets. Ten records have post-6-October observations, including the two earlier SMU updates; eleven retain the older date. Twenty-one partial references are not a verified full catalogue or evidence that applications remain open.

AI official-source checking may continue without making the user's own manual recheck a prerequisite. Genuine uncertainty, discretionary eligibility and absent independent review remain accurately labelled. Actual user-needs and existing-service research for the 25 October milestone has not been established here; no participants, meetings, feedback or teammate contributions are fabricated.

Push only `checkpoint/week-06` as one consolidated batch at the user's request. Preserve `main`, Weeks 4/5, Study Week and `feat/local-prototype`. This is not a merge, pull request, public deployment, course-file edit or submission. After this push, return to local work; do not publish another small increment merely because the user says “continue.”
