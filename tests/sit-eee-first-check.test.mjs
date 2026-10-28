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
import { optionSnapshot, shortlistExport } from '../public/saved-options.js';
import { loadRepositoryReviewQueue } from '../scripts/source-review-queue.mjs';

const root = new URL('../', import.meta.url), read = f => JSON.parse(readFileSync(new URL(f, root), 'utf8'));
const batch = read('data/checked-programmes.json'), obs = read('data/research/sit-eee-observation-2026-10-27.json');
const p = batch.programmes.find(x => x.id === obs.programmeId), o = p.offerings[0];
const options = { seedPath: new URL('data/catalogue.json', root), expansionPath: new URL('data/catalogue-expansion.json', root), checkedPath: new URL('data/checked-programmes.json', root), directoryEvidencePath: new URL('data/directory-links.json', root), scopeAuditPath: new URL('data/programme-scope-audit.json', root) };
const routePath = new URL('data/route-programmes.json', root), contextPath = new URL('data/applicant-contexts.json', root);
const store = new CatalogueStore(':memory:', options), routes = loadRoutes(routePath, store.all()), contexts = loadApplicantContexts(contextPath, store.all(), routes);
// Synthetic software fixture, not a real student or qualifying-experience assessment.
const profile = { major: 'Electrical Engineering', degreeStatus: 'graduated', gpa: 3.8, gpaScale: 4, experienceYears: 0, language: { type: 'ielts', total: 7, testDate: '2026-05-01' } };
const selected = () => resolveProgramme(store.get(p.id), routes, undefined, o.id, undefined, contexts);

test('an existing EEE catalogue identity gains a partial direct coursework observation without a new parent or fabricated review', () => {
  assert.equal(read('data/catalogue.json').programmes.find(x => x.id === p.id).verification, 'catalogue_seed');
  assert.equal(validateProgramme(p, new Set(['SG-SIT'])), p); assert.equal(p.admissionRoute, 'direct');
  assert.equal(p.verification, 'programme_page_checked'); assert.equal(p.requirementsCoverage, 'partial'); assert.equal(p.reviewer, null);
  assert.equal(p.lastChecked, '2026-10-27'); assert.ok(p.sources.every(s => s.checkedOn === p.lastChecked));
  assert.equal(batch.programmes.filter(x => x.id === p.id).length, 1); assert.equal(batch.pilotProgrammeIds.includes(p.id), false);
  assert.equal(batch.pilotProgrammeIds.length, 20); assert.equal(/\p{Script=Han}/u.test(JSON.stringify(p)), false);
});

test('evening classes and two-year duration do not manufacture PT/FT options, maximum candidature or a mechanical-engineering dissertation', () => {
  assert.equal(p.offerings.length, 1); assert.equal(o.id, p.id + '-SEP2026'); assert.equal(o.mode, null);
  assert.equal(obs.study.explicitCommitment, null); assert.equal(obs.study.maximumCandidature, null);
  assert.equal(routes.has(p.id), false); assert.equal([...contexts.values()].some(c => c.programmeId === p.id), false);
  const exportRow = shortlistExport([selected()]).programmes[0];
  assert.equal(exportRow.offerings[0].mode, null);
  const note = p.rules.find(r => /Study-mode evidence/.test(r.labelEn)).noteEn;
  assert.match(note, /no explicit full-time\/part-time/); assert.match(note, /Do not import Mechanical Engineering/);
});

test('graduate objectives are informational, while qualifying work, internship/IWSP and degree relevance stay manual', () => {
  assert.equal(p.rules.some(r => ['experience', 'gpa', 'classification', 'major'].includes(r.kind)), false);
  const educational = p.rules.find(r => /Educational objectives/.test(r.labelEn)); assert.equal(educational.mandatory, false);
  assert.equal(obs.requirements.objectivesNotEntryMinimum, true); assert.equal(obs.requirements.relatedWorkYears, 1);
  assert.equal(obs.requirements.namedDegreesNotClosedList, true);
  for (const changes of [{ experienceYears: 0 }, { experienceYears: 1 }, { experienceYears: 5 }, { major: 'Business', gpa: 85, gpaScale: 100 }]) {
    const result = matchProgramme(p, { ...profile, ...changes });
    assert.equal(result.status, 'needs_confirmation'); assert.equal(result.tier, null);
    assert.equal(result.checks.find(c => /Qualifying work/.test(c.labelEn)).status, 'unknown');
    assert.equal(result.checks.find(c => /Relevant degree/.test(c.labelEn)).status, 'unknown');
    assert.equal(result.checks.find(c => /Educational objectives/.test(c.labelEn)).mandatory, false);
  }
});

test('accreditation is limited to the stated degree combination and certificates do not become separate checked routes', () => {
  const note = p.rules.find(r => /Study-mode evidence/.test(r.labelEn)).noteEn;
  assert.match(note, /MSc plus BEng \(Hons\) Electrical Power Engineering combination/);
  assert.match(note, /not every MSc entrant/); assert.match(note, /certificates do not automatically establish MSc admission/);
  assert.equal(obs.scope.noBlanketProfessionalRegistration, true); assert.equal(obs.scope.coreModules, 6); assert.equal(obs.scope.disciplineElectives, 4);
});

test('the expired 2026 application cycle survives the acceptance-date typo without becoming an opening or extension', () => {
  assert.equal(o.applicationOpen, '2026-05-17'); assert.equal(o.deadline, '2026-06-11'); assert.equal(o.academicYear, '2026 intake');
  assert.equal(obs.cycle.next2027Window, null); assert.equal(obs.cycle.programmeAcceptanceObserved.start, '2025-07-03');
  assert.equal(obs.cycle.centralAcceptanceObserved.start, '2026-07-03'); assert.equal(o.applicationRounds, undefined);
  const timeline = programmeTimeline(selected(), '2026-10-27'); assert.equal(timeline.state, 'deadline_passed'); assert.equal(timeline.livePortalChecked, false);
  assert.equal(matchProgramme(selected(), profile).status, 'needs_confirmation');
  assert.match(p.rules.find(r => /acceptance-date discrepancy/.test(r.labelEn)).noteEn, /rather than repairing it silently/);
});

test('EEE fee discrepancies remain distinct from mechanical fees and unverified English tables never become automatic passes', () => {
  assert.equal(obs.fees.programmeUndated.nonSubsidisedTotal, 36069);
  assert.equal(read('data/research/sit-mechanical-observation-2026-10-27.json').fees.programmeUndatedTotals.internationalOrNonSubsidised, 35738);
  assert.equal(obs.fees.ay2026PdfTextPerCredit.nonSubsidised, 641.47); assert.equal(obs.fees.conflict, true);
  assert.equal(obs.fees.programmeUndated.internationalNumericQuoteEstablished, false);
  assert.equal(o.tuition, null); assert.equal(o.applicationFee, null); assert.equal(p.fieldStatus.tuition.status, 'unknown');
  assert.equal(p.rules.some(r => r.kind === 'language'), false); assert.equal(p.fieldStatus.language.status, 'unknown');
  assert.equal(obs.pdfAccess.visualVerified, false);
  for (const language of [{ type: 'waiver' }, { type: 'ielts', total: 5 }, { type: 'toefl_6', total: 6, testDate: '2026-05-01' }]) {
    const result = matchProgramme(p, { ...profile, language });
    assert.equal(result.tier, null); assert.equal(result.checks.find(c => /English guide/.test(c.labelEn)).status, 'unknown');
  }
});

test('earlier same-day maintenance and acceptance snapshots are preserved before the new batch snapshots', () => {
  for (const [file, hash] of Object.entries(obs.preservedEarlierSameDaySnapshots)) {
    assert.equal(createHash('sha256').update(readFileSync(new URL('docs/research/' + file, root), 'utf8').replaceAll('\r\n', '\n')).digest('hex'), hash);
  }
  const queue = loadRepositoryReviewQueue('2026-10-27');
  assert.equal(queue.counts.programmePageRecords, 69); assert.equal(queue.counts.reviewUnits, 94); assert.equal(queue.counts.reviewRecordedInSource, 0);
  assert.equal(queue.units.find(u => u.programmeId === p.id).upcomingRecordedCutoffs.length, 0);
});

test('first EEE source migration keeps previous records and directory context after repeated isolated restarts', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gradpath-sit-eee-')), path = join(dir, 'test.sqlite'), checkedPath = join(dir, 'checked.json'); let db;
  try {
    writeFileSync(checkedPath, JSON.stringify({ ...batch, programmes: batch.programmes.filter(x => x.id !== p.id) }));
    db = new CatalogueStore(path, { ...options, checkedPath });
    const previous = db.all().filter(x => x.id !== p.id), directory = db.get(p.id).directoryListing;
    assert.equal(db.get(p.id).verification, 'catalogue_seed'); assert.equal(db.quality().checked, 68); db.close(); db = null;
    writeFileSync(checkedPath, JSON.stringify(batch));
    for (let restart = 0; restart < 2; restart++) {
      db = new CatalogueStore(path, { ...options, checkedPath });
      assert.equal(db.get(p.id).verification, 'programme_page_checked'); assert.deepEqual(db.get(p.id).directoryListing, directory);
      assert.deepEqual(db.all().filter(x => x.id !== p.id), previous); assert.deepEqual(db.quality().sourceRefreshConflicts, []);
      assert.equal(db.quality().total, 873); assert.equal(db.quality().checked, 69); db.close(); db = null;
    }
  } finally { db?.close(); rmSync(path, { force: true }); rmSync(checkedPath, { force: true }); rmdirSync(dir); }
});

const app = createApp({ store, publicDir: new URL('public/', root), routeEvidencePath: routePath, applicantEvidencePath: contextPath, now: () => new Date('2026-10-27T04:00:00Z') });
await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${app.address().port}`, get = async path => (await fetch(base + path)).json();
test.after(async () => { await new Promise(resolve => app.close(resolve)); store.close(); });

test('real APIs preserve unknown mode/fees and retired-seed repair without student-profile export or inflated coverage', async () => {
  const before = JSON.stringify(store.all());
  const detail = await get('/api/programmes/' + p.id + '?offering=' + o.id);
  assert.equal(detail.offerings[0].mode, null); assert.equal(detail.offerings[0].tuition, null); assert.equal(detail.applicationTimeline.state, 'deadline_passed');
  const matched = await fetch(base + '/api/matches', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ profile, offerings: { [p.id]: o.id } }) });
  assert.equal(matched.status, 200); assert.equal((await matched.json()).items.find(x => x.id === p.id).match.status, 'needs_confirmation');
  const saved = optionSnapshot(detail, '2026-10-27T04:00:00.000Z');
  const response = await fetch(base + '/api/saved-options/resolve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contexts: [saved, { programmeId: p.id, offeringId: p.id + '-seed' }] }) });
  assert.equal(response.status, 200); const items = (await response.json()).items; assert.deepEqual(items.map(x => x.status), ['resolved', 'needs_attention']);
  const exported = shortlistExport([items[0].programme], { [p.id]: saved }).programmes[0];
  assert.equal(exported.offerings[0].mode, null); assert.equal(exported.offerings[0].tuition, null); assert.equal(exported.profile, undefined); assert.equal(exported.match, undefined);
  const meta = await get('/api/meta'); assert.equal(meta.quality.total, 873); assert.equal(meta.quality.browsable, 870); assert.equal(meta.quality.checked, 69);
  assert.equal(meta.quality.peerReviewed, 0); assert.equal(meta.quality.complete, 0); assert.deepEqual(meta.quality.sourceRefreshConflicts, []);
  assert.deepEqual(applicantSummary(contexts), { studyOptions: 18, categories: 38, peerReviewed: 0 }); assert.equal(meta.routeEvidence.routes, 7);
  assert.equal(JSON.stringify(store.all()), before);
});
