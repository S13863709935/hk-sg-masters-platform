import {repositoryExpected} from './repository-expected-state.mjs';
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
const batch = read('data/checked-programmes.json'), obs = read('data/research/smu-msa-observation-2026-10-28.json');
const p = batch.programmes.find(p => p.id === obs.programmeId);
const options = { seedPath: new URL('data/catalogue.json', root), expansionPath: new URL('data/catalogue-expansion.json', root), checkedPath: new URL('data/checked-programmes.json', root), directoryEvidencePath: new URL('data/directory-links.json', root), scopeAuditPath: new URL('data/programme-scope-audit.json', root) };
const routePath = new URL('data/route-programmes.json', root), contextPath = new URL('data/applicant-contexts.json', root);
const store = new CatalogueStore(':memory:', options), routes = loadRoutes(routePath, store.all()), contexts = loadApplicantContexts(contextPath, store.all(), routes);
const selected = o => resolveProgramme(store.get(p.id), routes, undefined, o.id, undefined, contexts);
// Synthetic profiles establish neither quantitative coursework, institution/year nor accepted English proof.
const profile = { major: 'History', degreeStatus: 'graduated', classification: 'ordinary', gpa: 2.5, gpaScale: 4, experienceYears: 0, language: { type: 'none' } };
const check = (result, label) => result.checks.find(c => c.labelEn === label);
const rule = label => p.rules.find(r => r.labelEn === label);

test('MSA background alternatives are assessed without a strict major list, generic GPA floor or required work years', () => {
  assert.equal(validateProgramme(p, new Set(['SG-SMU'])), p);
  assert.equal(p.rules.some(r => ['major', 'classification', 'gpa', 'experience'].includes(r.kind)), false);
  for (const o of p.offerings) for (const changes of [{ major: 'History', gpa: 1, experienceYears: 0 }, { major: 'Accounting', gpa: 4, experienceYears: 20 }, { major: 'Computer Science', gpa: 4.9, gpaScale: 5 }]) {
    const result = matchProgramme(selected(o), { ...profile, ...changes });
    assert.equal(result.status, 'needs_confirmation'); assert.equal(result.tier, null);
    assert.equal(check(result, 'Recognised bachelor, good performance and quantitative background').status, 'unknown');
    assert.equal(check(result, 'Admission test alternatives and recent-alumni evidence').status, 'unknown');
  }
  assert.match(rule('Recognised bachelor, good performance and quantitative background').noteEn, /60th percentile/);
  assert.match(rule('Recognised bachelor, good performance and quantitative background').noteEn, /require all at once/);
  for (const degreeStatus of ['final_year', 'other']) assert.equal(matchProgramme(selected(p.offerings[0]), { ...profile, degreeStatus }).checks.find(c => c.kind === 'degree').status, 'unknown');
});

test('published TOEFL versions and submission-time English validity survive without automatic waivers or current-day expiry', () => {
  const note = rule('Conditional English evidence, two TOEFL scales and submission-time validity').noteEn;
  assert.match(note, /TOEFL 90 or Band 4\.5, or IELTS 6\.5/); assert.match(note, /two years before application submission/);
  assert.equal(p.rules.some(r => r.kind === 'language'), false);
  for (const o of p.offerings) for (const language of [{ type: 'ielts', total: 9 }, { type: 'toefl_120', total: 120 }, { type: 'toefl_6', total: 6 }, { type: 'waiver', waiverBasis: 'english_degree' }]) {
    const result = matchProgramme(selected(o), { ...profile, language });
    assert.equal(result.status, 'needs_confirmation'); assert.equal(result.tier, null);
    assert.equal(check(result, 'Conditional English evidence, two TOEFL scales and submission-time validity').status, 'unknown');
  }
  assert.match(rule('Admission test alternatives and recent-alumni evidence').noteEn, /not rolling from today/);
});

test('three dated MSA phases retain round boundaries, document deadlines and no fabricated intraday cutoff', () => {
  for (const o of p.offerings) {
    assert.deepEqual(o.applicationRounds, obs.cycle.phases); assert.equal(o.deadline, '2027-06-30');
    assert.ok(o.applicationRounds.every(r => r.deadlineAt === null));
    for (const [day, next, firstState] of [['2026-10-28', 'PHASE-1', 'within_recorded_dates'], ['2026-12-31', 'PHASE-1', 'deadline_today'], ['2027-01-01', 'PHASE-2', 'deadline_passed'], ['2027-04-01', 'PHASE-3', 'deadline_passed']]) {
      const timeline = programmeTimeline(selected(o), day); assert.equal(timeline.offerings[0].nextRoundId, next);
      assert.equal(timeline.offerings[0].rounds[0].state, firstState); assert.equal(timeline.livePortalChecked, false);
    }
    assert.equal(programmeTimeline(selected(o), '2026-08-31').state, 'not_yet_open');
    assert.equal(programmeTimeline(selected(o), '2027-07-01').state, 'deadline_passed');
    assert.match(o.deadlineNote, /supporting documents including relevant test scores/);
  }
  const current = loadRepositoryReviewQueue('2026-10-28'); assert.equal(current.counts.nearCutoffUnits, 2);
  assert.equal(current.units.find(u => u.programmeId === p.id).upcomingRecordedCutoffs.length, 0);
  const december = loadRepositoryReviewQueue('2026-12-20').units.find(u => u.programmeId === p.id);
  assert.equal(december.reviewOrder, 'cutoff_within_14_days');
  assert.ok(december.upcomingRecordedCutoffs.every(d => d.roundId === 'PHASE-1' && d.deadline === '2026-12-31'));
});

test('two MSA tracks do not become extra degrees, MPA accreditation, MAF statements or excluding-GST Economics deposits', () => {
  assert.equal(p.offerings.length, 2); assert.equal(routes.has(p.id), false);
  assert.equal(Object.values(obs.study.currentCu).reduce((a, b) => a + b), 15);
  assert.match(p.notesEn, /distinct from MPA/); assert.match(rule('Current curriculum, internship choices and professional distinction').noteEn, /does not provide CA\/CPA accreditation/);
  assert.match(rule('Materials, statement, referees and selection interview').noteEn, /Do not inherit MAF two/);
  assert.match(rule('Materials, statement, referees and selection interview').noteEn, /colleagues, superiors or friends/);
  for (const o of p.offerings) {
    assert.equal(o.tuition, null); assert.equal(o.applicationFee, 100); assert.match(o.feeBasis, /8,000 deposit is explicitly inclusive of GST/);
    assert.match(o.feeBasis, /Exemptions do not reduce tuition/); assert.equal(check(matchProgramme(selected(o), profile), 'Personal tuition, inclusive deposit and annual miscellaneous fees').status, 'unknown');
  }
  assert.equal(/\p{Script=Han}/u.test(JSON.stringify(p)), false);
});

test('MSA first-source migration preserves MPA, all earlier objects, historical reports and catalogue metadata after restarts', () => {
  for (const [file, hash] of Object.entries(obs.preservation.previousSnapshotHashes)) assert.equal(createHash('sha256').update(readFileSync(new URL(file, root), 'utf8').replaceAll('\r\n', '\n')).digest('hex'), hash);
  assert.equal(batch.pilotProgrammeIds.length, 20); assert.equal(batch.pilotProgrammeIds.includes(p.id), false);
  const dir = mkdtempSync(join(tmpdir(), 'gradpath-smu-msa-')), path = join(dir, 'test.sqlite'), checkedPath = join(dir, 'checked.json'); let db;
  try {
    writeFileSync(checkedPath, JSON.stringify({ ...batch, programmes: batch.programmes.filter(x => x.id !== p.id) }));
    db = new CatalogueStore(path, { ...options, checkedPath }); const earlier = db.all().filter(x => x.id !== p.id), listing = db.get(p.id).directoryListing;
    assert.equal(db.get(p.id).verification, 'catalogue_seed'); assert.equal(db.quality().checked, batch.programmes.length - 1); db.close(); db = null;
    writeFileSync(checkedPath, JSON.stringify(batch));
    for (let restart = 0; restart < 2; restart++) {
      db = new CatalogueStore(path, { ...options, checkedPath }); assert.equal(db.get(p.id).verification, 'programme_page_checked');
      assert.deepEqual(db.get(p.id).directoryListing, listing); assert.deepEqual(db.all().filter(x => x.id !== p.id), earlier);
      assert.deepEqual(db.quality().sourceRefreshConflicts, []); assert.equal(db.quality().checked, repositoryExpected.checked); db.close(); db = null;
    }
  } finally { db?.close(); rmSync(path, { force: true }); rmSync(checkedPath, { force: true }); rmdirSync(dir); }
});

const app = createApp({ store, publicDir: new URL('public/', root), routeEvidencePath: routePath, applicantEvidencePath: contextPath, now: () => new Date('2026-10-28T04:00:00Z') });
await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${app.address().port}`, get = async path => (await fetch(base + path)).json();
test.after(async () => { await new Promise(resolve => app.close(resolve)); store.close(); });

test('actual matching/save/restore/export preserves both MSA study selections, all phases and unresolved evidence without profile leakage', async () => {
  const before = JSON.stringify(store.all());
  for (const o of p.offerings) {
    const detail = await get('/api/programmes/' + p.id + '?offering=' + o.id);
    const response = await fetch(base + '/api/matches', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ profile, offerings: { [p.id]: o.id } }) });
    assert.equal(response.status, 200); const match = (await response.json()).items.find(x => x.id === p.id).match;
    assert.equal(match.status, 'needs_confirmation'); assert.equal(match.tier, null);
    const saved = optionSnapshot(detail, '2026-10-28T04:00:00.000Z'); assert.equal(parseSavedOption(saved).offeringId, o.id);
    const restore = await fetch(base + '/api/saved-options/resolve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contexts: [saved, { programmeId: p.id, offeringId: p.id + '-seed' }] }) });
    assert.equal(restore.status, 200); const items = (await restore.json()).items; assert.deepEqual(items.map(x => x.status), ['resolved', 'needs_attention']);
    const exported = shortlistExport([items[0].programme], { [p.id]: saved }).programmes[0];
    assert.equal(exported.offerings[0].id, o.id); assert.equal(exported.offerings[0].tuition, null); assert.equal(exported.offerings[0].applicationFee, 100);
    assert.deepEqual(exported.offerings[0].applicationRounds, o.applicationRounds); assert.equal(exported.offerings[0].deadline, '2027-06-30');
    assert.match(exported.evidence.publishedRequirements.find(r => /two TOEFL scales/.test(r.labelEn)).noteEn, /Band 4\.5/);
    assert.equal(exported.profile, undefined); assert.equal(exported.match, undefined);
    assert.equal(detail.applicationTimeline.state, 'within_recorded_dates'); assert.equal(detail.applicationTimeline.offerings[0].nextRoundId, 'PHASE-1');
  }
  const meta = await get('/api/meta'); assert.equal(meta.quality.checked, repositoryExpected.checked); assert.equal(meta.quality.total, 873); assert.equal(meta.quality.browsable, 865);
  assert.equal(meta.quality.peerReviewed, 0); assert.equal(meta.quality.complete, 0); assert.deepEqual(meta.quality.sourceRefreshConflicts, []);
  assert.deepEqual(applicantSummary(contexts), { studyOptions: 345, categories: 694, peerReviewed: 0 }); assert.equal(meta.routeEvidence.routes, repositoryExpected.routeRecords);
  assert.equal(JSON.stringify(store.all()), before);
});
