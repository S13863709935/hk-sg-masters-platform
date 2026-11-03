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
const batch = read('data/checked-programmes.json'), obs = read('data/research/suss-mipim-ipb-observation-2026-10-27.json');
const p = batch.programmes.find(x => x.id === obs.programmeId), o = p.offerings[0];
const options = { seedPath: new URL('data/catalogue.json', root), expansionPath: new URL('data/catalogue-expansion.json', root), checkedPath: new URL('data/checked-programmes.json', root), directoryEvidencePath: new URL('data/directory-links.json', root), scopeAuditPath: new URL('data/programme-scope-audit.json', root) };
const routePath = new URL('data/route-programmes.json', root), contextPath = new URL('data/applicant-contexts.json', root);
const store = new CatalogueStore(':memory:', options), routes = loadRoutes(routePath, store.all()), contexts = loadApplicantContexts(contextPath, store.all(), routes);
const selected = () => resolveProgramme(store.get(p.id), routes, undefined, o.id, undefined, contexts);
const rule = label => p.rules.find(r => r.labelEn === label);
// Synthetic inputs only; no qualification, WIPO course result, partner application, funding or residence is verified.
const profile = { major: 'Law', degreeStatus: 'graduated', gpa: 2.5, gpaScale: 4, experienceYears: 0, language: { type: 'ielts', total: 7, testDate: '2026-05-01' } };

test('existing IP Business identity stays one partial coursework record without becoming MBA, broader tracks or Chinese degree', () => {
  assert.equal(read('data/catalogue-expansion.json').programmes.find(x => x.id === p.id).verification, 'catalogue_seed');
  assert.equal(validateProgramme(p, new Set(['SG-SUSS'])), p); assert.equal(p.award, 'MIPIM (IP Business)'); assert.equal(p.admissionRoute, 'direct');
  assert.equal(p.requirementsCoverage, 'partial'); assert.equal(p.reviewer, null); assert.equal(obs.identity.totalCu, 60);
  assert.equal(p.offerings.length, 1); assert.equal(o.id, p.id + '-IP-BUSINESS'); assert.equal(o.mode, null); assert.equal(routes.has(p.id), false);
  const chinese = store.get('SG-SUSS-P028'); assert.equal(chinese.verification, 'programme_page_checked');
  assert.notEqual(chinese.id, p.id); assert.notEqual(chinese.officialUrl, p.officialUrl); assert.equal(chinese.award, 'MSc');
  assert.equal(chinese.rules.some(r => r.labelEn === 'Programme-specific Chinese proficiency and HSK evidence'), true);
  assert.equal(chinese.rules.some(r => r.kind === 'major'), false); assert.deepEqual(store.get(p.id).rules, p.rules); assert.equal(batch.pilotProgrammeIds.includes(p.id), false); assert.equal(batch.pilotProgrammeIds.length, 20);
  assert.equal(p.rules.some(r => ['major', 'gpa', 'classification', 'experience'].includes(r.kind)), false); assert.equal(/\p{Script=Han}/u.test(JSON.stringify(p)), false);
});

test('both applications remain required while unread partner extracts cannot establish completion, deadlines or a weaker source validator', () => {
  assert.equal(obs.cycle.bothApplicationSystemsRequired, true); assert.equal(rule('Applications to both SUSS and WIPO').mandatory, true);
  assert.equal(obs.partnerLead.pageReadSucceeded, false); assert.equal(obs.partnerLead.evidenceLevel, 'search_extract_only');
  assert.equal(obs.partnerLead.notImportedIntoOffering, true); assert.equal(o.applicationOpen, null); assert.equal(o.deadline, null);
  const result = matchProgramme(p, profile); assert.equal(result.checks.find(c => /Applications to both/.test(c.labelEn)).status, 'unknown'); assert.equal(result.status, 'needs_confirmation');
  assert.match(rule('Applications to both SUSS and WIPO').noteEn, /does not submit either/);
  assert.throws(() => validateProgramme({ ...p, sources: [...p.sources, { url: obs.partnerLead.url, purpose: 'Synthetic external-source validation probe', checkedOn: '2026-10-27' }] }, new Set(['SG-SUSS'])), /Invalid programme evidence sources/);
});

test('designated WIPO study credit and replaced project do not imply prior-certificate admission or entry CGPA 3.0', () => {
  assert.deepEqual(obs.requirements.wipoCourseCodes, ['DL-101', 'DL-201', 'DL-301', 'DL-302']);
  assert.equal(obs.identity.listedSussCompulsoryCu + obs.identity.wipoCompulsoryRecognitionCu, obs.identity.compulsoryCu);
  assert.equal(obs.identity.compulsoryCu + obs.identity.electiveCu, 60);
  assert.equal(obs.curriculum.oldProject, 'IPM688'); assert.equal(obs.curriculum.replacementProject, 'MGT599'); assert.equal(obs.curriculum.replacementEffectiveSemester, '2026/07');
  assert.equal(obs.requirements.graduateAwardCgpa, 3); assert.equal(obs.requirements.numericEntryGpa, null);
  for (const changes of [{ gpa: 1 }, { major: 'Computer Science', experienceYears: 20 }, { degreeStatus: 'final_year' }]) {
    const result = matchProgramme(p, { ...profile, ...changes }); assert.equal(result.status, 'needs_confirmation'); assert.equal(result.tier, null);
    assert.equal(result.checks.find(c => /WIPO courses and study-stage/.test(c.labelEn)).status, 'unknown'); assert.equal(result.checks.some(c => c.status === 'fail'), false);
  }
});

test('July-only entry, January teaching and course-presentation dates cannot manufacture a current intake year or window', () => {
  assert.deepEqual(obs.cycle.recurringIntakeMonths, ['July']); assert.equal(obs.cycle.januaryIsTeachingSemesterNotIntake, true);
  assert.match(o.intake, /^July only/); assert.equal(o.academicYear, null); assert.equal(o.applicationOpen, null); assert.equal(o.deadline, null);
  assert.equal(obs.curriculum.coursePresentationsAreNotAdmissionWindows, true); assert.equal(obs.study.maximumYears, 2);
  for (const day of ['2026-10-27', '2027-01-01', '2027-04-15', '2027-07-01']) {
    const timeline = programmeTimeline(selected(), day); assert.equal(timeline.state, 'dates_incomplete'); assert.equal(timeline.livePortalChecked, false);
  }
});

test('conditional English and unknown WIPO evidence do not import older paper TOEFL or automatic waiver/expiry rules', () => {
  assert.equal(obs.requirements.english.ieltsAcademic, 6.5); assert.equal(obs.requirements.english.internetToeflUnversioned, 85);
  assert.equal(obs.legacyAlias.paperToefl580NotImported, true); assert.equal(p.rules.some(r => r.kind === 'language'), false);
  for (const language of [{ type: 'ielts', total: 5 }, { type: 'ielts', total: 9 }, { type: 'waiver' }, { type: 'toefl_120', total: 100 }, { type: 'toefl_6', total: 6 }]) {
    const result = matchProgramme(p, { ...profile, language }); assert.equal(result.status, 'needs_confirmation'); assert.equal(result.tier, null);
    assert.equal(result.checks.find(c => /English applicability/.test(c.labelEn)).status, 'unknown'); assert.equal(result.checks.some(c => c.status === 'fail'), false);
  }
});

test('unreconciled programme and generic fees retain distinct tax/category bases without a selected personal price or tax conversion', () => {
  assert.deepEqual(obs.fees.programmePage, { nonResidents: 39240, includesGst: true, cohortYear: null });
  assert.equal(obs.fees.genericMasterTable.otherResidents, 43200); assert.equal(obs.fees.genericMasterTable.excludesGst, true);
  assert.equal(obs.fees.genericMasterTable.conditionalSubsidisedAsLowAs, 25200); assert.equal(obs.fees.genericMasterTable.ipBusinessApplicabilityUnresolved, true);
  assert.equal(o.tuition, null); assert.equal(o.applicationFee, null); assert.equal(p.fieldStatus.tuition.status, 'unknown');
  assert.match(o.feeBasis, /39,240 including GST/); assert.match(o.feeBasis, /43,200 before GST/);
  assert.equal([...contexts.values()].some(c => c.programmeId === p.id), false); assert.equal(obs.fees.acceptanceDeposit.notExtraTuition, true);
});

test('limited scholarship evidence is separate from ordinary admission and no half-tuition award is applied automatically', () => {
  assert.equal(obs.funding.wipoHalfTuitionAwardsUpTo + obs.funding.sussHalfTuitionAwardsUpTo, 10); assert.equal(obs.funding.tuitionFraction, 0.5);
  assert.equal(obs.funding.automaticDiscount, false); assert.equal(obs.funding.notCombinedWithGenericSubsidy, true);
  assert.equal(rule('Scholarship evidence and limited funding').mandatory, false);
  assert.match(rule('Scholarship evidence and limited funding').noteEn, /not imposed as universal ordinary admission gates/);
  assert.equal(matchProgramme(p, profile).status, 'needs_confirmation'); assert.equal(o.tuition, null);
});

test('earlier MESG archives remain immutable and the added record creates no actionable cutoff or human-review identity', () => {
  const expected = {
    'source-review-queue-2026-10-27-suss-mesg.md': '89c816db312e133aaf69e9ffbeb79534b230dbf4b18bbb3850b4df6418b1943f',
    'core-pilot-acceptance-2026-10-27-suss-mesg.md': 'fd6d2589b9dbd04d31787e398d3bc43b0d505e22a73bf6faff2dfc3298770c5b'
  };
  for (const [file, hash] of Object.entries(expected)) assert.equal(createHash('sha256').update(readFileSync(new URL('docs/research/' + file, root), 'utf8').replaceAll('\r\n', '\n')).digest('hex'), hash);
  const queue = loadRepositoryReviewQueue('2026-10-27'); assert.equal(queue.counts.programmePageRecords, 330); assert.equal(queue.counts.reviewUnits, 595);
  assert.equal(queue.counts.reviewRecordedInSource, 0); assert.equal(queue.units.find(u => u.programmeId === p.id).upcomingRecordedCutoffs.length, 0);
});

test('first IP Business source migration preserves all other records and directory context across isolated restarts', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gradpath-suss-ipb-')), path = join(dir, 'test.sqlite'), checkedPath = join(dir, 'checked.json'); let db;
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

test('actual API/save/export preserves joint-application uncertainty and fee differences while flagging retired catalogue choices', async () => {
  const before = JSON.stringify(store.all()), detail = await get('/api/programmes/' + p.id + '?offering=' + o.id);
  assert.equal(detail.applicationTimeline.state, 'dates_incomplete'); assert.equal(detail.offerings[0].mode, null);
  const response = await fetch(base + '/api/matches', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ profile, offerings: { [p.id]: o.id } }) });
  assert.equal(response.status, 200); assert.equal((await response.json()).items.find(x => x.id === p.id).match.status, 'needs_confirmation');
  const saved = optionSnapshot(detail, '2026-10-27T04:00:00.000Z'); assert.equal(parseSavedOption(saved).offeringId, o.id);
  const restored = await fetch(base + '/api/saved-options/resolve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contexts: [saved, { programmeId: p.id, offeringId: p.id + '-catalogue' }] }) });
  assert.equal(restored.status, 200); const items = (await restored.json()).items; assert.deepEqual(items.map(x => x.status), ['resolved', 'needs_attention']);
  const exported = shortlistExport([items[0].programme], { [p.id]: saved }).programmes[0]; assert.equal(exported.offerings[0].id, o.id);
  assert.equal(exported.offerings[0].tuition, null); assert.equal(exported.offerings[0].deadline, null); assert.match(exported.offerings[0].feeBasis, /Unreconciled quotes/);
  assert.equal(exported.evidence.publishedRequirements.find(r => /Applications to both/.test(r.labelEn)).mandatory, true);
  assert.equal(exported.profile, undefined); assert.equal(exported.match, undefined);
  const meta = await get('/api/meta'); assert.equal(meta.quality.total, 873); assert.equal(meta.quality.browsable, 865); assert.equal(meta.quality.checked, 330);
  assert.equal(meta.quality.peerReviewed, 0); assert.equal(meta.quality.complete, 0); assert.deepEqual(meta.quality.sourceRefreshConflicts, []);
  assert.deepEqual(applicantSummary(contexts), { studyOptions: 224, categories: 449, peerReviewed: 0 }); assert.equal(meta.routeEvidence.routes, 41); assert.equal(JSON.stringify(store.all()), before);
});
