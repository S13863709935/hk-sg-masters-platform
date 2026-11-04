// Explicit integration expectations; do not derive them from the implementation under test.
// Keep batch-specific evidence counts in each batch test and old snapshots immutable.
export const repositoryExpected = Object.freeze({
  checked: 656, catalogueLeads: 217, unreadLeads: 202,
  routeGroups: 67, routeRecords: 138, reviewUnits: 1139, nearCutoffNovember4: 13,
  backlogJson: 'data/research/school-backlog-2026-11-04-cuhk-polyu-bulk.json',
  backlogMarkdown: 'docs/research/school-data-backlog-2026-11-04-cuhk-polyu-bulk.md',
  reviewMarkdown: 'docs/research/source-review-queue-2026-11-04-cuhk-polyu-bulk.md',
  coreMarkdown: 'docs/research/core-pilot-acceptance-2026-11-04-cuhk-polyu-bulk.md'
});
