# Local route implementation — 16 October 2026

Work on `feat/local-prototype` only, after the separate Week 5 checkpoint publication. Prepared with AI assistance for Song Shaoheng; no other member's contribution, independent review or user-study result is claimed.

- Added two separate NTU cybersecurity source snapshots: Applied Cryptography and Applied Cybersecurity. Degree alternatives, language thresholds, fee cohorts and application windows remain direction-specific.
- Added an explicit route selector in programme details. Server-side resolution replaces the effective admissions fields using the selected snapshot, never parent or sibling conditions. Unselected groups retain the unresolved-route gate.
- Background checks, detail retrieval, comparison/candidate retrieval and candidate export use the same temporary route selection. Export includes route identity but no background. Selection is not written to the database or browser storage and resets on reload.
- Unknown/foreign selections fail closed. Source URLs, dates, catalogue identity and full snapshot shape are validated before the server accepts the route batch. JSON properties cannot impersonate the internal resolved-route marker.
- Parent catalogue and original pilot data remain unchanged: 551 stored records, 548 default browsable, 21 parent programme checks, 0 independent reviews and 0 complete requirements. Two partial route page checks are reported separately, not counted as two new programmes or completed parent checks.

Verification: 119 automated tests passed with zero skipped, including the existing Python parser check. Browser verification covered both route details, the return to an unresolved group, route-specific fees/dates, English copy, desktop and 390-pixel layout without page/dialog horizontal overflow, and no console warnings/errors. Existing background, candidate and comparison storage was not edited or cleared. The narrow viewport override was reset. Browser interaction is engineering verification, not a real participant test.

Limitations: both route snapshots are partial and unreviewed, so neither can issue a recommendation tier. Cryptography's 2027/28 tuition is deliberately unknown. Equivalence, language applicability/validity and complete admissions evidence still need checking. Other grouped routes remain unresolved. Route refresh/import/conflict editing is not implemented; the source file is read-only at runtime and reloaded on process restart.

No push, merge, PR, course submission or public deployment in this development pass. The already published Week 5 branch and main remain untouched.
