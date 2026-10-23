# Local CUHK / SUSS data maintenance — 23 October 2026

Actual AI-assisted engineering/data-maintenance log, not assessment text, team contribution attribution, independent review or user research.

## Completed

Kept the software feature freeze. Inspected the existing checked-record gaps, then refreshed two older pilot entries: CUHK MA Anthropology and SUSS Master of Management. The new observation file and linked research note record consulted official sources, access methods, exact facts, conflicts and decisions. No university-wide enumeration or completeness is claimed.

CUHK now has an explicit September 2027 cohort, the central commencement date and five date-only MA cutoffs. Stable FT/PT IDs remain. Full-time annual tuition is explicitly provisional; the separate application fee is not added into tuition. Conflicting part-time annual/two-year language leaves numeric PT tuition null. The application page's old heading remains documented, and academic alternatives, documents and English evidence remain manual.

SUSS now discloses regular/accelerated applicant restrictions and the structure-versus-FAQ duration conflict. The prior unqualified duration is replaced with a warning, not an invented preferred value. Recurring intakes do not become dated windows; other featured programmes' dates are not reused. Unsupported test alternatives, validity and graduation-GPA boundaries remain explicit. The official fee PDF was available as extracted text but could not be visually verified/downloaded locally; access restrictions were not bypassed and no numeric tuition was imported.

## Verification

- Added 10 targeted checks: source dates/review boundaries; stable IDs/cohorts; date-only rounds and next-cutoff transitions; provisional versus withheld fees; qualitative academic alternatives; SUSS unknown fields, pathway restrictions, duration conflict and unsupported-test/GPA boundaries; actual catalogue/detail APIs and candidate-export projections; no source mutation or quality promotion through reads.
- All 642 automated tests passed, none failed, cancelled or skipped. Targeted checks also passed independently. The existing Python/lxml research-parser environment was supplied for the full run.
- Updated two older snapshot assertions to distinguish the batch's latest observation date from each programme's own fixed evidence date. Their original NTU/NUS observations remain dated 22 October, not restamped to 23 October.
- Compared the checked-source JSON against the starting commit: only `HK-CUHK-P001` and `SG-SUSS-P001` differ; all 19 other programme objects and pilot IDs are unchanged. The batch date now records the latest actual observation.
- Data audit: 873 catalogue / 870 browsable / 21 programme-page checks / 0 independent human reviews / 0 complete requirement sets; no source-refresh conflicts. Frozen workbook SHA-256 is still `5DF32B82A7A1DDDBF5672BF59AC46AC3EB046D95E1EE580DE49A5C840FB47A0B`.
- Application UI/server code, launcher, route/applicant snapshots and default runtime database were not modified. Integration checks use temporary in-memory services that close through test teardown. No new browser/physical-device/production-host test is claimed for this data-only round.

## Publication recommendation

Local commit only; no push, deployment or Git-remote access. Keep main and historical checkpoint branches/worktrees unchanged. Consolidate at the 25 October review; that date is not automatic authority to publish, nor evidence of completed research. The remaining conflicts and real independent review are still outstanding.
