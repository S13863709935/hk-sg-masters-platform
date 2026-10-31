import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CatalogueStore } from '../server/database.mjs';
import { matchProgramme } from '../server/matching.mjs';
import { validateProgramme, validateDirectoryAudit, isOfficialUrl } from '../server/validation.mjs';

const root = new URL('../', import.meta.url);
const seed = JSON.parse(readFileSync(new URL('data/catalogue.json', root), 'utf8'));
const batch = JSON.parse(readFileSync(new URL('data/checked-programmes.json', root), 'utf8'));
const audit = JSON.parse(readFileSync(new URL('data/directory-audit.json', root), 'utf8'));
const ids = new Set(seed.universities.map(u => u.id));
const pilot = batch.programmes.filter(p => batch.pilotProgrammeIds.includes(p.id));
const get = id => pilot.find(p => p.id === id);
const profile = { major: 'Computer Science', degreeStatus: 'graduated', classification: 'first', gpa: 3.8, gpaScale: 4, experienceYears: 0, language: { type: 'ielts', total: 7, components: { listening: 7, reading: 7, writing: 7, speaking: 7 }, singleAttempt: true, testDate: '2026-05-01' } };

test('the official-source pilot has 20 direct-entry records across all 14 target schools', () => {
  assert.equal(pilot.length, 20);
  assert.equal(new Set(pilot.map(p => p.id)).size, 20);
  assert.equal(new Set(pilot.map(p => p.universityId)).size, 14);
  assert.equal(pilot.filter(p => p.id.startsWith('HK-')).length, 10);
  assert.equal(pilot.filter(p => p.id.startsWith('SG-')).length, 10);
  assert.ok(pilot.every(p => p.admissionRoute === 'direct'));
});
test('all pilot sources, coverage states and checked dates are validated', () => {
  for (const p of pilot) {
    assert.equal(validateProgramme(p, ids), p);
    assert.ok(p.sources.length > 0 && p.sources.every(s => isOfficialUrl(s.url) && /^20\d{2}-\d{2}-\d{2}$/.test(s.checkedOn) && s.checkedOn <= p.lastChecked));
    assert.equal(p.sources.map(s => s.checkedOn).sort().at(-1), p.lastChecked);
    assert.deepEqual(Object.keys(p.fieldStatus).sort(), ['academicYear', 'deadline', 'gpa', 'independentReview', 'language', 'major', 'tuition']);
    assert.equal(/\p{Script=Han}/u.test(JSON.stringify({ name: p.name, notes: p.notesEn, rules: p.rules, fields: p.fieldStatus })), false);
  }
});
test('machine-assisted page checks never fabricate independent review or recommendation tiers', () => {
  for (const p of pilot) {
    assert.equal(p.reviewer, null);
    assert.equal(p.verification, 'programme_page_checked');
    assert.equal(p.requirementsCoverage, 'partial');
    assert.equal(matchProgramme(p, profile).tier, null);
    assert.notEqual(matchProgramme(p, profile).status, 'meets_checked');
  }
});
test('graduation, scholarship and institution-specific test-waiver GPAs are not generic entry cutoffs', () => {
  assert.ok(pilot.every(p => !p.rules.some(r => r.kind === 'gpa')));
  assert.match(get('SG-NUS-P029').notesEn, /graduation criterion/);
  assert.match(get('SG-NTU-P018').notesEn, /not admission cutoffs/);
  assert.match(get('SG-SMU-P010').notesEn, /not universal entry thresholds/);
  assert.match(get('SG-SUSS-P001').notesEn, /graduation condition/);
});
test('EdUHK January and September cohorts retain different tuition and deadlines', () => {
  const p = get('HK-EDUHK-P001');
  assert.equal(p.offerings[0].academicYear, '2026/27');
  assert.equal(p.offerings[0].tuition, null);
  assert.equal(p.offerings[0].deadline, null);
  assert.equal(p.offerings[1].academicYear, '2027/28');
  assert.equal(p.offerings[1].tuition, 208000);
  assert.equal(p.offerings[1].deadline, null);
});
test('non-local deadlines, fee categories and application rounds remain explicit', () => {
  assert.equal(get('HK-HKBU-P001').offerings[0].deadline, null);
  assert.equal(get('HK-HKBU-P001').offerings[0].applicationOpen, '2026-10-06');
  assert.match(get('HK-HKBU-P001').offerings[0].deadlineNote, /local applicants: 23 July/);
  assert.equal(get('HK-HKBU-P007').offerings[0].tuition, null);
  assert.match(get('HK-HKBU-P007').offerings[0].feeBasis, /non-local/);
  assert.equal(get('HK-POLYU-P001').offerings[0].deadline, '2027-02-25');
  assert.match(get('HK-POLYU-P001').offerings[0].deadlineNote, /Early round/);
  assert.match(get('HK-POLYU-P001').offerings[0].feeBasis, /excluding/);
});
test('identified cohorts can resolve dates without resolving unrelated fees or conflicting openings', () => {
  const economics = get('SG-NTU-P015');
  assert.equal(economics.fieldStatus.academicYear.status, 'known');
  assert.equal(economics.fieldStatus.deadline.sourceUrl, 'https://www.ntu.edu.sg/admissions/graduate/cwadmissionguide');
  assert.deepEqual(economics.offerings.map(o => [o.applicationOpen, o.deadline]), [['2026-09-01', '2027-01-31'], ['2027-03-01', '2027-05-31']]);
  assert.equal(economics.fieldStatus.tuition.status, 'unknown');
  assert.ok(economics.offerings.every(o => o.tuition === null));
  const msis = get('SG-NTU-P018');
  assert.equal(msis.fieldStatus.academicYear.status, 'known');
  assert.ok(msis.offerings.every(o => o.deadline === '2027-02-15' && o.applicationOpen === null && o.tuition === null));
  assert.match(msis.fieldStatus.deadline.noteEn, /Opening differs/);
  const mitb = get('SG-SMU-P010');
  assert.equal(mitb.fieldStatus.tuition.status, 'known');
  assert.equal(mitb.fieldStatus.academicYear.status, 'known');
  assert.equal(mitb.fieldStatus.deadline.status, 'unknown');
  assert.ok(mitb.offerings.every(o => o.deadline === null && o.applicationOpen === null));
});
test('a known language component gap survives unresolved programme conditions', () => {
  const p = { ...profile, language: { ...profile.language, components: { ...profile.language.components, writing: 5.5 } } };
  const result = matchProgramme(get('SG-NTU-P018'), p);
  assert.equal(result.status, 'has_gap');
  assert.ok(result.checks.some(c => c.kind === 'language' && c.status === 'fail'));
  assert.ok(result.checks.some(c => c.status === 'unknown'));
});
test('preferred SMU experience is not promoted to a mandatory requirement', () => {
  const p = get('SG-SMU-P010');
  const r = p.rules.find(r => r.kind === 'experience');
  assert.equal(r.mandatory, false);
  assert.equal(r.min, 2);
  assert.equal(matchProgramme(p, profile).checks.find(c => c.kind === 'experience').mandatory, false);
});
test('directory entries distinguish 175 stored seeds from a fully enumerated school count', () => {
  assert.equal(validateDirectoryAudit(audit, ids), audit);
  assert.equal(audit.universities.length, 14);
  assert.equal(audit.fullScopeEnumerationComplete, false);
  const counted = audit.universities.filter(u => u.confirmedProgrammeCount !== null);
  assert.equal(counted.length, 6);
  assert.equal(counted.find(u => u.universityId === 'SG-SIT').confirmedProgrammeCount, 4);
  assert.equal(counted.find(u => u.universityId === 'HK-HKBU').confirmedProgrammeCount, 49);
  assert.equal(counted.find(u => u.universityId === 'HK-LU').confirmedProgrammeCount, 44);
  assert.equal(counted.find(u => u.universityId === 'HK-CUHK').confirmedProgrammeCount, 129);
  assert.equal(counted.find(u => u.universityId === 'SG-SMU').confirmedProgrammeCount, 17);
  assert.equal(counted.find(u => u.universityId === 'SG-SUTD').confirmedProgrammeCount, 18);
  assert.equal(audit.universities.reduce((sum, u) => sum + u.existingSeedCount, 0), 175);
});
test('versioned directory updates replace stale links without changing raw snapshot records', () => {
  const store = new CatalogueStore(':memory:', { seed, checkedPath: new URL('data/checked-programmes.json', root), directoryAuditPath: new URL('data/directory-audit.json', root) });
  try {
    assert.equal(store.quality().checked, 286);
    assert.equal(store.quality().enumeratedUniversities, 6);
    assert.equal(store.universities().find(u => u.id === 'HK-HKBU').directoryUrl, 'https://ar.hkbu.edu.hk/tpg-admissions/programmes');
    assert.equal(seed.universities.find(u => u.id === 'HK-HKBU').directoryUrl, 'https://gs.hkbu.edu.hk/programmes');
    // This fixture omits the expansion layer, but separately checked expansion IDs still load.
    assert.equal(store.quality().total, new Set([...seed.programmes, ...batch.programmes].map(p => p.id)).size);
    assert.equal(seed.programmes.length, 175);
    assert.deepEqual(JSON.parse(readFileSync(new URL('data/catalogue.json', root), 'utf8')), seed);
  } finally { store.close(); }
});
test('invalid evidence, recurring deadline strings and unsupported count claims are rejected', () => {
  const p = structuredClone(pilot[0]);
  p.sources[0].url = 'https://attacker.invalid/example';
  assert.throws(() => validateProgramme(p, ids), /evidence sources/);
  const q = structuredClone(pilot[0]);
  q.offerings[0].deadline = '31 May every year';
  assert.throws(() => validateProgramme(q, ids), /YYYY-MM-DD/);
  const unsafe = structuredClone(pilot[0]);
  unsafe.fieldStatus['<script>'] = { ...unsafe.fieldStatus.gpa };
  assert.throws(() => validateProgramme(unsafe, ids), /coverage key/);
  const d = structuredClone(audit);
  d.universities[0].confirmedProgrammeCount = 999;
  assert.throws(() => validateDirectoryAudit(d, ids), /completed enumeration/);
});
