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
const batch = read('data/checked-programmes.json'), obs = read('data/research/suss-mbx-observation-2026-10-28.json');
const p = batch.programmes.find(x => x.id === obs.programmeId), o = p.offerings[0];
const options = { seedPath: new URL('data/catalogue.json', root), expansionPath: new URL('data/catalogue-expansion.json', root), checkedPath: new URL('data/checked-programmes.json', root), directoryEvidencePath: new URL('data/directory-links.json', root), scopeAuditPath: new URL('data/programme-scope-audit.json', root) };
const routePath = new URL('data/route-programmes.json', root), contextPath = new URL('data/applicant-contexts.json', root);
const store = new CatalogueStore(':memory:', options), routes = loadRoutes(routePath, store.all()), contexts = loadApplicantContexts(contextPath, store.all(), routes);
const selected = () => resolveProgramme(store.get(p.id), routes, undefined, o.id, undefined, contexts);
// Synthetic only: qualification recognition, resident status, approved work/credits, track choice and faculty appointment are unverified.
const profile = { major: 'Business Administration', degreeStatus: 'graduated', classification: 'ordinary', gpa: 2.5, gpaScale: 4, experienceYears: 2, language: { type: 'ielts', total: 6.5, testDate: '2026-05-01' } };
const check = (result, label) => result.checks.find(c => c.labelEn === label);

test('MBX upgrades one existing 60-CU course-based master with one selected track, not two masters or all six certificate choices', () => {
  assert.equal(read('data/catalogue.json').programmes.find(x => x.id === p.id).verification, 'catalogue_seed');
  assert.equal(validateProgramme(p, new Set(['SG-SUSS'])), p); assert.equal(p.award, 'MBX'); assert.equal(p.faculty, 'Institute for Adult Learning');
  assert.equal((obs.identity.coreCertificates + obs.identity.trackCertificatesToComplete) * obs.identity.eachCertificateCu, 60);
  assert.equal(obs.identity.coreCourses.reduce((sum, c) => sum + c.cu, 0), 30); assert.equal(obs.identity.tracks.length, 2);
  assert.equal(obs.identity.oneTrackNotBothRequired, true); assert.equal(obs.identity.ialNotAnAdditionalUniversityRecord, true);
  assert.equal(p.offerings.length, 1); assert.equal(routes.has(p.id), false); assert.equal(p.requirementsCoverage, 'partial'); assert.equal(p.reviewer, null);
  assert.equal(batch.pilotProgrammeIds.length, 20); assert.equal(batch.pilotProgrammeIds.includes(p.id), false); assert.equal(/\p{Script=Han}/u.test(JSON.stringify(p)), false);
});

test('corroborated two-year work requirement exposes numeric gaps that high GPA cannot conceal', () => {
  assert.equal(obs.entry.programmeShouldHaveWordingCorroboratedByBrochureHaveAtLeast, true);
  assert.equal(p.rules.find(r => r.kind === 'experience').min, 2);
  for (const experienceYears of [0, 1, 1.9]) {
    const result = matchProgramme(selected(), { ...profile, experienceYears, gpa: 4 });
    assert.equal(result.status, 'has_gap'); assert.equal(result.tier, null); assert.equal(result.checks.find(c => c.kind === 'experience').status, 'fail');
  }
  for (const experienceYears of [2, 20]) {
    const result = matchProgramme(selected(), { ...profile, experienceYears });
    assert.equal(result.checks.find(c => c.kind === 'experience').status, 'pass'); assert.equal(result.status, 'needs_confirmation'); assert.equal(result.tier, null);
    assert.equal(check(result, 'Qualification, work evidence and school review').status, 'unknown');
  }
  assert.equal(matchProgramme(p, { ...profile, experienceYears: null }).checks.find(c => c.kind === 'experience').status, 'unknown');
});

test('work-year comparison cannot invent an Education-major, honours, GPA, teaching-only or leadership-job-title gate', () => {
  assert.equal(p.rules.some(r => ['major', 'classification', 'gpa'].includes(r.kind)), false); assert.equal(p.fieldStatus.gpa.status, 'not_published');
  assert.equal(obs.entry.noPublishedTeachingOnlyWorkExperienceRestriction, true); assert.equal(obs.entry.noUniversalFacultyOrLeadershipJobTitleGate, true);
  for (const changes of [{ major: 'History', gpa: 1 }, { major: 'Engineering', classification: 'third' }, { gpa: 3, gpaScale: 5 }]) {
    const result = matchProgramme(p, { ...profile, ...changes }); assert.equal(result.status, 'needs_confirmation'); assert.equal(result.checks.some(c => c.status === 'fail'), false);
  }
  assert.equal(matchProgramme(p, { ...profile, degreeStatus: 'final_year' }).checks.find(c => c.kind === 'degree').status, 'unknown');
});

test('resident restriction remains explicit without inferring eligibility from Other Residents prices, a generic Student Pass or numeric academic/work passes', () => {
  assert.equal(obs.eligibility.internationalStudentsNotAcceptedCurrently, true);
  assert.deepEqual(obs.eligibility.publishedGroups, ['Singapore Citizen', 'Singapore Permanent Resident', 'Resident in Singapore, e.g. Employment Pass holder']);
  assert.equal(obs.eligibility.noInternationalStudentPassAdmissionInferred, true); assert.equal(obs.fees.otherResidentsPriceNotInternationalAdmission, true);
  const result = matchProgramme(selected(), { ...profile, gpa: 4, experienceYears: 20 });
  assert.equal(result.status, 'needs_confirmation'); assert.equal(check(result, 'Singapore resident eligibility and pass evidence').status, 'unknown');
  assert.match(p.rules.find(r => /Singapore resident eligibility/.test(r.labelEn)).noteEn, /currently cannot take international students/);
});

test('CV and one-page Word statement remain required evidence while current conditional English does not become automatic waiver or borrowed strict score', () => {
  assert.deepEqual(obs.entry.checklistAdditionalMasterDocuments, ['CV detailing work experience', 'One-page personal statement']);
  assert.equal(obs.entry.personalStatementWordDocumentFormat, true); assert.equal(obs.entry.personalStatementPages, 1);
  assert.equal(obs.entry.neighbouringResearchProposalOrClinicalRefereesNotInherited, true); assert.equal(obs.entry.notAutomaticAdmission, true);
  assert.equal(p.rules.some(r => r.kind === 'language'), false);
  for (const language of [{ type: 'ielts', total: 6.5 }, { type: 'ielts', total: 9 }, { type: 'waiver' }, { type: 'toefl_120', total: 85 }, { type: 'toefl_6', total: 6 }]) {
    const result = matchProgramme(p, { ...profile, language }); assert.equal(result.status, 'needs_confirmation'); assert.equal(result.tier, null);
    assert.equal(check(result, 'Conditional current English and waiver evidence').status, 'unknown');
    assert.equal(check(result, 'CV, one-page Word statement and application evidence').status, 'unknown');
  }
  assert.equal(obs.english.brochurePbt580NotAutomaticallyInsertedIntoCurrentPolicy, true);
});

test('staff-only WSX alternatives do not restrict ordinary MBX admission or establish faculty appointment from generic experience', () => {
  assert.equal(obs.boundaries.wsx551AndWsx552OnlyForSussAssociateFacultyIalAdjunctAdultEducators, true);
  assert.equal(obs.boundaries.wsx551SuccessfulCompletionCertificate, 'GCIAL'); assert.equal(obs.boundaries.wsx552SuccessfulCompletionCertificate, 'GCDLP');
  const label = 'Staff-only alternative modules versus master entry', rule = p.rules.find(r => r.labelEn === label);
  assert.equal(rule.mandatory, false); assert.match(rule.noteEn, /do not require every MBX applicant/);
  const result = matchProgramme(p, profile); assert.equal(check(result, label).status, 'unknown'); assert.equal(check(result, label).mandatory, false);
  assert.equal(result.status, 'needs_confirmation'); assert.equal(result.checks.some(c => c.status === 'fail'), false);
  assert.equal(obs.boundaries.genericTeachingExperienceNotStaffStatusProof, true);
});

test('overlapping GDALL grades/credits and short certificate durations do not create master GPA, extra credits or a shortened/full-remote degree', () => {
  assert.equal(obs.boundaries.gdallCu, 30); assert.equal(obs.boundaries.gdallCertificateCgpaMin, 2.5); assert.equal(obs.boundaries.gdallCgpaScale, 5);
  assert.equal(obs.study.masterAwardCgpa, null); assert.equal(obs.study.masterAwardCgpaNotEstablished, true);
  assert.equal(obs.study.minimumCandidatureYears, 2); assert.equal(obs.study.maximumCandidatureYears, 4); assert.equal(o.mode, null);
  assert.equal(obs.study.standaloneCertificate16WeeksNotEntireMasterDuration, true); assert.equal(obs.study.candidatureExpiredCetCompletionDoesNotRestoreAward, true);
  assert.equal(check(matchProgramme(p, profile), 'Track selection and prior-credit recognition').status, 'unknown');
  assert.equal(p.rules.find(r => /Study, award and candidature/.test(r.labelEn)).mandatory, false);
});

test('maximum SSG quote, diploma/certificate sums and curriculum months cannot become a personal total, exact window or third intake', () => {
  assert.deepEqual(obs.fees.masterTextQuotesBeforeGst, { maximumSsgAsLowAs: 10680, scPr: 31680, otherResidents: 38016 });
  assert.equal(obs.fees.maximumSsgNotAutomaticFromCitizenship, true); assert.equal(obs.fees.certificateDiplomaAmountsNotAddedAboveMasterByDefault, true);
  assert.equal(obs.fees.deposit.creditsFirstSemesterTuition, true); assert.equal(obs.sourceLimitations.pdfVisualInspectionCompleted, false);
  assert.deepEqual(obs.cycle.recurringIntakes, ['January', 'July']); assert.equal(obs.cycle.curriculumMay2027NotThirdIntake, true);
  for (const key of ['academicYear', 'tuition', 'applicationFee', 'applicationOpen', 'deadline']) assert.equal(o[key], null);
  for (const day of ['2026-10-28', '2027-01-01', '2027-05-01', '2027-07-01']) assert.equal(programmeTimeline(selected(), day).state, 'dates_incomplete');
  assert.equal([...contexts.values()].some(c => c.programmeId === p.id), false);
});

test('first MBX source migration preserves earlier records and snapshot hashes across isolated restarts', () => {
  for (const [file, hash] of Object.entries(obs.preservation.previousSnapshotHashes)) assert.equal(createHash('sha256').update(readFileSync(new URL(file, root), 'utf8').replaceAll('\r\n', '\n')).digest('hex'), hash);
  const queue = loadRepositoryReviewQueue('2026-10-28'); assert.equal(queue.counts.programmePageRecords, 274); assert.equal(queue.counts.reviewUnits, 502);
  assert.equal(queue.counts.reviewRecordedInSource, 0); assert.equal(queue.units.find(u => u.programmeId === p.id).upcomingRecordedCutoffs.length, 0);
  const dir = mkdtempSync(join(tmpdir(), 'gradpath-suss-mbx-')), path = join(dir, 'test.sqlite'), checkedPath = join(dir, 'checked.json'); let db;
  try {
    writeFileSync(checkedPath, JSON.stringify({ ...batch, programmes: batch.programmes.filter(x => x.id !== p.id) }));
    db = new CatalogueStore(path, { ...options, checkedPath }); const earlier = db.all().filter(x => x.id !== p.id), listing = db.get(p.id).directoryListing;
    assert.equal(db.get(p.id).verification, 'catalogue_seed'); assert.equal(db.quality().checked, batch.programmes.length - 1); db.close(); db = null;
    writeFileSync(checkedPath, JSON.stringify(batch));
    for (let restart = 0; restart < 2; restart++) {
      db = new CatalogueStore(path, { ...options, checkedPath }); assert.equal(db.get(p.id).verification, 'programme_page_checked');
      assert.deepEqual(db.get(p.id).directoryListing, listing); assert.deepEqual(db.all().filter(x => x.id !== p.id), earlier);
      assert.deepEqual(db.quality().sourceRefreshConflicts, []); assert.equal(db.quality().checked, 274); db.close(); db = null;
    }
  } finally { db?.close(); rmSync(path, { force: true }); rmSync(checkedPath, { force: true }); rmdirSync(dir); }
});

const app = createApp({ store, publicDir: new URL('public/', root), routeEvidencePath: routePath, applicantEvidencePath: contextPath, now: () => new Date('2026-10-28T04:00:00Z') });
await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${app.address().port}`, get = async path => (await fetch(base + path)).json();
test.after(async () => { await new Promise(resolve => app.close(resolve)); store.close(); });

test('actual matching, saved restore and export distinguish work gaps from unresolved recognition/residency without changing evidence', async () => {
  const before = JSON.stringify(store.all()), detail = await get('/api/programmes/' + p.id + '?offering=' + o.id);
  for (const [experienceYears, expected] of [[1, 'has_gap'], [2, 'needs_confirmation']]) {
    const response = await fetch(base + '/api/matches', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ profile: { ...profile, experienceYears }, offerings: { [p.id]: o.id } }) });
    assert.equal(response.status, 200); const match = (await response.json()).items.find(x => x.id === p.id).match;
    assert.equal(match.status, expected); assert.equal(match.tier, null); assert.equal(check(match, 'Singapore resident eligibility and pass evidence').status, 'unknown');
  }
  const saved = optionSnapshot(detail, '2026-10-28T04:00:00.000Z'); assert.equal(parseSavedOption(saved).offeringId, o.id);
  const response = await fetch(base + '/api/saved-options/resolve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contexts: [saved, { programmeId: p.id, offeringId: p.id + '-seed' }] }) });
  assert.equal(response.status, 200); const items = (await response.json()).items; assert.deepEqual(items.map(x => x.status), ['resolved', 'needs_attention']);
  const exported = shortlistExport([items[0].programme], { [p.id]: saved }).programmes[0]; assert.equal(exported.offerings[0].id, o.id);
  assert.equal(exported.offerings[0].mode, null); assert.equal(exported.offerings[0].tuition, null); assert.equal(exported.offerings[0].deadline, null);
  assert.equal(exported.evidence.publishedRequirements.find(r => r.kind === 'experience').min, 2);
  assert.equal(exported.evidence.publishedRequirements.find(r => /Staff-only/.test(r.labelEn)).mandatory, false);
  assert.match(exported.offerings[0].feeBasis, /not a default personal price/); assert.equal(exported.profile, undefined); assert.equal(exported.match, undefined);
  const meta = await get('/api/meta'); assert.equal(meta.quality.checked, 274); assert.equal(meta.quality.total, 873); assert.equal(meta.quality.browsable, 869);
  assert.equal(meta.quality.peerReviewed, 0); assert.equal(meta.quality.complete, 0); assert.deepEqual(meta.quality.sourceRefreshConflicts, []);
  assert.deepEqual(applicantSummary(contexts), { studyOptions: 191, categories: 384, peerReviewed: 0 }); assert.equal(meta.routeEvidence.routes, 37);
  assert.equal(detail.applicationTimeline.state, 'dates_incomplete'); assert.equal(JSON.stringify(store.all()), before);
});
