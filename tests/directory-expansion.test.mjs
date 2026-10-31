import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, rmSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { CatalogueStore } from '../server/database.mjs';
import { matchProgramme } from '../server/matching.mjs';
import { validateProgramme } from '../server/validation.mjs';
import { identity } from '../scripts/programme-identity.mjs';

const root = new URL('../', import.meta.url);
const read = path => JSON.parse(readFileSync(new URL(path, root), 'utf8'));
const seed = read('data/catalogue.json');
const expansion = read('data/catalogue-expansion.json');
const inventory = read('data/research/programme-inventory-2026-10-08.json');
const options = { seed, expansionPath: new URL('data/catalogue-expansion.json', root), checkedPath: new URL('data/checked-programmes.json', root), directoryAuditPath: new URL('data/directory-audit.json', root), scopeAuditPath: new URL('data/programme-scope-audit.json', root), directoryEvidencePath: new URL('data/directory-links.json', root) };
const schools = new Set(seed.universities.map(u => u.id));
const background = { major: 'Computer Science', degreeStatus: 'graduated', gpa: 4, gpaScale: 4, language: { type: 'ielts', total: 9, components: { listening: 9, reading: 9, writing: 9, speaking: 9 }, singleAttempt: true } };

test('catalogue expansion preserves original IDs, historical additions and reconciles current records', () => {
  const db = new CatalogueStore(':memory:', options);
  try {
    assert.equal(seed.programmes.length, 175);
    assert.equal(expansion.programmes.filter(p => p.inventoryBatch === '2026-10-08').length, 186);
    assert.equal(expansion.programmes.filter(p => p.inventoryBatch === '2026-10-13' && p.inventoryPass !== 'nus-ntu-dynamic').length, 37);
    assert.equal(db.quality().total, seed.programmes.length + expansion.programmes.length);
    assert.equal(db.quality().browsable, seed.programmes.length + expansion.programmes.length - 4);
    assert.equal(db.quality().checked, 297);
    assert.equal(db.quality().peerReviewed, 0);
    const allIds = new Set(db.all().map(p => p.id));
    assert.ok(seed.programmes.every(p => allIds.has(p.id)));
  } finally { db.close(); }
});
test('new official directory leads cannot create eligibility conclusions or recommendation tiers', () => {
  for (const p of expansion.programmes) {
    validateProgramme(p, schools);
    assert.equal(p.verification, 'catalogue_seed');
    assert.equal(p.requirementsCoverage, 'unreviewed');
    assert.equal(p.reviewer, null);
    assert.equal(p.rules.length, 0);
    const result = matchProgramme(p, background);
    assert.equal(result.status, 'needs_confirmation');
    assert.equal(result.tier, null);
    assert.equal(/\p{Script=Han}/u.test(p.name + p.notesEn), false);
  }
});
test('the three enumerated source lists count 49, 44 and 129 named masters', () => {
  assert.deepEqual(inventory.inventories.filter(i => i.includedProgrammeCount !== null).map(i => [i.universityId, i.includedProgrammeCount]), [['HK-HKBU', 49], ['HK-LU', 44], ['HK-CUHK', 129]]);
  for (const i of inventory.inventories) assert.equal(i.uniqueEntryCount, i.entries.length);
});
test('research-column MFA/Music, doctorates, JD combinations and explicit overseas-only routes are excluded', () => {
  const cu = inventory.inventories.find(i => i.universityId === 'HK-CUHK');
  for (const name of ['Master of Fine Arts', 'Master of Music', 'Juris Doctor/MBA', 'Juris Doctor']) assert.equal(cu.entries.find(e => e.name === name).decision, 'exclude');
  assert.ok(cu.entries.filter(e => /offered in (Shanghai|Shenzhen)/i.test(e.name)).every(e => e.decision === 'exclude'));
  const bu = inventory.inventories.find(i => i.universityId === 'HK-HKBU');
  assert.equal(bu.entries.filter(e => /BNBU/.test(e.name)).length, 5);
  assert.ok(bu.entries.filter(e => /BNBU/.test(e.name)).every(e => e.decision === 'exclude'));
});
test('MRes is retained only with the explicit Lingnan taught-category evidence', () => {
  const entry = inventory.inventories.find(i => i.universityId === 'HK-LU').entries.find(e => /Master of Research/.test(e.name));
  assert.equal(entry.decision, 'include_directory_lead');
  assert.equal(entry.typeEvidenceUrl, 'https://www.ln.edu.hk/sds/programmes-and-courses');
});
test('cross-faculty aliases are one programme and all nine MSSc listings are captured', () => {
  const cu = inventory.inventories.find(i => i.universityId === 'HK-CUHK');
  const gender = cu.entries.filter(e => e.decision === 'include_directory_lead' && /^MA in Gender Studies/.test(e.name));
  assert.equal(gender.length, 1);
  assert.equal(gender[0].alternateUrls.length, 1);
  assert.equal(cu.entries.filter(e => /^MSSc/.test(e.name)).length, 9);
  assert.equal(cu.entries.find(e => e.name === 'MSSc in Advertising').programmeId, 'HK-CUHK-P017');
  assert.equal(cu.entries.find(e => e.name === 'MSSc in Corporate Communication').programmeId, 'HK-CUHK-P018');
  assert.equal(identity('MSSc in Advertising'), identity('MSocSc Advertising'));
});
test('PolyU 111 master/scheme entries are not promoted to an exact programme total', () => {
  const p = inventory.inventories.find(i => i.universityId === 'HK-POLYU');
  assert.equal(p.uniqueEntryCount, 125);
  assert.equal(p.excludedCount, 14);
  assert.equal(p.includedProgrammeCount, null);
  assert.equal(p.entries.filter(e => e.decision === 'needs_scheme_reconciliation').length, 111);
  assert.equal(p.entries.filter(e => e.pendingApproval).length, 5);
});
test('the refreshed Lingnan offering retains fees and durations without graduation GPA rules', () => {
  const p = read('data/checked-programmes.json').programmes.find(p => p.id === 'HK-LU-P001');
  assert.equal(p.lastChecked, '2026-10-23');
  assert.deepEqual(p.offerings.map(o => [o.duration, o.tuition]), [['1 year', 198000], ['2 years', 198000]]);
  assert.ok(!p.rules.some(r => r.kind === 'gpa'));
  assert.match(p.notesEn, /graduation classifications/);
});
test('versioned directory additions do not overwrite later checked or manually imported records', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gradpath-expansion-'));
  const dbPath = join(dir, 'test.sqlite');
  const modifiedPath = join(dir, 'modified.json');
  let db;
  try {
    db = new CatalogueStore(dbPath, options);
    const original = db.get(expansion.programmes[0].id);
    db.importBatch({ schemaVersion: 1, programmes: [{ ...original, notesEn: 'Actual manual update to preserve.' }] }, 'Synthetic persistence check');
    db.close();
    writeFileSync(modifiedPath, JSON.stringify({ ...expansion, description: 'Changed hash only' }));
    db = new CatalogueStore(dbPath, { ...options, expansionPath: modifiedPath });
    assert.equal(db.get(original.id).notesEn, 'Actual manual update to preserve.');
  } finally { db?.close(); rmSync(dbPath, { force: true }); rmSync(modifiedPath, { force: true }); rmdirSync(dir); }
});
test('the HTML parser captures uncommon abbreviations from explicit official programme columns', { skip: !process.env.GRADPATH_RESEARCH_PYTHON }, () => {
  const html = '<html><div class="TaughtProgrammes"><a href="/programmes/ma">MXYZ in Test Field</a><a href="/programmes/mssc">MSSc in Advertising</a></div><div class="ResearchProgrammes"><a href="/programmes/music">Master of Music</a></div></html>';
  const result = spawnSync(process.env.GRADPATH_RESEARCH_PYTHON, [fileURLToPath(new URL('scripts/parse-directory.py', root))], { input: JSON.stringify({ html, url: 'https://www.gs.cuhk.edu.hk/' }), encoding: 'utf8', windowsHide: true });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout).candidates.map(c => c.title), ['MXYZ in Test Field', 'MSSc in Advertising', 'Master of Music']);
});
