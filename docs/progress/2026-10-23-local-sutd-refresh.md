# Local SUTD data maintenance — 23 October 2026

Actual AI-assisted engineering/data-maintenance record, not assessment material, independent human review, user research or attribution of contributions to teammates.

## Completed

Kept the software feature freeze. Revisited the existing MArch and Human-Centred AI for Venture Innovation pilot entries using official SUTD HTML sources. Added a structured observation file and source/decision note. No university-wide re-enumeration or new programme count is claimed.

MArch now records its explicit 2027 opening date and correctly describes the two-year pathway's preliminary undergraduate terms. Old-year tuition, subsidy discrepancies, language thresholds, accreditation and selection remain qualified or unknown rather than inferred. Referee/GRE optionality and supporting-score timing are distinct from the application deadline.

For Human-Centred AI, recorded the current 2027 application-closed announcement and removed the previous future cutoff from active comparison. Retained only the currently supported intake year, without inventing a closing date, start month or reopening. The existing date result is `dates_incomplete` with an explicit notice, not a new machine-readable closed state. Historical fee-year/category evidence does not supply a default current tuition; the published separate application fee is retained. No unsupported applicant context or relaxed validator was introduced.

## Verification

- Added 12 targeted tests covering source dates and review boundaries; MArch window transitions, pathway/fee-year limits, major and manual conditions, optional versus required documents/referees; MTD closure/no inferred dates, category fee withholding, application fee and credited acceptance payment, application-time English validity, unknown new TOEFL score, and unrelated-degree judgement.
- Targeted tests passed independently. All 666 automated tests then passed, with none failed, cancelled or skipped, using the existing Node 24 and research Python/lxml environment. Existing tests were not weakened or changed.
- Real catalogue/detail/matching/saved-choice/export endpoints were checked through an owned temporary in-memory service. Candidate exports retain closure/unknown-field evidence and omit student background and matching decisions. Saved choices reload current null deadline/tuition instead of restoring old facts.
- Compared against starting commit `547622d`: only `SG-SUTD-P001` and `SG-SUTD-P002` differ in the checked programme array. All 19 other programme objects, route/applicant snapshots and historical scope/directory evidence remain unchanged.
- In-memory audit remains 873 catalogue / 870 browsable / 21 programme-page checks / 0 independent human reviews / 0 complete requirement sets, with no source-refresh conflicts. Separate context coverage remains 10 study options / 20 categories. Frozen workbook SHA-256 remains `5DF32B82A7A1DDDBF5672BF59AC46AC3EB046D95E1EE580DE49A5C840FB47A0B`.
- Application UI/server code, launcher and daily runtime database were not modified. Test services close through teardown. No new browser, real-device or production-host verification is claimed for this data-only round.

## Publication recommendation

Local commit only: no push, deployment, Git-remote access or changes to main/historical checkpoint branches and publication worktrees. Recommend consolidating the evidence and remaining gaps at the 25 October review; this date is not automatic publication authority. Human confirmation, independent review and broader data completion remain outstanding.
