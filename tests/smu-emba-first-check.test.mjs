import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, rmdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CatalogueStore } from '../server/database.mjs';
import { createApp } from '../server/app.mjs';
import { loadRoutes, resolveProgramme } from '../server/routes.mjs';
import { loadApplicantContexts } from '../server/applicants.mjs';
import { matchProgramme } from '../server/matching.mjs';
import { programmeTimeline } from '../server/application-dates.mjs';
import { optionSnapshot, shortlistExport } from '../public/saved-options.js';
import { loadRepositoryReviewQueue } from '../scripts/source-review-queue.mjs';

const root = new URL('../', import.meta.url), read = path => JSON.parse(readFileSync(new URL(path, root), 'utf8'));
const batch = read('data/checked-programmes.json'), obs = read('data/research/smu-emba-observation-2026-10-29.json'), pid = obs.programmeId;
const options = { seedPath: new URL('data/catalogue.json', root), expansionPath: new URL('data/catalogue-expansion.json', root), checkedPath: new URL('data/checked-programmes.json', root), directoryEvidencePath: new URL('data/directory-links.json', root), scopeAuditPath: new URL('data/programme-scope-audit.json', root) };
const routePath = new URL('data/route-programmes.json', root), contextPath = new URL('data/applicant-contexts.json', root);
const store = new CatalogueStore(':memory:', options), routes = loadRoutes(routePath, store.all()), contexts = loadApplicantContexts(contextPath, store.all(), routes), p = store.get(pid), o = p.offerings[0];
const selected = () => resolveProgramme(p, routes, undefined, o.id, undefined, contexts), rule = label => p.rules.find(r => r.labelEn === label);
// Synthetic only: no degree exception, qualifying professional work or accepted test evidence is established.
const profile = { major: 'History', degreeStatus: 'graduated', classification: 'ordinary', gpa: 3.5, gpaScale: 4, experienceYears: 10, language: { type: 'none' } };

test('EMBA retains the assessed non-bachelor career route without a universal degree, major or GPA gate', () => {
  assert.equal(obs.degree.notableCareerWithoutBachelorCaseByCase, true); assert.equal(p.rules.some(r => ['degree', 'major', 'gpa', 'classification'].includes(r.kind)), false);
  assert.match(rule('Degree recognition or assessed career-achievement exception').noteEn, /without a bachelor degree.*case by case/);
  for (const degreeStatus of ['graduated', 'final_year', 'other']) { const result = matchProgramme(selected(), { ...profile, degreeStatus }); assert.equal(result.status, 'needs_confirmation'); assert.equal(result.tier, null); assert.equal(result.checks.find(c => c.labelEn === 'Degree recognition or assessed career-achievement exception').status, 'unknown'); }
});

test('ten-year eligibility and different FAQ wording do not become an invented work waiver or approval from total years', () => {
  assert.equal(obs.work.headerAndEligibilityMinimumProfessionalYears, 10); assert.equal(p.rules.some(r => r.kind === 'experience'), false);
  assert.match(rule('Ten-year professional experience and senior-role evidence').noteEn, /minimum of ten years/); assert.match(rule('Ten-year professional experience and senior-role evidence').noteEn, /strongly recommends ten/);
  for (const experienceYears of [0, 2, 9, 10, 25, null]) { const result = matchProgramme(selected(), { ...profile, experienceYears }); assert.equal(result.status, 'needs_confirmation'); assert.equal(result.tier, null); assert.equal(result.checks.find(c => c.labelEn === 'Ten-year professional experience and senior-role evidence').status, 'unknown'); }
});

test('SMUAT alternative is not a blanket test waiver, while English and single-essay materials do not inherit sibling requirements', () => {
  assert.match(rule('Alternative admission tests, not a blanket exemption').noteEn, /SMUAT may replace GMAT/); assert.match(rule('Alternative admission tests, not a blanket exemption').noteEn, /not mean all admission tests are waived/);
  assert.equal(p.rules.some(r => r.kind === 'language'), false); assert.equal(obs.materials.essays, 1); assert.deepEqual(obs.materials.words, [300, 500]);
  assert.match(rule('One essay, referees and original-document verification').noteEn, /one essay of 300-500 words/);
  for (const language of [{ type: 'ielts', total: 9 }, { type: 'waiver', waiverBasis: 'english_degree' }]) { const result = matchProgramme(selected(), { ...profile, gpa: 4, language }); assert.equal(result.status, 'needs_confirmation'); assert.equal(result.checks.find(c => c.labelEn === 'English evidence not established by these blocks').status, 'unknown'); }
});

test('explicit current window is compared without live-open claims or importing the undated FAQ rounds and cutoff time', () => {
  assert.equal(o.applicationOpen, '2026-09-01'); assert.equal(o.deadline, '2027-05-31'); assert.equal(o.applicationRounds, undefined); assert.equal(obs.cycle.exactCutoffTime, null);
  for (const [day, expected] of [['2026-08-31', 'not_yet_open'], ['2026-09-01', 'within_recorded_dates'], ['2026-10-29', 'within_recorded_dates'], ['2027-05-30', 'within_recorded_dates'], ['2027-05-31', 'deadline_today'], ['2027-06-01', 'deadline_passed']]) { const timeline = programmeTimeline(selected(), day); assert.equal(timeline.state, expected); assert.equal(timeline.livePortalChecked, false); }
  assert.match(o.deadlineNote, /older FAQ.*30 May/);
  const historical = loadRepositoryReviewQueue('2026-10-28').units.find(u => u.programmeId === pid), current = loadRepositoryReviewQueue('2026-10-29').units.find(u => u.programmeId === pid);
  assert.equal(historical.sourceCheckedOn, '2026-10-29'); assert.deepEqual(historical.recordedCutoffs, []); assert.ok(historical.reasons.some(r => /postdate/.test(r)));
  assert.equal(current.recordedCutoffs[0].deadline, '2027-05-31'); assert.equal(current.recordedCutoffs[0].sourceCheckedOn, '2026-10-29');
});

test('one modular SMU EMBA keeps unknown formal mode, overseas cohorts and project scope without relabelling Chinese EMBA or partner awards', () => {
  assert.equal(p.offerings.length, 1); assert.equal(o.mode, null); assert.equal(routes.has(pid), false); assert.match(o.duration, /15 months.*one year/);
  assert.deepEqual(obs.delivery.olderCalendarYears, [2023, 2024]); assert.deepEqual(obs.delivery.currentDisplayedCalendarYears, [2026, 2027]);
  assert.equal(obs.delivery.calendarNotRelabelledForAugust2027, true); assert.match(rule('Residential mode, overseas segments and current cohort').noteEn, /Neither calendar is silently relabelled/);
  assert.equal(store.get('SG-SMU-P011').verification, 'programme_page_checked'); assert.equal(store.get('SG-SMU-P011').lastChecked, '2026-10-29');
  assert.equal(rule('Strategic project within a taught executive degree').mandatory, false);
});

test('mixed fee cohorts and tax-labelled credited deposits do not produce personal tuition or double-counted test, advance or overseas costs', () => {
  assert.equal(o.tuition, null); assert.equal(o.applicationFee, 100); assert.equal(obs.fees.smuAtPerAttemptIfUsed, 125);
  assert.equal(obs.fees.headerAugust2027IndicativeInclusiveGst, 126440); assert.equal(obs.fees.faqOlderInclusiveGst, 119900);
  assert.match(o.feeBasis, /12,000.*15,000/); assert.match(o.feeBasis, /credited.*not additional tuition/); assert.match(o.feeBasis, /AY2026/); assert.match(o.feeBasis, /excluding-GST footnote/);
  assert.match(o.feeBasis, /accommodation in three overseas segments is included/); assert.match(o.feeBasis, /do not add GST twice/); assert.equal(p.fieldStatus.tuition.status, 'unknown');
  assert.equal(/\p{Script=Han}/u.test(JSON.stringify(batch.programmes.find(x => x.id === pid))), false);
});

test('new 29 October observation migrates idempotently without restamping the other programmes or earlier reports', () => {
  for (const [file, hash] of Object.entries(obs.preservation.previousSnapshotHashes)) assert.equal(createHash('sha256').update(readFileSync(new URL(file, root), 'utf8').replaceAll('\r\n', '\n')).digest('hex'), hash);
  assert.equal(batch.checkedOn, batch.programmes.map(x => x.lastChecked).sort().at(-1)); assert.equal(batch.programmes.filter(x => x.lastChecked === '2026-10-29').length, 2);
  const dir = mkdtempSync(join(tmpdir(), 'gradpath-smu-emba-')), path = join(dir, 'test.sqlite'), checkedPath = join(dir, 'checked.json'); let db;
  try {
    writeFileSync(checkedPath, JSON.stringify({ ...batch, checkedOn: batch.programmes.filter(x => x.id !== pid).map(x => x.lastChecked).sort().at(-1), programmes: batch.programmes.filter(x => x.id !== pid) })); db = new CatalogueStore(path, { ...options, checkedPath });
    const earlier = db.all().filter(x => x.id !== pid); assert.equal(db.get(pid).verification, 'catalogue_seed'); assert.equal(db.quality().checked, batch.programmes.length - 1); db.close(); db = null;
    writeFileSync(checkedPath, JSON.stringify(batch));
    for (let restart = 0; restart < 2; restart++) { db = new CatalogueStore(path, { ...options, checkedPath }); assert.equal(db.get(pid).verification, 'programme_page_checked'); assert.deepEqual(db.all().filter(x => x.id !== pid), earlier); assert.deepEqual(db.quality().sourceRefreshConflicts, []); assert.equal(db.quality().checked, 297); db.close(); db = null; }
  } finally { db?.close(); rmSync(path, { force: true }); rmSync(checkedPath, { force: true }); rmdirSync(dir); }
});

const app = createApp({ store, publicDir: new URL('public/', root), routeEvidencePath: routePath, applicantEvidencePath: contextPath, now: () => new Date('2026-10-29T04:00:00Z') });
await new Promise(resolve => app.listen(0, '127.0.0.1', resolve)); const base = `http://127.0.0.1:${app.address().port}`;
const get = async path => (await fetch(base + path)).json(), post = (path, body) => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
test.after(async () => { await new Promise(resolve => app.close(resolve)); store.close(); });

test('actual EMBA matching/save/restore/export retains assessed career exceptions, recorded window and mixed fees without profile leakage', async () => {
  const before = JSON.stringify(store.all()), detail = await get('/api/programmes/' + pid + '?offering=' + o.id);
  for (const changes of [{ degreeStatus: 'other', experienceYears: 0 }, { experienceYears: 25 }]) { const response = await post('/api/matches', { profile: { ...profile, ...changes }, offerings: { [pid]: o.id } }); assert.equal(response.status, 200); const result = (await response.json()).items.find(x => x.id === pid).match; assert.equal(result.status, 'needs_confirmation'); assert.equal(result.tier, null); }
  const saved = optionSnapshot(detail, '2026-10-29T04:00:00.000Z');
  const reply = await post('/api/saved-options/resolve', { contexts: [saved, { programmeId: pid, offeringId: pid + '-catalogue' }] }); assert.equal(reply.status, 200); const items = (await reply.json()).items; assert.deepEqual(items.map(x => x.status), ['resolved', 'needs_attention']);
  const exported = shortlistExport([{ ...items[0].programme, profile, match: { status: 'meets_checked' } }], { [pid]: saved }).programmes[0];
  assert.equal(exported.offerings[0].mode, null); assert.equal(exported.offerings[0].tuition, null); assert.equal(exported.offerings[0].applicationOpen, '2026-09-01'); assert.equal(exported.offerings[0].deadline, '2027-05-31');
  assert.equal(exported.applicationTimeline.state, 'within_recorded_dates'); assert.equal(exported.applicationTimeline.livePortalChecked, false); assert.equal(exported.evidence.lastChecked, '2026-10-29');
  assert.equal(exported.profile, undefined); assert.equal(exported.match, undefined); assert.ok(exported.evidence.publishedRequirements.some(r => /career-achievement exception/.test(r.labelEn))); assert.equal(JSON.stringify(store.all()), before);
});

test('EMBA adds one partial record and maintenance unit while catalogue, routes, review and recent-cutoff counts remain honest', async () => {
  const meta = await get('/api/meta'), queue = loadRepositoryReviewQueue('2026-10-29');
  assert.equal(meta.quality.total, 873); assert.equal(meta.quality.browsable, 869); assert.equal(meta.quality.checked, 297); assert.equal(meta.quality.peerReviewed, 0); assert.equal(meta.quality.complete, 0);
  assert.deepEqual(meta.routeEvidence, { groups: 16, routes: 39, pageChecked: 39, peerReviewed: 0, complete: 0 }); assert.equal(queue.counts.programmePageRecords, 297); assert.equal(queue.counts.reviewUnits, 529); assert.equal(queue.counts.nearCutoffUnits, 2); assert.equal(queue.counts.reviewRecordedInSource, 0);
  assert.equal(batch.pilotProgrammeIds.length, 20); assert.equal(batch.pilotProgrammeIds.includes(pid), false);
});
