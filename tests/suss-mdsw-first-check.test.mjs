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
const batch = read('data/checked-programmes.json'), obs = read('data/research/suss-mdsw-observation-2026-10-28.json');
const p = batch.programmes.find(x => x.id === obs.programmeId), o = p.offerings[0];
const options = { seedPath: new URL('data/catalogue.json', root), expansionPath: new URL('data/catalogue-expansion.json', root), checkedPath: new URL('data/checked-programmes.json', root), directoryEvidencePath: new URL('data/directory-links.json', root), scopeAuditPath: new URL('data/programme-scope-audit.json', root) };
const routePath = new URL('data/route-programmes.json', root), contextPath = new URL('data/applicant-contexts.json', root);
const store = new CatalogueStore(':memory:', options), routes = loadRoutes(routePath, store.all()), contexts = loadApplicantContexts(contextPath, store.all(), routes);
const selected = () => resolveProgramme(store.get(p.id), routes, undefined, o.id, undefined, contexts);
// Synthetic only: an additional social-work diploma, qualification recognition, English, nationality and funding are unverified.
const profile = { major: 'History', degreeStatus: 'graduated', classification: 'ordinary', gpa: 2.5, gpaScale: 4, experienceYears: 0, language: { type: 'ielts', total: 7, testDate: '2026-05-01' } };
const check = (result, label) => result.checks.find(c => c.labelEn === label);

test('MDSW upgrades one existing coursework master without counting two tracks, a generic option or the diploma as extra master degrees', () => {
  assert.equal(read('data/catalogue.json').programmes.find(x => x.id === p.id).verification, 'catalogue_seed');
  assert.equal(validateProgramme(p, new Set(['SG-SUSS'])), p); assert.equal(p.award, 'MDSW');
  assert.equal(obs.identity.coreCu + obs.identity.specialisationOrGenericElectivesCu + obs.identity.unrestrictedElectivesCu, 60);
  assert.equal(obs.identity.appliedProjectCuIncludedInCore, 10); assert.equal(obs.identity.namedSpecialisations.length, 2); assert.equal(obs.identity.genericMixedBasketOption, true);
  assert.equal(p.offerings.length, 1); assert.equal(routes.has(p.id), false); assert.equal(obs.identity.internationalDirectoryClassifiesCoursework, true);
  assert.equal(p.requirementsCoverage, 'partial'); assert.equal(p.reviewer, null); assert.equal(batch.pilotProgrammeIds.length, 20); assert.equal(batch.pilotProgrammeIds.includes(p.id), false);
  assert.equal(/\p{Script=Han}/u.test(JSON.stringify(p)), false);
});

test('undergraduate-only profiles cannot falsely reject or approve the alternative social-work graduate-diploma qualification', () => {
  assert.deepEqual(obs.entry.acceptedSocialWorkQualifications, ['Undergraduate social work degree', 'Graduate Diploma in Social Work']);
  assert.equal(p.rules.some(r => r.kind === 'major'), false);
  for (const major of ['Social Work', 'History', 'Business Administration', 'Psychology']) {
    const result = matchProgramme(selected(), { ...profile, major }); assert.equal(result.status, 'needs_confirmation'); assert.equal(result.tier, null);
    assert.equal(result.checks.some(c => c.status === 'fail'), false);
    assert.equal(check(result, 'Social-work undergraduate or graduate-diploma qualification').status, 'unknown');
  }
  assert.equal(obs.entry.unrelatedBachelorAloneNotAutomaticEligibility, true); assert.equal(obs.entry.noAutomaticDiplomaCompletionOrMasterAdmission, true);
});

test('a professional audience and CV do not invent minimum work years, entry GPA or honours; high scores do not prove the missing qualification', () => {
  assert.equal(p.rules.some(r => ['experience', 'classification', 'gpa'].includes(r.kind)), false);
  assert.equal(obs.entry.numericMinimumWorkYears, null); assert.equal(obs.entry.numericUndergraduateGpa, null);
  for (const changes of [{ experienceYears: 0 }, { experienceYears: 20 }, { gpa: 1 }, { gpa: 4, classification: 'first' }]) {
    const result = matchProgramme(p, { ...profile, ...changes }); assert.equal(result.status, 'needs_confirmation');
    assert.equal(result.checks.some(c => c.status === 'fail'), false); assert.equal(result.tier, null);
  }
  assert.equal(p.fieldStatus.gpa.status, 'not_published');
});

test('conditional strict international English stays unresolved rather than using an inclusive total, general alternative or waiver', () => {
  assert.deepEqual(obs.entry.internationalEnglish.ielts, { operator: '>', total: 6.5, allComponentsMin: 6 });
  assert.deepEqual(obs.entry.internationalEnglish.toeflIbtUnversioned, { operator: '>', total: 85, writingMin: 22 });
  assert.equal(obs.entry.internationalEnglish.toeflPbt.preferredTwe, 5); assert.equal(obs.entry.internationalEnglish.ieltsToeflExpiryNotEstablishedHere, true);
  assert.equal(p.rules.some(r => r.kind === 'language'), false);
  for (const language of [{ type: 'none' }, { type: 'ielts', total: 6.5 }, { type: 'ielts', total: 9 }, { type: 'waiver' }, { type: 'toefl_120', total: 85 }, { type: 'toefl_6', total: 6 }]) {
    const result = matchProgramme(p, { ...profile, language }); assert.equal(result.status, 'needs_confirmation');
    assert.equal(check(result, 'Conditional international MDSW English').status, 'unknown'); assert.equal(check(result, 'General English policy applicability').status, 'unknown');
  }
  assert.equal(obs.entry.generalSde101OptionNotAutomaticProgrammeSpecificReplacement, true);
});

test('master CV and possible interviews do not inherit nearby statement, proposal or Clinical referee requirements', () => {
  assert.deepEqual(obs.entry.currentChecklistMasterSpecificAdditionalDocuments, ['CV detailing work experience']);
  assert.equal(obs.entry.generalCredentialAndEnglishDocumentsStillApply, true); assert.equal(obs.entry.interviewsMayBeRequired, true);
  assert.equal(obs.entry.neighbouringPersonalStatementResearchProposalAndClinicalRefereesNotInherited, true);
  const material = p.rules.find(r => r.labelEn === 'CV and possible suitability interviews');
  assert.match(material.noteEn, /may be used/); assert.match(material.noteEn, /not imported/);
  assert.equal(check(matchProgramme(p, profile), material.labelEn).status, 'unknown');
  assert.equal(obs.entry.platformDoesNotCollectOrSubmitAdmissionMaterials, true);
});

test('GDSW award GPA, 400-hour placement and July-only career conversion do not become master admission or an automatic combined award', () => {
  assert.equal(obs.diplomaBoundary.diplomaCu, 40); assert.equal(obs.diplomaBoundary.supervisedPracticumHours, 400);
  assert.equal(obs.diplomaBoundary.diplomaAwardCgpa, 2.5); assert.equal(obs.diplomaBoundary.notAutomatic100CuMaster, true);
  assert.equal(obs.diplomaBoundary.ccpswJulyOnlyNotMasterIntakeRestriction, true);
  assert.equal(obs.study.masterAwardCgpa, 3); assert.equal(obs.study.researchMethodologyWithinUnrestricted10Cu, true);
  assert.equal(p.rules.find(r => r.labelEn === 'Separate diploma and professional-recognition boundaries').mandatory, false);
  assert.equal(p.rules.find(r => r.labelEn === 'Master study requirements and elective choice').mandatory, false);
  assert.equal(obs.study.professionalBodyRequirementsNotIndependentlyChecked, true);
});

test('Saturday teaching and curriculum presentation months cannot create a formal mode, third intake or completion entitlement after expiry', () => {
  assert.equal(o.mode, null); assert.equal(obs.study.recommendedSemesters, 4); assert.equal(obs.study.lessonsSaturdaysPerCourse, 4);
  assert.equal(obs.study.appliedProjectUpToSemesters, 2); assert.equal(obs.study.curriculumUpdatedOn, '2026-09-02');
  assert.equal(obs.study.candidatureExpiredCETCompletionDoesNotRestoreMasterAward, true);
  assert.deepEqual(obs.cycle.recurringIntakes, ['January', 'July']); assert.equal(obs.cycle.curriculumMay2027NotThirdIntake, true);
  assert.equal(obs.eligibility.saturdayScheduleDoesNotEstablishFormalPartTimeModeOrPassApproval, true);
  assert.equal(check(matchProgramme(p, profile), 'International eligibility and formal study mode').status, 'unknown');
});

test('maximum SSG and separate diploma prices remain quotes, while generic calendars cannot become a personal fee or exact MDSW deadline', () => {
  assert.deepEqual(obs.fees.masterTextQuotesBeforeGst, { maximumSsgSubsidyAsLowAs: 26928, scPr: 31680, otherResidents: 38016 });
  assert.equal(obs.fees.maximumSubsidyNotGrantedFromCitizenshipOrWholeAwardLabel, true); assert.equal(obs.fees.diplomaPriceNotAutomaticallyAddedToMaster, true);
  assert.equal(obs.fees.notMoeAnnualPsychologySubsidy, true); assert.equal(obs.fees.acceptanceDeposit.creditsFirstSemesterTuition, true);
  assert.equal(o.tuition, null); assert.equal(o.applicationFee, null); assert.equal(o.academicYear, null); assert.equal(o.deadline, null); assert.equal(o.applicationOpen, null);
  assert.equal(obs.sourceLimitations.pdfVisualInspectionCompleted, false); assert.equal(obs.cycle.livePortalChecked, false);
  for (const day of ['2026-10-28', '2027-01-01', '2027-05-01', '2027-07-01']) assert.equal(programmeTimeline(selected(), day).state, 'dates_incomplete');
  assert.equal([...contexts.values()].some(c => c.programmeId === p.id), false);
});

test('first MDSW source migration preserves every other record and previous snapshots in isolated stores', () => {
  for (const [file, hash] of Object.entries(obs.preservation.previousSnapshotHashes)) assert.equal(createHash('sha256').update(readFileSync(new URL(file, root), 'utf8').replaceAll('\r\n', '\n')).digest('hex'), hash);
  const queue = loadRepositoryReviewQueue('2026-10-28'); assert.equal(queue.counts.programmePageRecords, 64); assert.equal(queue.counts.reviewUnits, 87);
  assert.equal(queue.counts.reviewRecordedInSource, 0); assert.equal(queue.units.find(u => u.programmeId === p.id).upcomingRecordedCutoffs.length, 0);
  const dir = mkdtempSync(join(tmpdir(), 'gradpath-suss-mdsw-')), path = join(dir, 'test.sqlite'), checkedPath = join(dir, 'checked.json'); let db;
  try {
    writeFileSync(checkedPath, JSON.stringify({ ...batch, programmes: batch.programmes.filter(x => x.id !== p.id) }));
    db = new CatalogueStore(path, { ...options, checkedPath }); const earlier = db.all().filter(x => x.id !== p.id), listing = db.get(p.id).directoryListing;
    assert.equal(db.get(p.id).verification, 'catalogue_seed'); assert.equal(db.quality().checked, 63); db.close(); db = null;
    writeFileSync(checkedPath, JSON.stringify(batch));
    for (let restart = 0; restart < 2; restart++) {
      db = new CatalogueStore(path, { ...options, checkedPath }); assert.equal(db.get(p.id).verification, 'programme_page_checked');
      assert.deepEqual(db.get(p.id).directoryListing, listing); assert.deepEqual(db.all().filter(x => x.id !== p.id), earlier);
      assert.deepEqual(db.quality().sourceRefreshConflicts, []); assert.equal(db.quality().checked, 64); db.close(); db = null;
    }
  } finally { db?.close(); rmSync(path, { force: true }); rmSync(checkedPath, { force: true }); rmdirSync(dir); }
});

const app = createApp({ store, publicDir: new URL('public/', root), routeEvidencePath: routePath, applicantEvidencePath: contextPath, now: () => new Date('2026-10-28T04:00:00Z') });
await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${app.address().port}`, get = async path => (await fetch(base + path)).json();
test.after(async () => { await new Promise(resolve => app.close(resolve)); store.close(); });

test('actual matching, remembered selection and export retain the diploma alternative and unresolved fees without changing stored evidence', async () => {
  const before = JSON.stringify(store.all()), detail = await get('/api/programmes/' + p.id + '?offering=' + o.id);
  for (const major of ['Social Work', 'History']) {
    const response = await fetch(base + '/api/matches', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ profile: { ...profile, major }, offerings: { [p.id]: o.id } }) });
    assert.equal(response.status, 200); const match = (await response.json()).items.find(x => x.id === p.id).match;
    assert.equal(match.status, 'needs_confirmation'); assert.equal(match.tier, null); assert.equal(match.checks.some(c => c.status === 'fail'), false);
  }
  const saved = optionSnapshot(detail, '2026-10-28T04:00:00.000Z'); assert.equal(parseSavedOption(saved).offeringId, o.id);
  const response = await fetch(base + '/api/saved-options/resolve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contexts: [saved, { programmeId: p.id, offeringId: p.id + '-seed' }] }) });
  assert.equal(response.status, 200); const items = (await response.json()).items; assert.deepEqual(items.map(x => x.status), ['resolved', 'needs_attention']);
  const exported = shortlistExport([items[0].programme], { [p.id]: saved }).programmes[0]; assert.equal(exported.offerings[0].id, o.id);
  assert.equal(exported.offerings[0].mode, null); assert.equal(exported.offerings[0].tuition, null); assert.equal(exported.offerings[0].deadline, null);
  assert.match(exported.evidence.publishedRequirements.find(r => /graduate-diploma/.test(r.labelEn)).noteEn, /cannot verify an additional graduate diploma/);
  assert.equal(exported.evidence.publishedRequirements.some(r => ['major', 'gpa', 'experience', 'classification'].includes(r.kind)), false);
  assert.match(exported.offerings[0].feeBasis, /not a default personal price/); assert.equal(exported.profile, undefined); assert.equal(exported.match, undefined);
  const meta = await get('/api/meta'); assert.equal(meta.quality.checked, 64); assert.equal(meta.quality.total, 873); assert.equal(meta.quality.browsable, 870);
  assert.equal(meta.quality.peerReviewed, 0); assert.equal(meta.quality.complete, 0); assert.deepEqual(meta.quality.sourceRefreshConflicts, []);
  assert.deepEqual(applicantSummary(contexts), { studyOptions: 18, categories: 38, peerReviewed: 0 }); assert.equal(meta.routeEvidence.routes, 5);
  assert.equal(detail.applicationTimeline.state, 'dates_incomplete'); assert.equal(JSON.stringify(store.all()), before);
});
