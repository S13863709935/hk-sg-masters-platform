# Local CityU refresh — 20 October 2026

Local implementation and verification record, not assessment submission text. AI-assisted work with Song Shaoheng; no teammate work, independent human review or student-research results are asserted.

## Completed locally

- Refreshed only `HK-CITYU-P010` (Computer Science) and `HK-CITYU-P004` (Applied Economics) against the official sources listed in `docs/research/cityu-refresh-2026-10-20.md`.
- Kept parent and study-option identities. Added explicit local/non-local fee contexts for both Computer Science modes, with no assumed category. Minimum-credit calculations are visibly labelled estimates, not fixed all-in quotations. An unknown application fee stays null.
- Added the published inclusive IELTS/TOEFL test-date floor with its source. Tests before the floor fail that recorded condition; the floor itself is accepted. This does not create a rolling expiry from the current day or override TOEFL version checks, waivers or unresolved requirements.
- Preserved individual evidence dates, stale-source protection and same-university official-source validation. The EdUHK context remains checked on 19 October.
- Included the previously agreed publication-policy clarification: continuing development does not mean pushing. No extra push before the 25 October review without a new explicit request; that review is not an automatic push instruction.

## Verification

- 243 automated tests passed, zero failed/skipped, including 16 new CityU regression tests. The final complete run required local-loopback permission; the restricted attempt encountered a localhost permission error, not an assertion failure.
- Data validation passed: 551 parent records, 548 browsable, 21 programme-page checked, zero independently reviewed or complete. Three study-option category contexts contain six categories; these are not extra programmes. No source-refresh conflicts.
- Compared the checked batch with the preceding local commit: only the two CityU programme records differ; the record count is unchanged.
- Syntax checks passed for the changed UI and server modules; `git diff --check` passed.
- Original workbook SHA-256 unchanged: `5DF32B82A7A1DDDBF5672BF59AC46AC3EB046D95E1EE580DE49A5C840FB47A0B`.
- Browser checks on an owned temporary in-memory server: full-time local/non-local fees, part-time fee context, category reset and fee masking on mode changes, published Economics total, rolling-closure caveats and the linked test-date explanation. No student background was entered or remembered. Date-boundary matching was verified by automated tests, not an asserted human usability study.
- Desktop width 1280 and mobile width 390 had no page/dialog horizontal overflow. No browser warnings/errors were observed. Screenshots are saved outside the repository under `work/gradpath-cityu-fees-2026-10-20.png` and `work/gradpath-cityu-mobile-2026-10-20.png`.

## Still pending

Independent human review, genuine user testing, unresolved waiver/interview and other admissions conditions, and remaining catalogue enumeration/detail work. Recorded dates do not confirm live application-portal availability. No admission probabilities, guarantees or recommendation tiers were enabled.

This batch remains local. No push, pull request, remote branch update or publication-worktree edit was performed.
