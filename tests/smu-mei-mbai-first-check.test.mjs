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
const batch = read('data/checked-programmes.json'), obs = read('data/research/smu-mei-mbai-observation-2026-10-28.json');
const programmes = obs.programmeIds.map(id => batch.programmes.find(p => p.id === id)), [mei, mbai] = programmes;
const options = { seedPath: new URL('data/catalogue.json', root), expansionPath: new URL('data/catalogue-expansion.json', root), checkedPath: new URL('data/checked-programmes.json', root), directoryEvidencePath: new URL('data/directory-links.json', root), scopeAuditPath: new URL('data/programme-scope-audit.json', root) };
const routePath = new URL('data/route-programmes.json', root), contextPath = new URL('data/applicant-contexts.json', root);
const store = new CatalogueStore(':memory:', options), routes = loadRoutes(routePath, store.all()), contexts = loadApplicantContexts(contextPath, store.all(), routes);
const selected = p => resolveProgramme(store.get(p.id), routes, undefined, p.offerings[0].id, undefined, contexts);
// Synthetic only; motivation, accepted exceptions, institution/year and English medium remain unproved.
const profile = { major: 'History', degreeStatus: 'graduated', classification: 'ordinary', gpa: 2.5, gpaScale: 4, experienceYears: 0, language: { type: 'none' } };
const check = (result, label) => result.checks.find(c => c.labelEn === label);
const rule = (p, label) => p.rules.find(r => r.labelEn === label);

test('MEI/MBAI flexible experience descriptions do not impose a one-year floor, five-year cap or technical major gate', () => {
  for (const p of programmes) {
    assert.equal(validateProgramme(p, new Set(['SG-SMU'])), p); assert.equal(p.rules.some(r => ['major', 'classification', 'gpa', 'experience'].includes(r.kind)), false);
    for (const changes of [{ major: 'History', experienceYears: 0, gpa: 1 }, { major: 'Business', experienceYears: 1 }, { major: 'Computer Science', experienceYears: 20, gpa: 4 }]) {
      const result = matchProgramme(selected(p), { ...profile, ...changes });
      assert.equal(result.status, 'needs_confirmation'); assert.equal(result.tier, null);
      assert.equal(check(result, 'Flexible experience range and programme fit').status, 'unknown');
    }
  }
  assert.match(rule(mbai, 'Flexible experience range and programme fit').noteEn, /coding and a Computer Science degree are not entry gates/);
});

test('programme-specific entrance/English scores and alumni evidence remain unresolved without borrowing sibling thresholds or approving waivers', () => {
  for (const p of programmes) for (const changes of [{ gpa: 4 }, { gpa: 4.9, gpaScale: 5 }, { language: { type: 'ielts', total: 9 } }, { language: { type: 'waiver', waiverBasis: 'english_degree' } }]) {
    const result = matchProgramme(selected(p), { ...profile, ...changes }); assert.equal(result.status, 'needs_confirmation'); assert.equal(result.tier, null);
    assert.equal(check(result, 'Programme-specific admission test alternatives and alumni evidence').status, 'unknown');
    assert.equal(check(result, 'Conditional English evidence and programme-specific score wording').status, 'unknown');
  }
  assert.equal(programmes.some(p => p.rules.some(r => r.kind === 'language')), false);
  assert.match(rule(mbai, 'Programme-specific admission test alternatives and alumni evidence').noteEn, /GMAT 600, GMAT Focus 595, GRE 312 or SMU Admission Test 55/);
  assert.doesNotMatch(rule(mei, 'Programme-specific admission test alternatives and alumni evidence').noteEn, /GMAT 600|GRE 312/);
  assert.match(rule(mbai, 'Conditional English evidence and programme-specific score wording').noteEn, /reference benchmarks/);
  assert.doesNotMatch(rule(mei, 'Conditional English evidence and programme-specific score wording').noteEn, /IELTS 6\.5|TOEFL 90/);
});

test('explicit September openings plus May-only closes never become complete windows, January/part-time options or borrowed MSA phases', () => {
  const queue = loadRepositoryReviewQueue('2026-10-28'); assert.equal(queue.counts.nearCutoffUnits, 2);
  for (const p of programmes) {
    assert.equal(p.offerings.length, 1); const o = p.offerings[0]; assert.equal(o.mode, 'Full-time'); assert.equal(o.intake, 'August 2027');
    assert.equal(o.applicationOpen, '2026-09-01'); assert.equal(o.deadline, null); assert.equal(o.applicationRounds, undefined);
    for (const day of ['2026-10-28', '2027-01-01', '2027-05-31', '2027-06-01']) {
      const timeline = programmeTimeline(selected(p), day); assert.equal(timeline.state, 'dates_incomplete'); assert.equal(timeline.offerings[0].openingDate, '2026-09-01'); assert.equal(timeline.livePortalChecked, false);
    }
    assert.equal(queue.units.find(u => u.programmeId === p.id).upcomingRecordedCutoffs.length, 0);
  }
  assert.equal(queue.counts.programmePageRecords, 73); assert.equal(queue.counts.reviewUnits, 102);
});

test('distinct statements, overseas residency, curriculum versions and deposit tax bases survive selection without stale fees or automatic funding', () => {
  assert.match(rule(mei, 'Programme-specific statements, two referees and documents').noteEn, /about 500 words/);
  assert.match(rule(mei, 'Programme-specific statements, two referees and documents').noteEn, /about 300 words/);
  assert.match(rule(mbai, 'Programme-specific statements, two referees and documents').noteEn, /two 500-600-word/);
  assert.match(rule(mei, 'Study plan, curriculum and delivery context').noteEn, /one-week UCL London residency/);
  assert.match(rule(mei, 'Study plan, curriculum and delivery context').noteEn, /15 months\/capstone/);
  assert.match(rule(mbai, 'Study plan, curriculum and delivery context').noteEn, /distribution discrepancy/);
  for (const [i, p] of programmes.entries()) {
    assert.equal(Object.values(obs.programmes[i].currentCu).reduce((a, b) => a + b), 15); assert.equal(routes.has(p.id), false);
    const o = selected(p).offerings[0]; assert.equal(o.tuition, null); assert.equal(o.applicationFee, 100); assert.match(o.feeBasis, /63,220/);
    assert.equal(check(matchProgramme(selected(p), profile), 'Current versus historical fees and personal applicability').status, 'unknown');
    assert.equal(/\p{Script=Han}/u.test(JSON.stringify(p)), false);
  }
  assert.match(mei.offerings[0].feeBasis, /59,950 row is explicitly AY2024/); assert.match(mei.offerings[0].feeBasis, /tax basis is not established/);
  assert.match(mbai.offerings[0].feeBasis, /deposit is explicitly inclusive of GST/); assert.match(mbai.offerings[0].feeBasis, /up to 30%.*up to 25%/);
});

test('two existing catalogue IDs migrate idempotently without rewriting older programme objects, reports or the pilot', () => {
  for (const [file, hash] of Object.entries(obs.preservation.previousSnapshotHashes)) assert.equal(createHash('sha256').update(readFileSync(new URL(file, root), 'utf8').replaceAll('\r\n', '\n')).digest('hex'), hash);
  assert.equal(batch.pilotProgrammeIds.length, 20); assert.equal(obs.programmeIds.some(id => batch.pilotProgrammeIds.includes(id)), false);
  const dir = mkdtempSync(join(tmpdir(), 'gradpath-smu-mei-mbai-')), path = join(dir, 'test.sqlite'), checkedPath = join(dir, 'checked.json'); let db;
  try {
    writeFileSync(checkedPath, JSON.stringify({ ...batch, programmes: batch.programmes.filter(p => !obs.programmeIds.includes(p.id)) }));
    db = new CatalogueStore(path, { ...options, checkedPath }); const earlier = db.all().filter(p => !obs.programmeIds.includes(p.id)); const listings = obs.programmeIds.map(id => db.get(id).directoryListing);
    for (const id of obs.programmeIds) assert.equal(db.get(id).verification, 'catalogue_seed'); assert.equal(db.quality().checked, 71); db.close(); db = null;
    writeFileSync(checkedPath, JSON.stringify(batch));
    for (let restart = 0; restart < 2; restart++) {
      db = new CatalogueStore(path, { ...options, checkedPath });
      for (const [i, id] of obs.programmeIds.entries()) { assert.equal(db.get(id).verification, 'programme_page_checked'); assert.deepEqual(db.get(id).directoryListing, listings[i]); }
      assert.deepEqual(db.all().filter(p => !obs.programmeIds.includes(p.id)), earlier); assert.deepEqual(db.quality().sourceRefreshConflicts, []);
      assert.equal(db.quality().checked, 73); db.close(); db = null;
    }
  } finally { db?.close(); rmSync(path, { force: true }); rmSync(checkedPath, { force: true }); rmdirSync(dir); }
});

const app = createApp({ store, publicDir: new URL('public/', root), routeEvidencePath: routePath, applicantEvidencePath: contextPath, now: () => new Date('2026-10-28T04:00:00Z') });
await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${app.address().port}`, get = async path => (await fetch(base + path)).json();
test.after(async () => { await new Promise(resolve => app.close(resolve)); store.close(); });

test('actual matching, saved-choice restore and export preserve separate MEI/MBAI evidence and incomplete dates without profile leakage', async () => {
  const before = JSON.stringify(store.all());
  for (const p of programmes) {
    const o = p.offerings[0], detail = await get('/api/programmes/' + p.id + '?offering=' + o.id);
    const response = await fetch(base + '/api/matches', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ profile, offerings: { [p.id]: o.id } }) });
    assert.equal(response.status, 200); const match = (await response.json()).items.find(x => x.id === p.id).match; assert.equal(match.status, 'needs_confirmation'); assert.equal(match.tier, null);
    const saved = optionSnapshot(detail, '2026-10-28T04:00:00.000Z'); assert.equal(parseSavedOption(saved).offeringId, o.id);
    const restore = await fetch(base + '/api/saved-options/resolve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contexts: [saved, { programmeId: p.id, offeringId: p.id + '-seed' }] }) });
    assert.equal(restore.status, 200); const items = (await restore.json()).items; assert.deepEqual(items.map(x => x.status), ['resolved', 'needs_attention']);
    const exported = shortlistExport([items[0].programme], { [p.id]: saved }).programmes[0];
    assert.equal(exported.offerings[0].id, o.id); assert.equal(exported.offerings[0].tuition, null); assert.equal(exported.offerings[0].deadline, null);
    assert.equal(exported.offerings[0].applicationOpen, '2026-09-01'); assert.equal(exported.offerings[0].applicationRounds, undefined);
    assert.match(exported.evidence.publishedRequirements.find(r => /Flexible experience/.test(r.labelEn)).noteEn, /neither a one-year floor nor five-year cap/);
    assert.equal(exported.profile, undefined); assert.equal(exported.match, undefined); assert.equal(detail.applicationTimeline.state, 'dates_incomplete');
  }
  const meta = await get('/api/meta'); assert.equal(meta.quality.checked, 73); assert.equal(meta.quality.total, 873); assert.equal(meta.quality.browsable, 870);
  assert.equal(meta.quality.peerReviewed, 0); assert.equal(meta.quality.complete, 0); assert.deepEqual(meta.quality.sourceRefreshConflicts, []);
  assert.deepEqual(applicantSummary(contexts), { studyOptions: 18, categories: 38, peerReviewed: 0 }); assert.equal(meta.routeEvidence.routes, 11);
  assert.equal(JSON.stringify(store.all()), before);
});
