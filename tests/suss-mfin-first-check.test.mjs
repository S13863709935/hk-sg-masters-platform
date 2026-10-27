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
const batch = read('data/checked-programmes.json'), obs = read('data/research/suss-mfin-observation-2026-10-27.json');
const p = batch.programmes.find(x => x.id === obs.programmeId);
const options = { seedPath: new URL('data/catalogue.json', root), expansionPath: new URL('data/catalogue-expansion.json', root), checkedPath: new URL('data/checked-programmes.json', root), directoryEvidencePath: new URL('data/directory-links.json', root), scopeAuditPath: new URL('data/programme-scope-audit.json', root) };
const routePath = new URL('data/route-programmes.json', root), contextPath = new URL('data/applicant-contexts.json', root);
const store = new CatalogueStore(':memory:', options), routes = loadRoutes(routePath, store.all()), contexts = loadApplicantContexts(contextPath, store.all(), routes);
const selected = offeringId => resolveProgramme(store.get(p.id), routes, undefined, offeringId, undefined, contexts);
const rule = label => p.rules.find(r => r.labelEn === label);
// Synthetic inputs only; no statistics transcript, equivalence, residence or language-medium evidence is verified.
const profile = { major: 'Finance', degreeStatus: 'graduated', gpa: 2.5, gpaScale: 4, experienceYears: 0, language: { type: 'ielts', total: 7, testDate: '2026-05-01' } };

test('existing English MFIN gains partial direct-entry evidence without merging Chinese FinTech or certificate exits', () => {
  assert.equal(read('data/catalogue-expansion.json').programmes.find(x => x.id === p.id).verification, 'catalogue_seed');
  assert.equal(validateProgramme(p, new Set(['SG-SUSS'])), p); assert.equal(p.award, 'MFIN'); assert.equal(p.admissionRoute, 'direct');
  assert.equal(p.requirementsCoverage, 'partial'); assert.equal(p.reviewer, null); assert.equal(obs.identity.directMasterEntryExplicit, true);
  assert.equal(obs.identity.credits, 60); assert.equal(obs.identity.certificateDiplomaNotRequiredFirst, true);
  assert.equal(batch.programmes.filter(x => x.id === p.id).length, 1); assert.equal(batch.pilotProgrammeIds.includes(p.id), false); assert.equal(batch.pilotProgrammeIds.length, 20);
  assert.equal(store.get('SG-SUSS-P027').verification, 'catalogue_seed'); assert.equal(/\p{Script=Han}/u.test(JSON.stringify(p)), false);
});

test('published finance/related-field examples compare directly while other related qualifications remain unresolved', () => {
  const majorRule = p.rules.find(r => r.kind === 'major'); assert.equal(majorRule.relatedAllowed, true); assert.notEqual(majorRule.any, true);
  for (const major of ['Finance', 'Accountancy', 'Economics', 'Statistics', 'IT', 'Information Technology']) {
    const result = matchProgramme(p, { ...profile, major }); assert.equal(result.checks.find(c => c.kind === 'major').status, 'pass');
    assert.equal(result.status, 'needs_confirmation'); assert.equal(result.tier, null);
  }
  for (const major of ['Computer Science', 'Business Administration', 'History']) {
    const result = matchProgramme(p, { ...profile, major }); assert.equal(result.checks.find(c => c.kind === 'major').status, 'unknown');
    assert.equal(result.status, 'needs_confirmation'); assert.equal(result.checks.some(c => c.status === 'fail'), false);
  }
});

test('major, high GPA or aggregate experience cannot prove statistics coursework or automatic bridge acceptance', () => {
  assert.equal(obs.requirements.statisticsCourse.preparatoryCourseMayBeRequired, true); assert.equal(obs.requirements.statisticsCourse.missingCourseNotAutomaticRejection, true);
  assert.equal(obs.requirements.statisticsCourse.automaticBridgeAcceptance, false);
  for (const changes of [{ major: 'Statistics' }, { gpa: 4 }, { experienceYears: 20 }, { major: 'IT', gpa: 90, gpaScale: 100 }]) {
    const result = matchProgramme(p, { ...profile, ...changes }); assert.equal(result.checks.find(c => /Statistics course or preparatory/.test(c.labelEn)).status, 'unknown');
    assert.equal(result.status, 'needs_confirmation'); assert.equal(result.tier, null);
  }
  assert.match(rule('Statistics course or preparatory assessment').noteEn, /neither automatic rejection nor automatic fulfilment/);
});

test('alternative qualification, volunteer preference and post-study GPA do not impose invented universal work or GPA gates', () => {
  assert.equal(obs.requirements.otherQualificationsWithRelevantExperienceMayBeConsidered, true); assert.equal(obs.requirements.minimumWorkYears, null);
  assert.equal(p.rules.some(r => ['gpa', 'classification', 'experience'].includes(r.kind)), false);
  assert.equal(obs.requirements.graduateAwardCgpa, 3); assert.equal(obs.requirements.numericEntryGpa, null);
  assert.equal(rule('Volunteer preference and no GMAT/GRE requirement').mandatory, false); assert.equal(obs.requirements.gmatGreRequired, false);
  for (const changes of [{ degreeStatus: 'other', experienceYears: 0 }, { degreeStatus: 'other', experienceYears: 20 }, { degreeStatus: 'final_year', gpa: 1 }]) {
    const result = matchProgramme(p, { ...profile, ...changes }); assert.equal(result.status, 'needs_confirmation'); assert.equal(result.tier, null);
    assert.equal(result.checks.find(c => /Qualification recognition/.test(c.labelEn)).status, 'unknown'); assert.equal(result.checks.some(c => c.status === 'fail'), false);
  }
});

test('conditional English evidence cannot create a universal score rejection, automatic waiver or new TOEFL conversion', () => {
  assert.equal(obs.requirements.english.ieltsAcademic, 6.5); assert.equal(obs.requirements.english.internetToeflUnversioned, 85);
  assert.equal(p.rules.some(r => r.kind === 'language'), false); assert.equal(p.fieldStatus.language.status, 'unknown');
  for (const language of [{ type: 'ielts', total: 5 }, { type: 'ielts', total: 9 }, { type: 'waiver' }, { type: 'toefl_120', total: 100 }, { type: 'toefl_6', total: 6 }]) {
    const result = matchProgramme(p, { ...profile, language }); assert.equal(result.status, 'needs_confirmation'); assert.equal(result.tier, null);
    assert.equal(result.checks.find(c => /English applicability/.test(c.labelEn)).status, 'unknown'); assert.equal(result.checks.some(c => c.status === 'fail'), false);
  }
  assert.equal(obs.requirements.english.ieltsUniversalExpiryMonths, null);
});

test('professional charter and dual-award thesis, credits, interview and CHF fees do not alter ordinary master admission', () => {
  assert.equal(rule('Award and professional qualification are separate').mandatory, false); assert.equal(obs.professionalQualification.fullCharterAutomatic, false);
  assert.equal(obs.professionalQualification.postStudyExamExperienceNotAdmissionGate, true);
  assert.equal(obs.dualComparison.sussCredits, 45); assert.equal(obs.dualComparison.fhnwRequiredEcts, 48); assert.equal(obs.dualComparison.partnerThesisEcts, 18);
  assert.equal(obs.dualComparison.partnerTuitionQuoted, 15000); assert.notEqual(obs.dualComparison.partnerTuitionQuoted, read('data/research/suss-mdmk-observation-2026-10-27.json').dualComparison.partnerTuitionQuoted);
  assert.equal(rule('Standalone and dual-award boundaries').mandatory, false); assert.equal(obs.dualComparison.notNewSelectableOffering, true);
  assert.equal(obs.requirements.standaloneCvRequirementNotSeparatelyEstablished, true); assert.equal(JSON.stringify(p.offerings).includes('15000'), false);
  assert.equal(p.offerings.length, 2); assert.ok(p.offerings.every(o => o.mode === null)); assert.equal(routes.has(p.id), false);
});

test('Finance subsidy row differs from Digital Marketing and neither category quote nor credited deposit becomes a default charge', () => {
  assert.deepEqual(obs.fees.masterTuition, { scPr: 31680, otherResidents: 38016, conditionalSubsidisedAsLowAs: 18612 });
  assert.notEqual(obs.fees.masterTuition.conditionalSubsidisedAsLowAs, read('data/research/suss-mdmk-observation-2026-10-27.json').fees.masterTuition.conditionalSubsidisedAsLowAs);
  assert.equal(obs.fees.excludesGst, true); assert.equal(obs.fees.acceptanceDeposit.notAdditionalTuition, true);
  assert.equal([...contexts.values()].some(c => c.programmeId === p.id), false);
  for (const o of p.offerings) { assert.equal(o.tuition, null); assert.equal(o.applicationFee, null); assert.match(o.feeBasis, /rather than adding another tuition charge/); }
  assert.equal(obs.preservation.pdfVisualVerificationNotClaimed, true);
});

test('January/July recurrence and the October masterclass do not manufacture a dated application window', () => {
  assert.deepEqual(obs.cycle.recurringProgrammeIntakeMonths, ['January', 'July']); assert.equal(obs.cycle.masterclassEventDate, '2026-10-28');
  assert.equal(obs.cycle.eventIsNotAdmissionWindow, true); assert.equal(obs.cycle.earlierProgrammeClosingCaveat, true);
  for (const o of p.offerings) {
    assert.match(o.intake, /January \/ July/); assert.equal(o.academicYear, null); assert.equal(o.applicationOpen, null); assert.equal(o.deadline, null);
    for (const day of ['2026-10-27', '2026-10-28', '2027-01-01', '2027-04-15']) {
      const timeline = programmeTimeline(selected(o.id), day); assert.equal(timeline.state, 'dates_incomplete'); assert.equal(timeline.livePortalChecked, false);
    }
  }
});

test('prior MDMK archives remain immutable and Finance adds no actionable cutoff or independent-review record', () => {
  const expected = {
    'source-review-queue-2026-10-27-suss-mdmk.md': '32d802868b275ef20406d9ba87d6a3f72c1d3c6337d49b97976f821e7698888a',
    'core-pilot-acceptance-2026-10-27-suss-mdmk.md': 'd247c320e51acd83c116c427534c719e42ef4ef811f7b429c30f8d8e471ddab7'
  };
  for (const [file, hash] of Object.entries(expected)) assert.equal(createHash('sha256').update(readFileSync(new URL('docs/research/' + file, root), 'utf8').replaceAll('\r\n', '\n')).digest('hex'), hash);
  const queue = loadRepositoryReviewQueue('2026-10-27'); assert.equal(queue.counts.programmePageRecords, 36); assert.equal(queue.counts.reviewUnits, 59);
  assert.equal(queue.counts.reviewRecordedInSource, 0); assert.equal(queue.units.find(u => u.programmeId === p.id).upcomingRecordedCutoffs.length, 0);
});

test('first MFIN source migration preserves every other record and old directory evidence across isolated restarts', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gradpath-suss-mfin-')), path = join(dir, 'test.sqlite'), checkedPath = join(dir, 'checked.json'); let db;
  try {
    writeFileSync(checkedPath, JSON.stringify({ ...batch, programmes: batch.programmes.filter(x => x.id !== p.id) }));
    db = new CatalogueStore(path, { ...options, checkedPath }); const previous = db.all().filter(x => x.id !== p.id), directory = db.get(p.id).directoryListing;
    assert.equal(db.get(p.id).verification, 'catalogue_seed'); assert.equal(db.quality().checked, 35); db.close(); db = null;
    writeFileSync(checkedPath, JSON.stringify(batch));
    for (let restart = 0; restart < 2; restart++) {
      db = new CatalogueStore(path, { ...options, checkedPath }); assert.equal(db.get(p.id).verification, 'programme_page_checked');
      assert.deepEqual(db.get(p.id).directoryListing, directory); assert.deepEqual(db.all().filter(x => x.id !== p.id), previous);
      assert.deepEqual(db.quality().sourceRefreshConflicts, []); assert.equal(db.quality().total, 873); assert.equal(db.quality().checked, 36); db.close(); db = null;
    }
  } finally { db?.close(); rmSync(path, { force: true }); rmSync(checkedPath, { force: true }); rmdirSync(dir); }
});

const app = createApp({ store, publicDir: new URL('public/', root), routeEvidencePath: routePath, applicantEvidencePath: contextPath, now: () => new Date('2026-10-27T04:00:00Z') });
await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${app.address().port}`, get = async path => (await fetch(base + path)).json();
test.after(async () => { await new Promise(resolve => app.close(resolve)); store.close(); });

test('real API/save/export retains statistics uncertainty and ordinary Finance pathway while flagging retired catalogue choices', async () => {
  const before = JSON.stringify(store.all());
  for (const o of p.offerings) {
    const detail = await get('/api/programmes/' + p.id + '?offering=' + o.id); assert.equal(detail.applicationTimeline.state, 'dates_incomplete');
    const response = await fetch(base + '/api/matches', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ profile, offerings: { [p.id]: o.id } }) });
    assert.equal(response.status, 200); const match = (await response.json()).items.find(x => x.id === p.id).match;
    assert.equal(match.status, 'needs_confirmation'); assert.equal(match.checks.find(c => /Statistics course or preparatory/.test(c.labelEn)).status, 'unknown');
    const saved = optionSnapshot(detail, '2026-10-27T04:00:00.000Z'); assert.equal(parseSavedOption(saved).offeringId, o.id);
    const restored = await fetch(base + '/api/saved-options/resolve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contexts: [saved, { programmeId: p.id, offeringId: p.id + '-catalogue' }] }) });
    assert.equal(restored.status, 200); const items = (await restored.json()).items; assert.deepEqual(items.map(x => x.status), ['resolved', 'needs_attention']);
    const exported = shortlistExport([items[0].programme], { [p.id]: saved }).programmes[0]; assert.equal(exported.offerings[0].id, o.id);
    assert.equal(exported.offerings[0].tuition, null); assert.equal(exported.offerings[0].deadline, null); assert.equal(exported.offerings[0].mode, null);
    assert.match(exported.evidence.notesEn, /preparatory statistics course/); assert.equal(exported.profile, undefined); assert.equal(exported.match, undefined);
  }
  const meta = await get('/api/meta'); assert.equal(meta.quality.total, 873); assert.equal(meta.quality.browsable, 870); assert.equal(meta.quality.checked, 36);
  assert.equal(meta.quality.peerReviewed, 0); assert.equal(meta.quality.complete, 0); assert.deepEqual(meta.quality.sourceRefreshConflicts, []);
  assert.deepEqual(applicantSummary(contexts), { studyOptions: 18, categories: 38, peerReviewed: 0 }); assert.equal(meta.routeEvidence.routes, 5); assert.equal(JSON.stringify(store.all()), before);
});
