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
const batch = read('data/checked-programmes.json'), obs = read('data/research/suss-mssc-observation-2026-10-28.json');
const p = batch.programmes.find(x => x.id === obs.programmeId), o = p.offerings[0];
const options = { seedPath: new URL('data/catalogue.json', root), expansionPath: new URL('data/catalogue-expansion.json', root), checkedPath: new URL('data/checked-programmes.json', root), directoryEvidencePath: new URL('data/directory-links.json', root), scopeAuditPath: new URL('data/programme-scope-audit.json', root) };
const routePath = new URL('data/route-programmes.json', root), contextPath = new URL('data/applicant-contexts.json', root);
const store = new CatalogueStore(':memory:', options), routes = loadRoutes(routePath, store.all()), contexts = loadApplicantContexts(contextPath, store.all(), routes);
const selected = () => resolveProgramme(store.get(p.id), routes, undefined, o.id, undefined, contexts);
// Synthetic undergraduate data cannot establish graduate diploma completion, grades, approved pairing or credits.
const profile = { major: 'Business Administration', degreeStatus: 'graduated', classification: 'ordinary', gpa: 2.5, gpaScale: 4, experienceYears: 0, language: { type: 'ielts', total: 6.5, testDate: '2026-05-01' } };
const check = (result, label) => result.checks.find(c => c.labelEn === label);

test('MSSC upgrades one existing coursework master without merging research sibling or multiplying diploma pairings', () => {
  const catalogue = read('data/catalogue.json').programmes;
  assert.equal(catalogue.find(x => x.id === p.id).verification, 'catalogue_seed');
  assert.equal(validateProgramme(p, new Set(['SG-SUSS'])), p); assert.equal(p.award, 'MSSC');
  assert.equal(obs.identity.internationalDirectoryClassifiesCoursework, true);
  assert.equal(obs.identity.twoDiplomaRelevantCourseCu + obs.identity.appliedResearchProjectCu, 70);
  assert.equal(obs.identity.masterAppliedResearchSiblingNotMerged, 'SG-SUSS-P008');
  assert.notEqual(store.get('SG-SUSS-P008').id, p.id); assert.equal(p.offerings.length, 1); assert.equal(routes.has(p.id), false);
  assert.equal(p.requirementsCoverage, 'partial'); assert.equal(p.reviewer, null); assert.equal(batch.pilotProgrammeIds.length, 20);
  assert.equal(batch.pilotProgrammeIds.includes(p.id), false); assert.equal(/\p{Script=Han}/u.test(JSON.stringify(p)), false);
});

test('undergraduate GPA, major and work-year changes never satisfy or fail postgraduate diploma progression by themselves', () => {
  assert.equal(p.rules.some(r => ['gpa', 'major', 'classification', 'experience'].includes(r.kind)), false);
  assert.equal(p.fieldStatus.gpa.status, 'not_published'); assert.equal(obs.entry.numericUndergraduateEntryGpa, null);
  for (const changes of [{ gpa: 1 }, { gpa: 4, experienceYears: 20 }, { gpa: 3, gpaScale: 5 }, { major: 'History', classification: 'third' }]) {
    const result = matchProgramme(selected(), { ...profile, ...changes });
    assert.equal(result.status, 'needs_confirmation'); assert.equal(result.tier, null); assert.equal(result.checks.some(c => c.status === 'fail'), false);
    assert.equal(check(result, 'Postgraduate diploma grades and separate study clock').status, 'unknown');
    assert.equal(check(result, 'Entry stage, approved diploma pairing and recognised credits').status, 'unknown');
  }
  assert.equal(matchProgramme(p, { ...profile, degreeStatus: 'final_year' }).checks.find(c => c.kind === 'degree').status, 'unknown');
});

test('graduate grades and diploma-only four-year clock survive selection without promising a four-year whole master', () => {
  assert.equal(obs.study.masterAwardCgpa, 3); assert.equal(obs.study.bothGraduateDiplomasCgpaAtLeast, 3); assert.equal(obs.study.postgraduateGpaScale, 5);
  assert.equal(obs.study.maximumYearsForBothDiplomasTogether, 4); assert.equal(obs.study.projectTimeExcludedFromFourYearDiplomaPeriod, true);
  assert.equal(o.mode, null); assert.match(o.duration, /excluding 10-CU project time/);
  const rule = selected().rules.find(r => /Postgraduate diploma grades/.test(r.labelEn));
  assert.match(rule.noteEn, /not undergraduate entry GPA/); assert.match(rule.noteEn, /not four years for each diploma/);
  assert.equal(check(matchProgramme(selected(), profile), rule.labelEn).status, 'unknown');
});

test('international parent access neither approves a Taxation pairing nor imports its restriction onto every MSSC applicant', () => {
  assert.equal(obs.eligibility.citizensPrAndInternationalStudentsWelcome, true);
  assert.equal(obs.pairings.standaloneTaxationResidentRestrictionNotUniversalMsscRestriction, true);
  assert.equal(obs.pairings.internationalTaxationContainingPairNotAutomaticallyApproved, true);
  const result = matchProgramme(selected(), { ...profile, major: 'Taxation', gpa: 4, experienceYears: 20 });
  assert.equal(result.status, 'needs_confirmation'); assert.equal(result.tier, null);
  const rule = p.rules.find(r => /International master eligibility/.test(r.labelEn));
  assert.equal(check(result, rule.labelEn).status, 'unknown'); assert.match(rule.noteEn, /not approve every diploma pairing/);
  assert.match(rule.noteEn, /or apply that restriction to every MSSC applicant/);
});

test('CV, integrated applied-project proposal and shortlisted interview remain visible unresolved evidence without PhD carry-over', () => {
  assert.equal(obs.entry.projectProposalApproximatelyWords, 500); assert.equal(obs.entry.shortlistedInterviewRequired, true);
  assert.equal(obs.entry.neighbouringPhdStatementReferencesSupervisorNotInherited, true);
  const rule = p.rules.find(r => /CV, applied-project proposal/.test(r.labelEn));
  assert.match(rule.noteEn, /approximately 500-word/); assert.match(rule.noteEn, /Shortlisted applicants must attend/);
  assert.match(rule.noteEn, /separate from PhD/); assert.match(rule.noteEn, /not inspected or generated/);
  assert.equal(check(matchProgramme(p, { ...profile, gpa: 4 }), rule.labelEn).status, 'unknown');
});

test('prior Social Work diploma does not invent an 80-CU master, missing course, universal practicum or undergraduate GPA threshold', () => {
  assert.equal(obs.pairings.socialWorkStandaloneCu, 40); assert.equal(obs.pairings.socialWorkMsscHeaderCu, 30);
  assert.equal(obs.pairings.socialWorkMsscVisibleListedCourseCu, 25); assert.equal(obs.pairings.socialWorkListAndRecognisedCreditMappingUnreconciled, true);
  const rule = p.rules.find(r => /Social Work and other prior-diploma mapping/.test(r.labelEn));
  assert.match(rule.noteEn, /not reconciled/); assert.match(rule.noteEn, /published MSSC total remains 70 CU/);
  const result = matchProgramme(p, { ...profile, major: 'Social Work', gpa: 2.5, gpaScale: 5 });
  assert.equal(result.status, 'needs_confirmation'); assert.equal(result.checks.some(c => c.status === 'fail'), false);
  assert.equal(check(result, rule.labelEn).status, 'unknown');
});

test('general English scores and waiver claims cannot resolve selected-diploma language applicability', () => {
  assert.equal(p.rules.some(r => r.kind === 'language'), false);
  assert.equal(obs.english.selectedDiplomaRequirementsNotFlattenedIntoGeneralPolicy, true);
  assert.equal(obs.english.brochurePbt580NotAutomaticallyInsertedIntoCurrentPolicy, true);
  for (const language of [{ type: 'ielts', total: 6.5 }, { type: 'ielts', total: 9 }, { type: 'waiver' }, { type: 'toefl_120', total: 85 }, { type: 'toefl_6', total: 6 }]) {
    const result = matchProgramme(p, { ...profile, language });
    assert.equal(result.status, 'needs_confirmation'); assert.equal(result.tier, null);
    assert.equal(check(result, 'Conditional general English and selected-diploma applicability').status, 'unknown');
  }
});

test('dated feature window and conditional master quotes stay visible without selecting cohort, personal tuition or project-only balance', () => {
  assert.deepEqual(obs.fees.masterTextQuotesBeforeGst, { maximumSsgAsLowAs: 21252, scPr: 36960, otherResidents: 44352 });
  assert.equal(obs.fees.priorDiplomaPaymentsAndApprovedCreditsNeedReconciliation, true);
  assert.match(o.feeBasis, /do not add two diploma prices/); assert.match(o.feeBasis, /not granted from citizenship alone/);
  assert.match(o.deadlineNote, /16 October 2026 to 15 April 2027/);
  for (const key of ['academicYear', 'tuition', 'applicationFee', 'applicationOpen', 'deadline']) assert.equal(o[key], null);
  for (const day of ['2026-10-28', '2027-01-01', '2027-04-15', '2027-07-01']) assert.equal(programmeTimeline(selected(), day).state, 'dates_incomplete');
  assert.equal([...contexts.values()].some(c => c.programmeId === p.id), false);
  assert.equal(obs.sourceLimitations.curriculumPlanFetchFailed502, true); assert.equal(obs.sourceLimitations.pdfVisualInspectionCompleted, false);
});

test('first MSSC source migration preserves every other record and prior snapshots over isolated restarts', () => {
  for (const [file, hash] of Object.entries(obs.preservation.previousSnapshotHashes)) assert.equal(createHash('sha256').update(readFileSync(new URL(file, root), 'utf8').replaceAll('\r\n', '\n')).digest('hex'), hash);
  const queue = loadRepositoryReviewQueue('2026-10-28'); assert.equal(queue.counts.programmePageRecords, 274); assert.equal(queue.counts.reviewUnits, 502);
  assert.equal(queue.counts.reviewRecordedInSource, 0); assert.equal(queue.units.find(u => u.programmeId === p.id).upcomingRecordedCutoffs.length, 0);
  const dir = mkdtempSync(join(tmpdir(), 'gradpath-suss-mssc-')), path = join(dir, 'test.sqlite'), checkedPath = join(dir, 'checked.json'); let db;
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

test('matching API, saved restore and export preserve unresolved diploma eligibility, raw dates and prior-payment fees without data mutation', async () => {
  const before = JSON.stringify(store.all()), detail = await get('/api/programmes/' + p.id + '?offering=' + o.id);
  for (const changes of [{}, { major: 'Social Work', gpa: 4, experienceYears: 20 }]) {
    const response = await fetch(base + '/api/matches', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ profile: { ...profile, ...changes }, offerings: { [p.id]: o.id } }) });
    assert.equal(response.status, 200); const match = (await response.json()).items.find(x => x.id === p.id).match;
    assert.equal(match.status, 'needs_confirmation'); assert.equal(match.tier, null);
    assert.equal(check(match, 'Entry stage, approved diploma pairing and recognised credits').status, 'unknown');
  }
  const saved = optionSnapshot(detail, '2026-10-28T04:00:00.000Z'); assert.equal(parseSavedOption(saved).offeringId, o.id);
  const response = await fetch(base + '/api/saved-options/resolve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contexts: [saved, { programmeId: p.id, offeringId: p.id + '-seed' }] }) });
  assert.equal(response.status, 200); const items = (await response.json()).items; assert.deepEqual(items.map(x => x.status), ['resolved', 'needs_attention']);
  const exported = shortlistExport([items[0].programme], { [p.id]: saved }).programmes[0]; assert.equal(exported.offerings[0].id, o.id);
  assert.equal(exported.offerings[0].tuition, null); assert.equal(exported.offerings[0].deadline, null);
  assert.match(exported.offerings[0].deadlineNote, /16 October 2026 to 15 April 2027/); assert.match(exported.offerings[0].feeBasis, /prior payments/);
  assert.match(exported.evidence.publishedRequirements.find(r => /Postgraduate diploma grades/.test(r.labelEn)).noteEn, /not undergraduate entry GPA/);
  assert.equal(exported.profile, undefined); assert.equal(exported.match, undefined);
  const meta = await get('/api/meta'); assert.equal(meta.quality.checked, 274); assert.equal(meta.quality.total, 873); assert.equal(meta.quality.browsable, 869);
  assert.equal(meta.quality.peerReviewed, 0); assert.equal(meta.quality.complete, 0); assert.deepEqual(meta.quality.sourceRefreshConflicts, []);
  assert.deepEqual(applicantSummary(contexts), { studyOptions: 191, categories: 384, peerReviewed: 0 }); assert.equal(meta.routeEvidence.routes, 37);
  assert.equal(detail.applicationTimeline.state, 'dates_incomplete'); assert.equal(JSON.stringify(store.all()), before);
});
