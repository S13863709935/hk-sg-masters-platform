# Local background-form feedback — 22 October 2026

Actual AI-assisted engineering log, not assessment submission text, team-work attribution, admissions review or user research.

## Completed

Added a small client preflight for a blank/whitespace-only major and coupled GPA inputs: GPA without its original scale maximum, scale without GPA, and GPA exceeding that maximum. These errors are caught before a matching request. Both GPA inputs may still be blank; zero is a real score. No grade conversion, additional admissions threshold or eligibility conclusion is introduced. Server validation remains authoritative, including language/date rules not duplicated by this preflight.

Local field errors now mark and focus the relevant input, associate the existing English alert using `aria-describedby`, and add an invalid border. Existing hint references are preserved. On resubmission, only feedback added by this form workflow is cleared before validation runs again. Native range/increment/required/date validation retains its English messages and now supplies the field name for this feedback. Import-file validation retains its existing choose-file focus behavior.

Errors are inserted as plain text. Server/network errors with no field metadata continue to use the summary rather than guessing which input failed. A missing/disabled field also falls back to the summary. Invalid submissions do not replace an applied background or matching cache, save a background, or navigate away. Existing request/version/form/choice guards and explicit remember preference remain unchanged.

## Verification

594 automated tests passed, none failed or skipped (13 new cases). The actual client helpers are exercised for client/server agreement on the narrow preflight, optional and zero GPA, original-scale preservation, native validation messages, hint preservation, error-reference deduplication, plain-text errors, summary fallback and import-file focus. Lifecycle tests cover failed preflights without request/storage/navigation, retaining an existing background/cache, corrected resubmission and unchanged zero-GPA payloads. Existing privacy, matching, source, catalogue and export tests still pass.

Browser QA used the real local application with an in-memory database and synthetic inputs only. GPA 3.5 without a scale focused the scale input and linked the English alert. Scale 3 produced an overflow error on GPA and removed the old scale marker. Changing the scale to 4 submitted successfully and showed two NUS computing search results with the synthetic background applied. Returning to the form showed 3.5/4 with no invalid markers. GPA 101 used the existing English numeric-range message. A whitespace-only major focused the major field and cleared the previous GPA marker. Inspected browser warning/error logs were empty.

The origin began with no background and an unchecked remember preference; the synthetic background was never remembered. It ended with the synthetic background cleared, zero shortlist, no comparison selections and no programme-choice changes. The owned test tab and server were closed. Screenshot outside Git: parent-workspace `work/gradpath-background-validation-2026-10-22.png`, showing the overflow alert and focused GPA field before correction. These are functional tests, not real student grades or admissions evidence.

Data audit remains 873 catalogue / 870 browsable / 21 parent programme-page checks / 0 independent human reviews / 0 complete requirement sets, with no source-refresh conflicts. Frozen workbook SHA-256 remains `5DF32B82A7A1DDDBF5672BF59AC46AC3EB046D95E1EE580DE49A5C840FB47A0B`. No programme data, admission rule or official source was changed/rechecked.

## Publication recommendation

Local commit only; no push or deployment. Consolidate with preceding local changes at the 25 October stage review, which does not itself authorize publication. Main, historical checkpoint branches/worktrees, desktop documents and course submissions remain untouched.
