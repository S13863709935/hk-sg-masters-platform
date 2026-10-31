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
const batch = read('data/checked-programmes.json'), obs = read('data/research/suss-mtax-observation-2026-10-28.json');
const p = batch.programmes.find(x => x.id === obs.programmeId), o = p.offerings[0];
const options = { seedPath: new URL('data/catalogue.json', root), expansionPath: new URL('data/catalogue-expansion.json', root), checkedPath: new URL('data/checked-programmes.json', root), directoryEvidencePath: new URL('data/directory-links.json', root), scopeAuditPath: new URL('data/programme-scope-audit.json', root) };
const routePath = new URL('data/route-programmes.json', root), contextPath = new URL('data/applicant-contexts.json', root);
const store = new CatalogueStore(':memory:', options), routes = loadRoutes(routePath, store.all()), contexts = loadApplicantContexts(contextPath, store.all(), routes);
const selected = () => resolveProgramme(store.get(p.id), routes, undefined, o.id, undefined, contexts);
// Synthetic only: professional qualifications, resident/pass status, motivation, accepted English and ATP completion are unverified.
const profile = { major: 'History', degreeStatus: 'other', classification: 'unknown', gpa: null, gpaScale: null, experienceYears: 0, language: { type: 'ielts', total: 6.5, testDate: '2026-05-01' } };
const check = (result, label) => result.checks.find(c => c.labelEn === label);

test('MTAX upgrades one existing 60-CU course-based master, distinct from its three tax areas, smaller awards and JD', () => {
  assert.equal(read('data/catalogue.json').programmes.find(x => x.id === p.id).verification, 'catalogue_seed');
  assert.equal(validateProgramme(p, new Set(['SG-SUSS'])), p); assert.equal(p.award, 'MTAX'); assert.equal(p.faculty, 'School of Law');
  assert.equal(obs.identity.compulsoryCu + obs.identity.electiveOrUnrestrictedCu, 60); assert.equal(obs.identity.taxAreas.length, 3);
  assert.equal(obs.identity.areasNotThreeSeparateMasters, true); assert.equal(obs.identity.notJurisDoctorOrBarQualification, true);
  assert.equal(p.offerings.length, 1); assert.equal(routes.has(p.id), false); assert.equal(p.requirementsCoverage, 'partial'); assert.equal(p.reviewer, null);
  assert.equal(batch.pilotProgrammeIds.length, 20); assert.equal(batch.pilotProgrammeIds.includes(p.id), false); assert.equal(/\p{Script=Han}/u.test(JSON.stringify(p)), false);
});

test('degree/professional alternatives cannot falsely reject non-degree candidates or approve ACCA/CA/CPA equivalence from an undergraduate-only profile', () => {
  assert.deepEqual(obs.entry.professionalQualificationsMayReplaceDegree, ['ACCA', 'CA (Sing)', 'CPA (Aust)']);
  assert.equal(p.rules.some(r => r.kind === 'degree'), false);
  for (const degreeStatus of ['other', 'final_year', 'graduated']) for (const major of ['Accountancy', 'History']) {
    const result = matchProgramme(selected(), { ...profile, degreeStatus, major }); assert.equal(result.status, 'needs_confirmation'); assert.equal(result.tier, null);
    assert.equal(result.checks.some(c => c.status === 'fail'), false); assert.equal(check(result, 'Recognised degree or accepted professional qualification').status, 'unknown');
  }
  assert.equal(obs.entry.professionalQualificationsExamplesNotUniversalMandatoryCredentials, true); assert.equal(obs.entry.noAutomaticEquivalenceOrAdmission, true);
});

test('resident restriction remains explicit and unresolved; Other Residents fees and self-reported scores do not create international admission', () => {
  assert.equal(obs.eligibility.internationalStudentsNotAcceptedCurrently, true);
  assert.deepEqual(obs.eligibility.publishedApplicantGroups, ['Singapore Citizen', 'Singapore Permanent Resident', 'Resident in Singapore, e.g. Employment Pass holder']);
  assert.equal(obs.eligibility.noInternationalStudentPassAdmissionInferred, true); assert.equal(obs.fees.otherResidentsPriceNotInternationalAdmission, true);
  const result = matchProgramme(selected(), { ...profile, degreeStatus: 'graduated', gpa: 4, gpaScale: 4, experienceYears: 20 });
  assert.equal(result.status, 'needs_confirmation'); assert.equal(check(result, 'Singapore resident eligibility and pass evidence').status, 'unknown');
  assert.equal(result.tier, null); assert.match(p.rules.find(r => /Singapore resident eligibility/.test(r.labelEn)).noteEn, /currently cannot take international students/);
});

test('motivation and work-history CV do not invent numeric work, major, honours or undergraduate GPA gates or import JD evidence', () => {
  assert.equal(p.rules.some(r => ['major', 'experience', 'classification', 'gpa'].includes(r.kind)), false); assert.equal(p.fieldStatus.gpa.status, 'not_published');
  assert.deepEqual(obs.entry.checklistAdditionalTaxDocuments, ['CV detailing work experience']); assert.equal(obs.entry.jdLnatMotherTongueCommunityEvidenceNotInherited, true);
  for (const changes of [{ experienceYears: 0 }, { experienceYears: 20 }, { classification: 'ordinary', gpa: 1, gpaScale: 4 }, { classification: 'first', gpa: 4, gpaScale: 4 }]) {
    const result = matchProgramme(p, { ...profile, ...changes }); assert.equal(result.status, 'needs_confirmation'); assert.equal(result.checks.some(c => c.status === 'fail'), false);
    assert.equal(check(result, 'Motivation, work-history CV and general application evidence').status, 'unknown');
  }
  assert.equal(obs.entry.platformDoesNotCollectWriteOrSubmitApplicationMaterials, true);
});

test('conditional current English cannot become automatic professional-route exemption, borrowed strict score or unreported expiry', () => {
  assert.equal(obs.english.ieltsAcademicMin, 6.5); assert.equal(obs.english.olderBrochurePbt580NotAutomaticallyAddedToCurrentPolicy, true);
  assert.equal(obs.english.professionalQualificationWithoutUndergraduateMediumNeedsAssessment, true); assert.equal(p.rules.some(r => r.kind === 'language'), false);
  for (const language of [{ type: 'none' }, { type: 'ielts', total: 6.5 }, { type: 'ielts', total: 9 }, { type: 'waiver' }, { type: 'toefl_120', total: 85 }, { type: 'toefl_6', total: 6 }]) {
    const result = matchProgramme(p, { ...profile, language }); assert.equal(result.status, 'needs_confirmation'); assert.equal(result.tier, null);
    assert.equal(check(result, 'Conditional general English and professional-route assessment').status, 'unknown');
  }
});

test('completed ATP recognition is conditional evidence, not universal entry training, extra 20 CU or an assumed fee discount', () => {
  assert.equal(obs.credits.completedTaxAcademyIncomeTaxProgrammeLevel3RecognisedCourses, 4); assert.equal(obs.credits.tax001HtmlReferenceCu, 20);
  assert.equal(obs.credits.nominalMasterTotalNotRaisedTo80Cu, true); assert.equal(obs.credits.noAssumedPersonalCreditOrTuitionDiscount, true);
  assert.equal(obs.sourceLimitations.curriculumPlanAccessCheckFailed, true); assert.equal(obs.sourceLimitations.curriculumPlanNotReadOrRetriedViaCaseChange, true);
  assert.equal(check(matchProgramme(p, profile), 'ATP recognition and course-list ambiguity').status, 'unknown');
  assert.match(p.rules.find(r => /ATP recognition/.test(r.labelEn)).noteEn, /Do not require ATP from all applicants/);
});

test('master award GPA, certificate CET GPA and CPE participation do not become admission minima or legal practice entitlements', () => {
  assert.equal(obs.study.masterAwardCgpa, 3); assert.equal(obs.credits.cetCertificateMinimumCgpa, 2.5);
  assert.equal(obs.credits.gctaxCu, 15); assert.equal(obs.credits.gdtaxElectiveCu, 30); assert.equal(obs.credits.cpeParticipationCertificateNotAssessedCourseCertificateOrMaster, true);
  assert.equal(o.mode, null); assert.equal(obs.study.maximumCandidatureYears, 4); assert.equal(obs.study.candidatureExpiredCetDoesNotRestoreAward, true);
  assert.equal(p.rules.find(r => r.labelEn === 'Master award, smaller awards and CPE boundaries').mandatory, false);
  assert.equal(p.rules.find(r => r.labelEn === 'Study timing and candidature limits').mandatory, false);
});

test('raw public dates remain visible without inventing a selected cohort, live-open claim, January intake or personal subsidised total', () => {
  assert.deepEqual([obs.cycle.featureCardApplicationOpen, obs.cycle.featureCardApplicationClose], ['2026-04-16', '2027-04-15']);
  assert.equal(obs.cycle.featureCardCohortBindingNotExplicitlyEstablished, true); assert.equal(obs.cycle.recurringIntake, 'July'); assert.equal(obs.cycle.intakesPerYear, 1);
  assert.equal(obs.cycle.livePortalChecked, false); assert.match(o.deadlineNote, /16 April 2026 to 15 April 2027/); assert.match(o.deadlineNote, /raw published-window observation/);
  assert.deepEqual(obs.fees.masterTextQuotesBeforeGst, { scPr: 31680, otherResidents: 38016 }); assert.equal(obs.fees.noPopulatedTaxationAsLowAsSubsidyInReadableRow, true);
  assert.equal(obs.fees.masterPlusCertificateDiplomaNotDefaultFee, true); assert.equal(obs.fees.deposit.creditsFirstSemesterTuition, true);
  for (const key of ['academicYear', 'tuition', 'applicationFee', 'applicationOpen', 'deadline']) assert.equal(o[key], null);
  for (const day of ['2026-10-28', '2027-01-01', '2027-04-15', '2027-07-01']) assert.equal(programmeTimeline(selected(), day).state, 'dates_incomplete');
  assert.equal([...contexts.values()].some(c => c.programmeId === p.id), false); assert.equal(obs.sourceLimitations.pdfVisualInspectionCompleted, false);
});

test('first MTAX source migration preserves earlier records and snapshot hashes across isolated restarts', () => {
  for (const [file, hash] of Object.entries(obs.preservation.previousSnapshotHashes)) assert.equal(createHash('sha256').update(readFileSync(new URL(file, root), 'utf8').replaceAll('\r\n', '\n')).digest('hex'), hash);
  const queue = loadRepositoryReviewQueue('2026-10-28'); assert.equal(queue.counts.programmePageRecords, 221); assert.equal(queue.counts.reviewUnits, 377);
  assert.equal(queue.counts.reviewRecordedInSource, 0); assert.equal(queue.units.find(u => u.programmeId === p.id).upcomingRecordedCutoffs.length, 0);
  const dir = mkdtempSync(join(tmpdir(), 'gradpath-suss-mtax-')), path = join(dir, 'test.sqlite'), checkedPath = join(dir, 'checked.json'); let db;
  try {
    writeFileSync(checkedPath, JSON.stringify({ ...batch, programmes: batch.programmes.filter(x => x.id !== p.id) }));
    db = new CatalogueStore(path, { ...options, checkedPath }); const earlier = db.all().filter(x => x.id !== p.id), listing = db.get(p.id).directoryListing;
    assert.equal(db.get(p.id).verification, 'catalogue_seed'); assert.equal(db.quality().checked, batch.programmes.length - 1); db.close(); db = null;
    writeFileSync(checkedPath, JSON.stringify(batch));
    for (let restart = 0; restart < 2; restart++) {
      db = new CatalogueStore(path, { ...options, checkedPath }); assert.equal(db.get(p.id).verification, 'programme_page_checked');
      assert.deepEqual(db.get(p.id).directoryListing, listing); assert.deepEqual(db.all().filter(x => x.id !== p.id), earlier);
      assert.deepEqual(db.quality().sourceRefreshConflicts, []); assert.equal(db.quality().checked, 221); db.close(); db = null;
    }
  } finally { db?.close(); rmSync(path, { force: true }); rmSync(checkedPath, { force: true }); rmdirSync(dir); }
});

const app = createApp({ store, publicDir: new URL('public/', root), routeEvidencePath: routePath, applicantEvidencePath: contextPath, now: () => new Date('2026-10-28T04:00:00Z') });
await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${app.address().port}`, get = async path => (await fetch(base + path)).json();
test.after(async () => { await new Promise(resolve => app.close(resolve)); store.close(); });

test('actual matching, saved-choice restore and export keep professional/residency/credit limits and raw window without changing evidence', async () => {
  const before = JSON.stringify(store.all()), detail = await get('/api/programmes/' + p.id + '?offering=' + o.id);
  for (const degreeStatus of ['other', 'graduated']) {
    const response = await fetch(base + '/api/matches', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ profile: { ...profile, degreeStatus }, offerings: { [p.id]: o.id } }) });
    assert.equal(response.status, 200); const match = (await response.json()).items.find(x => x.id === p.id).match;
    assert.equal(match.status, 'needs_confirmation'); assert.equal(match.tier, null); assert.equal(match.checks.some(c => c.status === 'fail'), false);
  }
  const saved = optionSnapshot(detail, '2026-10-28T04:00:00.000Z'); assert.equal(parseSavedOption(saved).offeringId, o.id);
  const response = await fetch(base + '/api/saved-options/resolve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contexts: [saved, { programmeId: p.id, offeringId: p.id + '-seed' }] }) });
  assert.equal(response.status, 200); const items = (await response.json()).items; assert.deepEqual(items.map(x => x.status), ['resolved', 'needs_attention']);
  const exported = shortlistExport([items[0].programme], { [p.id]: saved }).programmes[0]; assert.equal(exported.offerings[0].id, o.id);
  assert.equal(exported.offerings[0].mode, null); assert.equal(exported.offerings[0].tuition, null); assert.equal(exported.offerings[0].deadline, null);
  assert.match(exported.offerings[0].deadlineNote, /16 April 2026 to 15 April 2027/);
  assert.match(exported.evidence.publishedRequirements.find(r => /professional qualification/.test(r.labelEn)).noteEn, /may be accepted in lieu of a degree/);
  assert.match(exported.evidence.publishedRequirements.find(r => /Singapore resident/.test(r.labelEn)).noteEn, /currently cannot take international students/);
  assert.equal(exported.profile, undefined); assert.equal(exported.match, undefined);
  const meta = await get('/api/meta'); assert.equal(meta.quality.checked, 221); assert.equal(meta.quality.total, 873); assert.equal(meta.quality.browsable, 869);
  assert.equal(meta.quality.peerReviewed, 0); assert.equal(meta.quality.complete, 0); assert.deepEqual(meta.quality.sourceRefreshConflicts, []);
  assert.deepEqual(applicantSummary(contexts), { studyOptions: 139, categories: 280, peerReviewed: 0 }); assert.equal(meta.routeEvidence.routes, 17);
  assert.equal(detail.applicationTimeline.state, 'dates_incomplete'); assert.equal(JSON.stringify(store.all()), before);
});
