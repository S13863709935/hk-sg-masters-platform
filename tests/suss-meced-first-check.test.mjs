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
const batch = read('data/checked-programmes.json'), obs = read('data/research/suss-meced-observation-2026-10-27.json');
const p = batch.programmes.find(x => x.id === obs.programmeId), o = p.offerings[0];
const options = { seedPath: new URL('data/catalogue.json', root), expansionPath: new URL('data/catalogue-expansion.json', root), checkedPath: new URL('data/checked-programmes.json', root), directoryEvidencePath: new URL('data/directory-links.json', root), scopeAuditPath: new URL('data/programme-scope-audit.json', root) };
const routePath = new URL('data/route-programmes.json', root), contextPath = new URL('data/applicant-contexts.json', root);
const store = new CatalogueStore(':memory:', options), routes = loadRoutes(routePath, store.all()), contexts = loadApplicantContexts(contextPath, store.all(), routes);
const selected = () => resolveProgramme(store.get(p.id), routes, undefined, o.id, undefined, contexts);
const rule = label => p.rules.find(r => r.labelEn === label);
// Synthetic only: teaching qualification, work relevance, English-medium evidence and residence are not verified.
const profile = { major: 'Education', degreeStatus: 'graduated', gpa: 2.5, gpaScale: 4, experienceYears: 0, language: { type: 'ielts', total: 7, testDate: '2026-05-01' } };

test('MECED retains one existing revised master, two tracks and separate Chinese/TESOL sibling identities', () => {
  assert.equal(read('data/catalogue-expansion.json').programmes.find(x => x.id === p.id).verification, 'catalogue_seed');
  assert.equal(validateProgramme(p, new Set(['SG-SUSS'])), p); assert.equal(p.faculty, 'S R Nathan School of Human Development');
  assert.equal(p.award, 'MECED'); assert.equal(p.requirementsCoverage, 'partial'); assert.equal(p.reviewer, null);
  assert.equal(obs.identity.coreCu + obs.identity.electiveCu + obs.identity.trackCu, 60); assert.equal(obs.identity.tracks.length, 2);
  assert.equal(obs.identity.linkedPlanCode, 'MECEDN'); assert.equal(obs.identity.notTwoExtraMasters, true);
  const chinese = store.get('SG-SUSS-P021'); assert.equal(chinese.verification, 'programme_page_checked');
  assert.notEqual(chinese.id, p.id); assert.notEqual(chinese.officialUrl, p.officialUrl); assert.equal(chinese.award, 'MEd');
  assert.equal(chinese.rules.some(r => r.kind === 'major' && r.accepted.includes('Early Childhood Education')), true);
  assert.equal(chinese.rules.some(r => r.labelEn === 'Programme-specific Chinese qualification and test validity'), true);
  assert.deepEqual(store.get(p.id).rules, p.rules); assert.notEqual(store.get('SG-SUSS-P004').id, p.id); assert.notEqual(store.get('SG-SUSS-P004').name, p.name);
  assert.equal(p.offerings.length, 1); assert.equal(o.id, p.id + '-MECED'); assert.equal(routes.has(p.id), false);
  assert.equal(batch.pilotProgrammeIds.includes(p.id), false); assert.equal(batch.pilotProgrammeIds.length, 20);
  assert.equal(/\p{Script=Han}/u.test(JSON.stringify(p)), false);
});

test('degree/professional alternatives cannot become a closed major whitelist or an automatic acceptance from major alone', () => {
  assert.equal(obs.admission.strongProfessionalRecordAlternativeNeedsAssessment, true);
  assert.equal(obs.admission.degreeConductedInEnglishWording, true); assert.equal(obs.admission.numericUndergraduateEntryGpa, null);
  assert.equal(p.rules.some(r => ['major', 'gpa', 'classification'].includes(r.kind)), false);
  for (const major of ['Education', 'English Studies', 'Business Administration']) {
    const result = matchProgramme(selected(), { ...profile, major });
    assert.equal(result.status, 'needs_confirmation'); assert.equal(result.tier, null); assert.equal(result.checks.some(c => c.status === 'fail'), false);
    assert.equal(result.checks.find(c => /Degree field/.test(c.labelEn)).status, 'unknown');
  }
});

test('teacher-training diploma and relevant experience/CV are unresolved evidence rather than generic degree or work-year substitutes', () => {
  assert.equal(obs.admission.teacherTraining.minimumLevel, 'Diploma');
  assert.deepEqual(obs.admission.teacherTraining.acceptedSectors, ['Early childhood', 'Primary school', 'Secondary school']);
  assert.equal(obs.admission.relevantWorkExperienceRequired, true); assert.equal(obs.admission.cvRequired, true);
  assert.equal(obs.admission.numericWorkYearMinimum, null); assert.equal(p.rules.some(r => r.kind === 'experience'), false);
  for (const experienceYears of [null, 0, 2, 40]) {
    const result = matchProgramme(selected(), { ...profile, experienceYears }); assert.equal(result.status, 'needs_confirmation');
    for (const label of ['Teacher-training qualification', 'Relevant professional experience and CV']) assert.equal(result.checks.find(c => c.labelEn === label).status, 'unknown');
  }
});

test('conditional strict IELTS/TOEFL wording, components and expiry are not flattened into the inclusive general ELPR', () => {
  const alternatives = obs.english.programmeAlternatives;
  assert.deepEqual(alternatives.ieltsAcademic, { operator: '>', total: 6.5, allComponentsMin: 6 });
  assert.deepEqual(alternatives.toeflIbtUnversioned, { operator: '>', total: 85, writingMin: 22 });
  assert.equal(alternatives.toeflPbt.preferredTwe, 5); assert.equal(obs.english.programmeIeltsToeflYearsAtApplication, 2);
  assert.equal(obs.english.generalElpr.ieltsAcademicMin, 6.5); assert.equal(obs.english.programmeAndGeneralPolicyNotFlattened, true);
  assert.equal(p.rules.some(r => r.kind === 'language'), false);
  assert.match(rule('Conditional programme English requirements').noteEn, /strictly above 6.5/);
  for (const major of ['Education', 'Business Administration']) for (const language of [
    { type: 'ielts', total: 6.5, components: { writing: 6 } }, { type: 'ielts', total: 7, components: { writing: 5.5 } },
    { type: 'ielts', total: 9 }, { type: 'waiver' }, { type: 'toefl_120', total: 85 }, { type: 'toefl_6', total: 6 }
  ]) {
    const result = matchProgramme(selected(), { ...profile, major, language }); assert.equal(result.status, 'needs_confirmation'); assert.equal(result.tier, null);
    assert.equal(result.checks.find(c => /Conditional programme English/.test(c.labelEn)).status, 'unknown');
  }
});

test('resident eligibility is not inherited from international MCOU or inferred from nationality and Other Resident pricing', () => {
  assert.equal(obs.eligibility.currentlyUnableToTakeInternationalStudents, true);
  assert.equal(obs.eligibility.singaporeCitizensPrOrResidentsMayApply, true); assert.equal(obs.eligibility.allForeignNationalsNotAutomaticallyRejected, true);
  assert.equal(read('data/research/suss-mcou-observation-2026-10-27.json').eligibility.singaporeCitizensPrAndInternationalStudents, true);
  assert.equal(obs.fees.otherResidentPriceNotStudentPassAdmission, true); assert.equal(obs.eligibility.studentPassRouteNotEstablished, true);
  assert.equal(matchProgramme(selected(), profile).checks.find(c => /Singapore resident/.test(c.labelEn)).status, 'unknown');
});

test('January intake, revision and course-presentation years do not create May/July master intakes or a live dated window', () => {
  assert.equal(obs.cycle.recurringIntakeMonth, 'January'); assert.equal(obs.cycle.intakesPerYear, 1); assert.equal(obs.identity.revisionYearNotAdmissionCohort, 2026);
  assert.deepEqual(obs.curriculum.presentationYears, [2026, 2027]); assert.equal(obs.curriculum.presentationSemestersNotAdmissionIntakes, true);
  assert.equal(o.mode, null); assert.equal(o.academicYear, null); assert.equal(o.applicationOpen, null); assert.equal(o.deadline, null);
  assert.equal(obs.study.nominalYears, 2); assert.equal(obs.study.maximumYears, 4); assert.equal(obs.study.teacherTrainerIncludesPhysicalIalTeaching, true);
  for (const day of ['2026-10-27', '2027-01-01', '2027-05-01', '2027-07-01']) assert.equal(programmeTimeline(selected(), day).state, 'dates_incomplete');
});

test('course prerequisites, funding load and award standards cannot become pre-admission gates or automatic professional qualification', () => {
  assert.equal(obs.study.graduateAwardCgpa, 3); assert.deepEqual(obs.curriculum.ece598CoursePrerequisites, ['ECE525', 'ECE597']);
  assert.equal(obs.curriculum.ece598MinimumCompletedCu, 30); assert.equal(obs.curriculum.coursePrerequisitesNotPreAdmissionGates, true);
  assert.deepEqual(obs.funding.sameSemesterBxlCoursesForAdvertisedGcertFunding, ['BXL641', 'BXL642', 'BXL643']);
  assert.equal(obs.funding.fundingConditionNotAdmissionOrUniversalStudyLoad, true); assert.equal(obs.funding.currentExternalFundingEligibilityNotVerified, true);
  assert.equal(rule('Award and course prerequisites are study requirements').mandatory, false); assert.equal(rule('Funding and professional outcomes are separate').mandatory, false);
  assert.equal(obs.study.principalQualificationNotAutomaticallyConferredPerUniversityFaq, true); assert.equal(obs.study.platformDoesNotCollectChildOrTeacherRecords, true);
  assert.equal(matchProgramme(selected(), { ...profile, gpa: 1 }).checks.some(c => c.status === 'fail'), false);
});

test('MECED fee quotes remain unassigned without a funding deduction, certificate addition or international miscellaneous-price route', () => {
  assert.deepEqual(obs.fees.masterTextQuote, { scPr: 31680, otherResidents: 38016, conditionalSubsidisedAsLowAs: 22044 });
  assert.notEqual(obs.fees.masterTextQuote.conditionalSubsidisedAsLowAs, read('data/research/suss-mger-observation-2026-10-27.json').fees.masterTuition.conditionalSubsidisedAsLowAs);
  assert.equal(obs.fees.pdfColumnsNotVisuallyVerified, true); assert.equal(obs.sourceLimitations.pdfVisualInspectionCompleted, false);
  assert.equal(obs.fees.generalInternationalMisc530NotAssigned, true); assert.equal(obs.fees.acceptanceDeposit.notExtraTuition, true);
  assert.equal(o.tuition, null); assert.equal(o.applicationFee, null); assert.equal([...contexts.values()].some(c => c.programmeId === p.id), false);
});

test('MECED migration preserves earlier source records across isolated restarts and leaves MCOU archives immutable', () => {
  for (const [file, hash] of Object.entries(obs.preservation.previousSnapshotHashes)) assert.equal(createHash('sha256').update(readFileSync(new URL(file, root), 'utf8').replaceAll('\r\n', '\n')).digest('hex'), hash);
  const queue = loadRepositoryReviewQueue('2026-10-27'); assert.equal(queue.counts.programmePageRecords, 69); assert.equal(queue.counts.reviewUnits, 94);
  assert.equal(queue.counts.reviewRecordedInSource, 0); assert.equal(queue.units.find(u => u.programmeId === p.id).upcomingRecordedCutoffs.length, 0);
  const dir = mkdtempSync(join(tmpdir(), 'gradpath-suss-meced-')), path = join(dir, 'test.sqlite'), checkedPath = join(dir, 'checked.json'); let db;
  try {
    writeFileSync(checkedPath, JSON.stringify({ ...batch, programmes: batch.programmes.filter(x => x.id !== p.id) }));
    db = new CatalogueStore(path, { ...options, checkedPath }); const previous = db.all().filter(x => x.id !== p.id), directory = db.get(p.id).directoryListing;
    assert.equal(db.get(p.id).verification, 'catalogue_seed'); assert.equal(db.quality().checked, 68); db.close(); db = null;
    writeFileSync(checkedPath, JSON.stringify(batch));
    for (let restart = 0; restart < 2; restart++) {
      db = new CatalogueStore(path, { ...options, checkedPath }); assert.equal(db.get(p.id).verification, 'programme_page_checked');
      assert.deepEqual(db.get(p.id).directoryListing, directory); assert.deepEqual(db.all().filter(x => x.id !== p.id), previous);
      assert.deepEqual(db.quality().sourceRefreshConflicts, []); assert.equal(db.quality().total, 873); assert.equal(db.quality().checked, 69); db.close(); db = null;
    }
  } finally { db?.close(); rmSync(path, { force: true }); rmSync(checkedPath, { force: true }); rmdirSync(dir); }
});

const app = createApp({ store, publicDir: new URL('public/', root), routeEvidencePath: routePath, applicantEvidencePath: contextPath, now: () => new Date('2026-10-27T04:00:00Z') });
await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${app.address().port}`, get = async path => (await fetch(base + path)).json();
test.after(async () => { await new Promise(resolve => app.close(resolve)); store.close(); });

test('actual API/save/export preserves strict conditional English and training/resident evidence without exporting the synthetic background', async () => {
  const before = JSON.stringify(store.all()), detail = await get('/api/programmes/' + p.id + '?offering=' + o.id);
  assert.equal(detail.applicationTimeline.state, 'dates_incomplete');
  const response = await fetch(base + '/api/matches', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ profile, offerings: { [p.id]: o.id } }) });
  assert.equal(response.status, 200); assert.equal((await response.json()).items.find(x => x.id === p.id).match.status, 'needs_confirmation');
  const saved = optionSnapshot(detail, '2026-10-27T04:00:00.000Z'); assert.equal(parseSavedOption(saved).offeringId, o.id);
  const restored = await fetch(base + '/api/saved-options/resolve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contexts: [saved, { programmeId: p.id, offeringId: p.id + '-catalogue' }] }) });
  assert.equal(restored.status, 200); const items = (await restored.json()).items; assert.deepEqual(items.map(x => x.status), ['resolved', 'needs_attention']);
  const exported = shortlistExport([items[0].programme], { [p.id]: saved }).programmes[0]; assert.equal(exported.offerings[0].id, o.id);
  assert.equal(exported.offerings[0].tuition, null); assert.equal(exported.offerings[0].deadline, null); assert.equal(exported.offerings[0].mode, null);
  assert.match(exported.evidence.publishedRequirements.find(r => /Conditional programme English/.test(r.labelEn)).noteEn, /strictly above 6.5/);
  assert.match(exported.evidence.publishedRequirements.find(r => /Teacher-training/.test(r.labelEn)).noteEn, /primary\/secondary/);
  assert.equal(exported.profile, undefined); assert.equal(exported.match, undefined);
  const meta = await get('/api/meta'); assert.equal(meta.quality.total, 873); assert.equal(meta.quality.browsable, 870); assert.equal(meta.quality.checked, 69);
  assert.equal(meta.quality.peerReviewed, 0); assert.equal(meta.quality.complete, 0); assert.deepEqual(meta.quality.sourceRefreshConflicts, []);
  assert.deepEqual(applicantSummary(contexts), { studyOptions: 18, categories: 38, peerReviewed: 0 }); assert.equal(meta.routeEvidence.routes, 7); assert.equal(JSON.stringify(store.all()), before);
});
