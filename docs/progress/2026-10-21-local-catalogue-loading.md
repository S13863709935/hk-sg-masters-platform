# Local catalogue loading and pagination focus — 21 October 2026

Actual AI-assisted development log, not assessment prose, team attribution, user research or independent evidence review.

## Local changes

Typing a new search previously left an old request valid until the debounce started the next load. The previous request could therefore display results for an earlier query under the newly edited search field. Catalogue loads now check the specific connected results container, request sequence, current filter/route/offering/applicant context and background/match identity before applying either a response or an error. Typing invalidates outstanding work immediately. Queued searches cannot start on another page or a replacement discovery view; an immediate filter load cancels the queued search.

The results container exposes a busy state and a separate stable polite status node reports loading, the current result count/page, or the current failure. A visible level-two result summary now also includes the page number. Pagination/retry can move focus to this summary after completion, with a non-animated scroll and a small top margin so the focus outline is not clipped. Sorting restores the newly rendered sort control. Completion does not move focus if another control has focus or a detail dialog is open. Old page completions cannot scroll or focus a different view. Region changes focus the replacement region button; Reset filters focuses Search programmes.

No catalogue evidence, admission rule, background persistence, external service, dependency or API contract changed. These are local correctness and keyboard-usability changes, not admission predictions or a claim of screen-reader compliance.

## Verification

451 automated tests passed, none failed or skipped. Eighteen new tests execute the actual loader, debounce and result renderer using controlled replies/timers and a replaceable DOM adapter. They cover response/error ordering; container replacement and navigation; immediate invalidation before debounce; queued-search cancellation; changed filters, programme choices or background; pagination/sort/retry focus; avoiding focus theft; busy/status completion; background-local sorting/pagination; empty results; and UI wiring. Delayed requests and failures are deterministic test scenarios, not browser network-failure injections.

Browser QA used an in-memory loopback preview at a 1265px CSS viewport. Enter on Next produced 12 cards and `870 programmes · Page 2 of 73`, with focus on the result summary and busy=false. Tab reached Sort by; changing it to A–Z reset pagination to page one and restored the sort control's focus. Searching Wee Kim Wee returned only MSc Information Systems while focus remained on search. Singapore region activation kept focus on the replacement region control and preserved the query. Reset cleared query/region and focused search. An intentionally unmatched synthetic query showed the explicit empty state, zero programmes, page one of one and busy=false without moving search focus.

The final screenshot outside Git is parent-workspace `work/gradpath-catalogue-pagination-2026-10-21.png`. It shows page two after resetting filters, with A–Z sorting retained and focus on the result summary. No background was entered or remembered, no shortlist/comparison choice was added, and no browser warning/error appeared in the inspected log. The agent-created tab and temporary preview were closed after QA. No real mobile device or assistive-technology test was performed.

Data remains 873 catalogue records / 870 visible / 21 parent programme-page checks / 0 independent human reviews / 0 complete requirement sets. No source-refresh conflicts are recorded, and the frozen seed workbook hash is unchanged.

## Publication recommendation

No push or deployment now. Keep this local increment with the earlier correctness fixes for the 25 October stage review; that review does not authorize automatic publication. Main and all publication branches/worktrees remain untouched.
