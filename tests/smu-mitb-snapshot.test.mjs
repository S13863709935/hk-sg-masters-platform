import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const batch = JSON.parse(readFileSync(new URL('../data/checked-programmes.json', import.meta.url), 'utf8'));
const programme = batch.programmes.find(p => p.id === 'SG-SMU-P010');
const p = programme.id;
const jan = programme.offerings.filter(o => o.intake === 'January 2027');
const aug = programme.offerings.filter(o => o.intake === 'August 2027');

test('MITB fee cohorts are four explicit intake/mode choices, not extra programmes', () => {
  assert.equal(batch.programmes.filter(q => q.id === p).length, 1);
  assert.deepEqual(programme.offerings.map(o => o.id), [`${p}-JAN2027-FT`, `${p}-JAN2027-PT`, `${p}-AUG2027-FT`, `${p}-AUG2027-PT`]);
  assert.equal(programme.offerings.some(o => o.id === p + '-O1' || o.id === p + '-O2'), false);
  for (const group of [jan, aug]) assert.deepEqual(group.map(o => o.mode), ['Full-time', 'Part-time']);
  assert.match(programme.notesEn, /IDs are retired/);
});

test('January registration/deposit cannot be reused for August annual charges', () => {
  for (const o of jan) {
    assert.equal(o.tuition, 56680); assert.equal(o.currency, 'SGD');
    assert.match(o.feeBasis, /Registration: SC\/PR SGD 400, foreigners SGD 500/);
    assert.match(o.feeBasis, /confirm tax basis/);
    assert.match(o.feeBasis, /SGD 10,000 deposit is part of tuition/);
    assert.equal(o.feeBasis.includes('Annual miscellaneous'), false);
  }
  for (const o of aug) {
    assert.equal(o.tuition, 56680);
    assert.match(o.feeBasis, /Indicative.*subject to revision/);
    assert.match(o.feeBasis, /Annual miscellaneous fees replace registration/);
    assert.match(o.feeBasis, /foreigners SGD 480, excluding GST/);
    assert.match(o.feeBasis, /SGD 8,000 deposit is part of tuition/);
    assert.equal(o.feeBasis.includes('10,000'), false);
  }
});

test('fee years do not turn recurring or conflicting windows into dated availability', () => {
  assert.equal(programme.fieldStatus.academicYear.status, 'known');
  assert.equal(programme.fieldStatus.tuition.status, 'known');
  assert.equal(programme.fieldStatus.deadline.status, 'unknown');
  for (const o of programme.offerings) { assert.equal(o.applicationOpen, null); assert.equal(o.deadline, null); }
  for (const o of jan) assert.match(o.deadlineNote, /without a year/);
  for (const o of aug) {
    assert.match(o.deadlineNote, /1 September–31 May/);
    assert.match(o.deadlineNote, /FAQ instead starts in January/);
    assert.match(o.deadlineNote, /Neither states the window year/);
  }
});

test('minimum, normal and maximum durations are not conflated', () => {
  for (const o of programme.offerings) assert.equal(o.duration, o.mode === 'Full-time' ? 'Minimum 1 year; normal 1.5 years; maximum 3 years' : 'Minimum 2 years; normal 2.5 years; maximum 5 years');
});

test('preferred experience and discretionary test substitution do not become mandatory GPA rules', () => {
  const experience = programme.rules.find(r => r.kind === 'experience');
  assert.equal(experience.mandatory, false); assert.equal(experience.min, 2);
  assert.equal(programme.rules.some(r => r.kind === 'gpa'), false);
  assert.equal(programme.rules.find(r => r.kind === 'major').any, true);
  const unresolved = programme.rules.find(r => r.kind === 'manual');
  assert.equal(unresolved.mandatory, true);
  assert.match(unresolved.noteEn, /SMUAT score is 56/);
  assert.match(unresolved.noteEn, /No test waiver is automatically granted/);
});

test('two official source observations retain the actual date and unresolved review status', () => {
  assert.equal(programme.lastChecked, '2026-10-20');
  assert.deepEqual(programme.sources.map(s => s.url), ['https://masters.smu.edu.sg/programme/master-of-it-in-business', 'https://masters.smu.edu.sg/programme/MITB/Apply_Now']);
  assert.ok(programme.sources.every(s => s.checkedOn === programme.lastChecked));
  assert.equal(programme.fieldStatus.deadline.sourceUrl, programme.sources[1].url);
  assert.equal(programme.verification, 'programme_page_checked');
  assert.equal(programme.requirementsCoverage, 'partial');
  assert.equal(programme.reviewer, null);
});
