# Local shortlist evidence export — 22 October 2026

Actual AI-assisted development log, not assessment prose, team attribution, user research or independent admissions review.

## Completed

Candidate export previously retained choices, fees and dates but omitted the associated published conditions, coverage gaps and English programme cautions. In particular, source discrepancies recorded during recent refreshes could disappear when a user took the candidate list outside the website.

Resolved programme exports now add an `evidence` object with original source dates, requirements coverage, field-status notes, dated sources, English programme notes and published requirements. A static notice separates source reading from export/comparison time and explains that this is not a complete admissions assessment. Shortlist help and success messages disclose inclusion of published conditions and exclusion of background/matching results.

The projection includes only explicit supported public-evidence fields; it excludes profile-specific results/reasons, grades entered by a student, prediction tiers, staff metadata and unknown nested keys. It preserves optional versus mandatory conditions and recorded language-scale/component/date rules. New evidence arrays/objects are detached from source objects. This is not a general personal-data scanner for mislabelled text. Draft rules from catalogue/outdated/unconfirmed records are withheld as unreviewed. Stale or unavailable saved choices remain in `unresolved`, without substitute programme evidence. Existing selected-route/intake/category identities, fees, dates, scope cautions and asynchronous export guards are retained.

No source record, admission rule, verification state, persistence schema, server endpoint or dependency changed. No official website was rechecked in this pass; automated cases exercise existing source snapshots.

## Verification

526 automated tests passed, none failed or skipped. Sixteen new tests cover public/manual evidence, all supported rule kinds, score-scale/component/date details, unverified-rule suppression, missing evidence, privacy/metadata allowlisting, malformed/prototype-like values, detached copies and unresolved saved choices. API-backed cases cover Finance's July discrepancy, General Track's test discrepancy, NTU's unresolved fees/opening and older source clock, EdUHK parent/category/date clocks, HKU selected-route cross-region cautions and matched API output without profile-specific results. Existing lifecycle tests still cover stale requests, duplicate export activation, current-context changes, failures, cleanup and conditional focus restoration.

Browser QA used a separate in-memory preview on loopback port 3111. It began with an empty shortlist. One temporary Finance record was added and exported without entering a background, choosing an applicant category or remembering any choice. The English notice and success status show one programme and zero unresolved selections, with evidence inclusion and privacy limits. The button re-enabled and retained focus. The browser confirmed download initiation, not file bytes on disk; payload contents were verified through the automated helper/API and Blob-adapter tests. An initial status-text wait did not match, but a fresh UI snapshot confirmed success; the export was not retried. No warnings/errors appeared in the inspected browser log and no horizontal page overflow was found.

The sole temporary shortlist entry was removed through the interface, restoring zero; no user-created entry existed at the start of this test origin. No background was entered or remembered, no comparison entry was added and no university application was submitted. Agent-created tab and temporary preview were closed. Screenshot outside Git: parent-workspace `work/gradpath-shortlist-evidence-2026-10-22.png`, before temporary-entry cleanup.

Data remains 873 catalogue / 870 visible / 21 parent page checks / 0 independent human reviews / 0 complete requirement sets, with no source-refresh conflicts. The frozen seed-workbook hash is unchanged (`5DF32B82A7A1DDDBF5672BF59AC46AC3EB046D95E1EE580DE49A5C840FB47A0B`). No tracked data/research files changed.

## Publication recommendation

No push or deployment. Consolidate this usability/data-integrity fix with preceding local work for the 25 October stage review, which is not automatic authority to publish. Save a real-date local commit only; preserve main and historical publication branches/worktrees, desktop files and course submissions.
