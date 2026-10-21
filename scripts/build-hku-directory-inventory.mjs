// Frozen public-directory evidence only; no admissions or live-portal imports.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { identity } from './programme-identity.mjs';
import { validateProgramme, validateDirectoryListing, validateDirectoryAudit, isOfficialUrl } from '../server/validation.mjs';

const root = new URL('../', import.meta.url), date = '2026-10-20', school = 'HK-HKU';
const sourceUrl = 'https://portal.hku.hk/tpg-admissions/programme-listing';
const prefix = 'https://portal.hku.hk/tpg-admissions/programme-details?programme=';
const read = file => JSON.parse(readFileSync(new URL(file, root), 'utf8'));
const save = (file, value) => writeFileSync(new URL(file, root), JSON.stringify(value, null, 2) + '\n');
const filters = { keyword: '', faculty: '', fullTime: true, partTime: true, hideClosed: false, feeRange: [0, 1000000], durationRange: [1, 10] };
const held = {
  'master-of-research-in-medicine-med': ['hold_intercalated_route', 'The page specifies an intercalated year for HKU MBBS students who have completed Year 2, not a general graduate-entry master. Do not exclude it just because its title says Research.'],
  'master-of-business-administration-(international)-hkubs': ['hold_delivery_reconciliation', 'The page identifies a joint HKU/Fudan part-time programme taught in Shanghai and Hong Kong. Reconcile partner and delivery boundaries before adding a Hong Kong lead.'],
  'executive-master-of-business-administration-hkubs': ['hold_route_reconciliation', 'The page describes September and March EMBA streams, with required overseas courses in the international stream. Reconcile stream identity/delivery rather than assuming every route is wholly in Hong Kong.']
};

function nameOf(title) {
  let name = title.replace(' in the field of ', ' in ');
  if (/^Master of Architecture \((?:non-HK|UGC funded)/.test(name)) return 'Master of Architecture';
  if (/^Master of Science in Conservation \(/.test(name)) return 'Master of Science in Conservation';
  if (/^Master of Science in Urban Planning \(/.test(name)) return 'Master of Science in Urban Planning';
  if (/^Master of Urban Design \(For /.test(name)) return 'Master of Urban Design';
  if (/^Master of Urban Studies and Housing Management \(/.test(name)) return 'Master of Urban Studies and Housing Management';
  if (/^Master of Science in Engineering \(/.test(name)) return name.replace(/ - .+ Stream$/, '');
  if (/^Master of Journalism - /.test(name)) return 'Master of Journalism';
  if (/^Master of Science in Computer Science \(/.test(name)) return 'MSc Computer Science';
  if (name === 'Master of Arts in Teaching English to Speakers of Other Languages') return 'MA TESOL';
  return name;
}

export function buildHkuInventory(input) {
  const { observation, seed, checked, expansion, links, audit } = structuredClone(input);
  const comparison = observation.applicantContextComparison;
  if (observation.schemaVersion !== 1 || observation.universityId !== school || observation.checkedOn !== date || observation.sourceUrl !== sourceUrl || observation.programmeUrlPrefix !== prefix || observation.rowCount !== 170 || observation.rows?.length !== 170 || JSON.stringify(observation.selectedFilters) !== JSON.stringify(filters) || JSON.stringify(comparison?.contexts) !== JSON.stringify(['Local', 'Non-local']) || comparison.pageCountPerContext !== 17 || comparison.rowCountPerContext !== 170 || comparison.allExtractedColumnsIdentical !== true || comparison.sharedAdmissionConditionsInferred !== false) throw new Error('Invalid or incomplete HKU directory capture');
  if ([expansion.checkedOn, links.checkedOn, audit.checkedOn, audit.universities.find(u => u.universityId === school)?.checkedOn].some(d => d > date)) throw new Error('Refusing to replace newer HKU evidence');
  const entries = [], groups = new Map(), slugs = new Set();
  for (const [index, row] of observation.rows.entries()) {
    if (!Array.isArray(row) || row.length !== 3) throw new Error('Invalid HKU row');
    const [rawTitle, slug, closedTag] = row;
    if (typeof rawTitle !== 'string' || !rawTitle || /\p{Script=Han}/u.test(rawTitle) || typeof slug !== 'string' || !/^[a-z0-9(),:'-]+$/.test(slug) || slugs.has(slug) || typeof closedTag !== 'boolean') throw new Error('Invalid or duplicate HKU directory identity');
    slugs.add(slug);
    const officialUrl = prefix + encodeURIComponent(slug) + '&mode=0';
    if (!isOfficialUrl(officialUrl)) throw new Error('Unofficial HKU URL');
    let decision = 'include_directory_lead', reasonEn = 'Named master in the consulted taught directory; absence of a Closed tag is not evidence of open admissions.';
    if (!/^(?:Master|Executive Master)\b/.test(rawTitle)) { decision = 'exclude_non_master'; reasonEn = 'Doctoral, Juris Doctor, diploma or certificate award is outside the master-only scope.'; }
    else if (closedTag) { decision = 'hold_closed_listing'; reasonEn = 'Closed tag observed in both applicant-context result views. Hold a new lead; do not infer the applicable cycle or future availability from this directory tag.'; }
    else if (held[slug]) [decision, reasonEn] = held[slug];
    const e = { rowNumber: index + 1, rawTitle, programmeSlug: slug, closedTag, officialUrl, decision, reasonEn };
    entries.push(e);
    if (decision !== 'include_directory_lead') continue;
    const name = nameOf(rawTitle), key = identity(name);
    if (!groups.has(key)) groups.set(key, { name, entries: [] });
    groups.get(key).entries.push(e);
  }
  const schoolIds = new Set(seed.universities.map(u => u.id));
  const registry = new Map([...seed.programmes, ...expansion.programmes, ...checked.programmes].map(p => [p.id, p]));
  const records = [...registry.values()].filter(p => p.universityId === school), byName = new Map(records.map(p => [identity(p.name), p]));
  let nextId = Math.max(0, ...records.map(p => Number(p.id.match(/-P(\d+)$/)?.[1]))) + 1;
  const listings = [], candidates = [], retainedClosedEvidence = [];
  for (const g of [...groups.values()].sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
    let p = byName.get(identity(g.name));
    const variants = g.entries.length > 1 ? g.entries.map(e => ({ nameEn: e.rawTitle, officialUrl: e.officialUrl })) : [];
    const noteEn = 'Directory evidence only, captured with the displayed default fee/duration ranges. The directory mixes intake cycles; the applicable admissions year is not established here. Local and Non-local result columns matched, not their admissions conditions. ' + (variants.length ? 'Applicant-category, scholarship, stream and fellowship references are grouped, not interchangeable requirements or extra awards; check the exact official route. ' : '') + (g.name === 'Master of Urban Studies and Housing Management' ? 'The older Housing Management seed is retained separately until a rename/award relationship is verified. ' : '') + 'This observation does not refresh checked fees, dates or rules. Programme-specific delivery/admissions remain unreviewed. Absence of a Closed tag does not prove applications are open.';
    const listing = { nameEn: g.name, checkedOn: date, sourceUrl, programmeUrl: g.entries[0].officialUrl, variants, noteEn };
    validateDirectoryListing(listing);
    if (!p) {
      const id = `${school}-P${String(nextId++).padStart(3, '0')}`;
      p = { id, universityId: school, name: g.name, award: 'Master', area: 'Unclassified', faculty: null, officialUrl: listing.programmeUrl, verification: 'catalogue_seed', sourceStatus: 'Official taught directory listing; programme admissions unreviewed', lastChecked: date, academicYear: null, admissionRoute: 'unconfirmed', requirementsCoverage: 'unreviewed', collector: 'AI-assisted HKU directory reconciliation', reviewer: null, notesZh: '', notesEn: noteEn, offerings: [{ id: id + '-catalogue', mode: null, duration: null, intake: null, deadline: null, currency: null, tuition: null, feeBasis: null, academicYear: null }], rules: [], sources: [{ url: sourceUrl, purpose: 'Official taught directory only', checkedOn: date }], inventoryBatch: date, inventoryPass: 'hku-directory' };
      validateProgramme(p, schoolIds); expansion.programmes.push(p); byName.set(identity(g.name), p);
    }
    for (const e of g.entries) e.programmeId = p.id;
    listings.push({ programmeId: p.id, ...listing });
    candidates.push({ programmeId: p.id, name: g.name, directoryRows: g.entries.map(e => e.rowNumber), variants });
  }
  for (const e of entries.filter(e => e.decision === 'hold_closed_listing')) {
    const p = byName.get(identity(nameOf(e.rawTitle)));
    if (!p) continue;
    const listing = { programmeId: p.id, nameEn: e.rawTitle, checkedOn: date, sourceUrl, programmeUrl: e.officialUrl, variants: [], noteEn: 'Closed directory tag observed in both Local and Non-local result views on 20 October 2026. The applicable intake is not established here; this is not a live application-portal check. The existing archival seed is retained, not a new or currently open lead. Existing admissions, fees and source dates are unchanged.' };
    validateDirectoryListing(listing); listings.push(listing); e.retainedExistingId = p.id;
    retainedClosedEvidence.push({ programmeId: p.id, rowNumber: e.rowNumber });
  }
  const representedIds = new Set([...candidates.map(c => c.programmeId), ...retainedClosedEvidence.map(e => e.programmeId)]);
  const unmatchedExisting = records.filter(p => !representedIds.has(p.id)).map(p => ({ programmeId: p.id, name: p.name, reasonEn: 'No confirmed exact identity in this capture. Preserve the historical seed; do not infer a rename, closure or deletion.' }));
  const inventory = { schemaVersion: 1, universityId: school, checkedOn: date, sourceUrl, observationRowsSha256: createHash('sha256').update(JSON.stringify(observation.rows)).digest('hex'), verificationLevel: 'AI-assisted directory and targeted boundary checks; not independent human review', countingUnit: '170 result rows in each applicant context, counted once. Category/scholarship/stream/fellowship variants are grouped conservatively; closed masters held and non-masters excluded. Default fee/duration filters and unresolved identities prevent an exact university-wide total.', rawRowCount: entries.length, excludedRowCount: entries.filter(e => e.decision === 'exclude_non_master').length, heldRowCount: entries.filter(e => e.decision.startsWith('hold_')).length, masterRowCount: entries.filter(e => e.decision !== 'exclude_non_master').length, candidateGroupCount: candidates.length, confirmedProgrammeCount: null, entries, candidates, retainedClosedEvidence, unmatchedExisting };
  if (inventory.excludedRowCount !== 13 || inventory.heldRowCount !== 43 || candidates.length !== 99 || retainedClosedEvidence.length !== 3 || unmatchedExisting.length !== 1) throw new Error(`Unexpected HKU reconciliation: ${JSON.stringify({ excluded: inventory.excludedRowCount, held: inventory.heldRowCount, groups: candidates.length, retainedClosed: retainedClosedEvidence.length, unmatched: unmatchedExisting.length })}`);
  const incoming = new Map(listings.map(l => [l.programmeId, l])), existingIds = new Set(links.listings.map(l => l.programmeId));
  if (listings.length !== incoming.size || links.listings.some(l => incoming.has(l.programmeId) && l.checkedOn > date)) throw new Error('Duplicate or newer HKU directory evidence');
  links.listings = [...links.listings.map(l => incoming.get(l.programmeId) || l), ...listings.filter(l => !existingIds.has(l.programmeId))];
  links.checkedOn = date; expansion.checkedOn = date; expansion.programmes.sort((a, b) => a.id.localeCompare(b.id));
  const schoolAudit = audit.universities.find(u => u.universityId === school);
  if (!schoolAudit) throw new Error('Missing HKU audit');
  Object.assign(schoolAudit, { checkedOn: date, entryStatus: 'entry_checked', enumerationStatus: 'entries_enumerated', confirmedProgrammeCount: null, visibleDirectoryResultCount: 170, directoryMasterEntryCount: 157, inventoryFile: `data/research/hku-programme-inventory-${date}.json`, noteEn: '17 pages / 170 rows in each Local and Non-local view; extracted titles, links and Closed tags matched exactly, counted once. Default fee/duration ranges apply. Exclude 13 non-masters; hold 40 closed master rows and three intercalated/route/delivery cases. 99 conservative candidate groups; retain three existing closed seeds with directory cautions and one unmatched historical Housing Management seed. No exact distinct-master total, shared category conditions or live-open status is asserted.' });
  audit.checkedOn = date; validateDirectoryAudit(audit, schoolIds);
  return { inventory, expansion, links, audit };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const output = buildHkuInventory({ observation: read(`data/research/hku-directory-observation-${date}.json`), seed: read('data/catalogue.json'), checked: read('data/checked-programmes.json'), expansion: read('data/catalogue-expansion.json'), links: read('data/directory-links.json'), audit: read('data/directory-audit.json') });
  save(`data/research/hku-programme-inventory-${date}.json`, output.inventory); save('data/catalogue-expansion.json', output.expansion); save('data/directory-links.json', output.links); save('data/directory-audit.json', output.audit);
  console.log(JSON.stringify({ candidateGroups: output.inventory.candidateGroupCount, additions: output.expansion.programmes.filter(p => p.inventoryPass === 'hku-directory').length, total: read('data/catalogue.json').programmes.length + output.expansion.programmes.length }, null, 2));
}
