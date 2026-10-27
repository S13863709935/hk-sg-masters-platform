import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createCheckpoint } from '../server/app.mjs';
import { checkProgramme } from '../server/checks.mjs';

const root = new URL('../', import.meta.url);
const pilot = JSON.parse(readFileSync(new URL('data/checked-programmes.json', root), 'utf8'));
const get = id => pilot.programmes.find(p => p.id === id);
// All backgrounds here are synthetic software fixtures, not participants or admissions evidence.
const profile = { major: 'Computer Science', degreeStatus: 'graduated', gpa: 3.5, gpaScale: 4, language: { type: 'ielts', total: 7, testDate: '2025-05-01', singleAttempt: true, components: { listening: 7, reading: 7, writing: 7, speaking: 7 } } };
const languageCheck = (id, language) => checkProgramme(get(id), { ...structuredClone(profile), language: { ...structuredClone(profile.language), ...language } }).checks.find(c => c.kind === 'language');

test('publication data audit pins all selected and retained objects and frozen files', () => {
  const text = execFileSync(process.execPath, [fileURLToPath(new URL('scripts/check-pilot.mjs', root))], { encoding: 'utf8' });
  assert.match(text, /8 selected updates and 13 retained records/);
});

test('published CityU test-date minimum is unresolved when the test date is missing', () => {
  const result = languageCheck('HK-CITYU-P004', { testDate: null });
  assert.equal(result.status, 'unknown'); assert.match(result.reason, /2024-09-15/);
});

test('CityU minimum is inclusive and is not a rolling expiry measured from today', () => {
  assert.equal(languageCheck('HK-CITYU-P004', { testDate: '2024-09-15' }).status, 'pass');
  const result = languageCheck('HK-CITYU-P004', { testDate: '2024-09-14' });
  assert.equal(result.status, 'fail'); assert.match(result.reason, /2024-09-15/);
});

test('CityU test-version dates remain separate from the programme-specific date floor', () => {
  assert.equal(languageCheck('HK-CITYU-P004', { type: 'toefl_120', total: 100, testDate: '2025-05-01' }).status, 'pass');
  assert.equal(languageCheck('HK-CITYU-P004', { type: 'toefl_6', total: 5, testDate: null }).status, 'unknown');
});

test('NUS Finance does not convert an unconfirmed old TOEFL score or turn graduation GPA into entry GPA', () => {
  assert.equal(languageCheck('SG-NUS-P007', { type: 'toefl_120', total: 110, testDate: '2025-05-01' }).status, 'unknown');
  assert.equal(languageCheck('SG-NUS-P007', { type: 'toefl_6', total: 4.5, testDate: '2026-05-01' }).status, 'fail');
  assert.equal(get('SG-NUS-P007').rules.some(r => r.kind === 'gpa'), false);
  assert.deepEqual(get('SG-NUS-P007').offerings[0].applicationRounds.map(r => r.deadline), ['2026-11-15', '2027-02-15']);
});

test('NUS General Track retains the aptitude-test discrepancy without automatic exemption or a work threshold', () => {
  const p = get('SG-NUS-P029');
  assert.equal(p.offerings[0].tuition, 76409);
  assert.ok(p.rules.some(r => r.kind === 'manual' && /source discrepancy/i.test(r.labelEn)));
  assert.equal(p.rules.some(r => r.kind === 'gpa' || r.kind === 'experience'), false);
  assert.equal(checkProgramme(p, profile).status, 'needs_confirmation');
});

test('NTU current fees remain unconfirmed and Economics intakes keep separate identities', () => {
  for (const id of ['SG-NTU-P018', 'SG-NTU-P015']) assert.ok(get(id).offerings.every(o => o.tuition === null));
  const msis = get('SG-NTU-P018');
  assert.ok(msis.offerings.every(o => o.applicationOpen === null && o.deadline === '2027-02-15'));
  assert.equal(languageCheck(msis.id, { components: { listening: 7, reading: 7, writing: 5.5, speaking: 7 } }).status, 'fail');
  assert.deepEqual(get('SG-NTU-P015').offerings.map(o => o.id), ['SG-NTU-P015-O2', 'SG-NTU-P015-O3']);
  assert.deepEqual(get('SG-NTU-P015').offerings.map(o => o.deadline), ['2027-01-31', '2027-05-31']);
});

test('SUTD closure does not become an invented deadline or current fee', () => {
  const p = get('SG-SUTD-P002');
  assert.match(p.notesEn, /closed/i);
  assert.ok(p.offerings.every(o => o.deadline === null && o.tuition === null));
  assert.ok(p.rules.some(r => r.kind === 'manual' && /closed/i.test(r.noteEn || '')));
  assert.equal(get('SG-SUTD-P001').offerings[0].deadline, '2026-12-31');
});

test('CUHK rounds retain their dates while disputed part-time tuition stays blank', () => {
  const p = get('HK-CUHK-P001');
  assert.equal(p.lastChecked, '2026-10-24');
  assert.equal(p.offerings.find(o => o.mode === 'Part-time').tuition, null);
  assert.ok(p.offerings.every(o => o.applicationRounds.some(r => r.deadline === '2026-10-31')));
  assert.equal(checkProgramme(p, profile).tier, null);
});

const server = createCheckpoint({ publicDir: new URL('public/', root), pilotPath: new URL('data/checked-programmes.json', root), directoryPath: new URL('data/directory-audit.json', root) });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}`;
test.after(() => new Promise(resolve => server.close(resolve)));
const scenarios = [
  ['computing', profile],
  ['business', { ...structuredClone(profile), major: 'Business Administration' }],
  ['civil', { ...structuredClone(profile), major: 'Civil Engineering' }],
  ['missing evidence', { major: 'Computer Science', language: { type: 'none' } }],
  ['waiver claim', { ...structuredClone(profile), language: { type: 'waiver' } }],
  ['different GPA scale', { ...structuredClone(profile), gpa: 80, gpaScale: 100 }],
  ['low English', { ...structuredClone(profile), language: { ...structuredClone(profile.language), total: 5 } }]
];
for (const [label, input] of scenarios) test(`synthetic ${label}: all twenty API results preserve gaps, uncertainty and original source dates`, async () => {
  const response = await fetch(url + '/api/matches', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ profile: input }) });
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.checkpoint, 'week-06'); assert.equal(data.items.length, 20); assert.equal('profile' in data, false);
  for (const p of data.items) {
    const original = get(p.id);
    assert.deepEqual(p.match, checkProgramme(original, input));
    assert.equal(p.lastChecked, original.lastChecked); assert.equal(p.match.tier, null);
    assert.ok(p.match.counts.unknown > 0); assert.notEqual(p.match.status, 'meets_checked');
    assert.ok(p.match.checks.every(c => c.reason && c.sourceUrl?.startsWith('https://')));
    assert.equal(p.rules.some(r => r.kind === 'gpa'), false);
  }
});
