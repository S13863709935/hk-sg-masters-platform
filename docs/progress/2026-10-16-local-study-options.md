# Local study-option selection — 16 October 2026

Advanced local branch only, prepared with AI assistance for Song Shaoheng. No invented weekly history, teammate contribution, new university-source research, independent review or participant research.

Implemented explicit intake/study-mode selection, shared by catalogue, details, background checks, comparison, shortlist and export. Switching routes resets the dependent option. Choices remain temporary; clearing the selection or reloading restores all recorded options. Unknown/foreign/stale options are rejected. Selecting an option never verifies intake-specific requirements or applicant category.

Verification:

- 164 automated tests passed, zero skipped, with the existing optional Python parser test enabled. The 19 new tests cover option/year/fee isolation, category notes, route trust, invalid and bounded queries, matching context, unresolved-date gates and source/export preservation.
- Browser checks used a separate loopback port and in-memory database for comparison/shortlist changes. Confirmed EdUHK September 2027 at HKD 208,000; January's distinct fee and local/non-local notes; HKUST part-time at HKD 230,000 and full-time at HKD 270,000; clear-selection restoration; and NTU route changes clearing old options without sibling-route tuition leakage.
- Downloaded and read an actual candidate export: it contains the selected September offering and its date/source context, not student background. The browser's download notification was unusually slow; no subsequent download was needed.
- Checked comparison choices, reload reset, English dialog text and 390-pixel mobile detail/compare layout. No page-wide or dialog horizontal overflow; wide comparison-table scrolling remains local. No error-level console entries on the isolated QA tab. The viewport override was reset and the disposable tab/server closed.
- Reloaded the normal preview and checked selection against its existing remembered background. Background, shortlist and comparison storage on that origin were not edited; the new intake/mode-applicability warning remains unresolved. Preview kept at `http://127.0.0.1:3102`.
- Source-data checks, syntax checks and whitespace checks passed. The original workbook hash remains `5DF32B82A7A1DDDBF5672BF59AC46AC3EB046D95E1EE580DE49A5C840FB47A0B`. No tracked admissions data was changed.

The dataset remains 551 parent records, 548 default-browsable records, 21 checked parent records, two separately checked route snapshots, zero independent reviews and zero complete requirement sets. No GitHub push, main merge, public deployment or assessment submission. Published weekly checkpoints are unchanged.
