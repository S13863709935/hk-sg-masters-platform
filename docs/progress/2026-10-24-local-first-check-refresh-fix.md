# First programme-check source refresh repair

24 October 2026. Maintenance fix to the frozen local prototype, not a new feature, deployment or daily-database migration.

## Reproduced failure

Isolated file-backed tests reproduced two problems before the first beyond-pilot expansion:

1. An unchanged catalogue seed or directory-expansion lead could be rejected on its first official-page check after directory/scope metadata had been attached. The latest log reason no longer identified initial creation, even though the admission fields were untouched.
2. A conflicting first check with no prior per-record fingerprint could disappear from the conflict list on restart because it was treated as a legacy fingerprint migration. The user's manual data was preserved, but the pending source reconciliation was no longer visible.

## Repair and safety limits

Use the recorded initial catalogue or unreviewed expansion document as the fallback admission baseline, after prior checked-source fingerprints/history. Compare the current non-directory/non-scope record to that exact baseline, not merely a status label. Preserve directory and scope metadata. Do not treat an explicitly pending conflict as a legacy migration.

Tests confirm untouched leads upgrade across restarts; manual admission edits and independent review remain protected; unresolved conflicts persist; explicitly restoring an untouched baseline permits that pending update without silently changing another reviewed record. No production validator, matching rule or eligibility threshold is relaxed.

## Verification

Full bundled-Node suite: **706 passed**, zero failed/cancelled/skipped, including three added file-backed regressions. Test databases and synthetic source files were temporary and removed by test teardown. The user's running/daily database was not opened or changed. Programme source files, quality counts, frozen workbook, main and checkpoints are unchanged by this fix. Local save only; no push or deployment.
