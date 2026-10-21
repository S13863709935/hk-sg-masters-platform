# Local shortlist and comparison loading isolation — 21 October 2026

Actual AI-assisted development log, not assessment prose, team attribution or user-research evidence.

## Local fix

Shortlist and comparison rendering previously checked only the active view name after loading. A previous request could therefore replace a newly redrawn list, including after leaving and returning to the same view. A rejected previous request could also reach generic page error handling. An older async render finishing while Data workspace was active could append duplicate evidence sections there.

Each saved-view load now uses a copied ID list and the specific DOM container created for that render. Success and failure apply only while that container is still connected and current. Shortlist and comparison have explicit loading/busy status. A current failure shows a local retry without changing selections or inserting substitute facts. Retry reloads the current list, not an obsolete snapshot. Missing programme/choice cards remain explicit.

The outer view renderer also checks its original page and view before showing an error or adding evidence sections. No catalogue, route/category projection, admission criterion, independent-review status or persistence format changed; no dependency or external service was added.

## Verification

405 automated tests passed, none failed or skipped. Fourteen new deterministic tests execute the actual saved-view renderers with controlled completions and a minimal DOM adapter. They cover ID snapshots; late success/failure after redraw, removal, clearing or navigation; leave-and-return to the same view; preserved selections and current-list retry; missing comparison choices; busy-state completion; and duplicate-evidence prevention. These tests control request ordering; they are not a claim that delayed network races were replayed in the browser.

Browser QA began with empty shortlist/comparison lists. Two temporary NTU programme selections loaded as two shortlist cards and two comparison columns. The respective study modes, years and fee/date unknowns remained visible. Removing one comparison produced the under-two empty view; removing one shortlist entry left only the remaining programme after visiting Data workspace and returning. Data workspace showed one route-evidence section and one applicant-evidence section. Both temporary shortlist entries and all comparison selections were then removed through the interface.

Inspected views were English-only with no horizontal page overflow; no warning/error was observed in the browser log snapshot. No background was entered, choice remembered, application submitted or user-owned saved entry removed. The preview used an in-memory loopback-only database. Screenshot outside Git: parent-workspace `work/gradpath-saved-views-2026-10-21.png`; it shows the temporary comparison before cleanup.

Data totals remain 873 catalogue / 870 visible / 21 parent checks, with zero complete sets or independent human reviews. Source observations and original workbook are untouched.

## Publication recommendation

No push now. Consolidate the correctness fixes for the 25 October stage review; that review does not authorize automatic publication. Only local work and a local commit are performed, with no deployment, remote Git operation, desktop-document edit, assessment submission or publication-worktree change.
