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
const batch = read('data/checked-programmes.json'), obs = read('data/research/smu-mwm-observation-2026-10-28.json');
const p = batch.programmes.find(p => p.id === obs.programmeId), o = p.offerings[0];
const options = { seedPath: new URL('data/catalogue.json', root), expansionPath: new URL('data/catalogue-expansion.json', root), checkedPath: new URL('data/checked-programmes.json', root), directoryEvidencePath: new URL('data/directory-links.json', root), scopeAuditPath: new URL('data/programme-scope-audit.json', root) };
const routePath = new URL('data/route-programmes.json', root), contextPath = new URL('data/applicant-contexts.json', root);
const store = new CatalogueStore(':memory:', options), routes = loadRoutes(routePath, store.all()), contexts = loadApplicantContexts(contextPath, store.all(), routes);
const selected = () => resolveProgramme(store.get(p.id), routes, undefined, o.id, undefined, contexts);
// Synthetic total years do not establish post-bachelor dates, CFA pass or an accepted waiver.
const profile = { major: 'History', degreeStatus: 'graduated', classification: 'ordinary', gpa: 2.5, gpaScale: 4, experienceYears: 0, language: { type: 'none' } };
const check = (result, label) => result.checks.find(c => c.labelEn === label);
const rule = label => p.rules.find(r => r.labelEn === label);

test('MWM two-year normal work requirement and CFA-1 exception stay visible without unconditional rejection or total-year approval', () => {
  assert.equal(validateProgramme(p, new Set(['SG-SMU'])), p); assert.equal(obs.entry.normalPostBachelorWorkYears, 2);
  assert.equal(p.rules.some(r => ['major', 'classification', 'gpa', 'experience'].includes(r.kind)), false);
  assert.match(rule('Two post-bachelor years or assessed CFA Level 1 work waiver').noteEn, /after the bachelor degree/);
  assert.match(rule('Two post-bachelor years or assessed CFA Level 1 work waiver').noteEn, /discretionary, not automatic/);
  for (const experienceYears of [0, 1, 2, 20]) {
    const result = matchProgramme(selected(), { ...profile, experienceYears }); assert.equal(result.status, 'needs_confirmation'); assert.equal(result.tier, null);
    assert.equal(check(result, 'Two post-bachelor years or assessed CFA Level 1 work waiver').status, 'unknown');
  }
});

test('MWM test/English evidence does not inherit sibling minima or allow GPA and English-waiver self-reports to settle admission', () => {
  assert.equal(obs.tests.noMinimumGmatGreSetInFaq, true); assert.equal(p.rules.some(r => r.kind === 'language'), false);
  for (const changes of [{ gpa: 4 }, { gpa: 4.9, gpaScale: 5 }, { language: { type: 'ielts', total: 9 } }, { language: { type: 'waiver', waiverBasis: 'english_degree' } }]) {
    const result = matchProgramme(selected(), { ...profile, ...changes }); assert.equal(result.status, 'needs_confirmation'); assert.equal(result.tier, null);
    assert.equal(check(result, 'Admission-test alternatives and recent-alumni substitute evidence').status, 'unknown');
    assert.equal(check(result, 'Conditional English proof without inherited thresholds').status, 'unknown');
  }
  assert.match(rule('Admission-test alternatives and recent-alumni substitute evidence').noteEn, /work-waiver consideration is not an admission-test exemption/);
});

test('MWM dated final without an opening never becomes live-open, while recorded deadline-day/passed transitions remain accurate', () => {
  assert.equal(o.applicationOpen, null); assert.equal(o.deadline, '2027-05-31'); assert.equal(o.applicationRounds, undefined);
  for (const [day, expected] of [['2026-10-28', 'dates_incomplete'], ['2027-05-30', 'dates_incomplete'], ['2027-05-31', 'deadline_today'], ['2027-06-01', 'deadline_passed']]) {
    const timeline = programmeTimeline(selected(), day); assert.equal(timeline.state, expected); assert.equal(timeline.livePortalChecked, false);
  }
  assert.equal(programmeTimeline(selected(), '2027-05-31', '2027-05-31T04:00:00.000Z').state, 'deadline_today');
  const queue = loadRepositoryReviewQueue('2026-10-28'); assert.equal(queue.counts.nearCutoffUnits, 2); assert.equal(queue.units.find(u => u.programmeId === p.id).upcomingRecordedCutoffs.length, 0);
  const may = loadRepositoryReviewQueue('2027-05-20').units.find(u => u.programmeId === p.id); assert.ok(may.upcomingRecordedCutoffs.some(d => d.offeringId === o.id && d.deadline === '2027-05-31'));
});

test('modular format, overseas certificates, graduation CGPA and contradictory GST/advance rows do not become invented modes, degrees or personal totals', () => {
  assert.equal(p.offerings.length, 1); assert.equal(o.mode, null); assert.match(o.duration, /modular/); assert.equal(routes.has(p.id), false);
  assert.equal(obs.study.coreCu, 15); assert.equal(obs.study.graduationCgpa, 2.5);
  assert.match(rule('Modular classification, overseas attendance and award scope').noteEn, /two consecutive overseas weeks/);
  assert.match(rule('Modular classification, overseas attendance and award scope').noteEn, /not three masters/);
  assert.match(rule('Coursework, optional internship and graduation CGPA').noteEn, /not undergraduate entry GPA/);
  assert.equal(o.tuition, null); assert.equal(o.applicationFee, 100); assert.match(o.feeBasis, /74,120 inclusive of GST/); assert.match(o.feeBasis, /8,000.*7,000/);
  assert.match(o.feeBasis, /Do not add GST a second time/); assert.equal(check(matchProgramme(selected(), profile), 'Indicative quote, conflicting deposit and GST applicability').status, 'unknown');
  assert.equal(/\p{Script=Han}/u.test(JSON.stringify(p)), false);
});

test('deadline-only observations preserve old whole-record dates and round/intake boundaries without counting extra programmes or review', () => {
  const [cu, ci] = obs.additionalDeadlineSpotChecks, queue = loadRepositoryReviewQueue('2026-10-28');
  assert.equal(cu.nextRecordedDeadline, '2026-10-31'); assert.equal(ci.deadline, '2026-11-01');
  for (const evidence of [cu, ci]) {
    assert.equal(evidence.checkedOn, '2026-10-28'); assert.equal(evidence.allRequirementsReread, false); assert.equal(evidence.livePortalChecked, false);
    assert.equal(store.get(evidence.programmeId).lastChecked, '2026-10-24');
    assert.equal(queue.units.find(u => u.programmeId === evidence.programmeId).sourceCheckedOn, '2026-10-24');
  }
  const anthrop = store.get(cu.programmeId); assert.deepEqual(anthrop.offerings[0].applicationRounds.map(r => r.deadline), cu.rounds);
  const spring = resolveProgramme(store.get(ci.programmeId), routes, undefined, ci.offeringId, undefined, contexts);
  assert.equal(spring.offerings[0].mode, 'Part-time'); assert.equal(spring.offerings[0].deadline, ci.deadline);
  assert.equal(programmeTimeline(spring, '2026-11-01').state, 'deadline_today'); assert.equal(programmeTimeline(spring, '2026-11-02').state, 'deadline_passed');
  assert.equal(queue.counts.programmePageRecords, 94); assert.equal(queue.counts.reviewUnits, 123); assert.equal(queue.counts.reviewRecordedInSource, 0);
});

test('expanded MWM catalogue ID migrates idempotently without changing preceding programmes, date-only spot-check parents or historical reports', () => {
  for (const [file, hash] of Object.entries(obs.preservation.previousSnapshotHashes)) assert.equal(createHash('sha256').update(readFileSync(new URL(file, root), 'utf8').replaceAll('\r\n', '\n')).digest('hex'), hash);
  assert.equal(batch.pilotProgrammeIds.length, 20); assert.equal(batch.pilotProgrammeIds.includes(p.id), false);
  const dir = mkdtempSync(join(tmpdir(), 'gradpath-smu-mwm-')), path = join(dir, 'test.sqlite'), checkedPath = join(dir, 'checked.json'); let db;
  try {
    writeFileSync(checkedPath, JSON.stringify({ ...batch, programmes: batch.programmes.filter(x => x.id !== p.id) }));
    db = new CatalogueStore(path, { ...options, checkedPath }); const earlier = db.all().filter(x => x.id !== p.id), listing = db.get(p.id).directoryListing;
    assert.equal(db.get(p.id).verification, 'catalogue_seed'); assert.equal(db.quality().checked, batch.programmes.length - 1); db.close(); db = null;
    writeFileSync(checkedPath, JSON.stringify(batch));
    for (let restart = 0; restart < 2; restart++) {
      db = new CatalogueStore(path, { ...options, checkedPath }); assert.equal(db.get(p.id).verification, 'programme_page_checked');
      assert.deepEqual(db.get(p.id).directoryListing, listing); assert.deepEqual(db.all().filter(x => x.id !== p.id), earlier);
      assert.deepEqual(db.quality().sourceRefreshConflicts, []); assert.equal(db.quality().checked, 94); db.close(); db = null;
    }
  } finally { db?.close(); rmSync(path, { force: true }); rmSync(checkedPath, { force: true }); rmdirSync(dir); }
});

const app = createApp({ store, publicDir: new URL('public/', root), routeEvidencePath: routePath, applicantEvidencePath: contextPath, now: () => new Date('2026-10-28T04:00:00Z') });
await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${app.address().port}`, get = async path => (await fetch(base + path)).json();
test.after(async () => { await new Promise(resolve => app.close(resolve)); store.close(); });

test('actual matching/save/restore/export retains MWM post-degree/CFA exceptions, modular uncertainty and date/fee evidence without profile leakage', async () => {
  const before = JSON.stringify(store.all()), detail = await get('/api/programmes/' + p.id + '?offering=' + o.id);
  for (const experienceYears of [0, 2, 20]) {
    const response = await fetch(base + '/api/matches', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ profile: { ...profile, experienceYears }, offerings: { [p.id]: o.id } }) });
    assert.equal(response.status, 200); const match = (await response.json()).items.find(x => x.id === p.id).match; assert.equal(match.status, 'needs_confirmation'); assert.equal(match.tier, null);
  }
  const saved = optionSnapshot(detail, '2026-10-28T04:00:00.000Z'); assert.equal(parseSavedOption(saved).offeringId, o.id);
  const restore = await fetch(base + '/api/saved-options/resolve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contexts: [saved, { programmeId: p.id, offeringId: p.id + '-catalogue' }] }) });
  assert.equal(restore.status, 200); const items = (await restore.json()).items; assert.deepEqual(items.map(x => x.status), ['resolved', 'needs_attention']);
  const exported = shortlistExport([items[0].programme], { [p.id]: saved }).programmes[0];
  assert.equal(exported.offerings[0].id, o.id); assert.equal(exported.offerings[0].mode, null); assert.equal(exported.offerings[0].tuition, null);
  assert.equal(exported.offerings[0].deadline, '2027-05-31'); assert.equal(exported.offerings[0].applicationOpen, null); assert.equal(exported.offerings[0].applicationFee, 100);
  assert.match(exported.evidence.publishedRequirements.find(r => /post-bachelor years/.test(r.labelEn)).noteEn, /CFA Level 1/);
  assert.equal(exported.profile, undefined); assert.equal(exported.match, undefined); assert.equal(detail.applicationTimeline.state, 'dates_incomplete');
  const meta = await get('/api/meta'); assert.equal(meta.quality.checked, 94); assert.equal(meta.quality.total, 873); assert.equal(meta.quality.browsable, 870);
  assert.equal(meta.quality.peerReviewed, 0); assert.equal(meta.quality.complete, 0); assert.deepEqual(meta.quality.sourceRefreshConflicts, []);
  assert.deepEqual(applicantSummary(contexts), { studyOptions: 18, categories: 38, peerReviewed: 0 }); assert.equal(meta.routeEvidence.routes, 11);
  assert.equal(JSON.stringify(store.all()), before);
});
