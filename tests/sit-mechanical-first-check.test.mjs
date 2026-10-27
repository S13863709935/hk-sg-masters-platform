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
import { loadCoreAcceptance } from '../scripts/core-pilot-acceptance.mjs';

const root = new URL('../', import.meta.url), read = file => JSON.parse(readFileSync(new URL(file, root), 'utf8'));
const batch = read('data/checked-programmes.json'), obs = read('data/research/sit-mechanical-observation-2026-10-27.json');
const p = batch.programmes.find(x => x.id === obs.programmeId);
const options = { seedPath: new URL('data/catalogue.json', root), expansionPath: new URL('data/catalogue-expansion.json', root), checkedPath: new URL('data/checked-programmes.json', root), directoryEvidencePath: new URL('data/directory-links.json', root), scopeAuditPath: new URL('data/programme-scope-audit.json', root) };
const routePath = new URL('data/route-programmes.json', root), contextPath = new URL('data/applicant-contexts.json', root);
const store = new CatalogueStore(':memory:', options), routes = loadRoutes(routePath, store.all()), contexts = loadApplicantContexts(contextPath, store.all(), routes);
// Synthetic only; this does not record a participant or prove a qualification.
const profile = { major: 'Mechanical Engineering', degreeStatus: 'graduated', gpa: 3.5, gpaScale: 4, experienceYears: 0, language: { type: 'ielts', total: 7, testDate: '2026-05-01' } };
const manual = label => p.rules.find(r => r.kind === 'manual' && r.labelEn === label).noteEn;
const resolve = i => resolveProgramme(store.get(p.id), routes, undefined, p.offerings[i].id, undefined, contexts);

test('an existing SIT seed gains one partial coursework check, without a duplicate catalogue ID or expanded core pilot', () => {
  assert.equal(read('data/catalogue.json').programmes.find(x => x.id === p.id).verification, 'catalogue_seed');
  assert.equal(validateProgramme(p, new Set(['SG-SIT'])), p);
  assert.equal(p.verification, 'programme_page_checked'); assert.equal(p.requirementsCoverage, 'partial'); assert.equal(p.reviewer, null);
  assert.equal(p.admissionRoute, 'direct'); assert.equal(p.award, 'MSc'); assert.equal(batch.pilotProgrammeIds.includes(p.id), false);
  assert.equal(batch.pilotProgrammeIds.length, 20); assert.equal(batch.programmes.filter(x => x.id === p.id).length, 1);
  assert.equal(obs.scope.researchMEngNotMerged, true); assert.equal(obs.scope.credits, 60);
  assert.equal(/\p{Script=Han}/u.test(JSON.stringify(p)), false);
});

test('both modes keep the observed closed 2026 cycle, without inferring 2027 from the present date', () => {
  assert.deepEqual(p.offerings.map(o => o.id), [p.id + '-SEP2026-PT', p.id + '-SEP2026-FT']);
  for (const i of [0, 1]) {
    const selected = resolve(i), o = selected.offerings[0];
    assert.equal(o.applicationOpen, '2026-05-17'); assert.equal(o.deadline, '2026-06-11'); assert.equal(o.academicYear, '2026/27');
    assert.match(o.intake, /2026/); assert.equal(o.applicationRounds, undefined);
    const timeline = programmeTimeline(selected, '2026-10-27');
    assert.equal(timeline.state, 'deadline_passed'); assert.equal(timeline.livePortalChecked, false);
    assert.match(o.deadlineNote, /not an application extension/);
    assert.equal(matchProgramme(selected, profile).status, 'needs_confirmation');
  }
  assert.equal(obs.cycle.next2027Window, null);
});

test('full-time approval, dissertation and combined-degree accreditation are not automatic route or professional-recognition passes', () => {
  assert.match(p.offerings[1].duration, /subject to approval/);
  assert.match(manual('Study approval, specialisation and professional recognition'), /specified SIT BEng combinations/);
  assert.match(p.notesEn, /dissertation does not make it a research-entry MEng/);
  assert.equal(routes.has(p.id), false);
});

test('related post-bachelor work and qualifying IWSP cannot be decided from aggregate work years', () => {
  assert.equal(obs.requirements.relatedPostBachelorYears, 1); assert.equal(obs.requirements.iwspMayQualify, true);
  assert.equal(p.rules.some(r => ['experience', 'gpa', 'classification', 'major'].includes(r.kind)), false);
  assert.match(manual('Qualifying related experience including IWSP'), /SIT IWSP/);
  for (const experienceYears of [0, 1, 10]) {
    const result = matchProgramme(p, { ...profile, experienceYears });
    assert.equal(result.status, 'needs_confirmation'); assert.equal(result.tier, null);
    assert.equal(result.checks.find(c => /Qualifying related/.test(c.labelEn)).status, 'unknown');
  }
  assert.equal(matchProgramme(p, { ...profile, major: 'Business', gpa: 90, gpaScale: 100 }).status, 'needs_confirmation');
});

test('text-only English tables do not become verified scores, waivers or expiry calculated from today', () => {
  assert.equal(obs.requirements.englishPdfTextOnly.visualVerified, false);
  assert.equal(p.rules.some(r => r.kind === 'language'), false); assert.equal(p.fieldStatus.language.status, 'unknown');
  for (const language of [{ type: 'waiver' }, { type: 'ielts', total: 5 }, { type: 'toefl_6', total: 6, testDate: '2026-05-01' }]) {
    const result = matchProgramme(p, { ...profile, language });
    assert.equal(result.tier, null); assert.equal(result.checks.find(c => /English evidence/.test(c.labelEn)).status, 'unknown');
  }
  assert.match(manual('English evidence and guide visual verification'), /Only PDF text was accessible/);
});

test('conflicting programme and cohort rates remain observations, without a default or invented category quote', () => {
  assert.equal(obs.fees.feeConflict, true); assert.equal(obs.fees.programmeUndatedPerCredit.sc, 149.5);
  assert.equal(obs.fees.ay2026PdfTextPerCredit.sc, 156.5); assert.equal(obs.fees.pdfVisualVerified, false);
  assert.equal(p.fieldStatus.tuition.status, 'unknown'); assert.ok(p.offerings.every(o => o.tuition === null && o.applicationFee === null));
  assert.equal([...contexts.values()].some(c => c.programmeId === p.id), false);
  for (const i of [0, 1]) {
    const selected = resolve(i); assert.equal(selected.offerings[0].tuition, null); assert.equal(selected.selectedApplicant, undefined);
    assert.match(selected.offerings[0].feeBasis, /disagree.*AY2026/);
  }
  assert.match(manual('Tuition conflict, subsidy and extra charges'), /postgraduate degrees in its non-full-time rate category/);
});

test('source dates are real and old PDF-access limits remain unresolved instead of becoming human review', () => {
  assert.equal(p.lastChecked, '2026-10-27'); assert.equal(p.sources.length, 8);
  assert.ok(p.sources.every(s => s.checkedOn === p.lastChecked));
  assert.ok(p.sources.some(s => /Text-only AY2026/.test(s.purpose)));
  assert.equal(obs.externalReadLimitations.nusDsmlPdfAttempts.visualVerified, false);
  assert.equal(obs.externalReadLimitations.nusDsmlPdfAttempts.downloadedPdf, false);
  assert.equal(obs.externalReadLimitations.nusDsmlPdfAttempts.existingNusObjectsUnchanged, true);
});

test('new maintenance snapshots preserve the complete 24/25 October archives', () => {
  const expected = {
    'source-review-queue-2026-10-24.md': '439d1b0b11c0f2ed71380e1d707d90729652bc990b98cad94a6650e7a28a5a6f',
    'source-review-queue-2026-10-25.md': 'de26a874daade6b0f36387710bb50a1a8c03a058d92d730d6c7f524bf8d8b9a3',
    'core-pilot-acceptance-2026-10-25.md': '6c871d25d06b4347197c177d08cc787aede26407faa353d27e87ab9f5678da9d'
  };
  for (const [file, hash] of Object.entries(expected)) assert.equal(createHash('sha256').update(readFileSync(new URL('docs/research/' + file, root), 'utf8').replaceAll('\r\n', '\n')).digest('hex'), hash);
  const queue = loadRepositoryReviewQueue('2026-10-27');
  assert.equal(queue.counts.programmePageRecords, 43); assert.equal(queue.counts.reviewUnits, 66); assert.equal(queue.counts.reviewRecordedInSource, 0);
  assert.equal(queue.units.find(u => u.programmeId === p.id).upcomingRecordedCutoffs.length, 0);
  assert.equal(loadCoreAcceptance('2026-10-27').counts.violations, 0);
});

test('first programme-source migration preserves other records, directory context and restart state', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gradpath-sit-mechanical-')), path = join(dir, 'test.sqlite'), checkedPath = join(dir, 'checked.json'); let db;
  try {
    writeFileSync(checkedPath, JSON.stringify({ ...batch, checkedOn: '2026-10-25', programmes: batch.programmes.filter(x => x.id !== p.id) }));
    db = new CatalogueStore(path, { ...options, checkedPath });
    const before = db.all().filter(x => x.id !== p.id), directory = db.get(p.id).directoryListing;
    assert.equal(db.get(p.id).verification, 'catalogue_seed'); assert.equal(db.quality().checked, 42); db.close(); db = null;
    writeFileSync(checkedPath, JSON.stringify(batch));
    for (let restart = 0; restart < 2; restart++) {
      db = new CatalogueStore(path, { ...options, checkedPath });
      assert.equal(db.get(p.id).verification, 'programme_page_checked'); assert.deepEqual(db.get(p.id).directoryListing, directory);
      assert.deepEqual(db.all().filter(x => x.id !== p.id), before); assert.deepEqual(db.quality().sourceRefreshConflicts, []);
      assert.equal(db.quality().total, 873); assert.equal(db.quality().checked, 43); db.close(); db = null;
    }
  } finally { db?.close(); rmSync(path, { force: true }); rmSync(checkedPath, { force: true }); rmdirSync(dir); }
});

const app = createApp({ store, publicDir: new URL('public/', root), routeEvidencePath: routePath, applicantEvidencePath: contextPath, now: () => new Date('2026-10-27T04:00:00Z') });
await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${app.address().port}`, get = async path => (await fetch(base + path)).json();
test.after(async () => { await new Promise(resolve => app.close(resolve)); store.close(); });

test('details, matching and remembered choices use the partial record while the old seed requires repair', async () => {
  const detail = await get('/api/programmes/' + p.id + '?offering=' + p.offerings[0].id);
  assert.equal(detail.offerings[0].tuition, null); assert.equal(detail.applicationTimeline.state, 'deadline_passed');
  const matched = await fetch(base + '/api/matches', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ profile, offerings: { [p.id]: p.offerings[0].id } }) });
  assert.equal(matched.status, 200); const item = (await matched.json()).items.find(x => x.id === p.id);
  assert.equal(item.match.status, 'needs_confirmation'); assert.equal(item.match.tier, null);
  const saved = optionSnapshot(detail, '2026-10-27T04:00:00.000Z');
  const reply = await fetch(base + '/api/saved-options/resolve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contexts: [saved, { programmeId: p.id, offeringId: p.id + '-seed' }] }) });
  assert.equal(reply.status, 200); const items = (await reply.json()).items; assert.deepEqual(items.map(x => x.status), ['resolved', 'needs_attention']);
  const exported = shortlistExport([items[0].programme], { [p.id]: saved }).programmes[0];
  assert.equal(exported.offerings[0].tuition, null); assert.equal(exported.evidence.lastChecked, '2026-10-27');
  assert.equal(exported.match, undefined); assert.equal(exported.profile, undefined);
});

test('read-only use does not change stored evidence or inflate catalogue, route, category or human-review totals', async () => {
  const before = JSON.stringify(store.all()); resolve(0); resolve(1); matchProgramme(p, profile);
  const meta = await get('/api/meta'); assert.equal(meta.quality.total, 873); assert.equal(meta.quality.browsable, 870); assert.equal(meta.quality.checked, 43);
  assert.equal(meta.quality.peerReviewed, 0); assert.equal(meta.quality.complete, 0); assert.deepEqual(meta.quality.sourceRefreshConflicts, []);
  assert.deepEqual(applicantSummary(contexts), { studyOptions: 18, categories: 38, peerReviewed: 0 }); assert.equal(meta.routeEvidence.routes, 5);
  assert.equal(JSON.stringify(store.all()), before);
});
