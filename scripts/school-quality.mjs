import { pathToFileURL } from 'node:url';
import { CatalogueStore } from '../server/database.mjs';

const fields = ['academicYear', 'major', 'gpa', 'language', 'tuition', 'deadline', 'independentReview'];
const comparableKinds = new Set(['degree', 'major', 'gpa', 'classification', 'language', 'experience']);
const root = new URL('../', import.meta.url);
const validDate = d => /^20\d{2}-\d{2}-\d{2}$/.test(d) && Number.isFinite(Date.parse(d)) && new Date(d).toISOString().slice(0, 10) === d;

export function buildSchoolQuality(programmes, schoolId, asOfDate) {
  if (!/^(HK|SG)-[A-Z]+$/.test(schoolId) || !validDate(asOfDate)) throw new TypeError('A school ID and explicit valid as-of date are required');
  const school = programmes.filter(p => p.universityId === schoolId);
  if (!school.length) throw new TypeError('No catalogue records for this school');
  const rows = school.map(p => {
    const usable = ['programme_page_checked', 'peer_reviewed'].includes(p.verification);
    const fieldStates = Object.fromEntries(fields.map(f => [f, p.fieldStatus?.[f]?.status || 'unrecorded']));
    return {
      programmeId: p.id, name: p.name, officialUrl: p.officialUrl,
      verification: p.verification, requirementsCoverage: p.requirementsCoverage,
      lastChecked: p.lastChecked, sourceAfterSnapshot: p.lastChecked > asOfDate || (p.sources || []).some(s => s.checkedOn > asOfDate),
      fieldStates,
      missingFields: fields.filter(f => ['unknown', 'unrecorded'].includes(fieldStates[f])),
      notPublishedFields: fields.filter(f => fieldStates[f] === 'not_published'),
      comparableRuleKinds: usable ? [...new Set(p.rules.filter(r => r.mandatory !== false && comparableKinds.has(r.kind)).map(r => r.kind))] : [],
      manualConditions: usable ? p.rules.filter(r => r.kind === 'manual' && r.mandatory !== false).length : 0,
      independentReviewRecorded: p.verification === 'peer_reviewed' && !!p.reviewer,
      sourceUrls: (p.sources || []).map(s => s.url)
    };
  }).sort((a, b) => a.programmeId.localeCompare(b.programmeId));
  return {
    schemaVersion: 1, schoolId, asOfDate,
    basis: 'Audit of existing local records, not a claim of the school’s full current catalogue or a fresh full-page review.',
    counts: { catalogueRecords: rows.length, checkedRecords: rows.filter(r => r.verification !== 'catalogue_seed').length,
      completeRequirementSets: rows.filter(r => r.requirementsCoverage === 'complete').length,
      independentlyReviewed: rows.filter(r => r.independentReviewRecorded).length,
      withComparableRules: rows.filter(r => r.comparableRuleKinds.length).length,
      fieldGaps: Object.fromEntries(fields.map(f => [f, rows.filter(r => ['unknown', 'unrecorded'].includes(r.fieldStates[f])).length])) },
    rows
  };
}

export function loadSchoolQuality(schoolId, asOfDate) {
  const store = new CatalogueStore(':memory:', { seedPath: new URL('data/catalogue.json', root), expansionPath: new URL('data/catalogue-expansion.json', root),
    checkedPath: new URL('data/checked-programmes.json', root), directoryEvidencePath: new URL('data/directory-links.json', root), scopeAuditPath: new URL('data/programme-scope-audit.json', root) });
  try { return buildSchoolQuality(store.all(), schoolId, asOfDate); } finally { store.close(); }
}

export function formatSchoolQuality(report) {
  const cell = s => String(s).replaceAll('|', '\\|').replace(/[\r\n]/g, ' ');
  const lines = [`# ${report.schoolId} existing-record quality audit`, '', `As of ${report.asOfDate}. ${report.basis}`, '',
    `${report.counts.catalogueRecords} records; ${report.counts.checkedRecords} page-checked; ${report.counts.completeRequirementSets} complete requirement sets; ${report.counts.independentlyReviewed} independently reviewed.`, '',
    'Known means recorded for the stated context. Not published means no universal criterion was established in the consulted source; it is not a waiver. Unknown/unrecorded requires follow-up. No field status confirms personal admission eligibility.', '',
    '| ID | Programme | Major | GPA | Language | Tuition | Deadline | Comparable rule kinds | Last checked |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- |'];
  for (const r of report.rows) lines.push(`| ${[r.programmeId, r.name, ...['major', 'gpa', 'language', 'tuition', 'deadline'].map(f => r.fieldStates[f]), r.comparableRuleKinds.join(', ') || 'none recorded', r.lastChecked || 'unrecorded'].map(cell).join(' | ')} |`);
  lines.push('', '## Follow-up by record', '');
  for (const r of report.rows) lines.push(`- ${r.programmeId}: unresolved ${r.missingFields.join(', ') || 'none in the tracked fields'}; ${r.manualConditions} mandatory manual conditions. ${r.sourceAfterSnapshot ? 'Source postdates this snapshot; do not use it as historical evidence. ' : ''}[Official page](${r.officialUrl}).`);
  return lines.join('\n') + '\n';
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const args = process.argv.slice(2), allowed = ['--school', '--as-of', '--format'], options = {};
    if (args.length % 2) throw new TypeError('Use --school ID --as-of YYYY-MM-DD [--format json|markdown]');
    for (let i = 0; i < args.length; i += 2) {
      if (!allowed.includes(args[i]) || options[args[i]]) throw new TypeError('Invalid or duplicate argument');
      options[args[i]] = args[i + 1];
    }
    const format = options['--format'] || 'json';
    if (!['json', 'markdown'].includes(format)) throw new TypeError('Format must be json or markdown');
    const report = loadSchoolQuality(options['--school'], options['--as-of']);
    process.stdout.write(format === 'markdown' ? formatSchoolQuality(report) : JSON.stringify(report, null, 2) + '\n');
  } catch (error) { console.error('School audit not generated: ' + error.message); process.exitCode = 1; }
}
