# Local programme-choice matching consistency — 22 October 2026

Actual AI-assisted engineering log, not coursework submission text, team attribution, user research or independent admissions review.

## Completed

The previous option-change failure path restored a whole earlier match cache. An older failure for programme A could therefore discard newer results for programme B. Older completions also had no per-programme ownership check and could re-enable controls in a different/reopened detail dialog. The matching-refresh guard covered background/request identity, but not the selected route/intake/applicant context itself.

Matching refreshes now capture the programme-choice context and discard replies for obsolete choices. A choice change immediately invalidates cached matching and pending catalogue/matching requests. Each programme has one current temporary transaction. Overlapping changes retain the last settled rollback baseline rather than treating an older pending selection as validated. Superseded completions do not roll back, display stale errors, reopen details or unlock newer controls.

A failed current change restores only that programme's route/intake/applicant choices and recomputes matching for the current choices/background; it never reinstates a whole previous cache. If that recovery refresh fails, matching remains withheld with an English retry explanation. Discovery, details and comparison distinguish unavailable current checks from a missing background; discovery's warning remains visible beyond the temporary toast. Profile submissions also check the choice snapshot before applying/persisting results. Existing explicit remembering, background-clear and request-ownership boundaries remain intact.

Detail refresh/focus is limited to the same open dialog generation. Reopened/closed or different programme dialogs retain their current controls and focus.

No programme source, admissions criterion, review state, storage schema, server endpoint or dependency changed. No official page was rechecked. This remains a published-criteria comparison tool, not confirmed eligibility or an admission predictor.

## Verification

565 automated tests passed, none failed or skipped (17 additional cases). Controlled-response tests execute the actual option-change/matching code and cover same-programme overlap, last-settled rollback, different-programme late failures, stale matching success/error, recovery failure, background clearing/replacement, invalidation, dependent-choice resets, dialog-generation/focus guards and no temporary-choice persistence. Additional cases cover profile-submission context changes and persistent withheld-result explanations in discovery/details/comparison. Existing offering/applicant source-shape assertions were updated for the new transaction baseline; initial full regression exposed those old variable-name assertions before the final passing run. English-only, privacy, source, matching and export checks remain passing.

Browser QA used an independent in-memory preview on loopback port 3111. The origin began with no background, no shortlist and no comparison tray. A clearly synthetic major was submitted without remembering it and with no GPA/language scores. NUS General Track full-time and part-time selections re-enabled correctly, restored selector focus, showed one selected offering and added the unresolved intake-applicability check. The part-time card showed the selected part-time duration/fee and 2 met / 0 gaps / 7 unresolved checks. No confirmed eligibility or recommendation tier was displayed.

The final version was reloaded and its part-time path rechecked after the persistent-copy addition. Screenshot outside Git: parent-workspace `work/gradpath-choice-matching-2026-10-22.png`, showing the final part-time detail selector and temporary-choice notice. The browser verified the normal integration path; failure/reordering conditions were tested through controlled automated replies, not claimed as live network faults or a user study. The option was reset to no selection, the synthetic background was cleared, and the origin ended with blank background, unchecked remember preference, zero shortlist and no tray. Inspected browser logs had no warnings/errors and no horizontal page overflow was found. The owned tab and preview were closed at handoff.

Data remains 873 catalogue / 870 browsable / 21 parent programme-page checks / 0 independent human reviews / 0 complete requirement sets, with no source-refresh conflicts. Frozen workbook SHA-256 remains `5DF32B82A7A1DDDBF5672BF59AC46AC3EB046D95E1EE580DE49A5C840FB47A0B`.

## Publication recommendation

Local commit only; no push or deployment. Include this correctness fix with preceding local work in the 25 October stage review. That review is not automatic publication authority. Main and historical publication/checkpoint branches/worktrees, desktop documents and assessment submissions remain untouched.
