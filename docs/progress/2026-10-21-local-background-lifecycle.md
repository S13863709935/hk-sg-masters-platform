# Local background lifecycle protection — 21 October 2026

Actual AI-assisted development log, not assessment prose, team attribution or user-research evidence.

## Local fix

A background submission previously applied its response without checking whether its form was still current. A late response could therefore apply obsolete values, navigate away from a newer page, or remember an old save preference. An old failure could also address a different or removed error container.

Background changes and match requests now have generation/sequence guards. Submission results apply only to the same connected, current profile form and unchanged form values, including the optional Remember checkbox. Editing during a pending successful request requires resubmission; leaving or replacing the form discards the old response and error. Clearing the background invalidates outstanding submissions and refreshes. Background refreshes from date comparison, study-option changes, import and startup use the shared guard; option-error rollback cannot restore checks from a different background.

Cached checks are hidden without an active background. Browser-storage failures report session-only application/clearing and explicitly warn that previously saved data may remain, rather than claiming persistence succeeded. Form comparison is in memory only; no profile fingerprint, grade or language result is added to logs, analytics or server storage. No dependency, persistence schema, admission rule or programme evidence changed.

## Verification

423 automated tests passed, none failed or skipped. Eighteen new deterministic tests execute the actual lifecycle with synthetic form data and controlled replies. Coverage includes late success/failure after clearing, navigation or form replacement; newer requests winning; edits and save-preference changes during loading; local/current-server errors; cross-background and same-background refresh ordering; absent-profile cached-check suppression; storage failure wording; and guarded call-site wiring. Delayed request ordering and storage failures were tested with controlled adapters, not injected into the browser.

Browser QA used the built-in synthetic Civil Engineering example with Remember unchecked. Blank-major validation remained inline and English. Submitting the example returned to the same filtered discovery view. NTU MSc Information Systems still showed Needs confirmation, with no recommendation tier. Switching to the recorded Part-time offering refreshed the checks while retaining unresolved intake applicability. Closing the details restored focus to View details.

The synthetic background was then cleared through the interface: the major became blank, Remember remained unchecked, and Clear background disappeared. Discovery kept the search and university filter but removed the applied-background strip, requirement-check filter and cached card outcomes. Reopened details requested a background instead of displaying the previous outcomes. No warning/error appeared in the browser log snapshot. Shortlist and comparison stayed empty, and no programme choice was remembered. The loopback preview used an in-memory database; it and the agent-created browser tab were closed after QA. Screenshot outside Git: parent-workspace `work/gradpath-background-cleared-2026-10-21.png`.

Catalogue totals remain 873 records / 870 visible / 21 parent checks, with zero independently reviewed records and zero complete requirement sets. Source observations and the frozen seed workbook are unchanged. These UI checks are not user testing or independent evidence review.

## Publication recommendation

No push or deployment now. Consolidate the correctness fixes for the 25 October stage review; that review does not authorize automatic publication. Only a local commit is made, without altering main or publication branches/worktrees.
