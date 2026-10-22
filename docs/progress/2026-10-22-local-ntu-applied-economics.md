# Local NTU Applied Economics refresh — 22 October 2026

Actual AI-assisted development log, not assessment prose, team attribution, independent review or user-research evidence.

## Completed

Refreshed one existing parent (`SG-NTU-P015`) from the official programme page and central coursework guide. Separate August/November 2027 choices use the central AY2027/28 trimester table. August years are assigned from its cohort context and explicitly described as an interpretation; November endpoints explicitly include 2027 and span the relevant merged table cells. Adjacent programme deadlines are not reused. Programme-page recurring months agree with the central table. No current numeric tuition, rebate or subsidy was inferred from older material; the brochure was not rechecked.

Retired the old combined undated `O1` instead of silently assigning it to August. New `O2` and `O3` choices require explicit selection. The existing saved-choice resolver flags retired IDs, while export lists them as unresolved without substitute dates/prices. Current choices reload their own dates with null tuition. No server, UI, persistence schema or dependency change was needed.

Honours/quantitative alternatives, programme-specific waiver geography and application-time test validity stay manual. The TOEFL scale-date boundary and published language totals are retained. During-study preparation and the optional research project's GPA are not entry prerequisites. Completeness remains partial and recommendation tiers remain unavailable.

## Verification

484 automated tests passed, none failed or skipped. Thirteen new tests cover source-date isolation, central-table/cohort separation, parent versus selected timelines, calendar boundaries, missing current fees, academic alternatives, language-scale validation, waiver/validity uncertainty, known gaps, catalogue/detail/matching APIs, retired saved choices and current exports. Existing source-refresh tests now compare the batch's latest date with the latest individual observation rather than permanently fixing it to an earlier programme refresh. Unrelated individual source-date checks remain.

Browser QA: search restricted to NTU and Applied Economics returns one parent with a mixed-date notice. All-options detail shows both cohorts. Selecting August shows 1 September 2026–31 January 2027 and a within-recorded-dates warning; selecting November shows 1 March–31 May 2027 and a before-opening warning. Both retain unconfirmed tuition and non-live-portal cautions. Manual English conditions and both TOEFL scales are visible. The selected November date comparison was manually refreshed. Detail text is English-only, no horizontal page overflow was found and the inspected browser log has no warnings/errors. No student background entered, programme saved, selection remembered, export downloaded or external application submitted. Retired-choice/export behavior was exercised in automated tests, not browser storage.

Screenshot outside Git: parent-workspace `work/gradpath-ntu-applied-economics-2026-10-22.png`. Agent-created browser tab closed and temporary in-memory loopback preview stopped after inspection.

Totals remain 873 catalogue / 870 visible / 21 parent page checks / 0 independent human reviews / 0 complete requirement sets, with no source-refresh conflicts. Object comparison against the preceding local commit found only `SG-NTU-P015` changed in checked parent records. The frozen workbook SHA-256 is unchanged (`5DF32B82A7A1DDDBF5672BF59AC46AC3EB046D95E1EE580DE49A5C840FB47A0B`). Directory, route and applicant-category evidence is unchanged.

## Publication recommendation

No push or deployment now. Consolidate this increment with preceding local changes for the 25 October stage review; the review is not automatic publication authority. Only a real-date local commit is made. Main, publication branches/worktrees and desktop assessment/CV documents remain untouched.
