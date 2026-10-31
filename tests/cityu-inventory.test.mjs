import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { buildCityuInventory } from '../scripts/build-cityu-directory-inventory.mjs';
import { CatalogueStore } from '../server/database.mjs';
import { matchProgramme } from '../server/matching.mjs';

const root = new URL('../', import.meta.url);
const read = file => JSON.parse(readFileSync(new URL(file, root), 'utf8'));
const observation = read('data/research/cityu-directory-observation-2026-10-20.json');
const inventory = read('data/research/cityu-programme-inventory-2026-10-20.json');
const seed = read('data/catalogue.json'), expansion = read('data/catalogue-expansion.json'), checked = read('data/checked-programmes.json'), links = read('data/directory-links.json'), audit = read('data/directory-audit.json');
const input = () => structuredClone({ observation, seed, expansion, checked, links, audit });
const options = { seed, expansionPath: new URL('data/catalogue-expansion.json', root), checkedPath: new URL('data/checked-programmes.json', root), directoryAuditPath: new URL('data/directory-audit.json', root), scopeAuditPath: new URL('data/programme-scope-audit.json', root), directoryEvidencePath: new URL('data/directory-links.json', root) };
const profile = { major: 'Computer Science', degreeStatus: 'graduated', gpa: 4, gpaScale: 4, language: { type: 'ielts', total: 9 } };

test('CityU frozen rows reconcile to codes, not inflated programme or admissions counts', () => {
  assert.equal(observation.rows.length, 72); assert.equal(new Set(observation.rows.map(r => r[0])).size, 69);
  assert.equal(inventory.rawRowCount, 72); assert.equal(inventory.duplicateRowCount, 3);
  assert.equal(inventory.excludedCodeCount, 4); assert.equal(inventory.heldCodeCount, 2);
  assert.equal(inventory.candidateGroupCount, 61); assert.equal(inventory.confirmedProgrammeCount, null);
  assert.equal(inventory.observationRowsSha256, createHash('sha256').update(JSON.stringify(observation.rows)).digest('hex'));
  assert.equal(inventory.entries.find(e => e.code === 'P84').occurrences, 3);
  assert.equal(inventory.entries.find(e => e.code === 'P17').occurrences, 2);
});

test('JD, certificates and mostly-Beijing delivery are excluded without guessing from asterisks', () => {
  const excluded = inventory.entries.filter(e => e.decision.startsWith('exclude_'));
  assert.deepEqual(excluded.map(e => e.code).sort(), ['P43', 'P45', 'P83', 'P93']);
  assert.ok(excluded.every(e => !e.programmeId));
  assert.match(excluded.find(e => e.code === 'P83').reasonEn, /most classes.*Beijing/);
  const digital = inventory.entries.find(e => e.code === 'P17');
  assert.equal(digital.pendingTitleApproval, true); assert.equal(digital.programmeId, 'HK-CITYU-P007');
  assert.match(links.listings.find(l => l.programmeId === digital.programmeId).noteEn, /title is subject to University approval/);
});

test('partner and possible renamed Civil route remain held, without copying or replacing seed identities', () => {
  const held = inventory.entries.filter(e => e.decision.startsWith('needs_'));
  assert.deepEqual(held.map(e => [e.code, e.relatedSeedId]), [['P01B', 'HK-CITYU-P003'], ['P60', 'HK-CITYU-P009']]);
  assert.ok(held.every(e => !e.programmeId));
  assert.ok(!expansion.programmes.some(p => p.name === 'MSc Civil Infrastructure and Building Sustainability'));
  assert.ok(!links.listings.some(l => l.programmeId === 'HK-CITYU-P009'));
  assert.equal(seed.programmes.find(p => p.id === 'HK-CITYU-P009').name, 'MSc Civil and Architectural Engineering');
});

test('EMBA languages and BIS streams are grouped as unresolved routes rather than separate programmes', () => {
  const emba = inventory.candidates.find(c => c.programmeId === 'HK-CITYU-P003');
  assert.deepEqual(emba.directoryCodes, ['P01A', 'P12']); assert.equal(emba.variants.length, 2);
  const bis = inventory.candidates.find(c => c.name === 'MSc Business Information Systems');
  assert.deepEqual(bis.directoryCodes, ['P05A', 'P05B']); assert.equal(bis.variants.length, 2);
  assert.equal(new Set(inventory.candidates.map(c => c.programmeId)).size, 61);
});

test('52 additions have no invented GPA, language, fees, dates or open-application claim', () => {
  const additions = expansion.programmes.filter(p => p.inventoryPass === 'cityu-directory');
  assert.equal(additions.length, 52);
  for (const p of additions) {
    assert.equal(p.verification, 'catalogue_seed'); assert.equal(p.requirementsCoverage, 'unreviewed'); assert.equal(p.reviewer, null); assert.equal(p.academicYear, null); assert.deepEqual(p.rules, []);
    assert.ok(p.offerings.every(o => o.mode === null && o.deadline === null && o.tuition === null && o.academicYear === null));
    assert.equal(/\p{Script=Han}/u.test(p.name + p.notesEn), false); assert.equal(matchProgramme(p, profile).tier, null);
  }
});

test('raw local/non-local date columns remain explicit evidence and do not become category defaults', () => {
  const emba = inventory.entries.find(e => e.code === 'P01A');
  assert.deepEqual(emba.directoryDates, { localLabel: '20 Aug 2027', nonLocalLabel: '14 Jul 2027', sharedCell: false });
  const cs = inventory.entries.find(e => e.code === 'P53');
  assert.deepEqual(cs.directoryDates, { localLabel: '31 May 2027', nonLocalLabel: '31 May 2027', sharedCell: true });
  assert.equal(emba.modeLabel, 'Combined');
  assert.equal(seed.programmes.find(p => p.id === 'HK-CITYU-P003').offerings[0].deadline, null);
});

test('directory evidence preserves checked requirements, fee-context fingerprints and original snapshot', () => {
  const db = new CatalogueStore(':memory:', options);
  try {
    const q = db.quality(); assert.equal(q.total, 873); assert.equal(q.browsable, 869); assert.equal(q.checked, 238); assert.equal(q.peerReviewed, 0); assert.equal(q.complete, 0); assert.equal(q.enumeratedUniversities, 6); assert.deepEqual(q.sourceRefreshConflicts, []);
    assert.equal(db.universities().find(u => u.id === 'HK-CITYU').directoryAudit.enumerationStatus, 'entries_enumerated');
    for (const original of checked.programmes) {
      const p = db.get(original.id); assert.deepEqual(p.offerings, original.offerings); assert.deepEqual(p.rules, original.rules); assert.equal(p.lastChecked, original.lastChecked);
    }
    assert.equal(seed.programmes.length, 175); assert.equal(seed.universities.length, 14);
    assert.equal(db.all().filter(p => p.universityId === 'HK-CITYU').length, 62);
  } finally { db.close(); }
});

test('reconciliation is idempotent, does not mutate inputs and preserves unrelated observations', () => {
  const data = input(), before = JSON.stringify(data), output = buildCityuInventory(data);
  assert.equal(JSON.stringify(data), before);
  assert.deepEqual(output.inventory, inventory); assert.deepEqual(output.expansion, expansion); assert.deepEqual(output.links, links); assert.deepEqual(output.audit, audit);
  assert.deepEqual(output.expansion.programmes.filter(p => p.universityId !== 'HK-CITYU'), expansion.programmes.filter(p => p.universityId !== 'HK-CITYU'));
  assert.deepEqual(output.links.listings.filter(l => !l.programmeId.startsWith('HK-CITYU-')), links.listings.filter(l => !l.programmeId.startsWith('HK-CITYU-')));
  assert.deepEqual(output.audit.universities.filter(u => u.universityId !== 'HK-CITYU'), audit.universities.filter(u => u.universityId !== 'HK-CITYU'));
});

test('missing rows, conflicting codes, unsafe paths and newer batches cannot be silently rebuilt', () => {
  for (const mutate of [d => d.observation.rows.pop(), d => d.observation.rows[14][1] = 'Conflicting duplicate', d => d.observation.rows[0][2] = '../../evil/p88', d => d.expansion.checkedOn = '2026-10-21', d => d.links.checkedOn = '2026-10-21', d => d.audit.checkedOn = '2026-10-21']) {
    const data = input(); mutate(data); assert.throws(() => buildCityuInventory(data));
  }
});
