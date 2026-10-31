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
const batch = read('data/checked-programmes.json'), obs = read('data/research/suss-mger-observation-2026-10-27.json');
const p = batch.programmes.find(x => x.id === obs.programmeId), o = p.offerings[0];
const options = { seedPath: new URL('data/catalogue.json', root), expansionPath: new URL('data/catalogue-expansion.json', root), checkedPath: new URL('data/checked-programmes.json', root), directoryEvidencePath: new URL('data/directory-links.json', root), scopeAuditPath: new URL('data/programme-scope-audit.json', root) };
const routePath = new URL('data/route-programmes.json', root), contextPath = new URL('data/applicant-contexts.json', root);
const store = new CatalogueStore(':memory:', options), routes = loadRoutes(routePath, store.all()), contexts = loadApplicantContexts(contextPath, store.all(), routes);
const selected = () => resolveProgramme(store.get(p.id), routes, undefined, o.id, undefined, contexts);
const rule = label => p.rules.find(r => r.labelEn === label);
// Synthetic inputs only: eldercare role, employer evidence, resident status, degree credits and funding are not verified.
const profile = { major: 'Business Administration', degreeStatus: 'graduated', gpa: 2.5, gpaScale: 4, experienceYears: 0, language: { type: 'ielts', total: 7, testDate: '2026-05-01' } };

test('existing MGER retains one 60-CU master with three curriculum tracks and a separate doctoral identity', () => {
  assert.equal(read('data/catalogue-expansion.json').programmes.find(x => x.id === p.id).verification, 'catalogue_seed');
  assert.equal(validateProgramme(p, new Set(['SG-SUSS'])), p); assert.equal(p.faculty, 'S R Nathan School of Human Development');
  assert.equal(p.award, 'MGER'); assert.equal(p.requirementsCoverage, 'partial'); assert.equal(p.reviewer, null);
  assert.equal(obs.identity.taughtCoreCu + obs.identity.specialisationCu, 60); assert.equal(obs.identity.tracks.length, 3); assert.equal(obs.identity.separatePhdNotMerged, true);
  assert.equal(p.offerings.length, 1); assert.equal(o.id, p.id + '-MGER'); assert.equal(o.mode, null); assert.equal(routes.has(p.id), false);
  assert.equal(batch.pilotProgrammeIds.includes(p.id), false); assert.equal(batch.pilotProgrammeIds.length, 20);
  assert.equal(obs.requirements.graduateAwardCgpa, 3); assert.equal(obs.requirements.numericUndergraduateEntryGpa, null); assert.equal(/\p{Script=Han}/u.test(JSON.stringify(p)), false);
});

test('internship is conditional study training and generic work years cannot grant automatic course replacement or create an entry minimum', () => {
  assert.equal(obs.requirements.internship.compulsoryWithoutEldercareExperience, true);
  assert.equal(obs.requirements.internship.withoutDocumentSchoolAssumesInternship, true); assert.equal(obs.requirements.internship.replacementRequiresSupervisorOrHrJobScopeDocument, true);
  assert.equal(obs.requirements.internship.studyHours, 200); assert.equal(obs.requirements.internship.completionSemesters, 2);
  assert.equal(rule('Conditional internship and replacement evidence').mandatory, false);
  for (const experienceYears of [null, 0, 2, 20]) {
    const result = matchProgramme(p, { ...profile, experienceYears }); assert.equal(result.status, 'needs_confirmation'); assert.equal(result.tier, null);
    assert.equal(result.checks.some(c => c.status === 'fail'), false); assert.equal(result.checks.find(c => /Conditional internship/.test(c.labelEn)).status, 'unknown');
  }
  assert.match(rule('Conditional internship and replacement evidence').noteEn, /Generic work years do not grant a waiver/);
});

test('resident eligibility and diploma/master stage duration are not inferred from nationality, fee category or current work', () => {
  assert.equal(obs.eligibility.currentlyUnableToTakeInternationalStudents, true); assert.equal(obs.eligibility.allForeignNationalsNotAutomaticallyRejected, true);
  assert.equal(obs.eligibility.studentPassRouteNotEstablished, true); assert.equal(obs.fees.otherResidentsPriceNotInternationalAdmissionEvidence, true);
  assert.equal(obs.study.fullDegreeDurationDependsOnEntryAndCreditPosition, true); assert.equal(obs.study.maximumsNotAutomaticallySummed, true);
  const result = matchProgramme(p, profile); assert.equal(result.checks.find(c => /Singapore resident eligibility/.test(c.labelEn)).status, 'unknown');
  assert.equal(result.checks.find(c => /Stage, track/.test(c.labelEn)).status, 'unknown'); assert.match(o.duration, /GDGER stage 1 year plus a further MGER year/);
});

test('method-course statistics and unverified funding work years do not become universal MGER admission gates', () => {
  assert.deepEqual(obs.curriculum.researchPlan.methodsAlternatives, ['HDS501', 'RSS503']); assert.equal(obs.curriculum.researchPlan.statisticsRequirementIsRss503CourseLevel, true);
  assert.equal(obs.funding.programmeDisplayedFellowshipWorkYears, 10); assert.equal(obs.funding.currentGovernmentEligibilityNotVerified, true);
  assert.equal(obs.funding.noAutomaticAwardOrTuitionDeduction, true); assert.equal(rule('Funding conditions are separate').mandatory, false);
  assert.equal(p.rules.some(r => ['experience', 'gpa', 'classification', 'major'].includes(r.kind)), false);
  for (const changes of [{ gpa: 1 }, { major: 'History' }, { experienceYears: 10 }]) {
    const result = matchProgramme(p, { ...profile, ...changes }); assert.equal(result.status, 'needs_confirmation'); assert.equal(result.tier, null); assert.equal(result.checks.some(c => c.status === 'fail'), false);
  }
});

test('rolling review, November dialogue and course-presentation years cannot manufacture a dated application window', () => {
  assert.deepEqual(obs.cycle.recurringIntakeMonths, ['January', 'July']); assert.equal(obs.cycle.dialogueEventDate, '2026-11-12'); assert.equal(obs.cycle.eventNotAdmissionDeadline, true);
  assert.equal(obs.cycle.rollingReviewNotLiveOpening, true); assert.equal(o.applicationOpen, null); assert.equal(o.deadline, null); assert.equal(o.academicYear, null);
  for (const day of ['2026-10-27', '2026-11-12', '2027-01-01', '2027-04-15']) {
    const timeline = programmeTimeline(selected(), day); assert.equal(timeline.state, 'dates_incomplete'); assert.equal(timeline.livePortalChecked, false);
  }
});

test('conditional English evidence does not assign a score rejection, automatic waiver, universal expiry or TOEFL conversion', () => {
  assert.equal(obs.requirements.english.ieltsAcademic, 6.5); assert.equal(obs.requirements.english.internetToeflUnversioned, 85); assert.equal(p.rules.some(r => r.kind === 'language'), false);
  for (const language of [{ type: 'ielts', total: 5 }, { type: 'ielts', total: 9 }, { type: 'waiver' }, { type: 'toefl_120', total: 100 }, { type: 'toefl_6', total: 6 }]) {
    const result = matchProgramme(p, { ...profile, language }); assert.equal(result.status, 'needs_confirmation'); assert.equal(result.tier, null);
    assert.equal(result.checks.find(c => /English applicability/.test(c.labelEn)).status, 'unknown');
  }
});

test('MGER fee/subsidy remains a dated category quote without duplicate diploma charges, automatic grant or Student Pass pricing', () => {
  assert.deepEqual(obs.fees.masterTuition, { scPr: 31680, otherResidents: 38016, conditionalSubsidisedAsLowAs: 19800 });
  assert.notEqual(obs.fees.masterTuition.conditionalSubsidisedAsLowAs, read('data/research/suss-mhcm-observation-2026-10-27.json').fees.masterTuition.conditionalSubsidisedAsLowAs);
  assert.equal(o.tuition, null); assert.equal(o.applicationFee, null); assert.equal(obs.fees.acceptanceDeposit.notExtraTuition, true);
  assert.equal(obs.fees.internationalStudentPassMisc530NotAssigned, true); assert.equal([...contexts.values()].some(c => c.programmeId === p.id), false);
});

test('MHCM archives remain immutable and MGER creates no actionable cutoff or independent-review identity', () => {
  const expected = {
    'source-review-queue-2026-10-27-suss-mhcm.md': 'aa524f5487c36e7e249dfe00c8b9afb2eb4706561763fbeaa7f4eeb15cc6cfc9',
    'core-pilot-acceptance-2026-10-27-suss-mhcm.md': '0bdc557d80af15ed597d70028005ffb3831f4f25d6a80422db85aad12106e1e2'
  };
  for (const [file, hash] of Object.entries(expected)) assert.equal(createHash('sha256').update(readFileSync(new URL('docs/research/' + file, root), 'utf8').replaceAll('\r\n', '\n')).digest('hex'), hash);
  const queue = loadRepositoryReviewQueue('2026-10-27'); assert.equal(queue.counts.programmePageRecords, 238); assert.equal(queue.counts.reviewUnits, 448);
  assert.equal(queue.counts.reviewRecordedInSource, 0); assert.equal(queue.units.find(u => u.programmeId === p.id).upcomingRecordedCutoffs.length, 0);
});

test('first MGER source migration preserves all earlier records and directory context across isolated restarts', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gradpath-suss-mger-')), path = join(dir, 'test.sqlite'), checkedPath = join(dir, 'checked.json'); let db;
  try {
    writeFileSync(checkedPath, JSON.stringify({ ...batch, programmes: batch.programmes.filter(x => x.id !== p.id) }));
    db = new CatalogueStore(path, { ...options, checkedPath }); const previous = db.all().filter(x => x.id !== p.id), directory = db.get(p.id).directoryListing;
    assert.equal(db.get(p.id).verification, 'catalogue_seed'); assert.equal(db.quality().checked, batch.programmes.length - 1); db.close(); db = null;
    writeFileSync(checkedPath, JSON.stringify(batch));
    for (let restart = 0; restart < 2; restart++) {
      db = new CatalogueStore(path, { ...options, checkedPath }); assert.equal(db.get(p.id).verification, 'programme_page_checked');
      assert.deepEqual(db.get(p.id).directoryListing, directory); assert.deepEqual(db.all().filter(x => x.id !== p.id), previous);
      assert.deepEqual(db.quality().sourceRefreshConflicts, []); assert.equal(db.quality().total, 873); assert.equal(db.quality().checked, 238); db.close(); db = null;
    }
  } finally { db?.close(); rmSync(path, { force: true }); rmSync(checkedPath, { force: true }); rmdirSync(dir); }
});

const app = createApp({ store, publicDir: new URL('public/', root), routeEvidencePath: routePath, applicantEvidencePath: contextPath, now: () => new Date('2026-10-27T04:00:00Z') });
await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${app.address().port}`, get = async path => (await fetch(base + path)).json();
test.after(async () => { await new Promise(resolve => app.close(resolve)); store.close(); });

test('actual API/save/export retains conditional internship and residence facts while flagging retired catalogue choices', async () => {
  const before = JSON.stringify(store.all()), detail = await get('/api/programmes/' + p.id + '?offering=' + o.id); assert.equal(detail.applicationTimeline.state, 'dates_incomplete');
  const response = await fetch(base + '/api/matches', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ profile, offerings: { [p.id]: o.id } }) });
  assert.equal(response.status, 200); assert.equal((await response.json()).items.find(x => x.id === p.id).match.status, 'needs_confirmation');
  const saved = optionSnapshot(detail, '2026-10-27T04:00:00.000Z'); assert.equal(parseSavedOption(saved).offeringId, o.id);
  const restored = await fetch(base + '/api/saved-options/resolve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contexts: [saved, { programmeId: p.id, offeringId: p.id + '-catalogue' }] }) });
  assert.equal(restored.status, 200); const items = (await restored.json()).items; assert.deepEqual(items.map(x => x.status), ['resolved', 'needs_attention']);
  const exported = shortlistExport([items[0].programme], { [p.id]: saved }).programmes[0]; assert.equal(exported.offerings[0].id, o.id);
  assert.equal(exported.offerings[0].tuition, null); assert.equal(exported.offerings[0].deadline, null); assert.equal(exported.offerings[0].mode, null);
  assert.match(exported.evidence.publishedRequirements.find(r => /Conditional internship/.test(r.labelEn)).noteEn, /Generic work years do not grant a waiver/);
  assert.equal(exported.profile, undefined); assert.equal(exported.match, undefined);
  const meta = await get('/api/meta'); assert.equal(meta.quality.total, 873); assert.equal(meta.quality.browsable, 869); assert.equal(meta.quality.checked, 238);
  assert.equal(meta.quality.peerReviewed, 0); assert.equal(meta.quality.complete, 0); assert.deepEqual(meta.quality.sourceRefreshConflicts, []);
  assert.deepEqual(applicantSummary(contexts), { studyOptions: 184, categories: 370, peerReviewed: 0 }); assert.equal(meta.routeEvidence.routes, 26); assert.equal(JSON.stringify(store.all()), before);
});
