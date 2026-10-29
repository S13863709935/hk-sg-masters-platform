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
const batch = read('data/checked-programmes.json'), obs = read('data/research/suss-medu-observation-2026-10-28.json');
const p = batch.programmes.find(x => x.id === obs.programmeId), [regular, accelerated] = p.offerings;
const options = { seedPath: new URL('data/catalogue.json', root), expansionPath: new URL('data/catalogue-expansion.json', root), checkedPath: new URL('data/checked-programmes.json', root), directoryEvidencePath: new URL('data/directory-links.json', root), scopeAuditPath: new URL('data/programme-scope-audit.json', root) };
const routePath = new URL('data/route-programmes.json', root), contextPath = new URL('data/applicant-contexts.json', root);
const store = new CatalogueStore(':memory:', options), routes = loadRoutes(routePath, store.all()), contexts = loadApplicantContexts(contextPath, store.all(), routes);
const selected = id => resolveProgramme(store.get(p.id), routes, undefined, id, undefined, contexts);
// Synthetic only: foundation choice, teaching relevance, workplace capacity, nationality, medium and funding are unverified.
const profile = { major: 'History', degreeStatus: 'graduated', classification: 'ordinary', gpa: 2.5, gpaScale: 4, experienceYears: 0, language: { type: 'ielts', total: 6.5, testDate: '2026-05-01' } };
const check = (result, label) => result.checks.find(c => c.labelEn === label);

test('MEd is one existing 60-CU coursework master with alternative foundations, not three masters or a mandatory 90-CU stack', () => {
  assert.equal(read('data/catalogue.json').programmes.find(x => x.id === p.id).verification, 'catalogue_seed');
  assert.equal(validateProgramme(p, new Set(['SG-SUSS'])), p); assert.equal(p.award, 'MEd');
  assert.equal(obs.identity.foundationalCu + obs.identity.deepeningCu, 60); assert.deepEqual(obs.identity.alternativeFoundationDiplomas, ['GDED', 'GDCT']);
  assert.equal(obs.identity.commonDeepeningDiploma, 'GDLDT'); assert.equal(obs.identity.thesisRequired, false);
  assert.equal(obs.identity.internationalDirectoryClassifiesCoursework, true); assert.equal(p.offerings.length, 2); assert.equal(routes.has(p.id), false);
  assert.equal(p.requirementsCoverage, 'partial'); assert.equal(p.reviewer, null); assert.equal(batch.pilotProgrammeIds.length, 20); assert.equal(batch.pilotProgrammeIds.includes(p.id), false);
  assert.equal(/\p{Script=Han}/u.test(JSON.stringify(p)), false);
});

test('recorded regular and accelerated modes preserve distinct duration and master code without approving a foundation or applicant category', () => {
  assert.deepEqual(p.offerings.map(o => o.mode), ['Part-time', 'Full-time']);
  assert.equal(obs.pathways.regular.durationYears.maximum, 4); assert.equal(obs.pathways.accelerated.durationYears, 1);
  assert.equal(obs.pathways.accelerated.foundation, 'GDED'); assert.equal(obs.pathways.accelerated.notAvailableThroughGdct, true);
  assert.match(regular.intake, /MEDU/); assert.match(accelerated.intake, /MEDU-A/);
  for (const o of p.offerings) {
    const detail = selected(o.id); assert.equal(detail.offerings.length, 1); assert.equal(detail.offerings[0].id, o.id);
    assert.equal(detail.selectedOffering.mode, o.mode); assert.deepEqual(detail.rules, p.rules);
    const result = matchProgramme(detail, profile); assert.equal(result.status, 'needs_confirmation'); assert.equal(result.tier, null);
  }
});

test('GDCT two-year teaching and workplace capacity do not become a universal experience gate or an automatic experience pass', () => {
  assert.equal(obs.pathways.gdctOnly.minimumTeachingTrainingEquivalentYears, 2); assert.equal(obs.pathways.gdctOnly.employerPracticumCapacityRequired, true);
  assert.equal(p.rules.some(r => r.kind === 'experience'), false); assert.equal(obs.requirements.universalMinimumWorkYears, null);
  for (const experienceYears of [0, 1, 2, 20]) for (const o of p.offerings) {
    const result = matchProgramme(selected(o.id), { ...profile, experienceYears }); assert.equal(result.status, 'needs_confirmation');
    assert.equal(result.checks.some(c => c.status === 'fail'), false);
    assert.equal(check(result, 'Foundation choice and GDCT-only experience/practicum').status, 'unknown');
  }
  assert.equal(obs.pathways.regular.foundationChoiceNotVerifiedByModeSelection, true);
});

test('career switchers and low/different-scale scores do not acquire invented Education-major, honours or undergraduate GPA rejection rules', () => {
  assert.equal(p.rules.some(r => ['major', 'classification', 'gpa'].includes(r.kind)), false); assert.equal(p.fieldStatus.gpa.status, 'not_published');
  for (const changes of [{ major: 'Education', gpa: 1 }, { major: 'Engineering', gpa: 3, gpaScale: 5 }, { classification: 'first', gpa: 4 }]) {
    const result = matchProgramme(p, { ...profile, ...changes }); assert.equal(result.status, 'needs_confirmation'); assert.equal(result.checks.some(c => c.status === 'fail'), false); assert.equal(result.tier, null);
  }
  assert.equal(obs.requirements.masterAwardCgpa, 3); assert.equal(obs.requirements.awardCgpaNotUndergraduateEntryGpa, true);
});

test('explicit international MEDU-A master access is not overridden by contradictory standalone diploma FAQs or mistaken for Student Pass approval', () => {
  assert.equal(obs.pathways.accelerated.internationalApplicantsMustSelectThisCode, true); assert.equal(obs.pathways.international.foundationGdedOnly, true);
  assert.equal(obs.pathways.international.gdedAndGdldtStandaloneInternationalAdmissionFaqContradictionRetained, true);
  const label = 'International master code versus standalone diploma restrictions';
  for (const o of p.offerings) {
    const result = matchProgramme(selected(o.id), profile); assert.equal(check(result, label).status, 'unknown');
    assert.match(p.rules.find(r => r.labelEn === label).noteEn, /Retain that ambiguity/);
  }
  assert.equal(obs.pathways.international.noAutomaticPassResidenceOrEmploymentInference, true);
});

test('MEd general conditional English does not inherit another degree strict-greater score, an automatic waiver or invented IELTS expiry', () => {
  assert.equal(obs.requirements.generalEnglish.ieltsAcademicMin, 6.5); assert.equal(obs.requirements.generalEnglish.notOtherSussProgrammeStrictGreaterThanGate, true);
  assert.equal(p.rules.some(r => r.kind === 'language'), false);
  for (const language of [{ type: 'ielts', total: 6.5 }, { type: 'ielts', total: 5 }, { type: 'ielts', total: 9 }, { type: 'waiver' }, { type: 'toefl_120', total: 85 }, { type: 'toefl_6', total: 6 }]) {
    const result = matchProgramme(p, { ...profile, language }); assert.equal(result.status, 'needs_confirmation');
    assert.equal(check(result, 'Conditional general English and waiver assessment').status, 'unknown'); assert.equal(result.checks.some(c => c.status === 'fail'), false);
  }
  assert.equal(obs.requirements.generalEnglish.ieltsToeflExpiryNotEstablishedHere, true);
});

test('unlocated checklist text is not no-documents evidence, and workplace flexibility cannot remove practicum or expired-candidature conditions', () => {
  assert.equal(obs.requirements.documents.dedicatedMEdBlockNotLocatedInReadableChecklistText, true);
  assert.equal(obs.requirements.documents.notEvidenceOfNoAdditionalProgrammeDocuments, true); assert.equal(obs.requirements.documents.imageOrUnextractedPagesNotRuledOut, true);
  assert.equal(obs.requirements.documents.nearbyEarlyChildhoodCvRefereesStatementNotInherited, true);
  assert.equal(check(matchProgramme(p, profile), 'Application documents and credit-recognition evidence').status, 'unknown');
  assert.deepEqual(obs.pathways.gdctOnly.practicumCourses, ['EDU522', 'EDU524']); assert.equal(obs.study.candidatureExpiredCETCompletionDoesNotRestoreAward, true);
  assert.equal(p.rules.find(r => r.labelEn === 'Stackable study, award and candidature boundaries').mandatory, false);
  assert.equal(obs.sourceLimitations.curriculumPlanFetchTimedOut, true); assert.equal(obs.sourceLimitations.pdfVisualInspectionCompleted, false);
});

test('Education fee rows stay distinct from neighbouring subsidies/diploma additions and January recurrence never becomes a fabricated deadline', () => {
  assert.deepEqual(obs.fees.educationMasterTextQuoteBeforeGst, { scPr: 31680, otherResidents: 38016 });
  assert.deepEqual(obs.fees.educationDiplomaTextQuoteBeforeGst, { scPr: 15840, otherResidents: 19008 });
  assert.equal(obs.fees.educationSubsidyCellNotPopulatedInReadableRow, true); assert.equal(obs.fees.nearbyBoundaryCrossingOrSocialWorkLowestPriceNotInherited, true);
  assert.equal(obs.fees.stackingNotDefaultMasterPlusTwoDiplomasFee, true); assert.equal(obs.fees.deposit.creditsFirstSemesterTuition, true);
  for (const o of p.offerings) {
    assert.equal(o.tuition, null); assert.equal(o.applicationFee, null); assert.equal(o.academicYear, null); assert.equal(o.deadline, null); assert.equal(o.applicationOpen, null);
    for (const day of ['2026-10-28', '2027-01-01', '2027-07-01']) assert.equal(programmeTimeline(selected(o.id), day).state, 'dates_incomplete');
  }
  assert.equal(obs.cycle.intakesPerYear, 1); assert.equal([...contexts.values()].some(c => c.programmeId === p.id), false);
});

test('first MEd source migration preserves other records and previous snapshots across isolated restarts', () => {
  for (const [file, hash] of Object.entries(obs.preservation.previousSnapshotHashes)) assert.equal(createHash('sha256').update(readFileSync(new URL(file, root), 'utf8').replaceAll('\r\n', '\n')).digest('hex'), hash);
  const queue = loadRepositoryReviewQueue('2026-10-28'); assert.equal(queue.counts.programmePageRecords, 72); assert.equal(queue.counts.reviewUnits, 101);
  assert.equal(queue.counts.reviewRecordedInSource, 0); assert.equal(queue.units.find(u => u.programmeId === p.id).upcomingRecordedCutoffs.length, 0);
  const dir = mkdtempSync(join(tmpdir(), 'gradpath-suss-medu-')), path = join(dir, 'test.sqlite'), checkedPath = join(dir, 'checked.json'); let db;
  try {
    writeFileSync(checkedPath, JSON.stringify({ ...batch, programmes: batch.programmes.filter(x => x.id !== p.id) }));
    db = new CatalogueStore(path, { ...options, checkedPath }); const earlier = db.all().filter(x => x.id !== p.id), listing = db.get(p.id).directoryListing;
    assert.equal(db.get(p.id).verification, 'catalogue_seed'); assert.equal(db.quality().checked, 71); db.close(); db = null;
    writeFileSync(checkedPath, JSON.stringify(batch));
    for (let restart = 0; restart < 2; restart++) {
      db = new CatalogueStore(path, { ...options, checkedPath }); assert.equal(db.get(p.id).verification, 'programme_page_checked');
      assert.deepEqual(db.get(p.id).directoryListing, listing); assert.deepEqual(db.all().filter(x => x.id !== p.id), earlier);
      assert.deepEqual(db.quality().sourceRefreshConflicts, []); assert.equal(db.quality().checked, 72); db.close(); db = null;
    }
  } finally { db?.close(); rmSync(path, { force: true }); rmSync(checkedPath, { force: true }); rmdirSync(dir); }
});

const app = createApp({ store, publicDir: new URL('public/', root), routeEvidencePath: routePath, applicantEvidencePath: contextPath, now: () => new Date('2026-10-28T04:00:00Z') });
await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${app.address().port}`, get = async path => (await fetch(base + path)).json();
test.after(async () => { await new Promise(resolve => app.close(resolve)); store.close(); });

test('actual API keeps regular/accelerated saved choices distinct while qualification/work/English applicability and personal prices remain unresolved in export', async () => {
  const before = JSON.stringify(store.all());
  for (const o of p.offerings) {
    const detail = await get('/api/programmes/' + p.id + '?offering=' + o.id); assert.equal(detail.applicationTimeline.state, 'dates_incomplete');
    const matched = await fetch(base + '/api/matches', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ profile, offerings: { [p.id]: o.id } }) });
    assert.equal(matched.status, 200); const match = (await matched.json()).items.find(x => x.id === p.id).match;
    assert.equal(match.status, 'needs_confirmation'); assert.equal(match.tier, null); assert.equal(match.checks.some(c => c.status === 'fail'), false);
    const saved = optionSnapshot(detail, '2026-10-28T04:00:00.000Z'); assert.equal(parseSavedOption(saved).offeringId, o.id);
    const restored = await fetch(base + '/api/saved-options/resolve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contexts: [saved, { programmeId: p.id, offeringId: p.id + '-seed' }] }) });
    assert.equal(restored.status, 200); const items = (await restored.json()).items; assert.deepEqual(items.map(x => x.status), ['resolved', 'needs_attention']);
    const exported = shortlistExport([items[0].programme], { [p.id]: saved }).programmes[0]; assert.equal(exported.offerings[0].id, o.id);
    assert.equal(exported.offerings[0].mode, o.mode); assert.equal(exported.offerings[0].tuition, null); assert.equal(exported.offerings[0].deadline, null);
    assert.equal(exported.evidence.publishedRequirements.some(r => ['major', 'gpa', 'classification', 'experience', 'language'].includes(r.kind)), false);
    assert.match(exported.evidence.publishedRequirements.find(r => /GDCT-only/.test(r.labelEn)).noteEn, /Only applicants for GDCT-GDLDT/);
    assert.match(exported.evidence.publishedRequirements.find(r => /International master code/.test(r.labelEn)).noteEn, /MEDU-A/);
    assert.equal(exported.profile, undefined); assert.equal(exported.match, undefined);
  }
  const meta = await get('/api/meta'); assert.equal(meta.quality.checked, 72); assert.equal(meta.quality.total, 873); assert.equal(meta.quality.browsable, 870);
  assert.equal(meta.quality.peerReviewed, 0); assert.equal(meta.quality.complete, 0); assert.deepEqual(meta.quality.sourceRefreshConflicts, []);
  assert.deepEqual(applicantSummary(contexts), { studyOptions: 18, categories: 38, peerReviewed: 0 }); assert.equal(meta.routeEvidence.routes, 11);
  assert.equal(JSON.stringify(store.all()), before);
});
