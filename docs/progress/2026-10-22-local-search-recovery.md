# Local search recovery — 22 October 2026

Actual AI-assisted engineering log, not coursework submission text, team attribution, user research or independent admissions review.

## Completed

The catalogue's zero-result action previously navigated back to Explore without clearing its filters, reproducing the same empty search. Filtered empty results now offer Reset filters directly. It uses the existing reset handler to clear query, region, school, subject, mode, verification and matching filters, reset pagination, update URL filters and return focus to the search input. Background, cached matching records, shortlist, comparison list and temporary/remembered programme choices are preserved; sort order and unrelated URL parameters are not removed.

An unfiltered empty catalogue instead has a distinct explanation and retry action, avoiding a reset with nothing to clear. A current catalogue request failure now has one retry button inside the error state, without ineffective same-page navigation. Existing guarded loading/error handling and default Explore navigation on other empty pages remain unchanged. Both the visible result count and polite status use singular “programme” for one result.

No admissions source, programme fact, scope rule, storage schema, server endpoint or dependency changed. No official page was rechecked.

## Verification

531 automated tests passed, none failed or skipped. Five additional tests cover each active filter's recovery action (including the background-results path), singular counts with/without a background, actual reset-handler/URL/focus behavior, preservation of background/lists/choices and default empty-page navigation. Existing loader tests now execute the actual empty-state renderer; error/retry and unfiltered-empty checks assert that no reset or redundant navigation is offered.

Browser QA used a separate in-memory preview on loopback port 3111. A synthetic missing keyword with Singapore/NUS filters showed zero results and the new reset action. Activating it cleared the controls and URL filters, restored 870 browsable records and focused search. A NUS Finance query displayed “1 programme”. One temporary Finance shortlist entry was then used to confirm that reset restored all results without deleting the saved entry. It was removed through the interface afterward, restoring the initially empty shortlist. No profile, comparison entry or remembered programme choice was added. Preservation of those other contexts was checked by automated tests, not claimed as a live human/user study.

The inspected browser log had no warnings/errors; the reset-result page had no horizontal overflow. Screenshot outside Git: parent-workspace `work/gradpath-search-recovery-2026-10-22.png`, showing the new empty-state action with visible keyboard focus after temporary-entry cleanup. Agent-created tab and temporary preview were closed at handoff.

Data remains 873 catalogue / 870 browsable / 21 parent programme-page checks / 0 independent reviews / 0 complete requirements sets, with no source-refresh conflicts. The frozen workbook hash remains `5DF32B82A7A1DDDBF5672BF59AC46AC3EB046D95E1EE580DE49A5C840FB47A0B`.

## Publication recommendation

Local commit only; no push or deployment. Include this bounded recovery fix in the 25 October stage review with preceding local work. That review is not automatic publication authority. Main and historical checkpoint branches/worktrees, desktop documents and course submissions remain untouched.
