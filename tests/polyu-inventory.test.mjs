import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { buildPolyuInventory } from '../scripts/build-polyu-directory-inventory.mjs';
import { buildHkustInventory } from '../scripts/build-hkust-directory-inventory.mjs';
import { CatalogueStore } from '../server/database.mjs';
import { matchProgramme } from '../server/matching.mjs';

const root = new URL('../', import.meta.url);
const read = file => JSON.parse(readFileSync(new URL(file, root), 'utf8'));
const observation = read('data/research/polyu-directory-observation-2026-10-20.json');
const inventory = read('data/research/polyu-programme-inventory-2026-10-20.json');
const seed = read('data/catalogue.json'), checked = read('data/checked-programmes.json'), expansion = read('data/catalogue-expansion.json'), links = read('data/directory-links.json'), audit = read('data/directory-audit.json');
const input = () => structuredClone({ observation, seed, checked, expansion, links, audit });
const options = { seed, expansionPath: new URL('data/catalogue-expansion.json', root), checkedPath: new URL('data/checked-programmes.json', root), directoryAuditPath: new URL('data/directory-audit.json', root), scopeAuditPath: new URL('data/programme-scope-audit.json', root), directoryEvidencePath: new URL('data/directory-links.json', root) };
const profile = { major: 'Computer Science', degreeStatus: 'graduated', gpa: 4, gpaScale: 4, language: { type: 'ielts', total: 9 } };
const byName = name => inventory.candidates.find(c => c.name === name);

test('PolyU captures both complete semester lists, not 169 distinct masters', () => {
  assert.deepEqual(observation.views.map(v => [v.entryLabel, v.rowCount]), [['Sept 2027', 128], ['Jan 2027', 41]]);
  assert.ok(observation.views.every(v => v.facultyFilterValue === 'All' && v.keyword === ''));
  assert.equal(inventory.rawRowCount, 169); assert.equal(inventory.masterRowCount, 151); assert.equal(inventory.candidateGroupCount, 100); assert.equal(inventory.confirmedProgrammeCount, null);
  assert.equal(inventory.observationViewsSha256, createHash('sha256').update(JSON.stringify(observation.views)).digest('hex'));
  const school = audit.universities.find(u => u.universityId === 'HK-POLYU');
  assert.equal(school.enumerationStatus, 'entries_enumerated'); assert.equal(school.confirmedProgrammeCount, null);
});

test('doctoral rows do not become masters; shared PgD components do not add records', () => {
  const excluded = inventory.entries.filter(e => e.decision === 'exclude_non_master');
  assert.equal(excluded.length, 18); assert.ok(excluded.every(e => ['Doctor', 'EngD'].includes(e.awardLabel) && !e.programmeId));
  const included = inventory.entries.filter(e => e.excludedAwardComponent && e.programmeId);
  assert.equal(included.length, 6); assert.equal(new Set(included.map(e => e.programmeId)).size, 5);
  assert.ok(included.every(e => /Only the master component/.test(links.listings.find(l => l.programmeId === e.programmeId).noteEn)));
  assert.ok(!expansion.programmes.some(p => p.inventoryPass === 'polyu-directory' && /Doctor|PgD|Scheme/.test(p.name)));
});

test('scheme rows are held without conflating an administrative code with a named award', () => {
  const schemes = inventory.entries.filter(e => e.decision === 'hold_scheme_reconciliation');
  assert.equal(schemes.length, 3); assert.ok(schemes.every(e => !e.programmeId));
  for (const code of ['23090', '55005']) {
    const rows = inventory.entries.filter(e => e.code === code && e.entryLabel === 'Sept 2027');
    assert.equal(rows.length, 4); assert.equal(new Set(rows.map(e => e.programmeId)).size, 4);
  }
});

test('joint awards and cross-region teaching remain explicit unresolved cases', () => {
  const held = inventory.entries.filter(e => e.decision.startsWith('hold_'));
  assert.equal(held.length, 12); assert.ok(held.every(e => !e.programmeId));
  assert.equal(held.filter(e => e.decision === 'hold_partner_reconciliation').length, 2);
  assert.equal(held.filter(e => e.decision === 'hold_delivery_reconciliation').length, 3);
  assert.match(held.find(e => e.code === '17005').reasonEn, /nine credits.*Zhongshan/);
  assert.match(held.find(e => e.code === '24043').reasonEn, /EHL.*Houston/);
  assert.ok(byName('MSc Biopharmaceutical Development and Commercialization'));
});

test('no-intake and closed January evidence cannot become current catalogue invitations', () => {
  const off = inventory.entries.filter(e => e.decision === 'hold_not_offered');
  assert.equal(off.length, 2); assert.ok(off.every(e => /will not invite/.test(e.remark)));
  const closed = inventory.entries.filter(e => e.decision === 'hold_closed_intake');
  assert.equal(closed.length, 2); assert.ok(closed.every(e => e.entryLabel === 'Jan 2027' && e.closedDeadlineEvidence.includes('(Closed)')));
  assert.ok(closed.every(e => e.officialUrl.includes('/20262/') && /2026\/27/.test(e.remark)));
  for (const e of [...off, ...closed]) assert.ok(!expansion.programmes.some(p => p.officialUrl === e.officialUrl));
});

test('selected streams and shipping subcodes group conservatively without shared conditions', () => {
  for (const name of ['Master of Finance', 'Master of Applied Psychology', 'MSc Nutrition and Healthy Ageing', 'MSc International Shipping and Transport Logistics']) {
    const c = byName(name); assert.ok(c); assert.equal(c.variants.length, 2);
    assert.equal(new Set(c.variants.map(v => v.officialUrl)).size, 2);
  }
  const shipping = byName('MSc International Shipping and Transport Logistics');
  assert.match(links.listings.find(l => l.programmeId === shipping.programmeId).noteEn, /separate applications and conditions/);
});

test('January and September links share identities but never a guessed offering or cycle', () => {
  const repeated = inventory.candidates.filter(c => c.directoryRows.some(r => r.entryLabel === 'Jan 2027'));
  assert.equal(repeated.length, 35);
  const metaverse = byName('MSc Metaverse Technology');
  assert.ok(metaverse.variants.some(v => v.officialUrl.endsWith('/20262/61038')));
  assert.ok(metaverse.variants.some(v => v.officialUrl.endsWith('/2027/61038-fmt-pmt')));
  assert.match(links.listings.find(l => l.programmeId === metaverse.programmeId).noteEn, /different admission cycles/);
});

test('award-level identities distinguish MSc and professional masters with the same subject', () => {
  assert.equal(byName('MSc Nursing').programmeId, 'HK-POLYU-P005'); assert.equal(byName('Master of Nursing').programmeId, 'HK-POLYU-P006');
  assert.notEqual(byName('MSc Medical Laboratory Science').programmeId, byName('Master of Medical Laboratory Science').programmeId);
  assert.equal(byName('MSc AI for Teaching English to Speakers of Other Languages').programmeId, 'HK-POLYU-P009');
  assert.ok(inventory.entries.find(e => e.code === '71032').pendingApproval);
  assert.equal(inventory.candidates.filter(c => c.pendingApproval).length, 4);
});

test('89 new unreviewed records preserve all eleven seeds and checked programme evidence', () => {
  const additions = expansion.programmes.filter(p => p.inventoryPass === 'polyu-directory');
  assert.equal(additions.length, 89); assert.equal(new Set(inventory.candidates.map(c => c.programmeId)).size, 100);
  assert.equal(byName('MSc Business Management').programmeId, 'HK-POLYU-P001');
  for (const p of additions) {
    assert.match(p.id, /^HK-POLYU-P\d{3,}$/); assert.equal(p.verification, 'catalogue_seed'); assert.equal(p.requirementsCoverage, 'unreviewed'); assert.equal(p.reviewer, null); assert.equal(p.academicYear, null); assert.deepEqual(p.rules, []);
    assert.ok(p.offerings.every(o => o.intake === null && o.deadline === null && o.tuition === null && o.mode === null));
    assert.equal(/\p{Script=Han}/u.test(p.name + p.notesEn), false); assert.equal(matchProgramme(p, profile).tier, null);
  }
  const db = new CatalogueStore(':memory:', options);
  try {
    const p = db.get('HK-POLYU-P001'), original = checked.programmes.find(p => p.id === 'HK-POLYU-P001');
    assert.equal(p.lastChecked, original.lastChecked); assert.equal(p.academicYear, '2027/28'); assert.deepEqual(p.offerings, original.offerings); assert.deepEqual(p.rules, original.rules); assert.deepEqual(p.sources, original.sources);
    assert.equal(p.directoryListing.checkedOn, '2026-10-20');
    const q = db.quality(); assert.equal(q.total, 873); assert.equal(q.browsable, 870); assert.equal(q.checked, 68); assert.equal(q.peerReviewed, 0); assert.equal(q.complete, 0); assert.deepEqual(q.sourceRefreshConflicts, []);
  } finally { db.close(); }
});

test('PolyU and HKUST rebuilds are pure and preserve each other and all unrelated evidence', () => {
  const data = input(), before = JSON.stringify(data), out = buildPolyuInventory(data);
  assert.equal(JSON.stringify(data), before); assert.deepEqual(out.inventory, inventory);
  for (const key of ['expansion', 'links', 'audit']) assert.deepEqual(out[key], data[key]);
  const hkust = buildHkustInventory({ ...input(), observation: read('data/research/hkust-directory-observation-2026-10-20.json') });
  for (const key of ['expansion', 'links', 'audit']) assert.deepEqual(hkust[key], data[key]);
});

test('malformed rows, unsafe paths, wrong filters, missing closure evidence and newer batches fail closed', () => {
  for (const mutate of [d => d.observation.views.reverse(), d => d.observation.views[0].facultyFilterValue = '1434', d => d.observation.views[0].keyword = 'business', d => d.observation.views[1].programmeUrlPrefix = 'https://www.polyu.edu.hk/study/pg/tpg/2027/', d => d.observation.views[0].rows.pop(), d => d.observation.views[0].rows[0][1] = '../secret', d => d.observation.views[0].rows[1][1] = d.observation.views[0].rows[0][1], d => d.observation.views[1].closedDeadlineEvidence = [], d => d.expansion.checkedOn = '2026-10-21', d => d.links.listings.find(l => l.programmeId === 'HK-POLYU-P001').checkedOn = '2026-10-21']) {
    const data = input(); mutate(data); assert.throws(() => buildPolyuInventory(data));
  }
});
