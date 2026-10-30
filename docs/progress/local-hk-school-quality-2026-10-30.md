# Hong Kong existing-record school batch

Date: 2026-10-30. Internal development/data-maintenance evidence, not course submission material.

## Completed scope

The batch covers the 15 existing partial Hong Kong observations across eight schools: 14 direct-application candidates and one legacy transfer-only reference. Programme identities and selected qualification, language and date sections were checked against official text. Some responses were cached. It is not a fresh full review of every requirement or a complete enumeration of currently offered courses.

The region has 595 local catalogue records; 580 remain catalogue leads. No new programme, complete requirements record, independent review, probability or recommendation tier was created.

## Data clarification

HKBU MA Communication, HKBU MSc Business Management and EdUHK MPPM previously had unresolved collection wording for the undergraduate-major field. The consulted official sections state degree/qualification recognition without publishing a universal named undergraduate-subject restriction. Those three field statuses now read **not_published** with the consulted scope explained. They do not establish that every subject is acceptable. Academic recognition, honours/equivalence and selection remain unresolved where applicable; no automatic major rule or GPA cutoff was introduced.

Only the relevant consulted source dates advance to 30 October. Other source dates, original intake/fee evidence, applicant-category observations and all admissions rules remain unchanged. The three records keep partial coverage and no independent reviewer. Existing category bindings remain valid because the study-option objects were not changed.

## Confirmed boundaries and unresolved sources

- CUHK Anthropology: the central taught-programme deadline list retains its five monthly rounds, including 31 October 2026. These must not be confused with the neighbouring PhD deadlines. The two departmental pages timed out; their older 24 October observations remain dated, with no claim of a fresh FAQ check or an outage at the university.
- HKUST CIEM: the catalogue and engineering page retain 1 November 2026 for February 2027 part-time entry. September category-dependent rounds remain separate. No exact cutoff time or live portal availability is inferred.
- HKUST MEng DISC: the old source explicitly limits it to existing MSc students and excludes new admission. It remains an archive/transfer reference, not another direct-application option to fill with generic thresholds.
- EdUHK ADS: science/engineering backgrounds are preferred. Putonghua is the principal teaching language, with English supplementation. The central Chinese-medium branch defers to programme-specific requirements; the English-medium numerical thresholds cannot establish this record's language eligibility.
- HKU Urban Analytics: the already structured January 2027 noon GMT+8 cutoff and its instant comparison are preserved. No opening date or extension was added.
- CityU, Lingnan and PolyU: the consulted current sections did not justify changing the existing numeric rules or dates. Qualitative equivalence, original-scale test policies and fee/category conditions retain their existing limits.

The [Hong Kong quality table](../research/hk-existing-records-quality-2026-10-30.md) shows every reported row and the [source observation](../../data/research/hk-existing-records-observation-2026-10-30.json) records the scoped findings and retrieval failures. Among the 14 direct candidates, remaining unresolved tracked fields are: major two, language one, tuition one, deadline one and independent review 14. Zero missing GPA fields means the consulted sources have no established universal numeric GPA cutoff; it does not mean a zero requirement or personal eligibility.

## Reusable maintenance workflow

`school-quality.mjs` now accepts `--records checked`. The report retains the full local school catalogue count while showing only existing page-checked rows. Archive-only rows are separated from active field-gap priorities. Omitting the flag keeps the previous full-school behaviour, including exact reproduction of the earlier SMU report.

Example: `node scripts/school-quality.mjs --school HK-HKBU --as-of 2026-10-30 --records checked --format markdown`.

## Verification and preservation

- Full suite: **1,166 passed**, zero failed/cancelled/skipped. These are software and evidence consistency checks, not real student feedback or admissions approval.
- Core acceptance remains 20 project IDs, 71 selection variants and seven synthetic backgrounds: 497 cases, 125 known gaps, 372 unresolved, zero fully met and zero violations.
- Global data remains 873 records / 870 browsable / 73 partial observations / 800 leads; routes four groups / 11 snapshots; applicant contexts 18 / categories 38; maintenance units 102, including two imminent-cutoff units. No stale applicant contexts are introduced.
- Older tests that fixed a live record to its first collection date now distinguish its later scoped check from older category/fee evidence. Historical observation and report files are retained, including the earlier same-day SMU snapshots.
- The other 70 checked programme objects, all 73 rule sets and study-option arrays, original 20 pilot IDs, original workbook and seven other source layers are preserved. Tests use memory/temporary stores; the daily database is untouched.

## Next school and publication

Proceed with CityU as a school-sized batch: reconcile identities and collect core information for previously unreviewed catalogue leads. Continue to distinguish unpublished criteria, missing extraction and university judgement; remaining qualitative conditions are not filled with guessed thresholds.

Save this batch locally. Recommendation: **no additional push now**; maintain the agreed weekly/stage publication cadence. The current Week 6 published checkpoint and prior branches remain unchanged. A local commit is not a public deployment or a course submission.
