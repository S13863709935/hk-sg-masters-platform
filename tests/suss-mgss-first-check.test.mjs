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
const batch = read('data/checked-programmes.json'), obs = read('data/research/suss-mgss-observation-2026-10-28.json');
const p = batch.programmes.find(x => x.id === obs.programmeId), o = p.offerings[0];
const options = { seedPath: new URL('data/catalogue.json', root), expansionPath: new URL('data/catalogue-expansion.json', root), checkedPath: new URL('data/checked-programmes.json', root), directoryEvidencePath: new URL('data/directory-links.json', root), scopeAuditPath: new URL('data/programme-scope-audit.json', root) };
const routePath = new URL('data/route-programmes.json', root), contextPath = new URL('data/applicant-contexts.json', root);
const store = new CatalogueStore(':memory:', options), routes = loadRoutes(routePath, store.all()), contexts = loadApplicantContexts(contextPath, store.all(), routes);
const selected = () => resolveProgramme(store.get(p.id), routes, undefined, o.id, undefined, contexts);
const rule = label => p.rules.find(r => r.labelEn === label);
// Synthetic only: degree recognition, application materials, occupation, pass status and source reconciliation are unverified.
const profile = { major: 'History', degreeStatus: 'graduated', gpa: 2.5, gpaScale: 4, experienceYears: 0, language: { type: 'ielts', total: 7, testDate: '2026-05-01' } };

test('existing MGSS seed gains actual 28 October partial evidence without restamping earlier observations or enlarging the pilot', () => {
  assert.equal(read('data/catalogue.json').programmes.find(x => x.id === p.id).verification, 'catalogue_seed');
  assert.equal(validateProgramme(p, new Set(['SG-SUSS'])), p); assert.equal(p.award, 'MGSS'); assert.equal(p.faculty, 'School of Humanities and Behavioural Sciences');
  assert.equal(p.lastChecked, '2026-10-28'); assert.equal(batch.checkedOn, batch.programmes.map(x => x.lastChecked).sort().at(-1));
  const earlier = batch.programmes.slice(0, batch.programmes.findIndex(x => x.id === p.id));
  assert.equal(earlier.length, 44); const laterScopedIds = new Set(read('data/research/hk-existing-records-observation-2026-10-30.json').changedProgrammeIds); assert.ok(earlier.every(x => laterScopedIds.has(x.id) ? x.lastChecked === '2026-10-30' : x.lastChecked <= '2026-10-27'));
  assert.equal(p.requirementsCoverage, 'partial'); assert.equal(p.admissionRoute, 'unconfirmed'); assert.equal(p.reviewer, null);
  assert.equal(obs.identity.internationalDirectoryClassifiesCoursework, true); assert.equal(batch.pilotProgrammeIds.includes(p.id), false); assert.equal(batch.pilotProgrammeIds.length, 20);
  assert.equal(/\p{Script=Han}/u.test(JSON.stringify(p)), false);
});

test('conflicting graduate GPA values remain separate and never become undergraduate entry thresholds or a silently selected version', () => {
  assert.equal(obs.publicationConflicts.programmePage.graduationCgpa, 2.5); assert.equal(obs.publicationConflicts.programmePage.cgpaScale, 5);
  assert.equal(obs.publicationConflicts.brochure.graduationCgpa, 3); assert.equal(obs.publicationConflicts.awardGpaConflictUnresolved, true);
  assert.equal(obs.requirements.numericUndergraduateEntryGpa, null); assert.equal(p.rules.some(r => ['gpa', 'classification'].includes(r.kind)), false);
  assert.equal(p.fieldStatus.gpa.status, 'not_published');
  for (const gpa of [1, 2.5, 3, 4]) {
    const result = matchProgramme(selected(), { ...profile, gpa }); assert.equal(result.status, 'needs_confirmation'); assert.equal(result.tier, null);
    assert.equal(result.checks.some(c => c.status === 'fail'), false);
    assert.equal(result.checks.find(c => /Programme-page award/.test(c.labelEn)).status, 'unknown');
    assert.equal(result.checks.find(c => /Brochure award/.test(c.labelEn)).status, 'unknown');
  }
});

test('project-credit and overlapping basket descriptions cannot force a resolved curriculum, mandatory diploma or research-entry degree', () => {
  assert.equal(obs.publicationConflicts.programmePage.gss588Cu, 5); assert.equal(obs.publicationConflicts.brochure.gss588Cu, 10);
  assert.equal(obs.identity.brochureMasterCu, 60); assert.equal(obs.identity.resolvedMasterCu, null);
  assert.equal(obs.publicationConflicts.overlappingBasketCoursesNotAutomaticallySummed, true);
  assert.equal(obs.publicationConflicts.diplomaNotAutomaticallyDeclaredUniversalPrerequisite, true);
  assert.equal(obs.publicationConflicts.neighbouringMressThesisNotInherited, true);
  assert.equal(obs.identity.gdgssPathways.length, 3); assert.equal(obs.identity.notThreeExtraMasters, true);
  assert.equal(p.offerings.length, 1); assert.equal(o.id, p.id + '-MGSS'); assert.equal(o.mode, null); assert.equal(o.duration, null); assert.equal(routes.has(p.id), false);
});

test('CV, one-page statement and direct referee process stay distinct from conditional organisational endorsement and employment', () => {
  assert.equal(obs.requirements.cvRequired, true); assert.equal(obs.requirements.personalStatementMaximumPages, 1);
  assert.equal(obs.requirements.referenceLetters, 2); assert.equal(obs.requirements.refereesSubmitDirectToGraduateStudies, true);
  assert.equal(obs.requirements.organisationEndorsementIfApplicable, true); assert.equal(rule('Organisation endorsement is conditional').mandatory, false);
  assert.equal(obs.requirements.adjacentResearchProposalNotMgssRequirement, true);
  assert.equal(obs.requirements.platformDoesNotCollectOrSubmitDocumentsOrContactReferees, true);
  const result = matchProgramme(selected(), profile); assert.equal(result.checks.find(c => /CV, statement/.test(c.labelEn)).status, 'unknown');
  assert.equal(result.checks.some(c => c.status === 'fail'), false);
});

test('career and professional/clinical referee wording do not invent a required major, government job or clinical licence', () => {
  assert.equal(obs.requirements.careerExamplesNotOccupationalOrCitizenshipGates, true);
  assert.equal(obs.requirements.professionalClinicalRefereeWordingNotClinicalLicenceGate, true);
  assert.equal(obs.requirements.closedMajorWhitelist, null); assert.equal(obs.requirements.universalWorkYearMinimum, null);
  assert.equal(p.rules.some(r => ['major', 'experience'].includes(r.kind)), false);
  for (const changes of [{ major: 'Computer Science' }, { major: 'Education' }, { experienceYears: 0 }, { experienceYears: 20 }]) {
    const result = matchProgramme(p, { ...profile, ...changes }); assert.equal(result.status, 'needs_confirmation'); assert.equal(result.tier, null); assert.equal(result.checks.some(c => c.status === 'fail'), false);
  }
  assert.equal(obs.eligibility.citizensPrAndInternationalApplicantsIncluded, true);
  assert.equal(matchProgramme(p, profile).checks.find(c => /International eligibility/.test(c.labelEn)).status, 'unknown');
});

test('conditional general ELPR does not inherit MATSL assessment/strict-score gates or grant high-score/waiver clearance', () => {
  assert.equal(obs.requirements.english.ieltsAcademicMin, 6.5); assert.equal(obs.requirements.english.internetToeflUnversionedMin, 85);
  assert.equal(obs.requirements.english.c1Advanced.yearsAtApplication, 2); assert.equal(obs.requirements.english.muet.yearsAtApplication, 5);
  assert.equal(obs.requirements.english.matslAssessmentAndStrictScoresNotInherited, true); assert.equal(p.rules.some(r => r.kind === 'language'), false);
  for (const language of [{ type: 'ielts', total: 5 }, { type: 'ielts', total: 6.5 }, { type: 'ielts', total: 9 }, { type: 'waiver' }, { type: 'toefl_120', total: 85 }, { type: 'toefl_6', total: 6 }]) {
    const result = matchProgramme(p, { ...profile, language }); assert.equal(result.status, 'needs_confirmation'); assert.equal(result.tier, null);
    assert.equal(result.checks.find(c => /English applicability/.test(c.labelEn)).status, 'unknown');
  }
});

test('28 October comparison uses real source dates while earlier comparison cannot treat the new observation as past evidence', () => {
  assert.deepEqual(obs.cycle.recurringIntakes, ['January', 'July']); assert.equal(o.academicYear, null); assert.equal(o.applicationOpen, null); assert.equal(o.deadline, null);
  for (const day of ['2026-10-28', '2027-01-01', '2027-04-15', '2027-07-01']) {
    const timeline = programmeTimeline(selected(), day); assert.equal(timeline.state, 'unverified');
    assert.match(timeline.offerings[0].reason, /unconfirmed admission route/);
  }
  const earlier = loadRepositoryReviewQueue('2026-10-27').units.find(u => u.programmeId === p.id);
  assert.equal(earlier.sourceCheckedOn, '2026-10-28'); assert.match(earlier.reasons.join(' '), /postdate/); assert.equal(earlier.recordedCutoffs.length, 0);
  const current = loadRepositoryReviewQueue('2026-10-28'); assert.equal(current.counts.nearCutoffUnits, 2); assert.equal(current.counts.reviewRecordedInSource, 0);
});

test('MGSS text fees do not inherit a populated subsidy from a neighbouring row or add separate diploma costs', () => {
  assert.deepEqual(obs.fees.masterTextQuote, { scPr: 31680, otherResidents: 38016, subsidisedAmountPublishedInMasterRow: null });
  assert.equal(obs.fees.genericFundingNoteNotProgrammeSubsidyEvidence, true); assert.equal(obs.fees.acceptanceDeposit.notExtraTuition, true);
  assert.equal(obs.sourceLimitations.linkedCurriculumPlanFetchFailed, true); assert.equal(obs.sourceLimitations.pdfVisualInspectionCompleted, false);
  assert.equal(o.tuition, null); assert.equal(o.applicationFee, null); assert.equal([...contexts.values()].some(c => c.programmeId === p.id), false);
});

test('first MGSS migration preserves earlier records and 27 October archive hashes across isolated restarts', () => {
  for (const [file, hash] of Object.entries(obs.preservation.previousSnapshotHashes)) assert.equal(createHash('sha256').update(readFileSync(new URL(file, root), 'utf8').replaceAll('\r\n', '\n')).digest('hex'), hash);
  const queue = loadRepositoryReviewQueue('2026-10-28'); assert.equal(queue.counts.programmePageRecords, 174); assert.equal(queue.counts.reviewUnits, 267);
  const dir = mkdtempSync(join(tmpdir(), 'gradpath-suss-mgss-')), path = join(dir, 'test.sqlite'), checkedPath = join(dir, 'checked.json'); let db;
  try {
    writeFileSync(checkedPath, JSON.stringify({ ...batch, checkedOn: obs.previousBatchCheckedOn, programmes: batch.programmes.filter(x => x.id !== p.id) }));
    db = new CatalogueStore(path, { ...options, checkedPath }); const previous = db.all().filter(x => x.id !== p.id), directory = db.get(p.id).directoryListing;
    assert.equal(db.get(p.id).verification, 'catalogue_seed'); assert.equal(db.quality().checked, batch.programmes.length - 1); db.close(); db = null;
    writeFileSync(checkedPath, JSON.stringify(batch));
    for (let restart = 0; restart < 2; restart++) {
      db = new CatalogueStore(path, { ...options, checkedPath }); assert.equal(db.get(p.id).verification, 'programme_page_checked');
      assert.deepEqual(db.get(p.id).directoryListing, directory); assert.deepEqual(db.all().filter(x => x.id !== p.id), previous);
      assert.deepEqual(db.quality().sourceRefreshConflicts, []); assert.equal(db.quality().total, 873); assert.equal(db.quality().checked, 174); db.close(); db = null;
    }
  } finally { db?.close(); rmSync(path, { force: true }); rmSync(checkedPath, { force: true }); rmdirSync(dir); }
});

const app = createApp({ store, publicDir: new URL('public/', root), routeEvidencePath: routePath, applicantEvidencePath: contextPath, now: () => new Date('2026-10-28T04:00:00Z') });
await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${app.address().port}`, get = async path => (await fetch(base + path)).json();
test.after(async () => { await new Promise(resolve => app.close(resolve)); store.close(); });

test('actual API/save/restore/export retains contradictory published values and unconfirmed path instead of a fabricated clean total', async () => {
  const before = JSON.stringify(store.all()), detail = await get('/api/programmes/' + p.id + '?offering=' + o.id);
  assert.equal(detail.applicationTimeline.state, 'unverified'); assert.equal(detail.admissionRoute, 'unconfirmed');
  const response = await fetch(base + '/api/matches', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ profile, offerings: { [p.id]: o.id } }) });
  assert.equal(response.status, 200); assert.equal((await response.json()).items.find(x => x.id === p.id).match.status, 'needs_confirmation');
  const saved = optionSnapshot(detail, '2026-10-28T04:00:00.000Z'); assert.equal(parseSavedOption(saved).offeringId, o.id);
  const restored = await fetch(base + '/api/saved-options/resolve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contexts: [saved, { programmeId: p.id, offeringId: p.id + '-seed' }] }) });
  assert.equal(restored.status, 200); const items = (await restored.json()).items; assert.deepEqual(items.map(x => x.status), ['resolved', 'needs_attention']);
  const exported = shortlistExport([items[0].programme], { [p.id]: saved }).programmes[0]; assert.equal(exported.offerings[0].id, o.id);
  assert.equal(exported.offerings[0].duration, null); assert.equal(exported.offerings[0].tuition, null); assert.equal(exported.offerings[0].deadline, null);
  assert.match(exported.evidence.publishedRequirements.find(r => /Programme-page award/.test(r.labelEn)).noteEn, /2.5 out of 5/);
  assert.match(exported.evidence.publishedRequirements.find(r => /Brochure award/.test(r.labelEn)).noteEn, /3.0/);
  assert.equal(exported.evidence.publishedRequirements.find(r => /Organisation endorsement/.test(r.labelEn)).mandatory, false);
  assert.equal(exported.evidence.lastChecked, '2026-10-28'); assert.equal(exported.profile, undefined); assert.equal(exported.match, undefined);
  const meta = await get('/api/meta'); assert.equal(meta.quality.total, 873); assert.equal(meta.quality.browsable, 869); assert.equal(meta.quality.checked, 174);
  assert.equal(meta.quality.peerReviewed, 0); assert.equal(meta.quality.complete, 0); assert.deepEqual(meta.quality.sourceRefreshConflicts, []);
  assert.deepEqual(applicantSummary(contexts), { studyOptions: 78, categories: 158, peerReviewed: 0 }); assert.equal(meta.routeEvidence.routes, 15); assert.equal(JSON.stringify(store.all()), before);
});
