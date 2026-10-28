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
const batch = read('data/checked-programmes.json'), obs = read('data/research/suss-mpcl-observation-2026-10-28.json');
const p = batch.programmes.find(x => x.id === obs.programmeId), o = p.offerings[0];
const options = { seedPath: new URL('data/catalogue.json', root), expansionPath: new URL('data/catalogue-expansion.json', root), checkedPath: new URL('data/checked-programmes.json', root), directoryEvidencePath: new URL('data/directory-links.json', root), scopeAuditPath: new URL('data/programme-scope-audit.json', root) };
const routePath = new URL('data/route-programmes.json', root), contextPath = new URL('data/applicant-contexts.json', root);
const store = new CatalogueStore(':memory:', options), routes = loadRoutes(routePath, store.all()), contexts = loadApplicantContexts(contextPath, store.all(), routes);
const selected = () => resolveProgramme(store.get(p.id), routes, undefined, o.id, undefined, contexts);
// Synthetic inputs only; degree recognition, honours route, work equivalence, language and materials remain unverified.
const profile = { major: 'Psychology', degreeStatus: 'graduated', classification: 'second_lower', gpa: 2.5, gpaScale: 4, experienceYears: 2, language: { type: 'ielts', total: 7, testDate: '2026-05-01' } };

test('Clinical is a separate existing coursework identity despite its compulsory dissertation, with English evidence and partial coverage', () => {
  assert.equal(read('data/catalogue.json').programmes.find(x => x.id === p.id).verification, 'catalogue_seed');
  assert.equal(validateProgramme(p, new Set(['SG-SUSS'])), p); assert.equal(p.award, 'MPCL');
  assert.equal(obs.identity.internationalDirectoryClassifiesCoursework, true);
  assert.equal(obs.identity.placements.reduce((sum, x) => sum + x.cu, 0) + obs.identity.skillsCourseworkCu + obs.identity.researchDesignCu + obs.identity.dissertationCu, 75);
  assert.notEqual(store.get('SG-SUSS-P006').id, p.id); assert.equal(store.get('SG-SUSS-P006').award, 'MPSY');
  assert.equal(p.requirementsCoverage, 'partial'); assert.equal(p.reviewer, null); assert.equal(batch.pilotProgrammeIds.length, 20); assert.equal(batch.pilotProgrammeIds.includes(p.id), false);
  assert.equal(/\p{Script=Han}/u.test(JSON.stringify(p)), false);
});

test('related degree titles remain unresolved while explicit Psychology can pass its major check without clearing admission', () => {
  assert.equal(p.rules.find(r => r.kind === 'major').relatedAllowed, true);
  for (const major of ['Psychology', 'psychology', '心理学']) {
    const result = matchProgramme(selected(), { ...profile, major });
    assert.equal(result.checks.find(c => c.kind === 'major').status, 'pass'); assert.equal(result.status, 'needs_confirmation'); assert.equal(result.tier, null);
  }
  for (const major of ['Applied Psychology', 'Neuroscience', 'History']) {
    const result = matchProgramme(selected(), { ...profile, major });
    assert.equal(result.checks.find(c => c.kind === 'major').status, 'unknown'); assert.equal(result.status, 'needs_confirmation');
    assert.equal(result.checks.some(c => c.status === 'fail'), false);
  }
});

test('work below two years is a numeric gap, but high GPA or a numeric pass cannot establish relevant full-time-equivalent work', () => {
  for (const experienceYears of [0, 1, 1.9]) {
    const result = matchProgramme(p, { ...profile, experienceYears, gpa: 4 });
    assert.equal(result.status, 'has_gap'); assert.equal(result.tier, null); assert.equal(result.checks.find(c => c.kind === 'experience').status, 'fail');
  }
  for (const experienceYears of [2, 20]) {
    const result = matchProgramme(p, { ...profile, experienceYears });
    assert.equal(result.checks.find(c => c.kind === 'experience').status, 'pass'); assert.equal(result.status, 'needs_confirmation');
    assert.equal(result.checks.find(c => /work equivalence/.test(c.labelEn)).status, 'unknown');
  }
  assert.equal(matchProgramme(p, { ...profile, experienceYears: null }).checks.find(c => c.kind === 'experience').status, 'unknown');
});

test('conditional PRCPSY prevents honours-only rejection without turning the standard direct requirement into a preference or automatic bridge approval', () => {
  assert.equal(obs.requirements.standardDirectHonours, 'Second Upper'); assert.equal(obs.requirements.standardHonoursNotUnconditionalRejectionRule, true);
  assert.equal(obs.requirements.bridging.minimumCgpa, 3); assert.equal(obs.requirements.bridging.notAutomaticallyAddedToMaster75Cu, true);
  assert.equal(p.rules.some(r => ['classification', 'gpa'].includes(r.kind)), false);
  for (const classification of ['ordinary', 'third', 'second_lower', 'second_upper', 'first', 'unknown']) {
    const result = matchProgramme(p, { ...profile, classification, gpa: 1 });
    assert.equal(result.status, 'needs_confirmation'); assert.equal(result.checks.some(c => c.status === 'fail'), false);
    const check = result.checks.find(c => /Standard honours/.test(c.labelEn)); assert.equal(check.status, 'unknown'); assert.match(check.noteEn || p.rules.find(r => r.labelEn === check.labelEn).noteEn, /not merely a preference/);
  }
  assert.equal(obs.requirements.creditExemptions, false); assert.equal(obs.requirements.numericUndergraduateEntryGpa, null);
});

test('conditional strict international English is not flattened into general thresholds, SDE101, a waiver or TOEFL scale conversion', () => {
  const english = obs.requirements.internationalEnglish;
  assert.deepEqual(english.ielts, { operator: '>', total: 6.5, allComponentsMin: 6 });
  assert.deepEqual(english.toeflIbtUnversioned, { operator: '>', total: 85, writingMin: 22 });
  assert.equal(english.toeflPbt.preferredTwe, 5); assert.equal(english.ieltsToeflValidityNotEstablishedHere, true);
  assert.equal(p.rules.some(r => r.kind === 'language'), false);
  for (const language of [{ type: 'ielts', total: 5 }, { type: 'ielts', total: 6.5 }, { type: 'ielts', total: 9 }, { type: 'waiver' }, { type: 'toefl_120', total: 85 }, { type: 'toefl_6', total: 6 }]) {
    const result = matchProgramme(p, { ...profile, language }); assert.equal(result.status, 'needs_confirmation'); assert.equal(result.tier, null);
    assert.equal(result.checks.find(c => /Conditional international/.test(c.labelEn)).status, 'unknown');
  }
  assert.equal(obs.requirements.generalSde101ChecklistOptionNotAutomaticClinicalReplacement, true);
});

test('Clinical-specific referees, optional endorsement and interviews remain unresolved rather than importing ordinary MPSY material or acting for the applicant', () => {
  const refs = obs.requirements.referees;
  assert.deepEqual([refs.academic, refs.professionalOrClinicalSkills, refs.withinWeeksOfApplication], [1, 1, 2]);
  assert.equal(refs.directSubmissionByReferees, true); assert.equal(refs.templateContentsRead, false);
  assert.equal(refs.templateFilenameIncludes2026NotCurrentCohortProof, true);
  assert.equal(obs.requirements.organisationEndorsementOnlyIfApplicable, true); assert.equal(obs.requirements.endorsementAdditionalToTwoRefereeReports, true);
  assert.equal(obs.requirements.samePersonMayProvideEndorsementAndRefereeReportWithDistinctPurposes, true);
  assert.equal(obs.requirements.shortlistedFaceToFaceInterviews, true);
  const result = matchProgramme(p, profile); assert.equal(result.checks.find(c => /Clinical documents/.test(c.labelEn)).status, 'unknown');
  assert.equal(obs.eligibility.ordinaryForensicCitizenPrRestrictionNotInherited, true); assert.equal(obs.sourceLimitations.cvExternalFormNotOpenedOrSubmitted, true);
  assert.equal(result.checks.find(c => /International eligibility/.test(c.labelEn)).status, 'unknown');
});

test('full-time Clinical placements and master-award CGPA are not pre-entry work/GPA, inherited 1000 hours or automatic professional registration', () => {
  assert.equal(o.mode, 'Full-time'); assert.equal(obs.study.partTimeAvailableCurrently, false); assert.equal(obs.study.durationYears, 2);
  assert.equal(obs.study.minimumMasterAwardCgpa, 3); assert.equal(obs.study.ordinaryMpsy1000HoursNotInherited, true);
  assert.equal(obs.study.exactClinicalPlacementHoursNotEstablished, true); assert.equal(obs.study.placementHoursNotPreEntryWork, true);
  assert.equal(obs.study.employmentAlongsideStudyChallengingNotBlanketEmploymentBan, true);
  assert.equal(obs.study.professionalBodyRulesNotIndependentlyChecked, true);
  for (const label of ['Full-time placement feasibility', 'Master award, placements and professional scope']) assert.equal(p.rules.find(r => r.labelEn === label).mandatory, false);
  assert.equal(routes.has(p.id), false); assert.equal(p.offerings.length, 1);
});

test('annual and whole-programme fee units, bridge charges and January recurrence cannot become a personal total or invented deadline', () => {
  assert.deepEqual(obs.fees.annualSubsidisedTextQuote, { sc: 8200, pr: 16650, international: null });
  assert.deepEqual(obs.fees.starredNonSubsidisedTextQuote, { scPr: 74500, international: 89400 });
  assert.equal(obs.fees.starredFootnoteSaysWholeProgramme, true); assert.equal(obs.fees.starredAmountsNotAnnualOrMultipliedByTwo, true);
  assert.equal(obs.fees.miscellaneousOverlapNotAddedInto770OrAssignedByDefault, true);
  assert.equal(obs.fees.acceptanceDeposit.creditsFirstSemesterTuition, true); assert.equal(obs.sourceLimitations.pdfVisualInspectionCompleted, false);
  assert.equal(o.tuition, null); assert.equal(o.applicationFee, null); assert.equal(o.academicYear, null); assert.equal(o.applicationOpen, null); assert.equal(o.deadline, null);
  assert.equal(obs.cycle.recurringIntakeMonth, 'January'); assert.equal(obs.cycle.intakesPerYear, 1);
  for (const day of ['2026-10-28', '2027-01-01', '2027-07-01']) assert.equal(programmeTimeline(selected(), day).state, 'dates_incomplete');
  assert.equal([...contexts.values()].some(c => c.programmeId === p.id), false);
});

test('first Clinical source migration preserves other records and previous snapshots across isolated restarts', () => {
  for (const [file, hash] of Object.entries(obs.preservation.previousSnapshotHashes)) assert.equal(createHash('sha256').update(readFileSync(new URL(file, root), 'utf8').replaceAll('\r\n', '\n')).digest('hex'), hash);
  const queue = loadRepositoryReviewQueue('2026-10-28'); assert.equal(queue.counts.programmePageRecords, 53); assert.equal(queue.counts.reviewUnits, 76);
  assert.equal(queue.counts.reviewRecordedInSource, 0); assert.equal(queue.units.find(u => u.programmeId === p.id).upcomingRecordedCutoffs.length, 0);
  const dir = mkdtempSync(join(tmpdir(), 'gradpath-suss-mpcl-')), path = join(dir, 'test.sqlite'), checkedPath = join(dir, 'checked.json'); let db;
  try {
    writeFileSync(checkedPath, JSON.stringify({ ...batch, programmes: batch.programmes.filter(x => x.id !== p.id) }));
    db = new CatalogueStore(path, { ...options, checkedPath }); const earlier = db.all().filter(x => x.id !== p.id), listing = db.get(p.id).directoryListing;
    assert.equal(db.get(p.id).verification, 'catalogue_seed'); assert.equal(db.quality().checked, 52); db.close(); db = null;
    writeFileSync(checkedPath, JSON.stringify(batch));
    for (let restart = 0; restart < 2; restart++) {
      db = new CatalogueStore(path, { ...options, checkedPath }); assert.equal(db.get(p.id).verification, 'programme_page_checked');
      assert.deepEqual(db.get(p.id).directoryListing, listing); assert.deepEqual(db.all().filter(x => x.id !== p.id), earlier);
      assert.deepEqual(db.quality().sourceRefreshConflicts, []); assert.equal(db.quality().checked, 53); db.close(); db = null;
    }
  } finally { db?.close(); rmSync(path, { force: true }); rmSync(checkedPath, { force: true }); rmdirSync(dir); }
});

const app = createApp({ store, publicDir: new URL('public/', root), routeEvidencePath: routePath, applicantEvidencePath: contextPath, now: () => new Date('2026-10-28T04:00:00Z') });
await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${app.address().port}`, get = async path => (await fetch(base + path)).json();
test.after(async () => { await new Promise(resolve => app.close(resolve)); store.close(); });

test('actual API, saved-option reselection and export preserve conditional Clinical admissions and unassigned fees without changing stored data', async () => {
  const before = JSON.stringify(store.all()), detail = await get('/api/programmes/' + p.id + '?offering=' + o.id);
  assert.equal(detail.applicationTimeline.state, 'dates_incomplete');
  for (const [changes, expected] of [[{ experienceYears: 1 }, 'has_gap'], [{ classification: 'ordinary' }, 'needs_confirmation'], [{ major: 'Applied Psychology' }, 'needs_confirmation']]) {
    const response = await fetch(base + '/api/matches', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ profile: { ...profile, ...changes }, offerings: { [p.id]: o.id } }) });
    assert.equal(response.status, 200); assert.equal((await response.json()).items.find(x => x.id === p.id).match.status, expected);
  }
  const saved = optionSnapshot(detail, '2026-10-28T04:00:00.000Z'); assert.equal(parseSavedOption(saved).offeringId, o.id);
  const response = await fetch(base + '/api/saved-options/resolve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contexts: [saved, { programmeId: p.id, offeringId: p.id + '-seed' }] }) });
  assert.equal(response.status, 200); const items = (await response.json()).items; assert.deepEqual(items.map(x => x.status), ['resolved', 'needs_attention']);
  const exported = shortlistExport([items[0].programme], { [p.id]: saved }).programmes[0]; assert.equal(exported.offerings[0].id, o.id);
  assert.equal(exported.offerings[0].mode, 'Full-time'); assert.equal(exported.offerings[0].tuition, null); assert.equal(exported.offerings[0].deadline, null);
  assert.match(exported.offerings[0].feeBasis, /whole-programme footnote/);
  assert.equal(exported.evidence.publishedRequirements.find(r => r.kind === 'experience').min, 2);
  assert.equal(exported.evidence.publishedRequirements.find(r => r.kind === 'major').relatedAllowed, true);
  assert.match(exported.evidence.publishedRequirements.find(r => /Standard honours/.test(r.labelEn)).noteEn, /conditional admission/);
  assert.match(exported.evidence.publishedRequirements.find(r => /Clinical documents/.test(r.labelEn)).noteEn, /two weeks/);
  assert.equal(exported.profile, undefined); assert.equal(exported.match, undefined);
  const meta = await get('/api/meta'); assert.equal(meta.quality.checked, 53); assert.equal(meta.quality.total, 873); assert.equal(meta.quality.browsable, 870);
  assert.equal(meta.quality.peerReviewed, 0); assert.equal(meta.quality.complete, 0); assert.deepEqual(meta.quality.sourceRefreshConflicts, []);
  assert.deepEqual(applicantSummary(contexts), { studyOptions: 18, categories: 38, peerReviewed: 0 }); assert.equal(meta.routeEvidence.routes, 5);
  assert.equal(JSON.stringify(store.all()), before);
});
