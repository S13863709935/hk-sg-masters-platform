# Local shortlist export lifecycle — 21 October 2026

Actual AI-assisted development log, not assessment prose, team attribution, user research or independent evidence review.

## Local changes

Shortlist export previously loaded records without checking whether the initiating list or programme choices were still current. Repeated activation could start overlapping downloads; an old request could finish after navigation or a list redraw.

Export now copies the selected ID list and explicitly remembered choice records at activation. A request/DOM guard keeps responses and errors scoped to the initiating shortlist and button. Changes to membership, order, route, study option, applicant category, remembered choices or saved-choice issues cancel that export; unrelated programme choices do not. Unexpected/mismatched record IDs are rejected. A preparing state disables repeated activation, and an inline English status distinguishes preparation, cancellation, retryable failure, download request and uncertain browser initiation. Focus returns to the original export button only when appropriate, never over another focused control or an open detail dialog.

The existing JSON format and privacy boundary remain: unresolved saved choices are listed separately without substitute fees/dates, and no self-reported background or match/prediction output is included. Object URLs are scheduled for cleanup even if anchor creation/click throws. No persistence schema, dependency, server route, programme evidence or admission rule changed.

## Verification

471 automated tests passed, none failed or skipped. Twenty new tests execute the actual export/download functions with controlled requests, in-memory Blobs and anchor adapters. They cover request snapshots, duplicate activation, navigation/redraw and newer exports, relevant versus unrelated choice changes, old/current failures, retries, unexpected records, private-field omission, unresolved choices, URL cleanup, serialization/initialization failures and conditional focus restoration. The existing application-date integration assertion was updated to require the copied choice snapshot rather than the old live-object call; its timeline and manual-refresh checks remain.

Browser QA began with empty shortlist/comparison lists. One temporary NTU MSc Information Systems entry was saved; its August 2027 / 2027/28 Part-time option was selected without remembering it. Export displayed one programme record, zero unresolved saved selections and the explicit background-exclusion message. The button re-enabled and keyboard focus returned to it. The page retained unresolved current tuition/application-opening cautions. The normal export was exercised before and after the focus refinement. The UI confirms that the browser download was requested, not that a disk file was saved: downloaded-file bytes were not retrieved through the browser tool. Payload contents, privacy and URL cleanup were verified with the automated adapters. No delayed-network or download failure was injected into the browser.

No warning/error appeared in the inspected browser log; document width matched the 1265px viewport. No background was entered or remembered, no choice was remembered and no comparison entry was added. The temporary shortlist entry was removed through the interface, leaving shortlist zero and comparison empty. The agent-created tab and in-memory loopback preview were closed. Screenshot outside Git: parent-workspace `work/gradpath-shortlist-export-2026-10-21.png`, captured before cleanup.

Data remains 873 catalogue / 870 visible / 21 parent page checks / 0 independent human reviews / 0 complete requirement sets, with no recorded source-refresh conflict. The frozen seed workbook hash is unchanged.

## Publication recommendation

No push or deployment now. Keep this local increment with the preceding correctness fixes for the 25 October stage review; that review is not automatic authorization to publish. Main and publication branches/worktrees remain untouched.
