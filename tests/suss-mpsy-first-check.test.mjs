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
const batch = read('data/checked-programmes.json'), obs = read('data/research/suss-mpsy-observation-2026-10-28.json');
const p = batch.programmes.find(x => x.id === obs.programmeId), o = p.offerings[0];
const options = { seedPath: new URL('data/catalogue.json', root), expansionPath: new URL('data/catalogue-expansion.json', root), checkedPath: new URL('data/checked-programmes.json', root), directoryEvidencePath: new URL('data/directory-links.json', root), scopeAuditPath: new URL('data/programme-scope-audit.json', root) };
const routePath = new URL('data/route-programmes.json', root), contextPath = new URL('data/applicant-contexts.json', root);
const store = new CatalogueStore(':memory:', options), routes = loadRoutes(routePath, store.all()), contexts = loadApplicantContexts(contextPath, store.all(), routes);
const selected = () => resolveProgramme(store.get(p.id), routes, undefined, o.id, undefined, contexts);
const rule = label => p.rules.find(r => r.labelEn === label);
// Synthetic only: degree/honours recognition, work relevance, track citizenship, English and approved practicum are unverified.
const profile = { major: 'Psychology', degreeStatus: 'graduated', classification: 'ordinary', gpa: 2.5, gpaScale: 4, experienceYears: 2, language: { type: 'ielts', total: 7, testDate: '2026-05-01' } };

test('existing MPSY is one 60-CU coursework master with two tracks, distinct from Clinical and smaller awards', () => {
  assert.equal(read('data/catalogue.json').programmes.find(x => x.id === p.id).verification, 'catalogue_seed');
  assert.equal(validateProgramme(p, new Set(['SG-SUSS'])), p); assert.equal(p.award, 'MPSY'); assert.equal(p.faculty, 'School of Humanities and Behavioural Sciences');
  assert.equal(obs.identity.compulsoryCu + obs.identity.trackCu + obs.identity.electiveCu, 60); assert.equal(obs.identity.tracks.length, 2);
  assert.equal(obs.identity.internationalDirectoryClassifiesCoursework, true); assert.equal(obs.identity.gdopNotStackableIntoMaster, true);
  assert.notEqual(store.get('SG-SUSS-P007').id, p.id); assert.notEqual(store.get('SG-SUSS-P007').name, p.name);
  assert.equal(p.requirementsCoverage, 'partial'); assert.equal(p.reviewer, null); assert.equal(batch.pilotProgrammeIds.includes(p.id), false); assert.equal(batch.pilotProgrammeIds.length, 20);
  assert.equal(/\p{Script=Han}/u.test(JSON.stringify(p)), false);
});

test('formal psychology admission and corroborating brochure can compare degree field while contradictory FAQ remains visible', () => {
  assert.equal(obs.requirements.mainAdmissionSpecificFaqAndBrochureAgreeOnPsychology, true);
  assert.equal(obs.requirements.contradictoryDifferentDisciplineCreditFaqRetained, true); assert.equal(obs.requirements.contradictoryFaqNotNewNonPsychologyEntryRoute, true);
  assert.deepEqual(p.rules.find(r => r.kind === 'major').accepted, ['Psychology']);
  const matching = matchProgramme(selected(), profile); assert.equal(matching.checks.find(c => c.kind === 'major').status, 'pass');
  const different = matchProgramme(selected(), { ...profile, major: 'History' }); assert.equal(different.status, 'has_gap');
  assert.equal(different.checks.find(c => c.kind === 'major').status, 'fail'); assert.equal(different.tier, null);
  assert.equal(different.checks.find(c => /contradictory FAQ/.test(c.labelEn)).status, 'unknown');
});

test('fewer than two work years is a recorded gap while a numeric pass cannot verify related experience', () => {
  assert.equal(obs.requirements.minimumRelevantWorkYears, 2); assert.equal(p.rules.find(r => r.kind === 'experience').min, 2);
  for (const experienceYears of [0, 1, 1.9]) {
    const result = matchProgramme(selected(), { ...profile, experienceYears }); assert.equal(result.status, 'has_gap');
    assert.equal(result.checks.find(c => c.kind === 'experience').status, 'fail');
  }
  for (const experienceYears of [2, 20]) {
    const result = matchProgramme(selected(), { ...profile, experienceYears }); assert.equal(result.status, 'needs_confirmation'); assert.equal(result.tier, null);
    assert.equal(result.checks.find(c => c.kind === 'experience').status, 'pass'); assert.equal(result.checks.find(c => /work relevance/.test(c.labelEn)).status, 'unknown');
  }
  assert.equal(matchProgramme(p, { ...profile, experienceYears: null }).checks.find(c => c.kind === 'experience').status, 'unknown');
});

test('honours preference and PRCPSY/award CGPA do not reject ordinary degrees or create undergraduate GPA/classification minima', () => {
  assert.equal(obs.requirements.honoursPreferred, true); assert.equal(obs.requirements.secondUpperHonoursPreferredInBrochureNotMinimum, true);
  assert.equal(obs.requirements.bridging.cu, 30); assert.equal(obs.requirements.bridging.minimumCgpa, 3);
  assert.equal(obs.requirements.bridging.noSeparateCertificateOrQualification, true); assert.equal(obs.requirements.masterAwardCgpa, 3);
  assert.equal(obs.requirements.numericUndergraduateEntryGpa, null); assert.equal(p.rules.some(r => ['gpa', 'classification'].includes(r.kind)), false);
  for (const changes of [{ gpa: 1 }, { classification: 'ordinary' }, { classification: 'second_lower' }, { classification: 'first' }]) {
    const result = matchProgramme(p, { ...profile, ...changes }); assert.equal(result.status, 'needs_confirmation'); assert.equal(result.checks.some(c => c.status === 'fail'), false);
    assert.equal(result.checks.find(c => /conditional PRCPSY/.test(c.labelEn)).status, 'unknown');
  }
});

test('Organisational international conditions and Forensic citizen/PR restriction remain separate without nationality or score inference', () => {
  assert.equal(obs.eligibility.organisationalLocalAndInternationalApplicants, true); assert.equal(obs.eligibility.forensicOnlySingaporeCitizensAndPr, true);
  const english = obs.requirements.internationalOrganisationalEnglish;
  assert.deepEqual(english.ielts, { operator: '>', total: 6.5, allComponentsMin: 6 });
  assert.deepEqual(english.toeflIbtUnversioned, { operator: '>', total: 85, writingMin: 22 });
  assert.equal(english.toeflPbt.preferredTwe, 5); assert.equal(english.ieltsToeflValidityNotEstablishedHere, true);
  assert.equal(p.rules.some(r => r.kind === 'language'), false); assert.equal(p.offerings.length, 1); assert.equal(routes.has(p.id), false);
  for (const language of [{ type: 'ielts', total: 5 }, { type: 'ielts', total: 6.5 }, { type: 'ielts', total: 9 }, { type: 'waiver' }, { type: 'toefl_120', total: 85 }, { type: 'toefl_6', total: 6 }]) {
    const result = matchProgramme(p, { ...profile, language }); assert.equal(result.status, 'needs_confirmation'); assert.equal(result.tier, null);
    assert.equal(result.checks.find(c => /Conditional international/.test(c.labelEn)).status, 'unknown'); assert.equal(result.checks.find(c => /Track eligibility/.test(c.labelEn)).status, 'unknown');
  }
});

test('1000 study practicum hours and international sequencing are not pre-entry employment or a whole-degree remote entitlement', () => {
  assert.equal(obs.study.practicumHours, 1000); assert.equal(obs.study.gradedPracticumEstimatedHours + obs.study.selfSourcedPracticumEstimatedHours, 1000);
  assert.deepEqual(obs.study.gradedPracticumCourses, ['PSY501', 'PSY502', 'PSY599']);
  assert.equal(obs.study.internationalGradedCourseworkAndPracticumWithinFirstTwoYears, true);
  assert.equal(obs.study.remainingSelfSourcedHoursYearsThreeFourCountryOfResidenceNeedPriorApproval, true);
  assert.equal(obs.study.noWholeDegreeRemoteOrAutomaticOverseasPlacementEntitlement, true); assert.equal(obs.study.compulsoryBusinessHourActivities, true);
  assert.equal(obs.study.minimumYears, 2); assert.equal(obs.study.maximumYears, 4); assert.equal(o.mode, null);
  assert.equal(obs.study.forensicPsy534RequiredOrganisationalExcluded, true); assert.equal(rule('Award, practicum and professional scope').mandatory, false);
});

test('current MPSY document/interview requirements do not inherit Clinical referees or promise independent registration', () => {
  assert.equal(obs.requirements.personalStatementMaximumPages, 1); assert.equal(obs.requirements.interviewsForShortlistedApplicants, true);
  assert.deepEqual(obs.requirements.documents, ['Academic transcripts', 'CV', 'Personally written statement of interest']);
  assert.equal(obs.requirements.clinicalSiblingReferenceLettersNotInherited, true); assert.equal(obs.requirements.platformDoesNotCollectCredentialOrClinicalRecords, true);
  assert.equal(obs.study.externalProfessionalRulesNotIndependentlyChecked, true); assert.equal(obs.study.professionalPreparationNotAutomaticRegistrationGuarantee, true);
  assert.equal(matchProgramme(p, profile).checks.find(c => /Application materials/.test(c.labelEn)).status, 'unknown');
});

test('annual/subsidy/starred/bridge fees and January recurrence stay unassigned rather than becoming a personal total or extra intake', () => {
  assert.deepEqual(obs.fees.moeAnnualSubsidisedTextQuote, { sc: 6950, pr: 14100, international: null });
  assert.equal(obs.fees.moeStarredNonSubsidisedTextQuotes.internationalForensic, 62400); assert.equal(obs.fees.forensicInternationalPriceNotAdmissionEligibility, true);
  assert.equal(obs.fees.moeStarredNonSubsidisedTextQuotes.internationalOrganisational, 61638);
  assert.equal(obs.fees.annualRatesNotFullDegreeTotalOrAutomaticMultiplication, true); assert.equal(obs.fees.clinicalResidentMisc240NotInherited, true);
  assert.equal(obs.fees.acceptanceDeposit.notExtraTuition, true); assert.equal(obs.sourceLimitations.pdfVisualInspectionCompleted, false);
  assert.equal(o.tuition, null); assert.equal(o.applicationFee, null); assert.equal(o.deadline, null); assert.equal(o.applicationOpen, null); assert.equal(o.academicYear, null);
  assert.equal(obs.cycle.recurringIntakeMonth, 'January'); assert.equal(obs.cycle.intakesPerYear, 1);
  for (const day of ['2026-10-28', '2027-01-01', '2027-07-01']) assert.equal(programmeTimeline(selected(), day).state, 'dates_incomplete');
  assert.equal([...contexts.values()].some(c => c.programmeId === p.id), false);
});

test('first MPSY source migration preserves earlier programme objects and MGSS snapshots across isolated restarts', () => {
  for (const [file, hash] of Object.entries(obs.preservation.previousSnapshotHashes)) assert.equal(createHash('sha256').update(readFileSync(new URL(file, root), 'utf8').replaceAll('\r\n', '\n')).digest('hex'), hash);
  const queue = loadRepositoryReviewQueue('2026-10-28'); assert.equal(queue.counts.programmePageRecords, 109); assert.equal(queue.counts.reviewUnits, 153);
  assert.equal(queue.counts.reviewRecordedInSource, 0); assert.equal(queue.units.find(u => u.programmeId === p.id).upcomingRecordedCutoffs.length, 0);
  const dir = mkdtempSync(join(tmpdir(), 'gradpath-suss-mpsy-')), path = join(dir, 'test.sqlite'), checkedPath = join(dir, 'checked.json'); let db;
  try {
    writeFileSync(checkedPath, JSON.stringify({ ...batch, programmes: batch.programmes.filter(x => x.id !== p.id) }));
    db = new CatalogueStore(path, { ...options, checkedPath }); const previous = db.all().filter(x => x.id !== p.id), directory = db.get(p.id).directoryListing;
    assert.equal(db.get(p.id).verification, 'catalogue_seed'); assert.equal(db.quality().checked, batch.programmes.length - 1); db.close(); db = null;
    writeFileSync(checkedPath, JSON.stringify(batch));
    for (let restart = 0; restart < 2; restart++) {
      db = new CatalogueStore(path, { ...options, checkedPath }); assert.equal(db.get(p.id).verification, 'programme_page_checked');
      assert.deepEqual(db.get(p.id).directoryListing, directory); assert.deepEqual(db.all().filter(x => x.id !== p.id), previous);
      assert.deepEqual(db.quality().sourceRefreshConflicts, []); assert.equal(db.quality().total, 873); assert.equal(db.quality().checked, 109); db.close(); db = null;
    }
  } finally { db?.close(); rmSync(path, { force: true }); rmSync(checkedPath, { force: true }); rmdirSync(dir); }
});

const app = createApp({ store, publicDir: new URL('public/', root), routeEvidencePath: routePath, applicantEvidencePath: contextPath, now: () => new Date('2026-10-28T04:00:00Z') });
await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${app.address().port}`, get = async path => (await fetch(base + path)).json();
test.after(async () => { await new Promise(resolve => app.close(resolve)); store.close(); });

test('actual API distinguishes published numeric gaps from unresolved relevance and retains all track/fee limits in save/export', async () => {
  const before = JSON.stringify(store.all()), detail = await get('/api/programmes/' + p.id + '?offering=' + o.id); assert.equal(detail.applicationTimeline.state, 'dates_incomplete');
  for (const [experienceYears, expected] of [[1, 'has_gap'], [2, 'needs_confirmation']]) {
    const response = await fetch(base + '/api/matches', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ profile: { ...profile, experienceYears }, offerings: { [p.id]: o.id } }) });
    assert.equal(response.status, 200); assert.equal((await response.json()).items.find(x => x.id === p.id).match.status, expected);
  }
  const saved = optionSnapshot(detail, '2026-10-28T04:00:00.000Z'); assert.equal(parseSavedOption(saved).offeringId, o.id);
  const restored = await fetch(base + '/api/saved-options/resolve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contexts: [saved, { programmeId: p.id, offeringId: p.id + '-seed' }] }) });
  assert.equal(restored.status, 200); const items = (await restored.json()).items; assert.deepEqual(items.map(x => x.status), ['resolved', 'needs_attention']);
  const exported = shortlistExport([items[0].programme], { [p.id]: saved }).programmes[0]; assert.equal(exported.offerings[0].id, o.id);
  assert.equal(exported.offerings[0].tuition, null); assert.equal(exported.offerings[0].deadline, null); assert.equal(exported.offerings[0].mode, null);
  assert.equal(exported.evidence.publishedRequirements.find(r => r.kind === 'experience').min, 2);
  assert.deepEqual(exported.evidence.publishedRequirements.find(r => r.kind === 'major').accepted, ['Psychology']);
  assert.match(exported.evidence.publishedRequirements.find(r => /Track eligibility/.test(r.labelEn)).noteEn, /Forensic Psychology is restricted/);
  assert.equal(exported.profile, undefined); assert.equal(exported.match, undefined);
  const meta = await get('/api/meta'); assert.equal(meta.quality.total, 873); assert.equal(meta.quality.browsable, 870); assert.equal(meta.quality.checked, 109);
  assert.equal(meta.quality.peerReviewed, 0); assert.equal(meta.quality.complete, 0); assert.deepEqual(meta.quality.sourceRefreshConflicts, []);
  assert.deepEqual(applicantSummary(contexts), { studyOptions: 33, categories: 68, peerReviewed: 0 }); assert.equal(meta.routeEvidence.routes, 11); assert.equal(JSON.stringify(store.all()), before);
});
