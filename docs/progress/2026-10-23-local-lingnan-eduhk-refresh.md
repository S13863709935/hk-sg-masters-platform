# Local Lingnan / EdUHK data maintenance — 23 October 2026

Actual AI-assisted engineering/data-maintenance record, not assessment text, independent review, user research or attribution of contributions to teammates.

Final local save and regression recheck completed on 24 October. The official-source observation dates remain 23 October; saving later is not a new source reading.

## Completed

Kept the software feature freeze. Re-read official sources for existing Lingnan IHEM and EdUHK MPPM, recording facts/decisions in a new observation and research note. No university-wide re-enumeration or new parent programme is claimed.

Lingnan gains its explicit opening, separate application fee, FT/weekend-format boundary and submission-based IELTS/TOEFL/CET alternatives. Graduation GPAs and qualitative attainment do not become entry cutoffs. EdUHK January retains its published category values with actually refreshed evidence/fingerprint and no raw non-local default. September is separately bound to the existing category selector, with its own fees, central opening and three date-only cutoffs. Unknown dates/times, language-anchor applicability, academic equivalence and applicant classification remain qualified/manual.

## Verification

- Added 12 targeted tests covering actual dates/review limits/stable IDs; Lingnan window/fee arithmetic, graduation GPAs, formats and language alternatives; EdUHK January values, September fee/round differences and transitions, unselected/cross-intake/stale rejection, cohort-language caveats and manual documentary checks.
- All 12 targeted tests passed independently; all 690 automated tests passed in the complete suite, none failed, cancelled or skipped, using the existing Node 24 and research Python/lxml environment.
- Real catalogue/detail/matching/saved-choice and candidate-export paths were exercised through an owned temporary in-memory service. Selected views and exports preserve exact intake/category fees, cutoffs and source dates; candidate exports omit background and matching decisions. Test teardown closes the service.
- Updated active source-date/count expectations to reflect the real EdUHK re-reading and added September context. The separate synthetic older-academic-date case still tests that contextual projection cannot restamp academic evidence. Date-coverage/JSON trust, stale-source, schema rejection and deep preservation checks remain intact; production validators were not weakened.
- Compared against starting commit `add79a9`: only `HK-LU-P001` and `HK-EDUHK-P001` differ among checked programme objects; all 19 others and pilot IDs remain unchanged. Nine non-EdUHK contextual objects are unchanged. January's category option objects retain the same values; only its context binding/date/note refresh, and one September context is appended.
- In-memory audit remains 873 catalogue / 870 browsable / 21 programme-page checks / 0 independent human reviews / 0 complete requirement sets, with no source-refresh conflicts. Separate applicant coverage is now 11 study options / 22 categories. Frozen workbook SHA-256 remains `5DF32B82A7A1DDDBF5672BF59AC46AC3EB046D95E1EE580DE49A5C840FB47A0B`.
- Application UI/server code, launcher, route/scope/directory snapshots and daily runtime database were not modified. No new browser, physical-device or production-host verification is claimed for this data-only round. Current docs use the new counts; historical progress logs keep their original counts/dates.

## Next work and publication

Older pilot work still includes HKUST and SIT records. After those, expand detailed coverage beyond the pilot; do not mistake catalogue size or passing test counts for completed source verification. Real independent human review remains outstanding.

Local commit only: no push, deployment, Git-remote access or changes to main/historical checkpoint branches and publication worktrees. Recommend consolidation at the 25 October review, not automatic publication.
