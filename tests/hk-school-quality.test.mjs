import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CatalogueStore } from '../server/database.mjs';
import { buildSchoolQuality, loadSchoolQuality } from '../scripts/school-quality.mjs';
import { matchProgramme } from '../server/matching.mjs';
import { programmeTimeline } from '../server/application-dates.mjs';
import { loadRepositoryReviewQueue } from '../scripts/source-review-queue.mjs';
import { loadRoutes, resolveProgramme } from '../server/routes.mjs';
import { loadApplicantContexts, offeringFingerprint } from '../server/applicants.mjs';

const root = new URL('../', import.meta.url), read = f => JSON.parse(readFileSync(new URL(f, root), 'utf8'));
const observation = read('data/research/hk-existing-records-observation-2026-10-30.json');
const store = new CatalogueStore(':memory:', { seedPath: new URL('data/catalogue.json', root), expansionPath: new URL('data/catalogue-expansion.json', root), checkedPath: new URL('data/checked-programmes.json', root), scopeAuditPath: new URL('data/programme-scope-audit.json', root), directoryEvidencePath: new URL('data/directory-links.json', root) });
const all = store.all(), routes = loadRoutes(new URL('data/route-programmes.json', root), all), applicants = loadApplicantContexts(new URL('data/applicant-contexts.json', root), all, routes);
const profile = { major: 'History', degreeStatus: 'graduated', classification: 'ordinary', gpa: 3.5, gpaScale: 4, language: { type: 'ielts', total: 7, singleAttempt: true, testDate: '2026-09-01' } };
test.after(() => store.close());

test('eight Hong Kong school audits report 15 existing observations without promoting 580 remaining leads', () => {
  const reports = observation.schoolReports;
  assert.equal(reports.length, 8); assert.equal(observation.counts.catalogueRecords, 595);
  assert.equal(observation.counts.checkedRecords, 15); assert.equal(observation.counts.directRecords, 14); assert.equal(observation.counts.archiveOnly, 1);
  assert.equal(observation.counts.completeRequirementSets, 0); assert.equal(observation.counts.independentlyReviewed, 0);
  const recordedIds = new Set(reports.flatMap(r => r.rows.map(p => p.programmeId)));
  const recordedSelection = all.map(p => p.universityId.startsWith('HK-') && !recordedIds.has(p.id) ? { ...p, verification: 'catalogue_seed' } : p);
  for (const report of reports) assert.deepEqual(buildSchoolQuality(recordedSelection, report.schoolId, '2026-10-30', { checkedOnly: true }), report);
  assert.equal(reports.reduce((n, r) => n + r.rows.length, 0), 15);
  assert.equal(reports.reduce((n, r) => n + r.counts.catalogueRecords - r.rows.length, 0), 580);
});

test('checked-only selection distinguishes a transfer archive from active field follow-up', () => {
  const report = loadSchoolQuality('HK-HKUST', '2026-10-30', { checkedOnly: true });
  assert.equal(report.rows.length, 15); assert.equal(report.counts.archiveOnly, 1);
  assert.ok(report.counts.catalogueRecords > report.rows.length);
  const archive = report.rows.find(r => r.programmeId === 'HK-HKUST-P003');
  assert.equal(archive.admissionRoute, 'transfer_only'); assert.equal(archive.fieldStates.language, 'unrecorded');
  assert.equal(report.counts.activeFieldGaps.language, 0); assert.equal(report.counts.fieldGaps.language, 1);
  assert.equal(observation.counts.activeFieldGaps.major, 2); assert.equal(observation.counts.activeFieldGaps.language, 1);
});

test('unpublished major restrictions do not create any-major rules, numeric GPA gates or eligibility approval', () => {
  for (const id of observation.changedProgrammeIds) {
    const p = store.get(id); assert.equal(p.fieldStatus.major.status, 'not_published');
    assert.equal(p.fieldStatus.gpa.status, 'not_published'); assert.equal(p.requirementsCoverage, 'partial');
    assert.equal(p.rules.some(r => ['major', 'gpa', 'classification'].includes(r.kind)), false);
    const results = ['History', 'Computing', 'Business Administration'].map(major => matchProgramme(p, { ...profile, major }));
    for (const result of results) { assert.equal(result.status, 'needs_confirmation'); assert.equal(result.tier, null); assert.equal(result.checks.some(c => c.kind === 'major' && c.status === 'pass'), false); }
    assert.deepEqual(results[0].recordedCriteria, results[1].recordedCriteria);
    assert.equal(p.lastChecked, '2026-10-30'); assert.ok(p.sources.some(s => s.checkedOn === '2026-10-23'));
    assert.ok(p.sources.some(s => s.checkedOn === '2026-10-30'));
  }
});

test('existing applicant categories keep their separate dates and valid fee/option bindings', () => {
  for (const context of applicants.values()) {
    if (!observation.changedProgrammeIds.includes(context.programmeId)) continue;
    const p = store.get(context.programmeId), o = p.offerings.find(o => o.id === context.offeringId);
    assert.equal(context.offeringFingerprint, offeringFingerprint(o)); assert.equal(context.checkedOn, '2026-10-23');
    const resolved = resolveProgramme(p, routes, undefined, o.id, context.options[0].id, applicants);
    assert.equal(resolved.applicantEvidence.checkedOn, '2026-10-23');
    assert.equal(resolved.fieldStatus.major.status, 'not_published');
  }
  assert.equal(loadRepositoryReviewQueue('2026-10-30').counts.staleApplicantContexts, 0);
});

test('Chinese-medium ADS and preferred science background do not inherit English-medium score floors or a major exclusion', () => {
  const p = store.get('HK-EDUHK-P044');
  assert.equal(p.fieldStatus.language.status, 'unknown'); assert.equal(p.rules.some(r => ['major', 'language'].includes(r.kind)), false);
  const result = matchProgramme(p, profile); assert.equal(result.status, 'needs_confirmation'); assert.equal(result.tier, null);
  assert.match(p.rules.find(r => /Putonghua/.test(r.labelEn)).noteEn, /Chinese-medium/);
});

test('the exact HKU noon cutoff already recorded remains precise across the cutoff instant', () => {
  const p = store.get('HK-HKU-P007'), o = p.offerings[0], selected = { ...p, offerings: [o], selectedOffering: o };
  assert.equal(o.applicationRounds[0].deadlineAt, '2027-01-04T12:00:00+08:00');
  assert.equal(programmeTimeline(selected, '2027-01-04', '2027-01-04T03:59:00.000Z').offerings[0].rounds[0].state, 'cutoff_ahead');
  assert.equal(programmeTimeline(selected, '2027-01-04', '2027-01-04T04:00:00.000Z').offerings[0].rounds[0].state, 'cutoff_reached');
});

test('urgent dates keep their programme, intake and round identities without a live-portal claim', () => {
  const q = loadRepositoryReviewQueue('2026-10-30'); assert.equal(q.counts.nearCutoffUnits, 3);
  const near = q.units.filter(u => u.reviewOrder === 'cutoff_within_14_days');
  assert.deepEqual(near.map(u => u.programmeId), ['HK-CUHK-P001', 'HK-HKUST-P001', 'HK-HKUST-P021']);
  assert.ok(near[0].upcomingRecordedCutoffs.every(c => c.roundId === 'ROUND-2' && c.deadline === '2026-10-31'));
  assert.deepEqual(near[1].upcomingRecordedCutoffs.map(c => [c.offeringId, c.deadline]), [['HK-HKUST-P001-FEB2027-PT', '2026-11-01']]);
});

test('failed department retrievals are explicit and do not advance the older complete-source observation dates', () => {
  assert.equal(observation.retrievalFailures.length, 2);
  assert.ok(observation.retrievalFailures.every(s => /timed out/.test(s.outcome)));
  const p = store.get('HK-CUHK-P001'); assert.equal(p.lastChecked, '2026-10-24');
  assert.ok(p.sources.every(s => s.checkedOn === '2026-10-24'));
  assert.equal(p.fieldStatus.major.status, 'unknown');
});

test('checked-only validation is explicit while the existing SMU default audit remains reproducible', () => {
  assert.throws(() => buildSchoolQuality(all, 'HK-HKU', '2026-10-30', { checkedOnly: 'true' }), TypeError);
  const report = loadSchoolQuality('SG-SMU', '2026-10-30');
  assert.equal(report.recordSelection, undefined); assert.equal(report.rows.length, 17);
  assert.deepEqual(report, read('data/research/smu-school-source-observation-2026-10-30.json').localQuality);
});
