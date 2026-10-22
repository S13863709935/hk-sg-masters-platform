# Local remembered-background startup recovery — 22 October 2026

Actual AI-assisted engineering log, not assessment text, team-work attribution, independent admissions review or user research.

## Completed

A remembered background triggered a requirement check during startup. Previously, any non-422 matching failure escaped to the fatal startup screen, preventing even ordinary catalogue browsing. Startup now treats that matching-only failure as recoverable after metadata and remembered programme choices have loaded successfully. It retains the current background and browser storage, clears unavailable/stale checks, and renders the requested view rather than an error-only screen.

The existing discovery recovery panel provides a direct retry. Without a matching filter, directory browsing remains available with no match badges. With a matching filter, results/counts remain paused until current checks return. A new fixed English startup notice explains the recovery choices without exposing backend error details. If stored-choice parsing also produced a warning, the notices are combined so one does not immediately replace the other.

No new background persistence or automatic retry was added. Existing request/context guards still suppress obsolete matching replies. The prior 422 reset behavior remains unchanged; metadata or saved-choice restoration failures still block startup rather than assuming unverified baseline programme choices. This is not offline support or a general guarantee that the app works when its local data service is unavailable.

## Verification

617 automated tests passed, none failed or skipped (9 new cases). New tests execute the actual startup and matching lifecycle with synthetic inputs, covering transient/network/server failures, stale-cache removal, ordering of choice restoration before checks, successful/no-background startup, the existing 422 reset path, essential-service failures, supported views/deep links, a superseding background and combined warnings. The new regression cases reproduced the previous fatal screen before the implementation change. Existing retry, catalogue-filter, background, privacy, source and export suites pass.

Browser QA used a separate loopback-only origin on port 3114 and an in-memory database. A disposable wrapper around the real app returned an explicitly synthetic 503 for matching request 2 only; it did not read or log request bodies. A synthetic major was entered with no GPA/language scores, and Remember my background was explicitly checked before request 1 succeeded. Reload then caused request 2 to fail. The website still rendered, its search/university filters were retained, ordinary catalogue cards were available without match badges, and the recovery panel appeared. Selecting Needs confirmation paused cards/counts. Opening My background showed the synthetic major and checked remember preference still present.

Returning to discovery and clicking Retry requirement checks completed request 3, removed the panel, restored two Needs confirmation records, retained search/university/matching filters and focused the result heading. A normal reload completed request 4 and restored current checks without a recovery panel. The remember checkbox was then unchecked and the form successfully resubmitted (request 5). Reload showed the add-background prompt; the profile form was blank, remember unchecked and no clear-background button present. This confirms the synthetic background was no longer restored. Inspected browser warning/error logs were empty; the intentional 503 was handled.

No real student data or application was used. Shortlist/comparison selections and programme choices were not changed. The test tab and service were closed and the disposable fault wrapper was deleted. Screenshot outside Git: parent-workspace `work/gradpath-startup-recovery-2026-10-22.png`, showing the remembered synthetic background, paused matching filter and usable retry panel after the startup failure.

Data audit remains 873 catalogue / 870 browsable / 21 programme-page checks / 0 independent human reviews / 0 complete requirement sets, with no source-refresh conflicts. Frozen workbook SHA-256 remains `5DF32B82A7A1DDDBF5672BF59AC46AC3EB046D95E1EE580DE49A5C840FB47A0B`. No programme data, admissions rule or university source was changed or rechecked.

## Publication recommendation

Local commit only, no push or deployment. Review alongside preceding local changes at the 25 October stage review; that review is not automatic publication authority. Main, historical checkpoint branches/worktrees, desktop documents and course submissions remain untouched.
