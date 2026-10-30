import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadSchoolQuality, buildSchoolQuality, formatSchoolQuality } from '../scripts/school-quality.mjs';
import { programmeTimeline } from '../server/application-dates.mjs';
import { loadRepositoryReviewQueue } from '../scripts/source-review-queue.mjs';

const root = new URL('../', import.meta.url), read = p => JSON.parse(readFileSync(new URL(p, root), 'utf8'));
const batch = read('data/checked-programmes.json');
const get = id => batch.programmes.find(p => p.id === id);

test('the school matrix is reproducible, includes every existing SMU record and separates unpublished GPA from missing language evidence', () => {
  const report = loadSchoolQuality('SG-SMU', '2026-10-30');
  assert.equal(new Set(report.rows.map(r => r.programmeId)).size, 17);
  assert.equal(report.counts.fieldGaps.gpa, 0); assert.equal(report.counts.fieldGaps.language, 15);
  assert.equal(report.counts.fieldGaps.tuition, 14); assert.equal(report.counts.fieldGaps.deadline, 11);
  assert.equal(report.rows.every(r => r.notPublishedFields.includes('gpa')), true);
  assert.equal(formatSchoolQuality(report), readFileSync(new URL('docs/research/smu-school-quality-2026-10-30.md', root), 'utf8'));
});

test('actual MSE and MSFE January extensions do not shift the August cohort, fees or requirements', () => {
  for (const id of ['SG-SMU-P007', 'SG-SMU-P009']) {
    const p = get(id); assert.equal(p.lastChecked, '2026-10-30'); assert.equal(p.fieldStatus.deadline.status, 'known');
    for (const o of p.offerings) {
      assert.equal(o.tuition, null); assert.match(o.deadlineNote, /explicitly extend/);
      if (o.intake === 'January 2027') {
        assert.equal(o.applicationOpen, '2026-07-01'); assert.equal(o.deadline, '2026-11-30');
        const selected = { ...p, offerings: [o], selectedOffering: o };
        for (const [day, state] of [['2026-10-31', 'within_recorded_dates'], ['2026-11-30', 'deadline_today'], ['2026-12-01', 'deadline_passed']]) assert.equal(programmeTimeline(selected, day).state, state);
      } else { assert.equal(o.applicationOpen, '2026-09-01'); assert.equal(o.deadline, '2027-05-31'); }
    }
  }
});

test('MDSE main-page versus separate application-page difference remains unconfirmed without importing sibling extensions', () => {
  const p = get('SG-SMU-P008'); assert.equal(p.fieldStatus.deadline.status, 'unknown');
  assert.match(p.fieldStatus.deadline.noteEn, /main-page\/landing difference/);
  assert.ok(p.sources.some(s => s.url.endsWith('/MDSE/Apply_Now')));
  for (const o of p.offerings) {
    assert.equal(o.applicationOpen, null); assert.equal(o.deadline, null);
    assert.equal(programmeTimeline({ ...p, offerings: [o], selectedOffering: o }, '2026-10-30').state, 'dates_incomplete');
  }
});

test('the current maintenance queue removes stale October warnings and historical views withhold future observations', () => {
  const q = loadRepositoryReviewQueue('2026-10-30'); assert.equal(q.counts.nearCutoffUnits, 3);
  for (const id of ['SG-SMU-P007', 'SG-SMU-P009']) {
    const u = q.units.find(u => u.programmeId === id);
    assert.ok(u.recordedCutoffs.some(c => c.deadline === '2026-11-30'));
    assert.equal(u.upcomingRecordedCutoffs.some(c => c.deadline === '2026-10-31'), false);
  }
  const historical = loadSchoolQuality('SG-SMU', '2026-10-29');
  for (const id of ['SG-SMU-P007', 'SG-SMU-P008', 'SG-SMU-P009']) assert.equal(historical.rows.find(r => r.programmeId === id).sourceAfterSnapshot, true);
});

test('school selection and dates are explicit, while a directory lead cannot contribute legacy rules', () => {
  for (const [id, date] of [['BAD', '2026-10-30'], ['SG-SMU', '2026-02-30'], ['SG-SMU', undefined]]) assert.throws(() => buildSchoolQuality([], id, date), TypeError);
  assert.throws(() => buildSchoolQuality([], 'SG-SMU', '2026-10-30'), /No catalogue/);
  const p = { id: 'SG-TEST-P001', name: 'Synthetic lead', universityId: 'SG-TEST', verification: 'catalogue_seed', requirementsCoverage: 'unreviewed', rules: [{ kind: 'gpa' }] };
  const report = buildSchoolQuality([p], 'SG-TEST', '2026-10-30');
  assert.deepEqual(report.rows[0].comparableRuleKinds, []); assert.equal(report.counts.checkedRecords, 0);
});
