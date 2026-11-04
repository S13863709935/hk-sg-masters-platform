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
const batch = read('data/checked-programmes.json'), obs = read('data/research/suss-maib-observation-2026-10-27.json');
const p = batch.programmes.find(x => x.id === obs.programmeId);
const options = { seedPath: new URL('data/catalogue.json', root), expansionPath: new URL('data/catalogue-expansion.json', root), checkedPath: new URL('data/checked-programmes.json', root), directoryEvidencePath: new URL('data/directory-links.json', root), scopeAuditPath: new URL('data/programme-scope-audit.json', root) };
const routePath = new URL('data/route-programmes.json', root), contextPath = new URL('data/applicant-contexts.json', root);
const store = new CatalogueStore(':memory:', options), routes = loadRoutes(routePath, store.all()), contexts = loadApplicantContexts(contextPath, store.all(), routes);
const selected = offeringId => resolveProgramme(store.get(p.id), routes, undefined, offeringId, undefined, contexts);
const rule = label => p.rules.find(r => r.labelEn === label);
// Synthetic software inputs; residence, academic recognition and ELPR applicability are not verified.
const profile = { major: 'Marketing', degreeStatus: 'graduated', gpa: 2.5, gpaScale: 4, experienceYears: 0, language: { type: 'ielts', total: 7, testDate: '2026-05-01' } };

test('one existing MAIB expansion lead gains partial evidence without duplicating awards or enlarging the pilot', () => {
  assert.equal(read('data/catalogue-expansion.json').programmes.find(x => x.id === p.id).verification, 'catalogue_seed');
  assert.equal(validateProgramme(p, new Set(['SG-SUSS'])), p);
  assert.equal(p.award, 'MAIB'); assert.equal(p.admissionRoute, 'direct'); assert.equal(p.requirementsCoverage, 'partial');
  assert.equal(p.reviewer, null); assert.equal(batch.programmes.filter(x => x.id === p.id).length, 1);
  assert.equal(batch.pilotProgrammeIds.includes(p.id), false); assert.equal(batch.pilotProgrammeIds.length, 20);
  assert.equal(obs.identity.stackableBulletAwardNamesUnresolved, true); assert.equal(obs.identity.clusters.length, 4);
  assert.match(rule('Award wording and optional stacking').noteEn, /equivalence is unconfirmed/);
  assert.equal(/\p{Script=Han}/u.test(JSON.stringify(p)), false);
});

test('regular and accelerated choices do not infer residence, visa status or FT/PT from nationality or evening classes', () => {
  assert.deepEqual(p.offerings.map(o => o.id), [p.id + '-REGULAR', p.id + '-ACCELERATED']);
  assert.ok(p.offerings.every(o => o.mode === null)); assert.equal(routes.has(p.id), false);
  assert.equal(obs.pathways.regular.durationYears.maximum, 4); assert.equal(obs.pathways.accelerated.durationYears, 1);
  assert.equal(obs.pathways.accelerated.internationalApplicantsIncluded, true);
  for (const o of p.offerings) {
    const result = matchProgramme(selected(o.id), profile); assert.equal(result.status, 'needs_confirmation'); assert.equal(result.tier, null);
    assert.equal(result.checks.find(c => /Pathway and residence/.test(c.labelEn)).status, 'unknown');
  }
});

test('graduate CGPA and optional certificate stacking never become undergraduate GPA or major rejection rules', () => {
  assert.equal(obs.requirements.graduateAwardCgpa, 3); assert.equal(obs.requirements.numericEntryGpa, null);
  assert.equal(obs.identity.certificateDiplomaNotRequiredFirst, true);
  assert.equal(p.rules.some(r => ['gpa', 'classification', 'major'].includes(r.kind)), false);
  for (const changes of [{ gpa: 1, gpaScale: 4 }, { gpa: 95, gpaScale: 100 }, { major: 'History' }]) {
    const result = matchProgramme(p, { ...profile, ...changes });
    assert.equal(result.status, 'needs_confirmation'); assert.equal(result.tier, null);
  }
  assert.equal(rule('Graduation CGPA is not an entry threshold').mandatory, false);
});

test('conditional ELPR alternatives do not cause an unconditional score failure, automatic waiver or TOEFL conversion', () => {
  assert.equal(obs.requirements.english.ieltsAcademic, 6.5); assert.equal(obs.requirements.english.internetToeflUnversioned, 85);
  assert.equal(obs.requirements.english.c1Advanced.yearsAtApplication, 2); assert.equal(obs.requirements.english.muet.yearsAtApplication, 5);
  assert.equal(p.rules.some(r => r.kind === 'language'), false);
  for (const language of [{ type: 'ielts', total: 5 }, { type: 'ielts', total: 9 }, { type: 'waiver' }, { type: 'toefl_120', total: 100 }, { type: 'toefl_6', total: 6 }]) {
    const result = matchProgramme(p, { ...profile, language });
    assert.equal(result.status, 'needs_confirmation'); assert.equal(result.tier, null);
    assert.equal(result.checks.find(c => /English applicability/.test(c.labelEn)).status, 'unknown');
    assert.equal(result.checks.some(c => c.status === 'fail'), false);
  }
  assert.equal(obs.requirements.english.ieltsUniversalExpiryMonths, null);
  assert.equal(p.fieldStatus.language.status, 'unknown');
});

test('volunteer preference and CV evidence do not invent required employment or verified documents', () => {
  assert.equal(rule('Volunteer experience is a preference').mandatory, false);
  assert.equal(p.rules.some(r => r.kind === 'experience'), false); assert.equal(obs.requirements.minimumWorkYears, null);
  assert.equal(obs.requirements.cvRequired, true); assert.equal(obs.requirements.conditionalOfferPossible, true);
  assert.match(rule('CV and individual admission assessment').noteEn, /does not collect or submit/);
  const result = matchProgramme(p, { ...profile, degreeStatus: 'final_year' });
  assert.equal(result.status, 'needs_confirmation'); assert.equal(result.checks.find(c => c.kind === 'degree').status, 'unknown');
});

test('fee-year/category quotes and credited deposit remain context rather than a subsidised default or duplicated charge', () => {
  assert.deepEqual(obs.fees.masterTuition, { scPr: 31680, otherResidents: 38016, conditionalSubsidisedAsLowAs: 19800 });
  assert.equal(obs.fees.excludesGst, true); assert.equal(obs.fees.tableYear, '2026/2027');
  assert.equal(obs.fees.acceptanceDeposit.creditedToFirstSemester, true); assert.equal(obs.fees.acceptanceDeposit.notAdditionalTuition, true);
  assert.equal([...contexts.values()].some(c => c.programmeId === p.id), false);
  for (const o of p.offerings) { assert.equal(o.tuition, null); assert.equal(o.applicationFee, null); assert.match(o.feeBasis, /not added twice/); }
  assert.equal(obs.preservation.pdfDownloadSucceeded, false); assert.equal(obs.preservation.pdfVisualVerificationNotClaimed, true);
});

test('general 2027 university calendars and fee-table year do not manufacture an MAIB pathway window', () => {
  assert.deepEqual(obs.cycle.generalCalendarOnly.map(x => x.submitBy), ['2026-10-15', '2027-04-15']);
  for (const o of p.offerings) {
    assert.equal(o.intake, null); assert.equal(o.academicYear, null); assert.equal(o.applicationOpen, null); assert.equal(o.deadline, null);
    for (const day of ['2026-10-27', '2027-01-01', '2027-04-15', '2027-07-01']) {
      const timeline = programmeTimeline(selected(o.id), day); assert.equal(timeline.state, 'dates_incomplete'); assert.equal(timeline.livePortalChecked, false);
    }
  }
  assert.equal(p.fieldStatus.academicYear.status, 'unknown'); assert.equal(p.fieldStatus.deadline.status, 'unknown');
});

test('earlier MHSc same-day archives are immutable and MAIB creates no actionable cutoff or human approval', () => {
  const expected = {
    'source-review-queue-2026-10-27-sit-mhsc.md': 'd555776796e472690ad0b4dd9b6fae6d69e18a7795d60077d01db50599377afa',
    'core-pilot-acceptance-2026-10-27-sit-mhsc.md': '2775d83eb56ac76c4e4a99ab1628aded52a802329bde74fc5e3186bdde07dc1d'
  };
  for (const [file, hash] of Object.entries(expected)) assert.equal(createHash('sha256').update(readFileSync(new URL('docs/research/' + file, root), 'utf8').replaceAll('\r\n', '\n')).digest('hex'), hash);
  const queue = loadRepositoryReviewQueue('2026-10-27');
  assert.equal(queue.counts.programmePageRecords, 401); assert.equal(queue.counts.reviewUnits, 750); assert.equal(queue.counts.reviewRecordedInSource, 0);
  assert.equal(queue.units.find(u => u.programmeId === p.id).upcomingRecordedCutoffs.length, 0);
});

test('first MAIB source migration preserves other records and old catalogue evidence across isolated restarts', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gradpath-suss-maib-')), path = join(dir, 'test.sqlite'), checkedPath = join(dir, 'checked.json'); let db;
  try {
    writeFileSync(checkedPath, JSON.stringify({ ...batch, programmes: batch.programmes.filter(x => x.id !== p.id) }));
    db = new CatalogueStore(path, { ...options, checkedPath });
    const previous = db.all().filter(x => x.id !== p.id), directory = db.get(p.id).directoryListing;
    assert.equal(db.get(p.id).verification, 'catalogue_seed'); assert.equal(db.quality().checked, batch.programmes.length - 1); db.close(); db = null;
    writeFileSync(checkedPath, JSON.stringify(batch));
    for (let restart = 0; restart < 2; restart++) {
      db = new CatalogueStore(path, { ...options, checkedPath });
      assert.equal(db.get(p.id).verification, 'programme_page_checked'); assert.deepEqual(db.get(p.id).directoryListing, directory);
      assert.deepEqual(db.all().filter(x => x.id !== p.id), previous); assert.deepEqual(db.quality().sourceRefreshConflicts, []);
      assert.equal(db.quality().total, 873); assert.equal(db.quality().checked, 401); db.close(); db = null;
    }
  } finally { db?.close(); rmSync(path, { force: true }); rmSync(checkedPath, { force: true }); rmdirSync(dir); }
});

const app = createApp({ store, publicDir: new URL('public/', root), routeEvidencePath: routePath, applicantEvidencePath: contextPath, now: () => new Date('2026-10-27T04:00:00Z') });
await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${app.address().port}`, get = async path => (await fetch(base + path)).json();
test.after(async () => { await new Promise(resolve => app.close(resolve)); store.close(); });

test('real API, saving and exports preserve each explicit pathway, unresolved fees and retired catalogue-choice attention', async () => {
  const before = JSON.stringify(store.all());
  for (const o of p.offerings) {
    const detail = await get('/api/programmes/' + p.id + '?offering=' + o.id);
    assert.equal(detail.applicationTimeline.state, 'dates_incomplete'); assert.equal(detail.offerings[0].mode, null); assert.equal(detail.offerings[0].tuition, null);
    const response = await fetch(base + '/api/matches', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ profile, offerings: { [p.id]: o.id } }) });
    assert.equal(response.status, 200); assert.equal((await response.json()).items.find(x => x.id === p.id).match.status, 'needs_confirmation');
    const saved = optionSnapshot(detail, '2026-10-27T04:00:00.000Z'); assert.equal(parseSavedOption(saved).offeringId, o.id);
    const restored = await fetch(base + '/api/saved-options/resolve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contexts: [saved, { programmeId: p.id, offeringId: p.id + '-catalogue' }] }) });
    assert.equal(restored.status, 200); const items = (await restored.json()).items; assert.deepEqual(items.map(x => x.status), ['resolved', 'needs_attention']);
    const exported = shortlistExport([items[0].programme], { [p.id]: saved }).programmes[0];
    assert.equal(exported.offerings[0].id, o.id); assert.equal(exported.offerings[0].tuition, null); assert.equal(exported.offerings[0].deadline, null);
    assert.equal(exported.profile, undefined); assert.equal(exported.match, undefined);
  }
  const meta = await get('/api/meta'); assert.equal(meta.quality.total, 873); assert.equal(meta.quality.browsable, 865); assert.equal(meta.quality.checked, 401);
  assert.equal(meta.quality.peerReviewed, 0); assert.equal(meta.quality.complete, 0); assert.deepEqual(meta.quality.sourceRefreshConflicts, []);
  assert.deepEqual(applicantSummary(contexts), { studyOptions: 288, categories: 580, peerReviewed: 0 }); assert.equal(meta.routeEvidence.routes, 61);
  assert.equal(JSON.stringify(store.all()), before);
});
