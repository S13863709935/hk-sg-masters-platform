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
const batch = read('data/checked-programmes.json'), obs = read('data/research/suss-mavi-observation-2026-10-27.json');
const p = batch.programmes.find(x => x.id === obs.programmeId);
const options = { seedPath: new URL('data/catalogue.json', root), expansionPath: new URL('data/catalogue-expansion.json', root), checkedPath: new URL('data/checked-programmes.json', root), directoryEvidencePath: new URL('data/directory-links.json', root), scopeAuditPath: new URL('data/programme-scope-audit.json', root) };
const routePath = new URL('data/route-programmes.json', root), contextPath = new URL('data/applicant-contexts.json', root);
const store = new CatalogueStore(':memory:', options), routes = loadRoutes(routePath, store.all()), contexts = loadApplicantContexts(contextPath, store.all(), routes);
const selected = offeringId => resolveProgramme(store.get(p.id), routes, undefined, offeringId, undefined, contexts);
const rule = label => p.rules.find(r => r.labelEn === label);
// Synthetic inputs only; no residence, visa, referee, internship or English-medium evidence is verified.
const profile = { major: 'History', degreeStatus: 'graduated', gpa: 2.5, gpaScale: 4, experienceYears: 0, language: { type: 'ielts', total: 7, testDate: '2026-05-01' } };

test('existing English MAVI identity remains separate from Chinese MSDAV, MAIB and non-master awards', () => {
  assert.equal(read('data/catalogue-expansion.json').programmes.find(x => x.id === p.id).verification, 'catalogue_seed');
  assert.equal(validateProgramme(p, new Set(['SG-SUSS'])), p);
  assert.equal(p.award, 'MAVI'); assert.equal(p.admissionRoute, 'direct'); assert.equal(p.requirementsCoverage, 'partial'); assert.equal(p.reviewer, null);
  assert.equal(batch.programmes.filter(x => x.id === p.id).length, 1); assert.equal(batch.pilotProgrammeIds.includes(p.id), false); assert.equal(batch.pilotProgrammeIds.length, 20);
  assert.equal(obs.identity.notChineseProgrammeId, 'SG-SUSS-P026'); assert.equal(obs.identity.notMaibProgrammeId, 'SG-SUSS-P016');
  assert.equal(store.get('SG-SUSS-P026').verification, 'catalogue_seed'); assert.equal(store.get('SG-SUSS-P016').award, 'MAIB');
  assert.equal(obs.identity.coursework, true); assert.equal(obs.identity.certificateDiplomaNotRequiredFirst, true);
  assert.equal(/\p{Script=Han}/u.test(JSON.stringify(p)), false);
});

test('Singapore-attendance options preserve overseas remote restrictions and conditional extension without FT/PT inheritance', () => {
  assert.deepEqual(p.offerings.map(o => o.id), [p.id + '-REGULAR-SG', p.id + '-ACCELERATED-SG']);
  assert.ok(p.offerings.every(o => o.mode === null)); assert.equal(routes.has(p.id), false);
  assert.equal(obs.delivery.hybridSynchronous, true); assert.equal(obs.delivery.remoteSwitchToInPersonAllowed, false);
  assert.equal(obs.delivery.remoteChoicesNotSelectableAsSingaporeAttendance, true); assert.equal(obs.delivery.chineseMsDavModeLabelsNotInherited, true);
  assert.equal(obs.pathways.accelerated.extensionAutomatic, false); assert.equal(obs.pathways.accelerated.maximumYearsIfExtensionApproved, 1.5);
  assert.match(p.offerings[1].duration, /only if approved/);
  for (const o of p.offerings) {
    const result = matchProgramme(selected(o.id), profile); assert.equal(result.status, 'needs_confirmation'); assert.equal(result.tier, null);
    assert.equal(result.checks.find(c => /Singapore attendance and track/.test(c.labelEn)).status, 'unknown');
    assert.equal(result.checks.find(c => /Entirely remote enrolment/.test(c.labelEn)).status, 'unknown');
  }
});

test('coursework award CGPA, project and optional internship do not create entry GPA, work-year or research-route gates', () => {
  assert.equal(obs.requirements.graduateAwardCgpa, 3); assert.equal(obs.requirements.numericEntryGpa, null);
  assert.equal(obs.requirements.internshipMandatory, false); assert.equal(obs.requirements.appliedProjectIsCoursework, true);
  assert.equal(p.rules.some(r => ['gpa', 'classification', 'major', 'experience'].includes(r.kind)), false);
  for (const changes of [{ gpa: 1, gpaScale: 4 }, { gpa: 95, gpaScale: 100 }, { major: 'Computer Science', experienceYears: 10 }]) {
    const result = matchProgramme(p, { ...profile, ...changes }); assert.equal(result.status, 'needs_confirmation'); assert.equal(result.tier, null);
  }
  assert.equal(rule('Coursework project, internship and graduation conditions').mandatory, false);
});

test('CV and track interview are retained while referee contacts remain optional and no documents are collected', () => {
  assert.equal(obs.requirements.cvRequired, true); assert.equal(obs.requirements.trackInterviewRequired, true);
  assert.equal(obs.requirements.refereeContactMandatory, false); assert.equal(rule('Referee contact is optional').mandatory, false);
  assert.equal(rule('Required CV and track interview').mandatory, true);
  assert.match(rule('Required CV and track interview').noteEn, /does not collect or submit/);
  assert.match(rule('Referee contact is optional').noteEn, /No compulsory reference letter/);
  const result = matchProgramme(p, { ...profile, degreeStatus: 'final_year' });
  assert.equal(result.status, 'needs_confirmation'); assert.equal(result.checks.find(c => c.kind === 'degree').status, 'unknown');
});

test('conditional ELPR cannot reject an otherwise unverified applicant solely from score or grant an automatic waiver', () => {
  assert.equal(obs.requirements.english.ieltsAcademic, 6.5); assert.equal(obs.requirements.english.internetToeflUnversioned, 85);
  assert.equal(obs.requirements.english.c1Advanced.yearsAtApplication, 2); assert.equal(obs.requirements.english.muet.yearsAtApplication, 5);
  assert.equal(p.rules.some(r => r.kind === 'language'), false); assert.equal(p.fieldStatus.language.status, 'unknown');
  for (const language of [{ type: 'ielts', total: 5 }, { type: 'ielts', total: 9 }, { type: 'waiver' }, { type: 'toefl_120', total: 100 }, { type: 'toefl_6', total: 6 }]) {
    const result = matchProgramme(p, { ...profile, language }); assert.equal(result.status, 'needs_confirmation'); assert.equal(result.tier, null);
    assert.equal(result.checks.find(c => /English applicability/.test(c.labelEn)).status, 'unknown');
    assert.equal(result.checks.some(c => c.status === 'fail'), false);
  }
  assert.equal(obs.requirements.english.ieltsUniversalExpiryMonths, null);
});

test('MAVI subsidy row is not MAIB pricing or a default personal quote and credited deposit is not counted twice', () => {
  assert.deepEqual(obs.fees.masterTuition, { scPr: 31680, otherResidents: 38016, conditionalSubsidisedAsLowAs: 17424 });
  const maib = read('data/research/suss-maib-observation-2026-10-27.json');
  assert.equal(maib.fees.masterTuition.conditionalSubsidisedAsLowAs, 19800);
  assert.notEqual(obs.fees.masterTuition.conditionalSubsidisedAsLowAs, maib.fees.masterTuition.conditionalSubsidisedAsLowAs);
  assert.equal(obs.fees.excludesGst, true); assert.equal(obs.fees.acceptanceDeposit.notAdditionalTuition, true);
  assert.equal([...contexts.values()].some(c => c.programmeId === p.id), false);
  for (const o of p.offerings) { assert.equal(o.tuition, null); assert.equal(o.applicationFee, null); assert.match(o.feeBasis, /do not add it twice/); }
  assert.equal(obs.preservation.brochureDownloadSucceeded, false); assert.equal(obs.preservation.pdfVisualVerificationNotClaimed, true);
});

test('recurring intake months remain visible without making general-calendar dates an exact track opening or deadline', () => {
  assert.deepEqual(obs.cycle.recurringProgrammeIntakeMonths, ['January', 'July']); assert.equal(obs.cycle.earlierProgrammeClosingCaveat, true);
  for (const o of p.offerings) {
    assert.match(o.intake, /January \/ July/); assert.equal(o.academicYear, null); assert.equal(o.applicationOpen, null); assert.equal(o.deadline, null);
    for (const day of ['2026-10-27', '2027-01-01', '2027-04-15', '2027-07-01']) {
      const timeline = programmeTimeline(selected(o.id), day); assert.equal(timeline.state, 'dates_incomplete'); assert.equal(timeline.livePortalChecked, false);
    }
  }
  assert.equal(p.fieldStatus.academicYear.status, 'unknown'); assert.equal(p.fieldStatus.deadline.status, 'unknown');
});

test('MAIB archives remain immutable and MAVI adds no actionable cutoff or independent review', () => {
  const expected = {
    'source-review-queue-2026-10-27-suss-maib.md': 'd9fd3359e1a4db2cced50ae973625661b8ef770ea9418844d8fc8f895786d148',
    'core-pilot-acceptance-2026-10-27-suss-maib.md': 'b51b211fd43b938118e700652da7c9796ba4b2ad3c5fe70413b997e9f57f3415'
  };
  for (const [file, hash] of Object.entries(expected)) assert.equal(createHash('sha256').update(readFileSync(new URL('docs/research/' + file, root), 'utf8').replaceAll('\r\n', '\n')).digest('hex'), hash);
  const queue = loadRepositoryReviewQueue('2026-10-27');
  assert.equal(queue.counts.programmePageRecords, 48); assert.equal(queue.counts.reviewUnits, 71); assert.equal(queue.counts.reviewRecordedInSource, 0);
  assert.equal(queue.units.find(u => u.programmeId === p.id).upcomingRecordedCutoffs.length, 0);
});

test('first MAVI source migration preserves every other record and directory evidence through isolated restarts', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gradpath-suss-mavi-')), path = join(dir, 'test.sqlite'), checkedPath = join(dir, 'checked.json'); let db;
  try {
    writeFileSync(checkedPath, JSON.stringify({ ...batch, programmes: batch.programmes.filter(x => x.id !== p.id) }));
    db = new CatalogueStore(path, { ...options, checkedPath });
    const previous = db.all().filter(x => x.id !== p.id), directory = db.get(p.id).directoryListing;
    assert.equal(db.get(p.id).verification, 'catalogue_seed'); assert.equal(db.quality().checked, 47); db.close(); db = null;
    writeFileSync(checkedPath, JSON.stringify(batch));
    for (let restart = 0; restart < 2; restart++) {
      db = new CatalogueStore(path, { ...options, checkedPath });
      assert.equal(db.get(p.id).verification, 'programme_page_checked'); assert.deepEqual(db.get(p.id).directoryListing, directory);
      assert.deepEqual(db.all().filter(x => x.id !== p.id), previous); assert.deepEqual(db.quality().sourceRefreshConflicts, []);
      assert.equal(db.quality().total, 873); assert.equal(db.quality().checked, 48); db.close(); db = null;
    }
  } finally { db?.close(); rmSync(path, { force: true }); rmSync(checkedPath, { force: true }); rmdirSync(dir); }
});

const app = createApp({ store, publicDir: new URL('public/', root), routeEvidencePath: routePath, applicantEvidencePath: contextPath, now: () => new Date('2026-10-27T04:00:00Z') });
await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${app.address().port}`, get = async path => (await fetch(base + path)).json();
test.after(async () => { await new Promise(resolve => app.close(resolve)); store.close(); });

test('real API/save/export preserves explicit Singapore-attendance choice and flags legacy catalogue options', async () => {
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
    assert.match(exported.evidence.notesEn, /Entirely overseas remote enrolment/); assert.equal(exported.profile, undefined); assert.equal(exported.match, undefined);
  }
  const meta = await get('/api/meta'); assert.equal(meta.quality.total, 873); assert.equal(meta.quality.browsable, 870); assert.equal(meta.quality.checked, 48);
  assert.equal(meta.quality.peerReviewed, 0); assert.equal(meta.quality.complete, 0); assert.deepEqual(meta.quality.sourceRefreshConflicts, []);
  assert.deepEqual(applicantSummary(contexts), { studyOptions: 18, categories: 38, peerReviewed: 0 }); assert.equal(meta.routeEvidence.routes, 5);
  assert.equal(JSON.stringify(store.all()), before);
});
