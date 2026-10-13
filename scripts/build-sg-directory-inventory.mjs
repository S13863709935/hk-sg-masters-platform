// Reproducible scope decisions over the frozen Oct-13 observations, not a crawler.
import { readFileSync, writeFileSync } from 'node:fs';
import { identity } from './programme-identity.mjs';
import { validateProgramme, isOfficialUrl } from '../server/validation.mjs';

const root = new URL('../', import.meta.url);
const read = file => JSON.parse(readFileSync(new URL(file, root), 'utf8'));
const save = (file, data) => writeFileSync(new URL(file, root), JSON.stringify(data, null, 2) + '\n');
const date = '2026-10-13';
const seed = read('data/catalogue.json');
const checked = read('data/checked-programmes.json');
const previous = read('data/catalogue-expansion.json');
if (previous.checkedOn > date) throw new Error('Refusing to replace a newer inventory with this historical batch');
const schoolIds = new Set(seed.universities.map(u => u.id));
const observation = read('data/research/smu-directory-observation-2026-10-13.json');
if (observation.entries.length !== 18 || observation.entries.some(e => !isOfficialUrl(e.url))) throw new Error('SMU source reconciliation failed');
const smuEntries = observation.entries.map(e => ({ name: e.title.replace(/\s+\([A-Za-z0-9]+\)$/, ''), officialUrl: e.url, decision: /Juris Doctor/.test(e.title) ? 'exclude' : 'include_directory_lead', reasonEn: /Juris Doctor/.test(e.title) ? 'Juris Doctor is outside the master-only scope.' : 'Named master in the official professional postgraduate directory; programme admissions still unreviewed.' }));
const inventories = [{ universityId: 'SG-SMU', sourceUrls: [observation.sourceUrl], checkedOn: date, enumerationStatus: 'complete_for_consulted_directory', includedProgrammeCount: 17, rawEntryCount: 18, entries: smuEntries }];

const sutdPages = [1, 2].map(n => read(`data/research/sutd-coursework-page${n}-${date}.json`).sources[0]);
if (sutdPages.some(p => p.visibleResultCount !== 18 || !p.requestedUrl.includes('programme-level=769'))) throw new Error('SUTD coursework filter or result count changed');
const sutdEntries = sutdPages.flatMap(p => p.headings).map(e => ({ name: e.title.replace(/\s+\(MArch\)$/, ''), officialUrl: e.url, decision: 'include_directory_lead', reasonEn: 'Listed after applying the official Master by Coursework filter; separately named MTD routes retain their own identities. Admissions still unreviewed.' }));
if (sutdEntries.length !== 18 || new Set(sutdEntries.map(e => e.officialUrl)).size !== 18 || sutdEntries.some(e => !isOfficialUrl(e.officialUrl))) throw new Error('SUTD two-page reconciliation failed');
inventories.push({ universityId: 'SG-SUTD', sourceUrls: sutdPages.map(p => p.requestedUrl), sourceSha256s: sutdPages.map(p => p.sourceSha256), checkedOn: date, enumerationStatus: 'complete_for_consulted_directory', includedProgrammeCount: 18, rawEntryCount: 18, excludedFromUnfilteredDirectory: ['Master of Engineering (Interdisciplinary)', 'Master of Engineering (Innovation by Design)', 'SUTD-CGU Dual Masters Programme in Nano-Electronics Engineering and Design'], entries: sutdEntries });

const suss = read('data/research/suss-directory-observation-2026-10-13.json');
const researchNames = new Set(['Master of Applied Research in Social Sciences', 'Master of Engineering']);
const sussEntries = suss.entries.map(e => {
  const chinese = /\p{Script=Han}/u.test(e.title);
  let name = e.title.replace(/[\p{Script=Han}].*$/u, '').trim();
  if (chinese && !name.includes('(Chinese)')) name += ' (Chinese)';
  let decision = 'include_directory_lead', reasonEn = 'Named master directory lead; programme type, delivery, applicant categories and admissions need individual page checks.';
  if (/Doctor|Juris/.test(name)) { decision = 'exclude'; reasonEn = 'Doctoral or Juris Doctor award is outside the master-only scope.'; }
  else if (researchNames.has(name)) { decision = 'exclude'; reasonEn = 'The official programme page identifies a research degree with a research thesis/qualifying examination.'; }
  else if (name.startsWith('SUSS Master')) { decision = 'needs_route_reconciliation'; reasonEn = 'SUSS-FHNW dual-degree pathway. Retained separately as research evidence; not an extra standalone SUSS award or interchangeable with ordinary admission rules.'; }
  const entry = { name, officialUrl: e.url, decision, reasonEn };
  if (researchNames.has(name)) entry.typeEvidenceUrl = e.url;
  if (name === 'Master of Social Sciences') { entry.typeEvidenceUrl = e.url; entry.reasonEn = 'Coursework-led stackable route: two graduate diplomas (60 cu) and a 10 cu applied research project. A research project alone does not make this a research degree; route eligibility remains unreviewed.'; }
  return entry;
});
if (sussEntries.length !== 38 || sussEntries.filter(e => e.decision === 'include_directory_lead').length !== 28) throw new Error('SUSS directory reconciliation failed');
inventories.push({ universityId: 'SG-SUSS', sourceUrls: [suss.sourceUrl], checkedOn: date, enumerationStatus: 'entries_enumerated', includedProgrammeCount: null, directoryMasterEntryCount: 28, rawEntryCount: 38, entries: sussEntries });

const sit = read('data/research/sit-directory-observation-2026-10-13.json');
inventories.push({ universityId: 'SG-SIT', sourceUrls: [sit.sourceUrl], checkedOn: date, enumerationStatus: 'complete_for_consulted_directory', includedProgrammeCount: 4, rawEntryCount: 4, entries: sit.entries.map(e => ({ name: e.title, officialUrl: e.url, decision: 'include_directory_lead', reasonEn: 'One of the four awards in the explicit Programmes by Coursework table. Stackable pathways, modes and intakes are not extra awards.' })) });

const registry = new Map([...seed.programmes, ...previous.programmes, ...checked.programmes].map(p => [p.id, p]));
const expansion = new Map(previous.programmes.map(p => [p.id, p]));
for (const inventory of inventories) {
  const records = [...registry.values()].filter(p => p.universityId === inventory.universityId);
  const byName = new Map(records.map(p => [identity(p.name), p]));
  let nextId = Math.max(...records.map(p => Number(p.id.split('-P')[1]))) + 1;
  for (const e of inventory.entries.filter(e => e.decision === 'include_directory_lead').sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
    const existing = byName.get(identity(e.name));
    if (existing) { e.programmeId = existing.id; e.registryAction = 'existing_id_preserved'; continue; }
    const id = `${inventory.universityId}-P${String(nextId++).padStart(3, '0')}`;
    const p = { id, universityId: inventory.universityId, name: e.name, award: 'Master', area: 'Unclassified', faculty: null, officialUrl: e.officialUrl, verification: 'catalogue_seed', sourceStatus: 'Official directory lead; admissions and applicable intake not collected', lastChecked: date, academicYear: null, admissionRoute: 'unconfirmed', requirementsCoverage: 'unreviewed', collector: 'AI-assisted directory enumeration', reviewer: null, notesZh: '', notesEn: e.reasonEn + ' No eligibility conclusion or admission probability. Directory presence does not prove applications are open.', offerings: [{ id: `${id}-catalogue`, mode: null, duration: null, intake: null, deadline: null, currency: null, tuition: null, feeBasis: null, academicYear: null }], rules: [], sources: inventory.sourceUrls.map(url => ({ url, purpose: 'Official directory listing only', checkedOn: date })), inventoryBatch: date };
    validateProgramme(p, schoolIds);
    expansion.set(id, p); registry.set(id, p); byName.set(identity(e.name), p);
    e.programmeId = id; e.registryAction = 'new_unreviewed_directory_lead';
  }
}
save(`data/research/sg-programme-inventory-${date}.json`, { schemaVersion: 1, checkedOn: date, countingUnit: 'Distinct listed master programme, including separately named SUTD MTD routes. Modes and intakes are not extra programmes; SUSS-FHNW dual pathways are held separately for reconciliation.', reviewer: null, inventories });
save('data/catalogue-expansion.json', { schemaVersion: 1, checkedOn: date, description: 'Additional unreviewed directory leads; original catalogue.json and earlier research snapshots are unchanged.', programmes: [...expansion.values()].sort((a,b) => a.id.localeCompare(b.id)) });
const audit = read('data/directory-audit.json');
audit.checkedOn = date;
for (const i of inventories) {
  const u = audit.universities.find(u => u.universityId === i.universityId);
  Object.assign(u, { checkedOn: date, entryStatus: 'entry_checked', enumerationStatus: i.enumerationStatus, confirmedProgrammeCount: i.includedProgrammeCount, visibleDirectoryResultCount: i.rawEntryCount, inventoryFile: `data/research/sg-programme-inventory-${date}.json` });
  if (i.universityId === 'SG-SMU') u.noteEn = '18 professional postgraduate cards reconciled to 17 masters after excluding JD. Executive/Chinese-language awards stay in institutional scope; tracks are not added. Older advertised dates do not prove current applications are open.';
  if (i.universityId === 'SG-SUTD') { u.directoryUrl = i.sourceUrls[0]; u.listingUrl = i.sourceUrls[1]; u.noteEn = '18 distinct coursework listings across both filtered pages, reconciled against 21 unfiltered entries. Three research routes excluded, including Innovation by Design. Individually named MTD routes count separately; modes/intakes do not.'; }
  if (i.universityId === 'SG-SUSS') { u.directoryMasterEntryCount = 28; u.noteEn = '38 master/doctor/JD/dual-pathway links enumerated across all school sections: 28 master leads remain after excluding four doctorates, JD and two confirmed research masters; three dual pathways held separately. Remaining programme-level type/delivery checks are pending; 28 is not a confirmed taught-master total. Social Sciences is coursework-led and not excluded just for having a project.'; }
  if (i.universityId === 'SG-SIT') u.noteEn = 'The explicit Programmes by Coursework table still lists four awards: Health Sciences, Civil Engineering, Electrical and Electronic Engineering, Mechanical Engineering. Research table excluded. Health Sciences now links to a CSM pathway; course/pathway admissions need checking without counting them as duplicate awards.';
}
save('data/directory-audit.json', audit);
console.log(JSON.stringify({ counts: inventories.map(i=>({school:i.universityId,confirmed:i.includedProgrammeCount,candidates:i.directoryMasterEntryCount})), expansion:expansion.size,total:seed.programmes.length+expansion.size },null,2));
