# Concentrated local site acceptance — 23 October 2026

Actual AI-assisted engineering QA, not assessment text, team-work attribution, independent admissions review or user research.

## Scope and outcome

Completed the first of the two agreed closing software rounds: exercise the existing site's main workflows and fix normal-use blockers, without adding features. One responsive layout defect was found and fixed. The remaining software round is delivery/startup/documentation checking and a feature freeze, not another open-ended feature backlog. University-data verification remains separate and incomplete.

Browser checks used the real local app on a disposable loopback origin, port 3116, with an in-memory database. They used existing public-source programme records and a clearly synthetic background. No university websites were rechecked, no students were surveyed, and no production deployment was tested.

## Acceptance observations

| Area | Actual browser result |
| --- | --- |
| Discovery | NUS plus “Master of Computing” returned two records. A deliberately nonexistent search showed the English no-results state; restoring the search recovered the records. Reset filters returned 870 browsable records, page 1 of 73. Next and Previous moved between pages 1 and 2. Singapore filtering returned 276 records, with Singapore labels on the displayed cards. Resetting filters preserved the two saved and compared programmes. |
| Background | Submitting GPA 3.5 without its scale showed an English error and focused the scale field. Completing a synthetic major, GPA 3.5/4 and IELTS 7 with four 6.5 components and a test date allowed submission. Incomplete published conditions still produced “Needs confirmation,” not admission predictions or automatic safety tiers. |
| Detail and comparison | Saving and comparing two NUS programmes worked. Choosing the August 2027 full-time option for the General Track updated the comparison's selected-option row. At a 390px viewport, the comparison table scrolled horizontally within its own region; the overall page and detail stayed within the viewport. |
| Actual shortlist download | The UI export completed and its downloaded JSON was read back: two programme records, zero unresolved entries, the selected `SG-NUS-P029-O1` offering, and eight published-requirement entries for the first record. The file contained neither the synthetic major nor profile/matching-result fields. This verifies the export flow and format, not the currency or completeness of university facts. |
| Session boundaries and removal | After reload, saved and compared membership remained, but the unremembered synthetic background and temporary study-option selection did not. The comparison showed no selected study option. Both test programmes were then removed, comparison selections cleared, and a reload confirmed zero shortlist and the explicit empty-comparison state. |
| Data workspace and guide | The workspace showed 14 university-coverage rows and the existing incomplete-data notices. The maintenance import form was absent with admin mode disabled. Help content and labels were English. The public catalogue-export link was present; downloading the entire catalogue was not repeated in this browser pass. |
| Responsive layout | All six pages were measured at 320px and 390px viewport widths. After the fix, document scroll width equalled document client width throughout (305px and 375px respectively, excluding the scrollbar). The data workspace also fitted 768px, 850px and the default 1280px desktop viewport. |

## Defect fixed

The data workspace's grid sections retained their automatic minimum width, allowing the university table and maintenance content to force the whole page wider than a narrow viewport. Before the fix, its document scroll width was 431px at both tested phone widths. Other pages did not show this overflow.

Added `min-width: 0` to the direct section children of `.data-grid`. This lets the existing `.table-wrap` own the horizontal scroll. At the 320px viewport, the page now fits its 305px client width, the section is 271px wide and the table scrolls inside a 269px wrapper (412px content). At 390px the page fits 375px and the table scrolls inside a 339px wrapper. No data, matching or storage logic changed.

Added a render/source-contract regression test for the workspace grid sections, table wrapper and CSS minimum-size/overflow rules. This test does not emulate browser layout; the viewport measurements and screenshot supply the separate rendering check.

## Verification and cleanup

- 631 automated tests passed, none failed, cancelled or skipped. The targeted layout-contract test also passed independently.
- Inspected browser warning/error logs were empty.
- Synthetic background was not remembered. Test shortlist and comparison membership were removed through the UI and their empty states survived reload. No test choices were explicitly remembered.
- Browser viewport override was reset, the temporary tab closed, and the owned in-memory preview service stopped.
- Screenshot outside Git: `work/gradpath-acceptance-mobile-2026-10-23.png` in the parent workspace. It shows the fixed data workspace after comparison-tray cleanup.
- The actual test download remains at `C:/Users/S1386/Downloads/gradpath-shortlist (1).json`; no existing download was overwritten or removed. It contains existing public-source test choices, not the synthetic background.
- Data audit unchanged: 873 catalogue records / 870 browsable / 21 programme-page checks / 0 independent human reviews / 0 complete requirement sets; no source-refresh conflicts. Frozen workbook SHA-256: `5DF32B82A7A1DDDBF5672BF59AC46AC3EB046D95E1EE580DE49A5C840FB47A0B`.

This was desktop-browser QA with viewport emulation, not physical-phone, screen-reader or production-host testing. It does not certify all university requirements, deadlines, fees or admission eligibility. No current real record qualifies for the review-gated complete-requirement classifications.

## Publication recommendation

Local commit only; no push or deployment. Consolidate at the 25 October stage review, without treating that review as automatic publication authority. Main, historical checkpoint branches/worktrees, desktop documents and course submissions remain untouched.
