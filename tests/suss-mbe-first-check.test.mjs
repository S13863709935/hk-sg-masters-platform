import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, rmdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CatalogueStore } from '../server/database.mjs';
import { createApp } from '../server/app.mjs';
import { validateProgramme } from '../server/validation.mjs';
import { loadRoutes, resolveProgramme } from '../server/routes.mjs';
import { loadApplicantContexts, applicantSummary } from '../server/applicants.mjs';
import { matchProgramme } from '../server/matching.mjs';
import { programmeTimeline } from '../server/application-dates.mjs';
import { optionSnapshot, shortlistExport, parseSavedOption } from '../public/saved-options.js';
import { loadRepositoryReviewQueue } from '../scripts/source-review-queue.mjs';

const root = new URL('../', import.meta.url), read = path => JSON.parse(readFileSync(new URL(path, root), 'utf8'));
const batch = read('data/checked-programmes.json'), obs = read('data/research/suss-mbe-observation-2026-10-27.json');
const p = batch.programmes.find(x => x.id === obs.programmeId);
const options = { seedPath: new URL('data/catalogue.json', root), expansionPath: new URL('data/catalogue-expansion.json', root), checkedPath: new URL('data/checked-programmes.json', root), directoryEvidencePath: new URL('data/directory-links.json', root), scopeAuditPath: new URL('data/programme-scope-audit.json', root) };
const routePath = new URL('data/route-programmes.json', root), contextPath = new URL('data/applicant-contexts.json', root);
const store = new CatalogueStore(':memory:', options), routes = loadRoutes(routePath, store.all()), contexts = loadApplicantContexts(contextPath, store.all(), routes);
const selected = id => resolveProgramme(store.get(p.id), routes, undefined, id, undefined, contexts);
const rule = label => p.rules.find(r => r.labelEn === label);
// Synthetic only: residence, prior diplomas/credits, relevant work and English applicability are not verified.
const profile = { major: 'Business Administration', degreeStatus: 'graduated', gpa: 2.5, gpaScale: 4, experienceYears: 0, language: { type: 'ielts', total: 7, testDate: '2026-05-01' } };

test('existing MBE remains one explicit coursework master with two study choices and no extra diploma/specialisation identities', () => {
  assert.equal(read('data/catalogue-expansion.json').programmes.find(x => x.id === p.id).verification, 'catalogue_seed');
  assert.equal(validateProgramme(p, new Set(['SG-SUSS'])), p); assert.equal(p.faculty, 'School of Science and Technology');
  assert.equal(p.award, 'MBE'); assert.equal(p.requirementsCoverage, 'partial'); assert.equal(p.reviewer, null);
  assert.equal(obs.identity.totalCu, 60); assert.equal(obs.identity.internationalDirectoryClassifiesCoursework, true);
  assert.equal(obs.identity.specialisations.length, 2); assert.equal(obs.identity.certificateDiplomaNotRequiredFirst, true);
  assert.deepEqual(p.offerings.map(o => o.id), [p.id + '-REGULAR', p.id + '-ACCELERATED']); assert.equal(routes.has(p.id), false);
  assert.equal(batch.programmes.filter(x => x.id === p.id).length, 1); assert.equal(batch.pilotProgrammeIds.includes(p.id), false); assert.equal(batch.pilotProgrammeIds.length, 20);
  assert.equal(/\p{Script=Han}/u.test(JSON.stringify(p)), false);
});

test('regular and accelerated duration/load stay distinct while residence/pass evidence and FT/PT mode are not inferred', () => {
  assert.deepEqual(obs.pathways.regular.durationYears, { minimum: 2, maximum: 4 });
  assert.deepEqual(obs.pathways.accelerated.durationYears, { minimum: 1, maximum: 1 });
  assert.equal(obs.pathways.regular.semesterMaximumCu, 20); assert.equal(obs.pathways.regular.semesterRecommendedCu, 15);
  assert.equal(obs.pathways.accelerated.semesterCu, 30); assert.equal(obs.pathways.accelerated.compulsoryForInternationalStudents, true);
  assert.equal(obs.pathways.accelerated.validStudentPassForInternationalStudents, true); assert.equal(obs.pathways.regular.internationalStudentPassRoute, false);
  for (const o of p.offerings) {
    const record = selected(o.id); assert.equal(record.offerings[0].id, o.id); assert.equal(record.offerings[0].mode, null);
    const result = matchProgramme(record, profile); assert.equal(result.status, 'needs_confirmation'); assert.equal(result.tier, null);
    assert.equal(result.checks.find(c => /Pathway and resident/.test(c.labelEn)).status, 'unknown');
  }
});

test('diploma progression and award GPA do not create an undergraduate GPA gate or reset the stacking clock', () => {
  assert.deepEqual(obs.pathways.stackable.diplomas, ['GDPM', 'GDFMT']); assert.equal(obs.pathways.stackable.eitherDiplomaNotBothRequired, true);
  assert.equal(obs.pathways.stackable.minimumDiplomaGpa, 3); assert.equal(obs.pathways.stackable.maximumYearsFromDiplomaEntry, 4);
  assert.equal(obs.pathways.stackable.clockNotResetAtMasterEntry, true); assert.equal(obs.pathways.stackable.notAutomaticAdmission, true);
  assert.equal(obs.requirements.numericUndergraduateEntryGpa, null); assert.equal(obs.requirements.graduateAwardCgpa, 3);
  assert.equal(p.rules.some(r => ['gpa', 'classification'].includes(r.kind)), false);
  for (const gpa of [1, 3, 4]) {
    const result = matchProgramme(selected(p.offerings[0].id), { ...profile, gpa });
    assert.equal(result.status, 'needs_confirmation'); assert.equal(result.checks.some(c => c.status === 'fail'), false);
    assert.equal(result.checks.find(c => /Stacking, credit/.test(c.labelEn)).status, 'unknown');
  }
});

test('preferred field, encouraged CV and case-by-case qualifications do not become mandatory major/employment gates', () => {
  assert.equal(obs.requirements.fieldPreferenceNotMandatoryWhitelist, true); assert.equal(obs.requirements.otherQualificationsWithRelevantWorkCaseByCase, true);
  assert.equal(obs.requirements.cvStronglyEncouraged, true); assert.equal(rule('CV submission is encouraged').mandatory, false);
  assert.equal(obs.requirements.universalNumericWorkYears, null); assert.equal(p.rules.some(r => ['major', 'experience'].includes(r.kind)), false);
  for (const changes of [{ major: 'History' }, { experienceYears: 0 }, { experienceYears: 20 }, { degreeStatus: 'other' }]) {
    const result = matchProgramme(p, { ...profile, ...changes }); assert.equal(result.status, 'needs_confirmation'); assert.equal(result.tier, null);
    assert.equal(result.checks.find(c => /Qualification recognition/.test(c.labelEn)).status, 'unknown');
    assert.equal(result.checks.some(c => c.status === 'fail'), false);
  }
});

test('conditional general ELPR stays inclusive in meaning without inheriting MECED strict-score or two-year IELTS rules', () => {
  assert.equal(obs.requirements.english.ieltsAcademicMin, 6.5); assert.equal(obs.requirements.english.internetToeflUnversionedMin, 85);
  assert.equal(obs.requirements.english.c1Advanced.yearsAtApplication, 2); assert.equal(obs.requirements.english.muet.yearsAtApplication, 5);
  assert.equal(obs.requirements.english.universalIeltsExpiryNotInferred, true); assert.equal(obs.requirements.english.previousMecedStrictGreaterThanNotInherited, true);
  assert.equal(p.rules.some(r => r.kind === 'language'), false);
  assert.match(rule('English applicability and alternative evidence').noteEn, /at least 6.5/);
  for (const language of [{ type: 'ielts', total: 5 }, { type: 'ielts', total: 6.5 }, { type: 'ielts', total: 9 }, { type: 'waiver' }, { type: 'toefl_120', total: 85 }, { type: 'toefl_6', total: 6 }]) {
    const result = matchProgramme(p, { ...profile, language }); assert.equal(result.status, 'needs_confirmation'); assert.equal(result.tier, null);
    assert.equal(result.checks.find(c => /English applicability/.test(c.labelEn)).status, 'unknown');
  }
});

test('course-topic approval, modular CPD, expired alumni credit and CET continuation do not become admissions or professional guarantees', () => {
  assert.equal(obs.study.fmt588TopicNeedsHopApproval, true); assert.equal(obs.study.fmt588IsCourseSelectionNotUniversalAdmissionProposal, true);
  assert.equal(rule('Award GPA and course project are separate').mandatory, false);
  assert.equal(obs.study.modularCpdClaimNotWholeDegreeProfessionalAccreditation, true); assert.equal(obs.study.currentExternalAccreditationNotIndependentlyChecked, true);
  assert.equal(obs.fees.legacyAlumniCreditPageExpiry, '2023-12'); assert.equal(obs.fees.legacyCreditNotAppliedAsCurrentBenefit, true);
  assert.equal(obs.study.cetCreditTransferNeedsAdmissionAndReview, true); assert.equal(obs.study.cetAfterExceededCandidatureDoesNotRestoreAward, true);
  assert.equal(rule('Professional and alumni claims need separate confirmation').mandatory, false);
});

test('recurring January/July intakes do not establish a current opening, specific year or hard deadline for either pathway', () => {
  assert.deepEqual(obs.cycle.recurringIntakes, ['January', 'July']); assert.equal(obs.cycle.bothRegularAndAccelerated, true);
  for (const o of p.offerings) {
    assert.equal(o.academicYear, null); assert.equal(o.applicationOpen, null); assert.equal(o.deadline, null);
    for (const day of ['2026-10-27', '2027-01-01', '2027-04-15', '2027-07-01']) assert.equal(programmeTimeline(selected(o.id), day).state, 'dates_incomplete');
  }
  assert.equal(obs.cycle.livePortalChecked, false);
});

test('MBE fee quote remains separate from personal pathway/credit costs and preserves source-access limitations', () => {
  assert.deepEqual(obs.fees.masterTextQuote, { scPr: 31680, otherResidents: 38016, conditionalSubsidisedAsLowAs: 17424 });
  assert.notEqual(obs.fees.masterTextQuote.conditionalSubsidisedAsLowAs, read('data/research/suss-meced-observation-2026-10-27.json').fees.masterTextQuote.conditionalSubsidisedAsLowAs);
  assert.equal(obs.fees.acceptanceDeposit.notExtraTuition, true); assert.equal(obs.fees.pdfColumnsNotVisuallyVerified, true);
  assert.equal(obs.sourceLimitations.curriculumPlanFetchFailed, true); assert.equal(obs.sourceLimitations.pdfVisualInspectionCompleted, false);
  assert.ok(p.offerings.every(o => o.tuition === null && o.applicationFee === null));
  assert.equal([...contexts.values()].some(c => c.programmeId === p.id), false);
});

test('first MBE migration preserves earlier data over isolated restarts and leaves MECED archives immutable', () => {
  for (const [file, hash] of Object.entries(obs.preservation.previousSnapshotHashes)) assert.equal(createHash('sha256').update(readFileSync(new URL(file, root), 'utf8').replaceAll('\r\n', '\n')).digest('hex'), hash);
  const queue = loadRepositoryReviewQueue('2026-10-27'); assert.equal(queue.counts.programmePageRecords, 238); assert.equal(queue.counts.reviewUnits, 448);
  assert.equal(queue.counts.reviewRecordedInSource, 0); assert.equal(queue.units.find(u => u.programmeId === p.id).upcomingRecordedCutoffs.length, 0);
  const dir = mkdtempSync(join(tmpdir(), 'gradpath-suss-mbe-')), path = join(dir, 'test.sqlite'), checkedPath = join(dir, 'checked.json'); let db;
  try {
    writeFileSync(checkedPath, JSON.stringify({ ...batch, programmes: batch.programmes.filter(x => x.id !== p.id) }));
    db = new CatalogueStore(path, { ...options, checkedPath }); const previous = db.all().filter(x => x.id !== p.id), directory = db.get(p.id).directoryListing;
    assert.equal(db.get(p.id).verification, 'catalogue_seed'); assert.equal(db.quality().checked, batch.programmes.length - 1); db.close(); db = null;
    writeFileSync(checkedPath, JSON.stringify(batch));
    for (let restart = 0; restart < 2; restart++) {
      db = new CatalogueStore(path, { ...options, checkedPath }); assert.equal(db.get(p.id).verification, 'programme_page_checked');
      assert.deepEqual(db.get(p.id).directoryListing, directory); assert.deepEqual(db.all().filter(x => x.id !== p.id), previous);
      assert.deepEqual(db.quality().sourceRefreshConflicts, []); assert.equal(db.quality().total, 873); assert.equal(db.quality().checked, 238); db.close(); db = null;
    }
  } finally { db?.close(); rmSync(path, { force: true }); rmSync(checkedPath, { force: true }); rmdirSync(dir); }
});

const app = createApp({ store, publicDir: new URL('public/', root), routeEvidencePath: routePath, applicantEvidencePath: contextPath, now: () => new Date('2026-10-27T04:00:00Z') });
await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${app.address().port}`, get = async path => (await fetch(base + path)).json();
test.after(async () => { await new Promise(resolve => app.close(resolve)); store.close(); });

test('actual API/save/restore/export keeps each MBE duration and unresolved evidence without exporting the background or accepting retired choices', async () => {
  const before = JSON.stringify(store.all());
  for (const o of p.offerings) {
    const detail = await get('/api/programmes/' + p.id + '?offering=' + o.id); assert.equal(detail.applicationTimeline.state, 'dates_incomplete');
    assert.equal(detail.offerings[0].duration, o.duration);
    const response = await fetch(base + '/api/matches', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ profile, offerings: { [p.id]: o.id } }) });
    assert.equal(response.status, 200); assert.equal((await response.json()).items.find(x => x.id === p.id).match.status, 'needs_confirmation');
    const saved = optionSnapshot(detail, '2026-10-27T04:00:00.000Z'); assert.equal(parseSavedOption(saved).offeringId, o.id);
    const restored = await fetch(base + '/api/saved-options/resolve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contexts: [saved, { programmeId: p.id, offeringId: p.id + '-catalogue' }] }) });
    assert.equal(restored.status, 200); const items = (await restored.json()).items; assert.deepEqual(items.map(x => x.status), ['resolved', 'needs_attention']);
    const exported = shortlistExport([items[0].programme], { [p.id]: saved }).programmes[0]; assert.equal(exported.offerings[0].id, o.id);
    assert.equal(exported.offerings[0].duration, o.duration); assert.equal(exported.offerings[0].tuition, null); assert.equal(exported.offerings[0].deadline, null);
    assert.match(exported.evidence.publishedRequirements.find(r => /Stacking, credit/.test(r.labelEn)).noteEn, /not reset/);
    assert.equal(exported.evidence.publishedRequirements.find(r => /CV submission/.test(r.labelEn)).mandatory, false);
    assert.equal(exported.profile, undefined); assert.equal(exported.match, undefined);
  }
  const meta = await get('/api/meta'); assert.equal(meta.quality.total, 873); assert.equal(meta.quality.browsable, 869); assert.equal(meta.quality.checked, 238);
  assert.equal(meta.quality.peerReviewed, 0); assert.equal(meta.quality.complete, 0); assert.deepEqual(meta.quality.sourceRefreshConflicts, []);
  assert.deepEqual(applicantSummary(contexts), { studyOptions: 184, categories: 370, peerReviewed: 0 }); assert.equal(meta.routeEvidence.routes, 26); assert.equal(JSON.stringify(store.all()), before);
});
