# Application date comparison

Implemented locally on 16 October 2026. This is an engineering rule specification, not an admissions-availability audit or course submission.

## Evidence and clock

The API compares stored, source-linked dates using the Asia/Singapore calendar (UTC+08, also used by Hong Kong). Every result includes its comparison date, per-offering source-check date and source URL. The source record and review state do not change. `livePortalChecked` is always false.

The runtime clock is injectable for automated boundary tests, not a client-controlled query. A manual refresh recalculates stored evidence; it never claims a fresh university-page check.

## Rules

| State | Meaning |
| --- | --- |
| not_yet_open | Before an explicit recorded opening date; future portal access is not verified |
| within_recorded_dates | Between explicitly dated boundaries for an identified intake; rolling closure, capacity and the live portal remain unverified |
| deadline_today | Date matches the recorded deadline; no assumption about a 23:59 cutoff |
| deadline_passed | After the recorded deadline; check official extensions or another intake; not an academic failure |
| dates_incomplete | Missing boundary/year, recurring notes, or an explicit unresolved date-coverage flag |
| invalid_dates | Invalid/reversed stored dates require reconciliation |
| mixed | Offering states differ; inspect each mode/intake rather than calling the whole programme open |
| route_required | Grouped catalogue directions have not been explicitly resolved |
| unverified | Catalogue-only/outdated evidence or a direct admission route has not been established |
| excluded | Research/scope or transfer-only exclusion, not a student-background gap |

A future deadline alone never implies opening. A past opening alone never establishes continued availability. Source-checked bare years, academic-year ranges and explicit full-month/year intake labels are recognised; a year embedded in an unconfirmed description is not. No year is inferred from recurring months.

## Independence from academic checking

Date status is a separate response object, not a requirement rule or recommendation tier. Advancing the test clock from inside a recorded window to after its deadline leaves the academic check object unchanged. A date-based warning uses a neutral/amber presentation, not an academic fail mark.

Explicit route choices apply before catalogue filtering, so cards without a background use the same selected direction as details and comparison. Query input is bounded and validated; unknown/cross-programme routes are rejected. Only public programme-route IDs are sent, not background information. They are not copied into browser-history URLs.

Raw catalogue export remains source data. Candidate export includes the calculated comparison context and selected route identity but no student background. Original record counts, sources, review states and frozen research files remain unchanged.

Limitations: exact cutoff times, applicant categories, rolling rounds, extensions and portal availability are not inferred. Source revalidation and independent review are still needed. No automatic monitoring or scheduling was introduced.
