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
const batch = read('data/checked-programmes.json'), obs = read('data/research/smu-maf-observation-2026-10-28.json');
const p = batch.programmes.find(p => p.id === obs.programmeId);
const options = { seedPath: new URL('data/catalogue.json', root), expansionPath: new URL('data/catalogue-expansion.json', root), checkedPath: new URL('data/checked-programmes.json', root), directoryEvidencePath: new URL('data/directory-links.json', root), scopeAuditPath: new URL('data/programme-scope-audit.json', root) };
const routePath = new URL('data/route-programmes.json', root), contextPath = new URL('data/applicant-contexts.json', root);
const store = new CatalogueStore(':memory:', options), routes = loadRoutes(routePath, store.all()), contexts = loadApplicantContexts(contextPath, store.all(), routes);
const selected = o => resolveProgramme(store.get(p.id), routes, undefined, o.id, undefined, contexts);
// Synthetic only; no university, graduation date, language-medium or pass evidence is established.
const profile = { major: 'History', degreeStatus: 'graduated', classification: 'ordinary', gpa: 2.5, gpaScale: 4, experienceYears: 0, language: { type: 'none' } };
const check = (result, label) => result.checks.find(c => c.labelEn === label);
const rule = label => p.rules.find(r => r.labelEn === label);

test('MAF does not fail any-field fresh/final-year candidates on invented work, Finance, professional or GPA gates', () => {
  assert.equal(validateProgramme(p, new Set(['SG-SMU'])), p);
  assert.equal(p.rules.some(r => ['major', 'classification', 'gpa', 'experience'].includes(r.kind)), false);
  for (const o of p.offerings) for (const changes of [{ major: 'History', gpa: 1, experienceYears: 0 }, { major: 'Finance', gpa: 4, experienceYears: 10 }, { degreeStatus: 'final_year' }]) {
    const result = matchProgramme(selected(o), { ...profile, ...changes });
    assert.equal(result.status, 'needs_confirmation'); assert.equal(result.tier, null);
    assert.equal(check(result, 'Good degree in any field and pending completion').status, 'unknown');
    assert.equal(check(result, 'Work preference, study mode and accepted residence or pass').status, 'unknown');
  }
});

test('conflicting alumni substitutions and conditional English evidence never become automatic passes or wrong-scale gaps', () => {
  const testNote = rule('Admission tests and conflicting recent-alumni waiver evidence').noteEn;
  assert.match(testNote, /3\.0\/4\.0/); assert.match(testNote, /3\.4\/4\.0/);
  assert.match(testNote, /not a GRE cutoff/); assert.equal(p.rules.some(r => r.kind === 'language'), false);
  for (const o of p.offerings) for (const changes of [{ gpa: 3.2 }, { gpa: 3.9 }, { gpa: 4.9, gpaScale: 5 }, { language: { type: 'ielts', total: 9 } }, { language: { type: 'waiver', waiverBasis: 'english_degree' } }]) {
    const result = matchProgramme(selected(o), { ...profile, ...changes });
    assert.equal(result.status, 'needs_confirmation'); assert.equal(result.tier, null);
    assert.equal(check(result, 'Admission tests and conflicting recent-alumni waiver evidence').status, 'unknown');
    assert.equal(check(result, 'Conditional English proof, numeric-source limits and validity').status, 'unknown');
  }
  assert.match(rule('Conditional English proof, numeric-source limits and validity').noteEn, /do not copy universal IELTS validity/i);
});

test('August-only month ranges do not inherit precise Economics windows, January intakes or urgent cutoff units', () => {
  assert.equal(p.offerings.length, 2); assert.equal(p.fieldStatus.deadline.status, 'unknown');
  for (const o of p.offerings) {
    assert.match(o.intake, /August 2027/); assert.equal(o.applicationOpen, null); assert.equal(o.deadline, null);
    for (const day of ['2026-10-28', '2027-01-01', '2027-05-01', '2027-05-31', '2027-08-01']) assert.equal(programmeTimeline(selected(o), day).state, 'dates_incomplete');
  }
  const queue = loadRepositoryReviewQueue('2026-10-28');
  assert.equal(queue.counts.nearCutoffUnits, 2); assert.equal(queue.units.find(u => u.programmeId === p.id).upcomingRecordedCutoffs.length, 0);
  assert.equal(queue.counts.programmePageRecords, 226); assert.equal(queue.counts.reviewUnits, 389);
});

test('duration versions and personal-fee uncertainty remain visible without extra track degrees or doubled advance tuition', () => {
  assert.equal(routes.has(p.id), false); assert.equal(obs.study.optionalSpecialisations.length, 4);
  assert.equal(Object.values(obs.study.currentCu).reduce((a, b) => a + b), 15);
  assert.equal(rule('Duration conflicts, specialisations and award requirements').mandatory, false);
  for (const o of p.offerings) {
    assert.match(o.duration, /reconciliation/); assert.equal(o.tuition, null); assert.equal(o.applicationFee, 100);
    assert.match(o.feeBasis, /63,220/); assert.match(o.feeBasis, /8,000 is credited/); assert.match(o.feeBasis, /not stacked/);
    const result = matchProgramme(selected(o), profile);
    assert.equal(check(result, 'Indicative tuition, advance credit and miscellaneous applicability').status, 'unknown');
    assert.equal(check(result, 'Two statements, two referees, supporting documents and interview').status, 'unknown');
  }
  assert.match(rule('Two statements, two referees, supporting documents and interview').noteEn, /two personal statements, approximately 500-600 words each/);
  assert.match(rule('Duration conflicts, specialisations and award requirements').noteEn, /not undergraduate entry GPA/);
  assert.equal(/\p{Script=Han}/u.test(JSON.stringify(p)), false);
});

test('existing MAF seed migrates idempotently beneath its old catalogue metadata without changing previous objects or pilot', () => {
  for (const [file, hash] of Object.entries(obs.preservation.previousSnapshotHashes)) assert.equal(createHash('sha256').update(readFileSync(new URL(file, root), 'utf8').replaceAll('\r\n', '\n')).digest('hex'), hash);
  assert.equal(batch.pilotProgrammeIds.length, 20); assert.equal(batch.pilotProgrammeIds.includes(p.id), false);
  const dir = mkdtempSync(join(tmpdir(), 'gradpath-smu-maf-')), path = join(dir, 'test.sqlite'), checkedPath = join(dir, 'checked.json'); let db;
  try {
    writeFileSync(checkedPath, JSON.stringify({ ...batch, programmes: batch.programmes.filter(x => x.id !== p.id) }));
    db = new CatalogueStore(path, { ...options, checkedPath }); const earlier = db.all().filter(x => x.id !== p.id), listing = db.get(p.id).directoryListing;
    assert.equal(db.get(p.id).verification, 'catalogue_seed'); assert.equal(db.quality().checked, batch.programmes.length - 1); db.close(); db = null;
    writeFileSync(checkedPath, JSON.stringify(batch));
    for (let restart = 0; restart < 2; restart++) {
      db = new CatalogueStore(path, { ...options, checkedPath }); assert.equal(db.get(p.id).verification, 'programme_page_checked');
      assert.deepEqual(db.get(p.id).directoryListing, listing); assert.deepEqual(db.all().filter(x => x.id !== p.id), earlier);
      assert.deepEqual(db.quality().sourceRefreshConflicts, []); assert.equal(db.quality().checked, 226); db.close(); db = null;
    }
  } finally { db?.close(); rmSync(path, { force: true }); rmSync(checkedPath, { force: true }); rmdirSync(dir); }
});

const app = createApp({ store, publicDir: new URL('public/', root), routeEvidencePath: routePath, applicantEvidencePath: contextPath, now: () => new Date('2026-10-28T04:00:00Z') });
await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${app.address().port}`, get = async path => (await fetch(base + path)).json();
test.after(async () => { await new Promise(resolve => app.close(resolve)); store.close(); });

test('real APIs, saved-option restore and export keep both MAF modes unresolved and retain materials/date/fee evidence', async () => {
  const before = JSON.stringify(store.all());
  for (const o of p.offerings) {
    const detail = await get('/api/programmes/' + p.id + '?offering=' + o.id);
    for (const degreeStatus of ['graduated', 'final_year']) {
      const response = await fetch(base + '/api/matches', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ profile: { ...profile, degreeStatus }, offerings: { [p.id]: o.id } }) });
      assert.equal(response.status, 200); const match = (await response.json()).items.find(x => x.id === p.id).match;
      assert.equal(match.status, 'needs_confirmation'); assert.equal(match.tier, null);
    }
    const saved = optionSnapshot(detail, '2026-10-28T04:00:00.000Z'); assert.equal(parseSavedOption(saved).offeringId, o.id);
    const response = await fetch(base + '/api/saved-options/resolve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contexts: [saved, { programmeId: p.id, offeringId: p.id + '-catalogue' }] }) });
    assert.equal(response.status, 200); const items = (await response.json()).items; assert.deepEqual(items.map(x => x.status), ['resolved', 'needs_attention']);
    const exported = shortlistExport([items[0].programme], { [p.id]: saved }).programmes[0];
    assert.equal(exported.offerings[0].id, o.id); assert.equal(exported.offerings[0].tuition, null); assert.equal(exported.offerings[0].deadline, null);
    assert.equal(exported.offerings[0].applicationFee, 100); assert.match(exported.offerings[0].deadlineNote, /Exact opening\/closing days/);
    assert.match(exported.evidence.publishedRequirements.find(r => /conflicting recent-alumni/.test(r.labelEn)).noteEn, /3\.4\/4\.0/);
    assert.match(exported.evidence.publishedRequirements.find(r => /Two statements/.test(r.labelEn)).noteEn, /two personal statements/);
    assert.equal(exported.profile, undefined); assert.equal(exported.match, undefined); assert.equal(detail.applicationTimeline.state, 'dates_incomplete');
  }
  const meta = await get('/api/meta'); assert.equal(meta.quality.checked, 226); assert.equal(meta.quality.total, 873); assert.equal(meta.quality.browsable, 869);
  assert.equal(meta.quality.peerReviewed, 0); assert.equal(meta.quality.complete, 0); assert.deepEqual(meta.quality.sourceRefreshConflicts, []);
  assert.deepEqual(applicantSummary(contexts), { studyOptions: 146, categories: 294, peerReviewed: 0 }); assert.equal(meta.routeEvidence.routes, 17);
  assert.equal(JSON.stringify(store.all()), before);
});
