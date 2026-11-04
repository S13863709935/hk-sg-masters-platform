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
const batch = read('data/checked-programmes.json'), obs = read('data/research/suss-mesg-observation-2026-10-27.json');
const p = batch.programmes.find(x => x.id === obs.programmeId);
const options = { seedPath: new URL('data/catalogue.json', root), expansionPath: new URL('data/catalogue-expansion.json', root), checkedPath: new URL('data/checked-programmes.json', root), directoryEvidencePath: new URL('data/directory-links.json', root), scopeAuditPath: new URL('data/programme-scope-audit.json', root) };
const routePath = new URL('data/route-programmes.json', root), contextPath = new URL('data/applicant-contexts.json', root);
const store = new CatalogueStore(':memory:', options), routes = loadRoutes(routePath, store.all()), contexts = loadApplicantContexts(contextPath, store.all(), routes);
const selected = offeringId => resolveProgramme(store.get(p.id), routes, undefined, offeringId, undefined, contexts);
const rule = label => p.rules.find(r => r.labelEn === label);
// Synthetic inputs only; degree recognition, residence, Student Pass and ELPR applicability are not verified.
const profile = { major: 'Environmental Science', degreeStatus: 'graduated', gpa: 2.5, gpaScale: 4, experienceYears: 0, language: { type: 'ielts', total: 7, testDate: '2026-05-01' } };

test('existing MESG lead gains one partial master record without copying Finance fields or numeric GPA standards', () => {
  assert.equal(read('data/catalogue-expansion.json').programmes.find(x => x.id === p.id).verification, 'catalogue_seed');
  assert.equal(validateProgramme(p, new Set(['SG-SUSS'])), p); assert.equal(p.award, 'MESG'); assert.equal(p.admissionRoute, 'direct');
  assert.equal(p.requirementsCoverage, 'partial'); assert.equal(p.reviewer, null); assert.equal(obs.identity.credits, 60);
  assert.equal(batch.programmes.filter(x => x.id === p.id).length, 1); assert.equal(batch.pilotProgrammeIds.includes(p.id), false); assert.equal(batch.pilotProgrammeIds.length, 20);
  assert.equal(p.rules.some(r => ['major', 'gpa', 'classification', 'experience'].includes(r.kind)), false);
  assert.equal(obs.requirements.graduateAwardCgpaNotEstablishedInConsultedMesgText, true); assert.equal(obs.identity.certificateDiplomaNotRequiredFirst, true);
  assert.equal(/\p{Script=Han}/u.test(JSON.stringify(p)), false);
});

test('encouraged CV and fresh-graduate audience do not become mandatory CV, work years or automatic qualification acceptance', () => {
  assert.equal(obs.requirements.cvEncouraged, true); assert.equal(rule('CV submission is encouraged').mandatory, false);
  assert.equal(obs.requirements.freshGraduatesInIntendedAudience, true); assert.equal(obs.requirements.minimumWorkYears, null);
  for (const changes of [{ experienceYears: 0 }, { experienceYears: 20 }, { degreeStatus: 'final_year' }, { degreeStatus: 'other' }]) {
    const result = matchProgramme(p, { ...profile, ...changes }); assert.equal(result.status, 'needs_confirmation'); assert.equal(result.tier, null);
    assert.equal(result.checks.find(c => /Qualification recognition/.test(c.labelEn)).status, 'unknown'); assert.equal(result.checks.some(c => c.status === 'fail'), false);
  }
  assert.match(rule('CV submission is encouraged').noteEn, /does not remove any separate document requirement/);
});

test('one of two graduation capstones remains required without demanding both or using prior internship as an entry gate', () => {
  assert.equal(obs.requirements.capstone.requiredNumber, 1); assert.equal(obs.requirements.capstone.bothRequired, false);
  assert.equal(obs.requirements.capstone.neitherRequired, false); assert.equal(obs.requirements.capstone.credits, 10);
  assert.deepEqual(obs.requirements.capstone.choices, ['MGT598 Management Internship', 'MGT599 Management Consulting Project']);
  const capstone = rule('One graduation capstone, not two prior experiences'); assert.equal(capstone.mandatory, false);
  assert.match(capstone.noteEn, /Complete one of the two/); assert.match(capstone.noteEn, /not proof of pre-entry work or internship/);
  const result = matchProgramme(p, profile); assert.equal(result.status, 'needs_confirmation'); assert.equal(result.checks.some(c => c.status === 'fail'), false);
});

test('international accelerated enrolment does not require Singapore employment or imply approved residence/pass status', () => {
  assert.deepEqual(p.offerings.map(o => o.id), [p.id + '-REGULAR', p.id + '-ACCELERATED']); assert.equal(routes.has(p.id), false);
  assert.equal(obs.pathways.accelerated.singaporeEmploymentRequired, false); assert.equal(obs.pathways.accelerated.validStudentPassRequired, true);
  assert.equal(obs.pathways.regular.nominalYears, 2); assert.equal(obs.pathways.regular.maximumYearsFromFaq, 4);
  assert.equal(obs.pathways.accelerated.separateMaximumYears, null); assert.equal(obs.pathways.faceToFaceTeaching, true);
  assert.equal(obs.pathways.remoteEnrolmentNotEstablished, true); assert.ok(p.offerings.every(o => o.mode === null));
  for (const o of p.offerings) {
    const result = matchProgramme(selected(o.id), profile); assert.equal(result.status, 'needs_confirmation'); assert.equal(result.tier, null);
    assert.equal(result.checks.find(c => /Pathway, residence/.test(c.labelEn)).status, 'unknown');
  }
});

test('conditional English alternatives do not create automatic waiver, score rejection, universal expiry or TOEFL conversion', () => {
  assert.equal(obs.requirements.english.ieltsAcademic, 6.5); assert.equal(obs.requirements.english.internetToeflUnversioned, 85);
  assert.equal(p.rules.some(r => r.kind === 'language'), false); assert.equal(p.fieldStatus.language.status, 'unknown');
  for (const language of [{ type: 'ielts', total: 5 }, { type: 'ielts', total: 9 }, { type: 'waiver' }, { type: 'toefl_120', total: 100 }, { type: 'toefl_6', total: 6 }]) {
    const result = matchProgramme(p, { ...profile, language }); assert.equal(result.status, 'needs_confirmation'); assert.equal(result.tier, null);
    assert.equal(result.checks.find(c => /English applicability/.test(c.labelEn)).status, 'unknown'); assert.equal(result.checks.some(c => c.status === 'fail'), false);
  }
  assert.equal(obs.requirements.english.ieltsUniversalExpiryMonths, null);
});

test('Sustainability subsidy row differs from Finance and no fee category, discount or duplicated deposit is selected by default', () => {
  assert.deepEqual(obs.fees.masterTuition, { scPr: 31680, otherResidents: 38016, conditionalSubsidisedAsLowAs: 19800 });
  assert.notEqual(obs.fees.masterTuition.conditionalSubsidisedAsLowAs, read('data/research/suss-mfin-observation-2026-10-27.json').fees.masterTuition.conditionalSubsidisedAsLowAs);
  assert.equal(obs.fees.excludesGst, true); assert.equal(obs.fees.acceptanceDeposit.notAdditionalTuition, true);
  assert.equal([...contexts.values()].some(c => c.programmeId === p.id), false);
  for (const o of p.offerings) { assert.equal(o.tuition, null); assert.equal(o.applicationFee, null); assert.match(o.feeBasis, /not an extra tuition charge/); }
  assert.equal(obs.preservation.pdfVisualVerificationNotClaimed, true);
});

test('recurring January/July months do not establish exact cohort dates or live application availability', () => {
  assert.deepEqual(obs.cycle.recurringProgrammeIntakeMonths, ['January', 'July']); assert.equal(obs.cycle.earlierProgrammeClosingCaveat, true);
  for (const o of p.offerings) {
    assert.match(o.intake, /January \/ July/); assert.equal(o.academicYear, null); assert.equal(o.applicationOpen, null); assert.equal(o.deadline, null);
    for (const day of ['2026-10-27', '2027-01-01', '2027-04-15', '2027-07-01']) {
      const timeline = programmeTimeline(selected(o.id), day); assert.equal(timeline.state, 'dates_incomplete'); assert.equal(timeline.livePortalChecked, false);
    }
  }
});

test('Finance archives remain immutable and the added programme creates no actionable cutoff or human-review record', () => {
  const expected = {
    'source-review-queue-2026-10-27-suss-mfin.md': '4f84e60c63db708b7ba6908acbbef8d53425031548ce1dc45a395b1da95ac544',
    'core-pilot-acceptance-2026-10-27-suss-mfin.md': '162e0b3f3b236b36f17bdac7d69a068920cdb51d0b25a754a562f5e46e117965'
  };
  for (const [file, hash] of Object.entries(expected)) assert.equal(createHash('sha256').update(readFileSync(new URL('docs/research/' + file, root), 'utf8').replaceAll('\r\n', '\n')).digest('hex'), hash);
  const queue = loadRepositoryReviewQueue('2026-10-27'); assert.equal(queue.counts.programmePageRecords, 392); assert.equal(queue.counts.reviewUnits, 716);
  assert.equal(queue.counts.reviewRecordedInSource, 0); assert.equal(queue.units.find(u => u.programmeId === p.id).upcomingRecordedCutoffs.length, 0);
});

test('first MESG source migration preserves all earlier records and directory context across isolated restarts', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gradpath-suss-mesg-')), path = join(dir, 'test.sqlite'), checkedPath = join(dir, 'checked.json'); let db;
  try {
    writeFileSync(checkedPath, JSON.stringify({ ...batch, programmes: batch.programmes.filter(x => x.id !== p.id) }));
    db = new CatalogueStore(path, { ...options, checkedPath }); const previous = db.all().filter(x => x.id !== p.id), directory = db.get(p.id).directoryListing;
    assert.equal(db.get(p.id).verification, 'catalogue_seed'); assert.equal(db.quality().checked, batch.programmes.length - 1); db.close(); db = null;
    writeFileSync(checkedPath, JSON.stringify(batch));
    for (let restart = 0; restart < 2; restart++) {
      db = new CatalogueStore(path, { ...options, checkedPath }); assert.equal(db.get(p.id).verification, 'programme_page_checked');
      assert.deepEqual(db.get(p.id).directoryListing, directory); assert.deepEqual(db.all().filter(x => x.id !== p.id), previous);
      assert.deepEqual(db.quality().sourceRefreshConflicts, []); assert.equal(db.quality().total, 873); assert.equal(db.quality().checked, 392); db.close(); db = null;
    }
  } finally { db?.close(); rmSync(path, { force: true }); rmSync(checkedPath, { force: true }); rmdirSync(dir); }
});

const app = createApp({ store, publicDir: new URL('public/', root), routeEvidencePath: routePath, applicantEvidencePath: contextPath, now: () => new Date('2026-10-27T04:00:00Z') });
await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${app.address().port}`, get = async path => (await fetch(base + path)).json();
test.after(async () => { await new Promise(resolve => app.close(resolve)); store.close(); });

test('real API/save/export keeps encouraged CV and capstone alternatives while legacy catalogue choices require attention', async () => {
  const before = JSON.stringify(store.all());
  for (const o of p.offerings) {
    const detail = await get('/api/programmes/' + p.id + '?offering=' + o.id); assert.equal(detail.applicationTimeline.state, 'dates_incomplete');
    const response = await fetch(base + '/api/matches', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ profile, offerings: { [p.id]: o.id } }) });
    assert.equal(response.status, 200); assert.equal((await response.json()).items.find(x => x.id === p.id).match.status, 'needs_confirmation');
    const saved = optionSnapshot(detail, '2026-10-27T04:00:00.000Z'); assert.equal(parseSavedOption(saved).offeringId, o.id);
    const restored = await fetch(base + '/api/saved-options/resolve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contexts: [saved, { programmeId: p.id, offeringId: p.id + '-catalogue' }] }) });
    assert.equal(restored.status, 200); const items = (await restored.json()).items; assert.deepEqual(items.map(x => x.status), ['resolved', 'needs_attention']);
    const exported = shortlistExport([items[0].programme], { [p.id]: saved }).programmes[0]; assert.equal(exported.offerings[0].id, o.id);
    assert.equal(exported.offerings[0].tuition, null); assert.equal(exported.offerings[0].deadline, null); assert.equal(exported.offerings[0].mode, null);
    const published = exported.evidence.publishedRequirements;
    assert.equal(published.find(r => /CV submission/.test(r.labelEn)).mandatory, false); assert.match(published.find(r => /One graduation capstone/.test(r.labelEn)).noteEn, /Complete one of the two/);
    assert.equal(exported.profile, undefined); assert.equal(exported.match, undefined);
  }
  const meta = await get('/api/meta'); assert.equal(meta.quality.total, 873); assert.equal(meta.quality.browsable, 865); assert.equal(meta.quality.checked, 392);
  assert.equal(meta.quality.peerReviewed, 0); assert.equal(meta.quality.complete, 0); assert.deepEqual(meta.quality.sourceRefreshConflicts, []);
  assert.deepEqual(applicantSummary(contexts), { studyOptions: 271, categories: 546, peerReviewed: 0 }); assert.equal(meta.routeEvidence.routes, 53); assert.equal(JSON.stringify(store.all()), before);
});
