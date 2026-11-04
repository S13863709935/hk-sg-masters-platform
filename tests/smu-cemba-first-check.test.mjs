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
const batch = read('data/checked-programmes.json'), obs = read('data/research/smu-cemba-observation-2026-10-29.json'), pid = obs.programmeId;
const options = { seedPath: new URL('data/catalogue.json', root), expansionPath: new URL('data/catalogue-expansion.json', root), checkedPath: new URL('data/checked-programmes.json', root), directoryEvidencePath: new URL('data/directory-links.json', root), scopeAuditPath: new URL('data/programme-scope-audit.json', root) };
const routePath = new URL('data/route-programmes.json', root), contextPath = new URL('data/applicant-contexts.json', root);
const store = new CatalogueStore(':memory:', options), routes = loadRoutes(routePath, store.all()), contexts = loadApplicantContexts(contextPath, store.all(), routes), p = store.get(pid), o = p.offerings[0];
const selected = () => resolveProgramme(p, routes, undefined, o.id, undefined, contexts), rule = label => p.rules.find(r => r.labelEn === label);
// Synthetic total experience is not evidence of five years in managerial/leadership roles.
const profile = { major: 'History', degreeStatus: 'graduated', classification: 'ordinary', gpa: 3.5, gpaScale: 4, experienceYears: 5, language: { type: 'none' } };

test('Chinese EMBA remains a separate Chinese-medium two-year modular master with no copied English EMBA format or extra partner degrees', () => {
  assert.equal(p.offerings.length, 1); assert.equal(o.mode, null); assert.match(o.duration, /24 months/); assert.equal(routes.has(pid), false);
  assert.equal(obs.study.compulsoryOverseasStudy, true); assert.equal(obs.study.graduationCu, 18); assert.match(rule('Two-year modular delivery and compulsory overseas study').noteEn, /graduation requirements, not pre-entry/);
  assert.notEqual(o.id, store.get('SG-SMU-P012').offerings[0].id); assert.match(store.get('SG-SMU-P012').offerings[0].duration, /15 months/); assert.equal(store.get('SG-SMU-P012').lastChecked, '2026-10-29');
});

test('academic exceptions do not become unconditional degree or GPA gates or an automatic experience exception', () => {
  assert.equal(p.rules.some(r => ['degree', 'major', 'gpa', 'classification'].includes(r.kind)), false); assert.match(rule('Degree recognition or assessed academic exception').noteEn, /below the normal academic requirement.*assessed individually/);
  for (const degreeStatus of ['graduated', 'final_year', 'other']) { const result = matchProgramme(selected(), { ...profile, degreeStatus, gpa: 4 }); assert.equal(result.status, 'needs_confirmation'); assert.equal(result.tier, null); }
  assert.equal(obs.work.academicExceptionNotWorkWaiver, true);
});

test('five managerial years require role evidence: insufficient total years are a gap while enough total years never approve the requirement', () => {
  for (const experienceYears of [0, 2, 4.9, 5, 10, 25, null]) {
    const result = matchProgramme(selected(), { ...profile, experienceYears }); assert.equal(result.status, experienceYears !== null && experienceYears < 5 ? 'has_gap' : 'needs_confirmation'); assert.equal(result.tier, null);
    assert.equal(result.checks.find(c => c.labelEn === 'Five years of management or leadership evidence').status, 'unknown');
  }
  assert.equal(p.rules.find(r => r.kind === 'experience').min, 5); assert.match(rule('Five years of management or leadership evidence').noteEn, /not establish five qualifying managerial/);
});

test('Chinese characters, interpretation and separate scholarship statements never become English word counts or imported test/waiver rules', () => {
  assert.deepEqual(obs.materials.charactersEach, [500, 600]); assert.equal(obs.materials.personalStatements, 2); assert.equal(obs.materials.unit, 'Chinese characters, not English words');
  assert.equal(p.rules.some(r => r.kind === 'language'), false); assert.match(rule('Two Chinese-character statements, referees and verified materials').noteEn, /Characters are not English words/);
  assert.match(rule('Chinese readiness and unestablished test policies').noteEn, /not a universal test waiver/);
  assert.equal(rule('Scholarship selection is separate from admission').mandatory, false); assert.match(rule('Scholarship selection is separate from admission').noteEn, /not a third mandatory admissions statement/);
  for (const language of [{ type: 'ielts', total: 9 }, { type: 'waiver', waiverBasis: 'english_degree' }]) { const result = matchProgramme(selected(), { ...profile, language }); assert.equal(result.status, 'needs_confirmation'); assert.equal(result.checks.find(c => c.labelEn === 'Chinese readiness and unestablished test policies').status, 'unknown'); }
  assert.equal(/\p{Script=Han}/u.test(JSON.stringify(batch.programmes.find(x => x.id === pid))), false);
});

test('exact 2026 guide dates stay visible but unresolved intake binding blocks live-open, deadline-day and urgent-cutoff claims', () => {
  assert.equal(o.intake, 'January 2027'); assert.equal(o.applicationOpen, '2026-02-01'); assert.equal(o.deadline, '2026-10-31'); assert.equal(o.applicationRounds, undefined); assert.equal(p.fieldStatus.deadline.status, 'unknown');
  assert.equal(obs.cycle.directoryHistoricalDeadline, '2025-11-01'); assert.equal(obs.cycle.paymentDatesNotApplicationRounds, true);
  for (const day of ['2026-10-29', '2026-10-31', '2026-11-01', '2027-01-08', '2027-08-22']) { const timeline = programmeTimeline(selected(), day); assert.equal(timeline.state, 'dates_incomplete'); assert.equal(timeline.livePortalChecked, false); assert.equal(timeline.offerings[0].deadline, '2026-10-31'); }
  const queue = loadRepositoryReviewQueue('2026-10-29'); assert.equal(queue.counts.nearCutoffUnits, 2); assert.deepEqual(queue.units.find(u => u.programmeId === pid).recordedCutoffs, []);
});

test('tax-exclusive quote, inclusive instalments and advance-credit/payment triggers remain separate without a personal total or English EMBA charges', () => {
  assert.equal(o.tuition, null); assert.equal(o.applicationFee, 100); assert.equal(obs.fees.guideTuitionExcludingGst, 200000); assert.deepEqual(obs.fees.billingJan2027InclusiveInstalments, [87200, 65400, 65400]);
  assert.equal(obs.fees.advanceCredited, 20000); assert.equal(obs.fees.firstBillIncludesAdvance, true); assert.match(o.feeBasis, /not an extra tuition charge/);
  assert.match(o.feeBasis, /one week of accepting an offer/); assert.match(o.feeBasis, /invoice payment within 30 days/); assert.match(o.feeBasis, /payment dates, not application deadlines/);
  assert.equal(obs.sourceLimits.pdfVisualReview, false); assert.match(o.feeBasis, /text-only official billing table/); assert.equal(p.fieldStatus.tuition.status, 'unknown');
});

test('CEMBA source migration is idempotent and preserves the other programmes and historical research snapshots', () => {
  for (const [file, hash] of Object.entries(obs.preservation.previousSnapshotHashes)) assert.equal(createHash('sha256').update(readFileSync(new URL(file, root), 'utf8').replaceAll('\r\n', '\n')).digest('hex'), hash);
  const dir = mkdtempSync(join(tmpdir(), 'gradpath-smu-cemba-')), path = join(dir, 'test.sqlite'), checkedPath = join(dir, 'checked.json'); let db;
  try {
    writeFileSync(checkedPath, JSON.stringify({ ...batch, programmes: batch.programmes.filter(x => x.id !== pid) })); db = new CatalogueStore(path, { ...options, checkedPath });
    const earlier = db.all().filter(x => x.id !== pid); assert.equal(db.get(pid).verification, 'catalogue_seed'); assert.equal(db.quality().checked, batch.programmes.length - 1); db.close(); db = null;
    writeFileSync(checkedPath, JSON.stringify(batch));
    for (let restart = 0; restart < 2; restart++) { db = new CatalogueStore(path, { ...options, checkedPath }); assert.equal(db.get(pid).verification, 'programme_page_checked'); assert.deepEqual(db.all().filter(x => x.id !== pid), earlier); assert.deepEqual(db.quality().sourceRefreshConflicts, []); assert.equal(db.quality().checked, 429); db.close(); db = null; }
  } finally { db?.close(); rmSync(path, { force: true }); rmSync(checkedPath, { force: true }); rmdirSync(dir); }
});

const app = createApp({ store, publicDir: new URL('public/', root), routeEvidencePath: routePath, applicantEvidencePath: contextPath, now: () => new Date('2026-10-29T04:00:00Z') });
await new Promise(resolve => app.listen(0, '127.0.0.1', resolve)); const base = `http://127.0.0.1:${app.address().port}`;
const get = async path => (await fetch(base + path)).json(), post = (path, body) => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
test.after(async () => { await new Promise(resolve => app.close(resolve)); store.close(); });

test('actual CEMBA APIs/save/restore/export retain character units, management evidence and unresolved dates without replacing choices or leaking profiles', async () => {
  const before = JSON.stringify(store.all()), detail = await get('/api/programmes/' + pid + '?offering=' + o.id);
  for (const experienceYears of [0, 5, 20]) { const response = await post('/api/matches', { profile: { ...profile, experienceYears }, offerings: { [pid]: o.id } }); assert.equal(response.status, 200); const result = (await response.json()).items.find(x => x.id === pid).match; assert.equal(result.status, experienceYears < 5 ? 'has_gap' : 'needs_confirmation'); assert.equal(result.tier, null); }
  const saved = optionSnapshot(detail, '2026-10-29T04:00:00.000Z'); const response = await post('/api/saved-options/resolve', { contexts: [saved, { programmeId: pid, offeringId: pid + '-catalogue' }, { programmeId: pid, offeringId: 'SG-SMU-P012-AUG2027-MODULAR' }] });
  assert.equal(response.status, 200); const items = (await response.json()).items; assert.deepEqual(items.map(x => x.status), ['resolved', 'needs_attention', 'needs_attention']);
  const exported = shortlistExport([{ ...items[0].programme, profile, match: { status: 'meets_checked' } }], { [pid]: saved }).programmes[0];
  assert.equal(exported.offerings[0].mode, null); assert.equal(exported.offerings[0].tuition, null); assert.equal(exported.offerings[0].deadline, '2026-10-31'); assert.equal(exported.applicationTimeline.state, 'dates_incomplete');
  assert.equal(exported.profile, undefined); assert.equal(exported.match, undefined); assert.match(exported.evidence.publishedRequirements.find(r => /statements/.test(r.labelEn)).noteEn, /500-600 Chinese characters/);
  assert.equal(JSON.stringify(store.all()), before);
});

test('94 partial records do not claim complete current-SMU inventory, independent review or an unverified new directory entry', async () => {
  const meta = await get('/api/meta'), queue = loadRepositoryReviewQueue('2026-10-29'), smu = store.all().filter(p => p.universityId === 'SG-SMU');
  assert.equal(meta.quality.total, 873); assert.equal(meta.quality.browsable, 865); assert.equal(meta.quality.checked, 429); assert.equal(meta.quality.peerReviewed, 0); assert.equal(meta.quality.complete, 0);
  assert.equal(smu.length, 17); assert.ok(smu.every(p => p.verification === 'programme_page_checked' && p.requirementsCoverage === 'partial'));
  assert.equal(obs.directoryFollowup.newCatalogueEntryCreated, false); assert.equal(obs.directoryFollowup.currentFullDirectoryReconciliationClaimed, false); assert.equal(smu.some(p => p.name.includes('Public Governance')), false);
  assert.deepEqual(meta.routeEvidence, { groups: 28, routes: 63, pageChecked: 63, peerReviewed: 0, complete: 0 }); assert.equal(queue.counts.programmePageRecords, 429); assert.equal(queue.counts.reviewUnits, 815); assert.equal(queue.counts.nearCutoffUnits, 2);
});
