# Local source-review preparation - 24 October 2026

Continues the agreed data-quality work under software feature freeze. This is an internal source-data worklist, not assessment content, fabricated research, a new website feature or completed human review.

## Work completed

- Added a read-only source-review CLI with an explicit comparison date and deterministic JSON/Markdown output.
- Saved a reproducible [human worklist](../research/source-review-queue-2026-10-24.md): 27 programme records, five route records and 17 exact fee/date contexts, containing 36 category options. The 49 review units are not 49 programmes. The older transfer-only record stays archive-only.
- Preserved source-read dates, unknown/not-published distinctions, manual conditions, named routes and separate cohort/mode/category evidence. No reviewer, signature, completion date or teammate contribution is filled in.
- Bound every category context to the exact source identity and offering fingerprint. Stale or post-snapshot contexts cannot expose usable numeric prices or cutoffs; their old fee prose is explicitly separated for reconciliation. Unknown intake years, unresolved routes and scope/transfer exclusions do not become imminent-cutoff recommendations.
- A fourteen-day cutoff view prioritises recorded evidence for checking, not application availability. No notifications, live checks, eligibility claims or new matching tiers are introduced.
- Retried the two existing NUS DSML fee links read-only. Web text still exposes the fee schedules, but direct HTTP responses contain the site's security-validation page and screenshot output provides no inspectable images. Visual PDF verification remains pending; no challenge was bypassed and no university record was upgraded or redated.

## Verification

- Full Node 24.22.1 suite: **760 passed**, zero failed/cancelled/skipped; sixteen new review-worklist tests.
- Coverage includes deterministic output, preserved source dates/manual conditions, unknown GPA semantics, cutoff boundaries, unresolved/archival/future-source exclusions, category masking and binding, sibling-route separation, review-label limitations, strict CLI arguments, safe Markdown and execution outside the repository.
- The saved checklist is tested against regenerated output. Eight JSON inputs have semantic fingerprints, so changes to actual evidence require regenerating the worklist while JSON key order/line endings do not invalidate it.
- CLI/database construction is in-memory only; no day-to-day SQLite path, network, output-file write, import, review approval, push or deployment is supported.
- Catalogue remains 873 / default browsable 870 / programme-page partial checks 27 / independent human reviews 0 / complete requirement sets 0. Routes remain two groups / five routes; contexts remain 17 study options / 36 categories. No source-refresh conflict or context-binding mismatch is found.
- Source JSON, frozen workbook, existing tests, public/server code and the original data-audit script are preserved. The workbook SHA-256 remains `5DF32B82A7A1DDDBF5672BF59AC46AC3EB046D95E1EE580DE49A5C840FB47A0B`.

The worklist does not authenticate recorded reviewer identities or certify university evidence. A real reviewer must inspect the originals and record actual discrepancies and conclusions. Partial field checks are not whole-record completeness.

## Publication recommendation

Local commit only. No push, deployment, remote access or changes to main/historical checkpoints. Use the worklist to address imminent recorded cutoffs and unresolved originals before expanding coverage. The 25 October consolidation review is not automatic publication authority.
