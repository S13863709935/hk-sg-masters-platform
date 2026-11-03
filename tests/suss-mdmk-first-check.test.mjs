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
const batch = read('data/checked-programmes.json'), obs = read('data/research/suss-mdmk-observation-2026-10-27.json');
const p = batch.programmes.find(x => x.id === obs.programmeId);
const options = { seedPath: new URL('data/catalogue.json', root), expansionPath: new URL('data/catalogue-expansion.json', root), checkedPath: new URL('data/checked-programmes.json', root), directoryEvidencePath: new URL('data/directory-links.json', root), scopeAuditPath: new URL('data/programme-scope-audit.json', root) };
const routePath = new URL('data/route-programmes.json', root), contextPath = new URL('data/applicant-contexts.json', root);
const store = new CatalogueStore(':memory:', options), routes = loadRoutes(routePath, store.all()), contexts = loadApplicantContexts(contextPath, store.all(), routes);
const selected = offeringId => resolveProgramme(store.get(p.id), routes, undefined, offeringId, undefined, contexts);
const rule = label => p.rules.find(r => r.labelEn === label);
// Synthetic inputs only, without verified qualification equivalence, residence, English medium or work relevance.
const profile = { major: 'History', degreeStatus: 'graduated', gpa: 2.5, gpaScale: 4, experienceYears: 0, language: { type: 'ielts', total: 7, testDate: '2026-05-01' } };

test('existing standalone MDMK gains one partial record without duplicating clusters, exits or alternative awards', () => {
  assert.equal(read('data/catalogue-expansion.json').programmes.find(x => x.id === p.id).verification, 'catalogue_seed');
  assert.equal(validateProgramme(p, new Set(['SG-SUSS'])), p); assert.equal(p.award, 'MDMK');
  assert.equal(p.admissionRoute, 'direct'); assert.equal(p.requirementsCoverage, 'partial'); assert.equal(p.reviewer, null);
  assert.equal(batch.programmes.filter(x => x.id === p.id).length, 1); assert.equal(batch.pilotProgrammeIds.includes(p.id), false); assert.equal(batch.pilotProgrammeIds.length, 20);
  assert.equal(obs.identity.clusters.length, 3); assert.equal(obs.identity.credits, 60); assert.equal(obs.identity.notFhnwDualAward, true);
  assert.equal(obs.requirements.graduateAwardCgpa, 3); assert.equal(obs.requirements.numericEntryGpa, null);
  assert.equal(obs.requirements.priorInternshipMandatory, false); assert.equal(obs.requirements.industryCertificationIsNotAdmissionCredential, true);
  assert.equal(p.rules.some(r => ['gpa', 'classification', 'major', 'experience'].includes(r.kind)), false);
  assert.equal(/\p{Script=Han}/u.test(JSON.stringify(p)), false);
});

test('pathways do not inherit MAVI minimum, remote entitlement, extension or an FT/PT label from evening teaching', () => {
  assert.deepEqual(p.offerings.map(o => o.id), [p.id + '-REGULAR', p.id + '-ACCELERATED']); assert.equal(routes.has(p.id), false);
  assert.ok(p.offerings.every(o => o.mode === null)); assert.equal(obs.pathways.regular.minimumYears, null);
  assert.equal(obs.pathways.regular.maximumCuPerSemester, 20); assert.equal(obs.pathways.accelerated.years, 1);
  assert.equal(obs.pathways.accelerated.extensionNotEstablished, true); assert.equal(obs.pathways.maviRemoteRulesNotInherited, true);
  for (const o of p.offerings) {
    const result = matchProgramme(selected(o.id), profile); assert.equal(result.status, 'needs_confirmation'); assert.equal(result.tier, null);
    assert.equal(result.checks.find(c => /Pathway and residence/.test(c.labelEn)).status, 'unknown');
  }
});

test('other qualifications with relevant experience remain discretionary while volunteer preference cannot reject ordinary applicants', () => {
  assert.equal(obs.requirements.otherQualificationsWithRelevantExperienceMayBeConsidered, true);
  assert.equal(obs.requirements.otherQualificationAcceptanceAutomatic, false); assert.equal(obs.requirements.minimumWorkYears, null);
  assert.equal(rule('Volunteer experience is a preference').mandatory, false); assert.equal(obs.requirements.cvRequired, true);
  assert.match(rule('CV and individual admission assessment').noteEn, /does not collect or submit/);
  for (const changes of [{ degreeStatus: 'other', experienceYears: 0 }, { degreeStatus: 'other', experienceYears: 20 }, { degreeStatus: 'final_year', gpa: 1 }]) {
    const result = matchProgramme(p, { ...profile, ...changes }); assert.equal(result.status, 'needs_confirmation'); assert.equal(result.tier, null);
    assert.equal(result.checks.find(c => /Qualification recognition/.test(c.labelEn)).status, 'unknown'); assert.equal(result.checks.some(c => c.status === 'fail'), false);
  }
});

test('conditional English evidence never becomes a universal score gate, automatic waiver or imported dual-award validity rule', () => {
  assert.equal(obs.requirements.english.ieltsAcademic, 6.5); assert.equal(obs.requirements.english.internetToeflUnversioned, 85);
  assert.equal(p.rules.some(r => r.kind === 'language'), false); assert.equal(p.fieldStatus.language.status, 'unknown');
  for (const language of [{ type: 'ielts', total: 5 }, { type: 'ielts', total: 9 }, { type: 'waiver' }, { type: 'toefl_120', total: 100 }, { type: 'toefl_6', total: 6 }]) {
    const result = matchProgramme(p, { ...profile, language }); assert.equal(result.status, 'needs_confirmation'); assert.equal(result.tier, null);
    assert.equal(result.checks.find(c => /English applicability/.test(c.labelEn)).status, 'unknown'); assert.equal(result.checks.some(c => c.status === 'fail'), false);
  }
  assert.equal(obs.requirements.english.ieltsUniversalExpiryMonths, null); assert.equal(obs.dualComparison.universalTwoYearEnglishWindowNotImported, true);
});

test('FHNW dual-award credits, work/field conditions, two interviews, paper TOEFL and CHF charges remain comparison context only', () => {
  assert.equal(obs.dualComparison.sussCredits, 40); assert.equal(obs.dualComparison.fhnwEcts, 30); assert.equal(obs.dualComparison.standaloneCreditsRemain, 60);
  assert.equal(obs.dualComparison.twoInterviewRounds, 2); assert.equal(obs.requirements.interviewAtUniversityDiscretion, true);
  assert.equal(obs.dualComparison.paperToefl580NotImported, true); assert.equal(obs.dualComparison.notNewSelectableOffering, true);
  assert.equal(rule('Standalone and dual-award boundaries').mandatory, false);
  assert.ok(p.offerings.every(o => o.currency === 'SGD')); assert.equal(JSON.stringify(p.offerings).includes('7500'), false);
  assert.equal(obs.dualComparison.partnerCurrency, 'CHF'); assert.equal(obs.dualComparison.partnerTuitionQuoted, 7500);
});

test('dated fee categories and conditional subsidies do not create a personal tuition default or double-count a credited deposit', () => {
  assert.deepEqual(obs.fees.masterTuition, { scPr: 31680, otherResidents: 38016, conditionalSubsidisedAsLowAs: 17424 });
  assert.equal(obs.fees.excludesGst, true); assert.equal(obs.fees.acceptanceDeposit.notAdditionalTuition, true);
  assert.equal([...contexts.values()].some(c => c.programmeId === p.id), false);
  for (const o of p.offerings) { assert.equal(o.tuition, null); assert.equal(o.applicationFee, null); assert.match(o.feeBasis, /not an extra tuition charge/); }
  assert.equal(obs.preservation.pdfVisualVerificationNotClaimed, true); assert.equal(obs.preservation.noNewPdfDownloadClaimed, true);
});

test('general university calendars cannot establish an ordinary MDMK pathway year, dates or live availability', () => {
  assert.deepEqual(obs.cycle.generalCalendarOnly.map(x => x.submitBy), ['2026-10-15', '2027-04-15']); assert.equal(obs.cycle.earlierProgrammeClosingCaveat, true);
  for (const o of p.offerings) {
    assert.equal(o.intake, null); assert.equal(o.academicYear, null); assert.equal(o.applicationOpen, null); assert.equal(o.deadline, null);
    for (const day of ['2026-10-27', '2027-01-01', '2027-04-15', '2027-07-01']) {
      const timeline = programmeTimeline(selected(o.id), day); assert.equal(timeline.state, 'dates_incomplete'); assert.equal(timeline.livePortalChecked, false);
    }
  }
});

test('MAVI archives are immutable and the new maintenance unit creates no actionable cutoff or independent approval', () => {
  const expected = {
    'source-review-queue-2026-10-27-suss-mavi.md': '6921b9c5ee147d03a6653c287a55381b8cfb0c5dd824c551b64bb91f08f25014',
    'core-pilot-acceptance-2026-10-27-suss-mavi.md': 'bebefa82526e9e42adf86c8c3a9bcd7dba9b1603e3cd06b78f2018466225f11e'
  };
  for (const [file, hash] of Object.entries(expected)) assert.equal(createHash('sha256').update(readFileSync(new URL('docs/research/' + file, root), 'utf8').replaceAll('\r\n', '\n')).digest('hex'), hash);
  const queue = loadRepositoryReviewQueue('2026-10-27'); assert.equal(queue.counts.programmePageRecords, 330); assert.equal(queue.counts.reviewUnits, 595);
  assert.equal(queue.counts.reviewRecordedInSource, 0); assert.equal(queue.units.find(u => u.programmeId === p.id).upcomingRecordedCutoffs.length, 0);
});

test('first MDMK source migration preserves all other records and directory context across isolated restarts', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gradpath-suss-mdmk-')), path = join(dir, 'test.sqlite'), checkedPath = join(dir, 'checked.json'); let db;
  try {
    writeFileSync(checkedPath, JSON.stringify({ ...batch, programmes: batch.programmes.filter(x => x.id !== p.id) }));
    db = new CatalogueStore(path, { ...options, checkedPath }); const previous = db.all().filter(x => x.id !== p.id), directory = db.get(p.id).directoryListing;
    assert.equal(db.get(p.id).verification, 'catalogue_seed'); assert.equal(db.quality().checked, batch.programmes.length - 1); db.close(); db = null;
    writeFileSync(checkedPath, JSON.stringify(batch));
    for (let restart = 0; restart < 2; restart++) {
      db = new CatalogueStore(path, { ...options, checkedPath }); assert.equal(db.get(p.id).verification, 'programme_page_checked');
      assert.deepEqual(db.get(p.id).directoryListing, directory); assert.deepEqual(db.all().filter(x => x.id !== p.id), previous);
      assert.deepEqual(db.quality().sourceRefreshConflicts, []); assert.equal(db.quality().total, 873); assert.equal(db.quality().checked, 330); db.close(); db = null;
    }
  } finally { db?.close(); rmSync(path, { force: true }); rmSync(checkedPath, { force: true }); rmdirSync(dir); }
});

const app = createApp({ store, publicDir: new URL('public/', root), routeEvidencePath: routePath, applicantEvidencePath: contextPath, now: () => new Date('2026-10-27T04:00:00Z') });
await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${app.address().port}`, get = async path => (await fetch(base + path)).json();
test.after(async () => { await new Promise(resolve => app.close(resolve)); store.close(); });

test('actual API, saving and export keep standalone pathway boundaries and flag retired catalogue choices', async () => {
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
    assert.match(exported.evidence.notesEn, /separate from the FHNW dual award/); assert.equal(exported.profile, undefined); assert.equal(exported.match, undefined);
  }
  const meta = await get('/api/meta'); assert.equal(meta.quality.total, 873); assert.equal(meta.quality.browsable, 865); assert.equal(meta.quality.checked, 330);
  assert.equal(meta.quality.peerReviewed, 0); assert.equal(meta.quality.complete, 0); assert.deepEqual(meta.quality.sourceRefreshConflicts, []);
  assert.deepEqual(applicantSummary(contexts), { studyOptions: 224, categories: 449, peerReviewed: 0 }); assert.equal(meta.routeEvidence.routes, 41); assert.equal(JSON.stringify(store.all()), before);
});
