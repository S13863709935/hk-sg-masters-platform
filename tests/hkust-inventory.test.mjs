import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { buildHkustInventory } from '../scripts/build-hkust-directory-inventory.mjs';
import { buildEduhkInventory } from '../scripts/build-eduhk-directory-inventory.mjs';
import { buildCityuInventory } from '../scripts/build-cityu-directory-inventory.mjs';
import { CatalogueStore } from '../server/database.mjs';
import { filterProgrammes } from '../server/app.mjs';
import { matchProgramme } from '../server/matching.mjs';

const root = new URL('../', import.meta.url);
const read = file => JSON.parse(readFileSync(new URL(file, root), 'utf8'));
const observation = read('data/research/hkust-directory-observation-2026-10-20.json');
const inventory = read('data/research/hkust-programme-inventory-2026-10-20.json');
const seed = read('data/catalogue.json'), expansion = read('data/catalogue-expansion.json'), checked = read('data/checked-programmes.json'), links = read('data/directory-links.json'), audit = read('data/directory-audit.json');
const input = () => structuredClone({ observation, seed, expansion, checked, links, audit });
const options = { seed, expansionPath: new URL('data/catalogue-expansion.json', root), checkedPath: new URL('data/checked-programmes.json', root), directoryAuditPath: new URL('data/directory-audit.json', root), scopeAuditPath: new URL('data/programme-scope-audit.json', root), directoryEvidencePath: new URL('data/directory-links.json', root) };
const profile = { major: 'Computer Science', degreeStatus: 'graduated', gpa: 4, gpaScale: 4, language: { type: 'ielts', total: 9 } };

test('HKUST captures 55 prospective taught rows with Hong Kong-only school filters', () => {
  const f = observation.selectedFilters;
  assert.equal(f.year, '2027-28'); assert.equal(f.researchSelected, false); assert.equal(f.guangzhouHubsSelected, false); assert.equal(f.alphabet, 'Show All');
  assert.deepEqual(f.schools, ['SSCI', 'SENG', 'SBM', 'SHSS', 'IPO']);
  assert.equal(observation.rows.length, 55); assert.equal(new Set(observation.rows.map(r => r[3])).size, 55);
  assert.equal(inventory.masterRowCount, 53); assert.equal(inventory.candidateGroupCount, 48); assert.equal(inventory.confirmedProgrammeCount, null);
  assert.equal(inventory.observationRowsSha256, createHash('sha256').update(JSON.stringify(observation.rows)).digest('hex'));
});

test('taught-filter DBAs are excluded while MSc/MA portions of PGD pages remain master leads', () => {
  const excluded = inventory.entries.filter(e => e.decision === 'exclude_non_master');
  assert.equal(excluded.length, 2); assert.ok(excluded.every(e => e.awardLabel === 'DBA' && !e.programmeId));
  const mixed = inventory.entries.filter(e => e.excludedAwardComponent === 'PGD');
  assert.equal(mixed.length, 3); assert.ok(mixed.every(e => e.programmeId && e.decision === 'include_directory_lead'));
  for (const e of mixed) assert.match(links.listings.find(l => l.programmeId === e.programmeId).noteEn, /PGD component is outside scope/);
  assert.ok(!expansion.programmes.some(p => p.universityId === 'HK-HKUST' && /DBA|^PGD/.test(p.name)));
});

test('DISC maps only to the stable MSc parent, never to another direct-admission MEng', () => {
  const disc = inventory.entries.find(e => e.rawName === 'Digital and Sustainable Cities');
  assert.equal(disc.programmeId, 'HK-HKUST-P002'); assert.equal(disc.relatedTransferOnlyId, 'HK-HKUST-P003');
  assert.ok(!links.listings.some(l => l.programmeId === 'HK-HKUST-P003'));
  const db = new CatalogueStore(':memory:', options);
  try {
    assert.equal(db.get('HK-HKUST-P003').admissionRoute, 'transfer_only');
    assert.equal(filterProgrammes(db.all()).some(p => p.id === 'HK-HKUST-P003'), false);
    const result = matchProgramme(db.get('HK-HKUST-P003'), profile);
    assert.equal(result.status, 'has_gap'); assert.equal(result.tier, null);
    assert.ok(result.checks.some(c => c.kind === 'route' && c.status === 'fail' && /Transfer-only/.test(c.reasonEn)));
  } finally { db.close(); }
});

test('joint awards and year-long cross-region placements remain held rather than guessed away', () => {
  const held = inventory.entries.filter(e => e.decision.startsWith('hold_'));
  assert.equal(held.length, 4); assert.ok(held.every(e => !e.programmeId));
  assert.equal(held.filter(e => e.decision === 'hold_partner_reconciliation').length, 2);
  assert.match(held.find(e => e.rawName === 'AI and Entrepreneurship').reasonEn, /year-long Shanghai internship/);
  assert.match(held.find(e => e.rawName === 'Design Intelligence').reasonEn, /Hong Kong.*Greater Bay Area.*Shanghai/);
  assert.ok(!expansion.programmes.some(p => p.universityId === 'HK-HKUST' && held.some(e => p.officialUrl === e.officialUrl)));
});

test('MBA modes have one candidate identity with two distinct unresolved directory pathways', () => {
  const mba = inventory.candidates.find(c => c.name === 'Master of Business Administration');
  assert.equal(mba.directoryRows.length, 2); assert.equal(mba.variants.length, 2);
  assert.ok(mba.variants.some(v => v.nameEn === 'Part-time MBA (Bi-weekly)'));
  assert.equal(new Set(mba.variants.map(v => v.officialUrl)).size, 2);
  assert.match(links.listings.find(l => l.programmeId === mba.programmeId).noteEn, /grouped, not interchangeable/);
});

test('directory attachment preserves the independently checked programme cohort, amounts and source date', () => {
  const db = new CatalogueStore(':memory:', options);
  try {
    const current = db.get('HK-HKUST-P002'), original = checked.programmes.find(p => p.id === current.id);
    assert.equal(current.academicYear, '2027/28'); assert.equal(current.lastChecked, '2026-10-24');
    assert.equal(current.academicYear, original.academicYear); assert.equal(current.lastChecked, original.lastChecked);
    assert.deepEqual(current.offerings, original.offerings); assert.deepEqual(current.rules, original.rules);
    assert.ok(current.directoryListing.programmeUrl.includes('/2027-28/'));
    assert.ok(current.officialUrl.includes('/2027-28/'));
    assert.equal(current.officialUrl, original.officialUrl); assert.deepEqual(current.sources, original.sources);
    assert.match(current.directoryListing.noteEn, /does not refresh older-cycle/);
    const q = db.quality(); assert.equal(q.total, 873); assert.equal(q.browsable, 870); assert.equal(q.checked, 67); assert.equal(q.peerReviewed, 0); assert.equal(q.complete, 0); assert.equal(q.transferOnly, 1); assert.deepEqual(q.sourceRefreshConflicts, []);
  } finally { db.close(); }
});

test('45 new records and three preserved identities add no invented admission thresholds', () => {
  const additions = expansion.programmes.filter(p => p.inventoryPass === 'hkust-directory');
  assert.equal(additions.length, 45);
  assert.equal(inventory.candidates.find(c => c.name === 'MSc Civil Infrastructural Engineering and Management').programmeId, 'HK-HKUST-P001');
  assert.equal(inventory.candidates.find(c => c.name === 'Master of Public Policy').programmeId, 'HK-HKUST-P004');
  for (const p of additions) {
    assert.equal(p.verification, 'catalogue_seed'); assert.equal(p.requirementsCoverage, 'unreviewed'); assert.equal(p.reviewer, null); assert.equal(p.academicYear, null); assert.deepEqual(p.rules, []);
    assert.ok(p.offerings.every(o => o.deadline === null && o.tuition === null && o.mode === null));
    assert.equal(/\p{Script=Han}/u.test(p.name + p.notesEn), false); assert.equal(matchProgramme(p, profile).tier, null);
  }
});

test('all three Oct-20 builders preserve unrelated observations and stay idempotent', () => {
  const data = input(), before = JSON.stringify(data), output = buildHkustInventory(data);
  assert.equal(JSON.stringify(data), before); assert.deepEqual(output.inventory, inventory);
  for (const key of ['expansion', 'links', 'audit']) assert.deepEqual(output[key], data[key]);
  for (const [build, file] of [[buildEduhkInventory, 'eduhk'], [buildCityuInventory, 'cityu']]) {
    const other = build({ ...input(), observation: read(`data/research/${file}-directory-observation-2026-10-20.json`) });
    for (const key of ['expansion', 'links', 'audit']) assert.deepEqual(other[key], data[key]);
  }
});

test('incorrect year, research/Guangzhou selection, duplicate or unsafe paths and newer batches fail closed', () => {
  for (const mutate of [d => d.observation.selectedFilters.year = '2026-27', d => d.observation.selectedFilters.researchSelected = true, d => d.observation.selectedFilters.schools.push('gzsystems'), d => d.observation.selectedFilters.guangzhouHubsSelected = true, d => d.observation.rows.pop(), d => d.observation.rows[0][3] = '../../evil/', d => d.observation.rows[1][3] = d.observation.rows[0][3], d => d.links.checkedOn = '2026-10-21']) {
    const data = input(); mutate(data); assert.throws(() => buildHkustInventory(data));
  }
});

test('frozen public observations retain no anonymous form token or credential-bearing URL', () => {
  const text = JSON.stringify({ observation, inventory });
  assert.equal(/token_post[=\"]|cookie[=\"]|authorization[=\"]|\?token/i.test(text), false);
  assert.ok(inventory.entries.every(e => !e.officialUrl.includes('?')));
});
