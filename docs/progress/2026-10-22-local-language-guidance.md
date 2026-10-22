# Local language-input guidance and route feedback — 22 October 2026

Actual AI-assisted engineering log, not assessment text, team-work attribution, admissions review or student research.

## Completed

Added English instructions specific to IELTS Academic, legacy TOEFL 0–120, updated TOEFL 1–6, no results and proposed waiver routes. The overall-score label now identifies the selected scale. A live route hint is associated with the selector and overall score; the test-date input has its own associated hint. Unknown scores remain optional. Selecting no results or a proposed waiver does not claim that requirements are met.

Changing the language route clears obsolete client field feedback inside the language panel only. Existing hint references are retained. Academic-field errors and unassociated server/network errors remain visible, and reapplying the same route does not dismiss its error. Hidden controls remain disabled. Draft values are retained without conversion; single-attempt, at-home and waiver claims are not automatically selected. Pending checks still require resubmission after a route change rather than applying an obsolete result.

Browser QA also exposed a pre-existing input-range mismatch: updated TOEFL allowed zero despite the 1–6 report scale. Both browser minimum and authoritative server validation now use 1 for this route. Null scores remain accepted; 1–6 half bands are accepted. IELTS and legacy TOEFL retain their previous zero minimum. This is score-format validation, not a university admissions minimum.

Source checked on 22 October 2026: [ETS — Understanding TOEFL Scores](https://www.ets.org/toefl/test-takers/ibt/scores/understand-scores.html), specifically the updated 1–6 overall/section scale and half-point increments. No score comparison table was imported or used to convert student scores. University requirements and existing version/date constraints are unchanged. This pass does not add interpretation of comparable 0–120 estimates printed on updated reports; the app's existing legacy-version route is still distinct.

## Verification

608 automated tests passed, none failed or skipped (14 new cases). Tests execute the actual language-panel rendering, visibility/disabled states, scale labels/bounds, hint associations, selective feedback clearing, preservation of draft values and pending-submission guards. Added server-validation and HTTP tests reject updated-TOEFL zero/below-minimum/above-maximum inputs even when browser validation is bypassed, while retaining optional and valid boundary scores. Existing privacy, catalogue, source, export and matching suites pass.

Browser QA used synthetic input and a separate in-memory local server. The initial pass confirmed IELTS 10 produces a field error and changing to legacy TOEFL removes that error and its marker while preserving the score and help reference. Switching a retained score of 90 to updated TOEFL did not convert it and still blocked submission as out of range. After correcting the minimum, a final-code pass confirmed updated TOEFL zero gives an English 1–6 range error and focuses the score. Switching to waiver removed the obsolete error, disabled the hidden score and displayed unconfirmed-waiver guidance. Selecting no results submitted successfully despite the retained hidden draft value.

A synthetic updated-TOEFL score of 5 with date 2026-09-01 also submitted successfully, showing two NUS computing search results without eligibility tiers. A later missing-GPA-scale error survived switching the language route, as intended. Inspected warning/error logs were empty. The remember preference stayed unchecked; no real grades or application data were used. The synthetic background was cleared at the end, with zero shortlist, no comparison/programme-choice changes, and the owned tab and both successive local-server instances closed.

Screenshot outside Git: parent-workspace `work/gradpath-language-guidance-2026-10-22.png`, showing the final English language panel with synthetic values before submission. Data audit remains 873 catalogue / 870 browsable / 21 programme-page checks / 0 independent human reviews / 0 complete requirement sets, with no source-refresh conflicts. Frozen workbook SHA-256 remains `5DF32B82A7A1DDDBF5672BF59AC46AC3EB046D95E1EE580DE49A5C840FB47A0B`. No programme data or university evidence was changed or rechecked.

## Publication recommendation

Local commit only, no push or deployment. Review together with preceding local changes at the 25 October stage review; that review is not automatic publication authority. Main, historical checkpoint branches/worktrees, desktop documents and course submissions remain untouched.
