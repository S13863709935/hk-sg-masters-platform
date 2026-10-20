// Reconcile a frozen taught-directory observation; never infer admissions conditions.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { identity } from './programme-identity.mjs';
import { isOfficialUrl, validateProgramme, validateDirectoryListing, validateDirectoryAudit } from '../server/validation.mjs';

const root = new URL('../', import.meta.url), date = '2026-10-20', school = 'HK-EDUHK';
const sourceUrl = 'https://gs.eduhk.hk/pg-programmes/programme-information.html';
const sectionCounts = { gs: 1, aapsef: 19, aedi: 17, fehd: 13, fhm: 12, flass: 17 };
const read = file => JSON.parse(readFileSync(new URL(file, root), 'utf8'));
const save = (file, value) => writeFileSync(new URL(file, root), JSON.stringify(value, null, 2) + '\n');
const nameOf = raw => raw.split('[')[0].trim().replace(/\s+\((?:MGM|MM)\)\s*(?:#)?$/, '').trim();
const eduhkUrl = value => isOfficialUrl(value) && (new URL(value).hostname === 'eduhk.hk' || new URL(value).hostname.endsWith('.eduhk.hk'));

export function buildEduhkInventory(input) {
  const { observation, seed, checked } = structuredClone(input);
  const expansion = structuredClone(input.expansion), links = structuredClone(input.links), audit = structuredClone(input.audit);
  if (observation.schemaVersion !== 1 || observation.universityId !== school || observation.checkedOn !== date || observation.sourceUrl !== sourceUrl || observation.sourceHeading !== 'Programme Information' || observation.rowCount !== 79 || observation.rows?.length !== 79 || JSON.stringify(observation.sections) !== JSON.stringify(sectionCounts) || observation.footnoteMeanings?.asterisk !== 'Programme subject to University approval' || observation.footnoteMeanings?.hash !== 'Chinese medium of instruction; not a pending-approval marker') throw new Error('Incomplete or unexpected EdUHK observation');
  if ([expansion.checkedOn, links.checkedOn, audit.checkedOn].some(d => d > date)) throw new Error('Refusing to replace newer directory evidence');
  const counts = Object.fromEntries(Object.keys(sectionCounts).map(key => [key, 0]));
  const seen = new Set(), entries = [], groups = new Map();
  for (const [index, row] of observation.rows.entries()) {
    const [section, rawName, officialUrl, pendingApproval, chineseMarker] = row;
    if (row.length !== 5 || !(section in counts) || typeof rawName !== 'string' || !/^(?:Executive Master|Master|Postgraduate Certificate)\b/.test(rawName) || /\p{Script=Han}/u.test(rawName) || typeof pendingApproval !== 'boolean' || typeof chineseMarker !== 'boolean' || pendingApproval !== rawName.includes('*') || chineseMarker !== rawName.includes('#') || (officialUrl !== null && !eduhkUrl(officialUrl))) throw new Error('Invalid EdUHK frozen row or source');
    const key = section + '|' + rawName;
    if (seen.has(key)) throw new Error('Duplicate frozen EdUHK row');
    seen.add(key); counts[section]++;
    const name = nameOf(rawName);
    let decision = 'include_directory_lead', reasonEn = 'Linked master in an explicit taught section; programme admissions, delivery, year and fees still need checks.';
    if (rawName.startsWith('Postgraduate Certificate')) { decision = 'exclude_non_master'; reasonEn = 'Postgraduate certificate in a taught section is not a master award.'; }
    else if (!officialUrl) { decision = 'hold_missing_programme_link'; reasonEn = 'Listed subject to approval without a programme link. Keep as research evidence; do not invent a URL or an application-ready programme record.'; }
    const entry = { rowNumber: index + 1, section, rawName, name, officialUrl, pendingApproval, chineseMarker, decision, reasonEn };
    if (rawName.includes('Artificial Intelligence Innovation and Venture')) entry.sourceIdentityNote = 'The displayed acronym overlaps another programme. Retain the source wording; never use the acronym alone as a programme identity.';
    entries.push(entry);
    if (decision !== 'include_directory_lead') continue;
    const groupKey = identity(name);
    if (!groups.has(groupKey)) groups.set(groupKey, { name, entries: [] });
    groups.get(groupKey).entries.push(entry);
  }
  if (JSON.stringify(counts) !== JSON.stringify(sectionCounts)) throw new Error('Missing EdUHK taught section');
  const schoolIds = new Set(seed.universities.map(u => u.id));
  const registry = new Map([...seed.programmes, ...expansion.programmes, ...checked.programmes].map(p => [p.id, p]));
  const records = [...registry.values()].filter(p => p.universityId === school);
  const byName = new Map(records.map(p => [identity(p.name), p]));
  let nextId = Math.max(...records.map(p => Number(p.id.split('-P')[1]))) + 1;
  const listings = [], candidates = [];
  for (const g of [...groups.values()].sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
    let p = byName.get(identity(g.name));
    const variants = g.entries.length > 1 ? g.entries.map(e => ({ nameEn: `${g.name} — ${e.chineseMarker ? 'Chinese (mainly Putonghua)' : 'English'}`, officialUrl: e.officialUrl })) : [];
    const pending = g.entries.some(e => e.pendingApproval);
    const noteEn = (variants.length ? 'Language versions grouped conservatively, not separate awards or interchangeable admissions criteria. Verify the selected language route. ' : 'Official taught directory lead only; admissions, delivery, applicable year, fees and dates remain unreviewed. ') + (pending ? 'The directory marks this programme as subject to University approval; neither approval nor open admissions is confirmed. ' : '') + 'A Chinese-medium marker is not an English-test waiver. Directory presence does not prove applications are open.';
    const listing = { nameEn: g.name, checkedOn: date, sourceUrl, programmeUrl: g.entries[0].officialUrl, variants, noteEn };
    validateDirectoryListing(listing);
    if (!p) {
      const id = `${school}-P${String(nextId++).padStart(3, '0')}`;
      p = { id, universityId: school, name: g.name, award: 'Master', area: 'Unclassified', faculty: null, officialUrl: listing.programmeUrl, verification: 'catalogue_seed', sourceStatus: 'Official taught directory lead; admissions unreviewed', lastChecked: date, academicYear: null, admissionRoute: 'unconfirmed', requirementsCoverage: 'unreviewed', collector: 'AI-assisted EdUHK directory reconciliation', reviewer: null, notesZh: '', notesEn: noteEn, offerings: [{ id: id + '-catalogue', mode: null, duration: null, intake: null, deadline: null, currency: null, tuition: null, feeBasis: null, academicYear: null }], rules: [], sources: [{ url: sourceUrl, purpose: 'Official taught directory listing only', checkedOn: date }], inventoryBatch: date, inventoryPass: 'eduhk-directory' };
      validateProgramme(p, schoolIds);
      expansion.programmes.push(p); byName.set(identity(g.name), p);
    }
    for (const e of g.entries) e.programmeId = p.id;
    listings.push({ programmeId: p.id, ...listing });
    candidates.push({ programmeId: p.id, name: g.name, directoryRows: g.entries.map(e => e.rowNumber), pendingApproval: pending, variants });
  }
  const inventory = { schemaVersion: 1, universityId: school, checkedOn: date, sourceUrl, observationRowsSha256: createHash('sha256').update(JSON.stringify(observation.rows)).digest('hex'), verificationLevel: 'AI-assisted directory reconciliation; no independent human review', countingUnit: 'All taught-section list rows including unlinked proposals; language versions are candidate parent groups, not confirmed separate awards. Research, doctorates and PGDE sections are not imported.', rawRowCount: 79, masterRowCount: 78, excludedRowCount: entries.filter(e => e.decision === 'exclude_non_master').length, heldRowCount: entries.filter(e => e.decision.startsWith('hold_')).length, pendingApprovalRows: entries.filter(e => e.pendingApproval).length, candidateGroupCount: candidates.length, languageVariantGroups: candidates.filter(c => c.variants.length).length, pendingApprovalGroups: candidates.filter(c => c.pendingApproval).length, confirmedProgrammeCount: null, entries, candidates };
  if (candidates.length !== 59 || inventory.excludedRowCount !== 1 || inventory.heldRowCount !== 10 || inventory.pendingApprovalRows !== 17 || inventory.languageVariantGroups !== 9 || inventory.pendingApprovalGroups !== 7) throw new Error('Unexpected EdUHK scope reconciliation');
  const incoming = new Map(listings.map(l => [l.programmeId, l]));
  if (links.listings.some(l => incoming.has(l.programmeId) && l.checkedOn > date)) throw new Error('Refusing to replace newer EdUHK listings');
  const existingIds = new Set(links.listings.map(l => l.programmeId));
  links.listings = [...links.listings.map(l => incoming.get(l.programmeId) || l), ...listings.filter(l => !existingIds.has(l.programmeId))];
  links.checkedOn = date; expansion.checkedOn = date;
  expansion.programmes.sort((a, b) => a.id.localeCompare(b.id));
  Object.assign(audit.universities.find(u => u.universityId === school), { checkedOn: date, directoryUrl: sourceUrl, listingUrl: sourceUrl, entryStatus: 'entry_checked', enumerationStatus: 'entries_enumerated', confirmedProgrammeCount: null, visibleDirectoryResultCount: 79, directoryMasterEntryCount: 78, inventoryFile: `data/research/eduhk-programme-inventory-${date}.json`, noteEn: 'All six taught-section containers read: 79 rows, one certificate excluded, ten unlinked pending-approval master rows held. Linked rows form 59 conservative candidate groups after nine language-pair merges, including seven linked groups subject to approval. These are not confirmed distinct-master totals, admissions checks or live application status. Both administrative links resolve to the same list; do not double-count it.' });
  audit.checkedOn = date; validateDirectoryAudit(audit, schoolIds);
  return { inventory, expansion, links, audit };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const output = buildEduhkInventory({ observation: read(`data/research/eduhk-directory-observation-${date}.json`), seed: read('data/catalogue.json'), checked: read('data/checked-programmes.json'), expansion: read('data/catalogue-expansion.json'), links: read('data/directory-links.json'), audit: read('data/directory-audit.json') });
  save(`data/research/eduhk-programme-inventory-${date}.json`, output.inventory);
  save('data/catalogue-expansion.json', output.expansion); save('data/directory-links.json', output.links); save('data/directory-audit.json', output.audit);
  console.log(JSON.stringify({ rows: 79, candidateGroups: output.inventory.candidateGroupCount, held: output.inventory.heldRowCount, pendingApprovalGroups: output.inventory.pendingApprovalGroups, additions: output.expansion.programmes.filter(p => p.inventoryPass === 'eduhk-directory').length, total: read('data/catalogue.json').programmes.length + output.expansion.programmes.length }, null, 2));
}
