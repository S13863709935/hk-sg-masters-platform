# Local keyboard navigation and text wrapping — 21 October 2026

Actual AI-assisted development log, not assessment prose, team attribution, user research or an accessibility-compliance certification.

## Local changes

Browser inspection reproduced a focus loss: activating My background with Enter rebuilt the app shell and left focus on BODY. Explicit page transitions now render the new shell, reset page scroll and focus its main content immediately, without waiting for network completion. The next Tab enters the page's controls instead of restarting the sidebar. Selecting the current page uses the same transition. The existing Skip to content anchor still focuses main without rebuilding the page or discarding an unsaved form. Initial boot does not gain automatic focus stealing.

The comparison table now has a named, focusable scroll region, a visible keyboard-focus outline and an English horizontal-scroll hint. Column and row header scopes explicitly associate comparison labels and programme columns. Existing row contents, missing-evidence wording and selection behavior remain unchanged.

Small-screen text protections permit long card titles, detail titles, check explanations and background labels to wrap. Flex/grid children can shrink without forcing long unbroken text beyond their containers; detail Close and background-navigation buttons retain their width. No mobile viewport or device emulation was available through the selected browser API. These CSS constraints were inspected and regression-checked; they are not a claim of a completed mobile, touch, screen-reader or cross-browser audit.

## Verification

433 automated tests passed, none failed or skipped. Ten new tests exercise the actual navigation/hash handlers with controlled render promises; preserve skip-link behavior and current-form state; check late completions cannot refocus an old page; execute the actual comparison renderer to verify its named region, hint and header scopes; and check the targeted CSS rules. These focused checks do not replace browser or assistive-technology testing.

In the loopback preview at a 1265 CSS-pixel viewport, Enter on the current My background navigation focused MAIN; one Tab focused Undergraduate major. Skip to content retained a synthetic unsaved major while moving focus to main. Changing to Explore programmes focused its main content. Enter opened a programme detail, and Escape returned focus to the original View details button.

Four temporary comparison choices produced a table with 1190px scroll width inside a 941px region, while the document remained 1265px wide. Three right-arrow key presses on the focused region moved its horizontal scroll position to approximately 103px, with the focus indicator active. The table exposed 17 row headers. No warning/error appeared in the browser log snapshot. A synthetic background used for an earlier long-text check was cleared; no background was remembered. The unsaved synthetic entry was discarded by normal navigation. The four test-only comparison selections were removed through Clear, leaving the comparison empty and the shortlist at zero.

Final UI state had a blank major, Remember unchecked and keyboard focus on the major field. Screenshots outside Git: parent-workspace `work/gradpath-keyboard-profile-2026-10-21.png` and `work/gradpath-keyboard-comparison-2026-10-21.png`. The agent-created tab and in-memory loopback preview were closed after QA.

Catalogue evidence, admission rules, dependencies and persistence formats were not changed. Totals remain 873 catalogue / 870 visible / 21 parent checks / 0 independent reviews / 0 complete requirement sets. The frozen workbook hash is unchanged.

## Publication recommendation

No push or deployment now. Keep this as a local correctness/usability increment for the 25 October stage review; the review is not automatic authorization to publish. Main and publication branches/worktrees remain untouched. Real mobile viewport/device checks and assistive-technology testing remain future verification work.
