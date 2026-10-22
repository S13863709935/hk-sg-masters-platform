# Local matching recovery and filter pause — 22 October 2026

Actual AI-assisted engineering log, not assessment submission text, completed team attribution, independent admissions review or user research.

## Completed

When a background existed but its current match cache was unavailable, the catalogue loader previously fell back to ordinary directory browsing even if a requirement-check filter remained selected. That could present unchecked catalogue rows underneath a selected “Checked criteria met” filter.

All requirement-check filters now pause when current matches are unavailable. No unfiltered programme rows or apparent zero-result eligibility count are displayed as matching output. The filter is retained, and a named recovery panel offers Retry requirement checks with a polite status and explicit stored-source/privacy limits. Without a requirement-check filter, ordinary catalogue browsing remains available; its sort label correctly describes checked-information ordering, not nonexistent match ordering.

Retry reuses the current session background and programme choices without saving them. It preserves search filters, sort, shortlist/comparison membership and programme choices, restarting pagination at page one after a successful refresh. Success removes the recovery panel, reruns the current filters and conditionally focuses the result summary. Failure leaves checks withheld, re-enables retry and conditionally restores its keyboard focus. Duplicate activation is suppressed.

The shared matching refresh accepts an additional current-operation guard. Obsolete retry pages/panels cannot commit a match cache, force navigation, move focus or overwrite a newer retry. This prevents an old retry from invalidating a new catalogue load after leaving and returning to discovery. Background/choice/request guards remain in force. Retry does not recheck official websites, schedule updates, alter admission rules or imply confirmed eligibility.

## Verification

581 automated tests passed, none failed or skipped (16 additional cases). New cases execute the actual retry/matching guards with controlled replies and cover success, duplicate activation, repeated failure/recovery, page/panel replacement, background/choice changes, current-filter preservation, shared-request supersession, storage boundaries, conditional focus, rendering failure and accessible recovery markup. Catalogue tests cover all three paused requirement-check filters and continued ordinary browsing when no check filter is selected. Existing source, privacy, matching, export and lifecycle suites still pass.

Browser QA used a separate loopback-only, in-memory fixture outside the repository. It wrapped the real app handler to return explicitly synthetic 503 responses for selected matching-request numbers, without reading/logging request bodies or altering production code. In the first run, requests 2 and 3 failed during an option change and rollback refresh; request 4 recovered via the new button. In the final-code run, requests 2, 3 and 4 failed intentionally; a second direct retry (request 5) succeeded. This was deliberate local fault injection, not a real university/server outage.

A synthetic major was entered without GPA/language scores or remembering the background. With matches missing, both Needs confirmation and Checked criteria met retained their filter selection but showed no cards or result count. After a failed direct retry, the button was enabled, the panel was no longer busy and keyboard focus returned to retry. The next retry restored two Needs confirmation records with the NUS/search filters unchanged, removed the panel and focused the result heading. Inspected browser logs had no uncaught warnings/errors; the intentional 503s were handled. No horizontal page overflow was observed.

The origin started and ended with no background, no remembered background preference, zero shortlist and no comparison tray. The failed option change restored its unselected baseline; no programme choice was remembered. No real student data or application was used. The owned tab, both test-service instances and the temporary QA fixture were cleaned up. Screenshot outside Git: parent-workspace `work/gradpath-matching-retry-2026-10-22.png`, showing the intentionally failed retry state, paused filter, enabled retry and visible focus before the successful second retry.

Data audit remains 873 catalogue / 870 browsable / 21 parent programme-page checks / 0 independent human reviews / 0 complete requirement sets, with no source-refresh conflicts. Frozen workbook SHA-256 is unchanged: `5DF32B82A7A1DDDBF5672BF59AC46AC3EB046D95E1EE580DE49A5C840FB47A0B`. No admissions source was rechecked in this pass.

## Publication recommendation

Local commit only, no push or deployment. Consolidate with preceding local work at the 25 October stage review; that review does not itself authorize publication. Main and historical checkpoint branches/worktrees, desktop documents and course submissions remain untouched.
