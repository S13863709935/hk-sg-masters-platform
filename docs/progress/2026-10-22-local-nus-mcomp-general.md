# Local NUS MComp General Track refresh — 22 October 2026

Actual AI-assisted development log, not assessment prose, teammate attribution, independent review or user-research evidence.

## Completed

Refreshed existing `SG-NUS-P029` using five official General Track pages. The explicit August 2027 application table now supplies the opening date as well as the previously recorded closing date. FT/PT IDs retain the same mode/cohort meanings; normal and maximum candidature are distinguished. AY2027/28 tuition remains SGD 76,409 including GST, with the 52-Unit limit, additional charges, separate application fee and credited acceptance fee explained. No support/rebate is automatically deducted.

Found an unresolved official-source discrepancy: admissions requests GRE/GMAT and publishes thresholds, whereas the FAQ says GRE/GMAT is optional. A mandatory manual-confirmation item preserves both observations; this is not a mandatory-test failure rule or an exemption. GMAT-version conversion and GATE applicability/threshold are not inferred. Teaching-medium proof, test validity, honours equivalence and supporting documents remain unresolved. No mandatory work experience or undergraduate GPA threshold is invented. No UI/server/schema/dependency changes were needed.

## Verification

497 automated tests passed, none failed or skipped. Thirteen new tests cover current source isolation, stable mode identities, explicit dates, fee-credit/extra-charge boundaries, calendar comparisons, conversion-track and GPA separation, the GRE/GMAT discrepancy, optional experience, language scales/waivers, known language gaps, catalogue/detail/matching APIs, old remembered choices reloading current facts and candidate exports without student background or match claims.

Earlier NTU/SMU observation tests no longer treat NUS's old date as an immutable unrelated snapshot; they check the unchanged EdUHK observation instead. The same-day NTU Economics test scopes its uniqueness check to its research batch, since another programme can legitimately be refreshed on the same date. Its actual source/date checks remain.

Official browser reading covered the General Track FAQ accordions (test optionality, experience and equal FT/PT admission criteria), application table, fee table/notes and admissions text. The programme overview was also read through the web tool. These are AI-assisted observations, not independent human review. No live application portal or scholarship/rebate eligibility was checked.

Local browser QA restricted search to NUS General Track and returned one parent record. Both explicit FT/PT selections produced a single correctly labelled offering, their respective normal/max durations, SGD 76,409 tuition and separate SGD 109 application fee. Detail displays the GRE/GMAT discrepancy, manual conditions, date-source clock and partial coverage. It is English-only, with no horizontal page overflow and no warnings/errors in the inspected browser log. No student profile entered, programme saved, choice remembered, candidate file downloaded or application submitted. Saved-choice and export behavior was verified in automated tests, not browser storage. Screenshot outside Git: parent-workspace `work/gradpath-nus-mcomp-general-2026-10-22.png` (selected part-time date comparison). Agent-created tabs closed and in-memory loopback preview stopped.

Totals remain 873 catalogue / 870 visible / 21 parent page checks / 0 independent human reviews / 0 complete requirement sets, with no source-refresh conflicts. Object comparison to the previous local commit identifies only NUS `SG-NUS-P029` changed in checked parent records. Frozen seed-workbook SHA-256 remains `5DF32B82A7A1DDDBF5672BF59AC46AC3EB046D95E1EE580DE49A5C840FB47A0B`. Directory, route and applicant-category evidence remains unchanged.

## Publication recommendation

No push or deployment. Keep this tested data-quality increment for the 25 October stage review, which is not automatic publication authority. Only a real-date local commit is made; main, publication branches/worktrees, desktop documents and course submissions are untouched.
