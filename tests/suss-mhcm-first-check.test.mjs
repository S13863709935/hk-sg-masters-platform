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
const batch = read('data/checked-programmes.json'), obs = read('data/research/suss-mhcm-observation-2026-10-27.json');
const p = batch.programmes.find(x => x.id === obs.programmeId), o = p.offerings[0];
const options = { seedPath: new URL('data/catalogue.json', root), expansionPath: new URL('data/catalogue-expansion.json', root), checkedPath: new URL('data/checked-programmes.json', root), directoryEvidencePath: new URL('data/directory-links.json', root), scopeAuditPath: new URL('data/programme-scope-audit.json', root) };
const routePath = new URL('data/route-programmes.json', root), contextPath = new URL('data/applicant-contexts.json', root);
const store = new CatalogueStore(':memory:', options), routes = loadRoutes(routePath, store.all()), contexts = loadApplicantContexts(contextPath, store.all(), routes);
const selected = () => resolveProgramme(store.get(p.id), routes, undefined, o.id, undefined, contexts);
const rule = label => p.rules.find(r => r.labelEn === label);
// Synthetic inputs only: relevant work, CV contents, residence and diploma progression are not verified.
const profile = { major: 'Human Resource Management', degreeStatus: 'graduated', gpa: 2.5, gpaScale: 4, experienceYears: 3, language: { type: 'ielts', total: 7, testDate: '2026-05-01' } };

test('existing MHCM belongs to Human Development and four secondary fields remain one partial master identity', () => {
  assert.equal(read('data/catalogue-expansion.json').programmes.find(x => x.id === p.id).verification, 'catalogue_seed');
  assert.equal(validateProgramme(p, new Set(['SG-SUSS'])), p); assert.equal(p.faculty, 'S R Nathan School of Human Development');
  assert.equal(p.award, 'MHCM'); assert.equal(p.requirementsCoverage, 'partial'); assert.equal(p.reviewer, null);
  assert.equal(obs.identity.compulsoryCu + obs.identity.secondaryFieldCu, 60); assert.equal(obs.identity.secondaryFields.length, 4);
  assert.equal(p.offerings.length, 1); assert.equal(o.id, p.id + '-MHCM'); assert.equal(o.mode, null); assert.equal(routes.has(p.id), false);
  assert.equal(batch.pilotProgrammeIds.includes(p.id), false); assert.equal(batch.pilotProgrammeIds.length, 20); assert.equal(/\p{Script=Han}/u.test(JSON.stringify(p)), false);
});

test('two relevant work years and required CV remain explicit without passing generic years as verified relevant experience', () => {
  assert.equal(obs.requirements.relevantWorkMinimumYears, 2); assert.equal(p.rules.some(r => r.kind === 'experience'), false);
  assert.equal(rule('Required CV and individual assessment').mandatory, true); assert.equal(obs.requirements.cvRequired, true);
  assert.match(rule('At least two relevant work years').noteEn, /not automatically two relevant years/);
  for (const experienceYears of [null, 0, 1, 2, 20]) {
    const result = matchProgramme(p, { ...profile, experienceYears }); assert.equal(result.status, 'needs_confirmation'); assert.equal(result.tier, null);
    assert.equal(result.checks.find(c => /At least two relevant work/.test(c.labelEn)).status, 'unknown');
  }
  assert.match(rule('Required CV and individual assessment').noteEn, /does not collect or submit/);
});

test('resident restriction does not reject all foreign nationals or create an international Student Pass route from fee categories', () => {
  assert.equal(obs.eligibility.currentlyUnableToTakeInternationalStudents, true); assert.equal(obs.eligibility.employmentPassExample, true);
  assert.equal(obs.eligibility.allForeignNationalsNotAutomaticallyRejected, true); assert.equal(obs.eligibility.studentPassRouteNotEstablished, true);
  assert.equal(obs.fees.otherResidentsPriceNotInternationalAdmissionEvidence, true); assert.equal(obs.fees.internationalStudentPassMisc530NotAssignedToMhcm, true);
  const result = matchProgramme(p, profile); assert.equal(result.checks.find(c => /Singapore resident eligibility/.test(c.labelEn)).status, 'unknown');
  assert.match(rule('Singapore resident eligibility').noteEn, /not a rejection of all foreign nationals/);
});

test('GDHCM progression CGPA and future course replacements are not undergraduate entry requirements or already-effective changes', () => {
  assert.equal(obs.requirements.gdHcmProgressionCgpa, 3); assert.equal(obs.requirements.numericUndergraduateEntryGpa, null);
  assert.equal(p.rules.some(r => ['gpa', 'classification', 'major'].includes(r.kind)), false);
  assert.equal(obs.curriculum.futureReplacementNotAlreadyEffectiveOnCheckDate, true);
  assert.ok(obs.curriculum.plannedReplacements.every(r => r.effectiveSemester === '2027/01'));
  for (const changes of [{ gpa: 1 }, { gpa: 95, gpaScale: 100 }, { degreeStatus: 'final_year' }]) {
    const result = matchProgramme(p, { ...profile, ...changes }); assert.equal(result.status, 'needs_confirmation'); assert.equal(result.tier, null);
    assert.equal(result.checks.find(c => /GDHCM progression/.test(c.labelEn)).status, 'unknown');
  }
});

test('July-only intake and rolling review cannot establish a dated opening, January intake or remote/FT/PT option', () => {
  assert.deepEqual(obs.cycle.recurringIntakeMonths, ['July']); assert.equal(obs.cycle.rollingApplicationReview, true);
  assert.equal(obs.cycle.rollingReviewNotLiveOpening, true); assert.equal(o.applicationOpen, null); assert.equal(o.deadline, null); assert.equal(o.academicYear, null);
  assert.equal(obs.study.minimumYears, 2); assert.equal(obs.study.maximumYears, 4); assert.equal(o.mode, null);
  for (const day of ['2026-10-27', '2027-01-01', '2027-04-15', '2027-07-01']) {
    const timeline = programmeTimeline(selected(), day); assert.equal(timeline.state, 'dates_incomplete'); assert.equal(timeline.livePortalChecked, false);
  }
});

test('conditional English evidence does not grant automatic waiver, score rejection, universal expiry or TOEFL conversion', () => {
  assert.equal(obs.requirements.english.ieltsAcademic, 6.5); assert.equal(obs.requirements.english.internetToeflUnversioned, 85);
  assert.equal(p.rules.some(r => r.kind === 'language'), false);
  for (const language of [{ type: 'ielts', total: 5 }, { type: 'ielts', total: 9 }, { type: 'waiver' }, { type: 'toefl_120', total: 100 }, { type: 'toefl_6', total: 6 }]) {
    const result = matchProgramme(p, { ...profile, language }); assert.equal(result.status, 'needs_confirmation'); assert.equal(result.tier, null);
    assert.equal(result.checks.find(c => /English applicability/.test(c.labelEn)).status, 'unknown');
  }
});

test('MHCM price/subsidy row stays distinct from other masters and does not assign a default discount or duplicate deposit', () => {
  assert.deepEqual(obs.fees.masterTuition, { scPr: 31680, otherResidents: 38016, conditionalSubsidisedAsLowAs: 24552 });
  assert.notEqual(obs.fees.masterTuition.conditionalSubsidisedAsLowAs, read('data/research/suss-mesg-observation-2026-10-27.json').fees.masterTuition.conditionalSubsidisedAsLowAs);
  assert.equal(o.tuition, null); assert.equal(o.applicationFee, null); assert.equal(obs.fees.acceptanceDeposit.notExtraTuition, true);
  assert.equal([...contexts.values()].some(c => c.programmeId === p.id), false); assert.equal(obs.preservation.pdfVisualVerificationNotClaimed, true);
});

test('IP Business archives remain immutable and MHCM adds no actionable cutoff or independent-review record', () => {
  const expected = {
    'source-review-queue-2026-10-27-suss-mipim-ipb.md': '0711574c391d70ca0806bb83b74b626884286e21f6b29ab1d80299784408cb10',
    'core-pilot-acceptance-2026-10-27-suss-mipim-ipb.md': '35ee037b3e0e24524e1d11d860358c762f8d965e9f966b73029325cb674b3733'
  };
  for (const [file, hash] of Object.entries(expected)) assert.equal(createHash('sha256').update(readFileSync(new URL('docs/research/' + file, root), 'utf8').replaceAll('\r\n', '\n')).digest('hex'), hash);
  const queue = loadRepositoryReviewQueue('2026-10-27'); assert.equal(queue.counts.programmePageRecords, 384); assert.equal(queue.counts.reviewUnits, 689);
  assert.equal(queue.counts.reviewRecordedInSource, 0); assert.equal(queue.units.find(u => u.programmeId === p.id).upcomingRecordedCutoffs.length, 0);
});

test('first MHCM source migration preserves all other records and directory context across isolated restarts', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gradpath-suss-mhcm-')), path = join(dir, 'test.sqlite'), checkedPath = join(dir, 'checked.json'); let db;
  try {
    writeFileSync(checkedPath, JSON.stringify({ ...batch, programmes: batch.programmes.filter(x => x.id !== p.id) }));
    db = new CatalogueStore(path, { ...options, checkedPath }); const previous = db.all().filter(x => x.id !== p.id), directory = db.get(p.id).directoryListing;
    assert.equal(db.get(p.id).verification, 'catalogue_seed'); assert.equal(db.quality().checked, batch.programmes.length - 1); db.close(); db = null;
    writeFileSync(checkedPath, JSON.stringify(batch));
    for (let restart = 0; restart < 2; restart++) {
      db = new CatalogueStore(path, { ...options, checkedPath }); assert.equal(db.get(p.id).verification, 'programme_page_checked');
      assert.deepEqual(db.get(p.id).directoryListing, directory); assert.deepEqual(db.all().filter(x => x.id !== p.id), previous);
      assert.deepEqual(db.quality().sourceRefreshConflicts, []); assert.equal(db.quality().total, 873); assert.equal(db.quality().checked, 384); db.close(); db = null;
    }
  } finally { db?.close(); rmSync(path, { force: true }); rmSync(checkedPath, { force: true }); rmdirSync(dir); }
});

const app = createApp({ store, publicDir: new URL('public/', root), routeEvidencePath: routePath, applicantEvidencePath: contextPath, now: () => new Date('2026-10-27T04:00:00Z') });
await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${app.address().port}`, get = async path => (await fetch(base + path)).json();
test.after(async () => { await new Promise(resolve => app.close(resolve)); store.close(); });

test('actual API/save/export retains required CV, relevant work and resident restrictions while flagging retired choices', async () => {
  const before = JSON.stringify(store.all()), detail = await get('/api/programmes/' + p.id + '?offering=' + o.id);
  assert.equal(detail.applicationTimeline.state, 'dates_incomplete'); assert.equal(detail.offerings[0].mode, null);
  const response = await fetch(base + '/api/matches', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ profile, offerings: { [p.id]: o.id } }) });
  assert.equal(response.status, 200); assert.equal((await response.json()).items.find(x => x.id === p.id).match.status, 'needs_confirmation');
  const saved = optionSnapshot(detail, '2026-10-27T04:00:00.000Z'); assert.equal(parseSavedOption(saved).offeringId, o.id);
  const restored = await fetch(base + '/api/saved-options/resolve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contexts: [saved, { programmeId: p.id, offeringId: p.id + '-catalogue' }] }) });
  assert.equal(restored.status, 200); const items = (await restored.json()).items; assert.deepEqual(items.map(x => x.status), ['resolved', 'needs_attention']);
  const exported = shortlistExport([items[0].programme], { [p.id]: saved }).programmes[0]; assert.equal(exported.offerings[0].id, o.id);
  assert.equal(exported.offerings[0].tuition, null); assert.equal(exported.offerings[0].deadline, null);
  const rules = exported.evidence.publishedRequirements; assert.equal(rules.find(r => /Required CV/.test(r.labelEn)).mandatory, true);
  assert.match(rules.find(r => /Singapore resident/.test(r.labelEn)).noteEn, /not a rejection of all foreign nationals/);
  assert.equal(exported.profile, undefined); assert.equal(exported.match, undefined);
  const meta = await get('/api/meta'); assert.equal(meta.quality.total, 873); assert.equal(meta.quality.browsable, 865); assert.equal(meta.quality.checked, 384);
  assert.equal(meta.quality.peerReviewed, 0); assert.equal(meta.quality.complete, 0); assert.deepEqual(meta.quality.sourceRefreshConflicts, []);
  assert.deepEqual(applicantSummary(contexts), { studyOptions: 258, categories: 520, peerReviewed: 0 }); assert.equal(meta.routeEvidence.routes, 47); assert.equal(JSON.stringify(store.all()), before);
});
