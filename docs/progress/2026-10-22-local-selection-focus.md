# Local selection-action focus recovery — 22 October 2026

Actual AI-assisted engineering log, not assessment submission text, team attribution, user research or independent admissions review.

## Completed

Browser reproduction confirmed that activating the final shortlist item's save/remove button with Enter detached the focused button and left focus on `BODY`. Saved-list redraws and comparison-tray replacements had no action-specific recovery path.

Removal from the shortlist or comparison table now returns focus to the next available control at the same position, or the previous final control. Empty/error states use their Explore/retry action. Tray removal restores focus immediately to the next chip; clearing the tray or removing its last chip uses the stable main content. A restoration is attempted only for a focused initiating control after it has been detached. Changed views/pages, detached roots, open detail dialogs and focus already moved to another control suppress delayed restoration; a successful restoration runs only once. Existing current-container guards ensure superseded saved-list requests do not invoke old focus callbacks.

Comparison-table removal buttons now identify the programme in their accessible names. A one-item shortlist says “1 programme”, matching the catalogue's singular-count behavior.

No storage schema, list membership policy, admissions fact, source snapshot, server endpoint or dependency changed. No official website was rechecked.

## Verification

548 automated tests passed, none failed or skipped. Seventeen added tests cover positional/empty/error focus recovery, immediate tray behavior, disabled controls, competing focus and dialog/page guards, actual save/compare/clear action wiring, storage failures, accessible-name wiring, current/stale renderer callbacks, unavailable comparison records and singular shortlist counts. Existing source/data/matching/privacy/export tests still pass. An initial smaller test run without network permission hit Windows loopback access denial in API-backed tests; the complete authorized local run passed.

Browser QA used a separate in-memory preview on loopback port 3111. The origin started with zero shortlist entries and no comparison tray. A temporary Finance entry reproduced the old last-item focus loss and was removed before reloading the updated app. Three temporary programmes then verified shortlist first/final removal, the one-programme count, empty-list Explore focus, comparison-table three-to-two focus and two-to-one Explore focus. Tray tests covered next-chip focus, removing the last chip and Clear returning focus to main. All temporary shortlist/comparison entries were removed; the origin ended at shortlist zero with no tray. No background or remembered route/intake/applicant choice was entered, and no university application was submitted.

Inspected browser logs contained no warnings/errors; inspected pages had no horizontal page overflow. The comparison table remains independently scrollable. Screenshot outside Git: parent-workspace `work/gradpath-selection-focus-2026-10-22.png`, showing focus on the remaining MA Communication removal control after a comparison column was removed. The browser tests validate functional behavior, not a user study or comprehensive accessibility audit. Agent-created tab and temporary preview were closed at handoff.

Data audit remains 873 catalogue / 870 browsable / 21 parent programme-page checks / 0 independent human reviews / 0 complete requirement sets, with no source-refresh conflicts. Frozen seed workbook SHA-256 is unchanged: `5DF32B82A7A1DDDBF5672BF59AC46AC3EB046D95E1EE580DE49A5C840FB47A0B`.

## Publication recommendation

Save a real-date local commit only. No push or deployment; consolidate with preceding local work for the 25 October stage review, which does not itself authorize publication. Main and historical checkpoint branches/worktrees, desktop documents and assessment submissions remain untouched.
