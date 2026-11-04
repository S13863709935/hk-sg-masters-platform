import {repositoryExpected} from './repository-expected-state.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { buildEduhkInventory } from '../scripts/build-eduhk-directory-inventory.mjs';
import { buildCityuInventory } from '../scripts/build-cityu-directory-inventory.mjs';
import { CatalogueStore } from '../server/database.mjs';
import { matchProgramme } from '../server/matching.mjs';
import { loadApplicantContexts, resolveApplicantContext } from '../server/applicants.mjs';
import { resolveOffering } from '../server/offerings.mjs';
import { loadRoutes } from '../server/routes.mjs';

const root = new URL('../', import.meta.url);
const read = file => JSON.parse(readFileSync(new URL(file, root), 'utf8'));
const observation = read('data/research/eduhk-directory-observation-2026-10-20.json');
const inventory = read('data/research/eduhk-programme-inventory-2026-10-20.json');
const seed = read('data/catalogue.json'), expansion = read('data/catalogue-expansion.json'), checked = read('data/checked-programmes.json'), links = read('data/directory-links.json'), audit = read('data/directory-audit.json');
const reconciliation = read('data/research/eduhk-flass-directory-reconciliation-2026-11-04.json');
const historicalLinks = structuredClone(links);
for (const change of reconciliation.changes) historicalLinks.listings[historicalLinks.listings.findIndex(l => l.programmeId === change.programmeId)] = structuredClone(change.before);
historicalLinks.checkedOn = reconciliation.beforeBatchCheckedOn;
historicalLinks.description = reconciliation.beforeDescription;
// The October generator is replayed against its exact prior link inputs. It must
// refuse newer official identities instead of overwriting them with an old crawl.
const input = () => structuredClone({ observation, seed, expansion, checked, links: historicalLinks, audit });
const options = { seed, expansionPath: new URL('data/catalogue-expansion.json', root), checkedPath: new URL('data/checked-programmes.json', root), directoryAuditPath: new URL('data/directory-audit.json', root), scopeAuditPath: new URL('data/programme-scope-audit.json', root), directoryEvidencePath: new URL('data/directory-links.json', root) };
const profile = { major: 'Computer Science', degreeStatus: 'graduated', gpa: 4, gpaScale: 4, language: { type: 'ielts', total: 9 } };

test('EdUHK captures all taught sections once, including unlinked list items', () => {
  assert.deepEqual(observation.sections, { gs: 1, aapsef: 19, aedi: 17, fehd: 13, fhm: 12, flass: 17 });
  assert.equal(inventory.rawRowCount, 79); assert.equal(inventory.masterRowCount, 78);
  assert.equal(inventory.excludedRowCount, 1); assert.equal(inventory.heldRowCount, 10);
  assert.equal(inventory.candidateGroupCount, 59); assert.equal(inventory.languageVariantGroups, 9);
  assert.equal(inventory.confirmedProgrammeCount, null);
  assert.equal(inventory.observationRowsSha256, createHash('sha256').update(JSON.stringify(observation.rows)).digest('hex'));
});

test('certificate and unlinked proposed masters do not acquire invented programme URLs or IDs', () => {
  const held = inventory.entries.filter(e => e.decision === 'hold_missing_programme_link');
  assert.equal(held.length, 10); assert.ok(held.every(e => e.officialUrl === null && e.pendingApproval && !e.programmeId));
  assert.equal(inventory.entries.filter(e => e.decision === 'exclude_non_master').length, 1);
  assert.ok(!expansion.programmes.some(p => p.name.startsWith('Postgraduate Certificate')));
  assert.ok(held.some(e => e.sourceIdentityNote && e.name.includes('Artificial Intelligence Innovation')));
  assert.ok(!expansion.programmes.some(p => p.universityId === 'HK-EDUHK' && held.some(e => e.name === p.name)));
});

test('asterisks and Chinese-medium markers have separate meanings and retain approval caveats', () => {
  assert.equal(inventory.pendingApprovalRows, 17); assert.equal(inventory.pendingApprovalGroups, 7);
  const pending = inventory.candidates.filter(c => c.pendingApproval);
  assert.ok(pending.every(c => /subject to University approval/.test(links.listings.find(l => l.programmeId === c.programmeId).noteEn)));
  const ordinaryChinese = inventory.entries.find(e => e.name === 'Master of Management');
  assert.equal(ordinaryChinese.chineseMarker, true); assert.equal(ordinaryChinese.pendingApproval, false);
  assert.ok(links.listings.filter(l => l.programmeId.startsWith('HK-EDUHK-')).every(l => /not an English-test waiver/.test(l.noteEn)));
});

test('language pairs with identical or different URLs remain explicit unresolved routes', () => {
  const pairs = inventory.candidates.filter(c => c.variants.length);
  assert.equal(pairs.length, 9); assert.ok(pairs.every(c => c.variants.length === 2));
  const same = pairs.find(c => c.name.includes('Digital Humanities'));
  assert.equal(same.variants[0].officialUrl, same.variants[1].officialUrl);
  assert.notEqual(same.variants[0].nameEn, same.variants[1].nameEn);
  assert.ok(pairs.every(c => c.variants.some(v => v.nameEn.endsWith('English')) && c.variants.some(v => v.nameEn.endsWith('Chinese (mainly Putonghua)'))));
});

test('empty preceding anchors cannot send Global Studies users to Educational Counselling', () => {
  const global = inventory.entries.find(e => e.name === 'Master of Arts in Global Studies in Education');
  const counselling = inventory.entries.find(e => e.name === 'Master of Arts in Educational Counselling');
  assert.equal(new URL(global.officialUrl).searchParams.get('id'), '10665');
  assert.equal(new URL(counselling.officialUrl).searchParams.get('id'), '230');
  assert.notEqual(global.programmeId, counselling.programmeId);
});

test('existing management and MPPM identities are preserved; 56 additions have unknown admissions', () => {
  assert.equal(inventory.candidates.find(c => c.name === 'Master of Public Policy and Management').programmeId, 'HK-EDUHK-P001');
  assert.equal(inventory.candidates.find(c => c.name === 'Master of Management').programmeId, 'HK-EDUHK-P002');
  assert.equal(inventory.candidates.find(c => c.name === 'Master of Global Management').programmeId, 'HK-EDUHK-P003');
  const additions = expansion.programmes.filter(p => p.inventoryPass === 'eduhk-directory');
  assert.equal(additions.length, 56);
  for (const p of additions) {
    assert.equal(p.verification, 'catalogue_seed'); assert.equal(p.requirementsCoverage, 'unreviewed'); assert.equal(p.reviewer, null); assert.equal(p.academicYear, null); assert.deepEqual(p.rules, []);
    assert.ok(p.offerings.every(o => o.tuition === null && o.deadline === null && o.mode === null));
    assert.equal(/\p{Script=Han}/u.test(p.name + p.notesEn), false); assert.equal(matchProgramme(p, profile).tier, null);
  }
});

test('directory-only updates preserve checked fields and the independently dated MPPM fee context', () => {
  const db = new CatalogueStore(':memory:', options);
  try {
    const q = db.quality(); assert.equal(q.total, 873); assert.equal(q.browsable, 865); assert.equal(q.checked, repositoryExpected.checked); assert.equal(q.peerReviewed, 0); assert.equal(q.complete, 0); assert.deepEqual(q.sourceRefreshConflicts, []);
    assert.equal(db.all().filter(p => p.universityId === 'HK-EDUHK').length, 59);
    for (const original of checked.programmes) { const p = db.get(original.id); assert.deepEqual(p.rules, original.rules); assert.deepEqual(p.offerings, original.offerings); assert.equal(p.lastChecked, original.lastChecked); }
    const routes = loadRoutes(new URL('data/route-programmes.json', root), db.all());
    const index = loadApplicantContexts(new URL('data/applicant-contexts.json', root), db.all(), routes);
    const resolved = resolveApplicantContext(resolveOffering(db.get('HK-EDUHK-P001'), 'HK-EDUHK-P001-O1'), index, 'HK-EDUHK-P001-O1-NONLOCAL');
    assert.equal(resolved.offerings[0].tuition, 188888); assert.equal(resolved.offerings[0].deadline, '2026-10-15'); assert.equal(resolved.offerings[0].feeEvidence.checkedOn, '2026-10-23');
    assert.equal(db.universities().find(u => u.id === 'HK-EDUHK').directoryAudit.enumerationStatus, 'entries_enumerated');
  } finally { db.close(); }
});

test('EdUHK and CityU directory rebuilds preserve each other and stay idempotent', () => {
  const data = input(), before = JSON.stringify(data), output = buildEduhkInventory(data);
  assert.equal(JSON.stringify(data), before); assert.deepEqual(output.inventory, inventory);
  assert.deepEqual(output.expansion, expansion); assert.deepEqual(output.links, historicalLinks); assert.deepEqual(output.audit, audit);
  const cityu = buildCityuInventory({ ...input(), observation: read('data/research/cityu-directory-observation-2026-10-20.json') });
  assert.deepEqual(cityu.links, historicalLinks); assert.deepEqual(cityu.expansion, expansion); assert.deepEqual(cityu.audit, audit);
});

test('October replay rejects the later STEM-link and Sports-condition observations without modifying current evidence', () => {
  const data = { ...input(), links: structuredClone(links) }, before = JSON.stringify(data);
  assert.throws(() => buildEduhkInventory(data), /newer EdUHK listings/);
  assert.equal(JSON.stringify(data), before);
  for (const change of reconciliation.changes) assert.deepEqual(links.listings.find(l => l.programmeId === change.programmeId), change.after);
});

test('malformed rows, duplicate rows, wrong source domains and newer evidence are rejected', () => {
  for (const mutate of [d => d.observation.rows.pop(), d => d.observation.rows[1] = d.observation.rows[0], d => d.observation.rows[0][2] = 'https://www.nus.edu.sg/', d => d.observation.rows[0][2] = 'https://eduhk.hk.attacker.invalid/', d => d.observation.rows[3][3] = false, d => d.expansion.checkedOn = '2026-10-21', d => d.links.checkedOn = '2026-10-21', d => d.audit.checkedOn = '2026-10-21']) {
    const data = input(); mutate(data); assert.throws(() => buildEduhkInventory(data));
  }
});
