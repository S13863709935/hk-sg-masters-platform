import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CatalogueStore } from '../server/database.mjs';
import { filterProgrammes } from '../server/app.mjs';
import { matchProgramme } from '../server/matching.mjs';
import { validateScopeAudit, isOfficialUrl } from '../server/validation.mjs';

const root = new URL('../', import.meta.url);
const read = file => JSON.parse(readFileSync(new URL(file, root), 'utf8'));
const seed = read('data/catalogue.json');
const inventory = read('data/research/sg-programme-inventory-2026-10-13.json');
const scope = read('data/programme-scope-audit.json');
const options = { seed, expansionPath: new URL('data/catalogue-expansion.json', root), checkedPath: new URL('data/checked-programmes.json', root), directoryAuditPath: new URL('data/directory-audit.json', root), scopeAuditPath: new URL('data/programme-scope-audit.json', root), directoryEvidencePath: new URL('data/directory-links.json', root) };
const profile = { major: 'Computer Science', degreeStatus: 'graduated', gpa: 4, gpaScale: 4, language: { type: 'ielts', total: 9 } };

test('SMU enumerates 17 master cards, excludes JD and retains executive/Chinese awards', () => {
  const i = inventory.inventories.find(i => i.universityId === 'SG-SMU');
  assert.equal(i.rawEntryCount, 18);
  assert.equal(i.includedProgrammeCount, 17);
  assert.equal(i.entries.filter(e => e.decision === 'exclude').length, 1);
  assert.equal(i.entries.find(e => e.name === 'Juris Doctor').decision, 'exclude');
  assert.equal(i.entries.find(e => e.name === 'Chinese Executive MBA').decision, 'include_directory_lead');
  assert.equal(i.entries.find(e => e.name === 'Master of IT in Business').programmeId, 'SG-SMU-P010');
});
test('SUTD reconciles the actual coursework filter across both pages without research routes', () => {
  const i = inventory.inventories.find(i => i.universityId === 'SG-SUTD');
  assert.equal(i.includedProgrammeCount, 18);
  assert.equal(i.entries.length, 18);
  assert.equal(new Set(i.entries.map(e => e.officialUrl)).size, 18);
  assert.ok(i.sourceUrls.every(url => url.includes('programme-level=769')));
  assert.equal(i.sourceSha256s.length, 2);
  assert.equal(i.excludedFromUnfilteredDirectory.length, 3);
  assert.equal(i.entries.find(e => e.name === 'Master of Architecture').programmeId, 'SG-SUTD-P001');
  assert.ok(i.entries.every(e => !e.name.includes('Innovation by Design')));
});
test('SUSS keeps 28 leads provisional and separates research and dual pathways', () => {
  const i = inventory.inventories.find(i => i.universityId === 'SG-SUSS');
  assert.equal(i.rawEntryCount, 38);
  assert.equal(i.includedProgrammeCount, null);
  assert.equal(i.enumerationStatus, 'entries_enumerated');
  assert.equal(i.directoryMasterEntryCount, 28);
  assert.equal(i.entries.filter(e => e.decision === 'needs_route_reconciliation').length, 3);
  assert.equal(i.entries.filter(e => e.decision === 'exclude').length, 7);
  assert.equal(i.entries.find(e => e.name === 'Master of Social Sciences').decision, 'include_directory_lead');
  assert.equal(i.entries.find(e => e.name === 'Master of Applied Research in Social Sciences').decision, 'exclude');
  assert.equal(i.entries.find(e => e.name === 'Master of Science in Management (Chinese)').programmeId, 'SG-SUSS-P002');
});
test('new SG leads have official sources, English names and no admissions rules or tiers', () => {
  const additions = read('data/catalogue-expansion.json').programmes.filter(p => p.inventoryBatch === '2026-10-13' && p.inventoryPass !== 'nus-ntu-dynamic');
  assert.equal(additions.length, 37);
  assert.ok(additions.every(p => isOfficialUrl(p.officialUrl) && p.rules.length === 0 && p.reviewer === null && p.academicYear === null && p.requirementsCoverage === 'unreviewed'));
  assert.ok(additions.every(p => !/\p{Script=Han}/u.test(p.name + p.notesEn)));
  assert.ok(additions.every(p => matchProgramme(p, profile).tier === null));
});
test('six scope corrections hide records but keep IDs, evidence and original snapshot intact', () => {
  const db = new CatalogueStore(':memory:', options);
  try {
    const total = seed.programmes.length + read('data/catalogue-expansion.json').programmes.length;
    assert.equal(db.quality().total, total);
    assert.equal(db.quality().browsable, total - 7);
    assert.equal(db.quality().outOfScope, 6);
    assert.equal(db.quality().enumeratedUniversities, 6);
    assert.equal(db.quality().scopeAuditDate, '2026-11-03');
    assert.equal(filterProgrammes(db.all()).length, total - 7);
    assert.equal(filterProgrammes(db.all(), {includeTransfer:'true',includeOutOfScope:'true'}).length, total);
    for (const d of scope.decisions) {
      const p = db.get(d.programmeId);
      assert.equal(p.scope.status, 'out_of_scope');
      assert.equal(p.scope.sourceUrl, d.sourceUrl);
      assert.equal('scope' in [...seed.programmes, ...read('data/catalogue-expansion.json').programmes].find(p => p.id === d.programmeId), false);
      const result = matchProgramme(p, profile);
      assert.equal(result.status, 'out_of_scope');
      assert.equal(result.tier, null);
      assert.equal(result.counts.fail, 0);
    }
  } finally { db.close(); }
});
test('scope evidence validation rejects unsupported states, missing IDs and unofficial sources', () => {
  const ids = new Set([...seed.programmes, ...read('data/catalogue-expansion.json').programmes].map(p=>p.id));
  assert.equal(validateScopeAudit(scope, ids), scope);
  for (const change of [{status:'eligible'}, {programmeId:'SG-NUS-P999'}, {sourceUrl:'https://attacker.invalid/'}]) {
    const invalid = structuredClone(scope);
    Object.assign(invalid.decisions[0], change);
    assert.throws(()=>validateScopeAudit(invalid, ids));
  }
  assert.throws(()=>validateScopeAudit({...scope, decisions:[scope.decisions[0],scope.decisions[0]]},ids));
});
