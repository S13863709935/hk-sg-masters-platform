// Catalogue text is searchable metadata, not a statement of admission eligibility.
// Keep browser-side background results and server-side discovery on the same rules.
const searchText = p => [
  p.name, p.area, p.faculty,
  p.university.nameEn, p.university.nameZh, p.university.abbreviation,
  p.directoryListing?.nameEn,
  ...(p.directoryListing?.variants || []).map(v => v.nameEn)
].filter(Boolean).join(' ').toLowerCase();

export function filterProgrammes(all, filters = {}) {
  const q = String(filters.q || '').slice(0, 200).trim().toLowerCase();
  return all.filter(p =>
    (filters.includeTransfer === 'true' || p.admissionRoute !== 'transfer_only') &&
    (filters.includeOutOfScope === 'true' || p.scope?.status !== 'out_of_scope') &&
    (!q || searchText(p).includes(q)) &&
    (!filters.region || p.university.region === filters.region) &&
    (!filters.school || p.universityId === filters.school) &&
    (!filters.area || p.area === filters.area) &&
    (!filters.mode || p.offerings.some(o => o.mode?.toLowerCase().includes(filters.mode))) &&
    (!filters.verification || p.verification === filters.verification)
  );
}

export function filterMatchedProgrammes(all, filters = {}, savedOptionIssues = {}) {
  return filterProgrammes(all, filters).filter(p => !filters.matchFilter || (!savedOptionIssues[p.id] && (filters.matchFilter === 'recorded_checks_met'
    ? ['needs_confirmation', 'meets_checked'].includes(p.match?.status) && p.match?.recordedCriteria?.status === 'recorded_checks_met'
    : p.match?.status === filters.matchFilter)));
}
