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
const batch = read('data/checked-programmes.json'), obs = read('data/research/smu-mst-observation-2026-10-28.json');
const p = batch.programmes.find(p => p.id === obs.programmeId);
const options = { seedPath: new URL('data/catalogue.json', root), expansionPath: new URL('data/catalogue-expansion.json', root), checkedPath: new URL('data/checked-programmes.json', root), directoryEvidencePath: new URL('data/directory-links.json', root), scopeAuditPath: new URL('data/programme-scope-audit.json', root) };
const routePath = new URL('data/route-programmes.json', root), contextPath = new URL('data/applicant-contexts.json', root);
const store = new CatalogueStore(':memory:', options), routes = loadRoutes(routePath, store.all()), contexts = loadApplicantContexts(contextPath, store.all(), routes);
const selected = o => resolveProgramme(store.get(p.id), routes, undefined, o.id, undefined, contexts);
// Synthetic only: institution/year, accepted English medium, local employment and pass are unproved.
const profile = { major: 'History', degreeStatus: 'graduated', classification: 'ordinary', gpa: 2.5, gpaScale: 4, experienceYears: 0, language: { type: 'none' } };
const check = (result, label) => result.checks.find(c => c.labelEn === label);
const rule = label => p.rules.find(r => r.labelEn === label);

test('MST-specific 3.4/3.6 test substitutes do not become global GPA, major or prior-work gates', () => {
  assert.equal(validateProgramme(p, new Set(['SG-SMU'])), p); assert.equal(p.rules.some(r => ['major', 'classification', 'gpa', 'experience'].includes(r.kind)), false);
  assert.deepEqual(obs.tests.recentAlumniSubstitutes.map(x => [x.minimum, x.scale]), [[3.4, 4], [3.6, 5]]);
  for (const o of p.offerings) for (const changes of [{ gpa: 1, major: 'History', experienceYears: 0 }, { gpa: 3.0 }, { gpa: 3.5, gpaScale: 5 }, { gpa: 4, major: 'Sustainability', experienceYears: 20 }]) {
    const result = matchProgramme(selected(o), { ...profile, ...changes }); assert.equal(result.status, 'needs_confirmation'); assert.equal(result.tier, null);
    assert.equal(check(result, 'MST-specific alumni test substitutes and SMUAT alternatives').status, 'unknown');
    assert.equal(check(result, 'Good undergraduate qualification in any field and programme fit').status, 'unknown');
  }
  assert.match(rule('MST-specific alumni test substitutes and SMUAT alternatives').noteEn, /overall 55, not an invented score of 55 in each component/);
});

test('conditional UKVI Academic/IELTS/TOEFL evidence and submission-time validity do not inherit Band 4.5 or approve a self-reported waiver', () => {
  const note = rule('Conditional IELTS or UKVI Academic or TOEFL and submission-time validity').noteEn;
  assert.match(note, /IELTS\/UKVI \(Academic\) at least 6\.5 or TOEFL 90/); assert.match(note, /two years at application submission/);
  assert.equal(p.rules.some(r => r.kind === 'language'), false);
  for (const o of p.offerings) for (const language of [{ type: 'none' }, { type: 'ielts', total: 9 }, { type: 'toefl_6', total: 6 }, { type: 'waiver', waiverBasis: 'english_degree' }]) {
    const result = matchProgramme(selected(o), { ...profile, language }); assert.equal(result.status, 'needs_confirmation'); assert.equal(result.tier, null);
    assert.equal(check(result, 'Conditional IELTS or UKVI Academic or TOEFL and submission-time validity').status, 'unknown');
  }
  assert.match(note, /not converted to MSA Band 4\.5/);
});

test('2027 versus 2026 date references and recurring FAQ cutoffs never become live/closed claims, invented rounds or urgent units', () => {
  assert.equal(p.fieldStatus.academicYear.status, 'known'); assert.equal(p.fieldStatus.deadline.status, 'unknown');
  for (const o of p.offerings) {
    assert.equal(o.applicationOpen, null); assert.equal(o.deadline, null); assert.equal(o.applicationRounds, undefined);
    assert.match(o.deadlineNote, /30 June 2027/); assert.match(o.deadlineNote, /30 June 2026/); assert.match(o.deadlineNote, /30 November, 28 February and 30 April/);
    for (const day of ['2026-10-28', '2026-11-30', '2027-02-28', '2027-06-30', '2027-07-01']) assert.equal(programmeTimeline(selected(o), day).state, 'dates_incomplete');
  }
  const current = loadRepositoryReviewQueue('2026-10-28'); assert.equal(current.counts.nearCutoffUnits, 4);
  assert.equal(current.counts.programmePageRecords, 73); assert.equal(current.counts.reviewUnits, 102);
  for (const day of ['2026-10-28', '2026-11-25', '2027-06-25']) assert.equal(loadRepositoryReviewQueue(day).units.find(u => u.programmeId === p.id).upcomingRecordedCutoffs.length, 0);
});

test('MST tracks/general electives, work-status restrictions and old/current advances remain separate without automatic exemptions or fees', () => {
  assert.equal(p.award, 'Master'); assert.equal(p.offerings.length, 2); assert.equal(routes.has(p.id), false);
  assert.equal(Object.values(obs.study.cu).reduce((a, b) => a + b), 15);
  assert.match(rule('Tracks or general study, duration versions and internship alternatives').noteEn, /not extra degrees or an extra five CU/);
  assert.match(rule('Tracks or general study, duration versions and internship alternatives').noteEn, /Seven core courses are non-exemptible/);
  assert.match(rule('Two statements, staged referee evidence and original documents').noteEn, /Initially provide two referee contact details/);
  for (const o of p.offerings) {
    const result = matchProgramme(selected(o), { ...profile, experienceYears: 20 });
    assert.equal(check(result, 'Study-mode choice, local employment and international eligibility').status, 'unknown');
    assert.equal(check(result, 'Indicative current fees, older quotes and individual applicability').status, 'unknown');
    assert.equal(o.tuition, null); assert.equal(o.applicationFee, 100); assert.match(o.feeBasis, /57,770/); assert.match(o.feeBasis, /AY2025 row quotes 57,700/);
    assert.match(o.feeBasis, /8,000.*5,000/); assert.match(o.feeBasis, /125 inclusive of GST per/);
  }
  assert.equal(/\p{Script=Han}/u.test(JSON.stringify(p)), false);
});

test('existing expanded MST catalogue ID migrates idempotently beneath metadata without changing older objects, reports or pilot', () => {
  for (const [file, hash] of Object.entries(obs.preservation.previousSnapshotHashes)) assert.equal(createHash('sha256').update(readFileSync(new URL(file, root), 'utf8').replaceAll('\r\n', '\n')).digest('hex'), hash);
  assert.equal(batch.pilotProgrammeIds.length, 20); assert.equal(batch.pilotProgrammeIds.includes(p.id), false);
  const dir = mkdtempSync(join(tmpdir(), 'gradpath-smu-mst-')), path = join(dir, 'test.sqlite'), checkedPath = join(dir, 'checked.json'); let db;
  try {
    writeFileSync(checkedPath, JSON.stringify({ ...batch, programmes: batch.programmes.filter(x => x.id !== p.id) }));
    db = new CatalogueStore(path, { ...options, checkedPath }); const earlier = db.all().filter(x => x.id !== p.id), listing = db.get(p.id).directoryListing;
    assert.equal(db.get(p.id).verification, 'catalogue_seed'); assert.equal(db.quality().checked, 72); db.close(); db = null;
    writeFileSync(checkedPath, JSON.stringify(batch));
    for (let restart = 0; restart < 2; restart++) {
      db = new CatalogueStore(path, { ...options, checkedPath }); assert.equal(db.get(p.id).verification, 'programme_page_checked');
      assert.deepEqual(db.get(p.id).directoryListing, listing); assert.deepEqual(db.all().filter(x => x.id !== p.id), earlier);
      assert.deepEqual(db.quality().sourceRefreshConflicts, []); assert.equal(db.quality().checked, 73); db.close(); db = null;
    }
  } finally { db?.close(); rmSync(path, { force: true }); rmSync(checkedPath, { force: true }); rmdirSync(dir); }
});

const app = createApp({ store, publicDir: new URL('public/', root), routeEvidencePath: routePath, applicantEvidencePath: contextPath, now: () => new Date('2026-10-28T04:00:00Z') });
await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${app.address().port}`, get = async path => (await fetch(base + path)).json();
test.after(async () => { await new Promise(resolve => app.close(resolve)); store.close(); });

test('actual matching/save/restore/export retains both MST modes, strict source distinctions and unresolved date/fee evidence without profile leakage', async () => {
  const before = JSON.stringify(store.all());
  for (const o of p.offerings) {
    const detail = await get('/api/programmes/' + p.id + '?offering=' + o.id);
    const response = await fetch(base + '/api/matches', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ profile, offerings: { [p.id]: o.id } }) });
    assert.equal(response.status, 200); const match = (await response.json()).items.find(x => x.id === p.id).match; assert.equal(match.status, 'needs_confirmation'); assert.equal(match.tier, null);
    const saved = optionSnapshot(detail, '2026-10-28T04:00:00.000Z'); assert.equal(parseSavedOption(saved).offeringId, o.id);
    const restore = await fetch(base + '/api/saved-options/resolve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contexts: [saved, { programmeId: p.id, offeringId: p.id + '-catalogue' }] }) });
    assert.equal(restore.status, 200); const items = (await restore.json()).items; assert.deepEqual(items.map(x => x.status), ['resolved', 'needs_attention']);
    const exported = shortlistExport([items[0].programme], { [p.id]: saved }).programmes[0];
    assert.equal(exported.offerings[0].id, o.id); assert.equal(exported.offerings[0].tuition, null); assert.equal(exported.offerings[0].deadline, null); assert.equal(exported.offerings[0].applicationFee, 100);
    assert.match(exported.evidence.publishedRequirements.find(r => /MST-specific alumni/.test(r.labelEn)).noteEn, /3\.4\/4\.0.*3\.6\/5\.0/);
    assert.match(exported.offerings[0].deadlineNote, /30 June 2026/); assert.equal(detail.applicationTimeline.state, 'dates_incomplete');
    assert.equal(exported.profile, undefined); assert.equal(exported.match, undefined);
  }
  const meta = await get('/api/meta'); assert.equal(meta.quality.checked, 73); assert.equal(meta.quality.total, 873); assert.equal(meta.quality.browsable, 870);
  assert.equal(meta.quality.peerReviewed, 0); assert.equal(meta.quality.complete, 0); assert.deepEqual(meta.quality.sourceRefreshConflicts, []);
  assert.deepEqual(applicantSummary(contexts), { studyOptions: 18, categories: 38, peerReviewed: 0 }); assert.equal(meta.routeEvidence.routes, 11);
  assert.equal(JSON.stringify(store.all()), before);
});
