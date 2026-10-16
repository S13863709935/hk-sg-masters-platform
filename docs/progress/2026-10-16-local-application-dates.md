# Local application-date comparison — 16 October 2026

Development on `feat/local-prototype` only. Prepared with AI assistance for Song Shaoheng. No additional university research, independent review, teammate contribution or participant feedback is claimed in this pass.

- Added source-aware date comparisons separate from academic checks. Cards, per-offering details, comparison and candidate export retain both comparison and original source dates.
- Added explicit missing/year/recurring-date, route, scope and deadline-day gates. A future deadline alone cannot label an application window open. A recorded in-range result never claims live portal access.
- Added manual comparison refresh without source revalidation or persistence. Invalid opening dates/reversed windows are rejected by import validation.
- Fixed no-background route consistency: catalogue filtering/cards now resolve the same explicit direction as details and comparison. Query selections are bounded and checked; background is not added to query/history URLs.

Verification: 145 automated tests passed, zero skipped, including the optional existing Python parser check. Tests cover UTC+08 midnight, exact date boundaries, incomplete/conflicting windows, unverified/outdated records, mixed intakes, source preservation, academic-result invariance, route trust and query validation.

Browser verification used a separate loopback port and in-memory database for comparison choices, without modifying existing background/candidate/comparison storage on the normal preview origin. Confirmed: route-required to selected-route date display; manual refresh preserving source dates; no-background route/card/subject-filter synchronisation; a comparison row distinct from the academic row; desktop and 390-pixel detail/comparison layout with no page-wide overflow; comparison-table overflow stays local; English text and no console warning/error logs. The viewport override was reset. These are engineering checks, not user-study results.

The original workbook, all 551 parent records, 21 checked parent programmes, two route snapshots, 0 independent reviews and 0 complete requirements are preserved. No push, PR, main merge, public deployment or course submission. The Week 5 checkpoint is unchanged.
