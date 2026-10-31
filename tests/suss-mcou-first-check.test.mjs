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
const batch = read('data/checked-programmes.json'), obs = read('data/research/suss-mcou-observation-2026-10-27.json');
const p = batch.programmes.find(x => x.id === obs.programmeId), o = p.offerings[0];
const options = { seedPath: new URL('data/catalogue.json', root), expansionPath: new URL('data/catalogue-expansion.json', root), checkedPath: new URL('data/checked-programmes.json', root), directoryEvidencePath: new URL('data/directory-links.json', root), scopeAuditPath: new URL('data/programme-scope-audit.json', root) };
const routePath = new URL('data/route-programmes.json', root), contextPath = new URL('data/applicant-contexts.json', root);
const store = new CatalogueStore(':memory:', options), routes = loadRoutes(routePath, store.all()), contexts = loadApplicantContexts(contextPath, store.all(), routes);
const selected = () => resolveProgramme(store.get(p.id), routes, undefined, o.id, undefined, contexts);
const rule = label => p.rules.find(r => r.labelEn === label);
// Synthetic only: course recognition, selection documents, clinical suitability and Student Pass are not assessed.
const profile = { major: 'Business Administration', degreeStatus: 'graduated', gpa: 2.5, gpaScale: 4, experienceYears: 0, language: { type: 'ielts', total: 7, testDate: '2026-05-01' } };

test('existing MCOU identity stays one explicitly coursework 70-CU master with five curriculum tracks', () => {
  assert.equal(read('data/catalogue-expansion.json').programmes.find(x => x.id === p.id).verification, 'catalogue_seed');
  assert.equal(validateProgramme(p, new Set(['SG-SUSS'])), p); assert.equal(p.faculty, 'S R Nathan School of Human Development');
  assert.equal(p.award, 'MCOU'); assert.equal(p.requirementsCoverage, 'partial'); assert.equal(p.reviewer, null);
  assert.equal(obs.identity.totalCu, 70); assert.equal(obs.identity.coreCu, 40); assert.equal(obs.identity.tracks.length, 5);
  assert.equal(obs.identity.internationalDirectoryClassifiesCoursework, true); assert.equal(obs.identity.researchSpecialisationNotSeparateResearchDegree, true);
  assert.equal(p.offerings.length, 1); assert.equal(o.id, p.id + '-MCOU'); assert.equal(o.mode, null); assert.equal(routes.has(p.id), false);
  assert.equal(batch.pilotProgrammeIds.includes(p.id), false); assert.equal(batch.pilotProgrammeIds.length, 20);
  assert.equal(/\p{Script=Han}/u.test(JSON.stringify(p)), false);
});

test('non-counselling majors and zero work experience are not rejected or automatically granted direct-entry exemptions', () => {
  assert.equal(obs.entryPaths.withoutPriorCounsellingTrainingMayBeAccepted, true);
  assert.deepEqual(obs.entryPaths.prcouCourses, ['COU493', 'COU495', 'COU498']);
  assert.equal(obs.entryPaths.exemptionRequiresDocumentaryProofAndIndividualApproval, true);
  assert.equal(obs.entryPaths.gdpaGdstStackableButNoAutomaticDirectEntry, true);
  assert.equal(p.rules.some(r => ['gpa', 'major', 'classification', 'experience'].includes(r.kind)), false);
  for (const major of ['Psychology', 'History', 'Business Administration']) for (const experienceYears of [0, 20]) {
    const result = matchProgramme(selected(), { ...profile, major, experienceYears });
    assert.equal(result.status, 'needs_confirmation'); assert.equal(result.tier, null); assert.equal(result.checks.some(c => c.status === 'fail'), false);
    assert.equal(result.checks.find(c => /prior counselling training/.test(c.labelEn)).status, 'unknown');
  }
});

test('unemployed referee alternatives and clinical selection remain manual rather than an employment or score gate', () => {
  assert.equal(obs.selection.referenceLetterCount, 2); assert.equal(obs.selection.personalStatementMaximumWords, 500);
  assert.equal(obs.selection.unemploymentNotAutomaticRejection, true); assert.match(obs.selection.notEmployedReferees, /Two letters/);
  assert.equal(obs.selection.onlinePsychologicalTest, true); assert.equal(obs.selection.englishEntranceTest, true); assert.equal(obs.selection.groupInterview, true);
  const result = matchProgramme(selected(), profile);
  assert.equal(result.checks.find(c => /Statement, referee/.test(c.labelEn)).status, 'unknown');
  assert.equal(obs.selection.platformDoesNotCollectStatementsTestsLettersOrSensitiveHistory, true);
  assert.match(rule('Statement, referee alternatives and programme selection').noteEn, /Lack of employment is not an automatic rejection/);
});

test('international applicants are included without inheriting MGER residence limits or treating fee category as Student Pass approval', () => {
  assert.equal(obs.eligibility.singaporeCitizensPrAndInternationalStudents, true);
  assert.equal(obs.eligibility.validStudentPassRequiredForInternationalStudents, true);
  assert.equal(read('data/research/suss-mger-observation-2026-10-27.json').eligibility.currentlyUnableToTakeInternationalStudents, true);
  assert.equal(obs.eligibility.previousMgerResidentRestrictionNotInherited, true);
  assert.equal(matchProgramme(selected(), profile).checks.find(c => /International eligibility/.test(c.labelEn)).status, 'unknown');
  assert.equal([...contexts.values()].some(c => c.programmeId === p.id), false);
});

test('PRCOU January and MCOU July, direct-entry advice and recurring close cannot manufacture a universal dated window', () => {
  assert.equal(obs.entryPaths.prcouStartMonth, 'January'); assert.equal(obs.study.masterIntakeMonth, 'July'); assert.equal(obs.study.intakesPerYear, 1);
  assert.equal(obs.cycle.directEntryEncouragedApplyBy, '2027-02-28'); assert.equal(obs.cycle.recurringOfficialClosingMonthDay, '04-15');
  assert.equal(obs.cycle.recommendationNotUniversalHardDeadline, true); assert.equal(obs.cycle.livePortalChecked, false);
  assert.equal(o.applicationOpen, null); assert.equal(o.deadline, null); assert.equal(o.academicYear, null);
  for (const day of ['2026-10-27', '2027-01-01', '2027-02-28', '2027-04-15', '2027-07-01']) {
    assert.equal(programmeTimeline(selected(), day).state, 'dates_incomplete');
  }
});

test('study practicum, graduation GPA and professional registration hours never become pre-entry experience or clinical approval', () => {
  assert.equal(obs.study.compulsoryPracticum.hours, 180); assert.equal(obs.study.compulsoryPracticum.months, 10);
  assert.equal(obs.study.additionalPracticum.elective, true); assert.equal(obs.study.personalDevelopmentSessionsToGraduate, 3);
  assert.equal(obs.study.graduationCgpa, 3); assert.equal(obs.entryPaths.numericUndergraduateEntryGpa, null);
  assert.equal(obs.study.professionalRegistrationClaimOnUniversityPage.postgraduateFaceToFaceCounsellingHours, 600);
  assert.equal(obs.study.professionalRegistrationClaimOnUniversityPage.clinicalSupervisionHours, 60);
  assert.equal(obs.study.currentExternalProfessionalRegistrationRulesNotIndependentlyChecked, true);
  assert.equal(rule('Study attendance, practicum and graduation obligations').mandatory, false); assert.equal(rule('Professional registration is separate').mandatory, false);
  assert.match(o.duration, /at least 2 years/); assert.match(o.duration, /maximum 4/); assert.match(o.duration, /PRCOU semester is separate/);
  assert.equal(matchProgramme(selected(), { ...profile, gpa: 1, experienceYears: 0 }).checks.some(c => c.status === 'fail'), false);
});

test('high or low ELPR score and self-declared waiver cannot replace conditional applicability or the separate English entrance test', () => {
  assert.equal(obs.english.programmeEnglishEntranceTestSeparate, true); assert.equal(obs.english.internetToeflUnversioned, 85);
  assert.equal(p.rules.some(r => r.kind === 'language'), false);
  for (const language of [{ type: 'ielts', total: 5 }, { type: 'ielts', total: 9 }, { type: 'waiver' }, { type: 'toefl_120', total: 100 }, { type: 'toefl_6', total: 6 }]) {
    const result = matchProgramme(selected(), { ...profile, language }); assert.equal(result.status, 'needs_confirmation'); assert.equal(result.tier, null);
    assert.equal(result.checks.find(c => /English applicability/.test(c.labelEn)).status, 'unknown');
  }
});

test('fees retain higher-cost track and prerequisite uncertainty without multiplying quotes or applying subsidies to a personal total', () => {
  assert.deepEqual(obs.fees.masterTextQuote, { scPr: 36960, otherResidents: 44352, conditionalSubsidisedAsLowAs: 32208 });
  assert.equal(obs.fees.psychodynamicTrackHigherFeeWarning, true); assert.equal(obs.fees.prerequisitePriceUnitAndNumberNotAssumed, true);
  assert.equal(obs.fees.pdfColumnsNotVisuallyVerified, true); assert.equal(obs.sourceLimitations.officialPdfDownloadStatus, 403);
  assert.equal(obs.sourceLimitations.noAccessChecksBypassed, true); assert.equal(obs.sourceLimitations.visualInspectionCompleted, false);
  assert.equal(obs.sourceLimitations.curriculumPlanFetchFailed, true);
  assert.equal(o.tuition, null); assert.equal(o.applicationFee, null); assert.equal(obs.fees.acceptanceDeposit.notExtraTuition, true);
  assert.equal(matchProgramme(selected(), profile).checks.find(c => /Track fees/.test(c.labelEn)).status, 'unknown');
});

test('MCOU migration preserves earlier records across isolated restarts and does not rewrite MGER archives or create a cutoff', () => {
  const archive = read('data/research/suss-mcou-observation-2026-10-27.json').preservation;
  for (const [file, hash] of Object.entries(archive.previousSnapshotHashes)) {
    assert.equal(createHash('sha256').update(readFileSync(new URL(file, root), 'utf8').replaceAll('\r\n', '\n')).digest('hex'), hash);
  }
  const queue = loadRepositoryReviewQueue('2026-10-27'); assert.equal(queue.counts.programmePageRecords, 194); assert.equal(queue.counts.reviewUnits, 318);
  assert.equal(queue.counts.reviewRecordedInSource, 0); assert.equal(queue.units.find(u => u.programmeId === p.id).upcomingRecordedCutoffs.length, 0);
  const dir = mkdtempSync(join(tmpdir(), 'gradpath-suss-mcou-')), path = join(dir, 'test.sqlite'), checkedPath = join(dir, 'checked.json'); let db;
  try {
    writeFileSync(checkedPath, JSON.stringify({ ...batch, programmes: batch.programmes.filter(x => x.id !== p.id) }));
    db = new CatalogueStore(path, { ...options, checkedPath }); const previous = db.all().filter(x => x.id !== p.id), directory = db.get(p.id).directoryListing;
    assert.equal(db.get(p.id).verification, 'catalogue_seed'); assert.equal(db.quality().checked, batch.programmes.length - 1); db.close(); db = null;
    writeFileSync(checkedPath, JSON.stringify(batch));
    for (let restart = 0; restart < 2; restart++) {
      db = new CatalogueStore(path, { ...options, checkedPath }); assert.equal(db.get(p.id).verification, 'programme_page_checked');
      assert.deepEqual(db.get(p.id).directoryListing, directory); assert.deepEqual(db.all().filter(x => x.id !== p.id), previous);
      assert.deepEqual(db.quality().sourceRefreshConflicts, []); assert.equal(db.quality().total, 873); assert.equal(db.quality().checked, 194); db.close(); db = null;
    }
  } finally { db?.close(); rmSync(path, { force: true }); rmSync(checkedPath, { force: true }); rmdirSync(dir); }
});

const app = createApp({ store, publicDir: new URL('public/', root), routeEvidencePath: routePath, applicantEvidencePath: contextPath, now: () => new Date('2026-10-27T04:00:00Z') });
await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${app.address().port}`, get = async path => (await fetch(base + path)).json();
test.after(async () => { await new Promise(resolve => app.close(resolve)); store.close(); });

test('actual API/save/export preserves MCOU path and clinical-selection limits while retired catalogue choices require attention', async () => {
  const before = JSON.stringify(store.all()), detail = await get('/api/programmes/' + p.id + '?offering=' + o.id);
  assert.equal(detail.applicationTimeline.state, 'dates_incomplete');
  const response = await fetch(base + '/api/matches', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ profile, offerings: { [p.id]: o.id } }) });
  assert.equal(response.status, 200); assert.equal((await response.json()).items.find(x => x.id === p.id).match.status, 'needs_confirmation');
  const saved = optionSnapshot(detail, '2026-10-27T04:00:00.000Z'); assert.equal(parseSavedOption(saved).offeringId, o.id);
  const restored = await fetch(base + '/api/saved-options/resolve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contexts: [saved, { programmeId: p.id, offeringId: p.id + '-catalogue' }] }) });
  assert.equal(restored.status, 200); const items = (await restored.json()).items; assert.deepEqual(items.map(x => x.status), ['resolved', 'needs_attention']);
  const exported = shortlistExport([items[0].programme], { [p.id]: saved }).programmes[0]; assert.equal(exported.offerings[0].id, o.id);
  assert.equal(exported.offerings[0].tuition, null); assert.equal(exported.offerings[0].deadline, null); assert.equal(exported.offerings[0].mode, null);
  assert.match(exported.offerings[0].deadlineNote, /28 February 2027/);
  assert.match(exported.evidence.publishedRequirements.find(r => /Statement, referee/.test(r.labelEn)).noteEn, /two family\/friend letters when not employed/);
  assert.equal(exported.profile, undefined); assert.equal(exported.match, undefined);
  const meta = await get('/api/meta'); assert.equal(meta.quality.total, 873); assert.equal(meta.quality.browsable, 869); assert.equal(meta.quality.checked, 194);
  assert.equal(meta.quality.peerReviewed, 0); assert.equal(meta.quality.complete, 0); assert.deepEqual(meta.quality.sourceRefreshConflicts, []);
  assert.deepEqual(applicantSummary(contexts), { studyOptions: 107, categories: 216, peerReviewed: 0 }); assert.equal(meta.routeEvidence.routes, 17); assert.equal(JSON.stringify(store.all()), before);
});
