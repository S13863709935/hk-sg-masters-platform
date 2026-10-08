// Scope-specific inventory rules reviewed for the 2026-10-08 directory pass.
// Outputs are directory leads, never complete admissions records or peer review.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { isOfficialUrl, validateProgramme } from '../server/validation.mjs';
import { identity } from './programme-identity.mjs';

const root = new URL('../', import.meta.url);
const read = path => JSON.parse(readFileSync(new URL(path, root), 'utf8'));
const raw = read('data/research/directory-candidates-2026-10-08.json');
const cuhk = read('data/research/cuhk-structure-2026-10-08.json').sources[0];
const seed = read('data/catalogue.json');
const checked = read('data/checked-programmes.json');
const expansionUrl = new URL('data/catalogue-expansion.json', root);
const previous = existsSync(expansionUrl) ? read('data/catalogue-expansion.json') : { programmes: [] };
const date = '2026-10-08';

const inventories = [];
for (const universityId of ['HK-HKBU', 'HK-LU', 'HK-CUHK', 'HK-POLYU']) {
  const source = universityId === 'HK-CUHK' ? cuhk : raw.sources.find(s => s.universityId === universityId);
  let candidates = source.candidates.filter(c => universityId === 'HK-HKBU' ? c.url.includes('/tpg-admissions/programmes/') : universityId === 'HK-LU' ? c.url.includes('/sgs/programmes-on-offer/') : universityId === 'HK-CUHK' ? c.url.includes('/programmes/') && c.parentMeta.some(m => /(?:Taught|Research)Programmes/.test(m.class || '')) : c.url.includes('/study/pg/tpg/'));
  const grouped = new Map();
  for (const c of candidates) {
    const key = universityId === 'HK-POLYU' ? c.url : identity(c.title);
    const existing = grouped.get(key);
    if (existing) { existing.occurrences++; if (!existing.urls.includes(c.url)) existing.urls.push(c.url); }
    else grouped.set(key, { name: c.title.replace(/\*+$/, '').trim(), url: c.url, urls: [c.url], occurrences: 1, evidence: c });
  }
  const entries = [...grouped.values()].map(item => {
    const e = item.evidence;
    let decision = 'include_directory_lead', reason = 'Named master listed in the consulted taught directory; individual admissions and delivery details still need checking.';
    if (universityId === 'HK-CUHK' && e.parentMeta.some(m => /ResearchProgrammes/.test(m.class || ''))) { decision = 'exclude'; reason = 'Explicitly placed in the official Research Programmes column.'; }
    else if (/\bdoctor\b/i.test(item.name)) { decision = 'exclude'; reason = 'Doctoral/Juris Doctor or combined JD/MBA award is outside the strict master-only scope.'; }
    else if (/BNBU|Zhuhai|offered in Shanghai|offered in Shenzhen/i.test(item.name)) { decision = 'exclude'; reason = 'Directory explicitly identifies delivery outside Hong Kong.'; }
    else if (universityId === 'HK-POLYU') { decision = 'needs_scheme_reconciliation'; reason = 'Directory entry enumerated; schemes/award variants and pending approvals need reconciliation before a programme total is stated.'; }
    const result = { name: item.name, officialUrl: item.url, alternateUrls: item.urls.filter(url => url !== item.url), occurrences: item.occurrences, decision, reasonEn: reason, listingNote: universityId === 'HK-LU' ? e.context : null, pendingApproval: universityId === 'HK-POLYU' && /subject to approval/i.test(item.name) };
    if (universityId === 'HK-CUHK') result.directoryType = e.parentMeta.some(m => /TaughtProgrammes/.test(m.class || '')) ? 'taught' : 'research';
    if (universityId === 'HK-LU' && /Master of Research/.test(item.name)) result.typeEvidenceUrl = 'https://www.ln.edu.hk/sds/programmes-and-courses';
    return result;
  });
  const included = entries.filter(e => e.decision === 'include_directory_lead');
  inventories.push({ universityId, sourceUrl: source.requestedUrl, checkedOn: date, sourceSha256: source.sourceSha256, verificationLevel: 'AI-assisted directory scope check; not independent human review', rawProgrammeAnchorCount: candidates.length, uniqueEntryCount: entries.length, includedProgrammeCount: universityId === 'HK-POLYU' ? null : included.length, excludedCount: entries.filter(e => e.decision === 'exclude').length, entries });
}

const registry = new Map([...seed.programmes, ...checked.programmes, ...previous.programmes].map(p => [p.id, p]));
const schoolIds = new Set(seed.universities.map(u => u.id));
const expansion = new Map(previous.programmes.map(p => [p.id, p]));
for (const inventory of inventories.filter(i => i.includedProgrammeCount !== null)) {
  const existingByName = new Map([...registry.values()].filter(p => p.universityId === inventory.universityId).map(p => [identity(p.name), p]));
  let nextId = Math.max(...[...registry.values()].filter(p => p.universityId === inventory.universityId).map(p => Number(p.id.split('-P')[1]))) + 1;
  for (const e of inventory.entries.filter(e => e.decision === 'include_directory_lead').sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
    const existing = existingByName.get(identity(e.name));
    if (existing) { e.programmeId = existing.id; e.registryAction = 'existing_id_preserved'; continue; }
    const id = `${inventory.universityId}-P${String(nextId++).padStart(3, '0')}`;
    const p = { id, universityId: inventory.universityId, name: e.name, award: 'Master', area: 'Unclassified', faculty: null, officialUrl: e.officialUrl, verification: 'catalogue_seed', sourceStatus: 'Official taught directory listing checked; programme admissions not yet collected', lastChecked: date, academicYear: null, admissionRoute: 'unconfirmed', requirementsCoverage: 'unreviewed', collector: 'AI-assisted directory extraction and scope check', reviewer: null, notesZh: '', notesEn: 'Official directory lead only. Undergraduate fields, academic thresholds, English requirements, intake dates, tuition and delivery details still need programme-page checks. Directory presence does not prove applications are open.', offerings: [{ id: `${id}-catalogue`, mode: null, duration: null, intake: null, deadline: null, currency: null, tuition: null, feeBasis: null, academicYear: null }], rules: [], sources: [{ url: inventory.sourceUrl, purpose: 'Official directory listing only', checkedOn: date }], inventoryBatch: date };
    validateProgramme(p, schoolIds);
    if (!isOfficialUrl(p.officialUrl)) throw new Error('Unofficial programme URL');
    expansion.set(id, p); registry.set(id, p); existingByName.set(identity(e.name), p);
    e.programmeId = id; e.registryAction = 'new_unreviewed_directory_lead';
  }
}
const inventoryDocument = { schemaVersion: 1, checkedOn: date, countingUnit: 'Distinct named programme/award in the consulted directory. Modes/intakes are not added; annotated cross-faculty duplicates are merged. PolyU schemes are not yet treated as final programme counts.', reviewer: null, inventories };
writeFileSync(new URL('data/research/programme-inventory-2026-10-08.json', root), JSON.stringify(inventoryDocument, null, 2) + '\n');
const expansionDocument = { schemaVersion: 1, checkedOn: date, description: 'Additional unreviewed directory leads; original catalogue.json is unchanged.', programmes: [...expansion.values()].sort((a, b) => a.id.localeCompare(b.id)) };
writeFileSync(expansionUrl, JSON.stringify(expansionDocument, null, 2) + '\n');
console.log(JSON.stringify({ inventoryCounts: inventories.map(i => ({ universityId: i.universityId, included: i.includedProgrammeCount, excluded: i.excludedCount, uniqueEntries: i.uniqueEntryCount })), expansionRecords: expansion.size, totalStoredAfterImport: seed.programmes.length + expansion.size }, null, 2));
