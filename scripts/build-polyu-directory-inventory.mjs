// Frozen directory reconciliation only. Never imports admissions/offerings.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { identity } from './programme-identity.mjs';
import { validateProgramme, validateDirectoryListing, validateDirectoryAudit, isOfficialUrl } from '../server/validation.mjs';

const root = new URL('../', import.meta.url), date = '2026-10-20', school = 'HK-POLYU';
const sourceUrl = 'https://www.polyu.edu.hk/study/pg/taught-postgraduate';
const read = file => JSON.parse(readFileSync(new URL(file, root), 'utf8'));
const save = (file, value) => writeFileSync(new URL(file, root), JSON.stringify(value, null, 2) + '\n');
const views = [['Sept 2027', '2669', '2027', 128], ['Jan 2027', '2666', '20262', 41]];
const closedText = 'Local Application Deadline: (Closed)\nNon-Local Application Deadline: (Closed)';
const held = {
  '09003': ['hold_scheme_reconciliation', 'The listed MSc Scheme is not a single confirmed award. Reconcile its named awards/directions and pending approval before adding catalogue groups.'],
  '24045': ['hold_scheme_reconciliation', 'The listed MSc Scheme includes multiple awards/directions and PGD paths. Do not count the scheme plus its component awards or guess their admissions.'],
  '45080': ['hold_partner_reconciliation', 'The two IGDS MSc awards are jointly offered/awarded with the University of Warwick. Hong Kong delivery is available, but partner/award scope and application handling need reconciliation.'],
  '17005': ['hold_delivery_reconciliation', 'The programme includes Hong Kong teaching and nine credits at the PolyU-Zhongshan institute, including a GBA attachment. Cross-region delivery needs scope clarification; this is not the same route as 17004.'],
  '24043': ['hold_delivery_reconciliation', 'Compulsory semesters are delivered at EHL, PolyU and the University of Houston. Hold for multi-campus delivery reconciliation, not a research-degree exclusion.'],
  '14105': ['hold_delivery_reconciliation', 'The Global Immersion Study Pathways include required international seminar/tour credits. Clarify the delivery boundary and experience-specific options before adding this lead.']
};

function nameOf(title, award, code) {
  if (code === '21050') return 'Master of Finance';
  if (code === '54057') return 'Master of Applied Psychology';
  if (code === '15058') return 'MSc Nutrition and Healthy Ageing';
  const base = title.replace(/ \(TESOL\)$/, '');
  return award.startsWith('Master') ? `Master of ${base}` : `${award.split('/')[0]} ${base}`;
}

export function buildPolyuInventory(input) {
  const { observation, seed, checked, expansion, links, audit } = structuredClone(input);
  if (observation.schemaVersion !== 1 || observation.universityId !== school || observation.checkedOn !== date || observation.sourceUrl !== sourceUrl || observation.views?.length !== 2) throw new Error('Invalid PolyU observation');
  if ([expansion.checkedOn, links.checkedOn, audit.checkedOn, audit.universities.find(u => u.universityId === school)?.checkedOn].some(d => d > date)) throw new Error('Refusing to replace newer PolyU evidence');
  const entries = [], groups = new Map();
  for (const [i, view] of observation.views.entries()) {
    const [label, filter, year, count] = views[i], prefix = `https://www.polyu.edu.hk/study/pg/tpg/${year}/`;
    if (view.entryLabel !== label || view.semesterFilterValue !== filter || view.facultyFilterValue !== 'All' || view.keyword !== '' || view.programmeUrlPrefix !== prefix || view.rowCount !== count || view.rows?.length !== count) throw new Error('Incomplete PolyU semester/filter capture');
    if (i === 1 && (view.closedDeadlineEvidence?.length !== 2 || ['51068', '51067'].some(code => !view.closedDeadlineEvidence.some(e => e.subcodePath === code && e.rawText === closedText)))) throw new Error('Missing closed January deadline evidence');
    const paths = new Set();
    for (const [rowIndex, row] of view.rows.entries()) {
      if (!Array.isArray(row) || row.length !== 3 || row.some(s => typeof s !== 'string')) throw new Error('Invalid PolyU row');
      const [rawTitle, path, remark] = row, parts = rawTitle.split(' - ');
      if (parts.length !== 3 || !parts[0] || !['Doctor', 'EngD', 'MSc', 'MA', 'Master', 'MSc/PgD', 'MA/PgD', 'Master/PgD', 'MSc Scheme'].includes(parts[1]) || !/^\d{5}(?:-[a-z]+)*$/.test(path) || paths.has(path) || /\p{Script=Han}/u.test(rawTitle + remark) || !isOfficialUrl(prefix + path)) throw new Error('Invalid or duplicate PolyU path/award');
      paths.add(path);
      const [title, award] = parts, code = path.slice(0, 5);
      let decision = 'include_directory_lead', reasonEn = 'Named master in the consulted taught directory; programme delivery and admissions remain unreviewed.';
      if (['Doctor', 'EngD'].includes(award)) { decision = 'exclude_non_master'; reasonEn = 'Doctoral award in a taught-postgraduate list, not a master.'; }
      else if (/will not invite applications/.test(remark)) { decision = 'hold_not_offered'; reasonEn = 'Directory explicitly says no applications for 2027/28; retain research evidence without creating a current catalogue lead.'; }
      else if (i === 1 && ['51068', '51067'].includes(path)) { decision = 'hold_closed_intake'; reasonEn = 'Both applicant categories are marked Closed in the January directory. The invitation dates in the remark are historical, not an open application claim.'; }
      else if (held[code]) [decision, reasonEn] = held[code];
      const e = { entryLabel: label, rowNumber: rowIndex + 1, code, subcodePath: path, rawTitle, awardLabel: award, officialUrl: prefix + path, remark, decision, reasonEn, pendingApproval: /subject to approval/i.test(remark) };
      if (/PgD/.test(award)) e.excludedAwardComponent = 'PgD';
      if (decision === 'hold_closed_intake') e.closedDeadlineEvidence = closedText;
      entries.push(e);
      if (decision !== 'include_directory_lead') continue;
      const name = nameOf(title, award, code), key = identity(name);
      if (!groups.has(key)) groups.set(key, { name, entries: [] });
      groups.get(key).entries.push(e);
    }
  }
  const schoolIds = new Set(seed.universities.map(u => u.id));
  const registry = new Map([...seed.programmes, ...expansion.programmes, ...checked.programmes].map(p => [p.id, p]));
  const records = [...registry.values()].filter(p => p.universityId === school), byName = new Map(records.map(p => [identity(p.name), p]));
  let nextId = Math.max(0, ...records.map(p => Number(p.id.match(/-P(\d+)$/)?.[1]))) + 1;
  const listings = [], candidates = [];
  for (const g of [...groups.values()].sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
    let p = byName.get(identity(g.name));
    const variants = g.entries.length > 1 ? g.entries.map(e => ({ nameEn: `${e.rawTitle.split(' - ')[0]} — ${e.entryLabel} (${e.subcodePath})`, officialUrl: e.officialUrl })) : [];
    const remarks = [...new Set(g.entries.map(e => e.remark).filter(Boolean))];
    const cycleNote = g.entries.some(e => e.entryLabel === 'Jan 2027') ? 'Directory evidence only: September 2027 and January 2027 are different admission cycles (2027/28 and 2026/27). ' : 'September 2027 (2027/28) directory evidence only. ';
    const noteEn = cycleNote + 'This observation does not refresh checked admissions, fees or dates. ' + (variants.length ? 'Grouped intake/subcode/stream references are not interchangeable admissions options; check the exact route. ' : '') + (g.entries.some(e => e.excludedAwardComponent) ? 'Only the master component is retained; PgD is outside scope. ' : '') + (g.entries.some(e => e.code === '44087') ? 'The ISS and mixed-mode shipping routes have separate applications and conditions; no shared requirements are inferred. ' : '') + (remarks.length ? 'Directory remarks: ' + remarks.join(' ') + ' ' : '') + 'Programme-level requirements and delivery still need checking. Directory presence does not prove applications are open.';
    const listing = { nameEn: g.name, checkedOn: date, sourceUrl, programmeUrl: g.entries[0].officialUrl, variants, noteEn };
    validateDirectoryListing(listing);
    if (!p) {
      const id = `${school}-P${String(nextId++).padStart(3, '0')}`;
      p = { id, universityId: school, name: g.name, award: 'Master', area: 'Unclassified', faculty: null, officialUrl: listing.programmeUrl, verification: 'catalogue_seed', sourceStatus: 'Official taught directory listing; programme admissions unreviewed', lastChecked: date, academicYear: null, admissionRoute: 'unconfirmed', requirementsCoverage: 'unreviewed', collector: 'AI-assisted PolyU directory reconciliation', reviewer: null, notesZh: '', notesEn: noteEn, offerings: [{ id: id + '-catalogue', mode: null, duration: null, intake: null, deadline: null, currency: null, tuition: null, feeBasis: null, academicYear: null }], rules: [], sources: [{ url: sourceUrl, purpose: 'Official taught directory only', checkedOn: date }], inventoryBatch: date, inventoryPass: 'polyu-directory' };
      validateProgramme(p, schoolIds); expansion.programmes.push(p); byName.set(identity(g.name), p);
    }
    for (const e of g.entries) e.programmeId = p.id;
    listings.push({ programmeId: p.id, ...listing });
    candidates.push({ programmeId: p.id, name: g.name, directoryRows: g.entries.map(e => ({ entryLabel: e.entryLabel, rowNumber: e.rowNumber })), variants, pendingApproval: g.entries.some(e => e.pendingApproval) });
  }
  const inventory = { schemaVersion: 1, universityId: school, checkedOn: date, sourceUrl, observationViewsSha256: createHash('sha256').update(JSON.stringify(observation.views)).digest('hex'), verificationLevel: 'AI-assisted directory and boundary reconciliation; not independent human review', countingUnit: 'Both semester lists, not distinct admissions: exclude doctoral rows; master components only; hold schemes, partner/delivery and unavailable intakes; group repeated intakes and selected streams conservatively. Administrative codes are not award identities.', rawRowCount: entries.length, excludedRowCount: entries.filter(e => e.decision === 'exclude_non_master').length, heldRowCount: entries.filter(e => e.decision.startsWith('hold_')).length, masterRowCount: entries.filter(e => e.decision !== 'exclude_non_master').length, candidateGroupCount: candidates.length, confirmedProgrammeCount: null, entries, candidates };
  if (inventory.rawRowCount !== 169 || inventory.excludedRowCount !== 18 || inventory.heldRowCount !== 12 || candidates.length !== 100) throw new Error(`Unexpected PolyU reconciliation: ${JSON.stringify({ raw: inventory.rawRowCount, excluded: inventory.excludedRowCount, held: inventory.heldRowCount, groups: candidates.length })}`);
  const incoming = new Map(listings.map(l => [l.programmeId, l])), existingIds = new Set(links.listings.map(l => l.programmeId));
  if (links.listings.some(l => incoming.has(l.programmeId) && l.checkedOn > date)) throw new Error('Refusing to replace newer PolyU listings');
  links.listings = [...links.listings.map(l => incoming.get(l.programmeId) || l), ...listings.filter(l => !existingIds.has(l.programmeId))];
  links.checkedOn = date; expansion.checkedOn = date; expansion.programmes.sort((a, b) => a.id.localeCompare(b.id));
  const schoolAudit = audit.universities.find(u => u.universityId === school);
  if (!schoolAudit) throw new Error('Missing PolyU audit');
  Object.assign(schoolAudit, { checkedOn: date, entryStatus: 'entry_checked', enumerationStatus: 'entries_enumerated', confirmedProgrammeCount: null, visibleDirectoryResultCount: 169, directoryMasterEntryCount: 151, inventoryFile: `data/research/polyu-programme-inventory-${date}.json`, noteEn: 'All-faculty semester lists: 128 September 2027 rows and 41 January 2027 rows. Exclude 18 doctoral rows, hold 12 rows for schemes/partners/delivery or unavailable intakes. Repeated intakes and selected streams form 100 conservative candidate groups, not an exact distinct-master total. Master-labelled row count 151 still includes repeated intakes and unresolved cases. Admissions and delivery are not fully checked.' });
  audit.checkedOn = date; validateDirectoryAudit(audit, schoolIds);
  return { inventory, expansion, links, audit };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const output = buildPolyuInventory({ observation: read(`data/research/polyu-directory-observation-${date}.json`), seed: read('data/catalogue.json'), checked: read('data/checked-programmes.json'), expansion: read('data/catalogue-expansion.json'), links: read('data/directory-links.json'), audit: read('data/directory-audit.json') });
  save(`data/research/polyu-programme-inventory-${date}.json`, output.inventory); save('data/catalogue-expansion.json', output.expansion); save('data/directory-links.json', output.links); save('data/directory-audit.json', output.audit);
  console.log(JSON.stringify({ candidateGroups: output.inventory.candidateGroupCount, additions: output.expansion.programmes.filter(p => p.inventoryPass === 'polyu-directory').length, total: read('data/catalogue.json').programmes.length + output.expansion.programmes.length }, null, 2));
}
