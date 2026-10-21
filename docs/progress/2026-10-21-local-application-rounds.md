# Local application-round cutoff snapshots — 21 October 2026

Actual AI-assisted engineering record, not assessment text, human review or user-research evidence.

## Completed locally

- Added optional structured rounds with validated IDs, dated deadlines and explicitly recorded UTC+08 cutoff times. Missing cutoff/opening times are not inferred from prose or replaced with midnight.
- Populated HKU ordinary CS main and clearing rounds from the already recorded 21 October observation. No new university-page check, source date, programme count or reviewer was invented.
- Added per-round cutoff comparisons and the next recorded cutoff. At the recorded main-round noon cutoff the next item switches to clearing; this does not imply that clearing has opened. The overall date-only status remains cautious where opening dates are missing.
- Rendered English round cards in details, next-cutoff hints on programme cards, both dates in comparisons and full current snapshot data in candidate exports. Single-offering details use available width; round cards stack below 600px.
- Preserved route/category gates and full offering fingerprints. Unselected/stale categories mask rounds; categories without their own round evidence cannot borrow baseline rounds.
- Kept browser storage limited to explicit choice IDs and save time. Reopening recomputes the current cutoff snapshot. No notification, calendar event or scheduled monitor is created.

## Verification

336 automated tests passed, none failed/skipped, including 25 new round tests. Coverage includes malformed/oversized arrays, duplicate IDs, impossible dates, offset/date mismatches, conflicting final deadlines, one-second noon boundaries, UTC+08 day boundaries, date-only fallbacks, unknown openings, evidence gates, stale/category isolation, export and saved-choice refresh. Academic check outcomes and admission tiers remain unchanged when a cutoff is crossed.

Browser checks confirmed both English round cards, main-round next-cutoff context, the UTC+08 comparison snapshot time, catalogue hint and two-programme comparison rows. The inspected detail dialog was English-only and had no horizontal overflow; no browser warning/error was observed. Temporary comparison entries were cleared through the UI. No background was entered/saved, no choice was remembered and no application was submitted. The preview used an in-memory loopback-only server.

Evidence screenshot is outside Git at parent-workspace `work/gradpath-application-rounds-2026-10-21.png`. Counts remain 873 catalogue / 870 default-visible / 21 parent page checks, 3 route checks, 5 applicant study options / 10 categories, with zero complete sets or independent reviews. Original workbook and unrelated source records are unchanged.

## Remaining / publication recommendation

This feature fixes a representation gap, not the much larger missing-requirements or independent-review gap. Continue bounded programme checks and ask team members to review actual official evidence. Do not interpret cutoff snapshots as live application status.

Recommend no push now; consolidate for the 25 October stage review, which is not automatic publication. This batch stays local. No remote operation, deployment, desktop-document change, assessment submission or publication-worktree edit.
