# Local detail-loading recovery and focus — 21 October 2026

Actual AI-assisted development record, not assessment prose, team attribution or user-research evidence.

## Issues and local fix

The detail success path already rejected superseded responses, but its error path did not. A late failure could replace a newer project's content while the active detail still referred to the newer record. Starting another request also retained the previous active object, and loading had no explicit close control.

Added a named loading/error shell with a close button, accessible status/alert text, the requested ID, and an explicit retry for that same ID. Active facts are cleared before loading and on current failure. Both response paths reject superseded or closed requests; no replacement programme or fallback fee is guessed. The URL reflects the requested detail and is cleared on closing. Error text and IDs remain escaped; remembered-choice repair stays programme-scoped.

In-dialog retry/refresh retains the external return-focus target. Browser QA then revealed that a list redraw detaches that original button. Closing now finds the replacement with the same programme/action/text outside the dialog, or falls back to main content if no replacement remains.

## Verification

391 automated tests passed, none failed or skipped. Twelve new deterministic tests execute the actual detail lifecycle with a minimal DOM adapter and controlled request completion. They cover late errors/successes, failure while another request loads, close-before-response, close/reopen of the same ID, retry recovery, safe failure text, clearing partial rendering state, return-focus preservation, detached-button replacement and main-content fallback. These are concurrency unit tests, not a claim that delayed network races were replayed in the browser.

Browser checks used a deliberately nonexistent `NO-SUCH-ID`: the named English error showed no old study facts, retry retained that ID, and closing allowed a real NTU MSIS detail to open. Switching its mode to PT and closing returned focus to the redrawn `View details` button for `SG-NTU-P018`. The detail URL was removed. Error view had no horizontal page overflow; no browser warning/error was observed in the inspected log snapshot. No profile was entered, programme saved, choice remembered or application submitted.

Screenshot outside Git: parent-workspace `work/gradpath-detail-error-2026-10-21.png`, intentionally showing the nonexistent-project test. Preview used an in-memory loopback-only database.

No catalogue, source observation, route/category snapshot, admission rule or independent-review claim changed. Catalogue totals remain 873 / 870 visible / 21 parent checks, with zero complete sets or independent reviews.

## Publication recommendation

No push now. Consolidate this recovery fix with the other local work for the 25 October stage review; that review does not authorize automatic publication. Only a local commit is made, with no deployment, remote operation, desktop-document edit, assessment submission or publication-worktree change.
