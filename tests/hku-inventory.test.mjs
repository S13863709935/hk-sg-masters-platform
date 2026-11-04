import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { buildHkuInventory } from '../scripts/build-hku-directory-inventory.mjs';
import { buildPolyuInventory } from '../scripts/build-polyu-directory-inventory.mjs';
import { CatalogueStore } from '../server/database.mjs';
import { matchProgramme } from '../server/matching.mjs';

const root = new URL('../', import.meta.url);
const read = file => JSON.parse(readFileSync(new URL(file, root), 'utf8'));
const observation = read('data/research/hku-directory-observation-2026-10-20.json');
const inventory = read('data/research/hku-programme-inventory-2026-10-20.json');
const seed = read('data/catalogue.json'), checked = read('data/checked-programmes.json'), expansion = read('data/catalogue-expansion.json'), links = read('data/directory-links.json'), audit = read('data/directory-audit.json');
const input = () => structuredClone({ observation, seed, checked, expansion, links, audit });
const options = { seed, expansionPath: new URL('data/catalogue-expansion.json', root), checkedPath: new URL('data/checked-programmes.json', root), directoryAuditPath: new URL('data/directory-audit.json', root), scopeAuditPath: new URL('data/programme-scope-audit.json', root), directoryEvidencePath: new URL('data/directory-links.json', root) };
const byName = name => inventory.candidates.find(c => c.name === name);
const profile = { major: 'Computer Science', degreeStatus: 'graduated', gpa: 4, gpaScale: 4, language: { type: 'ielts', total: 9 } };

test('HKU captures all 17 pages in both applicant contexts without doubling the result count', () => {
  assert.equal(observation.rows.length, 170); assert.equal(new Set(observation.rows.map(r => r[1])).size, 170);
  assert.deepEqual(observation.applicantContextComparison.contexts, ['Local', 'Non-local']);
  assert.equal(observation.applicantContextComparison.pageCountPerContext, 17); assert.equal(observation.applicantContextComparison.allExtractedColumnsIdentical, true); assert.equal(observation.applicantContextComparison.sharedAdmissionConditionsInferred, false);
  assert.deepEqual(observation.selectedFilters.feeRange, [0, 1000000]); assert.deepEqual(observation.selectedFilters.durationRange, [1, 10]);
  assert.equal(inventory.rawRowCount, 170); assert.equal(inventory.masterRowCount, 157); assert.equal(inventory.candidateGroupCount, 99); assert.equal(inventory.confirmedProgrammeCount, null);
  assert.equal(inventory.observationRowsSha256, createHash('sha256').update(JSON.stringify(observation.rows)).digest('hex'));
});

test('doctorates, JD, certificates and diplomas never become new master leads', () => {
  const excluded = inventory.entries.filter(e => e.decision === 'exclude_non_master');
  assert.equal(excluded.length, 13); assert.ok(excluded.every(e => !e.programmeId));
  assert.ok(excluded.some(e => e.rawTitle === 'Juris Doctor')); assert.ok(excluded.some(e => e.rawTitle === 'Postgraduate Diploma in Education'));
  assert.ok(!expansion.programmes.some(p => p.inventoryPass === 'hku-directory' && !/^(Master|Executive Master)/.test(p.name)));
});

test('40 closed masters are held, with cautions attached to three existing archival seeds', () => {
  const closed = inventory.entries.filter(e => e.decision === 'hold_closed_listing');
  assert.equal(closed.length, 40); assert.ok(closed.every(e => e.closedTag && !e.programmeId));
  assert.deepEqual(inventory.retainedClosedEvidence.map(e => e.programmeId).sort(), ['HK-HKU-P012', 'HK-HKU-P013', 'HK-HKU-P014']);
  for (const e of inventory.retainedClosedEvidence) {
    const l = links.listings.find(l => l.programmeId === e.programmeId);
    assert.match(l.noteEn, /Closed directory tag/); assert.match(l.noteEn, /not a new or currently open lead/);
    assert.ok(!expansion.programmes.some(p => p.id === e.programmeId));
  }
});

test('intercalated MRes and mixed-delivery executive routes remain explicit holds', () => {
  const held = inventory.entries.filter(e => e.decision.startsWith('hold_') && !e.closedTag);
  assert.equal(held.length, 3); assert.ok(held.every(e => !e.programmeId));
  assert.match(held.find(e => e.rawTitle === 'Master of Research in Medicine').reasonEn, /HKU MBBS.*Year 2/);
  assert.match(held.find(e => e.rawTitle === 'Master of Business Administration (International)').reasonEn, /Shanghai and Hong Kong/);
  assert.match(held.find(e => e.rawTitle === 'Executive Master of Business Administration').reasonEn, /September and March/);
  assert.ok(byName('Master of Science in Innovation and Technology')); // Career references to GBA are not proof of mainland delivery.
});

test('architecture categories and scholarship paths group without inheriting category conditions', () => {
  assert.equal(byName('Master of Architecture').programmeId, 'HK-HKU-P001'); assert.equal(byName('Master of Architecture').variants.length, 2);
  assert.notEqual(byName('Master of Architecture (Design)').programmeId, 'HK-HKU-P001');
  assert.equal(byName('Master of Science in Urban Planning').variants.length, 3); assert.equal(byName('Master of Urban Design').variants.length, 2);
  assert.ok(byName('Master of Science in Urban Planning').variants.some(v => /ADB-Japan/.test(v.nameEn)));
  assert.match(links.listings.find(l => l.programmeId === 'HK-HKU-P001').noteEn, /not interchangeable requirements/);
});

test('streams and fellowships have one conservative parent with all explicit source links', () => {
  assert.equal(byName('Master of Science in Engineering (Civil Engineering)').variants.length, 4);
  assert.equal(byName('Master of Science in Engineering (Electrical and Electronic Engineering)').variants.length, 3);
  assert.equal(byName('Master of Science in Engineering (Infrastructure Engineering and Management)').variants.length, 2);
  assert.equal(byName('MSc Computer Science').programmeId, 'HK-HKU-P016'); assert.equal(byName('MSc Computer Science').variants.length, 3);
  assert.equal(byName('Master of Journalism').programmeId, 'HK-HKU-P021'); assert.equal(byName('Master of Journalism').variants.length, 2);
  assert.ok(byName('MSc Computer Science').variants.some(v => /Delta X/.test(v.nameEn)));
});

test('the unmatched Housing Management seed is preserved without an invented rename', () => {
  assert.equal(inventory.unmatchedExisting.length, 1); assert.equal(inventory.unmatchedExisting[0].programmeId, 'HK-HKU-P003');
  const current = byName('Master of Urban Studies and Housing Management'); assert.ok(current); assert.notEqual(current.programmeId, 'HK-HKU-P003');
  assert.match(links.listings.find(l => l.programmeId === current.programmeId).noteEn, /until a rename\/award relationship is verified/);
  assert.ok(!links.listings.some(l => l.programmeId === 'HK-HKU-P003'));
});

test('80 new unreviewed leads add no scores, fees, admission years or open-portal claims', () => {
  const additions = expansion.programmes.filter(p => p.inventoryPass === 'hku-directory'); assert.equal(additions.length, 80);
  for (const p of additions) {
    assert.equal(p.verification, 'catalogue_seed'); assert.equal(p.requirementsCoverage, 'unreviewed'); assert.equal(p.reviewer, null); assert.equal(p.academicYear, null); assert.deepEqual(p.rules, []);
    assert.ok(p.offerings.every(o => o.mode === null && o.intake === null && o.deadline === null && o.tuition === null));
    assert.match(p.notesEn, /Absence of a Closed tag does not prove applications are open/);
    assert.equal(/\p{Script=Han}/u.test(p.name + p.notesEn), false); assert.equal(matchProgramme(p, profile).tier, null);
  }
  for (const e of inventory.entries) assert.equal(new URL(e.officialUrl).searchParams.get('programme'), e.programmeSlug);
});

test('new directory evidence preserves Urban Analytics checked fields and all prior source dates', () => {
  const db = new CatalogueStore(':memory:', options);
  try {
    const p = db.get('HK-HKU-P007'), original = checked.programmes.find(p => p.id === 'HK-HKU-P007');
    assert.equal(p.lastChecked, original.lastChecked); assert.deepEqual(p.rules, original.rules); assert.deepEqual(p.offerings, original.offerings); assert.deepEqual(p.sources, original.sources); assert.equal(p.academicYear, original.academicYear);
    assert.equal(p.directoryListing.checkedOn, '2026-10-20');
    for (const e of inventory.retainedClosedEvidence) {
      const current = db.get(e.programmeId);
      const source = checked.programmes.find(p => p.id === e.programmeId) || seed.programmes.find(p => p.id === e.programmeId);
      assert.equal(current.lastChecked, source.lastChecked);
      assert.equal(current.directoryListing.checkedOn, '2026-10-20');
      assert.match(current.directoryListing.noteEn, /Closed directory tag/);
    }
    const q = db.quality(); assert.equal(q.total, 873); assert.equal(q.browsable, 865); assert.equal(q.checked, 401); assert.equal(q.peerReviewed, 0); assert.equal(q.complete, 0); assert.deepEqual(q.sourceRefreshConflicts, []);
  } finally { db.close(); }
  const school = audit.universities.find(u => u.universityId === 'HK-HKU'); assert.equal(school.entryStatus, 'entry_checked'); assert.equal(school.enumerationStatus, 'entries_enumerated'); assert.equal(school.confirmedProgrammeCount, null); assert.equal(audit.fullScopeEnumerationComplete, false);
});

test('HKU and PolyU rebuilds are pure, idempotent and preserve each other', () => {
  const data = input(), before = JSON.stringify(data), out = buildHkuInventory(data);
  assert.equal(JSON.stringify(data), before); assert.deepEqual(out.inventory, inventory);
  for (const key of ['expansion', 'links', 'audit']) assert.deepEqual(out[key], data[key]);
  const other = buildPolyuInventory({ ...input(), observation: read('data/research/polyu-directory-observation-2026-10-20.json') });
  for (const key of ['expansion', 'links', 'audit']) assert.deepEqual(other[key], data[key]);
});

test('wrong filters, incomplete contexts, unsafe slugs, duplicate identities and newer data fail closed', () => {
  for (const mutate of [d => d.observation.selectedFilters.hideClosed = true, d => d.observation.selectedFilters.fullTime = false, d => d.observation.selectedFilters.feeRange[1] = 100, d => d.observation.applicantContextComparison.allExtractedColumnsIdentical = false, d => d.observation.applicantContextComparison.contexts.pop(), d => d.observation.rows.pop(), d => d.observation.rows[0][1] = 'fake&token=secret', d => d.observation.rows[0][1] = '../fake', d => d.observation.rows[1][1] = d.observation.rows[0][1], d => d.observation.rows[0][2] = 'false', d => d.audit.checkedOn = '2026-10-21', d => d.links.listings.find(l => l.programmeId === 'HK-HKU-P001').checkedOn = '2026-10-21']) {
    const data = input(); mutate(data); assert.throws(() => buildHkuInventory(data));
  }
});
