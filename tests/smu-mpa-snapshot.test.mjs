import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const batch = JSON.parse(readFileSync(new URL('../data/checked-programmes.json', import.meta.url), 'utf8'));
const programme = batch.programmes.find(p => p.id === 'SG-SMU-P001');
const official = 'https://masters.smu.edu.sg/programme/master-of-professional-accounting';
const dates = 'https://masters.smu.edu.sg/programme/MPA/apply_now';

test('the SMU refresh dates are explicit without relabelling unrelated programmes', () => {
  assert.equal(batch.checkedOn, '2026-10-20');
  assert.equal(programme.lastChecked, '2026-10-20');
  assert.deepEqual(batch.programmes.filter(p => p.lastChecked === '2026-10-20').map(p => p.id), [programme.id, 'SG-SMU-P010']);
  assert.equal(batch.programmes.find(p => p.id === 'SG-NUS-P029').lastChecked, '2026-10-06');
});

test('both MPA modes keep their stable IDs and dated August 2027 cohort', () => {
  assert.deepEqual(programme.offerings.map(o => [o.id, o.mode]), [['SG-SMU-P001-O1', 'Full-time'], ['SG-SMU-P001-O2', 'Part-time']]);
  for (const o of programme.offerings) {
    assert.equal(o.intake, 'August 2027');
    assert.equal(o.academicYear, 'August 2027 intake');
    assert.equal(o.applicationOpen, '2026-09-01');
    assert.equal(o.deadline, '2027-06-30');
    assert.match(o.deadlineNote, /31 Dec 2026/);
    assert.match(o.deadlineNote, /31 Mar 2027/);
    assert.match(o.deadlineNote, /30 Jun 2027/);
    assert.match(o.deadlineNote, /Supporting documents/);
  }
});

test('tuition excludes separate fees and does not add the deposit twice', () => {
  for (const o of programme.offerings) {
    assert.equal(o.currency, 'SGD'); assert.equal(o.tuition, 58860);
    for (const phrase of [/including GST/, /subject to revision/, /Separate application fee: SGD 100/, /Annual miscellaneous fees exclude GST/, /SC\/PR SGD 400/, /international SGD 480/, /deposit counts toward tuition/, /status needs university confirmation/]) assert.match(o.feeBasis, phrase);
  }
});

test('exemption GPAs are not invented general admission thresholds', () => {
  assert.equal(programme.rules.some(r => r.kind === 'gpa'), false);
  assert.match(programme.notesEn, /not general entry cutoffs/);
  assert.match(programme.notesEn, /discretionary/);
  assert.equal(programme.fieldStatus.gpa.status, 'not_published');
});

test('score thresholds remain separate from waiver and submission-time validity', () => {
  const language = programme.rules.find(r => r.kind === 'language');
  assert.equal(language.tests.ielts.total, 6.5);
  assert.equal(language.tests.toefl_120.total, 90);
  assert.equal(language.tests.toefl_6.total, 4.5);
  const validity = programme.rules.find(r => r.labelEn === 'English waiver and test validity');
  assert.equal(validity.mandatory, true);
  assert.match(validity.noteEn, /two years at application submission/);
  assert.match(validity.noteEn, /meeting a score alone is insufficient/);
});

test('dated source links and unresolved human review are retained independently', () => {
  assert.deepEqual(programme.sources.map(s => s.url), [official, dates]);
  assert.ok(programme.sources.every(s => s.checkedOn === programme.lastChecked));
  assert.equal(programme.fieldStatus.deadline.sourceUrl, dates);
  assert.equal(programme.fieldStatus.deadline.status, 'known');
  assert.equal(programme.fieldStatus.tuition.status, 'known');
  assert.equal(programme.fieldStatus.independentReview.status, 'unknown');
  assert.equal(programme.verification, 'programme_page_checked');
  assert.equal(programme.requirementsCoverage, 'partial');
  assert.equal(programme.reviewer, null);
});
