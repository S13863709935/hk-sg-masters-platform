// Reconcile frozen HKUST Hong Kong taught results, not programme admissions.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { identity } from './programme-identity.mjs';
import { validateProgramme, validateDirectoryListing, validateDirectoryAudit, isOfficialUrl } from '../server/validation.mjs';

const root = new URL('../', import.meta.url), date = '2026-10-20', school = 'HK-HKUST';
const sourceUrl = 'https://prog-crs.hkust.edu.hk/pgprog', prefix = sourceUrl + '/2027-28/';
const read = file => JSON.parse(readFileSync(new URL(file, root), 'utf8'));
const save = (file, value) => writeFileSync(new URL(file, root), JSON.stringify(value, null, 2) + '\n');
const schools = ['SSCI', 'SENG', 'SBM', 'SHSS', 'IPO'];
const degrees = ['MENG', 'DBA', 'MBA', 'MSC', 'MA', 'MPM', 'MPP', 'PGD'];
const nameOf = (title, award, path) => ['ft-pt-mba/', 'pt-mba-biweekly/'].includes(path) ? 'Master of Business Administration' : path === 'hkust-emba/' ? 'Executive Master of Business Administration' : award === 'MPP' ? 'Master of Public Policy' : award === 'MPM' ? 'Master of Public Management' : `${award.split(' / ')[0]} ${title}`;

export function buildHkustInventory(input) {
  const { observation, seed, checked } = structuredClone(input);
  const expansion = structuredClone(input.expansion), links = structuredClone(input.links), audit = structuredClone(input.audit);
  const f = observation.selectedFilters;
  if (observation.schemaVersion !== 1 || observation.universityId !== school || observation.checkedOn !== date || observation.sourceUrl !== sourceUrl || observation.catalogueYear !== '2027-28' || observation.programmeUrlPrefix !== prefix || observation.rowCount !== 55 || observation.rows?.length !== 55 || f?.year !== '2027-28' || JSON.stringify(f.schools) !== JSON.stringify(schools) || JSON.stringify(f.degrees) !== JSON.stringify(degrees) || f.allAreas !== true || f.researchSelected !== false || f.guangzhouHubsSelected !== false || f.alphabet !== 'Show All') throw new Error('Incomplete or incorrect HKUST filter observation');
  if ([expansion.checkedOn, links.checkedOn, audit.checkedOn].some(d => d > date)) throw new Error('Refusing to replace newer directory evidence');
  const entries = [], groups = new Map(), paths = new Set();
  for (const [index, row] of observation.rows.entries()) {
    const [department, rawName, awardLabel, path] = row;
    if (row.length !== 4 || typeof department !== 'string' || !department || typeof rawName !== 'string' || !rawName || /\p{Script=Han}/u.test(rawName) || !['MSc', 'MA', 'MEng', 'MSc / PGD', 'MA / PGD', 'MSc / MEng', 'EMBA / MBA', 'MPM', 'MPP', 'DBA'].includes(awardLabel) || !/^[a-z0-9-]+\/$/.test(path) || paths.has(path) || !isOfficialUrl(prefix + path)) throw new Error('Invalid or duplicate HKUST directory row');
    paths.add(path);
    let decision = 'include_directory_lead', reasonEn = 'Master lead in the Hong Kong-school taught directory; admissions, intake and delivery still need programme-specific checks.';
    if (awardLabel === 'DBA') { decision = 'exclude_non_master'; reasonEn = 'Doctor of Business Administration is not a master, despite appearing under the taught filter.'; }
    if (['msc-gfin/', 'kh-emba/'].includes(path)) { decision = 'hold_partner_reconciliation'; reasonEn = 'Named external-university joint programme. Awarding and delivery boundaries need checking before adding a standalone Hong Kong lead.'; }
    if (path === 'meng-aie/') { decision = 'hold_delivery_reconciliation'; reasonEn = 'The 2027/28 curriculum requires a year-long Shanghai internship. Hold for cross-region delivery/scope reconciliation, not because all MEng degrees are research or transfer-only.'; }
    if (path === 'meng-di/') { decision = 'hold_delivery_reconciliation'; reasonEn = 'The 2027/28 curriculum lists a year-long placement in Hong Kong, the Greater Bay Area or Shanghai. The Hong Kong placement choice and delivery boundary need confirmation; do not assume the whole programme is Hong Kong-only.'; }
    const entry = { rowNumber: index + 1, department, rawName, awardLabel, officialUrl: prefix + path, decision, reasonEn };
    if (awardLabel.includes('PGD')) entry.excludedAwardComponent = 'PGD';
    if (path === 'msc-meng-disc/') { entry.relatedTransferOnlyId = 'HK-HKUST-P003'; entry.reasonEn += ' Only MSc maps to the direct-entry parent; MEng is available to existing MSc students, not new admissions.'; }
    entries.push(entry);
    if (decision !== 'include_directory_lead') continue;
    const name = nameOf(rawName, awardLabel, path), key = identity(name);
    if (!groups.has(key)) groups.set(key, { name, entries: [] });
    groups.get(key).entries.push(entry);
  }
  const schoolIds = new Set(seed.universities.map(u => u.id));
  const registry = new Map([...seed.programmes, ...expansion.programmes, ...checked.programmes].map(p => [p.id, p]));
  const records = [...registry.values()].filter(p => p.universityId === school);
  const byName = new Map(records.map(p => [identity(p.name), p]));
  let nextId = Math.max(...records.map(p => Number(p.id.split('-P')[1]))) + 1;
  const listings = [], candidates = [];
  for (const g of [...groups.values()].sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
    let p = byName.get(identity(g.name));
    const variants = g.entries.length > 1 ? g.entries.map(e => ({ nameEn: e.rawName, officialUrl: e.officialUrl })) : [];
    const noteEn = '2027/28 directory evidence only; it does not refresh older-cycle admissions, fees or dates. Prospective curriculum remains under review and fees may change. ' + (variants.length ? 'MBA study-format listings are grouped, not interchangeable admission conditions. ' : '') + (g.entries.some(e => e.excludedAwardComponent) ? 'Only the master award is retained; the PGD component is outside scope. ' : '') + (g.entries.some(e => e.relatedTransferOnlyId) ? 'MSc only: the MEng route is for existing MSc students, not new admission. ' : '') + 'Programme-specific requirements and delivery remain for confirmation. Directory presence does not prove applications are open.';
    const listing = { nameEn: g.name, checkedOn: date, sourceUrl, programmeUrl: g.entries[0].officialUrl, variants, noteEn };
    validateDirectoryListing(listing);
    if (!p) {
      const id = `${school}-P${String(nextId++).padStart(3, '0')}`;
      p = { id, universityId: school, name: g.name, award: 'Master', area: 'Unclassified', faculty: null, officialUrl: listing.programmeUrl, verification: 'catalogue_seed', sourceStatus: 'Official taught directory listing; programme admissions unreviewed', lastChecked: date, academicYear: null, admissionRoute: 'unconfirmed', requirementsCoverage: 'unreviewed', collector: 'AI-assisted HKUST directory reconciliation', reviewer: null, notesZh: '', notesEn: noteEn, offerings: [{ id: id + '-catalogue', mode: null, duration: null, intake: null, deadline: null, currency: null, tuition: null, feeBasis: null, academicYear: null }], rules: [], sources: [{ url: sourceUrl, purpose: 'Official Hong Kong-school taught directory only', checkedOn: date }], inventoryBatch: date, inventoryPass: 'hkust-directory' };
      validateProgramme(p, schoolIds); expansion.programmes.push(p); byName.set(identity(g.name), p);
    }
    for (const e of g.entries) e.programmeId = p.id;
    listings.push({ programmeId: p.id, ...listing });
    candidates.push({ programmeId: p.id, name: g.name, directoryRows: g.entries.map(e => e.rowNumber), variants });
  }
  const inventory = { schemaVersion: 1, universityId: school, checkedOn: date, sourceUrl, catalogueYear: '2027-28', observationRowsSha256: createHash('sha256').update(JSON.stringify(observation.rows)).digest('hex'), verificationLevel: 'AI-assisted directory and boundary reconciliation; not independent human review', countingUnit: 'Filtered Hong Kong-school taught rows. DBA excluded, PGD components not separate masters, joint/delivery questions held and MBA study formats conservatively grouped. DISC MEng transfer identity is not another direct-entry lead.', rawRowCount: 55, excludedRowCount: entries.filter(e => e.decision === 'exclude_non_master').length, heldRowCount: entries.filter(e => e.decision.startsWith('hold_')).length, masterRowCount: 53, candidateGroupCount: candidates.length, confirmedProgrammeCount: null, entries, candidates };
  if (inventory.excludedRowCount !== 2 || inventory.heldRowCount !== 4 || candidates.length !== 48) throw new Error('Unexpected HKUST scope reconciliation');
  const incoming = new Map(listings.map(l => [l.programmeId, l])), existingIds = new Set(links.listings.map(l => l.programmeId));
  if (links.listings.some(l => incoming.has(l.programmeId) && l.checkedOn > date)) throw new Error('Refusing to replace newer HKUST listings');
  links.listings = [...links.listings.map(l => incoming.get(l.programmeId) || l), ...listings.filter(l => !existingIds.has(l.programmeId))];
  links.checkedOn = date; expansion.checkedOn = date;
  expansion.programmes.sort((a, b) => a.id.localeCompare(b.id));
  Object.assign(audit.universities.find(u => u.universityId === school), { checkedOn: date, entryStatus: 'entry_checked', enumerationStatus: 'entries_enumerated', confirmedProgrammeCount: null, visibleDirectoryResultCount: 55, directoryMasterEntryCount: 53, inventoryFile: `data/research/hkust-programme-inventory-${date}.json`, noteEn: '2027/28 Show All results with research unchecked and only the five Hong Kong schools selected: 55 rows, two DBAs excluded, four joint/placement cases held. 48 candidate groups after MBA-format grouping; PGD components do not add masters. DISC maps only to the MSc seed, while its existing MEng transfer identity stays hidden by default. No confirmed distinct-programme count or live admissions claim.' });
  audit.checkedOn = date; validateDirectoryAudit(audit, schoolIds);
  return { inventory, expansion, links, audit };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const output = buildHkustInventory({ observation: read(`data/research/hkust-directory-observation-${date}.json`), seed: read('data/catalogue.json'), checked: read('data/checked-programmes.json'), expansion: read('data/catalogue-expansion.json'), links: read('data/directory-links.json'), audit: read('data/directory-audit.json') });
  save(`data/research/hkust-programme-inventory-${date}.json`, output.inventory); save('data/catalogue-expansion.json', output.expansion); save('data/directory-links.json', output.links); save('data/directory-audit.json', output.audit);
  console.log(JSON.stringify({ rows: 55, excluded: 2, held: 4, candidateGroups: 48, additions: output.expansion.programmes.filter(p => p.inventoryPass === 'hkust-directory').length, total: read('data/catalogue.json').programmes.length + output.expansion.programmes.length }, null, 2));
}
