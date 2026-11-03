import { pathToFileURL } from 'node:url';
import { CatalogueStore } from '../server/database.mjs';
import { loadRoutes } from '../server/routes.mjs';

const root = new URL('../', import.meta.url);
const fields = ['academicYear', 'major', 'gpa', 'language', 'tuition', 'deadline'];
const validDate = d => typeof d === 'string' && /^20\d{2}-\d{2}-\d{2}$/.test(d) && Number.isFinite(Date.parse(d)) && new Date(d).toISOString().slice(0, 10) === d;

export function buildSchoolBacklog(programmes, routes, asOfDate) {
  if (!validDate(asOfDate)) throw new TypeError('An explicit valid as-of date is required');
  const schools = [...new Set(programmes.map(p => p.universityId))].sort().map(schoolId => {
    const rows = programmes.filter(p => p.universityId === schoolId);
    const checked = rows.filter(p => ['programme_page_checked', 'peer_reviewed'].includes(p.verification));
    const leads = rows.filter(p => p.verification === 'catalogue_seed');
    const routeCovered = leads.filter(p => routes.has(p.id));
    const scopeHeld = leads.filter(p => !routes.has(p.id) && p.scope?.status === 'out_of_scope');
    const unread = leads.filter(p => !routes.has(p.id) && p.scope?.status !== 'out_of_scope');
    const active = checked.filter(p => p.admissionRoute === 'direct' && p.scope?.status !== 'out_of_scope');
    const fieldCounts = predicate => Object.fromEntries(fields.map(f => [f, active.filter(p => predicate(p.fieldStatus?.[f]?.status || 'unrecorded')).length]));
    return { schoolId, catalogueRecords: rows.length, partialRecords: checked.filter(p => p.requirementsCoverage !== 'complete').length,
      pageCheckedRecords: checked.length, completeRecords: checked.filter(p => p.requirementsCoverage === 'complete').length,
      catalogueLeads: leads.length, routeCoveredLeads: routeCovered.length, scopeHeldLeads: scopeHeld.length, unreadLeads: unread.length,
      activePageCheckedRecords: active.length,
      activeParentUnknownFields: fieldCounts(s => ['unknown', 'unrecorded'].includes(s)),
      activeParentNotPublishedFields: fieldCounts(s => s === 'not_published'),
      sourceAfterSnapshot: rows.filter(p => p.lastChecked > asOfDate || (p.sources || []).some(s => s.checkedOn > asOfDate)).map(p => p.id),
      unread: unread.map(p => ({ programmeId: p.id, name: p.name, officialUrl: p.officialUrl })) };
  });
  const count = key => schools.reduce((n, s) => n + s[key], 0);
  return { schemaVersion: 1, asOfDate, basis: 'Inventory of existing repository records, not a certified complete current university catalogue or a new source review.',
    counts: { schools: schools.length, catalogueRecords: programmes.length, pageCheckedRecords: count('pageCheckedRecords'),
      partialRecords: count('partialRecords'), completeRecords: count('completeRecords'), catalogueLeads: count('catalogueLeads'),
      routeCoveredLeads: count('routeCoveredLeads'), scopeHeldLeads: count('scopeHeldLeads'), unreadLeads: count('unreadLeads') }, schools };
}

export function loadSchoolBacklog(asOfDate) {
  const store = new CatalogueStore(':memory:', { seedPath: new URL('data/catalogue.json', root), expansionPath: new URL('data/catalogue-expansion.json', root),
    checkedPath: new URL('data/checked-programmes.json', root), directoryEvidencePath: new URL('data/directory-links.json', root), scopeAuditPath: new URL('data/programme-scope-audit.json', root) });
  try { const all = store.all(); return buildSchoolBacklog(all, loadRoutes(new URL('data/route-programmes.json', root), all), asOfDate); }
  finally { store.close(); }
}

export function formatSchoolBacklog(r) {
  const c = r.counts, lines = ['# School data backlog', '', `As of ${r.asOfDate}. ${r.basis}`, '',
    `${c.catalogueRecords} records across ${c.schools} schools: ${c.pageCheckedRecords} page-checked parents (${c.partialRecords} partial, ${c.completeRecords} complete) and ${c.catalogueLeads} catalogue leads.`, '',
    `The ${c.catalogueLeads} leads comprise ${c.unreadLeads} without a programme-page pass, ${c.routeCoveredLeads} grouped parents with separately recorded route evidence and ${c.scopeHeldLeads} scope-held leads. Route coverage does not make a parent requirement set complete.`, '',
    '| School | Catalogue | Page checked | Leads | Route-covered leads | Scope-held leads | Unread leads |', '| --- | ---: | ---: | ---: | ---: | ---: | ---: |'];
  for (const s of r.schools) lines.push(`| ${s.schoolId} | ${s.catalogueRecords} | ${s.pageCheckedRecords} | ${s.catalogueLeads} | ${s.routeCoveredLeads} | ${s.scopeHeldLeads} | ${s.unreadLeads} |`);
  lines.push('', '## Remaining work in page-checked records', '',
    'Counts below concern active direct-application parents. A mode/category context can resolve a fee or date while the parent remains unknown. Unknown means follow-up is needed; not_published means no universal criterion was established in the consulted source, not a waiver. Do not add these columns together as a number of unfinished programmes.', '',
    '| School | Active parents | Unknown year | Unknown major | Unknown GPA | Unknown language | Unknown tuition | Unknown deadline | GPA not published |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |');
  for (const s of r.schools) lines.push(`| ${s.schoolId} | ${s.activePageCheckedRecords} | ${fields.map(f => s.activeParentUnknownFields[f]).join(' | ')} | ${s.activeParentNotPublishedFields.gpa} |`);
  lines.push('', '## Batch workflow', '',
    '1. Finish a bounded school/subject group using its own official overview, entry, fee and application pages. Check required delivery locations before treating it as a candidate.',
    '2. Preserve degree, route, intake, study mode and applicant category separately. Keep old cohorts, preferences, alternative entry routes and unpublished conditions explicit.',
    '3. Exercise the batch through details, matching, comparison inputs, saved-choice restore and export. Record unresolved conditions without granting an admission tier.',
    '4. Refresh this backlog and the maintenance snapshot; check that previous evidence and weekly publication refs remain unchanged. Local work and weekly publication are separate decisions.', '',
    'Schools with zero unread leads still require maintenance and unresolved-field follow-up. A first-pass observation is not a complete requirement set or an independent human review. Scope-held records remain outside the active candidate list.', '',
    'Use the per-school counts to select bounded batches and track completed evidence rather than chat replies. The JSON companion retains every unread ID and official URL. A new snapshot inventories the current repository; an earlier as-of label does not reconstruct historical sources. Later-than-snapshot observations are flagged separately in JSON.', '');
  return lines.join('\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const args = process.argv.slice(2);
    if (args.length !== 2 || args[0] !== '--as-of' || !validDate(args[1])) throw new TypeError('Use --as-of YYYY-MM-DD');
    console.log(formatSchoolBacklog(loadSchoolBacklog(args[1])).trimEnd());
  } catch (error) { console.error('Backlog not generated: ' + error.message); process.exitCode = 1; }
}
