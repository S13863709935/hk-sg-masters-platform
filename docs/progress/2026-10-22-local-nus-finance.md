# Local NUS MSc Finance refresh — 22 October 2026

Actual AI-assisted development log, not assessment prose, teammate attribution, independent review or user-research evidence.

## Completed

Refreshed existing `SG-NUS-P007` from five official programme sources. Kept the single-degree full-time August 2027 option and its ID, without creating part-time, CEMS, Financial Engineering or Quantitative Finance entries. Added the explicit September 2026 opening and two date-only application cutoffs through the existing round schema. Separate round openings and exact times stay null; study-award consideration is not award eligibility.

Current tuition in the consulted AY2027/28 table is SGD 77,608 including GST, replacing the previous local SGD 77,390 record. The payment schedule sums to the tuition amount, so acceptance must not be added again. This is explicitly arithmetic interpretation, not an independently checked student bill. Application and miscellaneous fees are separate; no rebate or award is deducted.

Preserved a completion-date discrepancy: the dated application process says 22 July 2027, whereas the undated FAQ says 15 July. Both remain a manual confirmation item, not application deadlines or an extension. Optional tests/experience, proof-dependent English waiver and the graduation-only GPA remain distinct from admission minima. No UI, server, schema or dependency change was required.

## Verification

510 automated tests passed, none failed or skipped. Thirteen new tests cover source isolation, stable single-degree/mode identity, corrected fees and payment arithmetic, explicit cutoffs/null times, next-cutoff progression and date boundaries, completion-date separation, academic/GPA uncertainty, optional tests, old-scale TOEFL and waiver gaps, programme-specific reference-letter rules, APIs, remembered-choice reload and current candidate export without student background or match claims.

The earlier General Track test now checks EdUHK's unchanged observation rather than freezing Finance's old date. General Track's own source, cohort, fee and mode assertions remain.

Official browser inspection covered the fee/payment tables, dated application table and FAQ completion/waiver accordions. Admissions, remaining FAQ facts and graduation-only curriculum criteria were also read through the web tool. No application portal, exact cutoff time, award/rebate eligibility or independent review was checked.

Local browser QA: NUS Finance search returns one parent and highlights the first cutoff, 15 November 2026, with no recorded time. Detail and an explicit full-time selection show both cutoff records, their unknown round openings/times, revised tuition, separate application fee and July discrepancy. The date-only cutoff display fits the detail layout. Text is English-only, no horizontal page overflow was found and the inspected browser log has no warnings/errors. No student profile entered, programme saved, choice remembered, file downloaded or application submitted. Saved-choice and export behavior was tested through automated APIs/adapters, not browser storage. Screenshot outside Git: parent-workspace `work/gradpath-nus-finance-2026-10-22.png`. Agent-created tabs closed and temporary in-memory loopback preview stopped.

Totals remain 873 catalogue / 870 visible / 21 parent page checks / 0 independent human reviews / 0 complete requirement sets, with no source-refresh conflicts. Comparison with the preceding local commit identifies only Finance `SG-NUS-P007` changed in checked parent records. Original workbook SHA-256 remains `5DF32B82A7A1DDDBF5672BF59AC46AC3EB046D95E1EE580DE49A5C840FB47A0B`. Directory, route and applicant-category evidence is unchanged.

## Publication recommendation

No push or deployment. Consolidate this data-quality increment for the 25 October stage review; review is not automatic publication authority. Only a real-date local commit is made. Main, historical publication branches/worktrees, desktop documents and course submissions remain untouched.
