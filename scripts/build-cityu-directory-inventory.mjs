// Reconcile one frozen, public CityU table. Never collect or infer admissions rules.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { identity } from './programme-identity.mjs';
import { isOfficialUrl, validateDirectoryListing, validateProgramme, validateDirectoryAudit } from '../server/validation.mjs';

const root = new URL('../', import.meta.url);
const date = '2026-10-20', school = 'HK-CITYU';
const read = file => JSON.parse(readFileSync(new URL(file, root), 'utf8'));
const save = (file, value) => writeFileSync(new URL(file, root), JSON.stringify(value, null, 2) + '\n');
const clean = title => title.replace(/\*/g, '').trim();
const groupName = (code, title) => ['P01A', 'P12'].includes(code) ? 'Executive Master of Business Administration' : ['P05A', 'P05B'].includes(code) ? 'MSc Business Information Systems' : clean(title);

export function buildCityuInventory(input) {
  const { observation, seed, checked } = structuredClone(input);
  const expansion = structuredClone(input.expansion), links = structuredClone(input.links), audit = structuredClone(input.audit);
  if (observation.schemaVersion !== 1 || observation.universityId !== school || observation.checkedOn !== date || observation.sourceHeading !== 'Programme List (2027/28)' || observation.rowCount !== 72 || observation.rows?.length !== 72 || observation.sourceUrl !== 'https://www.cityu.edu.hk/pg/taught-postgraduate-programmes/list' || observation.programmeUrlPrefix !== 'https://www.cityu.edu.hk/en/pg/programme/program-list/2027/') throw new Error('Incomplete or unexpected CityU observation');
  if ([expansion.checkedOn, links.checkedOn, audit.checkedOn].some(d => d > date)) throw new Error('Refusing to replace newer directory evidence');
  const schoolIds = new Set(seed.universities.map(u => u.id));
  const registry = new Map([...seed.programmes, ...expansion.programmes, ...checked.programmes].map(p => [p.id, p]));
  const records = [...registry.values()].filter(p => p.universityId === school);
  const byName = new Map(records.map(p => [identity(p.name), p]));
  let nextId = Math.max(...records.map(p => Number(p.id.split('-P')[1]))) + 1;
  const unique = new Map();
  for (const row of observation.rows) {
    const [code, title, path, mode, ...deadlines] = row;
    const url = observation.programmeUrlPrefix + path;
    if (!/^P\d+[A-Z]?$/.test(code) || typeof title !== 'string' || !title || /\p{Script=Han}/u.test(title) || !['Combined', 'Part-time', 'Full-time'].includes(mode) || ![1, 2].includes(deadlines.length) || deadlines.some(d => !/^\d{2} [A-Z][a-z]{2} \d{4}$/.test(d)) || !isOfficialUrl(url) || new URL(url).origin !== 'https://www.cityu.edu.hk' || !url.endsWith('/' + code.toLowerCase()) || new URL(url).pathname !== '/en/pg/programme/program-list/2027/' + path) throw new Error('Invalid frozen directory row');
    if (unique.has(code)) {
      if (JSON.stringify(unique.get(code).row) !== JSON.stringify(row)) throw new Error('Conflicting duplicate programme code');
      unique.get(code).occurrences++;
    } else unique.set(code, { row, occurrences: 1, officialUrl: url });
  }
  if (unique.size !== 69) throw new Error('Unexpected CityU code reconciliation');
  const entries = [], groups = new Map();
  for (const [code, raw] of unique) {
    const [, rawName, , modeLabel, ...dates] = raw.row;
    let decision = 'include_directory_lead', reasonEn = 'Master title in the official taught directory; admissions and delivery details remain unreviewed.';
    if (['P43', 'P45', 'P93'].includes(code)) { decision = 'exclude_non_master'; reasonEn = 'Juris Doctor or postgraduate certificate, outside the master-only scope.'; }
    if (code === 'P83') { decision = 'exclude_mainland_delivery'; reasonEn = 'The official programme page states that most classes are taught in Beijing, in collaboration with BNAI; excluded from Hong Kong/Singapore delivery scope.'; }
    if (code === 'P01B') { decision = 'needs_partner_reconciliation'; reasonEn = 'A Chinese EMBA concentration with an optional separately admitted Tsinghua MPA. Award, partner and delivery boundaries need reconciliation; do not count another standalone EMBA or MPA.'; }
    if (code === 'P60') { decision = 'needs_identity_reconciliation'; reasonEn = 'Current Civil Infrastructure and Building Sustainability title differs from the existing Civil and Architectural Engineering seed. No formal rename/alias has been established; do not silently relabel or add a potential duplicate.'; }
    const entry = { code, rawName, officialUrl: raw.officialUrl, occurrences: raw.occurrences, modeLabel, directoryDates: { localLabel: dates[0], nonLocalLabel: dates[1] || dates[0], sharedCell: dates.length === 1 }, decision, reasonEn };
    if (code === 'P01B') entry.relatedSeedId = 'HK-CITYU-P003';
    if (code === 'P60') entry.relatedSeedId = 'HK-CITYU-P009';
    if (code === 'P17') { entry.pendingTitleApproval = true; entry.reasonEn += ' The programme page explicitly says the title is subject to University approval; the asterisk is not treated as approval of all other starred programmes.'; }
    entries.push(entry);
    if (decision !== 'include_directory_lead') continue;
    const name = groupName(code, rawName), key = identity(name);
    if (!groups.has(key)) groups.set(key, { name, entries: [] });
    groups.get(key).entries.push(entry);
  }
  const listings = [], candidates = [];
  for (const g of [...groups.values()].sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
    let p = byName.get(identity(g.name));
    const variants = g.entries.length > 1 ? g.entries.map(e => ({ nameEn: clean(e.rawName), officialUrl: e.officialUrl })) : [];
    const noteEn = (variants.length ? 'Conservative grouping of directory language/stream routes, not a confirmed award count or interchangeable admissions criteria. Verify the specific route before any eligibility conclusion. ' : 'Official directory title and link only; intake-specific admissions, fees, dates and delivery still require checks. ') + (g.entries.some(e => e.pendingTitleApproval) ? 'The displayed programme title is subject to University approval. ' : '') + 'Directory presence does not prove applications are open.';
    const listing = { nameEn: g.name, checkedOn: date, sourceUrl: observation.sourceUrl, programmeUrl: g.entries[0].officialUrl, variants, noteEn };
    validateDirectoryListing(listing);
    if (!p) {
      const id = `${school}-P${String(nextId++).padStart(3, '0')}`;
      p = { id, universityId: school, name: g.name, award: 'Master', area: 'Unclassified', faculty: null, officialUrl: listing.programmeUrl, verification: 'catalogue_seed', sourceStatus: 'Official taught directory listing; admissions unreviewed', lastChecked: date, academicYear: null, admissionRoute: 'unconfirmed', requirementsCoverage: 'unreviewed', collector: 'AI-assisted CityU directory reconciliation', reviewer: null, notesZh: '', notesEn: noteEn, offerings: [{ id: id + '-catalogue', mode: null, duration: null, intake: null, deadline: null, currency: null, tuition: null, feeBasis: null, academicYear: null }], rules: [], sources: [{ url: observation.sourceUrl, purpose: 'Official taught directory listing only', checkedOn: date }], inventoryBatch: date, inventoryPass: 'cityu-directory' };
      validateProgramme(p, schoolIds);
      expansion.programmes.push(p); registry.set(id, p); byName.set(identity(g.name), p);
    }
    for (const e of g.entries) e.programmeId = p.id;
    listings.push({ programmeId: p.id, ...listing });
    candidates.push({ programmeId: p.id, name: g.name, directoryCodes: g.entries.map(e => e.code), variants });
  }
  const inventory = { schemaVersion: 1, universityId: school, checkedOn: date, sourceUrl: observation.sourceUrl, sourceHeading: observation.sourceHeading, observationRowsSha256: createHash('sha256').update(JSON.stringify(observation.rows)).digest('hex'), verificationLevel: 'AI-assisted directory reconciliation; not independent human review', countingUnit: 'Unique admission codes first; conservative language/stream groups are candidate parents, not confirmed distinct awards. Modes/intakes and repeated department rows do not add programmes.', rawRowCount: 72, uniqueCodeCount: unique.size, duplicateRowCount: 72 - unique.size, excludedCodeCount: entries.filter(e => e.decision.startsWith('exclude_')).length, heldCodeCount: entries.filter(e => e.decision.startsWith('needs_')).length, candidateGroupCount: candidates.length, confirmedProgrammeCount: null, entries, candidates };
  if (candidates.length !== 61 || inventory.excludedCodeCount !== 4 || inventory.heldCodeCount !== 2) throw new Error('Unexpected CityU scope reconciliation');
  const refreshedIds = new Set(listings.map(l => l.programmeId));
  if (links.listings.some(l => refreshedIds.has(l.programmeId) && l.checkedOn > date)) throw new Error('Refusing to replace newer CityU listing');
  const incoming = new Map(listings.map(l => [l.programmeId, l]));
  const existingIds = new Set(links.listings.map(l => l.programmeId));
  links.listings = [...links.listings.map(l => incoming.get(l.programmeId) || l), ...listings.filter(l => !existingIds.has(l.programmeId))];
  links.checkedOn = date;
  expansion.checkedOn = date;
  expansion.programmes.sort((a, b) => a.id.localeCompare(b.id));
  const u = audit.universities.find(u => u.universityId === school);
  Object.assign(u, { checkedOn: date, entryStatus: 'entry_checked', enumerationStatus: 'entries_enumerated', confirmedProgrammeCount: null, visibleDirectoryResultCount: 72, directoryMasterEntryCount: 65, inventoryFile: `data/research/cityu-programme-inventory-${date}.json`, noteEn: 'All 72 visible 2027/28 table rows reconciled to 69 admission codes. Four codes excluded (JD, two certificates, mostly-Beijing delivery); two held for identity/partner checks. 61 conservative candidate groups after language/stream grouping, not a confirmed distinct-master total. Dates/modes remain raw observations, not checked admissions or live-portal evidence.' });
  audit.checkedOn = date;
  validateDirectoryAudit(audit, schoolIds);
  return { inventory, expansion, links, audit };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const output = buildCityuInventory({ observation: read(`data/research/cityu-directory-observation-${date}.json`), seed: read('data/catalogue.json'), checked: read('data/checked-programmes.json'), expansion: read('data/catalogue-expansion.json'), links: read('data/directory-links.json'), audit: read('data/directory-audit.json') });
  save(`data/research/cityu-programme-inventory-${date}.json`, output.inventory);
  save('data/catalogue-expansion.json', output.expansion);
  save('data/directory-links.json', output.links);
  save('data/directory-audit.json', output.audit);
  console.log(JSON.stringify({ rows: output.inventory.rawRowCount, uniqueCodes: output.inventory.uniqueCodeCount, excluded: output.inventory.excludedCodeCount, held: output.inventory.heldCodeCount, candidateGroups: output.inventory.candidateGroupCount, cityuAdditions: output.expansion.programmes.filter(p => p.inventoryPass === 'cityu-directory').length, total: read('data/catalogue.json').programmes.length + output.expansion.programmes.length }, null, 2));
}
