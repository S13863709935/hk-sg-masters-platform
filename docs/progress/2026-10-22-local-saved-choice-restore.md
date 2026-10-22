# Local saved-choice restore validation — 22 October 2026

Actual AI-assisted engineering log, not assessment text, team-work attribution, independent admissions review or user research.

## Completed

Saved-choice startup restoration previously consumed rows as they arrived in a reply without proving that every requested context had one matching response. An omitted row could therefore leave an original choice unrepresented; a later malformed row could throw after earlier rows had already changed live selections. Repeated restoration also left old selectors or issue markers in place when a context became unavailable or valid again.

Added a pure whole-reply validator in the existing browser helper. It requires a complete set of unique, in-range integer indices, exact programme identities and recognised statuses. Resolved programme/route/offering/applicant IDs must match the user's remembered context exactly. An explicit needs-attention row must include a bounded nonempty reason. A baseline response is accepted only when no specific option was remembered. Reordered rows are supported through their validated indices. Invalid replies fail before live maps are changed.

The actual restore workflow snapshots remembered entries and live choices before requesting resolution. A changed snapshot discards the reply instead of undoing a user action. After full validation, it replaces only those contexts' selection/issue entries together, clearing obsolete IDs or issue markers while preserving unrelated temporary choices. It does not write storage or change background data, saved membership, university facts or admissions rules. Only explicit choice IDs and issue reasons enter the restore plan, not prices or matching claims from the reply.

Choice-service/network failures, invalid replies and changed snapshots now use a specific fixed English startup prompt. It explains that lists/remembered choices are unchanged and no substitute programmes, fees or matching results are being shown, with the existing Try again action. Backend error details are not reflected. Matching-only startup recovery from the preceding change remains separate: unverifiable programme choices still block startup rather than silently using defaults.

## Verification

630 automated tests passed, none failed or skipped (13 additional cases). Tests exercise complete/reordered and missing/extra/duplicate/mismatched replies; exact route/cohort/applicant matching; malformed requested contexts and reasons; baseline-selection boundaries; no private/fact copying; actual restore atomicity; network failures; repeated restoration and clearing of stale selectors/issues; in-flight saved/live choice changes; empty contexts; real local API resolution of category and route selections; and the specific startup recovery prompt without backend details. Existing background, catalogue, matching, privacy, source and export suites pass.

Browser QA used a separate loopback origin on port 3115 with an in-memory database. A disposable wrapper around the real app returned an intentionally incomplete HTTP-200 restore reply (`items: []`) on the first restore only, without reading/logging request bodies or modifying university records. Through the UI, the HKUST P002 Part-time option was selected, its programme saved and the choice explicitly remembered. Reload then received the incomplete reply and stopped without programme cards, detail dialog, substitute fee or matching result.

The initial browser pass exposed a generic startup message, which was refined before final-code verification. With the final code, the incomplete reply displayed the specific saved-choice verification prompt. Try again then loaded the real complete response and restored the original 2026/27 Part-time option. The remembered-choice state remained confirmed; only its recorded HKD 230,000 fee was present in the detail, not the recorded full-time HKD 270,000 fee. These are existing stored-source values used for functional QA, not newly checked fees or current application advice.

The test choice was explicitly forgotten and the test programme removed from the shortlist, followed by a successful reload with zero shortlist, no comparison selections, no remembered contexts and no background entered. Inspected browser warning/error logs were empty. The tab, both successive test-service instances and disposable wrapper were cleaned up. Screenshots outside Git in the parent workspace: `work/gradpath-saved-choice-safe-stop-2026-10-22.png` (simulated incomplete reply) and `work/gradpath-saved-choice-restored-2026-10-22.png` (successful retry).

Data audit remains 873 catalogue / 870 browsable / 21 programme-page checks / 0 independent human reviews / 0 complete requirement sets, with no source-refresh conflicts. Frozen workbook SHA-256 remains `5DF32B82A7A1DDDBF5672BF59AC46AC3EB046D95E1EE580DE49A5C840FB47A0B`. No university source was rechecked or programme data changed.

## Publication recommendation

Local commit only, no push or deployment. Review with preceding local changes at the 25 October stage review; that review is not automatic publication authority. Main, historical checkpoint branches/worktrees, desktop documents and course submissions remain untouched.
