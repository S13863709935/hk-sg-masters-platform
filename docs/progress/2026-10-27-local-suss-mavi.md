# Local SUSS MAVI evidence — 27 October 2026

Continue bounded source maintenance on `feat/local-prototype`, after MAIB commit `7ec4fda`. AI-assisted internal implementation evidence only, not assessment text, participant research or independent human review. Feature freeze remains in place.

## Completed work

- Add first partial evidence to existing `SG-SUSS-P015`, preserving one English MAVI parent with two Singapore-attendance choices. Chinese MSDAV, MAIB, certificates and diplomas remain separate.
- Preserve overseas physical-attendance versus entirely remote commitments, legal-residence uncertainty, hybrid delivery, mandatory attendance and conditional accelerated extension. Remote enrolment cannot be treated as a selectable Singapore-attendance option or a later entitlement to physical study. Chinese FT/PT labels are not copied.
- Keep recurring January/July months visible without assigning general university dates to a particular track/cohort. Exact year/opening/deadline and personally applicable fees remain unresolved.
- Retain CV and track-interview requirements; referee contact and internship are optional. Applied project is coursework, while CGPA 3.0 is an award condition. Conditional ELPR and waiver applicability do not become unconditional score gates.
- Distinguish MAVI's conditional subsidy row from MAIB and retain tax/category/deposit boundaries. Relevant brochure text only was consulted; download returned 403 and visual inspection is not claimed. Directory failure does not refresh its earlier observation.
- See [sources and limits](../research/suss-mavi-first-check-2026-10-27.md), [new maintenance snapshot](../research/source-review-queue-2026-10-27-suss-mavi.md) and [core comparison snapshot](../research/core-pilot-acceptance-2026-10-27-suss-mavi.md).

## Verification and preservation

- **855 full-suite tests passed**, zero failures, cancelled or skipped. Ten new tests cover identity, attendance/pathway restrictions, award-versus-entry conditions, optional evidence, conditional English, fee-row separation, dates, archives, restart migration and actual API/save/export behaviour. A new export test initially read the wrong field; it now checks the existing `evidence.notesEn` contract, and the entire suite passes without changing product code.
- Data audit: 873 catalogue / 870 default browsable / 34 partial observations / zero independent reviews / zero complete requirement sets; no source-refresh conflicts. Five routes and eighteen applicant contexts/thirty-eight categories remain separate. Maintenance has 57 units, not 57 programmes.
- All 33 previous checked objects, twenty pilot IDs, seven source layers, 92 older research files and original workbook are unchanged. New relative document links resolve. Same-day snapshots are retained using the `suss-mavi` suffix.
- Core twenty-programme comparison remains 497 synthetic comparisons with zero consistency violations. Original source dates and 25 October spot-check observations are preserved; the report comparison date does not refresh them.
- Daily database not opened; tests use temporary/in-memory stores. No server/public code change, browser-layout recheck, physical-device test, production deployment or actual-user acceptance is claimed.

## Publication decision

Save a real-date local commit only. **Recommendation: no push now**; consolidate meaningful data increments into a later weekly checkpoint. Main and all existing checkpoints, including `checkpoint/week-06`, remain unchanged. No remote Git operation, desktop-document edit, assessment submission or invented teammate contribution.
