// Explicit integration expectations; do not derive them from the implementation under test.
// Keep batch-specific evidence counts in each batch test and old snapshots immutable.
export const repositoryExpected = Object.freeze({
  asOfDate: '2026-11-10', checked: 858, catalogueLeads: 15, unreadLeads: 0,
  routeGroups: 77, routeRecords: 176, reviewUnits: 1379, nearCutoffNovember4: 13,
  backlogJson: 'data/research/school-backlog-2026-11-10-singapore-finish.json',
  backlogMarkdown: 'docs/research/school-data-backlog-2026-11-10-singapore-finish.md',
  reviewMarkdown: 'docs/research/source-review-queue-2026-11-10-singapore-finish.md',
  coreMarkdown: 'docs/research/core-pilot-acceptance-2026-11-10-singapore-finish.md'
});
