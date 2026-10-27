# Local SUSS MAIB evidence — 27 October 2026

Continue bounded source maintenance on `feat/local-prototype`, after MHSc commit `2d5b36e`. AI-assisted internal implementation evidence only; no assessment text, fabricated participant contribution or independent human review. Feature freeze remains in place.

## Completed work

- Add first partial evidence to existing `SG-SUSS-P016`, retaining one MAIB parent with regular and accelerated choices. Keep inconsistent stackable award wording unresolved; do not duplicate clusters or certificate/diploma awards.
- Separate residence/pathway eligibility from nationality or study location. Leave FT/PT mode and programme-specific intake/year/dates unknown. University-wide calendars are observations, not confirmed MAIB windows.
- Preserve conditional English applicability and alternative scores without an unconditional rejection rule or TOEFL conversion. Graduate CGPA concerns graduation, while volunteer experience is a preference. CV and individual assessment do not become verified documents.
- Retain dated/category tuition information and conditional subsidy explanations. No personally applicable tuition, fee category or discount is assigned. Credited acceptance deposit is not added twice. PDF was text-readable; download returned 403 and no visual check is claimed.
- See [source reasoning and limits](../research/suss-maib-first-check-2026-10-27.md), [new maintenance snapshot](../research/source-review-queue-2026-10-27-suss-maib.md) and [core comparison snapshot](../research/core-pilot-acceptance-2026-10-27-suss-maib.md).

## Verification and preservation

- Full suite: **845 tests passed**, zero failures, skipped or cancelled. Ten new tests cover identity, pathways/residence, award-versus-entry conditions, conditional ELPR, preferences/documents, category fees/deposit, unknown dates, archive preservation, isolated restart migration and actual API/save/export behaviour. After correcting the synthetic final-year input, all ten relevant tests passed again.
- Data checker: 873 catalogue / 870 default browsable / 33 partial observations / zero independent reviews / zero complete requirement sets; no source-refresh conflicts. Five routes and eighteen fee/date contexts with thirty-eight categories remain distinct. Maintenance has 56 units, not 56 programmes.
- All 32 previous checked objects and twenty pilot IDs remain deeply equal to the preceding commit. Seven other source layers, 88 earlier research files and the original workbook are unchanged; new research links resolve.
- Core twenty-programme comparison still has 497 synthetic comparisons and zero consistency violations. Their source spot-check dates remain 25 October; regenerating a report does not refresh those sources.
- Daily local database not opened. Migration/API checks use isolated temporary or in-memory stores. No server/public feature code changes, real-user study, physical-device check, production-host check or deployment is claimed.

## Publication decision

Save a real-date local commit only. **Recommendation: no push now**; group source increments into a later weekly checkpoint after the W6 publication. Main and all existing checkpoint refs, including `checkpoint/week-06`, are unchanged. No remote Git access or desktop/assessment-document edits.
