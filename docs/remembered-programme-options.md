# Explicitly remembered programme choices

Local implementation contract, 19 October 2026. No new university admissions research or independent review is claimed in this pass.

## User-controlled persistence

Shortlist/comparison programme IDs remain compatible with the existing v1 lists. Choosing a route, intake/study mode or university applicant category does **not** automatically save those choices. In programme details, first save or compare the programme, choose its options, and click **Remember these choices**. Wait for the saved confirmation before reloading. A changed current view requires **Update remembered choices**; merely browsing another option does not overwrite the remembered one.

The separate `gradpath.saved-options.v1` browser key contains a versioned array of at most 500 entries, each restricted to `programmeId`, `routeId`, `offeringId`, `applicantId` and an ISO save timestamp. No grades, language results, fees, deadlines, match decisions or source snapshots are stored there. Applicant-category selection can still be a personal preference: the UI discloses local storage and warns about shared devices. Background remembering is a separate opt-in and is not changed by this feature.

**Forget remembered choices** removes that selection without removing the programme from its lists or clearing the current temporary view. A subsequent reload does not restore it. Removing the programme from its last list prunes its attached remembered context. Invalid, duplicate, overlong, orphaned or unknown-version stored entries are ignored with a notice; existing valid programme lists are not rewritten during startup. Prototype keys and extra/private fields are not accepted.

## Resolve current data, not stored quotations

Startup sends only normalized, attached choice entries to `POST /api/saved-options/resolve`. The local server resolves each through the existing route, offering, category, source-fingerprint and date gates, then returns current facts with their original source dates. No matching profile is needed. Each result reports its input index and either a resolved current programme or a `needs_attention` error. Invalid records do not block valid records in the same batch. The endpoint is JSON-only, limited to 500 entries, body-size bounded, loopback-only and protected by the existing Origin check. It does not write to SQLite or request logs.

Invalid choices are never replaced automatically with the first route/intake/category. Their exact saved entry remains for user review. Cards/details/comparison explicitly warn that any unselected current record shown for review is **not** a substitute for the saved option. Saved-option matching results and match-status filtering are withheld until the user explicitly updates or forgets that entry. If the whole programme is unavailable, a removable placeholder preserves the rest of the list.

Selecting a replacement during review still does not overwrite the saved choice; the user must explicitly update it. A remaining single study option can be chosen during repair. Neither successful restoration nor explicit updating asserts admission eligibility, confirmed classification, independent review or a recommendation tier.

## Export and failure behavior

The browser's shared, tested `shortlistExport` helper exports current resolved programme facts and exact selection identities, without background or match decisions. Stale/unavailable entries go into a separate `unresolved` array, with requested option IDs and a reason but **no substitute fee/date facts**. `rememberedChoice` distinguishes an explicitly remembered selection from a different current temporary view.

Updated locally on 22 October: each resolved programme also includes `evidence`, containing its original `lastChecked`, `requirementsCoverage`, English notes, field-coverage cautions, dated source links and `publishedRequirements`. This keeps manual conditions and official-source discrepancies with the candidate file rather than exporting only fees/dates. The top-level `evidenceNotice` explains the limits. Export time and application-comparison time never replace source-read dates; applicant-category evidence retains its separate date.

Published requirements are included only for programme-page-checked or independently reviewed records. Catalogue/outdated/unconfirmed records export no draft admission rules and report unreviewed requirement coverage, without modifying the source record. Published criteria remain programme/route-level; selecting an intake, mode or applicant category does not establish applicability or complete eligibility. Partial coverage and unknown independent-review flags remain unchanged.

The evidence projection uses explicit fields for supported requirement kinds, language-test versions/components/date anchors, English manual notes and sources. It does not copy profile-specific checks, reasons, match statuses, tiers, staff/collector/reviewer metadata, unknown nested properties or Chinese labels. Newly projected arrays/objects are detached from the source. This is an allowlist for known programme-evidence fields, not a general detector of personal text incorrectly entered into a public source field. Existing choice/fee/date fields remain compatible. Unresolved selections receive no substitute evidence object. Browser persistence and the selection-resolution endpoint are unchanged; the larger evidence snapshot is in the downloaded JSON only, not remembered browser choices.

Saving is acknowledged only after the browser storage write succeeds. List and comparison UI changes likewise wait for a successful write. A transient server/network error during startup no longer clears the separately remembered background. Network errors remain retryable; they are not misreported as deleted programmes.

Deliberate limits: one remembered context per programme shared across shortlist/comparison, no multiple-variant duplicate rows, no cross-device sync/account, no background storage in the selection endpoint, no auto-update of saved preferences, and no source/portal revalidation merely from reopening. Another tab's changes are loaded on reload rather than live-synchronized.
