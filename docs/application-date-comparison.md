# Application date comparison

Implemented locally on 16 October 2026. This is an engineering rule specification, not an admissions-availability audit or course submission.

## Evidence and clock

The API compares stored, source-linked dates using the Asia/Singapore calendar (UTC+08, also used by Hong Kong). Every result includes its comparison date, per-offering source-check date and source URL. The source record and review state do not change. `livePortalChecked` is always false.

The runtime clock is injectable for automated boundary tests, not a client-controlled query. A manual refresh recalculates stored evidence; it never claims a fresh university-page check.

Updated locally on 21 October: API snapshots also carry a canonical UTC `asOfInstant`; the UI renders that time in UTC+08. Supplying a comparison date without an instant remains supported for date-only callers. Inconsistent dates/instants are rejected rather than mixed. The page is a refresh-time snapshot, not a ticking live clock.

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

## Optional structured rounds

An offering or independently sourced applicant option may carry up to 20 `applicationRounds`. Each has a unique ID, label, nullable opening date, dated deadline and nullable `deadlineAt`. An exact cutoff must include `+08:00`, match the same calendar date and use a valid recorded minute; missing times remain null, never 23:59. The existing final `deadline` must equal the latest round date for compatibility with old consumers. Prose notes are never parsed into round data.

Recorded rounds appear separately in details and comparison, while cards identify the next recorded cutoff. Each round inherits the exact offering/category evidence source and source date. Route, verification, intake, coverage and scope gates apply before comparison. Applicant-dependent rounds are masked until a valid category is chosen; an option without round evidence does not inherit baseline or sibling rounds. Round changes also invalidate offering fingerprints.

- `cutoff_ahead`: before a recorded cutoff with no confirmed opening date; not a claim that applications are open.
- `cutoff_reached`: comparison instant is at or after an explicitly recorded cutoff; no extension or application outcome is inferred.
- Without both an instant and recorded cutoff time, deadline day stays `deadline_today` and requires checking the cutoff. Existing dated-window states remain available when opening dates are recorded.

The earliest remaining recorded round is identified independently of source array order. After the main cutoff, the next recorded round may be the clearing round, but its opening/availability stays unconfirmed. After the last cutoff no new round is invented. The overall legacy date-only status remains separate, so an offering may show incomplete opening dates alongside precise per-round cutoff snapshots.

HKU ordinary CS is the first populated case, using the existing 21 October source reading. It does not add programme checks or re-date other sources. Candidate exports include rounds and the comparison instant; remembered browser choices still contain IDs and a save timestamp only, with current facts reloaded on reopening.

Limitations: no opening/cutoff is inferred from prose or from another category. Extensions, rolling closure and live availability are not checked. Source revalidation and independent review are still needed. No notifications, calendar events, automatic monitoring or scheduling are created.
