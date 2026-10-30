# SMU school batch: recorded comparisons and existing-data quality

Date: 2026-10-30. Internal development record; not course submission material.

## Scope and resulting behaviour

This batch follows the user's 29 October instruction to finish useful school-sized batches rather than requiring a new conversation turn for each programme. It audits all 17 existing SMU parent records. It does not add a new programme or claim that the current university catalogue has been fully reconciled.

Matching still reports known gaps, unresolved eligibility and complete recorded checks using the existing gates. A separate `recordedCriteria` summary counts mandatory degree, major, original-scale GPA/classification, language and work-year comparisons. Manual assessment, source completeness, route/intake applicability and applicant-category decisions remain unresolved where applicable. Zero comparable criteria cannot produce a positive summary.

The English browser filter **Recorded comparisons met** finds records with at least one comparable criterion and no failed or unresolved comparable criterion. Overall results may still be **Needs confirmation**. Known mandatory gaps, excluded records and invalid remembered choices are not admitted to that filter. No probability or new recommendation tier is generated. Cards, details and comparisons show the subset separately from other pending conditions.

## School evidence and limits

The official programme directory and headers of all 17 existing SMU records were read, with targeted checks of admissions/date sections. Some tool responses were cached. This was not a fresh full-page review of every requirement, a live application-portal check, a PDF visual review or independent human review.

- MSE and MSFE: the current dated header and application table explicitly extend January 2027 applications to **30 November 2026**. Both January study modes are updated; August dates, personal fees and admissions criteria are preserved.
- MDSE: the main header/table now use November, but the separate public application page still ends its recurring January window in October. This source difference remains explicit and structured dates stay unassigned. The sibling extensions are not copied to MDSE.
- MST: the public application landing still shows 2026 while the programme header shows 2027. LLM schedules still depend on track selection. These unresolved cases are retained.
- All 17 SMU records remain partial; 14 contain at least one comparable mandatory rule. Of the tracked fields, 15 have unresolved language details, 14 unresolved fee applicability and 11 unresolved date applicability. All 17 have no established universal numeric entry GPA in the consulted sources; this is not a waiver or zero-GPA threshold.
- The newly visible MPGL directory title remains a directory-identity/scope follow-up, not an eighteenth checked record.

See the [reproducible school matrix](../research/smu-school-quality-2026-10-30.md) and [scoped official-source observations](../../data/research/smu-school-source-observation-2026-10-30.json). `scripts/school-quality.mjs` can generate the same local field audit for the next school without changing programme evidence or the daily database.

## Verification and preservation

- Full suite: **1,157 passed**, zero failed/cancelled/skipped. Synthetic fixtures are not real student/admissions evidence.
- Core acceptance: 20 IDs, seven synthetic backgrounds, 71 selection variants and 497 comparisons; 125 known gaps, 372 unresolved, zero fully met and zero violations. This is unchanged by the subset summary.
- Real browser: synthetic-example background, SMU filter, new subset filter and MSE details checked. The example produces 12 subset results while retaining overall confirmation notes. The refreshed MSE details show 2026-11-30. No page console errors were observed.
- Responsive checks: at viewport widths 320 and 390, document widths were 305 and 375 (scrollbar excluded); the new filter and summary did not overflow horizontally. Temporary viewport override was reset.
- Catalogue totals remain 873 / default browsable 870 / partial programme records 73 / remaining leads 800. Routes remain four groups / 11 snapshots; applicant contexts 18 / categories 38; maintenance units 102. Complete requirements and independent review remain zero.
- Two documented imminent-cutoff units remain after removing the superseded SMU October dates. A November extension is retained in all recorded cutoffs, not incorrectly shown as within 14 days on 30 October.
- Earlier research files, other 70 checked programme objects, original 20 pilot identities, original workbook and seven other source layers are preserved. Old live-count test expectations are updated; earlier observation/report files are not rewritten. No student data or daily runtime database is used for tests.

The README now presents the current state and links the previous rolling paragraphs in a separate history file. Local maintenance and publication instructions use current counts and the actual Week 6 checkpoint, without rewriting commit history.

## Next batch and publication

Prioritise existing Hong Kong records and their unresolved source/field differences before adding more catalogue leads. The field audit is a worklist, not permission to mark unpublished or judgement-based requirements as met. Real feedback, independent review and public hosting remain unfinished.

This batch is saved locally. Recommendation: **do not push another increment now**; retain the agreed weekly/stage cadence after the already published Week 6 checkpoint. A local commit or passing tests is not deployment or course submission.
