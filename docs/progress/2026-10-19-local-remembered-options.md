# Local explicitly remembered programme choices — 19 October 2026

Advanced local branch only; prepared with AI assistance for Song Shaoheng. No new admissions research, independent review, team contribution, participant feedback or backdated weekly history is claimed.

Added explicit browser-only remembering of programme route/intake/mode/category IDs, separate from both legacy shortlist/comparison IDs and optional academic-background storage. Merely selecting or bookmarking a programme does not opt into saving its choice context. Changed views require an explicit update; forgetting a remembered context leaves the programme and current temporary view intact. Source prices/dates and academic results are not stored in the preference record.

Startup now resolves saved IDs against current server records in a bounded per-item batch. Invalid choices remain for review, without automatic replacement. An unavailable record no longer breaks all saved programmes. Saved-option matching/filtering is withheld for unresolved entries. Candidate export uses a shared, directly tested helper: valid entries carry current selected facts, while stale/unavailable contexts are listed separately without substitute prices/dates or student background.

Additional safety: source/route trust remains server-owned; storage records reject unknown/private/prototype fields; browser writes must succeed before the UI claims success; restored selections never update source-check dates or create review/tier status. Temporary startup errors no longer clear a separately remembered background. Single remaining known study options can be explicitly selected during stale-choice repair.

Verification:

- 209 automated tests passed, zero skipped, including the existing optional Python parser test. The 22 new tests cover schema/privacy/bounds, legacy-ID compatibility, attached-record normalization, current source resolution, partial batch failures, route trust, removed-offering recovery, origin protection, recomputed dates and actual export-helper behavior.
- Browser QA on port 3106 with an in-memory database confirmed explicit save then reload, temporary category changes not overwriting saved choices, explicit update then reload, part-time choice restoration, forgetting then reload, and category/intake reset. Tests waited for saved confirmation before reloading.
- Removed one option only in that owned in-memory fixture using the test-only local admin path. On reload it produced a warning with an unselected review record, no saved-option match status, and a working comparison containing the other records. Selecting and explicitly saving the remaining full-time option repaired it. The original fixture was restored afterward.
- Desktop and 390-pixel dialog checks passed without page/dialog horizontal overflow; English text and the compact stacked mobile buttons were verified. No error-level console messages were observed. The viewport override was reset. Agent-created remembered contexts were forgotten through the QA UI, preserving the old QA list IDs; the temporary tab/server were closed.
- The normal port 3102 preview was refreshed without saving choices or editing its existing background/shortlist/comparison preferences. It remains available for the user. Export data shaping is tested directly; no additional browser download was performed in this pass.
- Syntax, whitespace and source-data checks passed. The original workbook SHA-256 remains `5DF32B82A7A1DDDBF5672BF59AC46AC3EB046D95E1EE580DE49A5C840FB47A0B`.

Unchanged admissions coverage: 551 parent records, 548 default-browsable, 21 checked parents, two route snapshots, two applicant categories for one study option, zero independent reviews and zero complete requirement sets. No GitHub push, main merge, public deployment or assessment-file modification/submission. Published weekly checkpoints are unchanged.
